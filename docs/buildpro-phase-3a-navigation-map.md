# BuildPro Phase 3A — Navigation Map & Owner Navigation Plan

**Status:** Source-based investigation and proposal only. No application, permission, data, or route changes were made.

## 1. Executive summary

The current application has 23 destinations in the desktop sidebar. They are arranged under five labels—Operations, Business Tools, Finance, Find a Job, and Equipment & Crew—while Settings and Integrations & APIs sit outside those groups. Several destinations are difficult to classify from their current location: Quote Center is under Finance, Website is under Business Tools, and Expenses and Mileage are under Operations.

The proposed six labels—**Home, Work, People, Money, Tools, Manage**—provide a reasonable organizing model without creating new pages. They should be used as navigation groups, not as a reason to combine records or workflows.

The owner mobile navigation already has five primary items: Home, Jobs, Routes, Accounting, and More. Retain those five in this proposal. More opens the existing navigation drawer; the drawer can use the same category labels as desktop. This avoids adding another mobile navigation layer.

The earlier task **“Remove Prospects & Quick Charge from nav”** records the existing direction to keep both out of primary navigation while retaining their routes. The current source matches that direction. Quick Charge creates a separate `quick_charges` record and Square payment link without creating an invoice. Its record has no `businessId`, so it should remain out of the proposed Money navigation unless the owner revisits both its use and business attribution.

This is a source review, not a usability study. The assignments below are recommendations, not measured outcomes.

## 2. Current navigation inventory and proposed mapping

“Primary” in this table means pinned in the existing five-item owner mobile bar. All existing sidebar destinations remain directly accessible from the desktop sidebar and the mobile More drawer in the proposed map.

| Current group | Current destination | Current route | Proposed group | Proposed label | Mobile | Access, overlap, or dependency notes |
|---|---|---|---|---|---|---|
| Ungrouped | Dashboard | `/` | Home | Home | Primary | Owner-only. Main business overview. |
| Operations | Jobs | `/jobs` | Work | Jobs | Primary | Jobs feature and permission section. Existing unified Job Workspace remains the baseline. |
| Operations | Expenses | `/expenses` | Money | Expenses | More | Expenses feature and permission section. Keep distinct from filing or matching a bank transaction. |
| Operations | Mileage | `/mileage` | Money | Mileage | More | Mileage feature and permission section. Keep current job and expense relationships. |
| Operations | People | `/people` | People | People | More | Requires Clients or Subcontractors feature and matching section permission. Clients, prospects, contacts, properties, and subcontractors remain in this canonical workspace. |
| Operations | Trim-Out Catalog | `/trim-out-catalog` | Tools | Trim-Out Catalog | More | Owner-only. Catalog utility; do not create a second catalog destination. |
| Business Tools | Materials | `/materials` | Work | Materials | More | Owner-only. Keep the complete Materials Builder and its existing job connection. |
| Business Tools | Route Planner | `/route-planner` | Tools | Route Planner | Primary | Owner-only. Existing mobile label is “Routes.” Keep the current destination and do not imply that this restores retired scheduling or workday tracking. |
| Business Tools | Assets | `/assets` | Tools | Assets | More | Owner-only. Asset management. |
| Business Tools | Aerial Quote | `/aerial-quote` | Tools | Aerial Quote | More | Owner-only. Quoting/measurement utility; could be confused with Quote Center, so retain its distinct “tool” label. |
| Business Tools | Website | `/website` | Manage | Website | More | Owner-only. Website Studio. Do not combine it with customer work or the public website’s navigation. |
| Finance | Quote Center | `/estimates` | Money | Quote Center | More | Owner-only and estimates-feature gated. Pre-job workflow; preserve explicit decision and authorization steps before job conversion. |
| Finance | Invoices | `/invoices` | Money | Invoices | More | Owner-only and invoices-feature gated. Invoice payment-link actions stay here; do not duplicate them in Quick Charge. |
| Finance | Square Transactions | `/square-transactions` | Money | Square Transactions | More | Owner-only. Provider transaction history; not a replacement for invoice, expense, or accounting records. |
| Finance | Banking | `/banking` | Money | Banking | More | Owner-only. Reconciliation and transaction filing; do not merge bank transactions with expense records. |
| Finance | Accounting & Tax | `/accounting` | Money | Accounting & Tax | Primary | Invoices feature and invoices permission section. Keep the existing accounting reports and source calculations. |
| Find a Job | Bids & Contracts | `/bids` | Tools | Bids & Contracts | More | Owner-only. Business-development workflow; could also be classified as Work, but Tools best preserves its existing distinct workflow. |
| Find a Job | Grants | `/grants` | Tools | Grants | More | Owner-only. Business-development destination. |
| Equipment & Crew | Find Equipment | `/equipment` | Tools | Find Equipment | More | Owner-only. Exact route match is used so `/equipment/inventory` does not activate this item. |
| Equipment & Crew | My Equipment | `/equipment/inventory` | Tools | My Equipment | More | Owner-only. Keep distinct from equipment search. |
| Equipment & Crew | Field Crew | `/crew` | People | Field Crew | More | Owner-only. Related to people, but a separate crew-management function and page. |
| Ungrouped | Integrations & APIs | `/integrations` | Manage | Integrations & APIs | More | Owner-only. Provider setup, connection health, and API tools. Related settings may also exist in Settings. |
| Ungrouped | Settings | `/settings` | Manage | Settings | More | Owner-only. Includes business, invoice, financial, team, website, and provider configuration. Header avatar also links here. |

## 3. Proposed desktop navigation

Use the six labels as sidebar section headings:

- **Home:** Dashboard.
- **Work:** Jobs, Materials.
- **People:** People, Field Crew.
- **Money:** Quote Center, Invoices, Expenses, Mileage, Banking, Square Transactions, Accounting & Tax.
- **Tools:** Route Planner, Aerial Quote, Assets, Trim-Out Catalog, Bids & Contracts, Grants, Find Equipment, My Equipment.
- **Manage:** Settings, Integrations & APIs, Website.

The category labels are headings for existing destinations, not six new landing pages. Keep every existing sidebar destination available. For the first implementation, avoid burying lower-frequency items behind new nested menus; the categories themselves provide the organization. Where a category has many items, use visual spacing or collapsible groups only after an owner walkthrough confirms that discovery remains clear.

Ambiguous placements:

- **Quote Center** belongs in Money because it produces estimates and leads to invoicing, but it is also an early operational step. Keep its own name and route.
- **Route Planner** belongs in Tools, though it is used alongside jobs. Do not rename it “Scheduling” or suggest that retired scheduling/workday features have returned.
- **Field Crew** could fit People or Tools. People is the more understandable section, but its permissions remain owner-only.
- **Bids & Contracts** and **Grants** stay together in Tools as business-development tools; no new “Sales” section is proposed.
- **Aerial Quote** remains a tool distinct from Quote Center.

## 4. Proposed mobile navigation

Retain the current owner five-item bar:

1. Home → `/`
2. Jobs → `/jobs`
3. Routes → `/route-planner`
4. Accounting → `/accounting`
5. More → opens the existing slide-out navigation drawer

The More drawer should show all destinations the owner can access, using the same six group labels as desktop. Do not make More a new route or add a second nested navigation layer. Keep current business switching, navigation-blocker behavior, and direct links.

For staff, the current bottom-bar candidates are Home, Jobs, People, Mileage, Expenses, and More, filtered by section permissions. This proposal does not redesign staff navigation because the current scope is owner navigation. If staff navigation is addressed later, test the resulting visible item count and access with actual permission profiles rather than changing roles or permissions to fit the menu.

## 5. Route aliases and secondary destinations

These routes are not separate sidebar destinations. Preserve them as redirects or contextual pages; they should not create duplicate pages in the proposed menu.

| Current route | Canonical destination | Proposed group / access | Entry point and handling |
|---|---|---|---|
| `/clients` | `/people?tab=clients` | People; People permissions apply at the destination | Legacy redirect; preserve the URL. |
| `/prospects` | `/people?tab=prospects` | People; destination permission applies | Legacy redirect; prospects remain a People tab. |
| `/subcontractors` | `/people?tab=subcontractors` | People; subcontractor section guard | Legacy redirect; preserve the route. |
| `/address-book` | `/people?tab=contacts` | People; owner-only route guard currently applies | Legacy redirect; preserve the existing contact/property functionality. |
| `/jobs/:id/payroll` | Job Payroll | Money contextual; owner-only | Contextual job/payroll destination. Do not create a second payroll system. |
| `/trip-packet/:jobId` | Job trip packet | Work contextual; jobs permission section | Linked from Jobs, Expenses, and Banking. It should remain contextual rather than a primary nav item. |
| `/checklist-templates` | Checklist Templates | Manage secondary; owner-only | Linked from Settings. Do not create another checklist destination. |
| `/admin/errors` | Admin Error Log | Manage secondary; owner-only | Linked from Settings. |
| `/mfh-homes` | Manufactured-home knowledge base | Tools secondary; owner-only | Direct route only in the reviewed route list; confirm whether it still needs a discoverable internal link before any implementation. |
| `/quick-charge` | Quick Charge | Not proposed for primary navigation; owner-only | Direct route retained for compatibility; see section 6. |
| `/pay/:payToken` | Public payment page | Outside authenticated app navigation | Public customer-facing payment route; preserve generated links and tokens. |

Other public or tokenized routes are not represented as internal app navigation items. Preserve them as public destinations, not sidebar entries:

| Current route | Destination | Notes |
|---|---|---|
| `/portal/:token` | Subcontractor portal | Tokenized access; outside the authenticated owner navigation. |
| `/sub-login` | Subcontractor login | Public-facing login entry. |
| `/status/:token` | Job status page | Tokenized customer-facing page. |
| `/site/:slug` and `/site/:slug/:page` | Published business website | Public site routes; not the internal Website Studio route. |
| `/quote/:token` | Public quote page | Tokenized quote decision page; preserve existing decision/authorization boundaries. |

### In-page navigation (not additional sidebar destinations)

- **People:** Prospects, Clients, Subcontractors, Contacts. Existing client/profile behavior stays in the current People page.
- **Settings:** Business, Invoice Defaults, Financial, P&L Layout, Production Billing, Mileage, Modules, Notifications, Payments, Team, Google, Wix Website. These are twelve tabs within Settings.
- **Accounting & Tax:** Overview, Revenue by Month, Profit & Loss, Schedule C + Home Office, Tax Calendar & Compliance, Business Trips, Investments, Benchmarks, Year-End Report. Year-End Report is owner-only.
- The header avatar is a second entry point to the same Settings route, not a second Settings destination.

## 6. Quick Charge investigation

### Verified source behavior

- The internal page is owner-only in `App.tsx`; the API router is also protected by the owner middleware.
- The page lets an owner enter a label, amount, optional customer name/email, and notes. It creates a payment link and QR code, lists charges with Pending/Paid status, and provides copy/open-link and delete actions.
- The current API checks Square configuration, inserts a row into `quick_charges`, creates a Square payment link with a `quick_<id>` reference, and removes the inserted row if link creation fails.
- The `quick_charges` table is separate from invoices and has no `businessId` column. The list/create/delete endpoints do not filter or assign by the currently selected business.
- The Square webhook records a successful reference payment in Square transaction history and marks the quick-charge row paid. The Quick Charge route itself does not create an invoice.
- The public `/pay/:payToken` route can resolve a quick-charge token as well as invoice payment tokens.
- The existing task “Remove Prospects & Quick Charge from nav” records the decision to keep Quick Charge out of the sidebar and preserve its route/data. The current sidebar matches that decision.

### Recommendation

Keep Quick Charge out of the six proposed sidebar groups for now. The recorded owner preference is to use payment links from invoices rather than create standalone charges, and the standalone page stores a separate charge record. Keep `/quick-charge` and public payment routes working for existing links and records.

Do not surface the page under Money unless the owner explicitly confirms a standalone use case and decides how a charge belongs to a business. The current row and list operations are not business-scoped; a business badge in the app header does not provide that isolation. No behavior, record, or permission change is proposed here.

## 7. Permissions, feature gates, and business context

- Sidebar visibility is filtered by owner status, enabled features, and staff section permissions in `AppLayout.tsx`.
- The selected business affects the owner’s effective feature list; the all-business view combines enabled features. Preserve this behavior and the business context badge/switcher.
- Route-level `PermissionGuard` checks in `App.tsx` remain authoritative. Hiding or moving a menu item must not weaken route or API authorization.
- Several owner-only destinations have no feature gate in the sidebar; others, including Jobs, Expenses, Mileage, Quote Center, Invoices, and Accounting, use feature gates. Do not treat a new group heading as a permission.
- People aliases redirect to the existing People workspace. Preserve the destination’s permission checks and all current client, prospect, contact, property, and subcontractor behavior.
- Quick Charge has owner-role checks but no per-business record scope in its schema/routes; do not infer that current business selection scopes it.

## 8. Duplicates, terminology, and discoverability

- Prospects and Subcontractors are People tabs, not separate canonical pages. Their old paths are aliases.
- Settings is linked from both the sidebar and the header avatar. These are two entry points to one destination, not duplicate settings pages.
- “Quote Center” and “Aerial Quote” can be confused; retain both labels and their distinct purposes.
- “Banking,” “Square Transactions,” “Expenses,” and “Accounting & Tax” are related but not interchangeable systems. Grouping them under Money is organizational only.
- Quick Charge has no sidebar link, intentionally, while its route remains. The route and public tokens must not be removed as part of this map.
- `/mfh-homes` has no obvious internal navigation link in the reviewed route/search results; owner should confirm whether direct access is sufficient.
- Do not add `/pay/:payToken`, trip packets, payroll detail, or error logs to the primary owner bar.

## 9. Risks and unresolved owner decisions

1. Confirm the proposed placement of Field Crew under People and Bids/Grants under Tools.
2. Confirm that Quick Charge should remain route-only, consistent with the existing nav-cleanup decision.
3. Confirm whether the manufactured-home knowledge base needs a visible internal link.
4. Decide whether the desktop groups should all remain expanded or allow collapse. The initial implementation should avoid hiding destinations until tested.
5. Keep staff navigation out of this owner-focused phase unless the owner expands scope.
6. No usage analytics or authenticated navigation study was run, so rankings and expected discoverability gains are unmeasured.

## 10. Recommended implementation sequence

1. Approve or adjust the six desktop group assignments and the owner’s five pinned mobile items.
2. Implement only group and label mapping in the existing navigation component. Preserve all paths and canonical destinations.
3. Keep More opening the existing drawer; use the same group headings there.
4. Verify role, feature, selected-business, and all-business visibility without changing those rules.
5. Run route/alias checks and owner/staff navigation tests. Include Quick Charge as a route-retention check, not a newly surfaced menu item.
6. Visually verify desktop and mobile, including the five-item owner bar, mobile drawer, business switcher, website editor, and navigation-blocker behavior.

## Regression checks required before any implementation is considered complete

- Every current sidebar destination remains reachable at its existing path.
- Each destination maps to one canonical page; People aliases still land on the correct People tab.
- Owner and staff menus continue to respect existing roles, section permissions, feature gates, and selected-business feature visibility.
- The owner mobile bar remains exactly five items; More opens the existing drawer and exposes all permitted destinations.
- Settings and Integrations continue to open the same pages and settings; the header Settings link remains functional.
- Quick Charge remains absent from the proposed menu, remains owner-only, and existing quick-charge/public payment links are not broken.
- Route Planner remains Route Planner and does not reintroduce retired scheduling/workday interfaces.
- Jobs still opens the unified Job Workspace; no job, client, financial, checklist, or payment records are changed.
- No route, database schema, business logic, or production data changes are needed for regrouping.

## Source basis

Reviewed current navigation and route source in `AppLayout.tsx`, `App.tsx`, Settings, Quick Charge, the Quick Charge API route, its database schema, Square webhook handling, and the public payment route. Existing project task notes were used to confirm the prior Quick Charge navigation decision. This document records source findings and recommendations; it does not claim that usability outcomes have been measured.
