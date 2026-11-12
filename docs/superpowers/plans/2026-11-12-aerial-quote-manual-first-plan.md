# Aerial Quote Manual-First Implementation Plan

**Status:** Draft execution plan for the approved design  
**Design:** `docs/superpowers/specs/2026-11-12-aerial-quote-manual-first-design.md`

## Guardrails

- Do not load Google Maps or use the Google API key until browser referrer/API restrictions are verified.
- Do not digitize, calculate, persist, edit, reopen, or commercially reuse Google-imagery-derived geometry until written authorization covers that workflow.
- Do not enable APIs, change billing, create credentials, buy services, switch imagery providers, or use production customer data.
- Preserve existing Aerial Quote, Estimate/quote/PDF, MH Production Billing, and MH Service Billing behavior.
- Do not migrate or populate actual business prices. Profiles begin unconfigured; customer estimates are blocked until an owner enters valid rates.

## Work sequence

### 1. Reconfirm contracts and current patterns

- Re-read the architecture Constitution, Patterns, Decisions, and System Registry before schema or pricing work.
- Inspect the current schema/migration conventions, auth/business-scope middleware, estimate routes and quote snapshot serializer, Aerial Quote page, and existing calculation tests.
- Identify the existing estimate currency-rounding helper and tax-line behavior; reuse both rather than creating parallel rules.
- Record any conflict with the approved design and stop for clarification if the conflict changes ownership or financial semantics.

### 2. Add additive data structures

- Add business-scoped properties with optional client association, address, label, and notes.
- Add append-only property measurement revisions with validated manual/on-site entries, explicit units, categories, source, and notes.
- Add versioned service pricing profiles scoped by business and service key.
- Add optional property association to estimates and a separate internal calculation snapshot to frozen quote events.
- Create additive development migrations only. Do not backfill ambiguous legacy addresses or apply schema changes to production.

### 3. Implement API and calculation contracts

- Add authenticated, business-scoped property and measurement revision operations.
- Add profile read/update/version operations with server-side schema validation and ownership checks.
- Implement a pure API-side evaluator for the approved component-basis, profit-mode, minimum-charge, unit-conversion, and rounding rules.
- Return explicit errors for incomplete profiles, invalid inputs, or inaccessible records; never silently issue a zero-price quote.
- Pass generated estimate lines through the existing estimate API and preserve internal provenance outside customer-facing snapshots.

### 4. Build the manual-first Aerial Quote flow

- Add property selection/creation, named area/length/count measurement entry, notes, and measurement history.
- Add profile selection and owner configuration for the six approved service profiles.
- Show measured and billable quantities separately when rounding changes a quantity.
- Show an explicit configuration state when rates are missing; do not enable estimate generation until the selected profile is valid.
- Keep map loading and map-derived geometry controls absent or disabled. Do not call Google APIs.
- Retain the existing draft-estimate flow for existing behavior until the new path passes regression checks.

### 5. Verify behavior

- Add unit, schema, API authorization, business-isolation, history, profile-version, calculation, and quote-snapshot tests.
- Add UI tests for property reuse, manual entry, history, missing rates, and successful synthetic estimates.
- Verify existing Aerial Quote calculations, estimate routes, quote revisions, customer-safe PDF output, Production Billing, and Service Billing remain unchanged.
- Run relevant DB/API tests and typechecks; restart only workflows affected by code changes and inspect their logs.
- Use a browser preview for the responsive UI. Do not use production customer data or Google API calls in testing.

## Completion criteria

- Manual/on-site property measurements persist as immutable revisions and remain business-scoped.
- The six profiles are configurable, versioned, and cannot generate customer estimates while incomplete.
- A valid synthetic profile produces estimate lines through the existing estimate/quote lifecycle.
- Frozen revisions reproduce the same measurement/profile provenance without exposing internal costs.
- Existing systems pass their relevant regression checks.
- Google map and imagery-derived measurement gates remain intact.
