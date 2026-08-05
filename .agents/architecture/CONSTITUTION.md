# BuildPro Architecture Constitution

These rules govern every implementation decision in BuildPro. They take precedence over every feature request, deadline, or convenience shortcut. When a proposed implementation conflicts with any rule here, **STOP** — explain the conflict and request approval before writing code.

---

## Core Principles

These are the philosophy behind every rule. When two rules seem to conflict, the Core Principles determine which direction to choose.

1. **Protect Financial Integrity** — Every number must be accurate, traceable, and trustworthy. No shortcuts in financial logic.
2. **One Source of Truth** — Every business concept lives in exactly one place. Duplication is a defect.
3. **Explain Every Number** — Any figure shown to the user must be expandable to show how it was calculated.
4. **Configuration Over Hardcoding** — Business rules belong in settings, not code. Code changes should never be required to change a rate, percentage, or workflow.
5. **Extend Before Create** — The default answer to any new requirement is to reuse or extend what already exists.
6. **Evidence Before Conclusions** — Never state a root cause without database records, API responses, and exact line numbers to support it.
7. **Debug Before Design** — Trace the full execution path before proposing any solution. Do not redesign what has not been proven broken.
8. **Preserve User Data** — No financial record is ever permanently deleted. Archive, void, or correct — never destroy.
9. **Minimize Complexity** — Every feature added is complexity added. Build only what improves an existing workflow.
10. **Build Platforms, Not Features** — Every capability should power multiple surfaces. A receipt scanner powers expenses, jobs, trips, and taxes — not just one screen.

---

## Mandatory Architecture Review Gate

Any task involving **financial data, database schema, business logic, accounting, payroll, inventory, banking, tax calculations, or AI calculation engines** MUST produce a written Architecture Review in the task conversation BEFORE any code is modified. This is an explicit gate — not an implicit expectation.

The review must cover all ten points:
1. Existing systems that overlap
2. Existing database tables
3. Existing API routes
4. Existing UI pages
5. Existing calculations
6. Existing reports
7. Existing source of truth
8. Potential duplicate implementations
9. Whether the feature extends an existing system or requires a new one
10. Recommendation

If this review is not completed, implementation must stop.

---

## Pre-Task Architecture Checklist

Complete every box before writing any code:

```
□ Read CONSTITUTION.md
□ Read SYSTEM_REGISTRY.md
□ Read DECISIONS.md
□ Read CHANGELOG.md
□ Search existing implementation (grep / subagent explore)
□ Check for duplicate tables
□ Check for duplicate APIs
□ Check for duplicate calculations
□ Check for duplicate UI
□ Verify source of truth
□ State source of truth (Rule 27: table / API / calc engine / UI / reports)

Only after every box is checked may implementation begin.
```

---

## Architecture Completion Checklist

Complete every box before declaring a task done:

```
□ Source of truth unchanged (or change documented in DECISIONS.md)
□ SYSTEM_REGISTRY.md updated if a core system was added or changed
□ DECISIONS.md updated if an architectural choice was made
□ CHANGELOG.md updated with completed work only (no planned work)
□ No duplicate tables introduced
□ No duplicate APIs introduced
□ No duplicate calculations introduced
□ No duplicate ledgers introduced
□ Architecture review still passes
```

---

## The Rules

### RULE 0 — NO NEW DATABASE TABLES WITHOUT ARCHITECTURAL REVIEW *(highest priority)*

Before creating any new table:
1. Search the entire project for similar functionality
2. List all existing tables that overlap
3. Explain why each cannot be extended
4. Explain how the new table affects reports, accounting, payroll, inventory, and taxes
5. Wait for approval

**A new table is a last resort — not the default solution.**

---

### Rule 1 — Single Source of Truth

Every business concept has exactly **one** authoritative system.

| Concept | One Source |
|---|---|
| Owner Pay | `owner_capital_entries` |
| Expenses | `expenses` |
| Invoices | `invoices` |
| Payroll (subs) | `sub_payment_records` |
| Mileage | `mileage_logs` |
| Bank Transactions | `bank_transactions` |
| Customers | `clients` |
| Inventory | `materials` |

Never duplicate a business concept across multiple tables or systems.

---

### Rule 2 — Search Before Build

Before creating a database table, API endpoint, React component, page, report, or ledger — **search the project for an existing implementation**. If one exists, explain why it cannot be reused and ask before creating another.

---

### Rule 3 — Never Duplicate Data

Every number should originate from one calculation:

```
Invoice → Revenue Engine → P&L, Dashboard, Reports, Taxes, Owner Pay
```

Never store the same transaction twice. Never calculate the same value in two places.

---

### Rule 4 — One Calculation Engine

Never calculate profit in multiple places. One shared function (e.g., `computeJobProfit()`) powers P&L, Dashboard, Payroll, Reports, Taxes, and Owner Pay. Everything calls that one function.

---

### Rule 5 — Every Feature Must Fit Existing Architecture

Before coding, identify which system owns this feature:
- Jobs? Accounting? Inventory? Payroll? Website? CRM? Banking?

Never invent a new subsystem because it's easier.

---

### Rule 6 — Extend Before Create

Always prefer this order:

```
Reuse existing code
  ↓
Extend existing code
  ↓
Refactor existing code
  ↓
Create new code  ← last resort
```

---

### Rule 7 — Root Cause First

Never fix symptoms. Trace the full data flow:

```
UI → API → Backend → Database → Calculations → Reports
```

Then fix the source, not the symptom.

---

### Rule 8 — One Financial Ledger Per Concept

Each concept has exactly one table. Never store the same transaction in two tables.

| Concept | Table |
|---|---|
| Expenses | `expenses` |
| Invoices | `invoices` |
| Sub Payroll | `sub_payment_records` |
| Owner Pay | `owner_capital_entries` |
| Assets | `assets` |
| Tax Payments | `estimated_tax_payments` |

---

### Rule 9 — Never Store Calculated Values

Do not persist:
- Profit, Net Profit, Split Pool
- Tax Estimate, Take-Home amount
- Any derived number

Store only raw data. Calculate everything live. Stale cached calculations cause inconsistencies.

---

### Rule 10 — Every New Table Requires Approval

Before creating a table, answer all five:
1. Why does this table need to exist?
2. What existing table stores similar information?
3. Why can't that table be extended?
4. Will this create a duplicate source of truth?
5. Does the design support all entity types (Sole Prop, LLC, Partnership, S-Corp, C-Corp)?

---

### Rule 11 — Every Feature Must Support All Entity Types

Before implementing, ask: how does this work for:
- Sole Proprietor, LLC, Partnership, S-Corp, C-Corp?

If the answer differs by entity type — design for all from the start.

---

### Rule 12 — Never Hardcode Business Logic

Never hardcode entity-type rules, tax rates, or business workflows directly. Route through:

```
Business Settings → Tax Profile → Entity Type → Rules Engine
```

---

### Rule 13 — Build Engines, Not Screens

Don't build an Invoice Screen. Build an **Invoice Engine** that powers:
- Invoice Screen
- Dashboard
- Reports
- Customer Portal
- Tax Calculations

The engine powers everything. Screens are just views into engines.

---

### Rule 14 — Every Feature Must Be Reusable

If you build PDF Export — every module must be able to use it.  
If you build an AI Assistant — every page must be able to use it.  
Avoid page-specific implementations of shared capabilities.

---

### Rule 15 — Architecture Impact Review

Before every task, explicitly list:
- Tables affected
- APIs affected
- Pages affected
- Reports affected
- Accounting affected
- Permissions affected
- Multi-business affected
- Tax calculations affected
- Inventory affected

If any of these is uncertain — stop and investigate before coding.

---

### Rule 16 — No Magic Numbers

Never hardcode:
- Tax percentages
- Growth reserve rates
- IRS mileage rates
- Markup percentages

Everything must be configurable through Business Settings → Tax Settings → Growth % → IRS Mileage Rate.

---

### Rule 17 — Every Calculation Must Be Explainable

If BuildPro shows "Split Pool $2,558.66", the user must be able to expand it:

```
Revenue $8,000
− Expenses $3,200
− Growth Reserve $400
− Hourly Labor $1,841.34
= Split Pool $2,558.66
```

Nothing is a black box.

---

### Rule 18 — Every AI Feature Must Show Its Reasoning

If AI recommends a permit requirement, price, markup, or crew size — it must always explain *why*, citing the data or logic that produced the recommendation.

---

### Rule 19 — Never Lose User Data

Delete = archive first. **Never permanently delete financial records.** Soft-delete with a flag or move to an archive table.

---

### Rule 20 — Every Financial Record Has an Audit Trail

Every financial table should track (aspirational — apply to new tables immediately, retrofit existing tables incrementally):
- `created_at` (existing)
- `created_by`
- `updated_at`
- `updated_by`
- `deleted_at`
- `deleted_by`
- `deletion_reason`

---

### Rule 21 — No Orphan Records

When a Job is deleted, its related records must be archived or reassigned — not left dangling:
- Expenses, Photos, Invoices, Mileage, Owner Pay (job_id → SET NULL), Materials, Sub Hours, Sub Payments

Use FK `ON DELETE CASCADE` or `ON DELETE SET NULL` as appropriate.

---

### Rule 22 — Every Module Must Be Plug-and-Play

Website Builder, Accounting, Payroll, Inventory, CRM, Knowledge Base — each should be an independent module that can be disabled without breaking other modules.

---

### Rule 23 — Never Assume a Workflow

Always ask: Can this be configured? Can another contractor do it differently? If yes — make it a setting rather than hardcoding the behavior.

---

### Rule 24 — Every Task Must End With Validation

Before saying "Done":
- ✓ Typecheck passes on both frontend and API
- ✓ No duplicate tables introduced
- ✓ No duplicate APIs introduced
- ✓ Existing architecture reused where applicable
- ✓ No financial regressions
- ✓ Multi-business still works
- ✓ Existing tests pass

---

### Rule 25 — Architectural Conflict Check

Before implementing any feature, compare it against:
- This Constitution
- `SYSTEM_REGISTRY.md`
- `DECISIONS.md`

If the proposed implementation conflicts with an existing architectural decision — **STOP**. Explain the conflict. Request approval before changing the architecture.

---

### Rule 26 — No Parallel Systems

If a proposed implementation creates a second workflow, ledger, table, API, or calculation that represents an **existing** business concept — **STOP**.

The existing implementation must be reused or extended. Parallel systems require:
1. Explicit approval from the user
2. A documented justification entry in `DECISIONS.md`

---

### Rule 27 — Every Feature Must State Its Source of Truth

Every feature proposal must explicitly identify all six before implementation begins:

```
Source of Truth:    [table name]
Database Table:     [exact table]
Primary API:        [route file and path]
Calculation Engine: [function or file]
Primary UI:         [page/component]
Reports Using This: [which reports query this data]
```

No implementation may begin without answering all six.

---

---

### Rule 28 — Debug Before Design

If an existing feature is not working, do **not** create a new task, redesign, table, API, workflow, or implementation until the existing implementation has been fully traced. The complete execution path must be walked:

```
UI → API → Backend → Database → Calculations → Response → Rendered UI
```

The exact failing line of code, query, filter, or calculation must be identified before proposing a solution. Do not redesign a feature until the current implementation has been proven incorrect.

---

### Rule 29 — Evidence Before Conclusion

Do not state "Found the root cause," "Fixed," or "Resolved" unless evidence is immediately provided.

Evidence must include:
- The database record (if applicable)
- The API response
- The calculation output or frontend state
- The **exact line of code** responsible

If evidence cannot be provided, describe the finding as a **hypothesis**, not a confirmed root cause.

---

### Rule 30 — Do Not Solve Unknown Problems

When the cause of a bug is unknown:
- Do not create implementation tasks
- Do not design replacement systems
- Do not create workaround features

Continue debugging until the cause is known. Tasks should only be created after the failing component has been identified.

Every bug begins with this gate:

```
Engineering Review
□ Is this a bug or a new feature?
□ Does the existing implementation already handle this?
□ Has the full execution path been traced?
□ Has the failing line been identified?
□ Is the proposed fix based on evidence, not assumption?
□ Is a redesign actually necessary?

Only after all boxes are checked may implementation begin.
```

---

---

### Rule 31 — Every Bug Fix Requires Three Verification Stages

A bug fix is not complete until all three stages pass:

**Stage 1 — Root cause verification**
Prove the fix addresses the confirmed failing line, not a symptom. Show the database record, API response, and exact code path before and after.

**Stage 2 — Regression testing**
For every category or workflow adjacent to the fix, verify behavior is unchanged. Create controlled test data, trace through all affected buckets, clean up after. Fixing one case while breaking five others is not a fix.

**Stage 3 — Real-world validation**
Verify the fix against real application data in the running app. Confirm the expected behavior is visible in the actual UI. Confirm no existing user data was affected. Compare against the original bug report. Only then may the issue be marked complete.

Synthetic test data proves logic. Real data validates behavior.

---

---

### Rule 32 — Verify With Real Data Before Closing

Before marking any bug as fixed:
1. Verify the fix using real application data (not only synthetic test records)
2. Confirm the expected behavior is visible in the actual UI
3. Confirm no existing user data was affected by the change
4. Compare the result against the original bug report

A bug is not considered fixed until it has been verified against real-world data. Synthetic test records prove the logic is correct. Real data confirms the experience is correct.

---

---

### Rule 33 — No Breaking Changes Without Migration

If a table, API, calculation, or business rule changes:
1. Existing data must continue to work
2. Existing APIs must continue to function or provide a documented migration path
3. Existing UI must not silently break
4. Data migrations must be documented before deployment

Breaking changes require explicit approval.

---

### Rule 34 — Every Feature Must Have an Owner

Every feature belongs to exactly one module. No feature may belong to multiple modules.

| Module | Owns |
|---|---|
| Accounting | Expenses, Owner Pay, Taxes, Growth Reserve |
| Jobs | Job Cards, Scheduling, Photos, Materials |
| Payroll | Subcontractor Pay, Hours, Advances |
| Invoicing | Invoices, Estimates, Payments |
| Website | Websites, SEO, Landing Pages |
| CRM | Clients, Prospects, Leads |
| Banking | Bank Transactions, Reconciliation |

This prevents "who owns this logic?" conflicts and duplicate implementations.

---

### Rule 35 — No Hidden Business Logic

Business rules must never live inside React components. Components display information — they do not decide accounting rules.

```
Wrong:  if (category === "Fuel/Travel" && jobId) setCountsTowardJobProfit(false)  ← in a React component
Right:  Server-side rule in a shared calculation engine or service
```

Business logic belongs in API route handlers or shared engines. UI components receive already-decided values.

---

### Rule 36 — One Naming Standard Per Concept

Every business concept has one official name used across database, API, UI, reports, and AI. Display aliases are permitted only as labels.

**Example violation:** "Owner Draw" / "Owner Pay" / "Owner Compensation" / "Owner Withdrawal" / "Owner Distribution" — five names for one concept.  
**Correct:** Official name is **Owner Pay**. Database column: `owner_capital_entries`. Display label may vary but underlying reference must be consistent.

When adding a new concept, define its official name first. Document it in `SYSTEM_REGISTRY.md`.

---

### Rule 37 — AI Cannot Invent Business Rules

If a business rule is not explicitly documented, do not invent one. Ask.

Never assume:
- Tax rates or thresholds
- Profit split percentages
- Payroll calculation methods
- Permit requirements
- Accounting treatment
- Pricing logic
- Mileage reimbursement rules
- Any workflow that affects money

Undocumented business rules must be confirmed before implementation begins.

---

### Rule 38 — Configuration Over Code

Entity-type logic, tax rules, growth rates, and business workflows must never require code changes to modify. Everything routes through:

```
Business Settings → Entity Type → Tax Profile → Rule Engine
```

If changing a rate, percentage, or threshold requires a code deploy — that is an architectural defect.

---

### Rule 39 — Every Number Must Be Traceable

If BuildPro displays any financial figure, the user must be able to expand it to see the full calculation:

```
Profit $2,735.43
  Revenue:        $8,000.00
  Job Expenses:  −$3,200.00
  Sub Labor:     −$1,841.34
  Growth (5%):   −$  223.23
  Net Profit:    +$2,735.43
```

No black-box numbers. Every figure shown has an "Explain Calculation" path.

---

### Rule 40 — Financial Records Are Immutable

Never edit a posted financial record in place. Instead:
- **Void** the original record
- **Create** a correcting record
- **Link** correction to original for audit trail

Accounting systems depend on immutable history. Silent edits to financial records destroy auditability.

---

### Rule 41 — No Circular Dependencies

Module dependencies must flow in one direction only:

```
Jobs → Accounting → Reports → Taxes
```

Never: Accounting depends on Jobs AND Jobs depends on Accounting. If a circular dependency appears, extract the shared logic into a standalone engine that both modules consume.

---

### Rule 42 — No Duplicate Settings

Every configurable value has exactly one location. No setting may appear in multiple places.

**Example violation:** Growth % in Business Settings, Payroll Settings, Accounting Settings, and Job Settings simultaneously.  
**Correct:** One growth % setting. All modules read from that one location.

---

### Rule 43 — Every Page Answers One Question

Each page or major UI surface should answer exactly one question:

| Page | Question |
|---|---|
| Job Card | What's happening on this job? |
| Accounting | Where is my money? |
| Payroll | What do I owe people? |
| Reports | How is the business performing? |
| Banking | Does the bank match the books? |

If a page answers six questions, split it. Scope creep in UI mirrors scope creep in architecture.

---

### Rule 44 — Every Feature Needs a Reason

Before writing any code, document:
1. **Problem** — What is broken or missing?
2. **Why** — Why does it matter to the user?
3. **Benefit** — What workflow improves?
4. **Cost** — What complexity does this add?
5. **Alternatives** — What other approaches exist?
6. **Decision** — Why this approach over alternatives?

No implementation begins without this documented.

---

### Rule 45 — Every New Feature Must Improve an Existing Workflow

Before building anything new, identify which existing workflow becomes faster, clearer, or more accurate. If no existing workflow improves — do not build it.

"We need AI" is not a reason. "Invoice matching takes 20 minutes and AI reduces it to 30 seconds" is a reason.

---

### Rule 46 — AI Must Challenge Bad Ideas

If a requested implementation violates the Constitution, do not implement it silently. Explain the conflict, cite the rule, and offer compliant alternatives. Compliance with the user's request is never a reason to violate the architecture.

---

### Rule 47 — No Feature Islands

Every feature must integrate with existing systems. BuildPro is one platform, not five separate apps:

```
Website → CRM → Jobs → Invoices → Accounting → Taxes → Reports
```

A feature that cannot connect to this chain should not be built as a standalone island. Identify the integration points first.

---

### Rule 48 — Every Feature Must Be Reportable

If data exists in the system, reports must be able to access it. No hidden data. If a feature stores information that cannot surface in Reports, either connect it to the reporting layer or reconsider whether it should be stored at all.

---

### Rule 49 — Everything Starts With Raw Data

Store raw inputs. Calculate derived values on demand. Never persist computed results.

| Store (raw) | Never store (computed) |
|---|---|
| Mileage logs | Mileage deduction |
| Receipts | Tax estimate |
| Hours worked | Payroll total |
| Invoice amounts | Profit |
| GPS coordinates | Route distance |

Stored calculations go stale. Raw data never does.

---

### Rule 50 — Stop Building When the Architecture Changes

If, during implementation, new information changes the understanding of the problem:

1. **STOP** — do not continue coding
2. Return to the Architecture Review Gate
3. Explain what changed and why
4. Get approval before resuming

Do not continue implementing a solution designed for a problem that no longer exists. This single rule would have prevented the `owner_distributions` detour: the moment an existing Owner Pay ledger was discovered, implementation should have stopped and the architecture revisited before a new table was created.

---

*Last updated: 2026-08-05*  
*Rules: 0–50 (51 total) + 10 Core Principles*
