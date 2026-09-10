# Production Intelligence Phase 0 Contract

**Status:** Implemented for review  
**Scope:** Contracts, invariants, source-of-truth boundaries, and migration design only  
**Runtime changes:** None  
**Database migrations:** None  
**API/UI changes:** None  
**Financial changes:** None

## Purpose

Phase 0 establishes the vocabulary and safety boundaries for the approved
Production Intelligence architecture before any schedule-history or production
data behavior changes are implemented.

The contract is intentionally pure. It is not connected to database reads,
database writes, routes, React state, pricing resolution, payroll, expenses,
invoices, or profit calculations.

## Willard production configuration

Willard's initial production work type has exactly five top-level components:

1. `interior_finish` — Interior Finish
   - `vog`
   - `hybrid`
   - `drywall`
2. `siding` — Siding
3. `plumbing` — Plumbing
4. `skirting` — Skirting
5. `custom` — Custom

`drywall` is an Interior Finish variant. It is not a top-level component.
Finish Carpentry is part of Interior Finish and is not a top-level component.

The following are explicitly excluded as top-level Willard production
components:

- Finish Carpentry
- Drywall
- Electrical
- HVAC
- Inspection
- Cleanup

## Service boundary

`service` is a reserved future work type, separate from `production`.

Service is not a Willard production component in this Phase 0 contract.
Service calls must not participate in:

- Production-component learning
- Production averages
- Production baselines
- Production reports
- Component-hour recommendations

No Service-learning behavior is implemented in Phase 0.

The existing production billing catalog may contain service-oriented billing
items. Those billing items remain governed by the existing production billing
system and are not reclassified by this contract.

## Variant rules

- Interior Finish requires one of `vog`, `hybrid`, or `drywall`.
- Siding has no Phase 0 variant.
- Plumbing has no Phase 0 variant.
- Skirting has no Phase 0 variant.
- Custom has no standard variant.
- A component without variants must reject a supplied variant.
- Existing legacy records are not retroactively rejected by these rules.

## Presence states

Daily operational presence uses three states:

- `unrecorded` — no confirmed presence decision exists
- `here` — the crew was actually present; this counts as a production day
- `not_here` — the crew was not present; this remains history but does not
  count as a production day

An unrecorded date must never be treated as `not_here`.

Optional `not_here` reasons are:

- `pulled_off`
- `customer_delay`
- `material_delay`
- `weather`
- `waiting_on_other_trade`
- `other`

Phase 0 does not create daily records or expose a daily presence control.
Those are Phase 2 responsibilities.

## Evidence source and provenance

Every future production fact must distinguish:

### Source

Where the fact came from:

- `manual_presence`
- `job_schedule`
- `job_sub_hours`
- `daily_log`
- `checklist_status`
- `job_knowledge_record`
- `production_plan_snapshot`

### Provenance

How strongly the system may treat the fact:

- `confirmed` — explicitly entered or otherwise directly confirmed
- `inferred` — reconstructed from legacy evidence
- `derived` — calculated from raw source facts
- `snapshot` — preserved expected configuration at a point in time

Examples:

```text
manual_presence + confirmed
job_sub_hours + inferred
daily_log + inferred
job_schedule + snapshot
production_plan_snapshot + snapshot
```

Historical migration must never turn an unsupported date into a confirmed
presence fact.

## Source-of-truth ownership

### Knowledge Center owns

- Reusable production component definitions
- Variants
- Expected production assumptions
- Learning baselines
- Owner-approved learning changes

It does not own daily attendance, schedule history, posted payroll,
posted expenses, invoices, or actual profit.

### Job Production Plan owns

- Job-specific component selection
- Job-specific expected-value snapshots
- Job-specific component context

It does not own global learning baselines, calendar presence, or posted
financial transactions.

### Scheduling/Operations owns

- Active Schedule
- Schedule History
- Daily presence
- Not-here reasons
- Optional operational work detail

It does not own global production definitions, pricing resolution, payroll
posting, expense posting, or job-profit calculations.

### Financial Systems own

- Posted subcontractor payroll
- Posted expenses
- Invoices and payments
- Mileage and owner ledgers
- Actual job-profit calculations

Production records must not become a parallel financial ledger.

## Existing authoritative systems to reuse

Phase 0 does not change these systems:

| Concept | Existing authority |
|---|---|
| Job identity, business ownership, lifecycle | `jobs` and the Jobs module |
| Current selected production scope | `jobs.mh_production_services` for compatibility |
| Production billing catalog and invoice pricing | `production_service_types`, `production_price_overrides`, and `productionBilling.ts` |
| Reusable checklist definitions | Checklist template tables |
| Applied checklist evidence | Job checklist tables and status history |
| Detailed subcontractor labor | `job_sub_hours` |
| Field notes and photos | `daily_logs` and existing checklist evidence |
| Subcontractor payroll | `sub_payment_records` |
| Operating expenses | `expenses` |
| Materials | `materials`, `material_lists`, and `material_list_items` |
| Actual job profitability | `job-profit.ts` and `job-profit-loader.ts` |
| Preserved learning snapshots | MFH knowledge tables and `mfh-labor.ts` |

## Active Schedule versus Schedule History

### Active Schedule

Active Schedule is operational and current. It may exclude completed or closed
jobs when appropriate for the working queue.

It answers:

> What work is active, upcoming, waiting, or blocked?

### Schedule History

Schedule History is historical and must retain completed-job operational
records after a job leaves Active Schedule.

It answers:

> What happened on this job, on which dates, and with what evidence?

Completed-job exclusion from Active Schedule must never delete or hide
historical production-day, presence, pause, component, checklist, or evidence
records.

## Learning eligibility

### Eligible by default

- Interior Finish by variant
- Siding
- Plumbing
- Skirting

### Conditional

Custom contributes to job-level history but does not update one combined
Custom baseline by default. It may contribute to learning only when the owner
has established a stable named Custom profile.

### Excluded

- Service
- Unknown components
- Forbidden top-level categories
- Unmapped legacy work
- Unrecorded dates
- Inferred facts below the approved evidence threshold
- Travel-only hours when calculating productive component labor

Knowledge Center recommendations must include sample size, source jobs, and
data completeness. No baseline may change silently.

## Financial and backward-compatibility invariants

Phase 0 establishes that future Production Intelligence work must not:

- Write subcontractor payroll to `expenses`
- Create a second payroll ledger
- Create a second expense ledger
- Recalculate actual profit in a new engine
- Treat forecast values as posted transactions
- Rewrite invoice totals or payment status
- Rewrite posted expenses or payroll records
- Change mileage or owner-pay accounting
- Expose internal rates or margins in client-facing documents
- Use hostname, manufacturer name, or legacy business labels as ownership
- Replace checklist history
- Treat schedule dates as proof of attendance

Existing JSONB production selections remain compatibility inputs. Existing
completed jobs must remain readable even if they cannot be fully mapped to the
new component vocabulary.

## Phase 0 acceptance criteria

Phase 0 is complete when:

1. The five approved Willard production components are represented by stable
   keys.
2. Interior Finish owns VOG, Hybrid, and Drywall variants.
3. No forbidden top-level component is accepted by the contract.
4. Service is represented only as a reserved separate work type and is not
   production-learning eligible.
5. Presence states are exactly `unrecorded`, `here`, and `not_here`.
6. Not-here reasons are optional and limited to the approved vocabulary.
7. Source and provenance are separate concepts.
8. Ownership boundaries are documented.
9. Active Schedule and Schedule History semantics are documented.
10. Learning eligibility is explicit, including Custom's named-profile rule.
11. Existing financial, labor, pricing, checklist, and schedule authorities
    are identified for reuse.
12. No runtime route, UI, schema, data, or financial behavior changed.
13. Pure contract tests pass.

## Phase 1 entry gate

Phase 1 may begin only after review confirms that:

- The contract vocabulary is correct.
- No additional Willard top-level component is needed.
- Service remains out of production learning.
- Historical evidence and inference rules are acceptable.
- The active/history boundary is acceptable.
- The proposed additive migration approach does not alter existing ledgers.
