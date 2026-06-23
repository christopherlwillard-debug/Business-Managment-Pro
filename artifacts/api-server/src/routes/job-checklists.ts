import { Router } from "express";
import { db } from "@workspace/db";
import {
  checklistTemplatesTable,
  checklistTemplateSectionsTable,
  checklistTemplateItemsTable,
  jobChecklistsTable,
  jobChecklistSectionsTable,
  jobChecklistItemsTable,
  jobsTable,
} from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { getRequestUser } from "./guards";
import crypto from "crypto";

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
      items: items.filter(i => i.jobChecklistSectionId === s.id),
    })),
  };
}

// ── GET /:jobId/checklist ─────────────────────────────────────────────────────
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

    const [section] = await db
      .select()
      .from(jobChecklistSectionsTable)
      .where(eq(jobChecklistSectionsTable.id, sectionId));
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
      .where(eq(jobChecklistsTable.jobId, jobId));

    const data = await buildChecklistResponse(section.jobChecklistId);
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
    const user = getRequestUser(req);

    const [item] = await db
      .select()
      .from(jobChecklistItemsTable)
      .where(eq(jobChecklistItemsTable.id, itemId));
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

    await recalcSection(item.jobChecklistSectionId, item.jobChecklistId);

    const data = await buildChecklistResponse(item.jobChecklistId);
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

    const [item] = await db
      .select()
      .from(jobChecklistItemsTable)
      .where(eq(jobChecklistItemsTable.id, itemId));
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

    await recalcSection(item.jobChecklistSectionId, item.jobChecklistId);

    const data = await buildChecklistResponse(item.jobChecklistId);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to skip item" });
  }
});

export default router;
