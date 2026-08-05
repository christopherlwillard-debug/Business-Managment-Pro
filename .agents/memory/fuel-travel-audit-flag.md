---
name: Fuel/Travel audit-trail auto-flag
description: isTravelCategory() in Expenses.tsx auto-sets countsTowardJobProfit=false for job-linked travel expenses; fuel/travel was wrongly included and removed Aug 2026
---

## The Rule
`TRAVEL_CATEGORIES_LC` in `Expenses.tsx` controls which categories get auto-flagged as `countsTowardJobProfit = false` when linked to a job. Do NOT add "fuel/travel" back to this list.

## Why
Lines 3782 and 3797 of `Expenses.tsx` fire `setCountsTowardJobProfit(false)` whenever:
- A job is selected AND the category is in `TRAVEL_CATEGORIES_LC`

"fuel/travel" was in that list, so all job-linked fuel expenses silently went to "Travel & Audit Docs" (blue box on job card) instead of "Job Expenses." They showed `countsTowardJobProfit = false` in the DB and were filtered out by the `GET /api/jobs/:id/expenses` and `GET /api/jobs/:id/profit` routes.

## How to Apply
- Fuel/Travel is a car & truck operating expense (Schedule C Line 9) — it should reduce job profit, not go to audit trail.
- Hotel/Lodging, Meals, Airfare, Rental Car, Taxi/Rideshare, etc. are legitimate IRS trip documentation items — those stay in `TRAVEL_CATEGORIES_LC`.
- If adding new expense categories: only put them in `TRAVEL_CATEGORIES_LC` if they are trip-documentation items (IRS Form 2106 / Schedule C Lines 24a/24b), not operating costs.
