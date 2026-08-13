import { getCredential } from "./credentialManager.js";

const SAM_API_BASE = "https://api.sam.gov/opportunities/v2/search";

/**
 * Maximum records to fetch per individual query (NAICS×keyword or PSC×keyword).
 * SAM.gov supports up to 1,000 per page; 100 is a pragmatic page size that
 * avoids timeout risk while still being much larger than the old hard-coded 20.
 */
const SAM_PAGE_SIZE = 100;

/**
 * Safety cap on pages per query. 5 pages × 100 = 500 records max per
 * NAICS/keyword combination before we stop.  Prevents runaway fetches for
 * extremely broad keywords while still capturing 25× more data than before.
 */
const SAM_MAX_PAGES = 5;

/** Minimum delay between paginated calls to the same query (ms). */
const SAM_PAGE_DELAY_MS = 150;

// ── Legacy keyword exports (kept for backward compatibility) ──────────────────
export const ASPHALT_SAM_KEYWORDS = [
  "asphalt", "sealcoat", "sealcoating", "pavement",
  "parking lot", "parking-lot", "striping", "crack", "crack seal", "crack-seal", "paving",
];

export const GENERAL_CONTRACTING_SAM_KEYWORDS = [
  "general contractor", "general contracting", "commercial building", "renovation",
  "remodel", "building construction", "tenant improvement", "site work",
  "commercial construction", "new construction", "building renovation",
  "interior construction", "facility renovation", "construction services",
  "roofing", "flooring", "drywall", "painting contractor", "masonry", "finish carpentry",
];

export const ASPHALT_PSC_CODES = [
  "Y1QA", "Z1QA", "Y1NA", "Z1NA",
];

export const GENERAL_CONTRACTING_PSC_CODES = [
  "Y1AA","Y1BA","Y1CA","Y1DA","Y1EA","Y1JA","Y1KA","Y1NA",
  "Z1AA","Z1BA","Z1CA","Z1DA","Z1EA","Z1JA","Z1KA","Z1NA",
  "Z2AA","Z2BA","Z2CA","Z2DA",
];

// ── SAM.gov ptype → human-readable notice type ────────────────────────────────
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
  noticeType?:      string;   // derived from SAM ptype field; absent for non-SAM sources
  typeOfSetAside?:  string;   // raw SAM.gov set-aside code (e.g. "SBA", "SDVOSB", "WOSB", "none")
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
  try {
    const res = await fetch(`${SAM_API_BASE}?${qs.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const body = await res.text();
      console.warn(`[sam-gov] ${res.status} for ${label}: ${body.slice(0, 200)}`);
      return { records: [], totalRecords: 0 };
    }

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
    console.error(`[sam-gov] Fetch error for ${label}:`, err);
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
      // Polite inter-page delay
      await new Promise<void>((r) => setTimeout(r, SAM_PAGE_DELAY_MS));
    }
  }

  if (all.length > 0) {
    console.log(`[sam-gov] ${label}: fetched ${all.length} record(s) (limit ${SAM_MAX_PAGES * SAM_PAGE_SIZE})`);
  }

  return all;
}

export async function fetchSamOpportunities(opts: {
  keywords:   string[];
  naicsCodes: string[];
  pscCodes?:  string[];
}): Promise<SamOpportunity[]> {
  const apiKey = getCredential("sam_gov", "SAM_GOV_API_KEY");
  if (!apiKey) {
    console.warn("[sam-gov] SAM_GOV_API_KEY not configured, skipping");
    return [];
  }

  const postedFrom = toIsoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const postedTo   = toIsoDate(new Date());
  const baseParams = { ptype: "o,p,k,r,s,g,i", postedFrom, postedTo };

  const fetches: Promise<SamOpportunity[]>[] = [];

  for (const naics   of opts.naicsCodes)       {
    for (const keyword of opts.keywords)        {
      fetches.push(fetchAllPages(apiKey, { ...baseParams, naics, keyword }, `NAICS ${naics} / "${keyword}"`));
    }
  }
  for (const psc     of (opts.pscCodes ?? [])) {
    for (const keyword of opts.keywords)        {
      fetches.push(fetchAllPages(apiKey, { ...baseParams, psc, keyword }, `PSC ${psc} / "${keyword}"`));
    }
  }

  const pages = await Promise.allSettled(fetches);
  const all: SamOpportunity[] = [];
  for (const p of pages) {
    if (p.status === "fulfilled") all.push(...p.value);
  }

  // Global dedup by noticeId across all queries
  const seen   = new Set<string>();
  const deduped = all.filter((r) => {
    if (seen.has(r.noticeId)) return false;
    seen.add(r.noticeId);
    return true;
  });

  // Post-filter: discard records whose NAICS is present but not in the requested set.
  // This removes cross-NAICS leakage that sometimes comes back from keyword searches.
  const allowedNaics = new Set(opts.naicsCodes);
  const filtered = deduped.filter((r) => !r.naicsCode || allowedNaics.has(r.naicsCode));

  if (deduped.length !== filtered.length) {
    console.log(`[sam-gov] NAICS post-filter: ${deduped.length} → ${filtered.length} (dropped ${deduped.length - filtered.length})`);
  }

  console.log(`[sam-gov] Total unique opportunities after dedup+filter: ${filtered.length}`);
  return filtered;
}

// ── Exported for testing ──────────────────────────────────────────────────────
export { fetchPage, fetchAllPages, SAM_PAGE_SIZE, SAM_MAX_PAGES };
