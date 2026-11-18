import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  businessId: 0,
  sameLegalBusiness: true,
  clientOwnerBusinessId: 11,
  client: { id: 501, name: "Client Fixture", businessId: 11 },
  property: {
    id: 101,
    businessId: 11,
    clientId: null,
    prospectId: null as number | null,
    label: "Permission Fixture",
    street: "100 Test Road",
    city: "Testville",
    state: "KY",
    zip: "40000",
    notes: null,
  },
  prospect: {
    id: 601,
    businessId: 11,
    businessLine: "business-11",
    clientId: null,
    status: "needs_measurements",
  },
  grants: [] as Array<{ businessId: number; permission: string; revokedAt: Date | null }>,
  revision: {
    id: 201,
    propertyId: 101,
    revision: 1,
    source: "manual",
    entries: [{ label: "Parking area", category: "Parking", kind: "area", quantity: 1000, unit: "sq_ft" }],
    notes: null,
    createdAt: new Date("2026-11-12T12:00:00.000Z"),
  },
  pricingProfile: {
    id: 301,
    businessId: 11,
    serviceKey: "snow_removal",
    version: 1,
    displayName: "Snow removal",
    rules: {
      components: [{
        label: "Parking lot clearing",
        category: "Snow",
        basis: "customer_rate",
        chargeType: "per_unit",
        amount: 0.1,
        measurementCategory: "Parking",
        kind: "area",
        unit: "sq_ft",
      }],
      marginMode: "none",
      marginPercent: 0,
      minimumCharge: 0,
      quantityRounding: { mode: "none", increment: 1 },
    },
    createdAt: new Date("2026-11-12T12:00:00.000Z"),
  },
  selectedTables: [] as unknown[],
  inserts: [] as unknown[],
  updates: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
}));

vi.mock("@workspace/db", () => {
  const rowsFor = (table: unknown) => {
    if (table === h.tables.properties) return [h.property];
    if (table === h.tables.clients) return [h.client];
    if (table === h.tables.prospects) return [h.prospect];
    if (table === h.tables.access) {
      return h.grants.filter(grant => grant.businessId === h.businessId && grant.revokedAt === null);
    }
    if (table === h.tables.revisions) return [h.revision];
    if (table === h.tables.pricingProfiles) return [h.pricingProfile];
    return [];
  };
  const db = {
    select: () => {
      let selectedTable: unknown;
      const query: any = {
        from(table: unknown) {
          selectedTable = table;
          h.selectedTables.push(table);
          return query;
        },
        where: () => query,
        orderBy: () => query,
        limit: async () => rowsFor(selectedTable),
        for: () => query,
        then: (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve(rowsFor(selectedTable)).then(resolve, reject),
      };
      return query;
    },
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        h.inserts.push({ table, values });
        return {
          returning: async () => [{
            id: 701,
            createdAt: new Date("2026-11-12T12:00:00.000Z"),
            ...(values as Record<string, unknown>),
          }],
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        const query: any = {
          where: () => {
            h.updates.push({ table, values });
            if (table === h.tables.access) {
              for (const grant of h.grants) {
                if (grant.businessId === 22 && grant.revokedAt === null) {
                  grant.revokedAt = values.revokedAt as Date;
                }
              }
            }
            if (table === h.tables.properties) Object.assign(h.property, values);
            return query;
          },
          returning: async () => [h.property],
          then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
            Promise.resolve(undefined).then(resolve, reject),
        };
        return query;
      },
    }),
    transaction: async (callback: (tx: any) => unknown) => callback(db),
  };
  return { db };
});

vi.mock("../lib/business-scope.js", () => ({
  requestedBusiness: async (req: any) => {
    const value = Number(req.query?.businessId ?? req.body?.businessId ?? 0);
    h.businessId = value;
    return value > 0 ? { id: value, slug: `business-${value}` } : null;
  },
  resolveMutationBusiness: async (req: any) => {
    const value = Number(req.body?.businessId ?? req.query?.businessId ?? 0);
    h.businessId = value;
    return value > 0
      ? { ok: true, business: { id: value, slug: `business-${value}` } }
      : { ok: false, error: "A valid businessId is required" };
  },
  sameLegalBusiness: async () => h.sameLegalBusiness,
  canonicalRecordBusiness: async () => ({
    state: "resolved",
    business: { id: h.clientOwnerBusinessId },
  }),
  invalidBusinessScope: () => false,
  hasRequestedBusiness: () => true,
  requestedBusinessReadScope: async () => null,
}));

vi.mock("./guards.js", () => ({
  getRequestUserId: () => "test-user",
}));

import {
  clientsTable,
  estimatesTable,
  prospectsTable,
  prospectEventsTable,
  propertiesTable,
  propertyBusinessAccessTable,
  propertyMeasurementRevisionsTable,
  servicePricingProfileVersionsTable,
} from "@workspace/db/schema";
const { default: aerialQuoteRouter } = await import("./aerial-quote");

const app = express();
app.use(express.json());
app.use("/aerial-quote", aerialQuoteRouter);

function expectSelects(...tables: unknown[]) {
  expect(h.selectedTables).toEqual(tables);
  h.selectedTables.length = 0;
}

beforeEach(() => {
  h.tables = {
    properties: propertiesTable,
    clients: clientsTable,
    prospects: prospectsTable,
    prospectEvents: prospectEventsTable,
    access: propertyBusinessAccessTable,
    revisions: propertyMeasurementRevisionsTable,
    pricingProfiles: servicePricingProfileVersionsTable,
  };
  h.businessId = 0;
  h.sameLegalBusiness = true;
  h.clientOwnerBusinessId = 11;
  h.client = { id: 501, name: "Client Fixture", businessId: 11 };
  Object.assign(h.property, {
    id: 101,
    businessId: 11,
    clientId: null,
    prospectId: null,
    label: "Permission Fixture",
    street: "100 Test Road",
    city: "Testville",
    state: "KY",
    zip: "40000",
    notes: null,
  });
  h.grants = [];
  h.selectedTables.length = 0;
  h.inserts.length = 0;
  h.updates.length = 0;
});

afterEach(() => {
  expect(h.selectedTables).toHaveLength(0);
});

describe("Aerial Quote property permission routes", () => {
  it("lets the owning business update property details and same-business client association", async () => {
    const response = await request(app)
      .put("/aerial-quote/properties/101")
      .send({
        businessId: 11,
        clientId: 501,
        label: "Updated Property",
        street: "200 Updated Road",
        city: "Owensboro",
        state: "KY",
        zip: "42301",
        notes: "Updated notes",
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 101,
      businessId: 11,
      clientId: 501,
      label: "Updated Property",
      street: "200 Updated Road",
      city: "Owensboro",
      state: "KY",
      zip: "42301",
      notes: "Updated notes",
      accessPermission: "manage",
    });
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]).toMatchObject({
      table: propertiesTable,
      values: { clientId: 501, label: "Updated Property", street: "200 Updated Road" },
    });
    expectSelects(propertiesTable, clientsTable);
  });

  it("allows a shared division to edit only with an active manage grant", async () => {
    h.grants.push({ businessId: 22, permission: "manage", revokedAt: null });

    const response = await request(app)
      .put("/aerial-quote/properties/101")
      .send({
        businessId: 22,
        clientId: null,
        label: "Managed Property",
        street: null,
        city: null,
        state: null,
        zip: null,
        notes: null,
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 101, label: "Managed Property", accessPermission: "manage" });
    expect(h.updates).toHaveLength(1);
    expectSelects(propertiesTable, propertyBusinessAccessTable);
  });

  it("denies shared edits without manage and after a manage grant is revoked", async () => {
    h.grants.push({ businessId: 22, permission: "estimate", revokedAt: null });

    const denied = await request(app)
      .put("/aerial-quote/properties/101")
      .send({ businessId: 22, label: "Must Not Save" });
    expect(denied.status).toBe(404);
    expect(h.updates).toHaveLength(0);
    expectSelects(propertiesTable, propertyBusinessAccessTable);

    h.grants[0]!.permission = "manage";
    h.grants[0]!.revokedAt = new Date("2026-11-12T12:00:00.000Z");
    const revoked = await request(app)
      .put("/aerial-quote/properties/101")
      .send({ businessId: 22, label: "Must Still Not Save" });
    expect(revoked.status).toBe(404);
    expect(h.updates).toHaveLength(0);
    expectSelects(propertiesTable, propertyBusinessAccessTable);
  });

  it("rejects linking a client from an unrelated legal business", async () => {
    h.clientOwnerBusinessId = 99;
    h.sameLegalBusiness = false;

    const response = await request(app)
      .put("/aerial-quote/properties/101")
      .send({
        businessId: 11,
        clientId: 501,
        label: "Updated Property",
      });

    expect(response.status).toBe(409);
    expect(h.updates).toHaveLength(0);
    expectSelects(propertiesTable, clientsTable);
  });

  it("denies a cross-business measurement write without the measure grant", async () => {
    h.grants.push({ businessId: 22, permission: "view", revokedAt: null });

    const response = await request(app)
      .post("/aerial-quote/properties/101/measurement-revisions")
      .send({
        businessId: 22,
        source: "manual",
        entries: [{ label: "Parking area", category: "Parking", kind: "area", quantity: 1000, unit: "sq_ft" }],
      });

    expect(response.status).toBe(404);
    expect(h.inserts).toHaveLength(0);
    expectSelects(propertiesTable, propertyBusinessAccessTable);
  });

  it("does not allow a measure-only grant to calculate an estimate", async () => {
    h.grants.push({ businessId: 22, permission: "measure", revokedAt: null });

    const response = await request(app)
      .post("/aerial-quote/calculate")
      .send({
        businessId: 22,
        propertyId: 101,
        measurementRevisionId: 201,
        serviceKey: "lawn_mowing",
        profileVersion: 1,
      });

    expect(response.status).toBe(404);
    expect(h.inserts).toHaveLength(0);
    expectSelects(propertiesTable, propertyBusinessAccessTable);
  });

  it("makes revoked property access fail on the next API request", async () => {
    h.grants.push({ businessId: 22, permission: "estimate", revokedAt: null });

    const beforeRevoke = await request(app)
      .get("/aerial-quote/properties/101/measurement-revisions")
      .query({ businessId: 22 });
    expect(beforeRevoke.status).toBe(200);
    expect(beforeRevoke.body).toHaveLength(1);
    expectSelects(propertiesTable, propertyBusinessAccessTable, propertyMeasurementRevisionsTable);

    const revoke = await request(app)
      .delete("/aerial-quote/properties/101/access/22")
      .query({ businessId: 11 });
    expect(revoke.status).toBe(204);
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]).toMatchObject({ table: propertyBusinessAccessTable });
    expect(h.grants[0]?.revokedAt).toBeInstanceOf(Date);
    expectSelects(propertiesTable);

    const afterRevoke = await request(app)
      .get("/aerial-quote/properties/101/measurement-revisions")
      .query({ businessId: 22 });
    expect(afterRevoke.status).toBe(404);
    expectSelects(propertiesTable, propertyBusinessAccessTable);
  });

  it("rejects sharing with a business outside the legal entity", async () => {
    h.sameLegalBusiness = false;

    const response = await request(app)
      .post("/aerial-quote/properties/101/access")
      .send({ businessId: 11, targetBusinessId: 99, permission: "view" });

    expect(response.status).toBe(403);
    expect(h.inserts).toHaveLength(0);
    expectSelects(propertiesTable);
  });

  it("creates a standard estimate from a saved property revision and pricing profile", async () => {
    const response = await request(app)
      .post("/aerial-quote/estimates")
      .send({
        businessId: 11,
        propertyId: 101,
        measurementRevisionId: 201,
        serviceKey: "snow_removal",
        profileVersion: 1,
        clientId: null,
        title: "Snow removal — Permission Fixture",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: 701,
      title: "Snow removal — Permission Fixture",
      clientId: null,
      propertyId: 101,
      status: "draft",
      subtotal: 100,
      total: 100,
    });
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0]).toMatchObject({
      table: estimatesTable,
      values: {
        propertyId: 101,
        status: "draft",
        calculationSnapshot: {
          propertyId: 101,
          measurementRevisionId: 201,
          serviceKey: "snow_removal",
          profileVersion: 1,
        },
      },
    });
    expectSelects(propertiesTable, propertyMeasurementRevisionsTable, servicePricingProfileVersionsTable);
  });

  it("keeps a prospect association and quote-stage history on a new estimate", async () => {
    h.property.prospectId = 601;
    const response = await request(app)
      .post("/aerial-quote/estimates")
      .send({
        businessId: 11,
        propertyId: 101,
        prospectId: 601,
        measurementRevisionId: 201,
        serviceKey: "snow_removal",
        profileVersion: 1,
        title: "Prospect snow quote",
      });

    expect(response.status).toBe(201);
    expect(response.body.prospectId).toBe(601);
    expect(h.inserts[0]).toMatchObject({
      table: estimatesTable,
      values: { prospectId: 601, propertyId: 101, clientId: null },
    });
    expect(h.updates[0]).toMatchObject({
      table: prospectsTable,
      values: { status: "quote_in_progress", linkedEstimateId: 701 },
    });
    expect(h.inserts[1]).toMatchObject({
      table: prospectEventsTable,
      values: { prospectId: 601, type: "estimate_linked", newValue: "Prospect snow quote" },
    });
    expectSelects(propertiesTable, propertyMeasurementRevisionsTable, servicePricingProfileVersionsTable, prospectsTable);
  });
});
