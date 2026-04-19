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

## Jobs Page (Unified)

The `/jobs` route is the unified Jobs + Invoice workflow:
- **JobCard**: shows job details; completed jobs get a "Review Invoice" button
- **JobFormDialog**: create/edit with multi-subcontractor picker, work location, status (Scheduled/Completed)
- **InvoiceEditorDialog** (`src/components/InvoiceEditorDialog.tsx`): reusable full-page invoice builder modal — handles create (from job draft) and edit (from existing invoice)
- **SavedInvoicesSection**: table of all job-linked invoices with Edit/Mark Paid/Delete
- Invoices route (`/invoices`) restored to router and sidebar nav ("Invoices" with FileText icon)
- `GET /api/jobs/:id/invoice-draft` pre-fills the invoice editor from job data

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
- **Dashboard** - Business health overview with revenue/expense charts, active jobs, overdue invoices; "Due for Revisit" widget lists clients whose nextServiceDate is within 90 days
- **Jobs** - Job management with statuses (scheduled, in_progress, awaiting_approval, completed, invoiced, cancelled)
- **Invoices** - Invoice creation with line items, file attachments (PDF/image upload via /api/uploads), TAX REPORT tab (shows jobs by city/location for operating tax tracking); paperclip badge on list rows
- **Expenses** - Expense logging with receipt upload + "Click to View Receipt" link
- **Mileage** - Trip logging with IRS deduction calculator (default 72.5¢/mile for 2026)
- **Estimates** - Job estimator with templates, line items by category, markup %, contingency %
- **Subcontractors** - Sub management with W-9 tracking, YTD payments, license/insurance expiry, portal invite system
- **SubcontractorPortal** - Public self-serve portal for subs (no login required, accessed via unique token URL at `/portal/:token`)
- **Daily Logs** - Field documentation with weather, crew, work completed, photos
- **Compliance** - Alerts for 1099 thresholds, uncategorized mileage, license expirations
- **Clients** - Client contact management with clickable profile drawer (tabs: Overview, Jobs, Invoices, Payments, Route) showing full history; service schedule (nextServiceDate + serviceIntervalMonths) editable inline
- **Settings** - Tabbed settings: Business Profile (name, entity type, EIN, address, contact), Logo & Branding (upload, invoice position/size picker with live preview), Invoice Defaults (payment terms, late fee, prefix, tax rate), Financial (mileage rate, 1099 threshold), Feature Modules

### Settings Feature Toggles
Users can enable/disable modules from Settings. Disabled modules are hidden from the sidebar.
Feature keys (stored in DB): `jobs`, `invoices`, `expenses`, `mileage`, `estimates`, `subcontractors`, `daily_logs`, `compliance`, `clients`

## Unified Customer Lifecycle

Prospects → Clients → Jobs → Invoices → Square Payments → Route Planner are all tied together:
- **Prospects page**: "Convert to Client" button on won/serviced cards — one click creates the client record, copies email, sets prospect.clientId, and shows "Client Created" badge
- **Client profile drawer** (`ClientProfileDrawer.tsx`): 5 tabs — Overview (summary stats, service schedule, linked prospect), Jobs, Invoices, Payments (Square live transactions matched by email), Route (upcoming stops). Opened by clicking any client card.
- **Dashboard "Due for Revisit"**: amber card lists clients where nextServiceDate ≤ today + 90 days
- **Route Planner**: add-stop form has "Link to client or prospect" dropdown (auto-fills address + title); stop cards/popups show blue name badge
- **Square Transactions**: each row shows a blue "Users" badge when the buyer email matches a BuildPro client

### Backend Routes (artifacts/api-server/src/routes/)
- `/api/clients` - CRUD for clients; `GET /:id/profile` returns jobs/invoices/payments/linkedProspect/routeStops with summary
- `/api/prospects` - CRUD for prospects; `POST /:id/convert-to-client` converts won/serviced prospect to client, sets prospect.clientId
- `/api/route-stops` - CRUD for route stops; accepts clientId/prospectId FKs; GET returns clientName/prospectContactName via LEFT JOIN
- `/api/square-transactions` - Proxies Square API; also reads square_payments table
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
- `/api/uploads` - General file upload endpoint (now uses GCS Object Storage)
- `/api/storage/objects/*` - Serve uploaded files from GCS Object Storage (authenticated)

### Database Schema (lib/db/src/schema/)
Tables: clients, jobs, invoices, expenses, mileage_logs, subcontractors, estimates, daily_logs, settings, prospects, route_stops, square_payments
Settings table includes: entity_type, ein, invoice_logo_position, invoice_logo_size columns for branding
Subcontractors table includes: W-9 fields (w9_legal_name, w9_business_name, w9_tax_classification, w9_llc_type, w9_address, w9_city, w9_state, w9_zip, w9_tax_id_type, w9_tax_id, w9_signature, w9_signed_at) and portal_features jsonb column
Unified lifecycle FK columns: prospects.client_id (→ clients), clients.next_service_date + clients.service_interval_months, route_stops.client_id (→ clients) + route_stops.prospect_id (→ prospects), square_payments.client_id (→ clients)

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
Express 5 API server. Routes in `src/routes/`. File uploads handled by multer with memory storage, then saved to Replit Object Storage (GCS-backed). Files persist across deployments. Service: `src/lib/objectStorage.ts`. Logos stored as raw `/objects/uploads/logos/uuid.ext` in DB; normalized to `/api/storage/objects/...` serving URLs before returning to client.
- `pnpm --filter @workspace/api-server run dev` — dev server

### `lib/db` (`@workspace/db`)
Drizzle ORM schema + PostgreSQL connection.
- `pnpm --filter @workspace/db run push` — push schema changes

### `lib/api-spec` (`@workspace/api-spec`)
OpenAPI spec in `openapi.yaml`. Codegen produces React Query hooks + Zod schemas.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate after spec changes

## Aerial Quote Tool (Asphalt Sealing)

Route: `/aerial-quote` (owner-only). Sidebar: Business Tools group.

Full-page split layout: left panel (address search, polygon manager, pricing controls, quote summary) + right panel (interactive map).

**Mapping:**
- Esri World Imagery satellite tiles (completely free, no API key)
- Fallback: OpenStreetMap street view toggle
- Geocoding: Nominatim (same as Route Planner)
- Polygon drawing: custom react-leaflet click handler (`DrawController` component); disables double-click zoom while drawing; crosshair cursor
- Area + perimeter calculation: `@turf/turf` (turf.area → m² × 10.764 = sq ft; turf.length → km × 3280.84 = ft)

**Pricing engine (matches existing AsphaltCalculator tiers):**
- Auto-tiers: < 1,000 SF → $0.40/SF, 1,000–3,000 SF → $0.28/SF, > 3,000 SF → $0.20/SF
- Add-ons: crack sealing (LF × rate), second coat (SF × rate), oil stain treatment (SF × rate)
- Round to nearest $50, minimum $300
- Configurable tax rate

**Save as Estimate:** POSTs to `/api/estimates` with `businessLine: "asphalt_sealing"` and includes satellite measurement details in notes. Polygon coordinates embedded in notes disclaimer. Estimate appears in Jobs → Estimates tab.

**Packages added:** `@turf/turf`

## Google Integration (Drive + Gmail)

Frontend-only integration using Google Identity Services (GIS) OAuth2 implicit token flow.

### Files
- `artifacts/contractor-app/src/contexts/GoogleAuth.tsx` — GIS token client, localStorage persistence, `useGoogleAuth()` hook
- `artifacts/contractor-app/src/lib/googleDrivePicker.ts` — Google Picker API (lazy-loads gapi.js), returns `File` object
- `artifacts/contractor-app/src/lib/gmailSend.ts` — RFC 2822 base64url encoding, Gmail API send, `buildInvoiceEmailHtml()`

### Required Environment Secrets
- `VITE_GOOGLE_CLIENT_ID` — OAuth 2.0 Client ID from Google Cloud Console (Web application type)
- `VITE_GOOGLE_API_KEY` — API Key for Google Drive Picker (restrict to Picker API)

### Scopes Requested
- `https://www.googleapis.com/auth/drive.readonly` — read files from Drive
- `https://www.googleapis.com/auth/gmail.send` — send emails via Gmail

### Features
- Settings → Google tab: connect/disconnect UI, connection status, setup instructions
- Accounting → Tax Calendar: "Drive" button next to "Attach" for compliance docs (KY filings + custom items)
- InvoiceViewModal: "Gmail" button in toolbar opens compose panel pre-filled with client email

---

## IMPORTANT: No Mobile App

**Do NOT create or suggest a mobile app (Expo, React Native, or any mobile artifact) for this project. The user does not want a mobile app and it is not part of this project.**

The only artifacts in this project are:
- `artifacts/contractor-app` — the main React + Vite web frontend
- `artifacts/api-server` — the Express API backend
