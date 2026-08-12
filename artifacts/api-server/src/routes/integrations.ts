/**
 * GET  /api/integrations              — list all integrations with status
 * GET  /api/integrations/:slug        — single integration status
 * POST /api/integrations/:slug/test   — test the currently active credential
 * POST /api/integrations/:slug/credential — replace credential (test-then-save)
 * DELETE /api/integrations/:slug/credential — remove stored credential (revert to env)
 *
 * SECURITY INVARIANTS:
 *   - encryptedValue is NEVER included in any response
 *   - Decrypted credential values are NEVER included in any response
 *   - keyHint (last 4 chars) is safe to return
 *   - All credential updates are tested before storage; failed tests leave existing creds unchanged
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { integrationCredentialsTable } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import {
  INTEGRATION_CATALOG,
  testCredential,
  testCurrentCredential,
  findIntegration,
} from "../lib/integrationCatalog.js";
import {
  setCredential,
  removeCredential,
  recordVerification,
  buildKeyHint,
} from "../lib/credentialManager.js";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildIntegrationResponse(def: (typeof INTEGRATION_CATALOG)[0], row: typeof integrationCredentialsTable.$inferSelect | undefined) {
  const envConfigured = def.envFallback ? !!(process.env[def.envFallback]) : false;
  const dbConfigured  = !!(row?.encryptedValue);

  let effectiveStatus: string;
  if (def.managed) {
    effectiveStatus = "managed";
  } else if (dbConfigured && row?.status === "active") {
    effectiveStatus = "active";
  } else if (dbConfigured && row?.status === "invalid") {
    effectiveStatus = "invalid";
  } else if (!dbConfigured && envConfigured) {
    effectiveStatus = "env_only"; // Working via env var — not yet managed in UI
  } else {
    effectiveStatus = "unconfigured";
  }

  return {
    // ── Catalog fields (static) ──
    slug:              def.slug,
    name:              def.name,
    shortName:         def.shortName,
    description:       def.description,
    category:          def.category,
    scope:             def.scope,
    credentialType:    def.credentialType,
    credentialLabel:   def.credentialLabel,
    credentialHelp:    def.credentialHelp,
    docsUrl:           def.docsUrl,
    renewalPeriodDays: def.renewalPeriodDays,
    managed:           def.managed ?? false,
    managedNote:       def.managedNote,
    fields:            def.fields,
    // ── DB fields (encryptedValue NEVER returned) ──
    keyHint:             row?.keyHint          ?? null,
    status:              row?.status           ?? "unconfigured",
    lastVerifiedAt:      row?.lastVerifiedAt?.toISOString()  ?? null,
    lastVerifyError:     row?.lastVerifyError  ?? null,
    lastUsedAt:          row?.lastUsedAt?.toISOString()      ?? null,
    expiresAt:           row?.expiresAt?.toISOString()       ?? null,
    renewalReminderDaysOverride: row?.renewalReminderDays ?? null,
    // ── Derived ──
    envConfigured,
    dbConfigured,
    effectiveStatus,
  };
}

async function loadPlatformRows() {
  return db
    .select()
    .from(integrationCredentialsTable)
    .where(isNull(integrationCredentialsTable.businessId));
}

// ── Routes ────────────────────────────────────────────────────────────────────

/** GET /api/integrations — list all integrations with merged status */
router.get("/", async (_req, res) => {
  try {
    const rows = await loadPlatformRows();
    const bySlug = new Map(rows.map(r => [r.slug, r]));

    const result = INTEGRATION_CATALOG.map(def =>
      buildIntegrationResponse(def, bySlug.get(def.slug))
    );
    res.json(result);
  } catch (err) {
    console.error("[integrations] GET / error:", err);
    res.status(500).json({ error: "Failed to load integrations" });
  }
});

/** GET /api/integrations/:slug — single integration status */
router.get("/:slug", async (req, res) => {
  const { slug } = req.params as { slug: string };
  const def = findIntegration(slug);
  if (!def) { res.status(404).json({ error: "Unknown integration" }); return; }

  try {
    const [row] = await db
      .select()
      .from(integrationCredentialsTable)
      .where(and(eq(integrationCredentialsTable.slug, slug), isNull(integrationCredentialsTable.businessId)))
      .limit(1);

    res.json(buildIntegrationResponse(def, row));
  } catch (err) {
    console.error(`[integrations] GET /${slug} error:`, err);
    res.status(500).json({ error: "Failed to load integration status" });
  }
});

/** POST /api/integrations/:slug/test — test the currently active credential */
router.post("/:slug/test", async (req, res) => {
  const { slug } = req.params as { slug: string };
  const def = findIntegration(slug);
  if (!def) { res.status(404).json({ error: "Unknown integration" }); return; }

  if (def.managed) {
    res.json({ ok: true, message: "This integration is managed and does not require manual testing." });
    return;
  }

  try {
    const result = await testCurrentCredential(slug);
    // Record result non-fatally
    recordVerification(slug, result.ok, result.error).catch(() => {});
    res.json(result);
  } catch (err) {
    console.error(`[integrations] POST /${slug}/test error:`, err);
    res.status(500).json({ ok: false, error: "Test request failed" });
  }
});

/** POST /api/integrations/:slug/credential — replace credential (test-then-save) */
router.post("/:slug/credential", async (req, res) => {
  const { slug } = req.params as { slug: string };
  const def = findIntegration(slug);
  if (!def) { res.status(404).json({ error: "Unknown integration" }); return; }

  if (def.managed) {
    res.status(400).json({ error: "This integration is managed and does not support credential replacement." });
    return;
  }

  // Build the credential value to test
  let credentialValue: string;
  let keyHint: string;

  if (def.credentialType === "client_secret_pair") {
    const body = req.body as { clientId?: string; secret?: string };
    if (!body.clientId?.trim() || !body.secret?.trim()) {
      res.status(400).json({ error: "Both clientId and secret are required." });
      return;
    }
    credentialValue = JSON.stringify({ clientId: body.clientId.trim(), secret: body.secret.trim() });
    keyHint = buildKeyHint(body.secret.trim());
  } else {
    const body = req.body as { credential?: string };
    if (!body.credential?.trim()) {
      res.status(400).json({ error: "credential is required." });
      return;
    }
    credentialValue = body.credential.trim();
    keyHint = buildKeyHint(credentialValue);
  }

  try {
    // ── Step 1: Test the new credential BEFORE storing ──
    const testResult = await testCredential(slug, credentialValue);
    if (!testResult.ok) {
      res.status(422).json({
        ok:    false,
        tested: true,
        error: testResult.error ?? "Credential validation failed. Your existing credential is unchanged.",
      });
      return;
    }

    // ── Step 2: Store encrypted + update cache ──
    await setCredential(slug, credentialValue);

    // ── Step 3: For Plaid, reset the singleton client so it picks up new credentials ──
    if (slug === "plaid") {
      const { resetPlaidClient } = await import("../lib/plaid.js");
      resetPlaidClient();
    }

    // ── Step 4: Return safe metadata (no credential) ──
    const [updatedRow] = await db
      .select()
      .from(integrationCredentialsTable)
      .where(and(eq(integrationCredentialsTable.slug, slug), isNull(integrationCredentialsTable.businessId)))
      .limit(1);

    res.json({
      ok:             true,
      message:        "Credential verified and saved successfully.",
      keyHint:        updatedRow?.keyHint         ?? keyHint,
      lastVerifiedAt: updatedRow?.lastVerifiedAt?.toISOString() ?? new Date().toISOString(),
      status:         "active",
      effectiveStatus: "active",
    });
  } catch (err) {
    console.error(`[integrations] POST /${slug}/credential error:`, err);
    res.status(500).json({ ok: false, error: "Failed to save credential. Existing credential unchanged." });
  }
});

/** DELETE /api/integrations/:slug/credential — remove stored credential, revert to env var */
router.delete("/:slug/credential", async (req, res) => {
  const { slug } = req.params as { slug: string };
  const def = findIntegration(slug);
  if (!def) { res.status(404).json({ error: "Unknown integration" }); return; }

  if (def.managed) {
    res.status(400).json({ error: "This integration is managed externally." });
    return;
  }

  try {
    await removeCredential(slug);

    // For Plaid, reset the singleton so it falls back to env vars
    if (slug === "plaid") {
      const { resetPlaidClient } = await import("../lib/plaid.js");
      resetPlaidClient();
    }

    res.json({
      ok:             true,
      message:        "Stored credential removed. Falling back to environment variable if configured.",
      effectiveStatus: def.envFallback && process.env[def.envFallback] ? "env_only" : "unconfigured",
    });
  } catch (err) {
    console.error(`[integrations] DELETE /${slug}/credential error:`, err);
    res.status(500).json({ error: "Failed to remove credential" });
  }
});

export default router;
