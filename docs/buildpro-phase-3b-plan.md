# BuildPro Simplification — Phase 3B Plan

**Status:** Phase 3B presentation changes and the unsaved-editor navigation-blocker check are implemented and verified. Phase 3A remains closed.
**Planning date:** 2026-11-17

## Phase 3B objective

Make BuildPro’s current business context easier to understand and select, especially the difference between working in one business and viewing combined data across businesses. Preserve existing business ownership, legal-entity/division relationships, permissions, routes, data, and financial behavior.

The goal is to help the owner know which business context is active before navigating or taking an action. This continues the owner-first simplification roadmap without redesigning the Dashboard or changing the completed Phase 3A navigation.

## Current application findings

| Finding | Evidence | Status |
|---|---|---|
| Phase 3A’s six desktop groups and five-item owner mobile bar remain the approved navigation model. | `docs/buildpro-phase-3a-navigation-map.md`; authenticated checks completed for the six groups, the mobile drawer and its scrolling, and the five bottom-bar items. | Verified |
| Phase 3A’s latest verification passed: the mobile drawer exposed all six groups and the manufactured-home model baseline/client-override flows passed with temporary development fixtures. | Authenticated verification in the Phase 3A work; temporary pricing fixtures were cleaned up. | Verified |
| Selecting a business context is a separate screen reached from the header switcher. The switcher clears the current selection and returns to `/`; an owner with no selection is shown the business selector. | `AppLayout.tsx`, `App.tsx`, `BusinessContext.tsx`. | Verified in source |
| The selector presents an “All Businesses” choice as “View combined data across all businesses.” It does not state on that card that this is a read-only reporting context. | `BusinessSelector.tsx`. | Verified in source |
| All Businesses is a read-only reporting scope, not an owner for mutations. | `.agents/architecture/SYSTEM_REGISTRY.md` and `.agents/architecture/CHANGELOG.md`. | Verified architectural constraint |
| The selector combines choosing a business with business-management controls such as adding, editing, and reordering businesses. | `BusinessSelector.tsx`. | Verified in source; whether this causes user confusion has not been measured |
| BuildPro has multiple legal businesses and operating divisions whose scopes must remain distinct. Kinora and other unrelated businesses must not be combined with Willard’s LLC divisions. | `.agents/memory/business-isolation.md`; current architecture and business-scope rules. | Verified constraint |
| There is no authenticated usability study measuring whether the current selector or business badge causes mistakes. | The existing simplification audits are source reviews, not usability studies. | Not verified; do not describe as a proven user-reported problem |

Phase 3A remains unchanged and closed. The prior audit’s recommendations to reorganize navigation are not reopened here. The recently unified Job Workspace is also not proposed for another broad redesign without a specific, observed workflow problem.

## Three ranked simplification opportunities

### 1. Clarify business selection and active context — recommended

1. **Current experience:** The header shows the selected business name or “All Businesses.” Selecting the header control returns the owner to a screen where the owner chooses All Businesses or one business. All Businesses is described as combined data, but not as read-only.
2. **Why it may be complicated:** The owner must distinguish an unselected state, a combined reporting state, and a specific business state. The selector also contains business administration controls. The actual frequency of confusion is unknown.
3. **What could be simplified:** Make the combined/read-only state explicit in plain language and keep the active context clear in the existing desktop and mobile header. Do not rearrange or redesign the selector or its business-management controls.
4. **Functionality to retain:** All existing business cards, business creation/editing/reordering, the All Businesses view, selected-business persistence, LLC/division rollups, and all current navigation behavior.
5. **Routes, UI, APIs, and data involved:** `/` and the existing header switcher; `AppLayout.tsx`, `BusinessSelector.tsx`, `BusinessContext.tsx`; the existing `/api/businesses` listing and current business-scoped page/API behavior. Existing `businesses` ownership and legal-business relationships remain the source of truth.
6. **Risks:** Misstating combined versus selected scope could cause a user to misread reports or enter data under the wrong business. Kinora could be incorrectly included in Willard’s LLC view. Feature gates and business-specific configuration could change if selection semantics are altered.
7. **Verification:** Authenticated owner walkthrough on desktop and mobile; switch among All Businesses, the LLC, its operating divisions, and Kinora; verify the displayed context after navigation and refresh; verify All Businesses remains read-only; verify that writes use only the selected business; check feature visibility and existing business-specific views; confirm no records or business relationships changed.

**Business impact:** High. **Confusion reduction:** High potential, not yet measured. **Implementation risk:** Medium if limited to labels/layout; high if selection or authorization semantics change. **Capability preservation:** Critical.

### 2. Make Settings easier to scan without moving its behavior

1. **Current experience:** Settings contains 12 tabs, including business profile, invoice defaults, financial settings, P&L layout, production billing, mileage, modules, notifications, payments, team, Google, and Wix Website. Integrations & APIs is also a separate destination.
2. **Why it may be complicated:** Many unrelated controls share one long Settings surface, while provider setup and connection status may appear in Settings and Integrations. The source audit confirms the structure, but not which controls owners struggle to find.
3. **What could be simplified:** Group existing settings into a small set of descriptive categories, and distinguish configuration from connection health or troubleshooting. Use progressive disclosure for low-frequency controls only after confirming the controls remain discoverable.
4. **Functionality to retain:** Every setting, key, default, API effect, team/permission control, provider integration, and current route.
5. **Routes, UI, APIs, and data involved:** `/settings`, `/integrations`; `Settings.tsx`, `IntegrationsPage.tsx`, and the existing settings/integration APIs and stored configuration.
6. **Risks:** Moving controls may change business scope, defaults, persistence, or provider behavior. Duplicate settings surfaces could be created if Integrations and Settings ownership is not mapped first.
7. **Verification:** Inventory every setting and its persistence path; test each existing setting’s read/save behavior and business scope; verify provider setup/health paths; test direct URLs, owner-only controls, and current feature gates.

**Business impact:** Medium. **Confusion reduction:** Medium to high for infrequent configuration work. **Implementation risk:** Medium if UI-only. **Capability preservation:** High.

### 3. Clarify Money entry points while keeping ledgers separate

1. **Current experience:** Expenses, Banking, Square Transactions, Invoices, Mileage, Accounting & Tax, and subcontractor payroll are separate destinations with contextual links from Jobs and other areas.
2. **Why it may be complicated:** Related actions can look similar even when they create or update different records—for example, recording an expense versus filing a bank transaction.
3. **What could be simplified:** Clarify the purpose of existing actions with plain-language labels and contextual links to the canonical destination. Do not create a single “money” form that hides which source record will be written.
4. **Functionality to retain:** All existing invoice, expense, mileage, payroll, bank-reconciliation, Square, tax, and report workflows.
5. **Routes, UI, APIs, and data involved:** `/expenses`, `/banking`, `/square-transactions`, `/invoices`, `/mileage`, `/accounting`, job payroll; their existing pages and API routes; existing financial records and reports.
6. **Risks:** Changing action semantics or source attribution can duplicate, omit, or misclassify financial records and affect reports. This has the highest accounting regression risk of the three candidates.
7. **Verification:** Trace each entry path to its canonical API and ledger; test duplicate prevention, business scope, reconciliation status, and report totals before and after any approved UI-only change.

**Business impact:** High. **Confusion reduction:** High potential. **Implementation risk:** High. **Capability preservation:** Critical.

## Recommended Phase 3B focus

Choose **business-context clarity**. It follows the owner-first roadmap’s multi-business priority and can be limited to clear wording in the existing selector and header, without redesigning the selector or changing business behavior.

This recommendation is based on source evidence and architecture constraints, not measured user error. The exact wording and unchanged interaction below require owner review before any implementation. If investigation shows that the problem requires changing business ownership, write permissions, legal-business rollups, or server-side mutation behavior, stop and request separate scope approval.

### Exact wording and behavior proposed for review

**Selector heading:** `Choose a business`

**Selector subtitle:** `Choose one business to work in, or view combined information across businesses.`

**All Businesses card**

- Title: `All Businesses`
- Description: `View combined information across businesses. Read-only.`

**Active context in the header**

- A specific business remains labeled with its existing business name.
- The combined context remains labeled `All Businesses`, with a visible `Read-only` indicator beside it. Its accessible name should be `All Businesses, read-only`.

**Behavior**

- Clicking the existing header context control opens the current selector and keeps its navigation-blocker behavior.
- Choosing All Businesses continues to show the existing combined view; choosing a named business continues to select that existing business.
- Selection persistence, routes, permissions, feature gates, write resolution, and server-side authorization remain unchanged.
- No new dialog, selector, confirmation step, disabled-action policy, or business-management layout is proposed.

## Proposed implementation scope

### Objective

Make it immediately clear whether the owner is viewing combined read-only data or working in one selected business, and make switching contexts predictable.

### Current-state problem

The existing selector labels All Businesses as combined data but does not tell the owner that it is read-only. The header shows the name of the selected context but does not explain the difference between a specific business and the combined view. Confusion is plausible but not yet validated with a usability walkthrough.

### Desired user experience

- The owner can identify the active context from the header on desktop and mobile.
- The selector and header distinguish the combined read-only view from a named business using the wording above.
- Existing selection, persistence, administration controls, and navigation safeguards behave exactly as they do today.

### Included work

- Adjust only the wording and active-context indicator in the existing business selector and header.
- Preserve current context persistence, selected-business feature filtering, routes, and business cards.
- Add targeted authenticated tests for context visibility, switching, and read-only combined scope.

### Explicit exclusions

- No Dashboard redesign or Phase 3A navigation changes.
- No changes to business ownership, legal entity/division relationships, business IDs, or client/job ownership.
- No changes to API authorization, write behavior, finance calculations, reports, or feature gates.
- No new selector, business-management system, database fields, migrations, or records.
- No selector redesign, rearrangement of business-management controls, new dialog, confirmation step, or change to which actions are enabled.
- No changes to the Clients system, Job Workspace, invoices, payroll, or accounting workflows.

### Preservation requirements

- All Businesses remains a read-only reporting scope.
- Willard’s General Contracting and Asphalt Sealing remain within their existing LLC/division relationship; Kinora remains separate.
- Business IDs, legal-business IDs, operating divisions, legacy ownership fallbacks, and historical records remain unchanged.
- Server-side authorization remains authoritative; labels and hidden controls do not replace permission checks.
- Existing paths, navigation blockers, settings, and business-specific feature visibility remain intact.

### Dependencies

- Confirm the desired wording for the combined read-only view.
- During implementation planning, trace the existing selection, business context, and mutation behavior for the exact screens in scope. The user-facing plan does not assume every route responds to All Businesses identically.
- Use existing business-scope tests and add only targeted coverage for any changed interaction.

### Risks and safeguards

- **Scope misunderstanding:** Review labels against actual view/write behavior before release.
- **Cross-business exposure:** Test the LLC, divisions, and Kinora separately; do not infer legal ownership from display labels.
- **Unexpected mutation changes:** Keep server-side behavior unchanged. If an existing route does not honor the documented scope, report it separately rather than silently expanding this phase.
- **Discoverability loss:** Keep existing business administration accessible and test switching on both mobile and desktop.
- **Unsaved work:** Preserve the existing navigation blocker and verify it before changing the switcher flow.

### Acceptance criteria

1. The active business context remains visible on desktop and mobile after selection, navigation, and refresh.
2. The selector uses the proposed heading, subtitle, and All Businesses description.
3. The header labels the combined context `All Businesses` and visibly identifies it as `Read-only`; the accessible name is `All Businesses, read-only`.
4. All selection, routing, persistence, write resolution, and navigation-guard behavior remains unchanged.
5. Existing business creation, editing, and ordering controls remain available and unchanged.
6. Willard’s LLC/division view remains separate from Kinora; no cross-business data becomes visible or writable.
7. No API authorization, data record, schema, calculation, permission, feature gate, or production behavior changes.
8. Authenticated browser checks pass on desktop and mobile; no completion claim is made if a required path is not verified.

### Testing and verification plan

- Run existing business-scope and business-ownership tests before and after implementation.
- Use an authenticated browser to switch between All Businesses and each relevant individual business on desktop and mobile.
- Verify active-context labels, refresh persistence, direct navigation, and the unsaved-change guard.
- Confirm All Businesses remains read-only on every affected action; keep API authorization checks independent from UI visibility.
- Compare business-specific list/report scope for Willard’s LLC divisions and Kinora without changing persistent records.
- Use disposable development fixtures only if a write-path test is necessary; verify cleanup. No production writes or deployment.
- Run the relevant frontend/API typechecks and regression tests, and report actual PASS, FAIL, and NOT RUN outcomes.

## Deferred opportunities

- Settings and Integrations organization, after a control-by-control ownership and persistence map.
- Money entry-point clarity, after tracing every write path to its canonical ledger and business scope.
- Further Job Workspace changes, until an owner walkthrough identifies a specific remaining point of friction after the recently completed unified-workspace phase.
- Dashboard redesign remains excluded from Phase 3B by the current brief.
- Staff navigation and role-specific usability remain deferred unless a concrete staff requirement is approved.

## Implementation results

- **Changed files:** `artifacts/contractor-app/src/pages/BusinessSelector.tsx`, `artifacts/contractor-app/src/components/AppLayout.tsx`, `artifacts/api-server/scripts/e2e-business-context-clarity-verify.ts`, and `artifacts/api-server/scripts/e2e-business-context-nav-blocker-verify.ts`.
- **Selector copy:** the heading, subtitle, and All Businesses description match the approved wording exactly.
- **Context labels:** All Businesses shows a visible Read-only badge on desktop and mobile and exposes `All Businesses, read-only` as its accessible name. A selected business keeps its existing name and has no Read-only badge.
- **Automated verification:** `pnpm --filter @workspace/contractor-app run typecheck` — PASS. `pnpm --filter @workspace/api-server exec tsx scripts/e2e-business-context-clarity-verify.ts` — PASS, 10/10 authenticated checks.
- **Behavior checked:** switching between All Businesses and an individual business, existing selection persistence after reload, in-app navigation, desktop/mobile labels, exact copy, and no writes during the authenticated check.
- **Navigation blocker:** PASS. A temporary browser-only editor change triggered the existing unsaved-changes prompt. Canceling preserved the edit, editor, and original business; choosing **Leave and discard** allowed switching to All Businesses.
- **Write safety:** one `PUT /api/website` attempt was intercepted and aborted before reaching the server. No writes reached the server; the temporary browser edit was discarded. The existing `guardNavigate` handler and blocker implementation were not changed.
- **Unchanged:** no selection logic, permissions, feature gates, routes, server authorization, ownership, financial calculations, database records, schemas, or deployment.

## Unresolved questions and assumptions

- **Confirmed:** The owner approved the exact wording and unchanged selection behavior, then explicitly authorized implementation. No selection or authorization behavior changes are included.
- **Not yet measured:** Whether business selection is a frequent source of confusion or mistakes.
- **Requires implementation-time tracing:** Whether all existing write entry points consistently require a specific business; the plan does not assume uniform behavior across APIs.
- **Assumption:** A presentation-focused change can improve clarity without changing business selection or mutation semantics. If that assumption proves false, stop and return for scope approval.

## Sources reviewed

- `docs/buildpro-simplification-audit-2026-11-12.md`
- `docs/buildpro-phase-3a-navigation-map.md`
- `docs/job-builder-capability-audit.md`
- `docs/manufactured-home-knowledge-system-retirement-audit.md`
- `.agents/architecture/CONSTITUTION.md`
- `.agents/architecture/SYSTEM_REGISTRY.md`
- `.agents/architecture/CHANGELOG.md`
- `.agents/memory/business-isolation.md`
- `artifacts/contractor-app/src/App.tsx`
- `artifacts/contractor-app/src/components/AppLayout.tsx`
- `artifacts/contractor-app/src/contexts/BusinessContext.tsx`
- `artifacts/contractor-app/src/pages/BusinessSelector.tsx`
- `artifacts/contractor-app/src/pages/Settings.tsx`
- `artifacts/contractor-app/src/pages/IntegrationsPage.tsx`
- `artifacts/contractor-app/src/pages/Expenses.tsx`
- `artifacts/contractor-app/src/pages/Banking.tsx`
- `artifacts/api-server/src/routes/businesses.ts`
- `artifacts/api-server/src/routes/expenses.ts`
- `artifacts/api-server/src/routes/invoices.ts`

Implementation is limited to the approved presentation wording and active-context indicator. Verification results and changed files are recorded after implementation.
