import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  updateSets: [] as any[],
  updateReturning: [] as any[][],
  transactionCalls: 0,
}));

vi.mock("@workspace/db", async importOriginal => {
  const actual = await importOriginal<typeof import("@workspace/db")>();

  const db: any = {
    select: () => {
      const result = h.selectQueue.shift() ?? [];
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: () => chain,
        for: () => chain,
        then: (resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return chain;
    },
    update: () => ({
      set: (data: unknown) => {
        h.updateSets.push(data);
        return {
          where: () => ({
            returning: async () => h.updateReturning.shift() ?? [],
          }),
        };
      },
    }),
    transaction: async (callback: (tx: any) => Promise<unknown>) => {
      h.transactionCalls++;
      return callback(db);
    },
  };

  return { ...actual, db };
});

const { default: migrationsRouter } = await import("./admin-migrations");
const app = express();
app.use(express.json());
app.use("/", migrationsRouter);

const business = { id: 1, slug: "general_contracting", name: "General Contracting" };
const client = { id: 1, name: "Cavco Owensboro", businessId: null, businessLine: "contracting" };
const matchingLinkedRows = [{ id: 14, businessId: 1, businessLine: "general_contracting" }];

function queuePreflight(overrides: {
  client?: Record<string, unknown>;
  jobs?: any[];
  invoices?: any[];
} = {}) {
  h.selectQueue.push(
    [business],
    [overrides.client ?? client],
    overrides.jobs ?? matchingLinkedRows,
    overrides.invoices ?? matchingLinkedRows,
  );
}

beforeEach(() => {
  h.selectQueue.length = 0;
  h.updateSets.length = 0;
  h.updateReturning.length = 0;
  h.transactionCalls = 0;
});

describe("POST /repair-cavco-owensboro-client-owner", () => {
  it("defaults to a dry run and changes no data", async () => {
    queuePreflight();

    const response = await request(app).post("/repair-cavco-owensboro-client-owner").send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      dryRun: true,
      plan: {
        client: { id: 1, name: "Cavco Owensboro", businessId: null, businessLine: "contracting" },
        linkedJobs: 1,
        linkedInvoices: 1,
        action: "set_canonical_business_id",
        businessIdAfterRepair: 1,
      },
    });
    expect(h.updateSets).toHaveLength(0);
    expect(h.transactionCalls).toBe(0);
  });

  it("requires the exact confirmation before executing", async () => {
    const response = await request(app)
      .post("/repair-cavco-owensboro-client-owner")
      .send({ dryRun: false });

    expect(response.status).toBe(400);
    expect(h.selectQueue).toHaveLength(0);
    expect(h.updateSets).toHaveLength(0);
    expect(h.transactionCalls).toBe(0);
  });

  it("refuses to change ownership if any linked row has a different owner", async () => {
    queuePreflight({
      jobs: [{ id: 14, businessId: 2, businessLine: "asphalt_sealing" }],
    });

    const response = await request(app).post("/repair-cavco-owensboro-client-owner").send({});

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("Linked jobs or invoices");
    expect(h.updateSets).toHaveLength(0);
    expect(h.transactionCalls).toBe(0);
  });

  it("sets only the existing client's canonical owner after rechecking linked rows", async () => {
    queuePreflight();
    h.selectQueue.push(
      [client],
      matchingLinkedRows,
      matchingLinkedRows,
    );
    h.updateReturning.push([{ id: 1, name: "Cavco Owensboro", businessId: 1, businessLine: "contracting" }]);

    const response = await request(app)
      .post("/repair-cavco-owensboro-client-owner")
      .send({ dryRun: false, confirm: "REPAIR_CAVCO_OWENSBORO_CLIENT_OWNER" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      dryRun: false,
      alreadyCorrect: false,
      client: { id: 1, name: "Cavco Owensboro", businessId: 1, businessLine: "contracting" },
      linkedJobs: 1,
      linkedInvoices: 1,
    });
    expect(h.updateSets).toEqual([{ businessId: 1 }]);
    expect(h.transactionCalls).toBe(1);
  });
});
