/**
 * Static catalog of supported integrations + credential test functions.
 *
 * Adding a new integration: add an entry to INTEGRATION_CATALOG and, if it
 * has a testable credential, a function to CREDENTIAL_TESTERS.
 *
 * SECURITY: Test functions receive the *proposed new* credential from the user.
 * They must NEVER log it, return it, or persist it — only return {ok, error}.
 * setCredential() persists only after a successful test.
 *
 * Auto-sync integrations (autoSync: true) get their health from
 * bid_source_connections — do NOT mark automatedDiscovery sources as
 * "connected" based solely on catalog presence.
 */

import { getCredential } from "./credentialManager.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CredentialType =
  | "api_key"
  | "client_secret_pair"
  | "username_password"   // portal login: encrypted username + encrypted password
  | "portal_only"         // just a URL bookmark; no programmatic credential
  | "none";               // managed externally (OAuth, Replit-managed)

export type IntegrationCategory =
  | "procurement"          // federal/state bid discovery (API-keyed)
  | "procurement_auto"     // public auto-synced procurement sources (no credential needed)
  | "procurement_portal"   // procurement portals requiring manual login
  | "financial"
  | "fuel_maps"
  | "ai"
  | "communication"
  | "contractor_portal"    // supply/material portals
  | "equipment";           // equipment/auction portals

export type IntegrationScope = "platform" | "business";

export interface IntegrationDef {
  slug:                string;
  name:                string;
  shortName:           string;
  description:         string;
  category:            IntegrationCategory;
  scope:               IntegrationScope;
  credentialType:      CredentialType;
  /** Label shown above the credential input(s). */
  credentialLabel:     string;
  /** Help text explaining where to get the credential. */
  credentialHelp:      string;
  /** Link to the integration's API key / account page. */
  docsUrl?:            string;
  /** Default portal URL (editable per user). */
  defaultPortalUrl?:   string;
  /** Primary process.env var used as fallback when no DB credential is stored. */
  envFallback?:        string;
  /**
   * Number of days before expiry to show a renewal reminder.
   * SAM.gov system accounts expire annually.
   */
  renewalPeriodDays?:  number;
  /** True if this integration is managed by Replit (OAuth, etc.). */
  managed?:            boolean;
  managedNote?:        string;
  /** Field definitions for multi-field credentials (e.g., clientId + secret). */
  fields?:             Array<{ key: string; label: string; placeholder?: string; sensitive?: boolean }>;
  /**
   * Set true for public auto-synced sources that need no credential.
   * Status comes from bid_source_connections, not integration_credentials.
   */
  autoSync?:           boolean;
  /** bid_source_catalog.slug — links this integration to sync health data. */
  bidSourceSlug?:      string;
  /** Human-readable sync schedule for display (no credential needed sources). */
  syncSchedule?:       string;
  /**
   * If true, this is a forward-looking placeholder entry.
   * UI shows it as "Coming Soon" — no credential form rendered.
   */
  comingSoon?:         boolean;
  /** Note about credential scoping (platform-wide vs per-business). */
  scopeNote?:          string;
}

export interface TestResult {
  ok:     boolean;
  error?: string;
}

// ── Catalog ───────────────────────────────────────────────────────────────────

export const INTEGRATION_CATALOG: IntegrationDef[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // PROCUREMENT — API-keyed
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug:              "sam_gov",
    name:              "SAM.gov Federal Contracting",
    shortName:         "SAM.gov",
    description:       "Finds federal contract opportunities, solicitations, and awards from the System for Award Management. Powers the Federal tab in Bid Opportunities. SAM.gov system account keys expire annually.",
    category:          "procurement",
    scope:             "platform",
    credentialType:    "api_key",
    credentialLabel:   "API Key",
    credentialHelp:    "Get a free API key by creating a System Account at SAM.gov. Keys expire annually — set a reminder to renew before expiration to avoid losing bid discovery.",
    docsUrl:           "https://open.gsa.gov/api/get-started/",
    envFallback:       "SAM_GOV_API_KEY",
    renewalPeriodDays: 365,
    bidSourceSlug:     "sam_gov",
    syncSchedule:      "Daily at 7:00 AM",
    scopeNote:         "Platform-wide — covers all businesses.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROCUREMENT — Auto-synced public sources (no credential needed)
  // Status is always from bid_source_connections — never assumed "working" from
  // catalog presence alone.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug:              "ky_in_local",
    name:              "KY/IN Local Procurement",
    shortName:         "KY/IN Local",
    description:       "Scrapes public eProcurement portals for Kentucky and Indiana local government bid opportunities. No API key required — uses publicly accessible search pages.",
    category:          "procurement_auto",
    scope:             "platform",
    credentialType:    "none",
    credentialLabel:   "No credential required",
    credentialHelp:    "This source uses publicly accessible government procurement pages. No account or API key is needed.",
    docsUrl:           "https://emars.ky.gov/prd/supp/public/",
    autoSync:          true,
    bidSourceSlug:     "ky_in_local",
    syncSchedule:      "Daily at 7:00 AM",
  },
  {
    slug:              "usa_spending",
    name:              "USASpending Awards Intel",
    shortName:         "USASpending",
    description:       "Official U.S. Treasury open API for federal contract awards data. Used for comparable small-contract pricing intelligence in Bid Opportunities. No API key required.",
    category:          "procurement_auto",
    scope:             "platform",
    credentialType:    "none",
    credentialLabel:   "No credential required",
    credentialHelp:    "USASpending.gov provides a fully public REST API. No account or key is needed.",
    docsUrl:           "https://www.usaspending.gov/download_center/api",
    autoSync:          true,
    bidSourceSlug:     "usa_spending",
    syncSchedule:      "Daily at 7:00 AM",
  },
  {
    slug:              "sba_subnet",
    name:              "SBA SUBNet Subcontracting",
    shortName:         "SBA SUBNet",
    description:       "SBA's public portal listing subcontracting opportunities from federal prime contractors. Good for finding teaming and subcontract work. No credential required.",
    category:          "procurement_auto",
    scope:             "platform",
    credentialType:    "none",
    credentialLabel:   "No credential required",
    credentialHelp:    "SBA SUBNet uses a public search endpoint with no API key requirement.",
    docsUrl:           "https://eweb1.sba.gov/subnet/client/dsp_Landing.cfm",
    autoSync:          true,
    bidSourceSlug:     "sba_subnet",
    syncSchedule:      "Daily at 7:00 AM",
  },
  {
    slug:              "gsa_forecast",
    name:              "GSA Forecast",
    shortName:         "GSA Forecast",
    description:       "GSA eBuy forecast data for upcoming federal procurement opportunities. Useful for planning and early bid identification. No credential required.",
    category:          "procurement_auto",
    scope:             "platform",
    credentialType:    "none",
    credentialLabel:   "No credential required",
    credentialHelp:    "GSA publishes forecast data as a public feed. No account or API key is needed.",
    docsUrl:           "https://www.gsaelibrary.gsa.gov/",
    autoSync:          true,
    bidSourceSlug:     "gsa_forecast",
    syncSchedule:      "Daily at 7:00 AM",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROCUREMENT — Portal logins (require manual account registration)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug:              "bidnet_sovra",
    name:              "BidNet / SOVRA",
    shortName:         "BidNet",
    description:       "Subscription procurement platform serving hundreds of municipalities and state agencies. Store your login credentials here for quick portal access.",
    category:          "procurement_portal",
    scope:             "platform",
    credentialType:    "username_password",
    credentialLabel:   "Portal Login",
    credentialHelp:    "Register at BidNet/SOVRA for a contractor account. Free registration available; premium tiers unlock document download.",
    docsUrl:           "https://www.bidnet.com",
    defaultPortalUrl:  "https://www.bidnet.com",
    bidSourceSlug:     "bidnet_sovra",
  },
  {
    slug:              "demandstar",
    name:              "DemandStar",
    shortName:         "DemandStar",
    description:       "Subscription-based procurement network connecting government agencies with suppliers. Requires a paid account to download solicitation documents.",
    category:          "procurement_portal",
    scope:             "platform",
    credentialType:    "username_password",
    credentialLabel:   "Portal Login",
    credentialHelp:    "Register at DemandStar for a contractor account. Free browsing; paid plan for document access.",
    docsUrl:           "https://www.demandstar.com",
    defaultPortalUrl:  "https://www.demandstar.com",
    bidSourceSlug:     "demandstar",
  },
  {
    slug:              "bonfire",
    name:              "Bonfire Supplier Portal",
    shortName:         "Bonfire",
    description:       "Supplier portal used by many municipalities and county governments. Create a free Bonfire account to receive bid notifications and submit responses.",
    category:          "procurement_portal",
    scope:             "platform",
    credentialType:    "username_password",
    credentialLabel:   "Portal Login",
    credentialHelp:    "Create a free account at GoBonfire.com. Email/password login.",
    docsUrl:           "https://gobonfire.com",
    defaultPortalUrl:  "https://gobonfire.com",
    bidSourceSlug:     "bonfire",
  },
  {
    slug:              "planetbids",
    name:              "PlanetBids",
    shortName:         "PlanetBids",
    description:       "Bid management platform used by many state and local agencies. Store your login for quick access to agencies using PlanetBids.",
    category:          "procurement_portal",
    scope:             "platform",
    credentialType:    "username_password",
    credentialLabel:   "Portal Login",
    credentialHelp:    "Create a free vendor account at PlanetBids. Each agency may have separate registration.",
    docsUrl:           "https://www.planetbids.com",
    defaultPortalUrl:  "https://www.planetbids.com",
    bidSourceSlug:     "planetbids",
  },
  {
    slug:              "ky_vss",
    name:              "KY Vendor Self Service (VSS)",
    shortName:         "KY VSS",
    description:       "Kentucky Finance Cabinet Vendor Self Service portal for state procurement opportunities. Used for Kentucky state agency bids not on SAM.gov.",
    category:          "procurement_portal",
    scope:             "platform",
    credentialType:    "username_password",
    credentialLabel:   "Portal Login",
    credentialHelp:    "Register for a KY VSS vendor account at vss.ky.gov. The portal migrated from emars.ky.gov to the CGI Advantage 4 system at vss.ky.gov in 2024.",
    docsUrl:           "https://finance.ky.gov/eProcurement/Pages/default.aspx",
    defaultPortalUrl:  "https://vss.ky.gov/vssprod-ext/Advantage4",
    bidSourceSlug:     "ky_vss",
  },
  {
    slug:              "ky_emarketplace",
    name:              "KY eMarketplace",
    shortName:         "KY eMarketplace",
    description:       "Kentucky's statewide purchasing portal for small/informal purchases. Separate from VSS — covers micro-purchases and informal quotes.",
    category:          "procurement_portal",
    scope:             "platform",
    credentialType:    "portal_only",
    credentialLabel:   "Portal Bookmark",
    credentialHelp:    "KY eMarketplace is publicly accessible for searching. Create a vendor account to receive opportunity alerts.",
    docsUrl:           "https://emarketplace.ky.gov/",
    defaultPortalUrl:  "https://emarketplace.ky.gov/",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FINANCIAL
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug:              "plaid",
    name:              "Plaid Banking",
    shortName:         "Plaid",
    description:       "Connects bank accounts to import transactions, view balances, and enable bank reconciliation. Credentials are platform-wide — individual bank account links are managed from the Banking page.",
    category:          "financial",
    scope:             "platform",
    credentialType:    "client_secret_pair",
    credentialLabel:   "Client Credentials",
    credentialHelp:    "Get your Client ID and Secret from the Plaid Dashboard. Use Sandbox for testing, Production for live data.",
    docsUrl:           "https://dashboard.plaid.com/developers/keys",
    envFallback:       "PLAID_SECRET",
    fields: [
      { key: "clientId", label: "Client ID",  placeholder: "6abc...",   sensitive: false },
      { key: "secret",   label: "Secret",     placeholder: "xxxxxx...", sensitive: true  },
    ],
    scopeNote:         "Platform-wide. Individual bank account links are per-business from the Banking page.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FUEL & MAPS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug:              "eia",
    name:              "EIA Fuel Price Data",
    shortName:         "EIA API",
    description:       "Fetches weekly retail gasoline prices from the U.S. Energy Information Administration. Used for mileage cost calculations and fuel expense tracking.",
    category:          "fuel_maps",
    scope:             "platform",
    credentialType:    "api_key",
    credentialLabel:   "API Key",
    credentialHelp:    "Free API key — register at eia.gov/opendata. No expiration for standard access.",
    docsUrl:           "https://www.eia.gov/opendata/register.php",
    envFallback:       "EIA_API_KEY",
  },
  {
    slug:              "google_maps",
    name:              "Google Maps Platform",
    shortName:         "Google Maps",
    description:       "Powers address geocoding, route planning, and service coverage maps. Required for Route Planner and distance-based mileage calculations.",
    category:          "fuel_maps",
    scope:             "platform",
    credentialType:    "api_key",
    credentialLabel:   "API Key",
    credentialHelp:    "Create a key in Google Cloud Console with Geocoding API and Maps JavaScript API enabled. Restrict the key to your domain for production.",
    docsUrl:           "https://console.cloud.google.com/apis/credentials",
    envFallback:       "VITE_GOOGLE_API_KEY",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AI & INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug:              "openai",
    name:              "OpenAI (AI Summaries)",
    shortName:         "OpenAI",
    description:       "Powers AI bid summaries, fit analysis, and procurement education explanations. Managed through Replit's AI Integrations proxy — no manual key management needed.",
    category:          "ai",
    scope:             "platform",
    credentialType:    "none",
    credentialLabel:   "Managed",
    credentialHelp:    "This integration is managed through Replit's AI Integrations system. No manual key management is required.",
    managed:           true,
    managedNote:       "Managed via Replit AI Integrations — no key needed.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMUNICATION
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug:              "gmail",
    name:              "Gmail (Email Notifications)",
    shortName:         "Gmail",
    description:       "Sends invoice reminders, compliance alerts, and bid notifications via your Gmail account. Connected via Replit's OAuth integration.",
    category:          "communication",
    scope:             "platform",
    credentialType:    "none",
    credentialLabel:   "OAuth",
    credentialHelp:    "This integration uses OAuth managed by Replit. Re-connect via the Replit integrations panel if it stops working.",
    managed:           true,
    managedNote:       "Connected via Replit OAuth — managed externally.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTRACTOR PORTALS — Supply, materials, and trade accounts
  // Per-business credentials make sense here — GC and Asphalt Sealing may
  // have different accounts or pricing at the same supplier.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug:              "home_depot_pro",
    name:              "Home Depot Pro",
    shortName:         "Home Depot Pro",
    description:       "Pro Xtra contractor account for Home Depot. Store login for quick access to pro pricing, order history, and project accounts.",
    category:          "contractor_portal",
    scope:             "business",
    credentialType:    "username_password",
    credentialLabel:   "Pro Xtra Login",
    credentialHelp:    "Your Home Depot Pro Xtra account email and password. Register free at homedepot.com/c/pro_xtra.",
    docsUrl:           "https://www.homedepot.com/c/pro_xtra",
    defaultPortalUrl:  "https://www.homedepot.com/auth/view/signin",
    scopeNote:         "Per-business — GC and Asphalt Sealing can have separate Pro accounts.",
  },
  {
    slug:              "lowes_pro",
    name:              "Lowe's Pro",
    shortName:         "Lowe's Pro",
    description:       "Lowe's Pro account for contractor pricing and bulk ordering. Store login for quick access to pro pricing and order history.",
    category:          "contractor_portal",
    scope:             "business",
    credentialType:    "username_password",
    credentialLabel:   "Pro Account Login",
    credentialHelp:    "Your Lowe's Pro account email and password. Register free at lowes.com/l/pro.html.",
    docsUrl:           "https://www.lowes.com/l/pro.html",
    defaultPortalUrl:  "https://www.lowes.com/signin",
    scopeNote:         "Per-business.",
  },
  {
    slug:              "84_lumber",
    name:              "84 Lumber",
    shortName:         "84 Lumber",
    description:       "Regional building materials supplier with contractor-tier pricing. Store portal login for quick quote and order access.",
    category:          "contractor_portal",
    scope:             "business",
    credentialType:    "username_password",
    credentialLabel:   "Account Login",
    credentialHelp:    "Your 84 Lumber account credentials. Register at 84lumber.com.",
    docsUrl:           "https://www.84lumber.com",
    defaultPortalUrl:  "https://www.84lumber.com",
    scopeNote:         "Per-business.",
  },
  {
    slug:              "abc_supply",
    name:              "ABC Supply",
    shortName:         "ABC Supply",
    description:       "Wholesale roofing, windows, and siding distributor. Store your account login for quick order and invoice access.",
    category:          "contractor_portal",
    scope:             "business",
    credentialType:    "username_password",
    credentialLabel:   "Account Login",
    credentialHelp:    "Your ABC Supply account credentials. Register at abcsupply.com.",
    docsUrl:           "https://www.abcsupply.com",
    defaultPortalUrl:  "https://www.abcsupply.com",
    scopeNote:         "Per-business.",
  },
  {
    slug:              "fastenal",
    name:              "Fastenal",
    shortName:         "Fastenal",
    description:       "Industrial and construction fastener/supply distributor with contractor accounts. Store login for order tracking and account pricing.",
    category:          "contractor_portal",
    scope:             "business",
    credentialType:    "username_password",
    credentialLabel:   "Account Login",
    credentialHelp:    "Your Fastenal account credentials. Create an account at fastenal.com.",
    docsUrl:           "https://www.fastenal.com",
    defaultPortalUrl:  "https://www.fastenal.com",
    scopeNote:         "Per-business.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EQUIPMENT & AUCTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug:              "govplanet",
    name:              "GovPlanet",
    shortName:         "GovPlanet",
    description:       "Ritchie Bros. platform for government surplus heavy equipment. Store your bidder account login for quick access during active auctions.",
    category:          "equipment",
    scope:             "platform",
    credentialType:    "username_password",
    credentialLabel:   "Bidder Account Login",
    credentialHelp:    "Create a free bidder account at govplanet.com. Account approval required before bidding.",
    docsUrl:           "https://www.govplanet.com",
    defaultPortalUrl:  "https://www.govplanet.com/login",
  },
  {
    slug:              "ironplanet",
    name:              "IronPlanet",
    shortName:         "IronPlanet",
    description:       "Online heavy equipment marketplace (Ritchie Bros.). IronClad Assurance inspections. Excavators, skid steers, loaders, backhoes. Store account login.",
    category:          "equipment",
    scope:             "platform",
    credentialType:    "username_password",
    credentialLabel:   "Account Login",
    credentialHelp:    "Create an account at ironplanet.com. Approval required for bidding.",
    docsUrl:           "https://www.ironplanet.com",
    defaultPortalUrl:  "https://www.ironplanet.com/login",
  },
  {
    slug:              "gsa_auctions",
    name:              "GSA Auctions",
    shortName:         "GSA Auctions",
    description:       "Official U.S. GSA surplus auction portal. Fleet vehicles, heavy equipment, and trailers from federal agencies. Browse free; bidding requires a free GSA account.",
    category:          "equipment",
    scope:             "platform",
    credentialType:    "username_password",
    credentialLabel:   "GSA Account Login",
    credentialHelp:    "Register for a free account at gsaauctions.gov. Government ID verification may be required to bid.",
    docsUrl:           "https://gsaauctions.gov",
    defaultPortalUrl:  "https://gsaauctions.gov",
  },
  {
    slug:              "govdeals",
    name:              "GovDeals",
    shortName:         "GovDeals",
    description:       "Surplus property from U.S. municipalities and state agencies. Wide variety: vehicles, heavy equipment, tools, trailers. Free to browse; account needed to bid.",
    category:          "equipment",
    scope:             "platform",
    credentialType:    "username_password",
    credentialLabel:   "Account Login",
    credentialHelp:    "Create a free account at govdeals.com to bid on surplus property.",
    docsUrl:           "https://www.govdeals.com",
    defaultPortalUrl:  "https://www.govdeals.com",
  },
  {
    slug:              "purple_wave",
    name:              "Purple Wave",
    shortName:         "Purple Wave",
    description:       "Online auction for ag, construction, and government surplus equipment. Strong Midwest/Mid-South coverage. Store account login for quick bidding.",
    category:          "equipment",
    scope:             "platform",
    credentialType:    "username_password",
    credentialLabel:   "Account Login",
    credentialHelp:    "Create a free account at purplewave.com.",
    docsUrl:           "https://www.purplewave.com",
    defaultPortalUrl:  "https://www.purplewave.com",
  },

  // ── Future / Coming Soon ───────────────────────────────────────────────────
  {
    slug:              "hauling_platform",
    name:              "Hauling & Material Platform",
    shortName:         "Hauling",
    description:       "Future integration for load boards and material hauling platforms (e.g., Trux, HAULHUB). Scope: load matching for dump trucks and material delivery.",
    category:          "contractor_portal",
    scope:             "business",
    credentialType:    "none",
    credentialLabel:   "Coming Soon",
    credentialHelp:    "Integration with hauling load boards is planned for a future release.",
    comingSoon:        true,
  },
];

// ── Credential test functions ─────────────────────────────────────────────────
// Each function tests a *proposed* new credential. They must not log the value.

async function testSamGov(value: string): Promise<TestResult> {
  try {
    const url = new URL("https://api.sam.gov/opportunities/v2/search");
    url.searchParams.set("api_key", value);
    url.searchParams.set("limit",      "1");
    url.searchParams.set("postedFrom", "01/01/2024");
    url.searchParams.set("postedTo",   "01/02/2024");
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "API key rejected — check that your SAM.gov system account key is active and not expired." };
    if (res.status === 429)
      return { ok: false, error: "SAM.gov rate-limited the test request. The key may be valid — try again in a minute." };
    if (!res.ok)
      return { ok: false, error: `SAM.gov returned HTTP ${res.status}. Check key validity.` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Connection failed: ${(err as Error).message}` };
  }
}

async function testEia(value: string): Promise<TestResult> {
  try {
    const url = `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${value}&frequency=weekly&data[0]=value&facets[product][]=EPM0&facets[duoarea][]=NUS&sort[0][column]=period&sort[0][direction]=desc&length=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (res.status === 403 || res.status === 401)
      return { ok: false, error: "API key rejected by EIA." };
    if (!res.ok)
      return { ok: false, error: `EIA returned HTTP ${res.status}.` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Connection failed: ${(err as Error).message}` };
  }
}

async function testGoogleMaps(value: string): Promise<TestResult> {
  try {
    const params = new URLSearchParams({ address: "Louisville KY", key: value });
    const res  = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { ok: false, error: `Google Maps returned HTTP ${res.status}.` };
    const data = await res.json() as { status: string; error_message?: string };
    if (data.status === "REQUEST_DENIED")
      return { ok: false, error: data.error_message ?? "API key rejected by Google Maps. Check that the Geocoding API is enabled." };
    if (data.status === "OK" || data.status === "ZERO_RESULTS")
      return { ok: true };
    return { ok: false, error: `Unexpected Google Maps status: ${data.status}` };
  } catch (err) {
    return { ok: false, error: `Connection failed: ${(err as Error).message}` };
  }
}

async function testPlaid(value: string): Promise<TestResult> {
  try {
    let parsed: { clientId?: string; secret?: string };
    try {
      parsed = JSON.parse(value) as { clientId?: string; secret?: string };
    } catch {
      return { ok: false, error: "Invalid Plaid credential format." };
    }
    const { clientId, secret } = parsed;
    if (!clientId || !secret) return { ok: false, error: "Both Client ID and Secret are required." };

    const { PlaidApi, Configuration, PlaidEnvironments } = await import("plaid");
    const env = (process.env["PLAID_ENV"] ?? "sandbox") as keyof typeof PlaidEnvironments;
    const config = new Configuration({
      basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
      baseOptions: { headers: { "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret } },
    });
    const client = new PlaidApi(config);
    await client.institutionsGetById({ institution_id: "ins_3", country_codes: ["US" as never] });
    return { ok: true };
  } catch (err: unknown) {
    const detail = (err as { response?: { data?: { error_message?: string } } }).response?.data;
    if (detail?.error_message) return { ok: false, error: detail.error_message };
    return { ok: false, error: `Plaid test failed: ${(err as Error).message}` };
  }
}

/** Test that a portal URL is reachable (HEAD request, non-critical). */
async function testPortalUrl(value: string): Promise<TestResult> {
  try {
    // For portal-only / username_password: just verify the URL is reachable
    let url: string;
    try { url = JSON.parse(value) as string; } catch { url = value; }
    if (!url.startsWith("http")) return { ok: false, error: "URL must start with http:// or https://" };
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8_000), redirect: "follow" });
    if (res.status >= 500) return { ok: false, error: `Portal returned HTTP ${res.status} — may be down.` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Could not reach portal: ${(err as Error).message}` };
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

const TESTERS: Record<string, (value: string) => Promise<TestResult>> = {
  sam_gov:     testSamGov,
  eia:         testEia,
  google_maps: testGoogleMaps,
  plaid:       testPlaid,
  // Portal-type testers (URL reachability)
  bidnet_sovra:    testPortalUrl,
  demandstar:      testPortalUrl,
  bonfire:         testPortalUrl,
  planetbids:      testPortalUrl,
  ky_vss:          testPortalUrl,
  home_depot_pro:  testPortalUrl,
  lowes_pro:       testPortalUrl,
  govplanet:       testPortalUrl,
  ironplanet:      testPortalUrl,
  gsa_auctions:    testPortalUrl,
  govdeals:        testPortalUrl,
  purple_wave:     testPortalUrl,
};

/** Test a proposed new credential value. Returns {ok, error}. Never logs the value. */
export async function testCredential(slug: string, value: string): Promise<TestResult> {
  const tester = TESTERS[slug];
  if (!tester) return { ok: false, error: `No test function available for integration "${slug}".` };
  return tester(value);
}

/** Test the CURRENTLY ACTIVE credential for a slug (from cache/env). */
export async function testCurrentCredential(slug: string): Promise<TestResult> {
  const def = INTEGRATION_CATALOG.find(d => d.slug === slug);
  if (!def) return { ok: false, error: "Unknown integration." };
  if (def.managed) return { ok: true };
  if (def.autoSync) return { ok: true, error: "Auto-synced source — check sync health instead." };

  const current = getCredential(slug, def.envFallback);
  if (!current) return { ok: false, error: "No credential configured." };
  return testCredential(slug, current);
}

/** Look up an integration definition by slug. */
export function findIntegration(slug: string): IntegrationDef | undefined {
  return INTEGRATION_CATALOG.find(d => d.slug === slug);
}
