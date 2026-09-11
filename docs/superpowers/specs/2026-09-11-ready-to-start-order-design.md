# Ready to Start Queue Ordering Design

## Goal

Keep the Phase 4.1 Ready to Start / No Start Date queue in a meaningful,
deterministic order. Jobs without calendar dates must not move unpredictably
because the database returns rows in a different order.

## Approved ordering rule

The server owns the ordering:

1. `jobs.queue_position` when the user has explicitly set it.
2. `jobs.created_at` for jobs without an explicit queue position.
3. `jobs.id` as the final deterministic tie-breaker.

This preserves intentional manual queue positions while giving newly created
jobs a stable creation order when they have not been manually reordered.

## Scope

### API

Extend the existing `GET /api/jobs/ready-to-start` response ordering. Do not add
a new queue table or timestamp. Both `readyJobs` and `waitingJobs` use the same
server-owned comparator and expose a stable queue order field for the client.

The existing `POST /api/jobs/:id/start` mutation remains unchanged:

- accepts a real `YYYY-MM-DD` date;
- requires a ready, open, business-owned job with no existing start date;
- writes only `startDate` and `planningState: "scheduled"`;
- never creates presence, clears blockers, or changes planned/checklist dates.

### UI

Render Ready and Waiting cards in the API-provided order. Do not sort by title,
calendar date, or browser arrival order. Keep the existing production
component summaries, dependency notes, Today/specific-date choices, and
Start Job behavior.

### Testing

Add coverage proving:

- queue positions override creation order;
- creation time orders jobs with no explicit position;
- `id` breaks exact timestamp ties;
- ready and waiting groups preserve their respective order;
- starting still performs only the narrow scheduling mutation and does not
  write presence or clear blockers.

## Architecture review

- Source of truth remains the existing `jobs` table.
- Existing planning inputs remain `planningState`, `queuePosition`, and
  `createdAt`.
- Existing scheduling API ownership remains in `job-checklists.ts` and
  `jobs.ts`.
- Existing Planner UI remains the only consumer surface.
- No financial, payroll, expense, mileage, invoice, profit, presence, or
  benchmark behavior changes.
- No new table, parallel order store, or client-only ordering rule is added.