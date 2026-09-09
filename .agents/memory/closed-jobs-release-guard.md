---
name: Closed Jobs release guard
description: Published frontend bundles and API routes need an explicit parity check after financial-flow changes
---

The canonical Closed Jobs release check must validate three layers independently: source markers, emitted Vite JavaScript chunks (including lazy-loaded Jobs chunks), and live API route presence.

**Why:** A published build once served an older Closed Jobs flow even though the workspace source and API route definitions were current. Source-only checks could not detect that deployment drift.

**How to apply:** Treat HTTP 401/403 from authenticated GET probes as route presence, but fail on 404/405 or 5xx. Keep probes read-only and never use production data mutations to verify a release.