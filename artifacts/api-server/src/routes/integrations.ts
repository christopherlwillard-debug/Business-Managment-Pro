/**
 * Integrations & Credentials API
 *
 * GET  /api/integrations              — list all integrations with merged status
 * GET  /api/integrations/health       — aggregated health summary + procurement sync health
 * GET  /api/integrations/:slug        — single integration status
 * POST /api/integrations/:slug/test   — test the currently active credential
 * POST /api/integrations/:slug/credential     — replace API key credential (test-then-save)
 * DELETE /api/integrations/:slug/credential   — remove stored API key (revert to env)
 * POST /api/integrations/:slug/portal         — save portal URL + username/password
 * DELETE /api/integrations/:slug/portal       — clear portal credentials
 * POST /api/integrations/health/tasks         — create dashboard tasks for integration issues
 *
 * SECURITY INVARIANTS:
 *   - encryptedValue and encryptedUsername are NEVER included in any response
 *   - Decrypted credential values are NEVER included in any response
 *   - keyHint (last 4 chars of password) is safe to return
 *   - usernameHint (masked username) is safe to return
 *   - portalUrl (not sensitive) is safe to return
 *   - All API-key credential updates are tested before storage
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { integrationCredentialsTable, bidSourceConnectionsTable, dashboardTasksTable, businessesTable } from "@workspace/db/schema";
import { eq, and, isNull, or } from "drizzle-orm";
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
  setPortalCredential,
  removePortalCredential,
} from "../lib/credentialManager.js";

const router = Router();

// ── Types ──────────────────────────────────────────────────────────────────────

interface SyncHealth {
  connectionStatus:  string;
  lastSyncAt:        string | null;
  lastSyncSuccessAt: string | null;
  lastSyncError:     string | null;
  recordsImported:   number | null;
  siteHealth?:       Array<{ slug: string; site: string; success: boolean; count: number; error?: string }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildIntegrationResponse(
  def: (typeof INTEGRATION_CATALOG)[0],
  row: typeof integrationCredentialsTable.$inferSelect | undefined,
  syncHealthMap?: Map<string, SyncHealth>,
) {
  const envConfigured = def.envFallback ? !!(process.env[def.envFallback]) : false;
  const dbConfigured  = !!(row?.encryptedValue);
  const portalSaved   = !!(row?.portalUrl);

  let effectiveStatus: string;
  if (def.managed) {
    effectiveStatus = "managed";
  } else if (def.autoSync) {
    // Status comes from bid_source_connections
    const sh = def.bidSourceSlug ? syncHealthMap?.get(def.bidSourceSlug) : undefined;
    if (!sh) {
      effectiveStatus = "not_configured";
    } else {
      effectiveStatus = sh.connectionStatus === "active" ? "syncing"
        : sh.connectionStatus === "error" ? "sync_error"
        : "not_configured";
    }
  } else if (def.credentialType === "portal_only") {
    effectiveStatus = portalSaved ? "portal_saved" : "portal_only";
  } else if (def.credentialType === "username_password") {
    effectiveStatus = dbConfigured && row?.status === "active" ? "portal_configured"
      : dbConfigured && row?.status === "invalid" ? "invalid"
      : "not_configured";
  } else if (def.comingSoon) {
    effectiveStatus = "coming_soon";
  } else if (dbConfigured && row?.status === "active") {
    effectiveStatus = "active";
  } else if (dbConfigured && row?.status === "invalid") {
    effectiveStatus = "invalid";
  } else if (!dbConfigured && envConfigured) {
    effectiveStatus = "env_only";
  } else {
    effectiveStatus = "unconfigured";
  }

  const syncHealth = def.bidSourceSlug ? syncHealthMap?.get(def.bidSourceSlug) ?? null : null;

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
    defaultPortalUrl:  def.defaultPortalUrl,
    renewalPeriodDays: def.renewalPeriodDays,
    managed:           def.managed ?? false,
    managedNote:       def.managedNote,
    fields:            def.fields,
    autoSync:          def.autoSync ?? false,
    syncSchedule:      def.syncSchedule,
    bidSourceSlug:     def.bidSourceSlug,
    comingSoon:        def.comingSoon ?? false,
    scopeNote:         def.scopeNote,
    // ── DB fields (encrypted values NEVER returned) ──
    keyHint:              row?.keyHint          ?? null,
    usernameHint:         row?.usernameHint     ?? null,
    portalUrl:            row?.portalUrl        ?? def.defaultPortalUrl ?? null,
    status:               row?.status           ?? "unconfigured",
    lastVerifiedAt:       row?.lastVerifiedAt?.toISOString()  ?? null,
    lastVerifyError:      row?.lastVerifyError  ?? null,
    lastUsedAt:           row?.lastUsedAt?.toISOString()      ?? null,
    expiresAt:            row?.expiresAt?.toISOString()       ?? null,
    renewalReminderDaysOverride: row?.renewalReminderDays ?? null,
    notes:                row?.notes            ?? null,
    // ── Derived ──
    envConfigured,
    dbConfigured,
    effectiveStatus,
    // ── Sync health (for autoSync sources) ──
    syncHealth,
  };
}

async function loadCredentialRows(businessId?: number | null) {
  const scopeFilter = businessId == null
    ? isNull(integrationCredentialsTable.businessId)
    : or(
        isNull(integrationCredentialsTable.businessId),
        eq(integrationCredentialsTable.businessId, businessId),
      );
  return db.select().from(integrationCredentialsTable).where(scopeFilter);
}

function getScopedCredentialRow(
  rows: typeof integrationCredentialsTable.$inferSelect[],
  def: (typeof INTEGRATION_CATALOG)[0],
  businessId?: number | null,
) {
  return rows.find((row) =>
    row.slug === def.slug
    && (def.scope === "business"
      ? businessId != null && row.businessId === businessId
      : row.businessId == null),
  );
}

async function resolveBusinessScope(
  def: (typeof INTEGRATION_CATALOG)[0],
  rawBusinessId: unknown,
  res: import("express").Response,
): Promise<number | null | undefined> {
  if (def.scope !== "business") return null;
  const businessId = Number(rawBusinessId);
  if (!Number.isInteger(businessId) || businessId <= 0) {
    res.status(400).json({ error: "businessId is required for this business-scoped integration." });
    return undefined;
  }
  const [business] = await db.select({ id: businessesTable.id })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId))
    .limit(1);
  if (!business) {
    res.status(404).json({ error: "Business not found." });
    return undefined;
  }
  return businessId;
}

/** Aggregate bid_source_connections across ALL businesses, by catalogSlug. */
async function loadSyncHealthMap(): Promise<Map<string, SyncHealth>> {
  let rows: typeof bidSourceConnectionsTable.$inferSelect[] = [];
  try {
    rows = await db.select().from(bidSourceConnectionsTable);
  } catch {
    // Table may not exist yet
    return new Map();
  }

  // Group by catalogSlug — take the most recently synced row per slug
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const existing = grouped.get(row.catalogSlug) ?? [];
    existing.push(row);
    grouped.set(row.catalogSlug, existing);
  }

  const map = new Map<string, SyncHealth>();
  for (const [slug, connections] of grouped) {
    // Aggregate: "active" beats "error" beats "not_configured"
    const priority = { active: 3, error: 2, portal_only: 1, not_configured: 0 } as Record<string, number>;
    connections.sort((a, b) => (priority[b.connectionStatus] ?? 0) - (priority[a.connectionStatus] ?? 0));
    const best = connections[0];

    let siteHealth: SyncHealth["siteHealth"];
    if (best.siteHealthJson) {
      try {
        siteHealth = JSON.parse(best.siteHealthJson) as SyncHealth["siteHealth"];
      } catch { /* ignore */ }
    }

    map.set(slug, {
      connectionStatus:  best.connectionStatus,
      lastSyncAt:        best.lastSyncAt?.toISOString() ?? null,
      lastSyncSuccessAt: best.lastSyncSuccessAt?.toISOString() ?? null,
      lastSyncError:     best.lastSyncError ?? null,
      recordsImported:   best.recordsImported ?? null,
      siteHealth,
    });
  }

  return map;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/** GET /api/integrations — list all integrations with merged status */
router.get("/", async (req, res) => {
  try {
    const rawBusinessId = req.query.businessId;
    const parsedBusinessId = rawBusinessId == null ? null : Number(rawBusinessId);
    const businessId = Number.isInteger(parsedBusinessId) && parsedBusinessId! > 0 ? parsedBusinessId : null;
    const [rows, syncHealthMap] = await Promise.all([loadCredentialRows(businessId), loadSyncHealthMap()]);

    const result = INTEGRATION_CATALOG
      .filter(def => !def.comingSoon) // hide coming-soon from the main list
      .map(def => buildIntegrationResponse(def, getScopedCredentialRow(rows, def, businessId), syncHealthMap));

    res.json(result);
  } catch (err) {
    console.error("[integrations] GET / error:", err);
    res.status(500).json({ error: "Failed to load integrations" });
  }
});

/** GET /api/integrations/health — aggregated health summary */
router.get("/health", async (req, res) => {
  try {
    const rawBusinessId = req.query.businessId;
    const parsedBusinessId = rawBusinessId == null ? null : Number(rawBusinessId);
    const businessId = Number.isInteger(parsedBusinessId) && parsedBusinessId! > 0 ? parsedBusinessId : null;
    const [rows, syncHealthMap] = await Promise.all([loadCredentialRows(businessId), loadSyncHealthMap()]);

    const allIntegrations = INTEGRATION_CATALOG.map(def =>
      buildIntegrationResponse(def, getScopedCredentialRow(rows, def, businessId), syncHealthMap)
    );

    const summary = {
      total:         allIntegrations.filter(i => !i.comingSoon).length,
      connected:     allIntegrations.filter(i =>
        ["active", "env_only", "managed", "syncing", "portal_saved", "portal_configured"].includes(i.effectiveStatus)
      ).length,
      needsAttention: allIntegrations.filter(i =>
        ["invalid", "sync_error"].includes(i.effectiveStatus)
      ).length,
      notConfigured: allIntegrations.filter(i =>
        ["unconfigured", "not_configured", "portal_only"].includes(i.effectiveStatus)
      ).length,
      // Credentials expiring in next 30 days
      expiringCount: allIntegrations.filter(i => {
        if (!i.expiresAt) return false;
        const days = Math.ceil((new Date(i.expiresAt).getTime() - Date.now()) / 86_400_000);
        return days > 0 && days <= (i.renewalPeriodDays ?? 30);
      }).length,
    };

    res.json({ summary, integrations: allIntegrations });
  } catch (err) {
    console.error("[integrations] GET /health error:", err);
    res.status(500).json({ error: "Failed to load integration health" });
  }
});

/** GET /api/integrations/:slug — single integration status */
router.get("/:slug", async (req, res) => {
  const { slug } = req.params as { slug: string };
  const def = findIntegration(slug);
  if (!def) { res.status(404).json({ error: "Unknown integration" }); return; }

  try {
    const businessId = await resolveBusinessScope(def, req.query.businessId, res);
    if (businessId === undefined) return;
    const [[row], syncHealthMap] = await Promise.all([
      db.select().from(integrationCredentialsTable).where(and(
        eq(integrationCredentialsTable.slug, slug),
        businessId == null
          ? isNull(integrationCredentialsTable.businessId)
          : eq(integrationCredentialsTable.businessId, businessId),
      )).limit(1),
      loadSyncHealthMap(),
    ]);

    res.json(buildIntegrationResponse(def, row, syncHealthMap));
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

  if (def.autoSync) {
    res.json({ ok: true, message: "Auto-synced source — check sync health for status." });
    return;
  }

  try {
    const result = await testCurrentCredential(slug);
    recordVerification(slug, result.ok, result.error).catch(() => {});
    res.json(result);
  } catch (err) {
    console.error(`[integrations] POST /${slug}/test error:`, err);
    res.status(500).json({ ok: false, error: "Test request failed" });
  }
});

/** POST /api/integrations/:slug/credential — replace API key credential (test-then-save) */
router.post("/:slug/credential", async (req, res) => {
  const { slug } = req.params as { slug: string };
  const def = findIntegration(slug);
  if (!def) { res.status(404).json({ error: "Unknown integration" }); return; }

  if (def.managed) {
    res.status(400).json({ error: "This integration is managed and does not support credential replacement." });
    return;
  }
  if (def.autoSync) {
    res.status(400).json({ error: "Auto-synced sources do not use credentials." });
    return;
  }
  if (def.credentialType === "portal_only" || def.credentialType === "username_password") {
    res.status(400).json({ error: "Use POST /portal to save portal credentials." });
    return;
  }

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
    // Step 1: test the new credential BEFORE storing
    const testResult = await testCredential(slug, credentialValue);
    if (!testResult.ok) {
      res.status(422).json({
        ok:     false,
        tested: true,
        error:  testResult.error ?? "Credential validation failed. Your existing credential is unchanged.",
      });
      return;
    }

    // Step 2: store encrypted + update cache
    await setCredential(slug, credentialValue);

    // Step 3: special post-save hooks
    if (slug === "plaid") {
      const { resetPlaidClient } = await import("../lib/plaid.js");
      resetPlaidClient();
    }

    // Step 4: return safe metadata
    const [updatedRow] = await db
      .select()
      .from(integrationCredentialsTable)
      .where(and(eq(integrationCredentialsTable.slug, slug), isNull(integrationCredentialsTable.businessId)))
      .limit(1);

    res.json({
      ok:              true,
      message:         "Credential verified and saved successfully.",
      keyHint:         updatedRow?.keyHint         ?? keyHint,
      lastVerifiedAt:  updatedRow?.lastVerifiedAt?.toISOString() ?? new Date().toISOString(),
      status:          "active",
      effectiveStatus: "active",
    });
  } catch (err) {
    console.error(`[integrations] POST /${slug}/credential error:`, err);
    res.status(500).json({ ok: false, error: "Failed to save credential. Existing credential unchanged." });
  }
});

/** DELETE /api/integrations/:slug/credential — remove stored API key, revert to env var */
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

    if (slug === "plaid") {
      const { resetPlaidClient } = await import("../lib/plaid.js");
      resetPlaidClient();
    }

    res.json({
      ok:              true,
      message:         "Stored credential removed. Falling back to environment variable if configured.",
      effectiveStatus: def.envFallback && process.env[def.envFallback] ? "env_only" : "unconfigured",
    });
  } catch (err) {
    console.error(`[integrations] DELETE /${slug}/credential error:`, err);
    res.status(500).json({ error: "Failed to remove credential" });
  }
});

// ── Portal credential routes ───────────────────────────────────────────────────

/** POST /api/integrations/:slug/portal — save portal URL + username/password */
router.post("/:slug/portal", async (req, res) => {
  const { slug } = req.params as { slug: string };
  const def = findIntegration(slug);
  if (!def) { res.status(404).json({ error: "Unknown integration" }); return; }

  if (!["portal_only", "username_password"].includes(def.credentialType)) {
    res.status(400).json({ error: "This integration does not use portal credentials. Use /credential instead." });
    return;
  }

  const body = req.body as {
    businessId?: number;
    portalUrl?:  string;
    username?:   string;
    password?:   string;
    notes?:      string;
  };
  const businessId = await resolveBusinessScope(def, body.businessId, res);
  if (businessId === undefined) return;

  if (!body.portalUrl?.trim() && !body.username?.trim() && !body.password?.trim()) {
    res.status(400).json({ error: "At least one of portalUrl, username, or password is required." });
    return;
  }

  try {
    await setPortalCredential(slug, {
      portalUrl: body.portalUrl === undefined ? undefined : body.portalUrl.trim(),
      username:  body.username === undefined ? undefined : body.username.trim(),
      password:  body.password === undefined ? undefined : body.password.trim(),
      notes:     body.notes === undefined ? undefined : body.notes.trim(),
    }, businessId);

    const [updatedRow] = await db
      .select()
      .from(integrationCredentialsTable)
      .where(and(
        eq(integrationCredentialsTable.slug, slug),
        businessId == null
          ? isNull(integrationCredentialsTable.businessId)
          : eq(integrationCredentialsTable.businessId, businessId),
      ))
      .limit(1);

    res.json({
      ok:              true,
      message:         "Portal credentials saved successfully.",
      portalUrl:       updatedRow?.portalUrl       ?? null,
      usernameHint:    updatedRow?.usernameHint    ?? null,
      keyHint:         updatedRow?.keyHint         ?? null,
      status:          updatedRow?.status          ?? "active",
      effectiveStatus: def.credentialType === "portal_only"      ? "portal_saved"
                     : updatedRow?.status === "active"            ? "portal_configured"
                     : "not_configured",
    });
  } catch (err) {
    console.error(`[integrations] POST /${slug}/portal error:`, err);
    res.status(500).json({ ok: false, error: "Failed to save portal credentials." });
  }
});

/** DELETE /api/integrations/:slug/portal — clear portal credentials */
router.delete("/:slug/portal", async (req, res) => {
  const { slug } = req.params as { slug: string };
  const def = findIntegration(slug);
  if (!def) { res.status(404).json({ error: "Unknown integration" }); return; }

  try {
    const businessId = await resolveBusinessScope(def, req.query.businessId, res);
    if (businessId === undefined) return;
    await removePortalCredential(slug, businessId);
    res.json({
      ok:              true,
      message:         "Portal credentials cleared.",
      effectiveStatus: def.credentialType === "portal_only" ? "portal_only" : "not_configured",
    });
  } catch (err) {
    console.error(`[integrations] DELETE /${slug}/portal error:`, err);
    res.status(500).json({ error: "Failed to clear portal credentials" });
  }
});

// ── Health task creation ───────────────────────────────────────────────────────

/**
 * POST /api/integrations/health/tasks
 * Scans integration status and creates dashboard tasks for issues found.
 * Returns the list of tasks that were created.
 */
router.post("/health/tasks", async (req, res) => {
  const { businessId } = req.body as { businessId?: number };
  if (!businessId) {
    res.status(400).json({ error: "businessId is required to create dashboard tasks." });
    return;
  }

  try {
    const [rows, syncHealthMap] = await Promise.all([loadCredentialRows(businessId), loadSyncHealthMap()]);
    

    const created: Array<{ title: string; notes: string; priority: string }> = [];

    for (const def of INTEGRATION_CATALOG) {
      if (def.comingSoon || def.managed) continue;

      const row = getScopedCredentialRow(rows, def, businessId);
      const integrated = buildIntegrationResponse(def, row, syncHealthMap);

      // Check for expired credentials
      if (integrated.expiresAt) {
        const daysLeft = Math.ceil((new Date(integrated.expiresAt).getTime() - Date.now()) / 86_400_000);
        if (daysLeft <= 0) {
          const task = {
            title:      `Renew ${def.shortName} API key — expired`,
            notes:      `The ${def.name} API key expired ${Math.abs(daysLeft)} day(s) ago. The integration is not working.`,
            priority:   "high",
            businessId,
          };
          await db.insert(dashboardTasksTable).values(task).onConflictDoNothing();
          created.push(task);
          continue;
        } else if (daysLeft <= (def.renewalPeriodDays ?? 30)) {
          const task = {
            title:      `Renew ${def.shortName} API key — expires in ${daysLeft} day(s)`,
            notes:      `The ${def.name} API key will expire in ${daysLeft} day(s). Renew before it expires to avoid service interruption.`,
            priority:   daysLeft <= 7 ? "high" : "medium",
            businessId,
          };
          await db.insert(dashboardTasksTable).values(task).onConflictDoNothing();
          created.push(task);
          continue;
        }
      }

      // Check for invalid credentials
      if (integrated.effectiveStatus === "invalid") {
        const task = {
          title:      `Fix ${def.shortName} — credential rejected`,
          notes:      `The stored ${def.name} credential was rejected during the last test: ${integrated.lastVerifyError ?? "unknown error"}`,
          priority:   "high",
          businessId,
        };
        await db.insert(dashboardTasksTable).values(task).onConflictDoNothing();
        created.push(task);
        continue;
      }

      // Check for sync errors
      if (integrated.effectiveStatus === "sync_error" && integrated.syncHealth) {
        const task = {
          title:      `Fix ${def.shortName} sync error`,
          notes:      `The last sync of ${def.name} failed: ${integrated.syncHealth.lastSyncError ?? "unknown error"}. Last successful sync: ${integrated.syncHealth.lastSyncSuccessAt ? new Date(integrated.syncHealth.lastSyncSuccessAt).toLocaleDateString() : "never"}.`,
          priority:   "medium",
          businessId,
        };
        await db.insert(dashboardTasksTable).values(task).onConflictDoNothing();
        created.push(task);
      }
    }

    res.json({ ok: true, tasksCreated: created.length, tasks: created });
  } catch (err) {
    console.error("[integrations] POST /health/tasks error:", err);
    res.status(500).json({ error: "Failed to create health tasks" });
  }
});

export default router;
