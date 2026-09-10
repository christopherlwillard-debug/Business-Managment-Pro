/**
 * Phase 0 contract for Production Intelligence.
 *
 * This module is intentionally pure and is not wired into routes, database
 * writes, UI state, pricing, payroll, or profit calculations yet. It pins the
 * approved vocabulary and boundaries before Phase 1 runtime work begins.
 */

export const PRODUCTION_INTELLIGENCE_CONTRACT_VERSION = 1 as const;

export const PRODUCTION_WORK_TYPES = ["production", "service"] as const;
export type ProductionWorkType = (typeof PRODUCTION_WORK_TYPES)[number];

export const WILLARD_PRODUCTION_COMPONENTS = [
  {
    key: "interior_finish",
    label: "Interior Finish",
    workType: "production",
    variants: ["vog", "hybrid", "drywall"],
    variantRequired: true,
    learningScope: "component_variant",
  },
  {
    key: "siding",
    label: "Siding",
    workType: "production",
    variants: [],
    variantRequired: false,
    learningScope: "component",
  },
  {
    key: "plumbing",
    label: "Plumbing",
    workType: "production",
    variants: [],
    variantRequired: false,
    learningScope: "component",
  },
  {
    key: "skirting",
    label: "Skirting",
    workType: "production",
    variants: [],
    variantRequired: false,
    learningScope: "component",
  },
  {
    key: "custom",
    label: "Custom",
    workType: "production",
    variants: [],
    variantRequired: false,
    learningScope: "named_custom_profile_only",
  },
] as const;

export type WillardProductionComponent =
  (typeof WILLARD_PRODUCTION_COMPONENTS)[number];
export type ProductionComponentKey = WillardProductionComponent["key"];
export type InteriorFinishVariant =
  (typeof WILLARD_PRODUCTION_COMPONENTS)[0]["variants"][number];
export type ProductionLearningScope =
  WillardProductionComponent["learningScope"];

/**
 * These names are explicitly not valid top-level Willard production
 * components. Drywall is an Interior Finish variant, not a component.
 */
export const FORBIDDEN_WILLARD_TOP_LEVEL_COMPONENT_KEYS = [
  "finish_carpentry",
  "drywall",
  "electrical",
  "hvac",
  "inspection",
  "cleanup",
] as const;

export type ForbiddenWillardTopLevelComponentKey =
  (typeof FORBIDDEN_WILLARD_TOP_LEVEL_COMPONENT_KEYS)[number];

export const PRESENCE_STATES = ["unrecorded", "here", "not_here"] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

export const NOT_HERE_REASONS = [
  "pulled_off",
  "customer_delay",
  "material_delay",
  "weather",
  "waiting_on_other_trade",
  "other",
] as const;
export type NotHereReason = (typeof NOT_HERE_REASONS)[number];

export const SCHEDULE_VIEWS = ["active", "history"] as const;
export type ScheduleView = (typeof SCHEDULE_VIEWS)[number];

/**
 * `source` answers where a fact came from. `provenance` answers how strongly
 * the system may treat that fact: manually confirmed, inferred, or derived.
 */
export const PRODUCTION_FACT_SOURCES = [
  "manual_presence",
  "job_schedule",
  "job_sub_hours",
  "daily_log",
  "checklist_status",
  "job_knowledge_record",
  "production_plan_snapshot",
] as const;
export type ProductionFactSource = (typeof PRODUCTION_FACT_SOURCES)[number];

export const PRODUCTION_FACT_PROVENANCE = [
  "confirmed",
  "inferred",
  "derived",
  "snapshot",
] as const;
export type ProductionFactProvenance =
  (typeof PRODUCTION_FACT_PROVENANCE)[number];

export const PRODUCTION_INTELLIGENCE_OWNERSHIP = {
  knowledgeCenter: {
    owns: [
      "reusable production component definitions",
      "component variants and expected production assumptions",
      "learning baselines and owner-approved updates",
    ],
    doesNotOwn: [
      "daily presence",
      "schedule history",
      "posted payroll",
      "posted expenses",
      "invoices or profit",
    ],
  },
  jobProductionPlan: {
    owns: [
      "job-specific component selection",
      "job-specific snapshots of expected production",
      "job-specific component context",
    ],
    doesNotOwn: [
      "global learning baselines",
      "posted financial transactions",
      "calendar presence facts",
    ],
  },
  schedulingOperations: {
    owns: [
      "active schedule",
      "schedule history",
      "daily presence state",
      "not-here reason",
      "optional operational work detail",
    ],
    doesNotOwn: [
      "global production definitions",
      "pricing resolution",
      "payroll posting",
      "expense posting",
      "job-profit calculation",
    ],
  },
  financialSystems: {
    owns: [
      "posted subcontractor payroll",
      "posted expenses",
      "invoices and payments",
      "mileage and owner ledgers",
      "actual job-profit calculations",
    ],
    doesNotOwn: [
      "schedule presence",
      "production learning baselines",
      "forecast values as actual transactions",
    ],
  },
} as const;

export function isProductionWorkType(
  value: string,
): value is ProductionWorkType {
  return (PRODUCTION_WORK_TYPES as readonly string[]).includes(value);
}

export function isPresenceState(value: string): value is PresenceState {
  return (PRESENCE_STATES as readonly string[]).includes(value);
}

export function isNotHereReason(value: string): value is NotHereReason {
  return (NOT_HERE_REASONS as readonly string[]).includes(value);
}

export function isScheduleView(value: string): value is ScheduleView {
  return (SCHEDULE_VIEWS as readonly string[]).includes(value);
}

export function isWillardProductionComponentKey(
  value: string,
): value is ProductionComponentKey {
  return WILLARD_PRODUCTION_COMPONENTS.some((component) => component.key === value);
}

export function isForbiddenWillardTopLevelComponentKey(
  value: string,
): value is ForbiddenWillardTopLevelComponentKey {
  return (FORBIDDEN_WILLARD_TOP_LEVEL_COMPONENT_KEYS as readonly string[]).includes(
    value,
  );
}

export function getWillardProductionComponent(
  key: string,
): WillardProductionComponent | undefined {
  return WILLARD_PRODUCTION_COMPONENTS.find((component) => component.key === key);
}

export type ProductionSelectionValidation =
  | {
      ok: true;
      component: WillardProductionComponent;
      normalizedVariant: InteriorFinishVariant | null;
    }
  | {
      ok: false;
      reason:
        | "unsupported_work_type"
        | "unknown_component"
        | "forbidden_top_level_component"
        | "missing_variant"
        | "variant_not_allowed"
        | "variant_not_normalized";
    };

/**
 * Validates only Willard's approved production configuration. Service is a
 * reserved separate work type and must be routed through a future service
 * contract, not this production selector.
 */
export function validateWillardProductionSelection(input: {
  workType: string;
  componentKey: string;
  variant?: string | null;
}): ProductionSelectionValidation {
  if (input.workType !== "production") {
    return { ok: false, reason: "unsupported_work_type" };
  }

  if (isForbiddenWillardTopLevelComponentKey(input.componentKey)) {
    return { ok: false, reason: "forbidden_top_level_component" };
  }

  const component = getWillardProductionComponent(input.componentKey);
  if (!component) {
    return { ok: false, reason: "unknown_component" };
  }

  const variant = input.variant?.trim().toLowerCase() || null;
  if (component.variantRequired && !variant) {
    return { ok: false, reason: "missing_variant" };
  }

  const allowedVariants = component.variants as readonly string[];
  if (variant && !allowedVariants.includes(variant)) {
    return { ok: false, reason: "variant_not_allowed" };
  }

  if (!component.variantRequired && variant) {
    return { ok: false, reason: "variant_not_allowed" };
  }

  return {
    ok: true,
    component,
    normalizedVariant: variant as InteriorFinishVariant | null,
  };
}

export function isEligibleForProductionLearning(input: {
  workType: string;
  componentKey: string;
  hasNamedCustomProfile?: boolean;
}): boolean {
  if (input.workType !== "production") return false;

  const component = getWillardProductionComponent(input.componentKey);
  if (!component) return false;

  if (component.learningScope === "component_variant") return true;
  if (component.learningScope === "component") return true;
  if (component.learningScope === "named_custom_profile_only") {
    return input.hasNamedCustomProfile === true;
  }
  return false;
}
