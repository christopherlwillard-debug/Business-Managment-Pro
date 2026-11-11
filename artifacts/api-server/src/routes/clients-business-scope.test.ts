import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  tables: {
    clients: { id: "clients.id", businessId: "clients.business_id", businessLine: "clients.business_line" },
    businesses: { id: "businesses.id", slug: "businesses.slug" },
    clientBillingProfiles: { id: "client_billing_profiles.id", clientId: "client_billing_profiles.client_id" },
    estimates: { id: "estimates.id", clientId: "estimates.client_id", businessId: "estimates.business_id", businessLine: "estimates.business_line" },
    jobs: { id: "jobs.id", clientId: "jobs.client_id", businessId: "jobs.business_id", businessLine: "jobs.business_line" },
    invoices: { id: "invoices.id", clientId: "invoices.client_id", businessId: "invoices.business_id", businessLine: "invoices.business_line" },
    prospects: { id: "prospects.id", clientId: "prospects.client_id", businessId: "prospects.business_id", businessLine: "prospects.business_line" },
    routeStops: { id: "route_stops.id", clientId: "route_stops.client_id" },
    otherIncome: { id: "other_income.id", clientId: "other_income.client_id" },
    squarePayments: { id: "square_payments.id", clientId: "square_payments.client_id" },
    mfhClientPricing: { id: "mfh_client_pricing.id", clientId: "mfh_client_pricing.client_id" },
    productionPriceOverrides: { id: "production_price_overrides.id", clientId: "production_price_overrides.client_id" },
  },
  businesses: [
    { id: 1, slug: "general_contracting" },
    { id: 2, slug: "asphalt_sealing" },
  ] as Array<{ id: number; slug: string }>,
  client: null as any,
  updatedClient: null as any,
  deletedClient: null as any,
  billingProfiles: [] as any[],
  mfhPricing: [] as any[],
  productionPricing: [] as any[],
  updateConditions: [] as any[],
  deleteConditions: [] as any[],
  updateValues: [] as any[],
  resolveMutationBusiness: vi.fn(),
}));

vi.mock("@workspace/db/schema", () => ({
  clientsTable: h.tables.clients,
  businessesTable: h.tables.businesses,
  clientBillingProfilesTable: h.tables.clientBillingProfiles,
  estimatesTable: h.tables.estimates,
  jobsTable: h.tables.jobs,
  invoicesTable: h.tables.invoices,
  prospectsTable: h.tables.prospects,
  routeStopsTable: h.tables.routeStops,
  otherIncomeTable: h.tables.otherIncome,
  squarePaymentsTable: h.tables.squarePayments,
  mfhClientPricingTable: h.tables.mfhClientPricing,
  productionPriceOverridesTable: h.tables.productionPriceOverrides,
}));

vi.mock("@workspace/db", () => {
  function selectChain() {
    let table: any;
    let condition: any;
    const chain: any = {
      from(value: any) { table = value; return chain; },
      where(value: any) { condition = value; return chain; },
      limit() { return chain; },
      orderBy() { return chain; },
      for() { return chain; },
      then(resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) {
        let rows: any[] = [];
        if (table === h.tables.clients) {
          rows = h.client ? [h.client] : [];
        } else if (table === h.tables.businesses) {
          rows = h.businesses;
          if (condition?.op === "eq") {
            rows = rows.filter(row => row[condition.column === h.tables.businesses.id ? "id" : "slug"] === condition.value);
          }
        } else if (table === h.tables.clientBillingProfiles) {
          rows = h.billingProfiles;
        } else if (table === h.tables.mfhClientPricing) {
          rows = h.mfhPricing;
        } else if (table === h.tables.productionPriceOverrides) {
          rows = h.productionPricing;
        }
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return chain;
  }

  function mutationChain(table: any, kind: "update" | "delete") {
    return {
      set(values: any) {
        h.updateValues.push({ table, values });
        return this;
      },
      where(condition: any) {
        if (kind === "update") h.updateConditions.push({ table, condition });
        else h.deleteConditions.push({ table, condition });
        const result: any = {
          returning: () => Promise.resolve(kind === "update" ? [h.updatedClient] : [h.deletedClient]),
          then: (resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve(undefined).then(resolve, reject),
        };
        return result;
      },
    };
  }

  const tx = {
    select: () => selectChain(),
    update: (table: any) => mutationChain(table, "update"),
    delete: (table: any) => mutationChain(table, "delete"),
  };
  return {
    db: {
      ...tx,
      transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx),
    },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
  and: (...conditions: unknown[]) => ({ op: "and", conditions }),
  or: (...conditions: unknown[]) => ({ op: "or", conditions }),
  isNull: (column: unknown) => ({ op: "isNull", column }),
  isNotNull: (column: unknown) => ({ op: "isNotNull", column }),
  inArray: (column: unknown, values: unknown[]) => ({ op: "inArray", column, values }),
  desc: (column: unknown) => ({ op: "desc", column }),
}));

vi.mock("../lib/business-scope.js", () => ({
  requestedBusiness: vi.fn(async () => null),
  requestedBusinessReadScope: vi.fn(async () => null),
  hasRequestedBusiness: vi.fn(() => false),
  invalidBusinessScope: vi.fn(() => false),
  businessReadPredicate: vi.fn(() => undefined),
  belongsToBusinessReadScope: (record: any, scope: any) => !scope || record.businessId === scope.id || record.businessLine === scope.slug,
  resolveMutationBusiness: h.resolveMutationBusiness,
  belongsToBusiness: (record: any, scope: any) => record.businessId != null
    ? Number(record.businessId) === scope.id
    : record.businessLine === scope.slug,
  mutationBusinessPredicate: (_columns: any, scope: any) => ({ op: "businessScope", businessId: scope.id, slug: scope.slug }),
}));

vi.mock("../lib/client-profile-projections.js", () => ({
  clientProfileRouteStopColumns: {},
  clientProfileSquarePaymentColumns: {},
}));

const { default: clientsRouter } = await import("./clients");
const app = express();
app.use(express.json());
app.use("/clients", clientsRouter);

const generalContracting = { id: 1, slug: "general_contracting" };
const asphalt = { id: 2, slug: "asphalt_sealing" };

beforeEach(() => {
  h.businesses = [generalContracting, asphalt];
  h.client = {
    id: 7,
    name: "Existing client",
    businessId: 2,
    businessLine: "asphalt_sealing",
    createdAt: new Date("2026-11-01T00:00:00.000Z"),
  };
  h.updatedClient = { ...h.client, name: "Updated client" };
  h.deletedClient = { ...h.client };
  h.billingProfiles = [];
  h.mfhPricing = [];
  h.productionPricing = [];
  h.updateConditions.length = 0;
  h.deleteConditions.length = 0;
  h.updateValues.length = 0;
  h.resolveMutationBusiness.mockImplementation(async (req: any) => {
    const id = Number(req.query?.businessId ?? req.body?.businessId);
    const slug = req.query?.businessLine ?? req.body?.businessLine;
    const business = Number.isSafeInteger(id) && id > 0
      ? h.businesses.find(item => item.id === id)
      : typeof slug === "string" && slug
        ? h.businesses.find(item => item.slug === slug)
        : generalContracting;
    return business ? { ok: true, business, explicit: id > 0 || !!slug } : { ok: false, error: "Unknown business" };
  });
});

afterEach(() => vi.clearAllMocks());

describe("client mutation business ownership", () => {
  it("uses the existing source business when PUT also changes the destination business line", async () => {
    const response = await request(app).put("/clients/7").send({
      name: "Updated client",
      businessLine: "general_contracting",
      sourceBusinessId: 2,
      sourceBusinessLine: "asphalt_sealing",
    });

    expect(response.status).toBe(200);
    const sourceRequest = h.resolveMutationBusiness.mock.calls[0][0];
    expect(sourceRequest.body).toEqual({ businessId: 2, businessLine: "asphalt_sealing" });
    expect(h.updateConditions).toHaveLength(1);
    expect(JSON.stringify(h.updateConditions[0].condition)).toContain('"businessId":2');
  });

  it("rejects an update when the selected source business does not own the client", async () => {
    const response = await request(app).put("/clients/7").send({
      name: "Should not change",
      sourceBusinessId: 1,
      sourceBusinessLine: "general_contracting",
    });

    expect(response.status).toBe(404);
    expect(h.updateConditions).toHaveLength(0);
    expect(h.updateValues).toHaveLength(0);
  });

  it("rejects an unscoped default-business update against a client owned by another business", async () => {
    const response = await request(app).put("/clients/7").send({ name: "Should not change" });

    expect(response.status).toBe(404);
    expect(h.updateConditions).toHaveLength(0);
  });

  it("rejects a delete when the selected business does not own the client", async () => {
    const response = await request(app).delete("/clients/7?businessId=1");

    expect(response.status).toBe(404);
    expect(h.updateConditions).toHaveLength(0);
    expect(h.deleteConditions).toHaveLength(0);
  });

  it("preserves client-specific MFH pricing instead of allowing the FK cascade to erase it", async () => {
    h.mfhPricing = [{ id: 44 }];

    const response = await request(app).delete("/clients/7?businessId=2");

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ mfhPricingCount: 1 });
    expect(response.body.error).toContain("saved billing or manufacturer pricing");
    expect(h.deleteConditions).toHaveLength(0);
  });

  it("does not permanently delete an otherwise empty client before archive support exists", async () => {
    const response = await request(app).delete("/clients/7?businessId=2");

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("archive/restore workflow");
    expect(response.body.error).toContain("No data was changed");
    expect(h.updateConditions).toHaveLength(0);
    expect(h.deleteConditions).toHaveLength(0);
  });
});
