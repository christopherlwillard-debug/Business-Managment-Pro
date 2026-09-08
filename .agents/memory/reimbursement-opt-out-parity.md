---
name: Reimbursement opt-out parity
description: Shared behavior for saved job mileage reimbursements when a job excludes them from Job Costs
---

When a job opts out of mileage reimbursement, preserve the saved reimbursement as source data but derive applied-status metadata from the same persisted setting used by the shared profit calculator. Detail and batch views must exclude the amount from job expenses, included costs, split-pool inputs, and net profit while leaving payroll and allocation inputs unchanged.

**Why:** A route can calculate the correct profit while still claiming the reimbursement was applied if response metadata only checks for actual fuel. That creates conflicting explanations between Job Financials and batch cards.

**How to apply:** Pass the job’s `includeMileageInJobCosts` value through every calculation and response-enrichment path, including cached batch re-projection. Keep routing mocked in parity fixtures so failures isolate reimbursement behavior rather than external distance estimation.