/**
 * Canonical capability-profile definitions for each business type.
 *
 * These are used in two ways:
 *  1. As the seed payload inserted into `bid_capability_profiles` on first sync
 *     (idempotent — keyed on businessId + capabilityKey).
 *  2. As the fallback profile when no DB rows exist yet.
 *
 * Alongside the capability definitions, each business type has a set of
 * `CapabilitySearchGroup` entries that control how SAM.gov is queried.
 * The search groups keep NAICS codes and keywords grouped by capability
 * so the engine runs targeted searches instead of an N×M cross-product.
 *
 * Never hard-delete these constants — bidSync reads them as fallback.
 */

import type { CapabilitySearchGroup } from "./samGov.js";

export interface CapabilityDefinition {
  capabilityKey: string;
  name: string;
  description: string;           // AI prompt context — one tight paragraph
  naicsCodes: string[];
  keywords: string[];            // SAM.gov positive search terms (also used for scoring)
  negativeKeywords: string[];    // terms to deprioritise (title/desc match)
  equipment: string[];           // equipment available for scoring
  localKeywords: string[];       // KY/IN local-scraper filter words
  active: boolean;
  sortOrder: number;
  /** Terms in an opportunity that suggest a license or certification is needed.
   *  When found, generates a qualification warning rather than auto-excluding. */
  qualificationRequired?: string[];
}

// ── Capability keys that belonged to the old (v1) GC profile ─────────────────
// bidSync uses this to detect stale DB rows and trigger a re-seed.
export const LEGACY_GC_CAPABILITY_KEYS = new Set([
  "waste_hauling", "mh_finishing", "flooring", "site_work",
  "general_contracting", "industrial_maintenance",
]);

// ── Negative-term sets (shared across capabilities) ───────────────────────────

export const HAZMAT_NEGATIVE_TERMS = [
  "hazardous waste", "hazmat", "medical waste", "biomedical waste",
  "radioactive", "nuclear waste", "biohazard", "chemical waste", "PCB",
  "asbestos abatement", "lead abatement", "wastewater treatment",
  "sewage treatment", "liquid waste", "septic pumping",
];

export const LARGE_FLEET_NEGATIVE_TERMS = [
  "residential garbage collection", "municipal solid waste franchise",
  "automated collection", "transfer station operations", "fleet of vehicles",
  "20 or more vehicles", "refuse collection franchise", "solid waste franchise",
  "fleet management", "automated refuse",
];

/**
 * Title-level hard-suppression terms.
 * Any opportunity whose TITLE contains one of these is skipped at sync time —
 * it is clearly incompatible with this contractor regardless of keyword matches.
 */
export const TITLE_HARD_SUPPRESS_TERMS = [
  // Waste / environmental
  "hazardous waste", "medical waste", "biomedical waste", "radioactive waste",
  "hazmat", "biohazard", "residential garbage collection",
  "municipal solid waste collection", "refuse collection franchise",
  "automated refuse", "sewage treatment plant",
  // Aviation / aircraft parts
  "ch-47", "ch-53", "uh-60", "f-16", "f-35",
  "helicopter part", "aircraft part", "aviation part",
  "insulation blanket", "avionics",
  // Military exercises
  "bilateral exercise", "military exercise", "bilateral army exercise", "joint exercise",
  // Industrial equipment supply (non-construction)
  "fan,centrifugal", "centrifugal pump", "turbine blade", "compressor assembly",
  "ammunition", "ordnance", "explosive", "weapon system", "fire control system",
  "control column,airc", "c0ntrol column,airc",
  // IT / professional services
  "software license", "saas subscription", "cloud hosting",
];

// ── General Contracting capability definitions (v2 — 7 real skill buckets) ───
//
// These seven buckets replace the v1 profiles (waste_hauling, mh_finishing,
// flooring, site_work, general_contracting, industrial_maintenance).
// They map directly to the owner's actual skills:
//   Trim Carpentry · Flooring · Residential Remodel · Building/Park Maintenance
//   Welding/Fabrication · Debris Hauling · Compact Loader/Dirt Work
//
// bidSync detects old v1 keys and re-seeds automatically.

export const GENERAL_CONTRACTING_CAPABILITIES: CapabilityDefinition[] = [
  // ── 1. Trim Carpentry & Finish Work ────────────────────────────────────────
  {
    capabilityKey: "trim_carpentry",
    name: "Trim Carpentry & Interior Finish Work",
    description:
      "Experienced finish carpentry and interior trim contractor. " +
      "Installs interior trim packages — baseboards, door casings, window trim, " +
      "crown molding, wainscoting, chair rail. Performs punch-out and completion " +
      "work on new construction, renovations, and manufactured/modular homes. " +
      "Handles door and window trim installation, millwork touch-ups, and interior " +
      "finish carpentry for residential and light-commercial projects. " +
      "Works across KY/IN region. Not equipped for large-scale commercial millwork " +
      "production or factory millwork supply contracts.",
    naicsCodes: ["238350"],    // Finish carpentry
    keywords: [
      "finish carpentry", "interior trim", "trim installation", "baseboard installation",
      "door casing", "window trim", "crown molding", "wainscoting", "chair rail",
      "millwork installation", "punch out work", "manufactured home trim", "trim work",
      "interior finish", "finish work", "door installation", "window installation",
      "casing installation", "base molding", "door frames",
    ],
    negativeKeywords: [
      "commercial millwork 50,000", "factory millwork supply", "millwork manufacturing",
      "electrical", "plumbing", "HVAC",
    ],
    equipment: ["hand tools", "compound miter saw", "brad nailer", "finish nailer", "van/truck"],
    localKeywords: [
      "trim", "carpentry", "finish work", "baseboard", "casing", "crown molding",
      "millwork", "interior finish", "punch out",
    ],
    active: true,
    sortOrder: 10,
  },

  // ── 2. Flooring Installation ───────────────────────────────────────────────
  {
    capabilityKey: "flooring_installation",
    name: "Flooring Installation",
    description:
      "Residential and light-commercial flooring contractor. " +
      "Installs LVP (luxury vinyl plank), vinyl sheet, carpet, hardwood, laminate, " +
      "ceramic and porcelain tile. Performs floor replacement, repair, and " +
      "subfloor prep in residential settings, manufactured homes, and small " +
      "commercial spaces. Strong portfolio in manufactured-home flooring. " +
      "CANNOT perform: large-scale commercial flooring requiring multiple crews, " +
      "or projects requiring a general contractor license as prime.",
    naicsCodes: ["238330", "238340"],   // Flooring / Tile
    keywords: [
      "flooring installation", "floor installation", "LVP installation",
      "luxury vinyl plank", "vinyl plank", "vinyl flooring", "carpet installation",
      "hardwood flooring", "laminate flooring", "tile installation",
      "floor replacement", "floor repair", "resilient flooring", "floor covering",
      "vinyl sheet", "carpet replacement", "floor covering installation",
      "subfloor installation", "flooring contractor", "ceramic tile",
      "porcelain tile", "manufactured home flooring",
    ],
    negativeKeywords: [
      "commercial flooring 50,000 square", "flooring manufacturing",
      "flooring factory", "industrial flooring epoxy large scale",
    ],
    equipment: ["flooring nailer", "floor saw", "hand tools", "knee kicker", "power stretcher"],
    localKeywords: [
      "flooring", "floor installation", "LVP", "carpet", "tile", "hardwood",
      "vinyl plank", "laminate", "floor replacement",
    ],
    active: true,
    sortOrder: 20,
  },

  // ── 3. Residential Remodeling & Maintenance ────────────────────────────────
  {
    capabilityKey: "residential_remodel",
    name: "Residential Remodeling & Maintenance",
    description:
      "Small residential remodeling and maintenance contractor. Performs interior " +
      "renovation, drywall repair and finishing, painting prep, property maintenance " +
      "and repair, punch-list completion, turnover work, and handyman-type services " +
      "for residential and light-commercial clients. " +
      "IMPORTANT: Work requiring licensed electrical, licensed plumbing, or HVAC " +
      "is OUTSIDE scope unless those trades are sub-contracted separately. " +
      "KY contractor license required for projects >$10,000 in many jurisdictions " +
      "— verify threshold before bidding as prime.",
    naicsCodes: ["236116", "236118", "238990"],
    keywords: [
      "remodeling", "renovation", "residential remodel", "interior renovation",
      "home renovation", "property maintenance", "residential repair",
      "handyman services", "home repair", "maintenance repair",
      "punch list", "property turnover", "drywall repair", "drywall patch",
      "painting services", "interior painting", "minor renovation",
      "building renovation", "property improvement", "repair services",
      "maintenance services", "facility upkeep", "turnover work",
    ],
    negativeKeywords: [
      "new construction commercial high-rise", "multistory new construction",
      "high-rise construction", "licensed electrician required",
      "licensed plumber required", "HVAC system installation required",
    ],
    equipment: ["hand tools", "power tools", "drywall tools", "paint sprayer", "van/truck"],
    localKeywords: [
      "remodeling", "renovation", "repair", "maintenance", "handyman",
      "drywall", "painting", "property maintenance", "punch list", "turnover",
    ],
    qualificationRequired: [
      "electrical work", "plumbing installation", "HVAC installation",
      "licensed electrician", "licensed plumber", "mechanical permit",
      "electrical permit", "plumbing permit",
    ],
    active: true,
    sortOrder: 30,
  },

  // ── 4. Building & Park Maintenance ────────────────────────────────────────
  {
    capabilityKey: "building_park_maintenance",
    name: "Building & Park Facility Maintenance",
    description:
      "General building and park facility maintenance contractor. Performs building " +
      "maintenance, repair, and preventive maintenance for public facilities, parks, " +
      "and government buildings. Handles restroom renovation and repair, building " +
      "repairs, IDIQ/task-order maintenance contracts, and minor facility improvements. " +
      "Well-suited for on-call and indefinite-delivery maintenance contracts with " +
      "a government or institutional client. " +
      "NOT primarily a grounds maintenance or lawn-care contractor — " +
      "that is not a primary capability. " +
      "CANNOT perform as prime: licensed electrical installation, primary plumbing, " +
      "or HVAC system work.",
    naicsCodes: ["238990", "561499", "561210"],
    keywords: [
      "building maintenance", "facility maintenance", "park maintenance",
      "building repair", "facility repair", "restroom renovation",
      "public building maintenance", "park facility", "preventive maintenance",
      "IDIQ maintenance", "maintenance contract", "minor repairs",
      "janitorial services", "custodial services", "general maintenance",
      "facilities maintenance", "building upkeep", "maintenance task order",
      "indefinite delivery maintenance", "on-call maintenance",
      "park restroom", "recreation facility maintenance",
    ],
    negativeKeywords: [
      "HVAC installation", "electrical installation", "landscaping primary",
      "lawn mowing primary", "grounds maintenance primary",
    ],
    equipment: ["hand tools", "power tools", "ladder", "pressure washer", "van/truck"],
    localKeywords: [
      "building maintenance", "facility maintenance", "park maintenance",
      "building repair", "restroom", "preventive maintenance", "IDIQ",
      "janitorial", "custodial", "maintenance contract",
    ],
    qualificationRequired: [
      "asbestos abatement", "lead paint abatement", "mold remediation",
      "licensed electrician", "licensed plumber", "HVAC installation",
    ],
    active: true,
    sortOrder: 40,
  },

  // ── 5. Welding & Metal Fabrication ────────────────────────────────────────
  {
    capabilityKey: "welding_fabrication",
    name: "Welding & Metal Fabrication",
    description:
      "Two-person welding and metal fabrication team with boilermaker backgrounds. " +
      "Highly skilled in MIG, TIG, and stick welding; structural steel repair and " +
      "installation; custom metal fabrication; equipment repair and maintenance " +
      "welding; vessel and tank maintenance; piping repair and installation; " +
      "and industrial maintenance welding. Excels at T&M, on-call, and IDIQ " +
      "contracts. Strong candidates for shutdown/turnaround maintenance. " +
      "QUALIFICATION REVIEW REQUIRED for any opportunity mentioning ASME, R-stamp, " +
      "S-stamp, pressure vessel certification, National Board registration, or " +
      "boiler contractor license — do NOT auto-qualify or auto-disqualify. " +
      "These certifications may be achievable and worth pursuing if the contract " +
      "value justifies the investment.",
    naicsCodes: [
      "811310",  // Commercial/industrial machinery and equipment repair
      "332312",  // Fabricated structural metal manufacturing
      "332313",  // Plate work manufacturing (welding/fab)
      "332410",  // Power boiler and heat exchanger manufacturing
      "332420",  // Metal tank (heavy gauge) manufacturing
      "238190",  // Other foundation/structure/building exterior contractors
    ],
    keywords: [
      "welding", "metal fabrication", "structural steel", "welding services",
      "fabrication", "certified welder", "boiler maintenance", "boiler repair",
      "pipe welding", "equipment repair", "industrial welding", "steel erection",
      "vessel repair", "steel fabrication", "MIG welding", "TIG welding",
      "stick welding", "metal repair", "cutting", "plasma cutting",
      "industrial maintenance", "shop fabrication", "T&M maintenance",
      "on-call maintenance", "IDIQ maintenance welding", "shutdown maintenance",
      "turnaround maintenance", "piping repair", "piping installation",
      "heat exchanger", "pressure vessel", "tank repair", "tank maintenance",
      "structural welding", "fitter welder", "ironworker", "rigging",
    ],
    negativeKeywords: [
      "plumbing only", "hvac only", "licensed electrician only",
      "fire suppression system only",
    ],
    equipment: [
      "MIG welder", "TIG welder", "stick welder", "cutting torch",
      "plasma cutter", "grinder", "chain falls", "rigging hardware",
      "hand tools", "power tools",
    ],
    localKeywords: [
      "welding", "fabrication", "metal fab", "structural steel",
      "boiler", "industrial maintenance", "equipment repair",
      "pipe welding", "vessel", "tank", "T&M", "on-call",
    ],
    qualificationRequired: [
      "ASME", "R-stamp", "S-stamp", "pressure vessel certification",
      "boiler license", "National Board certification", "National Board",
      "AWS certified", "CWI", "certified welding inspector",
      "NBIC", "code welding", "boiler inspection license",
    ],
    active: true,
    sortOrder: 50,
  },

  // ── 6. Debris Hauling & Site Cleanup ──────────────────────────────────────
  {
    capabilityKey: "debris_hauling",
    name: "Debris Hauling & Site Cleanup",
    description:
      "Owner-operator with dump trailer and pickup truck for debris removal, " +
      "junk removal, site cleanup, construction debris hauling, and material " +
      "removal for residential and commercial clients. " +
      "EQUIPMENT: dump trailer + pickup truck. Single-load to multi-load cleanout " +
      "work within ~150 miles. " +
      "CANNOT perform: hazardous/chemical/medical/radioactive waste; " +
      "large municipal garbage-route contracts requiring a fleet of automated trucks; " +
      "wastewater/septic/liquid waste.",
    naicsCodes: ["562111", "562119", "562910"],
    keywords: [
      "debris removal", "waste hauling", "junk removal", "material hauling",
      "site cleanup", "debris hauling", "trash removal", "cleanout",
      "rubbish removal", "demolition debris", "roll-off", "construction debris",
      "site clearing", "haul away", "bulk waste", "property cleanout",
      "cleanout services", "solid waste collection", "waste removal",
      "material removal", "dump trailer", "dumpster service",
    ],
    negativeKeywords: [
      ...HAZMAT_NEGATIVE_TERMS,
      ...LARGE_FLEET_NEGATIVE_TERMS,
      "freight", "LTL", "full truckload", "FTL", "intermodal", "carrier",
    ],
    equipment: ["dump trailer", "pickup truck", "utility trailer"],
    localKeywords: [
      "debris", "waste", "hauling", "cleanup", "junk", "removal",
      "cleanout", "disposal", "roll-off", "dumpster", "site cleanup",
    ],
    qualificationRequired: [
      "hazardous waste", "hazmat", "medical waste", "radioactive",
      "chemical waste", "regulated waste",
    ],
    active: true,
    sortOrder: 60,
  },

  // ── 7. Compact Loader / Backhoe / Small Dirt Work ─────────────────────────
  {
    capabilityKey: "compact_dirt_work",
    name: "Compact Loader / Backhoe / Small Dirt Work",
    description:
      "Compact tractor, front-end loader, and backhoe operator for small-scale " +
      "site work. Performs light excavation, grading, land clearing, lot cleanup, " +
      "backfilling, material spreading, drainage work, culvert installation, and " +
      "erosion control. Suitable for residential and rural sites. " +
      "NOT equipped for: large highway or heavy civil excavation; bridge " +
      "construction; dam construction; multi-acre cut-and-fill projects " +
      "requiring full-size equipment.",
    naicsCodes: ["238910", "237990", "237110"],
    keywords: [
      "site preparation", "excavation", "grading", "site work", "dirt work",
      "earthwork", "land clearing", "lot clearing", "backfilling",
      "material spreading", "drainage work", "culvert installation",
      "erosion control", "stormwater", "small excavation", "compact equipment",
      "loader work", "backhoe work", "site cleanup", "grading services",
      "rough grading", "finish grading", "topsoil spreading",
    ],
    negativeKeywords: [
      "highway construction", "interstate", "bridge construction",
      "dam construction", "tunnel", "large excavation crane required",
    ],
    equipment: ["compact tractor", "front-end loader", "backhoe", "box blade", "auger"],
    localKeywords: [
      "grading", "excavation", "site prep", "land clearing", "dirt work",
      "drainage", "culvert", "earthwork", "backhoe", "loader",
    ],
    active: true,
    sortOrder: 70,
  },
];

// ── Asphalt Sealing capability definitions ────────────────────────────────────

export const ASPHALT_SEALING_CAPABILITIES: CapabilityDefinition[] = [
  {
    capabilityKey: "asphalt_sealing",
    name: "Asphalt Sealcoating & Paving",
    description:
      "Asphalt and sealcoating contractor (NAICS 237310) performing parking lot " +
      "sealcoating, crack sealing, pavement striping, pothole patching, and " +
      "new asphalt paving for commercial and municipal clients. " +
      "Operates in KY/IN region.",
    naicsCodes: ["237310"],
    keywords: [
      "asphalt", "sealcoat", "sealcoating", "pavement", "parking lot",
      "parking-lot", "striping", "crack seal", "crack-seal", "paving",
      "asphalt paving", "asphalt repair", "pothole", "milling",
      "road resurfacing", "driveway",
    ],
    negativeKeywords: [],
    equipment: ["sealcoating sprayer", "crack sealing equipment", "line striper", "asphalt roller"],
    localKeywords: [
      "asphalt", "sealcoat", "paving", "pavement", "striping", "crack seal",
      "parking lot", "driveway",
    ],
    active: true,
    sortOrder: 10,
  },
];

// ── Capability-grouped SAM.gov search configuration ──────────────────────────
//
// These groups replace the flat mergeCapabilitySearchParams() → all-pairs matrix.
// Each group searches its own NAICS+anchorKeywords and adds specificKeywords
// (no NAICS) to catch opportunities whose SAM.gov NAICS differs from expected.
//
// Total GC requests: ~200 (vs ~4,000 with the old all-pairs approach).
// Controlled concurrency (SAM_MAX_CONCURRENT=8) prevents rate-limit hits.

export const GENERAL_CONTRACTING_SEARCH_GROUPS: CapabilitySearchGroup[] = [
  {
    capabilityKey:   "trim_carpentry",
    capabilityName:  "Trim Carpentry & Finish Work",
    naicsCodes:      ["238350"],
    anchorKeywords:  ["finish carpentry", "interior trim", "carpentry services"],
    specificKeywords: [
      "baseboard installation", "door casing installation", "window trim installation",
      "crown molding installation", "manufactured home trim", "punch out carpentry",
      "interior finish work", "millwork installation",
    ],
    pscCodes: ["Y1DA", "Z1DA"],
    qualificationRequired: [],
  },
  {
    capabilityKey:   "flooring_installation",
    capabilityName:  "Flooring Installation",
    naicsCodes:      ["238330", "238340"],
    anchorKeywords:  ["flooring installation", "floor installation", "carpet installation"],
    specificKeywords: [
      "LVP installation", "luxury vinyl plank installation", "vinyl plank flooring",
      "vinyl flooring installation", "laminate flooring installation",
      "hardwood flooring installation", "tile installation flooring",
      "floor replacement services", "resilient flooring installation",
      "manufactured home flooring",
    ],
    pscCodes: ["Y1DA", "Z1DA"],
    qualificationRequired: [],
  },
  {
    capabilityKey:   "residential_remodel",
    capabilityName:  "Residential Remodeling & Maintenance",
    naicsCodes:      ["236116", "236118", "238990"],
    anchorKeywords:  ["remodeling", "renovation", "maintenance repair"],
    specificKeywords: [
      "residential renovation services", "home remodeling services",
      "interior renovation contractor", "property maintenance services",
      "handyman services government", "punch list completion",
      "property turnover services", "drywall repair services",
      "minor repairs government", "residential repair services",
    ],
    pscCodes: ["Y1AA", "Y1BA", "Z1AA", "Z2AA"],
    qualificationRequired: [
      "electrical", "plumbing", "HVAC", "licensed electrician", "licensed plumber",
    ],
  },
  {
    capabilityKey:   "building_park_maintenance",
    capabilityName:  "Building & Park Facility Maintenance",
    naicsCodes:      ["238990", "561499", "561210"],
    anchorKeywords:  ["building maintenance", "facility maintenance", "park maintenance"],
    specificKeywords: [
      "public facility repair services", "building repair services",
      "restroom renovation government", "park facility maintenance services",
      "preventive maintenance contract", "IDIQ maintenance services",
      "indefinite delivery maintenance", "on-call maintenance contract",
      "recreation facility maintenance", "janitorial building maintenance",
    ],
    pscCodes: ["Z1AA", "Z2AA", "Z1BA", "Z2BA"],
    qualificationRequired: [
      "asbestos", "lead paint", "mold remediation", "licensed electrician",
    ],
  },
  {
    capabilityKey:   "welding_fabrication",
    capabilityName:  "Welding & Metal Fabrication",
    naicsCodes:      ["811310", "332312", "332313", "332410", "332420", "238190"],
    anchorKeywords:  ["welding", "fabrication", "industrial maintenance"],
    specificKeywords: [
      "metal fabrication services", "structural steel repair",
      "steel fabrication contractor", "boiler maintenance services",
      "pipe welding services", "equipment repair welding",
      "welding services contract", "certified welder contract",
      "steel erection services", "vessel repair services",
      "T&M maintenance welding", "MIG TIG welding",
      "industrial welding contract", "shutdown turnaround maintenance",
      "on-call maintenance welding",
    ],
    pscCodes: ["J063", "J065", "J066", "Z1NA", "Z2NA"],
    qualificationRequired: [
      "ASME", "R-stamp", "S-stamp", "pressure vessel certification",
      "boiler license", "National Board", "AWS certified",
      "CWI", "certified welding inspector", "NBIC",
    ],
  },
  {
    capabilityKey:   "debris_hauling",
    capabilityName:  "Debris Hauling & Site Cleanup",
    naicsCodes:      ["562111", "562119", "562910"],
    anchorKeywords:  ["debris removal", "waste hauling", "cleanup services"],
    specificKeywords: [
      "construction debris removal", "junk removal services",
      "material hauling services", "site cleanup services",
      "cleanout services government", "rubbish removal services",
      "demolition debris removal", "bulk waste removal",
      "property cleanout services", "haul away services",
      "roll-off services",
    ],
    pscCodes: ["Z1QA"],
    qualificationRequired: [
      "hazardous waste", "hazmat", "medical waste", "radioactive",
    ],
  },
  {
    capabilityKey:   "compact_dirt_work",
    capabilityName:  "Compact Loader / Backhoe / Small Dirt Work",
    naicsCodes:      ["238910", "237990", "237110"],
    anchorKeywords:  ["site preparation", "excavation", "grading"],
    specificKeywords: [
      "dirt work services", "site grading services", "land clearing services",
      "backfilling services", "earthwork small", "culvert installation services",
      "drainage work services", "erosion control installation",
      "lot clearing services", "material spreading services",
      "small excavation services", "compact loader services",
    ],
    pscCodes: ["Y1NA", "Z1NA"],
    qualificationRequired: [],
  },
];

export const ASPHALT_SEARCH_GROUPS: CapabilitySearchGroup[] = [
  {
    capabilityKey:   "asphalt_sealing",
    capabilityName:  "Asphalt Sealcoating & Paving",
    naicsCodes:      ["237310"],
    anchorKeywords:  ["asphalt", "sealcoating", "paving"],
    specificKeywords: [
      "asphalt repair services", "crack sealing services",
      "pavement marking services", "pothole patching services",
      "parking lot sealcoating", "road resurfacing services",
      "asphalt milling services", "pavement overlay",
      "parking lot striping", "driveway paving",
    ],
    pscCodes: ["Y1QA", "Z1QA", "Y1NA", "Z1NA"],
    qualificationRequired: [],
  },
];

// ── Lookup by business type slug ──────────────────────────────────────────────

export function getCapabilitiesForBusinessType(businessType: string): CapabilityDefinition[] {
  if (businessType === "asphalt_sealing") return ASPHALT_SEALING_CAPABILITIES;
  return GENERAL_CONTRACTING_CAPABILITIES;
}

/**
 * Returns the capability-grouped search configuration for a business type.
 * Use this instead of the flat mergeCapabilitySearchParams() for SAM.gov queries.
 */
export function getSearchGroupsForBusinessType(businessType: string): CapabilitySearchGroup[] {
  if (businessType === "asphalt_sealing") return ASPHALT_SEARCH_GROUPS;
  return GENERAL_CONTRACTING_SEARCH_GROUPS;
}

/**
 * Merge all active capability NAICS + keywords into a single deduplicated search set.
 * Still used by non-SAM sources (USASpending, SUBNet, GSA Forecast) that don't
 * support capability-grouped queries.
 */
export function mergeCapabilitySearchParams(capabilities: CapabilityDefinition[]): {
  naicsCodes: string[];
  keywords: string[];
  pscCodes: string[];
  localKeywords: string[];
  negativeKeywords: string[];
  description: string;
} {
  const naicsSet   = new Set<string>();
  const kwSet      = new Set<string>();
  const localKwSet = new Set<string>();
  const negSet     = new Set<string>();
  const descParts: string[] = [];

  for (const cap of capabilities) {
    if (!cap.active) continue;
    cap.naicsCodes.forEach(n => naicsSet.add(n));
    cap.keywords.forEach(k => kwSet.add(k));
    cap.localKeywords.forEach(k => localKwSet.add(k));
    cap.negativeKeywords.forEach(k => negSet.add(k));
    descParts.push(`${cap.name}: ${cap.description}`);
  }

  return {
    naicsCodes:      [...naicsSet],
    keywords:        [...kwSet],
    pscCodes:        [],
    localKeywords:   [...localKwSet],
    negativeKeywords: [...negSet],
    description:     descParts.join("\n\n"),
  };
}
