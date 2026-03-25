# Workspace

## Overview

Full-stack Contractor Management App for general contractors. Built with React + Vite frontend, Express backend, and PostgreSQL database via Drizzle ORM.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + Framer Motion + Recharts
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (port 8080)
│   └── contractor-app/     # React + Vite frontend (port 18167, serves at /)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   └── replit-auth-web/    # Browser auth hook (useAuth) for frontend
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Authentication

- **Auth provider**: Replit OIDC (OpenID Connect with PKCE)
- **Session storage**: PostgreSQL `sessions` table (server-side, cookie `sid`)
- **User storage**: PostgreSQL `users` table (upserted on login)
- **Admin protection**: All API routes except `/api/portal/*` and `/api/auth/*` require a valid session
- **Frontend gate**: `useAuth()` hook from `@workspace/replit-auth-web`; shows login screen if not authenticated
- **Portal routes stay public**: `/portal/:token` (frontend) and `/api/portal/*` (backend) — token-based auth handled inside portal router
- **Auth files**:
  - `artifacts/api-server/src/lib/auth.ts` — session CRUD, OIDC config
  - `artifacts/api-server/src/middlewares/authMiddleware.ts` — loads user on every request
  - `artifacts/api-server/src/routes/auth.ts` — login, callback, logout, /auth/user
  - `lib/replit-auth-web/src/use-auth.ts` — `useAuth()` React hook

## App Features

### Frontend Pages (artifacts/contractor-app/src/pages/)
- **Dashboard** - Business health overview with revenue/expense charts, active jobs, overdue invoices
- **Jobs** - Job management with statuses (scheduled, in_progress, awaiting_approval, completed, invoiced, cancelled)
- **Invoices** - Invoice creation with line items + TAX REPORT tab (shows jobs by city/location for operating tax tracking)
- **Expenses** - Expense logging with receipt upload + "Click to View Receipt" link
- **Mileage** - Trip logging with IRS deduction calculator (default 72.5¢/mile for 2026)
- **Estimates** - Job estimator with templates, line items by category, markup %, contingency %
- **Subcontractors** - Sub management with W-9 tracking, YTD payments, license/insurance expiry, portal invite system
- **SubcontractorPortal** - Public self-serve portal for subs (no login required, accessed via unique token URL at `/portal/:token`)
- **Daily Logs** - Field documentation with weather, crew, work completed, photos
- **Compliance** - Alerts for 1099 thresholds, uncategorized mileage, license expirations
- **Clients** - Client contact management
- **Settings** - Tabbed settings: Business Profile (name, entity type, EIN, address, contact), Logo & Branding (upload, invoice position/size picker with live preview), Invoice Defaults (payment terms, late fee, prefix, tax rate), Financial (mileage rate, 1099 threshold), Feature Modules

### Settings Feature Toggles
Users can enable/disable modules from Settings. Disabled modules are hidden from the sidebar.
Feature keys (stored in DB): `jobs`, `invoices`, `expenses`, `mileage`, `estimates`, `subcontractors`, `daily_logs`, `compliance`, `clients`

### Backend Routes (artifacts/api-server/src/routes/)
- `/api/clients` - CRUD for clients
- `/api/jobs` - CRUD for jobs
- `/api/invoices` - CRUD for invoices + `/tax-report` endpoint (by city/state)
- `/api/expenses` - CRUD for expenses + `/:id/receipt` for file upload
- `/api/mileage` - CRUD for mileage logs + `/summary` endpoint
- `/api/subcontractors` - CRUD + `/1099-report`
- `/api/portal` - Subcontractor self-serve portal: `POST /generate/:subId`, `GET /:token`, `PUT /:token/w9`, `PUT /:token/features`, CRUD for `/:token/expenses` and `/:token/mileage`
- `/api/estimates` - CRUD + `/:id/convert-to-job`
- `/api/daily-logs` - CRUD for daily field logs
- `/api/settings` - GET/PUT for app settings; `POST /logo` for logo upload (multipart); `DELETE /logo` for removal
- `/api/reports/dashboard` - Dashboard stats
- `/api/reports/compliance` - Compliance alerts
- `/api/uploads` - File upload endpoint (static files served from `uploads/` dir)

### Database Schema (lib/db/src/schema/)
Tables: clients, jobs, invoices, expenses, mileage_logs, subcontractors, estimates, daily_logs, settings
Settings table includes: entity_type, ein, invoice_logo_position, invoice_logo_size columns for branding
Subcontractors table includes: W-9 fields (w9_legal_name, w9_business_name, w9_tax_classification, w9_llc_type, w9_address, w9_city, w9_state, w9_zip, w9_tax_id_type, w9_tax_id, w9_signature, w9_signed_at) and portal_features jsonb column

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/contractor-app` (`@workspace/contractor-app`)
React + Vite frontend served at `/`. Uses React Query hooks from `@workspace/api-client-react`.

### `artifacts/api-server` (`@workspace/api-server`)
Express 5 API server. Routes in `src/routes/`. File uploads handled by multer, stored in `uploads/` dir.
- `pnpm --filter @workspace/api-server run dev` — dev server

### `lib/db` (`@workspace/db`)
Drizzle ORM schema + PostgreSQL connection.
- `pnpm --filter @workspace/db run push` — push schema changes

### `lib/api-spec` (`@workspace/api-spec`)
OpenAPI spec in `openapi.yaml`. Codegen produces React Query hooks + Zod schemas.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate after spec changes
