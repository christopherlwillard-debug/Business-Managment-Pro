# Aerial Quote Manual-First Design

**Status:** User-approved design; implementation not started  
**Date:** 2026-11-12  
**Product:** Contractor Management App

## 1. Goal

Extend Aerial Quote into a reusable property measurement and service-estimating workflow while retaining the existing estimate, quote-revision, and PDF systems as the sole sources of truth.

The first implementation is manual-first. Google Maps loading is deferred until the existing browser key's API and referrer restrictions are verified. Any drawing, calculation, persistence, or commercial reuse of measurements traced from Google imagery remains disabled until written Google authorization covers that workflow.

## 2. Approved scope

The first implementation may add:

- Business-scoped customer property records with address, label, and notes.
- Multiple named measurement entries per property, including area, length, and count quantities with explicit units, category, source, and notes.
- Append-only measurement revisions. Reopening an older revision and saving an edit creates a new revision; older measurements remain unchanged.
- Business-configurable, versioned profiles for Lawn Mowing, Landscaping, Parking Lot Cleaning, Snow Removal, Asphalt Sealing, and Property Maintenance.
- A single API-owned pricing evaluator that produces explainable estimate line items from a measurement revision and profile version.
- A responsive manual measurement and service-selection flow in Aerial Quote.
- Linking properties to existing clients and estimates, subject to business ownership checks.

Rates are initially unset. No existing business rates are copied, changed, or migrated. An incomplete profile cannot produce a customer estimate. Use synthetic data for development and tests only.

## 3. Explicitly out of scope

- Loading Google Maps, Google Places, or Google Geocoding before browser-key restrictions are confirmed.
- Drawing, calculating, storing, editing, reopening, or commercially reusing geometry traced from Google satellite imagery before written licensing authorization.
- Enabling APIs, changing Google Cloud or Replit settings, changing billing, buying subscriptions, or creating credentials.
- Switching imagery providers.
- Replacing `estimates`, `estimate_quote_events`, existing invoice flows, MH Production Billing, or MH Service Billing.
- Migrating current Aerial Quote prices or other business rates into the new profiles.
- Using production customer data for development experiments.

Google map display/search and Google-derived measurement are separate gates. After browser restrictions are verified, map display/search may be separately considered; imagery-derived measurement still requires the written license.

## 4. Architecture and data flow

### 4.1 Property and measurement records

Add a `properties` entity scoped to an existing `businessId`, with an optional `clientId`, address fields, a human-readable label, notes, and timestamps. A client may have multiple properties. Preserve the LLC/division model: Willard's Asphalt Sealing is an operating division of Willard's General Contracting, LLC; Kinora remains isolated. Never infer or reassign legal ownership from address or division labels.

Add immutable measurement revisions associated with a property. Each revision contains typed, validated entries such as:

- `area`: numeric value and unit (for example square feet or acres)
- `length`: numeric value and unit (for example feet)
- `count`: non-negative integer and unit/category
- Entry name, service category, manual/on-site source, and optional notes

The first version stores no geographic polygons or coordinates. It stores raw user-entered quantities; calculations and display rounding must not overwrite them. Editing a prior revision creates a successor revision containing the revised set of entries.

Add an optional `propertyId` to an estimate, scoped to the estimate's business. The estimate's existing work address remains a quote-time address snapshot. The property link does not replace that snapshot.

### 4.2 Service pricing profiles

Add versioned profiles scoped by business and service key. A profile version holds validated declarative rules and effective/creation metadata. Rules use an allowlisted schema for unit prices, fixed/minimum charges, labor, materials, equipment, travel, margin, and additional charges. Do not evaluate arbitrary code or user-authored expressions.

One API-side calculation service accepts a selected profile version and a measurement revision, validates inputs, and returns:

- Customer-facing itemized lines and totals.
- An internal explanation of the applied rules and missing configuration.
- Provenance references to the measurement revision and pricing-profile version.

Money follows existing estimate rounding behavior. Unit conversion uses one shared path, including 43,560 square feet per acre, 9 square feet per square yard, 3 feet per yard, and 5,280 feet per mile. Keep full input precision through calculation; quantity rounding must be explicit per profile and shown to the user.

### 4.3 Existing estimate and quote integration

Generated lines pass through the existing estimate API and are stored in the existing estimate line-item contract. No duplicate estimate, invoice, or quote table is introduced.

Frozen quote revisions continue to use `estimate_quote_events`. Add a separate internal calculation snapshot to preserve the property, measurement revision, profile version, and calculation provenance used by that revision. Keep this separate from `customerSnapshot`; internal costs, margin, rule definitions, and diagnostic data must never enter customer previews or PDFs.

Existing Aerial Quote pricing, GCEstimateWizard, Production Billing, and Service Billing remain unchanged until a separately approved migration demonstrates exact behavioral parity.

## 5. UI and interaction

The existing Aerial Quote page gains:

1. Property selection or creation, with the current client/business scope visible.
2. Manual/on-site measurement entry by named area, line, or count, including units and notes.
3. Service profile selection and profile configuration for an authorized business owner.
4. Immediate, labeled quantity and price results from the API calculator.
5. Saved measurement history; opening an old revision is read-only until the user creates a new revision.
6. A review step that sends the selected property and generated line items through the existing estimate workflow.

Show source labels such as “Manual” or “On-site.” Do not show a map canvas or enabled Google imagery tracing controls in this stage. Keep mobile and tablet entry usable without requiring map interaction.

## 6. API, authorization, and failure behavior

All property, measurement, and profile endpoints require existing authentication and enforce the caller's business ownership on every read and write. Verify that a linked client and estimate belong to the same permitted business; reject mismatches rather than falling back to another business. Do not expose internal calculation snapshots from customer-facing APIs.

Validate units, numeric bounds, categories, profile versions, and ownership server-side. Return explicit validation errors for missing measurements, unconfigured rates, invalid profile rules, or inaccessible records. Never silently turn missing or unavailable calculations into a zero-price estimate.

The Google key is not accessed in this implementation stage. If a later browser Maps integration is approved, the key must remain out of committed source and logs and must be restricted to the necessary APIs and application referrers. A browser Maps key is inherently visible to users; Replit Secrets cannot make it secret after it is delivered to browser code.

## 7. Migration and compatibility

Use additive schema changes only. Existing estimates, customer addresses, jobs, quote history, current rates, billing catalogs, and invoices remain intact. Existing estimates may have no property link and continue to work as before. Do not auto-create property records from ambiguous legacy addresses.

Before production use, verify development schema changes explicitly, test ownership scopes, and preserve existing quote snapshots and PDFs. Do not change the live website or production database as part of development without a separate approved release step.

## 8. Verification plan

Use synthetic fixtures and test:

- Area, length, count, conversion, and precision boundaries.
- Empty/incomplete profiles and minimum-charge and additional-charge rules.
- Immutable revision history and reproducible old quote calculations.
- Business/division isolation, client linking, and estimate-property association.
- API ownership and invalid-input handling.
- Customer-safe estimate snapshots, quote previews, and PDFs.
- Existing Aerial Quote, Estimate, MH Production Billing, and MH Service Billing regression behavior.
- Responsive manual entry and history flows.

Do not run Google API or production-customer tests in this stage.

## 9. Decisions and later gates

- **Approved now:** manual-first property, measurement, profile, pricing, and Estimate integration design.
- **Not approved for implementation in this stage:** Google map loading while key restrictions are unknown.
- **Blocked by written licensing:** Google imagery-derived digitizing, calculation, storage, editing, reopening, or commercial reuse.
- **Not authorized:** new paid APIs, API activation, billing changes, purchases, subscriptions, or new credentials.

Before beginning implementation, the user must review this written specification. Any change to these boundaries requires another explicit approval.
