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

    // Fetch all unpaid, non-cancelled invoices where the client has not opted out
    const invoices = await db
      .select({
        ...invoicesTable,
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

      const createdAt = inv.createdAt instanceof Date ? inv.createdAt : new Date(inv.createdAt as string | number);

      // Determine the anchor date and eligibility:
      // - If dueDate is set: invoice becomes eligible the moment it is past due.
      //   daysSinceAnchor is measured from dueDate (negative = not yet due = skip).
      // - If no dueDate: fall back to createdAt + configured day thresholds.
      let daysSinceAnchor: number;
      let anchorDate: Date;

      if (inv.dueDate) {
        anchorDate = new Date(inv.dueDate);
        daysSinceAnchor = Math.floor((now - anchorDate.getTime()) / DAY_MS);
        // Invoice not yet past due — skip
        if (daysSinceAnchor < 0) continue;
      } else {
        anchorDate = createdAt;
        daysSinceAnchor = Math.floor((now - anchorDate.getTime()) / DAY_MS);
        // Not yet past the first configured threshold — skip
        if (daysSinceAnchor < day1) continue;
      }

      const remindersSentAt: string[] = Array.isArray(inv.remindersSentAt) ? (inv.remindersSentAt as string[]) : [];

      // Window logic: day1 window = [0, day2), day2 window = [day2, ∞)
      // For createdAt-anchored invoices (no dueDate) the day1 window starts at day1, not 0.
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

        const hasPaymentLink = !!(inv.squarePaymentLinkUrl || inv.stripePaymentLinkUrl);
        const totalDisplay = `$${parseFloat((inv as any).total ?? "0").toFixed(2)}`;

        let message: string;
        if (hasPaymentLink) {
          message = `Hi ${inv.clientName || "there"},\n\nThis is a friendly reminder that invoice ${inv.invoiceNumber} (${totalDisplay}) is still outstanding. Please use the button below to pay securely online.\n\nThank you for your business!`;
        } else {
          const contactLines: string[] = [];
          if (companyPhone) contactLines.push(`Phone: ${companyPhone}`);
          if (companyEmail) contactLines.push(`Email: ${companyEmail}`);
          const contactBlock = contactLines.length > 0 ? `\n\n${contactLines.join("\n")}` : "";
          message = `Hi ${inv.clientName || "there"},\n\nThis is a friendly reminder that invoice ${inv.invoiceNumber} for ${totalDisplay} is still outstanding. Please contact us to arrange payment.${contactBlock}\n\nThank you for your business!`;
        }

        await sendInvoiceEmail(inv, settings, inv.clientEmail, subject, message);

        const newTimestamp = new Date().toISOString();
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
