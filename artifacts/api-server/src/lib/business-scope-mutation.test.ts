import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  rows: [] as Array<{ id: number; slug: string }>,
  selectCalls: 0,
}));

vi.mock("@workspace/db", () => {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: async () => {
      fixture.selectCalls += 1;
      return fixture.rows;
    },
  };
  return { db: { select: () => chain } };
});

const { resolveMutationBusiness, canonicalRecordBusiness, belongsToBusiness } = await import("./business-scope");

function request(body: Record<string, unknown> = {}, query: Record<string, unknown> = {}) {
  return { body, query } as never;
}

beforeEach(() => {
  fixture.rows = [];
  fixture.selectCalls = 0;
});

describe("resolveMutationBusiness", () => {
  it("defaults an ownerless mutation to General Contracting", async () => {
    fixture.rows = [{ id: 7, slug: "general_contracting" }];
    await expect(resolveMutationBusiness(request())).resolves.toEqual({
      ok: true,
      explicit: false,
      business: { id: 7, slug: "general_contracting" },
    });
  });

  it("preserves an explicitly selected child DBA", async () => {
    fixture.rows = [{ id: 9, slug: "asphalt_sealing" }];
    await expect(resolveMutationBusiness(request({ businessLine: "asphalt_sealing" }))).resolves.toEqual({
      ok: true,
      explicit: true,
      business: { id: 9, slug: "asphalt_sealing" },
    });
  });

  it("rejects a malformed explicit id instead of silently defaulting it", async () => {
    await expect(resolveMutationBusiness(request({ businessId: "not-a-number" }))).resolves.toEqual({
      ok: false,
      error: "Unknown business",
    });
    expect(fixture.selectCalls).toBe(0);
  });

  it("rejects conflicting explicit id and slug selectors", async () => {
    fixture.rows = [
      { id: 7, slug: "general_contracting" },
      { id: 9, slug: "asphalt_sealing" },
    ];
    await expect(resolveMutationBusiness(request({
      businessId: 9,
      businessLine: "general_contracting",
    }))).resolves.toEqual({
      ok: false,
      error: "Unknown business",
    });
  });
});

describe("canonicalRecordBusiness", () => {
  it("distinguishes a truly blank legacy owner from corrupt ownership", async () => {
    await expect(canonicalRecordBusiness({ businessId: null, businessLine: null }))
      .resolves.toEqual({ state: "blank" });
    expect(fixture.selectCalls).toBe(0);

    await expect(canonicalRecordBusiness({ businessId: 999, businessLine: null }))
      .resolves.toEqual({ state: "invalid" });
    expect(fixture.selectCalls).toBe(1);
  });

  it("rejects a canonical id that conflicts with the legacy slug", async () => {
    fixture.rows = [
      { id: 7, slug: "general_contracting" },
      { id: 9, slug: "asphalt_sealing" },
    ];
    await expect(canonicalRecordBusiness({
      businessId: 9,
      businessLine: "general_contracting",
    })).resolves.toEqual({ state: "invalid" });
  });
});

describe("canonical ownership precedence", () => {
  it("uses businessId as authoritative over the legacy slug", () => {
    expect(belongsToBusiness(
      { businessId: 9, businessLine: "general_contracting" },
      { id: 9, slug: "asphalt_sealing" },
    )).toBe(true);
    expect(belongsToBusiness(
      { businessId: 7, businessLine: "asphalt_sealing" },
      { id: 9, slug: "asphalt_sealing" },
    )).toBe(false);
  });

  it("uses the legacy slug only when canonical ownership is absent", () => {
    expect(belongsToBusiness(
      { businessId: null, businessLine: "asphalt_sealing" },
      { id: 9, slug: "asphalt_sealing" },
    )).toBe(true);
  });
});