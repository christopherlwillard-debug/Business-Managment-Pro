---
name: Orval js-yaml compatibility
description: Why the workspace dependency override must keep Orval on the secure js-yaml 4.x API.
---

Keep the workspace `js-yaml` override within the secure 4.x line rather than using an open-ended minimum that can resolve to 5.x.

**Why:** Orval imports the 4.x default export. A global override that resolves its dependency to 5.x makes API code generation fail before the OpenAPI configuration is loaded.

**How to apply:** When updating dependency security overrides, preserve Orval's major-version compatibility and run API code generation plus library typechecks after changing the override.