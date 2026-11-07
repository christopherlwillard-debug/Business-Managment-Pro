import { launchBrowser } from "./launchBrowser.js";
import { getCredential } from "./credentialManager.js";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
// pdf-parse is CJS-only; use createRequire for ESM-safe interop
const pdfParse = _require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;

const SAM_API_BASE = "https://api.sam.gov/opportunities/v2/search";

/** Reject private, loopback, link-local, shared, documentation, and non-routable IP ranges. */
export function isUnsafeIpAddress(rawAddress: string): boolean {
  const address = rawAddress.replace(/^\[|\]$/g, "").toLowerCase();
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split(".").map(Number);
    const [a, b, c] = octets;
    return a === 0
      || a === 10
      || a === 127
      || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 192 && b === 88 && c === 99)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113);
  }
  if (family === 6) {
    // Only global-unicast 2000::/3 is permitted. This also rejects IPv4-mapped,
    // loopback, unspecified, ULA, link-local, multicast, and reserved ranges.
    return !/^[23]/.test(address) || address.startsWith("2001:db8:");
  }
  return true;
}

async function isSafeUrl(rawUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) return false;
  if (isIP(hostname) !== 0) return !isUnsafeIpAddress(hostname);

  try {
    const resolved = await lookup(hostname, { all: true, verbatim: true });
    if (resolved.length === 0 || resolved.some(({ address }) => isUnsafeIpAddress(address))) return false;
  } catch {
    return false;
  }

  return true;
}

export interface FetchedDocument {
  text: string;
  source: "pdf" | "html" | "description";
}

/** A malformed or encrypted source PDF should fall back to HTML/description, not fail the whole bid analysis. */
export async function extractTextFromPdf(buffer: Buffer, maxChars = 30000): Promise<string> {
  try {
    const result = await pdfParse(buffer);
    return result.text?.slice(0, maxChars) ?? "";
  } catch (error) {
    console.warn("[bid-doc] PDF text extraction failed; trying fallback content:", (error as Error).message);
    return "";
  }
}

const MAX_REDIRECTS = 5;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

/** Read a response body with a hard byte ceiling to prevent oversized PDFs exhausting memory. */
export async function readLimitedResponseBuffer(
  response: Response,
  maxBytes = MAX_PDF_BYTES,
): Promise<Buffer | null> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return null;

  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, totalBytes);
  } catch {
    return null;
  } finally {
    try { reader.releaseLock(); } catch { /* stream may already be cancelled */ }
  }
}

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
    return await readLimitedResponseBuffer(res);
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
