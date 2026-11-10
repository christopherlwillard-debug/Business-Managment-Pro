import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  inserts: [] as any[],
  updates: [] as any[],
  whereClauses: [] as unknown[],
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

vi.mock("../lib/business-scope.js", () => ({
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
  lineItems: [],
  createdAt: new Date("2026-11-10T12:00:00.000Z"),
  ...overrides,
});

beforeEach(() => {
  h.selectQueue.length = 0;
  h.inserts.length = 0;
  h.updates.length = 0;
  h.whereClauses.length = 0;
});

afterEach(() => {
  expect(h.selectQueue).toHaveLength(0);
});

describe("estimate canonical business ownership", () => {
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
    h.selectQueue.push([{ id: 88, businessId: asphalt.id, businessLine: asphalt.slug }]);

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
    });
  });

  it("fills canonical ownership on an edited legacy estimate from its saved business line", async () => {
    h.selectQueue.push(
      [estimateRow()],
      [estimateRow({ businessId: asphalt.id })],
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
    });
    expect(response.body.businessId).toBe(asphalt.id);
  });

  it("converts a legacy estimate using its saved business line without backfilling historical estimates", async () => {
    h.selectQueue.push([estimateRow()]);

    const response = await request(app).post("/estimates/31/convert-to-job");

    expect(response.status).toBe(201);
    expect(h.inserts[0]).toMatchObject({
      businessId: asphalt.id,
      businessLine: asphalt.slug,
    });
    expect(h.updates).toEqual([{ status: "won" }]);
  });
});
