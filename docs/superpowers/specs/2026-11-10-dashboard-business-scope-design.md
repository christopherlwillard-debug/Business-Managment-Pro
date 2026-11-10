# Dashboard Business Scope Design

## Goal

Make a selected business filter apply consistently to business-specific cards on
the dashboard. A business's jobs, customers, invoices, expenses, and activity
must not appear in another business's dashboard view. Keep the existing
all-businesses view explicit and available.

## Current behavior

The Business Health request is filtered by the active business or a local
business-line chip. Several other dashboard requests are not: Today’s schedule
and follow-ups, Continue Working, recent activity when only a local chip is
selected, owner withdrawals in that same case, and the Cash Flow reserve card.
This lets business-specific cards disagree about which business is selected.

## Design

### Scope selection

- The global active business takes precedence when selected.
- In All mode, a locally selected business chip resolves to that business's
  canonical ID.
- With no business selected, requests remain in the existing all-businesses
  mode.
- Send the canonical `businessId` to dashboard APIs. The server resolves it
  through the shared business-scope utilities and returns a client error for an
  unknown selector.

### Business-specific cards

- Today’s schedule filters route stops through their linked client or prospect,
  filters prospect follow-ups by prospect ownership, and filters overdue
  invoices by invoice ownership. Route stops without a linked client or prospect
  are excluded from a single-business view because their owner cannot be
  verified.
- Continue Working chooses the most recently active job only from the selected
  business, and its checklist, invoice, crew, and photo details remain attached
  to that same job.
- Recent Activity filters expenses, invoices, subcontractor payments, and owner
  withdrawals to the selected business. For records with both ownership fields,
  canonical `businessId` wins; a matching `businessLine` is a fallback only
  when `businessId` is null.
- Owner Withdrawals receives the same resolved business ID as the dashboard
  cards.
- The Cash Flow reserve card remains visible only in All mode because its
  current calculation is company-wide and is not safe to present as a
  single-business balance.

Compliance items, estimated-tax alerts, and account settings remain
company-level because they do not have business ownership selectors in their
current data model. They are not reclassified by this change.

### Ownership and data safety

- Do not change the parent/child business model.
- Do not roll child businesses into their parent automatically.
- Do not reassign or rewrite historical records.
- Do not change financial calculations.
- A selected business includes rows owned by its canonical ID and legacy rows
  with no ID and a matching business-line slug; it excludes rows with a
  different non-null canonical ID even if the legacy label matches.
- All mode remains intentionally unfiltered.

## Verification

- Check the API behavior for All mode, a canonical business ID, legacy
  null-ID rows with a matching slug, and a mismatched non-null ID with a
  matching slug.
- Check dashboard requests and query keys change when the selected business
  changes.
- Verify route stops, prospects, overdue invoices, Continue Working, recent
  activity, and owner withdrawals are scoped consistently.
- Verify the company-wide Cash Flow card is absent in a single-business view
  and remains available in All mode.
- Run the API tests and contractor-app typecheck.
