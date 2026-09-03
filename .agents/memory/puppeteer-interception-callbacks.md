---
name: Puppeteer interception callbacks
description: Constraints for reliable TypeScript Puppeteer browser checks in this workspace
---

Puppeteer serializes page evaluation callbacks into the browser. Avoid nested helper functions inside callbacks because the TypeScript transform can leave runtime-only helper references behind. Cross-origin responses supplied through request interception also need explicit CORS headers, and date inputs are more reliable when set with the native value setter followed by input/change events.

**Why:** A browser check can fail before it reaches the product behavior when the test harness relies on Node-only callback details, segmented date-input typing, or opaque cross-origin fixture responses.

**How to apply:** Keep browser callbacks direct and self-contained, add `Access-Control-Allow-Origin` to intercepted external responses, and use native setters for date controls.