import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { db } from "@workspace/db";
import { businessTripsTable, expensesTable, jobsTable, settingsTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage.js";

const BLUE   = "#1d4ed8";
const DARK   = "#1f2937";
const GRAY   = "#6b7280";
const LGRAY  = "#9ca3af";
const BORDER = "#e5e7eb";
const GREEN  = "#16a34a";
const AMBER  = "#d97706";

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isPdfPath(p: string | null | undefined): boolean {
  return !!p && p.toLowerCase().split("?")[0].endsWith(".pdf");
}

async function downloadPhoto(objStorage: ObjectStorageService, rawPath: string): Promise<Buffer | null> {
  try {
    if (rawPath.startsWith("/objects/")) {
      const file = await objStorage.getObjectEntityFile(rawPath);
      const [buf] = await file.download();
      return buf as Buffer;
    }
    const uploadsPrefix = rawPath.startsWith("/api/uploads/")
      ? rawPath.slice("/api/uploads/".length)
      : rawPath.startsWith("/uploads/")
        ? rawPath.slice("/uploads/".length)
        : null;
    if (uploadsPrefix) {
      const uploadsRoot = path.resolve("uploads");
      const filePath = path.resolve(uploadsRoot, uploadsPrefix);
      if (filePath.startsWith(uploadsRoot + path.sep) && fs.existsSync(filePath)) {
        return fs.readFileSync(filePath);
      }
    }
  } catch { /* skip failed downloads */ }
  return null;
}

export async function generateTripAuditPdfBuffer(tripId: number): Promise<{ buffer: Buffer; filename: string } | null> {
  const [tripRow] = await db
    .select({
      id: businessTripsTable.id,
      destination: businessTripsTable.destination,
      businessPurpose: businessTripsTable.businessPurpose,
      startDate: businessTripsTable.startDate,
      endDate: businessTripsTable.endDate,
      jobId: businessTripsTable.jobId,
      status: businessTripsTable.status,
      closedAt: businessTripsTable.closedAt,
      jobTitle: jobsTable.title,
    })
    .from(businessTripsTable)
    .leftJoin(jobsTable, eq(businessTripsTable.jobId, jobsTable.id))
    .where(eq(businessTripsTable.id, tripId))
    .limit(1);

  if (!tripRow) return null;

  const receipts = await db
    .select({
      id: expensesTable.id,
      description: expensesTable.description,
      amount: expensesTable.amount,
      category: expensesTable.category,
      date: expensesTable.date,
      vendor: expensesTable.vendor,
      receiptUrl: expensesTable.receiptUrl,
      receiptStatus: expensesTable.receiptStatus,
      receiptMissingExplanation: expensesTable.receiptMissingExplanation,
      notes: expensesTable.notes,
      mealTotal: expensesTable.mealTotal,
      deductibleAmount: expensesTable.deductibleAmount,
      overnightTravel: expensesTable.overnightTravel,
    })
    .from(expensesTable)
    .where(eq(expensesTable.tripId, tripId))
    .orderBy(asc(expensesTable.date));

  const settingsRows = await db.select({ companyName: settingsTable.companyName }).from(settingsTable).limit(1);
  const companyName = settingsRows[0]?.companyName ?? null;

  const objStorage = new ObjectStorageService();
  const receiptBufs = new Map<number, Buffer>();
  await Promise.all(
    receipts
      .filter(r => r.receiptUrl && !isPdfPath(r.receiptUrl))
      .map(async r => {
        const buf = await downloadPhoto(objStorage, r.receiptUrl!);
        if (buf) receiptBufs.set(r.id, buf);
      })
  );

  // ── Computed checklist values ─────────────────────────────────────────────
  const totalAmount = receipts.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
  const mealReceipts = receipts.filter(r => r.category?.toLowerCase() === "meals");
  const mealTotal = mealReceipts.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
  const deductibleMeals = mealReceipts.reduce((s, r) => {
    const da = r.deductibleAmount ? parseFloat(r.deductibleAmount) : parseFloat(r.amount ?? "0") * 0.5;
    return s + da;
  }, 0);
  const mealsCount = mealReceipts.length;
  const mealsOvernightAnswered = mealReceipts.filter(r => r.overnightTravel !== null && r.overnightTravel !== undefined).length;
  const missingCount = receipts.filter(r =>
    (r.receiptStatus === "missing" && !r.receiptMissingExplanation?.trim()) ||
    (r.receiptStatus === "uploaded" && !r.receiptUrl?.trim())
  ).length;

  // Category breakdown
  const catTotals = new Map<string, number>();
  for (const r of receipts) {
    const cat = r.category ?? "Other";
    catTotals.set(cat, (catTotals.get(cat) ?? 0) + parseFloat(r.amount ?? "0"));
  }

  // ── PDF layout constants ───────────────────────────────────────────────────
  const ML = 36, MR = 36;
  const PW = 612;
  const L = ML;
  const R = PW - MR;
  const W = R - L;

  const doc = new PDFDocument({
    size: "Letter",
    margins: { top: ML, bottom: MR, left: ML, right: MR },
    autoFirstPage: true,
    info: {
      Title: `Business Trip Audit Packet — ${tripRow.destination}`,
      Author: companyName ?? "Contractor",
    },
  }) as any;

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  function ensureSpace(needed: number) {
    const pageBottom = (doc.page.height as number) - (doc.page.margins.bottom as number);
    if (doc.y + needed > pageBottom) doc.addPage();
  }

  function hRule(color = BORDER, weight = 0.5) {
    const y = doc.y;
    doc.save().moveTo(L, y).lineTo(R, y).strokeColor(color).lineWidth(weight).stroke().restore();
    doc.y = y + 6;
  }

  function sectionHeading(label: string) {
    ensureSpace(30);
    doc.y += 6;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(BLUE)
       .text(label.toUpperCase(), L, doc.y, { width: W, characterSpacing: 0.8 });
    doc.y += 3;
    hRule("#bfdbfe", 1);
  }

  function labelValue(label: string, value: string, valueColor = DARK) {
    ensureSpace(14);
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(GRAY)
       .text(label, L, y, { width: 140, lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor(valueColor)
       .text(value, L + 145, y, { width: W - 145 });
    doc.y += 2;
  }

  function checkRow(label: string, ok: boolean, note: string) {
    ensureSpace(14);
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(ok ? GREEN : AMBER)
       .text(ok ? "✓" : "○", L, y, { width: 14, lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor(ok ? DARK : GRAY)
       .text(label, L + 16, y, { width: W - 16 - 150, lineBreak: false });
    if (note) {
      doc.font("Helvetica").fontSize(8.5).fillColor(LGRAY)
         .text(note, R - 145, y, { width: 145, align: "right", lineBreak: false });
    }
    doc.y = y + doc.currentLineHeight() + 3;
  }

  const genDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // ── Header ─────────────────────────────────────────────────────────────────
  if (companyName) {
    doc.font("Helvetica").fontSize(7.5).fillColor(LGRAY)
       .text(companyName.toUpperCase(), L, doc.y, { width: W });
    doc.y += 2;
  }
  doc.font("Helvetica-Bold").fontSize(18).fillColor(DARK)
     .text("Business Trip Audit Packet", L, doc.y, { width: W });
  doc.y += 2;
  doc.font("Helvetica").fontSize(11).fillColor(BLUE)
     .text(tripRow.destination, L, doc.y, { width: W });
  doc.y += 2;
  doc.font("Helvetica").fontSize(8).fillColor(LGRAY)
     .text(`Generated ${genDate}`, L, doc.y, { width: W });
  doc.y += 6;
  hRule("#d1d5db", 1);

  // ── Trip Summary ───────────────────────────────────────────────────────────
  sectionHeading("Trip Summary");
  labelValue("Destination", tripRow.destination);
  if (tripRow.startDate || tripRow.endDate) {
    const dates = [fmtDate(tripRow.startDate), fmtDate(tripRow.endDate)].filter(Boolean).join("  →  ");
    labelValue("Dates", dates);
  } else {
    labelValue("Dates", "Not recorded", AMBER);
  }
  labelValue("Business purpose", tripRow.businessPurpose?.trim() || "Not recorded", tripRow.businessPurpose?.trim() ? DARK : AMBER);
  if (tripRow.jobTitle) labelValue("Linked job", tripRow.jobTitle);
  labelValue("Status", tripRow.status.charAt(0).toUpperCase() + tripRow.status.slice(1));
  labelValue("Total receipts", `${receipts.length}`);
  labelValue("Total spend", fmtMoney(totalAmount));

  // ── IRS Audit Checklist ────────────────────────────────────────────────────
  sectionHeading("IRS Audit Checklist (IRC §162 / Rev. Proc. 2019-48)");
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(GRAY)
     .text("IRS requires: destination, dates, business purpose, and receipts for expenses ≥ $75.", L, doc.y, { width: W });
  doc.y += 8;

  checkRow("Destination recorded", !!tripRow.destination?.trim(), tripRow.destination ?? "");
  checkRow("Business purpose documented", !!tripRow.businessPurpose?.trim(), tripRow.businessPurpose?.trim() ?? "Missing");
  checkRow("Start date recorded", !!tripRow.startDate, tripRow.startDate ? fmtDate(tripRow.startDate) : "Missing");
  checkRow("End date recorded", !!tripRow.endDate, tripRow.endDate ? fmtDate(tripRow.endDate) : "Missing");
  checkRow("Receipts logged", receipts.length > 0, `${receipts.length} receipt${receipts.length !== 1 ? "s" : ""}`);
  checkRow("No unproven receipts", missingCount === 0, missingCount > 0 ? `${missingCount} unproven` : "All proven");
  if (mealsCount > 0) {
    checkRow("Overnight travel answered on all meals", mealsOvernightAnswered >= mealsCount, `${mealsOvernightAnswered}/${mealsCount}`);
  }
  checkRow("Linked to a job (optional)", !!tripRow.jobId, tripRow.jobTitle ?? (tripRow.jobId ? `Job #${tripRow.jobId}` : "Not linked"));

  // Overall readiness
  const allRequiredOk = !!tripRow.destination?.trim() && !!tripRow.businessPurpose?.trim() &&
    !!tripRow.startDate && !!tripRow.endDate && receipts.length > 0 && missingCount === 0 &&
    (mealsCount === 0 || mealsOvernightAnswered >= mealsCount);
  doc.y += 4;
  hRule();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(allRequiredOk ? GREEN : AMBER)
     .text(allRequiredOk ? "✓ This trip meets IRS substantiation requirements." : "○ Action required — complete items marked above before an audit.", L, doc.y, { width: W });
  doc.y += 8;

  // ── Expense Breakdown ──────────────────────────────────────────────────────
  sectionHeading("Expense Breakdown");
  if (receipts.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(GRAY)
       .text("No receipts have been added to this trip yet.", L, doc.y, { width: W });
    doc.y += 4;
  } else {
    const CATEGORY_ORDER = ["Travel/Lodging", "Meals", "Parking/Tolls", "Fuel/Travel"];
    const orderedKeys = [
      ...CATEGORY_ORDER.filter(c => catTotals.has(c)),
      ...Array.from(catTotals.keys()).filter(c => !CATEGORY_ORDER.includes(c)),
    ];
    for (const cat of orderedKeys) {
      ensureSpace(14);
      const y = doc.y;
      doc.font("Helvetica").fontSize(8.5).fillColor(DARK)
         .text(cat, L, y, { width: W - 100, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(DARK)
         .text(fmtMoney(catTotals.get(cat)!), R - 95, y, { width: 95, align: "right", lineBreak: false });
      doc.y = y + doc.currentLineHeight() + 2;
    }
    doc.y += 2;
    hRule();
    {
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK)
         .text("Total", L, y, { width: W - 100, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(BLUE)
         .text(fmtMoney(totalAmount), R - 95, y, { width: 95, align: "right", lineBreak: false });
      doc.y = y + doc.currentLineHeight() + 4;
    }
  }

  // ── Meal Deduction Summary ─────────────────────────────────────────────────
  if (mealTotal > 0) {
    sectionHeading("Meal Deduction Summary (IRS 50% Rule)");
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(GRAY)
       .text("Business meals are generally 50% deductible per IRC §274(n). Only meals during overnight or away-from-home travel qualify.", L, doc.y, { width: W });
    doc.y += 8;
    labelValue("Total meal spend", fmtMoney(mealTotal));
    labelValue("Deductible amount (50%)", fmtMoney(deductibleMeals), GREEN);
    labelValue("Non-deductible portion", fmtMoney(mealTotal - deductibleMeals));
    if (mealsCount > 0) {
      labelValue("Overnight travel confirmed", `${mealsOvernightAnswered} of ${mealsCount} meal receipt${mealsCount !== 1 ? "s" : ""}`);
    }
  }

  // ── Per-Receipt Detail ─────────────────────────────────────────────────────
  sectionHeading(`Receipt Detail (${receipts.length} item${receipts.length !== 1 ? "s" : ""})`);
  if (receipts.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(GRAY)
       .text("No receipts recorded.", L, doc.y, { width: W });
    doc.y += 4;
  }
  for (const r of receipts) {
    ensureSpace(receiptBufs.has(r.id) ? 160 : 28);
    const y = doc.y;
    const headerBits = [fmtDate(r.date), r.vendor, r.description].filter(Boolean).join("  ·  ");
    const amt = parseFloat(r.amount ?? "0");
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(DARK)
       .text(headerBits, L, y, { width: W - 90, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(DARK)
       .text(fmtMoney(amt), R - 85, y, { width: 85, align: "right", lineBreak: false });
    doc.y = y + doc.currentLineHeight() + 1;
    if (r.category) {
      doc.font("Helvetica").fontSize(7.5).fillColor(LGRAY)
         .text(r.category, L + 10, doc.y, { width: W - 10 });
      doc.y += 1;
    }
    if (r.notes?.trim()) {
      doc.font("Helvetica-Oblique").fontSize(8).fillColor(GRAY)
         .text(`Purpose: ${r.notes.trim()}`, L + 10, doc.y, { width: W - 100 });
      doc.y += 1;
    }
    const imgBuf = receiptBufs.get(r.id);
    if (imgBuf) {
      ensureSpace(130);
      try {
        doc.image(imgBuf, L + 10, doc.y, { fit: [200, 120], align: "left", valign: "top" });
        doc.y += 126;
      } catch { /* skip unreadable image */ }
    } else if (r.receiptUrl && isPdfPath(r.receiptUrl)) {
      doc.font("Helvetica").fontSize(7.5).fillColor(LGRAY)
         .text("Receipt on file (PDF — viewable in app)", L + 10, doc.y, { width: W - 100 });
      doc.y += 1;
    } else if (r.receiptStatus === "missing" && r.receiptMissingExplanation?.trim()) {
      doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(GRAY)
         .text(`Missing — ${r.receiptMissingExplanation.trim()}`, L + 10, doc.y, { width: W - 100 });
      doc.y += 1;
    } else if (!r.receiptUrl) {
      doc.font("Helvetica").fontSize(7.5).fillColor(AMBER)
         .text("No receipt attached", L + 10, doc.y, { width: W - 100 });
      doc.y += 1;
    }
    doc.y += 6;
    if (receipts.indexOf(r) < receipts.length - 1) {
      hRule("#f3f4f6", 0.5);
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  doc.y += 8;
  doc.font("Helvetica").fontSize(7).fillColor(LGRAY)
     .text(
       `Business trip audit packet generated ${genDate}.` +
       (companyName ? ` — ${companyName}.` : "") +
       " Retain this document with original receipts for tax purposes.",
       L, doc.y, { width: W, align: "center" }
     );

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", resolve));

  const safeDest = tripRow.destination.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-").slice(0, 50) || "trip";
  return {
    buffer: Buffer.concat(chunks),
    filename: `trip-audit-packet-${safeDest}.pdf`,
  };
}
