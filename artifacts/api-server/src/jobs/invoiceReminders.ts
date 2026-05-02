import cron from "node-cron";
import { db } from "@workspace/db";
import { invoicesTable, clientsTable, settingsTable } from "@workspace/db/schema";
import { eq, and, isNotNull, ne } from "drizzle-orm";
import { sendInvoiceEmail } from "../lib/invoiceEmail";

async function processInvoiceReminders() {
  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    if (!settings) return;

    // Auto-reminders must be enabled
    if (!settings.invoiceReminderEnabled) return;

    const day1 = settings.invoiceReminderDay1 ?? 7;
    const day2 = settings.invoiceReminderDay2 ?? 14;

    // Fetch all unpaid invoices that have a Square payment link
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
          isNotNull(invoicesTable.squarePaymentLinkUrl),
        )
      );

    const now = Date.now();
    const companyName = settings.companyName ?? "BuildPro";

    for (const inv of invoices) {
      if (!inv.clientEmail) continue;
      if (!inv.squarePaymentLinkUrl) continue;

      const createdAt = inv.createdAt instanceof Date ? inv.createdAt : new Date(inv.createdAt);
      const daysSinceCreation = Math.floor((now - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      const remindersSentAt: string[] = Array.isArray(inv.remindersSentAt) ? (inv.remindersSentAt as string[]) : [];

      // Determine which reminders need to be sent
      const needsDay1 = daysSinceCreation >= day1 && daysSinceCreation < day2;
      const needsDay2 = daysSinceCreation >= day2;

      const hasDay1Reminder = remindersSentAt.some(ts => {
        const d = new Date(ts);
        const daysAfterCreate = Math.floor((d.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        return daysAfterCreate >= day1 - 1 && daysAfterCreate < day2;
      });

      const hasDay2Reminder = remindersSentAt.some(ts => {
        const d = new Date(ts);
        const daysAfterCreate = Math.floor((d.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        return daysAfterCreate >= day2 - 1;
      });

      let shouldSend = false;
      if (needsDay1 && !hasDay1Reminder) shouldSend = true;
      if (needsDay2 && !hasDay2Reminder) shouldSend = true;

      if (!shouldSend) continue;

      try {
        const reminderNum = needsDay2 && !hasDay2Reminder ? 2 : 1;
        const subject = `Reminder: Invoice ${inv.invoiceNumber} — Payment Due (${companyName})`;
        const message = `Hi ${inv.clientName || "there"},\n\nThis is a friendly reminder that invoice ${inv.invoiceNumber} is still outstanding. Please use the button below to pay securely online.\n\nThank you for your business!`;

        await sendInvoiceEmail(inv, settings, inv.clientEmail, subject, message);

        const newTimestamp = new Date().toISOString();
        const updatedReminders = [...remindersSentAt, newTimestamp];

        await db
          .update(invoicesTable)
          .set({ remindersSentAt: updatedReminders })
          .where(eq(invoicesTable.id, inv.id));

        console.log(`[invoice-reminders] Reminder #${reminderNum} sent for invoice ${inv.invoiceNumber} (${inv.clientEmail})`);
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
