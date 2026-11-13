---
name: Browser validation contention
description: Interpreting browser checks that fail only during task completion validation
---

The task-completion validator can run multiple browser E2E commands concurrently against the shared local app and development database. Navigation timeouts or missing rendered controls during that grouped run may be caused by contention, even when the same checks pass individually.

**Why:** The subcontractor-payables task's API tests and four Chromium E2E checks passed when run separately, while grouped validation repeatedly timed out during initial navigation or rendering.

**How to apply:** When grouped browser validation fails, inspect its exact logs and rerun each failed browser command by itself before changing product code. Do not skip validation without the user's approval.
