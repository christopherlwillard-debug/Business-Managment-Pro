// ─────────────────────────────────────────────────────────────────────────────
// MH Production Billing Engine (Task #1062)
//
// Turns the production items checked on an MH Production job card into invoice line
// items priced from the CLIENT's Production pricing profile. Fully data-driven:
// all prices/descriptions/billing rules live in the DB (production_service_types =
// master catalog; production_price_overrides = per-client profile). The only
// developer-maintained (non-user-editable) definition here is the set of Billing
// Types and the idempotent seed data.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "@workspace/db";
import {
  productionServiceTypesTable,
  productionPriceOverridesTable,
  clientsTable,
  type ProductionServiceType,
  type ProductionPriceOverride,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";

// ── Billing Types ────────────────────────────────────────────────────────────
// Application-defined (developer-maintained), NOT user seed data. Determines how a
// Production Billing Item is quantified on an invoice.
export const BILLING_TYPES = [
  "Fixed",
  "Per Home",
  "Per Item",
  "Per Side",
  "Per End",
  "Per Foot",
  "Per Linear Foot",
  "Per Window",
  "Per Door",
  "Per Mile",
  "Per Day",
  "Per Hour",
] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

// Flat billing types always invoice at quantity 1. Everything else is
// quantity-based and prompts the office for a count before applying.
export const FLAT_BILLING_TYPES: readonly string[] = ["Fixed", "Per Home"];

export function isQuantityBased(billingType: string | null | undefined): boolean {
  return !FLAT_BILLING_TYPES.includes(billingType ?? "Fixed");
}

export function isValidBillingType(bt: string | null | undefined): boolean {
  return (BILLING_TYPES as readonly string[]).includes(bt ?? "");
}

export function billingTypeOptions(): { value: string; quantityBased: boolean }[] {
  return BILLING_TYPES.map((value) => ({ value, quantityBased: isQuantityBased(value) }));
}

// ── Home-type pricing ─────────────────────────────────────────────────────────
// jobs.mfhConstructionType encodes BOTH placement and construction type.
// New format:  "FIELD_VOG" | "FIELD_HYBRID" | "FIELD_DRYWALL"
//              "LOT_VOG"   | "LOT_HYBRID"   | "LOT_DRYWALL"
// Legacy bare: "VOG" | "Hybrid" | "Drywall"  (treated as FIELD_*)
type HomeTypeColumn =
  | "priceVog" | "priceHybrid" | "priceDrywall"
  | "priceLotVog" | "priceLotHybrid" | "priceLotDrywall";

function homeTypeColumn(homeType: string | null | undefined): HomeTypeColumn | null {
  const t = (homeType ?? "").trim().toUpperCase();
  switch (t) {
    // New combined format
    case "FIELD_VOG":   return "priceVog";
    case "FIELD_HYBRID": return "priceHybrid";
    case "FIELD_DRYWALL": return "priceDrywall";
    case "LOT_VOG":    return "priceLotVog";
    case "LOT_HYBRID": return "priceLotHybrid";
    case "LOT_DRYWALL": return "priceLotDrywall";
    // Legacy bare values — treated as Field
    case "VOG":    return "priceVog";
    case "HYBRID": return "priceHybrid";
    case "DRYWALL": return "priceDrywall";
    default: return null;
  }
}

type PriceSource = Pick<
  ProductionServiceType,
  "price" | "priceVog" | "priceHybrid" | "priceDrywall"
  | "priceLotVog" | "priceLotHybrid" | "priceLotDrywall"
>;

function parsePrice(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Prefer the home-type variant for this source, else the flat price. Returns null
// when the source defines neither (so the next source in the chain is consulted).
function pickPrice(source: PriceSource, homeCol: HomeTypeColumn | null): number | null {
  if (homeCol) {
    const variant = parsePrice(source[homeCol]);
    if (variant != null) return variant;
  }
  return parsePrice(source.price);
}

function hasHomeTypeVariant(source: PriceSource): boolean {
  return (
    parsePrice(source.priceVog) != null ||
    parsePrice(source.priceHybrid) != null ||
    parsePrice(source.priceDrywall) != null ||
    parsePrice(source.priceLotVog) != null ||
    parsePrice(source.priceLotHybrid) != null ||
    parsePrice(source.priceLotDrywall) != null
  );
}

// Resolution order: client override (home-type → flat) → master (home-type → flat).
function resolveUnitPrice(
  item: ProductionServiceType,
  override: ProductionPriceOverride | null,
  homeCol: HomeTypeColumn | null,
): number {
  if (override) {
    const o = pickPrice(override, homeCol);
    if (o != null) return o;
  }
  const m = pickPrice(item, homeCol);
  if (m != null) return m;
  return 0;
}

// ── Line-item builder ─────────────────────────────────────────────────────────
export interface ResolvedLineItem {
  serviceTypeId: number;
  itemKey: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxable: boolean;
  billingType: string;
}

export async function buildProductionLineItems(opts: {
  clientId: number | null;
  homeType: string | null;
  serviceTypeIds: number[];
  quantities: Record<number, number>;
}): Promise<ResolvedLineItem[]> {
  const { clientId, homeType, serviceTypeIds, quantities } = opts;
  const ids = Array.from(new Set(serviceTypeIds.filter((n) => Number.isFinite(n))));
  if (ids.length === 0) return [];

  const items = await db
    .select()
    .from(productionServiceTypesTable)
    .where(inArray(productionServiceTypesTable.id, ids));

  const overridesByService = new Map<number, ProductionPriceOverride>();
  if (clientId) {
    const overrides = await db
      .select()
      .from(productionPriceOverridesTable)
      .where(
        and(
          eq(productionPriceOverridesTable.clientId, clientId),
          eq(productionPriceOverridesTable.profileKind, "production"),
          inArray(productionPriceOverridesTable.serviceTypeId, ids),
        ),
      );
    for (const o of overrides) overridesByService.set(o.serviceTypeId, o);
  }

  // Display Order = sortOrder, tie-break by id for stability.
  items.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  const homeCol = homeTypeColumn(homeType);
  const result: ResolvedLineItem[] = [];
  for (const item of items) {
    if (!item.active) continue;
    const override = overridesByService.get(item.id) ?? null;
    const unitPrice = resolveUnitPrice(item, override, homeCol);
    const quantity = isQuantityBased(item.billingType)
      ? Math.max(1, Math.floor(quantities[item.id] ?? 1))
      : 1;
    // A line is "home-type priced" when either the master item or the client
    // override defines home-type variants — keeps the descriptor consistent even
    // when only the override carries the variant.
    const homeTypePriced =
      hasHomeTypeVariant(item) || (override != null && hasHomeTypeVariant(override));
    const baseDesc = item.invoiceDescription?.trim() || item.name;
    const description =
      homeTypePriced && homeType ? `${baseDesc} (${homeType})` : baseDesc;
    result.push({
      serviceTypeId: item.id,
      itemKey: item.itemKey ?? null,
      description,
      quantity,
      unitPrice,
      taxable: item.taxable,
      billingType: item.billingType,
    });
  }
  return result;
}

// ── Idempotent, alias-aware seed ──────────────────────────────────────────────
// Runs at runtime AFTER the DDL columns exist (dev: psql migration; prod: Publish).
// Never clobbers user edits: once a row carries its itemKey it is left untouched.
// Legacy rows (seeded before this feature, referenced by jobs.mhProductionServices
// IDs) are ADOPTED by name alias so their IDs are preserved rather than duplicated.
interface SeedItem {
  itemKey: string;
  name: string;
  invoiceDescription: string;
  billingType: BillingType;
  sortOrder: number;
  category?: string | null;
  appliesTo?: "production" | "service";
  taxable?: boolean;
  price?: number | null;
  priceVog?: number | null;
  priceHybrid?: number | null;
  priceDrywall?: number | null;
  legacyAliases?: string[];
}

const SEED_ITEMS: SeedItem[] = [
  { itemKey: "interior_trim", name: "Interior Trim", invoiceDescription: "Interior Trim", billingType: "Per Home", sortOrder: 10, category: "Production", priceVog: 1500, priceHybrid: 2500, priceDrywall: 3500, legacyAliases: ["Interior Trim Out"] },
  { itemKey: "plumbing_hookup", name: "Plumbing Hookup", invoiceDescription: "Plumbing Hookup", billingType: "Per Home", sortOrder: 20, category: "Production", price: 1000, legacyAliases: ["Plumbing Hookup"] },
  { itemKey: "exterior_trim", name: "Exterior Trim", invoiceDescription: "Exterior Trim", billingType: "Per Side", sortOrder: 30, category: "Production", price: 500, legacyAliases: ["Exterior Trim Out", "Vinyl Side", "Vinyl Sides"] },
  { itemKey: "deck_4x4", name: "4×4 Deck", invoiceDescription: "4×4 Deck", billingType: "Per Item", sortOrder: 40, category: "Production", price: 1400, legacyAliases: ["4×4 Deck / Step Platform", "4x4 Deck / Step Platform", "4×4 Deck", "4x4 Deck"] },
  { itemKey: "travel_surcharge", name: "Travel Surcharge", invoiceDescription: "Travel Surcharge", billingType: "Per Day", sortOrder: 50, category: "Travel", price: 150 },
  { itemKey: "skirting", name: "Skirting", invoiceDescription: "Skirting", billingType: "Per Linear Foot", sortOrder: 60, category: "Production" },
  { itemKey: "steps", name: "Steps", invoiceDescription: "Steps", billingType: "Per Item", sortOrder: 70, category: "Production" },
  { itemKey: "service_call", name: "Service Call", invoiceDescription: "Service Call", billingType: "Fixed", sortOrder: 80, category: "Service", appliesTo: "service" },
  { itemKey: "mileage", name: "Mileage", invoiceDescription: "Mileage", billingType: "Per Mile", sortOrder: 90, category: "Travel", appliesTo: "service" },
  { itemKey: "materials", name: "Materials", invoiceDescription: "Materials", billingType: "Fixed", sortOrder: 100, category: "Materials", appliesTo: "service" },
  { itemKey: "warranty_repair", name: "Warranty Repair", invoiceDescription: "Warranty Repair", billingType: "Fixed", sortOrder: 110, category: "Service", appliesTo: "service" },
];

interface SeedOverride {
  clientAliases: string[];
  itemKey: string;
  price?: number | null;
  priceVog?: number | null;
  priceHybrid?: number | null;
  priceDrywall?: number | null;
}

const SEED_OVERRIDES: SeedOverride[] = [
  { clientAliases: ["cavco", "cavco home center"], itemKey: "plumbing_hookup", price: 1500 },
  { clientAliases: ["cavco", "cavco home center"], itemKey: "exterior_trim", price: 600 },
  { clientAliases: ["cavco", "cavco home center"], itemKey: "interior_trim", priceDrywall: 3700 },
  // Clayton Homes (Owensboro/Evansville) intentionally use master pricing — no overrides.
  // Champion is a builder, never a billing client — never seeded.
];

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/×/g, "x").replace(/\s+/g, " ");
}

function numOrNull(n: number | null | undefined): string | null {
  return n == null ? null : n.toFixed(2);
}

// Seed health, surfaced to the office so a schema drift / seed failure is VISIBLE
// (Settings → Production Billing shows a warning) instead of silently degrading to
// incomplete/legacy rows. `ok: true` with no error is the healthy steady state.
export interface ProductionBillingSeedStatus {
  ok: boolean;
  error: string | null;
}

let seedRan = false;
let lastSeedStatus: ProductionBillingSeedStatus = { ok: true, error: null };

export function getProductionBillingSeedStatus(): ProductionBillingSeedStatus {
  return lastSeedStatus;
}

export async function ensureProductionBillingSeed(): Promise<ProductionBillingSeedStatus> {
  if (seedRan) return lastSeedStatus;
  try {
    const existing = await db.select().from(productionServiceTypesTable);
    const byKey = new Set<string>();
    const unclaimedByName = new Map<string, ProductionServiceType>();
    for (const row of existing) {
      if (row.itemKey) byKey.add(row.itemKey);
      else if (!unclaimedByName.has(normName(row.name))) unclaimedByName.set(normName(row.name), row);
    }

    for (const seed of SEED_ITEMS) {
      if (byKey.has(seed.itemKey)) continue; // already adopted — preserve user edits

      // Adopt a pre-existing unclaimed row via legacy alias so its ID is preserved.
      let adopt: ProductionServiceType | undefined;
      const aliases = [seed.name, ...(seed.legacyAliases ?? [])].map(normName);
      for (const a of aliases) {
        const m = unclaimedByName.get(a);
        if (m) {
          adopt = m;
          break;
        }
      }

      const values = {
        itemKey: seed.itemKey,
        name: seed.name,
        invoiceDescription: seed.invoiceDescription,
        billingType: seed.billingType,
        category: seed.category ?? null,
        appliesTo: seed.appliesTo ?? "production",
        taxable: seed.taxable ?? false,
        sortOrder: seed.sortOrder,
        price: numOrNull(seed.price),
        priceVog: numOrNull(seed.priceVog),
        priceHybrid: numOrNull(seed.priceHybrid),
        priceDrywall: numOrNull(seed.priceDrywall),
        active: true,
      };

      if (adopt) {
        await db
          .update(productionServiceTypesTable)
          .set(values)
          .where(eq(productionServiceTypesTable.id, adopt.id));
        unclaimedByName.delete(normName(adopt.name));
      } else {
        await db.insert(productionServiceTypesTable).values({ ...values, businessId: null });
      }
    }

    // Seed client overrides (only where prices differ from master). Match clients by
    // normalized name alias; skip missing clients gracefully; never create clients.
    const afterItems = await db.select().from(productionServiceTypesTable);
    const itemIdByKey = new Map<string, number>();
    for (const r of afterItems) if (r.itemKey) itemIdByKey.set(r.itemKey, r.id);

    const clients = await db.select().from(clientsTable);
    for (const seed of SEED_OVERRIDES) {
      const serviceTypeId = itemIdByKey.get(seed.itemKey);
      if (!serviceTypeId) continue;
      const client = clients.find((c) => seed.clientAliases.includes(normName(c.name)));
      if (!client) continue;
      await db
        .insert(productionPriceOverridesTable)
        .values({
          clientId: client.id,
          serviceTypeId,
          profileKind: "production",
          price: numOrNull(seed.price),
          priceVog: numOrNull(seed.priceVog),
          priceHybrid: numOrNull(seed.priceHybrid),
          priceDrywall: numOrNull(seed.priceDrywall),
        })
        .onConflictDoNothing();
    }

    seedRan = true;
    lastSeedStatus = { ok: true, error: null };
    return lastSeedStatus;
  } catch (err) {
    console.error("[productionBilling] ensureProductionBillingSeed failed:", err);
    // Leave seedRan false so the next request retries once the schema is published.
    lastSeedStatus = { ok: false, error: err instanceof Error ? err.message : String(err) };
    return lastSeedStatus;
  }
}
