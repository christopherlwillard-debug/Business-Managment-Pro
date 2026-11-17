# Contract Client Work-Order Foundation

## Status

Architecture and Phase 1 scope approved by the user. This document records the approved design for the required specification review before implementation planning.

## Problem and goal

BuildPro needs a reusable way to receive and review installation work orders from contracting clients such as SageHome without treating the payer as the homeowner, creating a job before acceptance, or building a parallel job and accounting system.

Phase 1 creates the smallest foundation for a provider business to manage a contracting-client program, review incoming work orders, and create one ordinary BuildPro job after acceptance.

## Approved roles and source of truth

- **Payer:** an existing `clients` record, such as SageHome. `jobs.clientId` remains the payer and continues to drive existing invoice-recipient behavior.
- **Service provider:** the owning BuildPro `businesses` record, such as Willard’s General Contracting.
- **Homeowner/site contact:** a reusable `contacts` record, kept distinct from the payer. Its legal-business association must use the existing `contact_business_links` model.
- **Property:** an existing `properties` record. The job continues to reference it through `jobs.propertyId`; property ownership and access grants remain authoritative.
- **Accepted job:** the existing `jobs` record, created only after an explicit acceptance. Its existing job number remains separate from the work order’s external number.
- **Financial records:** existing `invoices`, `expenses`, payroll, and reporting sources remain authoritative. A work-order price snapshot, when supplied, is operational agreement context only and does not create revenue, expense, or profit.

## Proposed foundation

Add an intentionally small contract-client program record associating one provider business with one existing payer client and an active/inactive state. Do not add configurable rate catalogs or generic contract-management features.

Add a work-order record associated with that program and provider business. It holds the external order number, minimum intake and site references, review status, decision metadata, any agreed scope/price snapshot supplied with the order, and an optional link to one accepted BuildPro job. The homeowner contact and property remain separate references.

Work orders use the lifecycle `pending_review → accepted|declined` and `accepted → cancelled`; declined and cancelled orders are terminal in Phase 1. Decision records retain the acting user and timestamp; decline may retain a reason, and cancellation requires a reason. Work orders are reviewable before a job exists. Decline creates no job. Acceptance creates the job and updates the work order in one database transaction. Concurrent or repeated acceptance requests must return the same linked job rather than create another, enforced with transaction-level serialization and a database uniqueness constraint on the job link. A controlled cancellation records who canceled the accepted order, when, and why; it does not delete the work order or job and does not silently modify financial records. Cancellation does not automatically close or reverse the linked job. A cancelled order is not re-accepted in Phase 1.

The implementation may use the minimum additive tables and fields needed to enforce these relationships and transitions. It must not add a general event platform or broaden the program into a configurable contract-management system.

## Workflow and UI

1. An authorized user sets up a minimal program using an existing payer client and provider business.
2. An authorized user creates or records an incoming work order under that program, associating an existing homeowner contact and property where available.
3. The user reviews the order and explicitly accepts or declines it.
4. Acceptance creates and links one standard BuildPro job using the existing job workflow and internal job-number behavior.
5. The Jobs workspace shows payer, homeowner/site contact, and property as separate labeled values for contract work. Existing jobs retain their current presentation and behavior.
6. The linked job continues through the existing job, invoice, expense, payroll, checklist, and storage workflows.
7. Cancellation is a recorded decision, not deletion. It does not automatically close, delete, or financially reverse the linked job.

The work-order intake and review surface belongs inside the existing Jobs module and must not replace the current unified Job Workspace or create a parallel job-execution surface.

## Ownership and access

- Every program and work order is scoped to its provider business and validated against the payer client’s legal-business relationship.
- New read and write routes enforce the project’s existing authentication, Jobs permission, and record-level business scope. Program setup, work-order decisions, and cancellation must use existing owner/job-mutation authorization patterns; do not introduce a new role system. Client-side filtering is not authorization.
- Contact and property IDs are validated server-side. Contact visibility/association uses the existing legal-business link. Property use preserves same-legal-business checks and active property grants.
- Acceptance, decline, and cancellation record the authenticated actor and timestamp. Cancellation requires an explicit reason and is limited to users authorized to perform the corresponding existing job-management mutation.
- A contract order may identify a payer different from the property’s associated client. Any exception to the current job-property/client equality check must be limited to a verified, accepted contract work order. It must not weaken ordinary job property validation or allow cross-legal-business access.
- The contract work order’s payer remains the job’s `clientId`. Existing invoice creation and update rules must continue to invoice that payer.
- The existing `client-billing-profiles` scoping concern is not part of contract pricing implementation. Review it separately; do not broaden this phase unless a narrowly scoped security change is essential to the new workflow.

## Architecture review

1. **Overlapping systems:** Jobs, Clients, Contacts, Properties, Estimates/Quote Center, Invoices, and CRM already cover adjacent concepts.
2. **Existing tables:** `clients`, `contacts`, `contact_business_links`, `properties`, `jobs`, `estimates`, and `invoices` remain authoritative for their existing domains. None represents a pre-job external work order or payer/provider program association.
3. **Existing APIs:** `clients.ts`, `contacts.ts`, `jobs.ts`, `estimates.ts`, and `invoices.ts` cover existing flows. Extend the Jobs domain for intake/acceptance and reuse existing entity validation and job behavior.
4. **Existing UI:** `Clients.tsx`, `AddressBook.tsx`, and the unified `Jobs.tsx` workspace are the relevant surfaces. Do not create a second job-management surface.
5. **Calculations:** No new calculation engine is required. Any captured price is a work-order snapshot, not a calculation input or financial record.
6. **Reports:** Existing financial reports continue to read invoices and other approved ledgers. Work orders do not count as revenue or expenses. No new financial report is introduced.
7. **Source of truth:** `jobs` owns jobs; `invoices` owns invoiced revenue; `clients` owns payer identity; `contacts` owns contact identity; `properties` owns property identity; the new contract records own only the program relationship and incoming work-order lifecycle.
8. **Duplicate risk:** Do not duplicate homeowner identities, properties, jobs, invoices, expenses, payroll, or checklists. The only new concepts are contract-program association and pre-job work-order intake/review.
9. **Extend or create:** Extend Jobs and reuse existing entities. Additive tables are justified only for the otherwise unrepresented program and pre-job work-order lifecycle.
10. **Recommendation:** Implement the narrow foundation above, preserving existing jobs and financial behavior. Do not configure unverified SageHome rates or assume contract terms not supplied by the user.

## Explicitly out of scope

- Configuring or seeding SageHome rates from the 2025 worksheet, or asserting unverified 2026 rates.
- A general pricing catalog, contract-document system, or configurable contract-management platform.
- Homeowner signatures, photo requirements, installation evidence, invoice deadlines, reimbursements, callbacks, and chargebacks.
- Replacing estimates, quotes, jobs, invoices, payroll, expenses, checklists, or storage.
- Changing existing residential or manufactured-home workflows.
- Production deployment, production schema changes, or production record modification.

## Validation requirements

- Decline does not create a job.
- Accepting once or retrying/concurrently accepting creates exactly one job and returns the same link.
- External work-order number and internal BuildPro job number remain distinct.
- The job stores the payer in `jobs.clientId`; the invoice remains addressed to that payer.
- The homeowner/contact and property are displayed separately from the payer.
- Unauthorized and cross-business reads/writes are rejected; property grants and ordinary job-property checks remain effective.
- Cancellation records actor, time, and reason without deleting the work order/job or mutating financial records.
- Existing residential, manufactured-home, job, invoice, and property-linking tests continue to pass.
- Test reporting labels every required check PASS, FAIL, or NOT RUN with its name and observed result; records baseline failures separately from regressions; lists changed files, migrations, endpoints, UI components, deferred work, and limitations; confirms no deployment or production-record modification.
