import { launchBrowser } from "./launchBrowser.js";
import { SamOpportunity } from "./samGov.js";

const PAGE_TIMEOUT_MS = 30000;

const PAVEMENT_KEYWORDS = [
  "asphalt", "sealcoat", "sealcoating", "pavement", "parking lot",
  "parking-lot", "striping", "crack seal", "paving", "road", "milling",
  "resurfacing", "overlay", "bid",
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

    const bids = await page.evaluate(() => {
      const results: Array<{ text: string; href: string }> = [];
      const links = document.querySelectorAll<HTMLAnchorElement>(
        ".entry-content a, .page-content a, article a, main a"
      );
      links.forEach((a) => {
        const text = a.textContent?.trim() ?? "";
        const href = a.href ?? "";
        if (text.length > 4 && href && !href.includes("facebook.com")) {
          results.push({ text, href });
        }
      });
      return results;
    });

    const results: LocalOpportunity[] = [];
    for (const { text, href } of bids) {
      if (!containsKeyword(text)) continue;
      if (href === url) continue;
      results.push({
        noticeId: `ky-hancock-${slugify(text)}`,
        title: text,
        agency: "Hancock County Government",
        naicsCode: null,
        description: null,
        postedDate: null,
        responseDeadline: null,
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
      const results: Array<{ title: string; href: string; snippet: string }> = [];
      const cards = document.querySelectorAll<HTMLElement>(
        "article, .entry, .notice, .post, .wp-block-post"
      );

      cards.forEach((card) => {
        const headingEl = card.querySelector<HTMLElement>("h1, h2, h3, h4, h5");
        const linkEl = card.querySelector<HTMLAnchorElement>("a[href]");
        const title = (headingEl?.textContent ?? linkEl?.textContent ?? "").trim();
        const href = linkEl?.href ?? "";
        const snippet = (card.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
        if (title.length > 5) {
          results.push({ title, href, snippet });
        }
      });

      if (results.length === 0) {
        document.querySelectorAll<HTMLAnchorElement>("main a, .content a").forEach((a) => {
          const text = a.textContent?.trim() ?? "";
          if (text.length > 5) {
            results.push({ title: text, href: a.href, snippet: "" });
          }
        });
      }

      return results;
    });

    const seen = new Set<string>();
    const results: LocalOpportunity[] = [];

    for (const { title, href, snippet } of notices) {
      const combined = `${title} ${snippet}`;
      if (!containsKeyword(combined)) continue;
      const noticeId = `ky-daviess-${slugify(title)}`;
      if (seen.has(noticeId)) continue;
      seen.add(noticeId);

      results.push({
        noticeId,
        title,
        agency: "Daviess County Government",
        naicsCode: null,
        description: snippet.slice(0, 500) || null,
        postedDate: null,
        responseDeadline: null,
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

async function scrapeOhioCounty(): Promise<LocalOpportunity[]> {
  const urls = [
    "https://www.ohiocounty.ky.gov",
    "https://ohiocountyky.gov",
  ];

  for (const base of urls) {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (compatible; BuildProBot/1.0; +https://buildpro.app)"
      );
      await page.goto(base, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });

      const links = await page.evaluate(() => {
        const results: Array<{ text: string; href: string }> = [];
        document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
          const text = a.textContent?.trim() ?? "";
          if (text.length > 4) results.push({ text, href: a.href });
        });
        return results;
      });

      const results: LocalOpportunity[] = [];
      for (const { text, href } of links) {
        if (!containsKeyword(text)) continue;
        results.push({
          noticeId: `ky-ohio-${slugify(text)}`,
          title: text,
          agency: "Ohio County Government",
          naicsCode: null,
          description: null,
          postedDate: null,
          responseDeadline: null,
          url: href,
          source: "state-local",
          sourceLabel: "Ohio County",
        });
      }

      if (results.length > 0) {
        console.log(`[ky-local] Ohio County: ${results.length} bids found`);
        return results;
      }
    } catch (err) {
      console.warn(`[ky-local] Ohio County (${base}) failed:`, (err as Error).message);
    } finally {
      await browser.close();
    }
  }

  console.log("[ky-local] Ohio County: site unreachable or no matching bids");
  return [];
}

async function scrapeMcLeanCounty(): Promise<LocalOpportunity[]> {
  const urls = [
    "https://www.mcleancounty.ky.gov",
    "https://mcleancountyky.gov",
  ];

  for (const base of urls) {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (compatible; BuildProBot/1.0; +https://buildpro.app)"
      );
      await page.goto(base, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });

      const links = await page.evaluate(() => {
        const results: Array<{ text: string; href: string }> = [];
        document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
          const text = a.textContent?.trim() ?? "";
          if (text.length > 4) results.push({ text, href: a.href });
        });
        return results;
      });

      const results: LocalOpportunity[] = [];
      for (const { text, href } of links) {
        if (!containsKeyword(text)) continue;
        results.push({
          noticeId: `ky-mclean-${slugify(text)}`,
          title: text,
          agency: "McLean County Government",
          naicsCode: null,
          description: null,
          postedDate: null,
          responseDeadline: null,
          url: href,
          source: "state-local",
          sourceLabel: "McLean County",
        });
      }

      if (results.length > 0) {
        console.log(`[ky-local] McLean County: ${results.length} bids found`);
        return results;
      }
    } catch (err) {
      console.warn(`[ky-local] McLean County (${base}) failed:`, (err as Error).message);
    } finally {
      await browser.close();
    }
  }

  console.log("[ky-local] McLean County: site unreachable or no matching bids");
  return [];
}

async function scrapeKyEProcurement(): Promise<LocalOpportunity[]> {
  const urls = [
    "https://procurement.ky.gov/Pages/BidOpportunities.aspx",
    "https://eprocurement.ky.gov",
    "https://emars.ky.gov",
  ];

  const PROCUREMENT_KEYWORDS = [
    "asphalt", "paving", "sealcoat", "pavement", "road", "parking", "resurfacing",
  ];

  for (const base of urls) {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (compatible; BuildProBot/1.0; +https://buildpro.app)"
      );
      await page.goto(base, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT_MS });

      const links = await page.evaluate(() => {
        const results: Array<{ text: string; href: string }> = [];
        document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
          const text = a.textContent?.trim() ?? "";
          if (text.length > 4) results.push({ text, href: a.href });
        });
        return results;
      });

      const results: LocalOpportunity[] = [];
      for (const { text, href } of links) {
        const lower = text.toLowerCase();
        if (!PROCUREMENT_KEYWORDS.some((kw) => lower.includes(kw))) continue;
        results.push({
          noticeId: `ky-eprocure-${slugify(text)}`,
          title: text,
          agency: "Kentucky eProcurement",
          naicsCode: null,
          description: null,
          postedDate: null,
          responseDeadline: null,
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
  console.log("[ky-local] Starting Kentucky local bid scrape");

  const [hancock, daviess, ohio, mclean, kyState] = await Promise.allSettled([
    scrapeHancockCounty(),
    scrapeDaviessCounty(),
    scrapeOhioCounty(),
    scrapeMcLeanCounty(),
    scrapeKyEProcurement(),
  ]);

  const all: LocalOpportunity[] = [];

  for (const result of [hancock, daviess, ohio, mclean, kyState]) {
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

  console.log(`[ky-local] Total KY local bids: ${deduped.length}`);
  return deduped;
}
