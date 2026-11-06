import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createStrictQueryQueue } from "../test/strict-query-queue";

const h = vi.hoisted(() => ({
  selectQueue: undefined as any,
  insertReturnQueue: undefined as any,
  updateReturnQueue: undefined as any,
  updates: [] as any[],
  scenario: "no request",
}));

vi.mock("@workspace/db", () => {
  function chain() {
    const c: any = {
      from: () => c,
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      then(resolve: (value: any) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve(h.selectQueue.take(h.scenario)).then(resolve, reject);
      },
    };
    return c;
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: () => ({
          returning: () => {
            return Promise.resolve(h.insertReturnQueue.take(h.scenario));
          },
        }),
      }),
      update: () => ({
        set: (data: any) => {
          h.updates.push(data);
          return {
            where: () => ({
              returning: () => {
                return Promise.resolve(h.updateReturnQueue.take(h.scenario));
              },
            }),
          };
        },
      }),
    },
  };
});

vi.mock("../lib/routing-engine.js", () => ({
  RoutingEngine: { calculate: vi.fn() },
}));
vi.mock("../geocode-helpers", () => ({
  censusGeocode: vi.fn(),
  nominatimGeocode: vi.fn(),
}));

const { default: clientsRouter } = await import("./clients");
const { default: geocodeRouter } = await import("./geocode");
const { RoutingEngine } = await import("../lib/routing-engine.js");
const app = express();
app.use(express.json());
app.use((_req, _res, next) => {
  h.scenario = `${_req.method} ${_req.path}`;
  next();
});
app.use("/clients", clientsRouter);
app.use("/", geocodeRouter);

const createdAt = new Date("2026-08-20T00:00:00.000Z");
const client = {
  id: 7,
  name: "Threshold Client",
  createdAt,
  mileageSurchargeEnabled: true,
  mileageSurchargeTriggerMiles: "60.00",
  mileageSurchargeDailyRate: "150.00",
};

beforeEach(() => {
  h.selectQueue = createStrictQueryQueue<any[]>({ kind: "select" });
  h.insertReturnQueue = createStrictQueryQueue<any[]>({
    kind: "mutation-return",
    label: "insert",
  });
  h.updateReturnQueue = createStrictQueryQueue<any[]>({
    kind: "mutation-return",
    label: "update",
  });
  h.updates.length = 0;
  h.scenario = "no request";
  vi.mocked(RoutingEngine.calculate).mockReset();
});

afterEach(() => {
  h.selectQueue.assertConsumed(h.scenario);
  h.insertReturnQueue.assertConsumed(h.scenario);
  h.updateReturnQueue.assertConsumed(h.scenario);
});

describe("mileage surcharge settings and route qualification", () => {
  it("accepts and returns enabled, threshold, and daily-rate settings", async () => {
    h.selectQueue.push([{ id: 1, slug: "general_contracting" }]);
    h.insertReturnQueue.push([client]);
    const created = await request(app).post("/clients").send({
      name: client.name,
      mileageSurchargeEnabled: true,
      mileageSurchargeTriggerMiles: 60,
      mileageSurchargeDailyRate: 150,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      mileageSurchargeEnabled: true,
      mileageSurchargeTriggerMiles: "60.00",
      mileageSurchargeDailyRate: "150.00",
    });
    expect(h.updates).toHaveLength(0);

    h.selectQueue.push([{ id: 1, slug: "general_contracting" }]);
    h.selectQueue.push([client]);
    h.updateReturnQueue.push([client]);
    const updated = await request(app).put("/clients/7").send({
      sourceBusinessId: 1,
      sourceBusinessLine: "general_contracting",
      mileageSurchargeEnabled: true,
      mileageSurchargeTriggerMiles: 60,
      mileageSurchargeDailyRate: 150,
    });
    expect(updated.status).toBe(200);
    expect(h.updates[0]).toMatchObject({
      mileageSurchargeEnabled: true,
      mileageSurchargeTriggerMiles: 60,
      mileageSurchargeDailyRate: 150,
    });
  });

  it.each([
    [60, true],
    [59.99, false],
  ])("qualifies at %s miles exactly as configured", async (miles, qualifies) => {
    h.selectQueue.push([client]);
    h.selectQueue.push([{
      id: 8,
      address: "8 Job St",
      city: "Evansville",
      state: "IN",
    }]);
    vi.mocked(RoutingEngine.calculate).mockResolvedValue({
      miles,
      durationMinutes: 60,
      routeStatus: "ok",
      provider: "osrm",
      cached: false,
    });

    const res = await request(app).get("/route-distance?clientId=7&jobId=8");
    expect(res.status).toBe(200);
    expect(res.body.surcharge).toMatchObject({
      enabled: true,
      triggerMiles: 60,
      dailyRate: 150,
      qualifies,
    });
  });
});
