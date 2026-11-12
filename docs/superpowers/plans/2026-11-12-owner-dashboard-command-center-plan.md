# Owner Dashboard / Business Command Center Implementation Plan

**Status:** Draft execution plan; implementation requires user approval
**Design:** `docs/superpowers/specs/2026-11-12-owner-dashboard-command-center-design.md`
**Scope dependency:** `docs/superpowers/specs/2026-11-10-dashboard-business-scope-design.md`

## Guardrails

- Keep the existing Dashboard financial calculations and source-of-truth ledgers unchanged.
- Reuse the existing Dashboard report, business-scope utilities, and UI components before creating new code.
- Treat the 2026-11-10 Dashboard business-scope design as authoritative. Inspect its implementation status first and avoid duplicating that work.
- Preserve company-level compliance, tax alerts, and account settings; do not reclassify them as business-owned.
- Keep company-wide cash/reserve data out of a single-business view.
- Never calculate subcontractor balances in React or present an unknown amount as zero or paid.
- Do not infer requirements beyond the approved design scope. New text from the truncated brief requires review as a scope change.
- No schema changes, production data/configuration changes, deployment, or live-site changes.

## Work sequence

### 1. Reconfirm current implementation and contracts

- Inspect the current Dashboard business-scope work and tests before editing. Reuse completed work and identify only remaining gaps.
- Re-read the Constitution, System Registry, Decisions, Changelog, dashboard scope design, and approved command-center design.
- Trace each Dashboard section through its UI query to the API response and confirm its scope and source.
- Identify which existing server response can safely represent outstanding subcontractor balances; if it cannot express unknown/unavailable values, omit the amount rather than adding a parallel calculation.
- Record the architecture impact before implementation. No schema change is expected.

### 2. Make Dashboard scope consistent

- Ensure each business-specific Dashboard request receives the canonical selector required by the existing scope design.
- Keep All Businesses, legal-business, and division behavior consistent across Business Health, Today’s Schedule, Continue Working, Recent Activity, and Owner Withdrawals.
- Preserve company-level compliance/tax data and the All Businesses-only Cash Flow card.
- Keep unowned route stops out of a single-business view when their business cannot be verified.
- Add or update API route tests for all-business, selected-business, legacy fallback, mismatched canonical ownership, and division-selection cases as applicable to each endpoint.

### 3. Reorganize the existing Dashboard sections

- Reorder the current components to: Header/scope, Needs Attention, Today / Next, Business Snapshot, Secondary Information.
- Move receipt scanning into the existing compact Quick Actions area.
- Reuse existing alert, schedule, Continue Working, Business Health, trend, activity, owner-withdrawal, and cash-flow components where possible.
- Add no alert without a reliable existing source and direct resolution path.
- Do not add a future-commitment panel if no authoritative existing schedule data supports it.
- Keep the established period semantics and financial labels.

### 4. Clarify data and failure states

- Distinguish loading, valid empty, unavailable, and valid zero states for each section.
- Replace silent empty/zero fallbacks on failed Dashboard requests with a visible section-level error and retry path.
- Do not show a partial subcontractor subtotal as a complete amount owed.
- Keep unavailable reserve or balance values unavailable; do not synthesize a balance from other cards.

### 5. Verify the change

- Add/update frontend tests for section order, responsive layout, business-scope changes, empty/error/retry behavior, and preservation of existing quick actions.
- Add/update API tests for the scoped Dashboard endpoints and their company-level exceptions.
- Run focused API tests for the dashboard scope behavior, contractor-app typecheck, and relevant library/API typechecks.
- Verify All Businesses totals and legal-business/division breakdowns do not double-count records.
- Use the authenticated browser verification available for this project to review desktop and mobile layouts; do not use production data or write to production.
- Restart only the affected workflows after implementation and check logs.

## Completion criteria

1. Urgent attention and today’s work appear before the business snapshot and secondary detail.
2. Existing Dashboard capabilities remain accessible, with receipt scanning available as a Quick Action.
3. Business-specific sections follow the approved scope design; company-level data is not incorrectly filtered.
4. All-business and division breakdowns preserve legal separation without double-counting.
5. No new ledger, client-side financial calculation, or changed accounting rule is introduced.
6. Unknown balances are not represented as zero or as settled.
7. Request failures are distinguishable from legitimate empty states and zeros.
8. The Dashboard remains usable at mobile and desktop sizes with accessible controls.
9. No production data, configuration, deployment, or live-site behavior is changed.
