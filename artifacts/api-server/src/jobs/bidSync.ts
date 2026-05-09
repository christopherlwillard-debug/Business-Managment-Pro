import cron from "node-cron";
import { db } from "@workspace/db";
import { bidOpportunitiesTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchSamOpportunities } from "../lib/samGov.js";
import { sendEmail, escapeHtml } from "../lib/sendEmail.js";

async function runBidSync(): Promise<void> {
  console.log("[bid-sync] Starting SAM.gov opportunity sync");

  if (!process.env["SAM_GOV_API_KEY"]) {
    console.log("[bid-sync] SAM_GOV_API_KEY not set, skipping");
    return;
  }

  const opportunities = await fetchSamOpportunities();
  if (opportunities.length === 0) {
    console.log("[bid-sync] No opportunities returned from SAM.gov");
    return;
  }

  const newOnes: typeof opportunities = [];

  for (const opp of opportunities) {
    const existing = await db
      .select({ id: bidOpportunitiesTable.id })
      .from(bidOpportunitiesTable)
      .where(eq(bidOpportunitiesTable.noticeId, opp.noticeId))
      .then((rows) => rows[0] ?? null);

    if (!existing) {
      await db.insert(bidOpportunitiesTable).values({
        noticeId: opp.noticeId,
        title: opp.title,
        agency: opp.agency,
        naicsCode: opp.naicsCode,
        description: opp.description,
        postedDate: opp.postedDate,
        responseDeadline: opp.responseDeadline,
        url: opp.url,
        status: "new",
      });
      newOnes.push(opp);
    }
  }

  console.log(`[bid-sync] ${opportunities.length} fetched, ${newOnes.length} new`);

  if (newOnes.length === 0) return;

  const [settings] = await db.select().from(settingsTable).limit(1);
  const emailTo = settings?.complianceNotificationEmail ?? null;

  if (!emailTo) {
    console.log("[bid-sync] No notification email configured, skipping alert");
    return;
  }

  const rows = newOnes
    .map(
      (o) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
          <a href="${escapeHtml(o.url)}" style="color:#2563eb;font-weight:600;">${escapeHtml(o.title)}</a>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${escapeHtml(o.agency ?? "—")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${o.responseDeadline ?? "—"}</td>
      </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:700px;margin:0 auto;">
      <h2 style="color:#111827;">New Government Bid Opportunities</h2>
      <p style="color:#374151;">${newOnes.length} new contract opportunit${newOnes.length === 1 ? "y" : "ies"} matching NAICS 237310 (asphalt / parking lot) were found on SAM.gov.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Title</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Agency</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Due Date</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:24px;color:#6b7280;font-size:14px;">
        Log in to BuildPro to view all opportunities and mark ones you're interested in.
      </p>
    </div>`;

  await sendEmail({
    to: emailTo,
    subject: `${newOnes.length} New Bid Opportunit${newOnes.length === 1 ? "y" : "ies"} on SAM.gov`,
    html,
  });

  console.log(`[bid-sync] Alert email sent to ${emailTo}`);
}

export function startBidSyncJob(): void {
  cron.schedule("0 7 * * *", runBidSync);
  console.log("[bid-sync] Daily SAM.gov sync scheduled at 7:00 AM");
}
