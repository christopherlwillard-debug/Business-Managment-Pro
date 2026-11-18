import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  updateQueue: [] as any[][],
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@workspace/db", () => {
  function selectChain() {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then(resolve: (value: any) => any, reject: (reason: unknown) => any) {
        return Promise.resolve(h.selectQueue.shift() ?? []).then(resolve, reject);
      },
    };
    return chain;
  }
  return {
    db: {
      select: () => selectChain(),
      update: () => {
        let values: Record<string, unknown> = {};
        const chain: any = {
          set(nextValues: Record<string, unknown>) {
            values = nextValues;
            h.updates.push(nextValues);
            return chain;
          },
          where: () => chain,
          returning: async () => h.updateQueue.shift() ?? [],
        };
        return chain;
      },
      transaction: async (callback: (tx: any) => unknown) => callback({}),
    },
  };
});

const { default: businessesRouter } = await import("./businesses");
const app = express();
app.use(express.json());
app.use("/businesses", businessesRouter);

beforeEach(() => {
  h.selectQueue.length = 0;
  h.updateQueue.length = 0;
  h.updates.length = 0;
});

describe("business activity lifecycle", () => {
  it("keeps inactive businesses available from the history selector API", async () => {
    h.selectQueue.push([
      { id: 1, name: "Owner", isActive: true, logoUrl: null },
      { id: 2, name: "Retired Division", isActive: false, logoUrl: null },
    ]);

    const response = await request(app).get("/businesses");

    expect(response.status).toBe(200);
    expect(response.body.map((business: any) => business.isActive)).toEqual([true, false]);
  });

  it("blocks deactivating a legal-owner root", async () => {
    h.selectQueue.push([{ id: 1, legalBusinessId: 1 }]);

    const response = await request(app).put("/businesses/1").send({ isActive: false });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/legal-owner/i);
    expect(h.updates).toHaveLength(0);
  });

  it("deactivates an operating division without touching other business fields", async () => {
    h.selectQueue.push([{ id: 2, legalBusinessId: 1 }]);
    h.updateQueue.push([{ id: 2, isActive: false }]);

    const response = await request(app).put("/businesses/2").send({ isActive: false });

    expect(response.status).toBe(200);
    expect(h.updates).toEqual([{ isActive: false }]);
  });

  it("blocks reactivation while the legal owner is inactive", async () => {
    h.selectQueue.push(
      [{ id: 2, legalBusinessId: 1 }],
      [{ isActive: false }],
    );

    const response = await request(app).put("/businesses/2").send({ isActive: true });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/reactivate the legal-owner/i);
    expect(h.updates).toHaveLength(0);
  });
});
