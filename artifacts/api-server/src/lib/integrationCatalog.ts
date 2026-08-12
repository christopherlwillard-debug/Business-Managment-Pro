/**
 * Static catalog of supported integrations + credential test functions.
 *
 * Adding a new integration: add an entry to INTEGRATION_CATALOG and a test
 * function to CREDENTIAL_TESTERS. The routes/integrations.ts endpoint and the
 * frontend card system pick it up automatically.
 *
 * SECURITY: Test functions receive the *proposed new* credential from the user.
 * They must NEVER log it, return it, or persist it — only return {ok, error}.
 * setCredential() persists only after a successful test.
 */

import { getCredential } from "./credentialManager.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CredentialType = "api_key" | "client_secret_pair" | "none";
export type IntegrationCategory = "procurement" | "financial" | "fuel_maps" | "ai" | "communication";
export type IntegrationScope = "platform" | "business";

export interface IntegrationDef {
  slug:                 string;
  name:                 string;
  shortName:            string;
  description:          string;
  category:             IntegrationCategory;
  scope:                IntegrationScope;
  credentialType:       CredentialType;
  /** Label shown above the credential input(s). */
  credentialLabel:      string;
  /** Help text explaining where to get the credential. */
  credentialHelp:       string;
  /** Link to the integration's API key / account page. */
  docsUrl?:             string;
  /** Primary process.env var used as fallback when no DB credential is stored. */
  envFallback?:         string;
  /**
   * Number of days before expiry to show a renewal reminder.
   * SAM.gov system accounts expire annually — set to 365.
   */
  renewalPeriodDays?:   number;
  /**
   * True if this integration is managed by Replit (OAuth, etc.) and does not
   * support credential replacement via the UI.
   */
  managed?:             boolean;
  managedNote?:         string;
  /** Field definitions for multi-field credentials (e.g., clientId + secret). */
  fields?:              Array<{ key: string; label: string; placeholder?: string; sensitive?: boolean }>;
}

export interface TestResult {
  ok:     boolean;
  error?: string;
}

// ── Catalog ───────────────────────────────────────────────────────────────────

export const INTEGRATION_CATALOG: IntegrationDef[] = [
  // ── Government & Procurement ────────────────────────────────────────────────
  {
    slug:              "sam_gov",
    name:              "SAM.gov Federal Contracting",
    shortName:         "SAM.gov",
    description:       "Finds federal contract opportunities, solicitations, and awards from the System for Award Management. Powers the Federal tab in Bid Opportunities.",
    category:          "procurement",
    scope:             "platform",
    credentialType:    "api_key",
    credentialLabel:   "API Key",
    credentialHelp:    "Get a free API key from SAM.gov System Account. Note: SAM.gov system account keys expire annually — set a renewal reminder.",
    docsUrl:           "https://open.gsa.gov/api/get-started/",
    envFallback:       "SAM_GOV_API_KEY",
    renewalPeriodDays: 365,
  },

  // ── Fuel & Maps ─────────────────────────────────────────────────────────────
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

  // ── Financial ───────────────────────────────────────────────────────────────
  {
    slug:              "plaid",
    name:              "Plaid Banking",
    shortName:         "Plaid",
    description:       "Connects bank accounts to import transactions, view balances, and enable bank reconciliation. Credentials are per-environment (sandbox/development/production).",
    category:          "financial",
    scope:             "platform",
    credentialType:    "client_secret_pair",
    credentialLabel:   "Client Credentials",
    credentialHelp:    "Get your Client ID and Secret from the Plaid Dashboard. Use Sandbox credentials for testing, Production for live data.",
    docsUrl:           "https://dashboard.plaid.com/developers/keys",
    envFallback:       "PLAID_SECRET",
    fields: [
      { key: "clientId", label: "Client ID",        placeholder: "6abc...",   sensitive: false },
      { key: "secret",   label: "Secret",            placeholder: "xxxxxx...", sensitive: true  },
    ],
  },

  // ── AI & Intelligence ───────────────────────────────────────────────────────
  {
    slug:              "openai",
    name:              "OpenAI (AI Summaries)",
    shortName:         "OpenAI",
    description:       "Powers AI bid summaries, fit analysis, and procurement education explanations. Managed through Replit's AI Integrations proxy.",
    category:          "ai",
    scope:             "platform",
    credentialType:    "none",
    credentialLabel:   "Managed",
    credentialHelp:    "This integration is managed through Replit's AI Integrations system. No manual key management is required.",
    managed:           true,
    managedNote:       "Managed via Replit AI Integrations — no key needed.",
  },

  // ── Communication ───────────────────────────────────────────────────────────
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

// ── Dispatcher ────────────────────────────────────────────────────────────────

const TESTERS: Record<string, (value: string) => Promise<TestResult>> = {
  sam_gov:     testSamGov,
  eia:         testEia,
  google_maps: testGoogleMaps,
  plaid:       testPlaid,
};

/** Test a proposed new credential value. Returns {ok, error}. Never logs the value. */
export async function testCredential(slug: string, value: string): Promise<TestResult> {
  const tester = TESTERS[slug];
  if (!tester) return { ok: false, error: `No test available for integration "${slug}".` };
  return tester(value);
}

/** Test the CURRENTLY ACTIVE credential for a slug (from cache/env). */
export async function testCurrentCredential(slug: string): Promise<TestResult> {
  const def = INTEGRATION_CATALOG.find(d => d.slug === slug);
  if (!def) return { ok: false, error: "Unknown integration." };
  if (def.managed) return { ok: true }; // Managed integrations are always "ok" to test

  const current = getCredential(slug, def.envFallback);
  if (!current) return { ok: false, error: "No credential configured." };
  return testCredential(slug, current);
}

/** Look up an integration definition by slug. */
export function findIntegration(slug: string): IntegrationDef | undefined {
  return INTEGRATION_CATALOG.find(d => d.slug === slug);
}
