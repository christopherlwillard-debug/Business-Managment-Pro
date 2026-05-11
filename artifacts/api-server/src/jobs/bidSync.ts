import cron from "node-cron";
import { db } from "@workspace/db";
import { bidOpportunitiesTable, settingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { fetchSamOpportunities, SamOpportunity } from "../lib/samGov.js";
import { fetchKyLocalBids, NAV_PHRASE_DENYLIST, PAVEMENT_KEYWORDS, BROAD_BID_KEYWORDS } from "../lib/kyLocalBids.js";
import { sendEmail, escapeHtml } from "../lib/sendEmail.js";

async function purgeIrrelevantLocalBids(): Promise<number> {
  // Build a condition that is TRUE when the row matches any relevant keyword.
  // Uses PostgreSQL case-insensitive regex (~*) with \y word boundaries so that
  // short terms like "road" do not spuriously match "broadband", "bridge" does
  // not match "Cambridge", etc.
  const relevantKeywords = [...new Set([...PAVEMENT_KEYWORDS, ...BROAD_BID_KEYWORDS])];

  function toWordBoundaryPattern(kw: string): string {
    const escaped = kw
      .split(/\s+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    return `\\y${escaped}\\y`;
  }

  const titleConditions = relevantKeywords.map(
    (kw) => sql`title ~* ${toWordBoundaryPattern(kw)}`
  );
  const descConditions = relevantKeywords.map(
    (kw) => sql`COALESCE(description, '') ~* ${toWordBoundaryPattern(kw)}`
  );

  const isRelevant = [...titleConditions, ...descConditions].reduce(
    (acc, cond) => sql`${acc} OR ${cond}`
  );

  const result = await db.execute(
    sql`DELETE FROM bid_opportunities WHERE source = 'state-local' AND NOT (${isRelevant})`
  );
  const count = (result as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) {
    console.log(`[bid-sync] Purged ${count} irrelevant local bid(s) (non-construction) from bid_opportunities`);
  }
  return count;
}

async function purgeNavLinkRows(): Promise<number> {
  const likeConditions = NAV_PHRASE_DENYLIST.map(
    (phrase) => sql`LOWER(title) LIKE ${"%" + phrase.toLowerCase() + "%"}`
  );

  const combined = likeConditions.reduce(
    (acc, cond) => sql`${acc} OR ${cond}`
  );

  const result = await db.execute(
    sql`DELETE FROM bid_opportunities WHERE source = 'state-local' AND (${combined})`
  );
  const count = (result as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) {
    console.log(`[bid-sync] Purged ${count} stale nav-link row(s) from bid_opportunities`);
  }
  return count;
}

type OppWithSource = SamOpportunity & { source?: string; sourceLabel?: string };

async function upsertOpportunities(
  opportunities: OppWithSource[],
  defaultSource: string,
  defaultSourceLabel: string
): Promise<OppWithSource[]> {
  const newOnes: OppWithSource[] = [];

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
        source: opp.source ?? defaultSource,
        sourceLabel: opp.sourceLabel ?? defaultSourceLabel,
      });
      newOnes.push(opp);
    }
  }

  return newOnes;
}

export async function runBidSync(): Promise<{ newFederal: number; newLocal: number; total: number }> {
  console.log("[bid-sync] Starting bid opportunity sync (federal + KY local)");
  await purgeIrrelevantLocalBids();
  await purgeNavLinkRows();

  const [fedOpps, localOpps] = await Promise.allSettled([
    process.env["SAM_GOV_API_KEY"]
      ? fetchSamOpportunities()
      : Promise.resolve([] as SamOpportunity[]),
    fetchKyLocalBids(),
  ]);

  const federal: OppWithSource[] =
    fedOpps.status === "fulfilled" ? fedOpps.value : [];
  const local: OppWithSource[] =
    localOpps.status === "fulfilled" ? localOpps.value : [];

  if (fedOpps.status === "rejected") {
    console.error("[bid-sync] SAM.gov fetch error:", fedOpps.reason);
  }
  if (localOpps.status === "rejected") {
    console.error("[bid-sync] KY local fetch error:", localOpps.reason);
  }

  if (!process.env["SAM_GOV_API_KEY"]) {
    console.log("[bid-sync] SAM_GOV_API_KEY not set, skipping federal sync");
  }

  const [newFederal, newLocal] = await Promise.all([
    upsertOpportunities(federal, "federal", "Federal"),
    upsertOpportunities(local, "state-local", "KY Local"),
  ]);

  console.log(
    `[bid-sync] Federal: ${federal.length} fetched, ${newFederal.length} new` +
    ` | KY Local: ${local.length} fetched, ${newLocal.length} new`
  );

  const allNew = [...newFederal, ...newLocal];

  const result = { newFederal: newFederal.length, newLocal: newLocal.length, total: allNew.length };

  if (allNew.length === 0) return result;

  const [settings] = await db.select().from(settingsTable).limit(1);
  const emailTo = settings?.complianceNotificationEmail ?? null;

  if (!emailTo) {
    console.log("[bid-sync] No notification email configured, skipping alert");
    return result;
  }

  const buildRows = (opps: OppWithSource[], badgeColor: string, badgeText: string) =>
    opps.map((o) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
          <span style="display:inline-block;padding:1px 7px;border-radius:99px;font-size:11px;font-weight:600;background:${badgeColor === "blue" ? "#dbeafe" : "#fef3c7"};color:${badgeColor === "blue" ? "#1d4ed8" : "#92400e"};margin-right:8px;">${escapeHtml(badgeText)}</span>
          <a href="${escapeHtml(o.url)}" style="color:#2563eb;font-weight:600;">${escapeHtml(o.title)}</a>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${escapeHtml(o.agency ?? "—")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${o.responseDeadline ?? "—"}</td>
      </tr>`).join("");

  const fedRows = buildRows(newFederal, "blue", "Federal");
  const localRows = buildRows(newLocal, "amber", "KY/IN Local");

  const html = `
    <div style="font-family:sans-serif;max-width:700px;margin:0 auto;">
      <h2 style="color:#111827;">New Government Bid Opportunities</h2>
      <p style="color:#374151;">${allNew.length} new contract opportunit${allNew.length === 1 ? "y" : "ies"} found — ${newFederal.length} federal (SAM.gov) and ${newLocal.length} KY/IN local.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Title</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Agency</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Due Date</th>
          </tr>
        </thead>
        <tbody>${fedRows}${localRows}</tbody>
      </table>
      <p style="margin-top:24px;color:#6b7280;font-size:14px;">
        Log in to BuildPro to view all opportunities and mark ones you're interested in.
      </p>
    </div>`;

  const subject = `${allNew.length} New Bid Opportunit${allNew.length === 1 ? "y" : "ies"} — ${newFederal.length} Federal, ${newLocal.length} KY/IN Local`;

  await sendEmail({ to: emailTo, subject, html });
  console.log(`[bid-sync] Alert email sent to ${emailTo}`);

  return result;
}

export function startBidSyncJob(): void {
  cron.schedule("0 7 * * *", runBidSync);
  console.log("[bid-sync] Daily bid sync scheduled at 7:00 AM");
}
