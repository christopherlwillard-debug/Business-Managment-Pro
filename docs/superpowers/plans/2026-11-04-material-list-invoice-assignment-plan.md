# Implementation Plan: Material List Invoice Assignment

**Approved design:** `docs/superpowers/specs/2026-11-04-material-list-invoice-assignment-design.md`

## Work sequence

### 1. Add invoice assignment and append-only history storage

**Files**

- `lib/db/src/schema/material-lists.ts`
- `lib/db/src/schema/index.ts` (if schema exports are explicit)
- Add migration `0075_material_list_invoice_assignment.sql`

**Work**

- Add nullable `invoice_id` to `material_lists`.
- Add `material_list_invoice_events` for attach, reassignment, and detach history:
  list ID, previous/destination invoice IDs, actor, timestamp, and whether
  post-send confirmation was given.
- Preserve history if a draft invoice or list is later removed; store enough
  identifier snapshots for the event to remain understandable.
- Backfill existing job-linked lists to each job's latest draft invoice without
  changing any invoice totals or line items.
- Keep expense rows and `material_lists.job_id` unchanged.
- Apply and verify the migration in development; production changes remain
  Publish-managed.

**Tests**

- Migration handles existing lists with and without a draft.
- Backfill does not alter `invoices.line_items`, subtotal, tax, or total.
- History records remain readable after parent records are removed.

### 2. Refactor material-line synchronization and assignment routes

**Files**

- `artifacts/api-server/src/routes/material-lists.ts`
- `artifacts/api-server/src/routes/invoices.ts`
- Existing jobs route call site in `artifacts/api-server/src/routes/jobs.ts`
- Add focused `artifacts/api-server/src/routes/material-lists.test.ts`
- Existing `artifacts/api-server/src/routes/invoices.test.ts`

**Work**

- Replace implicit newest-job-draft synchronization with invoice-specific
  synchronization over lists assigned to that invoice.
- Preserve per-list markup, aggregate Materials line, and all non-material
  invoice lines.
- Extend attach endpoint to accept an invoice ID or explicit detach; validate
  authentication, business, same client, and draft target.
- Reassign atomically: lock the material list and affected invoices, update the
  assignment, write one immutable event, and recalculate only affected draft
  material lines.
- When the previous invoice is sent/paid, require explicit confirmation. The
  endpoint must never update that invoice, and the UI warning must name both
  invoices before the request is sent.
- Prevent invoice edits that would change a client away from an attached
  material list's client unless the relationship is safely resolved.
- Preserve compatibility for callers in invoice/job routes without silently
  moving existing assignments when a new draft is created.

**Tests**

- Same-client cross-job draft assignment succeeds.
- Other-client, other-business, unauthorized, and non-draft targets fail.
- Reassignment from finalized invoice fails without confirmation and succeeds
  with confirmation while leaving the sent invoice unchanged.
- Cancel path makes no request and writes no event.
- Events capture old/new invoice IDs, actor, timestamp, and confirmation state.
- Draft-to-draft reassignment recalculates both invoices, preserves other lines,
  and leaves list/job/expense links unchanged.
- New drafts do not silently acquire existing assignments.

### 3. Update client hooks and Materials UI

**Files**

- `lib/api-client-react/src/hooks/useMaterialLists.ts`
- `artifacts/contractor-app/src/pages/Materials.tsx`
- Any focused Materials component test found or added during implementation

**Work**

- Return current invoice assignment and assignment history for each list.
- Use existing invoice query data to show all same-client drafts, including
  drafts for other jobs. Display date/number, client, job, and location to
  disambiguate duplicate job names.
- Replace the attach no-op experience with a picker that can attach, change, or
  detach; show the current assignment and assignment history.
- For a sent/paid source invoice, show a confirmation naming the source and
  destination. Do not call the API when the user cancels.
- Show the cross-job revenue/cost attribution note before confirmation.
- Invalidate material-list and invoice queries after successful changes; show
  explicit loading, success, and failure states.
- Do not upload or regenerate a PDF as part of assignment; no external API or
  paid AI service is required.

**Tests**

- Duplicate job names remain distinguishable.
- Confirmation cancel does not call the mutation.
- Confirmation accept calls the mutation with the expected invoice and flag.
- History and current assignment refresh after navigation/refetch.

### 4. Update architecture records and verify

**Files**

- `.agents/architecture/SYSTEM_REGISTRY.md`
- `.agents/architecture/DECISIONS.md`
- `.agents/architecture/CHANGELOG.md`

**Work**

- Record `material_list_invoice_events` as the append-only assignment-history
  source, separate from financial ledgers.
- Record the one-invoice-per-list and same-client cross-job decision.
- Add a changelog entry only after implementation and verification succeed.

**Verification**

- Focused material-list and invoice API tests.
- API server, DB library, client library, and contractor-app typechecks.
- Existing invoice and material-list regressions.
- Restart only affected managed workflows; inspect logs.
- Capture the public preview at desktop and mobile widths. Do not attempt to
  authenticate into the published app or modify production records.

## Completion criteria

- Users can attach, change, or detach a material list to any draft invoice for
  the same client, even when the job differs.
- The source job and its expense records never move.
- Finalized invoices remain unchanged; reassignment requires a named warning
  and explicit confirmation.
- Each successful assignment change has a visible, append-only audit event.
- Existing non-material invoice lines and invoice totals remain correct.
