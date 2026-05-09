const SAM_API_BASE = "https://api.sam.gov/opportunities/v2/search";

const KEYWORDS = [
  "asphalt",
  "sealcoat",
  "sealcoating",
  "pavement",
  "parking lot",
  "parking-lot",
  "striping",
  "crack seal",
  "crack-seal",
  "paving",
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

export async function fetchSamOpportunities(): Promise<SamOpportunity[]> {
  const apiKey = process.env["SAM_GOV_API_KEY"];
  if (!apiKey) {
    console.warn("[sam-gov] SAM_GOV_API_KEY not configured, skipping");
    return [];
  }

  const results: SamOpportunity[] = [];

  const postedFrom = toIsoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const postedTo = toIsoDate(new Date());

  for (const keyword of KEYWORDS) {
    const params = new URLSearchParams({
      api_key: apiKey,
      ptype: "o,p,k,r,s,g,i",
      keyword,
      naics: "237310",
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
        console.warn(`[sam-gov] API returned ${res.status} for keyword "${keyword}": ${body.slice(0, 200)}`);
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
          naicsCode: item.naicsCode ?? "237310",
          description: item.description?.slice(0, 1000) ?? null,
          postedDate: item.postedDate?.slice(0, 10) ?? null,
          responseDeadline: item.responseDeadLine?.slice(0, 10) ?? null,
          url: item.uiLink ?? `https://sam.gov/opp/${item.noticeId}/view`,
        });
      }
    } catch (err) {
      console.error(`[sam-gov] Fetch error for keyword "${keyword}":`, err);
    }
  }

  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.noticeId)) return false;
    seen.add(r.noticeId);
    return true;
  });
}
