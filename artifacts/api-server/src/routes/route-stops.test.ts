import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  routeStopsTable: {
    id: "route_stops.id",
    clientId: "route_stops.client_id",
    jobId: "route_stops.job_id",
    scheduledDate: "route_stops.scheduled_date",
    sortOrder: "route_stops.sort_order",
    createdAt: "route_stops.created_at",
    lat: "route_stops.lat",
    lng: "route_stops.lng",
    address: "route_stops.address",
  },
  jobsTable: {
    id: "jobs.id",
    clientId: "jobs.client_id",
    businessLine: "jobs.business_line",
    sqFt: "jobs.sq_ft",
    coats: "jobs.coats",
  },
  clientsTable: { id: "clients.id", name: "clients.name" },
  prospectsTable: { id: "prospects.id", contactName: "prospects.contact_name", address: "prospects.address" },
  jobs: [] as Array<{ id: number; clientId: number | null; businessLine?: string | null }>,
  stops: [] as Array<{ id: number; clientId: number | null; jobId: number | null; scheduledDate?: string | null; sortOrder?: number | null; lat?: number | null; lng?: number | null; address?: string; createdAt: Date }>,
  blockUpdates: [] as Array<{ values: any; condition: any }>,
  transactionCalls: 0,
  geocodeResult: null as { lat: number; lng: number } | null,
  geocodeCalls: 0,
  insertedStop: null as any,
  updatedStop: null as any,
  insertValues: null as any,
  updateValues: null as any,
}));

vi.mock("@workspace/db/schema", () => ({
  routeStopsTable: h.routeStopsTable,
  jobsTable: h.jobsTable,
  clientsTable: h.clientsTable,
  prospectsTable: h.prospectsTable,
}));

vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ operator: "eq", column, value }),
  and: (...conditions: unknown[]) => ({ operator: "and", conditions }),
  gte: (...args: unknown[]) => ({ operator: "gte", args }),
  lte: (...args: unknown[]) => ({ operator: "lte", args }),
  isNull: (column: unknown) => ({ operator: "isNull", column }),
  or: (...conditions: unknown[]) => ({ operator: "or", conditions }),
  asc: (column: unknown) => ({ operator: "asc", column }),
}));

vi.mock("../geocode-helpers", () => ({
  geocodeAddressString: vi.fn(async () => {
    h.geocodeCalls += 1;
    return h.geocodeResult;
  }),
}));

vi.mock("@workspace/db", () => {
  const db = {
    select: () => {
      let table: unknown;
      let condition: any;
      const chain: any = {
        from(value: unknown) { table = value; return chain; },
        where(value: unknown) { condition = value; return chain; },
        orderBy() { return chain; },
        then(resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) {
          let rows: any[] = table === h.jobsTable
            ? [...h.jobs]
            : table === h.routeStopsTable
              ? [...h.stops]
              : [];
          const fieldFor = (column: unknown) =>
            column === h.jobsTable.id || column === h.routeStopsTable.id ? "id"
              : column === h.jobsTable.businessLine ? "businessLine"
              : column === h.routeStopsTable.clientId ? "clientId"
                : column === h.routeStopsTable.jobId ? "jobId"
                  : column === h.routeStopsTable.scheduledDate ? "scheduledDate"
                    : column === h.routeStopsTable.lat ? "lat"
                      : column === h.routeStopsTable.lng ? "lng"
                        : column === h.routeStopsTable.address ? "address"
                          : null;
          const matches = (row: any, filter: any): boolean => {
            if (!filter) return true;
            if (filter.operator === "eq") {
              const field = fieldFor(filter.column);
              return field == null || row[field] === filter.value;
            }
            if (filter.operator === "isNull") {
              const field = fieldFor(filter.column);
              return field == null || row[field] == null;
            }
            if (filter.operator === "or") return filter.conditions.some((part: any) => matches(row, part));
            if (filter.operator === "and") return filter.conditions.every((part: any) => matches(row, part));
            return true;
          };
          rows = rows.filter(row => matches(row, condition));
          return Promise.resolve(rows).then(resolve, reject);
        },
      };
      return chain;
    },
    insert: () => ({
      values(values: unknown) {
        h.insertValues = values;
        return { returning: async () => h.insertedStop ? [h.insertedStop] : [] };
      },
    }),
    update: (table: unknown) => ({
      set(values: unknown) {
        h.updateValues = values;
        return {
          where: (condition: unknown) => {
            if (table === h.routeStopsTable) {
              h.blockUpdates.push({ values, condition });
            }
            const result = {
              returning: async () => h.updatedStop ? [h.updatedStop] : [],
              then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
                Promise.resolve(undefined).then(resolve, reject),
            };
            return result;
          },
        };
      },
    }),
    transaction: async (callback: (tx: any) => unknown) => {
      h.transactionCalls += 1;
      return callback(db);
    },
  };
  return { db };
});

const { default: routeStopsRouter } = await import("./route-stops");
const app = express();
app.use(express.json());
app.use("/", routeStopsRouter);

const originalStop = {
  id: 5,
  clientId: 10,
  jobId: 100,
  scheduledDate: "2026-11-06",
  sortOrder: 0,
  createdAt: new Date("2026-11-01T12:00:00.000Z"),
};

beforeEach(() => {
  h.jobs = [
    { id: 100, clientId: 10, businessLine: "general_contracting" },
    { id: 200, clientId: 11, businessLine: "asphalt_sealing" },
    { id: 201, clientId: 10, businessLine: "general_contracting" },
  ];
  h.stops = [{ ...originalStop }];
  h.insertedStop = { id: 6, clientId: 10, jobId: 201, createdAt: new Date("2026-11-02T12:00:00.000Z") };
  h.updatedStop = { ...originalStop, jobId: 201 };
  h.insertValues = null;
  h.updateValues = null;
  h.blockUpdates = [];
  h.transactionCalls = 0;
  h.geocodeResult = null;
  h.geocodeCalls = 0;
});

afterEach(() => vi.clearAllMocks());

describe("route stop job/client relationship integrity", () => {
  it("rejects a create whose job belongs to a different client", async () => {
    const response = await request(app).post("/").send({
      address: "123 Main St",
      clientId: 10,
      jobId: 200,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("does not belong to the linked client");
    expect(h.insertValues).toBeNull();
  });

  it("rejects a job link from a different active business", async () => {
    const response = await request(app).post("/").send({
      address: "123 Main St",
      jobId: 100,
      businessLine: "asphalt_sealing",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("does not belong to the linked client");
    expect(h.insertValues).toBeNull();
  });

  it("allows a job-only route stop when the referenced job exists", async () => {
    const response = await request(app).post("/").send({
      address: "123 Main St",
      jobId: 100,
    });

    expect(response.status).toBe(201);
    expect(h.insertValues).toMatchObject({ jobId: 100, clientId: null });
  });

  it("rejects changing only jobId when the stored client belongs to another job", async () => {
    const response = await request(app).put("/5").send({ jobId: 200 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("does not belong to the linked client");
    expect(h.updateValues).toBeNull();
  });

  it("rejects reassigning a stop to a job from another active business", async () => {
    const response = await request(app).put("/5").send({
      jobId: 200,
      clientId: 11,
      businessLine: "general_contracting",
    });

    expect(response.status).toBe(400);
    expect(h.updateValues).toBeNull();
  });

  it("rejects changing only clientId when the stored job belongs to another client", async () => {
    const response = await request(app).put("/5").send({ clientId: 11 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("does not belong to the linked client");
    expect(h.updateValues).toBeNull();
  });

  it("allows a partial job reassignment when the stored client matches the new job", async () => {
    const response = await request(app).put("/5").send({ jobId: 201 });

    expect(response.status).toBe(200);
    expect(h.updateValues).toMatchObject({ jobId: 201 });
  });

  it("does not require relationship repair for an unrelated title edit", async () => {
    h.stops = [{ ...originalStop, jobId: 200 }];
    const response = await request(app).put("/5").send({ title: "Updated stop" });

    expect(response.status).toBe(200);
    expect(h.updateValues).toMatchObject({ title: "Updated stop" });
  });
});


describe("route stop block splitting", () => {
  it("rejects invalid block sizes before starting a transaction", async () => {
    const response = await request(app).post("/split-blocks").send({
      date: "2026-11-06",
      blockSize: 1.5,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/whole number/i);
    expect(h.transactionCalls).toBe(0);
    expect(h.blockUpdates).toHaveLength(0);
  });

  it("rejects malformed dates before starting a transaction", async () => {
    const response = await request(app).post("/split-blocks").send({
      date: "11/06/2026",
      blockSize: 9,
    });

    expect(response.status).toBe(400);
    expect(h.transactionCalls).toBe(0);
    expect(h.blockUpdates).toHaveLength(0);
  });

  it("returns a validation error for an empty request instead of a server error", async () => {
    const response = await request(app).post("/split-blocks");

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/date/i);
    expect(h.transactionCalls).toBe(0);
  });

  it("assigns all stops for a date inside one transaction", async () => {
    h.stops = [
      { ...originalStop, id: 5, sortOrder: 0 },
      { ...originalStop, id: 6, sortOrder: 1 },
    ];

    const response = await request(app).post("/split-blocks").send({
      date: "2026-11-06",
      blockSize: 1,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ updated: 2 });
    expect(h.transactionCalls).toBe(1);
    expect(h.blockUpdates).toHaveLength(2);
    expect(h.blockUpdates.map(update => update.values)).toEqual([
      { blockNumber: 1, crewLabel: "Block A" },
      { blockNumber: 2, crewLabel: "Block B" },
    ]);
  });
});


describe("route stop geocoding repair", () => {
  it("retries rows when either latitude or longitude is missing", async () => {
    h.stops = [
      { ...originalStop, lat: 37.77, lng: null, address: "123 Main St" },
      { ...originalStop, id: 7, lat: 37.77, lng: -87.11, address: "456 Main St" },
    ];
    h.geocodeResult = { lat: 37.78, lng: -87.12 };

    const response = await request(app).post("/fix-geocoding").send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ total: 1, fixed: 1, failed: 0 });
    expect(h.geocodeCalls).toBe(1);
    expect(h.blockUpdates).toHaveLength(1);
    expect(h.blockUpdates[0].values).toEqual({ lat: 37.78, lng: -87.12 });
  });
});
