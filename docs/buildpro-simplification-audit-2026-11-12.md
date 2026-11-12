# BuildPro Application Simplification Audit

**Audit date:** 2026-11-12  
**Scope:** Read-only source and architecture review; no application, database, deployment, or production changes.  
**Decision principle:** Keep existing capabilities and sources of truth. Simplify how they are found and used; do not consolidate ledgers or calculations to reduce screens.

## 1. Executive summary

BuildPro already covers the full contractor workflow: leads, jobs, field operations, estimates, invoices, payments, expenses, mileage, subcontractor payroll, accounting, tax, compliance, equipment, bids, grants, and a Website Studio. The main simplicity problem is not a lack of features. It is that the navigation and large workflow pages expose many independently owned capabilities without a consistent “what next?” path.

The strongest opportunities are:

1. Make the Dashboard answer **business state, urgent attention, and next action** before showing historical detail.
2. Organize the existing destinations into the proposed **Home / Work / People / Money / Tools / Manage** categories, preserving direct links and permissions.
3. Reduce the amount of unrelated work visible at once in Jobs, Settings, and Website Studio through progressive disclosure and workflow-specific workspaces. Do not split the shared job or financial systems.
4. Keep money sources, calculations, and reports separate where their meanings differ. The nine Accounting tabs are not evidence that the ledgers should be merged.
5. Treat older audit findings as leads to re-check, not current defects. The August 2026 accounting and dead-code audits predate later architecture decisions and implementation work.

This review used the architecture Constitution, System Registry, ADR log, Patterns, Changelog, prior audit reports, selected simplification plans, route definitions, navigation, permissions, settings/accounting/dashboard code, API route mounts, and schema inventory. It was a source review, not a usability study or authenticated browser walkthrough. Every recommendation below is a proposal only.

## 2. Current application map

The app uses React + Vite with Wouter, an Express API, PostgreSQL/Drizzle, Replit authentication, and generated API clients. Source inventory found 40 route declarations, 42 top-level page files (including two test files), 82 non-test API route modules, 73 schema files, and 114 distinct `pgTable` declarations.

### Authenticated routes and feature inventory

“Owner” below means owner-only in the route or main navigation. Section access is granted through the existing view/edit permission model. Actual record authorization remains a backend responsibility.

| Current route | Capability and primary user | Related capability / current placement | Discovery or flow observation; proposed home |
|---|---|---|---|
| `/` | Dashboard; owner | Dashboard cards link to jobs, accounting, expenses | Owner-only and dense with financial, schedule, alert, and activity content. **Home**. |
| `/jobs` | Jobs, job cards, schedule, work breakdown, photos, labor, production components, materials, expenses, invoice access; owner and permitted staff | Main operations hub; job payroll at `/jobs/:id/payroll`; trip packet at `/trip-packet/:jobId` | Jobs owns many adjacent workflows and is an 11,901-line page. Keep it as the shared job workspace; progressively reveal panels by job/workflow. **Work**. |
| `/expenses` | Expense entry, review, imports, recurring expenses; owner and permitted staff | Banking, mileage, job costs, accounting reports | Expense entry and accounting review are separate tasks, but expense is grouped under Operations. **Money**, with contextual job entry. |
| `/mileage` | Manual trips, imports, trip history; owner and permitted staff | Expenses, vehicle settings, tax reporting | A separate, specialized source of truth; do not turn it into an expense-entry variant. **Money**, with job/context actions. |
| `/people` | Shared people workspace for clients, prospects, subcontractors, contacts/properties | `/clients`, `/prospects`, `/subcontractors`, `/address-book` redirect to tabs | Consolidation avoids duplicate pages, but redirects and tab state make sub-destinations less visible. **People**. |
| `/settings` | Business profile, invoice defaults, financial/P&L config, production billing, mileage, modules, notifications, payments, team, Google, Wix | Also links to integrations, equipment, vehicle, compliance, pricing and website features | Twelve horizontally scrolling tabs; distinct topics share one long settings surface. **Manage**, grouped into the six categories in §4. |
| `/accounting` | Overview, monthly revenue, P&L, Schedule C/home office, tax calendar, year-end, benchmarks, business trips, investments | Expenses, invoices, mileage, owner withdrawals, taxes, payroll, reserves | Nine tabs (Year-End owner-only); several concepts require different accounting treatment. **Money**. |
| `/estimates` | Quote Center, pricing, quote delivery, decisions and authorization; owner | Jobs, invoices, CRM | Separate from invoices for a reason: quotes are pre-sale; decision and work authorization are different events. **Work**, with conversion into Money. |
| `/invoices` | Invoice lifecycle, delivery, payment links; owner | Jobs, estimates, Square, accounting | Invoice editing also has job entry points. Keep one invoice source and use contextual entry, not parallel invoice pages. **Money**. |
| `/materials` | Catalog and job material lists; owner | Jobs, expenses, invoices | Shared catalog plus job-level use. **Work**, with invoice assignment in the job/invoice context. |
| `/route-planner` | Route stops, route optimization, job/client associations; owner | Jobs, mileage, business trips | Useful operational tool but split from Jobs in the main navigation. **Work** or **Tools**, surfaced from a job when relevant. |
| `/prospects` | Redirect to People → prospects tab | Website inquiries, estimates, clients | The route exists but is not a separate page. **People**. |
| `/assets` | Business assets/depreciation; owner | Mileage, reports, settings | A business record with accounting consequences. **Money** or **Manage → Business Profile** depending on whether user is reviewing or configuring. |
| `/aerial-quote` | Aerial quote workflow; owner | Estimates, clients, specialized calculators | Specialized tool; connect its completion to an existing estimate rather than duplicating quote data. **Tools**, launched from Work. |
| `/quick-charge` | Quick charge/payment link; owner | Invoices, Square, deposits | Payment collection overlaps with invoice payment links but may serve non-invoice charges. **Money**; clarify when to use versus invoice payment. |
| `/square-transactions` | Square provider transaction history; owner | Banking, invoices, other income | Provider mirror/reconciliation view, not a second revenue ledger. **Money → Reconciliation**. |
| `/banking` | Plaid feed, reconciliation and filing actions; owner | Expenses, invoices, other income | Keep bank transactions as reconciliation anchors; filing an item into the ledger is a deliberate contextual action. **Money**. |
| `/bids` | Government bid opportunities, qualifications, sources and pipeline; owner | Grants, business profiles, estimates | Prospecting source, not a contract or revenue system. **Work → Opportunities** or **Tools**. |
| `/grants` | Grant discovery and source configuration; owner | Bids and funding | Separate from bids because opportunity sources and workflows differ. **Work → Opportunities**. |
| `/equipment` | Find equipment/opportunities; owner | `/equipment/inventory`, crew, assets | Discovery and owned equipment are related but distinct. **Tools → Equipment**. |
| `/equipment/inventory` | My Equipment inventory; owner | Find Equipment, assets | Keep owned inventory distinct from marketplace/opportunity results. **Tools → Equipment**. |
| `/crew` | Crew members and certifications; owner | Subcontractors, job staffing | Do not merge employee/crew records with subcontractor payees without a defined identity policy. **People** or **Manage → Team**; show staffing actions in Work. |
| `/address-book` | Redirect to People → contacts | Clients/prospects | One identity/contact system is preferable to duplicating people. **People**. |
| `/website` | Website Studio; owner | Published website, private drafts/media, leads, forms, integrations | A large independent workspace (WebsiteEditor is 8,971 lines) with its own publishing boundaries. **Manage → Website**. |
| `/admin/errors` | Application error log; owner | Support/diagnostics | Operational/admin function, not a business workflow. **Manage → Diagnostics**. |
| `/checklist-templates` | Reusable job checklist templates; owner | Job checklists and field evidence | Template definition belongs in Manage; applied checklists belong in Work. |
| `/mfh-homes` | Manufactured-home knowledge/pricing library; owner | Jobs, production service catalog, pricing and labor knowledge | Reference/catalog management differs from a job’s operational workspace. **Tools → Home Knowledge** or **Manage → Catalogs**. |
| `/trip-packet/:jobId` | Job trip packet; users with job access | Jobs, route planning, mileage | Context-specific job action. Keep reachable from the job rather than promoting a duplicate top-level destination. |
| `/jobs/:id/payroll` | Job-level subcontractor settlement; owner | Subcontractors, hours, advances, payment ledger | Contextual view of the canonical payroll ledger. **Money**, entered from the job. |
| `/integrations` | Integration/API health and configuration; owner | Google, Wix, Plaid, Square and other providers | Settings already has Google/Wix/Payments tabs. Clarify which page configures versus diagnoses a connection. **Manage → Payments & Integrations**. |
| `/trim-out-catalog` | Production trim-out catalog; owner | MFH knowledge/pricing and job components | Catalog maintenance is distinct from doing job work. **Manage → Pricing & Services**. |

### Public and special-purpose routes

These are intentionally outside the authenticated sidebar. They are not duplicate admin pages:

- `/portal/:token`, `/sub-login`: subcontractor portal and login.
- `/status/:token`: customer-facing job status.
- `/pay/:payToken`: public payment page.
- `/site/:slug` and `/site/:slug/:page`: published business website.
- `/quote/:token`: customer-safe quote response.
- Public API groups include website/status/quote/payment endpoints, webhook callbacks, portal endpoints, and SEO crawl routes. They must remain separately permission-tested from owner/admin views.

### Current navigation

`AppLayout.tsx` defines five main groups: Operations, Business Tools, Finance, Find a Job, and Equipment & Crew, plus ungrouped Integrations and Settings. Examples of category mismatches are Expenses/Mileage under Operations, Estimates under Finance, Website under Business Tools, and Team configuration inside Settings. The desktop navigation has around 23 destinations; owners’ mobile bottom navigation is Home, Jobs, Routes, Accounting, More. Staff navigation differs by permissions.

`App.tsx` routes `/clients`, `/subcontractors`, `/prospects`, and `/address-book` into People tabs. Some navigation entries are owner-only while nine permission sections exist (expenses, jobs, invoices, clients, mileage, subcontractors, daily logs, estimates, compliance). This creates a review item: confirm that labels, route access, and the permission matrix communicate the same available actions; do not change access as a navigation cleanup.

## 3. Dashboard assessment

Current Dashboard code includes Business Health, revenue/expense/profit measures and trends, legal-business/division breakdown, Today’s Schedule, Continue Working, Needs Attention, Quick Actions, Cash Flow, Owner Withdrawals, and Recent Activity. The cash-flow card is conditionally shown for the combined business selection. Some cards link to other systems rather than owning their data.

### Recommended command-center hierarchy

1. **Needs attention:** overdue invoices, unresolved subcontractor balances, time-sensitive compliance/tax reminders, and actionable job blockers. Show a clear next action and source.
2. **Today / next:** today’s schedule, active jobs that need a decision, and a small set of relevant quick actions.
3. **Business snapshot:** revenue, operational profit, expenses, cash/reserve, and invoices outstanding, with date basis and business scope visible.
4. **Secondary:** trend chart, division breakdown, recent activity, owner withdrawals, and detailed cash-flow explanation behind expandable or secondary panels.

Do not remove a financial number solely to reduce cards. Each summary needs a clear period, business scope, and route to its source calculation/report.

## 4. Proposed navigation map

| Destination | Existing capabilities to place here | Contextual access without duplicate pages |
|---|---|---|
| **Home** | Dashboard / Business Command Center | Quick actions should lead into the canonical workflow. |
| **Work** | Jobs, schedule/planning, checklists, estimates/Quote Center, materials, route planning, bids and grants | Create an estimate from a prospect; open job materials/checklists/payroll from the job. |
| **People** | Clients, prospects, contacts/address book, subcontractors, crew | Convert prospect to client; assign a person to a job; keep employee/crew and subcontractor identities distinct. |
| **Money** | Invoices, expenses, mileage, Banking/reconciliation, Square history, job payroll, Accounting & Tax, assets/investments | Add job costs from a job; invoice from job/estimate; reconcile bank items into canonical records. |
| **Tools** | Aerial quote, equipment search/inventory, MFH knowledge, trim-out catalog, calculators and specialized tools | Launch from a client/job/estimate when the context is known. |
| **Manage** | Business selector/profile, settings, team/permissions, modules, integrations, Website Studio, checklist templates, diagnostics | Link from relevant workflows but maintain one canonical configuration screen. |

Use a consistent rule for each capability: a single canonical destination, with contextual actions elsewhere. Retain existing route URLs/redirects during any future reorganization so bookmarks and shared links keep working. The proposed groups are organizational labels, not new modules or permission changes.

## 5. Workflow simplification recommendations

The step observations below are source-level path findings. Exact click counts and user friction require an authenticated walkthrough with the owner and staff roles; no such walkthrough was performed.

| Workflow | Current evidence / friction to investigate | Recommendation |
|---|---|---|
| Job create → schedule → work → close | Jobs page owns a wide set of job, operational, financial and production panels; dedicated Schedule/Planning components and job detail sections are nested in `Jobs.tsx`. Prior production-workspace plan correctly distinguishes MH Production, MH Service and General Contracting presentations while keeping the job and ledgers shared. | Use a short, job-type-aware creation path, then reveal relevant checklist, production, materials, labor and billing tools in the job workspace. Keep one Job record and existing linked systems. |
| Record work and field evidence | Checklists, photos, daily logs, presence, component status, work sessions and payroll have different meanings and sources. | Put field actions in the job context; label clearly whether a control records presence, checklist completion, hours, component status or payroll. Do not merge these records. |
| Job cost → invoice → payment | Job screens link materials, costs and invoice actions; invoice editing exists from both Jobs and Invoices. Estimates can convert into invoice content. | Keep one invoice editor and one source of truth. Use a single contextual “Create/review invoice” action with explicit source attribution and show whether the invoice is draft, sent or paid. |
| Expense entry / receipt scan / bank filing | Expense page is a 4,736-line feature surface; Banking includes its own transaction filing and matching workflow. | Distinguish “record expense” from “review bank transaction.” Reuse the existing expense form when filing a transaction; never create a competing expense ledger. |
| Mileage import / manual trip / tax | Mileage is a separate page and ledger, and imports have batch and expense-link behavior. | Keep one mileage workflow with an explicit “manual trip” versus “import” entry choice; show import preview, duplicates, and the resulting monthly expense summary before confirmation. |
| Subcontractor assignment / hours / payment | Subcontractor profiles, job assignment, hourly records, advances and payment ledger are separate systems. Job Payroll is contextual. | Begin from the job or person and show owed, paid, and unresolved amounts from the canonical ledger. Avoid duplicating payment entry in job card and profile screens. |
| Prospect → quote → decision/authorization → job | People/Prospects, Quote Center, and Jobs are separate pages, but current quote history distinguishes customer decision from work authorization. | Provide a guided next action across these systems, with explicit conversion/authorization. Do not infer authorization from approval or create duplicate prospect/customer records. |
| Settings and integrations | Twelve settings tabs, with separate Integrations page and settings entries for Google, Wix and Square. | Group configuration under stable categories and label each provider surface as setup, status, or troubleshooting. Keep advanced controls accessible rather than deleting them. |

## 6. Accounting and financial simplification (protected)

Accounting currently has nine tabs: Overview, Revenue by Month, Profit & Loss, Schedule C + Home Office, Tax Calendar & Compliance, Business Trips, Investments, Benchmarks, and owner-only Year-End Report. Expenses, Banking, Invoices, Mileage, Subcontractor Payroll and Owner Withdrawals have their own entry/review pages.

Preserve separate records where accounting meaning differs. The current Registry and accepted ADRs identify, among others:

- `invoices` for invoice revenue; `other_income` for non-invoice cash receipts; provider mirrors such as Square are not extra revenue ledgers.
- `expenses` for operating costs; `sub_payment_records` for subcontractor payroll; `owner_capital_entries` for Owner Withdrawals and preserved historical contributions.
- `mileage_logs` for trips/deductions; `job_mileage_reimbursements` for job-only reimbursements; `bank_transactions` for reconciliation anchors.
- `estimates` and append-only `estimate_quote_events` for quotes, decisions and separate revision-specific authorization.
- `growth_fund_deployments` for deployments, while reserve amounts are derived; `estimated_tax_payments` for actual payments.
- `businesses.business_id` for canonical ownership, with carefully bounded `business_line` compatibility and legal-entity rollups.

Recommendations:

1. Use plain-language labels and “why this number” explanations to distinguish **cash received**, **invoiced**, **operational profit**, **tax estimate**, **reserve**, and **amount still owed**.
2. Use navigation grouping and contextual links to reduce switching; do not combine P&L, tax, payroll, banking, or investment logic into one screen or table.
3. Show date basis and selected business/legal scope at the top of every report.
4. Keep owner-only reporting controls and staff permissions intact. Any report simplification that changes a number, date basis, ownership scope, or source ledger requires a separate architecture review.

The August 5 accounting audit contains findings that may have been resolved or superseded by later ADRs and code. This audit does **not** repeat its numerical claims as current defects. They require fresh tracing against today’s API, tests, and data before any financial recommendation is implemented.

## 7. Settings simplification

Current tabs in `Settings.tsx` are Business, Invoice Defaults, Financial, P&L Layout, Production Billing, Mileage, Modules, Notifications, Payments, Team, Google, and Wix Website. The tab strip scrolls horizontally; Team is owner-only. The Settings component is 3,140 lines, and it includes profile, tax/entity, invoice, mileage, permissions, provider, and operational configuration.

Proposed grouping, with all controls retained:

- **Business Profile:** entity and business identity, contact details, branding.
- **Financial & Tax:** financial assumptions, P&L layout, tax/reporting configuration, mileage settings and tax-related configuration.
- **Pricing & Services:** production billing, calculators/pricing defaults, service catalogs.
- **Team & Permissions:** members, invitations, approval and section access.
- **Payments & Integrations:** Square, Google, Wix and other provider connection/setup status.
- **Appearance & Website:** Website Studio, domain, published/draft status and website-related configuration.

Low-frequency or advanced controls can be placed behind an “Advanced” disclosure only after confirming their users and support needs. Do not remove settings or change effects. A prior simplification plan says there were 13 tabs and proposes removing Calculator Defaults; the current code has 12 tabs and no Calculator Defaults tab. That plan is stale and should not be applied as written.

## 8. Technical complexity and duplicate/dead-code findings

### Confirmed from current source inventory

- `Jobs.tsx` is 11,901 lines; `WebsiteEditor.tsx` 8,971; `Expenses.tsx` 4,736; `Settings.tsx` 3,140. These files combine many components/state transitions and make change review and cross-workflow reasoning difficult.
- The API is divided among 82 route modules. `website.ts`, `jobs.ts`, and `reports.ts` are unusually large modules (296 KB, 204 KB, and 160 KB respectively by file size). Their high domain surface increases navigation cost for maintainers; it is not proof that the domains should be split.
- `Accounting.tsx` uses nine lazy-loaded tab components and page-level error boundaries; this is a useful existing modularity pattern.
- `formatCurrency` has local declarations in multiple UI files plus a shared utility. This is a confirmed repeated helper name, but the signatures differ. It is a **candidate** for consolidation only after currency, null, string, rounding and localization behavior are compared.
- Role/permission checks are represented in both route guards and UI guards. This is expected defense in depth; the matrix and route visibility should be tested together, not “deduplicated” by removing server checks.

### Not confirmed in this pass

- The August 5 dead-code report lists unused calculator components, UI primitives, tables and route code. It is stale relative to subsequent work. Current import/reference proof for every item was not completed, so no dead code is declared safe to remove.
- No complete calculation-by-calculation duplicate audit was performed in this simplification review. Existing Registry/ADR sources remain authoritative. Similar-looking calculations are not confirmed duplicates until input sets, rounding, date basis and outputs are traced.
- Dependency count and bundle impact were not audited. Do not remove dependencies on the basis of package presence alone.

## 9. Simplicity scorecard

Scores are **source-review estimates**, not user-testing measurements. Higher is simpler/better. Evidence refers to current route/component organization, not task success rates.

| Section | Ease | Navigation | Workflow | Organization | Consistency | Maintainability | Evidence summary |
|---|---:|---:|---:|---:|---:|---:|---|
| Home / Dashboard | 5 | 5 | 5 | 5 | 5 | 6 | Covers health, attention, schedule, cash flow and activity; multiple audiences and date/scope context compete for the first view. |
| Work / Jobs & Estimates | 5 | 5 | 5 | 5 | 5 | 3 | Strong shared job context, but Jobs is 11.9k lines and contains many workflow-specific panels. |
| People / CRM | 6 | 5 | 6 | 6 | 6 | 6 | People page centralizes multiple roles; legacy URLs redirect into tabs, which can hide the destination model. |
| Money / Accounting | 5 | 5 | 5 | 6 | 6 | 6 | Distinct sources and accounting tabs are appropriately separated; users must understand which workflow owns an action. |
| Tools / Specialized operations | 4 | 4 | 5 | 4 | 5 | 5 | Equipment, route planning, aerial quote, bids, grants, MFH knowledge and trim-out catalog span separate menu groups. |
| Manage / Settings & Website | 4 | 4 | 4 | 4 | 5 | 3 | Twelve settings tabs and multiple provider/admin pages; Website Studio is a large independent surface. |

## 10. Prioritized remediation roadmap

All items below are recommendations for later approval. **No implementation is authorized by this audit.** Risk describes the proposal if later implemented with the stated boundaries. The current owner-first priority decision in §13 supersedes any staff-specific sequencing or dependency listed below.

| Priority / recommendation | Current problem and evidence | Proposed solution and user benefit | Business impact / risk | Dependencies | Existing data or rules affected |
|---|---|---|---|---|---|
| **P1 — Reorder Dashboard around attention and next actions** | Several significant cards compete on Dashboard; see `Dashboard.tsx` sections for Business Health, Today’s Schedule, Continue Working, Needs Attention, Cash Flow, Owner Withdrawals and Recent Activity. | Put actionable queue and today’s work first; retain an expandable business snapshot and secondary trends. Helps users decide what to do without hunting. | High usability benefit; **medium** risk because summary labels can change interpretation. | Confirm owner’s must-see metrics and staff view needs; verify links and empty/error states. | No ledger or calculation changes; data scopes, periods and labels must stay exact. |
| **P1 — Make job workspaces progressive and workflow-aware** | `Jobs.tsx` is 11,901 lines and has many panels; prior plan differentiates production/service/general contracting workspaces. | Keep one job record, but reveal the relevant creation and work controls by workflow; show shared financial actions consistently. Less cognitive load without losing capability. | High daily-use benefit; **high** risk if completion, payroll, checklist or invoice behavior changes. | Inventory each job workflow with real users; current job-financial and production architecture review. | Preserve every table, source, permission, status transition and cross-system behavior. |
| **P2 — Add a consistent cross-page “next action” pattern** | Prospect, quote, job, invoice, payment, checklist and payroll tasks span separate routes; current context links are not consistently described as a journey. | Add clear contextual actions to the existing canonical destination (e.g. prospect → quote; job → invoice/payroll), not duplicate pages. | High workflow benefit; **medium** risk due access and role boundaries. | Role-specific walkthrough; identify the canonical path for each transition. | No automatic conversion, authorization, payment, or ledger writes without explicit confirmation. |
| **P2 — Separate expense capture from bank reconciliation in labels** | Expenses and Banking are separate destinations; the latter files matching bank items into ledger records. | Use plain action labels distinguishing “record expense” from “review/file bank transaction”; reuse the canonical expense flow. | High clarity; **high** risk if reconciliation or deduplication semantics are changed. | Trace each bank filing path and existing idempotency behavior. | `bank_transactions` stays an anchor; `expenses` remains the operating-cost source. |
| **P2 — Clarify Money entry points without collapsing ledgers** | Expenses, Mileage, Invoices, Payroll, Banking, Square, Accounting and assets occupy separate routes. | Group under Money, with an entry/review distinction and contextual links from Jobs and People. | Moderate navigation benefit; **low–medium** risk if routes/URLs and permissions are retained. | Confirm owner/staff access and current route dependencies. | Preserve System Registry sources and all reporting semantics. |
| **P3 — Reorganize navigation into six proposed destinations** | Five desktop groups plus ungrouped Settings/Integrations; some Money functions are in Operations, estimates in Finance, website in Business Tools. Owner and staff mobile navigation differ. | Adopt Home, Work, People, Money, Tools, Manage. Maintain aliases and a single canonical page per capability. | High discoverability benefit; **medium** risk from permissions, bookmarks and mobile behavior. | Role matrix, route tests, analytics on actual use if available. | No route deletion, access change, feature removal or duplicate-page creation. |
| **P3 — Group Settings into six stable categories** | `Settings.tsx` has 12 scrollable tabs and mixes business, finance, team, provider, mileage and module configuration. | Group into Business Profile, Financial & Tax, Pricing & Services, Team & Permissions, Payments & Integrations, Appearance & Website; hide advanced controls only behind disclosure. | Moderate discoverability; **medium** risk if setting persistence or defaults move. | Inventory every control, owner, business scope and persistence path before moving. | Keep all keys, defaults, API effects and business-specific scope unchanged. |
| **P3 — Clarify accounting report purpose and date basis** | Nine tabs include financial statements, tax, trips, investment, benchmarks, and year-end reporting. Horizontal scrolling increases tab discovery cost. | Use short descriptions/group labels and a clear business/date basis, while keeping separate report pages and explanations. | Moderate comprehension; **high** risk if calculations or accounting labels change. | Reconfirm report owners and source rules against Registry/ADRs and tests. | No ledger, formula, tax treatment, date basis or source-of-truth changes. |
| **P4 — Break up high-churn UI files behind existing boundaries** | Large page files create review/navigation burden; repeated `formatCurrency` helpers exist. | Extract cohesive subcomponents/hooks and compare helper semantics before sharing. | Maintainer benefit; **medium** risk from behavior drift and import cycles. | Establish component ownership and regression coverage before refactoring. | Purely structural only; do not move business calculations into React. |
| **P4 — Revalidate old dead-code findings before any cleanup** | August dead-code audit predates later app changes; unused status is not established by filenames or age. | Build an import/call graph and classify confirmed dead, compatibility, intentional separation and uncertain code; report findings before removal. | Lower user impact; **high** risk if compatibility code is removed incorrectly. | Current route/import/reference scan and runtime coverage. | No deletion in this audit; preserve schema/history and public/API compatibility. |

## 11. What should change, stay, and require approval

**Change:** make the next step easier to find; group existing destinations consistently; reduce visual overload with progressive disclosure; explain money labels and report context; split very large UI files only along verified existing ownership boundaries.

**Stay:** all current capabilities, route compatibility, role checks, multi-business separation, customer and job records, append-only histories, and distinct operational/financial sources of truth.

**Never change without explicit architecture approval:** accounting/payroll/tax/profit formulas; ledgers or ownership boundaries; invoice/quote decision and authorization semantics; business scoping; data deletion or migrations; role/permission behavior; production/public website routing; or multi-system refactors.

## 12. Coverage limits and validation

- **Reviewed:** route declarations and public aliases; desktop/mobile navigation definitions; Settings tabs and permission sections; Accounting tabs; Dashboard component headings and data surfaces; API route mounts; schema/table counts; architecture Constitution, Registry, Patterns, ADRs, Changelog; prior architecture/accounting/dead-code audits and selected simplification plans.
- **Not fully inspected:** every page’s every dialog and sub-step; authenticated owner/admin/subcontractor UI behavior; every API handler and SQL query; all 114 tables field-by-field; full dependency/import graph; every integration’s live state; and actual completion times with users.
- **Not run:** tests, typechecks, builds, workflow restarts, database queries, production writes, or browser interactions. This avoids changing data or relying on unauthenticated preview behavior; no runtime validation is claimed.
- **Prior findings:** `ACCOUNTING_AUDIT_2026_08_05.md` and `DEAD_CODE_AUDIT_2026_08_05.md` are retained as historical leads. The Registry, ADRs through 2026-11-11, Changelog and current code take precedence over their older claims.

The audit covers the broader application surface, not only Dashboard, Jobs and Accounting. The remaining limitations above are explicit; they should be addressed with role-specific walkthroughs and targeted source tracing before approving any roadmap item.

## 13. Updated priority decision — 2026-11-12

BuildPro is primarily being developed as the owner's personal business-management platform. There is no current plan to onboard employees or subcontractors, and staff access may never be needed. The staff route review is **partially reviewed — deferred pending future staff requirements**; the detailed findings remain in `staff-route-permission-audit-2026-11-12.md`. The source review is a checkpoint, not a completed role-by-role audit.

The current owner-first roadmap is:

1. Owner Dashboard / Business Command Center.
2. Multi-business separation and business switching.
3. Jobs and everyday operational workflows.
4. Accounting clarity while preserving all existing ledgers and calculations.
5. Estimates, invoices, expenses, and payment workflows.
6. Website Studio supporting multiple businesses and websites.
7. Simplified settings and navigation.

Defer full staff role/permission auditing, staff-specific navigation and workflow improvements, permission-grant-to-entry-point completeness, and comprehensive owner/admin/employee/subcontractor walkthroughs until a concrete staff requirement exists. This deferral does not authorize removing or weakening authentication, owner protection, server-side authorization, business isolation, or protections for financial records, payroll, customer information, and settings.

The potential SMTP password disclosure in the staff route report remains security work and is not deferred as staff UX. See `staff-permissions-priority-decision-2026-11-12.md` for the task disposition and scope boundaries. No application behavior was changed by this priority update.
