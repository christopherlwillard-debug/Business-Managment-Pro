import { getCredential } from "./credentialManager.js";

const SAM_API_BASE = "https://api.sam.gov/opportunities/v2/search";

/**
 * Maximum records to fetch per individual query (NAICS×keyword or PSC×keyword).
 * SAM.gov supports up to 1,000 per page; 100 is a pragmatic page size.
 */
export const SAM_PAGE_SIZE = 100;

/**
 * Safety cap on pages per query. 5 pages × 100 = 500 records max per search task.
 * Prevents runaway fetches for extremely broad keywords.
 */
export const SAM_MAX_PAGES = 5;

/**
 * Default lookback window in days.
 * 90 days (was 30) to catch still-active solicitations posted earlier in the quarter.
 * SAM.gov opportunity close dates extend well beyond posting; 30 days silently missed them.
 */
export const SAM_LOOKBACK_DAYS = 90;

/**
 * Maximum concurrent fetchAllPages tasks running at once.
 * SAM.gov has rate limits; 8 concurrent is aggressive enough to be fast
 * while staying within documented limits.
 */
export const SAM_MAX_CONCURRENT = 8;

/** Minimum delay between paginated calls to the same query (ms). */
const SAM_PAGE_DELAY_MS = 150;

// ── Legacy keyword/PSC exports (kept for backward compatibility) ───────────────
export const ASPHALT_SAM_KEYWORDS = [
  "asphalt", "sealcoat", "sealcoating", "pavement",
  "parking lot", "parking-lot", "striping", "crack", "crack seal", "crack-seal", "paving",
];

export const GENERAL_CONTRACTING_SAM_KEYWORDS = [
  "general contractor", "general contracting", "renovation",
  "remodel", "building renovation", "facility renovation", "construction services",
  "roofing", "flooring", "drywall", "painting contractor", "finish carpentry",
];

export const ASPHALT_PSC_CODES = [
  "Y1QA", "Z1QA", "Y1NA", "Z1NA",
];

export const GENERAL_CONTRACTING_PSC_CODES = [
  "Y1AA","Y1BA","Y1CA","Y1DA","Y1EA","Y1JA","Y1KA","Y1NA",
  "Z1AA","Z1BA","Z1CA","Z1DA","Z1EA","Z1JA","Z1KA","Z1NA",
  "Z2AA","Z2BA","Z2CA","Z2DA",
];

// ── Capability search group ───────────────────────────────────────────────────

/**
 * A targeted search group for one capability. Replaces the flat N×M all-pairs
 * matrix with per-capability groups so each set of NAICS codes is only paired
 * with terms relevant to that capability.
 *
 * For each group, the search engine runs:
 *   (naicsCodes × anchorKeywords)  — NAICS-constrained, broad terms
 *   (specificKeywords)              — keyword-only, catches NAICS mismatches
 *   (pscCodes × anchorKeywords)    — PSC-constrained, broad terms
 *
 * This keeps query volume proportional to actual capability breadth rather
 * than exploding combinatorially when many capabilities share NAICS codes.
 */
export interface CapabilitySearchGroup {
  capabilityKey:        string;
  capabilityName:       string;
  /** NAICS codes paired with anchorKeywords in SAM.gov queries */
  naicsCodes:           string[];
  /** 2–5 broad search terms, each paired with every NAICS code above */
  anchorKeywords:       string[];
  /** Specific multi-word phrases searched without NAICS restriction —
   *  catches opportunities whose NAICS code differs from expected */
  specificKeywords:     string[];
  /** PSC codes paired with anchorKeywords */
  pscCodes?:            string[];
  /** Terms in opportunity text that suggest a license/certification may be needed.
   *  When found these generate a qualification warning rather than auto-excluding. */
  qualificationRequired?: string[];
}

// ── SAM.gov ptype → human-readable notice type ───────────────────────────────
const PTYPE_MAP: Record<string, string> = {
  o:  "solicitation",
  p:  "presolicitation",
  k:  "combined_synopsis",
  r:  "sources_sought",
  s:  "special_notice",
  g:  "sale_of_surplus",
  i:  "intent_to_bundle",
  a:  "award",
  u:  "justification",
  j:  "justification",
};

function resolveNoticeType(ptype?: string): string {
  if (!ptype) return "other";
  return PTYPE_MAP[ptype.toLowerCase()] ?? "other";
}

export interface SamOpportunity {
  noticeId:         string;
  title:            string;
  agency:           string | null;
  naicsCode:        string | null;
  description:      string | null;
  postedDate:       string | null;
  responseDeadline: string | null;
  url:              string;
  noticeType?:      string;
  typeOfSetAside?:  string;
  /**
   * When true, the NAICS code returned by SAM.gov is outside every capability
   * group's NAICS set. The record is kept (not dropped) but recommendation is
   * capped at REVIEW so the user can verify relevance.
   *
   * @deprecated — With sector-filtered NAICS queries, this flag is rarely set.
   * It can still be true for PSC-sourced results whose NAICS code falls outside
   * the capability groups (PSC tasks fetch records regardless of NAICS).
   * Kept for backward compatibility; do not introduce new code that depends on it.
   */
  naicsMismatch?:   boolean;
  /** capabilityKey of the search group that first surfaced this opportunity */
  matchedCapability?: string;
  placeOfPerformance?: string | null;
}

function toIsoDate(d: Date): string {
  const [year, month, day] = d.toISOString().slice(0, 10).split("-");
  return `${month}/${day}/${year}`;
}

// ── Internal response shape ───────────────────────────────────────────────────

interface SamApiPage {
  records:      SamOpportunity[];
  totalRecords: number;
  error?:       string;
}

async function fetchPage(
  apiKey: string,
  params: Record<string, string>,
  label: string
): Promise<SamApiPage> {
  const qs = new URLSearchParams({ api_key: apiKey, ...params });

  // ── Network layer — catches connection / timeout errors only ─────────────
  let res: Response;
  try {
    res = await fetch(`${SAM_API_BASE}?${qs.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sam-gov] Fetch error for ${label}:`, message);
    return { records: [], totalRecords: 0, error: `Network/timeout error for ${label}: ${message}` };
  }

  // ── 429: quota exhausted — throw so the grouped-search coordinator can ───
  // abort remaining tasks immediately and surface the reset time in the UI.
  if (res.status === 429) {
    let resetAt: string | null = null;
    try {
      const body = await res.json() as { nextAccessTime?: string };
      resetAt = body.nextAccessTime ?? null;
    } catch { /* ignore parse failure; resetAt stays null */ }
    console.error(
      `[sam-gov] 429 for ${label}:${resetAt ? ` quota resets ${resetAt}` : " quota exhausted (no reset time in response)"}`
    );
    throw new SamQuotaError(resetAt);
  }

  // ── Other non-ok status (4xx/5xx) — log and return empty ─────────────────
  if (!res.ok) {
    const body = await res.text();
    console.warn(`[sam-gov] ${res.status} for ${label}: ${body.slice(0, 200)}`);
    return { records: [], totalRecords: 0, error: `HTTP ${res.status} for ${label}: ${body.slice(0, 200)}` };
  }

  // ── Parse success response ────────────────────────────────────────────────
  try {
    const data = await res.json() as {
      totalRecords?: number;
      opportunitiesData?: Array<{
        noticeId?:              string;
        title?:                 string;
        fullParentPathName?:    string;
        organizationHierarchy?: Array<{ name?: string }>;
        naicsCode?:             string;
        description?:           string;
        postedDate?:            string;
        responseDeadLine?:      string;
        uiLink?:                string;
        type?:                  string;
        typeOfSetAside?:        string;
        placeOfPerformance?:    { city?: string; state?: string; stateCode?: string; country?: string; zip?: string } | string;
      }>;
    };

    const records = (data.opportunitiesData ?? [])
      .filter((item) => item.noticeId && item.title)
      .map((item) => ({
        noticeId:         item.noticeId!,
        title:            item.title!,
        agency:           item.fullParentPathName ?? item.organizationHierarchy?.[0]?.name ?? null,
        naicsCode:        item.naicsCode ?? null,
        description:      item.description?.slice(0, 1000) ?? null,
        postedDate:       item.postedDate?.slice(0, 10) ?? null,
        responseDeadline: item.responseDeadLine?.slice(0, 10) ?? null,
        url:              item.uiLink ?? `https://sam.gov/opp/${item.noticeId}/view`,
        noticeType:       resolveNoticeType(item.type),
        typeOfSetAside:   item.typeOfSetAside ?? undefined,
        placeOfPerformance: typeof item.placeOfPerformance === "string"
          ? item.placeOfPerformance
          : item.placeOfPerformance
            ? [item.placeOfPerformance.city, item.placeOfPerformance.stateCode ?? item.placeOfPerformance.state, item.placeOfPerformance.zip, item.placeOfPerformance.country]
              .filter(Boolean).join(", ") || null
            : null,
      }));

    return { records, totalRecords: data.totalRecords ?? records.length };
  } catch (err) {
    console.error(`[sam-gov] Parse error for ${label}:`, err);
    return { records: [], totalRecords: 0, error: `Parse error for ${label}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Fetch ALL pages for a single NAICS/keyword or PSC/keyword query.
 *
 * Paginates until one of these stops:
 *   1. The page returned fewer records than the page size (end of results).
 *   2. We have fetched every record according to `totalRecords`.
 *   3. We have hit SAM_MAX_PAGES (safety cap).
 *
 * A small inter-page delay avoids hammering the SAM.gov rate limit.
 */
async function fetchAllPages(
  apiKey:     string,
  baseParams: Record<string, string>,
  label:      string,
  /** Shared counter updated once per fetchPage HTTP call (including all pagination pages). */
  counters?:  { attempted: number; accepted: number; failed: number; errors: string[] },
): Promise<SamOpportunity[]> {
  const all: SamOpportunity[] = [];

  for (let page = 0; page < SAM_MAX_PAGES; page++) {
    const offset = page * SAM_PAGE_SIZE;
    // Increment before the call so 429-throws are still counted as attempted.
    if (counters) counters.attempted++;
    const pageResult = await fetchPage(
      apiKey,
      { ...baseParams, limit: String(SAM_PAGE_SIZE), offset: String(offset) },
      page === 0 ? label : `${label} p${page + 1}`,
    );
    if (pageResult.error) {
      if (counters) {
        counters.failed++;
        counters.errors.push(pageResult.error);
      }
      break; // keep prior successful pages, but do not report this request as healthy
    }
    if (counters) counters.accepted++;

    const { records, totalRecords } = pageResult;
    all.push(...records);

    const isLastPage = records.length < SAM_PAGE_SIZE;
    const fetchedAll = totalRecords > 0 && offset + records.length >= totalRecords;

    if (isLastPage || fetchedAll) break;

    if (page < SAM_MAX_PAGES - 1) {
      await new Promise<void>((r) => setTimeout(r, SAM_PAGE_DELAY_MS));
    }
  }

  if (all.length > 0) {
    console.log(`[sam-gov] ${label}: fetched ${all.length} record(s) (limit ${SAM_MAX_PAGES * SAM_PAGE_SIZE})`);
  }

  return all;
}

// ── Quota error — thrown by fetchPage on HTTP 429 ────────────────────────────
//
// SAM.gov returns a 429 with a JSON body like:
//   { "nextAccessTime": "2026-Aug-14 00:00:00+0000 UTC" }
// Throwing a typed error (rather than returning empty) lets the grouped-search
// coordinator abort all remaining tasks as soon as the first 429 is received,
// and surface the reset time in the UI via bid_source_connections.last_sync_error.

export class SamQuotaError extends Error {
  constructor(public readonly resetAt: string | null) {
    super(`SAM.gov API quota exhausted${resetAt ? ` — resets at ${resetAt}` : ""}`);
    this.name = "SamQuotaError";
  }
}

// ── Simple semaphore for concurrency control ──────────────────────────────────

class Semaphore {
  private slots: number;
  private waiters: Array<() => void> = [];

  constructor(slots: number) { this.slots = slots; }

  async acquire(): Promise<void> {
    if (this.slots > 0) { this.slots--; return; }
    await new Promise<void>((r) => this.waiters.push(r));
  }

  release(): void {
    if (this.waiters.length > 0) this.waiters.shift()!();
    else this.slots++;
  }
}

// ── Primary: capability-grouped search ───────────────────────────────────────

/**
 * Return type for fetchSamOpportunitiesGrouped.
 *
 * `opportunities`      — deduplicated results across all tasks and pages.
 *                        Partial results collected before a 429 are included.
 * `quotaExhausted`     — true whenever HTTP 429 was received, regardless of
 *                        whether the response body contained a reset timestamp.
 *                        Callers MUST check this flag to detect exhaustion;
 *                        do NOT rely solely on `quotaResetAt` being non-null.
 * `quotaResetAt`       — the `nextAccessTime` value from the SAM.gov 429 body,
 *                        or null when the response was missing / unparseable.
 *                        Only meaningful when `quotaExhausted` is true.
 * `requestsAttempted`  — number of fetchAllPages calls started (each task = 1).
 * `requestsAccepted`   — number of HTTP pages that returned valid 2xx JSON.
 * `requestsFailed`     — number of network/HTTP/parse failures (partial data is retained).
 * `requestErrors`      — sanitized failure descriptions for source-health reporting.
 */
export interface SamGroupedResult {
  opportunities:     SamOpportunity[];
  quotaExhausted:    boolean;
  quotaResetAt:      string | null;
  requestsAttempted: number;
  requestsAccepted:  number;
  requestsFailed:    number;
  requestErrors:     string[];
}

// ── Catch-all keyword tasks ────────────────────────────────────────────────────
//
// @deprecated — no longer used in fetchSamOpportunitiesGrouped.
// In-sector NAICS queries (sectors 23/56/81) already fetch all records under
// those codes without keyword restriction.  Out-of-sector NAICS codes are now
// keyword-paired at the NAICS level.  Unrestricted keyword searches across all
// sectors were the primary source of engine-block, gym-equipment, and
// agriculture solicitations in sync results.
//
// Exported for backward compatibility; external callers or tests that import
// this constant will still compile, but the grouped search no longer uses it.
export const CATCH_ALL_KEYWORDS = [
  "general construction services",
  "facility renovation contractor",
  "building maintenance contract",
  "construction and alteration",
  "repair and maintenance services",
] as const;

// ── Construction-sector NAICS allowlist ───────────────────────────────────────
//
// Two-character NAICS sector prefixes that are safe for unrestricted NAICS
// queries in fetchSamOpportunitiesGrouped.
//
//   Sector 23  = Construction
//   Sector 56  = Administrative and Support / Waste Management / Remediation
//   Sector 81  = Other Services (incl. Equipment Repair — 811xxx)
//
// NAICS codes outside these sectors (e.g. 332xxx Manufacturing, 484xxx Freight)
// are paired with a capability-specific anchor keyword so that only relevant
// service contracts are fetched, rather than broad manufacturing-supply or
// freight-carrier solicitations.
export const CONSTRUCTION_NAICS_SECTORS = new Set(["23", "56", "81"]);

/** Returns true if `naicsCode` belongs to a construction/maintenance sector. */
function isInConstructionSector(naicsCode: string): boolean {
  for (const prefix of CONSTRUCTION_NAICS_SECTORS) {
    if (naicsCode.startsWith(prefix)) return true;
  }
  return false;
}

// ── Local capability assignment ───────────────────────────────────────────────
//
// After the broad-NAICS fetch collects raw results, we determine which
// capability group each opportunity belongs to locally — without relying on
// which API query happened to return it.
//
// Priority:
//   1. Exactly one group's NAICS set contains the opportunity's NAICS → use it.
//   2. Multiple groups share the NAICS (e.g. 238990 appears in 4 groups) →
//      score by keyword hits in title+description and pick highest scorer.
//   3. No NAICS match → score all groups by keyword hits in title+description.
//   4. No keyword hits anywhere → fall back to first group (best-effort).

function assignCapabilityLocally(
  opp:    SamOpportunity,
  groups: CapabilitySearchGroup[],
): string | undefined {
  if (groups.length === 0) return undefined;

  const text = `${(opp.title ?? "").toLowerCase()} ${(opp.description ?? "").toLowerCase()}`;

  // Step 1: groups whose NAICS set contains this opportunity's NAICS code
  const naicsMatches = opp.naicsCode
    ? groups.filter(g => g.naicsCodes.includes(opp.naicsCode!))
    : [];

  // Step 2: unambiguous single match — no scoring needed
  if (naicsMatches.length === 1) return naicsMatches[0].capabilityKey;

  // Step 3: score candidates by keyword hits in title+description
  const candidates = naicsMatches.length > 0 ? naicsMatches : groups;
  let bestKey = candidates[0].capabilityKey;
  let bestScore = -1;

  for (const g of candidates) {
    let score = 0;
    for (const kw of [...g.anchorKeywords, ...g.specificKeywords]) {
      if (text.includes(kw.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestKey   = g.capabilityKey;
    }
  }

  return bestKey;
}

/**
 * Searches SAM.gov using a broad-NAICS pull instead of the old per-capability
 * NAICS×keyword matrix.
 *
 * Architecture (reduces ~390 tasks → ~50 tasks):
 *   • One task per unique NAICS code across ALL capability groups (no keyword pairing).
 *   • One task per unique PSC code across ALL capability groups (no keyword pairing).
 *   • A small set of catch-all keyword-only tasks (CATCH_ALL_KEYWORDS) to surface
 *     opportunities whose agency miscategorized the NAICS code.
 *
 * After fetching, `matchedCapability` and `naicsMismatch` are assigned locally
 * via `assignCapabilityLocally` — capability routing no longer depends on which
 * API query happened to return the record.
 *
 * Concurrency is limited to SAM_MAX_CONCURRENT simultaneous fetchAllPages calls.
 * A global noticeId Map deduplicates across all tasks and pages.
 * Records with unexpected NAICS codes are flagged naicsMismatch=true (not dropped).
 *
 * When SAM.gov returns HTTP 429, remaining tasks are aborted, partial results
 * are returned, and `quotaResetAt` is set so the caller can surface the reset
 * time in the Sources panel.
 */
export async function fetchSamOpportunitiesGrouped(
  groups:  CapabilitySearchGroup[],
  opts?:   { lookbackDays?: number },
): Promise<SamGroupedResult> {
  const apiKey = getCredential("sam_gov", "SAM_GOV_API_KEY");
  if (!apiKey) {
    console.warn("[sam-gov] SAM_GOV_API_KEY not configured, skipping");
    return { opportunities: [], quotaExhausted: false, quotaResetAt: null, requestsAttempted: 0, requestsAccepted: 0, requestsFailed: 0, requestErrors: [] };
  }

  const lookback   = opts?.lookbackDays ?? SAM_LOOKBACK_DAYS;
  const postedFrom = toIsoDate(new Date(Date.now() - lookback * 24 * 60 * 60 * 1000));
  const postedTo   = toIsoDate(new Date());
  const baseParams = { ptype: "o,p,k,r,s,g,i", postedFrom, postedTo };

  // Union of all NAICS and PSC codes across every capability group.
  // Deduplication here is the primary source of task-count reduction:
  // NAICS 238990 appears in 4 groups but generates only 1 search task.
  const allGroupNaics = new Set<string>();
  const allGroupPsc   = new Set<string>();
  for (const g of groups) {
    g.naicsCodes.forEach(n => allGroupNaics.add(n));
    (g.pscCodes ?? []).forEach(p => allGroupPsc.add(p));
  }

  // Build a map from each NAICS code → first anchor keyword from its capability group.
  // Used to restrict out-of-sector NAICS queries so only relevant service contracts
  // are fetched (not broad manufacturing-supply or freight-carrier solicitations).
  const naicsFirstAnchor = new Map<string, string>();
  for (const g of groups) {
    const firstAnchor = g.anchorKeywords[0];
    if (!firstAnchor) continue;
    for (const naics of g.naicsCodes) {
      if (!naicsFirstAnchor.has(naics)) naicsFirstAnchor.set(naics, firstAnchor);
    }
  }

  // Build sector-filtered task list: NAICS (in-sector or keyword-paired) + PSC.
  // Catch-all keyword tasks are intentionally omitted — in-sector NAICS queries
  // already fetch all records posted under those codes, and out-of-sector NAICS
  // queries are now keyword-restricted.  Unrestricted keyword-only searches were
  // the primary source of manufacturing and freight noise in sync results.
  type SearchTask = { params: Record<string, string>; label: string };
  const tasks: SearchTask[] = [];

  // One task per unique NAICS — strategy depends on sector:
  //   Construction/maintenance sectors (23 / 56 / 81): unrestricted broad pull.
  //     Agencies accurately classify this work, so fetching all records is safe.
  //   Other sectors (e.g. 33 Manufacturing, 48 Transportation): paired with the
  //     group's first anchor keyword to prevent manufacturing-supply contracts.
  for (const naics of allGroupNaics) {
    if (isInConstructionSector(naics)) {
      tasks.push({ params: { ...baseParams, naics }, label: `NAICS ${naics}` });
    } else {
      const keyword = naicsFirstAnchor.get(naics);
      if (keyword) {
        tasks.push({
          params: { ...baseParams, naics, keyword },
          label: `NAICS ${naics} / "${keyword}"`,
        });
      } else {
        console.warn(`[sam-gov] No anchor keyword for out-of-sector NAICS ${naics} — querying unrestricted`);
        tasks.push({ params: { ...baseParams, naics }, label: `NAICS ${naics} (unrestricted)` });
      }
    }
  }

  // One task per unique PSC (no keyword) — catches PSC-coded opportunities
  for (const psc of allGroupPsc) {
    tasks.push({ params: { ...baseParams, psc }, label: `PSC ${psc}` });
  }

  const inSectorCount  = [...allGroupNaics].filter(isInConstructionSector).length;
  const outSectorCount = allGroupNaics.size - inSectorCount;
  console.log(
    `[sam-gov] Grouped search: ${tasks.length} task(s) ` +
    `(${inSectorCount} NAICS unrestricted + ${outSectorCount} NAICS keyword-paired + ${allGroupPsc.size} PSC), ` +
    `concurrency=${SAM_MAX_CONCURRENT}, lookback=${lookback}d`
  );

  // Quota state — set by the first task that receives HTTP 429.
  // Tasks that haven't started yet check this flag and bail early;
  // tasks already in-flight finish normally so partial results are kept.
  let quotaExhausted   = false;
  let quotaResetAt: string | null = null;

  // HTTP-call counters — updated inside fetchAllPages once per fetchPage call,
  // so pagination is correctly accounted for (not just task count).
  const httpCounters = { attempted: 0, accepted: 0, failed: 0, errors: [] as string[] };

  // Global dedup map — first occurrence wins; noticeId → raw SamOpportunity.
  // matchedCapability and naicsMismatch are assigned in the post-fetch pass.
  const seen = new Map<string, SamOpportunity>();
  const sem  = new Semaphore(SAM_MAX_CONCURRENT);

  await Promise.all(tasks.map(async (task) => {
    // Fast-path bail: skip tasks that haven't started when quota is already gone
    if (quotaExhausted) return;
    await sem.acquire();
    // Re-check after the semaphore wait — another task may have hit 429 while queued
    if (quotaExhausted) { sem.release(); return; }
    try {
      const opps = await fetchAllPages(apiKey, task.params, task.label, httpCounters);
      for (const opp of opps) {
        if (!seen.has(opp.noticeId)) seen.set(opp.noticeId, opp);
      }
    } catch (err) {
      if (err instanceof SamQuotaError) {
        // Mark quota exhausted so all waiting tasks bail without hitting the API.
        // Do NOT rethrow — whatever was collected before the 429 is still returned.
        quotaExhausted = true;
        quotaResetAt   = err.resetAt;
        console.warn(
          `[sam-gov] Quota exhausted — aborting remaining tasks` +
          (err.resetAt ? `, resets ${err.resetAt}` : "")
        );
      } else {
        throw err;
      }
    } finally {
      sem.release();
    }
  }));

  // Post-fetch pass: assign matchedCapability and naicsMismatch locally.
  // This replaces the old per-task capabilityKey attribution.
  const result: SamOpportunity[] = [];
  for (const opp of seen.values()) {
    result.push({
      ...opp,
      matchedCapability: assignCapabilityLocally(opp, groups),
      naicsMismatch:     !!(opp.naicsCode && !allGroupNaics.has(opp.naicsCode)),
    });
  }

  const mismatched = result.filter((r) => r.naicsMismatch).length;
  if (mismatched > 0) {
    console.log(`[sam-gov] ${mismatched} record(s) flagged naicsMismatch (kept, recommendation capped at REVIEW)`);
  }
  console.log(
    `[sam-gov] Grouped search complete: ${result.length} unique opportunities from ${tasks.length} search tasks` +
    `, ${httpCounters.attempted} HTTP request(s) / ${httpCounters.accepted} accepted` +
    (quotaExhausted
      ? ` (quota exhausted${quotaResetAt ? `, resets ${quotaResetAt}` : ", reset time unavailable"})`
      : "")
  );

  return {
    opportunities:     result,
    quotaExhausted,
    quotaResetAt,
    requestsAttempted: httpCounters.attempted,
    requestsAccepted:  httpCounters.accepted,
    requestsFailed:    httpCounters.failed,
    requestErrors:     httpCounters.errors,
  };
}

// ── Backward-compat flat search ───────────────────────────────────────────────

/**
 * Original flat search — still used by legacy callers and unit tests.
 * Updated to:
 *   - Use 90-day lookback (was 30)
 *   - Concurrency-limit via Semaphore (was unlimited parallel)
 *   - Flag NAICS mismatches instead of dropping them (was hard-filter)
 */
export async function fetchSamOpportunities(opts: {
  keywords:    string[];
  naicsCodes:  string[];
  pscCodes?:   string[];
  lookbackDays?: number;
}): Promise<SamOpportunity[]> {
  const apiKey = getCredential("sam_gov", "SAM_GOV_API_KEY");
  if (!apiKey) {
    console.warn("[sam-gov] SAM_GOV_API_KEY not configured, skipping");
    return [];
  }

  const lookback   = opts.lookbackDays ?? SAM_LOOKBACK_DAYS;
  const postedFrom = toIsoDate(new Date(Date.now() - lookback * 24 * 60 * 60 * 1000));
  const postedTo   = toIsoDate(new Date());
  const baseParams = { ptype: "o,p,k,r,s,g,i", postedFrom, postedTo };

  const sem    = new Semaphore(SAM_MAX_CONCURRENT);
  const fetches: Promise<SamOpportunity[]>[] = [];

  for (const naics   of opts.naicsCodes) {
    for (const keyword of opts.keywords) {
      fetches.push(
        sem.acquire().then(() =>
          fetchAllPages(apiKey, { ...baseParams, naics, keyword }, `NAICS ${naics} / "${keyword}"`).finally(() => sem.release())
        )
      );
    }
  }
  for (const psc of opts.pscCodes ?? []) {
    for (const keyword of opts.keywords) {
      fetches.push(
        sem.acquire().then(() =>
          fetchAllPages(apiKey, { ...baseParams, psc, keyword }, `PSC ${psc} / "${keyword}"`).finally(() => sem.release())
        )
      );
    }
  }

  const pages = await Promise.allSettled(fetches);
  const all: SamOpportunity[] = [];
  for (const p of pages) {
    if (p.status === "fulfilled") all.push(...p.value);
  }

  // Global dedup by noticeId
  const seen    = new Set<string>();
  const deduped = all.filter((r) => {
    if (seen.has(r.noticeId)) return false;
    seen.add(r.noticeId);
    return true;
  });

  // Soft NAICS mismatch: flag instead of drop
  // Previously these were hard-dropped; now they surface for user review.
  const allowedNaics = new Set(opts.naicsCodes);
  let mismatched = 0;
  const annotated = deduped.map((r) => {
    if (r.naicsCode && !allowedNaics.has(r.naicsCode)) {
      mismatched++;
      return { ...r, naicsMismatch: true as const };
    }
    return r;
  });

  if (mismatched > 0) {
    console.log(`[sam-gov] NAICS mismatch: ${mismatched} record(s) flagged (not dropped)`);
  }
  console.log(`[sam-gov] Total unique opportunities: ${annotated.length}`);
  return annotated;
}

// ── Exported for testing ──────────────────────────────────────────────────────
export { fetchPage, fetchAllPages };
