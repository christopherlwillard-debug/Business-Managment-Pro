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
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export async function fetchSamOpportunities(opts: {
  keywords: string[];
  naicsCodes: string[];
}): Promise<SamOpportunity[]> {
  const apiKey = process.env["SAM_GOV_API_KEY"];
  if (!apiKey) {
    console.warn("[sam-gov] SAM_GOV_API_KEY not configured, skipping");
    return [];
  }

  const results: SamOpportunity[] = [];

  const postedFrom = toIsoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const postedTo = toIsoDate(new Date());

  for (const naics of opts.naicsCodes) {
    for (const keyword of opts.keywords) {
      const params = new URLSearchParams({
        api_key: apiKey,
        ptype: "o,p,k,r,s,g,i",
        keyword,
        naics,
        postedFrom,
        postedTo,
        limit: "20",
        offset: "0",
      });

      try {
        const url = `${SAM_API_BASE}?${params.toString()}`;
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          const body = await res.text();
          console.warn(`[sam-gov] API returned ${res.status} for keyword "${keyword}" naics "${naics}": ${body.slice(0, 200)}`);
          continue;
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

        const items = data.opportunitiesData ?? [];
        for (const item of items) {
          if (!item.noticeId || !item.title) continue;

          const agency =
            item.fullParentPathName ??
            item.organizationHierarchy?.[0]?.name ??
            null;

          results.push({
            noticeId: item.noticeId,
            title: item.title,
            agency: agency ?? null,
            naicsCode: item.naicsCode ?? naics,
            description: item.description?.slice(0, 1000) ?? null,
            postedDate: item.postedDate?.slice(0, 10) ?? null,
            responseDeadline: item.responseDeadLine?.slice(0, 10) ?? null,
            url: item.uiLink ?? `https://sam.gov/opp/${item.noticeId}/view`,
          });
        }
      } catch (err) {
        console.error(`[sam-gov] Fetch error for keyword "${keyword}" naics "${naics}":`, err);
      }
    }
  }

  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.noticeId)) return false;
    seen.add(r.noticeId);
    return true;
  });
}
