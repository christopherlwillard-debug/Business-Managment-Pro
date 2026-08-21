---
name: Job mileage reimbursement
description: Boundary between editable job-card mileage reimbursement and accounting/mileage ledgers
---

The route-based fuel estimate may be represented by a job-card-only reimbursement record with an editable amount and recipient. It reduces that job's costs and net profit once, but remains outside the percentage split pool.

**Why:** The monthly MileIQ import and IRS mileage deduction workflow must remain untouched, while whoever fronted fuel still needs to be reimbursed at the job level.

**How to apply:** Never write this reimbursement to `expenses`, `mileage_logs`, or `owner_capital_entries`. If an actual job-linked Fuel/Travel expense already exists, do not add the estimate or reimbursement again.