import { describe, expect, it } from "vitest";
import {
  buildAerialQuoteLineItems,
  calculateAerialQuote,
  roundQuoteMoney,
  type AerialQuoteInputs,
} from "./aerialQuotePricing";

function lineItemTotal(lines: ReturnType<typeof buildAerialQuoteLineItems>) {
  return roundQuoteMoney(lines.reduce(
    (sum, line) => sum + roundQuoteMoney(line.quantity * line.unitCost),
    0,
  ));
}

const baseInput: AerialQuoteInputs = {
  squareFeet: 1234.6,
  ratePerSqFt: 0.28,
  crackLinearFeet: 17.25,
  crackRate: 2.5,
  secondCoat: true,
  secondCoatRate: 0.15,
  oilStain: true,
  oilStainRate: 0.35,
  taxPercent: 0,
};

describe("Aerial Quote saved pricing", () => {
  it("keeps zero-tax quotes equal to their saved line items", () => {
    const quote = calculateAerialQuote(baseInput);
    const lines = buildAerialQuoteLineItems(baseInput, quote);

    expect(quote.tax).toBe(0);
    expect(lines.some(line => line.category === "Tax")).toBe(false);
    expect(lines.some(line => line.category === "Adjustment")).toBe(true);
    expect(lineItemTotal(lines)).toBe(quote.total);
  });

  it("persists nonzero tax as a separate line without changing subtotal", () => {
    const input = { ...baseInput, taxPercent: 6.5 };
    const quote = calculateAerialQuote(input);
    const lines = buildAerialQuoteLineItems(input, quote);
    const taxLine = lines.find(line => line.category === "Tax");

    expect(taxLine?.unitCost).toBe(quote.tax);
    expect(quote.tax).toBe(roundQuoteMoney(quote.subtotal * 0.065));
    expect(quote.total).toBe(roundQuoteMoney(quote.subtotal + quote.tax));
    expect(lineItemTotal(lines)).toBe(quote.total);
  });

  it("uses measured square footage for optional coat and stain pricing", () => {
    const quote = calculateAerialQuote(baseInput);
    const lines = buildAerialQuoteLineItems(baseInput, quote);

    expect(lines.find(line => line.category === "Sealing" && line.description === "Second Coat Application")?.quantity)
      .toBe(baseInput.squareFeet);
    expect(lines.find(line => line.description === "Oil Stain Treatment")?.quantity)
      .toBe(baseInput.squareFeet);
    expect(quote.coat).toBe(roundQuoteMoney(baseInput.squareFeet * baseInput.secondCoatRate));
    expect(quote.oil).toBe(roundQuoteMoney(baseInput.squareFeet * baseInput.oilStainRate));
  });
});
