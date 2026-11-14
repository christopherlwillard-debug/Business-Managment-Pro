import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  consumedSlots: 0,
  missingSlots: [] as number[],
  scope: { id: 1, slug: "general_contracting" } as { id: number; slug: string } | null,
  insertPayloads: [] as any[],
  upsertRecords: [] as any[][],
}));

vi.mock("@workspace/db", () => {
  function selectChain() {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then(resolve: (value: any) => any, reject: (error: any) => any) {
        const slot = h.consumedSlots++;
        const queued = h.selectQueue.shift();
        if (queued === undefined) {
          h.missingSlots.push(slot);
          return Promise.reject(new Error(`missing queued query slot [${slot}]`)).then(resolve, reject);
        }
        return Promise.resolve(queued).then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    db: {
      select: () => selectChain(),
      insert: () => ({
        values: (payload: any) => {
          h.insertPayloads.push(payload);
          return {
            onConflictDoUpdate: () => ({
              returning: () => Promise.resolve(h.upsertRecords.shift() ?? []),
            }),
          };
        },
      }),
    },
  };
});

vi.mock("../lib/business-scope.js", () => ({
  hasRequestedBusiness: () => false,
  requestedBusiness: async () => h.scope,
  invalidBusinessScope: () => false,
  belongsToBusiness: (record: { businessId?: number | null; businessLine?: string | null }, scope: { id: number; slug: string } | null) =>
    !scope || (record.businessId != null ? record.businessId === scope.id : record.businessLine === scope.slug),
}));

vi.mock("../routes/guards", () => ({
  getRequestUser: () => ({ id: "user_1", firstName: "Test", lastName: "User" }),
}));

const { default: jobPresenceRouter } = await import("./job-presence");

const app = express();
app.use(express.json());
app.use("/jobs", jobPresenceRouter);

beforeEach(() => {
  h.selectQueue.length = 0;
  h.consumedSlots = 0;
  h.missingSlots.length = 0;
  h.scope = { id: 1, slug: "general_contracting" };
  h.insertPayloads.length = 0;
  h.upsertRecords.length = 0;
});

afterEach(() => {
  expect(h.missingSlots).toHaveLength(0);
  expect(h.selectQueue).toHaveLength(0);
});

const job = {
  id: 11,
  title: "Presence job",
  businessId: 1,
  businessLine: "general_contracting",
  daysOnJob: 3,
};

describe("GET /jobs/production-presence", () => {
  it("returns persisted states and live timing without writing or inferring absence", async () => {
    h.selectQueue.push([job]);
    h.selectQueue.push([
      {
        id: 1,
        jobId: 11,
        date: "2026-09-02",
        state: "here",
        notHereReason: null,
        notes: null,
        source: "manual_presence",
        provenance: "confirmed",
        createdAt: new Date("2026-09-02T12:00:00Z"),
        createdByUserId: "user_1",
        createdByName: "Test User",
        updatedAt: new Date("2026-09-02T12:00:00Z"),
        updatedByUserId: "user_1",
        updatedByName: "Test User",
      },
      {
        id: 2,
        jobId: 11,
        date: "2026-09-03",
        state: "not_here",
        notHereReason: "weather",
        notes: "Rain",
        source: "manual_presence",
        provenance: "confirmed",
        createdAt: new Date("2026-09-03T12:00:00Z"),
        createdByUserId: "user_1",
        createdByName: "Test User",
        updatedAt: new Date("2026-09-03T12:00:00Z"),
        updatedByUserId: "user_1",
        updatedByName: "Test User",
      },
    ]);

    const response = await request(app).get("/jobs/production-presence?jobIds=11");

    expect(response.status).toBe(200);
    expect(response.body.jobs[0].records.map((record: any) => record.state)).toEqual(["here", "not_here"]);
    expect(response.body.jobs[0].records[1]).toMatchObject({
      notHereReason: "weather",
      notes: "Rain",
      source: "manual_presence",
      provenance: "confirmed",
    });
    expect(response.body.jobs[0].timing).toMatchObject({
      actualProductionStartDate: "2026-09-02",
      lastWorkDate: "2026-09-02",
      calendarSpanDays: 1,
      actualProductionDays: 1,
      pausedNotHereDays: 0,
      productionDayVariance: -2,
    });
    expect(h.insertPayloads).toHaveLength(0);
  });

  it("rejects a job from another business", async () => {
    h.selectQueue.push([{ ...job, businessId: 2 }]);

    const response = await request(app).get("/jobs/production-presence?jobIds=11");

    expect(response.status).toBe(200);
    expect(response.body.jobs).toEqual([]);
    expect(h.consumedSlots).toBe(1);
  });
});

describe("retired workday writes", () => {
  it("rejects manual presence writes without touching stored history", async () => {
    const response = await request(app)
      .put("/jobs/11/production-presence/2026-09-04")
      .send({ state: "here" });

    expect(response.status).toBe(410);
    expect(response.body.code).toBe("WORKDAY_TRACKING_RETIRED");
    expect(h.selectQueue).toHaveLength(0);
    expect(h.insertPayloads).toHaveLength(0);
  });

  it("rejects Start Work Today without changing job status or presence", async () => {
    const response = await request(app)
      .post("/jobs/11/workday/start")
      .send({ date: "2026-09-04" });

    expect(response.status).toBe(410);
    expect(response.body.code).toBe("WORKDAY_TRACKING_RETIRED");
    expect(h.selectQueue).toHaveLength(0);
    expect(h.insertPayloads).toHaveLength(0);
  });

  it("rejects Done for Today without changing a presence row", async () => {
    const response = await request(app)
      .post("/jobs/11/workday/end")
      .send({ date: "2026-09-04" });

    expect(response.status).toBe(410);
    expect(response.body.code).toBe("WORKDAY_TRACKING_RETIRED");
    expect(h.selectQueue).toHaveLength(0);
    expect(h.insertPayloads).toHaveLength(0);
  });
});