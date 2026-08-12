import cron from "node-cron";
import { db } from "@workspace/db";
import {
  bidOpportunitiesTable,
  bidCapabilityProfilesTable,
  bidBusinessSettingsTable,
  settingsTable,
  businessesTable,
} from "@workspace/db";
import { eq, sql, and, isNull, ne } from "drizzle-orm";
import {
  fetchSamOpportunities,
  SamOpportunity,
  ASPHALT_PSC_CODES,
  GENERAL_CONTRACTING_PSC_CODES,
} from "../lib/samGov.js";
import { fetchKyLocalBids, NAV_PHRASE_DENYLIST, PAVEMENT_KEYWORDS, BROAD_BID_KEYWORDS } from "../lib/kyLocalBids.js";
import { fetchUsaSpendingAwards, UsaSpendingAward } from "../lib/usaSpending.js";
import { sendEmail, escapeHtml } from "../lib/sendEmail.js";
import {
  CapabilityDefinition,
  getCapabilitiesForBusinessType,
  mergeCapabilitySearchParams,
} from "../lib/bidCapabilitySeeds.js";
import { fetchSubnetOpportunities, SubnetOpportunity } from "../lib/subnetSync.js";
import { fetchGsaForecastOpportunities, GsaForecastOpportunity } from "../lib/gsaForecast.js";
import { normalizeSetAsideType } from "../lib/bidScoring.js";

// ── Resolved business search profile ─────────────────────────────────────────

interface ResolvedProfile {
  naicsCodes:      string[];
  keywords:        string[];
  pscCodes:        string[];
  localKeywords:   string[];
  negativeKeywords: string[];
  description:     string;       // AI context
  capabilities:    CapabilityDefinition[];
  profileStatus:   string;       // 'active' | 'watch' | 'off'
  isSdvosb:        boolean;
  isVosb:          boolean;
  isSmallBusiness: boolean;
  label:           string;
}

// ── Hard-suppression: title-level gate ───────────────────────────────────────
// Opportunities whose TITLE contains these are skipped at sync time entirely.
// Title match = clearly disqualifying with no chance of false negative.
const TITLE_HARD_SUPPRESS = [
  // Waste / environmental — outside scope
  "hazardous waste",
  "medical waste",
  "biomedical waste",
  "radioactive waste",
  "hazmat",
  "biohazard",
  "residential garbage collection",
  "municipal solid waste collection",
  "refuse collection franchise",
  "automated refuse",
  "sewage treatment plant",
  // Aviation / aircraft parts — clearly not construction
  "ch-47",
  "ch-53",
  "uh-60",
  "f-16",
  "f-35",
  "helicopter part",
  "aircraft part",
  "aviation part",
  "insulation blanket",   // aircraft thermal blankets, not building insulation
  "avionics",
  // Military exercises and non-construction operations
  "bilateral exercise",
  "military exercise",
  "bilateral army exercise",
  "joint exercise",
  // Industrial equipment / supply (non-construction)
  "fan,centrifugal",
  "centrifugal pump",
  "turbine blade",
  "compressor assembly",
  "ammunition",
  "ordnance",
  "explosive",
  "weapon system",
  "fire control system",
  "control column,airc",   // aircraft control column
  "c0ntrol column,airc",   // OCR variant with zero instead of letter O
  // IT / professional services (not trades)
  "software license",
  "saas subscription",
  "cloud hosting",
];

function isHardSuppressedByTitle(title: string): boolean {
  const t = title.toLowerCase();
  return TITLE_HARD_SUPPRESS.some((term) => t.includes(term));
}

// ── Opportunity type classification ───────────────────────────────────────────
function deriveOpportunityType(source: string, noticeType?: string | null): string {
  if (source === "usa-spending")  return "award_intelligence";
  if (source === "subnet")        return "subcontracting";
  if (source === "gsa-forecast")  return "forecast";
  switch (noticeType) {
    case "sources_sought":  return "sources_sought";
    case "presolicitation": return "presolicitation";
    default:                return "solicitation";
  }
}

// ── Load capability profiles from DB (seed if absent) ────────────────────────

async function loadOrSeedCapabilities(
  businessId: number,
  businessType: string
): Promise<CapabilityDefinition[]> {
  const dbRows = await db
    .select()
    .from(bidCapabilityProfilesTable)
    .where(eq(bidCapabilityProfilesTable.businessId, businessId));

  if (dbRows.length > 0) {
    // Map DB rows back to CapabilityDefinition shape
    return dbRows.map((row) => ({
      capabilityKey:    row.capabilityKey,
      name:             row.name,
      description:      row.description ?? "",
      naicsCodes:       (row.naicsCodes as string[]) ?? [],
      keywords:         (row.keywords as string[]) ?? [],
      negativeKeywords: (row.negativeKeywords as string[]) ?? [],
      equipment:        (row.equipment as string[]) ?? [],
      localKeywords:    (row.localKeywords as string[]) ?? [],
      active:           row.active,
      sortOrder:        row.sortOrder,
    }));
  }

  // No DB rows — seed from built-in definitions
  const seeds = getCapabilitiesForBusinessType(businessType);
  console.log(`[bid-sync] Seeding ${seeds.length} capability profile(s) for business ${businessId} (${businessType})`);

  for (const cap of seeds) {
    try {
      await db.insert(bidCapabilityProfilesTable).values({
        businessId,
        capabilityKey:    cap.capabilityKey,
        name:             cap.name,
        description:      cap.description,
        naicsCodes:       cap.naicsCodes,
        keywords:         cap.keywords,
        negativeKeywords: cap.negativeKeywords,
        equipment:        cap.equipment,
        localKeywords:    cap.localKeywords,
        active:           cap.active,
        sortOrder:        cap.sortOrder,
      });
    } catch {
      // Row may already exist from a concurrent seed — safe to ignore
    }
  }

  return seeds;
}

// ── Load or create bid business settings ─────────────────────────────────────

async function loadOrCreateBidSettings(businessId: number): Promise<{
  profileStatus: string;
  isSdvosb: boolean;
  isVosb: boolean;
  isSmallBusiness: boolean;
}> {
  const existing = await db
    .select()
    .from(bidBusinessSettingsTable)
    .where(eq(bidBusinessSettingsTable.businessId, businessId))
    .then((rows) => rows[0] ?? null);

  if (existing) {
    return {
      profileStatus:   existing.profileStatus,
      isSdvosb:        existing.isSdvosb,
      isVosb:          existing.isVosb,
      isSmallBusiness: existing.isSmallBusiness,
    };
  }

  // Create default settings row
  await db.insert(bidBusinessSettingsTable).values({
    businessId,
    profileStatus:   "active",
    isSmallBusiness: true,
  }).onConflictDoNothing();

  return { profileStatus: "active", isSdvosb: false, isVosb: false, isSmallBusiness: true };
}

// ── Resolve the complete search profile for a business ────────────────────────

async function resolveProfile(businessId: number, businessType: string): Promise<ResolvedProfile> {
  const [capabilities, settings] = await Promise.all([
    loadOrSeedCapabilities(businessId, businessType),
    loadOrCreateBidSettings(businessId),
  ]);

  const merged = mergeCapabilitySearchParams(capabilities.filter((c) => c.active));

  // Add PSC codes from legacy hardcoded lists — extend here when capability profiles carry them
  const pscCodes =
    businessType === "asphalt_sealing" ? ASPHALT_PSC_CODES : GENERAL_CONTRACTING_PSC_CODES;

  return {
    naicsCodes:       merged.naicsCodes,
    keywords:         merged.keywords,
    pscCodes,
    localKeywords:    merged.localKeywords,
    negativeKeywords: merged.negativeKeywords,
    description:      merged.description,
    capabilities:     capabilities.filter((c) => c.active),
    profileStatus:    settings.profileStatus,
    isSdvosb:         settings.isSdvosb,
    isVosb:           settings.isVosb,
    isSmallBusiness:  settings.isSmallBusiness,
    label:            businessType === "asphalt_sealing" ? "Asphalt Sealing" : "General Contracting",
  };
}

// ── Source health helpers ─────────────────────────────────────────────────────

async function writeSyncHealth(
  businessId: number,
  patch: Partial<{
    lastSyncAt:          Date;
    lastSyncSuccessAt:   Date;
    lastSyncError:       string | null;
    samLastSuccessAt:    Date;
    samLastError:        string | null;
    localLastSuccessAt:  Date;
    localLastError:      string | null;
    awardsLastSuccessAt: Date;
    awardsLastError:     string | null;
  }>
): Promise<void> {
  try {
    await db
      .insert(bidBusinessSettingsTable)
      .values({ businessId, ...patch })
      .onConflictDoUpdate({
        target: bidBusinessSettingsTable.businessId,
        set:    { ...patch, updatedAt: new Date() },
      });
  } catch (err) {
    console.warn("[bid-sync] Failed to write sync health:", err);
  }
}

// ── Opportunity scoring ───────────────────────────────────────────────────────

interface ScoredOpportunity {
  opportunityScore: number;
  capabilityMatches: string[];
}


function scoreOpportunity(
  opp: { title: string; description: string | null; responseDeadline: string | null; source: string },
  capabilities: CapabilityDefinition[],
  settings: { isSdvosb: boolean; isSmallBusiness: boolean; isVosb: boolean },
  aiSetAsideType?: string,
): ScoredOpportunity {
  // Hard-suppress by title: clearly incompatible — no scoring needed
  if (isHardSuppressedByTitle(opp.title)) {
    return { opportunityScore: 0, capabilityMatches: [] };
  }

  const text = `${opp.title} ${opp.description ?? ""}`.toLowerCase();
  const capabilityMatches: string[] = [];

  // ── Capability keyword match (0–40 points) ────────────────────────────────
  let capScore = 0;
  for (const cap of capabilities) {
    const hits = cap.keywords.filter((kw) => text.includes(kw.toLowerCase()));
    if (hits.length > 0) {
      capabilityMatches.push(cap.capabilityKey);
      capScore = Math.min(40, capScore + Math.min(20, hits.length * 5));
    }
  }

  // Negative-keyword penalty (shared across all capabilities)
  const allNeg = capabilities.flatMap((c) => c.negativeKeywords);
  const negHits = allNeg.filter((kw) => text.includes(kw.toLowerCase()));
  capScore = Math.max(0, capScore - negHits.length * 8);

  // ── Source bonus (0–10 points) — local/regional contracts preferred ───────
  const sourceScore = opp.source === "state-local" ? 10 : 0;

  // ── Set-aside advantage (0–20 points) ─────────────────────────────────────
  let setAsideScore = 0;
  if (aiSetAsideType === "sdvosb") {
    setAsideScore = (settings.isSdvosb || settings.isVosb) ? 20 : 2;
  } else if (aiSetAsideType === "small_business") {
    setAsideScore = settings.isSmallBusiness ? 15 : 5;
  } else if (aiSetAsideType === "open") {
    setAsideScore = 5; // full-and-open — everyone competes
  }

  // ── Deadline urgency (0–20 points) ───────────────────────────────────────
  let urgencyScore = 0;
  if (opp.responseDeadline) {
    const daysOut = (new Date(opp.responseDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysOut < 0)         urgencyScore = 0;  // already expired — no urgency bonus
    else if (daysOut <= 7)   urgencyScore = 20;
    else if (daysOut <= 14)  urgencyScore = 15;
    else if (daysOut <= 30)  urgencyScore = 10;
    else if (daysOut <= 60)  urgencyScore = 5;
    // 90+ days = 0
  }

  // ── Notice-type bonus (0–10 points) — Sources Sought = early intel ───────
  // Note: noticeType comes from SAM.gov, we don't have it here in scoring;
  // this field will be stored on the row and can inform future UI sorting.

  const total = Math.min(100, capScore + sourceScore + setAsideScore + urgencyScore);

  return { opportunityScore: total, capabilityMatches };
}

// ── Purge helpers (unchanged from original) ───────────────────────────────────

async function purgeIrrelevantLocalBids(businessId: number, relevantKeywords: string[]): Promise<number> {
  const kwSet = [...new Set(relevantKeywords)];
  if (kwSet.length === 0) return 0;

  function toWordBoundaryPattern(kw: string): string {
    const escaped = kw.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
    return `\\y${escaped}\\y`;
  }

  const titleConditions = kwSet.map((kw) => sql`title ~* ${toWordBoundaryPattern(kw)}`);
  const descConditions  = kwSet.map((kw) => sql`COALESCE(description, '') ~* ${toWordBoundaryPattern(kw)}`);
  const isRelevant = [...titleConditions, ...descConditions].reduce((acc, cond) => sql`${acc} OR ${cond}`);

  const result = await db.execute(
    sql`DELETE FROM bid_opportunities WHERE source = 'state-local' AND business_id = ${businessId} AND NOT (${isRelevant})`
  );
  const count = (result as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) console.log(`[bid-sync] Purged ${count} irrelevant local bid(s) for business ${businessId}`);
  return count;
}

async function purgeNavLinkRows(businessId: number): Promise<number> {
  const likeConditions = NAV_PHRASE_DENYLIST.map((phrase) => sql`LOWER(title) LIKE ${"%" + phrase.toLowerCase() + "%"}`);
  const combined = likeConditions.reduce((acc, cond) => sql`${acc} OR ${cond}`);
  const result = await db.execute(
    sql`DELETE FROM bid_opportunities WHERE source = 'state-local' AND business_id = ${businessId} AND (${combined})`
  );
  const count = (result as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) console.log(`[bid-sync] Purged ${count} nav-link row(s) for business ${businessId}`);
  return count;
}

async function purgeOldUsaSpendingAwards(businessId: number): Promise<number> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 24);
  const result = await db.execute(
    sql`DELETE FROM bid_opportunities WHERE source = 'usa-spending' AND business_id = ${businessId} AND (posted_date IS NULL OR posted_date::date < ${cutoff.toISOString().slice(0, 10)}::date)`
  );
  const count = (result as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) console.log(`[bid-sync] Purged ${count} outdated USASpending award(s) for business ${businessId}`);
  return count;
}

async function purgeIrrelevantFederalBids(businessId: number, allowedNaicsCodes: string[]): Promise<number> {
  if (allowedNaicsCodes.length === 0) return 0;
  const result = await db.execute(
    sql`DELETE FROM bid_opportunities WHERE source = 'federal' AND business_id = ${businessId} AND naics_code IS NOT NULL AND naics_code NOT IN (${sql.raw(allowedNaicsCodes.map((c) => `'${c}'`).join(", "))})`
  );
  const count = (result as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) console.log(`[bid-sync] Purged ${count} off-profile federal bid(s) for business ${businessId}`);
  return count;
}

// ── Upsert opportunities ──────────────────────────────────────────────────────

type OppWithSource = SamOpportunity & { source?: string; sourceLabel?: string };

// ── Rescore all existing bids regardless of API fetch results ─────────────────
// Called once per sync after capabilities are loaded so that profile changes
// take effect immediately without needing a fresh API response for every bid.
async function rescoreExistingBids(businessId: number, profile: ResolvedProfile): Promise<number> {
  const existing = await db
    .select({
      id:               bidOpportunitiesTable.id,
      title:            bidOpportunitiesTable.title,
      description:      bidOpportunitiesTable.description,
      responseDeadline: bidOpportunitiesTable.responseDeadline,
      source:           bidOpportunitiesTable.source,
      noticeType:       bidOpportunitiesTable.noticeType,
      setAsideType:     bidOpportunitiesTable.setAsideType,
    })
    .from(bidOpportunitiesTable)
    .where(and(
      eq(bidOpportunitiesTable.businessId, businessId),
      ne(bidOpportunitiesTable.source, "usa-spending"),
    ));

  let updated = 0;
  for (const bid of existing) {
    const { opportunityScore, capabilityMatches } = scoreOpportunity(
      { title: bid.title, description: bid.description ?? null, responseDeadline: bid.responseDeadline, source: bid.source },
      profile.capabilities,
      { isSdvosb: profile.isSdvosb, isVosb: profile.isVosb, isSmallBusiness: profile.isSmallBusiness },
      normalizeSetAsideType(bid.setAsideType),
    );
    await db.update(bidOpportunitiesTable)
      .set({
        opportunityScore,
        capabilityMatches,
        opportunityType: deriveOpportunityType(bid.source, bid.noticeType),
      })
      .where(eq(bidOpportunitiesTable.id, bid.id));
    updated++;
  }

  console.log(`[bid-sync] Rescored ${updated} existing bids for business ${businessId}`);
  return updated;
}

async function upsertOpportunities(
  opportunities: OppWithSource[],
  defaultSource: string,
  defaultSourceLabel: string,
  businessId: number,
  profile: ResolvedProfile,
  overrides?: { status?: string; stage?: string; opportunityTypeOverride?: string }
): Promise<OppWithSource[]> {
  const newOnes: OppWithSource[] = [];

  for (const opp of opportunities) {
    // Hard title gate: skip clearly incompatible opportunities before storing
    if (isHardSuppressedByTitle(opp.title)) {
      console.log(`[bid-sync] Hard-suppressed: "${opp.title.slice(0, 70)}"`);
      continue;
    }

    const existing = await db
      .select({ id: bidOpportunitiesTable.id })
      .from(bidOpportunitiesTable)
      .where(and(eq(bidOpportunitiesTable.noticeId, opp.noticeId), eq(bidOpportunitiesTable.businessId, businessId)))
      .then((rows) => rows[0] ?? null);

    if (!existing) {
      const rawSetAside = (opp as SamOpportunity).typeOfSetAside ?? null;
      const { opportunityScore, capabilityMatches } = scoreOpportunity(
        { title: opp.title, description: opp.description, responseDeadline: opp.responseDeadline, source: opp.source ?? defaultSource },
        profile.capabilities,
        { isSdvosb: profile.isSdvosb, isVosb: profile.isVosb, isSmallBusiness: profile.isSmallBusiness },
        normalizeSetAsideType(rawSetAside),
      );

      await db.insert(bidOpportunitiesTable).values({
        businessId,
        noticeId:          opp.noticeId,
        title:             opp.title,
        agency:            opp.agency,
        naicsCode:         opp.naicsCode,
        description:       opp.description,
        postedDate:        opp.postedDate,
        responseDeadline:  opp.responseDeadline,
        url:               opp.url,
        status:            overrides?.status ?? "new",
        stage:             overrides?.stage ?? "new",
        source:            opp.source ?? defaultSource,
        sourceLabel:       opp.sourceLabel ?? defaultSourceLabel,
        noticeType:        (opp as SamOpportunity).noticeType ?? null,
        setAsideType:      rawSetAside,
        opportunityScore,
        capabilityMatches,
        opportunityType:   overrides?.opportunityTypeOverride
          ?? deriveOpportunityType(opp.source ?? defaultSource, (opp as SamOpportunity).noticeType ?? null),
      });
      newOnes.push(opp);
    } else {
      // Re-score existing row so capability profile changes take effect immediately
      const rawSetAside = (opp as SamOpportunity).typeOfSetAside ?? null;
      const { opportunityScore, capabilityMatches } = scoreOpportunity(
        { title: opp.title, description: opp.description, responseDeadline: opp.responseDeadline, source: opp.source ?? defaultSource },
        profile.capabilities,
        { isSdvosb: profile.isSdvosb, isVosb: profile.isVosb, isSmallBusiness: profile.isSmallBusiness },
        normalizeSetAsideType(rawSetAside),
      );
      await db.update(bidOpportunitiesTable)
        .set({
          opportunityScore,
          capabilityMatches,
          noticeType:      (opp as SamOpportunity).noticeType ?? null,
          setAsideType:    rawSetAside,
          opportunityType: overrides?.opportunityTypeOverride
            ?? deriveOpportunityType(opp.source ?? defaultSource, (opp as SamOpportunity).noticeType ?? null),
        })
        .where(eq(bidOpportunitiesTable.id, existing.id));
    }
  }

  return newOnes;
}

async function upsertUsaSpendingAwards(awards: UsaSpendingAward[], businessId: number): Promise<UsaSpendingAward[]> {
  const newOnes: UsaSpendingAward[] = [];

  for (const award of awards) {
    const existing = await db
      .select({ id: bidOpportunitiesTable.id })
      .from(bidOpportunitiesTable)
      .where(and(eq(bidOpportunitiesTable.noticeId, award.noticeId), eq(bidOpportunitiesTable.businessId, businessId)))
      .then((rows) => rows[0] ?? null);

    if (!existing) {
      await db.insert(bidOpportunitiesTable).values({
        businessId,
        noticeId: award.noticeId, title: award.title, agency: award.agency,
        naicsCode: award.naicsCode, description: award.description,
        postedDate: award.postedDate, responseDeadline: null, url: award.url,
        status: "dismissed", stage: "no_bid", source: "usa-spending", sourceLabel: "Awards Intel",
        opportunityType: "award_intelligence",
      });
      newOnes.push(award);
    } else {
      // Repair legacy rows that were inserted before opportunityType was set
      await db
        .update(bidOpportunitiesTable)
        .set({ opportunityType: "award_intelligence" })
        .where(and(
          eq(bidOpportunitiesTable.id, existing.id),
          isNull(bidOpportunitiesTable.opportunityType),
        ));
    }
  }

  return newOnes;
}

// ── Notification email (unchanged logic) ─────────────────────────────────────

async function sendNewBidEmail(
  businessId: number,
  business: { name: string },
  newFederal: OppWithSource[],
  newLocal: OppWithSource[]
): Promise<{ newFederal: number; newLocal: number; total: number }> {
  const allNew = [...newFederal, ...newLocal];
  const result = { newFederal: newFederal.length, newLocal: newLocal.length, total: allNew.length };

  if (allNew.length === 0) return result;

  // settingsTable is a single flat record (no businessId FK) — take first row
  const settings = await db
    .select({ complianceNotificationEmail: settingsTable.complianceNotificationEmail })
    .from(settingsTable)
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const emailTo = settings?.complianceNotificationEmail ?? undefined;
  if (!emailTo) {
    console.log(`[bid-sync] No notification email for business ${businessId}, skipping alert`);
    return result;
  }

  const makeRows = (opps: OppWithSource[]) =>
    opps.map((o) => `<tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:8px 12px;font-size:14px;"><a href="${o.url}" style="color:#d97706;text-decoration:none;">${escapeHtml(o.title)}</a></td>
      <td style="padding:8px 12px;font-size:14px;color:#374151;">${escapeHtml(o.agency ?? "—")}</td>
      <td style="padding:8px 12px;font-size:14px;color:#374151;">${o.responseDeadline ?? "—"}</td>
    </tr>`).join("");

  const html = `<div style="font-family:sans-serif;max-width:700px;margin:0 auto;padding:24px;">
    <h2 style="color:#111827;">New Government Bid Opportunities — ${escapeHtml(business.name)}</h2>
    <p style="color:#374151;">${allNew.length} new contract opportunit${allNew.length === 1 ? "y" : "ies"} found — ${newFederal.length} federal (SAM.gov) and ${newLocal.length} KY/IN local.</p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <thead><tr style="background:#f3f4f6;">
        <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Title</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Agency</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Due Date</th>
      </tr></thead>
      <tbody>${makeRows(newFederal)}${makeRows(newLocal)}</tbody>
    </table>
    <p style="margin-top:24px;color:#6b7280;font-size:14px;">Log in to BuildPro to view all opportunities and mark ones you're interested in.</p>
  </div>`;

  const subject = `${allNew.length} New Bid Opportunit${allNew.length === 1 ? "y" : "ies"} for ${business.name} — ${newFederal.length} Federal, ${newLocal.length} KY/IN Local`;

  await sendEmail({ to: emailTo, subject, html });
  console.log(`[bid-sync] Alert email sent to ${emailTo}`);

  return result;
}

// ── Main sync function ────────────────────────────────────────────────────────

export async function runBidSync(
  businessId: number
): Promise<{ newFederal: number; newLocal: number; total: number }> {
  const [business] = await db
    .select({ id: businessesTable.id, type: businessesTable.type, name: businessesTable.name, state: businessesTable.state })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId))
    .limit(1);

  if (!business) {
    console.warn(`[bid-sync] Business ${businessId} not found, skipping`);
    return { newFederal: 0, newLocal: 0, total: 0 };
  }

  // Resolve capability-based search profile
  const profile = await resolveProfile(businessId, business.type);
  console.log(`[bid-sync] Starting sync for "${business.name}" — status: ${profile.profileStatus}, capabilities: ${profile.capabilities.map((c) => c.capabilityKey).join(", ")}`);

  // Respect profile status — 'off' skips entirely, 'watch' syncs silently (no email)
  if (profile.profileStatus === "off") {
    console.log(`[bid-sync] Business "${business.name}" profileStatus=off — skipping sync`);
    return { newFederal: 0, newLocal: 0, total: 0 };
  }

  // Record sync start
  await writeSyncHealth(businessId, { lastSyncAt: new Date() });

  // Rescore all existing bids now that capability profiles are loaded.
  // This ensures profile changes take effect immediately even if API fetches fail.
  await rescoreExistingBids(businessId, profile);

  // One-time backfill: attribute legacy NULL-business rows only to asphalt business
  if (business.type === "asphalt_sealing") {
    const backfillResult = await db.execute(
      sql`UPDATE bid_opportunities SET business_id = ${businessId} WHERE business_id IS NULL`
    );
    const backfillCount = (backfillResult as { rowCount?: number }).rowCount ?? 0;
    if (backfillCount > 0) {
      console.log(`[bid-sync] Backfilled ${backfillCount} legacy pavement bid(s) to "${business.name}"`);
    }
  }

  // Purge stale/irrelevant rows
  await purgeIrrelevantFederalBids(businessId, profile.naicsCodes);
  await purgeIrrelevantLocalBids(businessId, profile.localKeywords);
  await purgeNavLinkRows(businessId);
  await purgeOldUsaSpendingAwards(businessId);

  // Fetch from all sources in parallel
  const now = new Date();
  const [fedResult, localResult, awardsResult] = await Promise.allSettled([
    process.env["SAM_GOV_API_KEY"]
      ? fetchSamOpportunities({ keywords: profile.keywords, naicsCodes: profile.naicsCodes, pscCodes: profile.pscCodes })
      : Promise.resolve([] as SamOpportunity[]),
    fetchKyLocalBids(),
    fetchUsaSpendingAwards({ naicsCodes: profile.naicsCodes, state: business.state ?? "KY" }),
  ]);

  // Write per-source health
  const samOk    = fedResult.status === "fulfilled";
  const localOk  = localResult.status === "fulfilled";
  const awardsOk = awardsResult.status === "fulfilled";

  await writeSyncHealth(businessId, {
    samLastSuccessAt:    samOk    ? now : undefined,
    samLastError:        samOk    ? null : String((fedResult as PromiseRejectedResult).reason),
    localLastSuccessAt:  localOk  ? now : undefined,
    localLastError:      localOk  ? null : String((localResult as PromiseRejectedResult).reason),
    awardsLastSuccessAt: awardsOk ? now : undefined,
    awardsLastError:     awardsOk ? null : String((awardsResult as PromiseRejectedResult).reason),
  });

  const federal: OppWithSource[]  = samOk    ? fedResult.value    : [];
  const allLocal: OppWithSource[] = localOk  ? localResult.value  : [];
  const awards: UsaSpendingAward[] = awardsOk ? awardsResult.value : [];

  // Filter local results by local keywords
  const localKeywordsLower = profile.localKeywords.map((k) => k.toLowerCase());
  const local = allLocal.filter((opp) => {
    const text = `${opp.title} ${opp.description ?? ""}`.toLowerCase();
    return localKeywordsLower.some((kw) => text.includes(kw));
  });

  // Upsert
  const [newFederal, newLocal] = await Promise.all([
    upsertOpportunities(federal, "federal",      "SAM.gov",      businessId, profile),
    upsertOpportunities(local,   "state-local",  "KY/IN Local",  businessId, profile),
  ]);
  // write opportunityType on awards row (backfill for existing records via DB migration)
  await upsertUsaSpendingAwards(awards, businessId);

  // ── Subcontracting: SBA SUBNet ─────────────────────────────────────────────
  const subnetOpps = await fetchSubnetOpportunities({
    naicsCodes: profile.naicsCodes,
    stateCode:  "KY",
  }).catch((err) => { console.warn("[bid-sync] SUBNet fetch error:", (err as Error).message); return []; });

  if (subnetOpps.length > 0) {
    const subnetRows: OppWithSource[] = subnetOpps.map((s) => ({
      noticeId:         s.noticeId,
      title:            s.title,
      agency:           s.agency,
      naicsCode:        s.naicsCode,
      description:      s.description,
      postedDate:       s.postedDate,
      responseDeadline: s.responseDeadline,
      url:              s.url,
      source:           "subnet",
      sourceLabel:      "SBA SUBNet",
    }));
    await upsertOpportunities(subnetRows, "subnet", "SBA SUBNet", businessId, profile,
      { opportunityTypeOverride: "subcontracting" });
    console.log(`[bid-sync] SUBNet: ${subnetOpps.length} subcontracting opp(s) processed`);
  }

  // ── GSA Forecast: supplemental early-intel pipeline ───────────────────────
  const forecastOpps = await fetchGsaForecastOpportunities({
    naicsCodes: profile.naicsCodes,
    keywords:   profile.keywords,
  }).catch((err) => { console.warn("[bid-sync] GSA Forecast fetch error:", (err as Error).message); return []; });

  if (forecastOpps.length > 0) {
    const forecastRows: OppWithSource[] = forecastOpps.map((f) => ({
      noticeId:         f.noticeId,
      title:            f.title,
      agency:           f.agency,
      naicsCode:        f.naicsCode,
      description:      f.description ?? (f.estimatedValue ? `Estimated value: ${f.estimatedValue}` : null),
      postedDate:       null,
      responseDeadline: f.anticipatedSolicitationDate,
      url:              f.url,
      source:           "gsa-forecast",
      sourceLabel:      "GSA Forecast",
    }));
    await upsertOpportunities(forecastRows, "gsa-forecast", "GSA Forecast", businessId, profile,
      { opportunityTypeOverride: "forecast" });
    console.log(`[bid-sync] GSA Forecast: ${forecastOpps.length} forecast opp(s) processed`);
  }

  // Write overall success
  await writeSyncHealth(businessId, { lastSyncSuccessAt: now, lastSyncError: null });

  // Send email notification (skipped when profileStatus === 'watch')
  if (profile.profileStatus === "active") {
    return sendNewBidEmail(businessId, business, newFederal, newLocal);
  }

  const total = newFederal.length + newLocal.length;
  console.log(`[bid-sync] Watch-mode sync complete for "${business.name}": ${newFederal.length} federal, ${newLocal.length} local`);
  return { newFederal: newFederal.length, newLocal: newLocal.length, total };
}

// ── Run sync for all businesses ───────────────────────────────────────────────

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
