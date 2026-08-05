# Dead Code Audit Report
**Date:** 2026-08-05  
**Auditor:** Replit Agent (read-only, no code changes)  
**Governing Standard:** Architecture Constitution v1.0  
**Scope:** Database tables, API routes, React components, calculations, utility functions, migration artifacts.

---

## Audit Methodology

The explorer used Drizzle ORM variable names (e.g., `featuredClientsTable`) rather than raw string table names (`featured_clients`) for route-layer searches. An initial scan using literal strings produced ~40 false positives (tables flagged as dead but actually active via ORM). All findings below are verified against ORM variable names. Active-status corrections are noted where relevant.

---

## 1. Unused Database Tables

These tables have schema definitions and (in most cases) migration entries, but **zero references** in any active API route file. No Drizzle ORM query — select, insert, update, or delete — touches them.

### D-T1 — `conversations` + `messages`
**Schema files:** `lib/db/src/schema/conversations.ts:5`, `lib/db/src/schema/messages.ts` (no route file found)  
No route file for conversations or messages exists in `artifacts/api-server/src/routes/`. No ORM variable (`conversationsTable`, `messagesTable`) appears in any route. These tables were scaffolded but never wired to the API. The frontend has no calls to a `/conversations` or `/messages` endpoint. Both tables appear to be unreleased feature scaffolding.

### D-T2 — `featured_clients`
**Schema file:** `lib/db/src/schema/featured-clients.ts:3`  
`featuredClientsTable` has zero references in any route file. No `GET /featured-clients` endpoint exists. Not referenced in any frontend component. The table likely predates the current `Clients` page design and was never used.

### D-T3 — `inquiries`
**Schema file:** `lib/db/src/schema/inquiries.ts:5`  
`inquiriesTable` has zero references in any route. The only hit for the word "inquiries" in route files is a prose comment in `website.ts:3491` ("reduces out-of-area inquiries") — not a table query. Not referenced in any frontend component. Appears to be superseded by `wix-integration.ts` which routes web form submissions directly to `prospectsTable`.

### D-T4 — `portfolio_photos`
**Schema file:** `lib/db/src/schema/portfolio-photos.ts:5`  
`portfolioPhotosTable` has zero references in any route file. Not referenced in any frontend component. The website builder (`website.ts`) handles its own media via `website_media` / `website_media_folders`; the older `portfolio_photos` table appears to be a predecessor that was never deleted.

---

**Tables verified as ACTIVE** (corrected from initial literal-string scan):
`bid_opportunities`, `compliance_items`, `estimated_tax_payments`, `route_stops`, `bank_transactions`, `mileage_logs`, `growth_fund_deployments`, `job_type_benchmarks`, `business_trips`, `sub_advances`, `prospect_service_visits`, `quick_charges`, `job_knowledge_record_versions`, `generated_1099s`, `client_billing_profiles`, `subcontractors.growth_pct`, `jobs.days_on_job`, `jobs.closed_at` — all confirmed active.

---

## 2. Orphan Columns

Columns that exist in the schema and were added via migration but have no confirmed read or write path beyond declaration.

### D-C1 — `prospect_events.old_value`
**Schema file:** `lib/db/src/schema/prospect-events.ts:8`  
The `old_value` column is defined in the schema. No route or frontend reference to `old_value` (or `oldValue`) was found. The companion `new_value` column is presumably used for change tracking; `old_value` may have been dropped from the feature scope but left in the schema.

---

## 3. Dead API Routes

### D-R1 — `admin-migrations.ts` — 33 Accumulating One-Time Endpoints
**File:** `artifacts/api-server/src/routes/admin-migrations.ts`  
**Mounted at:** `/api/admin/migrations` (with `MIGRATION_KEY` env-var auth bypass)

This file contains **33 POST/DELETE endpoints** added incrementally over many sessions. Each endpoint was a one-time data migration or seed operation (e.g., `recompute-sub-payment-status`, `consolidate-mileage-expenses`, `seed-mfh-manufacturers`, `fix-mfh-hierarchy`, `add-invoice-lifecycle-columns`). Once run, these endpoints have no ongoing purpose.

Selected examples of stale endpoints:
| Endpoint | Purpose | Status |
|---|---|---|
| `POST /delete-payworker-expenses` | Removed dual-write expenses (Task #892) | Completed |
| `POST /consolidate-mileage-expenses` | One-time mileage consolidation | Completed |
| `POST /seed-clayton-billback` | One-time MFH seed | Completed |
| `POST /clear-draft-invoice-numbers` | One-time fix | Completed |
| `POST /seed-default-vehicle` | One-time seed | Completed |
| `POST /add-invoice-progression-columns` | Schema column addition | Completed |
| `POST /add-invoice-manual-paid-at` | Schema column addition | Completed |
| `POST /fix-invoice-1036-sequence` | One-time fix | Completed |

The route file is 1,400+ lines. The endpoints are permanently mounted in production, increasing attack surface. No frontend component calls any of them — they are exclusively curl-triggered operational tools that have already been run.

**Not flagged as dead** (still potentially needed): `POST /recompute-sub-payment-status` may be legitimately re-runnable; `POST /fix-mfh-hierarchy` may need re-running after catalog updates.

---

## 4. Unused React Components

### D-FC1 — Four Calculator Components with No Importers
These components are defined in `artifacts/contractor-app/src/components/calculators/` but are **not imported by any page or component** in the frontend codebase.

| File | Export | Lines |
|---|---|---|
| `ContractingCalculator.tsx` | `ContractingCalculator` | ~684 |
| `FlooringCalculator.tsx` | `FlooringCalculator` | ~79 |
| `PlumbingCalculator.tsx` | `PlumbingCalculator` | ~51 |
| `PunchListCalculator.tsx` | `PunchListCalculator` | ~31 |

**Contrast:** `AllTradesCalculator` and `AsphaltCalculator` in the same directory **are** imported by `pages/Estimates.tsx:21–22`. The four listed above were never wired to a page.

Total dead calculator code: ~845 lines.

### D-FC2 — 12 UI Primitive Components with No Importers
The following Radix-based UI primitives in `artifacts/contractor-app/src/components/ui/` are **not imported anywhere** in the frontend:

`aspect-ratio.tsx`, `button-group.tsx`, `dropdown-menu.tsx`, `hover-card.tsx`, `input-group.tsx`, `input-otp.tsx`, `menubar.tsx`, `navigation-menu.tsx`, `scroll-area.tsx`, `sonner.tsx`, `spinner.tsx`, `toggle-group.tsx`

These are standard shadcn/ui scaffolding components that were generated as part of initial setup but never used. They add bundle weight only if accidentally included in a barrel export; otherwise they are dead files.

---

## 5. Dead Named Exports

### D-E1 — `SCHEDULE_C_LINES` from `Expenses.tsx`
**File:** `artifacts/contractor-app/src/pages/Expenses.tsx:77`

```ts
export const SCHEDULE_C_LINES: Record<string, string> = { ... }
```

This named export maps expense categories to IRS Schedule C line numbers. No file outside `Expenses.tsx` imports `SCHEDULE_C_LINES`. It is defined and used only within the same file (for dropdown labels). The `export` keyword is unnecessary and falsely implies the constant is part of the public API.

---

## 6. Duplicate Calculations

### D-DC1 — SE Tax Formula Implemented Twice (Server and Frontend)
**Constitution Rule violated:** Rule 4 (One Calculation Engine)

The self-employment tax calculation is independently implemented in two places with identical arithmetic:

**Server** — `artifacts/api-server/src/routes/estimated-tax-payments.ts:113–116`:
```ts
const seTax = netProfit * 0.9235 * 0.153;
const seDeduction = seTax / 2;
const incomeTax = (netProfit - seDeduction) * 0.22;
const totalFederal = seTax + incomeTax;
```

**Frontend** — `artifacts/contractor-app/src/pages/accounting/OverviewTab.tsx:115, 1351–1354, 1584–1587`:
```ts
const FED_RATE = 0.9235 * 0.153;
// ...later:
const seTax = netProfit * 0.9235 * 0.153;
const seDeduction = seTax / 2;
const federal = (netProfit - seDeduction) * 0.22;
```

The frontend independently recalculates the same tax liability the server already computes. These can drift if one is updated and the other is not.

### D-DC2 — Growth Reserve Hardcoded in 6 Independent Locations
**Constitution Rule violated:** Rule 4 (One Calculation Engine), Rule 38 (Config Over Code)

The 5% growth reserve is computed as an inline literal in six separate locations:

| File | Line(s) | Context |
|---|---|---|
| `artifacts/api-server/src/lib/allocation.ts` | 13 | `const GROWTH_RESERVE_PCT = 0.05` — allocation engine |
| `artifacts/api-server/src/routes/admin-migrations.ts` | 1377 | `const GROWTH_PCT = 0.05` — migration recalculation |
| `artifacts/api-server/src/routes/reports.ts` | 1427, 1513, 1677, 1844 | Four separate `const GROWTH_PCT = 0.05` declarations |
| `artifacts/contractor-app/src/pages/Jobs.tsx` | 1420, 2817, 4178, 6628 | `afterWorkers * 0.05` inline in four places |

**10 total hardcode sites** across 4 files. `settings.growthReservePct` is editable in Settings UI but never read by any of these calculation sites (confirmed in the Accounting Audit).

### D-DC3 — `formatCurrency` Defined in 5 Separate Files
**Constitution Rule violated:** Rule 43 (No Duplicate Utilities)

A shared `formatCurrency` helper exists at `artifacts/contractor-app/src/lib/utils.ts:9`. Despite this, four additional files define local copies with identical or near-identical logic:

| File | Line | Signature |
|---|---|---|
| `lib/utils.ts` | 9 | `export function formatCurrency(amount: number \| null \| undefined)` — shared |
| `pages/accounting/InvestmentAccountDetail.tsx` | 27 | `function formatCurrency(v: number \| null \| undefined)` — local copy |
| `pages/accounting/InvestmentsTab.tsx` | 25 | `function formatCurrency(v: number \| null \| undefined)` — local copy |
| `pages/bids/AwardCard.tsx` | 25 | `function formatCurrency(amount: number \| null)` — local copy |
| `pages/Banking.tsx` | 242 | `function formatCurrency(amount: number \| string \| null \| undefined, currency = "USD")` — extended local copy |

Additionally, PDF generation files (`generateJobMaterialsPdf.ts:9`, `generateAssetDepreciationPdf.ts:36`, `generate1099NecPdf.ts:35`, `generateMaterialListPdf.ts:22`, `gmailSend.ts:163`, `printInvoice.ts:56`) each inline `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })` rather than importing the shared helper.

### D-DC4 — Allocation Payout `splitPool × pct / 100` Computed in 4 Locations
**Constitution Rule violated:** Rule 4 (One Calculation Engine)

The final payout calculation (`allocationPct / 100 * splitPool`) is supposed to be centralized in `lib/allocation.ts:138`. However, it is also independently computed in:

- `artifacts/api-server/src/routes/jobs.ts:1432–1433, 1963–1964, 2148–2149` (three occurrences)
- `artifacts/api-server/src/routes/reports.ts:151–161, 658–689` (two occurrences)
- `artifacts/contractor-app/src/pages/Jobs.tsx:1296–1298`
- `artifacts/contractor-app/src/pages/JobPayroll.tsx:112, 710, 1341`

The authoritative engine is bypassed in 7+ additional computation sites.

### D-DC5 — Material Tax Computed Twice in Same File
**File:** `artifacts/api-server/src/routes/material-lists.ts:118–119, 214–215`

```ts
// Line 118–119
const tax = subtotal * (taxRate / 100);
// ...
// Line 214–215
const tax = subtotal * (taxRate / 100);
```

The same tax formula appears twice within the same route file (once in the create handler, once in the update handler) rather than being extracted to a shared helper.

---

## 7. Stale Migration Artifacts

### D-M1 — `owner_distributions` Table: Created and Immediately Dropped
**Files:** `lib/db/migrations/0044_owner_distributions.sql`, `lib/db/migrations/0045_owner_capital_job_id.sql`

`0044` creates the `owner_distributions` table (8 columns, job FK, business FK). `0045`, the very next migration, backfills all `owner_distributions` rows into `owner_capital_entries` and then executes `DROP TABLE IF EXISTS owner_distributions`. The table lived for exactly one migration cycle before being superseded by ADR-001.

`owner_distributions` has **zero references** in any active schema file or route. The migration pair serves as a permanent record of the detour, not a problem — but it is the clearest example of a table that existed briefly and was fully replaced.

### D-M2 — Historical Drop Migrations in `lib/db/src/migrations/`
**Files:** `lib/db/src/migrations/0013_drop_services.sql`, `0019_drop_estimated_amount.sql`, `0020_drop_actual_amount.sql`

Three older migrations explicitly drop tables/columns from earlier schema versions. The tables dropped no longer appear in the active schema, confirming the drops were successful. These are clean — they represent completed removals, not stale code — but they are noted for completeness.

---

## 8. Legacy Code Accumulation

### D-L1 — `admin-migrations.ts` Is an Unbounded One-Time-Op Accumulator
*(See also D-R1)*  
**File:** `artifacts/api-server/src/routes/admin-migrations.ts` (1,400+ lines, 33 endpoints)

Each development session that required a one-time data repair added a new endpoint to this file. The endpoints are never removed after they've been run. Examples of confirmed-stale operations that remain mounted:
- `POST /delete-payworker-expenses` — completed as part of Task #892 (sub payment ledger Phase 2)
- `POST /add-invoice-progression-columns` — DDL completed; column exists in production
- `POST /seed-clayton-billback` — one-time MFH seed; already run
- `POST /clear-draft-invoice-numbers` — one-time fix; already run

All 33 endpoints remain permanently accessible via `MIGRATION_KEY` bypass. This is not a security crisis (key-gated), but the file will continue to grow with each new session unless a cleanup policy is established.

---

## Summary Table

| ID | Category | Severity | Description |
|----|----------|----------|-------------|
| D-T1 | Dead table | High | `conversations` + `messages` — scaffolded, never wired |
| D-T2 | Dead table | Medium | `featured_clients` — no route, no frontend reference |
| D-T3 | Dead table | Medium | `inquiries` — superseded by wix-integration → prospects |
| D-T4 | Dead table | Medium | `portfolio_photos` — superseded by `website_media` |
| D-C1 | Orphan column | Low | `prospect_events.old_value` — defined, never read |
| D-R1 | Dead routes | High | `admin-migrations.ts` — 33 stale one-time ops, permanently mounted |
| D-FC1 | Dead component | Medium | 4 calculator components (~845 lines) never imported by any page |
| D-FC2 | Dead component | Low | 12 UI primitives never imported |
| D-E1 | Dead export | Low | `SCHEDULE_C_LINES` exported but never imported externally |
| D-DC1 | Duplicate calc | High | SE tax formula in server + frontend independently |
| D-DC2 | Duplicate calc | Critical | Growth reserve 0.05 hardcoded in 10 sites across 4 files |
| D-DC3 | Duplicate util | Medium | `formatCurrency` defined in 5 files + inlined in 6 PDF/print files |
| D-DC4 | Duplicate calc | High | Allocation payout `splitPool × pct / 100` in 7+ sites vs 1 engine |
| D-DC5 | Duplicate calc | Low | Material tax computed twice in same file |
| D-M1 | Migration artifact | Info | `owner_distributions` created and dropped in consecutive migrations |
| D-M2 | Migration artifact | Info | 3 historical drop migrations in `lib/db/src/migrations/` |
| D-L1 | Legacy accumulation | High | `admin-migrations.ts` grows unboundedly; stale ops never removed |

---

## Top Remediation Priorities

1. **D-DC2 (growth reserve)** — Already flagged in Architecture Audit (Task #1769). Wire `settings.growthReservePct` into `lib/allocation.ts` and remove 9 of 10 hardcoded sites.

2. **D-DC4 (allocation payout duplication)** — All 7+ call sites should delegate to `computeAllocationSplitPool()` in `lib/allocation.ts`. The engine exists; it is simply being bypassed.

3. **D-R1 (admin-migrations accumulation)** — Establish a policy: one-time ops are removed from the file after confirmed execution in production, or consolidated into dated "already-run" archive. The live file should contain only re-runnable or still-needed operations.

4. **D-T1 (conversations + messages)** — If messaging is not a planned feature, drop these tables from the schema and migrations to prevent confusion. If it is planned, create a tracking task so they are not mistaken for dead code again.

5. **D-FC1 (4 dead calculators)** — ~845 lines of unreachable calculator code. Either wire them to a Calculators page or delete them.

---

*This report is read-only. No code was changed during the audit. All file paths and line numbers reflect the codebase state as of 2026-08-05.*
