# BuildPro Architecture Patterns

Proven implementation patterns for BuildPro. When building something new, find the closest matching pattern here and follow it rather than inventing a new approach.

---

## Pattern 1 — Adding a Financial Ledger

**Correct approach:**

1. Check `SYSTEM_REGISTRY.md` — does a ledger already exist for this concept?
2. If yes → extend it (add a nullable FK column for the new dimension)
3. If no → follow the Architecture Review Gate before creating a new table
4. New table requires: `id`, `business_id` FK, `date`, `amount`, `description`, `created_at`
5. Update `SYSTEM_REGISTRY.md` with the new source of truth
6. Document the decision in `DECISIONS.md`

**Example (correct):** Job-linked Owner Pay — extended `owner_capital_entries` with `job_id` (nullable FK) instead of creating a separate `owner_distributions` table.

**Example (incorrect):** Creating `owner_distributions` as a parallel ledger — violated Rule 1 (Single Source of Truth) and Rule 26 (No Parallel Systems).

---

## Pattern 2 — Adding a Calculation Engine

**Correct approach:**

1. Calculations live in API route handlers or shared service files — **never in React components**
2. One function computes the result; all surfaces (Dashboard, Reports, Job Card, Taxes) call that function
3. Return raw numbers, not formatted strings — let the UI format
4. Never persist the computed result (Rule 49 — Everything Starts With Raw Data)
5. Every computed value returned from the API must be traceable to the raw inputs

**Example (correct):** `GET /api/jobs/:id/profit` — single endpoint computes `jobExpenses`, `subLaborCost`, `netProfit`, `auditTrailTotal`. Every surface (P&L tab, Pay Breakdown, Reports) reads from this one endpoint.

**Example (incorrect):** Calculating profit inside a React component using locally-fetched data — creates drift between surfaces and hides business logic in UI code (Rule 35).

---

## Pattern 3 — Adding a Configurable Business Rule

**Correct approach:**

1. Business rule value lives in `settings` table (or entity-specific config)
2. API reads the value from settings at request time — never hardcoded
3. UI displays and allows editing the setting through the Settings page
4. Calculations always derive the value from the database, not from constants in code

**Example (correct):** Growth reserve % — stored in `settings.growthReservePercent`, read by the profit endpoint at runtime, editable in Settings page.

**Example (incorrect):** `const GROWTH_RATE = 0.05` hardcoded in a route — violates Rule 16 (No Magic Numbers) and Rule 38 (Configuration Over Code).

---

## Pattern 4 — Extending an Existing Module

**Correct approach:**

1. Identify the owning module from `SYSTEM_REGISTRY.md`
2. Add the new capability to the existing route file, not a new one
3. Reuse existing DB queries — add a filter parameter rather than a new endpoint where possible
4. Keep the existing API contract intact — add optional parameters, never remove or rename existing ones (Rule 33)
5. Update `SYSTEM_REGISTRY.md` only if ownership or source of truth changes

**Example (correct):** Job-scoped owner capital entries — added `?jobId=` filter to `GET /api/owner-capital` instead of creating a new `GET /api/jobs/:id/owner-pay` endpoint.

**Example (incorrect):** Creating a new route file for a concept already owned by an existing module — duplicates API surface and creates ownership ambiguity (Rule 34).

---

## Pattern 5 — Correct Debugging Workflow

Follow Rules 28–32. Every bug investigation follows this exact sequence:

```
1. TRACE  — Walk UI → API → Backend → Database → Response → UI
2. DATA   — Query the database for the actual record
3. API    — Check the actual API response (or simulate it from code + DB)
4. LINE   — Identify the exact line of code where behavior diverges from expectation
5. FIX    — Make the smallest change that addresses the confirmed root cause
6. REGRESS — Test all adjacent behavior with controlled test data
7. VALIDATE — Verify against real application data in the running app
8. CLEANUP — Remove all test data created during debugging
```

**Never skip to step 5.** A fix applied before step 4 is a guess, not a solution.

**Example (correct, Aug 2026 gas expense bug):**
- Traced: Expenses page → `POST /api/expenses` → `expenses` table → `GET /api/jobs/:id/profit`
- Found: `Expenses.tsx:3782` — `isTravelCategory("Fuel/Travel")` auto-set `countsTowardJobProfit = false`
- Fixed: Removed `"fuel/travel"` from `TRAVEL_CATEGORIES_LC` (1 line)
- Regressed: All 8 remaining travel categories still correctly route to audit trail
- Validated: Test data confirmed with database queries; cleaned up after

---

## Pattern 6 — Adding a Schema Migration

**Correct approach:**

1. Write the SQL migration file in `lib/db/migrations/` with sequential number
2. Add `IF NOT EXISTS` / `IF EXISTS` guards for safety
3. Include any backfill before destructive operations (DROP TABLE, DROP COLUMN)
4. Apply to dev database with `psql $DATABASE_URL` — never use `drizzle-kit push` interactively in production
5. Verify dev schema with a query before declaring success
6. Re-publish applies the migration to production (do not create admin endpoints for schema DDL)

**Example (correct):** Migration `0045_owner_capital_job_id.sql` — adds `job_id` column, backfills from `owner_distributions`, then drops `owner_distributions`.

**Example (incorrect):** Applying schema changes by editing the schema file and running `drizzle-kit push` in a TTY — requires interactive approval, fails non-interactively, and doesn't produce a repeatable migration file.

---

*Constitution v1.0 — Frozen 2026-08-05*  
*Add new patterns here as proven approaches are established. Do not modify existing patterns without architectural review.*
