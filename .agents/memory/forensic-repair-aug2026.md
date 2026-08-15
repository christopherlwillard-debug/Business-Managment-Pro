---
name: Forensic accounting repair — Aug 2026
description: Six-area P&L/Reserve/Mileage/OwnerPay forensic repair — code done, mileage data corrections staged for production
---

## Summary
Forensic repair of live production accounting completed in code (Aug 2026). No production data writes occurred except the pre-existing mileage-2026-recalc (which was run to update rate amounts in Jun/Jul MileIQ import rows).

## Code fixes (all in dev, deploy to take effect)
1. **Mileage filter**: `isNull(mileageLogsTable.subcontractorId)` added to every mileage deduction query in `reports.ts` (6+ locations) and `tax-reports.ts`. Owner deduction = $4,112.45 (down from $7,057–$7,141 which included sub portal mileage).
2. **P&L bucket**: allocation sub payments → `contractLabor` bucket (was `cogs`). James Willard's $9,628.47 now displays as Contract Labor not fake Materials/COGS.
3. **Reserve expense base**: `sub_payment_records` fixed/allocation query added to reserve route `Promise.all` (`brSubPayRows`). Reserve net profit now matches Accounting.
4. **Owner Pay withdrawal ledger**: changed from `owner_capital_entries WHERE amount < 0` (0 rows) to `expenses WHERE category IN ('Owner Draw','Owner Compensation','Owner Withdrawal')` ($8,418.64, 9 rows).
5. **Schedule C**: `isNull(subcontractorId)` also added to `tax-reports.ts` Line 9 mileage query.

## Mileage data corrections (STAGED, not yet written to production)
Three manual mileage entries approved by owner for correction:
- id=1, Feb: 110.00 mi → 111.1 mi, $79.75 → $80.55
- id=2, Mar: 327.00 mi → 276.7 mi, $237.08 → $200.61 (data-entry error confirmed by owner)
- id=7, May: 929.00 mi → 929.7 mi, $673.53 → $674.03

Migration endpoint: `POST /api/admin/migrations/mileage-manual-corrections-aug2026` (in admin-migrations.ts, idempotent).
**Call this on production after next publish using x-migration-key header.**

## Dev vs Production database
- Dev DATABASE_URL = `postgresql://postgres:password@helium/heliumdb` (empty, no business data)
- Production DATABASE_URL = separate managed DB (accessible read-only via executeSql { environment: "production" })
- Dev API server CANNOT write to production database; must publish to get migration endpoints deployed
- REPLIT_ENVIRONMENT=production in workspace env is a Replit flag, not a DB selector

## Before/After key numbers
| Metric | Before | After |
|--------|--------|-------|
| Owner mileage deduction | ~$7,057–$7,141 | $4,077.09 (post data corrections) |
| P&L COGS | $9,628.47 | $0 |
| P&L Contract Labor | $6,677.50 | $16,305.97 |
| Reserve net profit | +$4,581.30 | −$2,067 (approx) |
| Accounting net profit | −$5,047.17 | −$2,067 (approx) |
| SE tax | $647.32 (Reserve) | $0 |
| Owner Pay Withdrawn | $0 | $8,418.64 |

## IRS 2026 mileage rates (confirmed in irs-rates.ts)
- H1 Jan-Jun: $0.725/mile
- H2 Jul-Dec: $0.760/mile

## Unresolved owner/accountant decisions
1. Trailer business-use %: `business_use_pct` column doesn't exist in production schema. Defaults to 100%.
2. James Willard $9,628.47: tax classification (deductible sub vs. owner distribution) — owner + accountant to decide.

## Sub mileage (intact, excluded)
- James Willard (sub_id=1): 53 trips, 3,925 mi, $2,845.75 — sub-portal job tracking, NOT owner deduction
- Dewayne Lamb (sub_id=6): 2 trips, 252 mi, $182.70 — sub-portal job tracking, NOT owner deduction
