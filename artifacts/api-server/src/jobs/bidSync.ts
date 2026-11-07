import cron from "node-cron";
import { db } from "@workspace/db";
import {
  bidOpportunitiesTable,
  bidCapabilityProfilesTable,
  bidBusinessSettingsTable,
  settingsTable,
  businessesTable,
  bidSourceConnectionsTable,
} from "@workspace/db";
import { eq, sql, and, isNull, ne } from "drizzle-orm";
import {
  fetchSamOpportunitiesGrouped,
  SamOpportunity,
  SamGroupedResult,
  CapabilitySearchGroup,
  ASPHALT_PSC_CODES,
  GENERAL_CONTRACTING_PSC_CODES,
} from "../lib/samGov.js";
import { fetchKyLocalBids, NAV_PHRASE_DENYLIST, PAVEMENT_KEYWORDS, BROAD_BID_KEYWORDS, type LocalScrapeResult, type SiteHealthRecord } from "../lib/kyLocalBids.js";
import { fetchKyVssSolicitations } from "../lib/kyVss.js";
import { fetchUsaSpendingAwards, UsaSpendingAward, UsaSpendingFetchResult } from "../lib/usaSpending.js";
import { sendEmail, escapeHtml } from "../lib/sendEmail.js";
import {
  CapabilityDefinition,
  getCapabilitiesForBusinessType,
  getSearchGroupsForBusinessType,
  LEGACY_GC_CAPABILITY_KEYS,
  mergeCapabilitySearchParams,
  TITLE_HARD_SUPPRESS_TERMS,
} from "../lib/bidCapabilitySeeds.js";
import { fetchSubnetOpportunities, SubnetOpportunity } from "../lib/subnetSync.js";
import { fetchGsaForecastOpportunities, GsaForecastOpportunity } from "../lib/gsaForecast.js";
import { normalizeSetAsideType, setAsideScore } from "../lib/bidScoring.js";
import { computeRecommendation } from "../lib/bidRecommendation.js";
import { classifySourceHeuristic } from "../lib/officialSourceFinder.js";
import { loadEnabledSources, isEnabled, writeConnectionHealth, bootstrapAutomatedConnections } from "../lib/bidSourceConnection.js";
import { getCredential } from "../lib/credentialManager.js";
import { detectContractType } from "../lib/bidContractTypeDetector.js";
import { classifyOpportunityScope, isScopeCompatibleWithBusiness, assessDataCompleteness } from "../lib/bidScopeClassifier.js";
import { quarantineOrphanBidOpportunities } from "../lib/bid-ownership.js";
import { classifyBidGeography } from "../lib/bidGeography.js";
import { isActionableBid, normalizedBidIdentity, shouldPruneScopeMismatch, shouldRejectNewBid, shouldRestoreScoreRejectedBid } from "../lib/bidLifecycle.js";

// ── Resolved business search profile ─────────────────────────────────────────

interface ResolvedProfile {
  naicsCodes:       string[];
  keywords:         string[];
  pscCodes:         string[];
  localKeywords:    string[];
  negativeKeywords: string[];
  description:      string;       // AI context
  capabilities:     CapabilityDefinition[];
  /** Capability-grouped SAM.gov search configuration — replaces flat all-pairs matrix */
  searchGroups:     CapabilitySearchGroup[];
  profileStatus:    string;       // 'active' | 'watch' | 'off'
  isSdvosb:         boolean;
  isVosb:           boolean;
  isSmallBusiness:  boolean;
  label:            string;
  businessType:     string;       // e.g. "asphalt_sealing" | "general_contracting"
}

// ── Hard-suppression: title-level gate ───────────────────────────────────────
// Opportunities whose TITLE contains these are skipped at sync time entirely.
// isHardSuppressedByTitle uses the canonical list from bidCapabilitySeeds.ts (TITLE_HARD_SUPPRESS_TERMS).
// Edit the list there — this file no longer maintains a local copy.
function isHardSuppressedByTitle(title: string): boolean {
  const t = title.toLowerCase();
  return TITLE_HARD_SUPPRESS_TERMS.some((term) => t.includes(term));
}

/**
 * Return the future reset time from a stored SAM quota error.
 * Unknown/malformed reset values deliberately return null so a normal sync can
 * resume rather than being blocked indefinitely.
 */
export function parseSamQuotaResetAt(error: string | null | undefined): Date | null {
  if (!error || !error.toLowerCase().includes("quota exhausted")) return null;
  const match = error.match(/resets(?: at)?\s+(.+)$/i);
  if (!match) return null;
  const resetAt = new Date(match[1].trim());
  return Number.isNaN(resetAt.getTime()) || resetAt.getTime() <= Date.now() ? null : resetAt;
}

// ── Minimum score to store a new bid ─────────────────────────────────────────
// Any incoming bid that scores below this threshold is not inserted.
// This prevents zero- or near-zero-relevance opportunities (those that slipped
// past the title gate and NAICS sector gate) from cluttering the feed.
//
// Score anatomy:
//   Capability keyword match  0–40 pts  (5 pts/hit, max 20/capability, 40 total)
//   Geographic relevance      0–10 pts  (local KY = 10, any KY = 7, IN = 5)
//   Source bonus              0–10 pts  (state-local = 10)
//   Set-aside advantage       0–20 pts
//   Deadline urgency          0–20 pts
//
// At 20: a bid needs at least two keyword hits (10) + some geo/urgency, OR
// a single keyword hit + KY geo (7) + minor urgency — a real minimum bar.
// Existing rows already in the user's workflow (reviewing/bidding/etc.) are
// never affected by this gate; it only blocks NEW insertions.
const MIN_SCORE_TO_STORE = 20;

// NAICS sectors that are clearly unrelated to construction/maintenance/services.
// Keyword-fetched bids (naicsMismatch=true) in one of these sectors are hard-rejected
// rather than soft-capped — they cannot be construction contracts regardless of keyword overlap.
const NAICS_HARD_REJECT_SECTORS = new Set([
  "11","21",           // Agriculture, Mining
  "31","32","33",      // Manufacturing
  "42",                // Wholesale Trade
  "44","45",           // Retail Trade
  "48","49",           // Transportation
  "51",                // Information / IT
  "52","53",           // Finance, Real Estate
  "61","62",           // Education, Health Care
  "71",                // Arts / Entertainment
]);

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
    // Detect v1 GC capability profiles (old keys: waste_hauling, mh_finishing, etc.)
    // and auto-migrate to v2 skill buckets so existing businesses get the improved search.
    const hasLegacyKeys = businessType !== "asphalt_sealing" &&
      dbRows.some((r) => LEGACY_GC_CAPABILITY_KEYS.has(r.capabilityKey));
    if (hasLegacyKeys) {
      console.log(`[bid-sync] Migrating capability profiles for business ${businessId} from v1 to v2 skill buckets`);
      await db.delete(bidCapabilityProfilesTable).where(eq(bidCapabilityProfilesTable.businessId, businessId));
      // Fall through to re-seed with current built-in v2 definitions
    } else {
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
    searchGroups:     getSearchGroupsForBusinessType(businessType),
    profileStatus:    settings.profileStatus,
    isSdvosb:         settings.isSdvosb,
    isVosb:           settings.isVosb,
    isSmallBusiness:  settings.isSmallBusiness,
    label:            businessType === "asphalt_sealing" ? "Asphalt Sealing" : "General Contracting",
    businessType,
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
  opp: {
    title:            string;
    description:      string | null;
    responseDeadline: string | null;
    source:           string;
    agency?:          string | null;   // used for geographic scoring
    naicsMismatch?:   boolean;         // from fetchSamOpportunitiesGrouped
  },
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

  // NAICS mismatch: the record was found by keyword search but has an unexpected
  // NAICS code. Cap the capability score so these surface as REVIEW rather than
  // auto-BID — the user should verify the opportunity is actually relevant.
  if (opp.naicsMismatch) {
    capScore = Math.min(15, capScore);
  }

  // ── Geographic relevance (0–10 points) ────────────────────────────────────
  // Prioritize Owensboro / Daviess County / Western KY / Southern Indiana.
  // National opportunities still appear but score lower when no local signal.
  // Does NOT exclude non-local opportunities — geography is a ranking signal only.
  const geoText = `${opp.title} ${opp.description ?? ""} ${opp.agency ?? ""}`.toLowerCase();
  const LOCAL_AREAS = [
    "owensboro", "daviess county", "daviess co.", "henderson county", "henderson, ky",
    "mclean county", "ohio county, ky", "hancock county, ky", "breckinridge county",
    "western ky", "western kentucky", "tri-state ky",
  ];
  const KY_TERMS = ["kentucky", " ky ", " ky,", "(ky)", "-ky,", "ky-"];
  const IN_TERMS = [
    "southern indiana", "evansville", "newburgh, in", "boonville, in", "vincennes, in",
    "vanderburgh county", "warrick county", " indiana ", "(in)",
  ];
  let geoScore = 0;
  if (LOCAL_AREAS.some((t) => geoText.includes(t)))    geoScore = 10;
  else if (KY_TERMS.some((t) => geoText.includes(t))) geoScore = 7;
  else if (IN_TERMS.some((t) => geoText.includes(t))) geoScore = 5;

  // ── Source bonus (0–10 points) — local/regional contracts preferred ───────
  const sourceScore = opp.source === "state-local" ? 10 : 0;

  // ── Set-aside advantage (0–20 points) ─────────────────────────────────────
  const setAsidePts = setAsideScore(aiSetAsideType, settings);

  // ── Deadline urgency (0–20 points) ────────────────────────────────────────
  let urgencyScore = 0;
  if (opp.responseDeadline) {
    const daysOut = (new Date(opp.responseDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysOut < 0)         urgencyScore = 0;
    else if (daysOut <= 7)   urgencyScore = 20;
    else if (daysOut <= 14)  urgencyScore = 15;
    else if (daysOut <= 30)  urgencyScore = 10;
    else if (daysOut <= 60)  urgencyScore = 5;
  }

  const total = Math.min(100, capScore + geoScore + sourceScore + setAsidePts + urgencyScore);
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
    sql`DELETE FROM bid_opportunities WHERE source = 'state-local' AND business_id = ${businessId} AND stage IN ('new', 'score_rejected') AND NOT (${isRelevant})`
  );
  const count = (result as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) console.log(`[bid-sync] Purged ${count} irrelevant local bid(s) for business ${businessId}`);
  return count;
}

async function purgeNavLinkRows(businessId: number): Promise<number> {
  const likeConditions = NAV_PHRASE_DENYLIST.map((phrase) => sql`LOWER(title) LIKE ${"%" + phrase.toLowerCase() + "%"}`);
  const combined = likeConditions.reduce((acc, cond) => sql`${acc} OR ${cond}`);
  const result = await db.execute(
    sql`DELETE FROM bid_opportunities WHERE source = 'state-local' AND business_id = ${businessId} AND stage IN ('new', 'score_rejected') AND (${combined})`
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
    sql`DELETE FROM bid_opportunities WHERE source = 'federal' AND business_id = ${businessId} AND stage IN ('new', 'score_rejected') AND naics_code IS NOT NULL AND naics_code NOT IN (${sql.raw(allowedNaicsCodes.map((c) => `'${c}'`).join(", "))})`
  );
  const count = (result as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) console.log(`[bid-sync] Purged ${count} off-profile federal bid(s) for business ${businessId}`);
  return count;
}

// ── Upsert opportunities ──────────────────────────────────────────────────────

type OppWithSource = SamOpportunity & { source?: string; sourceLabel?: string };

function geographyForOpportunity(opp: OppWithSource, fallbackLabel: string) {
  return classifyBidGeography(
    opp.placeOfPerformance,
    [opp.sourceLabel ?? fallbackLabel, opp.agency ?? "", opp.title, opp.description ?? ""].join(" "),
  );
}

// ── Rescore all existing bids regardless of API fetch results ─────────────────
// Called once per sync after capabilities are loaded so that profile changes
// take effect immediately without needing a fresh API response for every bid.
export async function rescoreExistingBids(businessId: number, profile: ResolvedProfile): Promise<number> {
  const existing = await db
    .select({
      id:               bidOpportunitiesTable.id,
      title:            bidOpportunitiesTable.title,
      description:      bidOpportunitiesTable.description,
      responseDeadline: bidOpportunitiesTable.responseDeadline,
      source:           bidOpportunitiesTable.source,
      noticeType:       bidOpportunitiesTable.noticeType,
      setAsideType:     bidOpportunitiesTable.setAsideType,
      // Phase 7 — needed for scope pruning and completeness re-assessment
      stage:            bidOpportunitiesTable.stage,
      notes:             bidOpportunitiesTable.notes,
      naicsCode:        bidOpportunitiesTable.naicsCode,
      agency:           bidOpportunitiesTable.agency,
      url:              bidOpportunitiesTable.url,
      placeOfPerformance: bidOpportunitiesTable.placeOfPerformance,
        aiSummary:        bidOpportunitiesTable.aiSummary,
    })
    .from(bidOpportunitiesTable)
    .where(and(
      eq(bidOpportunitiesTable.businessId, businessId),
      ne(bidOpportunitiesTable.source, "usa-spending"),
    ));

  let updated = 0;
  let pruned = 0;

  for (const bid of existing) {
    // Classify scope and assess completeness for every existing row
    const scope = classifyOpportunityScope(bid.title, bid.naicsCode, bid.source);
    const completeness = assessDataCompleteness({
      responseDeadline: bid.responseDeadline,
      naicsCode:        bid.naicsCode,
      description:      bid.description,
      agency:           bid.agency,
      url:              bid.url,
    });
    const geography = classifyBidGeography(
      bid.placeOfPerformance,
      [bid.agency ?? "", bid.title, bid.description ?? ""].join(" "),
    );

    // Scope pruning: delete rows that don't belong to this business type.
    // Only auto-delete untouched new rows. A no_bid row is a user decision/history
    // record and must remain recoverable even if its capability scope later changes.
    if (!isScopeCompatibleWithBusiness(scope.primaryCategory, scope.confidence, profile.businessType)) {
      if (shouldPruneScopeMismatch(bid.stage)) {
        await db.delete(bidOpportunitiesTable).where(eq(bidOpportunitiesTable.id, bid.id));
        console.log(`[bid-sync] Pruned wrong-business bid (scope: ${scope.primaryCategory ?? "unknown"}): "${bid.title.slice(0, 60)}" from ${profile.businessType}`);
        pruned++;
        continue;
      }
      // Reviewed workflow stages and explicit No Bid/Lost decisions are retained; only update their scope fields.
    }

    const { opportunityScore, capabilityMatches } = scoreOpportunity(
      { title: bid.title, description: bid.description ?? null, responseDeadline: bid.responseDeadline, source: bid.source, agency: bid.agency },
      profile.capabilities,
      { isSdvosb: profile.isSdvosb, isVosb: profile.isVosb, isSmallBusiness: profile.isSmallBusiness },
      normalizeSetAsideType(bid.setAsideType),
    );
    const detected = detectContractType({ title: bid.title, description: bid.description ?? null, noticeType: bid.noticeType });

    // Auto-dismiss stale hard-suppressed bids: titles that match the suppress list
    // score 0 but may have been inserted before a suppress term was added.
    // Only touch 'new' rows — never auto-move a row the user has already reviewed.
    const autoNobd = opportunityScore === 0 && bid.stage === "new" && isHardSuppressedByTitle(bid.title);
    const autoRejectNew = !autoNobd && shouldRejectNewBid(bid.stage, opportunityScore, MIN_SCORE_TO_STORE);
    // A previously score-rejected row may become relevant after capability profiles
    // change. Restore it automatically once it clears the current score floor.
    const autoRestoreRejected = shouldRestoreScoreRejectedBid(bid.stage, opportunityScore, MIN_SCORE_TO_STORE);
    if (autoNobd) {
      console.log(`[bid-sync] Auto-dismissed hard-suppressed bid: "${bid.title.slice(0, 70)}"`);
    }

    await db.update(bidOpportunitiesTable)
      .set({
        opportunityScore,
        capabilityMatches,
        opportunityType:  deriveOpportunityType(bid.source, bid.noticeType),
        contractType:     detected.contractType,
        scopeSize:        detected.scopeSize,
        licenseFlags:     detected.licenseFlags,
        outOfScopeFlags:  detected.outOfScopeFlags,
        // Phase 7 — update scope classification and completeness on every rescore
        scopeCategory:    scope.primaryCategory,
        dataCompleteness: completeness,
          geography: geography.geography,
          placeOfPerformance: geography.placeOfPerformance,
          geographyReason: geography.geographyReason,
        // Suppress stale bids: move them out of 'new' so they don't clutter the feed
        ...(autoNobd ? { stage: "no_bid" as const, status: "dismissed" } : {}),
        ...(autoRejectNew ? {
          stage: "score_rejected" as const,
          status: "score_rejected",
          notes: bid.notes?.startsWith("Filtered:")
            ? `Filtered: score ${opportunityScore} below ${MIN_SCORE_TO_STORE} minimum`
            : bid.notes
              ? `${bid.notes}\n\nFiltered: score ${opportunityScore} below ${MIN_SCORE_TO_STORE} minimum`
              : `Filtered: score ${opportunityScore} below ${MIN_SCORE_TO_STORE} minimum`,
        } : {}),
        ...(autoRestoreRejected ? {
          stage: "new" as const,
          status: "new",
          ...(bid.notes?.startsWith("Filtered:")
            ? { notes: null }
            : bid.notes?.includes("\n\nFiltered:")
              ? { notes: bid.notes.split("\n\nFiltered:")[0] || null }
              : {}),
        } : {}),
        ...(completeness !== "complete" ? {
          recommendation: "review" as const,
          recommendationFactors: [],
        } : {}),
      })
      .where(eq(bidOpportunitiesTable.id, bid.id));
    updated++;
  }

  if (pruned > 0) console.log(`[bid-sync] Pruned ${pruned} wrong-business bid(s) from business ${businessId} (${profile.businessType})`);
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
): Promise<{ inserted: OppWithSource[]; scopeRejected: OppWithSource[] }> {
  const newOnes: OppWithSource[] = [];
  const scopeRejected: OppWithSource[] = [];
  const existingKeys = new Set(
    (await db
      .select({
        noticeId: bidOpportunitiesTable.noticeId,
        title: bidOpportunitiesTable.title,
        agency: bidOpportunitiesTable.agency,
        source: bidOpportunitiesTable.source,
      })
      .from(bidOpportunitiesTable)
      .where(eq(bidOpportunitiesTable.businessId, businessId)))
      .map((row) => normalizedBidIdentity(row)),
  );

  for (const opp of opportunities) {
    // Award intelligence has a dedicated ingestion path and must never enter
    // the actionable upsert pipeline, even if a future source is mislabelled.
    if (!isActionableBid({
      source: opp.source ?? defaultSource,
      opportunityType: deriveOpportunityType(opp.source ?? defaultSource, (opp as SamOpportunity).noticeType),
    })) {
      continue;
    }
    // Hard title gate: skip clearly incompatible opportunities before storing
    if (isHardSuppressedByTitle(opp.title)) {
      console.log(`[bid-sync] Hard-suppressed: "${opp.title.slice(0, 70)}"`);
      continue;
    }

    // ── Phase 7: Scope gate ────────────────────────────────────────────────────
    // Classify this opportunity's actual scope (from NAICS code or title keywords)
    // BEFORE assigning it to a business. This prevents paving/asphalt bids from
    // landing in Willard's Flooring and flooring bids from landing in Asphalt Sealing.
    const effectiveSource = opp.source ?? defaultSource;
    const duplicateKey = normalizedBidIdentity({ source: effectiveSource, noticeId: opp.noticeId, title: opp.title, agency: opp.agency });
    const hasSameNotice = existingKeys.has(duplicateKey);
    if (hasSameNotice && !await db
      .select({ id: bidOpportunitiesTable.id })
      .from(bidOpportunitiesTable)
      .where(and(
        eq(bidOpportunitiesTable.noticeId, opp.noticeId),
        eq(bidOpportunitiesTable.businessId, businessId),
        eq(bidOpportunitiesTable.source, effectiveSource),
      ))
      .then((rows) => rows.length > 0)) {
      console.log(`[bid-sync] Duplicate source record suppressed: "${opp.title.slice(0, 70)}"`);
      continue;
    }
    const scope = classifyOpportunityScope(opp.title, opp.naicsCode ?? null, effectiveSource);
    if (!isScopeCompatibleWithBusiness(scope.primaryCategory, scope.confidence, profile.businessType)) {
      scopeRejected.push(opp);
      continue;
    }

    // Assess data completeness — surfaced in the UI so incomplete records get a warning badge
    const completeness = assessDataCompleteness({
      responseDeadline: opp.responseDeadline,
      naicsCode:        opp.naicsCode,
      description:      opp.description,
      agency:           opp.agency,
      url:              opp.url,
    });
    const geography = geographyForOpportunity(opp, defaultSourceLabel);

    // Select aiSummary so we can incorporate it into the recommendation engine
    // for existing rows that have already been analysed.
    const existing = await db
      .select({ id: bidOpportunitiesTable.id, aiSummary: bidOpportunitiesTable.aiSummary })
      .from(bidOpportunitiesTable)
      .where(and(
        eq(bidOpportunitiesTable.noticeId, opp.noticeId),
        eq(bidOpportunitiesTable.businessId, businessId),
        eq(bidOpportunitiesTable.source, effectiveSource),
      ))
      .then((rows) => rows[0] ?? null);

    const settingsForRec = { isSdvosb: profile.isSdvosb, isVosb: profile.isVosb, isSmallBusiness: profile.isSmallBusiness };

    if (!existing) {
      const rawSetAside = (opp as SamOpportunity).typeOfSetAside ?? null;
      const derivedOppType = overrides?.opportunityTypeOverride
        ?? deriveOpportunityType(opp.source ?? defaultSource, (opp as SamOpportunity).noticeType ?? null);
      const { opportunityScore, capabilityMatches } = scoreOpportunity(
        { title: opp.title, description: opp.description, responseDeadline: opp.responseDeadline, source: opp.source ?? defaultSource, agency: opp.agency, naicsMismatch: (opp as SamOpportunity).naicsMismatch },
        profile.capabilities,
        settingsForRec,
        normalizeSetAsideType(rawSetAside),
      );

      // NAICS sector hard-gate: keyword-fetched bids (naicsMismatch=true) whose NAICS sector
      // is clearly unrelated to construction/maintenance/services are hard-rejected before
      // they can clutter the score_rejected feed. Manufacturing, agriculture, IT, healthcare etc.
      if ((opp as SamOpportunity).naicsMismatch && opp.naicsCode) {
        const sector = opp.naicsCode.slice(0, 2);
        if (NAICS_HARD_REJECT_SECTORS.has(sector)) {
          // Keep this machine-readable even though these rows are intentionally
          // not persisted: it gives operators an audit trail for false-positive
          // suppression without exposing unrelated opportunities as actionable bids.
          console.log(JSON.stringify({
            event: "bid_filter_rejected",
            filter: "naics_sector",
            reason: "naics_mismatch_in_unrelated_sector",
            businessId,
            noticeId: opp.noticeId,
            naicsCode: opp.naicsCode,
            source: opp.source ?? defaultSource,
            title: opp.title.slice(0, 120),
          }));
          continue;
        }
      }

      // Score floor — skip inserting new bids with no meaningful relevance signal.
      // Bids that fail this gate are stored as score_rejected so Willard can review
      // what was filtered and restore any false positives.
      if (opportunityScore < MIN_SCORE_TO_STORE) {
        console.log(`[bid-sync] Score-floor skip (score=${opportunityScore}): "${opp.title.slice(0, 70)}"`);
        const [rejectedRow] = await db.insert(bidOpportunitiesTable).values({
          businessId,
          noticeId:         opp.noticeId,
          title:            opp.title,
          agency:           opp.agency,
          naicsCode:        opp.naicsCode,
          description:      opp.description,
          postedDate:       opp.postedDate,
          responseDeadline: opp.responseDeadline,
          url:              opp.url,
          status:           "score_rejected",
          stage:            "score_rejected",
          source:           opp.source ?? defaultSource,
          sourceLabel:      opp.sourceLabel ?? defaultSourceLabel,
          noticeType:       (opp as SamOpportunity).noticeType ?? null,
          setAsideType:     rawSetAside,
          opportunityScore,
          capabilityMatches,
          opportunityType:  derivedOppType,
          notes:            `Filtered: score ${opportunityScore} below ${MIN_SCORE_TO_STORE} minimum`,
          geography:        geography.geography,
          placeOfPerformance: geography.placeOfPerformance,
          geographyReason:   geography.geographyReason,
        }).onConflictDoNothing().returning({ id: bidOpportunitiesTable.id });
        if (!rejectedRow) continue;
        continue;
      }

      // Compute recommendation — no AI summary yet for new rows, so this will be REVIEW
      // unless the opportunity is clearly ineligible (expired deadline + ineligible set-aside).
      const rec = computeRecommendation(
        { title: opp.title, opportunityScore, capabilityMatches, setAsideType: rawSetAside,
          responseDeadline: opp.responseDeadline, source: opp.source ?? defaultSource,
          naicsCode: opp.naicsCode, description: opp.description, opportunityType: derivedOppType },
        settingsForRec,
        null, // no AI summary yet
      );

      // Determine initial official-source status from URL heuristics — no HTTP calls.
      const srcStatus = classifySourceHeuristic({
        url: opp.url, source: opp.source ?? defaultSource, sourceLabel: opp.sourceLabel ?? defaultSourceLabel,
      });

      const detectedNew = detectContractType({
        title: opp.title, description: opp.description, aiSummary: null,
        noticeType: (opp as SamOpportunity).noticeType ?? null,
      });
      const [createdRow] = await db.insert(bidOpportunitiesTable).values({
        businessId,
        noticeId:              opp.noticeId,
        title:                 opp.title,
        agency:                opp.agency,
        naicsCode:             opp.naicsCode,
        description:           opp.description,
        postedDate:            opp.postedDate,
        responseDeadline:      opp.responseDeadline,
        url:                   opp.url,
        status:                overrides?.status ?? "new",
        stage:                 overrides?.stage ?? "new",
        source:                opp.source ?? defaultSource,
        sourceLabel:           opp.sourceLabel ?? defaultSourceLabel,
        noticeType:            (opp as SamOpportunity).noticeType ?? null,
        setAsideType:          rawSetAside,
        opportunityScore,
        capabilityMatches,
        opportunityType:       derivedOppType,
        recommendation:        completeness === "complete" ? rec.recommendation : "review",
        recommendationFactors: completeness === "complete"
          ? rec.factors as unknown as Record<string, unknown>[]
          : [],
        officialSourceStatus:  srcStatus,
        contractType:          detectedNew.contractType,
        scopeSize:             detectedNew.scopeSize,
        licenseFlags:          detectedNew.licenseFlags,
        outOfScopeFlags:       detectedNew.outOfScopeFlags,
        // Phase 7 — scope + completeness
        scopeCategory:         scope.primaryCategory,
        dataCompleteness:      completeness,
        geography:             geography.geography,
        placeOfPerformance:    geography.placeOfPerformance,
        geographyReason:       geography.geographyReason,
      }).onConflictDoNothing().returning({ id: bidOpportunitiesTable.id });
      if (createdRow) newOnes.push(opp);
      if (createdRow) existingKeys.add(duplicateKey);
    } else {
      // Re-score existing row so capability profile changes take effect immediately.
      // Pass cached AI summary so recommendation can incorporate prior analysis.
      const rawSetAside = (opp as SamOpportunity).typeOfSetAside ?? null;
      const derivedOppType = overrides?.opportunityTypeOverride
        ?? deriveOpportunityType(opp.source ?? defaultSource, (opp as SamOpportunity).noticeType ?? null);
      const { opportunityScore, capabilityMatches } = scoreOpportunity(
        { title: opp.title, description: opp.description, responseDeadline: opp.responseDeadline, source: opp.source ?? defaultSource, agency: opp.agency, naicsMismatch: (opp as SamOpportunity).naicsMismatch },
        profile.capabilities,
        settingsForRec,
        normalizeSetAsideType(rawSetAside),
      );

      const existingAiSummary = existing.aiSummary as Record<string, unknown> | null;
      const rec = computeRecommendation(
        { title: opp.title, opportunityScore, capabilityMatches, setAsideType: rawSetAside,
          responseDeadline: opp.responseDeadline, source: opp.source ?? defaultSource,
          naicsCode: opp.naicsCode, description: opp.description, opportunityType: derivedOppType },
        settingsForRec,
        existingAiSummary,
      );

      const detectedExisting = detectContractType({
        title: opp.title, description: opp.description,
        aiSummary: existingAiSummary,
        noticeType: (opp as SamOpportunity).noticeType ?? null,
      });
      await db.update(bidOpportunitiesTable)
        .set({
          opportunityScore,
          capabilityMatches,
          noticeType:            (opp as SamOpportunity).noticeType ?? null,
          setAsideType:          rawSetAside,
          opportunityType:       derivedOppType,
          recommendation:        completeness === "complete" ? rec.recommendation : "review",
          recommendationFactors: completeness === "complete"
            ? rec.factors as unknown as Record<string, unknown>[]
            : [],
          contractType:          detectedExisting.contractType,
          scopeSize:             detectedExisting.scopeSize,
          licenseFlags:          detectedExisting.licenseFlags,
          outOfScopeFlags:       detectedExisting.outOfScopeFlags,
          // Phase 7 — keep scope + completeness current on every sync
          scopeCategory:         scope.primaryCategory,
          dataCompleteness:      completeness,
          geography:             geography.geography,
          placeOfPerformance:    geography.placeOfPerformance,
          geographyReason:       geography.geographyReason,
        })
        .where(eq(bidOpportunitiesTable.id, existing.id));
    }
  }

  return { inserted: newOnes, scopeRejected };
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
        ...(() => {
          const geography = classifyBidGeography(award.placeOfPerformance, `${award.agency ?? ""} ${award.title}`);
          return { geography: geography.geography, placeOfPerformance: geography.placeOfPerformance, geographyReason: geography.geographyReason };
        })(),
      }).onConflictDoNothing();
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

  // Legacy rows without ownership must never be guessed into this business.
  // Quarantine is idempotent and preserves the original row for manual review.
  const quarantined = await quarantineOrphanBidOpportunities();
  if (quarantined > 0) {
    console.log(`[bid-sync] Quarantined ${quarantined} bid(s) with missing business ownership`);
  }

  // Purge stale/irrelevant rows
  // Note: purgeIrrelevantFederalBids intentionally removed — NAICS-mismatch records
  // (found via keyword searches with unexpected NAICS codes) are now kept and flagged
  // for user review rather than deleted. The scope classifier in rescoreExistingBids
  // handles true incompatibilities (e.g. asphalt in a GC context).
  await purgeIrrelevantLocalBids(businessId, profile.localKeywords);
  await purgeNavLinkRows(businessId);
  await purgeOldUsaSpendingAwards(businessId);

  // Ensure every automated source has a connection row before we read enable flags.
  // Uses ON CONFLICT DO NOTHING so existing user-configured rows are never touched.
  await bootstrapAutomatedConnections(businessId);

  // Read per-source enable flags — absent rows default to enabled (backward compat)
  const enabledSources = await loadEnabledSources(businessId);

  // Track whether each source was actually attempted.
  // SAM.gov additionally requires an API key — no key means no attempt (and no health record).
  // A known future quota reset suppresses only SAM.gov; the other sources still run.
  const samEnabled = isEnabled(enabledSources, "sam_gov");
  const samHasApiKey = !!getCredential("sam_gov", "SAM_GOV_API_KEY");
  const [samConnection] = samEnabled
    ? await db
      .select({ lastSyncError: bidSourceConnectionsTable.lastSyncError })
      .from(bidSourceConnectionsTable)
      .where(and(
        eq(bidSourceConnectionsTable.businessId, businessId),
        eq(bidSourceConnectionsTable.catalogSlug, "sam_gov"),
      ))
      .limit(1)
    : [];
  const storedSamQuotaResetAt = parseSamQuotaResetAt(samConnection?.lastSyncError);
  const samQuotaBlocked = samEnabled && samHasApiKey && storedSamQuotaResetAt != null;
  if (samQuotaBlocked) {
    console.log(`[bid-sync] SAM.gov quota exhausted for "${business.name}" — skipping until ${storedSamQuotaResetAt!.toISOString()}`);
  }
  const samActuallyRan      = samEnabled && samHasApiKey && !samQuotaBlocked && profile.searchGroups.length > 0;
  const kyLocalActuallyRan  = isEnabled(enabledSources, "ky_in_local");
  const awardsActuallyRan   = isEnabled(enabledSources, "usa_spending") && profile.naicsCodes.length > 0;

  // Fetch from all enabled sources in parallel
  const now = new Date();
  const [fedResult, localResult, awardsResult] = await Promise.allSettled([
    samActuallyRan
      ? fetchSamOpportunitiesGrouped(profile.searchGroups)
      : Promise.resolve({ opportunities: [], quotaExhausted: false, quotaResetAt: null, requestsAttempted: 0, requestsAccepted: 0, requestsFailed: 0, requestErrors: [] } as SamGroupedResult),
    kyLocalActuallyRan
      ? fetchKyLocalBids()
      : Promise.resolve([]),
    awardsActuallyRan
      ? fetchUsaSpendingAwards({ naicsCodes: profile.naicsCodes, state: business.state ?? "KY" })
      : Promise.resolve({ awards: [], errors: [], requestsAttempted: 0, requestsSucceeded: 0 } as UsaSpendingFetchResult),
  ]);

  // Unpack SAM.gov results before deciding health. Failed pages retain earlier
  // successful results, but the source must not be reported healthy.
  const samFetchFulfilled = fedResult.status === "fulfilled";
  const samResult = samFetchFulfilled ? (fedResult.value as SamGroupedResult) : null;
  const samQuotaExhausted = samResult?.quotaExhausted ?? false;
  const samQuotaResetAt = samResult?.quotaResetAt ?? null;
  const samReqAttempted = samResult?.requestsAttempted ?? 0;
  const samReqAccepted = samResult?.requestsAccepted ?? 0;
  const samReqFailed = samResult?.requestsFailed ?? 0;
  const samRequestErrors = samResult?.requestErrors ?? [];
  const samOk = samFetchFulfilled && samReqFailed === 0 && !samQuotaExhausted;
  const samHealthSuccess = samFetchFulfilled && samReqAccepted > 0;
  const samQuotaError = samQuotaExhausted
    ? (samQuotaResetAt
        ? `SAM.gov API quota exhausted — ${samReqAttempted} HTTP request(s) / ${samReqAccepted} accepted / ${samReqFailed} failed — resets ${samQuotaResetAt}`
        : `SAM.gov API quota exhausted — ${samReqAttempted} HTTP request(s) / ${samReqAccepted} accepted / ${samReqFailed} failed; reset time unavailable`)
    : null;
  const samHealthError = [
    ...samRequestErrors.slice(0, 5),
    samQuotaError,
    fedResult.status === "rejected" ? String(fedResult.reason) : null,
  ].filter((message): message is string => !!message).join("; ") || null;

  const localOk = localResult.status === "fulfilled";
  const localHealthForLegacy: SiteHealthRecord[] = localOk
    ? ((localResult.value as LocalScrapeResult)?.siteHealth ?? [])
    : [];
  const localFailedForLegacy = localHealthForLegacy.filter((site) => !site.success);
  const localHasSuccessForLegacy = localOk
    && (localHealthForLegacy.length === 0 || localHealthForLegacy.some((site) => site.success));
  const localLegacyError = !localOk
    ? String((localResult as PromiseRejectedResult).reason)
    : localFailedForLegacy.length > 0
      ? `${localFailedForLegacy.length} local procurement site(s) failed: ${localFailedForLegacy.map((site) => site.site).slice(0, 5).join(", ")}`
      : null;
  const awardsFetchFulfilled = awardsResult.status === "fulfilled";
  const awardsFetchResult = awardsFetchFulfilled ? (awardsResult.value as UsaSpendingFetchResult) : null;
  const awardsOk = awardsFetchFulfilled && (awardsFetchResult?.errors.length ?? 0) === 0;
  const awardsHealthSuccess = awardsFetchFulfilled
    && ((awardsFetchResult?.requestsSucceeded ?? 0) > 0 || (awardsFetchResult?.errors.length ?? 0) === 0);
  const awardsError = (awardsFetchResult?.errors ?? []).slice(0, 5).join("; ")
    || (awardsResult.status === "rejected" ? String(awardsResult.reason) : null);

  // Write per-source health to legacy bid_business_settings (backward compat)
  await writeSyncHealth(businessId, {
    samLastSuccessAt:    (samActuallyRan && samHealthSuccess) ? now : undefined,
    samLastError:        !samActuallyRan ? null : samOk ? null : samHealthError,
    localLastSuccessAt:  (kyLocalActuallyRan && localHasSuccessForLegacy) ? now : undefined,
    localLastError:      !kyLocalActuallyRan ? null : localLegacyError,
    awardsLastSuccessAt: (awardsActuallyRan && awardsHealthSuccess) ? now : undefined,
    awardsLastError:     !awardsActuallyRan ? null : awardsOk ? null : awardsError,
  });

  // Partial SAM.gov results are still used for ingestion, even when health is degraded.
  const federal: OppWithSource[] = samResult?.opportunities ?? [];
  const awards: UsaSpendingAward[] = awardsFetchResult?.awards ?? [];

  // Unpack the structured LocalScrapeResult from the KY/IN local scraper.
  // localResult.value is now a LocalScrapeResult (not a plain array).
  const localScrapeResult: LocalScrapeResult | null = localOk
    ? (localResult.value as LocalScrapeResult)
    : null;
  const allLocal: OppWithSource[]    = localScrapeResult?.opportunities ?? [];
  const localSiteHealth: SiteHealthRecord[] = localScrapeResult?.siteHealth ?? [];

  // Build per-site health JSON for storage (surfaced in Source Management panel)
  const localSiteHealthJson = localSiteHealth.length > 0
    ? JSON.stringify(localSiteHealth)
    : null;

  // Determine per-site partial failure warning for the connection health error field.
  // If some sites succeeded and some failed, status = active + warning in error field.
  // If ALL sites failed, status = error.
  const failedLocalSites = localSiteHealth.filter((s: SiteHealthRecord) => !s.success);
  const anyLocalSiteSucceeded = localSiteHealth.some((s: SiteHealthRecord) => s.success);
  const localHealthSuccess  = localOk && (failedLocalSites.length === 0 || anyLocalSiteSucceeded);
  const localHealthErrorMsg = !localOk
    ? String((localResult as PromiseRejectedResult).reason)
    : failedLocalSites.length > 0
      ? `${anyLocalSiteSucceeded ? "Partial" : "All"}: ${failedLocalSites.length} of ${localSiteHealth.length} site(s) unreachable: ${failedLocalSites.map((s: SiteHealthRecord) => s.site).slice(0, 8).join(", ")}`
      : null;

  // Write connection health only for sources that were actually attempted
  await Promise.allSettled([
    samActuallyRan ? writeConnectionHealth(
      businessId, "sam_gov",
      samHealthSuccess,
      samHealthError,
      federal.length
    ) : Promise.resolve(),
    kyLocalActuallyRan ? writeConnectionHealth(businessId, "ky_in_local", localHealthSuccess, localHealthErrorMsg, allLocal.length, localSiteHealthJson)                                                     : Promise.resolve(),
    awardsActuallyRan ? writeConnectionHealth(businessId, "usa_spending", awardsHealthSuccess, awardsError, awards.length) : Promise.resolve(),
  ]);

  // Filter local results by local keywords
  const localKeywordsLower = profile.localKeywords.map((k) => k.toLowerCase());
  const local = allLocal.filter((opp) => {
    const text = `${opp.title} ${opp.description ?? ""}`.toLowerCase();
    return localKeywordsLower.some((kw) => text.includes(kw));
  });

  // Upsert — returns { inserted, scopeRejected } for each source
  const [federalUpsert, localUpsert] = await Promise.all([
    upsertOpportunities(federal, "federal",     "SAM.gov",     businessId, profile),
    upsertOpportunities(local,   "state-local", "KY/IN Local", businessId, profile),
  ]);
  const newFederal = federalUpsert.inserted;
  const newLocal   = localUpsert.inserted;

  // ── Cross-business routing (Phase 7) ──────────────────────────────────────
  // When this business's sync finds opportunities whose scope belongs to a
  // DIFFERENT business type (e.g. paving bids discovered during a GC sync),
  // route them to the correct business so they're not lost.
  // The scope gate above already prevented them from being inserted here.
  // Only high/medium-confidence asphalt opportunities belong in the asphalt
  // business. "excluded" NAICS sectors must never be re-routed as construction bids.
  // Keep each source's original identity/label when routing so federal notices do
  // not get silently rewritten as state-local records.
  const asphaltFederalRejected = federalUpsert.scopeRejected.filter((opp) => {
    const scope = classifyOpportunityScope(opp.title, opp.naicsCode ?? null, opp.source ?? "federal");
    return scope.primaryCategory === "asphalt" && scope.confidence !== "low";
  });
  const asphaltLocalRejected = localUpsert.scopeRejected.filter((opp) => {
    const scope = classifyOpportunityScope(opp.title, opp.naicsCode ?? null, opp.source ?? "state-local");
    return scope.primaryCategory === "asphalt" && scope.confidence !== "low";
  });
  const asphaltScopeRejected = [...asphaltFederalRejected, ...asphaltLocalRejected];
  if (asphaltScopeRejected.length > 0 && business.type !== "asphalt_sealing") {
    try {
      const [asphaltBiz] = await db
        .select({ id: businessesTable.id, type: businessesTable.type, name: businessesTable.name })
        .from(businessesTable)
        .where(eq(businessesTable.type, "asphalt_sealing"))
        .limit(1);
      if (asphaltBiz) {
        const asphaltProfile = await resolveProfile(asphaltBiz.id, "asphalt_sealing");
        const routedFederal = asphaltFederalRejected.length > 0
          ? await upsertOpportunities(asphaltFederalRejected, "federal", "SAM.gov", asphaltBiz.id, asphaltProfile)
          : { inserted: [], scopeRejected: [] };
        const routedLocal = asphaltLocalRejected.length > 0
          ? await upsertOpportunities(asphaltLocalRejected, "state-local", "KY/IN Local", asphaltBiz.id, asphaltProfile)
          : { inserted: [], scopeRejected: [] };
        const routedCount = routedFederal.inserted.length + routedLocal.inserted.length;
        if (routedCount > 0) {
          console.log(`[bid-sync] Cross-routed ${routedCount} asphalt bid(s) to "${asphaltBiz.name}" (scope mismatch from "${business.name}")`);
        }
      }
    } catch (crossErr) {
      console.warn("[bid-sync] Asphalt cross-routing step failed (non-fatal):", crossErr);
    }
  }
  // write opportunityType on awards row (backfill for existing records via DB migration)
  await upsertUsaSpendingAwards(awards, businessId);

  // ── Subcontracting: SBA SUBNet ─────────────────────────────────────────────
  if (isEnabled(enabledSources, "sba_subnet")) {
    let subnetError: string | undefined;
    const subnetOpps = await fetchSubnetOpportunities({
      naicsCodes: profile.naicsCodes,
      stateCode:  "KY",
    }).catch((err) => { subnetError = (err as Error).message; console.warn("[bid-sync] SUBNet fetch error:", subnetError); return []; });

    await writeConnectionHealth(businessId, "sba_subnet", !subnetError, subnetError, subnetOpps.length);

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
        placeOfPerformance: s.placeOfPerformance,
      }));
      await upsertOpportunities(subnetRows, "subnet", "SBA SUBNet", businessId, profile,
        { opportunityTypeOverride: "subcontracting" });
      console.log(`[bid-sync] SUBNet: ${subnetOpps.length} subcontracting opp(s) processed`);
    }
  }

  // ── GSA Forecast: supplemental early-intel pipeline ───────────────────────
  if (isEnabled(enabledSources, "gsa_forecast")) {
    let forecastError: string | undefined;
    const forecastOpps = await fetchGsaForecastOpportunities({
      naicsCodes: profile.naicsCodes,
      keywords:   profile.keywords,
    }).catch((err) => { forecastError = (err as Error).message; console.warn("[bid-sync] GSA Forecast fetch error:", forecastError); return []; });

    await writeConnectionHealth(businessId, "gsa_forecast", !forecastError, forecastError, forecastOpps.length);

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
        placeOfPerformance: f.placeOfPerformance,
      }));
      await upsertOpportunities(forecastRows, "gsa-forecast", "GSA Forecast", businessId, profile,
        { opportunityTypeOverride: "forecast" });
      console.log(`[bid-sync] GSA Forecast: ${forecastOpps.length} forecast opp(s) processed`);
    }
  }

  // ── KY eMarketplace / VSS state procurement ───────────────────────────────
  if (isEnabled(enabledSources, "ky_vss")) {
    let vssError: string | undefined;
    const vssOpps = await fetchKyVssSolicitations(profile.localKeywords)
      .catch((err) => { vssError = (err as Error).message; console.warn("[bid-sync] KY VSS fetch failed:", vssError); return null; });

    const vssOpportunities = vssOpps ?? [];
    await writeConnectionHealth(businessId, "ky_vss", !vssError, vssError ?? null, vssOpportunities.length);

    if (vssOpportunities.length > 0) {
      const vssRows: OppWithSource[] = vssOpportunities.map((v) => ({
        noticeId:         v.noticeId,
        title:            v.title,
        agency:           v.agency,
        naicsCode:        v.naicsCode,
        description:      v.description,
        postedDate:       v.postedDate,
        responseDeadline: v.responseDeadline,
        url:              v.url,
        source:           "state-local",    // state/local for scoring bonus + purge logic
        sourceLabel:      "KY eMarketplace",
        placeOfPerformance: v.placeOfPerformance ?? null,
      }));
      await upsertOpportunities(vssRows, "state-local", "KY eMarketplace", businessId, profile);
      console.log(`[bid-sync] KY VSS: ${vssOpportunities.length} state solicitation(s) processed`);
    }
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
