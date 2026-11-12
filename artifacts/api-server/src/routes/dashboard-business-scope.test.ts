import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const fixture = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  businessScopes: [] as Array<{ id: number; slug: string; memberIds: number[]; memberSlugs: string[]; legalBusinessId: number }>,
  readScopes: [] as unknown[],
}));

vi.mock("@workspace/db", () => {
  function selectChain() {
    const chain: any = {
      from: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        const result = fixture.selectQueue.shift();
        if (!result) return Promise.reject(new Error("Unexpected dashboard query")).then(resolve, reject);
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return chain;
  }
  return { db: { select: () => selectChain() } };
});

vi.mock("../lib/business-scope.js", async () => {
  const { sql } = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    hasRequestedBusiness: (req: { query?: Record<string, unknown> }) =>
      req.query?.businessId != null || req.query?.businessLine != null,
    invalidBusinessScope: () => false,
    requestedBusinessReadScope: async (req: { query?: Record<string, unknown> }) => {
      const scope = fixture.businessScopes[0]!;
      scope.slug = String(req.query?.businessLine ?? scope.slug);
      return scope;
    },
    businessReadPredicate: (_columns: unknown, scope: unknown) => {
      fixture.readScopes.push(scope);
      return sql.raw("dashboard business read scope");
    },
  };
});

const scope = {
  id: 7,
  slug: "general_contracting",
  memberIds: [7, 9],
  memberSlugs: ["general_contracting", "asphalt_sealing"],
  legalBusinessId: 7,
};

const { default: dashboardRouter } = await import("./dashboard");
const app = express();
app.use("/dashboard", dashboardRouter);

beforeEach(() => {
  fixture.selectQueue.length = 0;
  fixture.businessScopes = [{ ...scope }];
  fixture.readScopes.length = 0;
});

describe("Dashboard business read scope", () => {
  it("applies the selected business scope to today’s route stops, follow-ups, and overdue invoices", async () => {
    fixture.selectQueue.push([], [], [], []);
    const response = await request(app).get("/dashboard/today?businessId=7&businessLine=general_contracting");

    expect(response.status).toBe(200);
    expect(response.body.routeStops).toEqual([]);
    expect(fixture.readScopes).toHaveLength(4);
    expect(fixture.readScopes.every(value => value === fixture.businessScopes[0])).toBe(true);
  });

  it("scopes Continue Working to the selected business", async () => {
    fixture.selectQueue.push(
      [{ jobId: 42, title: "Kitchen", clientName: "Customer" }],
      [{ completed: false }],
      [{ status: "sent" }],
      [{ name: "Crew" }],
      [],
    );
    const response = await request(app).get("/dashboard/continue-working?businessId=7");

    expect(response.status).toBe(200);
    expect(response.body.jobId).toBe(42);
    expect(fixture.readScopes).toContain(fixture.businessScopes[0]);
  });

  it("applies the selected business scope to recent expenses, invoices, and subcontractor payments", async () => {
    fixture.selectQueue.push([], [], [], []);
    const response = await request(app).get("/dashboard/recent-activity?businessLine=general_contracting");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(fixture.readScopes).toHaveLength(3);
    expect(fixture.readScopes.every(value => value === fixture.businessScopes[0])).toBe(true);
  });
});
