/**
 * Kentucky eMarketplace / VSS (Vendor Self-Service) public solicitation connector.
 *
 * Data source: Kentucky Finance Cabinet procurement system (CGI Advantage 4).
 *
 * The portal migrated from web.emarketplace.ky.gov (PeopleSoft) to
 * vss.ky.gov/vssprod-ext/Advantage4 (CGI Advantage 4) in 2024.  The new
 * system is a full Angular SPA — no server-rendered solicitation listings
 * exist, so this connector uses Puppeteer to render the page and extract
 * solicitation data.
 *
 * "My Commodities" (account-specific matching) requires a VSS vendor login that
 * we intentionally do not store.  Instead, opportunities are filtered client-side
 * by the business's capability keywords — the same localKeywords used for the
 * municipal scraper.  The UI source management panel notes this limitation.
 */

import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { LocalOpportunity } from "./kyLocalBids.js";

const PAGE_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; BuildProBot/1.0; +https://buildpro.app)";

// ── Primary portal (CGI Advantage 4 Angular SPA) ──────────────────────────────
// Migrated from web.emarketplace.ky.gov (PeopleSoft) in 2024.
// Plain HTTP fetch returns only the Angular shell — Puppeteer is required.
const VSS_BASE_URL = "https://vss.ky.gov/vssprod-ext/Advantage4";

const VSS_CANDIDATES: Array<{ url: string; label: string; requiresPuppeteer?: boolean }> = [
  // Primary: CGI Advantage 4 SPA — Puppeteer clicks into Published Solicitations
  {
    url: VSS_BASE_URL,
    label: "KY VSS (vss.ky.gov) — Angular SPA",
    requiresPuppeteer: true,
  },
  // Finance Cabinet eProcurement page — may list links to VSS solicitations
  {
    url: "https://finance.ky.gov/eProcurement/Pages/default.aspx",
    label: "KY Finance Cabinet eProcurement",
  },
  // Kentucky One Stop Business Portal procurement page
  {
    url: "https://onestop.ky.gov/expand/pages/govprocurements.aspx",
    label: "KY One Stop Procurement",
  },
];

// Solicitation number patterns used for stable deduplication IDs.
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

  const agency    = item.agency ?? item.department ?? item.buyer ?? "Kentucky State Government";
  const posted    = parseIsoDate(item.openDate ?? item.postedDate);
  const closing   = parseIsoDate(item.closingDateTime ?? item.closingDate ?? item.dueDate);
  const detailUrl = item.url ?? item.detailUrl ?? (solNum
    ? `${VSS_BASE_URL}?solicitation=${encodeURIComponent(solNum)}`
    : VSS_BASE_URL);

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

// ── HTML parser (table / card / link-scan) ────────────────────────────────────

function resolveUrl(base: string, href: string): string {
  if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) return "";
  try { return new URL(href, base).href; } catch { return href; }
}

function parseHtmlResponse(html: string, baseUrl: string): LocalOpportunity[] {
  const $ = cheerio.load(html);
  const results: LocalOpportunity[] = [];
  const seen = new Set<string>();

  // ── Strategy 1: structured table rows ────────────────────────────────────────
  const tableRows = $(
    "table.ms-listviewtable tr, table.soi-grid tr, table.grid tr, .bid-table tr, .opportunities-table tr, " +
    "table.solicitations-table tr, table[data-testid] tr, .ag-row, .cdk-row"
  );

  if (tableRows.length > 1) {
    const headers: string[] = [];
    tableRows.first().find("th, .ag-header-cell-text").each((_, th) => {
      headers.push($(th).text().trim().toLowerCase());
    });

    const colIdx = (keywords: string[]) => {
      const i = headers.findIndex((h) => keywords.some((kw) => h.includes(kw)));
      return i >= 0 ? i : -1;
    };

    const titleIdx   = colIdx(["solicitation title", "bid title", "title", "description", "name"]);
    const solIdx     = colIdx(["solicitation number", "bid number", "sol no", "number", "sol #"]);
    const agencyIdx  = colIdx(["agency", "department", "buyer", "organization"]);
    const postedIdx  = colIdx(["posted", "open date", "issue date", "publish"]);
    const closingIdx = colIdx(["due", "closing", "deadline", "response", "close"]);
    const statusIdx  = colIdx(["status"]);

    tableRows.slice(1).each((_, row) => {
      const cells = $(row).find("td, .ag-cell, .cdk-cell");
      if (cells.length < 2) return;

      const cell  = (i: number) => (i >= 0 ? cells.eq(i).text().trim() : "");
      const link  = $(row).find("a[href]").first();
      const href  = resolveUrl(baseUrl, link.attr("href") ?? "");
      const title = titleIdx >= 0 ? cell(titleIdx) : (link.text().trim() || cell(0));
      if (!title || title.length < 4) return;

      const solNum   = solIdx >= 0 ? cell(solIdx) : (SOL_NUMBER_RE.exec($(row).text())?.[0] ?? null);
      const agency   = agencyIdx  >= 0 ? cell(agencyIdx)  : "Kentucky State Government";
      const posted   = parseIsoDate(postedIdx  >= 0 ? cell(postedIdx)  : null);
      const closing  = parseIsoDate(closingIdx >= 0 ? cell(closingIdx) : null);
      const status   = statusIdx  >= 0 ? cell(statusIdx)  : null;
      const noticeId = stableId(solNum, title);
      if (seen.has(noticeId)) return;
      seen.add(noticeId);

      const descParts: string[] = [];
      if (solNum) descParts.push(`Solicitation: ${solNum}`);
      if (status) descParts.push(`Status: ${status}`);

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
      "article.bid, article.solicitation, .bid-card, .opp-card, " +
      ".solicitation-row, .bid-row, [class*='solicitation'], [class*='bid-item']"
    );

    cards.each((_, el) => {
      const $el   = $(el);
      const link  = $el.find("a[href]").first();
      const title = ($el.find("h1,h2,h3,h4,.title,.bid-title,.opp-title,.solicitation-title").first().text().trim() || link.text().trim());
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
        responseDeadline: parseIsoDate($el.find(".due-date,.closing-date,.deadline,.close-date").first().text().trim()) ?? parseDueDateFromText(fullText),
        url:              href || baseUrl,
        source:           "state-local",
        sourceLabel:      "KY eMarketplace",
      });
    });
  }

  // ── Strategy 3: link scan with solicitation number detection ─────────────────
  if (results.length === 0) {
    $("a[href]").each((_, el) => {
      const $el  = $(el);
      const text = $el.text().trim();
      const href = resolveUrl(baseUrl, $el.attr("href") ?? "");

      const isLikelySolicitation =
        href.includes("solicitation") || href.includes("bid") || href.includes("opportunity") ||
        href.includes("contract") || href.includes("rfp") || href.includes("rfq") ||
        SOL_NUMBER_RE.test(text) || SOL_NUMBER_RE.test(href);

      if (!text || text.length < 4 || text.length > 200) return;
      if (!isLikelySolicitation) return;

      const container = $el.closest("li, tr, div, article, section");
      const fullText  = container.text().replace(/\s+/g, " ").trim() || text;
      const solNum    = SOL_NUMBER_RE.exec(fullText)?.[0] ?? null;
      const noticeId  = stableId(solNum, href || text);
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

// ── Puppeteer (CGI Advantage 4 Angular SPA) ───────────────────────────────────
// The new vss.ky.gov portal is a full Angular SPA.  A plain HTTP fetch only
// returns the shell HTML.  Puppeteer navigates to the Published Solicitations
// section and waits for Angular to render the list.

async function fetchWithPuppeteer(url: string): Promise<string | null> {
  try {
    const { launchBrowser } = await import("./launchBrowser.js");
    const browser = await launchBrowser();
    const page    = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    // Navigate to the Angular SPA home page
    await page.goto(url, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT_MS });

    // The home page has a "View Published Solicitations" link.  Try to click it.
    // CGI Advantage 4 may use hash routing — the fragment varies by deployment.
    const clicked = await page.evaluate(() => {
      // Find the link whose text contains "Published Solicitations" or "Business Opportunities"
      const anchors = Array.from(document.querySelectorAll("a, button, [role='link'], [role='button'], mat-card, .card"));
      const target  = anchors.find((el) => {
        const t = (el as HTMLElement).innerText ?? "";
        return /published\s+solicitation|business\s+opportunit/i.test(t);
      }) as HTMLElement | undefined;
      if (target) { target.click(); return true; }
      return false;
    });

    if (clicked) {
      // Wait for the solicitation table / list to render after Angular navigation
      await page.waitForSelector(
        "table, .solicitation-item, .bid-item, .soi-item, .solicitation-row, " +
        ".ag-row, .cdk-row, a[href*='solicitation'], a[href*='bid']",
        { timeout: 15_000 }
      ).catch(() => {});

      // Extra settle time for Angular data loading
      await new Promise((r) => setTimeout(r, 3_000));
    } else {
      // Could not find the button — wait a bit for any dynamic content
      await new Promise((r) => setTimeout(r, 5_000));
    }

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
 * Fetch Kentucky state solicitations from the VSS portal (vss.ky.gov).
 *
 * @param localKeywords  Capability keyword list from the business profile.
 *                       Pass an empty array to keep everything.
 * @returns Array of matched solicitations in LocalOpportunity format.
 */
export async function fetchKyVssSolicitations(
  localKeywords: string[]
): Promise<LocalOpportunity[]> {
  console.log("[ky-vss] Starting Kentucky eMarketplace solicitation fetch (vss.ky.gov)");
  const kwLower = localKeywords.map((k) => k.toLowerCase());

  let lastError: string | undefined;

  for (const candidate of VSS_CANDIDATES) {
    if (candidate.requiresPuppeteer) {
      console.log(`[ky-vss] Trying Puppeteer: ${candidate.label}`);
      const html = await fetchWithPuppeteer(candidate.url);
      if (html) {
        const trimmed = html.trimStart();
        let opps: LocalOpportunity[];

        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          opps = parseJsonResponse(html);
          console.log(`[ky-vss] ${candidate.label}: JSON response (Puppeteer) — ${opps.length} solicitation(s)`);
        } else {
          opps = parseHtmlResponse(html, candidate.url);
          console.log(`[ky-vss] ${candidate.label}: HTML response (Puppeteer) — ${opps.length} solicitation(s)`);
        }

        if (opps.length > 0) {
          return filterByKeywords(opps, kwLower);
        }
        console.log(`[ky-vss] ${candidate.label}: Puppeteer returned 0 solicitations (Angular may not have rendered data yet)`);
        lastError = "Puppeteer rendered 0 solicitations from Angular SPA";
      } else {
        lastError = "Puppeteer render failed";
      }
      continue;
    }

    try {
      const body    = await fetchHtml(candidate.url);
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

      console.log(`[ky-vss] ${candidate.label}: no parseable solicitations; trying next`);

    } catch (err) {
      lastError = (err as Error).message;
      console.warn(`[ky-vss] ${candidate.label} failed: ${lastError}`);
    }
  }

  // All candidates exhausted
  throw new Error(
    `Kentucky eMarketplace (vss.ky.gov): all ${VSS_CANDIDATES.length} endpoint(s) unreachable or returned no data. ` +
    `Last error: ${lastError ?? "unknown"}. ` +
    `The new CGI Advantage 4 SPA at ${VSS_BASE_URL} requires Puppeteer/Chrome to render solicitation data.`
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
