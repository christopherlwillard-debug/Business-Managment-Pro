---
name: Authenticated browser test safety
description: Security boundary for authenticated regressions that must not expose owner access or mutate business data
---

# Authenticated browser test safety

Authenticated regression helpers must not turn development previews into public owner-session minting endpoints. Require a short-lived, signed, single-use proof for test-session creation and keep the route absent from production.

**Why:** development previews can be reachable by other people, and an unauthenticated owner-session fixture bypasses the application's real access boundary. Intercepting only the expected mutation is also insufficient because future page behavior may add unrelated writes.

**How to apply:** derive test-login proofs from an environment secret without logging it; validate redirect paths against protocol-relative and backslash forms; consume proofs once; intercept fixture reads; deny every unexpected API write; remove the temporary session directly during cleanup. Keep Jobs verifiers coupled to compact-row/workspace semantics (prefer test IDs and scoped labels over obsolete button copy), because a stale selector can fail before exercising the intended action. When allowing fixture CRUD, wait for the in-process fixture state to change before deriving expected values, pass Node-side values explicitly into `page.waitForFunction` predicates, and use unique fixture titles. Browser-context helpers must avoid nested named callbacks that tsx may serialize with a missing `__name`; wait for a populated control before reading a panel whose data loads asynchronously. Scope modal actions to the modal instead of broad text matches against the underlying page, use the real business switcher to clear a selected context, and discover dependent records by fixture identity in `finally` before deleting parent rows. After a mutation, wait for the refreshed source-of-truth text as well as the success toast before asserting the result; UI notifications can render before query invalidation completes.

For Jobs close eligibility, verify the active workspace path rather than only an API result or a legacy full-card button. A ledger-correct response did not make the Close Job action reachable in the currently used workspace until that surface used the same gate. In a browser fixture, first open the compact row and select the JOB tab; assert the action in that workspace and again after reload, with a still-unpaid control job. **Why:** an older browser script looked for obsolete card labels and could not reach the current UI, while the backend checks passed. **How to apply:** scope selectors to the selected workspace and deny browser writes while exercising read-only eligibility.

When bundled Puppeteer Chrome fails to launch because system libraries are missing, use the Nix-provided Chromium executable through `PUPPETEER_EXECUTABLE_PATH`; the system browser launched successfully in this environment. **Why:** the downloaded browser binary is not guaranteed to match the runtime libraries available in the workspace. **How to apply:** try the system Chromium before abandoning authenticated visual verification.
