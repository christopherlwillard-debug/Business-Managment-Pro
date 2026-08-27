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
  jobChecklistItemPartsTable,
  jobFinishedPhotosTable,
  jobStartPhotosTable,
  jobChecklistStatusLogTable,
  jobChecklistSectionNotesTable,
  jobsTable,
  clientsTable,
  jobSubcontractorsTable,
  subcontractorsTable,
  settingsTable,
} from "@workspace/db/schema";
import { eq, asc, desc, and, inArray, isNull } from "drizzle-orm";
import { getRequestUser } from "./guards";
import crypto from "crypto";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { requestedBusiness, belongsToBusiness, invalidBusinessScope } from "../lib/business-scope.js";

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

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function scheduleItemShape(item: typeof jobChecklistItemsTable.$inferSelect, sectionName: string | null, assignedSubcontractorName: string | null) {
  return {
    id: item.id,
    title: item.title,
    completed: item.completed,
    skipped: item.skipped,
    scheduledDate: item.scheduledDate,
    assignedSubcontractorId: item.assignedSubcontractorId,
    assignedSubcontractorName,
    sectionName,
  };
}

// ── Helper: recalc parent item's completed from its parts ─────────────────────
async function recalcItemFromParts(itemId: number): Promise<void> {
  const parts = await db
    .select()
    .from(jobChecklistItemPartsTable)
    .where(eq(jobChecklistItemPartsTable.jobChecklistItemId, itemId));
  if (parts.length === 0) {
    await db
      .update(jobChecklistItemsTable)
      .set({ completed: false, completedAt: null, completedByUserId: null, completedByName: null })
      .where(eq(jobChecklistItemsTable.id, itemId));
  } else {
    const allDone = parts.every(p => p.completed);
    await db
      .update(jobChecklistItemsTable)
      .set({ completed: allDone, completedAt: allDone ? new Date() : null, completedByUserId: null, completedByName: null })
      .where(eq(jobChecklistItemsTable.id, itemId));
  }
}

// ── Helper: recalculate section percentComplete + update checklist.updatedAt ──
// Split items contribute fractionally (e.g. 1/2 parts done = 0.5 item complete).
async function recalcSection(sectionId: number, checklistId: number) {
  const items = await db
    .select()
    .from(jobChecklistItemsTable)
    .where(eq(jobChecklistItemsTable.jobChecklistSectionId, sectionId));

  const active = items.filter(i => !i.skipped);

  if (active.length === 0) {
    await db.update(jobChecklistSectionsTable)
      .set({ percentComplete: "0", completedAt: null })
      .where(eq(jobChecklistSectionsTable.id, sectionId));
    await db.update(jobChecklistsTable).set({ updatedAt: new Date() }).where(eq(jobChecklistsTable.id, checklistId));
    return;
  }

  // Fetch parts for all active items so split items contribute fractionally
  const activeIds = active.map(i => i.id);
  const sectionParts = await db.select().from(jobChecklistItemPartsTable)
    .where(inArray(jobChecklistItemPartsTable.jobChecklistItemId, activeIds));

  const sectionPartsByItemId = new Map<number, typeof sectionParts>();
  for (const p of sectionParts) {
    if (!sectionPartsByItemId.has(p.jobChecklistItemId)) sectionPartsByItemId.set(p.jobChecklistItemId, []);
    sectionPartsByItemId.get(p.jobChecklistItemId)!.push(p);
  }

  let weightedComplete = 0;
  for (const item of active) {
    const itemParts = sectionPartsByItemId.get(item.id) ?? [];
    if (itemParts.length > 0) {
      weightedComplete += itemParts.filter(p => p.completed).length / itemParts.length;
    } else {
      weightedComplete += item.completed ? 1 : 0;
    }
  }

  const pct = Math.round((weightedComplete / active.length) * 100);
  const allCompleted = weightedComplete >= active.length;

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
  const sectionIds = sections.map(s => s.id);
  const [photos, parts, finishedPhotos, startPhotos, statusLog, sectionNoteRows] = await Promise.all([
    itemIds.length > 0
      ? db.select().from(jobChecklistItemPhotosTable).where(inArray(jobChecklistItemPhotosTable.jobChecklistItemId, itemIds))
      : Promise.resolve([]),
    itemIds.length > 0
      ? db.select().from(jobChecklistItemPartsTable).where(inArray(jobChecklistItemPartsTable.jobChecklistItemId, itemIds)).orderBy(asc(jobChecklistItemPartsTable.sortOrder))
      : Promise.resolve([]),
    db.select().from(jobFinishedPhotosTable).where(eq(jobFinishedPhotosTable.jobChecklistId, checklistId)).orderBy(asc(jobFinishedPhotosTable.createdAt)),
    db.select().from(jobStartPhotosTable).where(eq(jobStartPhotosTable.jobChecklistId, checklistId)).orderBy(asc(jobStartPhotosTable.createdAt)),
    db.select().from(jobChecklistStatusLogTable).where(eq(jobChecklistStatusLogTable.jobChecklistId, checklistId)).orderBy(desc(jobChecklistStatusLogTable.startedAt)).limit(30),
    sectionIds.length > 0
      ? db.select().from(jobChecklistSectionNotesTable).where(inArray(jobChecklistSectionNotesTable.jobChecklistSectionId, sectionIds)).orderBy(asc(jobChecklistSectionNotesTable.createdAt))
      : Promise.resolve([]),
  ]);

  const photosByItemId = new Map<number, Array<{ id: number; url: string; createdAt: Date }>>();
  for (const p of photos) {
    if (!photosByItemId.has(p.jobChecklistItemId)) photosByItemId.set(p.jobChecklistItemId, []);
    photosByItemId.get(p.jobChecklistItemId)!.push({ id: p.id, url: toServingUrl(p.objectPath), createdAt: p.createdAt });
  }

  const partsByItemId = new Map<number, any[]>();
  for (const p of parts) {
    if (!partsByItemId.has(p.jobChecklistItemId)) partsByItemId.set(p.jobChecklistItemId, []);
    partsByItemId.get(p.jobChecklistItemId)!.push(p);
  }

  const activeItems = items.filter(i => {
    const section = sections.find(s => s.id === i.jobChecklistSectionId);
    return section?.active && !i.skipped;
  });

  // Compute overall percent with fractional contribution from split items
  let weightedComplete = 0;
  for (const item of activeItems) {
    const itemParts = partsByItemId.get(item.id) ?? [];
    if (itemParts.length > 0) {
      weightedComplete += itemParts.filter(p => p.completed).length / itemParts.length;
    } else {
      weightedComplete += item.completed ? 1 : 0;
    }
  }
  const overallPct = activeItems.length === 0 ? 0 : Math.round((weightedComplete / activeItems.length) * 100);
  const fullyCompletedItems = activeItems.filter(i => i.completed).length;

  return {
    ...checklist,
    overallPercent: overallPct,
    totalItems: activeItems.length,
    completedItems: fullyCompletedItems,
    finishedPhotos: finishedPhotos.map(p => ({ id: p.id, url: toServingUrl(p.objectPath), createdAt: p.createdAt })),
    startPhotos: startPhotos.map(p => ({ id: p.id, url: toServingUrl(p.objectPath), createdAt: p.createdAt })),
    statusLog,
    sections: sections.map(s => ({
      ...s,
      noteEntries: sectionNoteRows.filter((n: any) => n.jobChecklistSectionId === s.id),
      items: items.filter((i: any) => i.jobChecklistSectionId === s.id).map(i => ({
        ...i,
        photos: photosByItemId.get(i.id) ?? [],
        parts: partsByItemId.get(i.id) ?? [],
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

// ── GET /schedule-overview?from=YYYY-MM-DD&to=YYYY-MM-DD ───────────────────────
// One read for the Jobs schedule. It intentionally uses job dates and checklist
// dates only; Route Planner stops are a separate system.
router.get("/schedule-overview", async (req, res) => {
  try {
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    if (!isDateOnly(from) || !isDateOnly(to) || from > to) {
      return res.status(400).json({ error: "from and to must be valid YYYY-MM-DD dates" });
    }

    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope)) return;

    const allJobs = await db.select().from(jobsTable);
    const scopedJobs = allJobs.filter(job => belongsToBusiness(job, scope));
    if (scopedJobs.length === 0) return res.json({ from, to, jobs: [] });

    const jobIds = scopedJobs.map(job => job.id);
    const checklists = await db
      .select({ id: jobChecklistsTable.id, jobId: jobChecklistsTable.jobId })
      .from(jobChecklistsTable)
      .where(inArray(jobChecklistsTable.jobId, jobIds));
    const checklistIds = checklists.map(checklist => checklist.id);

    const scheduledRows = checklistIds.length > 0
      ? await db
        .select({
          item: jobChecklistItemsTable,
          sectionName: jobChecklistSectionsTable.name,
          assignedSubcontractorName: subcontractorsTable.name,
        })
        .from(jobChecklistItemsTable)
        .leftJoin(jobChecklistSectionsTable, eq(jobChecklistItemsTable.jobChecklistSectionId, jobChecklistSectionsTable.id))
        .leftJoin(subcontractorsTable, eq(jobChecklistItemsTable.assignedSubcontractorId, subcontractorsTable.id))
        .where(inArray(jobChecklistItemsTable.jobChecklistId, checklistIds))
      : [];

    const checklistJobById = new Map(checklists.map(checklist => [checklist.id, checklist.jobId]));
    const scheduleByJob = new Map<number, ReturnType<typeof scheduleItemShape>[]>();
    const unscheduledByJob = new Map<number, ReturnType<typeof scheduleItemShape>[]>();
    for (const row of scheduledRows) {
      const jobId = checklistJobById.get(row.item.jobChecklistId);
      if (!jobId || row.item.skipped) continue;
      const shaped = scheduleItemShape(row.item, row.sectionName, row.assignedSubcontractorName);
      if (row.item.scheduledDate && (row.item.scheduledDate < from || row.item.scheduledDate > to)) continue;
      const target = row.item.scheduledDate ? scheduleByJob : unscheduledByJob;
      const list = target.get(jobId) ?? [];
      list.push(shaped);
      target.set(jobId, list);
    }

    const jobs = scopedJobs
      .filter(job => {
        const overlaps = job.startDate != null && job.startDate <= to && (job.endDate == null || job.endDate >= from);
        const hasScheduledItems = (scheduleByJob.get(job.id)?.length ?? 0) > 0;
        const needsScheduling = job.startDate == null && job.endDate == null || (unscheduledByJob.get(job.id)?.length ?? 0) > 0;
        return overlaps || hasScheduledItems || needsScheduling;
      })
      .map(job => ({
        ...job,
        checklistItems: scheduleByJob.get(job.id) ?? [],
        unscheduledChecklistItems: unscheduledByJob.get(job.id) ?? [],
      }));

    res.json({ from, to, jobs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load schedule overview" });
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

    const { publicNotes, statusOverride, shareEnabled, finishedNotes, startNotes } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (publicNotes !== undefined) updates.publicNotes = publicNotes;
    if (statusOverride !== undefined) updates.statusOverride = statusOverride;
    if (shareEnabled !== undefined) updates.shareEnabled = shareEnabled;
    if (finishedNotes !== undefined) updates.finishedNotes = finishedNotes;
    if (startNotes !== undefined) updates.startNotes = startNotes;

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
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope)) return;

    // Verify item belongs to this job's checklist
    const [job] = await db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, jobId))
      .limit(1);
    if (!job || !belongsToBusiness(job, scope)) return res.status(404).json({ error: "Job not found" });

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

    const { completed, notes, scheduledDate, assignedSubcontractorId } = req.body;
    const updates: Record<string, unknown> = {};

    if (scheduledDate !== undefined && scheduledDate !== null && !isDateOnly(scheduledDate)) {
      return res.status(400).json({ error: "scheduledDate must be a valid YYYY-MM-DD date or null" });
    }
    if (assignedSubcontractorId !== undefined && assignedSubcontractorId !== null &&
      (!Number.isInteger(Number(assignedSubcontractorId)) || Number(assignedSubcontractorId) <= 0)) {
      return res.status(400).json({ error: "assignedSubcontractorId must be a positive integer or null" });
    }
    if (assignedSubcontractorId !== undefined && assignedSubcontractorId !== null) {
      const [assignment] = await db
        .select({ subcontractorId: jobSubcontractorsTable.subcontractorId })
        .from(jobSubcontractorsTable)
        .where(and(
          eq(jobSubcontractorsTable.jobId, jobId),
          eq(jobSubcontractorsTable.subcontractorId, Number(assignedSubcontractorId)),
        ))
        .limit(1);
      if (!assignment) return res.status(400).json({ error: "Subcontractor must be assigned to this job" });
    }

    // Guard: if the item has parts, completed is derived from parts and cannot be set directly
    if (completed !== undefined) {
      const parts = await db
        .select({ id: jobChecklistItemPartsTable.id })
        .from(jobChecklistItemPartsTable)
        .where(eq(jobChecklistItemPartsTable.jobChecklistItemId, itemId))
        .limit(1);
      if (parts.length > 0) {
        return res.status(400).json({ error: "Completion is controlled by parts" });
      }
    }

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
    if (scheduledDate !== undefined) updates.scheduledDate = scheduledDate;
    if (assignedSubcontractorId !== undefined) updates.assignedSubcontractorId = assignedSubcontractorId === null ? null : Number(assignedSubcontractorId);

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

// ── POST /:jobId/checklist/items/:itemId/parts — create a part ────────────────
router.post("/:jobId/checklist/items/:itemId/parts", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId as string, 10);
    const itemId = parseInt(req.params.itemId as string, 10);
    if (isNaN(jobId) || isNaN(itemId)) return res.status(400).json({ error: "Invalid parameters" });

    const [checklist] = await db.select().from(jobChecklistsTable).where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.status(404).json({ error: "No checklist for this job" });

    const [item] = await db.select().from(jobChecklistItemsTable)
      .where(and(eq(jobChecklistItemsTable.id, itemId), eq(jobChecklistItemsTable.jobChecklistId, checklist.id)));
    if (!item) return res.status(404).json({ error: "Item not found" });

    const existing = await db.select({ id: jobChecklistItemPartsTable.id })
      .from(jobChecklistItemPartsTable)
      .where(eq(jobChecklistItemPartsTable.jobChecklistItemId, itemId));
    if (existing.length >= 5) return res.status(400).json({ error: "Maximum of 5 parts per item" });

    const { label } = req.body;
    const sortOrder = existing.length;
    await db.insert(jobChecklistItemPartsTable)
      .values({ jobChecklistItemId: itemId, label: label ?? `Part ${existing.length + 1}`, sortOrder });

    // Always recalc item completion and section after any part addition
    await recalcItemFromParts(itemId);
    await recalcSection(item.jobChecklistSectionId, checklist.id);

    const data = await buildChecklistResponse(checklist.id);
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create part" });
  }
});

// ── PATCH /:jobId/checklist/items/:itemId/parts/:partId — toggle/rename ───────
router.patch("/:jobId/checklist/items/:itemId/parts/:partId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId as string, 10);
    const itemId = parseInt(req.params.itemId as string, 10);
    const partId = parseInt(req.params.partId, 10);
    if (isNaN(jobId) || isNaN(itemId) || isNaN(partId)) return res.status(400).json({ error: "Invalid parameters" });
    const user = getRequestUser(req);

    const [checklist] = await db.select().from(jobChecklistsTable).where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.status(404).json({ error: "No checklist for this job" });

    const [item] = await db.select().from(jobChecklistItemsTable)
      .where(and(eq(jobChecklistItemsTable.id, itemId), eq(jobChecklistItemsTable.jobChecklistId, checklist.id)));
    if (!item) return res.status(404).json({ error: "Item not found" });

    const [part] = await db.select().from(jobChecklistItemPartsTable)
      .where(and(eq(jobChecklistItemPartsTable.id, partId), eq(jobChecklistItemPartsTable.jobChecklistItemId, itemId)));
    if (!part) return res.status(404).json({ error: "Part not found" });

    const { completed, label } = req.body;
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
    if (label !== undefined) updates.label = label;

    await db.update(jobChecklistItemPartsTable).set(updates).where(eq(jobChecklistItemPartsTable.id, partId));

    if (completed !== undefined) {
      await recalcItemFromParts(itemId);
      await recalcSection(item.jobChecklistSectionId, checklist.id);
    }

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update part" });
  }
});

// ── DELETE /:jobId/checklist/items/:itemId/parts/:partId ──────────────────────
router.delete("/:jobId/checklist/items/:itemId/parts/:partId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId as string, 10);
    const itemId = parseInt(req.params.itemId as string, 10);
    const partId = parseInt(req.params.partId, 10);
    if (isNaN(jobId) || isNaN(itemId) || isNaN(partId)) return res.status(400).json({ error: "Invalid parameters" });

    const [checklist] = await db.select().from(jobChecklistsTable).where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.status(404).json({ error: "No checklist for this job" });

    const [item] = await db.select().from(jobChecklistItemsTable)
      .where(and(eq(jobChecklistItemsTable.id, itemId), eq(jobChecklistItemsTable.jobChecklistId, checklist.id)));
    if (!item) return res.status(404).json({ error: "Item not found" });

    const [part] = await db.select().from(jobChecklistItemPartsTable)
      .where(and(eq(jobChecklistItemPartsTable.id, partId), eq(jobChecklistItemPartsTable.jobChecklistItemId, itemId)));
    if (!part) return res.status(404).json({ error: "Part not found" });

    await db.delete(jobChecklistItemPartsTable).where(eq(jobChecklistItemPartsTable.id, partId));

    await recalcItemFromParts(itemId);
    await recalcSection(item.jobChecklistSectionId, checklist.id);

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete part" });
  }
});

// ── POST /:jobId/checklist/items/:itemId/photos ───────────────────────────────
router.post("/:jobId/checklist/items/:itemId/photos", photoUpload.array("photos", 10), async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId as string, 10);
    const itemId = parseInt(req.params.itemId as string, 10);
    if (isNaN(jobId) || isNaN(itemId)) return res.status(400).json({ error: "Invalid parameters" });
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) return res.status(400).json({ error: "No files uploaded" });

    // Verify item belongs to this job's checklist (ownership check)
    const [item] = await db
      .select({ id: jobChecklistItemsTable.id, jobChecklistId: jobChecklistItemsTable.jobChecklistId })
      .from(jobChecklistItemsTable)
      .where(eq(jobChecklistItemsTable.id, itemId));
    if (!item) return res.status(404).json({ error: "Item not found" });

    const [checklist] = await db
      .select({ id: jobChecklistsTable.id, jobId: jobChecklistsTable.jobId })
      .from(jobChecklistsTable)
      .where(eq(jobChecklistsTable.id, item.jobChecklistId));
    if (!checklist || checklist.jobId !== jobId) return res.status(403).json({ error: "Item does not belong to this job" });

    const objStorage = new ObjectStorageService();
    await Promise.all(files.map(async (file) => {
      const objectPath = await objStorage.uploadBufferWithFilename(
        file.buffer,
        file.mimetype,
        "uploads/checklist-photos",
        file.originalname || `photo-${Date.now()}.jpg`,
      );
      await db
        .insert(jobChecklistItemPhotosTable)
        .values({ jobChecklistItemId: itemId, objectPath });
    }));

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload photo" });
  }
});

// ── DELETE /:jobId/checklist/items/:itemId/photos/:photoId ────────────────────
router.delete("/:jobId/checklist/items/:itemId/photos/:photoId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId as string, 10);
    const itemId = parseInt(req.params.itemId as string, 10);
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

// ── POST /:jobId/checklist/status — Set status + log the change ───────────────
router.post("/:jobId/checklist/status", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const [checklist] = await db.select().from(jobChecklistsTable).where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.status(404).json({ error: "Checklist not found" });

    const { status } = req.body; // null or string
    const now = new Date();

    // Close any open log entry
    const [openEntry] = await db
      .select()
      .from(jobChecklistStatusLogTable)
      .where(and(eq(jobChecklistStatusLogTable.jobChecklistId, checklist.id), isNull(jobChecklistStatusLogTable.endedAt)));

    if (openEntry) {
      const durationMin = Math.max(0, Math.round((now.getTime() - openEntry.startedAt.getTime()) / 60000));
      await db.update(jobChecklistStatusLogTable)
        .set({ endedAt: now, durationMin })
        .where(eq(jobChecklistStatusLogTable.id, openEntry.id));
    }

    // Create new entry if not null / "In Progress"
    if (status && status !== "In Progress") {
      await db.insert(jobChecklistStatusLogTable).values({
        jobChecklistId: checklist.id,
        status,
        startedAt: now,
      });
    }

    await db.update(jobChecklistsTable)
      .set({ statusOverride: status || null, updatedAt: now })
      .where(eq(jobChecklistsTable.id, checklist.id));

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to set status" });
  }
});

// ── PATCH /:jobId/checklist/status-log/:logId — Edit timestamps ───────────────
router.patch("/:jobId/checklist/status-log/:logId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const logId = parseInt(req.params.logId);
    if (isNaN(jobId) || isNaN(logId)) return res.status(400).json({ error: "Invalid parameters" });

    const [checklist] = await db.select({ id: jobChecklistsTable.id }).from(jobChecklistsTable).where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.status(404).json({ error: "Checklist not found" });

    const [entry] = await db.select().from(jobChecklistStatusLogTable)
      .where(and(eq(jobChecklistStatusLogTable.id, logId), eq(jobChecklistStatusLogTable.jobChecklistId, checklist.id)));
    if (!entry) return res.status(404).json({ error: "Log entry not found" });

    const { startedAt, endedAt } = req.body;
    const updates: Record<string, unknown> = {};

    const newStart = startedAt ? new Date(startedAt) : entry.startedAt;
    const newEnd = endedAt !== undefined ? (endedAt ? new Date(endedAt) : null) : entry.endedAt;

    updates.startedAt = newStart;
    updates.endedAt = newEnd;

    if (newStart && newEnd) {
      updates.durationMin = Math.max(0, Math.round((new Date(newEnd as Date).getTime() - new Date(newStart).getTime()) / 60000));
    } else {
      updates.durationMin = null;
    }

    await db.update(jobChecklistStatusLogTable).set(updates).where(eq(jobChecklistStatusLogTable.id, logId));

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update log entry" });
  }
});

// ── DELETE /:jobId/checklist/status-log/:logId ────────────────────────────────
router.delete("/:jobId/checklist/status-log/:logId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const logId = parseInt(req.params.logId);
    if (isNaN(jobId) || isNaN(logId)) return res.status(400).json({ error: "Invalid parameters" });

    const [checklist] = await db.select({ id: jobChecklistsTable.id }).from(jobChecklistsTable).where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.status(404).json({ error: "Checklist not found" });

    await db.delete(jobChecklistStatusLogTable)
      .where(and(eq(jobChecklistStatusLogTable.id, logId), eq(jobChecklistStatusLogTable.jobChecklistId, checklist.id)));

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete log entry" });
  }
});

// ── POST /:jobId/checklist/sections/:sectionId/notes ─────────────────────────
router.post("/:jobId/checklist/sections/:sectionId/notes", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const sectionId = parseInt(req.params.sectionId);
    if (isNaN(jobId) || isNaN(sectionId)) return res.status(400).json({ error: "Invalid parameters" });

    const [checklist] = await db.select().from(jobChecklistsTable).where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.status(404).json({ error: "Checklist not found" });

    const [section] = await db.select().from(jobChecklistSectionsTable)
      .where(and(eq(jobChecklistSectionsTable.id, sectionId), eq(jobChecklistSectionsTable.jobChecklistId, checklist.id)));
    if (!section) return res.status(404).json({ error: "Section not found" });

    const { note, authorName } = req.body;
    if (!note?.trim()) return res.status(400).json({ error: "Note text is required" });

    await db.insert(jobChecklistSectionNotesTable).values({
      jobChecklistSectionId: sectionId,
      note: note.trim(),
      authorName: (authorName ?? "").trim(),
    });

    await db.update(jobChecklistsTable).set({ updatedAt: new Date() }).where(eq(jobChecklistsTable.id, checklist.id));

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add note" });
  }
});

// ── DELETE /:jobId/checklist/sections/:sectionId/notes/:noteId ────────────────
router.delete("/:jobId/checklist/sections/:sectionId/notes/:noteId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const sectionId = parseInt(req.params.sectionId);
    const noteId = parseInt(req.params.noteId);
    if (isNaN(jobId) || isNaN(sectionId) || isNaN(noteId)) return res.status(400).json({ error: "Invalid parameters" });

    const [checklist] = await db.select({ id: jobChecklistsTable.id }).from(jobChecklistsTable).where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.status(404).json({ error: "Checklist not found" });

    await db.delete(jobChecklistSectionNotesTable)
      .where(and(eq(jobChecklistSectionNotesTable.id, noteId), eq(jobChecklistSectionNotesTable.jobChecklistSectionId, sectionId)));

    await db.update(jobChecklistsTable).set({ updatedAt: new Date() }).where(eq(jobChecklistsTable.id, checklist.id));

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete note" });
  }
});

// ── POST /:jobId/checklist/finished-photos ────────────────────────────────────
router.post("/:jobId/checklist/finished-photos", photoUpload.array("photos", 20), async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId as string, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) return res.status(400).json({ error: "No files uploaded" });

    const [checklist] = await db
      .select({ id: jobChecklistsTable.id })
      .from(jobChecklistsTable)
      .where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.status(404).json({ error: "Checklist not found" });

    const objStorage = new ObjectStorageService();
    await Promise.all(files.map(async (file) => {
      const objectPath = await objStorage.uploadBufferWithFilename(
        file.buffer,
        file.mimetype,
        "uploads/finished-photos",
        file.originalname || `photo-${Date.now()}.jpg`,
      );
      await db.insert(jobFinishedPhotosTable).values({ jobChecklistId: checklist.id, objectPath });
    }));

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload photo" });
  }
});

// ── DELETE /:jobId/checklist/finished-photos/:photoId ─────────────────────────
router.delete("/:jobId/checklist/finished-photos/:photoId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId as string, 10);
    const photoId = parseInt(req.params.photoId, 10);
    if (isNaN(jobId) || isNaN(photoId)) return res.status(400).json({ error: "Invalid parameters" });

    const [photo] = await db
      .select()
      .from(jobFinishedPhotosTable)
      .where(eq(jobFinishedPhotosTable.id, photoId));
    if (!photo) return res.status(404).json({ error: "Photo not found" });

    const [checklist] = await db
      .select({ id: jobChecklistsTable.id, jobId: jobChecklistsTable.jobId })
      .from(jobChecklistsTable)
      .where(eq(jobChecklistsTable.id, photo.jobChecklistId));
    if (!checklist || checklist.jobId !== jobId) return res.status(403).json({ error: "Photo does not belong to this job" });

    if (photo.objectPath.startsWith("/objects/")) {
      try {
        const objStorage = new ObjectStorageService();
        await objStorage.deleteObject(photo.objectPath);
      } catch { /* best-effort */ }
    }

    await db.delete(jobFinishedPhotosTable).where(eq(jobFinishedPhotosTable.id, photoId));

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete photo" });
  }
});

// ── POST /:jobId/checklist/start-photos ───────────────────────────────────────
router.post("/:jobId/checklist/start-photos", photoUpload.array("photos", 20), async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId as string, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) return res.status(400).json({ error: "No files uploaded" });

    const [checklist] = await db.select({ id: jobChecklistsTable.id }).from(jobChecklistsTable).where(eq(jobChecklistsTable.jobId, jobId));
    if (!checklist) return res.status(404).json({ error: "Checklist not found" });

    const objStorage = new ObjectStorageService();
    await Promise.all(files.map(async (file) => {
      const objectPath = await objStorage.uploadBufferWithFilename(
        file.buffer,
        file.mimetype,
        "uploads/start-photos",
        file.originalname || `photo-${Date.now()}.jpg`,
      );
      await db.insert(jobStartPhotosTable).values({ jobChecklistId: checklist.id, objectPath });
    }));

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload photo" });
  }
});

// ── DELETE /:jobId/checklist/start-photos/:photoId ────────────────────────────
router.delete("/:jobId/checklist/start-photos/:photoId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId as string, 10);
    const photoId = parseInt(req.params.photoId, 10);
    if (isNaN(jobId) || isNaN(photoId)) return res.status(400).json({ error: "Invalid parameters" });

    const [photo] = await db.select().from(jobStartPhotosTable).where(eq(jobStartPhotosTable.id, photoId));
    if (!photo) return res.status(404).json({ error: "Photo not found" });

    const [checklist] = await db
      .select({ id: jobChecklistsTable.id, jobId: jobChecklistsTable.jobId })
      .from(jobChecklistsTable)
      .where(eq(jobChecklistsTable.id, photo.jobChecklistId));
    if (!checklist || checklist.jobId !== jobId) return res.status(403).json({ error: "Photo does not belong to this job" });

    if (photo.objectPath.startsWith("/objects/")) {
      try {
        const objStorage = new ObjectStorageService();
        await objStorage.deleteObject(photo.objectPath);
      } catch { /* best-effort */ }
    }

    await db.delete(jobStartPhotosTable).where(eq(jobStartPhotosTable.id, photoId));

    const data = await buildChecklistResponse(checklist.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete photo" });
  }
});

export default router;
