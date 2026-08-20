---
name: Job-only expense allocations
description: Partial job cost distributions must remain separate from the company expense ledger.
---

Job-only allocations are derived distributions of an existing expense, keyed by source expense, job, business, and amount. The source expense remains the accounting/P&L record; job-profit calculations add only the allocation amount, and an expense already assigned to a job cannot also be partially allocated.

**Why:** A single expenses.job_id cannot represent a partial amount or one purchase split across multiple jobs, and creating another expense row double-counts company spending.

**How to apply:** Keep allocation routes business-scoped and enforce that the sum of active allocations never exceeds the source expense amount. Treat allocation removal as metadata cleanup, not deletion of the source financial record.