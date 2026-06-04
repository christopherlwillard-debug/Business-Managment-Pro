# Threat Model

## Project Overview

This project is a contractor management application with a React + Vite frontend (`artifacts/contractor-app`) and an Express 5 backend (`artifacts/api-server`) backed by PostgreSQL via Drizzle. It manages clients, jobs, invoices, expenses, subcontractors, reports, compliance records, file uploads, Square payments, Google integrations, and a subcontractor self-service portal.

Production scope is the deployed public web app at `https://business-managment-pro.replit.app`. The main production entry point is the Express API. `artifacts/mockup-sandbox` is dev-only and should be ignored unless production reachability is demonstrated.

Authentication uses Replit OIDC with server-side sessions stored in PostgreSQL. Most `/api/*` routes require an authenticated session plus access approval, but a small set of routes are intentionally public to support auth, payment links, subcontractor portal access, and webhooks.

## Assets

- **Owner account and team sessions** — compromise grants administrative control over business data, settings, payments, and third-party integrations.
- **Business records** — clients, prospects, jobs, invoices, expenses, compliance items, bank reconciliation data, and reports. These contain financial and operationally sensitive information.
- **Subcontractor records** — contact details, payment history, mileage, expenses, and W-9 data. This includes tax-sensitive personal information.
- **Uploaded files and private documents** — receipts, compliance documents, logos, bank import files, and other uploaded assets stored in object storage or legacy local uploads.
- **Public payment links and payment state** — invoice and quick-charge payment URLs, payment statuses, and public pay-token routes.
- **Application secrets and external integrations** — OIDC client context, session data, SMTP credentials, Square secrets, Google integration tokens, and object-storage credentials.

## Trust Boundaries

- **Browser to API** — all frontend and public-link requests cross this boundary. The client is untrusted.
- **Public internet to intentionally public routes** — `/api/auth/*`, `/api/pay/*`, `/api/portal/*`, `/api/integrations/wix`, and `/api/webhooks/square` are exposed without the normal authenticated middleware chain.
- **Authenticated user to authorization layer** — after login, access is controlled by owner checks and section-based team permissions.
- **Subcontractor portal token boundary** — portal access relies on bearer-like portal tokens plus optional PIN-session cookies.
- **API to PostgreSQL** — bugs in route handlers can expose or tamper with all application records.
- **API to object storage** — uploaded documents are stored outside the app server and must be authorized before being served back.
- **API to third-party services** — Square, Google, mapping/geocoding, and external bid sources introduce webhook, token, and request-validation requirements.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/index.ts`
- **Highest-risk code areas:** `artifacts/api-server/src/routes/auth.ts`, `artifacts/api-server/src/routes/portal.ts`, `artifacts/api-server/src/routes/storage.ts`, `artifacts/api-server/src/lib/objectStorage.ts`, payment/public-link routes under `artifacts/api-server/src/routes/`
- **Public surfaces:** `/api/auth/*`, `/api/pay/*`, `/api/portal/*`, `/api/integrations/wix`, `/api/webhooks/square`, `/api/health`
- **Authenticated/admin surfaces:** most `/api/*` routes after `requireAuth` + `requireAccess`; owner-only controls are concentrated in `routes/index.ts`, `routes/team.ts`, `routes/settings.ts`, and payment/admin routes
- **Dev-only areas:** `artifacts/mockup-sandbox`, `.agents/`, and local helper scripts unless they are proven reachable from production

## Threat Categories

### Spoofing

The application trusts Replit OIDC for identity and then upgrades users into local sessions and roles. Protected API routes must only accept valid session identifiers, and owner bootstrap must not allow an arbitrary internet user to become the owner of a fresh deployment. Public webhook routes must verify origin secrets or signatures before mutating state.

### Tampering

The client can submit updates for invoices, expenses, subcontractor portal data, and uploaded-file references. The server must enforce authorization on every state-changing route, including routes intentionally mounted before the normal auth middleware. Public or token-scoped endpoints must not let attackers generate credentials, approve access, or overwrite sensitive tax/profile data for other users.

### Information Disclosure

The app stores tax records, payment history, uploaded receipts, compliance documents, and private business settings. File-serving routes must authorize access at the object level rather than only checking whether the caller is generally authenticated. Public pay-link and portal routes must reveal only the minimum information necessary to complete their intended flow.

### Denial of Service

Several public routes accept login, portal, upload, and webhook traffic. They must maintain bounded request sizes, reasonable rate limiting on credential-like flows, and validation that prevents attackers from turning public endpoints into unbounded database scans or expensive third-party requests.

### Elevation of Privilege

This codebase has a strong owner-versus-team-user distinction plus a separate subcontractor portal trust model. Any route that bypasses `requireAuth`, `requireAccess`, `requireOwner`, or per-object authorization can become an elevation path. The system must ensure that public routes cannot mint privileged tokens, approve access, or expose private documents belonging to other records.
