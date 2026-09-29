---
name: Confirmed Here fuel estimates
description: Route-based estimated gas days use only distinct confirmed Here presence dates
---

Estimated gas days use only distinct `job_daily_presence.date` values with `state = here` and `provenance = confirmed`. Three confirmed Here dates mean three fuel days regardless of a longer scheduled span; Expected Days remains separate. With no confirmed Here dates, the estimate is unavailable. Scheduled dates, Daily Logs, Sub Hours, component sessions, inferred presence, and unrecorded presence are not fallbacks.

**Why:** Expected duration is a planning estimate, not evidence of fuel usage. Counting planned days or unrelated work-date records can overstate gas and mix operational planning with cost tracking.

**How to apply:** Keep the detail and batch fuel estimates on the same distinct confirmed-Here date set; represent no eligible dates as an unavailable estimate. Keep route distance and fuel arithmetic inside RoutingEngine and VehicleEngine. The estimate is informational and must not create or alter actual expenses, mileage, reimbursements, payroll, or other ledger records.