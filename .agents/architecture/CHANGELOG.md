# BuildPro Architecture Changelog

This file records completed architectural changes — what changed and when. It is the "history" layer showing structural evolution over time.

**Rules for this file:**
- Only record changes after they are **implemented and verified**
- Do not add entries for planned or in-progress work
- This is a historical record, not a plan

For *why* decisions were made, see `DECISIONS.md`.  
For the current state of each system, see `SYSTEM_REGISTRY.md`.

---

## 2026-08-05

### Task #1757 → #1760 — Owner Pay Architecture (two-phase correction)

**Phase 1 (Task #1757):** Added a new `owner_distributions` table as a separate ledger for job-level owner pay withdrawals. This was later identified as creating a duplicate system alongside the existing `owner_capital_entries` ledger.

**Phase 2 (Task #1760):** Removed `owner_distributions` entirely. Extended `owner_capital_entries` with a nullable `job_id` column so job-linked payments can be stored in the existing ledger. The job Pay Breakdown tab now reads from `owner_capital_entries` filtered by `job_id`; the Accounting page continues to show all entries unfiltered.

- Dropped table: `owner_distributions`
- Dropped schema file: `lib/db/src/schema/owner-distributions.ts`
- Dropped migration: `0044_owner_distributions.sql` (superseded by 0045)
- Added column: `owner_capital_entries.job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL`
- Added migration: `lib/db/migrations/0045_owner_capital_job_id.sql` (includes backfill before DROP)
- Removed routes: GET/POST/DELETE `/api/jobs/:id/owner-distributions`
- Updated route: GET `/api/owner-capital` now accepts `?jobId=` filter; POST accepts `jobId` in body
- Updated UI: Job Pay Breakdown tab now reads from `/api/owner-capital?jobId=X`
- Reason: Rule 1 (Single Source of Truth), Rule 26 (No Parallel Systems), ADR-001

---

### Task #1761 — BuildPro Architecture Governance System

Created the four-document architecture governance system:
- `.agents/architecture/CONSTITUTION.md` — 27 rules + mandatory pre/post checklists
- `.agents/architecture/SYSTEM_REGISTRY.md` — inventory of all core systems (read-only except via review)
- `.agents/architecture/DECISIONS.md` — ADR log seeded with ADR-001 through ADR-005
- `.agents/architecture/CHANGELOG.md` — this file
- Updated `.agents/memory/MEMORY.md` — pointers to all four files
- Updated `replit.md` — mandatory Architecture Review Gate requirement

---

### Gas/Fuel expense audit-trail bug fix
- Root cause: `isTravelCategory()` in `Expenses.tsx` included `"fuel/travel"`, causing the form to auto-set `countsTowardJobProfit = false` whenever a Fuel/Travel expense was linked to a job (lines 3782, 3797). This silently routed all job-linked fuel expenses to the "Travel & Audit Docs" bucket instead of "Job Expenses."
- Fix: Removed `"fuel/travel"` from `TRAVEL_CATEGORIES_LC`. Fuel is a car & truck operating expense (Schedule C Line 9), not IRS trip documentation.
- Also added `"Fuel/Travel"` to `TRIP_RECEIPT_CATEGORIES` in `Jobs.tsx` so fuel receipts can be logged directly from the job card trip section.
- Added Rules 28–50 and 10 Core Principles to `CONSTITUTION.md`. Rules 28–32 govern debugging methodology. Rules 33–50 govern growth, naming, ownership, configuration, traceability, immutability, and architectural discipline. Core Principles define the philosophy that resolves conflicts between rules.

---

*Add new entries here as architectural changes are completed and verified.*
