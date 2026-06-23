import fs from "node:fs";
import path from "node:path";
import { db } from "@workspace/db";
import {
  jobChecklistsTable,
  jobChecklistSectionsTable,
  jobChecklistItemsTable,
  jobChecklistItemPhotosTable,
  jobsTable,
  clientsTable,
  checklistTemplatesTable,
  settingsTable,
} from "@workspace/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { launchBrowser } from "./launchBrowser.js";
import { ObjectStorageService } from "./objectStorage.js";
import { buildChecklistPdfHtml } from "./checklistPdfTemplate.js";

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

  let signatureImageDataUri: string | null = null;
  if (settings?.signatureImage) {
    const rawPath = settings.signatureImage;
    if (rawPath.startsWith("/objects/")) {
      const objStorage = new ObjectStorageService();
      const file = await objStorage.getObjectEntityFile(rawPath);
      const [buf] = await file.download();
      const [meta] = await file.getMetadata();
      const mime = (meta.contentType as string | undefined) ?? "image/png";
      signatureImageDataUri = `data:${mime};base64,${(buf as Buffer).toString("base64")}`;
    } else if (rawPath.startsWith("/uploads/") || rawPath.startsWith("/api/uploads/")) {
      const relative = rawPath.startsWith("/api/uploads/")
        ? rawPath.slice("/api/uploads/".length)
        : rawPath.slice("/uploads/".length);
      const uploadsRoot = path.resolve("uploads");
      const filePath = path.resolve(uploadsRoot, relative);
      if (filePath.startsWith(uploadsRoot + path.sep) && fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase().replace(".", "");
        const mime = ext === "png" ? "image/png" : (ext === "jpg" || ext === "jpeg") ? "image/jpeg" : "image/png";
        signatureImageDataUri = `data:${mime};base64,${buf.toString("base64")}`;
      }
    }
  }

  // ── Fetch photos for all checklist items ─────────────────────────────────
  const allItems = checklistData.sections.flatMap(s => s.items);
  const allItemIds = allItems.map(i => i.id);
  const rawPhotos = allItemIds.length > 0
    ? await db.select().from(jobChecklistItemPhotosTable).where(inArray(jobChecklistItemPhotosTable.jobChecklistItemId, allItemIds))
    : [];

  // Resolve each photo to a base64 data URI for embedding in the PDF
  const objStorage = new ObjectStorageService();
  const photoDataUriByPhotoId = new Map<number, string>();
  await Promise.all(rawPhotos.map(async (p) => {
    try {
      if (p.objectPath.startsWith("/objects/")) {
        const file = await objStorage.getObjectEntityFile(p.objectPath);
        const [buf] = await file.download();
        const [meta] = await file.getMetadata();
        const mime = (meta.contentType as string | undefined) ?? "image/jpeg";
        photoDataUriByPhotoId.set(p.id, `data:${mime};base64,${(buf as Buffer).toString("base64")}`);
      }
    } catch { /* skip failed photos */ }
  }));

  const photosByItemId = new Map<number, string[]>();
  for (const p of rawPhotos) {
    const uri = photoDataUriByPhotoId.get(p.id);
    if (!uri) continue;
    if (!photosByItemId.has(p.jobChecklistItemId)) photosByItemId.set(p.jobChecklistItemId, []);
    photosByItemId.get(p.jobChecklistItemId)!.push(uri);
  }

  const html = buildChecklistPdfHtml({
    companyName: settings?.companyName ?? null,
    jobTitle: jobRow.title ?? "Job",
    clientName: jobRow.clientName ?? null,
    locationName: jobRow.locationName ?? null,
    address: jobRow.address ?? null,
    city: jobRow.city ?? null,
    state: jobRow.state ?? null,
    templateName: template?.name ?? "Checklist",
    overallPercent: checklistData.overallPercent,
    completedItems: checklistData.completedItems,
    totalItems: checklistData.totalItems,
    publicNotes: checklistData.publicNotes ?? null,
    sections: checklistData.sections.map(s => ({
      name: s.name,
      active: s.active ?? true,
      notes: s.notes ?? null,
      items: s.items.map(i => ({
        title: i.title,
        completed: i.completed ?? false,
        skipped: i.skipped ?? false,
        completedByName: (i as any).completedByName ?? null,
        completedAt: i.completedAt instanceof Date ? i.completedAt.toISOString() : (i.completedAt ?? null),
        notes: i.notes ?? null,
        photos: photosByItemId.get(i.id) ?? [],
      })),
    })),
    signatureImageDataUri,
    generatedDate: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  });

  const browser = await launchBrowser();
  let pdfBuffer: Buffer;
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      const u = r.url();
      if (u.startsWith("data:") || u === "about:blank") r.continue();
      else r.abort();
    });
    await page.setContent(html, { waitUntil: "networkidle0" });
    pdfBuffer = Buffer.from(await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
    }));
    await page.close();
  } finally {
    await browser.close();
  }

  const safeTitle = (jobRow.title ?? "Checklist").replace(/[^a-z0-9 _-]/gi, "_");
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `Checklist - ${safeTitle} - ${dateStr}.pdf`;

  return { buffer: pdfBuffer, filename };
}
