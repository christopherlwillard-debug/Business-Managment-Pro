import { describe, expect, it } from "vitest";
import { createStrictQueryQueue } from "./strict-query-queue";

describe("createStrictQueryQueue", () => {
  it("reports the scenario and consumed slot when a select queue is exhausted", () => {
    const queue = createStrictQueryQueue<any[]>({ kind: "select" });
    queue.push([{ id: 1 }]);

    expect(queue.take("GET /clients")).toEqual([{ id: 1 }]);
    expect(() => queue.take("GET /clients")).toThrow(
      "[GET /clients] missing queued select slot [1]",
    );
  });

  it.each([
    ["execute", "execute"],
    ["mutation-return", "mutation-return"],
  ] as const)("uses the default %s label on exhaustion", (kind, label) => {
    const queue = createStrictQueryQueue<any[]>({ kind });

    expect(() => queue.take("POST /route")).toThrow(
      `[POST /route] missing queued ${label} slot [0]`,
    );
  });

  it("resets all queue guard state between fixtures", () => {
    const queue = createStrictQueryQueue<any[]>({ kind: "select" });
    queue.push([{ id: 1 }]);
    queue.take("GET /first");
    expect(() => queue.take("GET /first")).toThrow();

    queue.reset();
    queue.push([{ id: 2 }]);

    expect(queue.consumedSlots).toBe(0);
    expect(queue.missingSlots).toEqual([]);
    expect(queue.take("GET /second")).toEqual([{ id: 2 }]);
    queue.assertConsumed("GET /second");
  });

  it("permits an explicit fallback for non-strict report fixtures", () => {
    const queue = createStrictQueryQueue<any[]>({ kind: "select", label: "report query" });

    expect(queue.take("GET /reports/accounting", { strict: false })).toEqual([]);
    expect(queue.missingSlots).toEqual([0]);
    queue.assertConsumed("GET /reports/accounting", { strict: false });
  });
});