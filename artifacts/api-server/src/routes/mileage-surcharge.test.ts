import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  insertReturnQueue: [] as any[][],
  updateReturnQueue: [] as any[][],
  updates: [] as any[],
  consumedSelectSlots: 0,
  missingSelectSlots: [] as number[],
  consumedInsertSlots: 0,
  missingInsertSlots: [] as number[],
  consumedUpdateSlots: 0,
  missingUpdateSlots: [] as number[],
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
        const slot = h.consumedSelectSlots++;
        const queued = h.selectQueue.shift();
        if (queued === undefined) {
          h.missingSelectSlots.push(slot);
          return Promise.reject(new Error(`[${h.scenario}] missing queued select slot [${slot}]`))
            .then(resolve, reject);
        }
        return Promise.resolve(queued).then(resolve, reject);
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
            const slot = h.consumedInsertSlots++;
            const queued = h.insertReturnQueue.shift();
            if (queued === undefined) {
              h.missingInsertSlots.push(slot);
              return Promise.reject(new Error(`[${h.scenario}] missing queued insert slot [${slot}]`));
            }
            return Promise.resolve(queued);
          },
        }),
      }),
      update: () => ({
        set: (data: any) => {
          h.updates.push(data);
          return {
            where: () => ({
              returning: () => {
                const slot = h.consumedUpdateSlots++;
                const queued = h.updateReturnQueue.shift();
                if (queued === undefined) {
                  h.missingUpdateSlots.push(slot);
                  return Promise.reject(new Error(`[${h.scenario}] missing queued update slot [${slot}]`));
                }
                return Promise.resolve(queued);
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
  h.selectQueue.length = 0;
  h.insertReturnQueue.length = 0;
  h.updateReturnQueue.length = 0;
  h.updates.length = 0;
  h.consumedSelectSlots = 0;
  h.missingSelectSlots.length = 0;
  h.consumedInsertSlots = 0;
  h.missingInsertSlots.length = 0;
  h.consumedUpdateSlots = 0;
  h.missingUpdateSlots.length = 0;
  h.scenario = "no request";
  vi.mocked(RoutingEngine.calculate).mockReset();
});

afterEach(() => {
  expect(h.missingSelectSlots, `[${h.scenario}] missing queued select slot(s)`).toHaveLength(0);
  expect(h.selectQueue, `[${h.scenario}] unconsumed queued select slot(s)`).toHaveLength(0);
  expect(h.missingInsertSlots, `[${h.scenario}] missing queued insert slot(s)`).toHaveLength(0);
  expect(h.insertReturnQueue, `[${h.scenario}] unconsumed queued insert slot(s)`).toHaveLength(0);
  expect(h.missingUpdateSlots, `[${h.scenario}] missing queued update slot(s)`).toHaveLength(0);
  expect(h.updateReturnQueue, `[${h.scenario}] unconsumed queued update slot(s)`).toHaveLength(0);
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
