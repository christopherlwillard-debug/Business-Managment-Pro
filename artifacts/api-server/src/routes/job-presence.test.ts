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

describe("PUT /jobs/:jobId/production-presence/:date", () => {
  it("persists here with confirmed manual provenance and returns derived timing", async () => {
    h.selectQueue.push([job]);
    const saved = {
      id: 3,
      jobId: 11,
      date: "2026-09-04",
      state: "here",
      notHereReason: null,
      notes: null,
      source: "manual_presence",
      provenance: "confirmed",
      createdAt: new Date("2026-09-04T12:00:00Z"),
      createdByUserId: "user_1",
      createdByName: "Test User",
      updatedAt: new Date("2026-09-04T12:00:00Z"),
      updatedByUserId: "user_1",
      updatedByName: "Test User",
    };
    h.upsertRecords.push([saved]);
    h.selectQueue.push([saved]);

    const response = await request(app)
      .put("/jobs/11/production-presence/2026-09-04")
      .send({ state: "here" });

    expect(response.status).toBe(200);
    expect(h.insertPayloads[0]).toMatchObject({
      jobId: 11,
      date: "2026-09-04",
      state: "here",
      source: "manual_presence",
      provenance: "confirmed",
      createdByUserId: "user_1",
    });
    expect(response.body.record.state).toBe("here");
    expect(response.body.timing.actualProductionDays).toBe(1);
  });

  it("persists not_here with an optional reason and notes, and permits clearing to unrecorded", async () => {
    h.selectQueue.push([job]);
    const notHere = {
      id: 4,
      jobId: 11,
      date: "2026-09-05",
      state: "not_here",
      notHereReason: "material_delay",
      notes: "Waiting for trim",
      source: "manual_presence",
      provenance: "confirmed",
      createdAt: new Date("2026-09-05T12:00:00Z"),
      createdByUserId: "user_1",
      createdByName: "Test User",
      updatedAt: new Date("2026-09-05T12:00:00Z"),
      updatedByUserId: "user_1",
      updatedByName: "Test User",
    };
    h.upsertRecords.push([notHere]);
    h.selectQueue.push([notHere]);

    const notHereResponse = await request(app)
      .put("/jobs/11/production-presence/2026-09-05")
      .send({ state: "not_here", notHereReason: "material_delay", notes: "Waiting for trim" });

    expect(notHereResponse.status).toBe(200);
    expect(h.insertPayloads[0]).toMatchObject({
      state: "not_here",
      notHereReason: "material_delay",
      notes: "Waiting for trim",
    });

    h.selectQueue.push([job]);
    const unrecorded = { ...notHere, state: "unrecorded", notHereReason: null, notes: null };
    h.upsertRecords.push([unrecorded]);
    h.selectQueue.push([unrecorded]);

    const clearedResponse = await request(app)
      .put("/jobs/11/production-presence/2026-09-05")
      .send({ state: "unrecorded" });

    expect(clearedResponse.status).toBe(200);
    expect(h.insertPayloads[1]).toMatchObject({
      state: "unrecorded",
      notHereReason: null,
      notes: null,
    });
    expect(clearedResponse.body.record.state).toBe("unrecorded");
  });

  it("rejects an invalid reason and does not write", async () => {
    h.selectQueue.push([job]);

    const response = await request(app)
      .put("/jobs/11/production-presence/2026-09-06")
      .send({ state: "not_here", notHereReason: "crew_shortage" });

    expect(response.status).toBe(400);
    expect(h.insertPayloads).toHaveLength(0);
  });

  it("does not allow a cross-business mutation", async () => {
    h.selectQueue.push([{ ...job, businessId: 2 }]);

    const response = await request(app)
      .put("/jobs/11/production-presence/2026-09-06")
      .send({ state: "here" });

    expect(response.status).toBe(404);
    expect(h.insertPayloads).toHaveLength(0);
  });
});