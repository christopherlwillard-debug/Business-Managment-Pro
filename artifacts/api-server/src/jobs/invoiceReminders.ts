import cron from "node-cron";
import { db } from "@workspace/db";
import { invoicesTable, clientsTable, settingsTable } from "@workspace/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { sendInvoiceEmail } from "../lib/invoiceEmail";

const DAY_MS = 1000 * 60 * 60 * 24;

async function processInvoiceReminders() {
  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    if (!settings) return;

    if (!settings.invoiceReminderEnabled) return;

    const day1 = settings.invoiceReminderDay1 ?? 7;
    const day2 = settings.invoiceReminderDay2 ?? 14;

    // Explicit column selection avoids spreading the full table object
    const invoices = await db
      .select({
        id: invoicesTable.id,
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
      })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(
        and(
          ne(invoicesTable.status, "paid"),
          ne(invoicesTable.status, "cancelled"),
          eq(clientsTable.reminderOptOut, false),
        )
      );

    const now = Date.now();
    const companyName = settings.companyName ?? "BuildPro";
    const companyPhone = settings.companyPhone ?? "";
    const companyEmail = settings.companyEmail ?? "";

    for (const inv of invoices) {
      if (!inv.clientEmail) continue;

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
        const subject = `Reminder: Invoice ${inv.invoiceNumber} — Payment Due (${companyName})`;

        // Template branching: Square link = "Pay Now" button; everything else = plain contact reminder
        const hasSquareLink = !!inv.squarePaymentLinkUrl;
        const totalDisplay = `$${parseFloat(inv.total ?? "0").toFixed(2)}`;

        let message: string;
        if (hasSquareLink) {
          message = `Hi ${inv.clientName || "there"},\n\nThis is a friendly reminder that invoice ${inv.invoiceNumber} (${totalDisplay}) is still outstanding. Please use the button below to pay securely online.\n\nThank you for your business!`;
        } else {
          const contactLines: string[] = [];
          if (companyPhone) contactLines.push(`Phone: ${companyPhone}`);
          if (companyEmail) contactLines.push(`Email: ${companyEmail}`);
          const contactBlock = contactLines.length > 0 ? `\n\n${contactLines.join("\n")}` : "";
          message = `Hi ${inv.clientName || "there"},\n\nThis is a friendly reminder that invoice ${inv.invoiceNumber} issued on ${inv.issueDate} for ${totalDisplay} is still outstanding. Please contact us to arrange payment.${contactBlock}\n\nThank you for your business!`;
        }

        // For non-Square invoices, null out any Stripe link so the email template
        // does not render a "Pay Now" button — plain reminder only.
        const invForEmail = hasSquareLink
          ? { ...inv, invoiceNumber: inv.invoiceNumber ?? "" }
          : { ...inv, invoiceNumber: inv.invoiceNumber ?? "", squarePaymentLinkUrl: null, stripePaymentLinkUrl: null };

        await sendInvoiceEmail(invForEmail, settings, inv.clientEmail, subject, message);

        const newTimestamp = new Date().toISOString();
        const updatedReminders = [...remindersSentAt, newTimestamp];

        await db
          .update(invoicesTable)
          .set({ remindersSentAt: updatedReminders })
          .where(eq(invoicesTable.id, inv.id));

        console.log(`[invoice-reminders] Reminder #${reminderNum} sent for invoice ${inv.invoiceNumber} to ${inv.clientEmail} (squareLink=${hasSquareLink}, anchor=${inv.dueDate ? "dueDate" : "createdAt"})`);
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
