/**
 * Official source finder — resolves whether a government procurement opportunity
 * has a publicly accessible official government posting.
 *
 * Decision hierarchy:
 *  1. If the stored URL is already a .gov / .us / .mil domain → found (already official).
 *  2. If the source / sourceLabel corresponds to a known-official feed (SAM.gov, SBA
 *     SUBNet, GSA Forecast, KY eMarketplace) → found.
 *  3. For known aggregator patterns (BidNet, DemandStar, etc.) → attempt SAM.gov search
 *     by solicitation title (catches federal bids cross-listed on aggregators), then fall
 *     back to "aggregator_only".
 *  4. For unknown patterns → "aggregator_only".
 *
 * Guarantees:
 *  - Never claims a document was retrieved when access is paywalled or unavailable.
 *  - Never bypasses authentication or paywalls.
 *  - All network requests are read-only, unauthenticated, and subject to a short timeout.
 */

export type OfficialSourceStatus =
  | "found"                 // a publicly accessible official government URL was located
  | "aggregator_only"       // only aggregator listing available; official source not found
  | "subscription_required" // the listing itself requires a paid account to view
  | "not_checked";          // determination has not been attempted yet

export interface OfficialSourceResult {
  url:        string | null;     // the resolved official URL (null when not found)
  status:     OfficialSourceStatus;
  resolvedAt: Date;
  /** Human-readable label suitable for the UI status chip. */
  statusLabel: string;
  /** Optional detail shown as a tooltip / sub-label. */
  statusDetail: string | null;
}

// ── Patterns ──────────────────────────────────────────────────────────────────

/** Hostnames that indicate the URL is served by a known aggregator, not the government. */
const AGGREGATOR_HOSTNAMES: string[] = [
  "bidnetdirect.com",
  "www.bidnetdirect.com",
  "network.demandstar.com",
  "demandstar.com",
  "govwin.io",
  "bonfirehub.com",
  "planetbids.com",
  "periscope.bidsync.com",
  "bidsync.com",
  "emarketplace.state.pa.us",   // some state portals are official; PA happens to be
];

/** Aggregators where full documents (not just the listing summary) require subscription. */
const SUBSCRIPTION_AGGREGATORS: string[] = [
  "govwin.io",
];

/** Source / sourceLabel values that are already known-official feeds. */
const KNOWN_OFFICIAL_SOURCE_LABELS: RegExp[] = [
  /sam\.gov/i,
  /usa\s*spending/i,
  /sba\s*subnet/i,
  /gsa\s*forecast/i,
  /ky\s*emarketplace/i,
  /ky\s*vss/i,
];

const KNOWN_OFFICIAL_SOURCES: string[] = ["federal", "subnet", "gsa-forecast"];

// ── URL helpers ───────────────────────────────────────────────────────────────

function parseHostname(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase(); }
  catch { return null; }
}

function isOfficialGovDomain(url: string): boolean {
  const h = parseHostname(url);
  if (!h) return false;
  return (
    h.endsWith(".gov") ||
    h.endsWith(".mil") ||
    // US state / local government second-level domains
    h.endsWith(".state.ky.us") ||
    h.endsWith(".state.in.us") ||
    h.endsWith(".ky.us") ||
    h.endsWith(".in.us") ||
    h.endsWith(".us") && (h.includes(".county.") || h.includes(".city.") || h.includes(".village."))
  );
}

function isKnownAggregator(url: string): boolean {
  const h = parseHostname(url);
  if (!h) return false;
  return AGGREGATOR_HOSTNAMES.some((a) => h === a || h.endsWith("." + a));
}

function requiresSubscription(url: string): boolean {
  const h = parseHostname(url);
  if (!h) return false;
  return SUBSCRIPTION_AGGREGATORS.some((a) => h === a || h.endsWith("." + a));
}

// ── SAM.gov solicitation search ───────────────────────────────────────────────
// Attempts to find a federal posting that matches the opportunity by title.
// Returns the SAM.gov canonical URL if a confident match is found.

async function searchSamGov(
  title: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<string | null> {
  try {
    // Use the title's first 80 chars as search keyword (avoid overly long queries)
    const q = encodeURIComponent(title.slice(0, 80).trim());
    const url = `https://api.sam.gov/opportunities/v2/search?api_key=${apiKey}&q=${q}&limit=5&ptype=o,p,k,s,r,g,a`;
    const resp = await fetch(url, { signal });
    if (!resp.ok) return null;

    const data = await resp.json() as {
      totalRecords?: number;
      opportunitiesData?: Array<{ title: string; uiLink: string; noticeId: string }>;
    };
    const results = data.opportunitiesData ?? [];
    if (results.length === 0) return null;

    // Soft title match — check if any SAM.gov result shares ≥4 words with our title
    const ourWords = new Set(
      title.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3)
    );
    for (const r of results) {
      const theirWords = r.title.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/);
      const overlap = theirWords.filter((w) => ourWords.has(w)).length;
      if (overlap >= 4 && r.uiLink) {
        return r.uiLink;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function makeStatusLabel(status: OfficialSourceStatus): string {
  switch (status) {
    case "found":                 return "Official source found";
    case "aggregator_only":       return "Aggregator listing only";
    case "subscription_required": return "Documents require subscription";
    case "not_checked":           return "Source not checked";
  }
}

export function makeStatusDetail(
  status: OfficialSourceStatus,
  sourceLabel: string | null,
): string | null {
  switch (status) {
    case "found":
      return "A publicly accessible government posting was located.";
    case "aggregator_only":
      return `This listing is from ${sourceLabel ?? "an aggregator"} and links to their platform. A direct government posting was not found. Always verify the official solicitation before submitting a response.`;
    case "subscription_required":
      return `${sourceLabel ?? "This aggregator"} requires a paid subscription to access the full listing and documents. Search for the solicitation number on SAM.gov or the issuing agency's website for free access.`;
    case "not_checked":
      return null;
  }
}

/**
 * Performs a purely heuristic (no-HTTP) classification based on URL domain and
 * source metadata. Used at sync time to set an initial status without network I/O.
 */
export function classifySourceHeuristic(bid: {
  url:         string | null;
  source:      string;
  sourceLabel: string | null;
}): OfficialSourceStatus {
  // Known-official sources by code
  if (KNOWN_OFFICIAL_SOURCES.includes(bid.source)) return "found";

  // Known-official source labels
  if (bid.sourceLabel && KNOWN_OFFICIAL_SOURCE_LABELS.some((re) => re.test(bid.sourceLabel!))) {
    return "found";
  }

  // Official government domain URL
  if (bid.url && isOfficialGovDomain(bid.url)) return "found";

  // Known aggregator URL
  if (bid.url && isKnownAggregator(bid.url)) return "not_checked";

  // No URL at all
  if (!bid.url) return "not_checked";

  // Unrecognised non-.gov URL — could be county/city .org/.com — defer to check
  return "not_checked";
}

/**
 * Full official source resolution — makes real HTTP requests.
 * Should only be called from the on-demand API endpoint, not at sync time.
 *
 * @param bid - Minimal bid fields needed for resolution.
 * @param samApiKey - SAM.gov API key (optional; only used for aggregator lookups).
 */
export async function findOfficialSource(
  bid: {
    url:         string | null;
    source:      string;
    sourceLabel: string | null;
    title:       string;
    noticeId:    string;
  },
  samApiKey: string | null,
): Promise<OfficialSourceResult> {
  const now = new Date();

  // ── 1. Known-official by source code or label ─────────────────────────────
  if (KNOWN_OFFICIAL_SOURCES.includes(bid.source)) {
    return {
      url: bid.url, status: "found", resolvedAt: now,
      statusLabel: makeStatusLabel("found"),
      statusDetail: makeStatusDetail("found", bid.sourceLabel),
    };
  }
  if (bid.sourceLabel && KNOWN_OFFICIAL_SOURCE_LABELS.some((re) => re.test(bid.sourceLabel!))) {
    return {
      url: bid.url, status: "found", resolvedAt: now,
      statusLabel: makeStatusLabel("found"),
      statusDetail: makeStatusDetail("found", bid.sourceLabel),
    };
  }

  // ── 2. Already a .gov / .mil / .us official domain ────────────────────────
  if (bid.url && isOfficialGovDomain(bid.url)) {
    return {
      url: bid.url, status: "found", resolvedAt: now,
      statusLabel: makeStatusLabel("found"),
      statusDetail: "This link points directly to a government website.",
    };
  }

  // ── 3. Known aggregator — attempt SAM.gov cross-reference ─────────────────
  if (bid.url && isKnownAggregator(bid.url)) {
    if (requiresSubscription(bid.url)) {
      return {
        url: null, status: "subscription_required", resolvedAt: now,
        statusLabel: makeStatusLabel("subscription_required"),
        statusDetail: makeStatusDetail("subscription_required", bid.sourceLabel),
      };
    }

    // Try SAM.gov cross-reference (for federal bids listed on aggregators)
    if (samApiKey) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      try {
        const samUrl = await searchSamGov(bid.title, samApiKey, controller.signal);
        if (samUrl) {
          return {
            url: samUrl, status: "found", resolvedAt: now,
            statusLabel: makeStatusLabel("found"),
            statusDetail: "Found a matching federal posting on SAM.gov.",
          };
        }
      } finally {
        clearTimeout(timer);
      }
    }

    return {
      url: bid.url, status: "aggregator_only", resolvedAt: now,
      statusLabel: makeStatusLabel("aggregator_only"),
      statusDetail: makeStatusDetail("aggregator_only", bid.sourceLabel),
    };
  }

  // ── 4. Unrecognised URL — check if it's accessible as a .gov equivalent ──
  // For county/city sites ending in .org or .com that host official procurements:
  // we conservatively mark aggregator_only — the user should verify.
  return {
    url: bid.url, status: "aggregator_only", resolvedAt: now,
    statusLabel: makeStatusLabel("aggregator_only"),
    statusDetail: makeStatusDetail("aggregator_only", bid.sourceLabel),
  };
}
