# Production Owner and Subcontractor Payment Reconciliation

Date: 2026-09-02  
Environment: Production read replica  
Result: No production financial rows changed

## Sources of truth

- Owner withdrawals: `owner_capital_entries`
- Subcontractor payments: `sub_payment_records`
- Hourly labor accruals: `job_sub_hours`
- Operating expenses and preserved historical mirrors: `expenses`
- Bank evidence: `bank_transactions` and `bank_transaction_expense_links`

## Owner-payment reconciliation

Production contains nine historical owner-category expense rows. Every row:

- has exactly one linked `owner_capital_entries` row through `expense_id`;
- has the same amount with the canonical negative withdrawal sign;
- is voided with the owner-ledger migration reason;
- is excluded from net profit; and
- has an active, non-voided canonical owner-capital row.

| Expense | Date | Amount | Job | Owner entry | Bank link | Classification |
|---:|---|---:|---|---:|---|---|
| 99 | 2026-07-02 | $702.16 | Jasonville Trim Out | 7 | 28 | Confirmed migrated mirror |
| 100 | 2026-07-02 | $1,000.00 | Unlinked | 5 | 23 | Confirmed migrated mirror |
| 173 | 2026-07-08 | $1,400.00 | Unlinked | 6 | 26 | Confirmed migrated mirror |
| 204 | 2026-07-15 | $888.90 | Peters Booneville | 12 | 45 | Confirmed migrated mirror |
| 205 | 2026-07-17 | $728.09 | Myers Trim Out | 11 | 47 | Confirmed migrated mirror |
| 212 | 2026-07-25 | $388.74 | Martin | 10 | 59 | Confirmed migrated mirror |
| 214 | 2026-07-22 | $793.39 | Unlinked | 13 | None | Confirmed migrated mirror |
| 219 | 2026-07-31 | $974.50 | Clemons/zehr | 9 | None | Confirmed migrated mirror |
| 235 | 2026-08-07 | $1,542.86 | Unlinked | 8 | None | Confirmed migrated mirror |

Control results:

- Active owner-category expense rows: **0**
- Owner expenses missing a canonical owner-capital row: **0**
- Owner amount mismatches: **0**
- Active canonical withdrawals: **$8,418.64**
- Historical positive contributions preserved: **$7,200.00**

No owner correction is justified.

## Subcontractor expense and accrual export

| Expense | Date | Amount | Job / worker | Source evidence | Classification |
|---:|---|---:|---|---|---|
| 67 | 2026-05-27 | $1,000.00 | Lot home / James Willard | Bank 17; no hours or canonical payment row | Legacy/manual payment expense; preserve |
| 68 | 2026-05-27 | $500.00 | Plumbing / Dewayne Lamb | No hours or canonical payment row | Legacy/manual payment expense; preserve |
| 71 | 2026-06-02 | $300.00 | Plumbing / Dewayne Lamb | `job_sub_hours` 3, 6h × $50 | Hourly accrual mirror; preserve |
| 80 | 2026-06-17 | $617.50 | Plumbing / James Willard | Bank 6; no canonical payment row; worker ID absent | Legacy/manual payment expense; preserve |
| 86 | 2026-06-19 | $1,000.00 | Lot Model / Dewayne Lamb | `job_sub_hours` 9, 40h × $25; canonical payments total $1,000 | Hourly accrual plus later cash payment; separate treatments |
| 91 | 2026-06-25 | $800.00 | Jasonville Trim Out / Dewayne Lamb | `job_sub_hours` 10, 32h × $25; canonical payment $800 | Hourly accrual plus later cash payment; separate treatments |
| 185 | 2026-07-13 | $800.00 | Peters Booneville / Dewayne Lamb | `job_sub_hours` 11, 32h × $25 | Hourly work accrual |
| 186 | 2026-07-13 | $120.00 | Peters Booneville / Dewayne Lamb | `job_sub_hours` 12, 8h × $15 | Hourly travel accrual |
| 187 | 2026-07-14 | $60.00 | Peters Booneville / James Willard | Canonical payment records a $60 advance | Legacy advance-related expense; no direct source link, preserve |
| 188 | 2026-07-14 | $160.00 | Peters Booneville / Dewayne Lamb | `is_wage_advance=true`; canonical payment records a $160 advance | Cash-advance record; preserve |
| 200 | 2026-07-15 | $600.00 | Myers Trim Out / Dewayne Lamb | `job_sub_hours` 17, 24h × $25 | Hourly work accrual |
| 203 | 2026-07-15 | $120.00 | Myers Trim Out / Dewayne Lamb | `job_sub_hours` 20, 8h × $15 | Hourly travel accrual |
| 211 | 2026-07-25 | $600.00 | Clemons/zehr / Dewayne Lamb | `job_sub_hours` 21, 24h × $25; payment includes $200 bonus | Hourly accrual; payment difference has explicit bonus evidence |
| 245 | 2026-08-22 | $2,327.07 | Napier / James Willard | Description ends in `(outstanding)`; later canonical payment is $1,936.14 | Unpaid accrual snapshot; excluded from cash-basis reports |

None of these rows is a confirmed duplicate cash payment. Voiding them from amount/date similarity would erase accrual, advance, or legacy bank evidence.

## Canonical subcontractor payment export

- Active rows: **23**
- Reversal rows: **0**
- Active ledger total, including recorded advances: **$17,996.40**
- Explicit bank-linked payment rows: **4**
- Rows with idempotency keys: **23**
- Distinct idempotency keys: **23**

No duplicate idempotency keys, reversal pairs, or repeated canonical source rows were found.

## Report control totals

These totals were computed from the same production source predicates used by the report routes.

| Surface | Before | After | Result |
|---|---:|---:|---|
| P&L contract labor control | $19,953.90 | $19,953.90 | Unchanged |
| Business Health payment/expense control | $19,953.90 | $19,953.90 | Unchanged |
| Schedule C contract labor as currently coded | $20,113.90 | $20,113.90 | Unchanged; includes the $160 wage-advance row |
| Active owner expense effect | $0.00 | $0.00 | Unchanged |
| Owner earned | $20,448.70 | $20,448.70 | Unchanged |
| Owner withdrawn | $8,418.64 | $8,418.64 | Unchanged |
| Owner still owed | $12,030.06 | $12,030.06 | Unchanged |

The $160 difference between Schedule C and the other cash-basis controls is a report-predicate issue, not evidence that expense 188 should be voided. P&L and Business Health exclude `is_wage_advance=true`; Schedule C currently does not.

## Job Financials payment controls

Payment-related Job Financials inputs were re-aggregated by job from hourly accruals, canonical fixed payments, canonical allocation payments, and job-linked owner withdrawals. All active canonical payments remained unchanged. Closed legacy jobs without canonical payment rows retain their historical `amount_paid`/expense evidence and were not rewritten.

Notable current-job controls:

- Grubb (job 54): fixed worker payments **$800.00**, allocation payments **$0.00**, owner withdrawals **$0.00**
- Napier (job 55): allocation payments **$211.79**, owner withdrawals **$0.00**

## Corrections applied

None.

The approved correction policy requires explicit source-row evidence before a void or reversal. The production rows support preserving the current records. Changing aggregate totals, backfilling null ownership, or voiding amount-matched rows would violate that policy.
