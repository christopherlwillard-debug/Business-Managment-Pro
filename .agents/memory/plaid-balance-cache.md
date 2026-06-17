---
name: Plaid balance cache TTL
description: The balance cache was 30 days; reduced to 1 hour. Sync also refreshes balance.
---

## Rule
Plaid balance cache TTL is **1 hour** (`ONE_HOUR_MS = 60 * 60 * 1000`).
The `/sync` route also fetches and caches the live balance at end of each sync.
Banking.tsx sync mutation must invalidate `["plaid-balance"]` query after sync completes.

**Why:** Balance was showing as-of Jun 11 (6 days stale) because the cache was 30 days.
The sync button only synced transactions, not balance.

**How to apply:** If balance caching logic is revisited, keep TTL ≤ 1 hour.
Always invalidate `["plaid-balance"]` in any mutation that could change the real balance.
