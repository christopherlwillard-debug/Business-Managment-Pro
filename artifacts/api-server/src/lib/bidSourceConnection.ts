/**
 * Shared helper functions for reading and writing per-business source connection
 * state in the `bid_source_connections` table.
 *
 * Extracted here so they can be imported by both bidSync.ts (writes health during
 * sync) and bids.ts (reads / PATCH for the management UI), and independently
 * tested in bidSourceConnection.test.ts.
 */
import { db } from "@workspace/db";
import { bidSourceConnectionsTable, bidSourceCatalogTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// ── Auto-bootstrap ────────────────────────────────────────────────────────────

/**
 * Ensure every `automatedDiscovery = true` catalog source has a connection row
 * for this business.  Uses INSERT … ON CONFLICT DO NOTHING so any existing row
 * (including a user-disabled one) is left completely untouched.
 *
 * Call once at the start of each sync run so `loadEnabledSources` always finds
 * explicit rows rather than relying on the "absent → enabled" fallback.
 *
 * Non-fatal: a failure here must not abort the sync.
 */
export async function bootstrapAutomatedConnections(businessId: number): Promise<void> {
  try {
    const automatedSlugs = await db
      .select({ slug: bidSourceCatalogTable.slug })
      .from(bidSourceCatalogTable)
      .where(eq(bidSourceCatalogTable.automatedDiscovery, true));

    if (automatedSlugs.length === 0) return;

    await db
      .insert(bidSourceConnectionsTable)
      .values(
        automatedSlugs.map(({ slug }) => ({
          businessId,
          catalogSlug:      slug,
          enabled:          true,
          connectionStatus: "not_configured" as const,
        }))
      )
      .onConflictDoNothing();
  } catch (err) {
    console.warn("[bid-sync] bootstrapAutomatedConnections failed:", err);
  }
}

// ── Enable-state helpers ──────────────────────────────────────────────────────

/**
 * Load the enabled flag for every source connection a business has configured.
 * Returns a Map<catalogSlug, boolean>.
 *
 * Absent rows (no connection record exists yet) are NOT included in the map.
 * Call `isEnabled()` to resolve those as the correct default for the context.
 */
export async function loadEnabledSources(businessId: number): Promise<Map<string, boolean>> {
  try {
    const rows = await db
      .select({ catalogSlug: bidSourceConnectionsTable.catalogSlug, enabled: bidSourceConnectionsTable.enabled })
      .from(bidSourceConnectionsTable)
      .where(eq(bidSourceConnectionsTable.businessId, businessId));
    return new Map(rows.map((r) => [r.catalogSlug, r.enabled]));
  } catch {
    return new Map(); // fail open — all sources treated as enabled
  }
}

/**
 * Returns whether a given source should be synced.
 * Defaults to `true` when no connection row exists (backward compat: businesses
 * created before the source-catalog feature are not silently disabled).
 */
export function isEnabled(map: Map<string, boolean>, slug: string): boolean {
  return map.get(slug) ?? true;
}

// ── Sync health writer ────────────────────────────────────────────────────────

/**
 * Write per-source sync health to `bid_source_connections`.
 * Creates the row on first sync; updates health fields on conflict.
 *
 * CRITICAL: `enabled` is NEVER included in the conflict-update set.
 * User-configured enable/disable state must survive every sync run.
 * New rows get `enabled: true` only as an insert default so legacy businesses
 * whose connection rows don't exist yet don't silently lose their sources.
 *
 * @param siteHealthJson  Optional JSON string (Array<SiteHealthRecord>) for
 *                        multi-site scrapers that report per-site outcomes.
 *                        Stored in `site_health_json` for display in the UI.
 */
export async function writeConnectionHealth(
  businessId:      number,
  catalogSlug:     string,
  success:         boolean,
  errorMsg?:       string | null,
  recordsImported?: number,
  siteHealthJson?: string | null,
): Promise<void> {
  try {
    const now = new Date();
    if (success) {
      const healthUpdate = {
        lastSyncAt:        now,
        lastSyncSuccessAt: now,
        connectionStatus:  "active",
        lastSyncError:     null as string | null,
        recordsImported:   recordsImported ?? null,
        siteHealthJson:    siteHealthJson ?? null,
        updatedAt:         now,
      };
      await db
        .insert(bidSourceConnectionsTable)
        .values({ businessId, catalogSlug, enabled: true, ...healthUpdate })
        .onConflictDoUpdate({
          target: [bidSourceConnectionsTable.businessId, bidSourceConnectionsTable.catalogSlug],
          set:    healthUpdate, // `enabled` excluded — user controls this column
        });
    } else {
      const healthUpdate = {
        lastSyncAt:       now,
        connectionStatus: "error",
        lastSyncError:    errorMsg ?? "Sync failed",
        recordsImported:  recordsImported ?? null,
        siteHealthJson:   siteHealthJson ?? null,
        updatedAt:        now,
      };
      await db
        .insert(bidSourceConnectionsTable)
        .values({ businessId, catalogSlug, enabled: true, ...healthUpdate })
        .onConflictDoUpdate({
          target: [bidSourceConnectionsTable.businessId, bidSourceConnectionsTable.catalogSlug],
          set:    healthUpdate, // `enabled` excluded — lastSyncSuccessAt also preserved on error
        });
    }
  } catch (err) {
    console.warn(`[bid-sync] writeConnectionHealth(${catalogSlug}) failed:`, err);
  }
}
