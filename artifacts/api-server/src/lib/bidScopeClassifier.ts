/**
 * Bid scope classifier — determines the PRIMARY capability scope of an opportunity
 * BEFORE it gets assigned to a business. This is the core gate that prevents
 * asphalt/paving opportunities from being assigned to flooring/GC businesses and vice versa.
 *
 * Priority order: NAICS code (authoritative) → title keyword match → unknown
 */

export interface ScopeClassification {
  /** Primary capability category key, or null when uncertain */
  primaryCategory: string | null;
  /** All matching categories (may be multiple) */
  allCategories: string[];
  /** How confident we are in the classification */
  confidence: "high" | "medium" | "low";
  /** What method was used */
  method: "naics" | "title_keywords" | "unknown";
  /** Human-readable note for debugging / UI display */
  note: string | null;
}

export type DataCompleteness = "complete" | "partial" | "needs_verification" | "unknown";

// ── NAICS → scope mapping ─────────────────────────────────────────────────────
// Authoritative mapping — mirrors bidCategories.ts NAICS lists.
// When NAICS is present this always wins over title keywords.
const NAICS_SCOPE: Record<string, string> = {
  // Asphalt & Paving (EXCLUSIVE — only asphalt_sealing business does this)
  "237310": "asphalt",            // Highway, Street, and Bridge Construction

  // Site Work & Excavation (can overlap with asphalt for heavy civil)
  "238910": "site_work",          // Site preparation / excavation
  "237990": "site_work",          // Other heavy and civil engineering
  "237110": "site_work",          // Water and sewer line construction

  // Dump & Waste Hauling
  "562111": "dump_waste",         // Solid waste collection
  "562119": "dump_waste",         // Other waste collection
  "562910": "dump_waste",         // Remediation/cleanup (non-hazardous scope only)

  // Industrial Maintenance (GC capability — NOT asphalt)
  "811310": "industrial_maintenance", // Commercial/industrial machinery repair
  "332312": "industrial_maintenance", // Fabricated structural metal manufacturing
  "332313": "industrial_maintenance", // Plate work / welding fabrication
  "332410": "industrial_maintenance", // Power boiler and heat exchanger manufacturing
  "332420": "industrial_maintenance", // Metal tank manufacturing
  "238190": "industrial_maintenance", // Other foundation/structure/building exterior
  "238290": "industrial_maintenance", // Other building equipment contractors

  // Manufactured Homes (GC capability)
  "236118": "mfg_homes",          // Residential remodelers (MH setup/completion)
  "238310": "mfg_homes",          // Drywall & insulation — MH primary
  "238350": "mfg_homes",          // Finish carpentry — MH primary

  // Flooring (GC capability)
  "238330": "flooring",           // Flooring contractors
  "238340": "flooring",           // Tile and terrazzo

  // General Contracting (broad)
  "236115": "general_contracting",
  "236116": "general_contracting",
  "238110": "general_contracting", // Poured concrete
  "238140": "general_contracting", // Masonry/stonework
  "238160": "general_contracting", // Roofing
  "238170": "general_contracting", // Siding/sheet metal
  "238220": "general_contracting", // Plumbing, heating & A/C (MH also)
  "238320": "general_contracting", // Painting & wall covering
  "238390": "general_contracting", // Other building finishing contractors
  "238990": "general_contracting", // Other specialty trade contractors
  // Building / Park / Facility Maintenance
  "561210": "general_contracting", // Facilities support services
  "561499": "general_contracting", // All other building service contractors
  // Hauling / Trucking
  "484110": "dump_waste",          // General freight trucking, local (dump-truck hauling)
};

// ── NAICS sector exclusion list ───────────────────────────────────────────────
// Two-digit NAICS sector prefixes that are clearly outside construction,
// maintenance, or facility services. When a NAICS code falls in one of these
// sectors AND is NOT explicitly mapped in NAICS_SCOPE (which takes priority),
// the opportunity is classified as "excluded" at high confidence so it is
// rejected before insertion.
//
// Sectors NOT listed here are allowed through as ambiguous (confidence: "low"):
//   23  = Construction (all)
//   56  = Administrative / Support / Waste Management Services
//   81  = Other Services (repair/maintenance)
//   Partial 48 = Transportation (484 trucking is in NAICS_SCOPE and wins first)
//   Partial 33 = Manufacturing (332xxx welding/fab codes are in NAICS_SCOPE)
const EXCLUDED_NAICS_SECTORS = new Set([
  "11",  // Agriculture, Forestry, Fishing & Hunting (e.g. animal/plant inspection)
  "21",  // Mining, Quarrying, Oil & Gas Extraction
  "22",  // Utilities (electric, gas, water — not construction)
  "31",  // Manufacturing — food, textile, apparel, wood, paper
  "32",  // Manufacturing — chemicals, plastics, rubber, stone/glass/concrete products
  "33",  // Manufacturing — metals, machinery, electronics, vehicles, sporting goods
         //   (exceptions like 332312 welding fab ARE in NAICS_SCOPE and take priority above)
  "42",  // Wholesale Trade
  "44",  // Retail Trade
  "45",  // Retail Trade (continued)
  "48",  // Transportation & Warehousing (484110 trucking is in NAICS_SCOPE, wins first)
  "49",  // Transportation & Warehousing (continued — couriers, warehousing)
  "51",  // Information (media, publishing, software, broadcasting)
  "52",  // Finance & Insurance
  "53",  // Real Estate & Rental & Leasing (equipment rental etc.)
  "54",  // Professional, Scientific & Technical Services
  "55",  // Management of Companies & Enterprises
  "61",  // Educational Services
  "62",  // Health Care & Social Assistance (medical devices, pharmaceuticals)
  "71",  // Arts, Entertainment & Recreation (gym equipment NAICS 339920 → sector 33,
         //   but also 71xxxx attractions, spectator sports, fitness centers)
  "72",  // Accommodation & Food Services
]);

// ── Title keyword scope rules ─────────────────────────────────────────────────
// Applied in order when NAICS is absent or ambiguous.
// The FIRST rule whose ANY keyword matches the lowercased title wins.
// Confidence: terms in HIGH_CONFIDENCE_ASPHALT trigger "high" confidence gate.

/** Asphalt-specific terms — HIGH confidence. Title match → asphalt ONLY. */
const ASPHALT_HIGH_CONFIDENCE = [
  "paving", "asphalt", "sealcoat", "seal coat", "sealcoating",
  "crack seal", "crack-seal", "crack filling",
  "pavement marking", "parking lot marking", "road marking",
  "pavement overlay", "road overlay", "road resurfacing", "pavement resurfacing",
  "asphalt overlay", "asphalt milling", "pavement milling",
  "blacktop", "tarmac", "asphalt repair", "asphalt patching", "pothole patching",
  "asphalt replacement", "asphalt maintenance", "parking lot sealcoat",
];

/** Asphalt-adjacent terms — MEDIUM confidence (use with caution). */
const ASPHALT_MEDIUM_CONFIDENCE = [
  "pavement",       // can appear in general civil context
  "road paving",    // more specific than just "road"
];

interface TitleScopeRule {
  scope: string;
  confidence: "high" | "medium";
  keywords: string[];
}

const TITLE_SCOPE_RULES: TitleScopeRule[] = [
  // ── Asphalt / Paving — HIGHEST priority. Exclusive to asphalt_sealing business. ──
  {
    scope:      "asphalt",
    confidence: "high",
    keywords:   ASPHALT_HIGH_CONFIDENCE,
  },
  {
    scope:      "asphalt",
    confidence: "medium",
    keywords:   ASPHALT_MEDIUM_CONFIDENCE,
  },

  // ── Waste / Hauling ──
  {
    scope:      "dump_waste",
    confidence: "high",
    keywords:   [
      "debris removal", "junk removal", "trash removal", "waste removal",
      "site cleanup services", "cleanout service", "demolition debris",
      "roll-off container", "dumpster service", "rubbish removal", "waste hauling",
    ],
  },

  // ── Industrial Maintenance ──
  {
    scope:      "industrial_maintenance",
    confidence: "high",
    keywords:   [
      "plant maintenance", "industrial maintenance", "equipment repair and maintenance",
      "boiler repair", "heat exchanger", "tank inspection", "tank repair",
      "turnaround maintenance", "outage maintenance", "piping repair",
      "industrial facility maintenance", "refinery maintenance",
      "chemical plant maintenance", "welding fabrication services",
    ],
  },

  // ── Manufactured Homes ──
  {
    scope:      "mfg_homes",
    confidence: "high",
    keywords:   [
      "manufactured home", "mobile home", "modular home", "HUD home",
      "manufactured housing", "mh installation", "manufactured home setup",
    ],
  },

  // ── Flooring (specific — not just "floor") ──
  {
    scope:      "flooring",
    confidence: "high",
    keywords:   [
      "flooring installation", "carpet installation", "LVP installation",
      "vinyl plank flooring", "hardwood floor installation", "resilient flooring",
      "floor covering installation", "tile installation", "carpet replacement",
      "floor replacement", "luxury vinyl plank",
    ],
  },

  // ── Site Work ──
  {
    scope:      "site_work",
    confidence: "medium",
    keywords:   [
      "excavation services", "site preparation", "earthwork",
      "stormwater management", "erosion control", "grading services",
    ],
  },
];

// ── Core classifier ───────────────────────────────────────────────────────────

/**
 * Classifies the primary scope of a bid opportunity.
 *
 * Uses NAICS code first (authoritative), then falls back to title keyword
 * matching for local/state bids that have no NAICS code.
 */
export function classifyOpportunityScope(
  title: string,
  naicsCode: string | null,
  _source: string,
): ScopeClassification {
  // 1. NAICS code — highest authority when present
  if (naicsCode) {
    const mappedScope = NAICS_SCOPE[naicsCode] ?? null;
    if (mappedScope) {
      return {
        primaryCategory: mappedScope,
        allCategories:   [mappedScope],
        confidence:      "high",
        method:          "naics",
        note:            `NAICS ${naicsCode} → ${mappedScope}`,
      };
    }
    // NAICS present but unmapped — check whether its sector is clearly excluded
    const sector2 = naicsCode.slice(0, 2);
    if (EXCLUDED_NAICS_SECTORS.has(sector2)) {
      return {
        primaryCategory: "excluded",
        allCategories:   ["excluded"],
        confidence:      "high",
        method:          "naics",
        note:            `NAICS ${naicsCode} (sector ${sector2}) is outside construction/maintenance scope — excluded`,
      };
    }

    // NAICS is present, not mapped, and not in an excluded sector (likely a rare
    // construction-adjacent code). Allow through as ambiguous.
    return {
      primaryCategory: null,
      allCategories:   [],
      confidence:      "low",
      method:          "naics",
      note:            `NAICS ${naicsCode} not mapped to any capability category`,
    };
  }

  // 2. Title keyword matching — for local bids with no NAICS code
  const titleLower = title.toLowerCase();

  for (const rule of TITLE_SCOPE_RULES) {
    for (const kw of rule.keywords) {
      if (titleLower.includes(kw.toLowerCase())) {
        return {
          primaryCategory: rule.scope,
          allCategories:   [rule.scope],
          confidence:      rule.confidence,
          method:          "title_keywords",
          note:            `Title match: "${kw}" → ${rule.scope}`,
        };
      }
    }
  }

  // 3. No classification possible
  return {
    primaryCategory: null,
    allCategories:   [],
    confidence:      "low",
    method:          "unknown",
    note:            null,
  };
}

// ── Business type compatibility gate ─────────────────────────────────────────

/**
 * Scopes that EXCLUSIVELY belong to the asphalt_sealing business.
 * An opportunity with these scopes must NOT be inserted for a GC business.
 */
const ASPHALT_EXCLUSIVE_SCOPES = new Set(["asphalt"]);

/**
 * Scopes that are NOT appropriate for an asphalt_sealing business.
 * Flooring and MFG homes belong to Willard's Flooring / General Contracting.
 */
const NON_ASPHALT_SCOPES = new Set(["flooring", "mfg_homes"]);

/** True only for a confidently classified asphalt opportunity eligible for GC-to-asphalt routing. */
export function isAsphaltCrossRouteCandidate(
  title: string,
  naicsCode: string | null,
  source: string,
): boolean {
  const scope = classifyOpportunityScope(title, naicsCode, source);
  return scope.primaryCategory === "asphalt" && scope.confidence !== "low";
}

/** True only for confidently classified flooring or manufactured-home work eligible for GC routing. */
export function isGeneralContractingCrossRouteCandidate(
  title: string,
  naicsCode: string | null,
  source: string,
): boolean {
  const scope = classifyOpportunityScope(title, naicsCode, source);
  return (scope.primaryCategory === "flooring" || scope.primaryCategory === "mfg_homes")
    && scope.confidence !== "low";
}

/**
 * Returns true if this scope is compatible with the given business type.
 *
 * Conservative by design: when scope is unknown or confidence is low,
 * we allow the opportunity through for BOTH business types. We only gate
 * on high-confidence classifications to avoid missing legitimate bids.
 *
 * @param scopeCategory  - The classified primary scope, or null when unknown.
 * @param confidence     - How confident we are in the classification.
 * @param businessType   - e.g. "asphalt_sealing" or "general_contracting"
 */
export function isScopeCompatibleWithBusiness(
  scopeCategory: string | null,
  confidence: "high" | "medium" | "low",
  businessType: string,
): boolean {
  // Low confidence or unknown scope → allow (inclusive default — never miss a bid)
  if (!scopeCategory || confidence === "low") return true;

  // "excluded" = NAICS code falls in a sector entirely outside construction/maintenance
  // (manufacturing, agriculture, health care, finance, etc.). Reject for ALL business types.
  if (scopeCategory === "excluded") return false;

  if (businessType === "asphalt_sealing") {
    // Asphalt business should NOT receive flooring/mfg_homes bids
    if (NON_ASPHALT_SCOPES.has(scopeCategory) && confidence === "high") return false;
    return true;
  } else {
    // GC/Flooring businesses should NOT receive exclusive asphalt/paving bids.
    // We already returned true for confidence === "low" above, so here
    // confidence is "high" | "medium" — both are sufficient to block asphalt.
    if (ASPHALT_EXCLUSIVE_SCOPES.has(scopeCategory)) return false;
    return true;
  }
}

// ── Data completeness assessment ──────────────────────────────────────────────

/**
 * Assesses how complete a bid record is based on the fields we expect from
 * a fully-specified solicitation. Incomplete records get a warning badge in the UI
 * so Willard knows to verify the source before acting on them.
 */
export function assessDataCompleteness(opp: {
  responseDeadline: string | null | undefined;
  naicsCode:        string | null | undefined;
  description:      string | null | undefined;
  agency:           string | null | undefined;
  url:              string | null | undefined;
}): DataCompleteness {
  const hasDeadline     = !!opp.responseDeadline;
  const hasNaics        = !!opp.naicsCode;
  const hasDescription  = !!(opp.description && opp.description.trim().length > 40);
  const hasAgency       = !!opp.agency;
  const hasUrl          = !!opp.url;

  const fieldScore = [hasDeadline, hasNaics, hasDescription, hasAgency, hasUrl]
    .filter(Boolean).length;

  if (fieldScore === 5) return "complete";
  if (fieldScore >= 3 && hasUrl) return "partial";
  if (fieldScore >= 2) return "partial";
  return "needs_verification";
}

// Export keyword lists for use in scraper improvements
export { ASPHALT_HIGH_CONFIDENCE };
