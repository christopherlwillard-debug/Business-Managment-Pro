# Banking File-as-Expense Authentication Repair

## Problem

The Banking page can remain visibly signed in while `POST /api/plaid/transactions/:txnId/file-as-expense` returns `401 Unauthorized`. The request is rejected by the Plaid router's owner authentication middleware before validation or financial writes occur.

## Existing boundaries

- `bank_transactions` remains the imported bank-feed and reconciliation source.
- `expenses` remains the accounting source of truth.
- The existing endpoint atomically creates one expense and marks the bank transaction matched.
- Owner-only authorization remains mandatory.
- Expense amounts, categories, job-profit behavior, business ownership, reports, and calculations do not change.

## Design

1. Use a Banking API error type that retains the HTTP status.
2. When filing returns `401`, check `/api/auth/user` with `credentials: "include"` and `cache: "no-store"`. The server auth response must also carry `Cache-Control: no-store`.
3. Treat only a definitive response with `user: null` as an expired/invalid session. A network/CORS failure remains an error, not proof that the session expired.
4. Before re-entering login, save only the pending drawer fields and transaction ID in `sessionStorage`. Key the draft to that transaction and remove it after a successful filing or explicit drawer cancellation.
5. Redirect through the existing `/api/login?returnTo=<encoded current Banking URL>` route. On return, restore the draft only when the transaction ID still matches the selected bank row. Never auto-submit it.
6. If `/api/auth/user` reports a user while Plaid returns `401`, retain the drawer and show an authentication-mismatch message. The server must log a non-sensitive diagnostic containing booleans for cookie/session/user/owner availability and whether the request origin is expected, without logging cookies, session IDs, user IDs, or owner IDs.
7. Serialize filing inside the existing database transaction by locking the target bank row before checking its status. A concurrent loser receives `409`; rollback leaves neither an expense nor a match.
8. Bank rows are intentionally shared reconciliation anchors rather than business-owned ledger rows. The selected business owns the newly created expense. A supplied job must belong to that same business.
9. Add focused coverage proving:
   - a missing session returns `401`;
   - an authenticated non-owner returns `403`;
   - an authenticated owner creates exactly one expense;
   - concurrent submissions create one expense and one `409`;
   - amount/date are copied exactly from the bank row;
   - business ownership is assigned from the selected business;
   - a cross-business job is rejected without writes;
   - validation, auth, conflict, and forced rollback failures leave no expense or match;
   - the bank transaction is atomically marked matched to the created expense.

## Error handling

- `401`: re-check auth without cache and re-enter login only when the check definitively reports no user.
- `403`: retain the existing owner-only error.
- Auth check network failure or authenticated-user/ Plaid-`401` mismatch: retain the drawer and show a specific error.
- Validation/conflict errors: retain the existing server message.
- No successful UI state or cache invalidation occurs until the server returns success.

## Verification

- Focused Banking/Plaid route tests.
- A frontend regression test for `401` auth recheck, draft persistence, no automatic replay, and manual resubmission.
- A production-like same-origin cookie test proving the authenticated request reaches the owner guard.
- Contractor app typecheck and tests.
- API typecheck.
- Production build and diff check.
- Restart the managed frontend and API workflows and confirm clean startup logs.