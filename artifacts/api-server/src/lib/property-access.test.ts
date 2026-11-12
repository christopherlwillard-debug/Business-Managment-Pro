import { describe, expect, it } from "vitest";
import { hasPropertyPermission } from "./property-access.js";

describe("property access grants", () => {
  it("lets every grant view a shared property", () => {
    for (const permission of ["view", "measure", "estimate", "manage"]) {
      expect(hasPropertyPermission(permission, "view")).toBe(true);
    }
  });

  it("keeps measuring and estimating permissions separate", () => {
    expect(hasPropertyPermission("measure", "measure")).toBe(true);
    expect(hasPropertyPermission("measure", "estimate")).toBe(false);
    expect(hasPropertyPermission("estimate", "estimate")).toBe(true);
    expect(hasPropertyPermission("estimate", "measure")).toBe(false);
  });

  it("allows managers to perform every property action", () => {
    for (const required of ["view", "measure", "estimate", "manage"] as const) {
      expect(hasPropertyPermission("manage", required)).toBe(true);
    }
  });

  it("rejects absent or unknown grants", () => {
    expect(hasPropertyPermission(null, "view")).toBe(false);
    expect(hasPropertyPermission("owner", "manage")).toBe(false);
  });
});
