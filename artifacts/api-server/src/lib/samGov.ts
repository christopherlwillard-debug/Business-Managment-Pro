const SAM_API_BASE = "https://api.sam.gov/opportunities/v2/search";

export const ASPHALT_SAM_KEYWORDS = [
  "asphalt",
  "sealcoat",
  "sealcoating",
  "pavement",
  "parking lot",
  "parking-lot",
  "striping",
  "crack",
  "crack seal",
  "crack-seal",
  "paving",
];

export const GENERAL_CONTRACTING_SAM_KEYWORDS = [
  "general contractor",
  "general contracting",
  "commercial building",
  "renovation",
  "remodel",
  "building construction",
  "tenant improvement",
  "site work",
  "commercial construction",
  "new construction",
  "building renovation",
  "interior construction",
  "facility renovation",
  "construction services",
  "roofing",
  "flooring",
  "drywall",
  "painting contractor",
  "masonry",
  "finish carpentry",
];

// PSC codes — Y = new construction, Z = repair/alteration/renovation
export const ASPHALT_PSC_CODES = [
  "Y1QA", // Construction of roads, streets, highways, bridges
  "Z1QA", // Repair/alteration of roads, streets, highways, bridges
  "Y1NA", // Construction of parking structures
  "Z1NA", // Repair of parking structures
];

export const GENERAL_CONTRACTING_PSC_CODES = [
  // New construction
  "Y1AA", // Office buildings
  "Y1BA", // Industrial buildings
  "Y1CA", // Hospitals & medical facilities
  "Y1DA", // Schools & educational facilities
  "Y1EA", // Residential buildings
  "Y1JA", // Recreation facilities
  "Y1KA", // Warehouses & storage
  "Y1NA", // Parking structures
  // Repair / renovation (most likely for a GC)
  "Z1AA", // Repair/renovation of office buildings
  "Z1BA", // Repair of industrial buildings
  "Z1CA", // Repair of hospitals & medical
  "Z1DA", // Repair of schools
  "Z1EA", // Repair of residential buildings
  "Z1JA", // Repair of recreation facilities
  "Z1KA", // Repair of warehouses
  "Z1NA", // Repair of parking structures
  // Alteration
  "Z2AA", // Alteration of office buildings
  "Z2BA", // Alteration of industrial buildings
  "Z2CA", // Alteration of hospitals
  "Z2DA", // Alteration of schools
];

export interface SamOpportunity {
  noticeId: string;
  title: string;
  agency: string | null;
  naicsCode: string | null;
  description: string | null;
  postedDate: string | null;
  responseDeadline: string | null;
  url: string;
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
        noticeId?: string;
        title?: string;
        fullParentPathName?: string;
        organizationHierarchy?: Array<{ name?: string }>;
        naicsCode?: string;
        description?: string;
        postedDate?: string;
        responseDeadLine?: string;
        uiLink?: string;
      }>;
    };

    return (data.opportunitiesData ?? [])
      .filter((item) => item.noticeId && item.title)
      .map((item) => ({
        noticeId: item.noticeId!,
        title: item.title!,
        agency: item.fullParentPathName ?? item.organizationHierarchy?.[0]?.name ?? null,
        naicsCode: item.naicsCode ?? null,
        description: item.description?.slice(0, 1000) ?? null,
        postedDate: item.postedDate?.slice(0, 10) ?? null,
        responseDeadline: item.responseDeadLine?.slice(0, 10) ?? null,
        url: item.uiLink ?? `https://sam.gov/opp/${item.noticeId}/view`,
      }));
  } catch (err) {
    console.error(`[sam-gov] Fetch error for ${label}:`, err);
    return [];
  }
}

export async function fetchSamOpportunities(opts: {
  keywords: string[];
  naicsCodes: string[];
  pscCodes?: string[];
}): Promise<SamOpportunity[]> {
  const apiKey = process.env["SAM_GOV_API_KEY"];
  if (!apiKey) {
    console.warn("[sam-gov] SAM_GOV_API_KEY not configured, skipping");
    return [];
  }

  const postedFrom = toIsoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const postedTo = toIsoDate(new Date());
  const baseParams = { ptype: "o,p,k,r,s,g,i", postedFrom, postedTo, limit: "20", offset: "0" };

  const fetches: Promise<SamOpportunity[]>[] = [];

  // Search by NAICS × keyword
  for (const naics of opts.naicsCodes) {
    for (const keyword of opts.keywords) {
      fetches.push(
        fetchPage(apiKey, { ...baseParams, naics, keyword }, `NAICS ${naics} / "${keyword}"`)
      );
    }
  }

  // Search by PSC × keyword (PSC alone often misses things; pairing with keyword narrows noise)
  for (const psc of (opts.pscCodes ?? [])) {
    for (const keyword of opts.keywords) {
      fetches.push(
        fetchPage(apiKey, { ...baseParams, psc, keyword }, `PSC ${psc} / "${keyword}"`)
      );
    }
    // Also fetch PSC with no keyword filter to catch anything missed
    fetches.push(
      fetchPage(apiKey, { ...baseParams, psc }, `PSC ${psc} (no keyword)`)
    );
  }

  const pages = await Promise.allSettled(fetches);
  const all: SamOpportunity[] = [];
  for (const p of pages) {
    if (p.status === "fulfilled") all.push(...p.value);
  }

  // Deduplicate by noticeId
  const seen = new Set<string>();
  return all.filter((r) => {
    if (seen.has(r.noticeId)) return false;
    seen.add(r.noticeId);
    return true;
  });
}
