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
   * When true, the NAICS code returned by SAM.gov is outside the searched
   * capability group's NAICS set. The record is kept (not dropped) but
   * recommendation is capped at REVIEW so the user can verify relevance.
   */
  naicsMismatch?:   boolean;
  /** capabilityKey of the search group that first surfaced this opportunity */
  matchedCapability?: string;
}

function toIsoDate(d: Date): string {
  const [year, month, day] = d.toISOString().slice(0, 10).split("-");
  return `${month}/${day}/${year}`;
}

// ── Internal response shape ───────────────────────────────────────────────────

interface SamApiPage {
  records:      SamOpportunity[];
  totalRecords: number;
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
    console.error(`[sam-gov] Fetch error for ${label}:`, err);
    return { records: [], totalRecords: 0 };
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
    return { records: [], totalRecords: 0 };
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
      }));

    return { records, totalRecords: data.totalRecords ?? records.length };
  } catch (err) {
    console.error(`[sam-gov] Parse error for ${label}:`, err);
    return { records: [], totalRecords: 0 };
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
): Promise<SamOpportunity[]> {
  const all: SamOpportunity[] = [];

  for (let page = 0; page < SAM_MAX_PAGES; page++) {
    const offset = page * SAM_PAGE_SIZE;
    const { records, totalRecords } = await fetchPage(
      apiKey,
      { ...baseParams, limit: String(SAM_PAGE_SIZE), offset: String(offset) },
      page === 0 ? label : `${label} p${page + 1}`,
    );

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
 * `opportunities`   — deduplicated results across all groups and pages.
 *                     Partial results collected before a 429 are included.
 * `quotaExhausted`  — true whenever HTTP 429 was received, regardless of
 *                     whether the response body contained a reset timestamp.
 *                     Callers MUST check this flag to detect exhaustion;
 *                     do NOT rely solely on `quotaResetAt` being non-null.
 * `quotaResetAt`    — the `nextAccessTime` value from the SAM.gov 429 body,
 *                     or null when the response was missing / unparseable.
 *                     Only meaningful when `quotaExhausted` is true.
 */
export interface SamGroupedResult {
  opportunities:  SamOpportunity[];
  quotaExhausted: boolean;
  quotaResetAt:   string | null;
}

/**
 * Searches SAM.gov using capability-grouped search groups instead of the flat
 * all-pairs matrix.  Each group searches its own NAICS codes with its own
 * anchor keywords, then runs targeted specific-keyword queries (no NAICS) to
 * catch opportunities whose SAM.gov NAICS code doesn't match the expected code.
 *
 * Concurrency is limited to SAM_MAX_CONCURRENT simultaneous fetchAllPages calls.
 * A global noticeId Set deduplicates across all groups, queries, and pages.
 * Records with unexpected NAICS codes are flagged naicsMismatch=true (not dropped).
 *
 * When SAM.gov returns HTTP 429, remaining tasks are aborted, partial results
 * are returned, and `quotaResetAt` is set so the caller can surface the reset
 * time in the Sources panel instead of silently swallowing the quota hit.
 */
export async function fetchSamOpportunitiesGrouped(
  groups:  CapabilitySearchGroup[],
  opts?:   { lookbackDays?: number },
): Promise<SamGroupedResult> {
  const apiKey = getCredential("sam_gov", "SAM_GOV_API_KEY");
  if (!apiKey) {
    console.warn("[sam-gov] SAM_GOV_API_KEY not configured, skipping");
    return { opportunities: [], quotaExhausted: false, quotaResetAt: null };
  }

  const lookback   = opts?.lookbackDays ?? SAM_LOOKBACK_DAYS;
  const postedFrom = toIsoDate(new Date(Date.now() - lookback * 24 * 60 * 60 * 1000));
  const postedTo   = toIsoDate(new Date());
  const baseParams = { ptype: "o,p,k,r,s,g,i", postedFrom, postedTo };

  // Union of ALL NAICS codes across all groups — used for global mismatch detection
  const allGroupNaics = new Set<string>();
  for (const g of groups) g.naicsCodes.forEach((n) => allGroupNaics.add(n));

  // Build the full task list
  const tasks: Array<{
    params:        Record<string, string>;
    label:         string;
    capabilityKey: string;
    groupNaics:    Set<string>;
  }> = [];

  for (const group of groups) {
    const groupNaics = new Set(group.naicsCodes);

    // NAICS × anchorKeyword tasks
    for (const naics of group.naicsCodes) {
      for (const keyword of group.anchorKeywords) {
        tasks.push({
          params:        { ...baseParams, naics, keyword },
          label:         `[${group.capabilityKey}] NAICS ${naics} / "${keyword}"`,
          capabilityKey: group.capabilityKey,
          groupNaics,
        });
      }
    }

    // specificKeyword tasks (no NAICS filter — catches NAICS mismatches)
    for (const keyword of group.specificKeywords) {
      tasks.push({
        params:        { ...baseParams, keyword },
        label:         `[${group.capabilityKey}] kw "${keyword}"`,
        capabilityKey: group.capabilityKey,
        groupNaics,
      });
    }

    // PSC × anchorKeyword tasks
    for (const psc of group.pscCodes ?? []) {
      for (const keyword of group.anchorKeywords) {
        tasks.push({
          params:        { ...baseParams, psc, keyword },
          label:         `[${group.capabilityKey}] PSC ${psc} / "${keyword}"`,
          capabilityKey: group.capabilityKey,
          groupNaics,
        });
      }
    }
  }

  console.log(
    `[sam-gov] Grouped search: ${groups.length} group(s), ${tasks.length} task(s), ` +
    `concurrency=${SAM_MAX_CONCURRENT}, lookback=${lookback}d`
  );

  // Quota state — set by the first task that receives HTTP 429.
  // Tasks that haven't started yet check this flag and bail early;
  // tasks already in-flight finish normally so partial results are kept.
  let quotaExhausted = false;
  let quotaResetAt: string | null = null;

  // Global dedup map — first occurrence wins; noticeId → final SamOpportunity
  const seen = new Map<string, SamOpportunity>();
  const sem  = new Semaphore(SAM_MAX_CONCURRENT);

  await Promise.all(tasks.map(async (task) => {
    // Fast-path bail: skip tasks that haven't started when quota is already gone
    if (quotaExhausted) return;
    await sem.acquire();
    // Re-check after the semaphore wait — another task may have hit 429 while queued
    if (quotaExhausted) { sem.release(); return; }
    try {
      const opps = await fetchAllPages(apiKey, task.params, task.label);
      for (const opp of opps) {
        if (!seen.has(opp.noticeId)) {
          // Flag as mismatch when returned NAICS is outside both the group's expected
          // NAICS codes and the union of all groups' NAICS codes.
          const naicsMismatch = !!(
            opp.naicsCode &&
            !task.groupNaics.has(opp.naicsCode) &&
            !allGroupNaics.has(opp.naicsCode)
          );
          seen.set(opp.noticeId, {
            ...opp,
            matchedCapability: task.capabilityKey,
            naicsMismatch,
          });
        }
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

  const result     = Array.from(seen.values());
  const mismatched = result.filter((r) => r.naicsMismatch).length;
  if (mismatched > 0) {
    console.log(`[sam-gov] ${mismatched} record(s) flagged naicsMismatch (kept, recommendation capped at REVIEW)`);
  }
  console.log(
    `[sam-gov] Grouped search complete: ${result.length} unique opportunities from ${tasks.length} search tasks` +
    (quotaExhausted
      ? ` (quota exhausted${quotaResetAt ? `, resets ${quotaResetAt}` : ", reset time unavailable"})`
      : "")
  );

  return { opportunities: result, quotaExhausted, quotaResetAt };
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
