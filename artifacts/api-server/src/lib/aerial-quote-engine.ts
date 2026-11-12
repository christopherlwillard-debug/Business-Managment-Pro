import { roundCurrency } from "@workspace/api-zod";
import { z } from "zod/v4";

export const measurementEntrySchema = z.object({
  label: z.string().min(1).max(120),
  category: z.string().min(1).max(80),
  kind: z.enum(["area", "length", "count"]),
  quantity: z.number().finite().nonnegative(),
  unit: z.enum(["sq_ft", "acre", "sq_yd", "ft", "yd", "mile", "item", "hour"]),
  notes: z.string().nullable().optional(),
});

const componentSchema = z.object({
  label: z.string().min(1).max(120),
  category: z.string().min(1).max(80),
  basis: z.enum(["customer_rate", "direct_cost"]),
  chargeType: z.enum(["fixed", "per_unit"]),
  amount: z.number().finite().nonnegative(),
  measurementCategory: z.string().min(1).max(80).optional(),
  kind: z.enum(["area", "length", "count"]).optional(),
  unit: z.enum(["sq_ft", "acre", "sq_yd", "ft", "yd", "mile", "item"]).optional(),
});

export const servicePricingRulesSchema = z.object({
  components: z.array(componentSchema).min(1).max(40),
  marginMode: z.enum(["none", "markup", "target_margin"]),
  marginPercent: z.number().finite().min(0).max(99.99),
  minimumCharge: z.number().finite().nonnegative(),
  quantityRounding: z.object({
    mode: z.enum(["none", "up", "nearest", "down"]),
    increment: z.number().finite().positive(),
  }),
});

export type MeasurementEntry = z.infer<typeof measurementEntrySchema>;
export type ServicePricingRules = z.infer<typeof servicePricingRulesSchema>;
export type EstimateLine = {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
};

const areaFactors: Record<string, number> = { sq_ft: 1, acre: 43_560, sq_yd: 9 };
const lengthFactors: Record<string, number> = { ft: 1, yd: 3, mile: 5_280 };

function dimension(kind: MeasurementEntry["kind"], unit: string): "area" | "length" | "count" | "time" | null {
  if (kind === "area" && unit in areaFactors) return "area";
  if (kind === "length" && unit in lengthFactors) return "length";
  if (kind === "count" && unit === "item") return "count";
  if (kind === "count" && unit === "hour") return "time";
  return null;
}

function convert(quantity: number, kind: MeasurementEntry["kind"], from: string, to: string): number {
  if (dimension(kind, from) !== dimension(kind, to) || !dimension(kind, from)) {
    throw new Error(`Cannot convert ${from} to ${to}`);
  }
  if (kind === "area") return quantity * areaFactors[from] / areaFactors[to];
  if (kind === "length") return quantity * lengthFactors[from] / lengthFactors[to];
  return quantity;
}

function roundQuantity(value: number, rules: ServicePricingRules): number {
  const increment = rules.quantityRounding.increment;
  if (rules.quantityRounding.mode === "none") return value;
  const scaled = value / increment;
  if (rules.quantityRounding.mode === "up") return Math.ceil(scaled - Number.EPSILON) * increment;
  if (rules.quantityRounding.mode === "down") return Math.floor(scaled + Number.EPSILON) * increment;
  return Math.round(scaled) * increment;
}

function priceCost(cost: number, rules: ServicePricingRules): number {
  if (rules.marginMode === "none" || rules.marginPercent === 0) return cost;
  const rate = rules.marginPercent / 100;
  return rules.marginMode === "markup" ? cost * (1 + rate) : cost / (1 - rate);
}

export function calculateServiceEstimate(input: {
  serviceKey: string;
  profileVersion: number;
  rules: unknown;
  entries: unknown;
}) {
  const rules = servicePricingRulesSchema.parse(input.rules);
  const entries = z.array(measurementEntrySchema).min(1).parse(input.entries);
  const lineItems: EstimateLine[] = [];
  const trace: Array<Record<string, unknown>> = [];

  for (const component of rules.components) {
    let measured = 1;
    let billed = 1;
    let unit = "EA";
    let rawCost = component.amount;

    if (component.chargeType === "per_unit") {
      if (!component.kind || !component.unit || !component.measurementCategory) {
        throw new Error(`Pricing component "${component.label}" is missing its measurement unit or category`);
      }
      const matching = entries.filter(entry =>
        entry.kind === component.kind && entry.category === component.measurementCategory
        && dimension(entry.kind, entry.unit) === dimension(component.kind!, component.unit!));
      if (!matching.length) throw new Error(`No ${component.measurementCategory} measurement is available`);
      measured = matching.reduce((sum, entry) => sum + convert(entry.quantity, entry.kind, entry.unit, component.unit!), 0);
      billed = roundQuantity(measured, rules);
      unit = component.unit;
      rawCost = billed * component.amount;
    }

    const amount = component.basis === "direct_cost" ? priceCost(rawCost, rules) : rawCost;
    const unitCost = billed > 0 ? Math.round((amount / billed + Number.EPSILON) * 1_000_000) / 1_000_000 : 0;
    lineItems.push({
      category: component.category,
      description: component.label,
      quantity: billed,
      unit,
      unitCost,
    });
    trace.push({
      label: component.label,
      basis: component.basis,
      measuredQuantity: measured,
      billedQuantity: billed,
      unit,
      sourceAmount: roundCurrency(rawCost),
      customerAmount: roundCurrency(amount),
    });
  }

  let subtotal = roundCurrency(lineItems.reduce((sum, line) => sum + roundCurrency(line.quantity * line.unitCost), 0));
  if (subtotal < rules.minimumCharge) {
    const adjustment = roundCurrency(rules.minimumCharge - subtotal);
    lineItems.push({
      category: "Adjustment",
      description: "Minimum service charge",
      quantity: 1,
      unit: "EA",
      unitCost: adjustment,
    });
    subtotal = roundCurrency(rules.minimumCharge);
  }

  return {
    serviceKey: input.serviceKey,
    profileVersion: input.profileVersion,
    lineItems,
    subtotal,
    calculationSnapshot: {
      serviceKey: input.serviceKey,
      profileVersion: input.profileVersion,
      marginMode: rules.marginMode,
      marginPercent: rules.marginPercent,
      minimumCharge: rules.minimumCharge,
      quantityRounding: rules.quantityRounding,
      components: trace,
    },
  };
}
