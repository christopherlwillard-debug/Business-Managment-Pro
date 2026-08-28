import { beforeEach, describe, expect, it, vi } from "vitest";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({ selectQueue: [] as any[][] }));

vi.mock("@workspace/db", () => {
  function chain() {
    const query: any = {
      from: () => query,
      where: () => query,
      leftJoin: () => query,
      orderBy: () => query,
      limit: () => query,
      then: (resolve: (value: any) => any) => Promise.resolve(state.selectQueue.shift() ?? []).then(resolve),
    };
    return query;
  }

  return {
    db: {
      select: () => chain(),
      insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
      delete: () => ({ where: () => Promise.resolve() }),
    },
  };
});

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hash"), compare: vi.fn().mockResolvedValue(true) },
}));
vi.mock("./subcontractors", () => ({ computeYtd: vi.fn().mockResolvedValue(0) }));

const { default: portalRouter } = await import("./portal");
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/portal", portalRouter);

const unpinnedSub = { id: 7, name: "Portal Sub", portalToken: "sub-token", portalPinHash: null };
const pinnedSub = { ...unpinnedSub, portalPinHash: "hash", portalApproved: true };

async function authenticatedAgent() {
  state.selectQueue.push([unpinnedSub]);
  const agent = request.agent(app);
  const response = await agent.post("/portal/set-pin").send({ token: "sub-token", pin: "1234" });
  expect(response.status).toBe(200);
  return agent;
}

beforeEach(() => {
  state.selectQueue.length = 0;
});

describe("subcontractor portal mileage", () => {
  it("recalculates displayed log deductions from raw date, miles, and classification", async () => {
    const agent = await authenticatedAgent();
    state.selectQueue.push([pinnedSub], [pinnedSub], [
      { id: 1, date: "2026-06-30", miles: "100", classification: "business", ratePerMile: "9", deductionAmount: "900" },
      { id: 2, date: "2026-07-01", miles: "100", classification: "business", ratePerMile: "9", deductionAmount: "900" },
      { id: 3, date: "2026-07-01", miles: "100", classification: "personal", ratePerMile: "9", deductionAmount: "900" },
    ]);

    const response = await agent.get("/portal/sub-token/mileage");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 1, ratePerMile: 0.725, deductionAmount: 72.5 }),
      expect.objectContaining({ id: 2, ratePerMile: 0.760, deductionAmount: 76 }),
      expect.objectContaining({ id: 3, ratePerMile: 0.760, deductionAmount: 0 }),
    ]));
  });

  it("returns separate rate periods and no blended rate in a split-year tax report", async () => {
    const agent = await authenticatedAgent();
    state.selectQueue.push(
      [pinnedSub],
      [pinnedSub],
      [],
      [
        { id: 1, date: "2026-06-30", miles: "100", classification: "business", deductionAmount: "900" },
        { id: 2, date: "2026-07-01", miles: "100", classification: "business", deductionAmount: "900" },
      ],
      [{ total: "0" }],
      [{ total: "0" }],
    );

    const response = await agent.get("/portal/sub-token/tax-report?year=2026");

    expect(response.status).toBe(200);
    expect(response.body.mileage).toMatchObject({
      totalMiles: 200,
      deduction: 148.5,
      ratePerMile: null,
      ratePeriods: [
        { periodStart: "2026-01-01", periodEnd: "2026-06-30", rate: 0.725, miles: 100, deduction: 72.5 },
        { periodStart: "2026-07-01", periodEnd: "2026-12-31", rate: 0.760, miles: 100, deduction: 76 },
      ],
    });
  });
});