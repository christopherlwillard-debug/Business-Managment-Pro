# BuildPro SMTP Security Remediation Implementation Plan

**Prepared:** 2026-11-18  
**Status:** Planning only — implementation is not authorized  
**Source:** `docs/smtp-storage-and-logging-security-audit-2026-11-18.md`

## Executive summary

The audit confirmed application-level plaintext storage of the SMTP password and unsafe paths for raw SMTP/provider errors to reach logs, API responses, and invoice communication records. It also found that the invoice communication-history endpoint is behind authentication and the invoice-section guard, while its cross-business authorization behavior remains unverified.

Implement the remediation as separate, testable work units: first secure SMTP credential storage and preserve email delivery; second sanitize SMTP error handling; third make a narrowly scoped communication-history authorization change only if cross-business access is reproduced; and finally run integrated regression tests. Do not combine these changes with Settings redesign, invoice/accounting changes, or general credential-system refactoring.

No source-code, credential, setting, database, workflow, or deployment changes are approved by this plan. Do not inspect or print real credential values.

## Confirmed findings

- `settings.smtpPass` is stored in a PostgreSQL text column and is read directly by the SMTP invoice sender. No application-level encryption is used in that lifecycle.
- The settings update route preserves an existing password when the submitted password is blank or omitted. Preserve this behavior.
- The current settings response uses an explicit allowlist and exposes only the non-secret `smtpConfigured` indicator. Earlier source versions could include `smtpPass` in a response; retain the existing response fix and its regression coverage.
- The shared invoice SMTP sender is used by invoice sends/resends, manual and automatic reminders, and payment-link email.
- Raw SMTP/provider exceptions may reach invoice API responses, logs, and `invoice_communication_events.error_message`. Automatic reminder success logs also include recipient email addresses.
- Invoice routes are behind authentication and `sectionGuard("invoices")`. Invoice route parameter handling checks a selected business read scope when one resolves. The communication-history handler then queries by invoice ID and does not add its own business predicate. Whether callers can reach another business's events under no-selected-business or All Businesses context has not been verified.
- Current deployment metadata did not identify the deployed source revision. Historical exposure, SMTP credential presence during that period, and actual disclosure remain unknown. The audit did not justify credential rotation.

## Security workstreams

### A. SMTP credential encryption and compatibility

**Goal:** Stop writing SMTP passwords in plaintext while keeping current invoice-email behavior and password-preservation semantics.

**Design requirements**

- Use authenticated encryption with fresh nonces, integrity/tamper detection, a versioned stored envelope, and an explicit key identifier.
- Use a dedicated high-entropy managed secret for SMTP encryption, separate from `SESSION_SECRET`. Development and production must use distinct keys. Do not put keys in source, database rows, logs, API responses, or test fixtures beyond synthetic test-only values.
- The existing credential helper demonstrates AES-256-GCM but derives its key from `SESSION_SECRET`, uses a static salt, and has no key identifier. Reuse its reviewed cryptographic primitives only if the SMTP design adds independent key management and versioning; do not adopt its current key lifecycle unchanged.
- Keep the existing text column if the versioned envelope fits. Do not add a schema migration unless implementation proves one is necessary and it is separately reviewed.
- Read both legacy plaintext and the new encrypted format during the compatibility period. Encrypt before every new write. Convert a legacy value only after encryption succeeds; never replace it with an empty value or ciphertext that cannot be read back.
- Blank or omitted password updates must continue to preserve the current value. A deliberate credential replacement must be distinguishable from a blank form submission.
- Decrypt only server-side, at the point the SMTP sender needs the value. Never return plaintext or ciphertext through the settings API; retain the `smtpConfigured` boolean.
- If the key is missing, mismatched, or decryption fails, fail closed for sending and settings writes that would overwrite the credential. Preserve stored data and return a safe actionable error; do not fall back to plaintext, erase the value, or claim SMTP is unconfigured.
- Define backup/restore and key-rotation procedures before converting existing rows. A restore must retain access to the relevant key version and re-encrypt restored legacy plaintext without exposing it. Review managed-backup encryption, access, retention, and exports with the platform/database owner; application encryption does not retroactively secure old plaintext backups.

**Likely files**

- `lib/db/src/schema/settings.ts`
- `artifacts/api-server/src/routes/settings.ts`
- `artifacts/api-server/src/lib/credentialManager.ts` (only if extending an appropriate shared primitive)
- `artifacts/api-server/src/lib/invoiceEmail.ts`
- Relevant settings, credential, and invoice-email tests

### B. SMTP error sanitization

**Goal:** Keep delivery statuses and invoice workflows intact while ensuring provider diagnostics and personal data do not leak through normal logs, APIs, or history.

**Design requirements**

- Add a small safe error-normalization boundary close to the email-sending subsystem. Map failures to stable categories such as authentication, connection, provider rejection, and unknown; retain safe status and a correlation/event identifier.
- Do not log or return raw Nodemailer exceptions, stacks, SMTP response strings, authentication details, message content, or full recipient addresses. Do not persist raw exception messages in invoice communication events.
- Preserve existing success/failure event status, retry behavior, payment-link creation, reminder behavior, and user-facing ability to determine that delivery failed. Use generic actionable messages and correlation IDs for follow-up.
- Ensure all SMTP-backed paths use the same sanitizer: invoice send/resend and manual reminder, automatic reminder, and payment-link email. Review outer catches as well as the shared `sendAndRecordInvoiceCommunication` path so a sanitized inner error is not later replaced with an unsafe message.
- Avoid changing unrelated Gmail diagnostics unless a reviewed call path shows that the same SMTP error can cross that boundary.

**Likely files**

- `artifacts/api-server/src/lib/invoiceEmail.ts`
- `artifacts/api-server/src/lib/invoiceCommunication.ts`
- `artifacts/api-server/src/routes/invoices.ts`
- `artifacts/api-server/src/routes/square-invoice.ts`
- `artifacts/api-server/src/jobs/invoiceReminders.ts`
- Corresponding unit, route, job, and communication-history tests

### C. Invoice communication-history authorization

**Goal:** Confirm and enforce that a user cannot retrieve another business's invoice communication events.

**Verified boundary today:** The route is mounted behind authentication and the invoice-section permission guard. `router.param("id")` checks selected business read scope when one resolves. The history handler verifies invoice existence and selects events by invoice ID. This review did not execute cross-business requests or prove the behavior for missing, combined, or All Businesses context.

**Required investigation before any change**

1. Build authenticated tests using synthetic invoices/events in two businesses and users with distinct business access.
2. Exercise own-business selection, another-business selection, no explicit business context, and All Businesses context; check both event retrieval and invoice existence behavior.
3. Verify applicable role and section permissions as well as business membership, using existing authorization helpers and conventions.
4. If an unauthorized cross-business read succeeds, add the narrowest server-side ownership predicate or route guard consistent with existing invoice read behavior. Keep authorized combined-context behavior aligned with the existing access policy.
5. If the tests prove isolation already, make no authorization code change and record the verified behavior.

**Likely files**

- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/routes/invoices.ts`
- `artifacts/api-server/src/lib/business-scope.ts`
- Existing invoice route tests and focused new authorization tests

### D. Historical exposure and credential rotation

Keep this assessment independent of the code remediation.

- Determine whether the earlier settings-response code was present in an actual published build using deployment revision/build records, if available. Current deployment metadata alone is insufficient.
- Establish whether an SMTP credential was configured during any period when that build was public using owner-confirmed configuration history or safely redacted evidence. Do not query or reveal the credential itself.
- Treat confirmed access to a secret-bearing response by an unauthorized person, or independent provider/access evidence, as a reason to recommend owner-authorized rotation. Do not infer compromise merely from the public deployment or source defect.
- Do not rotate automatically. Any rotation must be explicitly authorized, performed through the mail provider and managed secret/settings path, and followed by a safe delivery check.
- No production logs or credential values are in scope for this plan.

## Proposed implementation sequence

| Order | Work unit | Dependency | Main risk | Completion gate |
|---|---|---|---|---|
| 1 | SMTP encryption and backward-compatible credential handling | None | Key loss or format mismatch could stop invoice email; careless conversion could destroy the only usable value | Synthetic crypto, compatibility, settings-response, and SMTP-path tests pass; no plaintext is written by the new code |
| 2 | SMTP error sanitization | None; may run independently of A, but integrate before release | Over-sanitization could remove useful troubleshooting or alter failure behavior | Sentinel tests prove secrets, raw provider text, and recipient values are absent at every output boundary |
| 3 | Communication-history authorization | Investigation first; code change only if vulnerability is reproduced | Incorrect scope handling could block legitimate users or preserve cross-business reads | Authenticated two-business tests prove unauthorized access is denied while allowed invoice-history access works |
| 4 | Integrated regression verification | Work units 1–3 as applicable | Combined changes could affect email delivery or invoice history | All focused and regression checks pass; any unavailable verification is explicitly reported |

These are separate implementation boundaries and should be reviewed/tested independently. They are not approval to start any of them.

## Acceptance criteria

### Credential storage

- Synthetic plaintext inputs are never written by the new settings-update path.
- Stored new-format values are authenticated ciphertext with a supported version and key identifier; repeated encryption uses distinct nonces.
- Correct key decrypts; tampering, wrong key, unknown version, or unavailable key fails closed.
- A legacy plaintext value remains readable during transition and can be converted safely; conversion is idempotent and does not change the effective SMTP password.
- Blank/omitted password update preserves the current credential; explicit replacement updates it.
- Owner/staff settings responses contain neither plaintext nor ciphertext, and preserve the existing non-secret configuration indicator and permission behavior.
- Invoice sending, manual/automatic reminders, and payment-link email still consume the credential server-side.
- Development and production key separation is tested without reading real secret values.

### Error handling

- Synthetic errors containing sentinel passwords, tokens, server-response text, connection details, message content, and recipient addresses are injected at the transport boundary.
- Sentinel values are absent from captured application logs, HTTP responses, persisted event fields, and communication-history responses.
- Safe error category and correlation/event ID are available for troubleshooting.
- Invoice communication statuses, resend/reminder behavior, payment-link behavior, and delivery records remain consistent with current behavior.

### Communication-history authorization

- Authenticated, permitted users can still read communication history for invoices in their authorized business context.
- A user lacking access to another business cannot retrieve its invoice events, including under tested no-selection and combined-context cases.
- Invoice existence responses do not create an unintended cross-business identifier oracle.
- If no vulnerability is reproduced, no authorization change is made and tests document the verified boundary.

### Integration and scope

- Existing settings response allowlist, `smtpConfigured` indicator, blank-password preservation, owner/staff permissions, and completed SMTP response-remediation tests remain passing.
- No invoice numbering, totals, taxes, accounting, payment state, or business ownership behavior changes.
- No live SMTP credentials or provider calls are used in tests.
- No production data or configuration is changed, and no deployment occurs without separate approval.

## Testing strategy

1. **Crypto unit tests:** round trip, fresh nonce, tamper detection, malformed envelope, wrong key, missing key, unknown version/key ID, and environment-key separation.
2. **Settings route tests:** synthetic legacy value, one-time conversion, encrypted write, blank/omitted preservation, explicit replacement, owner/staff permissions, and response sentinel absence.
3. **Email integration tests:** mock the transport and prove each SMTP-backed delivery path receives the decrypted synthetic secret only in the server-side transport options.
4. **Sanitization tests:** inject representative synthetic provider failures and assert absence of every sentinel in logs, API JSON, database event fields, and history responses.
5. **Authorization tests:** two businesses, distinct users, several selected-business contexts, and positive/negative permissions. Use disposable development fixtures and clean them up.
6. **Regression tests:** existing invoice route, invoice communication, reminders, Square payment-link, settings, and email tests; then the API test suite and relevant typechecks.
7. **Evidence report:** list each test as PASS, FAIL, or NOT RUN with its actual command/result. Call out any SMTP/provider or authenticated UI path not exercised. Do not equate a successful build with full verification.

## Data compatibility, key management, and rollback

- Prefer an in-place versioned envelope in the existing text column to avoid a schema migration. If that is not safe or feasible, stop and propose the smallest reviewed schema change before implementation.
- Use a dedicated managed secret with separate development and production values. The exact secret name and provisioning steps must follow the environment-secrets workflow during a separately approved implementation; never put secret values in code, docs, logs, or task records.
- Keep legacy plaintext readable only for the migration window; new writes must be encrypted. Do not remove legacy read support until parity tests demonstrate that relevant values have been converted and restored data has a documented path.
- Keep key versions available for the lifetime of encrypted backups that may be restored. Document key creation, access, rotation, recovery, and retirement. Test with synthetic data.
- Back up affected data before any conversion. Verify encryption and decryption on synthetic fixtures and a safe read-back before changing a real row. Do not clear the source value until the encrypted value is validated.
- Do not roll back by deploying an old version that interprets ciphertext as a plaintext SMTP password. Keep the compatible reader available; if a code rollback is necessary, restore a compatible release or roll forward. Any conversion back to plaintext would require separate explicit approval and a controlled recovery procedure.
- A live-row conversion does not remove plaintext from existing backups or exports. Restrict and age out old plaintext backups according to the database/platform owner's approved retention policy; do not alter backups as part of an unapproved code task.

## Open questions and owner decisions

1. Which managed-secret name and ownership process should be used for the dedicated SMTP encryption key? Choose during implementation through the approved secrets workflow; do not reuse `SESSION_SECRET`.
2. Who owns backup encryption, access, retention, and restore procedures, and what evidence can they provide?
3. Are current production source-revision/build records available to establish whether the earlier response code was published?
4. Can the owner establish, without revealing the value, whether an SMTP credential existed during any vulnerable deployment window?
5. What is the intended authorization policy for invoice history when no individual business is selected or All Businesses is selected? Verify the existing policy and tests before changing behavior.
6. Are any historical communication `errorMessage` values required for retention? If so, define whether to keep them inaccessible, redact them in place, or retain under an approved data-retention policy. Do not perform a cleanup without a separate decision and authorization.

## Credential rotation recommendation

**No rotation is recommended solely from the current evidence.** The audit found neither proof that the vulnerable settings-response code was deployed nor proof that an SMTP credential was configured or disclosed. Reassess if build history or other independent evidence closes either gap. Any rotation remains a separate owner-approved action.

## Scope and completion boundary

- This document is a plan only. It does not authorize implementation of any workstream.
- Preserve the completed settings-response allowlist and `smtpConfigured` behavior.
- Do not modify invoice/accounting/payment behavior, Settings navigation/design, or unrelated credential integrations.
- Do not access/display actual credentials, change production configuration, query production logs, run live SMTP sends, migrate data, restart workflows, or deploy under this plan.
- Stop after this plan is reviewed. Obtain separate approval for each implementation phase before changing application behavior or data.
