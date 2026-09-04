---
name: Dashboard WTD semantics
description: Calendar definition used by the Business Health dashboard's WTD period
---

The Business Health dashboard defines WTD as Monday through the report's current date.

**Why:** A trailing seven-day range can cross a month boundary and show WTD expenses greater than MTD expenses, making the period comparison misleading.

**How to apply:** Preserve the Monday-start calendar-week meaning when extending dashboard period filters or explaining WTD totals. Keep the existing invoice, expense, subcontractor-pay, and cash-basis sources unchanged.