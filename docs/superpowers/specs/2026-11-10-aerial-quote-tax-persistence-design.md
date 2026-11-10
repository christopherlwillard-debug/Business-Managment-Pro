# Aerial Quote Tax Persistence

## Goal

When an Aerial Quote is saved, its stored estimate and any invoice draft must
match the tax-inclusive total displayed in the quote screen.

## Current behavior

Aerial Quote calculates a base amount with a $300 minimum and rounds it up to
$50 increments. It also calculates optional crack repair, second coat, oil
treatment, and tax. The save request sends line items plus subtotal and total,
but the estimate API rebuilds totals from line items and markup/contingency.
The submitted totals are ignored, so tax is lost. Some line items also use
rounded square footage and the unadjusted rate, which can disagree with the
rounded base displayed by the quote screen.

## Approved approach

- Keep tax in the existing estimate line-item JSON; do not add database
  columns or a migration.
- Add an explicit Sales Tax line item when tax is greater than zero.
- Add a separate minimum/rounding adjustment line when the $300 minimum or
  $50 rounding changes the base amount. Preserve the measured square footage
  and configured rate on the base line.
- Preserve the existing pre-tax subtotal semantics and compute the final
  estimate total as the post-markup/contingency amount plus the tax line.
- Keep the explicit tax line in invoice-draft expansion so the invoice lines
  sum to the saved estimate total. Aerial Quote uses no markup or contingency.
- Keep zero-tax quotes free of an unnecessary tax line.

## Verification

- Test estimate totals with zero tax and nonzero tax.
- Test minimum/rounding adjustments and ensure the line items sum to the
  displayed quote total.
- Test invoice-draft expansion so the resulting lines sum to the same
  tax-inclusive total.
- Do not change historic estimates or unrelated pricing calculators.
