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
  },
  jobsTable: {
    id: "jobs.id",
    clientId: "jobs.client_id",
    sqFt: "jobs.sq_ft",
    coats: "jobs.coats",
  },
  clientsTable: { id: "clients.id", name: "clients.name" },
  prospectsTable: { id: "prospects.id", contactName: "prospects.contact_name", address: "prospects.address" },
  jobs: [] as Array<{ id: number; clientId: number | null }>,
  stops: [] as Array<{ id: number; clientId: number | null; jobId: number | null; scheduledDate?: string | null; sortOrder?: number | null; createdAt: Date }>,
  blockUpdates: [] as Array<{ values: any; condition: any }>,
  transactionCalls: 0,
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
  asc: (column: unknown) => ({ operator: "asc", column }),
}));

vi.mock("../geocode-helpers", () => ({
  geocodeAddressString: vi.fn(async () => null),
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
          if (condition?.operator === "eq") {
            const field = condition.column === h.jobsTable.id || condition.column === h.routeStopsTable.id
              ? "id"
              : condition.column === h.routeStopsTable.clientId
                ? "clientId"
                : condition.column === h.routeStopsTable.jobId
                  ? "jobId"
                  : condition.column === h.routeStopsTable.scheduledDate
                    ? "scheduledDate"
                    : null;
            if (field) rows = rows.filter(row => row[field] === condition.value);
          }
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
    { id: 100, clientId: 10 },
    { id: 200, clientId: 11 },
    { id: 201, clientId: 10 },
  ];
  h.stops = [{ ...originalStop }];
  h.insertedStop = { id: 6, clientId: 10, jobId: 201, createdAt: new Date("2026-11-02T12:00:00.000Z") };
  h.updatedStop = { ...originalStop, jobId: 201 };
  h.insertValues = null;
  h.updateValues = null;
  h.blockUpdates = [];
  h.transactionCalls = 0;
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
