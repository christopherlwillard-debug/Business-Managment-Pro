---
name: Job-profit response contract
description: Durable rule for preventing stale API/UI profit pairs from showing misleading numbers
---

Canonical job-profit response shapes must carry a monotonically reviewed response version, and every financial UI consumer must reject a missing or unsupported version as unavailable.

**Why:** A deployed API and frontend can be updated independently. Without an explicit wire marker, an older client can render a response whose arithmetic no longer matches the current canonical engine and present it as a current financial result.

**How to apply:** Bump the marker when the canonical response semantics change, update OpenAPI/codegen together, and preserve the existing unavailable/error state rather than falling back to stale or locally recomputed values.

A response version is a compatibility guard, not proof that a displayed profit is correct. When an anomalous value persists, trace source records → canonical engine → API payload → client state/cache → displayed row → aggregate before naming the root cause or changing financial data.

**Why:** A versioned API can still be bypassed by a wrong route, key, cache, assignment, legacy calculation, or aggregate path; the exact point where the number changes must be demonstrated.

**How to apply:** Treat stale deployment or mismatched arithmetic as a hypothesis until the full value path is observed for the affected jobs.