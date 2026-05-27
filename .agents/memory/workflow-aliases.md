---
name: Workflow aliases
description: The "Contractor App" workflow is a legacy entry that always fails. Always use the named artifact workflows instead.
---

**Always use:**
- `artifacts/contractor-app: web` — React/Vite frontend
- `artifacts/api-server: API Server` — Express/tsx backend

**Never use:**
- `Contractor App` — legacy, always fails with PORT env error, ignore it

**Why:** The legacy workflow was the original before the monorepo restructure. It's still registered but points to a path/config that no longer works.
