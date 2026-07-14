import { Router } from "express";
import multer from "multer";
import OpenAI from "openai";
import ExcelJS from "exceljs";
import { Readable } from "stream";
import { db } from "@workspace/db";
import { expensesTable, jobsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const CATEGORIES = [
  "Materials",             // Sch C Line 4
  "Advertising",           // Sch C Line 8
  "Fuel/Travel",           // Sch C Line 9
  "Subcontractor",         // Sch C Line 11
  "Insurance",             // Sch C Line 15
  "Professional Services", // Sch C Line 17
  "Office/Admin",          // Sch C Line 18
  "Rent/Lease",            // Sch C Line 20
  "Repairs/Maintenance",   // Sch C Line 21
  "Tools/Equipment",       // Sch C Line 22
  "Utilities",             // Sch C Line 25
  "Other",                 // Sch C Line 27
];

function guessCategory(text: string): string {
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

function excelSerialToYMD(n: number): { y: number; m: number; d: number } | null {
  const ms = (n - 25569) * 86400 * 1000;
  const date = new Date(ms);
  if (isNaN(date.getTime())) return null;
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

async function readWorksheetRows(buffer: Buffer): Promise<unknown[][]> {
  const workbook = new ExcelJS.Workbook();
  const isOoxmlZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isLegacyXls = buffer[0] === 0xd0 && buffer[1] === 0xcf;
  if (isLegacyXls) {
    throw new Error("Legacy .xls format is not supported. Please save your file as .xlsx or .csv and try again.");
  }
  const buf = Buffer.from(buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  if (isOoxmlZip) {
    await workbook.xlsx.load(buf);
  } else {
    const stream = Readable.from([buffer]);
    await workbook.csv.read(stream);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    rows.push((row.values as unknown[]).slice(1));
  });
  return rows;
}

function normalizeDate(raw: string | number | Date | undefined): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "number") {
    const d = excelSerialToYMD(raw);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(raw).trim();
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function normalizeAmount(raw: any): number {
  if (typeof raw === "number") return raw;
  const s = String(raw).replace(/[$,\s]/g, "");
  return parseFloat(s) || 0;
}

// ─── POST /api/expense-import/parse-receipt ────────────────────────────────────
// Accepts a PDF or image file, returns extracted expense fields via AI
router.post("/parse-receipt", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { mimetype, buffer } = req.file;
    const isPdf   = mimetype === "application/pdf" || req.file.originalname.toLowerCase().endsWith(".pdf");
    const isImage = mimetype.startsWith("image/");

    let messages: OpenAI.ChatCompletionMessageParam[];

    if (isPdf) {
      // Extract text from PDF then send to GPT as text
      // @ts-ignore — pdf-parse types not available
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const data = await pdfParse(buffer);
      const text = data.text.slice(0, 4000);

      messages = [
        {
          role: "user",
          content: `You are a receipt/invoice parser for a contractor expense tracking app.

Extract expense information from this text and return ONLY valid JSON (no markdown, no explanation):

{
  "description": "short description of what was purchased",
  "vendor": "store or company name",
  "amount": 0.00,
  "date": "YYYY-MM-DD",
  "category": "one of: Materials, Advertising, Fuel/Travel, Subcontractor, Insurance, Professional Services, Office/Admin, Rent/Lease, Repairs/Maintenance, Tools/Equipment, Utilities, Other",
  "notes": "any useful notes (optional, empty string if none)"
}

If a field cannot be determined, use reasonable defaults (today's date, empty string for optional fields, 0 for amount).

Receipt/Invoice text:
${text}`,
        },
      ];
    } else if (isImage) {
      const b64 = buffer.toString("base64");
      const dataUrl = `data:${mimetype};base64,${b64}`;
      messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a receipt/invoice parser for a contractor expense tracking app.

Extract expense information from this receipt image and return ONLY valid JSON (no markdown, no explanation):

{
  "description": "short description of what was purchased",
  "vendor": "store or company name",
  "amount": 0.00,
  "date": "YYYY-MM-DD",
  "category": "one of: Materials, Advertising, Fuel/Travel, Subcontractor, Insurance, Professional Services, Office/Admin, Rent/Lease, Repairs/Maintenance, Tools/Equipment, Utilities, Other",
  "notes": "any useful notes (optional, empty string if none)"
}

If a field cannot be determined, use reasonable defaults (today's date, empty string for optional fields, 0 for amount).`,
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ];
    } else {
      return res.status(400).json({ error: "File must be a PDF or image (JPG, PNG, etc.)" });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 512,
      messages,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let parsed: any = {};
    try { parsed = JSON.parse(cleaned); } catch { parsed = {}; }

    const today = new Date().toISOString().slice(0, 10);
    const category = CATEGORIES.includes(parsed.category) ? parsed.category : guessCategory(parsed.description ?? "");

    res.json({
      description: parsed.description ?? "",
      vendor:      parsed.vendor      ?? "",
      amount:      typeof parsed.amount === "number" ? parsed.amount : normalizeAmount(parsed.amount),
      date:        parsed.date         ?? today,
      category,
      notes:       parsed.notes        ?? "",
    });
  } catch (err) {
    console.error("parse-receipt error:", err);
    res.status(500).json({ error: "Failed to parse receipt. Please fill in the details manually." });
  }
});

// ─── POST /api/expense-import/parse-spreadsheet ───────────────────────────────
// Accepts a CSV or Excel file, returns an array of expense row previews
router.post("/parse-spreadsheet", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const rows: any[][] = await readWorksheetRows(req.file.buffer) as any[][];

    if (rows.length < 2) return res.json({ rows: [], headers: [] });

    const headers: string[] = rows[0].map((h: any) => String(h).trim());

    // Auto-map columns by common names
    function findCol(names: string[]): number {
      return headers.findIndex(h =>
        names.some(n => h.toLowerCase().includes(n.toLowerCase()))
      );
    }
    const colDate        = findCol(["date", "day", "when"]);
    const colDesc        = findCol(["description", "desc", "item", "detail", "memo", "note", "what"]);
    const colAmount      = findCol(["amount", "cost", "price", "total", "charge", "spend", "$"]);
    const colVendor      = findCol(["vendor", "store", "merchant", "supplier", "payee", "from"]);
    const colCategory    = findCol(["category", "cat", "type", "kind", "class"]);
    const colNotes       = findCol(["notes", "note", "memo", "comment", "remark"]);

    const parsed = rows.slice(1).map((row, i) => {
      const raw = {
        date:        colDate     >= 0 ? row[colDate]     : "",
        description: colDesc     >= 0 ? row[colDesc]     : row[1] ?? "",
        amount:      colAmount   >= 0 ? row[colAmount]   : row[2] ?? "",
        vendor:      colVendor   >= 0 ? row[colVendor]   : "",
        category:    colCategory >= 0 ? row[colCategory] : "",
        notes:       colNotes    >= 0 ? row[colNotes]    : "",
      };

      const description = String(raw.description).trim();
      const vendor      = String(raw.vendor).trim();
      const amount      = normalizeAmount(raw.amount);
      const date        = normalizeDate(raw.date);
      const catRaw      = String(raw.category).trim();
      const category    = CATEGORIES.includes(catRaw) ? catRaw : guessCategory(description + " " + vendor + " " + catRaw);
      const notes       = String(raw.notes).trim();

      return { _row: i + 2, description, vendor, amount, date, category, notes, valid: !!description && amount > 0 };
    }).filter(r => r.description || r.amount > 0);

    res.json({ headers, rows: parsed });
  } catch (err) {
    console.error("parse-spreadsheet error:", err);
    res.status(500).json({ error: "Failed to parse spreadsheet." });
  }
});

// ─── POST /api/expense-import/bulk ────────────────────────────────────────────
// Accepts a JSON array of expense rows, creates all of them
router.post("/bulk", async (req, res) => {
  try {
    const { expenses: rows, businessId } = req.body as { expenses: any[]; businessId?: number | string };
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: "No expense rows provided" });

    const parsedBusinessId = businessId ? parseInt(String(businessId)) : null;
    const today = new Date().toISOString().slice(0, 10);
    const values = rows.map(r => ({
      description: String(r.description ?? "Imported expense").slice(0, 255),
      amount:      String(normalizeAmount(r.amount)),
      category:    CATEGORIES.includes(r.category) ? r.category : "Other",
      date:        r.date ?? today,
      vendor:      r.vendor ? String(r.vendor).slice(0, 255) : null,
      notes:       r.notes ? String(r.notes).slice(0, 1000) : null,
      jobId:       r.jobId ? parseInt(r.jobId) : null,
      receiptUrl:  null,
      businessId:  parsedBusinessId,
    }));

    const created = await db.insert(expensesTable).values(values).returning();
    res.status(201).json({ count: created.length, expenses: created });
  } catch (err) {
    console.error("bulk import error:", err);
    res.status(500).json({ error: "Failed to import expenses." });
  }
});

export default router;
