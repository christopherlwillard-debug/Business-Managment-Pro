import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const fixture = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  consumed: 0,
  missing: [] as number[],
  whereClauses: [] as unknown[],
}));

vi.mock("@workspace/db", () => {
  function selectChain() {
    const chain: any = {
      from: () => chain,
      leftJoin: () => chain,
      where: (condition: unknown) => {
        fixture.whereClauses.push(condition);
        return chain;
      },
      orderBy: () => chain,
      limit: () => chain,
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        const slot = fixture.consumed++;
        const result = fixture.selectQueue.shift();
        if (!result) {
          fixture.missing.push(slot);
          return Promise.reject(new Error(`missing queued query slot [${slot}]`)).then(resolve, reject);
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return chain;
  }
  return { db: { select: () => selectChain() } };
});

vi.mock("../lib/business-scope.js", () => ({
  requestedBusiness: async () => ({ id: 1, slug: "asphalt_sealing" }),
  invalidBusinessScope: () => false,
  belongsToBusiness: () => true,
}));

vi.mock("./guards", () => ({ getRequestUser: () => null }));

const { default: jobsRouter } = await import("./jobs");
const app = express();
app.use(express.json());
app.use("/jobs", jobsRouter);

beforeEach(() => {
  fixture.selectQueue.length = 0;
  fixture.consumed = 0;
  fixture.missing.length = 0;
  fixture.whereClauses.length = 0;
});

afterEach(() => {
  expect(fixture.missing).toHaveLength(0);
  expect(fixture.selectQueue).toHaveLength(0);
});

describe("GET /jobs business ownership scope", () => {
  it("queries canonical ownership with legacy fallback only for null-owned rows and never returns another business", async () => {
    // These are the rows the database returns after evaluating the route's WHERE:
    // canonical ownership and an unbackfilled legacy row are visible; the
    // conflicting canonical business_id row is intentionally absent.
    fixture.selectQueue.push(
      [
        { id: 11, title: "Canonical asphalt", businessId: 1, businessLine: "contracting", createdAt: new Date("2026-01-01") },
        { id: 12, title: "Legacy asphalt", businessId: null, businessLine: "asphalt_sealing", createdAt: new Date("2026-01-02") },
      ],
      [],
    );

    const response = await request(app).get("/jobs?businessId=1");

    expect(response.status).toBe(200);
    expect(response.body.map((job: { id: number }) => job.id)).toEqual([11, 12]);
    expect(response.body.some((job: { businessId: number | null }) => job.businessId === 2)).toBe(false);

    // The SQL condition contains an OR branch for canonical business_id and a
    // legacy business_line branch guarded by business_id IS NULL.
    const sql = (fixture.whereClauses[0] as { getSQL: () => unknown }).getSQL();
    const fragments: string[] = [];
    const seen = new Set<unknown>();
    const collectSqlFragments = (value: unknown): void => {
      if (typeof value === "string") {
        fragments.push(value);
        return;
      }
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      for (const nested of Object.values(value)) collectSqlFragments(nested);
    };
    collectSqlFragments(sql);
    const conditionText = fragments.join(" ").toLowerCase();
    expect(conditionText).toContain("business_id");
    expect(conditionText).toContain("business_line");
    expect(conditionText).toContain("is null");
  });
});