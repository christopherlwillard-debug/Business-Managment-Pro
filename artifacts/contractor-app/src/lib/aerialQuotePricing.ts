export type AerialQuoteInputs = {
  squareFeet: number;
  ratePerSqFt: number;
  crackLinearFeet: number;
  crackRate: number;
  secondCoat: boolean;
  secondCoatRate: number;
  oilStain: boolean;
  oilStainRate: number;
  taxPercent: number;
};

export type AerialQuoteLineItem = {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
};

export type AerialQuoteTotals = {
  base: number;
  baseAdjustment: number;
  crack: number;
  coat: number;
  oil: number;
  subtotal: number;
  tax: number;
  total: number;
};

export function roundQuoteMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function ceil50(value: number): number {
  return Math.max(300, Math.ceil(value / 50) * 50);
}

export function calculateAerialQuote(input: AerialQuoteInputs): AerialQuoteTotals {
  const measuredBase = input.squareFeet * input.ratePerSqFt;
  const base = ceil50(measuredBase);
  const baseAdjustment = roundQuoteMoney(base - roundQuoteMoney(measuredBase));
  const crack = roundQuoteMoney(input.crackLinearFeet * input.crackRate);
  const coat = input.secondCoat
    ? roundQuoteMoney(input.squareFeet * input.secondCoatRate)
    : 0;
  const oil = input.oilStain
    ? roundQuoteMoney(input.squareFeet * input.oilStainRate)
    : 0;
  const subtotal = roundQuoteMoney(base + crack + coat + oil);
  const tax = roundQuoteMoney(subtotal * (input.taxPercent / 100));
  const total = roundQuoteMoney(subtotal + tax);

  return { base, baseAdjustment, crack, coat, oil, subtotal, tax, total };
}

export function buildAerialQuoteLineItems(
  input: AerialQuoteInputs,
  quote: AerialQuoteTotals,
): AerialQuoteLineItem[] {
  const roundedSquareFeet = Math.round(input.squareFeet);
  const lineItems: AerialQuoteLineItem[] = [{
    category: "Sealing",
    description: `Asphalt Sealing — ${roundedSquareFeet.toLocaleString()} SF`,
    quantity: input.squareFeet,
    unit: "SF",
    unitCost: input.ratePerSqFt,
  }];

  if (quote.baseAdjustment > 0) {
    lineItems.push({
      category: "Adjustment",
      description: "Minimum/rounding adjustment",
      quantity: 1,
      unit: "EA",
      unitCost: quote.baseAdjustment,
    });
  }

  if (input.crackLinearFeet > 0) {
    lineItems.push({
      category: "Crack Repair",
      description: "Crack Sealing",
      quantity: input.crackLinearFeet,
      unit: "LF",
      unitCost: input.crackRate,
    });
  }
  if (input.secondCoat) {
    lineItems.push({
      category: "Sealing",
      description: "Second Coat Application",
      quantity: input.squareFeet,
      unit: "SF",
      unitCost: input.secondCoatRate,
    });
  }
  if (input.oilStain) {
    lineItems.push({
      category: "Prep",
      description: "Oil Stain Treatment",
      quantity: input.squareFeet,
      unit: "SF",
      unitCost: input.oilStainRate,
    });
  }
  if (quote.tax > 0) {
    lineItems.push({
      category: "Tax",
      description: `Sales Tax (${input.taxPercent}%)`,
      quantity: 1,
      unit: "EA",
      unitCost: quote.tax,
    });
  }

  return lineItems;
}
