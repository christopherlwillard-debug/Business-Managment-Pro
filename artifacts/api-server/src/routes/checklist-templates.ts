import { Router } from "express";
import { db } from "@workspace/db";
import {
  checklistTemplatesTable,
  checklistTemplateSectionsTable,
  checklistTemplateItemsTable,
} from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

// ── List all templates ────────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  try {
    const templates = await db
      .select()
      .from(checklistTemplatesTable)
      .orderBy(asc(checklistTemplatesTable.createdAt));

    const sections = await db
      .select()
      .from(checklistTemplateSectionsTable)
      .orderBy(asc(checklistTemplateSectionsTable.sortOrder));

    const items = await db
      .select()
      .from(checklistTemplateItemsTable)
      .orderBy(asc(checklistTemplateItemsTable.sortOrder));

    const result = templates.map(t => ({
      ...t,
      sections: sections
        .filter(s => s.templateId === t.id)
        .map(s => ({
          ...s,
          items: items.filter(i => i.sectionId === s.id),
        })),
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load templates" });
  }
});

// ── Get single template ───────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [template] = await db
      .select()
      .from(checklistTemplatesTable)
      .where(eq(checklistTemplatesTable.id, id));
    if (!template) return res.status(404).json({ error: "Template not found" });

    const sections = await db
      .select()
      .from(checklistTemplateSectionsTable)
      .where(eq(checklistTemplateSectionsTable.templateId, id))
      .orderBy(asc(checklistTemplateSectionsTable.sortOrder));

    const sectionIds = sections.map(s => s.id);
    const items = sectionIds.length > 0
      ? await db
          .select()
          .from(checklistTemplateItemsTable)
          .where(eq(checklistTemplateItemsTable.sectionId, sectionIds[0]))
          .orderBy(asc(checklistTemplateItemsTable.sortOrder))
      : [];

    // Re-fetch all items for all sections
    const allItems = await db
      .select()
      .from(checklistTemplateItemsTable)
      .orderBy(asc(checklistTemplateItemsTable.sortOrder));

    res.json({
      ...template,
      sections: sections.map(s => ({
        ...s,
        items: allItems.filter(i => i.sectionId === s.id),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load template" });
  }
});

// ── Create template ───────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { name, category } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const [template] = await db
      .insert(checklistTemplatesTable)
      .values({ name: name.trim(), category: category ?? null })
      .returning();

    res.status(201).json({ ...template, sections: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create template" });
  }
});

// ── Update template ───────────────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, category, active } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (category !== undefined) updates.category = category;
    if (active !== undefined) updates.active = active;

    const [updated] = await db
      .update(checklistTemplatesTable)
      .set(updates)
      .where(eq(checklistTemplatesTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Template not found" });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update template" });
  }
});

// ── Delete template ───────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(checklistTemplatesTable).where(eq(checklistTemplatesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// ── Duplicate template ────────────────────────────────────────────────────────
router.post("/:id/duplicate", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [original] = await db
      .select()
      .from(checklistTemplatesTable)
      .where(eq(checklistTemplatesTable.id, id));
    if (!original) return res.status(404).json({ error: "Template not found" });

    const sections = await db
      .select()
      .from(checklistTemplateSectionsTable)
      .where(eq(checklistTemplateSectionsTable.templateId, id))
      .orderBy(asc(checklistTemplateSectionsTable.sortOrder));

    const allItems = await db
      .select()
      .from(checklistTemplateItemsTable)
      .orderBy(asc(checklistTemplateItemsTable.sortOrder));

    const [copy] = await db
      .insert(checklistTemplatesTable)
      .values({ name: `${original.name} (Copy)`, category: original.category, active: original.active })
      .returning();

    for (const section of sections) {
      const [newSection] = await db
        .insert(checklistTemplateSectionsTable)
        .values({ templateId: copy.id, name: section.name, sortOrder: section.sortOrder })
        .returning();

      const sectionItems = allItems.filter(i => i.sectionId === section.id);
      for (const item of sectionItems) {
        await db.insert(checklistTemplateItemsTable).values({
          sectionId: newSection.id,
          title: item.title,
          sortOrder: item.sortOrder,
        });
      }
    }

    // Return full template
    const newSections = await db
      .select()
      .from(checklistTemplateSectionsTable)
      .where(eq(checklistTemplateSectionsTable.templateId, copy.id))
      .orderBy(asc(checklistTemplateSectionsTable.sortOrder));
    const newItems = await db
      .select()
      .from(checklistTemplateItemsTable)
      .orderBy(asc(checklistTemplateItemsTable.sortOrder));

    res.status(201).json({
      ...copy,
      sections: newSections.map(s => ({
        ...s,
        items: newItems.filter(i => i.sectionId === s.id),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to duplicate template" });
  }
});

// ── Section CRUD ──────────────────────────────────────────────────────────────
router.post("/:id/sections", async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const { name, sortOrder } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Section name required" });

    const [section] = await db
      .insert(checklistTemplateSectionsTable)
      .values({ templateId, name: name.trim(), sortOrder: sortOrder ?? 0 })
      .returning();
    res.status(201).json({ ...section, items: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create section" });
  }
});

router.patch("/:id/sections/:sectionId", async (req, res) => {
  try {
    const sectionId = parseInt(req.params.sectionId);
    const { name, sortOrder } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const [updated] = await db
      .update(checklistTemplateSectionsTable)
      .set(updates)
      .where(eq(checklistTemplateSectionsTable.id, sectionId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Section not found" });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update section" });
  }
});

router.delete("/:id/sections/:sectionId", async (req, res) => {
  try {
    const sectionId = parseInt(req.params.sectionId);
    await db.delete(checklistTemplateSectionsTable).where(eq(checklistTemplateSectionsTable.id, sectionId));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete section" });
  }
});

// ── Item CRUD ─────────────────────────────────────────────────────────────────
router.post("/:id/sections/:sectionId/items", async (req, res) => {
  try {
    const sectionId = parseInt(req.params.sectionId);
    const { title, sortOrder } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Item title required" });

    const [item] = await db
      .insert(checklistTemplateItemsTable)
      .values({ sectionId, title: title.trim(), sortOrder: sortOrder ?? 0 })
      .returning();
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create item" });
  }
});

router.patch("/:id/sections/:sectionId/items/:itemId", async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const { title, sortOrder } = req.body;
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title.trim();
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const [updated] = await db
      .update(checklistTemplateItemsTable)
      .set(updates)
      .where(eq(checklistTemplateItemsTable.id, itemId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Item not found" });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update item" });
  }
});

router.delete("/:id/sections/:sectionId/items/:itemId", async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId);
    await db.delete(checklistTemplateItemsTable).where(eq(checklistTemplateItemsTable.id, itemId));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete item" });
  }
});

export default router;
