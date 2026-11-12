# SMTP Credential Exposure Security Review

**Review date:** 2026-11-12  
**Review type:** Read-only source, configuration-name, and scoped Git-history audit  
**Overall result:** **Potential Exposure — High severity**

## Executive summary

BuildPro's current settings API appears to include the saved SMTP password in its JSON response. The settings formatter spreads the database row, while the non-owner response removes several sensitive fields but not `smtpPass`. Reads are allowed for any authenticated, approved account member. The owner response also uses the unfiltered object. Because application screens call the shared settings query, the field is delivered to the browser even though the settings form does not need to display the saved password.

This is a confirmed source-level response-construction flaw, conditional on an SMTP password being configured. I did **not** read the database value, query the settings endpoint with an authenticated account, or verify whether the vulnerable source is deployed or whether a password is currently configured. No actual credential value was viewed or recorded.

No SMTP credential literal was found in the scoped source-history search, and no tracked `.env`/SMTP secret file was found in the repository history examined. Runtime logs and production settings were not accessed. The code does log raw email exceptions, so log exposure remains inconclusive.

## Scope and safety limits

Reviewed:

- SMTP settings persistence, serialization, update, and owner/write checks.
- Invoice email delivery through Nodemailer and the Gmail connector fallback.
- Frontend settings-query usage and SMTP form state.
- Environment secret **names/existence only**; no secret values were requested or read.
- Tracked deployment/configuration filenames and SMTP-specific references.
- Git history for six SMTP/settings/email source files (146 revisions) and history paths for environment/SMTP configuration files.
- Source-level API error and logging behavior.

Not reviewed:

- Production database values, published deployment version, or production access logs.
- Live authenticated staff responses. Reading the settings response could expose a real credential, so no such request was made.
- Runtime logs. No tracked application log files were present; raw workflow logs were not opened because they can contain credentials.
- Full-repository, all-history secret scanning outside the SMTP/settings-focused scope.

No code, credentials, database records, deployment configuration, or Git history were changed. No email was sent.

## Findings

### F1 — SMTP password may be returned to approved staff and the owner browser

- **Classification:** Potential Exposure
- **Severity:** **High**
- **Evidence:**
  - `lib/db/src/schema/settings.ts:29-34` defines `smtpPass` as the `smtp_pass` text column.
  - `artifacts/api-server/src/routes/settings.ts:312-330` formats settings using `...s`. The comment says `smtpPass` is omitted, but no explicit omission occurs.
  - `artifacts/api-server/src/routes/settings.ts:365-393` sends that formatted object to the owner. For non-owners, the destructuring at line 389 removes `smtpHost`, `smtpPort`, `smtpUser`, and other fields, but does **not** remove `smtpPass`; the remaining object is returned at line 390.
  - `artifacts/api-server/src/routes/index.ts:269-270,293` mounts settings after global authentication and access approval. `requireOwnerForWrites` allows non-write methods through; therefore approved staff can GET settings. Unauthenticated requests are rejected by `requireAuth`.
  - `artifacts/api-server/src/routes/settings.ts:484-488` stores a supplied SMTP password directly in the settings row. The update response also returns `format(settings)` to the owner.
  - `artifacts/contractor-app/src/pages/Settings.tsx` and other screens use the shared `useGetSettings` query. The browser receives the full JSON payload; a generated TypeScript shape that omits `smtpPass` would not remove an extra property at runtime.
  - `artifacts/api-server/src/lib/invoiceEmail.ts:247-255` uses this stored value for SMTP authentication.
- **Potential impact:** An approved non-owner could read the SMTP credential from the settings API response and use it outside BuildPro, subject to the mail provider's restrictions. The credential is also present in the owner browser response, unnecessarily expanding its exposure to browser memory and same-origin scripts.
- **Uncertainty:** Whether a non-null password exists, whether any non-owner requested this response, and whether this source version is deployed were not checked.
- **Recommended next action:** Remove secret fields from every settings response using an explicit safe response shape; return only a boolean such as `smtpConfigured`. Add a regression test proving both owner and non-owner JSON responses omit `smtpPass`. If SMTP was configured while non-owner access was possible, treat the credential as potentially compromised and rotate it through the mail provider, then update BuildPro after the response fix. Do not send the credential in chat.

### F2 — SMTP password is stored in the application database, without application-level encryption in the inspected path

- **Classification:** Potential Exposure
- **Severity:** Medium
- **Evidence:** The schema uses a text column and the settings update route assigns the submitted password directly to that column. No SMTP-specific encrypt/decrypt operation appeared in the inspected settings or mail-delivery path. This differs from the contractor portal quick-link credentials, which have a separate encryption/redaction path in the same settings module.
- **Potential impact:** A database read, database export, or backup with access to this row could include the mail credential. Platform-level storage encryption and backup access controls were not assessed.
- **Recommended next action:** After fixing response serialization and assessing rotation, use vetted application-level encryption at rest with key separation, or a managed secret store that preserves the app's owner/business scope. Preserve owner-only update controls and never return the secret after a save.

### F3 — Email delivery errors are logged and partially returned without SMTP-specific redaction

- **Classification:** Inconclusive
- **Severity:** Low
- **Evidence:** `artifacts/api-server/src/routes/invoices.ts:1406-1408` logs the caught error object and returns `err.message`. `artifacts/api-server/src/jobs/invoiceReminders.ts:176-181` logs caught error objects. No source statement explicitly logs `smtpPass`, and the Gmail connector helper returns a generic provider-rejected error. However, provider error contents and runtime logs were not inspected.
- **Potential impact:** Provider diagnostics may include account, host, command, or response details. The source review did not establish that a password is included.
- **Recommended next action:** Convert SMTP failures to stable user-facing messages and log a sanitized error code/category rather than the complete provider exception. Verify with synthetic errors containing a sentinel password, not a real credential.

### F4 — Unauthenticated access is blocked; approved staff reads are not owner-restricted

- **Classification:** Potential Exposure for approved non-owners; No Exposure Found for unauthenticated access
- **Severity:** High for the response leak in F1; Informational for the unauthenticated boundary
- **Evidence:** The API applies `requireAuth` and `requireAccess` before protected routes; `/settings` is additionally wrapped in `requireOwnerForWrites`. This blocks writes by non-owners but intentionally allows GET. A prior non-mutating development check returned 401 for an unauthenticated `/api/settings` request. No authenticated staff request was made.
- **Conclusion:** Anonymous users are not shown to have a path to these settings. Any approved non-owner can read the response, which is enough to trigger F1 if a password is configured. Non-owner updates are blocked by the write middleware.
- **Recommended next action:** Keep authentication and owner-only writes. Treat SMTP credentials as owner-only secret material even on read paths.

### F5 — No SMTP credential literal found in the scoped Git-history review

- **Classification:** No Exposure Found (within the searched scope)
- **Severity:** Informational
- **Evidence:** The scoped scanner inspected 146 revisions of the SMTP/settings/email source files and found zero literal assignments to SMTP password keys. The repository history search found no tracked `.env`/SMTP credential file paths. SMTP-related history contains application source and schema changes, including the initial email-feature work; no credential values were printed or copied.
- **Limit:** This is not a full secret scan of every blob in every historical ref. The SMTP password column is database-backed, so the absence of a committed literal does not rule out F1 or a database exposure.
- **Recommended next action:** If a broader historical-secret assurance is required, run the approved repository-wide secret scanner in a mode that reports file/commit locations without revealing matched values. Do not rewrite Git history unless a credential literal is actually confirmed and the repository owner approves the recovery plan.

### F6 — No SMTP-specific Replit secret name was found

- **Classification:** No Exposure Found in the inspected secret-name inventory
- **Severity:** Informational
- **Evidence:** The secret inventory showed 13 secret names; none contained `smtp`, `mail`, or `email`. Secret values were not accessed. SMTP configuration is stored in the settings database row in the inspected application path. The Gmail sender uses the Replit connector proxy rather than a source-stored OAuth token. No SMTP-specific credential reference was found in the inspected `.replit`, `replit.nix`, or artifact manifests. Documentation search found field names and this audit finding, not credential values.
- **Limit:** Secret-name inspection does not establish the contents of unrelated variables or any production-specific configuration.

## Files and systems reviewed

- `artifacts/api-server/src/routes/settings.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/routes/guards.ts` (authorization model)
- `artifacts/api-server/src/lib/invoiceEmail.ts`
- `artifacts/api-server/src/lib/sendEmail.ts`
- `artifacts/api-server/src/jobs/invoiceReminders.ts`
- `artifacts/api-server/src/routes/invoices.ts`
- `artifacts/contractor-app/src/pages/Settings.tsx`
- `lib/db/src/schema/settings.ts`
- `.replit`, `replit.nix`, artifact manifests, and tracked environment/deployment filenames
- Replit secret-name inventory (names/existence only)
- Relevant Git history for SMTP/settings/email implementation files

## Credential rotation recommendation

**Recommended conditionally, and treat as urgent if SMTP is configured:** if an SMTP password was saved while any non-owner had approved access, or if the vulnerable source has been deployed with a non-null SMTP password, rotate the password with the mail provider. First contain the response leak, then update the stored value through a trusted owner-controlled path and verify the API never returns it. Revoke any provider app-password or token that can be replaced. The current credential state and deployment status were not checked, so this review does not claim that a credential was actually retrieved.

## Task #2558 and next action

Task #2558 is listed as **Keep saved email credentials out of staff settings responses** and is already accepted. Its recommended next action is:

1. Fix the settings GET and owner update response so neither serializes `smtpPass`.
2. Add regression tests for owner and approved non-owner responses, including update responses.
3. Sanitize SMTP exception logging and client-visible errors.
4. Determine out of band whether production had a configured SMTP password and whether non-owner access was possible; rotate if so.
5. Recheck the settings response and access boundary after the fix without printing or storing secret values.

The accepted task record could not be edited from this audit session; this report records the findings and next action. No remediation or credential rotation was performed.
