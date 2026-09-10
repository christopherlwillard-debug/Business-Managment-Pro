---
name: Client business scope
description: Durable ownership rule for client list/profile reads during legacy migration
---

Scoped client reads match canonical business_id first and include legacy rows only when business_id is null and business_line matches the selected business; profile child records must follow the same ownership boundary where columns exist.

**Why:** Clients were migrated from slug-based ownership to canonical IDs, and global ID reads could make a valid client appear missing or expose records from another business.

**How to apply:** Send the active business ID through list/profile reads, keep the legacy fallback during migration, and describe a scoped 404 as unavailable in the selected business rather than as a globally missing client.

For legacy related tables whose Drizzle model is ahead of production, use explicit profile projections that omit unavailable ownership columns. The already-authorized client foreign key remains the scope boundary until the normal Publish schema path adds those columns.