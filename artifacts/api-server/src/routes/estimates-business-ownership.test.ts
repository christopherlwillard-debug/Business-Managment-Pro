import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  inserts: [] as any[],
  updates: [] as any[],
  whereClauses: [] as unknown[],
  snapshotHash: "test-hash",
}));

const generalContracting = { id: 7, slug: "general_contracting" };
const asphalt = { id: 9, slug: "asphalt_sealing" };

vi.mock("@workspace/db", () => ({
  db: {
    select: () => {
      const chain: any = {
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
        limit: () => Promise.resolve(h.selectQueue.shift() ?? []),
        where: (condition: unknown) => {
          h.whereClauses.push(condition);
          return Promise.resolve(h.selectQueue.shift() ?? []);
        },
      };
      return chain;
    },
    insert: () => ({
      values: (values: any) => {
        h.inserts.push(values);
        return {
          returning: async () => [{
            id: h.inserts.length + 100,
            createdAt: new Date("2026-11-10T12:00:00.000Z"),
            ...values,
          }],
        };
      },
    }),
    update: () => ({
      set: (values: any) => {
        h.updates.push(values);
        return { where: async () => undefined };
      },
    }),
  },
}));

vi.mock("../lib/estimateQuoteSnapshot.js", () => ({
  buildEstimateQuoteSnapshot: async () => ({ contentHash: h.snapshotHash }),
}));

vi.mock("../lib/business-scope.js", () => ({
  requestedBusinessReadScope: async (req: any) => {
    const businessId = Number(req.query?.businessId ?? req.body?.businessId ?? 0);
    const businessLine = String(req.query?.businessLine ?? req.body?.businessLine ?? "");
    if (businessId === 9 || businessLine === asphalt.slug) {
      return { id: 9, slug: asphalt.slug, memberIds: [9], memberSlugs: [asphalt.slug] };
    }
    if (businessId === 7 || businessLine === generalContracting.slug) {
      return { id: 7, slug: generalContracting.slug, memberIds: [7], memberSlugs: [generalContracting.slug] };
    }
    return null;
  },
  invalidBusinessScope: () => false,
  hasRequestedBusiness: (req: any) => Boolean(req.query?.businessId || req.query?.businessLine || req.body?.businessId || req.body?.businessLine),
  belongsToBusinessReadScope: (record: any, scope: any) => !scope
    || scope.memberIds.includes(Number(record.businessId))
    || scope.memberSlugs.includes(record.businessLine),
  resolveMutationBusiness: async (req: any) => {
    const businessId = req.body?.businessId;
    const businessLine = typeof req.body?.businessLine === "string"
      ? req.body.businessLine.trim()
      : "";
    const explicit = businessId != null || Boolean(businessLine);
    const byId = businessId == null
      ? undefined
      : [generalContracting, asphalt].find(business => business.id === Number(businessId));
    const bySlug = businessLine
      ? [generalContracting, asphalt].find(business => business.slug === businessLine)
      : undefined;
    if ((businessId != null && !byId) || (businessLine && !bySlug) || (byId && bySlug && byId.id !== bySlug.id)) {
      return { ok: false, error: "Unknown business" };
    }
    return {
      ok: true,
      explicit,
      business: byId ?? bySlug ?? generalContracting,
    };
  },
  canonicalRecordBusiness: async (record: any) => {
    const byId = record.businessId == null
      ? undefined
      : [generalContracting, asphalt].find(business => business.id === Number(record.businessId));
    const bySlug = record.businessLine
      ? [generalContracting, asphalt].find(business => business.slug === record.businessLine)
      : undefined;
    if (record.businessId == null && !record.businessLine) return { state: "blank" };
    if ((record.businessId != null && !byId) || (record.businessLine && !bySlug) || (byId && bySlug && byId.id !== bySlug.id)) {
      return { state: "invalid" };
    }
    return { state: "resolved", business: byId ?? bySlug };
  },
  generalContractingBusiness: async () => generalContracting,
}));

const { default: estimatesRouter } = await import("./estimates");
const app = express();
app.use(express.json());
app.use("/estimates", estimatesRouter);

const estimateRow = (overrides: Record<string, unknown> = {}) => ({
  id: 31,
  title: "Driveway quote",
  clientId: null,
  jobId: null,
  businessId: null,
  businessLine: "asphalt_sealing",
  status: "draft",
  subtotal: "100",
  markupPercent: null,
  contingencyPercent: null,
  total: "100",
  jobType: "Asphalt Sealing",
  notes: null,
  workAddress: null,
  customerNotes: null,
  lineItems: [],
  createdAt: new Date("2026-11-10T12:00:00.000Z"),
  ...overrides,
});

beforeEach(() => {
  h.selectQueue.length = 0;
  h.inserts.length = 0;
  h.updates.length = 0;
  h.whereClauses.length = 0;
  h.snapshotHash = "test-hash";
});

afterEach(() => {
  expect(h.selectQueue).toHaveLength(0);
});

describe("estimate canonical business ownership", () => {
  it("rejects a Kinora owner instead of storing it as a Willard estimate", async () => {
    const response = await request(app).post("/estimates").send({
      title: "Unrelated business quote",
      businessLine: "kinora",
      lineItems: [],
    });

    expect(response.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });

  it("creates estimates with a canonical owner resolved from the selected business line", async () => {
    const response = await request(app).post("/estimates").send({
      title: "Asphalt quote",
      businessLine: "asphalt_sealing",
      lineItems: [],
    });

    expect(response.status).toBe(201);
    expect(h.inserts[0]).toMatchObject({
      businessId: asphalt.id,
      businessLine: asphalt.slug,
    });
    expect(response.body.businessId).toBe(asphalt.id);
  });

  it("inherits the linked job owner instead of defaulting a job-card estimate to General Contracting", async () => {
    h.selectQueue.push(
      [{ id: 88, businessId: asphalt.id, businessLine: asphalt.slug }],
      [{ address: "42 Oak Rd", city: "Fairview", state: "IL" }],
    );

    const response = await request(app).post("/estimates").send({
      title: "Job-card estimate",
      jobId: 88,
      lineItems: [],
    });

    expect(response.status).toBe(201);
    expect(h.inserts[0]).toMatchObject({
      jobId: 88,
      businessId: asphalt.id,
      businessLine: asphalt.slug,
      workAddress: "42 Oak Rd, Fairview, IL",
    });
  });

  it("snapshots the selected client's address when the estimate has no work address", async () => {
    h.selectQueue.push(
      [{ id: 12, name: "Customer", address: "9 Cedar St", city: "Fairview", state: "IL", zip: "60000" }],
      [{ id: 12, name: "Customer" }],
    );

    const response = await request(app).post("/estimates").send({
      title: "Maintenance visit",
      clientId: 12,
      lineItems: [],
    });

    expect(response.status).toBe(201);
    expect(h.inserts[0].workAddress).toBe("9 Cedar St, Fairview, IL, 60000");
    expect(response.body.workAddress).toBe(h.inserts[0].workAddress);
  });

  it("stores customer-facing terms separately from private estimate notes", async () => {
    const response = await request(app).post("/estimates").send({
      title: "Service quote",
      notes: "Internal labor planning",
      customerNotes: "Payment is due after completion.",
      lineItems: [],
    });

    expect(response.status).toBe(201);
    expect(h.inserts[0]).toMatchObject({
      notes: "Internal labor planning",
      customerNotes: "Payment is due after completion.",
    });
    expect(response.body.customerNotes).toBe("Payment is due after completion.");
  });

  it("fills canonical ownership on an edited legacy estimate from its saved business line", async () => {
    h.selectQueue.push(
      [estimateRow({ workAddress: "Saved job location", customerNotes: "Saved terms" })],
      [estimateRow({ businessId: asphalt.id, workAddress: "Saved job location", customerNotes: "Saved terms" })],
    );

    const response = await request(app).put("/estimates/31").send({
      title: "Updated driveway quote",
      status: "draft",
      lineItems: [],
    });

    expect(response.status).toBe(200);
    expect(h.updates[0]).toMatchObject({
      businessId: asphalt.id,
      businessLine: asphalt.slug,
      workAddress: "Saved job location",
      customerNotes: "Saved terms",
    });
    expect(response.body.businessId).toBe(asphalt.id);
  });

  it("converts a legacy estimate using its saved business line without backfilling historical estimates", async () => {
    h.selectQueue.push(
      [estimateRow({ workAddress: "Saved job location" })],
      [
        { id: 501, estimateId: 31, revision: 1, eventType: "revision", contentHash: "test-hash", requestedAt: new Date("2026-11-10T12:00:00.000Z") },
        { id: 502, estimateId: 31, revisionSnapshotId: 501, revision: 1, eventType: "response", responseType: "approved", requestedAt: new Date("2026-11-10T13:00:00.000Z") },
        { id: 503, estimateId: 31, revisionSnapshotId: 501, revision: 1, eventType: "work_authorization", requestedAt: new Date("2026-11-10T14:00:00.000Z") },
      ],
      [{ id: asphalt.id, name: "Asphalt" }],
      [{ id: 1 }],
    );

    const response = await request(app).post("/estimates/31/convert-to-job").send({ businessLine: asphalt.slug });

    expect(response.status).toBe(201);
    expect(h.inserts[0]).toMatchObject({
      businessId: asphalt.id,
      businessLine: asphalt.slug,
      address: "Saved job location",
    });
    expect(h.updates).toEqual([{ status: "won" }]);
  });

  it("does not create a job until the current accepted revision is explicitly authorized", async () => {
    h.selectQueue.push(
      [estimateRow()],
      [{ id: 501, estimateId: 31, revision: 1, eventType: "revision", requestedAt: new Date("2026-11-10T12:00:00.000Z") }],
    );

    const response = await request(app).post("/estimates/31/convert-to-job").send({ businessLine: asphalt.slug });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("work authorization");
    expect(h.inserts).toHaveLength(0);
  });

  it("blocks conversion when the estimate no longer matches its authorized revision", async () => {
    h.snapshotHash = "changed-after-acceptance";
    h.selectQueue.push(
      [estimateRow()],
      [
        { id: 501, estimateId: 31, revision: 1, eventType: "revision", contentHash: "test-hash", requestedAt: new Date("2026-11-10T12:00:00.000Z") },
        { id: 502, estimateId: 31, revisionSnapshotId: 501, revision: 1, eventType: "response", responseType: "approved", requestedAt: new Date("2026-11-10T13:00:00.000Z") },
        { id: 503, estimateId: 31, revisionSnapshotId: 501, revision: 1, eventType: "work_authorization", requestedAt: new Date("2026-11-10T14:00:00.000Z") },
      ],
      [{ id: asphalt.id, name: "Asphalt" }],
      [{ id: 1 }],
    );

    const response = await request(app).post("/estimates/31/convert-to-job").send({ businessLine: asphalt.slug });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("estimate changed");
    expect(h.inserts).toHaveLength(0);
  });
});
