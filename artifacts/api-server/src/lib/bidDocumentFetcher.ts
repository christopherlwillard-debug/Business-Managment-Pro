import { getCredential } from "./credentialManager.js";
import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { load as loadHtml } from "cheerio";
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
// pdf-parse is CJS-only; use createRequire for ESM-safe interop
const pdfParse = _require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;

const SAM_API_BASE = "https://api.sam.gov/opportunities/v2/search";

/** Reject private, loopback, link-local, shared, documentation, and non-routable IP ranges. */
export function isUnsafeIpAddress(rawAddress: string): boolean {
  const address = rawAddress.replace(/^\\[|\\]$/g, "").toLowerCase();
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

type ResolvedAddress = { address: string; family: number };

async function resolvePublicAddresses(url: URL): Promise<ResolvedAddress[] | null> {
  const hostname = url.hostname.replace(/^\\[|\\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) return null;

  if (isIP(hostname) !== 0) {
    return isUnsafeIpAddress(hostname) ? null : [{ address: hostname, family: isIP(hostname) }];
  }

  try {
    const resolved = await lookup(hostname, { all: true, verbatim: true });
    if (resolved.length === 0 || resolved.some(({ address }) => isUnsafeIpAddress(address))) return null;
    return resolved;
  } catch {
    return null;
  }
}

async function isSafeUrl(rawUrl: string): Promise<boolean> {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return (await resolvePublicAddresses(parsed)) !== null;
  } catch {
    return false;
  }
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
const MAX_HTML_BYTES = 2 * 1024 * 1024;

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

/**
 * Connect to an IP address that was just validated, rather than allowing the HTTP
 * client to perform a second DNS lookup. The URL hostname remains the TLS
 * verification/SNI name; only socket address resolution is pinned.
 */
async function requestPinned(
  rawUrl: string,
  init: RequestInit,
  maxBytes: number,
): Promise<Response | null> {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const addresses = await resolvePublicAddresses(url);
  if (!addresses?.length) return null;
  const selected = addresses[0];
  const headers = new Headers(init.headers);
  const requestHeaders: Record<string, string> = {};
  headers.forEach((value, key) => { requestHeaders[key] = value; });

  const requestOptions = {
    protocol: url.protocol,
    hostname: url.hostname.replace(/^\\[|\\]$/g, ""),
    port: url.port || undefined,
    path: `${url.pathname}${url.search}`,
    method: init.method ?? "GET",
    headers: requestHeaders,
    // Node uses the URL hostname for certificate validation. The custom lookup
    // only pins the TCP destination to the already-vetted address.
    lookup: (( _hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
      callback(null, selected.address, selected.family);
    }) as LookupFunction,
    ...(url.protocol === "https:" && isIP(url.hostname.replace(/^\\[|\\]$/g, "")) === 0
      ? { servername: url.hostname }
      : {}),
  };

  const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(requestOptions);
  const signal = init.signal;
  return await new Promise<Response | null>((resolve) => {
    let settled = false;
    const finish = (value: Response | null) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => request.destroy(new Error("Request aborted"));
    if (signal?.aborted) {
      finish(null);
      request.destroy();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    request.setTimeout(20000, () => request.destroy(new Error("Request timed out")));
    request.on("error", () => finish(null));
    request.on("response", (incoming) => {
      const chunks: Buffer[] = [];
      let total = 0;
      const declaredLength = Number(incoming.headers["content-length"]);
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        incoming.destroy();
        finish(null);
        return;
      }
      incoming.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > maxBytes) {
          incoming.destroy(new Error("Response exceeded byte limit"));
          finish(null);
          return;
        }
        chunks.push(buffer);
      });
      incoming.on("end", () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) value.forEach((entry) => responseHeaders.append(name, entry));
          else if (value !== undefined) responseHeaders.set(name, value);
        }
        finish(new Response(Buffer.concat(chunks, total), {
          status: incoming.statusCode ?? 502,
          statusText: incoming.statusMessage,
          headers: responseHeaders,
        }));
      });
      incoming.on("error", () => finish(null));
    });
    request.end();
  });
}

async function safeFetch(
  startUrl: string,
  init: RequestInit = {},
  maxBytes = MAX_PDF_BYTES,
): Promise<Response | null> {
  let currentUrl = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try { parsed = new URL(currentUrl); } catch { return null; }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!(await isSafeUrl(currentUrl))) {
      console.warn("[bid-doc] Blocked unsafe URL (hop", hop, "):", currentUrl);
      return null;
    }

    // Resolve and pin again inside requestPinned. This second resolution is the
    // one used for the socket, so a DNS answer change after the initial policy
    // check cannot redirect the connection to an internal address.
    const res = await requestPinned(currentUrl, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(20000),
    }, maxBytes);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      try { currentUrl = new URL(location, currentUrl).href; } catch { return null; }
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

/**
 * HTML fallback uses the same DNS-pinned HTTP client as PDF downloads. A browser
 * is deliberately not used for untrusted solicitation pages because it can
 * independently resolve hosts for navigation, redirects, and subresources.
 */
async function fetchHtmlText(url: string, maxChars = 30000): Promise<string | null> {
  try {
    const response = await safeFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BuildPro/1.0)", Accept: "text/html" },
    }, MAX_HTML_BYTES);
    if (!response?.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return null;
    const html = await response.text();
    const $ = loadHtml(html);
    $("script, style, noscript, svg").remove();
    return $("body").text().replace(/\\s+/g, " ").trim().slice(0, maxChars);
  } catch {
    return null;
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
