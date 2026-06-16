---
name: Owner Capital Ledger
description: DB table, API route, and UI for tracking capital injections/withdrawals in the accounting Overview tab
---

## Rule
`owner_capital_entries` table replaces the old `ownerPersonalInvestment` single-value setting.

**Why:** Single value couldn't track individual capital events over time; ledger approach gives full history.

**How to apply:**
- The equity formula is: `netCapitalInvested + netProfit - ownerDraws = businessOwesYou`
  - `netCapitalInvested = Σ(positive entries) - Σ(abs negative entries)`
- Migration is handled in the GET /api/owner-capital endpoint: if no entries exist and `ownerPersonalInvestment > 0`, auto-inserts one "Initial investment" entry
- `ownerPersonalInvestment` in settings.calculatorDefaults is kept but no longer used by the UI after migration
- DB table was created via raw psql (drizzle-kit push requires interactive TTY and can't be scripted with piped input)
- Amount sign convention: positive = injection (money put in), negative = withdrawal (capital returned)
