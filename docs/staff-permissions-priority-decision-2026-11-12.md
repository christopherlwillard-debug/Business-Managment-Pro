# Staff Permissions Priority Decision

**Decision date:** 2026-11-12  
**Status:** **Partially reviewed — deferred pending future staff requirements.**

## What was reviewed

The source-level review in [Staff Route and Permission Audit](staff-route-permission-audit-2026-11-12.md) mapped authenticated routes, redirects, desktop and mobile navigation, the nine-section view/edit model, and the main API authorization boundaries. Unauthenticated requests were rejected, and the focused storage authorization test passed.

The review found that Accounting displays tabs backed by owner-only or separately permissioned APIs, some staff grants do not have corresponding navigation/workflow entry points, and staff-only navigation differs between desktop and mobile. It also found a potential security issue: the shared settings response may include the stored SMTP password for an approved non-owner. No password or production settings were accessed.

## What remains unresolved

A full role-by-role review has **not** been completed. No authenticated staff browser session was used. The exact experience and API outcomes for each role, permission combination, legacy redirect, and workflow still require verification if staff onboarding becomes a concrete requirement.

## Priority decision

BuildPro is currently being developed primarily as the owner's personal business-management platform. There is no current plan to onboard employees or subcontractors, and staff access may never be needed. Therefore, defer these staff-specific improvements until there is a concrete business need:

- Full staff role and permission matrix audit.
- Staff-specific navigation redesign.
- Staff-specific workflow improvements.
- Permission-grant-to-entry-point completeness review.
- Comprehensive owner/admin/employee/subcontractor route walkthroughs.

This decision does **not** remove or weaken the existing permission system, role definitions, route guards, API authorization checks, database protections, public routes, or customer portal access.

## Security work remains active

Authentication for protected routes, owner account protection, server-side authorization for sensitive operations, business data isolation, and protection of financial records, payroll, customer information, and business settings remain mandatory regardless of staff onboarding plans.

In particular, the potential SMTP password disclosure is a security issue, not staff-navigation polish. **Task #2558 (Keep saved email credentials out of staff settings responses)** remains active for remediation and regression coverage.

## Owner-first roadmap

The active simplification roadmap now prioritizes:

1. Owner Dashboard / Business Command Center.
2. Multi-business separation and business switching.
3. Jobs and everyday operational workflows.
4. Accounting clarity while preserving all existing ledgers and calculations.
5. Estimates, invoices, expenses, and payment workflows.
6. Website Studio supporting multiple businesses and websites.
7. Simplified settings and navigation.

The detailed permission report is retained as a reference checkpoint. Its findings should be reopened if staff requirements become concrete or if a security issue requires immediate action; the full staff audit is not represented as complete.

## Task-list disposition

- **Task #2554 — Make sure staff routes match their permissions:** merged as the source-review checkpoint; this is not evidence that all role combinations were tested.
- **Task #2558 — Keep saved email credentials out of staff settings responses:** retain as active security work.
- **Task #2559 — Give staff a usable route for each permission they receive:** defer until staff workflow requirements exist.
- **Task #2560 — Catch staff access mistakes before permissions change:** defer comprehensive staff-matrix coverage; retain essential security checks for protected operations.

The task panel still lists #2559 and #2560 as Active because they were already accepted; this session does not provide a supported way to change accepted task records to a deferred state. Their roadmap status is deferred here, but they must be archived from the task panel to remove them from its Active queue. Task #2558 remains Active.

No application behavior, code, database, deployment, production setting, or user data was changed for this decision.
