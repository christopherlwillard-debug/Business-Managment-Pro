# Workspace

## Architecture Governance — Read Before Coding

BuildPro has a formal Architecture Governance System. **Any task touching financial data, database schema, or business logic must begin with the Mandatory Architecture Review Gate** defined in `.agents/architecture/CONSTITUTION.md`.

Consult all four documents before writing any code:

| Document | Purpose |
|---|---|
| `.agents/architecture/CONSTITUTION.md` | 27 rules + mandatory pre/post checklists |
| `.agents/architecture/SYSTEM_REGISTRY.md` | Every core system — table, API, UI, source of truth (read-only) |
| `.agents/architecture/DECISIONS.md` | ADR log — why key choices were made |
| `.agents/architecture/CHANGELOG.md` | Completed architectural changes |

The Architecture Review Gate is **explicit and mandatory** — not an implicit suggestion. If the review is not written in the task conversation before code is modified, implementation must stop.

---

## Golden Rule: Extend Before You Create

> **Reuse before rebuild. Every duplicate implementation is technical debt unless there is a documented architectural reason for creating it.**

Before writing any new component, page, API endpoint, database table, AI workflow, calculation, or business logic, answer these questions:

1. Does this feature already exist somewhere in the app?
2. Can an existing component be reused or lightly adapted?
3. Can an existing API endpoint be reused?
4. Can an existing database table be reused?
5. Can this simply be exposed to another user role via permissions?
6. Can this be accomplished with configuration instead of new code?

If the answer to any of these is **yes**, reuse it.

**Example — Correct:** Expose the existing expense system to subcontractors using role-based permissions; reuse the existing AI receipt scanning, expense model, categories, reports, and calculations.
**Example — Incorrect:** Create a second expense system for subcontractors.

The goal is **one source of truth** for every piece of business logic. UIs may differ by user role, but the underlying logic must be shared: one receipt scanner, one expense engine, one mileage engine, one tax calculation engine, one notification engine, one payment engine, one authentication system.

## Protected Financial Rule — Owner Gas Reimbursement

The approved owner gas-reimbursement waterfall is protected and must not be changed, removed, or reinterpreted unless Christopher directly authorizes that specific change.

The required order is:

1. Calculate Job Costs, Growth Reserve, labor, and the percentage split.
2. Calculate the owner's share and subtract the tax reserve.
3. Show **Recommended Take Home**.
4. Add **Gas Cost Reimbursement** back to the owner.
5. Show the combined **Total to You**.

The gas reimbursement remains separate from the profit split and must not be duplicated as an expense, mileage row, payroll record, or owner-withdrawal ledger entry.

---

## Overview

This project is the internal Contractor Management App named **Willards General Contracting**. Its published Contractor App production deployment is `https://business-managment-pro.replit.app` and is the only production target for authenticated Contractor App features, including Jobs, Schedule, Work Breakdown, Start Work, invoices, and financials. `https://willardsgc.com` is the separate public-facing business website and must never be used to validate Contractor App behavior or production database state. When deployment metadata reports the public custom domain as the primary URL, explicitly use `https://business-managment-pro.replit.app` for Contractor App validation instead.

Key capabilities include:
- Unified Jobs and Invoicing workflow.
- Robust authentication and user management with role-based access (admin vs. subcontractor portal).
- Detailed financial tracking for expenses, mileage, and assets with depreciation schedules.
- Project management features like estimates and daily logs.
- Compliance tools for 1099s and license expirations.
- Integrated customer lifecycle management from prospects to clients.
- Advanced tools like an Aerial Quote Tool for asphalt sealing and year-end accountant reports.
- Integration with Google Drive and Gmail for document management and communication.

The business vision is to provide a comprehensive, intuitive, and efficient platform that empowers general contractors to manage their entire business operations from a single application, reducing administrative burden and increasing profitability.

## User Preferences

- **Do NOT create or suggest a mobile app (Expo, React Native, or any mobile artifact) for this project. The user does not want a mobile app and it is not part of this project.**

## System Architecture

The project is built as a monorepo using `pnpm workspaces`, consisting of a React + Vite frontend and an Express backend.

**Technology Stack:**
- **Monorepo:** pnpm workspaces
- **Node.js:** v24
- **TypeScript:** v5.9
- **Frontend:** React + Vite, Tailwind CSS, shadcn/ui, Framer Motion, Recharts
- **Backend:** Express 5
- **Database:** PostgreSQL with Drizzle ORM
- **Validation:** Zod (`zod/v4`), `drizzle-zod`
- **API Codegen:** Orval (from OpenAPI spec)
- **Build Tool:** esbuild (CJS bundle)

**Project Structure:**
- `artifacts/api-server/`: Express API server (port 8080).
- `artifacts/contractor-app/`: React + Vite frontend (port 18167).
- `lib/api-spec/`: OpenAPI specification and Orval codegen configuration.
- `lib/api-client-react/`: Generated React Query hooks for API interaction.
- `lib/api-zod/`: Generated Zod schemas from OpenAPI.
- `lib/db/`: Drizzle ORM schema and database connection.
- `lib/replit-auth-web/`: Browser authentication hook for the frontend.

**Authentication:**
- **Provider:** Replit OIDC (OpenID Connect with PKCE).
- **Session Management:** Server-side sessions stored in PostgreSQL `sessions` table.
- **User Management:** Users upserted to PostgreSQL `users` table on login.
- **Access Control:** Most API routes require a valid session; `/api/portal/*` and `/api/auth/*` are public.
- **Frontend:** `useAuth()` hook manages login state and redirects.

**UI/UX and Frontend Features:**
- **Dashboard:** Provides an overview of business health, including revenue, expenses, active jobs, overdue invoices, and "Due for Revisit" clients.
- **Jobs Page (Unified):** Combines job and invoice workflows, allowing creation/editing of jobs, generation of invoices, and tracking of completed jobs.
- **Invoices:** Comprehensive invoice creation with line items, file attachments, and a TAX REPORT tab for operating tax tracking.
- **Expenses & Mileage:** Logging and tracking of expenses with receipt uploads and mileage with IRS deduction calculations.
- **Estimates:** Job estimation with templates, line items, markup, and contingency percentages.
- **Subcontractors:** Management of subcontractors, including W-9 tracking, payments, license/insurance expiry, and a dedicated self-serve portal.
- **People & Properties (`/people`):** A unified tabbed page for managing prospects and clients, including business line toggles, shared search, and client lifecycle management.
- **Settings:** Customizable business profile, logo and branding, invoice defaults, financial settings, and feature module toggles.
- **Assets Page:** Manages business assets with detailed depreciation schedules (straight-line, Section 179, bonus) and business use percentage tracking.
- **Accounting - Year-End Report:** A dedicated tab for generating comprehensive year-end financial reports for CPA handoff, including P&L, Schedule C expenses, depreciation, 1099s, and estimated tax payments.
- **Aerial Quote Tool:** A full-page tool for asphalt sealing quotes using satellite imagery, polygon drawing for area/perimeter calculation, and a pricing engine, with the ability to save quotes as estimates.

**Backend Architecture and API Endpoints:**
- **RESTful API:** Provides CRUD operations for core entities like clients, prospects, jobs, invoices, expenses, mileage, subcontractors, estimates, and daily logs.
- **Specialized Endpoints:**
    - `/api/jobs/:id/invoice-draft`: Pre-fills invoice editor from job data.
    - `/api/uploads`: General file upload endpoint utilizing Google Cloud Storage.
    - `/api/storage/objects/*`: Serves uploaded files securely.
    - `/api/reports/dashboard`, `/api/reports/compliance`, `/api/reports/year-end`: Endpoints for generating various reports.
    - `/api/portal`: Subcontractor self-serve portal endpoints.
- **File Storage:** Uses Replit Object Storage (GCS-backed) for persistent file storage.

**Database Schema:**
- Key tables: `clients`, `jobs`, `invoices`, `expenses`, `mileage_logs`, `subcontractors`, `estimates`, `daily_logs`, `settings`, `prospects`, `route_stops`, `square_payments`, `assets`, `asset_business_use`.
- `settings` table includes branding and financial configuration.
- `subcontractors` table includes W-9 fields and `portal_features` (jsonb).
- Integrated FKs for unified customer lifecycle (e.g., `prospects.client_id`, `route_stops.client_id`, `square_payments.client_id`).
- Asset tables include `useful_life_years`, `salvage_value`, `depreciation_method`, `bonus_depreciation_pct` for depreciation tracking.

## External Dependencies

- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **Authentication:** Replit OIDC (OpenID Connect)
- **Mapping (Aerial Quote Tool):**
    - Esri World Imagery satellite tiles
    - OpenStreetMap (fallback)
    - Nominatim (geocoding)
- **Geospatial Calculations:** `@turf/turf` library
- **File Storage:** Replit Object Storage (GCS-backed)
- **Google Integration:**
    - Google Identity Services (GIS) OAuth2
    - Google Drive API (`drive.readonly` scope)
    - Gmail API (`gmail.send` scope)
- **Payment Processing:** Square API (proxied via backend)
- **UI Components:** shadcn/ui
- **Animation:** Framer Motion
- **Charting:** Recharts
- **ZIP File Generation:** `jszip` (for year-end report CSV package)