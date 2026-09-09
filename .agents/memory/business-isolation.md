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
- Asphalt Sealing: parentBusinessId = General Contracting id (already set in DB)
- All pre-existing recurring_expenses: businessId = General Contracting id (migrated)
- Expenses: businessId derived from businessLine slug via `UPDATE expenses SET business_id = b.id FROM businesses b WHERE expenses.business_line = b.slug`

## Parent, DBA, and workflow boundary

General Contracting is the permanent parent and default financial owner. Asphalt is a child DBA that keeps explicit ownership even while inactive. MH Production, MH Service, and General Contracting are operational job workflows, not businesses.

**Why:** Treating workflows as businesses produced ownerless and inconsistently scoped jobs and invoices. Ownership must remain stable even when an operational workflow or DBA is inactive.

**How to apply:** Mutations without an explicit DBA resolve the business with stable slug `general_contracting`; never hardcode its numeric ID. Linked invoices inherit the job owner and reject conflicts, and a job with linked invoices cannot be reassigned. “All businesses” remains read-only scope, and historical DBA ownership is preserved.

Financial mutation routes follow the same contract: canonical `businessId` is authoritative, legacy `businessLine` is fallback-only, and child rows inherit ownership from jobs/templates/providers rather than accepting a client-selected conflicting owner.
