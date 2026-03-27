import { Router } from "express";
import { db } from "@workspace/db";
import {
  generated1099sTable,
  subcontractorsTable,
  paymentsTable,
  settingsTable,
  expensesTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

const THRESHOLD = 2000;

// GET /api/1099s/report?year=YYYY
// Returns the year-end 1099 report for all subcontractors
router.get("/report", async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const userId = (req as any).user?.id as string;

    const [settings] = await db.select().from(settingsTable).limit(1);
    const subs = await db.select().from(subcontractorsTable).orderBy(subcontractorsTable.name);

    // Fetch existing generated 1099s for this year/user
    const existing = await db
      .select()
      .from(generated1099sTable)
      .where(
        and(
          eq(generated1099sTable.userId, userId),
          eq(generated1099sTable.taxYear, year)
        )
      );
    const existingBySubId = new Map(existing.map(e => [e.subcontractorId, e]));

    const results = await Promise.all(subs.map(async (s) => {
      // Sum all payments to this sub for the year
      const [payRow] = await db
        .select({ total: sql<string>`COALESCE(SUM(${paymentsTable.amount}), 0)` })
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.subcontractorId, s.id),
            eq(paymentsTable.year, year)
          )
        );

      // Also sum subcontractor-category expenses for this year
      const yearStr = String(year);
      const [expRow] = await db
        .select({ total: sql<string>`COALESCE(SUM(${expensesTable.amount}), 0)` })
        .from(expensesTable)
        .where(
          and(
            eq(expensesTable.subcontractorId, s.id),
            sql`LOWER(${expensesTable.category}) = 'subcontractor'`,
            sql`${expensesTable.date} LIKE ${yearStr + "-%"}`
          )
        );

      const totalQualifying = parseFloat(payRow?.total ?? "0") + parseFloat(expRow?.total ?? "0");
      const existingRecord = existingBySubId.get(s.id) ?? null;

      return {
        subcontractorId: s.id,
        name: s.name,
        totalQualifying,
        w9Complete: !!(s.w9Signature && s.w9LegalName && s.w9TaxId && s.w9TaxIdType && s.w9Address && s.w9City && s.w9State && s.w9Zip && s.w9TaxClassification),
        w9OnFile: s.w9OnFile,
        requires1099: totalQualifying >= THRESHOLD,
        threshold: THRESHOLD,
        status: existingRecord ? "generated" : totalQualifying >= THRESHOLD ? "required" : "below_threshold",
        existingRecord: existingRecord
          ? {
              id: existingRecord.id,
              generatedAt: existingRecord.generatedAt,
              totalPaid: parseFloat(String(existingRecord.totalPaid)),
            }
          : null,
        // W-9 fields for PDF generation (TIN masked for PII protection)
        w9LegalName: s.w9LegalName,
        w9BusinessName: s.w9BusinessName,
        w9Address: s.w9Address,
        w9City: s.w9City,
        w9State: s.w9State,
        w9Zip: s.w9Zip,
        w9TaxIdType: s.w9TaxIdType,
        w9TaxIdLastFour: s.w9TaxId ? s.w9TaxId.slice(-4) : null,
      };
    }));

    res.json({
      year,
      threshold: THRESHOLD,
      payerSettings: settings
        ? {
            companyName: settings.companyName,
            companyAddress: settings.companyAddress,
            companyCity: settings.companyCity,
            companyState: settings.companyState,
            companyZip: settings.companyZip,
            companyPhone: settings.companyPhone,
            ein: settings.ein,
          }
        : {},
      subcontractors: results,
    });
  } catch (err) {
    console.error("1099 report error:", err);
    res.status(500).json({ error: "Failed to generate 1099 report" });
  }
});

// POST /api/1099s/generate/:subcontractorId?year=YYYY
// Saves a generated 1099 record (PDF stored as base64 by the client)
router.post("/generate/:subcontractorId", async (req, res) => {
  try {
    const subcontractorId = parseInt(req.params.subcontractorId);
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const userId = (req as any).user?.id as string;
    const { totalPaid, pdfData } = req.body;

    if (!totalPaid) return res.status(400).json({ error: "totalPaid is required" });

    // Upsert: delete any existing record for this sub/year/user, then insert new
    await db
      .delete(generated1099sTable)
      .where(
        and(
          eq(generated1099sTable.userId, userId),
          eq(generated1099sTable.subcontractorId, subcontractorId),
          eq(generated1099sTable.taxYear, year)
        )
      );

    const [record] = await db
      .insert(generated1099sTable)
      .values({
        userId,
        subcontractorId,
        taxYear: year,
        totalPaid: totalPaid.toString(),
        pdfData: pdfData ?? null,
      })
      .returning();

    res.status(201).json({
      id: record.id,
      subcontractorId: record.subcontractorId,
      taxYear: record.taxYear,
      totalPaid: parseFloat(String(record.totalPaid)),
      generatedAt: record.generatedAt,
    });
  } catch (err) {
    console.error("1099 generate error:", err);
    res.status(500).json({ error: "Failed to save 1099 record" });
  }
});

// DELETE /api/1099s/:id
// Permanently deletes a generated 1099 record (ownership verified)
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req as any).user?.id as string;

    const deleted = await db
      .delete(generated1099sTable)
      .where(
        and(
          eq(generated1099sTable.id, id),
          eq(generated1099sTable.userId, userId)
        )
      )
      .returning({ id: generated1099sTable.id });

    if (!deleted.length) return res.status(404).json({ error: "Not found" });
    res.status(204).end();
  } catch (err) {
    console.error("1099 delete error:", err);
    res.status(500).json({ error: "Failed to delete 1099 record" });
  }
});

// GET /api/1099s/download/:id
// Returns the PDF data (base64) for a generated 1099
router.get("/download/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req as any).user?.id as string;

    const [record] = await db
      .select()
      .from(generated1099sTable)
      .where(
        and(
          eq(generated1099sTable.id, id),
          eq(generated1099sTable.userId, userId)
        )
      );

    if (!record) return res.status(404).json({ error: "Not found" });

    res.json({
      id: record.id,
      pdfData: record.pdfData,
      taxYear: record.taxYear,
      totalPaid: parseFloat(String(record.totalPaid)),
    });
  } catch (err) {
    console.error("1099 download error:", err);
    res.status(500).json({ error: "Failed to fetch 1099" });
  }
});

export default router;
