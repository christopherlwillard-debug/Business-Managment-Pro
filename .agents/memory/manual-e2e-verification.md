---
name: Authenticated browser test safety
description: Security boundary for authenticated regressions that must not expose owner access or mutate business data
---

# Authenticated browser test safety

Authenticated regression helpers must not turn development previews into public owner-session minting endpoints. Require a short-lived, signed, single-use proof for test-session creation and keep the route absent from production.

**Why:** development previews can be reachable by other people, and an unauthenticated owner-session fixture bypasses the application's real access boundary. Intercepting only the expected mutation is also insufficient because future page behavior may add unrelated writes.

**How to apply:** derive test-login proofs from an environment secret without logging it; validate redirect paths against protocol-relative and backslash forms; consume proofs once; intercept fixture reads; deny every unexpected API write; remove the temporary session directly during cleanup. On the Jobs page, scheduled cards use the compact “Open Job Card” flow while completed payment sections render the full card directly; select the smallest matching payment card when titles also appear in the planner. When allowing fixture CRUD, wait for the in-process fixture state to change before deriving expected values, and pass Node-side values explicitly into `page.waitForFunction` predicates.
