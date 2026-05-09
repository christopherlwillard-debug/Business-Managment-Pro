import { launchBrowser } from "./launchBrowser.js";

const SAM_API_BASE = "https://api.sam.gov/opportunities/v2/search";

export interface FetchedDocument {
  text: string;
  source: "pdf" | "html" | "description";
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return result.text?.slice(0, 30000) ?? "";
}

async function fetchPdfBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BuildPro/1.0)" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("pdf") && !url.toLowerCase().endsWith(".pdf")) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function fetchHtmlText(url: string): Promise<string | null> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    return text.slice(0, 30000);
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}

async function fetchSamAttachmentUrl(noticeId: string): Promise<string | null> {
  const apiKey = process.env["SAM_GOV_API_KEY"];
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
}): Promise<FetchedDocument> {
  const { noticeId, url, source, description } = opts;

  if (source === "federal" || source === "sam") {
    const attachmentUrl = await fetchSamAttachmentUrl(noticeId);
    if (attachmentUrl) {
      const buf = await fetchPdfBuffer(attachmentUrl);
      if (buf) {
        const text = await extractTextFromPdf(buf);
        if (text.length > 100) return { text, source: "pdf" };
      }
    }
  }

  if (url) {
    const buf = await fetchPdfBuffer(url);
    if (buf) {
      const text = await extractTextFromPdf(buf);
      if (text.length > 100) return { text, source: "pdf" };
    }

    const html = await fetchHtmlText(url);
    if (html && html.length > 100) return { text: html, source: "html" };
  }

  return {
    text: description ?? "No document content available.",
    source: "description",
  };
}
