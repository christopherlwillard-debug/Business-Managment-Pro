import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { SamOpportunity } from "./samGov.js";

const PAGE_TIMEOUT_MS = 15_000;
const USER_AGENT = "Mozilla/5.0 (compatible; BuildProBot/1.0; +https://buildpro.app)";

export const PAVEMENT_KEYWORDS = [
  "asphalt", "sealcoat", "sealcoating", "pavement", "parking lot",
  "parking-lot", "striping", "crack seal", "paving", "milling",
  "resurfacing", "overlay",
];

// Secondary tier: general construction terms that are still trade-relevant.
// Intentionally excludes generic procurement words ("bid", "rfp", "rfq") that
// match office-supply or IT contracts.
export const BROAD_BID_KEYWORDS = [
  ...PAVEMENT_KEYWORDS,
  "construction", "road", "roadway", "highway", "bridge", "concrete",
  "infrastructure", "grading", "drainage", "excavation", "sidewalk",
  "curb", "gutter", "demolition", "earthwork", "culvert",
  "water main", "storm sewer", "sanitary sewer",
  // General contracting / building renovation terms
  "renovation", "remodel", "building renovation", "facility renovation",
  "commercial building", "tenant improvement", "site work", "site preparation",
  "flooring", "roofing", "drywall", "masonry", "carpentry",
  "general contractor", "general contracting", "building construction",
  "interior renovation", "exterior renovation", "facility improvement",
];

// Pre-compile word-boundary patterns once at module load to avoid per-call overhead.
const KEYWORD_PATTERNS: Array<{ raw: string; pattern: RegExp }> = [
  ...new Set([...PAVEMENT_KEYWORDS, ...BROAD_BID_KEYWORDS]),
].map((kw) => ({
  raw: kw,
  pattern: new RegExp(
    kw
      .split(/\s+/)
      .map((word) => `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)
      .join("\\s+"),
    "i"
  ),
}));

function containsKeyword(text: string, keywords = BROAD_BID_KEYWORDS): boolean {
  const kwSet = new Set(keywords);
  return KEYWORD_PATTERNS.some(({ raw, pattern }) => kwSet.has(raw) && pattern.test(text));
}

// Phrases that identify navigation/help/meta links rather than actual solicitations.
export const NAV_PHRASE_DENYLIST = [
  "bid list", "bid list page",
  "bidder profile", "bidder registration", "bidder form",
  "supplier portal", "supplier registration", "vendor registration", "vendor portal",
  "create a ", "how to ", "how do i",
  "anticipated bidding", "upcoming anticipated",
  "see contracts out for bid",
  "ewsu - bid", "ewsu–bid",
  "requests for bids/quotes", "requests for bids / quotes",
  "responsible bidder",
  "employment", "job opportunities", "job postings",
  "contact us", "about us", "home page",
  "click here", "learn more", "view all", "see all",
  "sign in", "log in", "login", "register",
  "faq", "frequently asked",
  "download ", "print ", "share ",
  "privacy policy", "terms of use", "accessibility",
];

function isNavLink(text: string): boolean {
  if (text.length < 10 || text.length > 120) return true;
  const lower = text.toLowerCase();
  return NAV_PHRASE_DENYLIST.some((phrase) => lower.includes(phrase));
}

function stableId(prefix: string, discriminator: string): string {
  return `${prefix}-${createHash("sha1").update(discriminator).digest("hex").slice(0, 12)}`;
}

function parseIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const patterns = [
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}/i,
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i,
  ];
  for (const pat of patterns) {
    const m = pat.exec(raw);
    if (m) {
      try {
        const d = new Date(m[0]);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      } catch { /* skip */ }
    }
  }
  return null;
}

function parseDueDateFromText(text: string): string | null {
  const duePats = [
    /(?:due|deadline|closes?|submit(?:ted)?\s+by|bid\s+opening|proposals?\s+due)[:\s]+([A-Za-z0-9\s,\/\-]+)/i,
    /(?:due\s+date|response\s+deadline)[:\s]+([A-Za-z0-9\s,\/\-]+)/i,
  ];
  for (const pat of duePats) {
    const m = pat.exec(text);
    if (m) {
      const d = parseIsoDate(m[1].trim());
      if (d) return d;
    }
  }
  return null;
}

export type LocalOpportunity = SamOpportunity & {
  source: string;
  sourceLabel: string;
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(tid);
  }
}

function resolveUrl(base: string, href: string): string {
  if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) return "";
  try { return new URL(href, base).href; } catch { return href; }
}

// ── Individual scrapers ───────────────────────────────────────────────────────

async function scrapeHancockCounty(): Promise<LocalOpportunity[]> {
  const url = "https://hancockky.us/resources/bids/";
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const results: LocalOpportunity[] = [];

    $(".entry-content a, .page-content a, article a, main a").each((_, el) => {
      const text = $(el).text().trim();
      const href = resolveUrl(url, $(el).attr("href") || "");
      if (!text || text.length < 4 || !href || href.includes("facebook.com")) return;

      const container = $(el).closest("li, p, div, article");
      const dateText = container.text().trim();

      if (!containsKeyword(text) || isNavLink(text)) return;
      const postedDate = parseIsoDate(dateText);
      const responseDeadline = parseDueDateFromText(dateText);
      results.push({
        noticeId: stableId("ky-hancock", href || text),
        title: text,
        agency: "Hancock County Government",
        naicsCode: null,
        description: dateText.slice(0, 300) || null,
        postedDate,
        responseDeadline,
        url: href,
        source: "state-local",
        sourceLabel: "Hancock County",
      });
    });

    console.log(`[ky-local] Hancock County: ${results.length} bids found`);
    return results;
  } catch (err) {
    console.warn("[ky-local] Hancock County scrape failed:", (err as Error).message);
    return [];
  }
}

async function scrapeDaviessCounty(): Promise<LocalOpportunity[]> {
  const url = "https://www.daviessky.org/notices/";
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    const results: LocalOpportunity[] = [];

    const processCard = (el: any) => {
      const $el = $(el);
      const headingEl = $el.find("h1,h2,h3,h4,h5").first();
      const linkEl = $el.find("a[href]").first();
      const title = (headingEl.text() || linkEl.text() || "").trim();
      const rawHref = linkEl.attr("href") || "";
      const href = resolveUrl(url, rawHref);
      const fullText = $el.text().replace(/\s+/g, " ").trim();
      const timeEl = $el.find("time").first();
      const dateAttr = timeEl.attr("datetime") || timeEl.text().trim() || "";

      if (!title || title.length <= 5) return;
      if (!containsKeyword(`${title} ${fullText}`) || isNavLink(title)) return;

      const noticeId = stableId("ky-daviess", href || title);
      if (seen.has(noticeId)) return;
      seen.add(noticeId);

      const postedDate = parseIsoDate(dateAttr) ?? parseIsoDate(fullText);
      const responseDeadline = parseDueDateFromText(fullText);
      results.push({
        noticeId,
        title,
        agency: "Daviess County Government",
        naicsCode: null,
        description: fullText.slice(0, 500) || null,
        postedDate,
        responseDeadline,
        url: href || url,
        source: "state-local",
        sourceLabel: "Daviess County",
      });
    };

    const cards = $("article, .entry, .notice-item, .post, .wp-block-post");
    if (cards.length > 0) {
      cards.each((_, el) => processCard(el));
    } else {
      // Fallback: scan all content links
      $("main a, .content a").each((_, el) => {
        const text = $(el).text().trim();
        const rawHref = $(el).attr("href") || "";
        const href = resolveUrl(url, rawHref);
        const parent = $(el).closest("p, li, div");
        const fullText = parent.text().replace(/\s+/g, " ").trim() || text;
        if (text.length <= 5) return;
        if (!containsKeyword(`${text} ${fullText}`) || isNavLink(text)) return;
        const noticeId = stableId("ky-daviess", href || text);
        if (seen.has(noticeId)) return;
        seen.add(noticeId);
        results.push({
          noticeId,
          title: text,
          agency: "Daviess County Government",
          naicsCode: null,
          description: fullText.slice(0, 500) || null,
          postedDate: parseIsoDate(fullText),
          responseDeadline: parseDueDateFromText(fullText),
          url: href || url,
          source: "state-local",
          sourceLabel: "Daviess County",
        });
      });
    }

    console.log(`[ky-local] Daviess County: ${results.length} bids found`);
    return results;
  } catch (err) {
    console.warn("[ky-local] Daviess County scrape failed:", (err as Error).message);
    return [];
  }
}

async function scrapeCountyGeneric(
  urls: string[],
  prefix: string,
  agency: string,
  sourceLabel: string
): Promise<LocalOpportunity[]> {
  for (const base of urls) {
    try {
      const html = await fetchHtml(base);
      const $ = cheerio.load(html);
      const seen = new Set<string>();
      const results: LocalOpportunity[] = [];

      $("a[href]").each((_, el) => {
        const text = $(el).text().trim();
        if (text.length < 4 || isNavLink(text)) return;

        const rawHref = $(el).attr("href") || "";
        const href = resolveUrl(base, rawHref);
        if (!href) return;

        const container = $(el).closest("li, p, tr, div, article");
        const contextText = container.text().replace(/\s+/g, " ").trim() || text;

        if (!containsKeyword(`${text} ${contextText}`, BROAD_BID_KEYWORDS)) return;

        const key = href || text;
        if (seen.has(key)) return;
        seen.add(key);

        const postedDate = parseIsoDate(contextText);
        const responseDeadline = parseDueDateFromText(contextText);
        results.push({
          noticeId: stableId(prefix, key),
          title: text,
          agency,
          naicsCode: null,
          description: contextText.slice(0, 300) || null,
          postedDate,
          responseDeadline,
          url: href,
          source: "state-local",
          sourceLabel,
        });
      });

      if (results.length > 0) {
        console.log(`[ky-local] ${sourceLabel} (${base}): ${results.length} bids found`);
        return results;
      }
    } catch (err) {
      console.warn(`[ky-local] ${sourceLabel} (${base}) failed:`, (err as Error).message);
    }
  }
  console.log(`[ky-local] ${sourceLabel}: site unreachable or no matching bids`);
  return [];
}

// Research note (May 2026):
// Hopkins, Union, Webster, and Muhlenberg counties all lack functioning standalone
// bid portals (403 / DNS failures). DemandStar and BidNet Direct are the two primary
// shared procurement platforms used by small KY counties.

const KY_IN_AGENCY_TERMS = [
  "kentucky", " ky ", ", ky", " in ", ", in", "indiana",
  "county", "city of", "municipal", "district",
  "hopkinsville", "madisonville", "morganfield", "central city", "greenville",
  "owensboro", "henderson", "evansville", "vanderburgh", "warrick",
];

function isLikelyKyInAgency(agencyText: string): boolean {
  if (!agencyText) return true;
  const lower = agencyText.toLowerCase();
  return KY_IN_AGENCY_TERMS.some((term) => lower.includes(term));
}

// DemandStar and BidNet are JS-rendered SPAs. We attempt fetch+cheerio as a
// best-effort — server-side rendered content (if any) will be parsed. Full SPA
// rendering is no longer used due to production Chrome incompatibility.

async function scrapeDemandStarKY(): Promise<LocalOpportunity[]> {
  const urls = [
    "https://network.demandstar.com/solicitations?stateCode=KY",
    "https://network.demandstar.com/solicitations?state=KY",
  ];
  for (const base of urls) {
    try {
      const html = await fetchHtml(base);
      const $ = cheerio.load(html);
      const seen = new Set<string>();
      const results: LocalOpportunity[] = [];

      $("a[href]").each((_, el) => {
        const text = $(el).text().trim();
        if (text.length <= 4 || isNavLink(text)) return;
        const rawHref = $(el).attr("href") || "";
        const href = resolveUrl(base, rawHref);
        if (!href) return;
        const parent = $(el).closest("li, tr, div[class], article");
        const fullText = parent.text().replace(/\s+/g, " ").trim() || text;
        if (!containsKeyword(`${text} ${fullText}`)) return;
        if (!isLikelyKyInAgency(fullText)) return;
        const noticeId = stableId("demandstar-ky", href || text);
        if (seen.has(noticeId)) return;
        seen.add(noticeId);
        results.push({
          noticeId,
          title: text,
          agency: "Kentucky Government (DemandStar)",
          naicsCode: null,
          description: fullText.slice(0, 500) || null,
          postedDate: parseIsoDate(fullText),
          responseDeadline: parseDueDateFromText(fullText),
          url: href,
          source: "state-local",
          sourceLabel: "DemandStar KY",
        });
      });

      if (results.length > 0 || html.length > 1000) {
        console.log(`[ky-local] DemandStar KY (${base}): ${results.length} matching bids`);
        return results;
      }
    } catch (err) {
      console.warn(`[ky-local] DemandStar KY (${base}) failed:`, (err as Error).message);
    }
  }
  console.log("[ky-local] DemandStar KY: unreachable or no matching bids");
  return [];
}

async function scrapeDemandStarIN(): Promise<LocalOpportunity[]> {
  const urls = [
    "https://network.demandstar.com/solicitations?stateCode=IN",
    "https://network.demandstar.com/solicitations?state=IN",
  ];
  for (const base of urls) {
    try {
      const html = await fetchHtml(base);
      const $ = cheerio.load(html);
      const seen = new Set<string>();
      const results: LocalOpportunity[] = [];

      $("a[href]").each((_, el) => {
        const text = $(el).text().trim();
        if (text.length <= 4 || isNavLink(text)) return;
        const rawHref = $(el).attr("href") || "";
        const href = resolveUrl(base, rawHref);
        if (!href) return;
        const parent = $(el).closest("li, tr, div[class], article");
        const fullText = parent.text().replace(/\s+/g, " ").trim() || text;
        if (!containsKeyword(`${text} ${fullText}`)) return;
        if (!isLikelyKyInAgency(fullText)) return;
        const noticeId = stableId("demandstar-in", href || text);
        if (seen.has(noticeId)) return;
        seen.add(noticeId);
        results.push({
          noticeId,
          title: text,
          agency: "Indiana Government (DemandStar)",
          naicsCode: null,
          description: fullText.slice(0, 500) || null,
          postedDate: parseIsoDate(fullText),
          responseDeadline: parseDueDateFromText(fullText),
          url: href,
          source: "state-local",
          sourceLabel: "DemandStar IN",
        });
      });

      if (results.length > 0 || html.length > 1000) {
        console.log(`[ky-local] DemandStar IN (${base}): ${results.length} matching bids`);
        return results;
      }
    } catch (err) {
      console.warn(`[ky-local] DemandStar IN (${base}) failed:`, (err as Error).message);
    }
  }
  console.log("[ky-local] DemandStar IN: unreachable or no matching bids");
  return [];
}

async function scrapeBidNetDirectKY(): Promise<LocalOpportunity[]> {
  const urls = [
    "https://www.bidnetdirect.com/kentucky",
    "https://bidnetdirect.com/kentucky",
  ];
  for (const base of urls) {
    try {
      const html = await fetchHtml(base);
      const $ = cheerio.load(html);
      const seen = new Set<string>();
      const results: LocalOpportunity[] = [];

      $("a[href]").each((_, el) => {
        const text = $(el).text().trim();
        if (text.length <= 4 || isNavLink(text)) return;
        const rawHref = $(el).attr("href") || "";
        const href = resolveUrl(base, rawHref);
        if (!href) return;
        const parent = $(el).closest("li, tr, div[class], article");
        const fullText = parent.text().replace(/\s+/g, " ").trim() || text;
        if (!containsKeyword(`${text} ${fullText}`)) return;
        if (!isLikelyKyInAgency(fullText)) return;
        const noticeId = stableId("bidnet-ky", href || text);
        if (seen.has(noticeId)) return;
        seen.add(noticeId);
        results.push({
          noticeId,
          title: text,
          agency: "Kentucky Government (BidNet Direct)",
          naicsCode: null,
          description: fullText.slice(0, 500) || null,
          postedDate: parseIsoDate(fullText),
          responseDeadline: parseDueDateFromText(fullText),
          url: href,
          source: "state-local",
          sourceLabel: "BidNet Direct KY",
        });
      });

      if (results.length > 0 || html.length > 1000) {
        console.log(`[ky-local] BidNet Direct KY (${base}): ${results.length} matching bids`);
        return results;
      }
    } catch (err) {
      console.warn(`[ky-local] BidNet Direct KY (${base}) failed:`, (err as Error).message);
    }
  }
  console.log("[ky-local] BidNet Direct KY: unreachable or no matching bids");
  return [];
}

async function scrapeBidNetDirectIN(): Promise<LocalOpportunity[]> {
  const urls = [
    "https://www.bidnetdirect.com/indiana",
    "https://bidnetdirect.com/indiana",
  ];
  for (const base of urls) {
    try {
      const html = await fetchHtml(base);
      const $ = cheerio.load(html);
      const seen = new Set<string>();
      const results: LocalOpportunity[] = [];

      $("a[href]").each((_, el) => {
        const text = $(el).text().trim();
        if (text.length <= 4 || isNavLink(text)) return;
        const rawHref = $(el).attr("href") || "";
        const href = resolveUrl(base, rawHref);
        if (!href) return;
        const parent = $(el).closest("li, tr, div[class], article");
        const fullText = parent.text().replace(/\s+/g, " ").trim() || text;
        if (!containsKeyword(`${text} ${fullText}`)) return;
        if (!isLikelyKyInAgency(fullText)) return;
        const noticeId = stableId("bidnet-in", href || text);
        if (seen.has(noticeId)) return;
        seen.add(noticeId);
        results.push({
          noticeId,
          title: text,
          agency: "Indiana Government (BidNet Direct)",
          naicsCode: null,
          description: fullText.slice(0, 500) || null,
          postedDate: parseIsoDate(fullText),
          responseDeadline: parseDueDateFromText(fullText),
          url: href,
          source: "state-local",
          sourceLabel: "BidNet Direct IN",
        });
      });

      if (results.length > 0 || html.length > 1000) {
        console.log(`[ky-local] BidNet Direct IN (${base}): ${results.length} matching bids`);
        return results;
      }
    } catch (err) {
      console.warn(`[ky-local] BidNet Direct IN (${base}) failed:`, (err as Error).message);
    }
  }
  console.log("[ky-local] BidNet Direct IN: unreachable or no matching bids");
  return [];
}

async function scrapeKyEProcurement(): Promise<LocalOpportunity[]> {
  const KY_NAICS = "237310";
  const CONSTRUCTION_KEYWORDS = ["asphalt", "sealcoat", "pavement", "road", "parking",
    "construction", "renovation", "grading", "excavation", "concrete"];

  const searchUrls = [
    "https://procurement.ky.gov/Pages/BidOpportunities.aspx?Category=Construction",
    `https://procurement.ky.gov/Pages/BidOpportunities.aspx?NAICS=${KY_NAICS}`,
    "https://finance.ky.gov/services/procurement/Pages/BidOpportunities.aspx",
    "https://procurement.ky.gov",
  ];

  for (const base of searchUrls) {
    try {
      const html = await fetchHtml(base);
      const $ = cheerio.load(html);
      const results: LocalOpportunity[] = [];

      // Try structured rows first (table / list)
      $("tr, .bid-item, .opportunity-row, .result-item, li").each((_, el) => {
        const link = $(el).find("a[href]").first();
        if (!link.length) return;
        const text = link.text().trim();
        const rawHref = link.attr("href") || "";
        const href = resolveUrl(base, rawHref);
        const fullText = $(el).text().replace(/\s+/g, " ").trim();
        const timeEl = $(el).find("time").first();
        const dateText = timeEl.attr("datetime") || timeEl.text().trim() || fullText;
        if (text.length <= 4) return;
        const combined = `${text} ${fullText}`;
        if (!CONSTRUCTION_KEYWORDS.some((kw) => combined.toLowerCase().includes(kw))) return;
        const postedDate = parseIsoDate(dateText) ?? parseIsoDate(fullText);
        const responseDeadline = parseDueDateFromText(fullText);
        results.push({
          noticeId: stableId("ky-eprocure", href || text),
          title: text,
          agency: "Kentucky eProcurement",
          naicsCode: KY_NAICS,
          description: fullText.slice(0, 500) || null,
          postedDate,
          responseDeadline,
          url: href,
          source: "state-local",
          sourceLabel: "KY eProcurement",
        });
      });

      // Fallback: scan all links
      if (results.length === 0) {
        $("a[href]").each((_, el) => {
          const text = $(el).text().trim();
          const rawHref = $(el).attr("href") || "";
          const href = resolveUrl(base, rawHref);
          const parent = $(el).closest("li, p, div");
          const contextText = parent.text().replace(/\s+/g, " ").trim() || text;
          if (text.length <= 4) return;
          const combined = `${text} ${contextText}`;
          if (!CONSTRUCTION_KEYWORDS.some((kw) => combined.toLowerCase().includes(kw))) return;
          results.push({
            noticeId: stableId("ky-eprocure", href || text),
            title: text,
            agency: "Kentucky eProcurement",
            naicsCode: KY_NAICS,
            description: contextText.slice(0, 500) || null,
            postedDate: parseIsoDate(contextText),
            responseDeadline: parseDueDateFromText(contextText),
            url: href,
            source: "state-local",
            sourceLabel: "KY eProcurement",
          });
        });
      }

      if (results.length > 0) {
        console.log(`[ky-local] KY eProcurement (${base}): ${results.length} bids found`);
        return results;
      }
    } catch (err) {
      console.warn(`[ky-local] KY eProcurement (${base}) failed:`, (err as Error).message);
    }
  }

  console.log("[ky-local] KY eProcurement: portal unreachable or no matching bids");
  return [];
}

export async function fetchKyLocalBids(): Promise<LocalOpportunity[]> {
  console.log("[ky-local] Starting local bid scrape (KY + IN 50-mile radius)");

  const results = await Promise.allSettled([
    // Shared procurement platforms
    scrapeDemandStarKY(),
    scrapeDemandStarIN(),
    scrapeBidNetDirectKY(),
    scrapeBidNetDirectIN(),

    // Core KY counties
    scrapeHancockCounty(),
    scrapeDaviessCounty(),
    scrapeCountyGeneric(
      ["https://www.ohiocounty.ky.gov", "https://ohiocountyky.gov"],
      "ky-ohio", "Ohio County Government", "Ohio County"
    ),
    scrapeCountyGeneric(
      ["https://www.mcleancounty.ky.gov", "https://mcleancountyky.gov"],
      "ky-mclean", "McLean County Government", "McLean County"
    ),
    scrapeKyEProcurement(),

    // Owensboro, KY
    scrapeCountyGeneric(
      ["https://owensboro.org/purchasing", "https://owensboro.org/bids"],
      "ky-owensboro", "City of Owensboro", "Owensboro"
    ),

    // Henderson, KY (city)
    scrapeCountyGeneric(
      [
        "https://hendersonky.gov/170/Current-Bids-RFPs",
        "https://hendersonky.gov/135/Purchasing",
        "https://hendersonky.gov/bids",
      ],
      "ky-henderson-city", "City of Henderson", "Henderson City"
    ),

    // Henderson County, KY
    scrapeCountyGeneric(
      [
        "https://hendersoncountyky.gov/government/purchasing",
        "https://hendersoncountyky.gov/bids",
        "https://hendersoncountyky.gov",
      ],
      "ky-henderson-county", "Henderson County Government", "Henderson County"
    ),

    // Grayson County, KY
    scrapeCountyGeneric(
      ["https://graysoncountyky.gov/bids", "https://graysoncountyky.gov"],
      "ky-grayson", "Grayson County Government", "Grayson County"
    ),

    // Leitchfield, KY
    scrapeCountyGeneric(
      ["https://leitchfield.ky.gov/bids", "https://leitchfield.ky.gov"],
      "ky-leitchfield", "City of Leitchfield", "Leitchfield"
    ),

    // Hopkins County, KY
    scrapeCountyGeneric(
      [
        "https://hopkinscountyky.com/bids",
        "https://hopkinscountyky.com",
        "https://hopkinscounty.ky.gov/bids",
        "https://hopkinscounty.ky.gov",
      ],
      "ky-hopkins", "Hopkins County Government", "Hopkins County"
    ),

    // Union County, KY
    scrapeCountyGeneric(
      [
        "https://morganfield.ky.gov/bids",
        "https://morganfield.ky.gov",
        "https://unioncounty.ky.gov/bids",
        "https://unioncounty.ky.gov",
      ],
      "ky-union", "Union County Government", "Union County"
    ),

    // Webster County, KY
    scrapeCountyGeneric(
      [
        "https://dixon.ky.gov/bids",
        "https://dixon.ky.gov",
        "https://webstercounty.ky.gov/bids",
        "https://webstercounty.ky.gov",
      ],
      "ky-webster", "Webster County Government", "Webster County"
    ),

    // Muhlenberg County, KY
    scrapeCountyGeneric(
      [
        "https://muhlenbergcounty.ky.gov/bids",
        "https://muhlenbergcounty.ky.gov",
      ],
      "ky-muhlenberg", "Muhlenberg County Government", "Muhlenberg County"
    ),

    // City of Evansville, IN
    scrapeCountyGeneric(
      [
        "https://evansvillegov.org/city/department/index.php?structureid=88",
        "https://evansvillegov.org/purchasing",
        "https://evansvillegov.org/bids",
      ],
      "in-evansville", "City of Evansville", "Evansville IN"
    ),

    // Vanderburgh County, IN
    scrapeCountyGeneric(
      [
        "https://vanderburghcounty.com/purchasing",
        "https://www.vanderburghcounty.com/bids",
        "https://vanderburghcounty.com/government/purchasing",
      ],
      "in-vanderburgh", "Vanderburgh County Government", "Vanderburgh County IN"
    ),

    // Warrick County, IN
    scrapeCountyGeneric(
      [
        "https://www.warrickcounty.gov/purchasing",
        "https://warrickcounty.gov/bids",
        "https://www.warrickcounty.gov/bids",
      ],
      "in-warrick", "Warrick County Government", "Warrick County IN"
    ),

    // Indiana eProcurement
    scrapeCountyGeneric(
      ["https://www.in.gov/idoa/procurement/"],
      "in-eprocure", "Indiana eProcurement", "IN eProcurement"
    ),
  ]);

  const all: LocalOpportunity[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      all.push(...result.value);
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

  console.log(`[ky-local] Total local bids (KY + IN): ${deduped.length}`);
  return deduped;
}
