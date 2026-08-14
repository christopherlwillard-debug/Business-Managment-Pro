/**
 * Grants.gov API fetcher.
 *
 * Queries the Grants.gov v2 search API for small-business-eligible grant
 * opportunities.  Applies conservative rate-limiting (≤3 pages per run,
 * 25 results/page = max 75 results) and a post-fetch suppression filter
 * to drop medical research, basic science, foreign assistance, and university
 * education opportunities that are not relevant to a small trade contractor.
 *
 * No API key required — Grants.gov search is public.
 */

const GRANTS_GOV_SEARCH_URL = "https://api.grants.gov/v1/api/search2";

// CFDA number prefixes (first two digits) that should be suppressed.
// These represent federal program areas irrelevant to a small trade contractor.
const SUPPRESSED_CFDA_PREFIXES = new Set([
  "93", // HHS — primarily medical research, public health programs
  "47", // NSF — basic science and engineering research
  "98", // USAID — foreign assistance
  "84", // Dept of Education — university/K-12 education programs
  "19", // State Dept — international affairs and diplomacy
  "12", // Dept of Defense research (non-construction)
  "43", // NASA — space and aeronautics research
]);

// Opportunity types from Grants.gov fundingInstrumentType
// G = Grant, CA = Cooperative Agreement, PC = Procurement Contract, O = Other
// We accept G and CA; PC is a contract not a grant.
const ACCEPTED_INSTRUMENT_TYPES = new Set(["G", "CA"]);

export interface GrantsGovOpportunity {
  id:                  string;          // Grants.gov internal opportunity ID (number field)
  title:               string;
  agency:              string | null;
  description:         string | null;
  postedDate:          string | null;   // ISO date string
  deadline:            string | null;   // ISO date string (closeDate)
  fundingMin:          number | null;   // dollars
  fundingMax:          number | null;   // dollars
  opportunityType:     string;          // grant | cooperative_agreement | other
  grantCategories:     string[];        // derived category tags
  applicationUrl:      string;          // direct Grants.gov link
  cfdaNumbers:         string[];        // e.g. ["10.001", "10.773"]
  eligibilities:       string[];        // raw eligibility codes from API
  useOfFunds:          string | null;
}

export interface GrantsFetchResult {
  opportunities: GrantsGovOpportunity[];
  httpCallsAttempted: number;
  httpCallsAccepted: number;
  totalAvailable: number;
}

/**
 * Map Grants.gov fundingInstrumentType code to our opportunityType label.
 */
function mapFundingType(code: string): string {
  switch ((code ?? "").toUpperCase()) {
    case "G":  return "grant";
    case "CA": return "cooperative_agreement";
    case "PC": return "loan";  // rare: procurement contract treated as loan-like
    default:   return "other";
  }
}

/**
 * Derive human-readable category tags from a Grants.gov opportunity's fields.
 */
function deriveCategories(
  title:         string,
  description:   string | null,
  eligibilities: string[],
  cfdaNumbers:   string[],
): string[] {
  const tags = new Set<string>();
  const text = `${title} ${description ?? ""}`.toLowerCase();

  // Eligibility-based tags
  if (eligibilities.includes("07") || eligibilities.includes("99")) tags.add("small_business");
  if (eligibilities.includes("06") || text.includes("veteran"))     tags.add("veteran");

  // Content-based tags
  if (text.match(/rural|usda|agricultural|farm/))              tags.add("rural");
  if (text.match(/workforce|training|apprentice|hire|wioa/))   tags.add("workforce");
  if (text.match(/technology|digital|broadband|cyber|innovat/)) tags.add("technology");
  if (text.match(/equipment|machinery|vehicle|fleet/))         tags.add("equipment");
  if (text.match(/construction|infrastructure|building|renovation|renovation|repair|paving|road|bridge/)) tags.add("construction");
  if (text.match(/economic development|community development|revitalization/)) tags.add("economic_dev");
  if (text.match(/energy|renewable|solar|efficiency|sustainable/)) tags.add("energy");
  if (text.match(/export|international trade/))                tags.add("trade");

  // CFDA-based tags
  const cfdaPrefixes = cfdaNumbers.map((n) => n.split(".")[0]);
  if (cfdaPrefixes.includes("10")) tags.add("rural");    // USDA programs
  if (cfdaPrefixes.includes("17")) tags.add("workforce"); // DoL programs
  if (cfdaPrefixes.includes("11")) tags.add("economic_dev"); // Commerce/EDA

  return Array.from(tags);
}

/**
 * Determine if an opportunity should be suppressed based on CFDA numbers.
 * Returns true (suppress) if the opportunity falls into irrelevant program areas.
 */
function isSuppressedByCfda(cfdaNumbers: string[]): boolean {
  if (cfdaNumbers.length === 0) return false;
  // Only suppress if ALL CFDA numbers are in suppressed categories
  // (some opportunities span multiple programs)
  return cfdaNumbers.every((cfda) => {
    const prefix = cfda.split(".")[0] ?? "";
    return SUPPRESSED_CFDA_PREFIXES.has(prefix);
  });
}

/**
 * Parse a raw Grants.gov API hit into our normalized shape.
 */
function parseHit(hit: Record<string, unknown>): GrantsGovOpportunity | null {
  try {
    const id = String(hit["id"] ?? hit["opportunityId"] ?? "").trim();
    const title = String(hit["title"] ?? hit["opportunityTitle"] ?? "").trim();
    if (!id || !title) return null;

    // Instrument type filter — skip non-grant instruments at parse time
    const instrumentType = String(hit["fundingInstrumentType"] ?? hit["docType"] ?? "G");
    if (!ACCEPTED_INSTRUMENT_TYPES.has(instrumentType.toUpperCase())) {
      return null;
    }

    // Extract CFDA numbers (may be under synopsis or top-level)
    const synopsis = (hit["synopsis"] as Record<string, unknown>) ?? {};
    const awardDetails = (hit["award"] as Record<string, unknown>) ?? {};

    const rawCfda = (hit["cfdaList"] ?? synopsis["cfdaNumbers"] ?? []) as unknown[];
    const cfdaNumbers = rawCfda.map((c) => {
      if (typeof c === "string") return c;
      if (c && typeof c === "object" && "number" in c) return String((c as Record<string, unknown>)["number"]);
      return String(c);
    }).filter(Boolean);

    // CFDA suppression
    if (isSuppressedByCfda(cfdaNumbers)) return null;

    const rawElig = (synopsis["eligibilities"] ?? hit["eligibilities"] ?? []) as unknown[];
    const eligibilities = rawElig.map((e) => {
      if (typeof e === "string") return e;
      if (e && typeof e === "object" && "code" in e) return String((e as Record<string, unknown>)["code"]);
      return String(e);
    }).filter(Boolean);

    // Funding amounts
    const fundingMax = parseFloat(String(awardDetails["ceiling"] ?? hit["awardCeiling"] ?? "")) || null;
    const fundingMin = parseFloat(String(awardDetails["floor"] ?? hit["awardFloor"] ?? "")) || null;

    const agency = String(hit["agencyName"] ?? hit["agencyCode"] ?? "").trim() || null;
    const description = String(synopsis["text"] ?? hit["synopsis"] ?? hit["description"] ?? "").trim() || null;
    const postedDate = String(hit["openDate"] ?? hit["postedDate"] ?? "").trim() || null;
    const deadline = String(hit["closeDate"] ?? hit["responseDate"] ?? "").trim() || null;
    const opportunityNumber = String(hit["number"] ?? hit["opportunityNumber"] ?? id);

    const categories = deriveCategories(title, description, eligibilities, cfdaNumbers);
    const opportunityType = mapFundingType(instrumentType);

    return {
      id,
      title,
      agency,
      description,
      postedDate,
      deadline,
      fundingMin: fundingMin && !isNaN(fundingMin) ? Math.round(fundingMin) : null,
      fundingMax: fundingMax && !isNaN(fundingMax) ? Math.round(fundingMax) : null,
      opportunityType,
      grantCategories: categories,
      applicationUrl: `https://www.grants.gov/search-results-detail/${opportunityNumber}`,
      cfdaNumbers,
      eligibilities,
      useOfFunds: null, // not reliably available in API response; enriched from description
    };
  } catch {
    return null;
  }
}

/**
 * Fetch one page from the Grants.gov search API.
 * Returns null on network error or non-200 response.
 */
async function fetchPage(
  startRecordNum: number,
  rows: number = 25,
): Promise<{ hits: Record<string, unknown>[]; total: number } | null> {
  const body = {
    rows,
    startRecordNum,
    oppStatuses: ["posted", "forecasted"],
    // Eligibility codes: 07 = Small Businesses, 99 = For-Profit Organizations
    eligibilities: ["07", "99"],
    // Only grant and cooperative agreement instruments
    fundingInstrumentTypes: ["G", "CA"],
  };

  try {
    const resp = await fetch(GRANTS_GOV_SEARCH_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(15_000), // 15-second timeout per page
    });

    if (!resp.ok) {
      console.warn(`[grants-fetcher] Grants.gov returned ${resp.status}`);
      return null;
    }

    const json = (await resp.json()) as Record<string, unknown>;
    // API response shape: { data: { oppHits: [...], totalOppHits: number } }
    // or flat: { hits: [...], total: number }
    const data = (json["data"] as Record<string, unknown>) ?? json;
    const hits  = (data["oppHits"] ?? data["hits"] ?? []) as Record<string, unknown>[];
    const total = Number(data["totalOppHits"] ?? data["total"] ?? hits.length);

    return { hits, total };
  } catch (err) {
    console.warn("[grants-fetcher] fetch error:", err);
    return null;
  }
}

/**
 * Fetch up to maxPages pages of Grants.gov results, parse, filter, and return.
 */
export async function fetchGrantsGovOpportunities(
  maxPages = 3,
): Promise<GrantsFetchResult> {
  const PAGE_SIZE = 25;
  const allOpportunities: GrantsGovOpportunity[] = [];
  let httpCallsAttempted = 0;
  let httpCallsAccepted  = 0;
  let totalAvailable     = 0;
  const seenIds = new Set<string>();

  for (let page = 0; page < maxPages; page++) {
    httpCallsAttempted++;
    const result = await fetchPage(page * PAGE_SIZE, PAGE_SIZE);
    if (!result) break;

    httpCallsAccepted++;
    totalAvailable = result.total;

    for (const hit of result.hits) {
      const parsed = parseHit(hit);
      if (!parsed) continue;
      if (seenIds.has(parsed.id)) continue;
      seenIds.add(parsed.id);
      allOpportunities.push(parsed);
    }

    // Stop early if we've gotten all available results
    if ((page + 1) * PAGE_SIZE >= result.total) break;
  }

  console.log(
    `[grants-fetcher] Fetched ${allOpportunities.length} grant opportunities ` +
    `(${httpCallsAttempted} HTTP calls attempted, ${httpCallsAccepted} accepted, ` +
    `${totalAvailable} total available on Grants.gov)`
  );

  return { opportunities: allOpportunities, httpCallsAttempted, httpCallsAccepted, totalAvailable };
}
