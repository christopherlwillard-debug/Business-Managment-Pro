import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { db } from "@workspace/db";
import {
  jobChecklistsTable,
  jobChecklistSectionsTable,
  jobChecklistItemsTable,
  jobChecklistItemPhotosTable,
  jobChecklistItemPartsTable,
  jobsTable,
  clientsTable,
  checklistTemplatesTable,
  settingsTable,
} from "@workspace/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage.js";

const GREEN   = "#16a34a";
const DARK    = "#1f2937";
const GRAY    = "#6b7280";
const LGRAY   = "#9ca3af";
const BORDER  = "#e5e7eb";

async function buildChecklistData(checklistId: number) {
  const [checklist] = await db
    .select()
    .from(jobChecklistsTable)
    .where(eq(jobChecklistsTable.id, checklistId));
  if (!checklist) return null;

  const sections = await db
    .select()
    .from(jobChecklistSectionsTable)
    .where(eq(jobChecklistSectionsTable.jobChecklistId, checklistId))
    .orderBy(asc(jobChecklistSectionsTable.sortOrder));

  const items = await db
    .select()
    .from(jobChecklistItemsTable)
    .where(eq(jobChecklistItemsTable.jobChecklistId, checklistId))
    .orderBy(asc(jobChecklistItemsTable.sortOrder));

  const activeItems = items.filter(i => {
    const section = sections.find(s => s.id === i.jobChecklistSectionId);
    return section?.active && !i.skipped;
  });
  const completedItems = activeItems.filter(i => i.completed);
  const overallPercent = activeItems.length === 0
    ? 0
    : Math.round((completedItems.length / activeItems.length) * 100);

  return {
    ...checklist,
    overallPercent,
    totalItems: activeItems.length,
    completedItems: completedItems.length,
    sections: sections.map(s => ({
      ...s,
      items: items.filter(i => i.jobChecklistSectionId === s.id),
    })),
  };
}

export async function generateChecklistPdfBuffer(jobId: number): Promise<{ buffer: Buffer; filename: string } | null> {
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

  const [checklistRow] = await db
    .select()
    .from(jobChecklistsTable)
    .where(eq(jobChecklistsTable.jobId, jobId));

  if (!checklistRow) return null;

  const checklistData = await buildChecklistData(checklistRow.id);
  if (!checklistData) return null;

  const [template] = await db
    .select({ name: checklistTemplatesTable.name })
    .from(checklistTemplatesTable)
    .where(eq(checklistTemplatesTable.id, checklistRow.templateId));

  const [settings] = await db
    .select({ companyName: settingsTable.companyName, signatureImage: settingsTable.signatureImage })
    .from(settingsTable)
    .limit(1);

  // ── Fetch photos as raw Buffers (pdfkit accepts Buffers directly) ──────────
  const allItems = checklistData.sections.flatMap(s => s.items);
  const allItemIds = allItems.map(i => i.id);
  const [rawPhotos, rawParts] = allItemIds.length > 0
    ? await Promise.all([
        db.select().from(jobChecklistItemPhotosTable).where(inArray(jobChecklistItemPhotosTable.jobChecklistItemId, allItemIds)),
        db.select().from(jobChecklistItemPartsTable).where(inArray(jobChecklistItemPartsTable.jobChecklistItemId, allItemIds)).orderBy(asc(jobChecklistItemPartsTable.sortOrder)),
      ])
    : [[], []];

  const objStorage = new ObjectStorageService();
  const photoBufById = new Map<number, Buffer>();
  await Promise.all(rawPhotos.map(async (p) => {
    try {
      if (p.objectPath.startsWith("/objects/")) {
        const file = await objStorage.getObjectEntityFile(p.objectPath);
        const [buf] = await file.download();
        photoBufById.set(p.id, buf as Buffer);
      }
    } catch { /* skip failed photos */ }
  }));

  const photosByItemId = new Map<number, Buffer[]>();
  for (const p of rawPhotos) {
    const buf = photoBufById.get(p.id);
    if (!buf) continue;
    if (!photosByItemId.has(p.jobChecklistItemId)) photosByItemId.set(p.jobChecklistItemId, []);
    photosByItemId.get(p.jobChecklistItemId)!.push(buf);
  }

  const partsByItemId = new Map<number, Array<{ label: string; completed: boolean; completedByName: string | null }>>();
  for (const p of rawParts) {
    if (!partsByItemId.has(p.jobChecklistItemId)) partsByItemId.set(p.jobChecklistItemId, []);
    partsByItemId.get(p.jobChecklistItemId)!.push({ label: p.label, completed: p.completed, completedByName: p.completedByName ?? null });
  }

  // ── Signature image ───────────────────────────────────────────────────────
  let sigBuf: Buffer | null = null;
  if (settings?.signatureImage) {
    try {
      const rawPath = settings.signatureImage;
      if (rawPath.startsWith("/objects/")) {
        const file = await objStorage.getObjectEntityFile(rawPath);
        const [buf] = await file.download();
        sigBuf = buf as Buffer;
      } else if (rawPath.startsWith("/uploads/") || rawPath.startsWith("/api/uploads/")) {
        const rel = rawPath.startsWith("/api/uploads/") ? rawPath.slice("/api/uploads/".length) : rawPath.slice("/uploads/".length);
        const uploadsRoot = path.resolve("uploads");
        const filePath = path.resolve(uploadsRoot, rel);
        if (filePath.startsWith(uploadsRoot + path.sep) && fs.existsSync(filePath)) {
          sigBuf = fs.readFileSync(filePath);
        }
      }
    } catch { /* skip signature */ }
  }

  // ── Build PDF with pdfkit ─────────────────────────────────────────────────
  const ML = 36, MR = 36;
  const PW = 612; // Letter width
  const L  = ML;
  const R  = PW - MR;
  const W  = R - L;

  const doc = new PDFDocument({
    size: "Letter",
    margins: { top: 36, bottom: 36, left: ML, right: MR },
    autoFirstPage: true,
    info: {
      Title: `Checklist - ${jobRow.title ?? "Job"}`,
      Author: settings?.companyName ?? "Contractor",
    },
  }) as any;

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const companyName = settings?.companyName ?? "";
  const jobTitle    = jobRow.title ?? "Job";
  const templateName = template?.name ?? "Checklist";

  // Helper: draw a thin horizontal rule at current y
  function hRule(color = BORDER, weight = 0.5) {
    const y = doc.y;
    doc.save().moveTo(L, y).lineTo(R, y).strokeColor(color).lineWidth(weight).stroke().restore();
    doc.y = y + 6;
  }

  // ── Header ──────────────────────────────────────────────────────────────
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

  doc.y += 8;
  hRule();

  // ── Progress ─────────────────────────────────────────────────────────────
  doc.font("Helvetica").fontSize(8).fillColor(GRAY)
     .text(templateName, L, doc.y, { width: W });
  doc.y += 3;

  const progLine = `${checklistData.completedItems} / ${checklistData.totalItems} items complete`;
  const pctText  = `${checklistData.overallPercent}%`;
  const pctW     = doc.widthOfString(pctText, { fontSize: 12 }) + 4;

  doc.font("Helvetica-Bold").fontSize(12).fillColor(DARK)
     .text(progLine, L, doc.y, { width: W - pctW - 4, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(12).fillColor(GREEN)
     .text(pctText, R - pctW, doc.y - doc.currentLineHeight(), { width: pctW, align: "right", lineBreak: false });

  doc.y += doc.currentLineHeight() + 4;

  // Progress bar
  const barY = doc.y;
  const barH = 7;
  doc.save().rect(L, barY, W, barH).fillColor(BORDER).fill().restore();
  const fillW = Math.round(W * checklistData.overallPercent / 100);
  if (fillW > 0) {
    doc.save().rect(L, barY, fillW, barH).fillColor(GREEN).fill().restore();
  }
  doc.y = barY + barH + 5;

  if (checklistData.overallPercent === 100) {
    doc.font("Helvetica").fontSize(8.5).fillColor(GREEN)
       .text("✓ All items complete!", L, doc.y, { width: W });
    doc.y += 3;
  }

  if ((checklistData as any).publicNotes) {
    doc.y += 3;
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(GRAY)
       .text((checklistData as any).publicNotes, L, doc.y, { width: W });
    doc.y += 3;
  }

  doc.y += 8;
  hRule("#d1d5db", 1);

  // ── Sections & Items ─────────────────────────────────────────────────────
  for (const section of checklistData.sections) {
    if (!section.active) continue;

    const sItems    = section.items.filter((i: any) => !i.skipped);
    const sComplete = sItems.filter((i: any) => i.completed).length;
    const sTotal    = sItems.length;
    const sPct      = sTotal > 0 ? Math.round(sComplete / sTotal * 100) : 0;
    const secMeta   = `${sComplete}/${sTotal} · ${sPct}%`;
    const secMetaW  = doc.widthOfString(secMeta, { fontSize: 8 }) + 4;

    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(DARK)
       .text(section.name.toUpperCase(), L, doc.y, { width: W - secMetaW - 4, lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor(GREEN)
       .text(secMeta, R - secMetaW, doc.y - doc.currentLineHeight(), { width: secMetaW, align: "right", lineBreak: false });
    doc.y += doc.currentLineHeight() + 3;

    if (section.notes) {
      doc.font("Helvetica-Oblique").fontSize(8).fillColor(GRAY)
         .text(section.notes, L + 8, doc.y, { width: W - 8 });
      doc.y += 2;
    }

    for (const item of section.items) {
      const itemIndent = L + 10;
      const itemW      = W - 10 - 14;

      // Checkbox glyph + title
      const isCompleted = item.completed ?? false;
      const isSkipped   = item.skipped   ?? false;
      const glyph       = isCompleted ? "✓" : isSkipped ? "—" : "□";
      const glyphColor  = isCompleted ? GREEN : isSkipped ? LGRAY : DARK;
      const titleColor  = isSkipped ? LGRAY : DARK;
      const titleFont   = "Helvetica";

      const glyphX = itemIndent;
      const textX  = itemIndent + 14;
      const textW  = W - 14 - 10;
      const itemY  = doc.y;

      doc.font("Helvetica-Bold").fontSize(9).fillColor(glyphColor)
         .text(glyph, glyphX, itemY, { width: 12, lineBreak: false });
      doc.font(titleFont).fontSize(9).fillColor(titleColor)
         .text(item.title, textX, itemY, { width: textW });
      doc.y += 1;

      // Completed meta
      if (isCompleted && ((item as any).completedByName || item.completedAt)) {
        const mp: string[] = [];
        if ((item as any).completedByName) mp.push((item as any).completedByName);
        if (item.completedAt) {
          const d = new Date(item.completedAt as string);
          if (!isNaN(d.getTime())) {
            mp.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
          }
        }
        if (mp.length) {
          doc.font("Helvetica").fontSize(7.5).fillColor(GREEN)
             .text("  ✓ " + mp.join(" · "), textX, doc.y, { width: textW });
          doc.y += 1;
        }
      }

      // Item notes
      if (item.notes) {
        doc.font("Helvetica-Oblique").fontSize(8).fillColor(GRAY)
           .text("  " + item.notes, textX, doc.y, { width: textW });
        doc.y += 1;
      }

      // Parts
      const parts = partsByItemId.get(item.id) ?? [];
      for (const part of parts) {
        const pg = part.completed ? "✓" : "□";
        const pc = part.completed ? GREEN : GRAY;
        doc.font("Helvetica").fontSize(8).fillColor(pc)
           .text(`  ${pg} ${part.label}`, textX + 8, doc.y, { width: textW - 8 });
      }
      if (parts.length) doc.y += 1;

      // Photos (2 per row, max 6 per item to keep PDF manageable)
      const photos = photosByItemId.get(item.id) ?? [];
      if (photos.length > 0) {
        const photoW   = 160;
        const photoH   = 120;
        const gapX     = 8;
        const perRow   = Math.floor((textW + gapX) / (photoW + gapX));
        const showCount = Math.min(photos.length, 6);

        for (let pi = 0; pi < showCount; pi++) {
          const col   = pi % perRow;
          const row   = Math.floor(pi / perRow);
          const px    = textX + col * (photoW + gapX);
          const py    = doc.y + row * (photoH + 6);

          try {
            doc.image(photos[pi], px, py, { fit: [photoW, photoH], align: "center", valign: "center" });
          } catch { /* skip unreadable photo */ }
        }

        const photoRows = Math.ceil(showCount / perRow);
        doc.y += photoRows * (photoH + 6) + 2;
      }

      doc.y += 3;
    }

    doc.y += 5;
    hRule();
  }

  // ── Footer: date + signature ──────────────────────────────────────────────
  const genDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const footerY = doc.y + 4;

  doc.font("Helvetica").fontSize(8).fillColor(LGRAY)
     .text(`Generated ${genDate}`, L, footerY, { width: W });

  if (sigBuf) {
    try {
      doc.image(sigBuf, R - 100, footerY - 8, { width: 90, height: 40, fit: [90, 40] });
    } catch { /* skip invalid signature image */ }
  }

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", resolve));

  const pdfBuffer = Buffer.concat(chunks);

  const safeTitle = (jobRow.title ?? "Checklist").replace(/[^a-z0-9 _-]/gi, "_");
  const dateStr   = new Date().toISOString().slice(0, 10);
  const filename  = `Checklist - ${safeTitle} - ${dateStr}.pdf`;

  return { buffer: pdfBuffer, filename };
}
