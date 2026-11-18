# BuildPro SMTP Credential Response Remediation Plan

**Status:** Response redaction implemented and verified in development. Storage-at-rest hardening and any credential rotation remain separate and unperformed.
**Prepared:** 2026-11-18
**Relationship to Phase 3C:** Separate security work. Do not fold SMTP remediation into Settings simplification.

## Objective

Prevent the saved SMTP password from being serialized to any browser response while preserving existing invoice-email behavior and the current rule that a blank password update retains the saved value.

## Verified source findings

- The settings formatter spreads the database row and does not remove `smtpPass`; its comment claiming omission does not match the implementation.
- The settings API is behind authentication and approved-access checks. Its `requireOwnerForWrites` wrapper allows reads by approved staff and limits write methods to the owner.
- The owner GET and PUT responses return the formatted object. The non-owner GET response removes several named fields but not `smtpPass`.
- The owner-only Settings screen does not need the saved password value. The shared settings query is used by other pages and receives the API response.
- A non-empty submitted password replaces the saved value. A blank or omitted password preserves the existing value.
- The inspected settings update path writes the SMTP password directly to a text column; no application-level SMTP encryption/decryption was found in that path. Database/platform encryption was not assessed.
- Invoice and reminder email error paths log exception objects. Whether provider exceptions contain credentials was not established.
- No focused settings-route test was found for owner/staff reads or owner update responses.
- Whether a password is currently configured and whether the vulnerable source is deployed are unknown. No actual credential, database row, authenticated API response, or runtime log was accessed.

## Recommended remediation approach

Use one explicit, allowlisted settings response shape for every settings response path, including GET and successful update responses. Do not serialize database rows directly. Return a non-secret `smtpConfigured` boolean only if the UI or another consumer needs it; never return the password, encrypted or otherwise.

This is safer than removing `smtpPass` separately in individual response branches because future response paths are less likely to accidentally re-expose it. Keep password persistence and email delivery behavior unchanged in this first containment step.

## Proposed implementation sequence

### 1. Contain response exposure

- Replace broad row spreading with an explicit client-safe settings response projection.
- Apply the same projection to owner and approved-staff GET responses and owner PUT responses.
- Keep owner-only write authorization and existing access checks unchanged.
- Preserve blank/omitted-password behavior; do not clear or replace the saved password when the submitted field is blank.
- Do not put password values in the frontend response type, UI state, logs, error text, screenshots, or test output.

### 2. Add focused regression coverage

Use synthetic sentinel values only; never use or print a real SMTP credential.

- Owner GET response does not contain `smtpPass` or the sentinel.
- Approved non-owner GET response does not contain `smtpPass` or the sentinel.
- Owner PUT response does not contain `smtpPass` or the sentinel after a synthetic password update.
- Non-owner PUT remains denied.
- Empty and omitted password inputs preserve the existing stored value.
- A new password can still be used by the server email sender without being returned to the browser.
- Shared response construction is covered so adding a new settings route cannot silently reintroduce the field.

### 3. Review storage and error handling separately

- Determine whether to encrypt the stored SMTP credential using an already-supported, properly keyed credential facility or another approved secret-storage approach. Confirm key management and a reversible legacy-data migration before implementation; do not assume the existing generic credential helper is a drop-in replacement.
- Sanitize provider exceptions before logging or returning them. Test with synthetic errors containing a sentinel credential and assert that the sentinel is absent.
- Keep any encryption migration, failure recovery, and log changes out of the initial response-containment change unless they are separately scoped and approved.

### 4. Assess exposure and response

- Establish, through a controlled owner-only procedure that reveals only configured/not-configured status, whether SMTP is configured. Do not call the vulnerable response path to learn this.
- Establish whether the vulnerable server version was deployed during any period in which an SMTP password could have been configured. Deployment status was not checked in this investigation.
- If a password was configured during an exposure window, assess and authorize provider-side rotation. Update BuildPro through a trusted owner-controlled path after containment; do not send the credential in chat or logs.
- Do not query production or rotate credentials as part of this plan. Either action requires its own authorization and safeguards.

## Verification and release gates

1. Focused API regression tests pass for owner GET, staff GET, owner PUT, non-owner write denial, and blank-password preservation.
2. Synthetic sentinel tests prove no password value appears in API bodies, browser-facing types, logs, or user-facing error messages.
3. Email delivery tests confirm server-side SMTP still uses the configured value without returning it.
4. Relevant Settings and invoice-email tests pass; report pre-existing failures separately.
5. Development verification does not call the live settings GET route, which can create a default row or perform legacy quick-link encryption.
6. Production credential-status assessment and any rotation are recorded separately without exposing values.
7. No production deployment occurs without separate approval.

## Out of scope

- Phase 3C tab grouping, All Businesses wording, or Production Billing behavior.
- Changes to invoice numbering, accounting, payment behavior, or email delivery semantics.
- Production database queries or writes, credential rotation, or deployment.
- Broader secret scanning or unrelated integration credential redesign.

## Approval boundary

The response-redaction implementation was separately authorized and is recorded below. This document does not authorize credential access, database changes, provider-side rotation, or deployment. The All Businesses policy approval for Phase 3C did not approve this SMTP work.

## Completion record

- Replaced database-row spreading in the settings formatter with an explicit safe response allowlist. The password is excluded from owner GET, approved-staff GET, and owner PUT responses; the non-secret owner `smtpConfigured` status remains available.
- Preserved the existing update path: blank passwords retain the stored value, while a supplied password is still saved for server-side SMTP use. The response does not echo either value.
- Removed unused SMTP password/status state from the Settings page; the frontend does not consume or need the password.
- Source search found no other API response path directly references `smtpPass`. Other settings-table reads inspected use selected fields or server-side data; the settings formatter was the response path that spread the full record.
- **Verification:** focused settings security tests PASS (5); API server tests PASS (132 files, 1,550 tests); API server typecheck PASS; contractor-app typecheck PASS. The API suite emitted a non-blocking missing `node-cron` sourcemap warning.
- **Not verified:** no real SMTP credentials or email send were used; production credential presence and deployment status remain unknown. Existing invoice-email tests cover rendering, not a live SMTP transport.
- **Additional finding:** the inspected settings update path stores the SMTP password directly in a database text column; application-level encryption was not found in that path. Provider-exception logging may include sensitive diagnostics, but password exposure in logs was not confirmed. Both are separate follow-up reviews, not changes made here.
- Restarting the development API ran its existing startup reconciliation, which corrected two development subcontractor-payment status values (one paid-to-overpaid and one overpaid-to-paid). This was unrelated to SMTP. No production records were modified.
- No production records or credentials were accessed or changed, no credential rotation occurred, and no deployment was performed.
