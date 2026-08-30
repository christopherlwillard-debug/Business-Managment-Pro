import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  insert: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  function selectChain(): any {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then(resolve: (value: any) => any, reject: (error: any) => any) {
        const next = h.selectQueue.shift();
        if (next === undefined) {
          return Promise.reject(new Error("Unexpected owner-capital select")).then(resolve, reject);
        }
        return Promise.resolve(next).then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    db: {
      select: () => selectChain(),
      insert: h.insert,
      update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
    },
  };
});

vi.mock("./guards.js", () => ({
  ownerGuard: () => (_req: any, _res: any, next: any) => next(),
}));

const { default: ownerCapitalRouter } = await import("./owner-capital.js");
const app = express();
app.use(express.json());
app.use("/api/owner-capital", ownerCapitalRouter);

describe("owner-capital withdrawals-only reads", () => {
  beforeEach(() => {
    h.selectQueue.length = 0;
    h.insert.mockReset();
  });

  it("returns an empty ledger without creating a positive legacy contribution", async () => {
    h.selectQueue.push([]);

    const response = await request(app).get("/api/owner-capital");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.selectQueue).toHaveLength(0);
  });

  it("rejects a zero-value withdrawal before any ledger write", async () => {
    const response = await request(app)
      .post("/api/owner-capital")
      .send({
        businessId: 1,
        type: "withdrawal",
        date: "2026-08-29",
        description: "Owner Withdrawal",
        amount: 0,
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/greater than zero/i);
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.selectQueue).toHaveLength(0);
  });
});