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

const router = Router();

// ── Seed Clayton data on first use ────────────────────────────────────────────
let seeded = false;
async function ensureSeeded() {
  if (seeded) return;
  const existing = await db.select({ id: mfhManufacturersTable.id }).from(mfhManufacturersTable).limit(1);
  if (existing.length > 0) { seeded = true; return; }

  // Construction types
  await db.insert(mfhConstructionTypesTable).values([
    { name: "VOG" },
    { name: "Hybrid" },
    { name: "Drywall" },
  ]).onConflictDoNothing();

  const [vog, hybrid, drywall] = await db
    .select()
    .from(mfhConstructionTypesTable)
    .orderBy(asc(mfhConstructionTypesTable.id));

  // Clayton manufacturer
  const [clayton] = await db
    .insert(mfhManufacturersTable)
    .values({ name: "Clayton" })
    .returning();

  // Models
  const vogModelNames = ["Appalachia", "Giles", "Southern", "Wakarusa", "Champion", "Tru"];
  const hybridModelNames = ["Addison"];
  const drywallModelNames = ["Norris", "Rutledge", "Middlebury"];

  const allModelInserts = [
    ...vogModelNames.map(name => ({ manufacturerId: clayton.id, name, constructionTypeId: vog.id })),
    ...hybridModelNames.map(name => ({ manufacturerId: clayton.id, name, constructionTypeId: hybrid.id })),
    ...drywallModelNames.map(name => ({ manufacturerId: clayton.id, name, constructionTypeId: drywall.id })),
  ];

  const insertedModels = await db.insert(mfhModelsTable).values(allModelInserts).returning();

  // Pricing guides
  const [dealerGuide, myPricing] = await db
    .insert(mfhPricingGuidesTable)
    .values([
      { manufacturerId: clayton.id, name: "Dealer Guide", isDealerGuide: true },
      { manufacturerId: clayton.id, name: "My Pricing", isDealerGuide: false },
    ])
    .returning();

  // Guide items
  const guideItemsDealer = insertedModels.map(m => {
    const ctId = m.constructionTypeId;
    let price = "1500";
    if (ctId === hybrid.id) price = "2500";
    if (ctId === drywall.id) price = "3500";
    return { guideId: dealerGuide.id, modelId: m.id, basePrice: price };
  });
  const guideItemsMy = guideItemsDealer.map(item => ({
    ...item, guideId: myPricing.id,
  }));
  await db.insert(mfhGuideItemsTable).values([...guideItemsDealer, ...guideItemsMy]);

  // Add-ons for both guides
  for (const guideId of [dealerGuide.id, myPricing.id]) {
    await db.insert(mfhGuideAddonsTable).values([
      { guideId, addonKey: "vinyl_ends", label: "Vinyl Ends", price: "1000", isPerDay: false },
      { guideId, addonKey: "plumbing", label: "Plumbing Under Home", price: "1000", isPerDay: false },
      { guideId, addonKey: "travel", label: "Over 60 Miles Travel", price: "150", isPerDay: true },
    ]);
  }

  seeded = true;
}

// ── GET /api/mfh/manufacturers ────────────────────────────────────────────────
router.get("/manufacturers", async (_req, res) => {
  try {
    await ensureSeeded();
    const rows = await db.select().from(mfhManufacturersTable).orderBy(asc(mfhManufacturersTable.name));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch manufacturers" });
  }
});

router.post("/manufacturers", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    const [row] = await db.insert(mfhManufacturersTable).values({ name: name.trim() }).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create manufacturer" });
  }
});

router.patch("/manufacturers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    const [row] = await db.update(mfhManufacturersTable).set({ name: name.trim() }).where(eq(mfhManufacturersTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update manufacturer" });
  }
});

router.delete("/manufacturers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(mfhManufacturersTable).where(eq(mfhManufacturersTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete manufacturer" });
  }
});

// ── GET /api/mfh/construction-types ──────────────────────────────────────────
router.get("/construction-types", async (_req, res) => {
  try {
    await ensureSeeded();
    const rows = await db.select().from(mfhConstructionTypesTable).orderBy(asc(mfhConstructionTypesTable.name));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch construction types" });
  }
});

router.post("/construction-types", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    const [row] = await db.insert(mfhConstructionTypesTable).values({ name: name.trim() }).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create construction type" });
  }
});

// ── Models ────────────────────────────────────────────────────────────────────
router.get("/models", async (req, res) => {
  try {
    await ensureSeeded();
    const { manufacturerId, includeInactive } = req.query;
    const conditions = [];
    if (manufacturerId) conditions.push(eq(mfhModelsTable.manufacturerId, parseInt(manufacturerId as string)));
    if (!includeInactive) conditions.push(eq(mfhModelsTable.active, true));

    const models = await db
      .select({
        id: mfhModelsTable.id,
        manufacturerId: mfhModelsTable.manufacturerId,
        name: mfhModelsTable.name,
        constructionTypeId: mfhModelsTable.constructionTypeId,
        constructionTypeName: mfhConstructionTypesTable.name,
        benchmarkId: mfhModelsTable.benchmarkId,
        benchmarkName: jobTypeBenchmarksTable.jobType,
        checklistTemplateId: mfhModelsTable.checklistTemplateId,
        checklistTemplateName: checklistTemplatesTable.name,
        defaultAddonKeys: mfhModelsTable.defaultAddonKeys,
        notes: mfhModelsTable.notes,
        active: mfhModelsTable.active,
        introducedYear: mfhModelsTable.introducedYear,
        discontinuedYear: mfhModelsTable.discontinuedYear,
        createdAt: mfhModelsTable.createdAt,
      })
      .from(mfhModelsTable)
      .leftJoin(mfhConstructionTypesTable, eq(mfhModelsTable.constructionTypeId, mfhConstructionTypesTable.id))
      .leftJoin(jobTypeBenchmarksTable, eq(mfhModelsTable.benchmarkId, jobTypeBenchmarksTable.id))
      .leftJoin(checklistTemplatesTable, eq(mfhModelsTable.checklistTemplateId, checklistTemplatesTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(mfhModelsTable.name));

    res.json(models);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch models" });
  }
});

router.post("/models", async (req, res) => {
  try {
    const { manufacturerId, name, constructionTypeId, benchmarkId, checklistTemplateId, defaultAddonKeys, notes, active, introducedYear, discontinuedYear } = req.body;
    if (!manufacturerId || !name?.trim() || !constructionTypeId) return res.status(400).json({ error: "manufacturerId, name, constructionTypeId required" });
    const [row] = await db.insert(mfhModelsTable).values({
      manufacturerId: parseInt(manufacturerId),
      name: name.trim(),
      constructionTypeId: parseInt(constructionTypeId),
      benchmarkId: benchmarkId ? parseInt(benchmarkId) : null,
      checklistTemplateId: checklistTemplateId ? parseInt(checklistTemplateId) : null,
      defaultAddonKeys: defaultAddonKeys ?? [],
      notes: notes || null,
      active: active !== false,
      introducedYear: introducedYear ? parseInt(introducedYear) : null,
      discontinuedYear: discontinuedYear ? parseInt(discontinuedYear) : null,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create model" });
  }
});

router.patch("/models/:id", async (req, res) => {
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update model" });
  }
});

router.delete("/models/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(mfhModelsTable).where(eq(mfhModelsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete model" });
  }
});

// ── Pricing guides ─────────────────────────────────────────────────────────────
router.get("/guides", async (req, res) => {
  try {
    await ensureSeeded();
    const { manufacturerId } = req.query;
    const conditions = manufacturerId ? [eq(mfhPricingGuidesTable.manufacturerId, parseInt(manufacturerId as string))] : [];
    const rows = await db.select().from(mfhPricingGuidesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(mfhPricingGuidesTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch guides" });
  }
});

router.post("/guides", async (req, res) => {
  try {
    const { manufacturerId, name, isDealerGuide } = req.body;
    if (!manufacturerId || !name?.trim()) return res.status(400).json({ error: "manufacturerId and name required" });
    const [row] = await db.insert(mfhPricingGuidesTable).values({
      manufacturerId: parseInt(manufacturerId),
      name: name.trim(),
      isDealerGuide: isDealerGuide === true,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create guide" });
  }
});

router.patch("/guides/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, isDealerGuide } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (isDealerGuide !== undefined) updates.isDealerGuide = isDealerGuide;
    const [row] = await db.update(mfhPricingGuidesTable).set(updates).where(eq(mfhPricingGuidesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update guide" });
  }
});

router.delete("/guides/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(mfhPricingGuidesTable).where(eq(mfhPricingGuidesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete guide" });
  }
});

// ── Guide items ────────────────────────────────────────────────────────────────
router.get("/guide-items", async (req, res) => {
  try {
    const { guideId, modelId } = req.query;
    const conditions = [];
    if (guideId) conditions.push(eq(mfhGuideItemsTable.guideId, parseInt(guideId as string)));
    if (modelId) conditions.push(eq(mfhGuideItemsTable.modelId, parseInt(modelId as string)));
    const rows = await db.select().from(mfhGuideItemsTable)
      .where(conditions.length ? and(...conditions) : undefined);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch guide items" });
  }
});

router.post("/guide-items", async (req, res) => {
  try {
    const { guideId, modelId, basePrice } = req.body;
    if (!guideId || !modelId) return res.status(400).json({ error: "guideId and modelId required" });
    const [row] = await db.insert(mfhGuideItemsTable).values({
      guideId: parseInt(guideId),
      modelId: parseInt(modelId),
      basePrice: String(basePrice ?? 0),
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create guide item" });
  }
});

router.patch("/guide-items/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { basePrice } = req.body;
    const [row] = await db.update(mfhGuideItemsTable).set({ basePrice: String(basePrice) }).where(eq(mfhGuideItemsTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update guide item" });
  }
});

// Upsert guide item by guideId + modelId
router.put("/guide-items/upsert", async (req, res) => {
  try {
    const { guideId, modelId, basePrice } = req.body;
    if (!guideId || !modelId) return res.status(400).json({ error: "guideId and modelId required" });
    const existing = await db.select().from(mfhGuideItemsTable)
      .where(and(eq(mfhGuideItemsTable.guideId, parseInt(guideId)), eq(mfhGuideItemsTable.modelId, parseInt(modelId))))
      .limit(1);
    if (existing.length > 0) {
      const [row] = await db.update(mfhGuideItemsTable).set({ basePrice: String(basePrice ?? 0) })
        .where(eq(mfhGuideItemsTable.id, existing[0].id)).returning();
      return res.json(row);
    }
    const [row] = await db.insert(mfhGuideItemsTable).values({
      guideId: parseInt(guideId),
      modelId: parseInt(modelId),
      basePrice: String(basePrice ?? 0),
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upsert guide item" });
  }
});

// ── Guide add-ons ─────────────────────────────────────────────────────────────
router.get("/guide-addons", async (req, res) => {
  try {
    const { guideId } = req.query;
    const conditions = guideId ? [eq(mfhGuideAddonsTable.guideId, parseInt(guideId as string))] : [];
    const rows = await db.select().from(mfhGuideAddonsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(mfhGuideAddonsTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch guide addons" });
  }
});

router.post("/guide-addons", async (req, res) => {
  try {
    const { guideId, addonKey, label, price, isPerDay } = req.body;
    if (!guideId || !addonKey?.trim() || !label?.trim()) return res.status(400).json({ error: "guideId, addonKey, label required" });
    const [row] = await db.insert(mfhGuideAddonsTable).values({
      guideId: parseInt(guideId),
      addonKey: addonKey.trim(),
      label: label.trim(),
      price: String(price ?? 0),
      isPerDay: isPerDay === true,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create guide addon" });
  }
});

router.patch("/guide-addons/:id", async (req, res) => {
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update guide addon" });
  }
});

router.delete("/guide-addons/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(mfhGuideAddonsTable).where(eq(mfhGuideAddonsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete guide addon" });
  }
});

// ── Panel data: all data for one manufacturer in one call ──────────────────────
router.get("/panel-data", async (req, res) => {
  try {
    await ensureSeeded();
    const { manufacturerId } = req.query;
    if (!manufacturerId) return res.status(400).json({ error: "manufacturerId required" });
    const mfgId = parseInt(manufacturerId as string);

    const [models, guides, constructionTypes, benchmarks, templates] = await Promise.all([
      db.select({
        id: mfhModelsTable.id,
        manufacturerId: mfhModelsTable.manufacturerId,
        name: mfhModelsTable.name,
        constructionTypeId: mfhModelsTable.constructionTypeId,
        constructionTypeName: mfhConstructionTypesTable.name,
        benchmarkId: mfhModelsTable.benchmarkId,
        benchmarkName: jobTypeBenchmarksTable.jobType,
        benchmarkHours: jobTypeBenchmarksTable.estimatedHours,
        checklistTemplateId: mfhModelsTable.checklistTemplateId,
        checklistTemplateName: checklistTemplatesTable.name,
        defaultAddonKeys: mfhModelsTable.defaultAddonKeys,
        notes: mfhModelsTable.notes,
        active: mfhModelsTable.active,
        introducedYear: mfhModelsTable.introducedYear,
        discontinuedYear: mfhModelsTable.discontinuedYear,
      })
        .from(mfhModelsTable)
        .leftJoin(mfhConstructionTypesTable, eq(mfhModelsTable.constructionTypeId, mfhConstructionTypesTable.id))
        .leftJoin(jobTypeBenchmarksTable, eq(mfhModelsTable.benchmarkId, jobTypeBenchmarksTable.id))
        .leftJoin(checklistTemplatesTable, eq(mfhModelsTable.checklistTemplateId, checklistTemplatesTable.id))
        .where(and(eq(mfhModelsTable.manufacturerId, mfgId), eq(mfhModelsTable.active, true)))
        .orderBy(asc(mfhModelsTable.name)),

      db.select().from(mfhPricingGuidesTable)
        .where(eq(mfhPricingGuidesTable.manufacturerId, mfgId))
        .orderBy(asc(mfhPricingGuidesTable.createdAt)),

      db.select().from(mfhConstructionTypesTable).orderBy(asc(mfhConstructionTypesTable.name)),
      db.select().from(jobTypeBenchmarksTable).orderBy(asc(jobTypeBenchmarksTable.jobType)),
      db.select({ id: checklistTemplatesTable.id, name: checklistTemplatesTable.name })
        .from(checklistTemplatesTable)
        .where(eq(checklistTemplatesTable.active, true))
        .orderBy(asc(checklistTemplatesTable.name)),
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch panel data" });
  }
});

// ── Library data: all manufacturers + their data for the Home Library modal ───
router.get("/library-data", async (_req, res) => {
  try {
    await ensureSeeded();
    const [manufacturers, constructionTypes, benchmarks, templates] = await Promise.all([
      db.select().from(mfhManufacturersTable).orderBy(asc(mfhManufacturersTable.name)),
      db.select().from(mfhConstructionTypesTable).orderBy(asc(mfhConstructionTypesTable.name)),
      db.select({ id: jobTypeBenchmarksTable.id, jobType: jobTypeBenchmarksTable.jobType, estimatedHours: jobTypeBenchmarksTable.estimatedHours })
        .from(jobTypeBenchmarksTable).orderBy(asc(jobTypeBenchmarksTable.jobType)),
      db.select({ id: checklistTemplatesTable.id, name: checklistTemplatesTable.name })
        .from(checklistTemplatesTable)
        .where(eq(checklistTemplatesTable.active, true))
        .orderBy(asc(checklistTemplatesTable.name)),
    ]);
    res.json({ manufacturers, constructionTypes, benchmarks, templates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch library data" });
  }
});

// ── POST /api/mfh/jobs/:id/apply — Apply MFH data to a job ───────────────────
router.post("/jobs/:id/apply", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id" });

    const {
      manufacturerId,
      modelId,
      modelYear,
      guideId,
      selectedAddonKeys,
      travelDays,
      // allow overriding what line items should be
    } = req.body;

    if (!manufacturerId || !modelId || !guideId) {
      return res.status(400).json({ error: "manufacturerId, modelId, guideId required" });
    }

    // Fetch model + guide data
    const [modelRow] = await db.select({
      id: mfhModelsTable.id,
      name: mfhModelsTable.name,
      constructionTypeId: mfhModelsTable.constructionTypeId,
      constructionTypeName: mfhConstructionTypesTable.name,
      benchmarkId: mfhModelsTable.benchmarkId,
      checklistTemplateId: mfhModelsTable.checklistTemplateId,
    })
      .from(mfhModelsTable)
      .leftJoin(mfhConstructionTypesTable, eq(mfhModelsTable.constructionTypeId, mfhConstructionTypesTable.id))
      .where(eq(mfhModelsTable.id, parseInt(modelId)));

    const [guideRow] = await db.select().from(mfhPricingGuidesTable).where(eq(mfhPricingGuidesTable.id, parseInt(guideId)));

    if (!modelRow || !guideRow) return res.status(404).json({ error: "Model or guide not found" });

    // Get base price
    const [guideItem] = await db.select()
      .from(mfhGuideItemsTable)
      .where(and(eq(mfhGuideItemsTable.guideId, parseInt(guideId)), eq(mfhGuideItemsTable.modelId, parseInt(modelId))));

    const basePrice = parseFloat(guideItem?.basePrice ?? "0");

    // Get dealer guide item for snapshot
    const dealerGuide = await db.select().from(mfhPricingGuidesTable)
      .where(and(eq(mfhPricingGuidesTable.manufacturerId, parseInt(manufacturerId)), eq(mfhPricingGuidesTable.isDealerGuide, true)))
      .limit(1);

    let dealerPrice = basePrice;
    if (dealerGuide.length > 0 && dealerGuide[0].id !== parseInt(guideId)) {
      const [di] = await db.select().from(mfhGuideItemsTable)
        .where(and(eq(mfhGuideItemsTable.guideId, dealerGuide[0].id), eq(mfhGuideItemsTable.modelId, parseInt(modelId))));
      if (di) dealerPrice = parseFloat(di.basePrice);
    }

    // Get addons
    const addons = await db.select().from(mfhGuideAddonsTable)
      .where(eq(mfhGuideAddonsTable.guideId, parseInt(guideId)));

    // Build MFH-tagged line items
    const ctName = modelRow.constructionTypeName ?? "Trim-Out";
    const trimDesc = `${modelRow.name} (${ctName}) Trim-Out`;

    const mfhLineItems: Array<{
      category: string;
      description: string;
      quantity: number;
      unit: string | null;
      unitCost: number;
      generatedBy: string;
    }> = [
      { category: "Labor", description: trimDesc, quantity: 1, unit: "LOT", unitCost: basePrice, generatedBy: "MFH" },
    ];

    const selectedKeys: string[] = Array.isArray(selectedAddonKeys) ? selectedAddonKeys : [];
    for (const addon of addons) {
      if (!selectedKeys.includes(addon.addonKey)) continue;
      if (addon.isPerDay) {
        const days = parseInt(travelDays ?? "1") || 1;
        mfhLineItems.push({
          category: "Other",
          description: `${addon.label} (${days} day${days !== 1 ? "s" : ""})`,
          quantity: days,
          unit: "DAY",
          unitCost: parseFloat(addon.price),
          generatedBy: "MFH",
        });
      } else {
        mfhLineItems.push({
          category: "Labor",
          description: addon.label,
          quantity: 1,
          unit: "LOT",
          unitCost: parseFloat(addon.price),
          generatedBy: "MFH",
        });
      }
    }

    const mfhTotal = mfhLineItems.reduce((s, l) => s + l.quantity * l.unitCost, 0);

    // Find or create estimate linked to this job
    const existingEstimates = await db.select().from(estimatesTable).where(eq(estimatesTable.jobId, jobId));
    let estimate = existingEstimates[0] ?? null;

    if (estimate) {
      // Merge: keep non-MFH lines, replace MFH lines
      const existingLines: unknown[] = Array.isArray(estimate.lineItems) ? (estimate.lineItems as unknown[]) : [];
      const nonMfhLines = existingLines.filter((l: unknown) => {
        const item = l as Record<string, unknown>;
        return item.generatedBy !== "MFH";
      });
      const mergedLines = [...mfhLineItems, ...nonMfhLines];
      const newTotal = mergedLines.reduce((s, l) => {
        const item = l as Record<string, unknown>;
        return s + (parseFloat(String(item.quantity ?? 1)) * parseFloat(String(item.unitCost ?? 0)));
      }, 0);

      await db.update(estimatesTable).set({
        lineItems: mergedLines,
        subtotal: String(newTotal),
        total: String(newTotal),
        mfhDealerPrice: String(dealerPrice),
        mfhQuotedPrice: String(basePrice),
        mfhGuideName: guideRow.name,
        jobType: "Manufactured Home",
      } as Record<string, unknown>).where(eq(estimatesTable.id, estimate.id));
    } else {
      // Create new estimate
      const job = await db.select({ title: jobsTable.title, clientId: jobsTable.clientId, businessLine: jobsTable.businessLine })
        .from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
      const jobData = job[0];
      const [newEst] = await db.insert(estimatesTable).values({
        title: `${modelRow.name} (${ctName}) Trim-Out`,
        jobId,
        clientId: jobData?.clientId ?? null,
        businessLine: jobData?.businessLine ?? "general_contracting",
        jobType: "Manufactured Home",
        lineItems: mfhLineItems,
        subtotal: String(mfhTotal),
        total: String(mfhTotal),
        status: "draft",
        mfhDealerPrice: String(dealerPrice),
        mfhQuotedPrice: String(basePrice),
        mfhGuideName: guideRow.name,
      } as Record<string, unknown>).returning();
      estimate = newEst;
    }

    // Update job MFH fields
    await db.update(jobsTable).set({
      mfhManufacturerId: parseInt(manufacturerId),
      mfhModelId: parseInt(modelId),
      mfhModelYear: modelYear ? parseInt(modelYear) : null,
      mfhDealerPrice: String(dealerPrice),
      mfhQuotedPrice: String(basePrice),
      mfhGuideName: guideRow.name,
      jobType: "Manufactured Home",
    } as Record<string, unknown>).where(eq(jobsTable.id, jobId));

    // Apply checklist if model has one linked
    if (modelRow.checklistTemplateId) {
      const templateId = modelRow.checklistTemplateId;

      // Get template sections + items
      const [tmplSections, tmplItems] = await Promise.all([
        db.select().from(checklistTemplateSectionsTable)
          .where(eq(checklistTemplateSectionsTable.templateId, templateId))
          .orderBy(asc(checklistTemplateSectionsTable.sortOrder)),
        db.select().from(checklistTemplateItemsTable).orderBy(asc(checklistTemplateItemsTable.sortOrder)),
      ]);

      // Check if this job already has a checklist from this template
      const existingChecklist = await db.select()
        .from(jobChecklistsTable)
        .where(and(eq(jobChecklistsTable.jobId, jobId), eq(jobChecklistsTable.templateId, templateId)))
        .limit(1);

      if (existingChecklist.length === 0) {
        const [tmplRow] = await db.select().from(checklistTemplatesTable).where(eq(checklistTemplatesTable.id, templateId));
        const shareToken = crypto.randomBytes(16).toString("hex");
        const [jc] = await db.insert(jobChecklistsTable).values({
          jobId,
          templateId,
          templateName: tmplRow?.name ?? "Manufactured Home Checklist",
          shareToken,
        }).returning();

        for (const section of tmplSections) {
          const [jcs] = await db.insert(jobChecklistSectionsTable).values({
            jobChecklistId: jc.id,
            templateSectionId: section.id,
            name: section.name,
            sortOrder: section.sortOrder,
          }).returning();
          const sectionItems = tmplItems.filter(i => i.sectionId === section.id);
          if (sectionItems.length > 0) {
            await db.insert(jobChecklistItemsTable).values(
              sectionItems.map(item => ({
                jobChecklistId: jc.id,
                jobChecklistSectionId: jcs.id,
                title: item.title,
                sortOrder: item.sortOrder,
              }))
            );
          }
        }
      }
    }

    res.json({ ok: true, estimateId: estimate?.id ?? null, mfhTotal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to apply MFH pricing" });
  }
});

// ── PATCH /api/mfh/jobs/:id/reset — Reset only MFH-tagged lines to current guide ──
router.patch("/jobs/:id/reset", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const { guideId, modelId, selectedAddonKeys, travelDays } = req.body;
    if (!guideId || !modelId) return res.status(400).json({ error: "guideId and modelId required" });

    const [modelRow] = await db.select({
      name: mfhModelsTable.name,
      constructionTypeName: mfhConstructionTypesTable.name,
    })
      .from(mfhModelsTable)
      .leftJoin(mfhConstructionTypesTable, eq(mfhModelsTable.constructionTypeId, mfhConstructionTypesTable.id))
      .where(eq(mfhModelsTable.id, parseInt(modelId)));

    const [guideRow] = await db.select().from(mfhPricingGuidesTable).where(eq(mfhPricingGuidesTable.id, parseInt(guideId)));
    const [guideItem] = await db.select().from(mfhGuideItemsTable)
      .where(and(eq(mfhGuideItemsTable.guideId, parseInt(guideId)), eq(mfhGuideItemsTable.modelId, parseInt(modelId))));
    const addons = await db.select().from(mfhGuideAddonsTable).where(eq(mfhGuideAddonsTable.guideId, parseInt(guideId)));

    const basePrice = parseFloat(guideItem?.basePrice ?? "0");
    const ctName = modelRow?.constructionTypeName ?? "Trim-Out";
    const selectedKeys: string[] = Array.isArray(selectedAddonKeys) ? selectedAddonKeys : [];

    const newMfhLines: Array<{ category: string; description: string; quantity: number; unit: string | null; unitCost: number; generatedBy: string }> = [
      { category: "Labor", description: `${modelRow?.name} (${ctName}) Trim-Out`, quantity: 1, unit: "LOT", unitCost: basePrice, generatedBy: "MFH" },
    ];
    for (const addon of addons) {
      if (!selectedKeys.includes(addon.addonKey)) continue;
      if (addon.isPerDay) {
        const days = parseInt(travelDays ?? "1") || 1;
        newMfhLines.push({ category: "Other", description: `${addon.label} (${days} day${days !== 1 ? "s" : ""})`, quantity: days, unit: "DAY", unitCost: parseFloat(addon.price), generatedBy: "MFH" });
      } else {
        newMfhLines.push({ category: "Labor", description: addon.label, quantity: 1, unit: "LOT", unitCost: parseFloat(addon.price), generatedBy: "MFH" });
      }
    }

    const [estimate] = await db.select().from(estimatesTable).where(eq(estimatesTable.jobId, jobId)).limit(1);
    if (estimate) {
      const existing: unknown[] = Array.isArray(estimate.lineItems) ? (estimate.lineItems as unknown[]) : [];
      const nonMfhLines = existing.filter((l: unknown) => (l as Record<string, unknown>).generatedBy !== "MFH");
      const merged = [...newMfhLines, ...nonMfhLines];
      const newTotal = merged.reduce((s, l) => s + (parseFloat(String((l as Record<string, unknown>).quantity ?? 1)) * parseFloat(String((l as Record<string, unknown>).unitCost ?? 0))), 0);
      await db.update(estimatesTable).set({
        lineItems: merged,
        subtotal: String(newTotal),
        total: String(newTotal),
        mfhQuotedPrice: String(basePrice),
        mfhGuideName: guideRow?.name ?? null,
      } as Record<string, unknown>).where(eq(estimatesTable.id, estimate.id));
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reset MFH pricing" });
  }
});

// ── GET /api/mfh/jobs/:id — Get MFH data for a job ────────────────────────────
router.get("/jobs/:id", async (req, res) => {
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch job MFH data" });
  }
});

export default router;
