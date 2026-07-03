---
name: Testing subagent stale block
description: runTest e2e agent is blocked by a stale infra flag in this project; how it manifests and what to do instead
---

The `runTest` testing subagent refuses to run in this project: it errors immediately with "Testing was blocked earlier: ... missing CLERK_SECRET_KEY" even though the app uses Replit Auth, not Clerk. The block is a cached flag from an old failed run, not a real condition.

**Why:** A prior test run failed at a Clerk-auth step and the platform persisted the blockage; subsequent calls short-circuit before the test plan is even read.

**How to apply:** Don't retry `runTest` expecting a different result. Verify UI changes via architect review + static screenshots + unit tests instead. Useful context if it ever unblocks: owner login sub for OIDC test claims is the `settings.owner_user_id` row (query dev DB), any other sub lands on a "pending access" screen.
