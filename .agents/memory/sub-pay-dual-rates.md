---
name: Sub pay dual rates & advances
description: Schema and flow for work/travel split rates, performance bonus, and advance deductions on hourly sub payments
---

## The Rule
When recording pay for an hourly sub, the client should send `workHours + workRate` (and optionally `travelHours + travelRate`, `bonusAmount`, `advanceAmount`). The server computes `netPaid = (wH×wR) + (tH×tR) + bonus - advance` and stores it as `amount`. Do not send `amount` when using breakdown mode.

## Schema additions (via ensureSubPayDualRateColumns startup migration)
- `sub_payment_records`: `work_hours`, `work_rate`, `travel_hours`, `travel_rate`, `bonus_amount`, `bonus_note`, `advance_amount`, `advance_note`, `net_paid`
- `subcontractors`: `travel_pay_rate` — profile-level default travel rate
- `job_subcontractors`: `travel_rate` — job-level override travel rate

## Rate precedence
Travel rate: job_subcontractors.travel_rate → subcontractors.travel_pay_rate (same as work rate: job_subcontractors.hourly_rate → subcontractors.pay_rate)

## Agreed hourly amount
If `job_subcontractors.amountOwed` is set for an hourly worker, it is the authoritative job payout and must replace the aggregate hours × rate amount in job profit, allocation-pool, outstanding-payment, and Job Financials calculations. Percentage allocations remain separate.

**Why:** A completed job exposed that payment UI honored the override while profit and split-pool calculations still used raw logged hours, inflating hourly labor and changing the waterfall.

**How to apply:** Any new hourly-pay calculation must resolve the job-level agreed amount before falling back to rate snapshots; do not fold allocation compensation into hourly labor.

## UI locations
- SubPaymentRowCard (Jobs.tsx): hourly subs show breakdown form; fixed/allocation use simple amount input
- JobSubHoursPanel payments tab: Travel rate/hr inline field added alongside Work rate/hr
- Subcontractors.tsx rate editing modal: Work rate/hr + Travel rate/hr side-by-side

**Why:** Hourly subs often drive to job sites at a different rate than their work rate. Previously no way to split; advance repayment required negative adjustment workaround.
