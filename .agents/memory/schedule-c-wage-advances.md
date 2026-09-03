---
name: Schedule C wage advances
description: Accounting treatment for hourly wage advances across tax and operating reports
---

Hourly wage advances are pre-payments of labor already captured by job-hour accrual expenses. Tax and operating expense totals must exclude rows explicitly flagged as wage advances while retaining the source expense history.

**Why:** A settled advance plus the corresponding hourly accrual overstated contract labor when Schedule C used a separate expense query from the already-correct P&L and Business Health paths.

**How to apply:** Use the expense row's explicit wage-advance flag as the classification signal. Preserve false and legacy-null rows, include hourly accrual rows once, and do not create a second payroll or correction ledger.