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
 *
 * ── Search philosophy ────────────────────────────────────────────────────────
 * Government procurement language differs from trade language.  Agencies write
 * "building alteration" not "baseboard installation", "pavement maintenance"
 * not "sealcoating", "floor covering replacement" not "LVP installation".
 *
 * Strategy: search broadly using the vocabulary agencies actually use → rely on
 * intelligent scoring to rank results → surface strong matches → flag
 * questionable / license-required work for review.
 *
 * Each search group runs:
 *   NAICS × anchorKeywords   — broad terms agencies use, paired with relevant NAICS
 *   specificKeywords          — targeted multi-word phrases, no NAICS restriction
 *                               (catches mislabeled opportunities)
 *   PSC × anchorKeywords     — PSC-coded opportunities paired with broad terms
 *
 * Never hard-delete these constants — bidSync reads them as fallback.
 */

import type { CapabilitySearchGroup } from "./samGov.js";

export interface CapabilityDefinition {
  capabilityKey: string;
  name: string;
  description: string;           // AI prompt context — one tight paragraph
  naicsCodes: string[];
  keywords: string[];            // scoring terms (also used by local scraper)
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
 * Negative terms for manufacturing, agriculture, medical, and other sectors
 * clearly outside construction/trades work. Each hit costs 8 points in scoring
 * and can push a borderline bid below the MIN_SCORE_TO_STORE floor.
 */
export const NON_CONSTRUCTION_NEGATIVE_TERMS = [
  // Manufacturing commodity procurement
  "manufacturing contract", "equipment procurement", "supply of equipment",
  "commodity purchase", "product supply", "manufacture and deliver",
  "procurement of parts", "supply contract for",
  // Agriculture / food / animal inspection
  "food inspection", "agricultural inspection", "animal inspection",
  "plant disease", "pest inspection", "phytosanitary inspection",
  "food safety", "agricultural services only",
  // Medical / pharmaceutical
  "medical supply", "pharmaceutical", "medical device", "dental supply",
  "laboratory supply", "surgical supply",
  // Unrelated equipment supply
  "gym equipment", "exercise equipment", "fitness equipment",
  "sports equipment", "vending machine",
];

/**
 * Title-level hard-suppression terms.
 * Any opportunity whose TITLE contains one of these is skipped at sync time —
 * it is clearly incompatible with this contractor regardless of keyword matches.
 * This is the single authoritative source — bidSync.ts imports this list directly.
 * Add new terms here; there is no separate copy to update.
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
  // Industrial equipment / manufacturing supply (non-construction)
  "fan,centrifugal", "centrifugal pump", "turbine blade", "compressor assembly",
  "ammunition", "ordnance", "explosive", "weapon system", "fire control system",
  "control column,airc", "c0ntrol column,airc",
  // Engine / vehicle / drivetrain manufacturing
  "engine block", "diesel engine", "engine assembly",
  "transmission assembly", "gear assembly", "motor assembly",
  "generator set procurement", "pump assembly",
  // Fitness / sports equipment
  "gym equipment", "exercise equipment", "fitness equipment",
  "sports equipment", "athletic equipment", "recreational equipment",
  // Agriculture / food / animal inspection services
  "animal and plant health", "food safety inspection",
  "agricultural inspection", "phytosanitary", "veterinary biologics",
  "pest management inspection", "animal disease", "plant disease inspection",
  "food inspection service",
  // Medical / pharmaceutical / laboratory supply
  "medical device", "pharmaceutical supply", "dental supply",
  "laboratory reagent", "medical equipment supply", "surgical supply",
  "medical supply", "drug supply",
  // IT / professional services
  "software license", "saas subscription", "cloud hosting",
  "it support services", "managed services contract",
  "network infrastructure supply",
  // Freight / heavy transportation — not construction hauling
  "full truckload freight", "ltl freight", "intermodal freight", "freight carrier",
  // Unrelated services
  "food service equipment", "vending machine", "vending services",
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
//
// Scoring keywords include BOTH trade terms AND government procurement language
// so that broadly-searched opportunities score correctly.

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
    naicsCodes: ["238350"],
    keywords: [
      // Trade-specific terms
      "finish carpentry", "interior trim", "trim installation", "baseboard installation",
      "door casing", "window trim", "crown molding", "wainscoting", "chair rail",
      "millwork installation", "punch out work", "manufactured home trim", "trim work",
      "interior finish", "finish work", "door installation", "window installation",
      "casing installation", "base molding", "door frames",
      // Government procurement language
      "carpentry services", "carpentry contract", "interior renovation carpentry",
      "building alteration carpentry", "interior alteration", "finish trades",
      "wood installation", "architectural millwork", "interior finishes",
      "building interior finishes", "wood trim", "door and window installation",
    ],
    negativeKeywords: [
      "commercial millwork 50,000", "factory millwork supply", "millwork manufacturing",
      "electrical", "plumbing", "HVAC",
      ...NON_CONSTRUCTION_NEGATIVE_TERMS,
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
    naicsCodes: ["238330", "238340"],
    keywords: [
      // Trade-specific terms
      "flooring installation", "floor installation", "LVP installation",
      "luxury vinyl plank", "vinyl plank", "vinyl flooring", "carpet installation",
      "hardwood flooring", "laminate flooring", "tile installation",
      "floor replacement", "floor repair", "resilient flooring", "floor covering",
      "vinyl sheet", "carpet replacement", "floor covering installation",
      "subfloor installation", "flooring contractor", "ceramic tile",
      "porcelain tile", "manufactured home flooring",
      // Government procurement language
      "floor covering replacement", "carpet and flooring", "VCT replacement",
      "vinyl composition tile", "floor covering contract", "flooring services",
      "interior floor replacement", "floor tile replacement", "floor covering services",
      "resilient floor covering", "flooring and carpet", "carpet services",
      "floor repair services", "flooring contract", "floor covering work",
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
      // Trade-specific terms
      "remodeling", "renovation", "residential remodel", "interior renovation",
      "home renovation", "property maintenance", "residential repair",
      "handyman services", "home repair", "maintenance repair",
      "punch list", "property turnover", "drywall repair", "drywall patch",
      "painting services", "interior painting", "minor renovation",
      "building renovation", "property improvement", "repair services",
      "maintenance services", "facility upkeep", "turnover work",
      // Government procurement language
      "alteration", "repair and alteration", "minor construction", "building alteration",
      "facility alteration", "renovation services", "building renovation services",
      "interior renovation services", "property rehabilitation", "housing renovation",
      "residential alteration", "unit renovation", "dormitory renovation",
      "barracks renovation", "minor repair services", "facility renovation",
      "alteration services", "renovation and repair",
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
      // Trade-specific terms
      "building maintenance", "facility maintenance", "park maintenance",
      "building repair", "facility repair", "restroom renovation",
      "public building maintenance", "park facility", "preventive maintenance",
      "IDIQ maintenance", "maintenance contract", "minor repairs",
      "general maintenance", "facilities maintenance", "building upkeep",
      "maintenance task order", "indefinite delivery maintenance", "on-call maintenance",
      "park restroom", "recreation facility maintenance",
      // Government procurement language (high-value federal category)
      "operations and maintenance", "O&M", "facilities operations",
      "building operations", "base operations", "facility support",
      "recurring maintenance", "facility support services", "grounds and facilities",
      "maintenance and repair services", "building services", "facility management",
      "property maintenance services", "grounds maintenance", "custodial services",
      "janitorial and maintenance", "facilities management", "base operations support",
      "maintenance and custodial", "park and facility", "trail maintenance",
      "recreation area maintenance", "campground maintenance", "visitor facility",
      "maintenance services contract", "facilities repair",
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
      // Trade-specific terms
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
      // Government procurement language
      "structural repair", "metal component repair", "industrial repair",
      "industrial equipment repair", "maintenance welding", "structural metal repair",
      "steel structure repair", "heavy equipment repair", "maintenance fabrication",
      "metal repair services", "pipeline repair", "vessel and tank repair",
      "fabrication and installation", "repair and fabrication",
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
      // Trade-specific terms
      "debris removal", "waste hauling", "junk removal", "material hauling",
      "site cleanup", "debris hauling", "trash removal", "cleanout",
      "rubbish removal", "demolition debris", "roll-off", "construction debris",
      "site clearing", "haul away", "bulk waste", "property cleanout",
      "cleanout services", "solid waste collection", "waste removal",
      "material removal", "dump trailer", "dumpster service",
      // Government procurement language
      "haul and dispose", "excess property removal", "surplus material removal",
      "government excess property", "facility cleanout", "scrap removal",
      "base cleanout", "material disposal services", "waste collection services",
      "debris and waste removal", "property disposal services",
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
      // Trade-specific terms
      "site preparation", "excavation", "grading", "site work", "dirt work",
      "earthwork", "land clearing", "lot clearing", "backfilling",
      "material spreading", "drainage work", "culvert installation",
      "erosion control", "stormwater", "small excavation", "compact equipment",
      "loader work", "backhoe work", "site cleanup", "grading services",
      "rough grading", "finish grading", "topsoil spreading",
      // Government procurement language
      "site clearing", "site development", "drainage improvement",
      "access road grading", "minor grading", "earth moving",
      "utility trench", "drainage pipe installation", "small site work",
      "culvert replacement", "erosion and sediment control",
      "stormwater drainage", "site clearing and grading",
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
    name: "Asphalt Sealcoating & Pavement Maintenance",
    description:
      "Asphalt and sealcoating contractor (NAICS 237310) performing parking lot " +
      "sealcoating, crack sealing, pavement marking, pothole patching, and " +
      "new asphalt paving for commercial and municipal clients. " +
      "Skilled in pavement preservation and maintenance programs. " +
      "Operates in KY/IN region.",
    naicsCodes: ["237310"],
    keywords: [
      // Trade-specific terms
      "asphalt", "sealcoat", "sealcoating", "pavement", "parking lot",
      "parking-lot", "striping", "crack seal", "crack-seal", "paving",
      "asphalt paving", "asphalt repair", "pothole", "milling",
      "road resurfacing", "driveway",
      // Government procurement language
      "pavement maintenance", "parking lot maintenance", "pavement repair",
      "pavement marking", "parking area maintenance", "pavement preservation",
      "surface treatment", "parking surface", "lot resurfacing",
      "pavement management", "road surface", "asphalt maintenance",
      "parking facility", "lot striping", "pavement overlay",
      "crack filling", "seal coating", "bituminous",
    ],
    negativeKeywords: [],
    equipment: ["sealcoating sprayer", "crack sealing equipment", "line striper", "asphalt roller"],
    localKeywords: [
      "asphalt", "sealcoat", "paving", "pavement", "striping", "crack seal",
      "parking lot", "driveway", "pavement maintenance", "parking area",
    ],
    active: true,
    sortOrder: 10,
  },
];

// ── Capability-grouped SAM.gov search configuration ──────────────────────────
//
// Search philosophy: use government procurement vocabulary, not trade vocabulary.
// Government solicitations say "building alteration", "pavement maintenance",
// "floor covering replacement" — not "baseboard installation", "sealcoating",
// "LVP installation". Anchor keywords are the terms agencies actually use.
//
// How fetchSamOpportunitiesGrouped uses these groups (current architecture):
//   • Deduplicates NAICS codes across all groups → one task per unique code.
//   • In-sector NAICS (sectors 23/56/81): unrestricted task — fetch everything.
//   • Out-of-sector NAICS (e.g. 332xxx Manufacturing): paired with anchorKeywords[0]
//     to prevent manufacturing-supply and freight contracts from being fetched.
//   • PSC codes: one unrestricted task per unique code.
//   • No catch-all keyword tasks (removed — in-sector NAICS queries cover this).
//
// anchorKeywords and specificKeywords are still used by non-SAM sources
// (USASpending, SUBNet, GSA Forecast) and the local keyword scorer.
//
// Approximate task counts (GC): ~24 unique NAICS + ~20 unique PSC = ~44 tasks.
// Concurrency cap (SAM_MAX_CONCURRENT=8) prevents rate-limit hits.

export const GENERAL_CONTRACTING_SEARCH_GROUPS: CapabilitySearchGroup[] = [
  // ── 1. Trim Carpentry & Finish Work ────────────────────────────────────────
  // Government language: "carpentry", "interior renovation", "building alteration"
  // Not: "baseboard installation", "crown molding installation" (too trade-specific)
  {
    capabilityKey:   "trim_carpentry",
    capabilityName:  "Trim Carpentry & Finish Work",
    naicsCodes:      ["238350", "238990", "238390"],
    anchorKeywords:  ["carpentry", "interior renovation", "building alteration", "finish work"],
    specificKeywords: [
      // Specific enough to be targeted, broad enough that govt uses them
      "finish carpentry services", "interior trim installation",
      "interior finish carpentry", "carpentry services contract",
      "door and window installation", "architectural millwork installation",
      "wood trim installation", "interior alteration carpentry",
      "millwork installation services", "interior finishes contract",
      "building interior finishes", "punch out carpentry",
      "manufactured home trim", "door installation services",
      "window installation services", "finish trades services",
    ],
    pscCodes: ["Y1DA", "Z1DA", "Z1AA", "Y1AA"],
    qualificationRequired: [],
  },

  // ── 2. Flooring Installation ───────────────────────────────────────────────
  // Government language: "floor covering", "carpet replacement", "VCT replacement"
  // Not: "LVP installation", "luxury vinyl plank installation" (too trade-specific)
  {
    capabilityKey:   "flooring_installation",
    capabilityName:  "Flooring Installation",
    naicsCodes:      ["238330", "238340", "238990"],
    anchorKeywords:  ["flooring", "floor covering", "carpet", "floor replacement"],
    specificKeywords: [
      "flooring installation services", "floor covering replacement",
      "carpet replacement services", "resilient flooring installation",
      "vinyl flooring installation", "LVP installation",
      "luxury vinyl plank installation", "laminate flooring installation",
      "hardwood flooring installation", "ceramic tile installation",
      "VCT replacement services", "vinyl composition tile replacement",
      "floor covering installation contract", "tile and flooring services",
      "interior floor replacement", "manufactured home flooring",
      "flooring services contract", "floor repair services",
      "carpet and flooring services",
    ],
    pscCodes: ["Y1DA", "Z1DA", "Z1BA", "Y1BA"],
    qualificationRequired: [],
  },

  // ── 3. Residential Remodeling & Maintenance ────────────────────────────────
  // Government language: "alteration", "repair and alteration", "minor construction"
  // Not: "residential renovation services", "home remodeling services"
  {
    capabilityKey:   "residential_remodel",
    capabilityName:  "Residential Remodeling & Maintenance",
    naicsCodes:      ["236116", "236118", "238990", "238320", "238310"],
    anchorKeywords:  ["renovation", "alteration", "repair and alteration", "minor construction"],
    specificKeywords: [
      "building alteration services", "facility alteration contract",
      "interior renovation services", "repair and renovation services",
      "building renovation services", "residential alteration services",
      "housing renovation services", "property rehabilitation services",
      "dormitory renovation services", "barracks renovation services",
      "unit renovation services", "minor repairs government",
      "drywall repair services", "handyman services government",
      "property maintenance services", "punch list completion services",
      "residential repair services", "minor construction services",
      "interior renovation contractor",
    ],
    pscCodes: ["Y1AA", "Y1BA", "Z1AA", "Z2AA", "Y1DA", "Z1DA"],
    qualificationRequired: [
      "electrical", "plumbing", "HVAC", "licensed electrician", "licensed plumber",
    ],
  },

  // ── 4. Building & Park Facility Maintenance ────────────────────────────────
  // RICHEST category for federal contracts. Government uses:
  // "O&M", "facilities maintenance", "maintenance and repair", "building operations"
  {
    capabilityKey:   "building_park_maintenance",
    capabilityName:  "Building & Park Facility Maintenance",
    naicsCodes:      ["238990", "561499", "561210"],
    anchorKeywords:  ["facilities maintenance", "maintenance and repair", "building services", "park maintenance"],
    specificKeywords: [
      // Core federal O&M / IDIQ language
      "operations and maintenance services", "O&M contract services",
      "facilities operations and maintenance", "building operations and maintenance",
      "base operations support services", "recurring maintenance contract",
      "preventive maintenance contract", "IDIQ maintenance services",
      "indefinite delivery maintenance", "on-call maintenance contract",
      "maintenance task order services", "facility support services",
      // Park / recreation / outdoor facilities
      "park facility maintenance services", "recreation facility maintenance",
      "restroom renovation government", "trail and park maintenance",
      "campground maintenance services", "visitor facility maintenance",
      "recreation area maintenance", "outdoor facility maintenance",
      // Broader facility / building maintenance
      "grounds and facilities maintenance", "janitorial and maintenance services",
      "facilities management services", "property maintenance contract",
      "public facility repair services", "building repair services",
    ],
    pscCodes: ["Z1AA", "Z2AA", "Z1BA", "Z2BA", "Z1EA", "Z2EA"],
    qualificationRequired: [
      "asbestos", "lead paint", "mold remediation", "licensed electrician",
    ],
  },

  // ── 5. Welding & Metal Fabrication ────────────────────────────────────────
  // Government language: "structural repair", "industrial maintenance", "equipment repair"
  {
    capabilityKey:   "welding_fabrication",
    capabilityName:  "Welding & Metal Fabrication",
    naicsCodes:      ["811310", "332312", "332313", "332410", "332420", "238190"],
    anchorKeywords:  ["welding", "metal fabrication", "industrial maintenance", "structural repair"],
    specificKeywords: [
      "welding services contract", "metal fabrication services",
      "structural steel repair services", "steel fabrication contractor",
      "boiler maintenance services", "pipe welding services",
      "industrial welding contract", "industrial equipment repair services",
      "steel structure repair contract", "vessel repair services",
      "T&M maintenance welding", "shutdown turnaround maintenance",
      "on-call maintenance welding", "maintenance and repair welding",
      "structural metal repair services", "heavy equipment repair services",
      "pipeline welding services", "vessel and tank repair services",
      "maintenance fabrication services", "metal component repair services",
      "steel erection services", "certified welder contract",
    ],
    pscCodes: ["J063", "J065", "J066", "Z1NA", "Z2NA", "J020", "J099"],
    qualificationRequired: [
      "ASME", "R-stamp", "S-stamp", "pressure vessel certification",
      "boiler license", "National Board", "AWS certified",
      "CWI", "certified welding inspector", "NBIC",
    ],
  },

  // ── 6. Debris Hauling & Site Cleanup ──────────────────────────────────────
  // Government language: "haul and dispose", "excess property removal", "material removal"
  {
    capabilityKey:   "debris_hauling",
    capabilityName:  "Debris Hauling & Site Cleanup",
    naicsCodes:      ["562111", "562119", "562910", "484110"],
    anchorKeywords:  ["debris removal", "waste removal", "cleanup services", "material removal"],
    specificKeywords: [
      "construction debris removal services", "haul and dispose services",
      "demolition debris removal", "site cleanup contract",
      "junk removal services", "material hauling services",
      "cleanout services government", "rubbish removal services",
      "bulk waste removal services", "property cleanout services",
      "excess property removal services", "surplus material removal",
      "roll-off services contract", "facility cleanout services",
      "scrap removal services", "debris and waste removal",
      "material removal and disposal", "base cleanout contract",
      "government excess property removal", "waste collection services",
    ],
    pscCodes: ["Z1QA", "Z1AA"],
    qualificationRequired: [
      "hazardous waste", "hazmat", "medical waste", "radioactive",
    ],
  },

  // ── 7. Compact Loader / Backhoe / Small Dirt Work ─────────────────────────
  // Government language: "earthwork", "site clearing", "drainage improvement"
  {
    capabilityKey:   "compact_dirt_work",
    capabilityName:  "Compact Loader / Backhoe / Small Dirt Work",
    naicsCodes:      ["238910", "237990", "237110"],
    anchorKeywords:  ["site preparation", "excavation", "grading", "earthwork"],
    specificKeywords: [
      "site clearing and grading", "land clearing services",
      "drainage improvement services", "culvert replacement services",
      "erosion control installation", "stormwater drainage installation",
      "minor excavation services", "small site work contract",
      "access road grading services", "earth moving services",
      "compact equipment site work", "utility trench excavation",
      "drainage pipe installation", "erosion and sediment control",
      "minor grading services", "lot clearing services",
      "backfilling services", "material spreading services",
      "foundation excavation services", "culvert installation services",
      "small site development services",
    ],
    pscCodes: ["Y1NA", "Z1NA", "Z2NA", "Y1QA"],
    qualificationRequired: [],
  },
];

// ── Asphalt Sealing search groups ─────────────────────────────────────────────
//
// Expanded to cover government pavement maintenance vocabulary.
// Agencies post "pavement maintenance", "parking lot maintenance", "pavement
// repair" — not "sealcoating".  The specific-keyword list (no NAICS) also
// catches opportunities posted under adjacent NAICS codes (e.g. 237990).
//
// NAICS 237990 added: other heavy/civil engineering construction.
// Government sometimes codes parking-lot or pavement work here rather than 237310.

export const ASPHALT_SEARCH_GROUPS: CapabilitySearchGroup[] = [
  {
    capabilityKey:   "asphalt_sealing",
    capabilityName:  "Asphalt Sealcoating & Pavement Maintenance",
    naicsCodes:      ["237310", "237990"],
    anchorKeywords:  ["asphalt", "sealcoating", "paving", "pavement", "parking lot"],
    specificKeywords: [
      // Trade terms that do appear in federal solicitations
      "asphalt repair services", "crack sealing services", "pothole patching services",
      "parking lot sealcoating", "asphalt milling services", "pavement overlay services",
      "parking lot striping", "driveway paving services",
      // Government procurement language for pavement work
      "pavement maintenance services", "parking lot maintenance contract",
      "parking area maintenance services", "asphalt maintenance contract",
      "pavement preservation services", "surface treatment pavement contract",
      "pavement management services", "lot resurfacing services",
      "pavement repair contract", "parking facility maintenance",
      "bituminous surface treatment", "asphalt surface repair services",
      "crack fill services", "parking surface maintenance",
      "pavement marking services", "road resurfacing services",
      "seal coat services", "parking lot repair services",
    ],
    pscCodes: ["Y1QA", "Z1QA", "Y1NA", "Z1NA", "Z2QA", "Z2NA"],
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
