# Owner Dashboard / Business Command Center Design

**Status:** Proposed design for user review; no implementation is authorized by this document.

## Goal

Make the existing owner Dashboard answer, in order:

1. What needs attention?
2. What is happening today or next?
3. How are the selected businesses performing?
4. Where can I find secondary financial and activity detail?

This is a focused reorganization of the owner Dashboard, not a broad application redesign. Keep current capabilities and financial sources of truth.

## Current state

The Dashboard already contains a header, receipt-scanning hero, quick actions, Continue Working, Today’s Schedule, Needs Attention, a task list, Business Health, cash flow, owner withdrawals, and recent activity. The current page is a large composed view with reusable section components; many proposed capabilities already exist.

The current order gives the receipt hero and Quick Actions priority over work and attention items. The Business Health panel contains financial metrics, a trend chart, and business-line breakdown. The cash-flow card is shown only in All Businesses mode.

The relevant existing data sources are:

- `GET /api/reports/dashboard` for revenue, expenses, operational profit, invoice counts, active jobs, and trend/breakdown data.
- `GET /api/dashboard/today` for route stops, prospect follow-ups, overdue invoices, and compliance reminders.
- `GET /api/dashboard/continue-working` for the current active job and checklist progress.
- `GET /api/dashboard/recent-activity` for expenses, invoices, subcontractor payments, and owner withdrawals.
- `GET /api/reports/business-reserve` for company-wide cash/reserve information.
- Existing dashboard-task and estimated-tax-payment endpoints for owner tasks and tax reminders.

The Dashboard must not recalculate financial values in React. The existing invoice, expense, other-income, subcontractor-pay, mileage, and owner-withdrawal sources and their approved accounting treatment remain authoritative.

## Design

### 1. Header and selection context

- Keep the existing global business selector and make its current selection clear on the Dashboard.
- Keep the existing reporting-period control and its established date semantics, including Monday-start week-to-date.
- Do not add a second business selector or change business ownership rules.

### 2. Needs Attention

Make this the first substantive section. Show only actionable items supported by authoritative existing records, prioritizing urgent items before upcoming ones:

- Overdue invoices.
- Unpaid subcontractor balances where the current data is available.
- Job readiness or checklist blockers only when an existing source supplies an active blocker.
- Compliance and tax reminders.
- Prospect follow-ups.

Each item should link to its existing resolution workflow. Do not invent alerts or infer missing documentation from absent data.

### 3. Today / Next

- Show today’s scheduled route stops and the existing Continue Working job.
- Retain compact Quick Actions for common tasks.
- Move receipt scanning into Quick Actions rather than using it as the dominant full-width hero.
- Show upcoming commitments only when an existing source can supply them accurately; otherwise omit them rather than fabricate a schedule.

### 4. Business Snapshot

Reuse the existing server-side dashboard report for clearly labeled revenue, expenses, operational profit, open invoices, and active jobs. Keep the existing trend chart and period selection, but place secondary detail lower in the hierarchy.

Cash and reserves may appear only where the existing reserve data has a valid scope. Do not present the company-wide reserve result as a single-business balance.

### 5. Secondary information

Keep the existing legal-business/division breakdown, recent activity, owner withdrawals, and cash-flow detail accessible below the primary sections. Use progressive disclosure on smaller screens if needed; do not remove these capabilities.

### 6. Business scope contract

Use `docs/superpowers/specs/2026-11-10-dashboard-business-scope-design.md` as the authoritative scope design. This Dashboard layout does not replace or reopen that design.

- The global active business and All Businesses modes remain explicit.
- Business-specific cards must use the agreed scope consistently; do not let the Business Health filter disagree with Today, Continue Working, Recent Activity, or owner-withdrawal cards.
- Preserve canonical business ownership and legacy fallback rules in the existing scope design.
- Cash Flow remains All Businesses-only unless a valid single-business source is separately approved.
- Compliance items, estimated-tax alerts, and account settings remain company-level under the existing scope design because their current data model has no business selector. Do not reclassify them as business-owned in this project.
- Do not combine parent and child business figures in a way that counts the same record twice.

Any implementation touching financial data or business logic must complete the required Architecture Review before code changes.

### 7. Loading, empty, and unavailable states

Show loading, genuine empty, and request-failure states distinctly. A failed request must not appear as “no items,” a valid zero, or a successfully loaded balance. Keep the retry action close to the affected section.

### 8. Visual and responsive behavior

Reuse the existing application typography, colors, cards, and controls; this is not a visual rebrand. Keep the layout readable on mobile, with a single-column priority order and no horizontal scrolling. Preserve keyboard access, visible focus, and text labels for actions.

## Alternatives considered

1. **Reorder existing components — selected.** Preserves familiar controls and data sources while making urgent work prominent.
2. **Split the Dashboard into tabs.** Reduces initial page length but hides urgent information and adds navigation.
3. **Rebuild a combined financial dashboard.** Offers a fresh presentation but creates avoidable risk of duplicate calculations and conflicting scope.

## Out of scope

- New financial ledgers, stored totals, or client-side profit calculations.
- Changes to revenue recognition, expense treatment, payroll, owner withdrawals, tax calculations, or other financial rules.
- New alert classes without an existing authoritative source.
- Changes to the business ownership model, permissions, or company-level classification of compliance/tax settings.
- General navigation redesign or unrelated page changes.
- Database changes, historical data correction, or production changes.

## Acceptance criteria

1. Needs Attention and Today / Next precede financial and secondary detail.
2. Existing Dashboard capabilities remain accessible; receipt scanning remains available as a Quick Action.
3. All business-specific cards follow the existing approved business-scope contract; explicitly company-level information remains labeled or positioned as such.
4. All Businesses views preserve legal-business distinctions and do not double-count parent/child or duplicate source rows.
5. Financial values come from the existing server-side report/calculation paths; no new ledger or duplicate calculation is introduced.
6. Loading failures, valid empty states, and valid zero balances are distinguishable.
7. Alerts link to existing workflows and are based on real source records.
8. The layout works on desktop and mobile with keyboard-accessible controls.

## Brief boundary

The attached dashboard brief ends mid-sentence at “Preserve separate legal-business financial”. This design covers the requirements visible in the attachment and the approved proposal only. No additional requirements are inferred. If further brief text exists, it must be reviewed before implementation planning.

## Data and environment safety

This design is documentation only. No application code, database schema or records, production configuration, deployment settings, or live website behavior is changed.
