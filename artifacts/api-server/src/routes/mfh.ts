import { Router } from "express";
import { db } from "@workspace/db";
import {
  mfhConstructionTypesTable,
  mfhHomeSeriesTable,
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
// Runs once on an empty database. Creates the Home Series (the priced entities)
// directly — there is no dealer/manufacturer entity; the dealer lives on the
// job's Client field. Pricing guides are global.
let seeded = false;
async function ensureSeeded() {
  if (seeded) return;
  const existing = await db.select({ id: mfhHomeSeriesTable.id }).from(mfhHomeSeriesTable).limit(1);
  if (existing.length > 0) { seeded = true; return; }

  await db.insert(mfhConstructionTypesTable).values([
    { name: "VOG" }, { name: "Hybrid" }, { name: "Drywall" },
  ]).onConflictDoNothing();

  const [vog, hybrid, drywall] = await db.select().from(mfhConstructionTypesTable).orderBy(asc(mfhConstructionTypesTable.id));

  const allSeriesInserts = [
    ...["Appalachia", "Giles", "Southern", "Wakarusa", "Champion", "Tru"].map(name => ({ name, constructionTypeId: vog.id })),
    ...["Addison"].map(name => ({ name, constructionTypeId: hybrid.id })),
    ...["Norris", "Rutledge", "Middlebury"].map(name => ({ name, constructionTypeId: drywall.id })),
  ];
  const insertedSeries = await db.insert(mfhHomeSeriesTable).values(allSeriesInserts).returning();

  const [dealerGuide, myPricing] = await db.insert(mfhPricingGuidesTable).values([
    { name: "Dealer Guide", isDealerGuide: true },
    { name: "My Pricing", isDealerGuide: false },
  ]).returning();

  const dealerItems = insertedSeries.map(s => ({
    guideId: dealerGuide.id, homeSeriesId: s.id,
    basePrice: s.constructionTypeId === hybrid.id ? "2500" : s.constructionTypeId === drywall.id ? "3500" : "1500",
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
  selectedKeys: string[], travelDays: number,
  seriesName: string, ctName: string,
  addons: { addonKey: string; label: string; price: string; isPerDay: boolean }[],
  basePrice: number,
) {
  const lines: Array<{ category: string; description: string; quantity: number; unit: string | null; unitCost: number; generatedBy: string }> = [
    { category: "Labor", description: `${seriesName} (${ctName}) Trim-Out`, quantity: 1, unit: "LOT", unitCost: basePrice, generatedBy: "MFH" },
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

// ── Library router ────────────────────────────────────────────────────────────
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

// Home Series — the priced entity (construction type, benchmark, checklist,
// default add-ons, notes). Pricing per series lives in the guide items.
mfhLibraryRouter.get("/series", async (req, res) => {
  try {
    await ensureSeeded();
    const { includeInactive } = req.query;
    const conditions = [];
    if (!includeInactive) conditions.push(eq(mfhHomeSeriesTable.active, true));
    const series = await db.select({
      id: mfhHomeSeriesTable.id, name: mfhHomeSeriesTable.name,
      constructionTypeId: mfhHomeSeriesTable.constructionTypeId,
      constructionTypeName: mfhConstructionTypesTable.name,
      benchmarkId: mfhHomeSeriesTable.benchmarkId, benchmarkName: jobTypeBenchmarksTable.jobType,
      benchmarkHours: jobTypeBenchmarksTable.estimatedHours,
      checklistTemplateId: mfhHomeSeriesTable.checklistTemplateId, checklistTemplateName: checklistTemplatesTable.name,
      defaultAddonKeys: mfhHomeSeriesTable.defaultAddonKeys, notes: mfhHomeSeriesTable.notes,
      active: mfhHomeSeriesTable.active, introducedYear: mfhHomeSeriesTable.introducedYear,
      discontinuedYear: mfhHomeSeriesTable.discontinuedYear, createdAt: mfhHomeSeriesTable.createdAt,
    }).from(mfhHomeSeriesTable)
      .leftJoin(mfhConstructionTypesTable, eq(mfhHomeSeriesTable.constructionTypeId, mfhConstructionTypesTable.id))
      .leftJoin(jobTypeBenchmarksTable, eq(mfhHomeSeriesTable.benchmarkId, jobTypeBenchmarksTable.id))
      .leftJoin(checklistTemplatesTable, eq(mfhHomeSeriesTable.checklistTemplateId, checklistTemplatesTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(mfhHomeSeriesTable.name));
    res.json(series);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.post("/series", async (req, res) => {
  try {
    const { name, constructionTypeId, benchmarkId, checklistTemplateId, defaultAddonKeys, notes, active, introducedYear, discontinuedYear } = req.body;
    if (!name?.trim() || !constructionTypeId) return res.status(400).json({ error: "name, constructionTypeId required" });
    const [row] = await db.insert(mfhHomeSeriesTable).values({
      name: name.trim(),
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
mfhLibraryRouter.patch("/series/:id", async (req, res) => {
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
    const [row] = await db.update(mfhHomeSeriesTable).set(updates).where(eq(mfhHomeSeriesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.delete("/series/:id", async (req, res) => {
  try {
    await db.delete(mfhHomeSeriesTable).where(eq(mfhHomeSeriesTable.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// Models — the genuine model name under a series. Descriptive; inherits the
// series' construction type / pricing / checklist / benchmark / add-ons.
mfhLibraryRouter.get("/models", async (req, res) => {
  try {
    await ensureSeeded();
    const { seriesId, includeInactive } = req.query;
    const conditions = [];
    if (seriesId) conditions.push(eq(mfhModelsTable.homeSeriesId, parseInt(seriesId as string)));
    if (!includeInactive) conditions.push(eq(mfhModelsTable.active, true));
    const models = await db.select().from(mfhModelsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(mfhModelsTable.name));
    res.json(models);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.post("/models", async (req, res) => {
  try {
    const { homeSeriesId, name, notes, active, introducedYear, discontinuedYear } = req.body;
    if (!homeSeriesId || !name?.trim()) return res.status(400).json({ error: "homeSeriesId, name required" });
    const [row] = await db.insert(mfhModelsTable).values({
      homeSeriesId: parseInt(homeSeriesId), name: name.trim(),
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
    const { name, notes, active, introducedYear, discontinuedYear } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
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

// Guides (global)
mfhLibraryRouter.get("/guides", async (_req, res) => {
  try {
    await ensureSeeded();
    const rows = await db.select().from(mfhPricingGuidesTable).orderBy(asc(mfhPricingGuidesTable.createdAt));
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.post("/guides", async (req, res) => {
  try {
    const { name, isDealerGuide } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name required" });
    const [row] = await db.insert(mfhPricingGuidesTable).values({ name: name.trim(), isDealerGuide: isDealerGuide === true }).returning();
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

// Guide items (keyed by home series)
mfhLibraryRouter.get("/guide-items", async (req, res) => {
  try {
    const { guideId, homeSeriesId } = req.query;
    const conditions = [];
    if (guideId) conditions.push(eq(mfhGuideItemsTable.guideId, parseInt(guideId as string)));
    if (homeSeriesId) conditions.push(eq(mfhGuideItemsTable.homeSeriesId, parseInt(homeSeriesId as string)));
    res.json(await db.select().from(mfhGuideItemsTable).where(conditions.length ? and(...conditions) : undefined));
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.put("/guide-items/upsert", async (req, res) => {
  try {
    const { guideId, homeSeriesId, basePrice } = req.body;
    if (!guideId || !homeSeriesId) return res.status(400).json({ error: "guideId and homeSeriesId required" });
    const existing = await db.select().from(mfhGuideItemsTable)
      .where(and(eq(mfhGuideItemsTable.guideId, parseInt(guideId)), eq(mfhGuideItemsTable.homeSeriesId, parseInt(homeSeriesId)))).limit(1);
    if (existing.length > 0) {
      const [row] = await db.update(mfhGuideItemsTable).set({ basePrice: String(basePrice ?? 0) }).where(eq(mfhGuideItemsTable.id, existing[0].id)).returning();
      return res.json(row);
    }
    const [row] = await db.insert(mfhGuideItemsTable).values({ guideId: parseInt(guideId), homeSeriesId: parseInt(homeSeriesId), basePrice: String(basePrice ?? 0) }).returning();
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

// Panel data (global) — everything the job panel and library modal need.
mfhLibraryRouter.get("/panel-data", async (_req, res) => {
  try {
    await ensureSeeded();
    const [series, models, guides, constructionTypes, benchmarks, templates] = await Promise.all([
      db.select({
        id: mfhHomeSeriesTable.id, name: mfhHomeSeriesTable.name,
        constructionTypeId: mfhHomeSeriesTable.constructionTypeId,
        constructionTypeName: mfhConstructionTypesTable.name,
        benchmarkId: mfhHomeSeriesTable.benchmarkId, benchmarkName: jobTypeBenchmarksTable.jobType,
        benchmarkHours: jobTypeBenchmarksTable.estimatedHours,
        checklistTemplateId: mfhHomeSeriesTable.checklistTemplateId, checklistTemplateName: checklistTemplatesTable.name,
        defaultAddonKeys: mfhHomeSeriesTable.defaultAddonKeys, notes: mfhHomeSeriesTable.notes,
        active: mfhHomeSeriesTable.active, introducedYear: mfhHomeSeriesTable.introducedYear, discontinuedYear: mfhHomeSeriesTable.discontinuedYear,
      }).from(mfhHomeSeriesTable)
        .leftJoin(mfhConstructionTypesTable, eq(mfhHomeSeriesTable.constructionTypeId, mfhConstructionTypesTable.id))
        .leftJoin(jobTypeBenchmarksTable, eq(mfhHomeSeriesTable.benchmarkId, jobTypeBenchmarksTable.id))
        .leftJoin(checklistTemplatesTable, eq(mfhHomeSeriesTable.checklistTemplateId, checklistTemplatesTable.id))
        .where(eq(mfhHomeSeriesTable.active, true))
        .orderBy(asc(mfhHomeSeriesTable.name)),
      db.select().from(mfhModelsTable).where(eq(mfhModelsTable.active, true)).orderBy(asc(mfhModelsTable.name)),
      db.select().from(mfhPricingGuidesTable).orderBy(asc(mfhPricingGuidesTable.createdAt)),
      db.select().from(mfhConstructionTypesTable).orderBy(asc(mfhConstructionTypesTable.name)),
      db.select().from(jobTypeBenchmarksTable).orderBy(asc(jobTypeBenchmarksTable.jobType)),
      db.select({ id: checklistTemplatesTable.id, name: checklistTemplatesTable.name }).from(checklistTemplatesTable).where(eq(checklistTemplatesTable.active, true)).orderBy(asc(checklistTemplatesTable.name)),
    ]);
    let guideItems: { id: number; guideId: number; homeSeriesId: number; basePrice: string }[] = [];
    let guideAddons: { id: number; guideId: number; addonKey: string; label: string; price: string; isPerDay: boolean }[] = [];
    if (guides.length > 0) {
      const guideIds = guides.map(g => g.id);
      [guideItems, guideAddons] = await Promise.all([
        db.select().from(mfhGuideItemsTable).where(inArray(mfhGuideItemsTable.guideId, guideIds)) as Promise<typeof guideItems>,
        db.select().from(mfhGuideAddonsTable).where(inArray(mfhGuideAddonsTable.guideId, guideIds)).orderBy(asc(mfhGuideAddonsTable.createdAt)) as Promise<typeof guideAddons>,
      ]);
    }
    res.json({ series, models, guides, guideItems, guideAddons, constructionTypes, benchmarks, templates });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// Library meta (construction types, benchmarks, checklist templates)
mfhLibraryRouter.get("/library-data", async (_req, res) => {
  try {
    await ensureSeeded();
    const [constructionTypes, benchmarks, templates] = await Promise.all([
      db.select().from(mfhConstructionTypesTable).orderBy(asc(mfhConstructionTypesTable.name)),
      db.select({ id: jobTypeBenchmarksTable.id, jobType: jobTypeBenchmarksTable.jobType, estimatedHours: jobTypeBenchmarksTable.estimatedHours }).from(jobTypeBenchmarksTable).orderBy(asc(jobTypeBenchmarksTable.jobType)),
      db.select({ id: checklistTemplatesTable.id, name: checklistTemplatesTable.name }).from(checklistTemplatesTable).where(eq(checklistTemplatesTable.active, true)).orderBy(asc(checklistTemplatesTable.name)),
    ]);
    res.json({ constructionTypes, benchmarks, templates });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// ── Job router (sectionGuard("jobs")) ─────────────────────────────────────────
export const mfhJobRouter = Router();

// GET /api/mfh/jobs/:id — get MFH snapshot for a job
mfhJobRouter.get("/jobs/:id", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const [job] = await db.select({
      id: jobsTable.id,
      mfhSeriesId: jobsTable.mfhSeriesId,
      mfhModelId: jobsTable.mfhModelId,
      mfhModelYear: jobsTable.mfhModelYear,
      mfhDealerPrice: jobsTable.mfhDealerPrice,
      mfhQuotedPrice: jobsTable.mfhQuotedPrice,
      mfhGuideName: jobsTable.mfhGuideName,
      mfhSelectedAddons: jobsTable.mfhSelectedAddons,
      mfhTravelDays: jobsTable.mfhTravelDays,
    } as Record<string, unknown>).from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
    res.json(job ?? {});
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// POST /api/mfh/jobs/:id/apply — apply MFH (benchmark + checklist + estimate + job update)
mfhJobRouter.post("/jobs/:id/apply", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id" });
    const { seriesId, modelId, modelYear, guideId, selectedAddonKeys, travelDays } = req.body;
    if (!seriesId || !guideId) return res.status(400).json({ error: "seriesId, guideId required" });

    // Fetch series + guide data (outside tx — read only)
    const [seriesRow] = await db.select({
      id: mfhHomeSeriesTable.id, name: mfhHomeSeriesTable.name,
      constructionTypeId: mfhHomeSeriesTable.constructionTypeId, constructionTypeName: mfhConstructionTypesTable.name,
      benchmarkId: mfhHomeSeriesTable.benchmarkId, checklistTemplateId: mfhHomeSeriesTable.checklistTemplateId,
    }).from(mfhHomeSeriesTable)
      .leftJoin(mfhConstructionTypesTable, eq(mfhHomeSeriesTable.constructionTypeId, mfhConstructionTypesTable.id))
      .where(eq(mfhHomeSeriesTable.id, parseInt(seriesId)));

    const [guideRow] = await db.select().from(mfhPricingGuidesTable).where(eq(mfhPricingGuidesTable.id, parseInt(guideId)));
    if (!seriesRow || !guideRow) return res.status(404).json({ error: "Series or guide not found" });

    // If a model is provided, it must belong to the selected series — the model
    // inherits the series' pricing/checklist/benchmark, so a cross-series pairing
    // would silently apply the wrong pricing.
    if (modelId) {
      const [modelRow] = await db.select({ homeSeriesId: mfhModelsTable.homeSeriesId })
        .from(mfhModelsTable).where(eq(mfhModelsTable.id, parseInt(modelId)));
      if (!modelRow) return res.status(404).json({ error: "Model not found" });
      if (modelRow.homeSeriesId !== parseInt(seriesId)) {
        return res.status(400).json({ error: "Model does not belong to the selected series" });
      }
    }

    const [guideItem] = await db.select().from(mfhGuideItemsTable)
      .where(and(eq(mfhGuideItemsTable.guideId, parseInt(guideId)), eq(mfhGuideItemsTable.homeSeriesId, parseInt(seriesId))));
    const basePrice = parseFloat(guideItem?.basePrice ?? "0");

    // Get dealer price snapshot
    const dealerPrice = await getDealerPrice(parseInt(seriesId), parseInt(guideId), basePrice);

    const addons = await db.select().from(mfhGuideAddonsTable).where(eq(mfhGuideAddonsTable.guideId, parseInt(guideId)));
    const selectedKeys: string[] = Array.isArray(selectedAddonKeys) ? selectedAddonKeys : [];
    const days = parseInt(travelDays ?? "1") || 1;
    const ctName = seriesRow.constructionTypeName ?? "Trim-Out";
    const mfhLines = await buildMfhLines(selectedKeys, days, seriesRow.name, ctName, addons, basePrice);
    const mfhTotal = mfhLines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

    const result = await db.transaction(async (tx) => {
      // Update job — spec requires Job Type to always be "Manufactured Home".
      // The series' linked benchmark is surfaced in the panel (panel-data); it
      // does not override the job type. The model is optional and descriptive.
      await tx.update(jobsTable).set({
        mfhSeriesId: parseInt(seriesId),
        mfhModelId: modelId ? parseInt(modelId) : null,
        mfhModelYear: modelYear ? parseInt(modelYear) : null,
        mfhDealerPrice: String(dealerPrice),
        mfhQuotedPrice: String(basePrice),
        mfhGuideName: guideRow.name,
        mfhSelectedAddons: selectedKeys,
        mfhTravelDays: days,
        jobType: "Manufactured Home",
      } as Record<string, unknown>).where(eq(jobsTable.id, jobId));

      // Note: applying a series intentionally does NOT mutate job_type_benchmarks.
      // Benchmarks are generic, business-level expectations for a job type (used
      // for reporting/planning) and are owner-managed. The series' defaults
      // (pricing, checklist, construction type, notes, add-ons) are what get
      // applied to the job here. The series' linked benchmark is surfaced in the
      // panel for reference only.

      // Find or create estimate
      const existingEstimates = await tx.select().from(estimatesTable).where(eq(estimatesTable.jobId, jobId)).limit(1);
      let estimateId: number;

      if (existingEstimates.length > 0) {
        const existing = existingEstimates[0];
        const existingLines: unknown[] = Array.isArray(existing.lineItems) ? (existing.lineItems as unknown[]) : [];
        const nonMfhLines = existingLines.filter((l: unknown) => (l as Record<string, unknown>).generatedBy !== "MFH");
        const merged = [...mfhLines, ...nonMfhLines];
        const newTotal = merged.reduce((s: number, l) => s + (parseFloat(String((l as Record<string, unknown>).quantity ?? 1)) * parseFloat(String((l as Record<string, unknown>).unitCost ?? 0))), 0);
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
          title: `${seriesRow.name} (${ctName}) Trim-Out`,
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

      // Apply checklist if the series has a template linked
      if (seriesRow.checklistTemplateId) {
        const templateId = seriesRow.checklistTemplateId;
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

// Resolve the dealer-guide base price for a series so the dealer-cost snapshot
// stays consistent across apply / update-pricing / reset.
async function getDealerPrice(homeSeriesId: number, currentGuideId: number, basePrice: number): Promise<number> {
  const dealerGuides = await db.select().from(mfhPricingGuidesTable)
    .where(eq(mfhPricingGuidesTable.isDealerGuide, true)).limit(1);
  let dealerPrice = basePrice;
  if (dealerGuides.length > 0 && dealerGuides[0].id !== currentGuideId) {
    const [di] = await db.select().from(mfhGuideItemsTable)
      .where(and(eq(mfhGuideItemsTable.guideId, dealerGuides[0].id), eq(mfhGuideItemsTable.homeSeriesId, homeSeriesId)));
    if (di) dealerPrice = parseFloat(di.basePrice);
  }
  return dealerPrice;
}

// Shared core for update-pricing and reset: regenerate only MFH-tagged estimate
// lines (preserving custom lines) and refresh the full pricing snapshot —
// dealer price, quoted price, guide name, add-ons, travel days — on BOTH the job
// and the estimate so the snapshot never goes stale after a guide change.
async function regenerateMfhPricing(jobId: number, body: { guideId: string | number; seriesId: string | number; selectedAddonKeys?: unknown; travelDays?: string | number }) {
  const guideId = parseInt(String(body.guideId));
  const seriesId = parseInt(String(body.seriesId));

  const [seriesRow] = await db.select({ name: mfhHomeSeriesTable.name, constructionTypeName: mfhConstructionTypesTable.name })
    .from(mfhHomeSeriesTable).leftJoin(mfhConstructionTypesTable, eq(mfhHomeSeriesTable.constructionTypeId, mfhConstructionTypesTable.id))
    .where(eq(mfhHomeSeriesTable.id, seriesId));
  const [guideRow] = await db.select().from(mfhPricingGuidesTable).where(eq(mfhPricingGuidesTable.id, guideId));
  const [guideItem] = await db.select().from(mfhGuideItemsTable)
    .where(and(eq(mfhGuideItemsTable.guideId, guideId), eq(mfhGuideItemsTable.homeSeriesId, seriesId)));
  const addons = await db.select().from(mfhGuideAddonsTable).where(eq(mfhGuideAddonsTable.guideId, guideId));

  const basePrice = parseFloat(guideItem?.basePrice ?? "0");
  const ctName = seriesRow?.constructionTypeName ?? "Trim-Out";
  const selectedKeys: string[] = Array.isArray(body.selectedAddonKeys) ? (body.selectedAddonKeys as string[]) : [];
  const days = parseInt(String(body.travelDays ?? "1")) || 1;
  const dealerPrice = await getDealerPrice(seriesId, guideId, basePrice);
  const newMfhLines = await buildMfhLines(selectedKeys, days, seriesRow?.name ?? "", ctName, addons, basePrice);

  await db.transaction(async (tx) => {
    const [estimate] = await tx.select().from(estimatesTable).where(eq(estimatesTable.jobId, jobId)).limit(1);
    if (estimate) {
      const existing: unknown[] = Array.isArray(estimate.lineItems) ? (estimate.lineItems as unknown[]) : [];
      const nonMfhLines = existing.filter((l: unknown) => (l as Record<string, unknown>).generatedBy !== "MFH");
      const merged = [...newMfhLines, ...nonMfhLines];
      const newTotal = merged.reduce((s: number, l) => s + (parseFloat(String((l as Record<string, unknown>).quantity ?? 1)) * parseFloat(String((l as Record<string, unknown>).unitCost ?? 0))), 0);
      await tx.update(estimatesTable).set({
        lineItems: merged, subtotal: String(newTotal), total: String(newTotal),
        mfhDealerPrice: String(dealerPrice), mfhQuotedPrice: String(basePrice), mfhGuideName: guideRow?.name ?? null,
      } as Record<string, unknown>).where(eq(estimatesTable.id, estimate.id));
    }
    await tx.update(jobsTable).set({
      mfhDealerPrice: String(dealerPrice), mfhQuotedPrice: String(basePrice), mfhGuideName: guideRow?.name ?? null,
      mfhSelectedAddons: selectedKeys, mfhTravelDays: days,
    } as Record<string, unknown>).where(eq(jobsTable.id, jobId));
  });
}

// PATCH /api/mfh/jobs/:id/update-pricing — refresh only MFH-tagged lines (no confirmation needed)
mfhJobRouter.patch("/jobs/:id/update-pricing", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const { guideId, seriesId } = req.body;
    if (!guideId || !seriesId) return res.status(400).json({ error: "guideId and seriesId required" });
    await regenerateMfhPricing(jobId, req.body);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to update pricing" }); }
});

// PATCH /api/mfh/jobs/:id/reset — same as update-pricing; used by "Reset to Guide" (confirmation shown by frontend)
mfhJobRouter.patch("/jobs/:id/reset", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const { guideId, seriesId } = req.body;
    if (!guideId || !seriesId) return res.status(400).json({ error: "guideId and seriesId required" });
    await regenerateMfhPricing(jobId, req.body);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to reset" }); }
});

// Default export (backward compat — not used for new registrations)
export default mfhLibraryRouter;
