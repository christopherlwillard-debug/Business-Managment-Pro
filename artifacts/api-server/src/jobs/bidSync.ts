import cron from "node-cron";
import { db } from "@workspace/db";
import { bidOpportunitiesTable, settingsTable, businessesTable } from "@workspace/db";
import { eq, sql, and, isNull } from "drizzle-orm";
import {
  fetchSamOpportunities,
  SamOpportunity,
  ASPHALT_SAM_KEYWORDS,
  GENERAL_CONTRACTING_SAM_KEYWORDS,
  ASPHALT_PSC_CODES,
  GENERAL_CONTRACTING_PSC_CODES,
} from "../lib/samGov.js";
import { fetchKyLocalBids, NAV_PHRASE_DENYLIST, PAVEMENT_KEYWORDS, BROAD_BID_KEYWORDS } from "../lib/kyLocalBids.js";
import { fetchUsaSpendingAwards, UsaSpendingAward } from "../lib/usaSpending.js";
import { sendEmail, escapeHtml } from "../lib/sendEmail.js";

// ── Business profiles ────────────────────────────────────────────────────────

interface BizProfile {
  samKeywords: string[];
  samNaicsCodes: string[];
  samPscCodes: string[];
  localKeywords: string[];
  label: string;
}

const BUSINESS_PROFILES: Record<string, BizProfile> = {
  asphalt_sealing: {
    samKeywords: ASPHALT_SAM_KEYWORDS,
    samNaicsCodes: ["237310"],
    samPscCodes: ASPHALT_PSC_CODES,
    localKeywords: PAVEMENT_KEYWORDS,
    label: "Asphalt Sealing",
  },
  general_contracting: {
    samKeywords: GENERAL_CONTRACTING_SAM_KEYWORDS,
    samNaicsCodes: [
      // General building
      "236220", // Commercial & institutional building
      "236210", // Industrial building
      "236115", // New single-family home construction
      "236116", // Remodeling of single-family homes
      "236118", // Residential remodelers
      // Specialty trades
      "238110", // Foundation, structure & exterior
      "238140", // Masonry
      "238150", // Glass & glazing
      "238160", // Roofing
      "238170", // Siding
      "238190", // Other structural
      "238210", // Electrical
      "238220", // Plumbing, heating & A/C
      "238310", // Drywall & insulation
      "238320", // Painting & wall covering
      "238330", // Flooring
      "238340", // Tile & terrazzo
      "238350", // Finish carpentry
      "238390", // Other finish trade
      "238910", // Site preparation
      "238990", // Other specialty trade
    ],
    samPscCodes: GENERAL_CONTRACTING_PSC_CODES,
    localKeywords: BROAD_BID_KEYWORDS,
    label: "General Contracting",
  },
};

const DEFAULT_PROFILE: BizProfile = {
  samKeywords: GENERAL_CONTRACTING_SAM_KEYWORDS,
  samNaicsCodes: ["236220", "236210"],
  samPscCodes: [],
  localKeywords: BROAD_BID_KEYWORDS,
  label: "General",
};

function getProfile(businessType: string): BizProfile {
  return BUSINESS_PROFILES[businessType] ?? DEFAULT_PROFILE;
}

// ── Purge irrelevant local bids for a specific business ──────────────────────

async function purgeIrrelevantLocalBids(
  businessId: number,
  relevantKeywords: string[]
): Promise<number> {
  const kwSet = [...new Set(relevantKeywords)];

  function toWordBoundaryPattern(kw: string): string {
    const escaped = kw
      .split(/\s+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    return `\\y${escaped}\\y`;
  }

  const titleConditions = kwSet.map(
    (kw) => sql`title ~* ${toWordBoundaryPattern(kw)}`
  );
  const descConditions = kwSet.map(
    (kw) => sql`COALESCE(description, '') ~* ${toWordBoundaryPattern(kw)}`
  );

  const isRelevant = [...titleConditions, ...descConditions].reduce(
    (acc, cond) => sql`${acc} OR ${cond}`
  );

  const result = await db.execute(
    sql`DELETE FROM bid_opportunities WHERE source = 'state-local' AND business_id = ${businessId} AND NOT (${isRelevant})`
  );
  const count = (result as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) {
    console.log(`[bid-sync] Purged ${count} irrelevant local bid(s) for business ${businessId}`);
  }
  return count;
}

async function purgeNavLinkRows(businessId: number): Promise<number> {
  const likeConditions = NAV_PHRASE_DENYLIST.map(
    (phrase) => sql`LOWER(title) LIKE ${"%" + phrase.toLowerCase() + "%"}`
  );

  const combined = likeConditions.reduce(
    (acc, cond) => sql`${acc} OR ${cond}`
  );

  const result = await db.execute(
    sql`DELETE FROM bid_opportunities WHERE source = 'state-local' AND business_id = ${businessId} AND (${combined})`
  );
  const count = (result as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) {
    console.log(`[bid-sync] Purged ${count} nav-link row(s) for business ${businessId}`);
  }
  return count;
}

// ── Purge stale USA Spending awards ──────────────────────────────────────────

async function purgeOldUsaSpendingAwards(businessId: number): Promise<number> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 24);
  const result = await db.execute(
    sql`DELETE FROM bid_opportunities
        WHERE source = 'usa-spending'
          AND business_id = ${businessId}
          AND (posted_date IS NULL OR posted_date::date < ${cutoff.toISOString().slice(0, 10)}::date)`
  );
  const count = (result as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) {
    console.log(`[bid-sync] Purged ${count} outdated USASpending award(s) for business ${businessId}`);
  }
  return count;
}

// ── Purge off-profile federal bids ───────────────────────────────────────────

async function purgeIrrelevantFederalBids(
  businessId: number,
  allowedNaicsCodes: string[]
): Promise<number> {
  if (allowedNaicsCodes.length === 0) return 0;

  const result = await db.execute(
    sql`DELETE FROM bid_opportunities
        WHERE source = 'federal'
          AND business_id = ${businessId}
          AND naics_code IS NOT NULL
          AND naics_code NOT IN (${sql.raw(
            allowedNaicsCodes.map((c) => `'${c}'`).join(", ")
          )})`
  );
  const count = (result as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) {
    console.log(`[bid-sync] Purged ${count} off-profile federal bid(s) for business ${businessId}`);
  }
  return count;
}

// ── Upsert ───────────────────────────────────────────────────────────────────

type OppWithSource = SamOpportunity & { source?: string; sourceLabel?: string };

async function upsertOpportunities(
  opportunities: OppWithSource[],
  defaultSource: string,
  defaultSourceLabel: string,
  businessId: number,
  overrides?: { status?: string; stage?: string }
): Promise<OppWithSource[]> {
  const newOnes: OppWithSource[] = [];

  for (const opp of opportunities) {
    const existing = await db
      .select({ id: bidOpportunitiesTable.id })
      .from(bidOpportunitiesTable)
      .where(
        and(
          eq(bidOpportunitiesTable.noticeId, opp.noticeId),
          eq(bidOpportunitiesTable.businessId, businessId)
        )
      )
      .then((rows) => rows[0] ?? null);

    if (!existing) {
      await db.insert(bidOpportunitiesTable).values({
        businessId,
        noticeId: opp.noticeId,
        title: opp.title,
        agency: opp.agency,
        naicsCode: opp.naicsCode,
        description: opp.description,
        postedDate: opp.postedDate,
        responseDeadline: opp.responseDeadline,
        url: opp.url,
        status: overrides?.status ?? "new",
        stage: overrides?.stage ?? "new",
        source: opp.source ?? defaultSource,
        sourceLabel: opp.sourceLabel ?? defaultSourceLabel,
      });
      newOnes.push(opp);
    }
  }

  return newOnes;
}

async function upsertUsaSpendingAwards(
  awards: UsaSpendingAward[],
  businessId: number
): Promise<UsaSpendingAward[]> {
  const newOnes: UsaSpendingAward[] = [];

  for (const award of awards) {
    const existing = await db
      .select({ id: bidOpportunitiesTable.id })
      .from(bidOpportunitiesTable)
      .where(
        and(
          eq(bidOpportunitiesTable.noticeId, award.noticeId),
          eq(bidOpportunitiesTable.businessId, businessId)
        )
      )
      .then((rows) => rows[0] ?? null);

    if (!existing) {
      await db.insert(bidOpportunitiesTable).values({
        businessId,
        noticeId: award.noticeId,
        title: award.title,
        agency: award.agency,
        naicsCode: award.naicsCode,
        description: award.description,
        postedDate: award.postedDate,
        responseDeadline: null,
        url: award.url,
        status: "dismissed",
        stage: "no_bid",
        source: "usa-spending",
        sourceLabel: "Awards Intel",
      });
      newOnes.push(award);
    }
  }

  return newOnes;
}

// ── Main sync function ───────────────────────────────────────────────────────

export async function runBidSync(
  businessId: number
): Promise<{ newFederal: number; newLocal: number; total: number }> {
  const [business] = await db
    .select({ id: businessesTable.id, type: businessesTable.type, name: businessesTable.name })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId))
    .limit(1);

  if (!business) {
    console.warn(`[bid-sync] Business ${businessId} not found, skipping`);
    return { newFederal: 0, newLocal: 0, total: 0 };
  }

  const profile = getProfile(business.type);
  console.log(`[bid-sync] Starting sync for "${business.name}" (${business.type}) — profile: ${profile.label}`);

  // One-time backfill: attribute legacy rows (business_id IS NULL) only to the
  // asphalt_sealing business, because all pre-scoping bids were fetched with pavement
  // keywords and belong there. Other business types do not claim these rows.
  if (business.type === "asphalt_sealing") {
    const backfillResult = await db.execute(
      sql`UPDATE bid_opportunities SET business_id = ${businessId} WHERE business_id IS NULL`
    );
    const backfillCount = (backfillResult as { rowCount?: number }).rowCount ?? 0;
    if (backfillCount > 0) {
      console.log(`[bid-sync] Backfilled ${backfillCount} legacy pavement bid(s) to "${business.name}"`);
    }
  }

  await purgeIrrelevantFederalBids(businessId, profile.samNaicsCodes);
  await purgeIrrelevantLocalBids(businessId, profile.localKeywords);
  await purgeNavLinkRows(businessId);
  await purgeOldUsaSpendingAwards(businessId);

  const [fedOpps, localOpps, awardsOpps] = await Promise.allSettled([
    process.env["SAM_GOV_API_KEY"]
      ? fetchSamOpportunities({ keywords: profile.samKeywords, naicsCodes: profile.samNaicsCodes, pscCodes: profile.samPscCodes })
      : Promise.resolve([] as SamOpportunity[]),
    fetchKyLocalBids(),
    fetchUsaSpendingAwards({ naicsCodes: profile.samNaicsCodes }),
  ]);

  const federal: OppWithSource[] =
    fedOpps.status === "fulfilled" ? fedOpps.value : [];
  const allLocal: OppWithSource[] =
    localOpps.status === "fulfilled" ? localOpps.value : [];
  const awards =
    awardsOpps.status === "fulfilled" ? awardsOpps.value : [];

  if (fedOpps.status === "rejected") {
    console.error("[bid-sync] SAM.gov fetch error:", fedOpps.reason);
  }
  if (localOpps.status === "rejected") {
    console.error("[bid-sync] KY local fetch error:", localOpps.reason);
  }
  if (awardsOpps.status === "rejected") {
    console.error("[bid-sync] USASpending fetch error:", awardsOpps.reason);
  }

  if (!process.env["SAM_GOV_API_KEY"]) {
    console.log("[bid-sync] SAM_GOV_API_KEY not set, skipping federal sync");
  }

  // Filter local bids at ingestion time so only on-profile opportunities are stored.
  // This prevents cross-business contamination regardless of purge order.
  const kwSet = profile.localKeywords.map((k) => k.toLowerCase());
  const local = allLocal.filter((o) => {
    const haystack = `${o.title} ${o.description ?? ""}`.toLowerCase();
    return kwSet.some((kw) => haystack.includes(kw));
  });

  if (allLocal.length !== local.length) {
    console.log(
      `[bid-sync] "${business.name}": filtered local bids ` +
      `${allLocal.length} → ${local.length} (kept on-profile only)`
    );
  }

  const [newFederal, newLocal, newAwards] = await Promise.all([
    upsertOpportunities(federal, "federal", "Federal", businessId),
    upsertOpportunities(local, "state-local", "KY Local", businessId),
    upsertUsaSpendingAwards(awards, businessId),
  ]);

  console.log(
    `[bid-sync] "${business.name}": Federal ${federal.length} fetched, ${newFederal.length} new` +
    ` | KY Local: ${local.length} fetched, ${newLocal.length} new` +
    ` | USASpending Awards: ${awards.length} fetched, ${newAwards.length} new`
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
      <h2 style="color:#111827;">New Government Bid Opportunities — ${escapeHtml(business.name)}</h2>
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

  const subject = `${allNew.length} New Bid Opportunit${allNew.length === 1 ? "y" : "ies"} for ${business.name} — ${newFederal.length} Federal, ${newLocal.length} KY/IN Local`;

  await sendEmail({ to: emailTo, subject, html });
  console.log(`[bid-sync] Alert email sent to ${emailTo}`);

  return result;
}

// ── Run sync for all businesses ──────────────────────────────────────────────

export async function runBidSyncAllBusinesses(): Promise<void> {
  const businesses = await db
    .select({ id: businessesTable.id, name: businessesTable.name })
    .from(businessesTable);

  if (businesses.length === 0) {
    console.log("[bid-sync] No businesses found, skipping sync");
    return;
  }

  for (const biz of businesses) {
    try {
      await runBidSync(biz.id);
    } catch (err) {
      console.error(`[bid-sync] Error syncing business ${biz.name}:`, err);
    }
  }
}

export function startBidSyncJob(): void {
  cron.schedule("0 7 * * *", runBidSyncAllBusinesses);
  console.log("[bid-sync] Daily bid sync scheduled at 7:00 AM (all businesses)");
}
