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
  jobFinishedPhotosTable,
  jobsTable,
  clientsTable,
  checklistTemplatesTable,
  settingsTable,
} from "@workspace/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage.js";

const GREEN  = "#16a34a";
const DARK   = "#1f2937";
const GRAY   = "#6b7280";
const LGRAY  = "#9ca3af";
const BORDER = "#e5e7eb";

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

  // ── Fetch per-item photos & parts as Buffers ─────────────────────────────
  const allItems   = checklistData.sections.flatMap(s => s.items);
  const allItemIds = allItems.map(i => i.id);

  const [rawPhotos, rawParts, rawFinishedPhotos] = await Promise.all([
    allItemIds.length > 0
      ? db.select().from(jobChecklistItemPhotosTable).where(inArray(jobChecklistItemPhotosTable.jobChecklistItemId, allItemIds))
      : Promise.resolve([]),
    allItemIds.length > 0
      ? db.select().from(jobChecklistItemPartsTable).where(inArray(jobChecklistItemPartsTable.jobChecklistItemId, allItemIds)).orderBy(asc(jobChecklistItemPartsTable.sortOrder))
      : Promise.resolve([]),
    // Finished photos are linked to the checklist, not individual items
    db.select().from(jobFinishedPhotosTable)
      .where(eq(jobFinishedPhotosTable.jobChecklistId, checklistRow.id))
      .orderBy(asc(jobFinishedPhotosTable.createdAt)),
  ]);

  const objStorage = new ObjectStorageService();

  // Resolve all photos (per-item + finished) in parallel
  const allPhotoRows = [
    ...rawPhotos.map(p => ({ id: p.id, objectPath: p.objectPath, kind: "item" as const, itemId: p.jobChecklistItemId })),
    ...rawFinishedPhotos.map(p => ({ id: p.id, objectPath: p.objectPath, kind: "finished" as const, itemId: -1 })),
  ];
  const photoBufById = new Map<string, Buffer>();
  await Promise.all(allPhotoRows.map(async (p) => {
    try {
      if (p.objectPath.startsWith("/objects/")) {
        const file = await objStorage.getObjectEntityFile(p.objectPath);
        const [buf] = await file.download();
        photoBufById.set(`${p.kind}-${p.id}`, buf as Buffer);
      }
    } catch { /* skip failed photos */ }
  }));

  const photosByItemId = new Map<number, Buffer[]>();
  for (const p of rawPhotos) {
    const buf = photoBufById.get(`item-${p.id}`);
    if (!buf) continue;
    if (!photosByItemId.has(p.jobChecklistItemId)) photosByItemId.set(p.jobChecklistItemId, []);
    photosByItemId.get(p.jobChecklistItemId)!.push(buf);
  }

  const finishedPhotoBufs: Buffer[] = rawFinishedPhotos
    .map(p => photoBufById.get(`finished-${p.id}`))
    .filter((b): b is Buffer => b !== undefined);

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
        const filePath   = path.resolve(uploadsRoot, rel);
        if (filePath.startsWith(uploadsRoot + path.sep) && fs.existsSync(filePath)) {
          sigBuf = fs.readFileSync(filePath);
        }
      }
    } catch { /* skip invalid signature */ }
  }

  // ── Build PDF ─────────────────────────────────────────────────────────────
  const ML = 36, MR = 36;
  const PW = 612;
  const L  = ML;
  const R  = PW - MR;
  const W  = R - L;

  const doc = new PDFDocument({
    size: "Letter",
    margins: { top: ML, bottom: MR, left: ML, right: MR },
    autoFirstPage: true,
    info: {
      Title:  `Checklist - ${jobRow.title ?? "Job"}`,
      Author: settings?.companyName ?? "Contractor",
    },
  }) as any;

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Ensure at least `needed` points remain on the current page; add a new page if not. */
  function ensureSpace(needed: number) {
    const pageBottom = (doc.page.height as number) - (doc.page.margins.bottom as number);
    if (doc.y + needed > pageBottom) {
      doc.addPage();
    }
  }

  /** Draw a thin horizontal rule at the current y, then advance. */
  function hRule(color = BORDER, weight = 0.5) {
    const y = doc.y;
    doc.save().moveTo(L, y).lineTo(R, y).strokeColor(color).lineWidth(weight).stroke().restore();
    doc.y = y + 6;
  }

  /**
   * Draw images in a grid. Handles page breaks by starting a fresh row
   * on a new page whenever a row would overflow the bottom margin.
   */
  function drawPhotoGrid(bufs: Buffer[], startX: number, availW: number, photoW: number, photoH: number) {
    if (bufs.length === 0) return;
    const gap    = 6;
    const perRow = Math.max(1, Math.floor((availW + gap) / (photoW + gap)));

    let col = 0;
    let rowY = doc.y;

    for (const buf of bufs) {
      // Start a new row if needed
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
        col  = 0;
        doc.y = rowY + photoH + gap;
      }
    }

    // Advance past the last partial row
    if (col > 0) {
      doc.y = rowY + photoH + gap;
    }
  }

  const companyName  = settings?.companyName ?? "";
  const jobTitle     = jobRow.title ?? "Job";
  const templateName = template?.name ?? "Checklist";

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

  doc.y += 8;
  hRule();

  // ── Progress ──────────────────────────────────────────────────────────────
  doc.font("Helvetica").fontSize(8).fillColor(GRAY)
     .text(templateName, L, doc.y, { width: W });
  doc.y += 3;

  const progLine = `${checklistData.completedItems} / ${checklistData.totalItems} items complete`;
  const pctText  = `${checklistData.overallPercent}%`;
  const pctW     = doc.widthOfString(pctText, { fontSize: 12 }) + 6;

  // Draw progress line + percentage on the same baseline using a saved y
  {
    const lineY = doc.y;
    doc.font("Helvetica-Bold").fontSize(12).fillColor(DARK)
       .text(progLine, L, lineY, { width: W - pctW - 4, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(GREEN)
       .text(pctText, R - pctW, lineY, { width: pctW, align: "right", lineBreak: false });
    doc.y = lineY + doc.currentLineHeight() + 4;
  }

  // Progress bar
  {
    const barY = doc.y;
    const barH = 7;
    doc.save().rect(L, barY, W, barH).fillColor(BORDER).fill().restore();
    const fillW = Math.round(W * checklistData.overallPercent / 100);
    if (fillW > 0) {
      doc.save().rect(L, barY, fillW, barH).fillColor(GREEN).fill().restore();
    }
    doc.y = barY + barH + 5;
  }

  if (checklistData.overallPercent === 100) {
    doc.font("Helvetica").fontSize(8.5).fillColor(GREEN)
       .text("✓ All items complete!", L, doc.y, { width: W });
    doc.y += 3;
  }

  if (checklistData.publicNotes) {
    doc.y += 3;
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(GRAY)
       .text(checklistData.publicNotes, L, doc.y, { width: W });
    doc.y += 3;
  }

  doc.y += 8;
  hRule("#d1d5db", 1);

  // ── Sections & Items ──────────────────────────────────────────────────────
  for (const section of checklistData.sections) {
    if (!section.active) continue;

    const sItems    = section.items.filter((i: any) => !i.skipped);
    const sComplete = sItems.filter((i: any) => i.completed).length;
    const sTotal    = sItems.length;
    const sPct      = sTotal > 0 ? Math.round(sComplete / sTotal * 100) : 0;
    const secMeta   = `${sComplete}/${sTotal} · ${sPct}%`;
    const secMetaW  = doc.widthOfString(secMeta, { fontSize: 8 }) + 4;

    // Keep section header and at least one item together (avoid orphaned header)
    ensureSpace(32);

    {
      const secY = doc.y;
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(DARK)
         .text(section.name.toUpperCase(), L, secY, { width: W - secMetaW - 4, lineBreak: false });
      doc.font("Helvetica").fontSize(8).fillColor(GREEN)
         .text(secMeta, R - secMetaW, secY, { width: secMetaW, align: "right", lineBreak: false });
      doc.y = secY + doc.currentLineHeight() + 3;
    }

    if (section.notes) {
      doc.font("Helvetica-Oblique").fontSize(8).fillColor(GRAY)
         .text(section.notes, L + 8, doc.y, { width: W - 8 });
      doc.y += 2;
    }

    for (const item of section.items) {
      const textX = L + 24;
      const textW = W - 24;

      // Ensure at least one line of space before each item
      ensureSpace(14);

      const isCompleted = item.completed ?? false;
      const isSkipped   = item.skipped   ?? false;
      const glyph       = isCompleted ? "✓" : isSkipped ? "—" : "□";
      const glyphColor  = isCompleted ? GREEN : isSkipped ? LGRAY : DARK;
      const titleColor  = isSkipped ? LGRAY : DARK;

      {
        const itemY = doc.y;
        doc.font("Helvetica-Bold").fontSize(9).fillColor(glyphColor)
           .text(glyph, L + 10, itemY, { width: 12, lineBreak: false });
        doc.font("Helvetica").fontSize(9).fillColor(titleColor)
           .text(item.title, textX, itemY, { width: textW });
        // doc.y is now after the title text (which may have wrapped)
        doc.y += 1;
      }

      // Completed-by meta
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
             .text("✓ " + mp.join(" · "), textX, doc.y, { width: textW });
          doc.y += 1;
        }
      }

      // Item notes
      if (item.notes) {
        doc.font("Helvetica-Oblique").fontSize(8).fillColor(GRAY)
           .text(item.notes, textX, doc.y, { width: textW });
        doc.y += 1;
      }

      // Parts (split items)
      const parts = partsByItemId.get(item.id) ?? [];
      for (const part of parts) {
        const pg = part.completed ? "✓" : "□";
        const pc = part.completed ? GREEN : GRAY;
        ensureSpace(12);
        doc.font("Helvetica").fontSize(8).fillColor(pc)
           .text(`${pg}  ${part.label}`, textX + 8, doc.y, { width: textW - 8 });
      }
      if (parts.length) doc.y += 1;

      // Per-item photos
      const photos = photosByItemId.get(item.id) ?? [];
      if (photos.length > 0) {
        doc.y += 3;
        drawPhotoGrid(photos.slice(0, 6), textX, textW, 150, 112);
        doc.y += 3;
      }

      doc.y += 4;
    }

    doc.y += 4;
    hRule();
  }

  // ── Finished Work section ─────────────────────────────────────────────────
  const finishedNotes = (checklistData as any).finishedNotes as string | null | undefined;
  if (finishedNotes || finishedPhotoBufs.length > 0) {
    ensureSpace(30);
    doc.y += 2;

    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(DARK)
       .text("FINISHED WORK", L, doc.y, { width: W });
    doc.y += 3;

    if (finishedNotes) {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(GRAY)
         .text(finishedNotes, L, doc.y, { width: W });
      doc.y += 4;
    }

    if (finishedPhotoBufs.length > 0) {
      doc.y += 2;
      drawPhotoGrid(finishedPhotoBufs, L, W, 160, 120);
      doc.y += 4;
    }

    hRule();
  }

  // ── Completion Sign-Off ───────────────────────────────────────────────────
  // Box height: 104pt for signature image + padding; plus 30pt for labels below
  ensureSpace(150);
  doc.y += 10;

  const genDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Section heading
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(LGRAY)
     .text("COMPLETION SIGN-OFF", L, doc.y, { width: W, characterSpacing: 1 });
  doc.y += 8;

  // Signature box — light background with border
  const boxY = doc.y;
  const boxH = 108;
  doc.save().rect(L, boxY, W, boxH).fillColor("#f9fafb").fill().restore();
  doc.save().rect(L, boxY, W, boxH).strokeColor("#d1d5db").lineWidth(0.75).stroke().restore();

  if (sigBuf) {
    // Center the signature image inside the box — fix: use only `fit`, no `width`/`height`
    const sigW = 240;
    const sigH = 92;
    const sigX = L + (W - sigW) / 2;
    const sigY = boxY + (boxH - sigH) / 2;
    try {
      doc.image(sigBuf, sigX, sigY, { fit: [sigW, sigH] });
    } catch (err) {
      console.error("Checklist PDF — signature render error:", err);
    }
  } else {
    // Placeholder when no signature has been saved in Settings
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(LGRAY)
       .text("No signature on file — add one in Settings", L, boxY + boxH / 2 - 6, { width: W, align: "center" });
  }

  doc.y = boxY + boxH + 10;

  // Labels row: "Authorized Signature" left · "Date: …" right
  {
    const rowY = doc.y;
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(GRAY)
       .text("Authorized Signature", L, rowY, { width: W / 2, lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor(DARK)
       .text(`Date:  ${genDate}`, L + W / 2, rowY, { width: W / 2, align: "right", lineBreak: false });
    doc.y = rowY + doc.currentLineHeight() + 3;
  }

  // Underlines beneath the labels
  {
    const lineY = doc.y;
    doc.save().moveTo(L, lineY).lineTo(L + W * 0.44, lineY).strokeColor(BORDER).lineWidth(0.5).stroke().restore();
    doc.save().moveTo(L + W * 0.56, lineY).lineTo(R, lineY).strokeColor(BORDER).lineWidth(0.5).stroke().restore();
    doc.y = lineY + 10;
  }

  // Micro footer
  doc.font("Helvetica").fontSize(7).fillColor(LGRAY)
     .text(`Generated ${genDate}`, L, doc.y, { width: W, align: "center" });

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", resolve));

  const pdfBuffer = Buffer.concat(chunks);

  const safeTitle = (jobRow.title ?? "Checklist").replace(/[^a-z0-9 _-]/gi, "_");
  const dateStr   = new Date().toISOString().slice(0, 10);
  const filename  = `Checklist - ${safeTitle} - ${dateStr}.pdf`;

  return { buffer: pdfBuffer, filename };
}
