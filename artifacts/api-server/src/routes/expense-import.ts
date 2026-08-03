import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { parseReceiptFile, CATEGORIES, guessCategory, normalizeAmount } from "./receipt-parser";
import { Readable } from "stream";
import { db } from "@workspace/db";
import { expensesTable, jobsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });


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

// ─── POST /api/expense-import/parse-receipt ────────────────────────────────────
// Delegates to the shared receipt-parser pipeline (image → vision, PDF → text/vision).
router.post("/parse-receipt", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ errorType: "unsupported_file", error: "No file uploaded." });
    }
    const result = await parseReceiptFile(req.file as { mimetype: string; buffer: Buffer; originalname: string });
    if (!result.ok) {
      return res.status(422).json({ errorType: result.errorType, error: result.error });
    }
    res.json(result.data);
  } catch (err) {
    console.error("parse-receipt error:", err);
    res.status(500).json({
      errorType: "unreadable_receipt",
      error: "Failed to parse receipt. Please fill in the details manually.",
    });
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
      const category    = (CATEGORIES as readonly string[]).includes(catRaw) ? catRaw : guessCategory(description + " " + vendor + " " + catRaw);
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
      category:    (CATEGORIES as readonly string[]).includes(r.category) ? r.category : "Other",
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
