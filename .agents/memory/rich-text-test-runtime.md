---
name: Rich-text test runtime
description: Why Text Block sanitizer tests use a DOM-backed Vitest environment
---

The Text Block sanitizer intentionally uses `DOMParser` when running in the browser, so formatting and unsafe-markup tests must run under a DOM-backed Vitest environment rather than plain Node.

**Why:** Plain Node has no `DOMParser` and would exercise only the sanitizer's legacy plain-text fallback, leaving browser formatting regressions untested.

**How to apply:** Keep rich-text tests in the DOM-backed environment and assert the production sanitizer output, including tag normalization, link filtering, and line-break behavior.