import { launchBrowser } from "./launchBrowser.js";
import { getCredential } from "./credentialManager.js";
import { lookup } from "node:dns/promises";
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
// pdf-parse is CJS-only; use createRequire for ESM-safe interop
const pdfParse = _require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;

const SAM_API_BASE = "https://api.sam.gov/opportunities/v2/search";

const PRIVATE_IP_RE = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:)/i;

async function isSafeUrl(rawUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const hostname = parsed.hostname;
  if (PRIVATE_IP_RE.test(hostname)) return false;
  if (hostname === "localhost" || hostname.endsWith(".local")) return false;

  try {
    const { address } = await lookup(hostname);
    if (PRIVATE_IP_RE.test(address)) return false;
    if (address === "127.0.0.1" || address === "::1") return false;
  } catch {
    return false;
  }

  return true;
}

export interface FetchedDocument {
  text: string;
  source: "pdf" | "html" | "description";
}

async function extractTextFromPdf(buffer: Buffer, maxChars = 30000): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text?.slice(0, maxChars) ?? "";
}

const MAX_REDIRECTS = 5;

async function safeFetch(startUrl: string, init: RequestInit = {}): Promise<Response | null> {
  let currentUrl = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isSafeUrl(currentUrl))) {
      console.warn("[bid-doc] Blocked unsafe URL (hop", hop, "):", currentUrl);
      return null;
    }
    const res = await fetch(currentUrl, {
      ...init,
      redirect: "manual",
      signal: init.signal ?? AbortSignal.timeout(20000),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }
    return res;
  }
  console.warn("[bid-doc] Too many redirects for:", startUrl);
  return null;
}

async function fetchPdfBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await safeFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BuildPro/1.0)" },
    });
    if (!res || !res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("pdf") && !url.toLowerCase().endsWith(".pdf")) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function fetchHtmlText(url: string, maxChars = 30000): Promise<string | null> {
  if (!(await isSafeUrl(url))) {
    console.warn("[bid-doc] Blocked unsafe URL for Puppeteer:", url);
    return null;
  }
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      const reqUrl = req.url();
      const safe = await isSafeUrl(reqUrl).catch(() => false);
      if (!safe) {
        console.warn("[bid-doc] Puppeteer blocked unsafe nav:", reqUrl);
        req.abort("blockedbyclient");
      } else {
        req.continue();
      }
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    return text.slice(0, maxChars);
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}

async function fetchSamAttachmentUrl(noticeId: string): Promise<string | null> {
  const apiKey = getCredential("sam_gov", "SAM_GOV_API_KEY");
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      noticeid: noticeId,
      limit: "1",
      offset: "0",
    });
    const res = await fetch(`${SAM_API_BASE}?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    const data = await res.json() as {
      opportunitiesData?: Array<{
        resourceLinks?: string[];
        additionalInfoLink?: string;
      }>;
    };

    const opp = data.opportunitiesData?.[0];
    if (!opp) return null;

    const links = opp.resourceLinks ?? [];
    const pdfLink = links.find((l) => l.toLowerCase().endsWith(".pdf"));
    return pdfLink ?? links[0] ?? opp.additionalInfoLink ?? null;
  } catch {
    return null;
  }
}

export async function fetchBidDocument(opts: {
  noticeId: string;
  url: string | null;
  source: string;
  description: string | null;
  maxChars?: number;
}): Promise<FetchedDocument> {
  const { noticeId, url, source, description, maxChars = 30000 } = opts;

  if (source === "federal" || source === "sam") {
    const attachmentUrl = await fetchSamAttachmentUrl(noticeId);
    if (attachmentUrl) {
      const buf = await fetchPdfBuffer(attachmentUrl);
      if (buf) {
        const text = await extractTextFromPdf(buf, maxChars);
        if (text.length > 100) return { text, source: "pdf" };
      }
    }
  }

  if (url) {
    const buf = await fetchPdfBuffer(url);
    if (buf) {
      const text = await extractTextFromPdf(buf, maxChars);
      if (text.length > 100) return { text, source: "pdf" };
    }

    const html = await fetchHtmlText(url, maxChars);
    if (html && html.length > 100) return { text: html, source: "html" };
  }

  return {
    text: description ?? "No document content available.",
    source: "description",
  };
}
