---
name: Job mileage reimbursement
description: Boundary between editable job-card mileage reimbursement and accounting/mileage ledgers
---

The route-based fuel estimate may be represented by a job-card-only reimbursement record with an editable amount and recipient. When included in Job Costs, it reduces that job's net profit and the server-owned percentage split pool once.

**Why:** The monthly MileIQ import and IRS mileage deduction workflow must remain untouched, while the displayed financial waterfall must remain arithmetically traceable: Remaining and Split Pool cannot silently use different cost bases.

**How to apply:** Never write this reimbursement to `expenses`, `mileage_logs`, or `owner_capital_entries`. If an actual job-linked Fuel/Travel expense already exists, do not add the estimate or reimbursement again. Every amount included in Job Costs must be deducted before Growth Reserve and hourly/fixed labor to produce the Split Pool.