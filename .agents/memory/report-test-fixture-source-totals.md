---
name: Report test fixture source totals
description: Why accounting report fixtures need invoice source line items
---

Accounting report routes rebuild invoice totals from persisted line items rather than trusting legacy stored total fields. Regression fixtures that only set subtotal, tax, and total silently create zero revenue and make later tax and net-profit assertions look like cross-test leakage.

**Why:** Live-derived invoice totals are intentional financial-integrity behavior; tests must model the authoritative source, not only a historical snapshot.

**How to apply:** When adding or updating report fixtures, include valid line items whose quantity and unit price reproduce the expected invoice total. Keep compiled test output out of Vitest collection so stale artifacts do not run against the current schema.