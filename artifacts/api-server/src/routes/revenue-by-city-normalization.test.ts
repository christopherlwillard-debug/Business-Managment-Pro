// Regression tests for Revenue by City city/state normalization logic.
//
// Guards the grouping rules applied in GET /reports/accounting (reports.ts):
//   - invoice city/state trimmed before fallback so whitespace-only fields don't suppress job fields
//   - city key is lowercased so casing differences don't produce duplicate rows
//   - state is uppercased for consistent display
//
// These are pure-logic unit tests; no DB or route mocking required.

import { describe, it, expect } from "vitest";

/**
 * Mirrors the normalization applied to each invoice in the /accounting cityMap loop.
 * Keep in sync with reports.ts:660-663.
 */
function normalizeCityEntry(
  invoiceCity: string | null | undefined,
  jobCity: string | null | undefined,
  invoiceState: string | null | undefined,
  jobState: string | null | undefined,
): { city: string; state: string; key: string } {
  const city = (invoiceCity ?? "").trim() || (jobCity ?? "").trim() || "Unspecified";
  const state = ((invoiceState ?? "").trim() || (jobState ?? "").trim()).toUpperCase();
  const key = `${city.toLowerCase()}||${state}`;
  return { city, state, key };
}

describe("Revenue by City — city/state normalization", () => {
  it("whitespace-only invoiceState falls back to jobState", () => {
    // Regression: old code used `invoiceState || jobState` before trim, so "  " is truthy
    // and suppressed the valid jobState, producing an empty state column.
    const { state, key } = normalizeCityEntry("Poseyville", null, "   ", "IN");
    expect(state).toBe("IN");
    expect(key).toBe("poseyville||IN");
  });

  it("whitespace-only invoiceCity falls back to jobCity", () => {
    // Regression: old code used `invoiceCity || jobCity` before trim.
    const { city, key } = normalizeCityEntry("   ", "Poseyville", "IN", null);
    expect(city).toBe("Poseyville");
    expect(key).toBe("poseyville||IN");
  });

  it("lowercase state 'in' is normalized to uppercase 'IN' in key and display", () => {
    // Regression: Quincy row showed 'In' instead of 'IN'; key was different from rows with 'IN'.
    const a = normalizeCityEntry("Quincy", null, "In", null);
    const b = normalizeCityEntry("Quincy", null, "IN", null);
    expect(a.state).toBe("IN");
    expect(a.key).toBe(b.key); // same group — no duplicate row
  });

  it("two Poseyville invoices with different state casing share one key", () => {
    // Regression: 'Poseyville||IN' and 'Poseyville||in' produced two separate table rows.
    const a = normalizeCityEntry("Poseyville", null, "IN", null);
    const b = normalizeCityEntry("Poseyville", null, "in", null);
    expect(a.key).toBe(b.key);
  });

  it("two Poseyville invoices with trailing whitespace share one key", () => {
    const a = normalizeCityEntry("Poseyville ", null, "IN", null);
    const b = normalizeCityEntry("Poseyville", null, "IN", null);
    expect(a.key).toBe(b.key);
  });

  it("null invoiceCity and null jobCity produces Unspecified city", () => {
    const { city } = normalizeCityEntry(null, null, "KY", null);
    expect(city).toBe("Unspecified");
  });

  it("null invoiceState and null jobState produces empty-string state", () => {
    const { state } = normalizeCityEntry("Owensboro", null, null, null);
    expect(state).toBe("");
  });
});
