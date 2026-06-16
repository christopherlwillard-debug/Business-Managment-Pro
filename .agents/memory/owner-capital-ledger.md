---
name: Owner Capital Ledger
description: Durable decisions for the owner capital entries feature (table, API, UI equity formula)
---

## Rule
`owner_capital_entries` table tracks capital injections/withdrawals per business. The UI equity formula is:

`businessOwesYou = (totalInjected − totalWithdrawn) + netProfit − ownerDraws`

**Why:** Replaced a single `ownerPersonalInvestment` setting that couldn't track individual capital events or multiple businesses.

**How to apply:**
- Amount sign convention: positive = injection (money in), negative = withdrawal (capital returned)
- `businessId` (nullable integer) scopes entries per business; GET passes `?businessId=X` from `activeBusiness?.id`; POST stores it; queryKey includes it for cache isolation
- Auto-migration: on first GET when no entries exist, if `ownerPersonalInvestment > 0` in settings, creates a single "Initial investment" entry scoped to the requested businessId
- DB migration lives in `lib/db/migrations/0037_owner_capital_entries.sql`
- drizzle-kit push requires interactive TTY — cannot be scripted with piped stdin; use raw `psql "$DATABASE_URL" -c "..."` for one-off DB ops
