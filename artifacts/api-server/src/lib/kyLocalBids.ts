import { createHash } from "node:crypto";
import { launchBrowser } from "./launchBrowser.js";
import { SamOpportunity } from "./samGov.js";

const PAGE_TIMEOUT_MS = 30000;

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
];

// Pre-compile word-boundary patterns once at module load to avoid per-call overhead.
// \b is used so "road" does not match "broadband", "bridge" does not match "Cambridge", etc.
// Multi-word keywords (e.g. "parking lot", "crack seal") are split on spaces, so each
// constituent word is boundary-checked — "parking lot" still matches "parking lot" in text.
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
// Any link whose text contains one of these (case-insensitive) is skipped.
// Exported so bidSync.ts can use the same list to purge stale rows from the DB.
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

async function scrapeHancockCounty(): Promise<LocalOpportunity[]> {
  const url = "https://hancockky.us/resources/bids/";
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (compatible; BuildProBot/1.0; +https://buildpro.app)"
    );
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });

    const bids = await page.evaluate((pageUrl: string) => {
      const results: Array<{ text: string; href: string; dateText: string }> = [];
      const contentAreas = document.querySelectorAll(
        ".entry-content a, .page-content a, article a, main a"
      );
      contentAreas.forEach((el) => {
        const a = el as HTMLAnchorElement;
        const text = a.textContent?.trim() ?? "";
        const href = a.href ?? "";
        if (text.length < 4 || !href || href.includes("facebook.com")) return;
        if (href === pageUrl) return;

        const container = a.closest("li, p, div, article") as HTMLElement | null;
        const dateText = container?.textContent?.trim() ?? "";
        results.push({ text, href, dateText });
      });
      return results;
    }, url);

    const results: LocalOpportunity[] = [];
    for (const { text, href, dateText } of bids) {
      if (!containsKeyword(text) || isNavLink(text)) continue;
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
    }
    console.log(`[ky-local] Hancock County: ${results.length} bids found`);
    return results;
  } catch (err) {
    console.warn("[ky-local] Hancock County scrape failed:", (err as Error).message);
    return [];
  } finally {
    await browser.close();
  }
}

async function scrapeDaviessCounty(): Promise<LocalOpportunity[]> {
  const url = "https://www.daviessky.org/notices/";
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (compatible; BuildProBot/1.0; +https://buildpro.app)"
    );
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });

    const notices = await page.evaluate(() => {
      const results: Array<{
        title: string;
        href: string;
        fullText: string;
        dateAttr: string;
      }> = [];

      const cards = document.querySelectorAll<HTMLElement>(
        "article, .entry, .notice-item, .post, .wp-block-post"
      );

      cards.forEach((card) => {
        const headingEl = card.querySelector<HTMLElement>("h1,h2,h3,h4,h5");
        const linkEl = card.querySelector<HTMLAnchorElement>("a[href]");
        const title = (headingEl?.textContent ?? linkEl?.textContent ?? "").trim();
        const href = linkEl?.href ?? "";
        const fullText = (card.textContent ?? "").replace(/\s+/g, " ").trim();
        const timeEl = card.querySelector<HTMLElement>("time");
        const dateAttr = timeEl?.getAttribute("datetime") ?? timeEl?.textContent?.trim() ?? "";
        if (title.length > 5) results.push({ title, href, fullText, dateAttr });
      });

      if (results.length === 0) {
        document.querySelectorAll<HTMLAnchorElement>("main a, .content a").forEach((a) => {
          const text = a.textContent?.trim() ?? "";
          const parent = a.closest("p, li, div") as HTMLElement | null;
          const fullText = parent?.textContent?.trim() ?? text;
          if (text.length > 5) {
            results.push({ title: text, href: a.href, fullText, dateAttr: "" });
          }
        });
      }
      return results;
    });

    const seen = new Set<string>();
    const results: LocalOpportunity[] = [];

    for (const { title, href, fullText, dateAttr } of notices) {
      if (!containsKeyword(`${title} ${fullText}`) || isNavLink(title)) continue;
      const noticeId = stableId("ky-daviess", href || title);
      if (seen.has(noticeId)) continue;
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
    }
    console.log(`[ky-local] Daviess County: ${results.length} bids found`);
    return results;
  } catch (err) {
    console.warn("[ky-local] Daviess County scrape failed:", (err as Error).message);
    return [];
  } finally {
    await browser.close();
  }
}

async function scrapeCountyGeneric(
  urls: string[],
  prefix: string,
  agency: string,
  sourceLabel: string
): Promise<LocalOpportunity[]> {
  for (const base of urls) {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (compatible; BuildProBot/1.0; +https://buildpro.app)"
      );
      await page.goto(base, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });

      const links = await page.evaluate(() => {
        const results: Array<{ text: string; href: string; contextText: string }> = [];
        document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
          const text = a.textContent?.trim() ?? "";
          if (text.length < 4) return;
          const container = a.closest("li, p, tr, div, article") as HTMLElement | null;
          const contextText = container?.textContent?.replace(/\s+/g, " ").trim() ?? text;
          results.push({ text, href: a.href, contextText });
        });
        return results;
      });

      // Primary tier: pavement/sealcoating-specific hits.
      // Fallback tier: broader construction terms — only used when the page
      // yields zero pavement-specific results so that general construction
      // bids are surfaced rather than nothing, but non-construction RFPs
      // (IT, furniture, staffing) are always excluded.
      const eligible = links.filter(({ text }) => !isNavLink(text));
      const pavementHits = eligible.filter(({ text, contextText }) =>
        containsKeyword(`${text} ${contextText}`, PAVEMENT_KEYWORDS)
      );
      const hits =
        pavementHits.length > 0
          ? pavementHits
          : eligible.filter(({ text, contextText }) =>
              containsKeyword(`${text} ${contextText}`, BROAD_BID_KEYWORDS)
            );

      const results: LocalOpportunity[] = [];
      for (const { text, href, contextText } of hits) {
        const postedDate = parseIsoDate(contextText);
        const responseDeadline = parseDueDateFromText(contextText);
        results.push({
          noticeId: stableId(prefix, href || text),
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
      }

      const tier = pavementHits.length > 0 ? "pavement" : "broad-construction";
      if (results.length > 0) {
        console.log(`[ky-local] ${sourceLabel} (${base}): ${results.length} bids found [${tier}]`);
        return results;
      }
    } catch (err) {
      console.warn(`[ky-local] ${sourceLabel} (${base}) failed:`, (err as Error).message);
    } finally {
      await browser.close();
    }
  }
  console.log(`[ky-local] ${sourceLabel}: site unreachable or no matching bids`);
  return [];
}

// Research note (May 2026):
// Hopkins, Union, Webster, and Muhlenberg counties all lack functioning standalone
// bid portals (403 / DNS failures). DemandStar and BidNet Direct are the two primary
// shared procurement platforms used by small KY counties. Confirmed through:
//   - DemandStar agency directory: lists KY counties including Hopkins, Webster
//   - BidNet Direct Kentucky portal (bidnetdirect.com/kentucky): lists member agencies
//     in western KY including Union, Muhlenberg, and surrounding counties
// These platform scrapers cover all participating counties at once and automatically
// include any additional KY/IN counties within the ~50-mile radius that join later.

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

async function scrapeDemandStarKY(): Promise<LocalOpportunity[]> {
  const searchUrls = [
    "https://network.demandstar.com/solicitations?stateCode=KY",
    "https://network.demandstar.com/solicitations?state=KY",
  ];

  for (const base of searchUrls) {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (compatible; BuildProBot/1.0; +https://buildpro.app)"
      );
      await page.goto(base, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT_MS });

      const rows = await page.evaluate(() => {
        const results: Array<{
          title: string;
          href: string;
          agency: string;
          dueDate: string;
          fullText: string;
        }> = [];

        const rowEls = document.querySelectorAll<HTMLElement>(
          "[class*='solicitation-row'], [class*='SolicitationRow'], [class*='bid-row'], " +
          "[class*='result-row'], [class*='opportunity'], tr[data-id], " +
          ".ds-solicitation, article, .card, li[class*='item']"
        );

        rowEls.forEach((row) => {
          const link = row.querySelector<HTMLAnchorElement>("a[href]");
          if (!link) return;
          const title = link.textContent?.trim() ?? "";
          const href = link.href ?? "";
          const fullText = row.textContent?.replace(/\s+/g, " ").trim() ?? "";

          const agencyEl = row.querySelector<HTMLElement>(
            "[class*='agency'], [class*='entity'], [class*='org'], td:nth-child(2)"
          );
          const agency = agencyEl?.textContent?.trim() ?? "";

          const dateEl = row.querySelector<HTMLElement>(
            "[class*='due'], [class*='deadline'], [class*='close'], time, td:last-child"
          );
          const dueDate = dateEl?.getAttribute("datetime") ?? dateEl?.textContent?.trim() ?? "";

          if (title.length > 4) {
            results.push({ title, href, agency, dueDate, fullText });
          }
        });

        if (results.length === 0) {
          document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
            const text = a.textContent?.trim() ?? "";
            const parent = a.closest("li, tr, div[class], article") as HTMLElement | null;
            const fullText = parent?.textContent?.replace(/\s+/g, " ").trim() ?? text;
            if (text.length > 4) {
              results.push({ title: text, href: a.href, agency: "", dueDate: "", fullText });
            }
          });
        }

        return results;
      });

      const results: LocalOpportunity[] = [];
      const seen = new Set<string>();

      for (const { title, href, agency, dueDate, fullText } of rows) {
        if (!containsKeyword(`${title} ${fullText}`)) continue;
        if (!isLikelyKyInAgency(agency) && !isLikelyKyInAgency(fullText)) continue;
        const noticeId = stableId("demandstar-ky", href || title);
        if (seen.has(noticeId)) continue;
        seen.add(noticeId);

        const responseDeadline = parseIsoDate(dueDate) ?? parseDueDateFromText(fullText);
        const postedDate = parseIsoDate(fullText);

        results.push({
          noticeId,
          title,
          agency: agency || "Kentucky Government (DemandStar)",
          naicsCode: null,
          description: fullText.slice(0, 500) || null,
          postedDate,
          responseDeadline,
          url: href,
          source: "state-local",
          sourceLabel: "DemandStar KY",
        });
      }

      if (results.length > 0 || rows.length > 0) {
        console.log(`[ky-local] DemandStar KY (${base}): ${results.length} matching bids`);
        return results;
      }
    } catch (err) {
      console.warn(`[ky-local] DemandStar KY (${base}) failed:`, (err as Error).message);
    } finally {
      await browser.close();
    }
  }

  console.log("[ky-local] DemandStar KY: unreachable or no matching bids");
  return [];
}

async function scrapeDemandStarIN(): Promise<LocalOpportunity[]> {
  const searchUrls = [
    "https://network.demandstar.com/solicitations?stateCode=IN",
    "https://network.demandstar.com/solicitations?state=IN",
  ];

  for (const base of searchUrls) {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (compatible; BuildProBot/1.0; +https://buildpro.app)"
      );
      await page.goto(base, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT_MS });

      const rows = await page.evaluate(() => {
        const results: Array<{
          title: string;
          href: string;
          agency: string;
          dueDate: string;
          fullText: string;
        }> = [];

        const rowEls = document.querySelectorAll<HTMLElement>(
          "[class*='solicitation-row'], [class*='SolicitationRow'], [class*='bid-row'], " +
          "[class*='result-row'], [class*='opportunity'], tr[data-id], " +
          ".ds-solicitation, article, .card, li[class*='item']"
        );

        rowEls.forEach((row) => {
          const link = row.querySelector<HTMLAnchorElement>("a[href]");
          if (!link) return;
          const title = link.textContent?.trim() ?? "";
          const href = link.href ?? "";
          const fullText = row.textContent?.replace(/\s+/g, " ").trim() ?? "";

          const agencyEl = row.querySelector<HTMLElement>(
            "[class*='agency'], [class*='entity'], [class*='org'], td:nth-child(2)"
          );
          const agency = agencyEl?.textContent?.trim() ?? "";

          const dateEl = row.querySelector<HTMLElement>(
            "[class*='due'], [class*='deadline'], [class*='close'], time, td:last-child"
          );
          const dueDate = dateEl?.getAttribute("datetime") ?? dateEl?.textContent?.trim() ?? "";

          if (title.length > 4) {
            results.push({ title, href, agency, dueDate, fullText });
          }
        });

        if (results.length === 0) {
          document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
            const text = a.textContent?.trim() ?? "";
            const parent = a.closest("li, tr, div[class], article") as HTMLElement | null;
            const fullText = parent?.textContent?.replace(/\s+/g, " ").trim() ?? text;
            if (text.length > 4) {
              results.push({ title: text, href: a.href, agency: "", dueDate: "", fullText });
            }
          });
        }

        return results;
      });

      const results: LocalOpportunity[] = [];
      const seen = new Set<string>();

      for (const { title, href, agency, dueDate, fullText } of rows) {
        if (!containsKeyword(`${title} ${fullText}`)) continue;
        if (!isLikelyKyInAgency(agency) && !isLikelyKyInAgency(fullText)) continue;
        const noticeId = stableId("demandstar-in", href || title);
        if (seen.has(noticeId)) continue;
        seen.add(noticeId);

        const responseDeadline = parseIsoDate(dueDate) ?? parseDueDateFromText(fullText);
        const postedDate = parseIsoDate(fullText);

        results.push({
          noticeId,
          title,
          agency: agency || "Indiana Government (DemandStar)",
          naicsCode: null,
          description: fullText.slice(0, 500) || null,
          postedDate,
          responseDeadline,
          url: href,
          source: "state-local",
          sourceLabel: "DemandStar IN",
        });
      }

      if (results.length > 0 || rows.length > 0) {
        console.log(`[ky-local] DemandStar IN (${base}): ${results.length} matching bids`);
        return results;
      }
    } catch (err) {
      console.warn(`[ky-local] DemandStar IN (${base}) failed:`, (err as Error).message);
    } finally {
      await browser.close();
    }
  }

  console.log("[ky-local] DemandStar IN: unreachable or no matching bids");
  return [];
}

async function scrapeBidNetDirectKY(): Promise<LocalOpportunity[]> {
  const searchUrls = [
    "https://www.bidnetdirect.com/kentucky",
    "https://bidnetdirect.com/kentucky",
    "https://www.bidnetdirect.com/co/kentucky",
  ];

  for (const base of searchUrls) {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (compatible; BuildProBot/1.0; +https://buildpro.app)"
      );
      await page.goto(base, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT_MS });

      const rows = await page.evaluate(() => {
        const results: Array<{
          title: string;
          href: string;
          agency: string;
          dueDate: string;
          fullText: string;
        }> = [];

        const rowEls = document.querySelectorAll<HTMLElement>(
          "tr, .bid-listing, .solicitation-item, .bids-list li, " +
          "[class*='bid-row'], [class*='opportunity-item'], article, .card"
        );

        rowEls.forEach((row) => {
          const link = row.querySelector<HTMLAnchorElement>("a[href]");
          if (!link) return;
          const title = link.textContent?.trim() ?? "";
          const href = link.href ?? "";
          const fullText = row.textContent?.replace(/\s+/g, " ").trim() ?? "";

          const agencyEl = row.querySelector<HTMLElement>(
            "[class*='agency'], [class*='entity'], [class*='org'], " +
            "td:nth-child(2), [class*='buyer']"
          );
          const agency = agencyEl?.textContent?.trim() ?? "";

          const dateEl = row.querySelector<HTMLElement>(
            "[class*='due'], [class*='close'], [class*='deadline'], " +
            "time, td:last-child, [class*='date']"
          );
          const dueDate = dateEl?.getAttribute("datetime") ?? dateEl?.textContent?.trim() ?? "";

          if (title.length > 4) {
            results.push({ title, href, agency, dueDate, fullText });
          }
        });

        if (results.length === 0) {
          document.querySelectorAll<HTMLAnchorElement>("main a[href], .content a[href]").forEach((a) => {
            const text = a.textContent?.trim() ?? "";
            const parent = a.closest("li, tr, div") as HTMLElement | null;
            const fullText = parent?.textContent?.replace(/\s+/g, " ").trim() ?? text;
            if (text.length > 4) {
              results.push({ title: text, href: a.href, agency: "", dueDate: "", fullText });
            }
          });
        }

        return results;
      });

      const results: LocalOpportunity[] = [];
      const seen = new Set<string>();

      for (const { title, href, agency, dueDate, fullText } of rows) {
        if (!containsKeyword(`${title} ${fullText}`)) continue;
        if (!isLikelyKyInAgency(agency) && !isLikelyKyInAgency(fullText)) continue;
        const noticeId = stableId("bidnet-ky", href || title);
        if (seen.has(noticeId)) continue;
        seen.add(noticeId);

        const responseDeadline = parseIsoDate(dueDate) ?? parseDueDateFromText(fullText);
        const postedDate = parseIsoDate(fullText);

        results.push({
          noticeId,
          title,
          agency: agency || "Kentucky Government (BidNet Direct)",
          naicsCode: null,
          description: fullText.slice(0, 500) || null,
          postedDate,
          responseDeadline,
          url: href,
          source: "state-local",
          sourceLabel: "BidNet Direct KY",
        });
      }

      if (results.length > 0 || rows.length > 0) {
        console.log(`[ky-local] BidNet Direct KY (${base}): ${results.length} matching bids`);
        return results;
      }
    } catch (err) {
      console.warn(`[ky-local] BidNet Direct KY (${base}) failed:`, (err as Error).message);
    } finally {
      await browser.close();
    }
  }

  console.log("[ky-local] BidNet Direct KY: unreachable or no matching bids");
  return [];
}

async function scrapeBidNetDirectIN(): Promise<LocalOpportunity[]> {
  const searchUrls = [
    "https://www.bidnetdirect.com/indiana",
    "https://bidnetdirect.com/indiana",
    "https://www.bidnetdirect.com/co/indiana",
  ];

  for (const base of searchUrls) {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (compatible; BuildProBot/1.0; +https://buildpro.app)"
      );
      await page.goto(base, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT_MS });

      const rows = await page.evaluate(() => {
        const results: Array<{
          title: string;
          href: string;
          agency: string;
          dueDate: string;
          fullText: string;
        }> = [];

        const rowEls = document.querySelectorAll<HTMLElement>(
          "tr, .bid-listing, .solicitation-item, .bids-list li, " +
          "[class*='bid-row'], [class*='opportunity-item'], article, .card"
        );

        rowEls.forEach((row) => {
          const link = row.querySelector<HTMLAnchorElement>("a[href]");
          if (!link) return;
          const title = link.textContent?.trim() ?? "";
          const href = link.href ?? "";
          const fullText = row.textContent?.replace(/\s+/g, " ").trim() ?? "";

          const agencyEl = row.querySelector<HTMLElement>(
            "[class*='agency'], [class*='entity'], [class*='org'], " +
            "td:nth-child(2), [class*='buyer']"
          );
          const agency = agencyEl?.textContent?.trim() ?? "";

          const dateEl = row.querySelector<HTMLElement>(
            "[class*='due'], [class*='close'], [class*='deadline'], " +
            "time, td:last-child, [class*='date']"
          );
          const dueDate = dateEl?.getAttribute("datetime") ?? dateEl?.textContent?.trim() ?? "";

          if (title.length > 4) {
            results.push({ title, href, agency, dueDate, fullText });
          }
        });

        if (results.length === 0) {
          document.querySelectorAll<HTMLAnchorElement>("main a[href], .content a[href]").forEach((a) => {
            const text = a.textContent?.trim() ?? "";
            const parent = a.closest("li, tr, div") as HTMLElement | null;
            const fullText = parent?.textContent?.replace(/\s+/g, " ").trim() ?? text;
            if (text.length > 4) {
              results.push({ title: text, href: a.href, agency: "", dueDate: "", fullText });
            }
          });
        }

        return results;
      });

      const results: LocalOpportunity[] = [];
      const seen = new Set<string>();

      for (const { title, href, agency, dueDate, fullText } of rows) {
        if (!containsKeyword(`${title} ${fullText}`)) continue;
        if (!isLikelyKyInAgency(agency) && !isLikelyKyInAgency(fullText)) continue;
        const noticeId = stableId("bidnet-in", href || title);
        if (seen.has(noticeId)) continue;
        seen.add(noticeId);

        const responseDeadline = parseIsoDate(dueDate) ?? parseDueDateFromText(fullText);
        const postedDate = parseIsoDate(fullText);

        results.push({
          noticeId,
          title,
          agency: agency || "Indiana Government (BidNet Direct)",
          naicsCode: null,
          description: fullText.slice(0, 500) || null,
          postedDate,
          responseDeadline,
          url: href,
          source: "state-local",
          sourceLabel: "BidNet Direct IN",
        });
      }

      if (results.length > 0 || rows.length > 0) {
        console.log(`[ky-local] BidNet Direct IN (${base}): ${results.length} matching bids`);
        return results;
      }
    } catch (err) {
      console.warn(`[ky-local] BidNet Direct IN (${base}) failed:`, (err as Error).message);
    } finally {
      await browser.close();
    }
  }

  console.log("[ky-local] BidNet Direct IN: unreachable or no matching bids");
  return [];
}

async function scrapeKyEProcurement(): Promise<LocalOpportunity[]> {
  const KY_NAICS = "237310";
  const CONSTRUCTION_KEYWORDS = ["asphalt", "sealcoat", "pavement", "road", "parking"];

  const searchUrls = [
    `https://procurement.ky.gov/Pages/BidOpportunities.aspx?Category=Construction`,
    `https://procurement.ky.gov/Pages/BidOpportunities.aspx?NAICS=${KY_NAICS}`,
    `https://finance.ky.gov/services/procurement/Pages/BidOpportunities.aspx`,
    `https://emars.ky.gov`,
    `https://procurement.ky.gov`,
  ];

  for (const base of searchUrls) {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (compatible; BuildProBot/1.0; +https://buildpro.app)"
      );
      await page.goto(base, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT_MS });

      const rows = await page.evaluate(() => {
        const results: Array<{
          text: string;
          href: string;
          contextText: string;
          dateText: string;
        }> = [];

        const rowEls = document.querySelectorAll<HTMLElement>(
          "tr, .bid-item, .opportunity-row, .result-item, li"
        );
        rowEls.forEach((row) => {
          const link = row.querySelector<HTMLAnchorElement>("a[href]");
          if (!link) return;
          const text = link.textContent?.trim() ?? "";
          const href = link.href ?? "";
          const fullText = row.textContent?.replace(/\s+/g, " ").trim() ?? "";
          const timeEl = row.querySelector<HTMLElement>("time");
          const dateText = timeEl?.getAttribute("datetime") ?? timeEl?.textContent?.trim() ?? fullText;
          if (text.length > 4) results.push({ text, href, contextText: fullText, dateText });
        });

        if (results.length === 0) {
          document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
            const text = a.textContent?.trim() ?? "";
            const parent = a.closest("li, p, div") as HTMLElement | null;
            const contextText = parent?.textContent?.replace(/\s+/g, " ").trim() ?? text;
            if (text.length > 4) {
              results.push({ text, href: a.href, contextText, dateText: "" });
            }
          });
        }

        return results;
      });

      const results: LocalOpportunity[] = [];
      for (const { text, href, contextText, dateText } of rows) {
        const combined = `${text} ${contextText}`;
        if (!CONSTRUCTION_KEYWORDS.some((kw) => combined.toLowerCase().includes(kw))) continue;
        const postedDate = parseIsoDate(dateText) ?? parseIsoDate(contextText);
        const responseDeadline = parseDueDateFromText(contextText);
        results.push({
          noticeId: stableId("ky-eprocure", href || text),
          title: text,
          agency: "Kentucky eProcurement",
          naicsCode: KY_NAICS,
          description: contextText.slice(0, 500) || null,
          postedDate,
          responseDeadline,
          url: href,
          source: "state-local",
          sourceLabel: "KY eProcurement",
        });
      }

      if (results.length > 0) {
        console.log(`[ky-local] KY eProcurement (${base}): ${results.length} bids found`);
        return results;
      }
    } catch (err) {
      console.warn(`[ky-local] KY eProcurement (${base}) failed:`, (err as Error).message);
    } finally {
      await browser.close();
    }
  }

  console.log("[ky-local] KY eProcurement: portal unreachable or no matching bids");
  return [];
}

export async function fetchKyLocalBids(): Promise<LocalOpportunity[]> {
  console.log("[ky-local] Starting local bid scrape (KY + IN 50-mile radius)");

  // Hawesville (Hancock County seat) is covered by scrapeHancockCounty().
  // Hartford (Ohio County seat) has no separate city bid portal; covered by Ohio County below.

  const results = await Promise.allSettled([
    // Shared procurement platforms — cover all participating KY/IN counties at once.
    // Hopkins, Union, Webster, and Muhlenberg counties (and many others) post on
    // DemandStar and/or BidNet Direct instead of maintaining their own bid portals.
    // BidNet IN covers southwestern Indiana counties (Vanderburgh, Warrick, Gibson,
    // Posey, etc.) that use BidNet Direct as their procurement platform.
    scrapeDemandStarKY(),
    scrapeDemandStarIN(),
    scrapeBidNetDirectKY(),
    scrapeBidNetDirectIN(),

    // Core KY counties (original)
    scrapeHancockCounty(),
    scrapeDaviessCounty(),
    scrapeCountyGeneric(
      ["https://www.ohiocounty.ky.gov", "https://ohiocountyky.gov"],
      "ky-ohio",
      "Ohio County Government",
      "Ohio County"
    ),
    scrapeCountyGeneric(
      ["https://www.mcleancounty.ky.gov", "https://mcleancountyky.gov"],
      "ky-mclean",
      "McLean County Government",
      "McLean County"
    ),
    scrapeKyEProcurement(),

    // Owensboro, KY (city)
    scrapeCountyGeneric(
      ["https://owensboro.org/purchasing", "https://owensboro.org/bids"],
      "ky-owensboro",
      "City of Owensboro",
      "Owensboro"
    ),

    // Henderson, KY (city)
    scrapeCountyGeneric(
      [
        "https://hendersonky.gov/170/Current-Bids-RFPs",
        "https://hendersonky.gov/135/Purchasing",
        "https://hendersonky.gov/bids",
      ],
      "ky-henderson-city",
      "City of Henderson",
      "Henderson City"
    ),

    // Henderson County, KY
    scrapeCountyGeneric(
      [
        "https://hendersoncountyky.gov/government/purchasing",
        "https://hendersoncountyky.gov/bids",
        "https://hendersoncountyky.gov",
      ],
      "ky-henderson-county",
      "Henderson County Government",
      "Henderson County"
    ),

    // Grayson County, KY
    scrapeCountyGeneric(
      ["https://graysoncountyky.gov/bids", "https://graysoncountyky.gov"],
      "ky-grayson",
      "Grayson County Government",
      "Grayson County"
    ),

    // Leitchfield, KY (city — separate portal from Grayson County)
    scrapeCountyGeneric(
      ["https://leitchfield.ky.gov/bids", "https://leitchfield.ky.gov"],
      "ky-leitchfield",
      "City of Leitchfield",
      "Leitchfield"
    ),

    // Hopkins County, KY (hopkinscountyky.com is the active public site)
    scrapeCountyGeneric(
      [
        "https://hopkinscountyky.com/bids",
        "https://hopkinscountyky.com",
        "https://hopkinscounty.ky.gov/bids",
        "https://hopkinscounty.ky.gov",
      ],
      "ky-hopkins",
      "Hopkins County Government",
      "Hopkins County"
    ),

    // Union County, KY (morganfield.ky.gov is the reachable county seat site)
    scrapeCountyGeneric(
      [
        "https://morganfield.ky.gov/bids",
        "https://morganfield.ky.gov",
        "https://unioncounty.ky.gov/bids",
        "https://unioncounty.ky.gov",
      ],
      "ky-union",
      "Union County Government",
      "Union County"
    ),

    // Webster County, KY (dixon.ky.gov is the reachable county seat site)
    scrapeCountyGeneric(
      [
        "https://dixon.ky.gov/bids",
        "https://dixon.ky.gov",
        "https://webstercounty.ky.gov/bids",
        "https://webstercounty.ky.gov",
      ],
      "ky-webster",
      "Webster County Government",
      "Webster County"
    ),

    // Muhlenberg County, KY
    scrapeCountyGeneric(
      [
        "https://muhlenbergcounty.ky.gov/bids",
        "https://muhlenbergcounty.ky.gov",
      ],
      "ky-muhlenberg",
      "Muhlenberg County Government",
      "Muhlenberg County"
    ),

    // City of Evansville, IN
    scrapeCountyGeneric(
      [
        "https://evansvillegov.org/city/department/index.php?structureid=88",
        "https://evansvillegov.org/purchasing",
        "https://evansvillegov.org/bids",
      ],
      "in-evansville",
      "City of Evansville",
      "Evansville IN"
    ),

    // Vanderburgh County, IN
    scrapeCountyGeneric(
      [
        "https://vanderburghcounty.com/purchasing",
        "https://www.vanderburghcounty.com/bids",
        "https://vanderburghcounty.com/government/purchasing",
      ],
      "in-vanderburgh",
      "Vanderburgh County Government",
      "Vanderburgh County IN"
    ),

    // Warrick County, IN
    scrapeCountyGeneric(
      [
        "https://www.warrickcounty.gov/purchasing",
        "https://warrickcounty.gov/bids",
        "https://www.warrickcounty.gov/bids",
      ],
      "in-warrick",
      "Warrick County Government",
      "Warrick County IN"
    ),

    // Indiana eProcurement (state-level)
    scrapeCountyGeneric(
      ["https://www.in.gov/idoa/procurement/"],
      "in-eprocure",
      "Indiana eProcurement",
      "IN eProcurement"
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
