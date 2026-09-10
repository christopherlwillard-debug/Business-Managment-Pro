import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_WILLARD_TOP_LEVEL_COMPONENT_KEYS,
  NOT_HERE_REASONS,
  PRESENCE_STATES,
  PRODUCTION_FACT_PROVENANCE,
  PRODUCTION_FACT_SOURCES,
  PRODUCTION_INTELLIGENCE_CONTRACT_VERSION,
  SCHEDULE_VIEWS,
  WILLARD_PRODUCTION_COMPONENTS,
  isEligibleForProductionLearning,
  isForbiddenWillardTopLevelComponentKey,
  validateWillardProductionSelection,
} from "./production-intelligence-contract";

describe("Production Intelligence Phase 0 contract", () => {
  it("pins Willard's five production components and no extra top-level categories", () => {
    expect(WILLARD_PRODUCTION_COMPONENTS.map((component) => component.key)).toEqual([
      "interior_finish",
      "siding",
      "plumbing",
      "skirting",
      "custom",
    ]);
    expect(FORBIDDEN_WILLARD_TOP_LEVEL_COMPONENT_KEYS).toEqual([
      "finish_carpentry",
      "drywall",
      "electrical",
      "hvac",
      "inspection",
      "cleanup",
    ]);
  });

  it("keeps Interior Finish variants together", () => {
    expect(validateWillardProductionSelection({
      workType: "production",
      componentKey: "interior_finish",
      variant: "VOG",
    })).toMatchObject({ ok: true, normalizedVariant: "vog" });
    expect(validateWillardProductionSelection({
      workType: "production",
      componentKey: "interior_finish",
      variant: "Hybrid",
    })).toMatchObject({ ok: true, normalizedVariant: "hybrid" });
    expect(validateWillardProductionSelection({
      workType: "production",
      componentKey: "interior_finish",
      variant: "Drywall",
    })).toMatchObject({ ok: true, normalizedVariant: "drywall" });
    expect(validateWillardProductionSelection({
      workType: "production",
      componentKey: "drywall",
    })).toEqual({ ok: false, reason: "forbidden_top_level_component" });
  });

  it("rejects variants on components that do not define them", () => {
    expect(validateWillardProductionSelection({
      workType: "production",
      componentKey: "siding",
      variant: "standard",
    })).toEqual({ ok: false, reason: "variant_not_allowed" });
    expect(validateWillardProductionSelection({
      workType: "production",
      componentKey: "interior_finish",
    })).toEqual({ ok: false, reason: "missing_variant" });
  });

  it("keeps Service outside the Willard production selector and learning", () => {
    expect(validateWillardProductionSelection({
      workType: "service",
      componentKey: "service_call",
    })).toEqual({ ok: false, reason: "unsupported_work_type" });
    expect(isEligibleForProductionLearning({
      workType: "service",
      componentKey: "service_call",
    })).toBe(false);
    expect(isEligibleForProductionLearning({
      workType: "production",
      componentKey: "custom",
    })).toBe(false);
    expect(isEligibleForProductionLearning({
      workType: "production",
      componentKey: "custom",
      hasNamedCustomProfile: true,
    })).toBe(true);
  });

  it("pins the daily presence vocabulary and optional non-work reasons", () => {
    expect(PRESENCE_STATES).toEqual(["unrecorded", "here", "not_here"]);
    expect(NOT_HERE_REASONS).toEqual([
      "pulled_off",
      "customer_delay",
      "material_delay",
      "weather",
      "waiting_on_other_trade",
      "other",
    ]);
  });

  it("pins active/history schedule semantics and evidence provenance", () => {
    expect(SCHEDULE_VIEWS).toEqual(["active", "history"]);
    expect(PRODUCTION_FACT_SOURCES).toContain("manual_presence");
    expect(PRODUCTION_FACT_SOURCES).toContain("job_sub_hours");
    expect(PRODUCTION_FACT_SOURCES).toContain("daily_log");
    expect(PRODUCTION_FACT_PROVENANCE).toEqual([
      "confirmed",
      "inferred",
      "derived",
      "snapshot",
    ]);
  });

  it("keeps the contract version explicit", () => {
    expect(PRODUCTION_INTELLIGENCE_CONTRACT_VERSION).toBe(1);
  });

  it("recognizes every forbidden top-level category", () => {
    for (const key of FORBIDDEN_WILLARD_TOP_LEVEL_COMPONENT_KEYS) {
      expect(isForbiddenWillardTopLevelComponentKey(key)).toBe(true);
    }
  });
});
