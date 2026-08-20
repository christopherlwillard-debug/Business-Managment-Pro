import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  insertReturnQueue: [] as any[][],
  updateReturnQueue: [] as any[][],
  updates: [] as any[],
}));

vi.mock("@workspace/db", () => {
  function chain() {
    const c: any = {
      from: () => c,
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      then(resolve: (value: any) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve(h.selectQueue.shift() ?? []).then(resolve, reject);
      },
    };
    return c;
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve(h.insertReturnQueue.shift() ?? []),
        }),
      }),
      update: () => ({
        set: (data: any) => {
          h.updates.push(data);
          return {
            where: () => ({
              returning: () => Promise.resolve(h.updateReturnQueue.shift() ?? []),
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
  h.selectQueue.length = 0;
  h.insertReturnQueue.length = 0;
  h.updateReturnQueue.length = 0;
  h.updates.length = 0;
  vi.mocked(RoutingEngine.calculate).mockReset();
});

describe("mileage surcharge settings and route qualification", () => {
  it("accepts and returns enabled, threshold, and daily-rate settings", async () => {
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

    h.updateReturnQueue.push([client]);
    const updated = await request(app).put("/clients/7").send({
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
