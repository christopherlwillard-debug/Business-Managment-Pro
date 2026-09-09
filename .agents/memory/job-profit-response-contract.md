---
name: Job-profit response contract
description: Durable rule for preventing stale API/UI profit pairs from showing misleading numbers
---

Canonical job-profit response shapes must carry a monotonically reviewed response version, and every financial UI consumer must reject a missing or unsupported version as unavailable.

**Why:** A deployed API and frontend can be updated independently. Without an explicit wire marker, an older client can render a response whose arithmetic no longer matches the current canonical engine and present it as a current financial result.

**How to apply:** Bump the marker when the canonical response semantics change, update OpenAPI/codegen together, and preserve the existing unavailable/error state rather than falling back to stale or locally recomputed values.