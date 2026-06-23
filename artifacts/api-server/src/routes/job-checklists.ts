import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import {
  checklistTemplatesTable,
  checklistTemplateSectionsTable,
  checklistTemplateItemsTable,
  jobChecklistsTable,
  jobChecklistSectionsTable,
  jobChecklistItemsTable,
  jobChecklistItemPhotosTable,
  jobsTable,
  clientsTable,
  settingsTable,
} from "@workspace/db/schema";
import { eq, asc, and, inArray } from "drizzle-orm";
import { getRequestUser } from "./guards";
import crypto from "crypto";
import fs from "node:fs";
import path from "node:path";
import { launchBrowser } from "../lib/launchBrowser.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { buildChecklistPdfHtml } from "../lib/checklistPdfTemplate.js";

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp|heic|heif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

function toServingUrl(objectPath: string): string {
  if (objectPath.startsWith("/objects/")) return `/api/storage/objects/${objectPath.slice("/objects/".length)}`;
  if (objectPath.startsWith("/uploads/")) return `/api${objectPath}`;
  return objectPath;
}

const router = Router();

// ── Helper: recalculate section percentComplete + update checklist.updatedAt ──
async function recalcSection(sectionId: number, checklistId: number) {
  const items = await db
    .select()
    .from(jobChecklistItemsTable)
    .where(eq(jobChecklistItemsTable.jobChecklistSectionId, sectionId));

  const active = items.filter(i => !i.skipped);
  const completed = active.filter(i => i.completed);
  const pct = active.length === 0 ? 0 : Math.round((completed.length / active.length) * 100);
  const allCompleted = active.length > 0 && completed.length === active.length;

  await db
    .update(jobChecklistSectionsTable)
    .set({
      percentComplete: String(pct),
      completedAt: allCompleted ? new Date() : null,
    })
    .where(eq(jobChecklistSectionsTable.id, sectionId));

  await db
    .update(jobChecklistsTable)
    .set({ updatedAt: new Date() })
    .where(eq(jobChecklistsTable.id, checklistId));
}

// ── Build full checklist response ─────────────────────────────────────────────
export async function buildChecklistResponse(checklistId: number) {
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

  const itemIds = items.map(i => i.id);
  const photos = itemIds.length > 0
    ? await db.select().from(jobChecklistItemPhotosTable).where(inArray(jobChecklistItemPhotosTable.jobChecklistItemId, itemIds))
    : [];

  const photosByItemId = new Map<number, Array<{ id: number; url: string; createdAt: Date }>>();
  for (const p of photos) {
    if (!photosByItemId.has(p.jobChecklistItemId)) photosByItemId.set(p.jobChecklistItemId, []);
    photosByItemId.get(p.jobChecklistItemId)!.push({ id: p.id, url: toServingUrl(p.objectPath), createdAt: p.createdAt });
  }

  const activeItems = items.filter(i => {
    const section = sections.find(s => s.id === i.jobChecklistSectionId);
    return section?.active && !i.skipped;
  });
  const completedItems = activeItems.filter(i => i.completed);
  const overallPct = activeItems.length === 0
    ? 0
    : Math.round((completedItems.length / activeItems.length) * 100);

  return {
    ...checklist,
    overallPercent: overallPct,
    totalItems: activeItems.length,
    completedItems: completedItems.length,
    sections: sections.map(s => ({
      ...s,
      items: items.filter(i => i.jobChecklistSectionId === s.id).map(i => ({
        ...i,
        photos: photosByItemId.get(i.id) ?? [],
      })),
    })),
  };
}

// ── GET /checklist-summaries?jobIds=1,2,3 ─────────────────────────────────────
// Returns { [jobId]: { completedItems, totalItems, overallPercent } } for jobs that have checklists.
router.get("/checklist-summaries", async (req, res) => {
  try {
    const raw = typeof req.query.jobIds === "string" ? req.query.jobIds : "";
    const jobIds = raw.split(",").map(Number).filter(n => !isNaN(n) && n > 0);
    if (jobIds.length === 0) return res.json({});

    const checklists = await db
      .select({ id: jobChecklistsTable.id, jobId: jobChecklistsTable.jobId })
      .from(jobChecklistsTable)
      .where(inArray(jobChecklistsTable.jobId, jobIds));

    if (checklists.length === 0) return res.json({});

    const checklistIds = checklists.map(c => c.id);

    const [sections, items] = await Promise.all([
      db.select({ id: jobChecklistSectionsTable.id, jobChecklistId: jobChecklistSectionsTable.jobChecklistId, active: jobChecklistSectionsTable.active })
        .from(jobChecklistSectionsTable)
        .where(inArray(jobChecklistSectionsTable.jobChecklistId, checklistIds)),
      db.select({ id: jobChecklistItemsTable.id, jobChecklistId: jobChecklistItemsTable.jobChecklistId, jobChecklistSectionId: jobChecklistItemsTable.jobChecklistSectionId, completed: jobChecklistItemsTable.completed, skipped: jobChecklistItemsTable.skipped })
        .from(jobChecklistItemsTable)
        .where(inArray(jobChecklistItemsTable.jobChecklistId, checklistIds)),
    ]);

    const activeSectionIds = new Set(sections.filter(s => s.active).map(s => s.id));

    const result: Record<number, { completedItems: number; totalItems: number; overallPercent: number }> = {};
    for (const cl of checklists) {
      const activeItems = items.filter(i => i.jobChecklistId === cl.id && activeSectionIds.has(i.jobChecklistSectionId) && !i.skipped);
      const completedItems = activeItems.filter(i => i.completed).length;
      const totalItems = activeItems.length;
      const overallPercent = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);
      result[cl.jobId] = { completedItems, totalItems, overallPercent };
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load checklist summaries" });
  }
});

// ── GET /:jobId/checklist ─────────────────────────────────────────────────────
router.get("/:jobId/checklist/exists", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });
    const [row] = await db
      .select({ id: jobChecklistsTable.id })
      .from(jobChecklistsTable)
      .where(eq(jobChecklistsTable.jobId, jobId))
      .limit(1);
    res.json({ exists: !!row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to check checklist existence" });
  }
});

router.get("/:jobId/checklist", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const [checklist] = await db
      .select()
      .from(jobChecklistsTable)
      .where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.json(null);
    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load checklist" });
  }
});

// ── POST /:jobId/checklist — Attach template ──────────────────────────────────
router.post("/:jobId/checklist", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const { templateId, activeSectionIds } = req.body;
    if (!templateId) return res.status(400).json({ error: "templateId is required" });

    const [job] = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.id, jobId));
    if (!job) return res.status(404).json({ error: "Job not found" });

    const [existing] = await db.select({ id: jobChecklistsTable.id }).from(jobChecklistsTable).where(eq(jobChecklistsTable.jobId, jobId));
    if (existing) return res.status(409).json({ error: "Checklist already attached to this job" });

    const [template] = await db
      .select()
      .from(checklistTemplatesTable)
      .where(eq(checklistTemplatesTable.id, templateId));
    if (!template) return res.status(404).json({ error: "Template not found" });

    const templateSections = await db
      .select()
      .from(checklistTemplateSectionsTable)
      .where(eq(checklistTemplateSectionsTable.templateId, templateId))
      .orderBy(asc(checklistTemplateSectionsTable.sortOrder));

    const allTemplateItems = await db
      .select()
      .from(checklistTemplateItemsTable)
      .orderBy(asc(checklistTemplateItemsTable.sortOrder));

    const shareToken = crypto.randomUUID();

    const [checklist] = await db
      .insert(jobChecklistsTable)
      .values({ jobId, templateId: template.id, templateName: template.name, shareToken, shareEnabled: true })
      .returning();

    for (const section of templateSections) {
      const isActive = !activeSectionIds || (activeSectionIds as number[]).includes(section.id);
      const [newSection] = await db
        .insert(jobChecklistSectionsTable)
        .values({ jobChecklistId: checklist.id, templateSectionId: section.id, name: section.name, active: isActive, sortOrder: section.sortOrder })
        .returning();

      const sectionItems = allTemplateItems.filter(i => i.sectionId === section.id);
      for (const item of sectionItems) {
        await db.insert(jobChecklistItemsTable).values({
          jobChecklistId: checklist.id,
          jobChecklistSectionId: newSection.id,
          title: item.title,
          sortOrder: item.sortOrder,
        });
      }
    }

    const data = await buildChecklistResponse(checklist.id);
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to attach checklist" });
  }
});

// ── PATCH /:jobId/checklist — Update meta fields ──────────────────────────────
router.patch("/:jobId/checklist", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const [checklist] = await db
      .select()
      .from(jobChecklistsTable)
      .where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.status(404).json({ error: "Checklist not found" });

    const { publicNotes, statusOverride, shareEnabled } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (publicNotes !== undefined) updates.publicNotes = publicNotes;
    if (statusOverride !== undefined) updates.statusOverride = statusOverride;
    if (shareEnabled !== undefined) updates.shareEnabled = shareEnabled;

    await db
      .update(jobChecklistsTable)
      .set(updates)
      .where(eq(jobChecklistsTable.id, checklist.id));

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update checklist" });
  }
});

// ── DELETE /:jobId/checklist ──────────────────────────────────────────────────
router.delete("/:jobId/checklist", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const [checklist] = await db
      .select()
      .from(jobChecklistsTable)
      .where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.status(404).json({ error: "Checklist not found" });

    await db.delete(jobChecklistsTable).where(eq(jobChecklistsTable.id, checklist.id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete checklist" });
  }
});

// ── PATCH /:jobId/checklist/sections/:sectionId ───────────────────────────────
router.patch("/:jobId/checklist/sections/:sectionId", async (req, res) => {
  try {
    const sectionId = parseInt(req.params.sectionId);
    const jobId = parseInt(req.params.jobId);

    // Verify section belongs to this job's checklist
    const [checklist] = await db
      .select()
      .from(jobChecklistsTable)
      .where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.status(404).json({ error: "No checklist for this job" });

    const [section] = await db
      .select()
      .from(jobChecklistSectionsTable)
      .where(and(eq(jobChecklistSectionsTable.id, sectionId), eq(jobChecklistSectionsTable.jobChecklistId, checklist.id)));
    if (!section) return res.status(404).json({ error: "Section not found" });

    const { active, notes } = req.body;
    const updates: Record<string, unknown> = {};
    if (active !== undefined) updates.active = active;
    if (notes !== undefined) updates.notes = notes;

    await db
      .update(jobChecklistSectionsTable)
      .set(updates)
      .where(eq(jobChecklistSectionsTable.id, sectionId));

    await db
      .update(jobChecklistsTable)
      .set({ updatedAt: new Date() })
      .where(eq(jobChecklistsTable.id, checklist.id));

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update section" });
  }
});

// ── PATCH /:jobId/checklist/items/:itemId ─────────────────────────────────────
router.patch("/:jobId/checklist/items/:itemId", async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const jobId = parseInt(req.params.jobId);
    const user = getRequestUser(req);

    // Verify item belongs to this job's checklist
    const [checklist] = await db
      .select()
      .from(jobChecklistsTable)
      .where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.status(404).json({ error: "No checklist for this job" });

    const [item] = await db
      .select()
      .from(jobChecklistItemsTable)
      .where(and(eq(jobChecklistItemsTable.id, itemId), eq(jobChecklistItemsTable.jobChecklistId, checklist.id)));
    if (!item) return res.status(404).json({ error: "Item not found" });

    const { completed, notes } = req.body;
    const updates: Record<string, unknown> = {};

    if (completed !== undefined) {
      updates.completed = completed;
      if (completed) {
        updates.completedAt = new Date();
        updates.completedByUserId = user?.id ?? null;
        updates.completedByName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null;
      } else {
        updates.completedAt = null;
        updates.completedByUserId = null;
        updates.completedByName = null;
      }
    }
    if (notes !== undefined) updates.notes = notes;

    await db
      .update(jobChecklistItemsTable)
      .set(updates)
      .where(eq(jobChecklistItemsTable.id, itemId));

    await recalcSection(item.jobChecklistSectionId, checklist.id);

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update item" });
  }
});

// ── PATCH /:jobId/checklist/items/:itemId/skip ────────────────────────────────
router.patch("/:jobId/checklist/items/:itemId/skip", async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const jobId = parseInt(req.params.jobId);

    // Verify item belongs to this job's checklist
    const [checklist] = await db
      .select()
      .from(jobChecklistsTable)
      .where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.status(404).json({ error: "No checklist for this job" });

    const [item] = await db
      .select()
      .from(jobChecklistItemsTable)
      .where(and(eq(jobChecklistItemsTable.id, itemId), eq(jobChecklistItemsTable.jobChecklistId, checklist.id)));
    if (!item) return res.status(404).json({ error: "Item not found" });

    const { skipped } = req.body;
    await db
      .update(jobChecklistItemsTable)
      .set({
        skipped: !!skipped,
        skippedAt: skipped ? new Date() : null,
        completed: false,
        completedAt: null,
        completedByUserId: null,
        completedByName: null,
      })
      .where(eq(jobChecklistItemsTable.id, itemId));

    await recalcSection(item.jobChecklistSectionId, checklist.id);

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to skip item" });
  }
});

// ── POST /:jobId/checklist/email — generate PDF and email it ──────────────────
router.post("/:jobId/checklist/email", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });

    const { email } = req.body;
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: "A valid email address is required" });
    }
    const toEmail = email.trim();

    const { generateChecklistPdfBuffer } = await import("../lib/generateChecklistPdf.js");
    const result = await generateChecklistPdfBuffer(jobId);
    if (!result) return res.status(404).json({ error: "No checklist found for this job" });

    const [jobRow] = await db
      .select({ title: jobsTable.title })
      .from(jobsTable)
      .where(eq(jobsTable.id, jobId));

    const [settings] = await db
      .select({ companyName: settingsTable.companyName })
      .from(settingsTable)
      .limit(1);

    const jobTitle = jobRow?.title ?? "your job";
    const companyName = settings?.companyName ?? "Your contractor";

    const { sendEmail } = await import("../lib/sendEmail.js");
    await sendEmail({
      to: toEmail,
      subject: `Checklist Report: ${jobTitle}`,
      html: `<p>Hello,</p><p>Please find the checklist report for <strong>${jobTitle}</strong> attached to this email.</p><p>— ${companyName}</p>`,
      text: `Hello,\n\nPlease find the checklist report for "${jobTitle}" attached.\n\n— ${companyName}`,
      attachment: {
        filename: result.filename,
        mimeType: "application/pdf",
        base64Data: result.buffer.toString("base64"),
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// ── GET /:jobId/checklist/pdf — download completed checklist as signed PDF ─────
router.get("/:jobId/checklist/pdf", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });

    const { generateChecklistPdfBuffer } = await import("../lib/generateChecklistPdf.js");
    const result = await generateChecklistPdfBuffer(jobId);
    if (!result) return res.status(404).json({ error: "No checklist found for this job" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// ── POST /:jobId/checklist/items/:itemId/photos ───────────────────────────────
router.post("/:jobId/checklist/items/:itemId/photos", photoUpload.single("photo"), async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (isNaN(jobId) || isNaN(itemId)) return res.status(400).json({ error: "Invalid parameters" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Verify item belongs to this job's checklist (ownership check)
    const [item] = await db
      .select({ id: jobChecklistItemsTable.id, jobChecklistId: jobChecklistItemsTable.jobChecklistId })
      .from(jobChecklistItemsTable)
      .where(eq(jobChecklistItemsTable.id, itemId));
    if (!item) return res.status(404).json({ error: "Item not found" });

    const [checklist] = await db
      .select({ jobId: jobChecklistsTable.jobId })
      .from(jobChecklistsTable)
      .where(eq(jobChecklistsTable.id, item.jobChecklistId));
    if (!checklist || checklist.jobId !== jobId) return res.status(403).json({ error: "Item does not belong to this job" });

    const objStorage = new ObjectStorageService();
    const objectPath = await objStorage.uploadBufferWithFilename(
      req.file.buffer,
      req.file.mimetype,
      "uploads/checklist-photos",
      req.file.originalname || `photo-${Date.now()}.jpg`,
    );

    const [photo] = await db
      .insert(jobChecklistItemPhotosTable)
      .values({ jobChecklistItemId: itemId, objectPath })
      .returning();

    res.json({ id: photo.id, url: toServingUrl(photo.objectPath), createdAt: photo.createdAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload photo" });
  }
});

// ── DELETE /:jobId/checklist/items/:itemId/photos/:photoId ────────────────────
router.delete("/:jobId/checklist/items/:itemId/photos/:photoId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId, 10);
    const itemId = parseInt(req.params.itemId, 10);
    const photoId = parseInt(req.params.photoId, 10);
    if (isNaN(jobId) || isNaN(itemId) || isNaN(photoId)) return res.status(400).json({ error: "Invalid parameters" });

    // Verify photo belongs to the given item (ownership check)
    const [photo] = await db
      .select()
      .from(jobChecklistItemPhotosTable)
      .where(and(eq(jobChecklistItemPhotosTable.id, photoId), eq(jobChecklistItemPhotosTable.jobChecklistItemId, itemId)));
    if (!photo) return res.status(404).json({ error: "Photo not found" });

    // Verify item belongs to this job's checklist
    const [item] = await db
      .select({ jobChecklistId: jobChecklistItemsTable.jobChecklistId })
      .from(jobChecklistItemsTable)
      .where(eq(jobChecklistItemsTable.id, itemId));
    if (item) {
      const [checklist] = await db
        .select({ jobId: jobChecklistsTable.jobId })
        .from(jobChecklistsTable)
        .where(eq(jobChecklistsTable.id, item.jobChecklistId));
      if (!checklist || checklist.jobId !== jobId) return res.status(403).json({ error: "Item does not belong to this job" });
    }

    if (photo.objectPath.startsWith("/objects/")) {
      try {
        const objStorage = new ObjectStorageService();
        await objStorage.deleteObject(photo.objectPath);
      } catch { /* best-effort */ }
    }

    await db
      .delete(jobChecklistItemPhotosTable)
      .where(eq(jobChecklistItemPhotosTable.id, photoId));

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete photo" });
  }
});

export default router;
