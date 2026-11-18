# BuildPro SMTP Credential Storage and Logging Security Audit

**Audit date:** 2026-11-18  
**Scope:** Read-only source review, local source-history review, and deployment metadata check. No credentials or database contents were accessed.

## Executive summary

- **Application-level storage is confirmed plaintext.** `settings.smtpPass` maps to a PostgreSQL `text` column. The settings update route writes the submitted value directly and the invoice sender reads it directly. No SMTP encryption/decryption call is used in this lifecycle.
- **SMTP provider errors are not consistently sanitized.** Nodemailer exceptions are logged as raw error objects, returned to API callers as `err.message`, and persisted as communication-event `errorMessage` values. A specific instance of an SMTP password appearing in an error was not demonstrated.
- **The historical settings-response leak was confirmed in earlier source and is fixed in current development source.** Whether the vulnerable source was ever included in a published build, whether an SMTP password existed then, and whether any user received one cannot be established from the metadata reviewed.
- **No credential rotation is justified by the available evidence alone.** Consider rotation if an owner confirms an SMTP credential was configured during a period when the vulnerable build was publicly available to approved non-owner accounts, or if independent evidence of exposure is found.

## Scope and method

Reviewed the current settings schema and routes, SMTP send helper, invoice and reminder call sites, invoice communication history handling, existing credential-encryption helper, authentication middleware placement, relevant source history, and the available deployment metadata.

The active deployment metadata reports a public deployment with a successful current build, but does not identify the source revision for that build or provide historical revision-to-deployment mapping. Production runtime logs were not queried: raw SMTP diagnostics could contain secrets, and no safely redacted production log export was available in this read-only review. Local workflow logs were not used as evidence of production behavior.

## Verified credential lifecycle

### Entry and validation

- The server accepts `smtpPass` in the owner-only `PUT /api/settings` update body. The route keeps the existing stored password when the submitted value is blank or omitted.
- This route has no SMTP-specific schema validation or encryption step before persistence. The current Settings page contains fields for SMTP host, port, user, and TLS/secure mode, but no password field or password state. A credential can still enter through a direct API request or a prior client version; this source review cannot establish how any existing value was originally entered.
- The settings routes are mounted behind the application authentication middleware. `requireOwnerForWrites` allows reads for authenticated users but restricts write methods to the owner. This is not an anonymous public settings endpoint.

### Storage and use

- `smtpPass` is defined as `text("smtp_pass")` in the `settings` table.
- The settings `PUT` route stores the submitted value directly in that field. It does not call the credential manager.
- Invoice email settings are loaded server-side from the settings row and passed to the shared `sendInvoiceEmail` helper. When host, user, and password are all present, that helper passes the password to Nodemailer as the SMTP authentication password.
- The same helper is used for initial/resend invoice email, manual reminders, automatic reminders, and invoice-payment-link email. No other direct SMTP password read/write path was found in the source search.
- The generic Gmail connector path is separate; it does not use `smtpPass`.

### Encryption and key management

**Confirmed:** There is no application-level encryption of `smtpPass` in its current database lifecycle. The database column is plaintext text, and the write/read code contains no encryption or decryption operation.

**Not established:** Whether the database service encrypts underlying storage or managed backups, the applicable backup-access controls, retention, and export procedures. Infrastructure-level encryption, if present, would not change the finding that the application sends plaintext values to the database and that a logical export of this column could contain plaintext.

The project has an AES-256-GCM credential helper for a different credentials table. It derives a key from `SESSION_SECRET` using PBKDF2-SHA256 and a shared static salt, and stores an IV, authentication tag, and ciphertext. SMTP does not use this helper. Reusing it unchanged would couple SMTP decryption to the session secret and its rotation; the existing format also has no explicit per-record key identifier for a staged key rotation.

### Database backups and exports

- No application-managed database export or `pg_dump` path for SMTP settings was found in the reviewed source.
- Because the source database field contains plaintext, a raw logical database export or backup containing that row would contain the plaintext field unless the export/backup layer separately encrypts it.
- Platform-level encryption, backup controls, and restore handling were not assessed. Do not assume they remove the need for application-level secret protection.

## Verified error and logging paths

### SMTP-backed invoice email

The Nodemailer call can reject with provider/transport error objects. The source does not normalize or redact those errors before they flow through these paths:

1. Initial/resend invoice and manual reminder endpoints log the caught error object and return its `message` in the HTTP error response.
2. Automatic reminder processing logs the caught error object. Its success log also includes the invoice number and recipient email address.
3. Square payment-link email handling includes the caught error message in the response's `emailWarning` and logs the error object. Its outer failure path also returns an exception message.
4. `sendAndRecordInvoiceCommunication` stores the caught exception message in the invoice communication event's `errorMessage`. The invoice communication-history endpoint returns the full event rows, including that field, to authenticated callers with invoice access.

These are **confirmed diagnostic-disclosure paths**. Nodemailer errors can carry server response and transport diagnostics; the source does not guarantee that such content is safe for browser responses, application logs, or persisted communication history. No test intentionally generated an error containing a synthetic SMTP secret in this audit, and no live provider error was generated. Therefore, **actual password disclosure through an SMTP error is possible but not confirmed**.

**Separate access-control follow-up:** the communication-history handler looks up an invoice by ID and returns all its communication events; its route is protected by the invoice-section permission guard. The handler itself does not show a per-business ownership predicate. This audit did not test whether an approved cross-business staff account can use that route to retrieve another business's error details; treat the business-scope boundary as unverified and review it separately.

The Gmail `sendEmail` helper uses a generic provider-rejected error rather than returning the raw Gmail response body. The Settings compliance test email uses that Gmail helper rather than the SMTP invoice helper; it is not evidence that SMTP errors are sanitized.

Other provider-specific exception logging exists in unrelated email features, but no additional path passing `smtpPass` to a different provider was found.

## Response-exposure assessment

- Earlier source versions formatted settings by spreading the entire database row. In those versions, owner and authenticated non-owner settings GET responses, as well as owner PUT responses, could include `smtpPass` if a value was configured.
- The current development source replaces that broad spread with an explicit response allowlist and retains only the non-secret `smtpConfigured` indicator. The existing focused tests use synthetic sentinel values and pass for owner/staff response serialization and password preservation.
- The current deployment metadata says a public deployment is active and has a successful build. It does not identify the build's source revision. The vulnerable version's deployment history therefore remains **unknown**; this audit cannot confirm that the fix is live or that the prior vulnerable code was ever published.
- The route requires application authentication; the historical source issue would have exposed the field to an authenticated, approved non-owner, not to an anonymous visitor.
- No evidence was found that a password was configured during any potentially vulnerable deployment window, that a non-owner received one, or that a credential was used by an unauthorized party. No credential value, database record, or production runtime log was inspected.

## Confirmed findings versus unknowns

| Finding | Status |
|---|---|
| SMTP password is stored in a text database column without application-level encryption | **Confirmed** |
| SMTP password is sent to Nodemailer for configured invoice email | **Confirmed** |
| SMTP-specific raw errors can reach server logs, API responses, and persisted delivery history | **Confirmed source path** |
| Invoice communication history returns full event rows to users with invoice-section access; cross-business scope of that handler | **Endpoint confirmed; access boundary unverified** |
| A real provider error included an SMTP password or token | **Unknown; not reproduced** |
| SMTP password was configured during the historical response-exposure window | **Unknown** |
| Vulnerable source was included in a published build | **Unknown; current deployment metadata lacks revision mapping** |
| Any person received or misused an SMTP password | **Unknown; no evidence found in this source-only review** |
| Database disk encryption, managed-backup encryption, or backup access controls | **Not assessed** |

## Recommended remediation

### Storage

1. Use authenticated encryption (for example, AES-256-GCM) with a dedicated, high-entropy SMTP encryption key stored as a managed secret. Do not reuse `SESSION_SECRET` as the SMTP data-encryption key.
2. Store a versioned ciphertext envelope with an explicit key identifier and fresh nonce per encryption. Keep encryption/decryption server-side; never return ciphertext or plaintext through settings responses.
3. Keep development and production keys separate. A ciphertext copied between environments should fail closed rather than decrypt under a different environment's key.
4. Plan a controlled in-place legacy conversion: preserve the current SMTP value until ciphertext is successfully written and read back; distinguish plaintext, encrypted, and empty states; retain the existing blank-password-preserves-value behavior. Do not silently treat failed decryption as an empty password or overwrite the stored value.
5. Define key rotation and disaster recovery before migration. Retain old keys only as long as needed to decrypt retained backups; document how a restored database is re-encrypted with the active key. If a required key is unavailable, keep the ciphertext and prevent sends until recovery—do not clear credentials or fall back to plaintext.
6. Review backup and export encryption, access, retention, and restore procedures with the database/platform owner. Historical backups that contain plaintext may require restricted access or expiry even after the live row is encrypted.

### Error handling and logs

1. Map Nodemailer errors to a small, safe category/code set. Return generic actionable messages to the client and store only the safe category plus a correlation/event ID.
2. Do not log or persist raw provider exception objects, SMTP response text, connection credentials, message content, or full recipient addresses. Avoid unnecessary recipient PII in success logs; use invoice and delivery IDs for correlation.
3. Keep detailed troubleshooting available only through an approved, access-controlled process with deliberate redaction. Do not expose raw provider diagnostics in invoice-history APIs.
4. Add synthetic regression tests where fake transport errors contain sentinel password, token, server-response, and recipient values; assert those sentinels are absent from API responses, application logs, and persisted error fields while safe categories and correlation IDs remain.

## Rotation assessment

**Do not rotate automatically based on this audit alone.** No credential was accessed and no evidence establishes that one existed during a vulnerable deployment window. Rotation should be considered if the owner confirms a credential was configured while the vulnerable settings-response version was deployed, or if independent access/provider records show possible exposure. Any rotation must be separately authorized and performed through the mail provider, followed by a secure update in BuildPro. The public deployment status alone is not evidence that the vulnerable source was deployed or that a credential was exposed.

## Implementation test requirements

- Verify encrypt/decrypt round trips, tamper detection, wrong-key failure, key-unavailable behavior, and key-ID/version handling using synthetic test values.
- Verify plaintext legacy rows migrate once, ciphertext rows remain stable, blank password updates preserve the current value, and a restored backup can be migrated with the documented key-retention procedure.
- Verify invoice sends, manual/automatic reminders, and payment-link emails still use the configured SMTP password server-side without returning it.
- Verify representative synthetic provider errors do not place sentinels in logs, HTTP bodies, persisted event error fields, or communication-history responses.
- Verify environment isolation and that SMTP configuration remains owner-scoped.
- Do not use live credentials or intentionally provoke production provider errors in tests.

## Risks and limitations

- An unavailable or mismatched encryption key can prevent invoice emails from sending. Migration must fail closed and provide a recovery path.
- Encrypting only the live row does not remove plaintext from historical backups or exports.
- Changing SMTP exception text may reduce diagnostic detail; safe error categories and correlation IDs should preserve supportability.
- No application code, database, credentials, or deployment was changed in this audit. No test or live SMTP send was run.
- Production runtime logs were not queried. Deployment metadata was read only; it confirms an active public deployment with a successful build but does not identify the source revision.
