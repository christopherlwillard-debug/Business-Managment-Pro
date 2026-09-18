import type { ProductionComponentView } from "./job-production-components.js";

export type ProductionPlanStatus = "ready" | "partial" | "unavailable";
export type ProductionPlanUnavailableReason = "component_data_unavailable";
export type UnscheduledProductionReason =
  | "missing_job_start_date"
  | "missing_duration"
  | "invalid_duration";

export type ProductionPlanOccurrence = {
  occurrenceKey: string;
  componentInstanceKey: string;
  componentLabel: string;
  componentKey: ProductionComponentView["componentKey"];
  variant: ProductionComponentView["variant"];
  status: ProductionComponentView["status"];
  expectedDurationDays: number;
  plannedDate: string;
  plannedStartDate: string;
  plannedEndDate: string;
  isOverflow: boolean;
};

export type UnscheduledProductionComponent = {
  componentInstanceKey: string;
  componentLabel: string;
  componentKey: ProductionComponentView["componentKey"];
  variant: ProductionComponentView["variant"];
  status: ProductionComponentView["status"];
  expectedDurationDays: number | null;
  reason: UnscheduledProductionReason;
};

export type ProductionPlanWarning = {
  type: "end_date_overflow";
  componentInstanceKey: string;
  plannedStartDate: string;
  plannedEndDate: string;
  jobEndDate: string;
};

export type ProductionPlan = {
  status: Exclude<ProductionPlanStatus, "unavailable">;
  unavailableReason: null;
  items: ProductionPlanOccurrence[];
  unscheduledComponents: UnscheduledProductionComponent[];
  warnings: ProductionPlanWarning[];
};

type ProductionPlanInput = {
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  from: string;
  to: string;
  components: ProductionComponentView[];
};

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? date
    : null;
}

function dateOnly(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function addDays(value: string, amount: number): string {
  const date = parseDateOnly(value);
  if (!date) throw new Error(`Invalid date-only value: ${value}`);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateOnly(date);
}

function isValidDuration(value: number | null): value is number {
  return value != null
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= 1
    && value <= 365;
}

function unscheduledComponent(
  component: ProductionComponentView,
  reason: UnscheduledProductionReason,
): UnscheduledProductionComponent {
  return {
    componentInstanceKey: component.componentInstanceKey,
    componentLabel: component.componentLabel,
    componentKey: component.componentKey,
    variant: component.variant,
    status: component.status,
    expectedDurationDays: component.expectedDurationDays,
    reason,
  };
}

export function deriveJobProductionPlan(input: ProductionPlanInput): ProductionPlan {
  const currentComponents = input.components.filter(component =>
    component.persisted
    && component.supersededAt == null
    && component.status !== "not_applicable",
  );
  const unscheduledComponents: UnscheduledProductionComponent[] = [];
  const items: ProductionPlanOccurrence[] = [];
  const warnings: ProductionPlanWarning[] = [];

  if (!input.startDate || !parseDateOnly(input.startDate)) {
    for (const component of currentComponents) {
      unscheduledComponents.push(unscheduledComponent(component, "missing_job_start_date"));
    }
    return {
      status: unscheduledComponents.length ? "partial" : "ready",
      unavailableReason: null,
      items,
      unscheduledComponents,
      warnings,
    };
  }

  let nextStartDate = input.startDate;
  for (const component of currentComponents) {
    const duration = component.expectedDurationDays;
    if (duration == null) {
      unscheduledComponents.push(unscheduledComponent(component, "missing_duration"));
      continue;
    }
    if (!isValidDuration(duration)) {
      unscheduledComponents.push(unscheduledComponent(component, "invalid_duration"));
      continue;
    }

    const plannedStartDate = nextStartDate;
    const plannedEndDate = addDays(plannedStartDate, duration - 1);
    const isOverflowing = Boolean(
      input.endDate
      && parseDateOnly(input.endDate)
      && plannedEndDate > input.endDate,
    );
    if (isOverflowing && input.endDate) {
      warnings.push({
        type: "end_date_overflow",
        componentInstanceKey: component.componentInstanceKey,
        plannedStartDate,
        plannedEndDate,
        jobEndDate: input.endDate,
      });
    }

    for (let plannedDate = plannedStartDate; plannedDate <= plannedEndDate; plannedDate = addDays(plannedDate, 1)) {
      if (plannedDate < input.from || plannedDate > input.to) continue;
      items.push({
        occurrenceKey: `production-${component.jobId}-${component.componentInstanceKey}-${plannedDate}`,
        componentInstanceKey: component.componentInstanceKey,
        componentLabel: component.componentLabel,
        componentKey: component.componentKey,
        variant: component.variant,
        status: component.status,
        expectedDurationDays: duration,
        plannedDate,
        plannedStartDate,
        plannedEndDate,
        isOverflow: Boolean(input.endDate && plannedDate > input.endDate),
      });
    }

    nextStartDate = addDays(plannedEndDate, 1);
  }

  return {
    status: unscheduledComponents.length ? "partial" : "ready",
    unavailableReason: null,
    items,
    unscheduledComponents,
    warnings,
  };
}

export function unavailableJobProductionPlan(): {
  status: "unavailable";
  unavailableReason: ProductionPlanUnavailableReason;
  items: [];
  unscheduledComponents: [];
  warnings: [];
} {
  return {
    status: "unavailable",
    unavailableReason: "component_data_unavailable",
    items: [],
    unscheduledComponents: [],
    warnings: [],
  };
}