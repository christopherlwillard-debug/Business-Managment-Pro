---
name: Mileage import monthly expense pattern
description: CSV mileage imports create one aggregate expense per month, not per trip; how the link and recalc work
---

Imported mileage trips (MileIQ CSV) do NOT get per-trip expenses. Instead one expense per month per import is maintained: description "<Month> <Year> IRS Mileage", vendor "IRS Mileage", category "mileage", date = last business trip of the month, linked via `expenses.mileage_import_id`.

**Why:** Per-trip expenses flooded the Expenses page (~70+ rows for one month) while trips already live in the Mileage log. Monthly aggregates keep P&L totals identical (sums the same numeric(10,2) deductionAmount values).

**How to apply:**
- `recalcImportExpenses(importId)` in the mileage routes is the single source of truth — it upserts/deletes monthly aggregates. Call it after any mutation of imported logs (bulk import, PUT/DELETE of a log, migrations). Imported logs have `importId` set and `expenseId` null.
- Manual logs (no importId) still use the old per-trip expense behavior — do not change that.
- Legacy per-trip import data is consolidated by the admin migration `consolidate-mileage-expenses` (dryRun default true, idempotent). Recalc runs outside the delete transaction: after a prod run, verify `recalcErrors` is empty.
- Frontend: expense detail modal shows a trip summary when `expense.mileageImportId` is set (fetches `/mileage?businessId=&importId=`).
