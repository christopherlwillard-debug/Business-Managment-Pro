# Contractor Production Fixes Design

## Scope

Fix the authenticated contractor app without changing the domain split:

- `.replit.app` remains the contractor dashboard.
- `willardsgc.com` remains the public Website Studio site.

## Client loading

The client profile endpoint must not fail because a related legacy table has a
new Drizzle-only column that is not present in production yet. Related profile
queries will use explicit legacy-safe projections for `square_payments` and
`route_stops`, whose production tables do not carry the new ownership column.
The projections will list only their existing fields; `select().from(...)` is
not allowed for these tables. Canonical client ownership remains enforced by
the client row, and related records from tables without ownership columns are
constrained through their foreign key to that already-authorized client.
Tables with ownership fields retain explicit scoped predicates. When a
business scope exists, no unscoped client fallback is allowed.

## Closed Jobs profit

The UI and reports continue to consume the canonical server-side job-profit
engine. No client-side arithmetic or production data edits will be introduced.
The response version guard stays in place, and the release checks will prove the
published contractor bundle contains the current contract.
Detail and summary responses must each reject missing or stale
`responseVersion` values, with focused tests covering both paths.

## Invoice delivery and drawer layout

Delivery history remains evidence-based: an invoice is Sent only after verified
provider evidence, and no recovery flow sends another email. Gmail permission
failures are presented as a reconnect/retry condition; non-Gmail application
errors remain visible as application errors rather than being labeled as Gmail
failures. Reconnect/recovery may only verify or finalize the existing
communication event. It must never call the send operation, create a
`resend_invoice` event, or send a second email. A provider message ID alone is
not sufficient; the server-written evidence marker and exact provider
verification conditions are required.

The invoice drawer header and action row will remain fixed/non-scrolling while
the invoice document and communication history use an independently scrollable
content region. Action controls must remain reachable at desktop and mobile
viewport widths. Focused UI or visual verification will cover the header and
scroll behavior.

## Verification

- Add focused regression coverage for the client profile projection and
  current profit response contract, including detail and summary stale-version
  rejection.
- Run API and frontend typechecks, focused profit and invoice tests, the
  production frontend build, and the Closed Jobs release guard.
- Confirm the published `.replit.app` bundle separately after the user
  republishes.
