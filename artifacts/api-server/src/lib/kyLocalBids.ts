import { SamOpportunity } from "./samGov.js";

const FETCH_TIMEOUT_MS = 15000;

const PAVEMENT_KEYWORDS = [
  "asphalt", "sealcoat", "sealcoating", "pavement", "parking lot",
  "parking-lot", "striping", "crack seal", "paving", "road", "milling",
  "resurfacing", "overlay",
];

function containsKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return PAVEMENT_KEYWORDS.some((kw) => lower.includes(kw));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function safeFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; BuildProBot/1.0; +https://buildpro.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[ky-local] ${url} returned ${res.status}`);
      return null;
    }
    return res.text();
  } catch (err) {
    console.warn(`[ky-local] Fetch failed for ${url}:`, (err as Error).message);
    return null;
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8211;/g, "–")
    .replace(/&#038;/g, "&")
    .replace(/&hellip;/g, "…");
}

function extractLinks(html: string, baseUrl: string): Array<{ text: string; href: string }> {
  const results: Array<{ text: string; href: string }> = [];
  const linkRe = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const href = match[1].trim();
    const text = decodeEntities(stripTags(match[2])).trim();
    if (!text || text.length < 4) continue;
    const fullHref = href.startsWith("http") ? href : new URL(href, baseUrl).href;
    results.push({ text, href: fullHref });
  }
  return results;
}

function parseDateFromText(text: string): string | null {
  const patterns = [
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    /(\w+ \d{1,2},?\s*\d{4})/,
    /(\d{4}-\d{2}-\d{2})/,
  ];
  for (const pat of patterns) {
    const m = pat.exec(text);
    if (m) {
      try {
        const d = new Date(m[0]);
        if (!isNaN(d.getTime())) {
          return d.toISOString().slice(0, 10);
        }
      } catch {}
    }
  }
  return null;
}

async function scrapeHancockCounty(): Promise<SamOpportunity[]> {
  const url = "https://hancockky.us/resources/bids/";
  const html = await safeFetch(url);
  if (!html) return [];

  const results: SamOpportunity[] = [];
  const links = extractLinks(html, url);

  for (const { text, href } of links) {
    if (!text.toLowerCase().includes("bid") && !containsKeyword(text)) continue;
    if (href.includes("facebook.com") || href.includes("hancockky.us/resources/bids/") === false && !href.includes("hancockky.us")) continue;
    if (href === url) continue;

    const noticeId = `ky-hancock-${slugify(text)}`;
    results.push({
      noticeId,
      title: text,
      agency: "Hancock County Government",
      naicsCode: null,
      description: null,
      postedDate: null,
      responseDeadline: null,
      url: href,
      source: "state-local",
      sourceLabel: "Hancock County",
    } as SamOpportunity & { source: string; sourceLabel: string });
  }

  console.log(`[ky-local] Hancock County: ${results.length} bids found`);
  return results;
}

async function scrapeDaviessCounty(): Promise<SamOpportunity[]> {
  const noticesUrl = "https://www.daviessky.org/notices/";
  const html = await safeFetch(noticesUrl);
  if (!html) return [];

  const results: SamOpportunity[] = [];

  const articleRe = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let articleMatch: RegExpExecArray | null;

  const processedIds = new Set<string>();

  while ((articleMatch = articleRe.exec(html)) !== null) {
    const articleHtml = articleMatch[1];
    const titleMatch = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(articleHtml);
    if (!titleMatch) continue;

    const title = decodeEntities(stripTags(titleMatch[1])).trim();
    if (!title || title.length < 5) continue;

    if (!containsKeyword(title) && !title.toLowerCase().includes("bid") && !title.toLowerCase().includes("rfp")) continue;

    const links = extractLinks(articleHtml, noticesUrl);
    const detailHref = links.find((l) => l.href !== noticesUrl)?.href ?? noticesUrl;

    const fullText = stripTags(articleHtml);
    const postedDate = parseDateFromText(fullText);

    const noticeId = `ky-daviess-${slugify(title)}`;
    if (processedIds.has(noticeId)) continue;
    processedIds.add(noticeId);

    results.push({
      noticeId,
      title,
      agency: "Daviess County Government",
      naicsCode: null,
      description: fullText.slice(0, 500).trim() || null,
      postedDate,
      responseDeadline: null,
      url: detailHref,
      source: "state-local",
      sourceLabel: "Daviess County",
    } as SamOpportunity & { source: string; sourceLabel: string });
  }

  if (results.length === 0) {
    const links = extractLinks(html, noticesUrl);
    for (const { text, href } of links) {
      if (!containsKeyword(text) && !text.toLowerCase().includes("bid")) continue;
      const noticeId = `ky-daviess-${slugify(text)}`;
      if (processedIds.has(noticeId)) continue;
      processedIds.add(noticeId);
      results.push({
        noticeId,
        title: text,
        agency: "Daviess County Government",
        naicsCode: null,
        description: null,
        postedDate: null,
        responseDeadline: null,
        url: href,
        source: "state-local",
        sourceLabel: "Daviess County",
      } as SamOpportunity & { source: string; sourceLabel: string });
    }
  }

  console.log(`[ky-local] Daviess County: ${results.length} bids found`);
  return results;
}

async function scrapeOhioCounty(): Promise<SamOpportunity[]> {
  const urls = [
    "https://www.ohiocounty.ky.gov",
    "https://ohiocountyky.gov",
  ];

  for (const base of urls) {
    const html = await safeFetch(base);
    if (!html) continue;

    const results: SamOpportunity[] = [];
    const links = extractLinks(html, base);

    for (const { text, href } of links) {
      if (!containsKeyword(text) && !text.toLowerCase().includes("bid")) continue;
      const noticeId = `ky-ohio-${slugify(text)}`;
      results.push({
        noticeId,
        title: text,
        agency: "Ohio County Government",
        naicsCode: null,
        description: null,
        postedDate: null,
        responseDeadline: null,
        url: href,
        source: "state-local",
        sourceLabel: "Ohio County",
      } as SamOpportunity & { source: string; sourceLabel: string });
    }

    if (results.length > 0) {
      console.log(`[ky-local] Ohio County: ${results.length} bids found`);
      return results;
    }
  }

  console.log("[ky-local] Ohio County: site unreachable or no bids found");
  return [];
}

async function scrapeMcLeanCounty(): Promise<SamOpportunity[]> {
  const urls = [
    "https://www.mcleancounty.ky.gov",
    "https://mcleancountyky.gov",
  ];

  for (const base of urls) {
    const html = await safeFetch(base);
    if (!html) continue;

    const results: SamOpportunity[] = [];
    const links = extractLinks(html, base);

    for (const { text, href } of links) {
      if (!containsKeyword(text) && !text.toLowerCase().includes("bid")) continue;
      const noticeId = `ky-mclean-${slugify(text)}`;
      results.push({
        noticeId,
        title: text,
        agency: "McLean County Government",
        naicsCode: null,
        description: null,
        postedDate: null,
        responseDeadline: null,
        url: href,
        source: "state-local",
        sourceLabel: "McLean County",
      } as SamOpportunity & { source: string; sourceLabel: string });
    }

    if (results.length > 0) {
      console.log(`[ky-local] McLean County: ${results.length} bids found`);
      return results;
    }
  }

  console.log("[ky-local] McLean County: site unreachable or no bids found");
  return [];
}

async function scrapeKyEProcurement(): Promise<SamOpportunity[]> {
  const urls = [
    "https://procurement.ky.gov/Pages/BidOpportunities.aspx",
    "https://eProcurement.ky.gov",
  ];

  const KEYWORDS = ["asphalt", "paving", "sealcoat", "pavement", "road", "parking"];

  for (const base of urls) {
    const html = await safeFetch(base);
    if (!html) continue;

    const results: SamOpportunity[] = [];
    const links = extractLinks(html, base);

    for (const { text, href } of links) {
      if (!KEYWORDS.some((kw) => text.toLowerCase().includes(kw))) continue;
      const noticeId = `ky-eprocure-${slugify(text)}`;
      results.push({
        noticeId,
        title: text,
        agency: "Kentucky eProcurement",
        naicsCode: null,
        description: null,
        postedDate: null,
        responseDeadline: null,
        url: href,
        source: "state-local",
        sourceLabel: "KY eProcurement",
      } as SamOpportunity & { source: string; sourceLabel: string });
    }

    if (results.length > 0) {
      console.log(`[ky-local] KY eProcurement: ${results.length} bids found`);
      return results;
    }
  }

  console.log("[ky-local] KY eProcurement: portal unreachable or no matching bids");
  return [];
}

export async function fetchKyLocalBids(): Promise<
  Array<SamOpportunity & { source: string; sourceLabel: string }>
> {
  console.log("[ky-local] Starting Kentucky local bid scrape");

  const [hancock, daviess, ohio, mclean, kyState] = await Promise.allSettled([
    scrapeHancockCounty(),
    scrapeDaviessCounty(),
    scrapeOhioCounty(),
    scrapeMcLeanCounty(),
    scrapeKyEProcurement(),
  ]);

  const all: Array<SamOpportunity & { source: string; sourceLabel: string }> = [];

  for (const result of [hancock, daviess, ohio, mclean, kyState]) {
    if (result.status === "fulfilled") {
      all.push(...(result.value as Array<SamOpportunity & { source: string; sourceLabel: string }>));
    } else {
      console.error("[ky-local] Scraper error:", result.reason);
    }
  }

  const seen = new Set<string>();
  const deduped = all.filter((r) => {
    if (seen.has(r.noticeId)) return false;
    seen.add(r.noticeId);
    return true;
  });

  console.log(`[ky-local] Total KY local bids: ${deduped.length}`);
  return deduped;
}
