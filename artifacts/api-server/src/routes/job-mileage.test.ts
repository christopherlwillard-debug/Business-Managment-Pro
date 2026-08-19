import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  routeQueue: [] as any[],
  inserts: [] as any[],
  updates: [] as any[],
  nextId: 1000,
}));

vi.mock("@workspace/db", () => {
  function makeSelectChain() {
    const chain: any = {
      from: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then(resolve: (value: any) => any, reject: (reason: any) => any) {
        return Promise.resolve(h.selectQueue.shift() ?? []).then(resolve, reject);
      },
    };
    return chain;
  }

  const database: any = {
    select: () => makeSelectChain(),
    insert: () => ({
      values: (values: any) => {
        h.inserts.push(values);
        const query: any = {
          returning: () => Promise.resolve([{ id: h.nextId++ }]),
          then(resolve: (value: any) => any, reject: (reason: any) => any) {
            return Promise.resolve([]).then(resolve, reject);
          },
        };
        return query;
      },
    }),
    update: () => ({
      set: (values: any) => {
        h.updates.push(values);
        return { where: () => Promise.resolve([]) };
      },
    }),
    execute: () => Promise.resolve(),
  };
  database.transaction = (callback: (tx: any) => Promise<any>) => callback(database);

  return { db: database };
});

vi.mock("../lib/routing-engine.js", () => ({
  RoutingEngine: {
    calculate: vi.fn(async () =>
      h.routeQueue.shift() ?? {
        miles: null,
        durationMinutes: null,
        routeStatus: "routing_failed",
      }),
  },
}));

vi.mock("./mileage", () => ({
  getIrsRateForDate: () => 0.76,
}));

vi.mock("./guards", () => ({
  wrapAsync: (handler: any) => (req: any, res: any, next: any) =>
    Promise.resolve(handler(req, res, next)).catch(next),
}));

const { default: jobMileageRouter } = await import("./job-mileage");

const app = express();
app.use(express.json());
app.use("/", jobMileageRouter);

const JOB_ID = 1959;
const BUSINESS_ID = 7;
const JOBSITE = "17402 Tennessee Road, Evansville, IN";
const CLIENT = "Clayton Homes Evansville, Evansville, IN, 47715";
const BUSINESS = "2504 Krauss Court, Owensboro, KY, 42301";

function jobRow(overrides: Record<string, any> = {}) {
  return {
    jobId: JOB_ID,
    jobTitle: "Napier",
    clientId: 44,
    businessLine: "general_contractor",
    jobAddress: "17402 Tennessee Road",
    jobCity: "Evansville",
    jobState: "IN",
    startDate: "2026-08-19",
    clientName: "Clayton Homes Evansville",
    clientAddress: "Clayton Homes Evansville",
    clientCity: "Evansville",
    clientState: "IN",
    clientZip: "47715",
    ...overrides,
  };
}

function settingsRow(overrides: Record<string, any> = {}) {
  return {
    companyAddress: "2504 Krauss Court",
    companyCity: "Owensboro",
    companyState: "KY",
    companyZip: "42301",
    ...overrides,
  };
}

function okRoute(miles: number) {
  return { miles, durationMinutes: 30, routeStatus: "ok" };
}

function generatedLog(
  source: "job_client_route" | "job_business_route",
  overrides: Record<string, any> = {},
) {
  const clientLeg = source === "job_client_route";
  const miles = clientLeg ? 12.4 : 38.6;
  return {
    id: clientLeg ? 501 : 502,
    date: "2026-08-19",
    startLocation: clientLeg ? CLIENT : BUSINESS,
    endLocation: JOBSITE,
    miles: miles.toFixed(2),
    purpose: `${clientLeg ? "Client location" : "Business address"} to jobsite — Napier`,
    jobId: JOB_ID,
    businessId: BUSINESS_ID,
    classification: "business",
    ratePerMile: "0.760",
    deductionAmount: (miles * 0.76).toFixed(2),
    notes: "Generated from the job card.",
    source,
    expenseId: clientLeg ? 601 : 602,
    createdAt: new Date("2026-08-19T12:00:00Z"),
    ...overrides,
  };
}

function queueGet(
  options: {
    job?: Record<string, any>;
    settings?: Record<string, any>;
    business?: Record<string, any>;
    existing?: any[];
  } = {},
) {
  h.selectQueue.push(
    [options.job ?? jobRow()],
    [options.settings ?? settingsRow()],
    [options.business ?? { id: BUSINESS_ID }],
    options.existing ?? [],
  );
}

function queuePost(options: {
  job?: Record<string, any>;
  settings?: Record<string, any>;
  business?: Record<string, any>;
  initial?: any[];
  locked?: any[];
  refreshed?: any[];
} = {}) {
  h.selectQueue.push(
    [options.job ?? jobRow()],
    [options.settings ?? settingsRow()],
    [options.business ?? { id: BUSINESS_ID }],
    options.initial ?? [],
    options.locked ?? [],
    options.refreshed ?? [],
  );
}

beforeEach(() => {
  h.selectQueue.length = 0;
  h.routeQueue.length = 0;
  h.inserts.length = 0;
  h.updates.length = 0;
  h.nextId = 1000;
});

describe("GET /jobs/:jobId/legs", () => {
  it("returns both valid one-way mileage legs", async () => {
    queueGet();
    h.routeQueue.push(okRoute(12.4), okRoute(38.6));

    const response = await request(app).get(`/jobs/${JOB_ID}/legs`);

    expect(response.status).toBe(200);
    expect(response.body.legs).toEqual([
      expect.objectContaining({
        kind: "client_to_jobsite",
        status: "ready",
        origin: CLIENT,
        destination: JOBSITE,
        miles: 12.4,
      }),
      expect.objectContaining({
        kind: "business_to_jobsite",
        status: "ready",
        origin: BUSINESS,
        destination: JOBSITE,
        miles: 38.6,
      }),
    ]);
  });

  it("reports a missing client address without hiding the business leg", async () => {
    queueGet({
      job: jobRow({
        clientAddress: null,
        clientCity: null,
        clientState: null,
        clientZip: null,
      }),
    });
    h.routeQueue.push(okRoute(38.6));

    const response = await request(app).get(`/jobs/${JOB_ID}/legs`);

    expect(response.status).toBe(200);
    expect(response.body.legs[0]).toEqual(expect.objectContaining({
      status: "missing_origin",
      message: expect.stringContaining("Clayton Homes Evansville"),
    }));
    expect(response.body.legs[1]).toEqual(expect.objectContaining({
      status: "ready",
      miles: 38.6,
    }));
  });

  it("reports a missing business address without hiding the client leg", async () => {
    queueGet({
      settings: settingsRow({
        companyAddress: null,
        companyCity: null,
        companyState: null,
        companyZip: null,
      }),
    });
    h.routeQueue.push(okRoute(12.4));

    const response = await request(app).get(`/jobs/${JOB_ID}/legs`);

    expect(response.status).toBe(200);
    expect(response.body.legs[0]).toEqual(expect.objectContaining({
      status: "ready",
      miles: 12.4,
    }));
    expect(response.body.legs[1]).toEqual(expect.objectContaining({
      status: "missing_origin",
      message: "Add an address to this business or set the company address in Settings.",
    }));
  });

  it("uses the resolved business address before the global Settings fallback", async () => {
    queueGet({
      business: {
        id: BUSINESS_ID,
        address: "88 Division Street",
        city: "Evansville",
        state: "IN",
        zip: "47711",
      },
    });
    h.routeQueue.push(okRoute(12.4), okRoute(5.2));

    const response = await request(app).get(`/jobs/${JOB_ID}/legs`);

    expect(response.status).toBe(200);
    expect(response.body.legs[1]).toEqual(expect.objectContaining({
      origin: "88 Division Street, Evansville, IN, 47711",
      miles: 5.2,
    }));
  });

  it("reports a missing jobsite address for both legs", async () => {
    queueGet({
      job: jobRow({ jobAddress: null, jobCity: null, jobState: null }),
    });

    const response = await request(app).get(`/jobs/${JOB_ID}/legs`);

    expect(response.status).toBe(200);
    expect(response.body.legs.map((leg: any) => leg.status)).toEqual([
      "missing_destination",
      "missing_destination",
    ]);
    expect(h.routeQueue).toHaveLength(0);
  });

  it("returns an actionable routing failure for both legs", async () => {
    queueGet();
    h.routeQueue.push(
      { miles: null, durationMinutes: null, routeStatus: "geocoding_failed" },
      { miles: null, durationMinutes: null, routeStatus: "routing_failed" },
    );

    const response = await request(app).get(`/jobs/${JOB_ID}/legs`);

    expect(response.status).toBe(200);
    expect(response.body.legs.map((leg: any) => leg.status)).toEqual([
      "route_unavailable",
      "route_unavailable",
    ]);
    expect(response.body.legs[0].message).toContain("Check both street addresses");
    expect(response.body.legs[1].message).toContain("Try refreshing");
  });
});

describe("POST /jobs/:jobId/legs/sync", () => {
  it("creates two generated logs and two linked IRS mileage expenses", async () => {
    const refreshed = [
      generatedLog("job_client_route"),
      generatedLog("job_business_route"),
    ];
    queuePost({ refreshed });
    h.routeQueue.push(
      okRoute(12.4),
      okRoute(38.6),
      okRoute(12.4),
      okRoute(38.6),
    );

    const response = await request(app).post(`/jobs/${JOB_ID}/legs/sync`);

    expect(response.status).toBe(200);
    expect(response.body.legs.map((leg: any) => leg.action)).toEqual([
      "created",
      "created",
    ]);
    expect(h.inserts.filter(value => value.sourceType)).toHaveLength(2);
    expect(h.inserts.filter(value => value.source)).toEqual([
      expect.objectContaining({
        source: "job_client_route",
        expenseId: expect.any(Number),
      }),
      expect.objectContaining({
        source: "job_business_route",
        expenseId: expect.any(Number),
      }),
    ]);
  });

  it("does not insert or update anything on a repeated sync", async () => {
    const existing = [
      generatedLog("job_client_route"),
      generatedLog("job_business_route"),
    ];
    queuePost({ initial: existing, locked: existing, refreshed: existing });
    h.routeQueue.push(
      okRoute(12.4),
      okRoute(38.6),
      okRoute(12.4),
      okRoute(38.6),
    );

    const response = await request(app).post(`/jobs/${JOB_ID}/legs/sync`);

    expect(response.status).toBe(200);
    expect(response.body.legs.map((leg: any) => leg.action)).toEqual([
      "unchanged",
      "unchanged",
    ]);
    expect(h.inserts).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
  });

  it("updates generated rows when an address changes", async () => {
    const oldClientLog = generatedLog("job_client_route", {
      startLocation: "Old client address",
    });
    const currentBusinessLog = generatedLog("job_business_route");
    const refreshed = [
      generatedLog("job_client_route"),
      currentBusinessLog,
    ];
    queuePost({
      initial: [oldClientLog, currentBusinessLog],
      locked: [oldClientLog, currentBusinessLog],
      refreshed,
    });
    h.routeQueue.push(
      okRoute(12.4),
      okRoute(38.6),
      okRoute(12.4),
      okRoute(38.6),
    );

    const response = await request(app).post(`/jobs/${JOB_ID}/legs/sync`);

    expect(response.status).toBe(200);
    expect(response.body.legs.map((leg: any) => leg.action)).toEqual([
      "updated",
      "unchanged",
    ]);
    expect(h.updates).toContainEqual(expect.objectContaining({
      source: "job_client_route",
      startLocation: CLIENT,
    }));
  });

  it("leaves manual or imported mileage untouched", async () => {
    const manual = {
      ...generatedLog("job_client_route"),
      id: 900,
      source: "manual",
      expenseId: 901,
    };
    const refreshed = [
      generatedLog("job_client_route"),
      generatedLog("job_business_route"),
    ];
    queuePost({ initial: [manual], locked: [manual], refreshed });
    h.routeQueue.push(
      okRoute(12.4),
      okRoute(38.6),
      okRoute(12.4),
      okRoute(38.6),
    );

    const response = await request(app).post(`/jobs/${JOB_ID}/legs/sync`);

    expect(response.status).toBe(200);
    expect(h.updates).toHaveLength(0);
    expect(h.inserts.filter(value => value.source)).toHaveLength(2);
    expect(h.inserts.some(value => value.source === "manual")).toBe(false);
  });
});