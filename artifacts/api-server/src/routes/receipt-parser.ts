/**
 * Shared receipt-parsing pipeline used by both the admin expense-import route
 * and the subcontractor portal's parse-receipt endpoint.
 */

import OpenAI from "openai";
import { BUILDPRO_AI_MODEL } from "../ai-models";

// ─── Shared OpenAI client ──────────────────────────────────────────────────────
export const receiptOpenai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ─── Category helpers ──────────────────────────────────────────────────────────
export const CATEGORIES = [
  "Materials",
  "Advertising",
  "Fuel/Travel",
  "Subcontractor",
  "Insurance",
  "Professional Services",
  "Office/Admin",
  "Rent/Lease",
  "Repairs/Maintenance",
  "Tools/Equipment",
  "Utilities",
  "Other",
] as const;

export function guessCategory(text: string): string {
  const t = text.toLowerCase();
  if (/lumber|concrete|pipe|wire|paint|drywall|hardware|home depot|lowe|menards|material/.test(t)) return "Materials";
  if (/\bad\b|advertis|marketing|flyer|signage|logo|promo|ad agency/.test(t)) return "Advertising";
  if (/fuel|gas station|mileage|travel|hotel|lodging|uber|lyft|toll/.test(t)) return "Fuel/Travel";
  if (/sub|labor|contractor/.test(t)) return "Subcontractor";
  if (/insurance|policy|premium/.test(t)) return "Insurance";
  if (/accountant|lawyer|legal|cpa|consultant|professional service/.test(t)) return "Professional Services";
  if (/office|supply|supplies|printer|software/.test(t)) return "Office/Admin";
  if (/rent|lease/.test(t)) return "Rent/Lease";
  if (/repair|fix|maintenance|patch|service call|service/.test(t)) return "Repairs/Maintenance";
  if (/tool|equipment|drill|saw|compressor/.test(t)) return "Tools/Equipment";
  if (/electric|utility|utilities|power|gas|water|sewer|internet|phone/.test(t)) return "Utilities";
  return "Other";
}

export function normalizeAmount(raw: any): number {
  if (typeof raw === "number") return raw;
  const s = String(raw).replace(/[$,\s]/g, "");
  return parseFloat(s) || 0;
}

// ─── AI message builders ───────────────────────────────────────────────────────
const RECEIPT_SYSTEM_PROMPT = `You are a receipt/invoice parser for a contractor expense tracking app.

Extract expense information and return ONLY valid JSON (no markdown, no explanation):

{
  "description": "short description of what was purchased",
  "vendor": "store or company name",
  "amount": 0.00,
  "date": "YYYY-MM-DD",
  "category": "one of: Materials, Advertising, Fuel/Travel, Subcontractor, Insurance, Professional Services, Office/Admin, Rent/Lease, Repairs/Maintenance, Tools/Equipment, Utilities, Other",
  "notes": "any useful notes (optional, empty string if none)"
}

If a field cannot be determined, use reasonable defaults (today's date, empty string for optional fields, 0 for amount).`;

export function buildTextMessages(text: string): OpenAI.ChatCompletionMessageParam[] {
  return [{ role: "user", content: `${RECEIPT_SYSTEM_PROMPT}\n\nReceipt/Invoice text:\n${text}` }];
}

export function buildVisionMessages(dataUrl: string): OpenAI.ChatCompletionMessageParam[] {
  return [{
    role: "user",
    content: [
      { type: "text", text: RECEIPT_SYSTEM_PROMPT },
      { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
    ],
  }];
}

/** Try to render the first page of a PDF buffer as a JPEG base64 string. */
export async function renderPdfPageToJpeg(buffer: Buffer): Promise<string | null> {
  try {
    // @ts-ignore — pdfjs-dist types may vary by version
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if ((pdfjs as any).GlobalWorkerOptions) {
      (pdfjs as any).GlobalWorkerOptions.workerSrc = "";
    }
    const loadingTask = (pdfjs as any).getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    const pdfDoc = await loadingTask.promise;
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });

    // @ts-ignore — @napi-rs/canvas types
    const { createCanvas } = await import("@napi-rs/canvas");
    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx as any, viewport }).promise;

    const jpegBuf: Buffer = canvas.toBuffer("image/jpeg");
    return jpegBuf.toString("base64");
  } catch (err) {
    console.warn("[parse-receipt] PDF vision fallback (render) failed:", (err as any)?.message ?? err);
    return null;
  }
}

// ─── Result types ──────────────────────────────────────────────────────────────
export interface ReceiptData {
  description: string;
  vendor: string;
  amount: number;
  date: string;
  category: string;
  notes: string;
}

export type ParseReceiptResult =
  | { ok: true; data: ReceiptData }
  | { ok: false; errorType: string; error: string };

// ─── Main pipeline ─────────────────────────────────────────────────────────────
/**
 * Full receipt-parsing pipeline: image → vision | PDF → text extraction → vision fallback.
 * Returns a discriminated-union result — callers decide how to map it to HTTP responses.
 */
export async function parseReceiptFile(file: {
  mimetype: string;
  buffer: Buffer;
  originalname: string;
}): Promise<ParseReceiptResult> {
  const { mimetype, buffer, originalname } = file;
  const isPdf   = mimetype === "application/pdf" || originalname.toLowerCase().endsWith(".pdf");
  const isImage = mimetype.startsWith("image/");

  if (!isPdf && !isImage) {
    return { ok: false, errorType: "unsupported_file", error: "Unsupported file type. Please upload a JPG, PNG, or PDF receipt." };
  }

  // ── Step 1: Build messages ──────────────────────────────────────────────────
  let messages: OpenAI.ChatCompletionMessageParam[];

  if (isPdf) {
    let extractedText = "";
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new (PDFParse as any)({ data: buffer });
      const result = await parser.getText();
      extractedText = ((result as any).text ?? "").slice(0, 4000);
    } catch (err) {
      console.warn("[parse-receipt] pdf-parse text extraction failed:", (err as any)?.message);
    }

    const hasEnoughText =
      extractedText.trim().length >= 80 &&
      extractedText.split(/\s+/).filter(Boolean).length >= 20;

    if (hasEnoughText) {
      messages = buildTextMessages(extractedText);
    } else {
      const jpegBase64 = await renderPdfPageToJpeg(buffer);
      if (jpegBase64) {
        messages = buildVisionMessages(`data:image/jpeg;base64,${jpegBase64}`);
      } else if (extractedText.trim()) {
        messages = buildTextMessages(extractedText);
      } else {
        return {
          ok: false,
          errorType: "unreadable_receipt",
          error: "We could open the PDF but couldn't read enough information. Try a clearer scan or enter the details manually.",
        };
      }
    }
  } else {
    const b64 = buffer.toString("base64");
    messages = buildVisionMessages(`data:${mimetype};base64,${b64}`);
  }

  // ── Step 2: AI extraction ───────────────────────────────────────────────────
  const completion = await receiptOpenai.chat.completions.create({
    model: BUILDPRO_AI_MODEL,
    max_completion_tokens: 512,
    messages,
  }, { signal: AbortSignal.timeout(30_000) });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  let parsed: any = {};
  try { parsed = JSON.parse(cleaned); } catch { parsed = {}; }

  // ── Step 3: Validate ────────────────────────────────────────────────────────
  const hasUsefulData = !!(parsed.description || parsed.vendor || (parsed.amount && parsed.amount !== 0));
  if (!hasUsefulData) {
    return {
      ok: false,
      errorType: "ai_extraction_failed",
      error: "The receipt was read, but we couldn't identify the vendor or totals. Please review and fill in the fields before saving.",
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const category = (CATEGORIES as readonly string[]).includes(parsed.category)
    ? parsed.category
    : guessCategory(parsed.description ?? "");

  return {
    ok: true,
    data: {
      description: parsed.description ?? "",
      vendor:      parsed.vendor      ?? "",
      amount:      normalizeAmount(parsed.amount),
      date:        parsed.date        ?? today,
      category,
      notes:       parsed.notes       ?? "",
    },
  };
}
