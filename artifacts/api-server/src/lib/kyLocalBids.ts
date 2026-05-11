import { createHash } from "node:crypto";
import { launchBrowser } from "./launchBrowser.js";
import { SamOpportunity } from "./samGov.js";

const PAGE_TIMEOUT_MS = 30000;

const PAVEMENT_KEYWORDS = [
  "asphalt", "sealcoat", "sealcoating", "pavement", "parking lot",
  "parking-lot", "striping", "crack seal", "paving", "milling",
  "resurfacing", "overlay",
];

const BROAD_BID_KEYWORDS = [...PAVEMENT_KEYWORDS, "bid", "rfp", "rfq"];

function containsKeyword(text: string, keywords = BROAD_BID_KEYWORDS): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
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
      if (!containsKeyword(text)) continue;
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
      if (!containsKeyword(`${title} ${fullText}`)) continue;
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

      const results: LocalOpportunity[] = [];
      for (const { text, href, contextText } of links) {
        if (!containsKeyword(text)) continue;
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

      if (results.length > 0) {
        console.log(`[ky-local] ${sourceLabel} (${base}): ${results.length} bids found`);
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

  // Note: Hawesville, KY (Hancock County seat) is covered by scrapeHancockCounty() above.
  // Note: Hartford, KY (Ohio County seat) has no publicly accessible city bid portal
  //       (DNS resolves to nothing); bids are covered by the Ohio County scraper below.
  // Note: Beaverdam, KY is an unincorporated community in Ohio County, also covered below.

  const results = await Promise.allSettled([
    // Existing county scrapers
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

    // Owensboro, KY city (owensboro.org/purchasing confirmed reachable)
    scrapeCountyGeneric(
      ["https://owensboro.org/purchasing", "https://owensboro.org/bids"],
      "ky-owensboro",
      "City of Owensboro",
      "Owensboro"
    ),

    // Henderson, KY city (hendersonky.gov/170/Current-Bids-RFPs confirmed reachable)
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

    // Henderson County, KY (hendersoncountyky.gov root confirmed reachable)
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

    // Grayson County, KY / Leitchfield city (both confirmed reachable)
    scrapeCountyGeneric(
      [
        "https://graysoncountyky.gov/bids",
        "https://leitchfield.ky.gov/bids",
        "https://graysoncountyky.gov",
      ],
      "ky-grayson",
      "Grayson County Government",
      "Grayson County"
    ),

    // Hopkins County, KY — Madisonville area (site returns 403; fails gracefully)
    scrapeCountyGeneric(
      [
        "https://hopkinscounty.ky.gov/bids",
        "https://hopkinscounty.ky.gov",
        "https://hopkinscountyky.gov",
      ],
      "ky-hopkins",
      "Hopkins County Government",
      "Hopkins County"
    ),

    // Union County, KY — Morganfield area (DNS unresolvable; fails gracefully)
    scrapeCountyGeneric(
      [
        "https://unioncounty.ky.gov/bids",
        "https://unioncounty.ky.gov",
        "https://unioncountyky.gov",
      ],
      "ky-union",
      "Union County Government",
      "Union County"
    ),

    // Webster County, KY (DNS unresolvable; fails gracefully)
    scrapeCountyGeneric(
      [
        "https://webstercounty.ky.gov/bids",
        "https://webstercounty.ky.gov",
        "https://webstercountyky.gov",
      ],
      "ky-webster",
      "Webster County Government",
      "Webster County"
    ),

    // Muhlenberg County, KY — Central City / Greenville (site returns 403; fails gracefully)
    scrapeCountyGeneric(
      [
        "https://muhlenbergcounty.ky.gov/bids",
        "https://muhlenbergcounty.ky.gov",
        "https://muhlenbergcountyky.gov",
      ],
      "ky-muhlenberg",
      "Muhlenberg County Government",
      "Muhlenberg County"
    ),

    // City of Evansville, IN (evansvillegov.org purchasing dept confirmed reachable)
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

    // Vanderburgh County, IN — Evansville metro (vanderburghcounty.com confirmed reachable)
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

    // Warrick County, IN (warrickcounty.gov/purchasing confirmed reachable)
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

    // Indiana eProcurement — state-level IN bids (in.gov/idoa/procurement confirmed reachable)
    scrapeCountyGeneric(
      [
        "https://www.in.gov/idoa/procurement/",
        "https://www.in.gov/idoa/procurement/current-solicitations/",
      ],
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
