---
name: Puppeteer evaluate functions
description: Environment-specific constraint when injecting browser helpers from tsx-run TypeScript scripts
---

Avoid named or property-assigned function expressions inside callbacks serialized by Puppeteer's `page.evaluate` or `page.evaluateOnNewDocument` when the script runs through tsx. The transpiler can emit an internal `__name` helper that is not defined in the browser context. Anonymous functions avoid that serialization failure.

**Why:** The failure only appears at browser runtime, after the server and TypeScript checks pass, and can hide the actual behavior being tested.

**How to apply:** Keep evaluated callbacks browser-self-contained and use anonymous functions for injected prototype/property hooks. Prefer native DOM setters and events for controlled inputs; date inputs sanitize impossible calendar literals, so test their user-visible invalid/incomplete state instead.