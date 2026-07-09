import PDFDocument from "pdfkit";
import { db } from "@workspace/db";
import {
  materialListsTable,
  materialListItemsTable,
  jobsTable,
  clientsTable,
  settingsTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

const AMBER = "#f59e0b";
const DARK  = "#1f2937";
const GRAY  = "#6b7280";
const LGRAY = "#9ca3af";
const BORDER = "#e5e7eb";

function fmtUSD(n: number): string {
  return `$${n.toFixed(2)}`;
}

export async function generateMaterialsPdfBuffer(
  jobId: number
): Promise<{ buffer: Buffer; filename: string } | null> {
  // Fetch job info
  const [jobRow] = await db
    .select({
      id: jobsTable.id,
      title: jobsTable.title,
      address: jobsTable.address,
      city: jobsTable.city,
      state: jobsTable.state,
      locationName: jobsTable.locationName,
      clientName: clientsTable.name,
    })
    .from(jobsTable)
    .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
    .where(eq(jobsTable.id, jobId));

  if (!jobRow) return null;

  // Fetch all material lists for this job
  const lists = await db
    .select()
    .from(materialListsTable)
    .where(eq(materialListsTable.jobId, jobId));

  if (lists.length === 0) return null;

  const listIds = lists.map(l => l.id);
  const allItems = await db
    .select()
    .from(materialListItemsTable)
    .where(inArray(materialListItemsTable.listId, listIds));

  // Group items by list
  const itemsByList: Record<number, typeof allItems> = {};
  for (const item of allItems) {
    if (!itemsByList[item.listId]) itemsByList[item.listId] = [];
    itemsByList[item.listId].push(item);
  }

  // Check that at least one list has items
  const hasAny = lists.some(l => (itemsByList[l.id] ?? []).length > 0);
  if (!hasAny) return null;

  const [settings] = await db
    .select({ companyName: settingsTable.companyName })
    .from(settingsTable)
    .limit(1);

  const companyName = settings?.companyName ?? "";
  const jobTitle = jobRow.title ?? "Job";

  // ── Build PDF ──────────────────────────────────────────────────────────────
  const ML = 36;
  const PW = 612;
  const L = ML;
  const R = PW - ML;
  const W = R - L;

  const doc = new PDFDocument({
    size: "Letter",
    margins: { top: ML, bottom: ML, left: ML, right: ML },
    autoFirstPage: true,
    info: {
      Title: `Materials — ${jobTitle}`,
      Author: companyName || "Contractor",
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

  // ── Header ────────────────────────────────────────────────────────────────
  if (companyName) {
    doc.font("Helvetica").fontSize(7.5).fillColor(LGRAY)
       .text(companyName.toUpperCase(), L, doc.y, { width: W });
    doc.y += 2;
  }

  doc.font("Helvetica-Bold").fontSize(18).fillColor(DARK)
     .text(jobTitle, L, doc.y, { width: W });
  doc.y += 3;

  const metaParts: string[] = [];
  if (jobRow.clientName) metaParts.push(jobRow.clientName);
  const loc = [jobRow.locationName, jobRow.city, jobRow.state].filter(Boolean).join(", ");
  if (loc) metaParts.push(loc);
  if (metaParts.length) {
    doc.font("Helvetica").fontSize(9).fillColor(GRAY)
       .text(metaParts.join("  ·  "), L, doc.y, { width: W });
    doc.y += 3;
  }

  doc.font("Helvetica-Bold").fontSize(10).fillColor(AMBER)
     .text("MATERIALS LIST", L, doc.y, { width: W });
  doc.y += 8;
  hRule("#d1d5db", 1);

  // ── Table header ─────────────────────────────────────────────────────────
  const COL = {
    desc:  { x: L,         w: W * 0.42 },
    qty:   { x: L + W * 0.42, w: W * 0.10 },
    unit:  { x: L + W * 0.52, w: W * 0.10 },
    cost:  { x: L + W * 0.62, w: W * 0.18 },
    total: { x: L + W * 0.80, w: W * 0.20 },
  };

  function tableHeader() {
    const y = doc.y;
    doc.save()
       .rect(L, y, W, 16)
       .fillColor("#f9fafb")
       .fill()
       .restore();
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(LGRAY);
    doc.text("DESCRIPTION",   COL.desc.x + 4,  y + 4, { width: COL.desc.w,  lineBreak: false });
    doc.text("QTY",           COL.qty.x,        y + 4, { width: COL.qty.w,   align: "right", lineBreak: false });
    doc.text("UNIT",          COL.unit.x,       y + 4, { width: COL.unit.w,  align: "right", lineBreak: false });
    doc.text("UNIT COST",     COL.cost.x,       y + 4, { width: COL.cost.w,  align: "right", lineBreak: false });
    doc.text("TOTAL",         COL.total.x,      y + 4, { width: COL.total.w, align: "right", lineBreak: false });
    doc.y = y + 16;
    hRule();
  }

  tableHeader();

  // ── Lists ─────────────────────────────────────────────────────────────────
  let grandTotal = 0;

  for (const list of lists) {
    const items = itemsByList[list.id] ?? [];
    if (items.length === 0) continue;

    const markup = parseFloat(list.markup ?? "40");
    const markupMult = 1 + markup / 100;

    // List sub-header
    ensureSpace(40);
    const shY = doc.y;
    doc.save().rect(L, shY, W, 15).fillColor("#fffbeb").fill().restore();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(AMBER)
       .text(list.name ?? "Materials", L + 4, shY + 3, { width: W * 0.6, lineBreak: false });
    doc.font("Helvetica").fontSize(7.5).fillColor(GRAY)
       .text(`${markup}% markup`, R - 80, shY + 4, { width: 80, align: "right", lineBreak: false });
    doc.y = shY + 15;

    let listTotal = 0;

    for (const item of items) {
      const unitCost = parseFloat(item.unitCostSnapshot ?? "0");
      const qty = parseFloat(item.qty ?? "1");
      const unitWith = unitCost * markupMult;
      const rowTotal = qty * unitWith;
      listTotal += rowTotal;

      ensureSpace(14);
      const rowY = doc.y;

      doc.font("Helvetica").fontSize(8.5).fillColor(DARK)
         .text(item.nameSnapshot ?? "", COL.desc.x + 4, rowY, { width: COL.desc.w - 4, lineBreak: false });
      doc.font("Helvetica").fontSize(8.5).fillColor(GRAY)
         .text(qty % 1 === 0 ? qty.toString() : qty.toFixed(2), COL.qty.x, rowY, { width: COL.qty.w, align: "right", lineBreak: false });
      doc.text(item.unitSnapshot ?? "ea", COL.unit.x, rowY, { width: COL.unit.w, align: "right", lineBreak: false });
      doc.text(fmtUSD(unitCost), COL.cost.x, rowY, { width: COL.cost.w, align: "right", lineBreak: false });
      doc.font("Helvetica").fontSize(8.5).fillColor(DARK)
         .text(fmtUSD(rowTotal), COL.total.x, rowY, { width: COL.total.w, align: "right", lineBreak: false });
      doc.y = rowY + 14;
    }

    // List subtotal
    grandTotal += listTotal;
    doc.y += 2;
    const stY = doc.y;
    doc.save().moveTo(COL.total.x, stY).lineTo(R, stY).strokeColor(BORDER).lineWidth(0.5).stroke().restore();
    doc.y = stY + 3;
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(DARK)
       .text("List subtotal", COL.cost.x, doc.y, { width: COL.cost.w, align: "right", lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(AMBER)
       .text(fmtUSD(listTotal), COL.total.x, doc.y, { width: COL.total.w, align: "right", lineBreak: false });
    doc.y += 14;
    doc.y += 4;
  }

  // ── Grand total ───────────────────────────────────────────────────────────
  hRule("#d1d5db", 1);
  const gtY = doc.y;
  doc.save().rect(L, gtY, W, 22).fillColor("#fffbeb").fill().restore();
  doc.font("Helvetica-Bold").fontSize(11).fillColor(DARK)
     .text("Total Materials", L + 8, gtY + 5, { width: W * 0.7, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(AMBER)
     .text(fmtUSD(grandTotal), L + W * 0.7, gtY + 5, { width: W * 0.3, align: "right", lineBreak: false });
  doc.y = gtY + 22 + 8;

  // ── Footer ────────────────────────────────────────────────────────────────
  const genDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  doc.font("Helvetica").fontSize(7.5).fillColor(LGRAY)
     .text(`Generated ${genDate}${companyName ? ` · ${companyName}` : ""}`, L, doc.y, { width: W, align: "center" });

  doc.end();

  await new Promise<void>((resolve) => doc.on("end", resolve));
  const buffer = Buffer.concat(chunks);
  const safeTitle = jobTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  return { buffer, filename: `Materials-${safeTitle}.pdf` };
}
