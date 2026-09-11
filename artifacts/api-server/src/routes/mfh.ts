import { Router } from "express";
import { db } from "@workspace/db";
import {
  mfhConstructionTypesTable,
  mfhManufacturersTable,
  mfhModelsTable,
  mfhPricingGuidesTable,
  mfhGuideItemsTable,
  mfhGuideAddonsTable,
  mfhClientPricingTable,
  jobsTable,
  estimatesTable,
  jobTypeBenchmarksTable,
  jobTypeBenchmarkRevisionsTable,
  mfhComponentBaselineRevisionsTable,
  checklistTemplatesTable,
  checklistTemplateSectionsTable,
  checklistTemplateItemsTable,
  jobChecklistsTable,
  jobChecklistSectionsTable,
  jobChecklistItemsTable,
  invoicesTable,
  clientsTable,
  jobKnowledgeRecordsTable,
  jobDailyPresenceTable,
  jobProductionComponentsTable,
  jobComponentWorkSessionsTable,
  productionServiceTypesTable,
  mfhCustomProductionProfilesTable,
  mfhCustomProductionProfileServicesTable,
} from "@workspace/db/schema";
import { eq, and, asc, desc, inArray, sql, ilike, or, isNull } from "drizzle-orm";
import crypto from "crypto";
import {
  requestedBusiness,
  invalidBusinessScope,
  hasRequestedBusiness,
  businessPredicate,
  resolveMutationBusiness,
} from "../lib/business-scope";
import {
  buildProductionObservationResponse,
  type ObservationPresenceState,
} from "../lib/production-observations";
import {
  buildComponentBaselineEvidence,
  COMPONENT_BASELINE_MINIMUM_SAMPLE_SIZE,
} from "../lib/component-baselines";
import { isEligibleForProductionLearning } from "../lib/production-intelligence-contract";
import { getRequestUser } from "./guards";

// ── Seed ──────────────────────────────────────────────────────────────────────
let seeded = false;
async function ensureSeeded() {
  if (seeded) return;
  const existing = await db.select({ id: mfhManufacturersTable.id }).from(mfhManufacturersTable).limit(1);
  if (existing.length > 0) { seeded = true; return; }

  await db.insert(mfhConstructionTypesTable).values([
    { name: "VOG" }, { name: "Hybrid" }, { name: "Drywall" }, { name: "Lot" },
  ]).onConflictDoNothing();

  // Seed builders (manufacturers) correctly — each builder brand is its own entry
  await db.insert(mfhManufacturersTable).values([
    { name: "Addison" }, { name: "Appalachia" }, { name: "Champion" },
    { name: "Giles" }, { name: "Middlebury" }, { name: "Norris" },
    { name: "Rutledge" }, { name: "Southern" }, { name: "Tru" }, { name: "Wakarusa" },
  ]).onConflictDoNothing();

  seeded = true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
type MfhLine = { category: string; description: string; quantity: number; unit: string | null; unitCost: number; generatedBy: string };

// Baseline path — single estimate line, no guide/addons dependency
function buildMfhLinesSync(modelName: string, ctName: string, effectivePrice: number): MfhLine[] {
  return [{ category: "Labor", description: `${modelName} (${ctName}) Installation`, quantity: 1, unit: "LOT", unitCost: effectivePrice, generatedBy: "MFH" }];
}

async function buildMfhLines(
  guideId: number, modelId: number,
  selectedKeys: string[], travelDays: number,
  modelName: string, ctName: string,
  addons: { addonKey: string; label: string; price: string; isPerDay: boolean }[],
  basePrice: number,
): Promise<MfhLine[]> {
  const lines: MfhLine[] = [
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

// ── Lot type backfill — runs once per server start, safe on existing DBs ──────
let lotTypeEnsured = false;
async function ensureLotConstructionType() {
  if (lotTypeEnsured) return;
  await db.insert(mfhConstructionTypesTable).values({ name: "Lot" }).onConflictDoNothing();
  lotTypeEnsured = true;
}

// ── Library router (requireOwner) ─────────────────────────────────────────────
export const mfhLibraryRouter = Router();

// Construction types
mfhLibraryRouter.get("/construction-types", async (_req, res) => {
  try {
    await ensureSeeded();
    await ensureLotConstructionType();
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
mfhLibraryRouter.get("/manufacturers", async (req, res) => {
  try {
    await ensureSeeded();
    const { includeInactive } = req.query;
    const rows = includeInactive
      ? await db.select().from(mfhManufacturersTable).orderBy(asc(mfhManufacturersTable.name))
      : await db.select().from(mfhManufacturersTable).where(eq(mfhManufacturersTable.active, true)).orderBy(asc(mfhManufacturersTable.name));
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.post("/manufacturers", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    const dup = await db.select({ id: mfhManufacturersTable.id }).from(mfhManufacturersTable)
      .where(ilike(mfhManufacturersTable.name, name.trim())).limit(1);
    if (dup.length > 0) return res.status(409).json({ error: `Builder "${name.trim()}" already exists` });
    const [row] = await db.insert(mfhManufacturersTable).values({ name: name.trim() }).returning();
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.patch("/manufacturers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, active } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: "Name required" });
      const dup = await db.select({ id: mfhManufacturersTable.id }).from(mfhManufacturersTable)
        .where(and(ilike(mfhManufacturersTable.name, name.trim()), sql`${mfhManufacturersTable.id} != ${id}`)).limit(1);
      if (dup.length > 0) return res.status(409).json({ error: `Builder "${name.trim()}" already exists` });
      updates.name = name.trim();
    }
    if (active !== undefined) updates.active = active;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No updates provided" });
    const [row] = await db.update(mfhManufacturersTable).set(updates).where(eq(mfhManufacturersTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.delete("/manufacturers/:id", (_req, res) => {
  res.status(405).json({ error: "Builders are permanent records and cannot be deleted. Mark it Inactive if it is no longer in use." });
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
    const { manufacturerId, name, constructionTypeId, benchmarkId, checklistTemplateId, defaultAddonKeys, basePrice, notes, active, introducedYear, discontinuedYear } = req.body;
    if (!manufacturerId || !name?.trim() || !constructionTypeId) return res.status(400).json({ error: "manufacturerId, name, constructionTypeId required" });
    const mfgId = parseInt(manufacturerId);
    const [mfg] = await db.select({ active: mfhManufacturersTable.active }).from(mfhManufacturersTable).where(eq(mfhManufacturersTable.id, mfgId)).limit(1);
    if (!mfg) return res.status(404).json({ error: "Builder not found" });
    if (!mfg.active) return res.status(409).json({ error: "Cannot add models to an inactive builder. Reactivate the builder first." });
    const dup = await db.select({ id: mfhModelsTable.id }).from(mfhModelsTable)
      .where(and(eq(mfhModelsTable.manufacturerId, mfgId), ilike(mfhModelsTable.name, name.trim()))).limit(1);
    if (dup.length > 0) return res.status(409).json({ error: `Model "${name.trim()}" already exists under this builder` });
    const [row] = await db.insert(mfhModelsTable).values({
      manufacturerId: mfgId, name: name.trim(),
      constructionTypeId: parseInt(constructionTypeId),
      benchmarkId: benchmarkId ? parseInt(benchmarkId) : null,
      checklistTemplateId: checklistTemplateId ? parseInt(checklistTemplateId) : null,
      defaultAddonKeys: defaultAddonKeys ?? [],
      basePrice: basePrice != null ? String(basePrice) : null,
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
    const { name, constructionTypeId, manufacturerId: newManufacturerId, benchmarkId, checklistTemplateId, defaultAddonKeys, basePrice, notes, active, introducedYear, discontinuedYear } = req.body;
    const updates: Record<string, unknown> = {};
    if (newManufacturerId !== undefined) {
      const [current] = await db.select({ manufacturerId: mfhModelsTable.manufacturerId }).from(mfhModelsTable).where(eq(mfhModelsTable.id, id)).limit(1);
      if (current && current.manufacturerId !== parseInt(newManufacturerId)) {
        const jobRef = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.mfhModelId, id)).limit(1);
        if (jobRef.length > 0) return res.status(409).json({ error: "Cannot reassign a model's builder once it has been used on jobs." });
      }
      updates.manufacturerId = parseInt(newManufacturerId);
    }
    if (name !== undefined) {
      const [current] = await db.select({ manufacturerId: mfhModelsTable.manufacturerId }).from(mfhModelsTable).where(eq(mfhModelsTable.id, id)).limit(1);
      const mfgId = updates.manufacturerId as number ?? current?.manufacturerId;
      if (mfgId) {
        const dup = await db.select({ id: mfhModelsTable.id }).from(mfhModelsTable)
          .where(and(eq(mfhModelsTable.manufacturerId, mfgId), ilike(mfhModelsTable.name, name.trim()), sql`${mfhModelsTable.id} != ${id}`)).limit(1);
        if (dup.length > 0) return res.status(409).json({ error: `Model "${name.trim()}" already exists under this builder` });
      }
      updates.name = name.trim();
    }
    if (constructionTypeId !== undefined) updates.constructionTypeId = parseInt(constructionTypeId);
    if (benchmarkId !== undefined) updates.benchmarkId = benchmarkId ? parseInt(benchmarkId) : null;
    if (checklistTemplateId !== undefined) updates.checklistTemplateId = checklistTemplateId ? parseInt(checklistTemplateId) : null;
    if (defaultAddonKeys !== undefined) updates.defaultAddonKeys = defaultAddonKeys;
    if (basePrice !== undefined) updates.basePrice = basePrice != null && basePrice !== "" ? String(basePrice) : null;
    if (notes !== undefined) updates.notes = notes || null;
    if (active !== undefined) updates.active = active;
    if (introducedYear !== undefined) updates.introducedYear = introducedYear ? parseInt(introducedYear) : null;
    if (discontinuedYear !== undefined) updates.discontinuedYear = discontinuedYear ? parseInt(discontinuedYear) : null;
    const [row] = await db.update(mfhModelsTable).set(updates).where(eq(mfhModelsTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});
mfhLibraryRouter.delete("/models/:id", (_req, res) => {
  res.status(405).json({ error: "Models are permanent records and cannot be deleted. Mark it Inactive if it is no longer in use." });
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
        defaultAddonKeys: mfhModelsTable.defaultAddonKeys, basePrice: mfhModelsTable.basePrice,
        notes: mfhModelsTable.notes,
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
    // If a clientId is provided, fetch client pricing overrides for all models (modelId → price)
    let clientOverrides: Record<number, string> = {};
    const clientIdParam = req.query.clientId;
    if (clientIdParam) {
      const cid = parseInt(clientIdParam as string);
      if (!isNaN(cid)) {
        const modelIds = models.map(m => m.id);
        if (modelIds.length > 0) {
          const overrideRows = await db.select({
            modelId: mfhClientPricingTable.modelId,
            price: mfhClientPricingTable.price,
          }).from(mfhClientPricingTable)
            .where(and(inArray(mfhClientPricingTable.modelId, modelIds), eq(mfhClientPricingTable.clientId, cid)));
          clientOverrides = Object.fromEntries(overrideRows.map(r => [r.modelId, r.price]));
        }
      }
    }
    res.json({ models, guides, guideItems, guideAddons, constructionTypes, benchmarks, templates, clientOverrides });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// Library data — returns ALL manufacturers (including inactive) + ALL models for the library management UI
mfhLibraryRouter.get("/library-data", async (_req, res) => {
  try {
    await ensureSeeded();
    const [manufacturers, models, constructionTypes, benchmarks, templates] = await Promise.all([
      db.select().from(mfhManufacturersTable).orderBy(asc(mfhManufacturersTable.name)),
      db.select({
        id: mfhModelsTable.id, manufacturerId: mfhModelsTable.manufacturerId,
        name: mfhModelsTable.name, constructionTypeId: mfhModelsTable.constructionTypeId,
        constructionTypeName: mfhConstructionTypesTable.name,
        benchmarkId: mfhModelsTable.benchmarkId, benchmarkName: jobTypeBenchmarksTable.jobType,
        benchmarkHours: jobTypeBenchmarksTable.estimatedHours,
        checklistTemplateId: mfhModelsTable.checklistTemplateId, checklistTemplateName: checklistTemplatesTable.name,
        defaultAddonKeys: mfhModelsTable.defaultAddonKeys, basePrice: mfhModelsTable.basePrice,
        notes: mfhModelsTable.notes,
        active: mfhModelsTable.active, introducedYear: mfhModelsTable.introducedYear, discontinuedYear: mfhModelsTable.discontinuedYear,
      }).from(mfhModelsTable)
        .leftJoin(mfhConstructionTypesTable, eq(mfhModelsTable.constructionTypeId, mfhConstructionTypesTable.id))
        .leftJoin(jobTypeBenchmarksTable, eq(mfhModelsTable.benchmarkId, jobTypeBenchmarksTable.id))
        .leftJoin(checklistTemplatesTable, eq(mfhModelsTable.checklistTemplateId, checklistTemplatesTable.id))
        .orderBy(asc(mfhModelsTable.name)),
      db.select().from(mfhConstructionTypesTable).orderBy(asc(mfhConstructionTypesTable.name)),
      db.select({ id: jobTypeBenchmarksTable.id, jobType: jobTypeBenchmarksTable.jobType, estimatedHours: jobTypeBenchmarksTable.estimatedHours }).from(jobTypeBenchmarksTable).orderBy(asc(jobTypeBenchmarksTable.jobType)),
      db.select({ id: checklistTemplatesTable.id, name: checklistTemplatesTable.name }).from(checklistTemplatesTable).where(eq(checklistTemplatesTable.active, true)).orderBy(asc(checklistTemplatesTable.name)),
    ]);
    res.json({ manufacturers, models, constructionTypes, benchmarks, templates });
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
      mfhManufacturerId: jobsTable.mfhManufacturerId,
      mfhModelId: jobsTable.mfhModelId,
      mfhModelYear: jobsTable.mfhModelYear,
      mfhDealerPrice: jobsTable.mfhDealerPrice,
      mfhQuotedPrice: jobsTable.mfhQuotedPrice,
      mfhGuideName: jobsTable.mfhGuideName,
      mfhSelectedAddons: jobsTable.mfhSelectedAddons,
      mfhTravelDays: jobsTable.mfhTravelDays,
    }).from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
    res.json(job ?? {});
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// POST /api/mfh/jobs/:id/apply — apply MFH (benchmark + checklist + estimate + job update)
// guideId is optional: if omitted, uses model base_price → mfh_client_pricing override (baseline path)
mfhJobRouter.post("/jobs/:id/apply", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id" });
    const { manufacturerId, modelId, modelYear, guideId, selectedAddonKeys, travelDays, manualPrice } = req.body;
    if (!manufacturerId || !modelId) return res.status(400).json({ error: "manufacturerId, modelId required" });

    // Fetch model data (always needed)
    const [modelRow] = await db.select({
      id: mfhModelsTable.id, name: mfhModelsTable.name,
      constructionTypeId: mfhModelsTable.constructionTypeId, constructionTypeName: mfhConstructionTypesTable.name,
      benchmarkId: mfhModelsTable.benchmarkId, checklistTemplateId: mfhModelsTable.checklistTemplateId,
      basePrice: mfhModelsTable.basePrice, manufacturerId: mfhModelsTable.manufacturerId,
    }).from(mfhModelsTable)
      .leftJoin(mfhConstructionTypesTable, eq(mfhModelsTable.constructionTypeId, mfhConstructionTypesTable.id))
      .where(eq(mfhModelsTable.id, parseInt(modelId)));
    if (!modelRow) return res.status(404).json({ error: "Model not found" });

    const ctName = modelRow.constructionTypeName ?? "Trim-Out";
    let mfhLines: MfhLine[];
    let quotedPrice: number;
    let dealerPrice: number;
    let guideName: string | null = null;

    if (guideId) {
      // ── Guide-based path (existing behavior) ──
      const [guideRow] = await db.select().from(mfhPricingGuidesTable).where(eq(mfhPricingGuidesTable.id, parseInt(guideId)));
      if (!guideRow) return res.status(404).json({ error: "Guide not found" });
      const [guideItem] = await db.select().from(mfhGuideItemsTable)
        .where(and(eq(mfhGuideItemsTable.guideId, parseInt(guideId)), eq(mfhGuideItemsTable.modelId, parseInt(modelId))));
      quotedPrice = parseFloat(guideItem?.basePrice ?? "0");
      dealerPrice = await getDealerPrice(parseInt(manufacturerId), parseInt(modelId), parseInt(guideId), quotedPrice);
      const addons = await db.select().from(mfhGuideAddonsTable).where(eq(mfhGuideAddonsTable.guideId, parseInt(guideId)));
      const selectedKeys: string[] = Array.isArray(selectedAddonKeys) ? selectedAddonKeys : [];
      const days = parseInt(travelDays ?? "1") || 1;
      mfhLines = await buildMfhLines(parseInt(guideId), parseInt(modelId), selectedKeys, days, modelRow.name, ctName, addons, quotedPrice);
      guideName = guideRow.name;
    } else {
      // ── Baseline path: model.base_price → client pricing override → optional manualPrice ──
      const [jobRow] = await db.select({ clientId: jobsTable.clientId }).from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
      let effectivePrice = parseFloat(modelRow.basePrice ?? "0");
      if (jobRow?.clientId) {
        const [override] = await db.select().from(mfhClientPricingTable)
          .where(and(eq(mfhClientPricingTable.modelId, modelRow.id), eq(mfhClientPricingTable.clientId, jobRow.clientId))).limit(1);
        if (override) effectivePrice = parseFloat(override.price);
      }
      // User manual override takes priority over computed baseline
      if (manualPrice != null && !isNaN(parseFloat(String(manualPrice)))) {
        effectivePrice = parseFloat(String(manualPrice));
      }
      quotedPrice = effectivePrice;
      dealerPrice = effectivePrice;
      mfhLines = buildMfhLinesSync(modelRow.name, ctName, effectivePrice);
    }

    const mfhTotal = mfhLines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

    const result = await db.transaction(async (tx) => {
      // Update job — spec requires Job Type to always be "Manufactured Home".
      await tx.update(jobsTable).set({
        mfhManufacturerId: parseInt(manufacturerId),
        mfhModelId: parseInt(modelId),
        mfhModelYear: modelYear ? parseInt(modelYear) : null,
        mfhDealerPrice: String(dealerPrice),
        mfhQuotedPrice: String(quotedPrice),
        mfhGuideName: guideName,
        mfhSelectedAddons: Array.isArray(selectedAddonKeys) ? selectedAddonKeys : [],
        mfhTravelDays: guideId ? (parseInt(travelDays ?? "1") || 1) : null,
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
        const newTotal = merged.reduce((s: number, l) => s + (parseFloat(String((l as Record<string, unknown>).quantity ?? 1)) * parseFloat(String((l as Record<string, unknown>).unitCost ?? 0))), 0);
        await tx.update(estimatesTable).set({
          lineItems: merged,
          subtotal: String(newTotal),
          total: String(newTotal),
          mfhDealerPrice: String(dealerPrice),
          mfhQuotedPrice: String(quotedPrice),
          mfhGuideName: guideName,
          jobType: "Manufactured Home",
        }).where(eq(estimatesTable.id, existing.id));
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
          mfhQuotedPrice: String(quotedPrice),
          mfhGuideName: guideName,
        } as any).returning();
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

// Resolve the dealer-guide base price for a model so the dealer-cost snapshot
// stays consistent across apply / update-pricing / reset.
async function getDealerPrice(manufacturerId: number, modelId: number, currentGuideId: number, basePrice: number): Promise<number> {
  const dealerGuides = await db.select().from(mfhPricingGuidesTable)
    .where(and(eq(mfhPricingGuidesTable.manufacturerId, manufacturerId), eq(mfhPricingGuidesTable.isDealerGuide, true))).limit(1);
  let dealerPrice = basePrice;
  if (dealerGuides.length > 0 && dealerGuides[0].id !== currentGuideId) {
    const [di] = await db.select().from(mfhGuideItemsTable)
      .where(and(eq(mfhGuideItemsTable.guideId, dealerGuides[0].id), eq(mfhGuideItemsTable.modelId, modelId)));
    if (di) dealerPrice = parseFloat(di.basePrice);
  }
  return dealerPrice;
}

// Shared core for update-pricing and reset: regenerate only MFH-tagged estimate
// lines (preserving custom lines) and refresh the full pricing snapshot —
// dealer price, quoted price, guide name, add-ons, travel days — on BOTH the job
// and the estimate so the snapshot never goes stale after a guide change.
async function regenerateMfhPricing(jobId: number, body: { guideId: string | number; modelId: string | number; selectedAddonKeys?: unknown; travelDays?: string | number }) {
  const guideId = parseInt(String(body.guideId));
  const modelId = parseInt(String(body.modelId));

  const [modelRow] = await db.select({ name: mfhModelsTable.name, manufacturerId: mfhModelsTable.manufacturerId, constructionTypeName: mfhConstructionTypesTable.name })
    .from(mfhModelsTable).leftJoin(mfhConstructionTypesTable, eq(mfhModelsTable.constructionTypeId, mfhConstructionTypesTable.id))
    .where(eq(mfhModelsTable.id, modelId));
  const [guideRow] = await db.select().from(mfhPricingGuidesTable).where(eq(mfhPricingGuidesTable.id, guideId));
  const [guideItem] = await db.select().from(mfhGuideItemsTable)
    .where(and(eq(mfhGuideItemsTable.guideId, guideId), eq(mfhGuideItemsTable.modelId, modelId)));
  const addons = await db.select().from(mfhGuideAddonsTable).where(eq(mfhGuideAddonsTable.guideId, guideId));

  const basePrice = parseFloat(guideItem?.basePrice ?? "0");
  const ctName = modelRow?.constructionTypeName ?? "Trim-Out";
  const selectedKeys: string[] = Array.isArray(body.selectedAddonKeys) ? (body.selectedAddonKeys as string[]) : [];
  const days = parseInt(String(body.travelDays ?? "1")) || 1;
  const dealerPrice = modelRow ? await getDealerPrice(modelRow.manufacturerId, modelId, guideId, basePrice) : basePrice;
  const newMfhLines = await buildMfhLines(guideId, modelId, selectedKeys, days, modelRow?.name ?? "", ctName, addons, basePrice);

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

// Baseline refresh: re-derive price from model.base_price → client override and rebuild estimate lines
async function regenerateBaselinePricing(jobId: number, modelId: number) {
  const [modelRow] = await db.select({
    id: mfhModelsTable.id, name: mfhModelsTable.name,
    constructionTypeName: mfhConstructionTypesTable.name,
    basePrice: mfhModelsTable.basePrice,
  }).from(mfhModelsTable)
    .leftJoin(mfhConstructionTypesTable, eq(mfhModelsTable.constructionTypeId, mfhConstructionTypesTable.id))
    .where(eq(mfhModelsTable.id, modelId));
  if (!modelRow) return;

  const [jobRow] = await db.select({ clientId: jobsTable.clientId }).from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
  let effectivePrice = parseFloat(modelRow.basePrice ?? "0");
  if (jobRow?.clientId) {
    const [override] = await db.select().from(mfhClientPricingTable)
      .where(and(eq(mfhClientPricingTable.modelId, modelId), eq(mfhClientPricingTable.clientId, jobRow.clientId))).limit(1);
    if (override) effectivePrice = parseFloat(override.price);
  }

  const ctName = modelRow.constructionTypeName ?? "Trim-Out";
  const newMfhLines = buildMfhLinesSync(modelRow.name, ctName, effectivePrice);

  await db.transaction(async (tx) => {
    const [estimate] = await tx.select().from(estimatesTable).where(eq(estimatesTable.jobId, jobId)).limit(1);
    if (estimate) {
      const existing: unknown[] = Array.isArray(estimate.lineItems) ? (estimate.lineItems as unknown[]) : [];
      const nonMfhLines = existing.filter((l: unknown) => (l as Record<string, unknown>).generatedBy !== "MFH");
      const merged = [...newMfhLines, ...nonMfhLines];
      const newTotal = merged.reduce((s: number, l) => s + (parseFloat(String((l as Record<string, unknown>).quantity ?? 1)) * parseFloat(String((l as Record<string, unknown>).unitCost ?? 0))), 0);
      await tx.update(estimatesTable).set({
        lineItems: merged, subtotal: String(newTotal), total: String(newTotal),
        mfhDealerPrice: String(effectivePrice), mfhQuotedPrice: String(effectivePrice), mfhGuideName: null,
      } as Record<string, unknown>).where(eq(estimatesTable.id, estimate.id));
    }
    await tx.update(jobsTable).set({
      mfhDealerPrice: String(effectivePrice), mfhQuotedPrice: String(effectivePrice), mfhGuideName: null,
    } as Record<string, unknown>).where(eq(jobsTable.id, jobId));
  });
}

// PATCH /api/mfh/jobs/:id/update-pricing — refresh only MFH-tagged lines (no confirmation needed)
// If guideId is omitted, uses baseline path (model.base_price → client override)
mfhJobRouter.patch("/jobs/:id/update-pricing", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const { guideId, modelId } = req.body;
    if (!modelId) return res.status(400).json({ error: "modelId required" });
    if (guideId) {
      await regenerateMfhPricing(jobId, req.body);
    } else {
      await regenerateBaselinePricing(jobId, parseInt(String(modelId)));
    }
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to update pricing" }); }
});

// PATCH /api/mfh/jobs/:id/reset — same as update-pricing; used by "Reset to Guide/Baseline" (confirmation shown by frontend)
mfhJobRouter.patch("/jobs/:id/reset", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const { guideId, modelId } = req.body;
    if (!modelId) return res.status(400).json({ error: "modelId required" });
    if (guideId) {
      await regenerateMfhPricing(jobId, req.body);
    } else {
      await regenerateBaselinePricing(jobId, parseInt(String(modelId)));
    }
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to reset" }); }
});

// ── Knowledge Base ─────────────────────────────────────────────────────────────

// GET /api/mfh/knowledge-base — all models with aggregated stats from completed jobs
mfhLibraryRouter.get("/knowledge-base", async (_req, res) => {
  try {
    await ensureSeeded();
    const models = await db.select({
      id: mfhModelsTable.id,
      manufacturerId: mfhModelsTable.manufacturerId,
      manufacturerName: mfhManufacturersTable.name,
      name: mfhModelsTable.name,
      constructionTypeId: mfhModelsTable.constructionTypeId,
      constructionTypeName: mfhConstructionTypesTable.name,
      basePrice: mfhModelsTable.basePrice,
      notes: mfhModelsTable.notes,
      active: mfhModelsTable.active,
      introducedYear: mfhModelsTable.introducedYear,
      discontinuedYear: mfhModelsTable.discontinuedYear,
    }).from(mfhModelsTable)
      .leftJoin(mfhManufacturersTable, eq(mfhModelsTable.manufacturerId, mfhManufacturersTable.id))
      .leftJoin(mfhConstructionTypesTable, eq(mfhModelsTable.constructionTypeId, mfhConstructionTypesTable.id))
      .orderBy(asc(mfhManufacturersTable.name), asc(mfhModelsTable.name));

    // Stats per model — all metrics sourced exclusively from accepted KB records;
    // pricing metadata (avgQuotedPrice/avgDealerPrice) fetched via jobs join scoped to accepted KB records
    const [kbBaseRows, invoiceRows] = await Promise.all([
      // Q1: KB metrics + pricing metadata, joined to jobs, scoped to accepted records
      db.select({
        modelId: jobKnowledgeRecordsTable.mfhModelId,
        acceptedCount: sql<number>`COUNT(*)`,
        avgProductiveHours: sql<string>`AVG(${jobKnowledgeRecordsTable.productiveHours}::numeric)`,
        avgQuotedPrice: sql<string>`AVG(${jobsTable.mfhQuotedPrice}::numeric)`,
        avgDealerPrice: sql<string>`AVG(${jobsTable.mfhDealerPrice}::numeric)`,
      }).from(jobKnowledgeRecordsTable)
        .innerJoin(jobsTable, eq(jobKnowledgeRecordsTable.jobId, jobsTable.id))
        .where(and(
          sql`${jobKnowledgeRecordsTable.mfhModelId} IS NOT NULL`,
          sql`${jobKnowledgeRecordsTable.status} = 'accepted'`,
        ))
        .groupBy(jobKnowledgeRecordsTable.mfhModelId),
      // Q2: avg invoice from accepted KB records only
      db.select({
        modelId: jobKnowledgeRecordsTable.mfhModelId,
        avgInvoice: sql<string>`AVG(${jobKnowledgeRecordsTable.invoiceAmount}::numeric)`,
      }).from(jobKnowledgeRecordsTable)
        .where(and(
          sql`${jobKnowledgeRecordsTable.mfhModelId} IS NOT NULL`,
          sql`${jobKnowledgeRecordsTable.status} = 'accepted'`,
          sql`${jobKnowledgeRecordsTable.invoiceAmount} IS NOT NULL`,
        ))
        .groupBy(jobKnowledgeRecordsTable.mfhModelId),
    ]);
    const kbMap = new Map(kbBaseRows.map(r => [r.modelId, r]));
    const invoiceMap = new Map((invoiceRows as Array<{ modelId: number; avgInvoice: string }>).map(r => [r.modelId, r.avgInvoice]));

    const result = models.map(m => {
      const kb = kbMap.get(m.id);
      return {
        ...m,
        jobCount: kb ? Number(kb.acceptedCount) : 0,
        avgQuotedPrice: kb?.avgQuotedPrice ? parseFloat(kb.avgQuotedPrice) : null,
        avgDealerPrice: kb?.avgDealerPrice ? parseFloat(kb.avgDealerPrice) : null,
        avgHours: kb?.avgProductiveHours ? parseFloat(kb.avgProductiveHours) : null,
        avgProductiveHours: kb?.avgProductiveHours ? parseFloat(kb.avgProductiveHours) : null,
        acceptedCount: kb ? Number(kb.acceptedCount) : 0,
        avgInvoice: invoiceMap.has(m.id) ? parseFloat(invoiceMap.get(m.id)!) : null,
      };
    });

    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

type ProductionObservationScope = Awaited<ReturnType<typeof requestedBusiness>>;
type ObservationDatabase = Pick<typeof db, "select">;

async function loadProductionObservation(
  modelId: number,
  scope: ProductionObservationScope,
  database: ObservationDatabase = db,
) {
  const [model] = await database.select({
      id: mfhModelsTable.id,
      benchmarkId: mfhModelsTable.benchmarkId,
      benchmarkJobType: jobTypeBenchmarksTable.jobType,
      benchmarkHours: jobTypeBenchmarksTable.estimatedHours,
    }).from(mfhModelsTable)
      .leftJoin(jobTypeBenchmarksTable, eq(mfhModelsTable.benchmarkId, jobTypeBenchmarksTable.id))
      .where(eq(mfhModelsTable.id, modelId));

  if (!model) return null;

  const jobBusinessFilter = businessPredicate(jobsTable, scope);
    const candidateJobs = await database.select({
      id: jobsTable.id,
      title: jobsTable.title,
      status: jobsTable.status,
      workflow: jobsTable.workflow,
      businessId: jobsTable.businessId,
      mhProductionServices: jobsTable.mhProductionServices,
    }).from(jobsTable).where(and(
      eq(jobsTable.mfhModelId, modelId),
      inArray(jobsTable.status, ["completed", "invoiced"]),
      eq(jobsTable.workflow, "mh_production"),
      jobBusinessFilter,
    ));

  const serviceIds = Array.from(new Set(candidateJobs.flatMap((job) =>
      Array.isArray(job.mhProductionServices)
        ? job.mhProductionServices.filter((id): id is number => Number.isInteger(id))
        : [],
    )));
    const serviceRows = serviceIds.length > 0
      ? await database.select({
        id: productionServiceTypesTable.id,
        name: productionServiceTypesTable.name,
        itemKey: productionServiceTypesTable.itemKey,
        appliesTo: productionServiceTypesTable.appliesTo,
        businessId: productionServiceTypesTable.businessId,
      }).from(productionServiceTypesTable).where(and(
        inArray(productionServiceTypesTable.id, serviceIds),
        scope
          ? or(isNull(productionServiceTypesTable.businessId), eq(productionServiceTypesTable.businessId, scope.id))
          : undefined,
      ))
      : [];
    const profileServiceRows = serviceIds.length > 0
     ? await database.select({
        businessId: mfhCustomProductionProfileServicesTable.businessId,
        serviceTypeId: mfhCustomProductionProfileServicesTable.serviceTypeId,
        profileId: mfhCustomProductionProfilesTable.id,
        profileKey: mfhCustomProductionProfilesTable.profileKey,
        profileName: mfhCustomProductionProfilesTable.name,
      }).from(mfhCustomProductionProfileServicesTable)
        .innerJoin(
          mfhCustomProductionProfilesTable,
          eq(mfhCustomProductionProfileServicesTable.profileId, mfhCustomProductionProfilesTable.id),
        )
        .where(and(
          inArray(mfhCustomProductionProfileServicesTable.serviceTypeId, serviceIds),
          eq(mfhCustomProductionProfilesTable.active, true),
          eq(
            mfhCustomProductionProfilesTable.businessId,
            mfhCustomProductionProfileServicesTable.businessId,
          ),
          scope ? eq(mfhCustomProductionProfileServicesTable.businessId, scope.id) : undefined,
        ))
    : [];
  const serviceById = new Map(serviceRows.map((service) => [service.id, service]));
  const profileByBusinessService = new Map(
    profileServiceRows.map((profile) => [
      `${profile.businessId}:${profile.serviceTypeId}`,
      { id: profile.profileId, key: profile.profileKey, name: profile.profileName },
    ]),
  );
  const jobIds = candidateJobs.map((job) => job.id);
  const presenceRows = jobIds.length > 0
      ? await database.select({
        id: jobDailyPresenceTable.id,
        jobId: jobDailyPresenceTable.jobId,
        date: jobDailyPresenceTable.date,
        state: jobDailyPresenceTable.state,
        provenance: jobDailyPresenceTable.provenance,
        notHereReason: jobDailyPresenceTable.notHereReason,
        notes: jobDailyPresenceTable.notes,
        updatedAt: jobDailyPresenceTable.updatedAt,
      }).from(jobDailyPresenceTable)
        .where(inArray(jobDailyPresenceTable.jobId, jobIds))
        .orderBy(asc(jobDailyPresenceTable.jobId), asc(jobDailyPresenceTable.date))
      : [];
  const presenceByJob = new Map<number, typeof presenceRows>();
  for (const row of presenceRows) {
    const rows = presenceByJob.get(row.jobId) ?? [];
    rows.push(row);
    presenceByJob.set(row.jobId, rows);
  }

  const componentRows = jobIds.length > 0
    ? await database.select({
      id: jobProductionComponentsTable.id,
      jobId: jobProductionComponentsTable.jobId,
      componentKey: jobProductionComponentsTable.componentKey,
      componentInstanceKey: jobProductionComponentsTable.componentInstanceKey,
      componentLabel: jobProductionComponentsTable.componentLabel,
      variant: jobProductionComponentsTable.variant,
      snapshotVersion: jobProductionComponentsTable.snapshotVersion,
      status: jobProductionComponentsTable.status,
      expectedDurationDays: jobProductionComponentsTable.expectedDurationDays,
      knowledgeContext: jobProductionComponentsTable.knowledgeContext,
    }).from(jobProductionComponentsTable)
      .where(inArray(jobProductionComponentsTable.jobId, jobIds))
      .orderBy(asc(jobProductionComponentsTable.jobId), asc(jobProductionComponentsTable.id))
    : [];
  const componentIds = componentRows.map((component) => component.id);
  const workSessionRows = componentIds.length > 0
    ? await database.select({
      id: jobComponentWorkSessionsTable.id,
      jobId: jobComponentWorkSessionsTable.jobId,
      productionComponentId: jobComponentWorkSessionsTable.productionComponentId,
      workDate: jobComponentWorkSessionsTable.workDate,
    }).from(jobComponentWorkSessionsTable)
      .where(inArray(jobComponentWorkSessionsTable.productionComponentId, componentIds))
      .orderBy(asc(jobComponentWorkSessionsTable.productionComponentId), asc(jobComponentWorkSessionsTable.workDate), asc(jobComponentWorkSessionsTable.id))
    : [];
  const componentsByJob = new Map<number, typeof componentRows>();
  for (const row of componentRows) {
    const rows = componentsByJob.get(row.jobId) ?? [];
    rows.push(row);
    componentsByJob.set(row.jobId, rows);
  }
  const sessionsByJob = new Map<number, typeof workSessionRows>();
  for (const row of workSessionRows) {
    const rows = sessionsByJob.get(row.jobId) ?? [];
    rows.push(row);
    sessionsByJob.set(row.jobId, rows);
  }

  const summary = buildProductionObservationResponse(
      model.id,
      candidateJobs.map((job) => ({
        id: job.id,
        title: job.title,
        status: job.status,
        workflow: job.workflow,
        serviceScopes: Array.from(new Map(
          (Array.isArray(job.mhProductionServices) ? job.mhProductionServices : [])
             .map((serviceId) => {
               const service = serviceById.get(serviceId);
               if (!service || service.appliesTo !== "production") return null;
               const customProfile = service.itemKey === "custom"
                 ? profileByBusinessService.get(`${scope?.id ?? job.businessId}:${service.id}`) ?? null
                 : null;
               if (service.itemKey === "custom" && !isEligibleForProductionLearning({
                 workType: "production",
                 componentKey: "custom",
                 hasNamedCustomProfile: customProfile != null,
               })) return null;
               const entry = customProfile
                 ? { id: service.id, name: service.name, customProfile }
                 : { id: service.id, name: service.name };
               return [service.id, entry] as const;
             })
             .filter((entry): entry is readonly [number, { id: number; name: string; customProfile?: { id: number; key: string; name: string } }] => entry != null),
        ).values()),
          presence: (presenceByJob.get(job.id) ?? []).map((row) => ({
            ...(row.id == null ? {} : { id: row.id }),
            date: row.date,
            state: row.state as ObservationPresenceState,
            provenance: row.provenance,
            notHereReason: row.notHereReason,
            notes: row.notes,
            ...(row.updatedAt == null
              ? {}
              : {
                  updatedAt: row.updatedAt instanceof Date
                    ? row.updatedAt.toISOString()
                    : String(row.updatedAt),
                }),
          })),
         components: (componentsByJob.get(job.id) ?? []).map((component) => ({
           id: component.id,
           jobId: component.jobId,
           componentKey: component.componentKey,
           componentInstanceKey: component.componentInstanceKey,
           componentLabel: component.componentLabel,
           variant: component.variant,
           snapshotVersion: component.snapshotVersion,
           status: component.status,
           expectedDurationDays: component.expectedDurationDays,
           knowledgeContext: component.knowledgeContext,
         })),
         workSessions: (sessionsByJob.get(job.id) ?? []).map((session) => ({
           id: session.id,
           jobId: session.jobId,
           productionComponentId: session.productionComponentId,
           workDate: session.workDate,
         })),
      })),
      {
        id: model.benchmarkId ?? null,
        jobType: model.benchmarkJobType ?? null,
        estimatedHours: model.benchmarkHours == null ? null : parseFloat(model.benchmarkHours),
      },
    );

  return { model, summary };
}

function revisionResponse(revision: typeof jobTypeBenchmarkRevisionsTable.$inferSelect) {
  return {
    id: revision.id,
    benchmarkId: revision.benchmarkId,
    mfhModelId: revision.mfhModelId,
    priorBenchmarkHours: revision.priorBenchmarkHours == null ? null : parseFloat(revision.priorBenchmarkHours),
    proposedBenchmarkHours: parseFloat(revision.proposedBenchmarkHours),
    observedProductionDaysMedian: parseFloat(revision.observedProductionDaysMedian),
    observedProductionDaysRange: {
      min: parseFloat(revision.observedProductionDaysMin),
      max: parseFloat(revision.observedProductionDaysMax),
    },
    sampleSize: revision.sampleSize,
    sourceJobIds: revision.sourceJobIds,
    status: revision.status as "pending" | "approved" | "rejected",
    reviewerNote: revision.reviewerNote,
    createdByUserId: revision.createdByUserId,
    createdByName: revision.createdByName,
    createdAt: revision.createdAt,
    reviewedByUserId: revision.reviewedByUserId,
    reviewedByName: revision.reviewedByName,
    reviewedAt: revision.reviewedAt,
  };
}

function reviewerIdentity(req: Parameters<typeof getRequestUser>[0]) {
  const user = getRequestUser(req);
  return {
    userId: user?.id ?? null,
    name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || null,
  };
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function sameHours(a: string | number | null, b: string | number | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Number(a) === Number(b);
}

function normalizeCustomProfileKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

// Custom production services are learning-eligible only after an owner assigns
// them to an explicit named profile. Profiles are business-scoped because a
// free-text custom service name must never become a global learning category.
mfhLibraryRouter.get("/custom-production-profiles", async (req, res) => {
  try {
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    if (!scope) return res.status(400).json({ error: "businessId or businessLine is required" });

    const rows = await db.select({
      id: mfhCustomProductionProfilesTable.id,
      businessId: mfhCustomProductionProfilesTable.businessId,
      profileKey: mfhCustomProductionProfilesTable.profileKey,
      name: mfhCustomProductionProfilesTable.name,
      active: mfhCustomProductionProfilesTable.active,
      serviceTypeId: mfhCustomProductionProfileServicesTable.serviceTypeId,
      serviceName: productionServiceTypesTable.name,
    }).from(mfhCustomProductionProfilesTable)
      .leftJoin(
        mfhCustomProductionProfileServicesTable,
        eq(mfhCustomProductionProfileServicesTable.profileId, mfhCustomProductionProfilesTable.id),
      )
      .leftJoin(
        productionServiceTypesTable,
        eq(productionServiceTypesTable.id, mfhCustomProductionProfileServicesTable.serviceTypeId),
      )
      .where(eq(mfhCustomProductionProfilesTable.businessId, scope.id))
      .orderBy(asc(mfhCustomProductionProfilesTable.name));

    const profiles = new Map<number, {
      id: number;
      businessId: number;
      profileKey: string;
      name: string;
      active: boolean;
      services: { id: number; name: string }[];
    }>();
    for (const row of rows) {
      const profile = profiles.get(row.id) ?? {
        id: row.id,
        businessId: row.businessId,
        profileKey: row.profileKey,
        name: row.name,
        active: row.active,
        services: [],
      };
      if (row.serviceTypeId != null && row.serviceName != null) {
        profile.services.push({ id: row.serviceTypeId, name: row.serviceName });
      }
      profiles.set(row.id, profile);
    }
    res.json(Array.from(profiles.values()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load custom production profiles" });
  }
});

mfhLibraryRouter.post("/custom-production-profiles", async (req, res) => {
  try {
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const profileKey = normalizeCustomProfileKey(req.body?.profileKey || name);
    const serviceTypeIds: number[] = Array.from(new Set<number>(
      Array.isArray(req.body?.serviceTypeIds)
        ? req.body.serviceTypeIds.map((value: unknown) => Number(value)).filter((id: number): id is number => Number.isInteger(id) && id > 0)
        : [],
    ));
    if (!name || !profileKey) return res.status(400).json({ error: "name is required" });
    if (serviceTypeIds.length === 0) {
      return res.status(400).json({ error: "At least one custom production service is required" });
    }

    const serviceRows = await db.select({
      id: productionServiceTypesTable.id,
      name: productionServiceTypesTable.name,
      businessId: productionServiceTypesTable.businessId,
      itemKey: productionServiceTypesTable.itemKey,
      appliesTo: productionServiceTypesTable.appliesTo,
    }).from(productionServiceTypesTable).where(and(
      inArray(productionServiceTypesTable.id, serviceTypeIds),
      eq(productionServiceTypesTable.itemKey, "custom"),
      eq(productionServiceTypesTable.appliesTo, "production"),
      or(isNull(productionServiceTypesTable.businessId), eq(productionServiceTypesTable.businessId, ownership.business.id)),
    ));
    if (serviceRows.length !== serviceTypeIds.length) {
      return res.status(400).json({ error: "Every service must be a production custom service in the selected business" });
    }

    const created = await db.transaction(async (tx) => {
      const [profile] = await tx.insert(mfhCustomProductionProfilesTable).values({
        businessId: ownership.business.id,
        profileKey,
        name,
      }).returning();
      if (!profile) throw new Error("Failed to create custom production profile");
      await tx.insert(mfhCustomProductionProfileServicesTable).values(serviceTypeIds.map((serviceTypeId) => ({
        businessId: ownership.business.id,
        profileId: profile.id,
        serviceTypeId,
      })));
      return profile;
    });

    res.status(201).json({
      id: created.id,
      businessId: created.businessId,
      profileKey: created.profileKey,
      name: created.name,
      active: created.active,
      services: serviceRows.map((service) => ({ id: service.id, name: service.name })),
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return res.status(409).json({ error: "A custom production profile with that name or key already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to create custom production profile" });
  }
});

// GET /api/mfh/knowledge-base/:modelId/production-observations — read-only,
// business-scoped learning from confirmed daily presence.
mfhLibraryRouter.get("/knowledge-base/:modelId/production-observations", async (req, res) => {
  try {
    const modelId = parseInt(req.params.modelId);
    if (isNaN(modelId)) return res.status(400).json({ error: "Invalid modelId" });

    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    const result = await loadProductionObservation(modelId, scope);
    if (!result) return res.status(404).json({ error: "Model not found" });
    res.json(result.summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load production observations" });
  }
});

function componentBaselineRevisionResponse(
  revision: typeof mfhComponentBaselineRevisionsTable.$inferSelect,
) {
  return {
    id: revision.id,
    businessId: revision.businessId,
    mfhModelId: revision.mfhModelId,
    learningKey: revision.learningKey,
    componentKey: revision.componentKey,
    componentLabel: revision.componentLabel,
    variant: revision.variant,
    customProfile: revision.customProfile,
    priorApprovedRevisionId: revision.priorApprovedRevisionId,
    priorApprovedProductionDays: revision.priorApprovedProductionDays == null
      ? null
      : parseFloat(revision.priorApprovedProductionDays),
    proposedProductionDays: parseFloat(revision.proposedProductionDays),
    observedActualProductionDaysMedian: parseFloat(revision.observedActualProductionDaysMedian),
    observedActualProductionDaysRange: {
      min: parseFloat(revision.observedActualProductionDaysMin),
      max: parseFloat(revision.observedActualProductionDaysMax),
    },
    observedExpectedProductionDaysMedian: parseFloat(revision.observedExpectedProductionDaysMedian),
    observedExpectedProductionDaysRange: {
      min: parseFloat(revision.observedExpectedProductionDaysMin),
      max: parseFloat(revision.observedExpectedProductionDaysMax),
    },
    sampleSize: revision.sampleSize,
    sourceJobIds: revision.sourceJobIds,
    sourceEvidence: revision.sourceEvidence,
    sourceEvidenceHash: revision.sourceEvidenceHash,
    status: revision.status as "pending" | "approved" | "rejected" | "superseded",
    reviewerNote: revision.reviewerNote,
    createdByUserId: revision.createdByUserId,
    createdByName: revision.createdByName,
    createdAt: revision.createdAt,
    reviewedByUserId: revision.reviewedByUserId,
    reviewedByName: revision.reviewedByName,
    reviewedAt: revision.reviewedAt,
    supersededByUserId: revision.supersededByUserId,
    supersededByName: revision.supersededByName,
    supersededAt: revision.supersededAt,
  };
}

async function requiredComponentBaselineBusiness(req: Parameters<typeof requestedBusiness>[0]) {
  const scope = await requestedBusiness(req);
  return scope;
}

// Component baselines are deliberately separate from model-level benchmark
// reviews. They are business-scoped review history and never mutate pricing,
// payroll, scheduling, or the shared job-type benchmark.
mfhLibraryRouter.get("/knowledge-base/:modelId/component-baseline-reviews", async (req, res) => {
  try {
    const modelId = parseInt(req.params.modelId);
    if (isNaN(modelId)) return res.status(400).json({ error: "Invalid modelId" });
    const scope = await requiredComponentBaselineBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    if (!scope) return res.status(400).json({ error: "businessId or businessLine is required" });

    const revisions = await db.select().from(mfhComponentBaselineRevisionsTable)
      .where(and(
        eq(mfhComponentBaselineRevisionsTable.businessId, scope.id),
        eq(mfhComponentBaselineRevisionsTable.mfhModelId, modelId),
      ))
      .orderBy(desc(mfhComponentBaselineRevisionsTable.createdAt));
    res.json(revisions.map(componentBaselineRevisionResponse));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load component baseline reviews" });
  }
});

mfhLibraryRouter.post("/knowledge-base/:modelId/component-baseline-reviews", async (req, res) => {
  try {
    const modelId = parseInt(req.params.modelId);
    if (isNaN(modelId)) return res.status(400).json({ error: "Invalid modelId" });
    const scope = await requiredComponentBaselineBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    if (!scope) return res.status(400).json({ error: "businessId or businessLine is required" });

    const learningKey = typeof req.body?.learningKey === "string"
      ? req.body.learningKey.trim()
      : "";
    if (!learningKey) return res.status(400).json({ error: "learningKey is required" });

    const result = await loadProductionObservation(modelId, scope);
    if (!result) return res.status(404).json({ error: "Model not found" });
    const evidence = buildComponentBaselineEvidence(result.summary, scope.id, learningKey);
    if (!evidence) {
      return res.status(400).json({
        error: `At least ${COMPONENT_BASELINE_MINIMUM_SAMPLE_SIZE} eligible jobs with immutable component evidence are required before creating a baseline review`,
      });
    }
    const proposedDays = numericValue(req.body?.proposedProductionDays)
      ?? evidence.component.actualWorkDaysMedian;
    if (proposedDays == null || proposedDays <= 0) {
      return res.status(400).json({ error: "proposedProductionDays must be a positive number" });
    }
    if (
      evidence.component.actualWorkDaysRange == null
      || evidence.component.expectedProductionDaysMedian == null
      || evidence.component.expectedProductionDaysRange == null
    ) {
      return res.status(400).json({ error: "Component observation is missing derived production-day evidence" });
    }

    const [active] = await db.select({
      id: mfhComponentBaselineRevisionsTable.id,
      proposedProductionDays: mfhComponentBaselineRevisionsTable.proposedProductionDays,
    }).from(mfhComponentBaselineRevisionsTable).where(and(
      eq(mfhComponentBaselineRevisionsTable.businessId, scope.id),
      eq(mfhComponentBaselineRevisionsTable.mfhModelId, modelId),
      eq(mfhComponentBaselineRevisionsTable.learningKey, learningKey),
      eq(mfhComponentBaselineRevisionsTable.status, "approved"),
    )).limit(1);
    const identity = reviewerIdentity(req);
    try {
      const [revision] = await db.insert(mfhComponentBaselineRevisionsTable).values({
        businessId: scope.id,
        mfhModelId: modelId,
        learningKey: evidence.component.learningKey,
        componentKey: evidence.component.componentKey,
        componentLabel: evidence.component.componentLabel,
        variant: evidence.component.variant,
        customProfile: evidence.component.customProfile,
        priorApprovedRevisionId: active?.id ?? null,
        priorApprovedProductionDays: active?.proposedProductionDays ?? null,
        proposedProductionDays: proposedDays.toFixed(2),
        observedActualProductionDaysMedian: evidence.component.actualWorkDaysMedian!.toFixed(2),
        observedActualProductionDaysMin: evidence.component.actualWorkDaysRange.min.toFixed(2),
        observedActualProductionDaysMax: evidence.component.actualWorkDaysRange.max.toFixed(2),
        observedExpectedProductionDaysMedian: evidence.component.expectedProductionDaysMedian.toFixed(2),
        observedExpectedProductionDaysMin: evidence.component.expectedProductionDaysRange.min.toFixed(2),
        observedExpectedProductionDaysMax: evidence.component.expectedProductionDaysRange.max.toFixed(2),
        sampleSize: evidence.sourceJobIds.length,
        sourceJobIds: evidence.sourceJobIds,
        sourceEvidence: evidence.evidence,
        sourceEvidenceHash: evidence.sourceEvidenceHash,
        reviewerNote: typeof req.body?.reviewerNote === "string"
          ? req.body.reviewerNote.trim().slice(0, 2000) || null
          : null,
        createdByUserId: identity.userId,
        createdByName: identity.name,
      }).returning();
      res.status(201).json(componentBaselineRevisionResponse(revision));
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === "23505") {
        return res.status(409).json({ error: "A pending component baseline review already exists for this learning key" });
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create component baseline review" });
  }
});

mfhLibraryRouter.patch("/knowledge-base/:modelId/component-baseline-reviews/:revisionId/approve", async (req, res) => {
  try {
    const modelId = parseInt(req.params.modelId);
    const revisionId = parseInt(req.params.revisionId);
    if (isNaN(modelId) || isNaN(revisionId)) return res.status(400).json({ error: "Invalid review identifiers" });
    const scope = await requiredComponentBaselineBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    if (!scope) return res.status(400).json({ error: "businessId or businessLine is required" });
    const identity = reviewerIdentity(req);

    const result = await db.transaction(async (tx) => {
      const [unlockedRevision] = await tx.select({
        id: mfhComponentBaselineRevisionsTable.id,
        learningKey: mfhComponentBaselineRevisionsTable.learningKey,
      }).from(mfhComponentBaselineRevisionsTable)
        .where(and(
          eq(mfhComponentBaselineRevisionsTable.id, revisionId),
          eq(mfhComponentBaselineRevisionsTable.businessId, scope.id),
          eq(mfhComponentBaselineRevisionsTable.mfhModelId, modelId),
        ))
        .limit(1);
      if (!unlockedRevision) return { kind: "not_found" as const };
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`mfh-component-baseline:${scope.id}:${modelId}:${unlockedRevision.learningKey}`}))`);
      const [revision] = await tx.select().from(mfhComponentBaselineRevisionsTable)
        .where(and(
          eq(mfhComponentBaselineRevisionsTable.id, revisionId),
          eq(mfhComponentBaselineRevisionsTable.businessId, scope.id),
          eq(mfhComponentBaselineRevisionsTable.mfhModelId, modelId),
        ))
        .limit(1);
      if (!revision) return { kind: "not_found" as const };
      if (revision.status !== "pending") return { kind: "not_pending" as const, revision };

      const current = await loadProductionObservation(modelId, scope, tx);
      if (!current) return { kind: "model_missing" as const };
      const evidence = buildComponentBaselineEvidence(current.summary, scope.id, revision.learningKey);
      if (!evidence) return { kind: "insufficient" as const, revision };
      if (evidence.sourceEvidenceHash !== revision.sourceEvidenceHash) {
        return { kind: "stale_evidence" as const, revision };
      }
      const [active] = await tx.select({
        id: mfhComponentBaselineRevisionsTable.id,
        proposedProductionDays: mfhComponentBaselineRevisionsTable.proposedProductionDays,
      }).from(mfhComponentBaselineRevisionsTable).where(and(
        eq(mfhComponentBaselineRevisionsTable.businessId, scope.id),
        eq(mfhComponentBaselineRevisionsTable.mfhModelId, modelId),
        eq(mfhComponentBaselineRevisionsTable.learningKey, revision.learningKey),
        eq(mfhComponentBaselineRevisionsTable.status, "approved"),
      )).limit(1);
      if (
        (active?.id ?? null) !== (revision.priorApprovedRevisionId ?? null)
        || !sameHours(active?.proposedProductionDays ?? null, revision.priorApprovedProductionDays)
      ) {
        return { kind: "stale_baseline" as const, revision };
      }

      if (active) {
        await tx.update(mfhComponentBaselineRevisionsTable)
          .set({
            status: "superseded",
            supersededByUserId: identity.userId,
            supersededByName: identity.name,
            supersededAt: new Date(),
          })
          .where(eq(mfhComponentBaselineRevisionsTable.id, active.id));
      }
      const [updated] = await tx.update(mfhComponentBaselineRevisionsTable)
        .set({
          status: "approved",
          reviewedByUserId: identity.userId,
          reviewedByName: identity.name,
          reviewedAt: new Date(),
        })
        .where(and(
          eq(mfhComponentBaselineRevisionsTable.id, revision.id),
          eq(mfhComponentBaselineRevisionsTable.status, "pending"),
        ))
        .returning();
      return {
        kind: "approved" as const,
        revision: updated ?? {
          ...revision,
          status: "approved",
          reviewedByUserId: identity.userId,
          reviewedByName: identity.name,
          reviewedAt: new Date(),
        },
      };
    });

    if (result.kind === "not_found") return res.status(404).json({ error: "Review not found" });
    if (result.kind === "not_pending") {
      return res.status(409).json({
        error: "Review is no longer pending",
        review: componentBaselineRevisionResponse(result.revision),
      });
    }
    if (result.kind === "model_missing") return res.status(404).json({ error: "Model not found" });
    if (result.kind === "insufficient") {
      return res.status(409).json({ error: "The component no longer has five eligible jobs with immutable evidence" });
    }
    if (result.kind === "stale_evidence") {
      return res.status(409).json({ error: "Component source evidence changed after this review was created" });
    }
    if (result.kind === "stale_baseline") {
      return res.status(409).json({ error: "The active component baseline changed after this review was created" });
    }
    return res.json(componentBaselineRevisionResponse(result.revision));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to approve component baseline review" });
  }
});

mfhLibraryRouter.patch("/knowledge-base/:modelId/component-baseline-reviews/:revisionId/reject", async (req, res) => {
  try {
    const modelId = parseInt(req.params.modelId);
    const revisionId = parseInt(req.params.revisionId);
    if (isNaN(modelId) || isNaN(revisionId)) return res.status(400).json({ error: "Invalid review identifiers" });
    const scope = await requiredComponentBaselineBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    if (!scope) return res.status(400).json({ error: "businessId or businessLine is required" });
    const identity = reviewerIdentity(req);
    const note = typeof req.body?.reviewerNote === "string"
      ? req.body.reviewerNote.trim().slice(0, 2000) || null
      : null;

    const [revision] = await db.select().from(mfhComponentBaselineRevisionsTable)
      .where(and(
        eq(mfhComponentBaselineRevisionsTable.id, revisionId),
        eq(mfhComponentBaselineRevisionsTable.businessId, scope.id),
        eq(mfhComponentBaselineRevisionsTable.mfhModelId, modelId),
      ))
      .limit(1);
    if (!revision) return res.status(404).json({ error: "Review not found" });
    if (revision.status !== "pending") {
      return res.status(409).json({
        error: "Review is no longer pending",
        review: componentBaselineRevisionResponse(revision),
      });
    }
    const [updated] = await db.update(mfhComponentBaselineRevisionsTable)
      .set({
        status: "rejected",
        reviewerNote: note ?? revision.reviewerNote,
        reviewedByUserId: identity.userId,
        reviewedByName: identity.name,
        reviewedAt: new Date(),
      })
      .where(and(
        eq(mfhComponentBaselineRevisionsTable.id, revisionId),
        eq(mfhComponentBaselineRevisionsTable.status, "pending"),
      ))
      .returning();
    if (!updated) return res.status(409).json({ error: "Review is no longer pending" });
    res.json(componentBaselineRevisionResponse(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reject component baseline review" });
  }
});

// Review history is global because job type benchmarks are global. Keep this
// route in the all-business view so a business-scoped sample cannot be
// mistaken for evidence that is safe to apply to the shared benchmark.
mfhLibraryRouter.get("/knowledge-base/:modelId/production-reviews", async (req, res) => {
  try {
    const modelId = parseInt(req.params.modelId);
    if (isNaN(modelId)) return res.status(400).json({ error: "Invalid modelId" });
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope)) return;
    if (scope) return res.status(403).json({ error: "Benchmark reviews require the all-business view" });

    const revisions = await db.select().from(jobTypeBenchmarkRevisionsTable)
      .where(eq(jobTypeBenchmarkRevisionsTable.mfhModelId, modelId))
      .orderBy(desc(jobTypeBenchmarkRevisionsTable.createdAt));
    res.json(revisions.map(revisionResponse));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load benchmark reviews" });
  }
});

mfhLibraryRouter.post("/knowledge-base/:modelId/production-reviews", async (req, res) => {
  try {
    const modelId = parseInt(req.params.modelId);
    if (isNaN(modelId)) return res.status(400).json({ error: "Invalid modelId" });
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope)) return;
    if (scope) return res.status(403).json({ error: "Benchmark reviews require the all-business view" });

    const proposedHours = numericValue(req.body?.proposedBenchmarkHours);
    if (proposedHours == null || proposedHours <= 0) {
      return res.status(400).json({ error: "proposedBenchmarkHours must be a positive number" });
    }
    const reviewerNote = typeof req.body?.reviewerNote === "string"
      ? req.body.reviewerNote.trim().slice(0, 2000) || null
      : null;
    const result = await loadProductionObservation(modelId, null);
    if (!result) return res.status(404).json({ error: "Model not found" });
    const { model, summary } = result;
    if (model.benchmarkId == null) return res.status(400).json({ error: "This model has no linked benchmark" });
    if (!summary.sample.sufficient || summary.observed.productionDaysMedian == null || !summary.observed.productionDaysRange) {
      return res.status(400).json({ error: "At least three eligible production jobs are required before creating a review" });
    }

    const sourceJobIds = summary.jobs.filter(job => job.exclusionReason == null).map(job => job.id);
    const identity = reviewerIdentity(req);
    try {
      const [revision] = await db.insert(jobTypeBenchmarkRevisionsTable).values({
        benchmarkId: model.benchmarkId,
        mfhModelId: modelId,
        priorBenchmarkHours: model.benchmarkHours,
        proposedBenchmarkHours: proposedHours.toFixed(2),
        observedProductionDaysMedian: summary.observed.productionDaysMedian.toFixed(2),
        observedProductionDaysMin: summary.observed.productionDaysRange.min.toFixed(2),
        observedProductionDaysMax: summary.observed.productionDaysRange.max.toFixed(2),
        sampleSize: summary.sample.eligibleJobCount,
        sourceJobIds,
        reviewerNote,
        createdByUserId: identity.userId,
        createdByName: identity.name,
      }).returning();
      res.status(201).json(revisionResponse(revision));
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === "23505") {
        return res.status(409).json({ error: "A pending review already exists for this model benchmark" });
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create benchmark review" });
  }
});

mfhLibraryRouter.patch("/knowledge-base/:modelId/production-reviews/:revisionId/approve", async (req, res) => {
  try {
    const modelId = parseInt(req.params.modelId);
    const revisionId = parseInt(req.params.revisionId);
    if (isNaN(modelId) || isNaN(revisionId)) return res.status(400).json({ error: "Invalid review identifiers" });
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope)) return;
    if (scope) return res.status(403).json({ error: "Benchmark reviews require the all-business view" });
    const identity = reviewerIdentity(req);

    const result = await db.transaction(async (tx) => {
      const [revision] = await tx.select().from(jobTypeBenchmarkRevisionsTable)
        .where(and(eq(jobTypeBenchmarkRevisionsTable.id, revisionId), eq(jobTypeBenchmarkRevisionsTable.mfhModelId, modelId)))
        .limit(1);
      if (!revision) return { kind: "not_found" as const };
      if (revision.status !== "pending") return { kind: "not_pending" as const, revision };

      const [benchmark] = await tx.select().from(jobTypeBenchmarksTable)
        .where(eq(jobTypeBenchmarksTable.id, revision.benchmarkId)).limit(1);
      if (!benchmark) return { kind: "benchmark_missing" as const };
      if (!sameHours(benchmark.estimatedHours, revision.priorBenchmarkHours)) {
        return { kind: "stale" as const, revision, currentHours: benchmark.estimatedHours };
      }

      const [updatedBenchmark] = await tx.update(jobTypeBenchmarksTable)
        .set({ estimatedHours: revision.proposedBenchmarkHours })
        .where(eq(jobTypeBenchmarksTable.id, revision.benchmarkId))
        .returning();
      const [updatedRevision] = await tx.update(jobTypeBenchmarkRevisionsTable)
        .set({
          status: "approved",
          reviewedByUserId: identity.userId,
          reviewedByName: identity.name,
          reviewedAt: new Date(),
        })
        .where(eq(jobTypeBenchmarkRevisionsTable.id, revision.id))
        .returning();
      return { kind: "approved" as const, benchmark: updatedBenchmark, revision: updatedRevision };
    });

    if (result.kind === "not_found") return res.status(404).json({ error: "Review not found" });
    if (result.kind === "not_pending") return res.status(409).json({ error: "Review is no longer pending", review: revisionResponse(result.revision) });
    if (result.kind === "benchmark_missing") return res.status(409).json({ error: "Linked benchmark no longer exists" });
    if (result.kind === "stale") return res.status(409).json({ error: "Benchmark changed after this review was created", currentBenchmarkHours: result.currentHours == null ? null : parseFloat(result.currentHours) });
    return res.json(revisionResponse(result.revision));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to approve benchmark review" });
  }
});

mfhLibraryRouter.patch("/knowledge-base/:modelId/production-reviews/:revisionId/reject", async (req, res) => {
  try {
    const modelId = parseInt(req.params.modelId);
    const revisionId = parseInt(req.params.revisionId);
    if (isNaN(modelId) || isNaN(revisionId)) return res.status(400).json({ error: "Invalid review identifiers" });
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope)) return;
    if (scope) return res.status(403).json({ error: "Benchmark reviews require the all-business view" });
    const identity = reviewerIdentity(req);
    const note = typeof req.body?.reviewerNote === "string" ? req.body.reviewerNote.trim().slice(0, 2000) || null : null;

    const result = await db.transaction(async (tx) => {
      const [revision] = await tx.select().from(jobTypeBenchmarkRevisionsTable)
        .where(and(eq(jobTypeBenchmarkRevisionsTable.id, revisionId), eq(jobTypeBenchmarkRevisionsTable.mfhModelId, modelId)))
        .limit(1);
      if (!revision) return { kind: "not_found" as const };
      if (revision.status !== "pending") return { kind: "not_pending" as const, revision };
      const [updated] = await tx.update(jobTypeBenchmarkRevisionsTable)
        .set({
          status: "rejected",
          reviewerNote: note ?? revision.reviewerNote,
          reviewedByUserId: identity.userId,
          reviewedByName: identity.name,
          reviewedAt: new Date(),
        })
        .where(eq(jobTypeBenchmarkRevisionsTable.id, revision.id))
        .returning();
      return { kind: "rejected" as const, revision: updated };
    });
    if (result.kind === "not_found") return res.status(404).json({ error: "Review not found" });
    if (result.kind === "not_pending") return res.status(409).json({ error: "Review is no longer pending", review: revisionResponse(result.revision) });
    return res.json(revisionResponse(result.revision));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reject benchmark review" });
  }
});

// GET /api/mfh/knowledge-base/:modelId — model detail with stats + related completed jobs
mfhLibraryRouter.get("/knowledge-base/:modelId", async (req, res) => {
  try {
    const modelId = parseInt(req.params.modelId);
    if (isNaN(modelId)) return res.status(400).json({ error: "Invalid modelId" });

    const [model] = await db.select({
      id: mfhModelsTable.id,
      manufacturerId: mfhModelsTable.manufacturerId,
      manufacturerName: mfhManufacturersTable.name,
      name: mfhModelsTable.name,
      constructionTypeId: mfhModelsTable.constructionTypeId,
      constructionTypeName: mfhConstructionTypesTable.name,
      basePrice: mfhModelsTable.basePrice,
      notes: mfhModelsTable.notes,
      active: mfhModelsTable.active,
      introducedYear: mfhModelsTable.introducedYear,
      discontinuedYear: mfhModelsTable.discontinuedYear,
    }).from(mfhModelsTable)
      .leftJoin(mfhManufacturersTable, eq(mfhModelsTable.manufacturerId, mfhManufacturersTable.id))
      .leftJoin(mfhConstructionTypesTable, eq(mfhModelsTable.constructionTypeId, mfhConstructionTypesTable.id))
      .where(eq(mfhModelsTable.id, modelId));

    if (!model) return res.status(404).json({ error: "Model not found" });

    // All aggregate stats sourced exclusively from accepted KB records

    // Related completed jobs
    const jobs = await db.select({
      id: jobsTable.id,
      title: jobsTable.title,
      status: jobsTable.status,
      clientId: jobsTable.clientId,
      clientName: clientsTable.name,
      mfhModelYear: jobsTable.mfhModelYear,
      mfhQuotedPrice: jobsTable.mfhQuotedPrice,
      mfhDealerPrice: jobsTable.mfhDealerPrice,
      mfhGuideName: jobsTable.mfhGuideName,
      closedAt: jobsTable.closedAt,
      startDate: jobsTable.startDate,
      address: jobsTable.address,
      city: jobsTable.city,
    }).from(jobsTable)
      .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
      .where(and(
        eq(jobsTable.mfhModelId, modelId),
        sql`${jobsTable.status} IN ('completed', 'invoiced')`,
      ))
      .orderBy(sql`${jobsTable.closedAt} DESC NULLS LAST, ${jobsTable.id} DESC`)
      .limit(50);

    // Client pricing overrides
    const clientPricing = await db.select({
      id: mfhClientPricingTable.id,
      clientId: mfhClientPricingTable.clientId,
      clientName: clientsTable.name,
      price: mfhClientPricingTable.price,
      notes: mfhClientPricingTable.notes,
    }).from(mfhClientPricingTable)
      .leftJoin(clientsTable, eq(mfhClientPricingTable.clientId, clientsTable.id))
      .where(eq(mfhClientPricingTable.modelId, modelId))
      .orderBy(asc(clientsTable.name));

    // Knowledge records (learning history) — accepted and excluded
    const [kbStats, knowledgeRecords] = await Promise.all([
      db.select({
        avgProductiveHours: sql<string>`AVG(${jobKnowledgeRecordsTable.productiveHours}::numeric)`,
        avgTravelHours: sql<string>`AVG(${jobKnowledgeRecordsTable.travelHours}::numeric)`,
        avgCrewSize: sql<string>`AVG(${jobKnowledgeRecordsTable.crewSize}::numeric)`,
        avgDaysOnSite: sql<string>`AVG(${jobKnowledgeRecordsTable.daysOnSite}::numeric)`,
        avgInvoiceAmount: sql<string>`AVG(${jobKnowledgeRecordsTable.invoiceAmount}::numeric)`,
        avgMaterialCost: sql<string>`AVG(${jobKnowledgeRecordsTable.materialCost}::numeric)`,
        avgConsumablesCost: sql<string>`AVG(${jobKnowledgeRecordsTable.consumablesCost}::numeric)`,
        avgGrossProfit: sql<string>`AVG(${jobKnowledgeRecordsTable.grossProfit}::numeric)`,
        avgNetProfit: sql<string>`AVG(${jobKnowledgeRecordsTable.netProfit}::numeric)`,
        acceptedCount: sql<number>`COUNT(*)`,
        avgQuotedPrice: sql<string>`AVG(${jobsTable.mfhQuotedPrice}::numeric)`,
        avgDealerPrice: sql<string>`AVG(${jobsTable.mfhDealerPrice}::numeric)`,
      }).from(jobKnowledgeRecordsTable)
        .innerJoin(jobsTable, eq(jobKnowledgeRecordsTable.jobId, jobsTable.id))
        .where(and(eq(jobKnowledgeRecordsTable.mfhModelId, modelId), sql`${jobKnowledgeRecordsTable.status} = 'accepted'`)),
      db.select({
        id: jobKnowledgeRecordsTable.id,
        jobId: jobKnowledgeRecordsTable.jobId,
        jobTitle: jobsTable.title,
        status: jobKnowledgeRecordsTable.status,
        taughtAt: jobKnowledgeRecordsTable.taughtAt,
        productiveHours: jobKnowledgeRecordsTable.productiveHours,
        travelHours: jobKnowledgeRecordsTable.travelHours,
        crewSize: jobKnowledgeRecordsTable.crewSize,
        daysOnSite: jobKnowledgeRecordsTable.daysOnSite,
        invoiceAmount: jobKnowledgeRecordsTable.invoiceAmount,
        materialCost: jobKnowledgeRecordsTable.materialCost,
        consumablesCost: jobKnowledgeRecordsTable.consumablesCost,
        grossProfit: jobKnowledgeRecordsTable.grossProfit,
        netProfit: jobKnowledgeRecordsTable.netProfit,
        callbacks: jobKnowledgeRecordsTable.callbacks,
        warrantyVisit: jobKnowledgeRecordsTable.warrantyVisit,
        editReason: jobKnowledgeRecordsTable.editReason,
        editedAt: jobKnowledgeRecordsTable.editedAt,
        productionServices: jobsTable.mhProductionServices,
      }).from(jobKnowledgeRecordsTable)
        .innerJoin(jobsTable, eq(jobKnowledgeRecordsTable.jobId, jobsTable.id))
        .where(and(
          eq(jobKnowledgeRecordsTable.mfhModelId, modelId),
          sql`${jobKnowledgeRecordsTable.status} IN ('accepted','excluded')`,
        ))
        .orderBy(desc(jobKnowledgeRecordsTable.taughtAt)),
    ]);

    const kb = kbStats[0];
    const p = (v: string | null | undefined) => v ? parseFloat(v) : null;

    res.json({
      model: {
        ...model,
        jobCount: Number(kb?.acceptedCount ?? 0),
        avgQuotedPrice: p(kb?.avgQuotedPrice),
        avgDealerPrice: p(kb?.avgDealerPrice),
        avgHours: p(kb?.avgProductiveHours),
        avgProductiveHours: p(kb?.avgProductiveHours),
        avgTravelHours: p(kb?.avgTravelHours),
        avgCrewSize: p(kb?.avgCrewSize),
        avgDaysOnSite: p(kb?.avgDaysOnSite),
        avgInvoice: p(kb?.avgInvoiceAmount),
        avgMaterialCost: p(kb?.avgMaterialCost),
        avgConsumablesCost: p(kb?.avgConsumablesCost),
        avgGrossProfit: p(kb?.avgGrossProfit),
        avgNetProfit: p(kb?.avgNetProfit),
        acceptedCount: Number(kb?.acceptedCount ?? 0),
      },
      jobs,
      clientPricing,
      knowledgeRecords,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// ── Client Pricing ─────────────────────────────────────────────────────────────

// GET /api/mfh/client-pricing?modelId=X
mfhLibraryRouter.get("/client-pricing", async (req, res) => {
  try {
    const { modelId } = req.query;
    if (!modelId) return res.status(400).json({ error: "modelId required" });
    const rows = await db.select({
      id: mfhClientPricingTable.id,
      modelId: mfhClientPricingTable.modelId,
      clientId: mfhClientPricingTable.clientId,
      clientName: clientsTable.name,
      price: mfhClientPricingTable.price,
      notes: mfhClientPricingTable.notes,
    }).from(mfhClientPricingTable)
      .leftJoin(clientsTable, eq(mfhClientPricingTable.clientId, clientsTable.id))
      .where(eq(mfhClientPricingTable.modelId, parseInt(modelId as string)))
      .orderBy(asc(clientsTable.name));
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// PUT /api/mfh/client-pricing — upsert (model_id + client_id → price)
mfhLibraryRouter.put("/client-pricing", async (req, res) => {
  try {
    const { modelId, clientId, price, notes } = req.body;
    if (!modelId || !clientId || price == null) return res.status(400).json({ error: "modelId, clientId, price required" });
    const existing = await db.select().from(mfhClientPricingTable)
      .where(and(eq(mfhClientPricingTable.modelId, parseInt(modelId)), eq(mfhClientPricingTable.clientId, parseInt(clientId)))).limit(1);
    if (existing.length > 0) {
      const [row] = await db.update(mfhClientPricingTable)
        .set({ price: String(price), notes: notes || null })
        .where(eq(mfhClientPricingTable.id, existing[0].id)).returning();
      return res.json(row);
    }
    const [row] = await db.insert(mfhClientPricingTable)
      .values({ modelId: parseInt(modelId), clientId: parseInt(clientId), price: String(price), notes: notes || null }).returning();
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// PATCH /api/mfh/client-pricing/:id
mfhLibraryRouter.patch("/client-pricing/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { price, notes } = req.body;
    if (price == null) return res.status(400).json({ error: "price required" });
    const [row] = await db.update(mfhClientPricingTable)
      .set({ price: String(price), notes: notes ?? null })
      .where(eq(mfhClientPricingTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// DELETE /api/mfh/client-pricing/:id
mfhLibraryRouter.delete("/client-pricing/:id", async (req, res) => {
  try {
    await db.delete(mfhClientPricingTable).where(eq(mfhClientPricingTable.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed" }); }
});

// Default export (backward compat — not used for new registrations)
export default mfhLibraryRouter;
