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
  columns or a migration. Mark the line explicitly as tax (for example,
  `isTax: true`) so calculation and invoice code can distinguish it.
- Add a Sales Tax line item only when tax is nonzero. Calculate tax in cents
  from the pre-tax subtotal; apply markup and contingency to non-tax items,
  then add tax to the final total.
- Add a separate minimum/rounding adjustment line when the $300 minimum or
  $50 rounding changes the base amount. Keep the measured square footage and
  configured rate on the base line. Use actual, not rounded, square footage
  for second-coat and oil-treatment quantities.
- Round each displayed component to cents and use the same per-line rounding
  in the estimate API. The adjustment line closes the gap between the
  measured base line and the rounded/minimum base amount.
- Keep the tax and adjustment lines in invoice-draft expansion. Do not apply
  markup or contingency to the tax line, and ensure the resulting invoice
  lines reconcile to the saved estimate total. Aerial Quote currently uses no
  markup or contingency.
- Keep zero-tax quotes free of an unnecessary tax line.

## Verification

- Test estimate totals with zero tax and nonzero tax.
- Test minimum/rounding adjustments, fractional measured quantities, and
  second-coat/oil line totals; ensure the line items sum to the displayed
  quote total.
- Test invoice-draft expansion so the resulting lines sum to the same
  tax-inclusive total.
- Do not change historic estimates or unrelated pricing calculators.
