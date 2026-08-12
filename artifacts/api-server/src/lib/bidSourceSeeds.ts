import { db } from "@workspace/db";
import { bidSourceCatalogTable } from "@workspace/db/schema";
import type { InsertBidSourceCatalog } from "@workspace/db/schema";

/**
 * Canonical source catalog.
 *
 * Rules for `automatedDiscovery`:
 *   true  — a working automated integration exists in this codebase TODAY
 *           (SAM.gov API, KY/IN public scraper, USASpending API, SBA SUBNet,
 *            GSA Forecast feed).
 *   false — no verified, legitimate automated path exists; manual portal visit
 *           is required.  Do NOT set true based on speculation or future plans.
 */
const CATALOG_ENTRIES: InsertBidSourceCatalog[] = [
  // ── Jobs / Contracts ──────────────────────────────────────────────────────
  {
    slug:               "sam_gov",
    name:               "SAM.gov Federal",
    category:           "jobs_contracts",
    connectionMethod:   "api",
    automatedDiscovery: true,
    notes:              "Official REST API; requires SAM_GOV_API_KEY environment variable.",
  },
  {
    slug:               "ky_in_local",
    name:               "KY/IN Local Procurement",
    category:           "jobs_contracts",
    connectionMethod:   "public_scrape",
    automatedDiscovery: true,
    notes:              "Public eProcurement pages for Kentucky and Indiana; no API key required.",
  },
  {
    slug:               "usa_spending",
    name:               "USASpending Awards Intel",
    category:           "jobs_contracts",
    connectionMethod:   "api",
    automatedDiscovery: true,
    notes:              "Official public USASpending.gov API; no key required. Provides comparable small-contract pricing data.",
  },
  {
    slug:               "sba_subnet",
    name:               "SBA SUBNet Subcontracting",
    category:           "jobs_contracts",
    connectionMethod:   "public_feed",
    automatedDiscovery: true,
    notes:              "Public SBA SUBNet search endpoint; no key required. Lists subcontracting opportunities from prime contractors.",
  },
  {
    slug:               "gsa_forecast",
    name:               "GSA Forecast",
    category:           "jobs_contracts",
    connectionMethod:   "public_feed",
    automatedDiscovery: true,
    notes:              "Public GSA eBuy procurement forecast feed.",
  },
  {
    slug:               "bidnet_sovra",
    name:               "BidNet / SOVRA",
    category:           "jobs_contracts",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Subscription platform; no public API. Must visit site to find and respond to bids.",
  },
  {
    slug:               "demandstar",
    name:               "DemandStar",
    category:           "jobs_contracts",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Subscription-based procurement network; no public API.",
  },
  {
    slug:               "bonfire",
    name:               "Bonfire",
    category:           "jobs_contracts",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Supplier portal used by many municipalities; no public API.",
  },
  {
    slug:               "planetbids",
    name:               "PlanetBids",
    category:           "jobs_contracts",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Supplier portal used by cities and counties; no public API.",
  },
  {
    slug:               "govwin",
    name:               "GovWin IQ",
    category:           "jobs_contracts",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Paid government intelligence service by Deltek; no public API.",
  },

  // ── Auctions / Surplus ────────────────────────────────────────────────────
  {
    slug:               "govdeals",
    name:               "GovDeals",
    category:           "auctions_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Public government surplus auction listings; no verified public data API.",
  },
  {
    slug:               "gsa_auctions",
    name:               "GSA Auctions",
    category:           "auctions_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Official GSA surplus property auctions; no data API available.",
  },
  {
    slug:               "public_surplus",
    name:               "Public Surplus",
    category:           "auctions_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Government surplus auction platform; no public API.",
  },
  {
    slug:               "municibid",
    name:               "Municibid",
    category:           "auctions_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Municipal surplus auction site; no public API.",
  },
  {
    slug:               "govplanet",
    name:               "GovPlanet",
    category:           "auctions_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Ritchie Bros. subsidiary for government equipment auctions; no public API.",
  },
  {
    slug:               "purple_wave",
    name:               "Purple Wave",
    category:           "auctions_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Online equipment and surplus auction; no public API.",
  },
  {
    slug:               "ritchie_bros",
    name:               "Ritchie Bros. / Rouse",
    category:           "auctions_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Heavy equipment and asset auction platform; no public API.",
  },
  {
    slug:               "ironplanet",
    name:               "IronPlanet",
    category:           "auctions_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Ritchie Bros. subsidiary for online equipment auctions; no public API.",
  },
  {
    slug:               "proxibid",
    name:               "Proxibid",
    category:           "auctions_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Multi-site online auction aggregator; no public API.",
  },
  {
    slug:               "bidspotter",
    name:               "BidSpotter",
    category:           "auctions_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Multi-site auction aggregator; no public API.",
  },

  // ── Hauling / Material ────────────────────────────────────────────────────
  {
    slug:               "dtl",
    name:               "DTL / Dump Truck Loads",
    category:           "hauling_material",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Broker dispatch platform for dump truck loads; no public API.",
  },
  {
    slug:               "trux",
    name:               "TRUX",
    category:           "hauling_material",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Proprietary hauling dispatch platform; no public API.",
  },
  {
    slug:               "wasteplace",
    name:               "WastePlace",
    category:           "hauling_material",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    notes:              "Waste services marketplace; no public API.",
  },
];

/** Exported for testing — use seedBidSourceCatalog() to write to the database. */
export const _CATALOG_ENTRIES_FOR_TEST = CATALOG_ENTRIES;

/**
 * Idempotent seed — inserts catalog rows that don't yet exist.
 * Safe to call on every server boot.
 */
export async function seedBidSourceCatalog(): Promise<void> {
  try {
    await db
      .insert(bidSourceCatalogTable)
      .values(CATALOG_ENTRIES)
      .onConflictDoNothing({ target: bidSourceCatalogTable.slug });
    console.log(`[startup] seedBidSourceCatalog: ${CATALOG_ENTRIES.length} sources registered.`);
  } catch (err) {
    console.error("[startup] seedBidSourceCatalog failed (non-fatal):", err);
  }
}
