---
name: Invoice token schema synchronization
description: The safe development schema shape and preflight rule for invoice payment tokens.
---

`invoices.pay_token` is nullable and must be represented as a partial unique index over non-null values. Before any automated development schema synchronization, check for duplicate non-null tokens and fail with the affected invoice IDs; never resolve the conflict by truncating invoices.

**Why:** Drizzle can classify adding a uniqueness rule to a populated table as a data-loss operation and prompt for truncation. The existing partial index preserves invoice rows and already enforces the business rule.

**How to apply:** Keep the schema’s index predicate aligned with the database index, and run the duplicate check before schema parity checks or push automation.