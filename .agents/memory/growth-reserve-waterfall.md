---
name: Growth Reserve waterfall
description: Confirmed basis and deduction order for job payout calculations.
---

Growth Reserve uses the configured percentage of the amount remaining after split-eligible job expenses. Non-allocation worker obligations are deducted after Growth Reserve and before percentage shares.

**Why:** The user explicitly confirmed the required order is revenue → expenses → Growth Reserve → hourly/fixed subcontractor obligations → split → tax withheld from the owner share. Waiting for a fixed worker's payment row understated the obligation and overstated every percentage share.

**How to apply:** Keep this order consistent across Job Financials, Job Payroll, allocation payouts, and accounting summaries. Use the agreed fixed assignment amount before payment; use fixed payment rows only as a compatibility fallback so payment does not double-count labor. Every displayed Job Cost reduces the percentage split pool.