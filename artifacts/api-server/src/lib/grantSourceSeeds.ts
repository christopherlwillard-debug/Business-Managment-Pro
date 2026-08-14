import { db } from "@workspace/db";
import { grantSourceCatalogTable } from "@workspace/db/schema";
import type { InsertGrantSourceCatalog } from "@workspace/db/schema";

/**
 * Canonical grant source catalog.
 *
 * Rules for `automatedDiscovery`:
 *   true  — a working automated integration exists in this codebase TODAY.
 *   false — no automated path; user must visit the site manually.
 *           Do NOT set true based on speculation.
 */
const GRANT_CATALOG_ENTRIES: InsertGrantSourceCatalog[] = [
  // ── Automated API sources ─────────────────────────────────────────────────
  {
    slug:               "grants_gov",
    name:               "Grants.gov",
    category:           "general",
    connectionMethod:   "api",
    automatedDiscovery: true,
    websiteUrl:         "https://www.grants.gov/search-grants",
    notes:              "Official federal grants database. Public API; no key required. Filtered to small-business and for-profit eligibility with grant instrument type only.",
  },

  // ── Manual / portal sources ───────────────────────────────────────────────
  {
    slug:               "sba_grants",
    name:               "SBA Small Business Grants",
    category:           "small_business",
    connectionMethod:   "manual",
    automatedDiscovery: false,
    websiteUrl:         "https://www.sba.gov/funding-programs/grants",
    notes:              "U.S. Small Business Administration grants and programs. Manual review required.",
  },
  {
    slug:               "usda_rural",
    name:               "USDA Rural Development",
    category:           "rural",
    connectionMethod:   "manual",
    automatedDiscovery: false,
    websiteUrl:         "https://www.rd.usda.gov/programs-services/all-programs",
    notes:              "USDA programs for rural businesses, housing, utilities, and infrastructure. Manual review required.",
  },
  {
    slug:               "ky_sbdc",
    name:               "KY Small Business Dev. Center",
    category:           "state_local",
    connectionMethod:   "manual",
    automatedDiscovery: false,
    websiteUrl:         "https://ksbdc.org/resources/",
    notes:              "Kentucky SBDC lists state and local small-business financing, grants, and programs. Manual review required.",
  },
  {
    slug:               "dol_workforce",
    name:               "DoL Workforce / WIOA Grants",
    category:           "workforce",
    connectionMethod:   "manual",
    automatedDiscovery: false,
    websiteUrl:         "https://www.dol.gov/agencies/eta/grants",
    notes:              "U.S. Department of Labor workforce training and WIOA grants for employers and job-training programs. Manual review required.",
  },
  {
    slug:               "eda_gov",
    name:               "EDA Economic Development",
    category:           "economic_dev",
    connectionMethod:   "manual",
    automatedDiscovery: false,
    websiteUrl:         "https://www.eda.gov/funding-opportunities",
    notes:              "U.S. Economic Development Administration grants for regional economic development, infrastructure, and business growth. Manual review required.",
  },
  {
    slug:               "ky_economic_dev",
    name:               "KY Economic Development",
    category:           "state_local",
    connectionMethod:   "manual",
    automatedDiscovery: false,
    websiteUrl:         "https://ced.ky.gov/Incentives",
    notes:              "Kentucky Cabinet for Economic Development — state incentives, tax credits, and programs for KY businesses. Manual review required.",
  },
  {
    slug:               "sba_community_advantage",
    name:               "SBA Community Advantage",
    category:           "small_business",
    connectionMethod:   "manual",
    automatedDiscovery: false,
    websiteUrl:         "https://www.sba.gov/partners/lenders/microloan-program",
    notes:              "SBA microloan and Community Advantage lending programs for small and underserved businesses. Note: primarily loans, not grants.",
  },
];

/** Exported for testing — use seedGrantSourceCatalog() to write to the database. */
export const _GRANT_CATALOG_ENTRIES_FOR_TEST = GRANT_CATALOG_ENTRIES;

/**
 * Idempotent seed — inserts grant catalog rows that don't yet exist.
 * Safe to call on every server boot.
 */
export async function seedGrantSourceCatalog(): Promise<void> {
  try {
    await db
      .insert(grantSourceCatalogTable)
      .values(GRANT_CATALOG_ENTRIES)
      .onConflictDoNothing({ target: grantSourceCatalogTable.slug });
    console.log(`[startup] seedGrantSourceCatalog: ${GRANT_CATALOG_ENTRIES.length} grant sources registered.`);
  } catch (err) {
    console.error("[startup] seedGrantSourceCatalog failed (non-fatal):", err);
  }
}

/**
 * Ensure every automatedDiscovery=true grant source has a connection row for this
 * business. Uses INSERT … ON CONFLICT DO NOTHING so any existing row (including a
 * user-disabled one) is left completely untouched.
 */
export async function bootstrapGrantConnections(businessId: number): Promise<void> {
  try {
    const { grantSourceConnectionsTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");

    const automatedSlugs = await db
      .select({ slug: grantSourceCatalogTable.slug })
      .from(grantSourceCatalogTable)
      .where(eq(grantSourceCatalogTable.automatedDiscovery, true));

    if (automatedSlugs.length === 0) return;

    await db
      .insert(grantSourceConnectionsTable)
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
    console.warn("[grant-sync] bootstrapGrantConnections failed:", err);
  }
}

/**
 * Write per-source grant sync health.
 * Creates the row on first sync; updates health fields on conflict.
 * CRITICAL: `enabled` is NEVER included in the conflict-update set.
 */
export async function writeGrantConnectionHealth(
  businessId:      number,
  catalogSlug:     string,
  success:         boolean,
  errorMsg?:       string | null,
  recordsImported?: number,
): Promise<void> {
  try {
    const { grantSourceConnectionsTable } = await import("@workspace/db/schema");
    const now = new Date();
    if (success) {
      const update = {
        lastSyncAt:        now,
        lastSyncSuccessAt: now,
        connectionStatus:  "active" as const,
        lastSyncError:     null as string | null,
        recordsImported:   recordsImported ?? null,
        updatedAt:         now,
      };
      await db
        .insert(grantSourceConnectionsTable)
        .values({ businessId, catalogSlug, enabled: true, ...update })
        .onConflictDoUpdate({
          target: [grantSourceConnectionsTable.businessId, grantSourceConnectionsTable.catalogSlug],
          set:    update,
        });
    } else {
      const update = {
        lastSyncAt:       now,
        connectionStatus: "error" as const,
        lastSyncError:    errorMsg ?? "Sync failed",
        recordsImported:  recordsImported ?? null,
        updatedAt:        now,
      };
      await db
        .insert(grantSourceConnectionsTable)
        .values({ businessId, catalogSlug, enabled: true, ...update })
        .onConflictDoUpdate({
          target: [grantSourceConnectionsTable.businessId, grantSourceConnectionsTable.catalogSlug],
          set:    update,
        });
    }
  } catch (err) {
    console.warn(`[grant-sync] writeGrantConnectionHealth(${catalogSlug}) failed:`, err);
  }
}
