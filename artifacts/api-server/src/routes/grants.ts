/**
 * Grant Finder API routes.
 *
 * All routes are owner-only (mounted with requireOwner in index.ts).
 *
 * Static routes (settings, sources, sync) are registered BEFORE /:id so
 * Express doesn't match them as IDs.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  grantOpportunitiesTable,
  grantSourceCatalogTable,
  grantSourceConnectionsTable,
  bidBusinessSettingsTable,
} from "@workspace/db";
import { eq, and, desc, or } from "drizzle-orm";
import { runGrantSync } from "../jobs/grantSync.js";

const router = Router();

// ── GET /api/grants/settings — bid_business_settings for grant matching ───────
// Reuses the same profile as the bid system — no duplicate table needed.
// IMPORTANT: registered before /:id.
router.get("/settings", async (req, res) => {
  try {
    const { businessId } = req.query;
    const bizId = businessId ? parseInt(businessId as string, 10) : NaN;
    if (isNaN(bizId)) { res.status(400).json({ error: "businessId is required" }); return; }

    const settings = await db
      .select()
      .from(bidBusinessSettingsTable)
      .where(eq(bidBusinessSettingsTable.businessId, bizId))
      .then((rows) => rows[0] ?? null);

    res.json(settings ?? {
      businessId: bizId,
      isSmallBusiness: true,
      isSdvosb: false,
      isVosb: false,
      isHubzone: false,
      is8a: false,
      homeZip: null,
    });
  } catch (err) {
    console.error("[grants] GET /grants/settings error:", err);
    res.status(500).json({ error: "Failed to load grant settings" });
  }
});

// ── GET /api/grants/sources — catalog + per-business connection health ─────────
// IMPORTANT: registered before /:id.
router.get("/sources", async (req, res) => {
  try {
    const { businessId } = req.query;
    const bizId = businessId ? parseInt(businessId as string, 10) : NaN;
    if (isNaN(bizId)) { res.status(400).json({ error: "businessId is required" }); return; }

    const catalog = await db
      .select()
      .from(grantSourceCatalogTable)
      .where(eq(grantSourceCatalogTable.isGloballyActive, true))
      .orderBy(grantSourceCatalogTable.category, grantSourceCatalogTable.slug);

    const connections = await db
      .select()
      .from(grantSourceConnectionsTable)
      .where(eq(grantSourceConnectionsTable.businessId, bizId));

    const connBySlug = new Map(connections.map((c) => [c.catalogSlug, c]));

    const merged = catalog.map((src) => {
      const conn = connBySlug.get(src.slug);
      return {
        slug:               src.slug,
        name:               src.name,
        category:           src.category,
        connectionMethod:   src.connectionMethod,
        automatedDiscovery: src.automatedDiscovery,
        notes:              src.notes,
        websiteUrl:         src.websiteUrl,
        isGloballyActive:   src.isGloballyActive,
        // Automated sources default to enabled; manual sources default to disabled
        enabled:            conn?.enabled ?? src.automatedDiscovery,
        connectionStatus:   conn?.connectionStatus ?? (src.automatedDiscovery ? "not_configured" : "manual_only"),
        lastSyncAt:         conn?.lastSyncAt?.toISOString()        ?? null,
        lastSyncSuccessAt:  conn?.lastSyncSuccessAt?.toISOString() ?? null,
        lastSyncError:      conn?.lastSyncError      ?? null,
        recordsImported:    conn?.recordsImported    ?? null,
      };
    });

    res.json(merged);
  } catch (err) {
    console.error("[grants] GET /grants/sources error:", err);
    res.status(500).json({ error: "Failed to load grant sources" });
  }
});

// ── PATCH /api/grants/sources/:slug — enable/disable a source ─────────────────
// IMPORTANT: registered before /:id.
router.patch("/sources/:slug", async (req, res) => {
  try {
    const { slug } = req.params as { slug: string };
    const { businessId } = req.query;
    const bizId = businessId ? parseInt(businessId as string, 10) : NaN;
    if (isNaN(bizId)) { res.status(400).json({ error: "businessId is required" }); return; }

    const body = req.body as { enabled?: boolean };

    // Validate the slug exists in the catalog
    const [catalog] = await db
      .select()
      .from(grantSourceCatalogTable)
      .where(eq(grantSourceCatalogTable.slug, slug));
    if (!catalog) { res.status(404).json({ error: "Source not found" }); return; }

    const now = new Date();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

    await db
      .insert(grantSourceConnectionsTable)
      .values({
        businessId:      bizId,
        catalogSlug:     slug,
        enabled:         typeof body.enabled === "boolean" ? body.enabled : catalog.automatedDiscovery,
        connectionStatus: catalog.automatedDiscovery ? "not_configured" : "manual_only",
      })
      .onConflictDoUpdate({
        target: [grantSourceConnectionsTable.businessId, grantSourceConnectionsTable.catalogSlug],
        set:    patch,
      });

    res.json({ success: true });
  } catch (err) {
    console.error("[grants] PATCH /grants/sources/:slug error:", err);
    res.status(500).json({ error: "Failed to update grant source" });
  }
});

// ── POST /api/grants/sync — trigger grant sync for a business ─────────────────
// IMPORTANT: registered before /:id.
router.post("/sync", async (req, res) => {
  try {
    const { businessId } = req.query;
    const bizId = businessId ? parseInt(businessId as string, 10) : undefined;

    const results = await runGrantSync(bizId);

    const summary = results.map((r) => ({
      businessId:   r.businessId,
      businessName: r.businessName,
      inserted:     r.inserted,
      rescored:     r.rescored,
      skipped:      r.skipped,
      httpAttempted: r.httpAttempted,
      httpAccepted:  r.httpAccepted,
      error:        r.error,
    }));

    const hasError = results.some((r) => r.error !== null);
    res.status(hasError ? 207 : 200).json({ results: summary });
  } catch (err) {
    console.error("[grants] POST /grants/sync error:", err);
    res.status(500).json({ error: "Grant sync failed" });
  }
});

// ── GET /api/grants — list grant opportunities for a business ─────────────────
router.get("/", async (req, res) => {
  try {
    const {
      businessId,
      opportunityType,
      eligibilityLabel,
      stage,
      includeNonGrants,
    } = req.query;

    const bizId = businessId ? parseInt(businessId as string, 10) : NaN;
    if (isNaN(bizId)) { res.status(400).json({ error: "businessId is required" }); return; }

    const conditions = [eq(grantOpportunitiesTable.businessId, bizId)];

    // By default, hide loans/tax credits/other non-grant types unless the caller opts in
    if (includeNonGrants !== "true") {
      conditions.push(
        or(
          eq(grantOpportunitiesTable.opportunityType, "grant"),
          eq(grantOpportunitiesTable.opportunityType, "cooperative_agreement"),
        )!
      );
    }

    if (opportunityType && typeof opportunityType === "string") {
      conditions.push(eq(grantOpportunitiesTable.opportunityType, opportunityType));
    }
    if (eligibilityLabel && typeof eligibilityLabel === "string") {
      conditions.push(eq(grantOpportunitiesTable.eligibilityLabel, eligibilityLabel));
    }
    if (stage && typeof stage === "string") {
      conditions.push(eq(grantOpportunitiesTable.stage, stage));
    }

    const rows = await db
      .select()
      .from(grantOpportunitiesTable)
      .where(and(...conditions))
      .orderBy(desc(grantOpportunitiesTable.fitScore), desc(grantOpportunitiesTable.createdAt));

    res.json(rows);
  } catch (err) {
    console.error("[grants] GET /grants error:", err);
    res.status(500).json({ error: "Failed to load grants" });
  }
});

// ── PATCH /api/grants/:id — update stage and/or notes ─────────────────────────
const VALID_STAGES = ["new", "saved", "applied", "no_interest"] as const;
type GrantStage = (typeof VALID_STAGES)[number];

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const body = req.body as { stage?: string; notes?: string };
    const patch: Record<string, unknown> = {};

    if (body.stage !== undefined) {
      if (!VALID_STAGES.includes(body.stage as GrantStage)) {
        res.status(400).json({ error: `Invalid stage. Valid values: ${VALID_STAGES.join(", ")}` });
        return;
      }
      patch.stage = body.stage;
    }
    if (body.notes !== undefined) patch.notes = body.notes;

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [updated] = await db
      .update(grantOpportunitiesTable)
      .set(patch)
      .where(eq(grantOpportunitiesTable.id, id))
      .returning();

    if (!updated) { res.status(404).json({ error: "Grant not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("[grants] PATCH /grants/:id error:", err);
    res.status(500).json({ error: "Failed to update grant" });
  }
});

export default router;
