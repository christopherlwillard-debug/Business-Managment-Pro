# Financial Correction History

## Decision

Use explicit `POST /:id/void` endpoints for posted financial records. Existing
`DELETE` endpoints remain permanent deletion only for drafts or non-financial
support rows; posted financial rows return a clear error directing callers to
the void endpoint.

## Data model

Extend the existing source rows with nullable `voided_at` and `void_reason`
metadata. Do not create a second audit or reversal ledger. Invoices retain
their existing `cancelled` status, and subcontractor payments retain their
existing `is_reversal` behavior.

## Treatment

- Expenses, owner-capital entries, other-income rows, and mileage records are
  voided in place with a required reason and remain queryable for history.
- Issued invoices use the existing audit-safe void endpoint; drafts may still
  be permanently deleted.
- Mileage import rollback preserves source trips and voids generated aggregate
  expenses instead of deleting financial evidence.
- Voided rows are excluded from reports and job-profit calculations.
- Ownership and job/client foreign keys remain unchanged; voiding never
  detaches relationships.

## Verification

Add focused route and report tests for draft deletion, posted voiding, required
reasons, exclusion from totals, and reproducible historical totals.