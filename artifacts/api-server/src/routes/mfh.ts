import { Router } from "express";
import { db } from "@workspace/db";
import {
  mfhConstructionTypesTable,
  mfhManufacturersTable,
  mfhModelsTable,
  mfhPricingGuidesTable,
  mfhGuideItemsTable,
  mfhGuideAddonsTable,
  jobsTable,
  estimatesTable,
  jobTypeBenchmarksTable,
  checklistTemplatesTable,
  checklistTemplateSectionsTable,
  checklistTemplateItemsTable,
  jobChecklistsTable,
  jobChecklistSectionsTable,
  jobChecklistItemsTable,
} from "@workspace/db/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import crypto from "crypto";

// ── Seed ──────────────────────────────────────────────────────────────────────
let seeded = false;
async function ensureSeeded() {
  if (seeded) return;
  const existing = await db.select({ id: mfhManufacturersTable.id }).from(mfhManufacturersTable).limit(1);
  if (existing.length > 0) { seeded = true; return; }

  await db.insert(mfhConstructionTypesTable).values([
    { name: "VOG" }, { name: "Hybrid" }, { name: "Drywall" },
  ]).onConflictDoNothing();

  const [vog, hybrid, drywall] = await db.select().from(mfhConstructionTypesTable).orderBy(asc(mfhConstructionTypesTable.id));
  const [clayton] = await db.insert(mfhManufacturersTable).values({ name: "Clayton" }).returning();

  const allModelInserts = [
    ...["Appalachia", "Giles", "Southern", "Wakarusa", "Champion", "Tru"].map(name => ({ manufacturerId: clayton.id, name, constructionTypeId: vog.id })),
    ...["Addison"].map(name => ({ manufacturerId: clayton.id, name, constructionTypeId: hybrid.id })),
    ...["Norris", "Rutledge", "Middlebury"].map(name => ({ manufacturerId: clayton.id, name, constructionTypeId: drywall.id })),
  ];
  const insertedModels = await db.insert(mfhModelsTable).values(allModelInserts).returning();

  const [dealerGuide, myPricing] = await db.insert(mfhPricingGuidesTable).values([
    { manufacturerId: clayton.id, name: "Dealer Guide", isDealerGuide: true },
    { manufacturerId: clayton.id, name: "My Pricing", isDealerGuide: false },
  ]).returning();

  const dealerItems = insertedModels.map(m => ({
    guideId: dealerGuide.id, modelId: m.id,
    basePrice: m.constructionTypeId === hybrid.id ? "2500" : m.constructionTypeId === drywall.id ? "3500" : "1500",
  }));
  await db.insert(mfhGuideItemsTable).values([
    ...dealerItems,
    ...dealerItems.map(i => ({ ...i, guideId: myPricing.id })),
  ]);
  for (const guideId of [dealerGuide.id, myPricing.id]) {
    await db.insert(mfhGuideAddonsTable).values([
      { guideId, addonKey: "vinyl_ends", label: "Vinyl Ends", price: "1000", isPerDay: false },
      { guideId, addonKey: "plumbing", label: "Plumbing Under Home", price: "1000", isPerDay: false },
      { guideId, addonKey: "travel", label: "Over 60 Miles Travel", price: "150", isPerDay: true },
    ]);
  }
  seeded = true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function buildMfhLines(
  guideId: number, modelId: number,
  selectedKeys: string[], travelDays: number,
  modelName: string, ctName: string,
  addons: { addonKey: string; label: string; price: string; isPerDay: boolean }[],
  basePrice: number,
) {
  const lines: Array<{ category: string; description: string; quantity: number; unit: string | null; unitCost: number; generatedBy: string }> = [
    { category: "Labor", description: `${modelName} (${ctName}) Trim-Out`, quantity: 1, unit: "LOT", unitCost: basePrice, generatedBy: "MFH" },
  ];
  for (const addon of addons) {
    if (!selectedKeys.includes(addon.addonKey)) continue;
    const days = addon.isPerDay ? (travelDays || 1) : 1;
    lines.push({
      category: "Other",
      description: addon.isPerDay ? `${addon.label} (${days} day${days !== 1 ? "s" : ""})` : addon.label,
      quantity: days,
      unit: addon.isPerDay ? "DAY" : "LOT",
      unitCost: parseFloat(addon.price),
      generatedBy: "MFH",
    });
  }
  return lines;
}

// ── Library router (requireOwner) ─────────────────────────────────────────────
export const mfhLibraryRouter = Router();

// Construction types
mfhLibraryRouter.get("/construction-types", async (_req, res) => {
  try {
    await ensureSeeded();
    res.json(await db.select().from(mfhConstructionTypesTable).orderBy(asc(mfhConstructionTypesTable.name)));
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.post("/construction-types", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    const [row] = await db.insert(mfhConstructionTypesTable).values({ name: name.trim() }).returning();
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// Manufacturers
mfhLibraryRouter.get("/manufacturers", async (_req, res) => {
  try {
    await ensureSeeded();
    res.json(await db.select().from(mfhManufacturersTable).orderBy(asc(mfhManufacturersTable.name)));
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.post("/manufacturers", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    const [row] = await db.insert(mfhManufacturersTable).values({ name: name.trim() }).returning();
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.patch("/manufacturers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    const [row] = await db.update(mfhManufacturersTable).set({ name: name.trim() }).where(eq(mfhManufacturersTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.delete("/manufacturers/:id", async (req, res) => {
  try {
    await db.delete(mfhManufacturersTable).where(eq(mfhManufacturersTable.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// Models
mfhLibraryRouter.get("/models", async (req, res) => {
  try {
    await ensureSeeded();
    const { manufacturerId, includeInactive } = req.query;
    const conditions = [];
    if (manufacturerId) conditions.push(eq(mfhModelsTable.manufacturerId, parseInt(manufacturerId as string)));
    if (!includeInactive) conditions.push(eq(mfhModelsTable.active, true));
    const models = await db.select({
      id: mfhModelsTable.id, manufacturerId: mfhModelsTable.manufacturerId,
      name: mfhModelsTable.name, constructionTypeId: mfhModelsTable.constructionTypeId,
      constructionTypeName: mfhConstructionTypesTable.name,
      benchmarkId: mfhModelsTable.benchmarkId, benchmarkName: jobTypeBenchmarksTable.jobType,
      checklistTemplateId: mfhModelsTable.checklistTemplateId, checklistTemplateName: checklistTemplatesTable.name,
      defaultAddonKeys: mfhModelsTable.defaultAddonKeys, notes: mfhModelsTable.notes,
      active: mfhModelsTable.active, introducedYear: mfhModelsTable.introducedYear,
      discontinuedYear: mfhModelsTable.discontinuedYear, createdAt: mfhModelsTable.createdAt,
    }).from(mfhModelsTable)
      .leftJoin(mfhConstructionTypesTable, eq(mfhModelsTable.constructionTypeId, mfhConstructionTypesTable.id))
      .leftJoin(jobTypeBenchmarksTable, eq(mfhModelsTable.benchmarkId, jobTypeBenchmarksTable.id))
      .leftJoin(checklistTemplatesTable, eq(mfhModelsTable.checklistTemplateId, checklistTemplatesTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(mfhModelsTable.name));
    res.json(models);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.post("/models", async (req, res) => {
  try {
    const { manufacturerId, name, constructionTypeId, benchmarkId, checklistTemplateId, defaultAddonKeys, notes, active, introducedYear, discontinuedYear } = req.body;
    if (!manufacturerId || !name?.trim() || !constructionTypeId) return res.status(400).json({ error: "manufacturerId, name, constructionTypeId required" });
    const [row] = await db.insert(mfhModelsTable).values({
      manufacturerId: parseInt(manufacturerId), name: name.trim(),
      constructionTypeId: parseInt(constructionTypeId),
      benchmarkId: benchmarkId ? parseInt(benchmarkId) : null,
      checklistTemplateId: checklistTemplateId ? parseInt(checklistTemplateId) : null,
      defaultAddonKeys: defaultAddonKeys ?? [],
      notes: notes || null, active: active !== false,
      introducedYear: introducedYear ? parseInt(introducedYear) : null,
      discontinuedYear: discontinuedYear ? parseInt(discontinuedYear) : null,
    }).returning();
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.patch("/models/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, constructionTypeId, benchmarkId, checklistTemplateId, defaultAddonKeys, notes, active, introducedYear, discontinuedYear } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (constructionTypeId !== undefined) updates.constructionTypeId = parseInt(constructionTypeId);
    if (benchmarkId !== undefined) updates.benchmarkId = benchmarkId ? parseInt(benchmarkId) : null;
    if (checklistTemplateId !== undefined) updates.checklistTemplateId = checklistTemplateId ? parseInt(checklistTemplateId) : null;
    if (defaultAddonKeys !== undefined) updates.defaultAddonKeys = defaultAddonKeys;
    if (notes !== undefined) updates.notes = notes || null;
    if (active !== undefined) updates.active = active;
    if (introducedYear !== undefined) updates.introducedYear = introducedYear ? parseInt(introducedYear) : null;
    if (discontinuedYear !== undefined) updates.discontinuedYear = discontinuedYear ? parseInt(discontinuedYear) : null;
    const [row] = await db.update(mfhModelsTable).set(updates).where(eq(mfhModelsTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.delete("/models/:id", async (req, res) => {
  try {
    await db.delete(mfhModelsTable).where(eq(mfhModelsTable.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// Guides
mfhLibraryRouter.get("/guides", async (req, res) => {
  try {
    await ensureSeeded();
    const { manufacturerId } = req.query;
    const conditions = manufacturerId ? [eq(mfhPricingGuidesTable.manufacturerId, parseInt(manufacturerId as string))] : [];
    const rows = await db.select().from(mfhPricingGuidesTable).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(mfhPricingGuidesTable.createdAt));
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.post("/guides", async (req, res) => {
  try {
    const { manufacturerId, name, isDealerGuide } = req.body;
    if (!manufacturerId || !name?.trim()) return res.status(400).json({ error: "manufacturerId and name required" });
    const [row] = await db.insert(mfhPricingGuidesTable).values({ manufacturerId: parseInt(manufacturerId), name: name.trim(), isDealerGuide: isDealerGuide === true }).returning();
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.patch("/guides/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, isDealerGuide } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (isDealerGuide !== undefined) updates.isDealerGuide = isDealerGuide;
    const [row] = await db.update(mfhPricingGuidesTable).set(updates).where(eq(mfhPricingGuidesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.delete("/guides/:id", async (req, res) => {
  try {
    await db.delete(mfhPricingGuidesTable).where(eq(mfhPricingGuidesTable.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// Guide items
mfhLibraryRouter.get("/guide-items", async (req, res) => {
  try {
    const { guideId, modelId } = req.query;
    const conditions = [];
    if (guideId) conditions.push(eq(mfhGuideItemsTable.guideId, parseInt(guideId as string)));
    if (modelId) conditions.push(eq(mfhGuideItemsTable.modelId, parseInt(modelId as string)));
    res.json(await db.select().from(mfhGuideItemsTable).where(conditions.length ? and(...conditions) : undefined));
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.put("/guide-items/upsert", async (req, res) => {
  try {
    const { guideId, modelId, basePrice } = req.body;
    if (!guideId || !modelId) return res.status(400).json({ error: "guideId and modelId required" });
    const existing = await db.select().from(mfhGuideItemsTable)
      .where(and(eq(mfhGuideItemsTable.guideId, parseInt(guideId)), eq(mfhGuideItemsTable.modelId, parseInt(modelId)))).limit(1);
    if (existing.length > 0) {
      const [row] = await db.update(mfhGuideItemsTable).set({ basePrice: String(basePrice ?? 0) }).where(eq(mfhGuideItemsTable.id, existing[0].id)).returning();
      return res.json(row);
    }
    const [row] = await db.insert(mfhGuideItemsTable).values({ guideId: parseInt(guideId), modelId: parseInt(modelId), basePrice: String(basePrice ?? 0) }).returning();
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// Guide addons
mfhLibraryRouter.get("/guide-addons", async (req, res) => {
  try {
    const { guideId } = req.query;
    const conditions = guideId ? [eq(mfhGuideAddonsTable.guideId, parseInt(guideId as string))] : [];
    res.json(await db.select().from(mfhGuideAddonsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(mfhGuideAddonsTable.createdAt)));
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.post("/guide-addons", async (req, res) => {
  try {
    const { guideId, addonKey, label, price, isPerDay } = req.body;
    if (!guideId || !addonKey?.trim() || !label?.trim()) return res.status(400).json({ error: "guideId, addonKey, label required" });
    const [row] = await db.insert(mfhGuideAddonsTable).values({ guideId: parseInt(guideId), addonKey: addonKey.trim(), label: label.trim(), price: String(price ?? 0), isPerDay: isPerDay === true }).returning();
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.patch("/guide-addons/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { label, price, isPerDay } = req.body;
    const updates: Record<string, unknown> = {};
    if (label !== undefined) updates.label = label.trim();
    if (price !== undefined) updates.price = String(price);
    if (isPerDay !== undefined) updates.isPerDay = isPerDay;
    const [row] = await db.update(mfhGuideAddonsTable).set(updates).where(eq(mfhGuideAddonsTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.delete("/guide-addons/:id", async (req, res) => {
  try {
    await db.delete(mfhGuideAddonsTable).where(eq(mfhGuideAddonsTable.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// Panel data
mfhLibraryRouter.get("/panel-data", async (req, res) => {
  try {
    await ensureSeeded();
    const { manufacturerId } = req.query;
    if (!manufacturerId) return res.status(400).json({ error: "manufacturerId required" });
    const mfgId = parseInt(manufacturerId as string);
    const [models, guides, constructionTypes, benchmarks, templates] = await Promise.all([
      db.select({
        id: mfhModelsTable.id, manufacturerId: mfhModelsTable.manufacturerId,
        name: mfhModelsTable.name, constructionTypeId: mfhModelsTable.constructionTypeId,
        constructionTypeName: mfhConstructionTypesTable.name,
        benchmarkId: mfhModelsTable.benchmarkId, benchmarkName: jobTypeBenchmarksTable.jobType,
        benchmarkHours: jobTypeBenchmarksTable.estimatedHours,
        checklistTemplateId: mfhModelsTable.checklistTemplateId, checklistTemplateName: checklistTemplatesTable.name,
        defaultAddonKeys: mfhModelsTable.defaultAddonKeys, notes: mfhModelsTable.notes,
        active: mfhModelsTable.active, introducedYear: mfhModelsTable.introducedYear, discontinuedYear: mfhModelsTable.discontinuedYear,
      }).from(mfhModelsTable)
        .leftJoin(mfhConstructionTypesTable, eq(mfhModelsTable.constructionTypeId, mfhConstructionTypesTable.id))
        .leftJoin(jobTypeBenchmarksTable, eq(mfhModelsTable.benchmarkId, jobTypeBenchmarksTable.id))
        .leftJoin(checklistTemplatesTable, eq(mfhModelsTable.checklistTemplateId, checklistTemplatesTable.id))
        .where(and(eq(mfhModelsTable.manufacturerId, mfgId), eq(mfhModelsTable.active, true)))
        .orderBy(asc(mfhModelsTable.name)),
      db.select().from(mfhPricingGuidesTable).where(eq(mfhPricingGuidesTable.manufacturerId, mfgId)).orderBy(asc(mfhPricingGuidesTable.createdAt)),
      db.select().from(mfhConstructionTypesTable).orderBy(asc(mfhConstructionTypesTable.name)),
      db.select().from(jobTypeBenchmarksTable).orderBy(asc(jobTypeBenchmarksTable.jobType)),
      db.select({ id: checklistTemplatesTable.id, name: checklistTemplatesTable.name }).from(checklistTemplatesTable).where(eq(checklistTemplatesTable.active, true)).orderBy(asc(checklistTemplatesTable.name)),
    ]);
    let guideItems: { id: number; guideId: number; modelId: number; basePrice: string }[] = [];
    let guideAddons: { id: number; guideId: number; addonKey: string; label: string; price: string; isPerDay: boolean }[] = [];
    if (guides.length > 0) {
      const guideIds = guides.map(g => g.id);
      [guideItems, guideAddons] = await Promise.all([
        db.select().from(mfhGuideItemsTable).where(inArray(mfhGuideItemsTable.guideId, guideIds)) as Promise<typeof guideItems>,
        db.select().from(mfhGuideAddonsTable).where(inArray(mfhGuideAddonsTable.guideId, guideIds)).orderBy(asc(mfhGuideAddonsTable.createdAt)) as Promise<typeof guideAddons>,
      ]);
    }
    res.json({ models, guides, guideItems, guideAddons, constructionTypes, benchmarks, templates });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// Library data
mfhLibraryRouter.get("/library-data", async (_req, res) => {
  try {
    await ensureSeeded();
    const [manufacturers, constructionTypes, benchmarks, templates] = await Promise.all([
      db.select().from(mfhManufacturersTable).orderBy(asc(mfhManufacturersTable.name)),
      db.select().from(mfhConstructionTypesTable).orderBy(asc(mfhConstructionTypesTable.name)),
      db.select({ id: jobTypeBenchmarksTable.id, jobType: jobTypeBenchmarksTable.jobType, estimatedHours: jobTypeBenchmarksTable.estimatedHours }).from(jobTypeBenchmarksTable).orderBy(asc(jobTypeBenchmarksTable.jobType)),
      db.select({ id: checklistTemplatesTable.id, name: checklistTemplatesTable.name }).from(checklistTemplatesTable).where(eq(checklistTemplatesTable.active, true)).orderBy(asc(checklistTemplatesTable.name)),
    ]);
    res.json({ manufacturers, constructionTypes, benchmarks, templates });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// ── Job router (sectionGuard("jobs")) ─────────────────────────────────────────
export const mfhJobRouter = Router();

// GET /api/mfh/jobs/:id — get MFH snapshot for a job
mfhJobRouter.get("/jobs/:id", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const [job] = await db.select({
      mfhManufacturerId: jobsTable.mfhManufacturerId,
      mfhModelId: jobsTable.mfhModelId,
      mfhModelYear: jobsTable.mfhModelYear,
      mfhDealerPrice: jobsTable.mfhDealerPrice,
      mfhQuotedPrice: jobsTable.mfhQuotedPrice,
      mfhGuideName: jobsTable.mfhGuideName,
    } as Record<string, unknown>).from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
    res.json(job ?? {});
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// POST /api/mfh/jobs/:id/apply — apply MFH (benchmark + checklist + estimate + job update)
mfhJobRouter.post("/jobs/:id/apply", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id" });
    const { manufacturerId, modelId, modelYear, guideId, selectedAddonKeys, travelDays } = req.body;
    if (!manufacturerId || !modelId || !guideId) return res.status(400).json({ error: "manufacturerId, modelId, guideId required" });

    // Fetch model + guide data (outside tx — read only)
    const [modelRow] = await db.select({
      id: mfhModelsTable.id, name: mfhModelsTable.name,
      constructionTypeId: mfhModelsTable.constructionTypeId, constructionTypeName: mfhConstructionTypesTable.name,
      benchmarkId: mfhModelsTable.benchmarkId, checklistTemplateId: mfhModelsTable.checklistTemplateId,
    }).from(mfhModelsTable)
      .leftJoin(mfhConstructionTypesTable, eq(mfhModelsTable.constructionTypeId, mfhConstructionTypesTable.id))
      .where(eq(mfhModelsTable.id, parseInt(modelId)));

    const [guideRow] = await db.select().from(mfhPricingGuidesTable).where(eq(mfhPricingGuidesTable.id, parseInt(guideId)));
    if (!modelRow || !guideRow) return res.status(404).json({ error: "Model or guide not found" });

    const [guideItem] = await db.select().from(mfhGuideItemsTable)
      .where(and(eq(mfhGuideItemsTable.guideId, parseInt(guideId)), eq(mfhGuideItemsTable.modelId, parseInt(modelId))));
    const basePrice = parseFloat(guideItem?.basePrice ?? "0");

    // Get dealer price snapshot
    const dealerGuides = await db.select().from(mfhPricingGuidesTable)
      .where(and(eq(mfhPricingGuidesTable.manufacturerId, parseInt(manufacturerId)), eq(mfhPricingGuidesTable.isDealerGuide, true))).limit(1);
    let dealerPrice = basePrice;
    if (dealerGuides.length > 0 && dealerGuides[0].id !== parseInt(guideId)) {
      const [di] = await db.select().from(mfhGuideItemsTable)
        .where(and(eq(mfhGuideItemsTable.guideId, dealerGuides[0].id), eq(mfhGuideItemsTable.modelId, parseInt(modelId))));
      if (di) dealerPrice = parseFloat(di.basePrice);
    }

    const addons = await db.select().from(mfhGuideAddonsTable).where(eq(mfhGuideAddonsTable.guideId, parseInt(guideId)));
    const selectedKeys: string[] = Array.isArray(selectedAddonKeys) ? selectedAddonKeys : [];
    const days = parseInt(travelDays ?? "1") || 1;
    const ctName = modelRow.constructionTypeName ?? "Trim-Out";
    const mfhLines = await buildMfhLines(parseInt(guideId), parseInt(modelId), selectedKeys, days, modelRow.name, ctName, addons, basePrice);
    const mfhTotal = mfhLines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

    // Get benchmark for job type if linked
    let benchmarkJobType: string | null = null;
    if (modelRow.benchmarkId) {
      const [bm] = await db.select().from(jobTypeBenchmarksTable).where(eq(jobTypeBenchmarksTable.id, modelRow.benchmarkId));
      if (bm) benchmarkJobType = bm.jobType;
    }

    const result = await db.transaction(async (tx) => {
      // Update job
      await tx.update(jobsTable).set({
        mfhManufacturerId: parseInt(manufacturerId),
        mfhModelId: parseInt(modelId),
        mfhModelYear: modelYear ? parseInt(modelYear) : null,
        mfhDealerPrice: String(dealerPrice),
        mfhQuotedPrice: String(basePrice),
        mfhGuideName: guideRow.name,
        jobType: "Manufactured Home",
      } as Record<string, unknown>).where(eq(jobsTable.id, jobId));

      // Find or create estimate
      const existingEstimates = await tx.select().from(estimatesTable).where(eq(estimatesTable.jobId, jobId)).limit(1);
      let estimateId: number;

      if (existingEstimates.length > 0) {
        const existing = existingEstimates[0];
        const existingLines: unknown[] = Array.isArray(existing.lineItems) ? (existing.lineItems as unknown[]) : [];
        const nonMfhLines = existingLines.filter((l: unknown) => (l as Record<string, unknown>).generatedBy !== "MFH");
        const merged = [...mfhLines, ...nonMfhLines];
        const newTotal = merged.reduce((s, l) => s + (parseFloat(String((l as Record<string, unknown>).quantity ?? 1)) * parseFloat(String((l as Record<string, unknown>).unitCost ?? 0))), 0);
        await tx.update(estimatesTable).set({
          lineItems: merged,
          subtotal: String(newTotal),
          total: String(newTotal),
          mfhDealerPrice: String(dealerPrice),
          mfhQuotedPrice: String(basePrice),
          mfhGuideName: guideRow.name,
          jobType: "Manufactured Home",
        } as Record<string, unknown>).where(eq(estimatesTable.id, existing.id));
        estimateId = existing.id;
      } else {
        const jobRows = await tx.select({ title: jobsTable.title, clientId: jobsTable.clientId, businessLine: jobsTable.businessLine }).from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
        const jobData = jobRows[0];
        const [newEst] = await tx.insert(estimatesTable).values({
          title: `${modelRow.name} (${ctName}) Trim-Out`,
          jobId, clientId: jobData?.clientId ?? null,
          businessLine: jobData?.businessLine ?? "general_contracting",
          jobType: "Manufactured Home",
          lineItems: mfhLines,
          subtotal: String(mfhTotal),
          total: String(mfhTotal),
          status: "draft",
          mfhDealerPrice: String(dealerPrice),
          mfhQuotedPrice: String(basePrice),
          mfhGuideName: guideRow.name,
        } as Record<string, unknown>).returning();
        estimateId = newEst.id;
      }

      // Apply checklist if model has a template linked
      if (modelRow.checklistTemplateId) {
        const templateId = modelRow.checklistTemplateId;
        const existingChecklist = await tx.select().from(jobChecklistsTable)
          .where(and(eq(jobChecklistsTable.jobId, jobId), eq(jobChecklistsTable.templateId, templateId))).limit(1);

        if (existingChecklist.length === 0) {
          const [tmpl] = await tx.select().from(checklistTemplatesTable).where(eq(checklistTemplatesTable.id, templateId));
          const sections = await tx.select().from(checklistTemplateSectionsTable)
            .where(eq(checklistTemplateSectionsTable.templateId, templateId)).orderBy(asc(checklistTemplateSectionsTable.sortOrder));
          const items = await tx.select().from(checklistTemplateItemsTable).orderBy(asc(checklistTemplateItemsTable.sortOrder));
          const shareToken = crypto.randomBytes(16).toString("hex");
          const [jc] = await tx.insert(jobChecklistsTable).values({
            jobId, templateId, templateName: tmpl?.name ?? "Manufactured Home Checklist", shareToken,
          }).returning();
          for (const section of sections) {
            const [jcs] = await tx.insert(jobChecklistSectionsTable).values({
              jobChecklistId: jc.id, templateSectionId: section.id, name: section.name, sortOrder: section.sortOrder,
            }).returning();
            const sectionItems = items.filter(i => i.sectionId === section.id);
            if (sectionItems.length > 0) {
              await tx.insert(jobChecklistItemsTable).values(
                sectionItems.map(item => ({ jobChecklistId: jc.id, jobChecklistSectionId: jcs.id, title: item.title, sortOrder: item.sortOrder }))
              );
            }
          }
        }
      }

      return { estimateId, mfhTotal };
    });

    res.json({ ok: true, estimateId: result.estimateId, mfhTotal: result.mfhTotal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to apply MFH pricing" });
  }
});

// PATCH /api/mfh/jobs/:id/update-pricing — refresh only MFH-tagged lines (no confirmation needed)
mfhJobRouter.patch("/jobs/:id/update-pricing", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const { guideId, modelId, selectedAddonKeys, travelDays } = req.body;
    if (!guideId || !modelId) return res.status(400).json({ error: "guideId and modelId required" });

    const [modelRow] = await db.select({ name: mfhModelsTable.name, constructionTypeName: mfhConstructionTypesTable.name })
      .from(mfhModelsTable).leftJoin(mfhConstructionTypesTable, eq(mfhModelsTable.constructionTypeId, mfhConstructionTypesTable.id))
      .where(eq(mfhModelsTable.id, parseInt(modelId)));
    const [guideRow] = await db.select().from(mfhPricingGuidesTable).where(eq(mfhPricingGuidesTable.id, parseInt(guideId)));
    const [guideItem] = await db.select().from(mfhGuideItemsTable)
      .where(and(eq(mfhGuideItemsTable.guideId, parseInt(guideId)), eq(mfhGuideItemsTable.modelId, parseInt(modelId))));
    const addons = await db.select().from(mfhGuideAddonsTable).where(eq(mfhGuideAddonsTable.guideId, parseInt(guideId)));

    const basePrice = parseFloat(guideItem?.basePrice ?? "0");
    const ctName = modelRow?.constructionTypeName ?? "Trim-Out";
    const selectedKeys: string[] = Array.isArray(selectedAddonKeys) ? selectedAddonKeys : [];
    const days = parseInt(travelDays ?? "1") || 1;
    const newMfhLines = await buildMfhLines(parseInt(guideId), parseInt(modelId), selectedKeys, days, modelRow?.name ?? "", ctName, addons, basePrice);

    await db.transaction(async (tx) => {
      const [estimate] = await tx.select().from(estimatesTable).where(eq(estimatesTable.jobId, jobId)).limit(1);
      if (estimate) {
        const existing: unknown[] = Array.isArray(estimate.lineItems) ? (estimate.lineItems as unknown[]) : [];
        const nonMfhLines = existing.filter((l: unknown) => (l as Record<string, unknown>).generatedBy !== "MFH");
        const merged = [...newMfhLines, ...nonMfhLines];
        const newTotal = merged.reduce((s, l) => s + (parseFloat(String((l as Record<string, unknown>).quantity ?? 1)) * parseFloat(String((l as Record<string, unknown>).unitCost ?? 0))), 0);
        await tx.update(estimatesTable).set({
          lineItems: merged, subtotal: String(newTotal), total: String(newTotal),
          mfhQuotedPrice: String(basePrice), mfhGuideName: guideRow?.name ?? null,
        } as Record<string, unknown>).where(eq(estimatesTable.id, estimate.id));
      }
      await tx.update(jobsTable).set({
        mfhQuotedPrice: String(basePrice), mfhGuideName: guideRow?.name ?? null,
      } as Record<string, unknown>).where(eq(jobsTable.id, jobId));
    });

    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to update pricing" }); }
});

// PATCH /api/mfh/jobs/:id/reset — same as update-pricing; used by "Reset to Guide" (confirmation shown by frontend)
mfhJobRouter.patch("/jobs/:id/reset", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const { guideId, modelId, selectedAddonKeys, travelDays } = req.body;
    if (!guideId || !modelId) return res.status(400).json({ error: "guideId and modelId required" });

    const [modelRow] = await db.select({ name: mfhModelsTable.name, constructionTypeName: mfhConstructionTypesTable.name })
      .from(mfhModelsTable).leftJoin(mfhConstructionTypesTable, eq(mfhModelsTable.constructionTypeId, mfhConstructionTypesTable.id))
      .where(eq(mfhModelsTable.id, parseInt(modelId)));
    const [guideRow] = await db.select().from(mfhPricingGuidesTable).where(eq(mfhPricingGuidesTable.id, parseInt(guideId)));
    const [guideItem] = await db.select().from(mfhGuideItemsTable)
      .where(and(eq(mfhGuideItemsTable.guideId, parseInt(guideId)), eq(mfhGuideItemsTable.modelId, parseInt(modelId))));
    const addons = await db.select().from(mfhGuideAddonsTable).where(eq(mfhGuideAddonsTable.guideId, parseInt(guideId)));

    const basePrice = parseFloat(guideItem?.basePrice ?? "0");
    const ctName = modelRow?.constructionTypeName ?? "Trim-Out";
    const selectedKeys: string[] = Array.isArray(selectedAddonKeys) ? selectedAddonKeys : [];
    const days = parseInt(travelDays ?? "1") || 1;
    const newMfhLines = await buildMfhLines(parseInt(guideId), parseInt(modelId), selectedKeys, days, modelRow?.name ?? "", ctName, addons, basePrice);

    await db.transaction(async (tx) => {
      const [estimate] = await tx.select().from(estimatesTable).where(eq(estimatesTable.jobId, jobId)).limit(1);
      if (estimate) {
        const existing: unknown[] = Array.isArray(estimate.lineItems) ? (estimate.lineItems as unknown[]) : [];
        const nonMfhLines = existing.filter((l: unknown) => (l as Record<string, unknown>).generatedBy !== "MFH");
        const merged = [...newMfhLines, ...nonMfhLines];
        const newTotal = merged.reduce((s, l) => s + (parseFloat(String((l as Record<string, unknown>).quantity ?? 1)) * parseFloat(String((l as Record<string, unknown>).unitCost ?? 0))), 0);
        await tx.update(estimatesTable).set({
          lineItems: merged, subtotal: String(newTotal), total: String(newTotal),
          mfhQuotedPrice: String(basePrice), mfhGuideName: guideRow?.name ?? null,
        } as Record<string, unknown>).where(eq(estimatesTable.id, estimate.id));
      }
      await tx.update(jobsTable).set({
        mfhQuotedPrice: String(basePrice), mfhGuideName: guideRow?.name ?? null,
      } as Record<string, unknown>).where(eq(jobsTable.id, jobId));
    });

    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to reset" }); }
});

// Default export (backward compat — not used for new registrations)
export default mfhLibraryRouter;
