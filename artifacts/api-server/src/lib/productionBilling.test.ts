// Regression tests for the MH Production billing engine (Task #1066).
//
// These guard the price-resolution chain that turns checked job items into a
// client-facing invoice. A wrong price here reaches a real customer, so every
// branch of resolveUnitPrice/pickPrice and the quantity rules is pinned here:
//   - client override wins over master
//   - home-type variant fallback (override → master, per home type)
//   - quantity-based multiplication vs. flat (always qty 1) billing types
//   - master pricing when no override exists
//
// The DB layer is mocked: buildProductionLineItems only issues two reads
// (service types, then per-client overrides), so we intercept db.select().from()
// by table identity and return fixtures.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  productionServiceTypesTable,
  productionPriceOverridesTable,
  type ProductionServiceType,
  type ProductionPriceOverride,
} from "@workspace/db/schema";

const h = vi.hoisted(() => ({
  state: {
    items: [] as unknown[],
    overrides: [] as unknown[],
  },
}));

vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  return {
    db: {
      select: () => ({
        from: (table: unknown) => ({
          where: (_cond: unknown) => {
            if (table === schema.productionServiceTypesTable) {
              return Promise.resolve(h.state.items);
            }
            if (table === schema.productionPriceOverridesTable) {
              return Promise.resolve(h.state.overrides);
            }
            return Promise.resolve([]);
          },
        }),
      }),
    },
  };
});

// Imported after vi.mock so the mocked db is wired in.
const { buildProductionLineItems } = await import("./productionBilling");

// ── Fixture helpers ───────────────────────────────────────────────────────────
function money(n: number | null): string | null {
  return n == null ? null : n.toFixed(2);
}

function item(
  over: Partial<ProductionServiceType> & { id: number; billingType: string },
): ProductionServiceType {
  return {
    businessId: null,
    itemKey: null,
    name: "Item",
    invoiceDescription: null,
    taxable: false,
    category: null,
    price: null,
    priceVog: null,
    priceHybrid: null,
    priceDrywall: null,
    sortOrder: 0,
    active: true,
    createdAt: new Date(),
    ...over,
  } as ProductionServiceType;
}

function override(
  over: Partial<ProductionPriceOverride> & { serviceTypeId: number },
): ProductionPriceOverride {
  return {
    id: over.serviceTypeId,
    clientId: 100,
    profileKind: "production",
    price: null,
    priceVog: null,
    priceHybrid: null,
    priceDrywall: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as ProductionPriceOverride;
}

// Mirrors the seed catalog closely enough to be a realistic regression fixture.
const INTERIOR_TRIM = item({
  id: 1,
  itemKey: "interior_trim",
  name: "Interior Trim",
  invoiceDescription: "Interior Trim",
  billingType: "Per Home",
  sortOrder: 10,
  priceVog: money(1500),
  priceHybrid: money(2500),
  priceDrywall: money(3500),
});
const PLUMBING = item({
  id: 2,
  itemKey: "plumbing_hookup",
  name: "Plumbing Hookup",
  invoiceDescription: "Plumbing Hookup",
  billingType: "Per Home",
  sortOrder: 20,
  price: money(1000),
});
const EXTERIOR_TRIM = item({
  id: 3,
  itemKey: "exterior_trim",
  name: "Exterior Trim",
  invoiceDescription: "Exterior Trim",
  billingType: "Per Side",
  sortOrder: 30,
  price: money(500),
});
const DECK = item({
  id: 4,
  itemKey: "deck_4x4",
  name: "4x4 Deck",
  invoiceDescription: "4x4 Deck",
  billingType: "Per Item",
  sortOrder: 40,
  price: money(1400),
});
const TRAVEL = item({
  id: 5,
  itemKey: "travel_surcharge",
  name: "Travel Surcharge",
  invoiceDescription: "Travel Surcharge",
  billingType: "Per Day",
  sortOrder: 50,
  price: money(150),
});
const SERVICE_CALL = item({
  id: 6,
  itemKey: "service_call",
  name: "Service Call",
  invoiceDescription: "Service Call",
  billingType: "Fixed",
  sortOrder: 80,
  price: money(250),
});

// Cavco's per-client profile (clientId 100): only values that differ from master.
const CAVCO_ID = 100;
const CAVCO_OVERRIDES = [
  override({ serviceTypeId: PLUMBING.id, price: money(1500) }),
  override({ serviceTypeId: EXTERIOR_TRIM.id, price: money(600) }),
  override({ serviceTypeId: INTERIOR_TRIM.id, priceDrywall: money(3700) }),
];

function lineFor(result: Awaited<ReturnType<typeof buildProductionLineItems>>, serviceTypeId: number) {
  const line = result.find((r) => r.serviceTypeId === serviceTypeId);
  if (!line) throw new Error(`no line for service type ${serviceTypeId}`);
  return line;
}

beforeEach(() => {
  h.state.items = [];
  h.state.overrides = [];
});

describe("buildProductionLineItems price resolution", () => {
  it("client override wins over master (Cavco / Drywall Interior Trim = $3,700)", async () => {
    h.state.items = [INTERIOR_TRIM];
    h.state.overrides = CAVCO_OVERRIDES;
    const result = await buildProductionLineItems({
      clientId: CAVCO_ID,
      homeType: "Drywall",
      serviceTypeIds: [INTERIOR_TRIM.id],
      quantities: {},
    });
    expect(lineFor(result, INTERIOR_TRIM.id).unitPrice).toBe(3700);
  });

  it("home-type variant falls back to master when override lacks that variant (Cavco / VOG Interior Trim = $1,500)", async () => {
    h.state.items = [INTERIOR_TRIM];
    h.state.overrides = CAVCO_OVERRIDES; // override only sets priceDrywall
    const result = await buildProductionLineItems({
      clientId: CAVCO_ID,
      homeType: "VOG",
      serviceTypeIds: [INTERIOR_TRIM.id],
      quantities: {},
    });
    expect(lineFor(result, INTERIOR_TRIM.id).unitPrice).toBe(1500);
  });

  it("home-type variant falls back to master for Hybrid (Cavco / Hybrid Interior Trim = $2,500)", async () => {
    h.state.items = [INTERIOR_TRIM];
    h.state.overrides = CAVCO_OVERRIDES;
    const result = await buildProductionLineItems({
      clientId: CAVCO_ID,
      homeType: "Hybrid",
      serviceTypeIds: [INTERIOR_TRIM.id],
      quantities: {},
    });
    expect(lineFor(result, INTERIOR_TRIM.id).unitPrice).toBe(2500);
  });

  it("uses master pricing when the client has no override for the item", async () => {
    // A client (e.g. Clayton) with no overrides at all.
    h.state.items = [PLUMBING];
    h.state.overrides = [];
    const result = await buildProductionLineItems({
      clientId: 999,
      homeType: null,
      serviceTypeIds: [PLUMBING.id],
      quantities: {},
    });
    expect(lineFor(result, PLUMBING.id).unitPrice).toBe(1000);
  });

  it("uses master pricing when no client is provided (clientId null skips overrides)", async () => {
    h.state.items = [PLUMBING];
    h.state.overrides = CAVCO_OVERRIDES; // must be ignored because clientId is null
    const result = await buildProductionLineItems({
      clientId: null,
      homeType: null,
      serviceTypeIds: [PLUMBING.id],
      quantities: {},
    });
    expect(lineFor(result, PLUMBING.id).unitPrice).toBe(1000);
  });

  it("flat override applies to a flat (Per Home) item (Cavco Plumbing = $1,500)", async () => {
    h.state.items = [PLUMBING];
    h.state.overrides = CAVCO_OVERRIDES;
    const result = await buildProductionLineItems({
      clientId: CAVCO_ID,
      homeType: "VOG",
      serviceTypeIds: [PLUMBING.id],
      quantities: {},
    });
    expect(lineFor(result, PLUMBING.id).unitPrice).toBe(1500);
  });
});

describe("buildProductionLineItems quantities", () => {
  it("multiplies quantity-based items by the provided count (Per Side / Per Item / Per Day)", async () => {
    h.state.items = [EXTERIOR_TRIM, DECK, TRAVEL];
    h.state.overrides = [];
    const result = await buildProductionLineItems({
      clientId: 999,
      homeType: null,
      serviceTypeIds: [EXTERIOR_TRIM.id, DECK.id, TRAVEL.id],
      quantities: {
        [EXTERIOR_TRIM.id]: 3, // Per Side
        [DECK.id]: 2, // Per Item
        [TRAVEL.id]: 4, // Per Day
      },
    });
    expect(lineFor(result, EXTERIOR_TRIM.id).quantity).toBe(3);
    expect(lineFor(result, DECK.id).quantity).toBe(2);
    expect(lineFor(result, TRAVEL.id).quantity).toBe(4);
    // Unit price stays per-unit; the invoice multiplies unitPrice * quantity.
    expect(lineFor(result, EXTERIOR_TRIM.id).unitPrice).toBe(500);
    expect(lineFor(result, DECK.id).unitPrice).toBe(1400);
    expect(lineFor(result, TRAVEL.id).unitPrice).toBe(150);
  });

  it("defaults quantity-based items to at least 1 when no count is given", async () => {
    h.state.items = [EXTERIOR_TRIM];
    h.state.overrides = [];
    const result = await buildProductionLineItems({
      clientId: 999,
      homeType: null,
      serviceTypeIds: [EXTERIOR_TRIM.id],
      quantities: {},
    });
    expect(lineFor(result, EXTERIOR_TRIM.id).quantity).toBe(1);
  });

  it("floors and clamps fractional or below-1 quantities to at least 1", async () => {
    h.state.items = [DECK];
    h.state.overrides = [];
    const result = await buildProductionLineItems({
      clientId: 999,
      homeType: null,
      serviceTypeIds: [DECK.id],
      quantities: { [DECK.id]: 2.9 },
    });
    expect(lineFor(result, DECK.id).quantity).toBe(2);

    const clamped = await buildProductionLineItems({
      clientId: 999,
      homeType: null,
      serviceTypeIds: [DECK.id],
      quantities: { [DECK.id]: 0 },
    });
    expect(lineFor(clamped, DECK.id).quantity).toBe(1);
  });

  it("flat billing types are always quantity 1 regardless of the count given", async () => {
    h.state.items = [SERVICE_CALL, PLUMBING];
    h.state.overrides = [];
    const result = await buildProductionLineItems({
      clientId: 999,
      homeType: null,
      serviceTypeIds: [SERVICE_CALL.id, PLUMBING.id],
      quantities: {
        [SERVICE_CALL.id]: 5, // Fixed
        [PLUMBING.id]: 7, // Per Home
      },
    });
    expect(lineFor(result, SERVICE_CALL.id).quantity).toBe(1);
    expect(lineFor(result, PLUMBING.id).quantity).toBe(1);
  });
});

describe("buildProductionLineItems output shape", () => {
  it("skips inactive items and orders by sortOrder then id", async () => {
    const inactive = item({
      id: 7,
      itemKey: "warranty_repair",
      name: "Warranty Repair",
      billingType: "Fixed",
      sortOrder: 5,
      active: false,
      price: money(100),
    });
    h.state.items = [SERVICE_CALL, INTERIOR_TRIM, inactive];
    h.state.overrides = [];
    const result = await buildProductionLineItems({
      clientId: 999,
      homeType: "VOG",
      serviceTypeIds: [SERVICE_CALL.id, INTERIOR_TRIM.id, inactive.id],
      quantities: {},
    });
    expect(result.map((r) => r.serviceTypeId)).toEqual([INTERIOR_TRIM.id, SERVICE_CALL.id]);
  });

  it("appends the home type to the description for home-type-priced lines only", async () => {
    h.state.items = [INTERIOR_TRIM, PLUMBING];
    h.state.overrides = [];
    const result = await buildProductionLineItems({
      clientId: 999,
      homeType: "VOG",
      serviceTypeIds: [INTERIOR_TRIM.id, PLUMBING.id],
      quantities: {},
    });
    expect(lineFor(result, INTERIOR_TRIM.id).description).toBe("Interior Trim (VOG)");
    expect(lineFor(result, PLUMBING.id).description).toBe("Plumbing Hookup");
  });

  it("returns an empty list when no service type ids are given", async () => {
    h.state.items = [INTERIOR_TRIM];
    const result = await buildProductionLineItems({
      clientId: CAVCO_ID,
      homeType: "VOG",
      serviceTypeIds: [],
      quantities: {},
    });
    expect(result).toEqual([]);
  });
});
