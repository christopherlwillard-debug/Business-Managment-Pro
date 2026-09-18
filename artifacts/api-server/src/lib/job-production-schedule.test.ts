import { describe, expect, it } from "vitest";
import { deriveJobProductionPlan, unavailableJobProductionPlan } from "./job-production-schedule.js";
import type { ProductionComponentView } from "./job-production-components.js";

function component(
  instance: string,
  duration: number | null,
  overrides: Partial<ProductionComponentView> = {},
): ProductionComponentView {
  return {
    id: Number(instance.replace(/\D/g, "")) || 1,
    jobId: 42,
    businessId: 1,
    componentKey: "custom",
    componentInstanceKey: instance,
    componentLabel: instance,
    variant: null,
    sourceServiceIds: [],
    sourceServices: [],
    snapshotVersion: 1,
    status: "planned",
    expectedLaborHours: null,
    expectedDurationDays: duration,
    expectedDurationDaysExplicit: duration != null,
    expectedCrewSize: null,
    checklistContext: null,
    materialContext: null,
    pricingContext: null,
    knowledgeContext: null,
    capturedAt: null,
    supersededAt: null,
    persisted: true,
    previousSnapshotVersion: null,
    changesFromPrevious: [],
    ...overrides,
  };
}

const range = { from: "2026-09-01", to: "2026-09-30" };

describe("deriveJobProductionPlan", () => {
  it("allocates sequential inclusive calendar blocks and keeps statuses independent", () => {
    const plan = deriveJobProductionPlan({
      ...range,
      startDate: "2026-09-03",
      endDate: "2026-09-08",
      components: [
        component("interior", 2, { status: "in_progress" }),
        component("siding", 3, { status: "in_progress" }),
      ],
    });

    expect(plan.status).toBe("ready");
    expect(plan.items.map(item => [item.componentInstanceKey, item.plannedDate])).toEqual([
      ["interior", "2026-09-03"],
      ["interior", "2026-09-04"],
      ["siding", "2026-09-05"],
      ["siding", "2026-09-06"],
      ["siding", "2026-09-07"],
    ]);
    expect(plan.items[0].plannedEndDate).toBe("2026-09-04");
    expect(plan.items[2].plannedStartDate).toBe("2026-09-05");
  });

  it("skips unavailable durations without reserving dates and continues later components", () => {
    const plan = deriveJobProductionPlan({
      ...range,
      startDate: "2026-09-03",
      endDate: null,
      components: [
        component("missing", null),
        component("invalid", 0),
        component("valid", 1),
      ],
    });

    expect(plan.status).toBe("partial");
    expect(plan.items.map(item => item.plannedDate)).toEqual(["2026-09-03"]);
    expect(plan.unscheduledComponents.map(item => [item.componentInstanceKey, item.reason])).toEqual([
      ["missing", "missing_duration"],
      ["invalid", "invalid_duration"],
    ]);
  });

  it("uses missing start date as the reason when no planning anchor exists", () => {
    const plan = deriveJobProductionPlan({
      ...range,
      startDate: null,
      endDate: null,
      components: [component("missing-start", null), component("valid", 2)],
    });

    expect(plan.unscheduledComponents.map(item => item.reason)).toEqual([
      "missing_job_start_date",
      "missing_job_start_date",
    ]);
  });

  it("filters current applicable components and the requested date range", () => {
    const plan = deriveJobProductionPlan({
      from: "2026-09-04",
      to: "2026-09-05",
      startDate: "2026-09-01",
      endDate: "2026-09-10",
      components: [
        component("first", 4),
        component("not-applicable", 1, { status: "not_applicable" }),
        component("superseded", 1, { supersededAt: "2026-09-01T00:00:00.000Z" }),
        component("not-persisted", 1, { persisted: false }),
      ],
    });

    expect(plan.items.map(item => item.plannedDate)).toEqual(["2026-09-04"]);
  });

  it("marks overflow occurrences and warns without changing the job end date", () => {
    const plan = deriveJobProductionPlan({
      ...range,
      startDate: "2026-09-29",
      endDate: "2026-09-30",
      components: [component("overflow", 3)],
    });

    expect(plan.warnings).toEqual([{
      type: "end_date_overflow",
      componentInstanceKey: "overflow",
      plannedStartDate: "2026-09-29",
      plannedEndDate: "2026-10-01",
      jobEndDate: "2026-09-30",
    }]);
    expect(plan.items.map(item => [item.plannedDate, item.isOverflow])).toEqual([
      ["2026-09-29", false],
      ["2026-09-30", false],
    ]);
  });
});

it("represents an unavailable component read without guessing dates", () => {
  expect(unavailableJobProductionPlan()).toEqual({
    status: "unavailable",
    unavailableReason: "component_data_unavailable",
    items: [],
    unscheduledComponents: [],
    warnings: [],
  });
});