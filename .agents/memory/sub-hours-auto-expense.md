---
name: Sub-hours auto-expense pattern
description: When sub hours are logged on a job card, an expense is auto-created in expensesTable. jobSubHoursId links the two records.
---

When hours are saved via `POST /:jobId/sub-hours` or updated via `PUT /sub-hours/:id`, the route calls `upsertLinkedExpense()` which creates or updates a matching row in `expensesTable` (category=Subcontractor, subcontractorId, jobId, amount=hours×rate).

When hours are deleted, `deleteLinkedExpense()` removes the linked expense first, then the hours row is deleted.

**Why:** Sub hours appeared in job-level P&L but not on the Expenses page. Users then manually added a Subcontractor expense → double-counted in P&L and sub portal YTD. Auto-creation means no manual step needed.

**How to apply:** The `expensesTable.jobSubHoursId` integer column is the link. The Expenses page shows an "Auto • Hours" badge and hides edit/delete for these rows. Users are directed to edit hours on the job card instead.

The `computeYtd` function (sub portal YTD) already queries `expensesTable` where subcontractorId matches + category='subcontractor', so auto-expenses flow through correctly without any other changes.
