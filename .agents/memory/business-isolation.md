---
name: Business isolation architecture
description: How data is scoped per business; businessId vs businessLine; parent/child structure
---

## The columns
- `businesses.parent_business_id` — nullable FK to self; set when a business is a DBA or subsidiary
- `recurring_expenses.business_id` — FK to businesses; filters the recurring expense list per active business
- `expenses.business_id` — FK to businesses; used for client-side filter and POST body; kept alongside legacy `business_line` text column
- `expenses.business_line` — legacy text slug (general_contracting, asphalt_sealing); still used by the reports/tax route which does complex businessLine-based breakdowns

## What uses businessId (new, clean)
- `GET /api/recurring-expenses?businessId=N` — server-side filter
- `GET /api/expenses?businessId=N` — server-side filter (optional param)
- `GET /api/businesses` — now applies toServingUrl() to logoUrl before returning
- Frontend expense list filter: `businessId === activeBusiness.id` with fallback `businessLine === activeBusiness.slug` for legacy rows
- Recurring expense hook: `useRecurringExpenses(activeBusiness?.id)` — queryKey includes businessId so React Query re-fetches on business switch

## What still uses businessLine (legacy, do not remove yet)
- `artifacts/api-server/src/routes/reports.ts` — complex P&L and tax report logic built entirely on businessLine; would need full rewrite to migrate

**Why:** reports.ts does multi-business rollup math and chart breakdowns by businessLine slug; businessId migration of that route is a separate task.

**How to apply:** When adding new data features, use businessId FK pattern. When touching reports/tax routes, be aware they still filter on businessLine.

## Data migration reference
- Production currently has Asphalt Sealing as a separate root business; development has it parented to General Contracting. Verify the environment before relying on the hierarchy.
- All pre-existing recurring_expenses: businessId = General Contracting id (migrated)
- Expenses: businessId derived from businessLine slug via `UPDATE expenses SET business_id = b.id FROM businesses b WHERE expenses.business_line = b.slug`

## Parent, DBA, and workflow boundary

Willard's General Contracting is the one business. Its operating avenues/divisions include Manufactured Homes, Asphalt Sealing, SageHomes, and any additional avenues the user creates. All avenues share the same accounting records and year-end reporting; users need both consolidated totals and income/spending views by avenue. Kinora and other unrelated businesses remain separate. MH Production and MH Service are operational workflows within the Manufactured Homes avenue, not separate businesses.

**Why:** The user clarified that Willard's General Contracting is the single business, with several current and future avenues of work; division-level visibility must not split the legal or accounting entity.

**How to apply:** Model one legal/accounting owner separately from its operating divisions. Keep Kinora and every unrelated business isolated. Support an extensible avenue list, including Manufactured Homes, Asphalt Sealing, and SageHomes, with consolidated accounting/year-end totals and optional per-avenue income/spending views. Do not assign ambiguous legacy records or rewrite history without a reviewed mapping. Mutations without an explicit avenue resolve to the business's default; never hardcode numeric IDs. “All businesses” remains read-only scope.

Financial mutation routes follow the same contract: canonical `businessId` is authoritative, legacy `businessLine` is fallback-only, and child rows inherit ownership from jobs/templates/providers rather than accepting a client-selected conflicting owner.

## Willard's combined dashboard view

Willard's General Contracting is the one business; Manufactured Homes, Asphalt Sealing, SageHomes, and future user-created avenues are divisions/avenues under it. All share one set of accounting records and combined year-end reporting. The user wants to see income and spending by avenue without creating separate accounting entities. Kinora remains outside this business. `legal_business_id` identifies the legal owner; division labels identify avenues of work. Keep ambiguous legacy records out of division-only totals and do not rewrite production data without the separate reviewed release step.

**Why:** The user clarified the full division model after correcting an earlier incomplete list: one business can have the named avenues and others added later.

**How to apply:** Keep Willard's General Contracting as the sole legal/accounting owner and make avenue reporting extensible. Consolidate accounting and year-end reporting; offer optional income and spending breakdowns for Manufactured Homes, Asphalt Sealing, SageHomes, and future avenues. Keep Kinora separate. Do not infer avenue ownership for ambiguous legacy records.
