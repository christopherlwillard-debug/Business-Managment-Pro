import { getCredential } from "./credentialManager.js";

const SAM_API_BASE = "https://api.sam.gov/opportunities/v2/search";

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

async function fetchPage(
  apiKey: string,
  params: Record<string, string>,
  label: string
): Promise<SamOpportunity[]> {
  const qs = new URLSearchParams({ api_key: apiKey, ...params });
  try {
    const res = await fetch(`${SAM_API_BASE}?${qs.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const body = await res.text();
      console.warn(`[sam-gov] ${res.status} for ${label}: ${body.slice(0, 200)}`);
      return [];
    }

    const data = await res.json() as {
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
        type?:                  string;   // SAM.gov ptype value
        typeOfSetAside?:        string;   // set-aside code, e.g. "SBA", "SDVOSB", "WOSB", "none"
      }>;
    };

    return (data.opportunitiesData ?? [])
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
  } catch (err) {
    console.error(`[sam-gov] Fetch error for ${label}:`, err);
    return [];
  }
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
  const baseParams = { ptype: "o,p,k,r,s,g,i", postedFrom, postedTo, limit: "20", offset: "0" };

  const fetches: Promise<SamOpportunity[]>[] = [];

  for (const naics   of opts.naicsCodes)       {
    for (const keyword of opts.keywords)        {
      fetches.push(fetchPage(apiKey, { ...baseParams, naics, keyword }, `NAICS ${naics} / "${keyword}"`));
    }
  }
  for (const psc     of (opts.pscCodes ?? [])) {
    for (const keyword of opts.keywords)        {
      fetches.push(fetchPage(apiKey, { ...baseParams, psc, keyword }, `PSC ${psc} / "${keyword}"`));
    }
  }

  const pages = await Promise.allSettled(fetches);
  const all: SamOpportunity[] = [];
  for (const p of pages) {
    if (p.status === "fulfilled") all.push(...p.value);
  }

  const seen   = new Set<string>();
  const deduped = all.filter((r) => {
    if (seen.has(r.noticeId)) return false;
    seen.add(r.noticeId);
    return true;
  });

  const allowedNaics = new Set(opts.naicsCodes);
  const filtered = deduped.filter((r) => !r.naicsCode || allowedNaics.has(r.naicsCode));

  if (deduped.length !== filtered.length) {
    console.log(`[sam-gov] NAICS post-filter: ${deduped.length} → ${filtered.length} (dropped ${deduped.length - filtered.length})`);
  }

  return filtered;
}
