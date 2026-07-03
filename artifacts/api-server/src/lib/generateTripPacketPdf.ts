import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { ObjectStorageService } from "./objectStorage.js";
import { buildTripPacketData, type TripPacketData, type PacketPhoto } from "./tripPacket.js";

const BLUE   = "#1d4ed8";
const DARK   = "#1f2937";
const GRAY   = "#6b7280";
const LGRAY  = "#9ca3af";
const BORDER = "#e5e7eb";
const GREEN  = "#16a34a";

// Display order for travel expense category groups
const CATEGORY_ORDER = ["Travel/Lodging", "Meals", "Parking/Tolls", "Fuel/Travel"];

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

export async function generateTripPacketPdfBuffer(jobId: number): Promise<{ buffer: Buffer; filename: string } | null> {
  const data = await buildTripPacketData(jobId);
  if (!data) return null;

  const objStorage = new ObjectStorageService();

  // ── Download all embeddable images up front ───────────────────────────────
  const receiptBufs = new Map<number, Buffer>(); // expenseId -> image buffer
  await Promise.all(
    data.travelExpenses
      .filter(e => e.receiptRawPath && !isPdfPath(e.receiptRawPath))
      .map(async (e) => {
        const buf = await downloadPhoto(objStorage, e.receiptRawPath!);
        if (buf) receiptBufs.set(e.id, buf);
      })
  );

  const MAX_LOG_PHOTOS = 4;
  const MAX_FINISHED_PHOTOS = 8;
  const logPhotoBufs = new Map<number, Buffer[]>(); // logId -> buffers
  await Promise.all(
    data.dailyLogs.map(async (log) => {
      const bufs: Buffer[] = [];
      for (const p of log.photos.slice(0, MAX_LOG_PHOTOS)) {
        if (isPdfPath(p.rawPath)) continue;
        const buf = await downloadPhoto(objStorage, p.rawPath);
        if (buf) bufs.push(buf);
      }
      if (bufs.length) logPhotoBufs.set(log.id, bufs);
    })
  );

  const finishedBufs: Buffer[] = [];
  for (const p of data.finishedPhotos.slice(0, MAX_FINISHED_PHOTOS) as PacketPhoto[]) {
    if (isPdfPath(p.rawPath)) continue;
    const buf = await downloadPhoto(objStorage, p.rawPath);
    if (buf) finishedBufs.push(buf);
  }

  // ── Build PDF ─────────────────────────────────────────────────────────────
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
      Title: `Trip Documentation - ${data.job.title}`,
      Author: data.companyName ?? "Contractor",
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

  function labelValue(label: string, value: string) {
    ensureSpace(14);
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(GRAY)
       .text(label, L, y, { width: 130, lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor(DARK)
       .text(value, L + 135, y, { width: W - 135 });
    doc.y += 2;
  }

  function drawPhotoGrid(bufs: Buffer[], startX: number, availW: number, photoW: number, photoH: number) {
    if (bufs.length === 0) return;
    const gap = 6;
    const perRow = Math.max(1, Math.floor((availW + gap) / (photoW + gap)));
    let col = 0;
    let rowY = doc.y;
    for (const buf of bufs) {
      if (col === 0) {
        ensureSpace(photoH + 6);
        rowY = doc.y;
      }
      const px = startX + col * (photoW + gap);
      try {
        doc.image(buf, px, rowY, { fit: [photoW, photoH], align: "center", valign: "center" });
      } catch { /* skip unreadable photo */ }
      col++;
      if (col >= perRow) {
        col = 0;
        doc.y = rowY + photoH + gap;
      }
    }
    if (col > 0) doc.y = rowY + photoH + gap;
  }

  const genDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // ── Header ────────────────────────────────────────────────────────────────
  if (data.companyName) {
    doc.font("Helvetica").fontSize(7.5).fillColor(LGRAY)
       .text(data.companyName.toUpperCase(), L, doc.y, { width: W });
    doc.y += 2;
  }
  doc.font("Helvetica-Bold").fontSize(18).fillColor(DARK)
     .text("Trip Documentation Packet", L, doc.y, { width: W });
  doc.y += 2;
  doc.font("Helvetica").fontSize(10).fillColor(GRAY)
     .text(data.job.title, L, doc.y, { width: W });
  doc.y += 2;
  doc.font("Helvetica").fontSize(8).fillColor(LGRAY)
     .text(`Generated ${genDate}`, L, doc.y, { width: W });
  doc.y += 6;
  hRule("#d1d5db", 1);

  // ── Trip / Job Summary ────────────────────────────────────────────────────
  sectionHeading("Trip & Job Summary");
  if (data.client) {
    const clientBits = [data.client.name];
    const clientLoc = [data.client.address, data.client.city, data.client.state].filter(Boolean).join(", ");
    if (clientLoc) clientBits.push(clientLoc);
    labelValue("Customer", clientBits.join(" — "));
    if (data.client.phone || data.client.email) {
      labelValue("Customer contact", [data.client.phone, data.client.email].filter(Boolean).join("  ·  "));
    }
  }
  const jobLoc = [data.job.locationName, data.job.address, data.job.city, data.job.state].filter(Boolean).join(", ");
  if (jobLoc) labelValue("Job location", jobLoc);
  const dates = [fmtDate(data.job.startDate), fmtDate(data.job.endDate)].filter(Boolean).join("  to  ");
  if (dates) labelValue("Job dates", dates);
  labelValue("Job status", data.job.status);
  if (data.job.jobType) labelValue("Job type", data.job.jobType);
  if (data.crew.length) labelValue("Crew", data.crew.join(", "));
  if (data.job.description) labelValue("Work description", data.job.description);

  // ── Travel Expenses ───────────────────────────────────────────────────────
  sectionHeading("Travel Expenses");
  if (data.travelExpenses.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(GRAY)
       .text("No travel expenses are linked to this job yet.", L, doc.y, { width: W });
    doc.y += 4;
  } else {
    const groups = new Map<string, typeof data.travelExpenses>();
    for (const e of data.travelExpenses) {
      const key = e.category;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    const orderedKeys = [
      ...CATEGORY_ORDER.filter(c => groups.has(c)),
      ...Array.from(groups.keys()).filter(c => !CATEGORY_ORDER.includes(c)),
    ];

    for (const cat of orderedKeys) {
      const exps = groups.get(cat)!;
      const catTotal = exps.reduce((s, e) => s + e.amount, 0);
      ensureSpace(24);
      doc.y += 2;
      {
        const y = doc.y;
        doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK)
           .text(cat, L, y, { width: W - 90, lineBreak: false });
        doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK)
           .text(fmtMoney(catTotal), R - 90, y, { width: 90, align: "right", lineBreak: false });
        doc.y = y + doc.currentLineHeight() + 2;
      }
      for (const e of exps) {
        ensureSpace(16);
        const y = doc.y;
        const desc = [fmtDate(e.date), e.vendor, e.description].filter(Boolean).join("  ·  ");
        doc.font("Helvetica").fontSize(8.5).fillColor(DARK)
           .text(desc, L + 10, y, { width: W - 100 });
        doc.font("Helvetica").fontSize(8.5).fillColor(DARK)
           .text(fmtMoney(e.amount), R - 80, y, { width: 80, align: "right", lineBreak: false });
        doc.y += 1;
        if (e.businessPurpose) {
          doc.font("Helvetica-Oblique").fontSize(8).fillColor(GRAY)
             .text(`Business purpose: ${e.businessPurpose}`, L + 10, doc.y, { width: W - 100 });
          doc.y += 1;
        }
        if (e.receiptRawPath && isPdfPath(e.receiptRawPath)) {
          doc.font("Helvetica").fontSize(7.5).fillColor(LGRAY)
             .text("Receipt on file (PDF — viewable in app)", L + 10, doc.y, { width: W - 100 });
          doc.y += 1;
        } else if (!e.receiptRawPath) {
          doc.font("Helvetica").fontSize(7.5).fillColor(LGRAY)
             .text("No receipt attached", L + 10, doc.y, { width: W - 100 });
          doc.y += 1;
        }
        doc.y += 3;
      }
    }

    ensureSpace(18);
    doc.y += 2;
    hRule();
    {
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK)
         .text("Total travel expenses", L, y, { width: W - 100, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(BLUE)
         .text(fmtMoney(data.travelTotal), R - 100, y, { width: 100, align: "right", lineBreak: false });
      doc.y = y + doc.currentLineHeight() + 4;
    }
  }

  if (data.otherExpenses.count > 0) {
    doc.font("Helvetica").fontSize(8).fillColor(GRAY)
       .text(
         `This job also has ${data.otherExpenses.count} non-travel expense${data.otherExpenses.count === 1 ? "" : "s"} totaling ${fmtMoney(data.otherExpenses.total)} (materials, labor, etc.) — not itemized here.`,
         L, doc.y, { width: W }
       );
    doc.y += 4;
  }

  // ── Receipts ──────────────────────────────────────────────────────────────
  const expensesWithReceiptImages = data.travelExpenses.filter(e => receiptBufs.has(e.id));
  if (expensesWithReceiptImages.length > 0) {
    sectionHeading("Receipts");
    for (const e of expensesWithReceiptImages) {
      ensureSpace(150);
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(DARK)
         .text(`${fmtDate(e.date)}  ·  ${e.vendor ?? e.description}  ·  ${fmtMoney(e.amount)}`, L, doc.y, { width: W });
      doc.y += 3;
      drawPhotoGrid([receiptBufs.get(e.id)!], L, W, 220, 165);
      doc.y += 4;
    }
  }

  // ── Job Photos ────────────────────────────────────────────────────────────
  const anyLogPhotos = Array.from(logPhotoBufs.values()).some(b => b.length > 0);
  if (finishedBufs.length > 0) {
    sectionHeading("Finished Work Photos");
    drawPhotoGrid(finishedBufs, L, W, 160, 120);
    doc.y += 4;
  }

  // ── Daily Logs ────────────────────────────────────────────────────────────
  if (data.dailyLogs.length > 0) {
    sectionHeading("Daily Logs — Work Performed On Site");
    for (const log of data.dailyLogs) {
      ensureSpace(30);
      const metaBits = [fmtDate(log.date)];
      if (log.authorName) metaBits.push(log.authorName);
      if (log.crewCount != null) metaBits.push(`${log.crewCount} crew`);
      if (log.hoursWorked) metaBits.push(`${log.hoursWorked} hrs`);
      if (log.weather) metaBits.push(log.weather);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK)
         .text(metaBits.join("  ·  "), L, doc.y, { width: W });
      doc.y += 1;
      if (log.workCompleted) {
        doc.font("Helvetica").fontSize(8.5).fillColor(DARK)
           .text(log.workCompleted, L + 10, doc.y, { width: W - 10 });
        doc.y += 1;
      }
      if (log.materialsUsed) {
        doc.font("Helvetica").fontSize(8).fillColor(GRAY)
           .text(`Materials: ${log.materialsUsed}`, L + 10, doc.y, { width: W - 10 });
        doc.y += 1;
      }
      if (log.issues) {
        doc.font("Helvetica").fontSize(8).fillColor(GRAY)
           .text(`Issues: ${log.issues}`, L + 10, doc.y, { width: W - 10 });
        doc.y += 1;
      }
      if (log.notes) {
        doc.font("Helvetica-Oblique").fontSize(8).fillColor(GRAY)
           .text(log.notes, L + 10, doc.y, { width: W - 10 });
        doc.y += 1;
      }
      const photos = logPhotoBufs.get(log.id) ?? [];
      if (photos.length > 0) {
        doc.y += 2;
        drawPhotoGrid(photos, L + 10, W - 10, 130, 98);
      }
      doc.y += 5;
    }
  } else if (!anyLogPhotos) {
    // no logs at all — noted implicitly; keep packet compact
  }

  // ── Completion / Sign-off ─────────────────────────────────────────────────
  if (data.checklist) {
    sectionHeading("Job Completion");
    labelValue("Checklist", data.checklist.templateName);
    labelValue("Progress", `${data.checklist.completedItems} of ${data.checklist.totalItems} items complete (${data.checklist.percent}%)`);
    if (data.checklist.percent === 100) {
      doc.font("Helvetica").fontSize(8.5).fillColor(GREEN)
         .text("✓ All checklist items complete — signed completion document available in app", L, doc.y, { width: W });
      doc.y += 3;
    }
  }

  // ── Invoices & Payments ───────────────────────────────────────────────────
  sectionHeading("Invoices & Payments Received");
  if (data.invoices.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(GRAY)
       .text("No invoices have been created for this job yet.", L, doc.y, { width: W });
    doc.y += 4;
  } else {
    for (const inv of data.invoices) {
      ensureSpace(16);
      const y = doc.y;
      const statusLabel = inv.status === "paid"
        ? `PAID${inv.paidAt ? " " + fmtDate(inv.paidAt) : ""}`
        : inv.status.toUpperCase();
      doc.font("Helvetica").fontSize(8.5).fillColor(DARK)
         .text(`Invoice ${inv.invoiceNumber}  ·  issued ${fmtDate(inv.issueDate)}`, L, y, { width: W - 200, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(inv.status === "paid" ? GREEN : GRAY)
         .text(statusLabel, R - 195, y, { width: 105, align: "right", lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(DARK)
         .text(fmtMoney(inv.total), R - 85, y, { width: 85, align: "right", lineBreak: false });
      doc.y = y + doc.currentLineHeight() + 3;
    }
    const totalInvoiced = data.invoices.reduce((s, i) => s + i.total, 0);
    const totalCollected = data.invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0);
    doc.y += 2;
    hRule();
    labelValue("Total invoiced", fmtMoney(totalInvoiced));
    labelValue("Payments received", fmtMoney(totalCollected));
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.y += 10;
  doc.font("Helvetica").fontSize(7).fillColor(LGRAY)
     .text(
       `Trip documentation packet compiled from business records on ${genDate}. Receipts, photos, daily logs, and invoices are stored in the company's job management system.`,
       L, doc.y, { width: W, align: "center" }
     );

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", resolve));

  const safeTitle = data.job.title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "job";
  return {
    buffer: Buffer.concat(chunks),
    filename: `trip-packet-${safeTitle}.pdf`,
  };
}
