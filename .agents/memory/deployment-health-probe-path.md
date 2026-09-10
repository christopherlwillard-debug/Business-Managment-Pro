---
name: API publish health probe path
description: Observed autoscale API promotion behavior when artifact startup health paths are configured.
---

Autoscale promotion has been observed probing the API artifact service path `/api` and treating its response as the readiness result, even when the artifact declares `/api/healthz` as the startup path. A failed probe cancels promotion and leaves the previously deployed version serving production traffic.

**Why:** A publish attempt logged repeated `healthcheck /api returned status 500` while the new process was starting, then only logged `Server listening`; official deployment guidance says failed autoscale health checks cancel promotion and retain the previous version. Making the service mount point return the lightweight health response keeps promotion robust if the platform ignores the custom path.

**How to apply:** Keep `/api/healthz` as the explicit health endpoint, but ensure `/api` is also a public, dependency-free 200 response for API artifacts using `/api` as their service path. When live code contradicts the current bundle after publishing, inspect promotion logs before assuming a separate deployment or stale database.