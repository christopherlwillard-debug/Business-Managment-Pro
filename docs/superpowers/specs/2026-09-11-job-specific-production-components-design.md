# Phase 4: Job-Specific Production Components

## Scope

Create versioned, job-owned snapshots of selected MH Production work while
preserving `jobs.mh_production_services` as a backward-compatible selection
representation. The approved top-level structure is:

- Interior Finish: VOG, Hybrid, or Drywall
- Siding
- Plumbing
- Skirting
- Custom

Service work is excluded. Finish Carpentry, standalone Drywall, Electrical,
HVAC, Inspection, and Cleanup are never exposed as top-level components.

## Source of truth and ownership

- Jobs owns component assignment and component status.
- `production_service_types` remains the catalog and pricing source.
- Existing checklist, material-list, and MFH Knowledge Center records remain
  their own sources; snapshots store references/context only.
- `job_production_components` is the historical job-specific snapshot source.
- Financial, payroll, presence, scheduling, checklist, and learning systems
  remain unchanged.

## Data model

`job_production_components` stores one current row per job/component instance
and retains superseded rows. Snapshot context includes the selected catalog
service identities, approved component key/variant, expected values already
available on the job, checklist/material/pricing context, and Knowledge Center
source/version references. Component status is mutable on the current snapshot;
context is never silently rewritten when catalog or Knowledge Center rules
change.

## Lifecycle

Job creation and explicit selected-service edits build snapshots from the
existing catalog and job context. A changed selection or changed component
classification supersedes the prior snapshot and creates a new version. The
legacy JSONB selection remains returned and accepted by existing APIs.

Existing jobs are handled through an explicit idempotent backfill/projection
path, not through a write-on-read side effect. Service-only selections are
ignored by the component builder.

## API and UI

Extend the existing Jobs route with component data on job responses, a
job-scoped component read path, and an independently authorized component
status update. The existing Jobs surface displays the component labels,
variants, and statuses without changing pricing, checklist completion, daily
presence, Planner, or financial behavior.

## Validation

Tests cover classification boundaries, variants, snapshot/version creation,
independent statuses, context preservation, legacy JSONB compatibility,
Service exclusion, authorization/business isolation, and existing job-route
regressions. Run schema validation, API/client typechecks, focused tests,
relevant full tests, and frontend build/typecheck checks.