# Staff Route and Permission Audit

**Date:** 2026-11-12  
**Scope:** Read-only review of app routes, desktop/mobile navigation, the nine-section permission model, API middleware and mounts, relevant existing tests, and non-mutating direct API checks.  
**Changes:** Documentation only. No permission behavior, code, settings, or data was changed. No authenticated staff session was created.

## Permission model

The owner bypasses section checks. Other users must be approved before entering the application. Each approved staff member has `view` and `edit` booleans for:

`jobs`, `expenses`, `invoices`, `clients`, `mileage`, `subcontractors`, `daily_logs`, `estimates`, and `compliance`.

The server's `sectionGuard(section)` permits GET/HEAD/OPTIONS only when that section's `view` is true; POST/PUT/PATCH/DELETE require `edit`. The team API normalizes `edit: true` to also imply `view: true`. The app's `canView` / `canEdit` functions mirror those rules for navigation and controls, but frontend guards are not the security boundary.

## Route-to-permission matrix

### App routes

| Route or route group | Owner | Approved staff | Notes |
|---|---|---|---|
| `/` | Dashboard, after business selection | Redirects to first visible section in the fixed order: Jobs, Expenses, Mileage, Clients, Subcontractors, Accounting; otherwise shows “No sections assigned” | The redirect checks only six section keys; it omits `daily_logs`, `estimates`, and `compliance`. |
| `/jobs` | Allowed | `jobs.view` | Jobs UI also shows many job-edit controls under `jobs.edit`. |
| `/expenses` | Allowed | `expenses.view` | Server writes require `expenses.edit`. |
| `/mileage` | Allowed | `mileage.view` | Server writes require `mileage.edit`. |
| `/subcontractors` | Allowed | `subcontractors.view` | Guarded route redirects to `/people?tab=subcontractors`. |
| `/clients` | Allowed | Redirects to `/people?tab=clients`, where the downstream page resolves the permitted tab | The redirect itself has no guard; the destination is guarded. |
| `/people` | Allowed | `clients.view` **or** `subcontractors.view` | Staff tabs are filtered to sections they can view. Prospects and Contacts tabs are owner-only. |
| `/accounting` | Allowed | `invoices.view` | All tabs except Year-End are rendered for staff; see API mismatches below. |
| `/trip-packet/:jobId` | Allowed | `jobs.view` | API data is served through job-scoped endpoints. |
| `/settings`, `/estimates`, `/invoices`, `/materials`, `/route-planner`, `/assets`, `/aerial-quote`, `/quick-charge`, `/square-transactions`, `/banking`, `/bids`, `/equipment/inventory`, `/equipment`, `/grants`, `/address-book`, `/website`, `/admin/errors`, `/checklist-templates`, `/mfh-homes`, `/jobs/:id/payroll`, `/integrations`, `/crew`, `/trim-out-catalog` | Allowed (some owner navigation is further feature-filtered) | Owner-only `PermissionGuard` | `/address-book` redirects to Contacts after the owner check. `/jobs/:id/payroll` is owner-only, although the main Jobs page has job-edit payroll controls. |
| `/prospects` | Redirects to `/people?tab=prospects` | Redirects to People; staff tab resolution chooses Clients or Subcontractors | The prospects tab itself is hidden from staff. |
| `/portal/:token`, `/sub-login`, `/status/:token`, `/pay/:payToken`, `/site/:slug`, `/site/:slug/:page`, `/quote/:token` | Not part of the signed-in owner/staff router | Token/public-route rules apply | These are separate public/customer/portal surfaces, not section permissions. |

### Section permissions and server API groups

| Permission | Staff UI surface | Server route groups |
|---|---|---|
| `jobs` | `/jobs`, `/trip-packet/:jobId`; daily logs are embedded in Jobs | `/jobs` (jobs, checklist, presence, labor, sub-hours), `/mfh`, `/material-lists`, `/production-service-types`, `/service-addon-prompts` |
| `expenses` | `/expenses` | `/expenses`, `/expense-import`, `/recurring-expenses` |
| `invoices` | `/accounting`; invoice-specific page `/invoices` remains owner-only | `/invoices`, `/payments`, `/tax-reports`, `/other-income`, client-facing invoice APIs, and several report endpoints |
| `clients` | `/people` Clients tab; `/clients` is a redirect | `/clients`, `/client-billing-profiles` |
| `mileage` | `/mileage` | `/mileage` |
| `subcontractors` | `/people` Subcontractors tab; `/subcontractors` is a redirect | `/subcontractors`, `/1099s` |
| `daily_logs` | Daily Logs controls embedded in Jobs; edit buttons check `daily_logs.edit` | `/daily-logs` |
| `estimates` | No staff-accessible top-level route; `/estimates` is owner-only | `/estimates` and quote-delivery routes use `sectionGuard("estimates")` |
| `compliance` | Tax Calendar & Compliance is a tab inside `/accounting` | `/compliance-items`, `/ky-filing-settings`; some tax-payment routes are owner-only |

Owner-only server groups include Team management, dashboard APIs, prospects, tax-payment entry APIs, trips, investments, benchmarks, assets, banking/Plaid, website, integrations, and administrative tools. Reports are individually guarded: most use an appropriate section guard, while Year-End uses owner-only access. The `/team` router also has its own owner middleware.

## Direct authorization checks

- Unauthenticated GET requests to `/api/jobs`, `/api/settings`, `/api/admin/migrations`, and `/api/auth/me` on the development domain each returned **401**.
- `artifacts/api-server/src/routes/storage.test.ts` has a test that sends an upload request as an approved non-owner and expects **403** before a signed upload URL is created. The focused test file passed: 4 tests.
- The source-level guard check confirms section-specific view/edit enforcement and owner-only checks on the listed route mounts. No authenticated staff identity was used for a live browser/API session, so this audit does not claim a full staff-session end-to-end verification.
- A full API test run reported 1,436 passing tests and 6 failures in `accrued-bonus-profit`, `cashbasis-extended`, `job-production-components`, and `reserve-tax-parity`. These failures were unrelated to the documentation-only audit. No application code was changed to address them.

## Mismatches and risks found

### 1. Accounting staff can open tabs whose APIs require another permission or owner status

`/accounting` requires only `invoices.view`, and the Accounting component renders every tab except Year-End for staff. Several visible tabs call APIs with stricter guards:

- **Tax Calendar & Compliance** calls `/api/compliance-items` and `/api/ky-filing-settings`, both guarded by `compliance`; its estimated-tax-payment APIs are owner-only.
- **Business Trips** calls `/api/trips`, which is owner-only.
- **Investments** calls `/api/investments`, which is owner-only.
- **Benchmarks** calls `/api/job-type-benchmarks`, which is owner-only.

Result: staff with invoice view can open these tabs but can receive authorization errors instead of their content. Conversely, a staff member with only `compliance.view` cannot reach `/accounting` to use the compliance UI. This appears to be a navigation/API permission mismatch, not an authorization bypass: the server rejects the disallowed calls.

### 2. Some staff permission grants have no matching entry route

- Staff with only `daily_logs`, `estimates`, or `compliance` access are not recognized by the `/` home redirect's six-section list and can see “No sections assigned.”
- `estimates` has a server permission, but `/estimates` and its navigation item are owner-only. Jobs also unconditionally calls `useListEstimates`, and the embedded Job Estimates panel calls `/api/estimates/by-job/:id`; staff lacking estimates permission receive denied/empty results there.
- Daily Logs is embedded inside Jobs, whose route separately requires `jobs.view`; a staff member with only `daily_logs.view` has no direct UI path to that surface.

These may be intended dependencies between sections, but the current UI does not communicate that a second permission is required.

### 3. People page makes owner-only prospect requests for staff

`PeopleAndProperties` calls `useListProspects()` and `useProspectRevenueSummary()` for all users. The prospects APIs are mounted owner-only, while the staff page hides the Prospects tab and resolves `/clients` or `/prospects` redirects to the staff member's permitted Clients/Subcontractors tab. The calls should therefore be denied for staff and may produce background 403s; no prospects data is exposed through those endpoints.

### 4. Mobile People shortcut excludes subcontractors-only staff

Desktop navigation shows People when a staff member has either `clients.view` or `subcontractors.view`. The fixed mobile bottom bar tests only `clients.view`; subcontractors-only staff therefore lack the People shortcut there, though the People destination remains in the navigation drawer and the route itself allows their permission.

### 5. Generic upload and legacy static-file routes are broader than section permissions

The main `/api/uploads` POST route is mounted after global authentication/approval checks but has no owner/section guard in its route handler. It is used by Jobs and other app surfaces. The legacy `/api/uploads` static directory is also mounted for all approved users without per-file section checks. In contrast, the newer `/api/storage/objects/*` route applies path-based owner or section rules, and generic presigned uploads are owner-only. Confirm whether the legacy routes are intentionally available to every approved staff member before relying on them for private files.

### 6. Settings GET may expose the saved SMTP password to approved staff — high priority

The Settings page is owner-only and settings writes are restricted to the owner. However, `/api/settings` GET is allowed to any approved account member. `format(settings)` begins with `...s`, and the non-owner response destructures several sensitive properties away—but does **not** destructure `smtpPass`. The settings schema stores it in `smtp_pass`, and the route's comment that it is omitted is not enough to remove it from the spread object. When configured, the response construction therefore appears to include the saved SMTP password for an approved non-owner.

No SMTP password was requested, queried, or exposed during this audit. This is a source-level finding; verify and correct the response before allowing staff to use the affected API. The non-owner response also retains numerous business, invoice, tax, and financial preference fields after redacting other listed properties. An explicit allowlist is safer than returning a spread settings row.

### 7. Job edit permission includes payroll writes

The `/jobs` API family is guarded by `jobs`; `jobs.edit` therefore authorizes writes such as pay-worker and owner-draw operations. The main Jobs UI also exposes several of these controls based on `canEdit("jobs")`, so the current UI and API are aligned. The separate `/jobs/:id/payroll` page is owner-only, but that does not make the underlying payroll APIs owner-only. Treat the scope of `jobs.edit` as a business permission decision before any future route reorganization.

## Coverage limits

This was a read-only source and access-boundary audit. The direct development requests were unauthenticated checks, and the approved-non-owner check was the existing mocked storage test. No staff credentials or session were created, no production endpoint was called, and no database rows or settings were inspected. The report identifies source-level gaps and denied-request behavior; it does not assert the actual rendered staff experience for each permission combination.
