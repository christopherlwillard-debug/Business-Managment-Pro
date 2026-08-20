---
name: Client mileage surcharge
description: Client-specific route surcharge rules are invoice-only and must not enter the MileIQ mileage or expense ledgers.
---

The surcharge rule belongs on the client, qualification comes from the existing RoutingEngine-backed route-distance endpoint, and accepted charges are deterministic invoice line items. Keep opt-in explicit and preserve an existing surcharge line rather than appending duplicates.

**Why:** Mileage remains MileIQ's source of truth; putting surcharge charges in mileage or expenses would create a parallel financial path and risk double counting.

**How to apply:** Reuse the client settings and route-distance response for future changes. Only draft invoice line items may carry an accepted surcharge, and declining the prompt must leave the invoice untouched.