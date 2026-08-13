import { db } from "@workspace/db";
import { equipmentSourcesTable } from "@workspace/db/schema";
import type { InsertEquipmentSource } from "@workspace/db/schema";

/**
 * Equipment source catalog — seeded at startup via upsert.
 *
 * automatedDiscovery rules (same philosophy as bidSourceSeeds):
 *   true  — a working automated integration exists TODAY in this codebase
 *           (currently none for equipment sources).
 *   false — no verified automated path exists; user must visit the portal
 *           manually.  Do NOT set true based on speculation.
 *
 * connection_method values:
 *   api              — official REST/GraphQL API (keys may be required)
 *   public_feed      — parseable public data (RSS/JSON/HTML) — future possibility
 *   portal_link_only — requires browser visit; no programmatic path today
 */
const EQUIPMENT_SOURCE_ENTRIES: InsertEquipmentSource[] = [

  // ── Government Surplus ────────────────────────────────────────────────────
  {
    slug:               "gsa_auctions",
    name:               "GSA Auctions",
    category:           "government_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://gsaauctions.gov",
    notes:              "Official U.S. General Services Administration surplus auction portal. No public REST API available for listing discovery. Fleet vehicles, heavy equipment, trailers, tools from federal agencies.",
  },
  {
    slug:               "govdeals",
    name:               "GovDeals",
    category:           "government_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://www.govdeals.com",
    notes:              "Surplus property from U.S. municipalities and state agencies. Wide variety: vehicles, heavy equipment, tools, trailers. Owned by Periscope Holdings / Sourcewell.",
  },
  {
    slug:               "municibid",
    name:               "Municibid",
    category:           "government_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://www.municibid.com",
    notes:              "Municipal surplus auction platform serving local governments. Strong coverage of Northeast/Mid-Atlantic. Equipment, vehicles, trailers.",
  },
  {
    slug:               "public_surplus",
    name:               "Public Surplus",
    category:           "government_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://www.publicsurplus.com",
    notes:              "Government surplus auction platform (Periscope Holdings / Sourcewell). Used by many city, county, and state agencies. Equipment, vehicles, materials.",
  },
  {
    slug:               "ky_state_surplus",
    name:               "KY State Surplus",
    category:           "government_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://finance.ky.gov/services/surplusprty/Pages/default.aspx",
    notes:              "Kentucky Finance and Administration Cabinet surplus property. State-agency surplus equipment; often conducted via GovDeals platform.",
  },
  {
    slug:               "in_state_surplus",
    name:               "IN State Surplus",
    category:           "government_surplus",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://www.in.gov/idoa/state-and-federal-surplus/",
    notes:              "Indiana Department of Administration surplus property program. State equipment and vehicles; often listed on GovDeals.",
  },

  // ── Commercial Heavy Equipment Auctions ───────────────────────────────────
  {
    slug:               "govplanet",
    name:               "GovPlanet",
    category:           "commercial_auction",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://www.govplanet.com",
    notes:              "Ritchie Bros. platform for government surplus heavy equipment (military, FEMA, federal). Excellent for earthmoving, trucks, and support equipment. No public API.",
  },
  {
    slug:               "ironplanet",
    name:               "IronPlanet",
    category:           "commercial_auction",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://www.ironplanet.com",
    notes:              "Online heavy equipment marketplace (Ritchie Bros.). IronClad Assurance inspections. Excavators, skid steers, loaders, backhoes. Account required to bid.",
  },
  {
    slug:               "rba",
    name:               "Ritchie Bros. Auctioneers",
    category:           "commercial_auction",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://www.rbauction.com",
    notes:              "World's largest industrial auctioneer. Live onsite and online auctions. Heavy construction, transportation, and ag equipment. No public listing API.",
  },
  {
    slug:               "purple_wave",
    name:               "Purple Wave",
    category:           "commercial_auction",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://www.purplewave.com",
    notes:              "Online auction for ag, construction, and government surplus equipment. Strong Midwest/Mid-South coverage. No public API.",
  },
  {
    slug:               "hibid",
    name:               "HiBid",
    category:           "commercial_auction",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://www.hibid.com",
    notes:              "Auction platform serving many local/regional auction houses. Wide variety including equipment, tools, and trailers. Public listing pages but no REST API.",
  },
  {
    slug:               "bidspotter",
    name:               "BidSpotter",
    category:           "commercial_auction",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://www.bidspotter.com",
    notes:              "Timed-auction platform used by many regional auction houses. Equipment, tools, business liquidations. No public API.",
  },

  // ── Equipment Marketplaces ────────────────────────────────────────────────
  {
    slug:               "equipment_trader",
    name:               "Equipment Trader",
    category:           "marketplace",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://www.equipmenttrader.com",
    notes:              "Dealer and private-party marketplace for construction, agriculture, and specialty equipment. Good for finding used asphalt sealing and earthmoving equipment.",
  },
  {
    slug:               "machinery_trader",
    name:               "MachineryTrader",
    category:           "marketplace",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://www.machinerytrader.com",
    notes:              "Dealer-focused heavy equipment classifieds. Excavators, skid steers, loaders, trailers. Search by category and proximity.",
  },
  {
    slug:               "facebook_marketplace",
    name:               "Facebook Marketplace",
    category:           "marketplace",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://www.facebook.com/marketplace",
    notes:              "Local private-party and dealer listings. Good for finding trailers, trucks, hand tools, and small equipment at regional prices. No API.",
  },
  {
    slug:               "craigslist",
    name:               "Craigslist",
    category:           "marketplace",
    connectionMethod:   "portal_link_only",
    automatedDiscovery: false,
    baseUrl:            "https://craigslist.org",
    notes:              "Local classified listings. Equipment and tools section often has regional deals. Manual search required per metro area.",
  },
];

/**
 * Idempotent upsert of the equipment source catalog.
 * Called at API server startup.
 */
export async function seedEquipmentSources(): Promise<void> {
  try {
    await db
      .insert(equipmentSourcesTable)
      .values(EQUIPMENT_SOURCE_ENTRIES)
      .onConflictDoNothing({ target: equipmentSourcesTable.slug });
    console.log(`[startup] seedEquipmentSources: ${EQUIPMENT_SOURCE_ENTRIES.length} sources registered.`);
  } catch (err) {
    // Non-fatal: table may not exist yet if migration hasn't run
    console.warn("[startup] seedEquipmentSources: skipped (table may not exist yet)", err instanceof Error ? err.message : err);
  }
}

export { EQUIPMENT_SOURCE_ENTRIES };
