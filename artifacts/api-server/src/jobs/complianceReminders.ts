import cron from "node-cron";
import { db } from "@workspace/db";
import { complianceItemsTable, settingsTable, usersTable } from "@workspace/db/schema";
import { ne, eq } from "drizzle-orm";
import { sendEmail, escapeHtml } from "../lib/sendEmail.js";

async function getRecipientEmail(): Promise<string | null> {
  const [settings] = await db
    .select({
      ownerUserId: settingsTable.ownerUserId,
      companyEmail: settingsTable.companyEmail,
      complianceNotificationEmail: settingsTable.complianceNotificationEmail,
      complianceEmailEnabled: settingsTable.complianceEmailEnabled,
    })
    .from(settingsTable)
    .limit(1);

  if (!settings) return null;
  if (settings.complianceEmailEnabled === 0) return null;

  if (settings.complianceNotificationEmail) return settings.complianceNotificationEmail;

  if (settings.ownerUserId) {
    const [owner] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, settings.ownerUserId))
      .limit(1);
    if (owner?.email) return owner.email;
  }

  return settings.companyEmail ?? null;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function buildEmail(opts: {
  type: "warning-30" | "warning-7" | "overdue";
  title: string;
  category: string;
  dueDate: string;
  daysUntilDue: number;
  appUrl: string | undefined;
}): { subject: string; html: string; text: string } {
  const { type, title, category, dueDate, daysUntilDue, appUrl } = opts;
  const safeTitle = escapeHtml(title);
  const safeCategory = escapeHtml(category);
  const formattedDate = formatDate(dueDate);
  const complianceUrl = appUrl ? `${appUrl}/compliance` : null;

  const linkHtml = complianceUrl
    ? `<p style="margin-top:20px;">
        <a href="${escapeHtml(complianceUrl)}"
           style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;">
          View Compliance Center
        </a>
       </p>`
    : "";

  const linkText = complianceUrl ? `\n\nView your compliance items: ${complianceUrl}` : "";

  if (type === "overdue") {
    const daysOverdue = Math.abs(daysUntilDue);
    const subject = `⚠️ Overdue: "${title}" was due ${formattedDate}`;
    const html = `
<!DOCTYPE html><html><body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px 20px;border-radius:6px;margin-bottom:24px;">
    <h2 style="color:#dc2626;margin:0 0 4px;">Compliance Item Overdue</h2>
    <p style="margin:0;color:#7f1d1d;">This item required your attention ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} ago.</p>
  </div>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;">
    <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:bold;width:35%;">Item</td>
        <td style="padding:8px 12px;border-left:1px solid #e5e7eb;">${safeTitle}</td></tr>
    <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:bold;">Category</td>
        <td style="padding:8px 12px;border-left:1px solid #e5e7eb;">${safeCategory}</td></tr>
    <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:bold;">Was Due</td>
        <td style="padding:8px 12px;border-left:1px solid #e5e7eb;color:#dc2626;font-weight:600;">${formattedDate} (${daysOverdue} day${daysOverdue === 1 ? "" : "s"} ago)</td></tr>
  </table>
  <p style="color:#374151;">Please take care of this as soon as possible and mark it complete in the Compliance Center.</p>
  ${linkHtml}
  <p style="color:#9ca3af;font-size:12px;margin-top:24px;">BuildPro automated compliance reminder</p>
</body></html>`.trim();
    const text = `OVERDUE: "${title}"\n\nCategory: ${category}\nWas Due: ${formattedDate} (${daysOverdue} day${daysOverdue === 1 ? "" : "s"} ago)\n\nPlease take care of this as soon as possible.${linkText}`;
    return { subject, html, text };
  }

  if (type === "warning-7") {
    const subject = `🔔 Due in 7 Days: "${title}" — ${formattedDate}`;
    const html = `
<!DOCTYPE html><html><body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:#fffbeb;border-left:4px solid #d97706;padding:16px 20px;border-radius:6px;margin-bottom:24px;">
    <h2 style="color:#d97706;margin:0 0 4px;">Urgent: Compliance Item Due Soon</h2>
    <p style="margin:0;color:#78350f;">Action required within 7 days.</p>
  </div>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;">
    <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:bold;width:35%;">Item</td>
        <td style="padding:8px 12px;border-left:1px solid #e5e7eb;">${safeTitle}</td></tr>
    <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:bold;">Category</td>
        <td style="padding:8px 12px;border-left:1px solid #e5e7eb;">${safeCategory}</td></tr>
    <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:bold;">Due Date</td>
        <td style="padding:8px 12px;border-left:1px solid #e5e7eb;color:#d97706;font-weight:600;">${formattedDate} (7 days)</td></tr>
  </table>
  <p style="color:#374151;">Make sure to complete this before the deadline and mark it done in the Compliance Center.</p>
  ${linkHtml}
  <p style="color:#9ca3af;font-size:12px;margin-top:24px;">BuildPro automated compliance reminder</p>
</body></html>`.trim();
    const text = `URGENT — Due in 7 Days: "${title}"\n\nCategory: ${category}\nDue Date: ${formattedDate}\n\nMake sure to complete this before the deadline.${linkText}`;
    return { subject, html, text };
  }

  // warning-30
  const subject = `📅 Coming Up: "${title}" due ${formattedDate}`;
  const html = `
<!DOCTYPE html><html><body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:16px 20px;border-radius:6px;margin-bottom:24px;">
    <h2 style="color:#1d4ed8;margin:0 0 4px;">Compliance Item Due in 30 Days</h2>
    <p style="margin:0;color:#1e3a8a;">Plan ahead — this is coming up next month.</p>
  </div>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;">
    <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:bold;width:35%;">Item</td>
        <td style="padding:8px 12px;border-left:1px solid #e5e7eb;">${safeTitle}</td></tr>
    <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:bold;">Category</td>
        <td style="padding:8px 12px;border-left:1px solid #e5e7eb;">${safeCategory}</td></tr>
    <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:bold;">Due Date</td>
        <td style="padding:8px 12px;border-left:1px solid #e5e7eb;font-weight:600;">${formattedDate} (30 days)</td></tr>
  </table>
  <p style="color:#374151;">You have time to prepare — just a heads-up so nothing slips through the cracks.</p>
  ${linkHtml}
  <p style="color:#9ca3af;font-size:12px;margin-top:24px;">BuildPro automated compliance reminder</p>
</body></html>`.trim();
  const text = `Coming Up in 30 Days: "${title}"\n\nCategory: ${category}\nDue Date: ${formattedDate}\n\nPlan ahead so nothing slips through the cracks.${linkText}`;
  return { subject, html, text };
}

async function processComplianceReminders(): Promise<void> {
  try {
    const recipientEmail = await getRecipientEmail();
    if (!recipientEmail) {
      console.log("[compliance-reminders] No recipient email or notifications disabled, skipping");
      return;
    }

    const appUrl = process.env["APP_URL"];

    const items = await db
      .select()
      .from(complianceItemsTable)
      .where(ne(complianceItemsTable.status, "complete"));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let sent = 0;

    for (const item of items) {
      if (!item.enabled) continue;

      const [y, m, d] = item.dueDate.split("-").map(Number);
      const due = new Date(y, m - 1, d);
      due.setHours(0, 0, 0, 0);
      const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      let type: "warning-30" | "warning-7" | "overdue" | null = null;

      if (daysUntilDue < 0) {
        type = "overdue";
      } else if (daysUntilDue === 7) {
        type = "warning-7";
      } else if (daysUntilDue === 30) {
        type = "warning-30";
      }

      if (!type) continue;

      const { subject, html, text } = buildEmail({
        type,
        title: item.title,
        category: item.category,
        dueDate: item.dueDate,
        daysUntilDue,
        appUrl,
      });

      try {
        await sendEmail({ to: recipientEmail, subject, html, text });
        console.log(`[compliance-reminders] Sent "${type}" for "${item.title}" to ${recipientEmail}`);
        sent++;
      } catch (err) {
        console.error(`[compliance-reminders] Failed to send for "${item.title}":`, err);
      }
    }

    if (sent === 0) {
      console.log("[compliance-reminders] No items require notification today");
    }
  } catch (err) {
    console.error("[compliance-reminders] Job error:", err);
  }
}

export function startComplianceReminderJob(): void {
  cron.schedule("0 8 * * *", processComplianceReminders);
  console.log("[compliance-reminders] Daily reminder job scheduled at 8:00 AM");
}
