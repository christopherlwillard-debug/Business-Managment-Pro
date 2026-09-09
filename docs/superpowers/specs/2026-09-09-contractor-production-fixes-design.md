# Contractor Production Fixes Design

## Scope

Fix the authenticated contractor app without changing the domain split:

- `.replit.app` remains the contractor dashboard.
- `willardsgc.com` remains the public Website Studio site.

## Client loading

The client profile endpoint must not fail because a related legacy table has a
new Drizzle-only column that is not present in production yet. Related profile
queries will use explicit legacy-safe projections for tables without a
production ownership column. Canonical client ownership remains enforced by the
client row and by scoped predicates on tables that have the ownership fields.

## Closed Jobs profit

The UI and reports continue to consume the canonical server-side job-profit
engine. No client-side arithmetic or production data edits will be introduced.
The response version guard stays in place, and the release checks will prove the
published contractor bundle contains the current contract.

## Invoice delivery and drawer layout

Delivery history remains evidence-based: an invoice is Sent only after verified
provider evidence, and no recovery flow sends another email. Gmail permission
failures are presented as a reconnect/retry condition; non-Gmail application
errors remain visible as application errors rather than being labeled as Gmail
failures.

The invoice drawer header will remain visible while the invoice body scrolls.
The action row will be laid out as a stable header region, with the invoice
document and communication history in the scrollable content region.

## Verification

- Add focused regression coverage for the client profile projection and
  current profit response contract.
- Run API and frontend typechecks, focused profit and invoice tests, the
  production frontend build, and the Closed Jobs release guard.
- Confirm the published `.replit.app` bundle separately after the user
  republishes.
