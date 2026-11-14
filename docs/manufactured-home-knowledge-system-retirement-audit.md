# Manufactured-Home Knowledge System Retirement Audit

**Audit date:** 2026-11-13  
**Scope:** Read-only code/schema review and aggregate production queries. No application code, schema, records, prices, or production jobs were changed.

## Executive summary

The current “Home Knowledge Base” is not one isolated pricing tool. It combines manufacturer/model reference data, optional guide-based pricing, a baseline/client-price workflow, job-linked production history, reviewed production benchmarks, and links to operational checklists. Separately, the Production Billing Catalog and its client price overrides generate invoice lines and are actively used.

**Do not retire the whole manufactured-home system or delete its data.** The production database contains historical jobs and invoices tied to manufacturer/model records, 13 job-knowledge records, and 296 manufactured-home production-component rows. The guide tables are empty, but the model baseline/client-price path has live data and job price snapshots. The separate Production Billing Catalog has 13 active items and 15 client overrides, with production services selected on 21 jobs.

The safe direction is a **scoped interface retirement and separation**: stop presenting unused guide-management controls as a required workflow only after the owner approves that change; preserve manufacturer/model references, job price snapshots, client prices, job history, production components, checklists, photo records, and the complete Production Billing system. Do not delete tables or rewrite historical records in an initial phase.

## What was inspected

- Existing Job Builder capability audit and UX proposal: `docs/job-builder-capability-audit.md`, `docs/job-builder-ux-proposal.md`.
- System boundaries and decisions: `.agents/architecture/SYSTEM_REGISTRY.md`, `.agents/architecture/DECISIONS.md`, `.agents/architecture/CONSTITUTION.md`, including ADR-022 and ADR-024.
- Schemas: `lib/db/src/schema/mfh.ts`, `jobs.ts`, job-type benchmark and component-baseline schemas.
- UI: `artifacts/contractor-app/src/components/MfhPanel.tsx`, `artifacts/contractor-app/src/pages/MfhKnowledgeBase.tsx`, `TrimOutCatalog.tsx`, `App.tsx`, and `AppLayout.tsx`.
- APIs and pricing behavior: `artifacts/api-server/src/routes/mfh.ts`, `mfh-labor.ts`, `jobs.ts`, `production-service-types.ts`, `service-addon-prompts.ts`, and `artifacts/api-server/src/lib/productionBilling.ts`.
- Production queries were aggregate `SELECT`s only. They did not return job titles, customer names, addresses, or other personal details.

The production figures below are a point-in-time snapshot. Counts describe current rows, not future need or historical activity before the data currently retained.

## Current capabilities and dependencies

### 1. Manufacturer and model reference

The Home Library manages construction types, manufacturers/builders, models, notes, active status, model years, checklist-template defaults, and optional model benchmark defaults. It can add or edit builders and models; delete is intentionally blocked for builders and models, which must instead be marked inactive.

The Job Builder and `MfhPanel` use manufacturer/model data for home selection and job snapshots. The job stores manufacturer/model IDs and year along with dealer-price, quoted-price, guide-name, selected-add-on, and travel-day fields. Historical jobs therefore depend on the reference records even if guide management is retired. The job’s manufacturer/model columns are not declared as protective foreign keys, so deleting a library row could leave a historical numeric reference without its name.

### 2. Optional manufacturer guide pricing

The Home Library has a Pricing tab for guides, model prices within a guide, dealer-guide designation, and guide add-ons. The job panel has a guide-based application path that creates MFH estimate lines, saves pricing snapshots, and may attach the model’s checklist template.

There is also a separate baseline path: model base price → client/model price override → optional manual price. It writes job and estimate snapshots and generated MFH estimate lines. This path is not the same as the Production Billing Catalog.

**Important pricing behavior to preserve and review before any change:** when the baseline path is used, the API currently stores the same effective price as both dealer and quoted price. Do not change or reinterpret this behavior as part of a navigation retirement. If the owner wants different semantics, that needs separate approval and financial regression coverage.

### 3. Operational production knowledge

The Home Knowledge Base page is more than a model list. It shows accepted-job averages and learning history, allows knowledge records to be accepted or excluded, exposes production observations, and offers reviewed benchmark/component-baseline workflows. Knowledge records have version history; edits are auditable. These records are distinct from the live job-profit calculation and must not be treated as a replacement financial ledger.

The production-observation and component-baseline functions are explicitly bounded to reviewed, evidence-backed operational learning. They must not be replaced with automatic labor-hour or profit learning.

### 4. Production billing and client overrides — separate, active system

The Production Billing Catalog has its own service types, billing modes and rates, per-client `production_price_overrides`, service add-on prompts, and invoice-application route. The `productionBilling.ts` engine builds invoice lines from the job’s selected production services and configured prices.

This is not the manufacturer/model guide system. The owner’s stated requirements expressly preserve the catalog, its item types and business-specific rates (including Clayton/Cavco and Lot/Field), client overrides, invoice generation, and calculations. None should be hidden, removed, or altered under a manufacturer-library retirement.

### 5. Checklists, components, history, and photos

Model defaults can reference checklist templates; applying a model can create a job checklist. Job production components and work sessions are operational job records. The separate Trim-Out Catalog lists completed/invoiced/closed manufactured-home jobs with manufacturer/model assignments and their checklist start, finished, and item photos. It is a historical photo/catalog workflow, not a pricing-guide screen.

Do not remove checklists, production components, scheduling/presence, job history, or Trim-Out Catalog photo access as part of this proposal.

## Production snapshot

| Area | Read-only production result |
|---|---:|
| Manufacturers/builders | 12 active |
| Models | 10 active |
| Models with a model-level baseline price | 2 |
| Models with a linked benchmark | 0 |
| Manufacturer pricing guides / guide items / guide add-ons | 0 / 0 / 0 |
| Model-specific client pricing rows | 2 |
| Manufactured-home jobs matching production/service workflows | 27 total: 21 production and 6 service; all were closed or completed |
| Jobs with manufacturer/model references | 15 manufacturer references and 13 model references |
| Production jobs with dealer-price / quoted-price snapshots | 2 / 2; no guide-name or selected-add-on snapshots |
| Invoices attached to those jobs | 27 rows across 27 jobs: 23 paid and 4 sent |
| Estimates with MFH pricing snapshots | 0 (2 estimates existed in total) |
| Job knowledge records | 13: 9 accepted and 4 excluded |
| Job knowledge-record versions | 13 |
| Production components on manufactured-home production jobs | 296 across 11 jobs: 158 planned, 93 completed, 33 in progress, 12 not applicable |
| Component work sessions / benchmark revisions / component-baseline revisions | 0 / 0 / 0 |
| Production Billing Catalog items | 13 active: 9 production and 4 service |
| Jobs selecting production services | 21 |
| Production price overrides | 15 |

These counts support retiring unused guide-management affordances as a possible UX simplification, but **do not** support deleting the library or its pricing path: live jobs, invoices, model-level prices, client pricing, and job price snapshots remain. The lack of current guide rows does not establish that guide workflows are no longer needed.

## Retirement assessment

### Safe to consider, with owner approval

- Remove a redundant **primary-navigation entry** for the Home Knowledge Base if the operational learning and review functions remain reachable in an intentionally named production-operations area.
- Stop presenting empty guide/add-on management as a required job-creation step. If the owner approves a narrower UI, keep existing data/API compatibility and do not change pricing behavior.
- Separate model/job reference from operational learning so that a user can select a manufacturer/model without having to understand knowledge averages or benchmark review.

### Keep in the product

- Manufacturer, model, construction-type, model-year, notes, and active/inactive references used by job creation, editing, history, and Trim-Out Catalog.
- Job-level dealer/quoted price and guide/add-on snapshots, model baseline prices, and both model- and client-level price rows until their role is explicitly resolved.
- Accepted/excluded knowledge records, version history, production observations, and review history.
- Production Billing Catalog, its 13 active service items, 15 client overrides, service add-on prompts, invoice generation, and all calculations.
- Job checklists, production components, work sessions, scheduling/presence data, historical jobs/invoices, and Trim-Out Catalog photos.

### Do not do in the first phase

- Drop or truncate tables, delete manufacturers/models, rewrite job IDs, modify production jobs, backfill prices, or change invoice/estimate data.
- Change formulas, job revenue, production billing rates, client overrides, job-profit calculations, or ledger behavior.
- Remove the manufacturer/model selector or make job creation depend on a pricing guide.
- Remove the operational Knowledge Base features before deciding where their history/review work should live.

## Recommended phased plan

1. **Navigation and terminology:** keep the existing job-level model selection; distinguish operational production learning from price setup; do not add a required guide step. If approved, move the knowledge/review page out of primary navigation without deleting its route or data.
2. **Narrow pricing UI only after owner confirmation:** if the owner confirms guides are no longer used, remove or de-emphasize empty guide-management controls while preserving model/client baseline prices, manual job pricing, and existing job snapshots. No schema or data migration.
3. **Preserve operational learning:** retain accepted/excluded records and version history; decide separately where production observations and reviewed baseline controls belong.
4. **Keep Production Billing unchanged:** continue to manage its catalog and client overrides in their existing dedicated workflow.
5. **Data/code retirement only by separate approval:** after usage is rechecked and an export/retention plan is approved, consider deleting dead guide rows or code. No such deletion is recommended now.

## Regression plan before any retirement change

- Create and edit manufactured-home production and service jobs with all existing fields preserved; confirm manufacturer/model/year selection and saved job snapshots.
- Apply and update both guide-based and baseline/client/manual pricing using isolated fixtures; confirm non-MFH estimate lines remain, expected snapshots persist, and checklist-template application still works.
- Confirm Production Billing selects service items, resolves business/client overrides and billing modes, and produces correct invoice lines without changing job-profit or ledger calculations.
- Confirm job checklists, component states, production observations, knowledge-record accept/exclude/edit history, and historical model detail remain available.
- Confirm Trim-Out Catalog still lists eligible historical jobs and can resolve their builder/model names and photos.
- Verify no regular job creation, completion, closeout, subcontractor-pay, financial, or reopen safeguards change.

## Recommendation

Retire **only redundant navigation and unused guide-management presentation**, if the owner approves that narrower scope. Preserve all records and keep the job-facing manufacturer/model reference, baseline/client pricing, production history, checklists, and photo catalog. Keep the active Production Billing Catalog and its client overrides entirely separate and unchanged. No database migration or production-data operation is justified by this audit.

## Approved interface simplification — implementation record

**Approved scope:** remove the Home Knowledge Base from primary navigation only. The owner separately approved retaining the complete underlying system and all related workflows.

### Exact interface changes

- Removed the **Home Knowledge Base** entry from the owner’s primary sidebar.
- Kept the owner-only `/mfh-homes` route and its page intact. Existing direct links and bookmarked URLs remain compatible.
- Kept manufacturer/model selection and inline builder/model creation in the Job Builder, and kept the Home Library controls in the job’s Manufactured Home panel.
- Job creation still does not require a pricing guide or guide add-on. The existing baseline/client/manual price paths and guide-based workflow remain unchanged.
- No Production Billing UI, catalog, override, prompt, invoice, or calculation code was changed.

The already-approved guided Job Builder phase also changed which creation-step fields are visible at a time; values remain in controlled form state while navigating, and normal edit forms continue to show all fields.

### Files changed

- `artifacts/contractor-app/src/components/AppLayout.tsx` — removed the primary-nav item and its now-unused icon import.
- `artifacts/contractor-app/src/pages/Jobs.tsx` — the previously approved guided-creation step visibility, navigation, validation focus, and review summary.
- `artifacts/contractor-app/src/lib/jobBuilderNavigation.ts` — step visibility helper.
- `artifacts/contractor-app/src/lib/jobBuilderNavigation.test.ts` — regression checks for type-aware steps, optional steps, workspace groups, and visibility behavior.
- `docs/manufactured-home-knowledge-system-retirement-audit.md` — this audit and implementation record.

### Tests and verification performed

- Contractor-app TypeScript checks passed, including the test TypeScript project.
- Contractor-app Vitest: 2 files passed, 13 tests passed (`jobBuilderNavigation.test.ts` and `MfhKnowledgeBase.production-observations.test.tsx`).
- API Vitest: 4 files passed, 49 tests passed (`productionBilling`, production observations, MFH production reviews, and job production components).
- Source verification confirmed that `/mfh-homes` remains owner-guarded, `MfhPanel` retains manufacturer/model and price workflows, the MFH apply route still accepts a baseline path without a guide, and Trim-Out Catalog routes remain present.
- No automated test was found for the complete signed-in Job Builder → pricing snapshot → invoice flow or Trim-Out Catalog navigation. Those paths were not end-to-end tested in this run. The preview browser showed the sign-in page, so the signed-in UI could not be visually verified.

### Data and behavior unchanged

No database migration, table or record deletion, production job edit, price change, invoice change, or financial formula change was made. Accepted/excluded knowledge records, version history, production observations, reviewed benchmarks, checklists, job history, and Trim-Out photos remain available through their existing routes and job workflows.

### Remaining knowledge-system functionality

- Owner-only `/mfh-homes` page for manufacturer/model reference, knowledge history, production observations, and reviewed operational baselines.
- Job Builder and job panel access to manufacturer, model, construction type, model year, notes, active/inactive references, and the existing Home Library.
- Optional manufacturer pricing guides/add-ons, model baseline prices, client/model overrides, manual job pricing, and historical job price snapshots.
- Existing job-level checklists, production components, historical records, and Trim-Out Catalog access.
- The Production Billing Catalog, client overrides, service prompts, invoice generation, and calculations remain completely separate and untouched.
