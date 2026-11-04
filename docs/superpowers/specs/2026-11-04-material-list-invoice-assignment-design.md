# Material List Invoice Assignment

**Status:** Approved for design; awaiting user review of this spec  
**Date:** 2026-11-04

## Goal

Let a user choose which draft invoice receives a job's material list. The target
invoice may belong to a different job for the same client, because creating
another invoice requires creating another job in the current workflow. This
supports either combining materials with other work or keeping them on a
separate invoice.

The list must remain linked to its original job. Assigning it to another
invoice must not move the list, linked material expenses, or other job records.

## Current behavior

- `material_lists` is linked to a job; it has no invoice assignment.
- Material-list changes sync all lists for a job into the newest draft invoice
  for that job as one aggregate `Materials` line.
- The Materials page's attach action returns the latest same-job draft ID; it
  does not honor a selected invoice.
- Invoice line items remain the source of invoice subtotal and revenue.
- Material expense rows are separate from invoice lines and are linked to the
  material list item only when the user enables job expenses.

## Proposed behavior

### Assignment

- Add a nullable invoice reference to the existing material-list record; do not
  introduce a second ledger or join table.
- A material list can be assigned to one invoice at a time. Multiple lists may
  be assigned to one invoice.
- The picker shows all draft invoices for the same client and business, even
  when their jobs differ. Each option includes enough context to distinguish
  invoices (invoice date/number, client, job, and location where available).
- Attaching, changing, or detaching a list changes only its invoice assignment.
  Its original `job_id` and any linked expense rows remain unchanged.
- If the selected invoice belongs to another job, invoice revenue remains
  attributed to that invoice's job. Material costs, if recorded as job
  expenses, remain attributed to the list's original job. This distinction is
  shown in the UI before confirming a cross-job assignment.

### Invoice synchronization

- Preserve the existing aggregate `Materials` invoice line and per-list markup
  calculation.
- Recalculate only the generated material line on affected draft invoices:
  the previous draft (if any) and the newly selected draft.
- When no assigned lists remain on a draft, remove only its generated material
  line. Preserve labor, service, tax, and other invoice lines.
- A sent or paid invoice is immutable to this feature. Sending finalizes its
  current material line; later list edits or detachment do not rewrite that
  invoice.
- Reassignment from a sent or paid invoice to a new draft is allowed only after
  an explicit warning and confirmation. The issued invoice remains unchanged,
  so the new draft may bill the same materials again.
- Creating a later draft does not silently move lists already assigned to an
  invoice. New lists retain the current behavior of attaching to the latest
  same-job draft when one exists; otherwise they remain unassigned until the
  user selects a draft.
- Backfill existing lists to the latest same-job draft, where one exists,
  without changing any existing invoice amounts during migration.

### Validation and failure handling

- The API verifies list ownership, business scope, same-client relationship,
  and that the target invoice is still a draft.
- Reject assignment to another client's invoice, another business, or a
  non-draft target invoice; return a clear conflict/error message and preserve
  the previous assignment.
- Require an explicit confirmation flag when detaching or reassigning a list
  whose previous invoice is sent or paid.
- On synchronization failure, preserve the previous assignment and invoice
  line state through a transaction or equivalent atomic update.
- Do not create invoices as a side effect of material-list activity.

## Architecture review

1. **Overlapping systems:** Existing material-list-to-job-invoice synchronization
   is the system to extend.
2. **Existing tables:** `material_lists`, `material_list_items`, and `invoices`
   already own the necessary data. `expenses` remains the job-cost ledger.
3. **Existing routes:** Extend the material-list and invoice routes; do not add a
   parallel API surface.
4. **Existing UI:** Materials owns list assignment; Invoices remains the owner
   of invoice editing and line-item presentation.
5. **Calculations:** Keep the existing per-list markup calculation and
   aggregate invoice line. Invoice totals continue to derive from invoice line
   items.
6. **Reports:** Revenue continues to come from invoices and is attributed using
   the selected invoice's job. Job-cost reports continue to use expense
   ownership, which is not changed by assignment.
7. **Sources of truth:** Material-list items and their markup determine the
   material amount; invoice line items determine invoiced revenue; `expenses`
   determine recorded costs.
8. **Duplicate implementation risk:** No new ledger or independent material
   calculation is introduced. Only one invoice assignment exists per list.
9. **System ownership:** This extends the existing Materials and Invoices
   systems; it does not create a new subsystem.
10. **Recommendation:** Store one optional invoice assignment on the existing
    list record and synchronize only assigned lists into draft invoices.

## Verification plan

- Route tests: valid same-client cross-job assignment; reject another client,
  another business, sent/paid target invoices, and unauthorized lists.
- Reassignment tests: old draft recalculates from remaining lists, target draft
  receives the selected list, and other invoice lines remain unchanged.
- Data-integrity tests: list `job_id`, material expense IDs, and expense
  `job_id` remain unchanged after assignment.
- Lifecycle tests: creating another draft does not move existing assignments;
  sending an invoice prevents future synchronization into it; reassignment
  from a sent/paid invoice to a draft requires explicit confirmation and leaves
  the issued invoice unchanged.
- UI checks: distinguish duplicate job names in the picker, show current
  assignment, allow change/detach while draft, and display cross-job
  attribution context.
- Run focused API tests, database/API/client typechecks, and the published
  app's unauthenticated preview check. Do not modify production records.

## Out of scope

- Splitting one material list across multiple invoices.
- Automatically moving job costs when invoice assignment changes.
- Editing sent or paid invoice totals. Reassignment after sending leaves the
  issued invoice intact and can result in the same materials appearing on a
  later draft.
- Creating a draft invoice automatically.
- Changing the existing material markup or expense-entry rules.
