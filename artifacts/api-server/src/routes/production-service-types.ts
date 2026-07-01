import { Router } from "express";
import { db, productionServiceTypesTable, productionPriceOverridesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { wrapAsync } from "./guards";
import {
  ensureProductionBillingSeed,
  getProductionBillingSeedStatus,
  billingTypeOptions,
  isValidBillingType,
} from "../lib/productionBilling.js";

const router = Router();

// numeric(12,2) columns take string | null in Drizzle.
function priceOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

async function fetchServiceTypes(includeInactive: boolean) {
  return db
    .select()
    .from(productionServiceTypesTable)
    .where(includeInactive ? undefined : eq(productionServiceTypesTable.active, true))
    .orderBy(asc(productionServiceTypesTable.sortOrder), asc(productionServiceTypesTable.createdAt));
}

// ── Billing types (application-defined; drives the catalog dropdown + qty prompt) ─
router.get("/billing-types", wrapAsync(async (_req, res) => {
  res.json(billingTypeOptions());
}));

// ── Catalog health ───────────────────────────────────────────────────────────
// Lets Settings → Production Billing show a clear warning when the seed failed
// (e.g. a schema column is missing because a change hasn't been Published yet)
// instead of silently rendering an "empty but fine" catalog. Distinguishes a
// genuinely empty catalog (ok:true, itemCount:0) from schema drift / seed failure
// (ok:false with a seedError or readError).
router.get("/status", wrapAsync(async (_req, res) => {
  const seed = await ensureProductionBillingSeed();
  let itemCount: number | null = null;
  let readError: string | null = null;
  try {
    const rows = await db
      .select({ id: productionServiceTypesTable.id })
      .from(productionServiceTypesTable);
    itemCount = rows.length;
  } catch (e) {
    readError = e instanceof Error ? e.message : String(e);
  }
  res.json({
    ok: seed.ok && readError == null,
    seedError: seed.error,
    readError,
    itemCount,
  });
}));

// ── Per-client Production pricing profile (overrides) ────────────────────────────
router.get("/overrides", wrapAsync(async (req, res) => {
  const clientId = req.query.clientId ? parseInt(req.query.clientId as string) : NaN;
  if (isNaN(clientId)) return res.status(400).json({ error: "clientId is required" });
  const rows = await db
    .select()
    .from(productionPriceOverridesTable)
    .where(
      and(
        eq(productionPriceOverridesTable.clientId, clientId),
        eq(productionPriceOverridesTable.profileKind, "production"),
      ),
    );
  res.json(rows);
}));

// Upsert a single client override. Any null price* column falls back to master.
router.put("/overrides", wrapAsync(async (req, res) => {
  const { clientId, serviceTypeId, price, priceVog, priceHybrid, priceDrywall } = req.body as {
    clientId?: number;
    serviceTypeId?: number;
    price?: unknown;
    priceVog?: unknown;
    priceHybrid?: unknown;
    priceDrywall?: unknown;
  };
  if (!clientId || !serviceTypeId) {
    return res.status(400).json({ error: "clientId and serviceTypeId are required" });
  }
  const values = {
    price: priceOrNull(price),
    priceVog: priceOrNull(priceVog),
    priceHybrid: priceOrNull(priceHybrid),
    priceDrywall: priceOrNull(priceDrywall),
  };
  const [row] = await db
    .insert(productionPriceOverridesTable)
    .values({ clientId, serviceTypeId, profileKind: "production", ...values })
    .onConflictDoUpdate({
      target: [
        productionPriceOverridesTable.clientId,
        productionPriceOverridesTable.profileKind,
        productionPriceOverridesTable.serviceTypeId,
      ],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  res.json(row);
}));

router.delete("/overrides/:id", wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [row] = await db
    .delete(productionPriceOverridesTable)
    .where(eq(productionPriceOverridesTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
}));

// ── Master catalog CRUD ─────────────────────────────────────────────────────────
router.get("/", wrapAsync(async (req, res) => {
  await ensureProductionBillingSeed();
  const businessId = req.query.businessId ? parseInt(req.query.businessId as string) : null;
  const includeInactive = req.query.includeInactive === "true";
  const rows = await fetchServiceTypes(includeInactive);
  if (businessId && !isNaN(businessId)) {
    res.json(rows.filter(r => r.businessId === null || r.businessId === businessId));
  } else {
    res.json(rows);
  }
}));

router.post("/", wrapAsync(async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return res.status(400).json({ error: "name is required" });
  const billingType = typeof b.billingType === "string" && isValidBillingType(b.billingType) ? b.billingType : "Fixed";
  const [row] = await db
    .insert(productionServiceTypesTable)
    .values({
      name,
      invoiceDescription: typeof b.invoiceDescription === "string" ? b.invoiceDescription : null,
      billingType,
      taxable: b.taxable === true,
      category: typeof b.category === "string" && b.category ? b.category : null,
      price: priceOrNull(b.price),
      priceVog: priceOrNull(b.priceVog),
      priceHybrid: priceOrNull(b.priceHybrid),
      priceDrywall: priceOrNull(b.priceDrywall),
      sortOrder: typeof b.sortOrder === "number" ? b.sortOrder : 0,
      businessId: typeof b.businessId === "number" ? b.businessId : null,
    })
    .returning();
  res.status(201).json(row);
}));

router.put("/:id", wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const b = req.body as Record<string, unknown>;
  const set: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim()) set.name = b.name.trim();
  if ("invoiceDescription" in b) set.invoiceDescription = typeof b.invoiceDescription === "string" ? b.invoiceDescription : null;
  if (typeof b.billingType === "string" && isValidBillingType(b.billingType)) set.billingType = b.billingType;
  if ("taxable" in b) set.taxable = b.taxable === true;
  if ("category" in b) set.category = typeof b.category === "string" && b.category ? b.category : null;
  if ("price" in b) set.price = priceOrNull(b.price);
  if ("priceVog" in b) set.priceVog = priceOrNull(b.priceVog);
  if ("priceHybrid" in b) set.priceHybrid = priceOrNull(b.priceHybrid);
  if ("priceDrywall" in b) set.priceDrywall = priceOrNull(b.priceDrywall);
  if (typeof b.sortOrder === "number") set.sortOrder = b.sortOrder;
  if ("active" in b) set.active = b.active === true;
  if (Object.keys(set).length === 0) return res.status(400).json({ error: "No fields to update" });
  const [row] = await db
    .update(productionServiceTypesTable)
    .set(set)
    .where(eq(productionServiceTypesTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
}));

router.delete("/:id", wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [row] = await db
    .update(productionServiceTypesTable)
    .set({ active: false })
    .where(eq(productionServiceTypesTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
}));

export default router;
