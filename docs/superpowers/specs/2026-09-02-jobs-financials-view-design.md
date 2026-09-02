# Jobs Financials View Design

**Date:** 2026-09-02  
**Status:** Approved for implementation

## Goal

Add a Financials view inside the existing Jobs area so the owner can scan active jobs without opening every Job Card. The current All Jobs view, Job Cards, financial calculations, payroll workflows, and closing behavior remain intact.

The view is active-work visibility only. Closed jobs are excluded completely from its data, totals, filters, and outstanding lists.

## Scope

### Included

- An All Jobs / Financials view switch inside the existing Jobs page.
- A server-owned active-job financial summary composed from existing Jobs, invoices, job profit, worker pay, subcontractor pay, and owner-capital records.
- Phone-friendly job cards with compact totals and expandable worker/subcontractor detail.
- Top-level totals for Workers Owed, Subcontractors Owed, Owner Pay Owed, and Active Jobs.
- Filters for All Active, Needs Action, Waiting on Customer/Payment, and Ready to Close.
- An Open Job action that opens the existing Job Card.
- Defensive closed-job exclusion on both the server response and client rendering.

### Excluded

- No new financial ledger or database table.
- No replacement for the All Jobs view or Job Cards.
- No second waterfall or client-owned financial calculation.
- No change to job closing requirements or payment workflows.
- No owner-pay recording action inside the new view.
- No changes to closed-job presentation or historical records.

## Architecture and sources of truth

The feature belongs to the Jobs module and extends its existing API route ownership. It does not change any source of truth:

- Jobs and lifecycle: `jobs`
- Customer revenue/payment status: existing invoice data and current Jobs invoice summary behavior
- Business job expenses and job profit: existing `GET /api/jobs/:id/profit` calculation path
- Hourly worker pay: existing job hours and worker/sub-payment data used by Job Payroll and Job Financials
- Fixed/allocation subcontractor pay: existing `sub_payment_records` and outstanding-sub-payment behavior
- Actual Owner Withdrawals: non-voided negative `owner_capital_entries` rows, grouped by `job_id`

The server summary must reuse the existing financial calculation/service functions. React may format and display returned values, but must not recreate the waterfall.

## Active-job rule

The active financial response must exclude every job whose status is `closed`. The database query is the primary filter, and the client applies a defensive filter before rendering.

Jobs that remain active include:

- In Progress
- Waiting on customer/payment
- Paid but not yet closed
- Any other non-closed job status already recognized by the Jobs module

The response must not fetch closed jobs merely to discard them in the UI.

## Summary response

The Jobs API should expose `GET /api/jobs/financials-summary?businessId=...` through the existing Jobs route module. The route must be declared before any `/:id` route. It should return raw values suitable for formatting:

```text
{
  jobs: [
    {
      job,
      payment: {
        status,
        amountDue,
        invoiceId
      },
      workers: {
        available,
        count,
        totalOwed,
        details: [
          { id, name, amountOwed, amountPaid, balance, status }
        ]
      },
      subcontractors: {
        available,
        count,
        totalOwed,
        details: [
          { id, name, compensationType, amountOwed, amountPaid, balance, status }
        ]
      },
      ownerPay: {
        supported,
        earned,
        paid,
        remaining,
        overpaid
      },
      state,
      blockers,
      warnings
    }
  ],
  totals: {
    workersOwed,
    subcontractorsOwed,
    ownerPayOwed,
    activeJobs,
    ownerPayUnknownJobs,
    workersUnknownJobs,
    subcontractorsUnknownJobs
  },
  dataStatus: "complete" | "partial",
  warnings: []
}
```

The final TypeScript shape should follow existing project conventions and actual response types. The endpoint must not persist derived totals. Jobs should be returned in the existing Jobs ordering convention (newest first unless the current API already provides a different stable order), and worker/subcontractor detail rows should have stable name-then-id ordering.

`workers.available` and `subcontractors.available` distinguish a valid empty/zero section from a failed required source. When a section is unavailable for any job, that job returns `count: null`, `totalOwed: null`, and `details: null` for that section; the corresponding aggregate total is `null` and its `*UnknownJobs` count increments. The UI renders “Unavailable” rather than zero. A failed required job-financial or payroll source produces a successful `dataStatus: "partial"` response with an affected-job warning and an unavailable section; it never fabricates a zero. A request-level failure that prevents the active job list from being safely scoped returns the existing API error status and no financial totals.

If an optional Owner Pay value is unsupported for a job, that job returns `ownerPay.supported: false` and a warning. Its unknown amount is excluded from `totals.ownerPayOwed`, and `totals.ownerPayUnknownJobs` increments; the UI must label the total as partially known rather than showing the known amount as complete.

## Amount rules

### Workers

Use the existing hourly worker/job-hours and payment records. `workers.count` means distinct hourly worker payout rows returned by the existing source, whether already paid or still owed. `totalOwed` means the sum of positive remaining balances only. The main card shows the number of workers and combined outstanding amount. The expanded detail shows each worker's existing owed, paid, and remaining values.

### Subcontractors

Use existing subcontractor payment records and the existing outstanding-sub-payments logic, including hourly, fixed, and allocation compensation types where returned by that source. `subcontractors.count` means distinct assigned subcontractor payment rows returned by the existing source, whether already paid or still owed. `totalOwed` means the sum of positive remaining balances only. The main card shows the number of subcontractors and combined outstanding amount. The expanded detail shows each subcontractor, compensation type, owed, paid, and remaining values.

### Owner Pay

Use the existing job financial result where it supports an owner-pay value, and use non-voided negative job-linked owner-capital entries for actual paid withdrawals:

```text
Owner Pay Remaining = Owner Pay Earned - valid linked Owner Withdrawals
```

Withdrawals must never increase earned Owner Pay. `remaining` is clamped to zero; if withdrawals exceed earned, the excess is returned as `overpaid` and the UI shows an overpayment warning. Unassigned withdrawals must not be guessed onto a job. If the current data cannot support a reliable earned value, return `supported: false` and show a clear unavailable state rather than inventing a number. Unknown earned values are excluded from aggregate owed totals.

The feature does not add a new Owner Pay ledger, payment record, or calculation.

## Overall state and filters

Each active job receives a clear primary state. State evaluation uses the following deterministic precedence:

1. `Needs Action`: any worker balance, subcontractor balance, supported Owner Pay balance, unsupported required financial data, or existing job-completion requirement remains.
2. `Waiting on Customer/Payment`: the customer payment requirement is not satisfied and no internal blocker from rule 1 exists.
3. `Ready to Close`: the customer/payment requirement and all worker/subcontractor/owner settlement requirements already tracked by the app are satisfied.

The job's payment status remains visible separately so a paid job with internal balances is understandable. An unpaid invoice plus internal balances is `Needs Action` because there is something internal to resolve; an unpaid invoice with no internal blocker is `Waiting on Customer/Payment`. If Owner Pay is unsupported, the job is not marked Ready to Close because the view cannot verify that requirement. The existing close logic remains authoritative; the state is a visibility summary, not a new close gate.

Decision examples:

| Payment | Internal balances/data | State |
|---|---|---|
| Unpaid | Worker/subcontractor/owner balance or required data unknown | Needs Action |
| Unpaid | No internal balance and all required data available | Waiting on Customer/Payment |
| Paid | Any worker/subcontractor/owner balance or required data unknown | Needs Action |
| Paid | All tracked balances are zero and close checks are satisfied | Ready to Close |

## UI design

### View switch

Place a compact switch near the existing Jobs page heading:

```text
[ All Jobs ] [ Financials ]
```

All Jobs remains the default/unchanged path.

### Totals

Show four compact summary cards:

- Workers Owed
- Subcontractors Owed
- Owner Pay Owed
- Active Jobs

They must be based only on the active response.

### Job cards

Use a vertical, phone-friendly card rather than a wide table. A card includes:

- Job title and customer
- Payment status
- Primary state
- Worker count and total outstanding
- Subcontractor count and total outstanding
- Owner Pay earned/paid/remaining when supported
- Owner Pay overpaid warning when withdrawals exceed earned
- Open Job action

Worker and subcontractor detail is collapsed by default and expands independently. Detail rows use the existing amounts and statuses; they do not provide a new payment workflow.

### Empty, loading, and error states

- Loading state preserves the page structure with compact placeholders.
- Empty All Active state explains that there are no non-closed jobs.
- Empty filtered state explains that no active jobs match the filter.
- API errors show a retry action without silently presenting zero financial amounts.

## Data freshness

The Financials view should refetch on mount and use the existing Jobs invalidation/refetch behavior after relevant mutations. Navigating to Open Job and returning must show fresh values rather than stale initial data.

## Error handling

- A failed summary request is an explicit error state.
- Missing optional financial data is represented as unavailable, not zero, when zero would imply that the amount is known. The response's `dataStatus` and per-job/top-level `warnings` identify partial results, and aggregate totals expose counts of jobs with unknown sections. Known owed totals use non-negative remaining balances only; overpayments never create negative owed totals.
- Closed jobs are discarded server-side and client-side.
- Malformed detail arrays render safely as empty details while preserving the summary error/partial state contract.

## Verification

Verify the full feature against:

1. All Jobs remains unchanged.
2. Financials only contains non-closed jobs.
3. Closed jobs never affect active totals.
4. In-progress, unpaid, paid-but-not-closed, and ready-to-close examples classify correctly.
5. Worker totals match existing Job Payroll/Job Financials values.
6. Subcontractor totals match existing outstanding-payment values.
7. Owner Pay earned/paid/remaining uses existing supported data and linked owner-capital withdrawals.
8. Multiple workers and subcontractors expand to individual details.
9. Open Job reaches the existing Job Card.
10. Small iPhone-width layout remains readable without horizontal scrolling.
11. Loading, empty, error, and partial-data states are explicit.
12. Frontend and API typechecks pass.
