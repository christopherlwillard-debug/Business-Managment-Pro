import cron from "node-cron";
import { db } from "@workspace/db";
import { businessesTable, invoicesTable, clientsTable, settingsTable } from "@workspace/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { sendInvoiceEmail } from "../lib/invoiceEmail";
import { confirmedGmailInvoiceIds, sendAndRecordInvoiceCommunication } from "../lib/invoiceCommunication";
import { reminderEligibilityError, reminderMessage } from "../lib/invoiceReminderPolicy";
import {
  findInvoiceBusiness,
  invoiceEmailSettingsFromBrand,
  loadInvoiceBrand,
} from "../lib/invoiceBranding.js";

const DAY_MS = 1000 * 60 * 60 * 24;

async function processInvoiceReminders() {
  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    if (!settings) return;

    if (!settings.invoiceReminderEnabled) return;
    const businesses = await db.select().from(businessesTable);

    const day1 = settings.invoiceReminderDay1 ?? 7;
    const day2 = settings.invoiceReminderDay2 ?? 14;

    // Explicit column selection avoids spreading the full table object
    const invoices = await db
      .select({
        id: invoicesTable.id,
        status: invoicesTable.status,
        invoiceNumber: invoicesTable.invoiceNumber,
        issueDate: invoicesTable.issueDate,
        dueDate: invoicesTable.dueDate,
        clientId: invoicesTable.clientId,
        squarePaymentLinkUrl: invoicesTable.squarePaymentLinkUrl,
        stripePaymentLinkUrl: invoicesTable.stripePaymentLinkUrl,
        total: invoicesTable.total,
        subtotal: invoicesTable.subtotal,
        taxRate: invoicesTable.taxRate,
        taxAmount: invoicesTable.taxAmount,
        terms: invoicesTable.terms,
        notes: invoicesTable.notes,
        lineItems: invoicesTable.lineItems,
        remindersSentAt: invoicesTable.remindersSentAt,
        createdAt: invoicesTable.createdAt,
        clientName: clientsTable.name,
        clientEmail: clientsTable.email,
        reminderOptOut: clientsTable.reminderOptOut,
        businessLine: invoicesTable.businessLine,
        businessId: invoicesTable.businessId,
      })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(
        and(
          ne(invoicesTable.status, "paid"),
          ne(invoicesTable.status, "cancelled"),
          ne(invoicesTable.status, "draft"),
        )
      );

    const confirmedSendInvoiceIds = await confirmedGmailInvoiceIds(invoices.map(invoice => invoice.id));

    const now = Date.now();
    for (const inv of invoices) {
      if (!inv.clientEmail) continue;
      const eligibilityError = reminderEligibilityError({
        status: inv.status,
        invoiceNumber: inv.invoiceNumber,
        clientEmail: inv.clientEmail,
        reminderOptOut: inv.reminderOptOut,
        hasConfirmedSend: confirmedSendInvoiceIds.has(inv.id),
      });
      if (eligibilityError) {
        if (eligibilityError !== "This client has opted out of invoice reminders.") {
          console.warn(`[invoice-reminders] Skipping invoice id=${inv.id}: ${eligibilityError}`);
        }
        continue;
      }

      const createdAt = inv.createdAt instanceof Date ? inv.createdAt : new Date(inv.createdAt);

      // Anchor date logic:
      // - If dueDate is set: invoice is eligible once past due (anchor = dueDate).
      // - If no dueDate: use createdAt + configured day thresholds (anchor = createdAt).
      let daysSinceAnchor: number;
      let anchorDate: Date;

      if (inv.dueDate) {
        anchorDate = new Date(inv.dueDate);
        daysSinceAnchor = Math.floor((now - anchorDate.getTime()) / DAY_MS);
        // Must be strictly past due (at least 1 full day after due date) — skip
        if (daysSinceAnchor < 1) continue;
      } else {
        anchorDate = createdAt;
        daysSinceAnchor = Math.floor((now - anchorDate.getTime()) / DAY_MS);
        // Not yet past the first threshold — skip
        if (daysSinceAnchor < day1) continue;
      }

      const remindersSentAt: string[] = Array.isArray(inv.remindersSentAt) ? (inv.remindersSentAt as string[]) : [];

      // For due-date-anchored invoices the first window starts at day 0 (past due).
      // For createdAt-anchored invoices the first window starts at day1.
      const day1Start = inv.dueDate ? 0 : day1;

      const needsDay1 = daysSinceAnchor >= day1Start && daysSinceAnchor < day2;
      const needsDay2 = daysSinceAnchor >= day2;

      const hasDay1Reminder = remindersSentAt.some(ts => {
        const d = new Date(ts);
        const daysAfterAnchor = Math.floor((d.getTime() - anchorDate.getTime()) / DAY_MS);
        return daysAfterAnchor >= day1Start - 1 && daysAfterAnchor < day2;
      });

      const hasDay2Reminder = remindersSentAt.some(ts => {
        const d = new Date(ts);
        const daysAfterAnchor = Math.floor((d.getTime() - anchorDate.getTime()) / DAY_MS);
        return daysAfterAnchor >= day2 - 1;
      });

      let shouldSend = false;
      if (needsDay1 && !hasDay1Reminder) shouldSend = true;
      if (needsDay2 && !hasDay2Reminder) shouldSend = true;

      if (!shouldSend) continue;

      try {
        const reminderNum = needsDay2 && !hasDay2Reminder ? 2 : 1;
        const business = findInvoiceBusiness(businesses, inv.businessLine, inv.businessId);
        const brand = await loadInvoiceBrand(inv.businessLine, settings, business);
        const brandedSettings = invoiceEmailSettingsFromBrand(settings, brand);
        const companyName = brand.displayName;
        const subject = `Reminder: Invoice ${inv.invoiceNumber ?? "N/A"} — Payment Due (${companyName})`;

        // Template branching: Square link = "Pay Now" button; everything else = plain contact reminder
        const hasPaymentLink = Boolean(inv.squarePaymentLinkUrl || inv.stripePaymentLinkUrl);
        const message = reminderMessage(inv, companyName, brand.phone, brand.email, hasPaymentLink);

        // For non-Square invoices, null out any Stripe link so the email template
        // does not render a "Pay Now" button — plain reminder only.
        const invForEmail = hasPaymentLink
          ? { ...inv, invoiceNumber: inv.invoiceNumber ?? "" }
          : { ...inv, invoiceNumber: inv.invoiceNumber ?? "", squarePaymentLinkUrl: null, stripePaymentLinkUrl: null };

        const deliveryResult = await sendAndRecordInvoiceCommunication(
          {
            invoiceId: inv.id,
            eventType: "automatic_reminder",
            channel: "email",
            provider: "pending",
            recipient: inv.clientEmail,
            subject,
            source: "automatic",
            metadata: { hasPaymentLink, reminderNumber: reminderNum },
          },
          () => sendInvoiceEmail(invForEmail, brandedSettings, inv.clientEmail!, subject, message),
        );
        if (!deliveryResult.finalized) {
          console.error(`[invoice-reminders] Provider accepted invoice ${inv.invoiceNumber}, but event finalization failed: ${deliveryResult.finalizationError}`);
          continue;
        }

        const newTimestamp = deliveryResult.event.completedAt instanceof Date
          ? deliveryResult.event.completedAt.toISOString()
          : new Date().toISOString();
        const updatedReminders = [...remindersSentAt, newTimestamp];

        await db
          .update(invoicesTable)
          .set({ remindersSentAt: updatedReminders })
          .where(eq(invoicesTable.id, inv.id));

        console.log(`[invoice-reminders] Reminder #${reminderNum} sent for invoice ${inv.invoiceNumber} to ${inv.clientEmail} (paymentLink=${hasPaymentLink}, anchor=${inv.dueDate ? "dueDate" : "createdAt"})`);
      } catch (err) {
        console.error(`[invoice-reminders] Failed to send reminder for invoice ${inv.invoiceNumber}:`, err);
      }
    }
  } catch (err) {
    console.error("[invoice-reminders] Job error:", err);
  }
}

export function startInvoiceReminderJob() {
  processInvoiceReminders();
  // Run daily at 8:00 AM
  cron.schedule("0 8 * * *", processInvoiceReminders);
}
