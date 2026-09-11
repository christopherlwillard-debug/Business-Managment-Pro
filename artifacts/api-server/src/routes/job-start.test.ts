import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  consumed: 0,
  missing: [] as number[],
  updatePayloads: [] as Record<string, unknown>[],
  updatedRows: [] as unknown[],
}));

vi.mock("@workspace/db", () => {
  function selectChain() {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        const slot = h.consumed++;
        const result = h.selectQueue.shift();
        if (result === undefined) {
          h.missing.push(slot);
          return Promise.reject(new Error(`missing queued query slot [${slot}]`)).then(resolve, reject);
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    db: {
      select: () => selectChain(),
      update: () => ({
        set: (payload: Record<string, unknown>) => {
          h.updatePayloads.push(payload);
          return {
            where: () => ({
              returning: () => Promise.resolve(h.updatedRows),
            }),
          };
        },
      }),
    },
  };
});

vi.mock("../lib/business-scope.js", () => ({
  requestedBusiness: async () => ({ id: 1, slug: "general_contracting" }),
  belongsToBusiness: (record: { businessId?: number | null }, scope: { id: number }) => record.businessId === scope.id,
  invalidBusinessScope: () => false,
  resolveMutationBusiness: async () => ({
    ok: true,
    explicit: false,
    business: { id: 1, slug: "general_contracting" },
  }),
  canonicalRecordBusiness: async (record: { businessId?: number | null }) => ({
    state: "resolved",
    business: { id: record.businessId ?? 1, slug: "general_contracting" },
  }),
}));

vi.mock("./guards", () => ({ getRequestUser: () => ({ id: "user_1", firstName: "Test", lastName: "User" }) }));

const { default: jobsRouter } = await import("./jobs");
const app = express();
app.use(express.json());
app.use("/jobs", jobsRouter);

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 51,
    title: "Ready production job",
    status: "scheduled",
    businessId: 1,
    businessLine: "general_contracting",
    startDate: null,
    endDate: "2026-09-20",
    closedAt: null,
    planningState: "ready",
    ...overrides,
  };
}

beforeEach(() => {
  h.selectQueue.length = 0;
  h.consumed = 0;
  h.missing.length = 0;
  h.updatePayloads.length = 0;
  h.updatedRows.length = 0;
});

afterEach(() => {
  expect(h.missing).toHaveLength(0);
  expect(h.selectQueue).toHaveLength(0);
});

describe("POST /jobs/:id/start", () => {
  it("writes only the requested start date and scheduled planning state", async () => {
    const existing = job();
    const updated = job({ startDate: "2026-09-12", planningState: "scheduled" });
    h.selectQueue.push([existing], [existing], []);
    h.updatedRows.push(updated);

    const response = await request(app)
      .post("/jobs/51/start")
      .send({ startDate: "2026-09-12" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      id: 51,
      startDate: "2026-09-12",
      planningState: "scheduled",
    }));
    expect(h.updatePayloads).toEqual([{ startDate: "2026-09-12", planningState: "scheduled" }]);
  });

  it("rejects waiting jobs without changing their state or readiness history", async () => {
    const waiting = job({ planningState: "waiting" });
    h.selectQueue.push([waiting], [waiting]);

    const response = await request(app)
      .post("/jobs/51/start")
      .send({ startDate: "2026-09-12" });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("ready to schedule");
    expect(h.updatePayloads).toHaveLength(0);
  });

  it("rejects a ready job with an active blocker without clearing or scheduling it", async () => {
    const existing = job();
    h.selectQueue.push([existing], [existing], [{ id: 220 }]);

    const response = await request(app)
      .post("/jobs/51/start")
      .send({ startDate: "2026-09-12" });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("readiness blocker");
    expect(h.updatePayloads).toHaveLength(0);
  });

  it("denies a job owned by another business before attempting the transition", async () => {
    h.selectQueue.push([job({ businessId: 2 })]);

    const response = await request(app)
      .post("/jobs/51/start")
      .send({ startDate: "2026-09-12" });

    expect(response.status).toBe(404);
    expect(h.updatePayloads).toHaveLength(0);
  });
});