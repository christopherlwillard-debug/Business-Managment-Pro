/**
 * Kentucky eMarketplace / VSS (Vendor Self-Service) public solicitation connector.
 *
 * Data source: Kentucky Finance Cabinet procurement system.
 *
 * The primary portal at web.emarketplace.ky.gov is an Angular SPA and requires
 * JavaScript rendering.  This connector attempts multiple public endpoints in
 * priority order, using plain HTTP + Cheerio where possible (server-side rendered
 * pages) and falling back to Puppeteer for the Angular SPA.
 *
 * "My Commodities" (account-specific matching) requires a VSS vendor login that
 * we intentionally do not store.  Instead, opportunities are filtered client-side
 * by the business's capability keywords — the same localKeywords used for the
 * municipal scraper.  The UI source management panel notes this limitation.
 *
 * Solicitation categories (Open, Closing Soon, Recently Published, Recent
 * Amendments, Recent Awards) are derived from the standard fields stored on each
 * bid_opportunity row and surfaced by the existing filter bar.
 */

import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { LocalOpportunity } from "./kyLocalBids.js";

const PAGE_TIMEOUT_MS = 20_000;
const USER_AGENT = "Mozilla/5.0 (compatible; BuildProBot/1.0; +https://buildpro.app)";

// ── URL candidates (tried in order) ──────────────────────────────────────────
// Note on the SPA: web.emarketplace.ky.gov/webapp/PRDVSS1X1/AltSelfService is
// Angular-rendered; a plain fetch only returns the HTML shell.  The public
// solicitation data is available from the Finance Cabinet SharePoint pages and
// from the PeopleSoft IScript data endpoint listed below.

const VSS_CANDIDATES: Array<{ url: string; label: string; requiresPuppeteer?: boolean }> = [
  // PeopleSoft IScript public data endpoint — JSON or HTML response.
  // This endpoint is accessible without authentication and returns solicitation
  // summary data in various PeopleSoft versions.
  {
    url: "https://web.emarketplace.ky.gov/psc/PRDVSS1X1pub/EMPLOYEE/ERP/s/WEBLIB_IVO_BID.ISCRIPT1.FieldFormula.IScript_Bid_Search?isJson=true",
    label: "KY VSS IScript (JSON)",
  },
  {
    url: "https://web.emarketplace.ky.gov/psc/PRDVSS1X1pub/EMPLOYEE/ERP/s/WEBLIB_IVO_BID.ISCRIPT1.FieldFormula.IScript_Bid_Search",
    label: "KY VSS IScript (HTML)",
  },
  // Kentucky Finance Cabinet SharePoint bid listings (server-rendered ASPX)
  {
    url: "https://finance.ky.gov/services/procurement/Pages/BidOpportunities.aspx",
    label: "KY Finance Cabinet Bids",
  },
  {
    url: "https://procurement.ky.gov/Pages/BidOpportunities.aspx",
    label: "KY Procurement ASPX",
  },
  // Older EMARS/eMarket static pages
  {
    url: "https://finance.ky.gov/services/procurement/bids",
    label: "KY Finance Procurement (legacy)",
  },
  // Angular SPA — use Puppeteer if all static approaches fail
  {
    url: "https://web.emarketplace.ky.gov/webapp/PRDVSS1X1/AltSelfService",
    label: "KY VSS Angular SPA",
    requiresPuppeteer: true,
  },
];

// Solicitation number patterns used for stable deduplication IDs.
// KY uses patterns like: 2400000123, SP2025-0001, KY-2025-001234, RFP-123
const SOL_NUMBER_RE = /\b(?:2[0-9]{9}|[A-Z]{2,4}[-\s]?20\d{2}[-\s]?\d{4,6}|RFP[-\s]?\d{4,7}|RFQ[-\s]?\d{4,7}|ITB[-\s]?\d{4,7}|SP\d{4}[-\s]?\d{4,6})\b/i;

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":      USER_AGENT,
        "Accept":          "text/html,application/json,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control":   "no-cache",
      },
      signal:   controller.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(tid);
  }
}

// ── Stable ID helpers ─────────────────────────────────────────────────────────

function stableId(solicitationNumber: string | null, fallback: string): string {
  const key = solicitationNumber?.trim().toLowerCase() || fallback;
  return `ky-vss-${createHash("sha1").update(key).digest("hex").slice(0, 12)}`;
}

// ── Date parsing ──────────────────────────────────────────────────────────────

function parseIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const patterns = [
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}/i,
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i,
    /(\d{1,2})-(\d{1,2})-(\d{4})/,
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
    /(?:due|deadline|close[sd]?|closing|submit(?:ted)?\s+by|bid\s+opening|proposals?\s+due|response\s+due)[:\s]+([A-Za-z0-9\s,\/\-]+)/i,
    /(?:due\s+date|response\s+deadline|closing\s+date|bid\s+due)[:\s]+([A-Za-z0-9\s,\/\-]+)/i,
  ];
  for (const pat of duePats) {
    const m = pat.exec(text);
    if (m) {
      const d = parseIsoDate(m[1].trim().slice(0, 30));
      if (d) return d;
    }
  }
  return null;
}

// ── JSON response parser ──────────────────────────────────────────────────────

interface VssJsonSolicitation {
  solicitationNumber?: string;
  bidNo?:              string;
  title?:              string;
  description?:        string;
  agency?:             string;
  department?:         string;
  buyer?:              string;
  category?:           string;
  commodity?:          string;
  postedDate?:         string;
  openDate?:           string;
  dueDate?:            string;
  closingDate?:        string;
  closingDateTime?:    string;
  status?:             string;
  url?:                string;
  detailUrl?:          string;
  amendmentDate?:      string;
  awardDate?:          string;
  awardee?:            string;
}

function mapJsonToOpportunity(item: VssJsonSolicitation): LocalOpportunity | null {
  const solNum = item.solicitationNumber ?? item.bidNo ?? null;
  const title  = (item.title ?? "").trim();
  if (!title || title.length < 4) return null;

  const agency  = item.agency ?? item.department ?? item.buyer ?? "Kentucky State Government";
  const posted  = parseIsoDate(item.openDate ?? item.postedDate);
  const closing = parseIsoDate(item.closingDateTime ?? item.closingDate ?? item.dueDate);
  const baseUrl = "https://web.emarketplace.ky.gov/webapp/PRDVSS1X1/AltSelfService";
  const detailUrl = item.url ?? item.detailUrl ?? (solNum ? `${baseUrl}?solicitation=${encodeURIComponent(solNum)}` : baseUrl);

  const descParts: string[] = [];
  if (item.category ?? item.commodity) descParts.push(`Category: ${item.category ?? item.commodity}`);
  if (item.status)                      descParts.push(`Status: ${item.status}`);
  if (item.amendmentDate)               descParts.push(`Amendment: ${item.amendmentDate}`);
  if (item.awardDate && item.awardee)   descParts.push(`Awarded to ${item.awardee} on ${item.awardDate}`);
  if (item.description)                 descParts.push(item.description.slice(0, 400));

  return {
    noticeId:         stableId(solNum, title),
    title,
    agency,
    naicsCode:        null,
    description:      descParts.join(" | ").slice(0, 600) || null,
    postedDate:       posted,
    responseDeadline: closing,
    url:              detailUrl,
    source:           "state-local",
    sourceLabel:      "KY eMarketplace",
  };
}

function parseJsonResponse(raw: string): LocalOpportunity[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }

  // Various top-level shapes the PeopleSoft IScript might return
  const items: VssJsonSolicitation[] = Array.isArray(data)
    ? data as VssJsonSolicitation[]
    : (data as Record<string, unknown>)?.solicitations   as VssJsonSolicitation[]
    ?? (data as Record<string, unknown>)?.results         as VssJsonSolicitation[]
    ?? (data as Record<string, unknown>)?.bids            as VssJsonSolicitation[]
    ?? (data as Record<string, unknown>)?.opportunities   as VssJsonSolicitation[]
    ?? [];

  const results: LocalOpportunity[] = [];
  for (const item of items) {
    const opp = mapJsonToOpportunity(item);
    if (opp) results.push(opp);
  }
  return results;
}

// ── HTML parser (SharePoint / ASPX tables and link lists) ────────────────────

function resolveUrl(base: string, href: string): string {
  if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) return "";
  try { return new URL(href, base).href; } catch { return href; }
}

function parseHtmlResponse(html: string, baseUrl: string): LocalOpportunity[] {
  const $ = cheerio.load(html);
  const results: LocalOpportunity[] = [];
  const seen = new Set<string>();

  // ── Strategy 1: structured table rows (SharePoint list view) ────────────────
  // SharePoint renders list data as <tr> rows inside .ms-listviewtable or similar.
  const tableRows = $(
    "table.ms-listviewtable tr, table.soi-grid tr, table.grid tr, .bid-table tr, .opportunities-table tr"
  );

  if (tableRows.length > 1) {
    // Try to infer column positions from <th> headers
    const headers: string[] = [];
    tableRows.first().find("th").each((_, th) => {
      headers.push($(th).text().trim().toLowerCase());
    });

    const colIdx = (keywords: string[]) => {
      const i = headers.findIndex((h) => keywords.some((kw) => h.includes(kw)));
      return i >= 0 ? i : -1;
    };

    const titleIdx   = colIdx(["title", "solicitation title", "description", "name"]);
    const solIdx     = colIdx(["solicitation number", "bid number", "sol no", "number"]);
    const agencyIdx  = colIdx(["agency", "department", "buyer", "organization"]);
    const postedIdx  = colIdx(["posted", "open date", "issue date", "publish"]);
    const closingIdx = colIdx(["due", "closing", "deadline", "response"]);
    const statusIdx  = colIdx(["status"]);

    tableRows.slice(1).each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;

      const cell = (i: number) => (i >= 0 ? cells.eq(i).text().trim() : "");
      const link  = $(row).find("a[href]").first();
      const href  = resolveUrl(baseUrl, link.attr("href") ?? "");
      const title = titleIdx >= 0 ? cell(titleIdx) : (link.text().trim() || cell(0));
      if (!title || title.length < 4) return;

      const solNum     = solIdx >= 0 ? cell(solIdx) : (SOL_NUMBER_RE.exec($(row).text())?.[0] ?? null);
      const agency     = agencyIdx  >= 0 ? cell(agencyIdx)  : "Kentucky State Government";
      const posted     = parseIsoDate(postedIdx  >= 0 ? cell(postedIdx)  : null);
      const closing    = parseIsoDate(closingIdx >= 0 ? cell(closingIdx) : null);
      const status     = statusIdx  >= 0 ? cell(statusIdx)  : null;
      const noticeId   = stableId(solNum, title);
      if (seen.has(noticeId)) return;
      seen.add(noticeId);

      const descParts: string[] = [];
      if (solNum)  descParts.push(`Solicitation: ${solNum}`);
      if (status)  descParts.push(`Status: ${status}`);

      results.push({
        noticeId,
        title,
        agency:           agency || "Kentucky State Government",
        naicsCode:        null,
        description:      descParts.join(" | ") || null,
        postedDate:       posted,
        responseDeadline: closing ?? parseDueDateFromText($(row).text()),
        url:              href || baseUrl,
        source:           "state-local",
        sourceLabel:      "KY eMarketplace",
      });
    });
  }

  // ── Strategy 2: structured cards / divs ──────────────────────────────────────
  if (results.length === 0) {
    const cards = $(
      ".solicitation-item, .bid-item, .opportunity-item, .soi-item, .contract-item, " +
      "article.bid, article.solicitation, .bid-card, .opp-card"
    );

    cards.each((_, el) => {
      const $el    = $(el);
      const link   = $el.find("a[href]").first();
      const title  = ($el.find("h1,h2,h3,h4,.title,.bid-title,.opp-title").first().text().trim() || link.text().trim());
      if (!title || title.length < 4) return;

      const href     = resolveUrl(baseUrl, link.attr("href") ?? "");
      const fullText = $el.text().replace(/\s+/g, " ").trim();
      const solNum   = SOL_NUMBER_RE.exec(fullText)?.[0] ?? null;
      const noticeId = stableId(solNum, title);
      if (seen.has(noticeId)) return;
      seen.add(noticeId);

      results.push({
        noticeId,
        title,
        agency:           $el.find(".agency,.department,.buyer,.organization").first().text().trim() || "Kentucky State Government",
        naicsCode:        null,
        description:      fullText.slice(0, 500) || null,
        postedDate:       parseIsoDate($el.find(".posted-date,.open-date,.issue-date").first().text().trim()),
        responseDeadline: parseIsoDate($el.find(".due-date,.closing-date,.deadline").first().text().trim()) ?? parseDueDateFromText(fullText),
        url:              href || baseUrl,
        source:           "state-local",
        sourceLabel:      "KY eMarketplace",
      });
    });
  }

  // ── Strategy 3: link scan with solicitation number detection ─────────────────
  if (results.length === 0) {
    $("a[href]").each((_, el) => {
      const $el   = $(el);
      const text  = $el.text().trim();
      const href  = resolveUrl(baseUrl, $el.attr("href") ?? "");

      // Must look like a solicitation link, not navigation
      const isLikelySolicitation =
        href.includes("solicitation") || href.includes("bid") || href.includes("opportunity") ||
        href.includes("contract") || href.includes("rfp") || href.includes("rfq") ||
        SOL_NUMBER_RE.test(text) || SOL_NUMBER_RE.test(href);

      if (!text || text.length < 4 || text.length > 200) return;
      if (!isLikelySolicitation) return;

      const container  = $el.closest("li, tr, div, article, section");
      const fullText   = container.text().replace(/\s+/g, " ").trim() || text;
      const solNum     = SOL_NUMBER_RE.exec(fullText)?.[0] ?? null;
      const noticeId   = stableId(solNum, href || text);
      if (seen.has(noticeId)) return;
      seen.add(noticeId);

      results.push({
        noticeId,
        title:            text,
        agency:           "Kentucky State Government",
        naicsCode:        null,
        description:      solNum ? `Solicitation: ${solNum}` : fullText.slice(0, 300) || null,
        postedDate:       parseIsoDate(fullText),
        responseDeadline: parseDueDateFromText(fullText),
        url:              href || baseUrl,
        source:           "state-local",
        sourceLabel:      "KY eMarketplace",
      });
    });
  }

  return results;
}

// ── Puppeteer fallback ────────────────────────────────────────────────────────

async function fetchWithPuppeteer(url: string): Promise<string | null> {
  try {
    // Dynamic import to avoid loading puppeteer in environments where Chrome is absent.
    const { launchBrowser } = await import("./launchBrowser.js");
    const browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });

    // Wait for the solicitation list to appear (Angular rendering delay)
    await page.waitForSelector(
      "table, .solicitation-item, .bid-item, .soi-item, a[href*='solicitation'], a[href*='bid']",
      { timeout: 10_000 }
    ).catch(() => {}); // Don't fail if selector never appears

    const html = await page.content();
    await browser.close();
    return html;
  } catch (err) {
    console.warn("[ky-vss] Puppeteer render failed:", (err as Error).message);
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fetch Kentucky state solicitations from the eMarketplace / VSS portal.
 *
 * @param localKeywords  Capability keyword list from the business profile.
 *                       Solicitations whose title+description contain none of
 *                       these are excluded (same filter used by the municipal
 *                       scraper).  Pass an empty array to keep everything.
 * @returns Array of matched solicitations in LocalOpportunity format.
 */
export async function fetchKyVssSolicitations(
  localKeywords: string[]
): Promise<LocalOpportunity[]> {
  console.log("[ky-vss] Starting Kentucky eMarketplace solicitation fetch");
  const kwLower = localKeywords.map((k) => k.toLowerCase());

  let lastError: string | undefined;

  for (const candidate of VSS_CANDIDATES) {
    if (candidate.requiresPuppeteer) {
      // Puppeteer is gated — only try in dev/environments where Chrome is available.
      // In production, Chrome may be unavailable; we skip rather than crash.
      if (process.env.NODE_ENV === "production") {
        console.log("[ky-vss] Skipping Puppeteer fallback in production environment");
        continue;
      }
      console.log(`[ky-vss] Trying Puppeteer: ${candidate.label}`);
      const html = await fetchWithPuppeteer(candidate.url);
      if (html) {
        const opps = parseHtmlResponse(html, candidate.url);
        if (opps.length > 0) {
          console.log(`[ky-vss] ${candidate.label}: ${opps.length} solicitation(s) found via Puppeteer`);
          return filterByKeywords(opps, kwLower);
        }
      }
      continue;
    }

    try {
      const body = await fetchHtml(candidate.url);

      // Detect JSON vs HTML response
      const trimmed = body.trimStart();
      let opps: LocalOpportunity[];

      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        opps = parseJsonResponse(body);
        console.log(`[ky-vss] ${candidate.label}: JSON response — ${opps.length} solicitation(s)`);
      } else {
        opps = parseHtmlResponse(body, candidate.url);
        console.log(`[ky-vss] ${candidate.label}: HTML response — ${opps.length} solicitation(s)`);
      }

      if (opps.length > 0) {
        return filterByKeywords(opps, kwLower);
      }

      // Got a successful response but parsed 0 records — the page may be the
      // SPA shell or an empty list.  Continue to the next candidate.
      console.log(`[ky-vss] ${candidate.label}: no parseable solicitations (may be SPA shell); trying next`);

    } catch (err) {
      lastError = (err as Error).message;
      console.warn(`[ky-vss] ${candidate.label} failed: ${lastError}`);
    }
  }

  // All candidates exhausted
  throw new Error(
    `Kentucky eMarketplace: all ${VSS_CANDIDATES.length} endpoint(s) unreachable or returned no data. ` +
    `Last error: ${lastError ?? "unknown"}. ` +
    `The VSS portal may require Puppeteer rendering or the URL structure has changed.`
  );
}

function filterByKeywords(opps: LocalOpportunity[], kwLower: string[]): LocalOpportunity[] {
  if (kwLower.length === 0) return opps;
  const matched = opps.filter((o) => {
    const text = `${o.title} ${o.description ?? ""}`.toLowerCase();
    return kwLower.some((kw) => text.includes(kw));
  });
  console.log(`[ky-vss] Keyword filter: ${opps.length} → ${matched.length} after applying profile keywords`);
  return matched;
}

// ── Exports for testing ───────────────────────────────────────────────────────
export { parseHtmlResponse, parseJsonResponse, stableId, parseIsoDate, parseDueDateFromText, SOL_NUMBER_RE };
