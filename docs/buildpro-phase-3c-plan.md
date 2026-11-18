# BuildPro Simplification — Phase 3C Settings Plan

**Status:** Planning only. No Settings or Integrations behavior is authorized to change.
**Review date:** 2026-11-18
**Scope:** Source and documentation review; no browser settings session, API mutation, database query, credential access, or deployment.

## Objective

Make the existing Settings area easier for an ordinary business owner to scan and understand without changing settings, their ownership, or their effects. Keep the current Settings and Integrations routes and preserve every existing control.

Phase 3A navigation and Phase 3B business-context clarity remain closed. This plan does not reopen either phase.

## Sources reviewed

- `docs/buildpro-simplification-audit-2026-11-12.md`
- `docs/buildpro-phase-3a-navigation-map.md`
- `docs/buildpro-phase-3b-plan.md`
- `docs/smtp-credential-exposure-security-review-2026-11-12.md`
- `docs/staff-permissions-priority-decision-2026-11-12.md`
- `docs/full-application-audit.md`
- `artifacts/contractor-app/src/pages/Settings.tsx`
- `artifacts/contractor-app/src/contexts/BusinessContext.tsx`
- `artifacts/contractor-app/src/pages/BusinessSelector.tsx`
- `artifacts/contractor-app/src/components/ProductionBillingSection.tsx`
- `artifacts/contractor-app/src/pages/IntegrationsPage.tsx`
- `artifacts/contractor-app/src/pages/integrations/IntegrationCard.tsx`
- `artifacts/api-server/src/routes/settings.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/routes/production-service-types.ts`
- `artifacts/api-server/src/routes/service-addon-prompts.ts`
- `artifacts/api-server/src/routes/vehicles.ts`
- `artifacts/api-server/src/routes/integrations.ts`
- `artifacts/api-server/src/lib/integrationCatalog.ts`
- `lib/db/src/schema/settings.ts`

No separate Settings or Integrations user guide was found in `docs/`; the November 12 simplification audit and security review are the relevant existing documentation.

## Verified current experience

### Settings route and navigation

- `/settings` is an owner-only page in the client route tree. The API is mounted behind authentication/access checks, and settings writes additionally require the owner.
- Settings opens on the **Business** tab. Twelve tabs appear in one horizontally scrolling strip; the Team tab is hidden unless the user is the owner.
- Each tab renders a different panel. Several panels use the shared **Save Settings** form; Team, Google, Payments, Production Billing, and Wix use separate actions or persistence paths.
- The bottom of the page includes owner-only links to **Checklist Templates** and **Error Log**. These are not settings tabs.
- Settings also contains destructive **Delete This Business** controls inside the Active Business card. This plan does not move or alter them.

### Settings tab inventory

| Existing tab | What it controls | Verified scope / persistence |
|---|---|---|
| **Business** | Active Business card (name, contact details, website, quote terms/validity, address, license, tax ID, parent business, logo); company/legal identity, EIN, tax election/date and assumptions; registered agent; company logo and checklist-PDF signature. | The Active Business card saves to `/api/businesses/:id` and is per business. The remaining company/legal settings use the shared `settings` row. The panel itself explains that LLC legal information is shared while active-business contact and branding override on invoices/estimates. |
| **Invoice Defaults** | Default payment terms, late fee, invoice prefix, default tax rate, and invoice payment reminders. | Shared settings fields; invoice-level values can override defaults. The reminder automation uses connected Gmail. |
| **Financial** | IRS mileage rate, 1099-NEC threshold, and tax filing frequency. | Shared settings fields used across the app. These values have reporting and tax consequences; changing tab placement must not change their behavior. |
| **P&L Layout** | Growth reserve, owner split, tax reserve, and the order of job-cost/labor/reserve deductions in the payroll breakdown. | Shared settings fields consumed by job-profit/payroll behavior. These are financially significant and must remain separate from general preferences. |
| **Production Billing** | Production-service catalog, pricing profiles/overrides, and service add-on prompts. | Uses dedicated production-service APIs and business context; service types and overrides can be business-specific. It is not a simple field in the shared settings row. |
| **Mileage** | Default trip classification, displayed distance units, trip reminders, browser push-notification permission, and vehicle/fuel profiles. | Trip defaults are shared settings; vehicle profiles use `/api/vehicles`. Mileage-rate/tax treatment is separately configured on **Financial**. |
| **Modules** | Feature-module defaults, Manufactured Home Library entry, and mobile bottom-navigation shortcuts. | Feature defaults are global but can be overridden per business from the Business Selector. Bottom-nav preferences are stored with shared settings. The Home Library and service catalog have their own data. |
| **Notifications** | Compliance advance-email switch, destination address, and a test-email action. | Shared settings; sending a test is an external email action. This is not the only place related reminders are configured. |
| **Payments** | Square connection status, enabled payment use cases, webhook instructions, and mobile Square POS App ID guidance. | Primarily connection/setup information. The webhook receives Square payment events; this page does not own invoice accounting or payment records. |
| **Team** | Invitations, access requests, employee access, and section-level view/edit permissions. | Owner-managed user/access records and permission behavior. It affects security and must remain owner-only. |
| **Google** | Connect/disconnect Google account; Drive document selection and Gmail invoice delivery capabilities. | OAuth connection state. No credential is entered in this panel. |
| **Wix Website** | Wix webhook URL and secret token used to turn website quote requests into Prospects. | Separate Wix integration endpoint/configuration; token reveal/copy controls are present. Do not expose or log the token. |

### Integrations & Credentials route

`/integrations` is a separate owner-only destination. It is an integration catalog and health/configuration surface, not a replacement for every provider-related panel inside Settings.

Its six tabs are:

1. **Overview** — status totals, issues needing attention, and links to the relevant integration tab.
2. **Procurement** — API integrations, auto-synced public sources, and procurement portal logins. Enabling a particular procurement source for a business is handled separately in Bid Opportunities → Sources.
3. **Portals** — supply/material accounts. Custom quick links live in Bid Opportunities → Quick Links and are separate from catalog portals.
4. **Financial** — Plaid credentials; individual bank-account links are managed per business on Banking.
5. **AI & Comms** — managed AI services, fuel/maps services, and communication services.
6. **Equipment** — equipment and auction portals.

The catalog distinguishes platform-wide from per-business credentials, managed services, auto-synced sources, API keys, and portal logins. Credential values are encrypted/masked by the integration system; only safe hints and health metadata are intended for this page.

## Business, account, and platform scope

These scopes are not interchangeable:

- **Business-specific:** the Active Business profile (`businesses` records), production pricing/service data, per-business portal credentials, and each business’s own bank-account links.
- **Account/shared settings:** most values in the singleton `settings` table, including invoice defaults, tax/reporting fields, mileage defaults, notifications, global feature defaults, and navigation shortcuts. The table has no `businessId`.
- **Platform-wide connections:** many API credentials and managed services in the integration catalog, including Plaid credentials, mapping/fuel keys, and procurement API keys. Individual data connections may still be per business.
- **Owner/security scope:** team access and permissions, credential management, business deletion, and owner-only administration.

### All Businesses behavior — source-verified

The selector stores All Businesses as `activeBusiness === null` with `hasSelection === true`, and labels the context “View combined information across businesses. Read-only.” The Settings page does not enforce that read-only description as a global lock:

- The business-specific **Active Business** profile card is hidden when `activeBusiness` is null.
- The remaining singleton `settings` form stays visible and can be submitted. Its values are account-wide, so changes affect every business that consumes those shared defaults.
- The **Production Billing** panel also stays visible. With no selected business, the UI passes `businessId: null`; the service-type API then returns the unfiltered catalog, and create actions save a null business ID (global scope). Existing rows from multiple business scopes can therefore appear together. Owner-only server checks do not bind these writes to the selected business or restrict updates to rows in one business scope.
- Team, Google, Wix, Payments, Notifications, and the other Settings panels also remain reachable in this context. Their effects are account, owner, platform, or environment scoped rather than edits to combined job/customer data.
- The business selector is a frontend context, not an authorization boundary. Protected API routes use authentication/access checks and owner checks for writes; the `/api/settings` singleton has no business ID to scope against. Business-specific APIs perform their own route checks, but do not infer the selected frontend context.

**Recommendation — minimal presentation and interaction policy:** Keep the All Businesses label for combined business records, but make Settings explicitly identify itself as account configuration. Show a clear notice such as: “All Businesses is read-only for business records. Account-wide settings below remain editable and affect all businesses. Select one business to change business-specific settings.” Keep account-wide settings editable because they have legitimate shared effects. In All Businesses, prevent edits to business-specific production catalog/pricing data and require selecting one business first; do not silently reinterpret a null business ID as permission to change a particular business. Keep owner-only access and existing server authorization unchanged for this UI-only phase. This recommendation is not implemented.

The source review establishes the current behavior, but does not independently exercise the owner UI or make any requests. A separate owner decision is still needed to accept this wording and the proposed restriction of business-scoped Production Billing edits in the combined context before Phase 3C implementation is approved.

### Per-tab scope and All Businesses matrix

“Editable” below describes the current owner-facing Settings UI; it does not mean a staff member can write. Settings API writes are owner-only. `requireAuth` and `requireAccess` protect API routes, and `requireOwnerForWrites` allows reads through while rejecting non-owner writes.

| Settings tab / control | Storage and effect | Current under All Businesses | Server authorization / scope evidence |
|---|---|---|---|
| **Business — Active Business card** | Selected `businesses` row; affects that business’s identity and invoice/estimate branding. | Hidden because no active business is selected. | `/api/businesses/:id` writes are owner-only; endpoint is ID-addressed and does not consume the frontend selection. |
| **Business — company/legal identity, EIN, tax election/assumptions, registered agent, shared logo/signature** | Singleton `settings` row; shared across businesses. | Visible and editable. | `/api/settings` has no business ID; writes require owner. |
| **Invoice Defaults** | Singleton `settings` row; defaults affect invoices across businesses, with per-invoice overrides where supported. | Visible and editable. | Owner-only writes; no business scope in the settings row. |
| **Financial** | Singleton `settings` row; tax, mileage-rate, and 1099 defaults used across the app. | Visible and editable. | Owner-only writes; no business scope in the settings row. |
| **P&L Layout** | Singleton `settings` row; affects shared job-profit/payroll calculations. | Visible and editable. | Owner-only writes; no business scope in the settings row. |
| **Production Billing** | Dedicated service-type, price-override, and add-on-prompt tables support global and business-specific rows. | Visible and editable. Null business context lists all service types; new service types/prompts can be created globally. | Routes are owner-write protected, but the UI’s null context is not an authorization boundary. The service-type update route addresses a row by ID without checking it belongs to a selected business. |
| **Mileage — trip defaults** | Singleton `settings` row; applies across the account. | Visible and editable. | Owner-only settings writes; no business scope in the settings row. |
| **Mileage — vehicle/fuel profiles** | `vehicles` table. The API currently lists all vehicles and its CRUD does not scope by business, despite a nullable `businessId` column. | Visible and editable; current route operates on the shared vehicle collection. | `/api/vehicles` is owner-only at mount; this route does not enforce active-business scope. |
| **Modules** | `enabledFeatures` and bottom-navigation defaults in singleton `settings`; business overrides are stored on business records and managed separately from this page. | Global defaults are visible and editable; per-business overrides are not shown in this Settings panel. | Settings writes are owner-only; Business Selector business-record writes are separately owner-only. |
| **Notifications** | Singleton `settings` fields; email destinations and reminder switches affect account-level notifications. | Visible and editable; test-email action can send an external message. | Settings writes require owner. Avoid sending test email during read-only verification. |
| **Payments** | Square connection status depends on configured integration/environment state; the mobile Square App ID is a build-time environment value, not a business profile field. | Visible; status/instructions remain available. The placeholder deep-link test is an external app action. | Settings page is owner-only; no app setting is written by these instructions. |
| **Team** | Account-wide access requests, members, and permission records. | Owner-only tab remains visible and its controls remain available. | Owner UI gate plus owner-only team API checks; no business-level team scope is shown. |
| **Google** | Owner/account OAuth connection state and Drive/Gmail capabilities. | Visible; connection actions remain available. | Settings page is owner-only; OAuth actions are separate external side effects. |
| **Wix Website** | Shared Wix webhook/configuration for website quote intake. | Visible; configuration controls remain available. | Owner-only page and configuration routes; no selected business ID is supplied by this tab. |

**Other platform-level configuration:** Integrations & Credentials is a separate owner-only route, not one of the twelve Settings tabs. Its catalog contains both platform-wide credentials and business-scoped connections; a null business context is not proof that a credential is safely editable across all businesses. This Phase 3C plan does not redesign or move those controls.

## Verified clarity problems and boundaries

1. **Twelve unrelated tabs share a single horizontal strip.** The same strip contains identity, invoice/tax configuration, pricing, team access, app navigation, and provider connections. On narrow screens the strip scrolls, which makes discovery less obvious.
2. **Scope is mixed.** A per-business profile card appears inside a page whose other controls are shared/account-wide. Feature-module defaults are global with per-business overrides elsewhere. Integration credentials also have distinct platform/business scopes.
3. **Similar concepts are distributed, but are not confirmed duplicates.** Tax assumptions live under Business while mileage and 1099 thresholds are under Financial; mileage rate and trip defaults are split across Financial and Mileage; compliance, invoice, and trip reminders are in different tabs. Their actual effects differ, so they must not be merged based on labels alone.
4. **Connection setup is split across destinations for different reasons.** Payments includes Square instructions, Google handles its OAuth account, Wix shows a webhook/token, and Integrations & Credentials provides catalog-wide credential health. These are not automatically duplicate systems. Verify ownership and provider behavior before moving any panel.
5. **High-impact and low-impact controls are adjacent.** Financial calculations, permissions, integration secrets, and general navigation preferences sit in the same Settings surface. Clear category labels and scope explanations could help without combining their data or persistence.

### Separate SMTP credential-response investigation — confirmed source-level exposure

This security issue is independent of Phase 3C and is not remediated here.

- **Confirmed in current source:** `format()` spreads the stored settings row (`...s`). Although a comment says `smtpPass` is omitted, it is not removed. The owner GET response returns the formatted object. The non-owner GET response removes several named fields but not `smtpPass`, so an approved authenticated non-owner can receive the field if one is configured.
- **Access:** the API applies authentication and approved-access checks. `/settings` is mounted with `requireOwnerForWrites`, which allows GET and blocks non-owner write methods. Thus approved staff can read the response; only the owner can update it. The owner-only browser page does not protect direct API reads.
- **Update response:** an owner PUT returns the formatted settings row too, so it also includes `smtpPass` if populated.
- **Frontend need:** the Settings page initializes blank SMTP password state, but current source has no UI use of the saved password value; the response field is not needed by the browser. A shared `useGetSettings` query is used elsewhere, so the extra property can reach other app pages as well.
- **Blank-password behavior:** PUT chooses the supplied password only when it is non-empty; an empty or omitted value preserves the stored password. No SMTP behavior was changed.
- **Tests:** source search found no focused settings-route regression test asserting that owner GET, staff GET, and owner PUT responses omit `smtpPass`.
- **Actual credential/deployment state:** not verified. No settings API call or database query was made, so this audit does not establish whether a non-null password exists, whether it was retrieved, or whether this source is deployed.

**Recommended separate remediation:** explicitly construct safe settings response objects that never include `smtpPass` for any role or response path, retain only a non-secret configured/not-configured indicator if needed, and add owner/staff GET plus owner PUT regression tests. Assess credential rotation separately if SMTP is configured and the exposure window applies. Do not include this work in Phase 3C. No actual credential value was accessed, emitted, or logged.

Additionally, the Settings GET route may create a default settings row if none exists and may encrypt legacy portal-link credentials for the owner. Source inspection was used here; no Settings API request was made. A future verification must account for those side effects rather than assume GET is always read-only. Given the confirmed SMTP response flaw, do not make an authenticated Settings request until the separate response boundary is fixed or a safe, non-sensitive test fixture is used.

## Three ranked simplification opportunities

### 1. Group the existing Settings tabs by everyday question — recommended

1. **Current experience:** Twelve tab labels share a horizontally scrolling strip and do not show how to find common tasks.
2. **Why it is confusing:** A business owner must already know internal categories such as P&L Layout or Production Billing. Related-looking subjects (tax, mileage, reminders, provider setup) do not have an explanatory scope cue.
3. **What could be simplified:** Add plain-language group headings to the existing tab strip while retaining the existing tab buttons and panels. Keep every tab visible/discoverable; do not add another nested menu or move the panels to new routes.
4. **Functionality to retain:** All twelve panels and their current labels/behavior, owner gating, route, save controls, and direct entry points.
5. **Routes/components/APIs/data:** `/settings`; `Settings.tsx`, `ProductionBillingSection.tsx`, and the current APIs/storage used by each panel. UI organization only.
6. **Risks/dependencies:** Category names can imply false equivalence or wrong scope. Business-specific versus shared settings need visible distinction; sensitive/security controls must not be surfaced in a broader context.
7. **Verification:** Desktop and mobile owner walkthrough; all twelve existing panels accessible; every old control still reachable; direct `/settings` route and current tab behavior work; no API/schema/data/permission changes; verify All Businesses behavior only after the owner resolves the scope question.

### 2. Explain scope and responsibility where settings are edited

1. **Current experience:** Business-specific information and shared settings are shown on one route; connection scope also varies.
2. **Why it is confusing:** The selected business card is per-business, while most settings fields are shared and feature defaults have separate business overrides.
3. **What could be simplified:** Add concise, source-verified labels such as “For this business” or “Shared across your account” next to existing panels; explain where a business-specific override is managed.
4. **Functionality to retain:** Current scope, reads/writes, business selection, overrides, and server authorization.
5. **Routes/components/APIs/data:** Settings and Integrations UI; `businesses`, singleton `settings`, production configuration, and `integration_credentials` boundaries.
6. **Risks/dependencies:** Must map each field to its true persistence and consumer. Unknown/derived scope must not be guessed. Requires owner decision for settings access in All Businesses.
7. **Verification:** Field-by-field ownership map; authenticated multi-business walkthrough; check that displayed labels match persisted scope without changing any values.

### 3. Clarify configuration versus connection health across Settings and Integrations

1. **Current experience:** Square, Google, and Wix have setup panels in Settings while Integrations & Credentials has an overview, issue status, provider catalog, and credential workflows.
2. **Why it is confusing:** “Where do I connect this?” and “Where do I fix a connection?” may have different destinations. However, the panels use distinct providers and operations, so duplication is not established.
3. **What could be simplified:** Add short descriptions and links that state which existing page owns setup, credentials, health, or operational use. Move controls only if a provider-by-provider behavior map proves an actual duplicate and the owner approves it.
4. **Functionality to retain:** Current provider authentication, secrets handling, health checks, business/platform scopes, webhook behavior, and existing routes.
5. **Routes/components/APIs/data:** `/settings`, `/integrations`, `Settings.tsx`, `IntegrationsPage.tsx`, `IntegrationCard.tsx`, settings/integration APIs, and the integration catalog.
6. **Risks/dependencies:** Credential exposure, OAuth reconnect behavior, business scope, webhooks, environment fallbacks, and external side effects.
7. **Verification:** Provider-by-provider ownership map; test setup/status routes using safe development credentials or mocks; assert that secrets are not returned or logged; verify no credentials or integrations change during UI-only work.

## Recommended Phase 3C focus

### Objective

Make the existing twelve Settings tabs easier to find by grouping them under short, owner-understandable headings. Keep the current Settings route, active panels, tab labels, and persistence unchanged.

### Proposed organization and exact headings

Use static category headings around the existing tab buttons; do not create category pages or a second-level menu:

| Group heading | Existing tab buttons |
|---|---|
| **Business & Legal** | Business |
| **Quotes & Invoices** | Invoice Defaults |
| **Financial & Tax** | Financial; P&L Layout |
| **Work & Pricing** | Production Billing; Modules |
| **Mileage & Vehicles** | Mileage |
| **Team & Access** | Team |
| **Notifications** | Notifications |
| **Payments & Connections** | Payments; Google; Wix Website |

Keep the existing tab labels as written. Add a short, plain-language subtitle under the selected panel heading that explains its purpose and, where verified, its scope. Do not rename the `/settings` route, hide a low-frequency control, or change which tab opens first.

### Included work

- Group labels and spacing for the existing tab buttons.
- Short explanations for the current settings areas and verified scope distinctions.
- Responsive behavior so categories and all current tabs remain understandable on phone and desktop.
- A source-only ownership map used to validate the labels before implementation.

### Explicit exclusions

- No changes to settings values, database schema, defaults, persistence, APIs, calculations, tax treatment, payroll, invoices, payments, estimates, or historical records.
- No changes to client/business selection, multi-business behavior, permissions, or server authorization.
- No moving or merging provider configuration, editing credentials, reconnecting services, sending email, invoking webhooks, or changing integrations.
- No settings deletion, destructive action redesign, secret disclosure, or SMTP remediation within Phase 3C.
- No new settings route, wizard, general workflow engine, dashboard/nav changes, Website Studio redesign, or Phase 3D work.

### Preservation requirements

- Preserve all twelve tabs and every existing control.
- Preserve shared settings versus per-business profiles and overrides; never convert one scope into another.
- Preserve financial/accounting formulas, effective values, source-of-truth records, tax and payroll behavior.
- Preserve owner-only and staff permissions and all server-side checks.
- Preserve Google, Square, Wix, Plaid, and other integration state, credentials, encryption, webhook behavior, and environment fallbacks.
- Keep SMTP credentials out of responses and UI as a separate security requirement; do not inspect or print actual secrets.
- Preserve historical records, audit trails, direct URLs, and existing settings access paths.

### Risks and dependencies

- **Owner decision required:** Clarify what the owner may edit while All Businesses is selected, given that some settings are shared account defaults and the All Businesses context is described as read-only.
- **Security dependency:** Resolve or independently verify the SMTP response-risk finding before authenticated Settings responses are used in browser validation.
- **Scope dependency:** Confirm each category/scope label against its API and stored source before implementation. The settings schema alone does not tell a user which business owns a value.
- **Integration dependency:** Map the owner and side effects of each provider panel before considering any relocation. Read-only GETs may have first-access or legacy-data side effects.
- **Usability limitation:** This source audit did not include an authenticated owner usability study. The headings are recommendations, not user-tested conclusions.

### Acceptance criteria

1. All twelve current Settings tabs remain present, accessible, and retain their existing labels and content.
2. Static headings group tabs according to the approved map, with no added nested navigation.
3. Selected-panel descriptions are accurate and do not overstate account/business scope.
4. Desktop and mobile layouts expose every tab without clipping or inaccessible horizontal scrolling.
5. Settings and Integrations routes remain direct-accessible; owner/staff route behavior is unchanged.
6. Settings reads and writes use the existing APIs and preserve all existing values; no schema or migration changes.
7. Financial, tax, estimate/invoice, payroll, mileage, business-scoping, and permission behaviors remain unchanged.
8. No credentials are displayed, newly returned, logged, or sent to third parties.
9. No configuration records, integration connections, business records, or historical data are changed by the implementation verification.
10. Tests explicitly report PASS, FAIL, or NOT RUN for each acceptance check; skipped authenticated or security-sensitive paths are not represented as passed.

### Verification plan

- Unit/component checks for the category-to-tab mapping and all existing tab labels.
- Frontend typecheck and relevant Settings/Integrations tests.
- Authenticated owner walkthrough on desktop and mobile using a safe development session, after resolving the scope and SMTP prerequisites.
- Verify each tab opens the existing content and all visible actions remain reachable.
- Compare business-specific and shared setting labels against source/API scope; check one business at a time without changing stored values.
- Confirm owner/staff route permissions and API authorization remain unchanged.
- Use network assertions to prove no settings, business, integration, or credential writes occur during the walkthrough; avoid test-email, OAuth, credential, upload/delete, and webhook actions.
- Run relevant regression tests for the existing settings APIs, invoice defaults, tax/reporting settings, production billing scope, and integrations serialization.
- Report changed files, each actual test outcome, any unverified path, and confirm no production data or deployment changes.

## Deferred improvements

- Field-level scope mapping for every settings API value and all consumers.
- Owner decision and any separately approved policy for Settings while All Businesses is selected.
- SMTP response redaction, encryption, logging, and regression tests under its separate security scope.
- Provider-by-provider decision about whether setup belongs in Settings, Integrations, or both.
- Any later relocation of controls, URL-backed tab selection, search, or advanced-control disclosure.
- Usability testing with the owner before broader Settings restructuring.

## Completion status

- **Documentation created:** this Phase 3C planning document.
- **Settings structure inspected:** twelve tabs and the specific panels and persistence boundaries listed above.
- **Ranked opportunities:** tab grouping (recommended), scope explanation, and configuration-versus-health clarity.
- **Recommended scope:** UI-only grouping of existing tabs and accurate short descriptions; no behavioral changes.
- **Unresolved owner input:** Settings behavior under All Businesses; security prerequisite: separate SMTP response review/remediation.
- **Changes made:** documentation only. No application code, configuration values, credentials, database records, migrations, or deployment were changed.
- **Authorization:** wait for separate implementation approval.
