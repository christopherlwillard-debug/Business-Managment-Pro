/**
 * Canonical capability-profile definitions for each business type.
 *
 * These are used in two ways:
 *  1. As the seed payload inserted into `bid_capability_profiles` the first
 *     time a business is synced (idempotent — keyed on businessId + capabilityKey).
 *  2. As the fallback profile when no DB rows exist yet (preserves backward
 *     compatibility during the transition).
 *
 * Never hard-delete these constants — bidSync reads them as fallback.
 */

export interface CapabilityDefinition {
  capabilityKey: string;
  name: string;
  description: string;          // AI prompt context — one tight paragraph
  naicsCodes: string[];
  keywords: string[];           // SAM.gov positive search terms
  negativeKeywords: string[];   // terms to deprioritise (title/desc match)
  equipment: string[];          // equipment available for scoring
  localKeywords: string[];      // KY/IN local-scraper filter words
  active: boolean;
  sortOrder: number;
}

// ── Negative-term sets (shared across capabilities) ───────────────────────────

/** Terms that indicate hazardous/incompatible waste work to filter out. */
export const HAZMAT_NEGATIVE_TERMS = [
  "hazardous waste",
  "hazmat",
  "medical waste",
  "biomedical waste",
  "radioactive",
  "nuclear waste",
  "biohazard",
  "chemical waste",
  "PCB",
  "asbestos abatement",
  "lead abatement",
  "wastewater treatment",
  "sewage treatment",
  "liquid waste",
  "septic pumping",
];

/** Terms that indicate large-fleet / municipal refuse operations */
export const LARGE_FLEET_NEGATIVE_TERMS = [
  "residential garbage collection",
  "municipal solid waste franchise",
  "automated collection",
  "transfer station operations",
  "fleet of vehicles",
  "20 or more vehicles",
  "refuse collection franchise",
  "solid waste franchise",
  "fleet management",
  "automated refuse",
];

/**
 * Title-level hard-suppression terms.
 * Any opportunity whose TITLE contains one of these is skipped at sync time —
 * it is clearly incompatible with this contractor regardless of keyword matches.
 * Export so UI can display suppression rationale if needed.
 *
 * IMPORTANT: Keep this list in sync with TITLE_HARD_SUPPRESS in bidSync.ts.
 */
export const TITLE_HARD_SUPPRESS_TERMS = [
  // Waste / environmental — outside scope
  "hazardous waste",
  "medical waste",
  "biomedical waste",
  "radioactive waste",
  "hazmat",
  "biohazard",
  "residential garbage collection",
  "municipal solid waste collection",
  "refuse collection franchise",
  "automated refuse",
  "sewage treatment plant",
  // Aviation / aircraft parts — clearly not construction
  "ch-47",
  "ch-53",
  "uh-60",
  "f-16",
  "f-35",
  "helicopter part",
  "aircraft part",
  "aviation part",
  "insulation blanket",
  "avionics",
  // Military exercises and non-construction operations
  "bilateral exercise",
  "military exercise",
  "bilateral army exercise",
  "joint exercise",
  // Industrial equipment / supply (non-construction)
  "fan,centrifugal",
  "centrifugal pump",
  "turbine blade",
  "compressor assembly",
  "ammunition",
  "ordnance",
  "explosive",
  "weapon system",
  "fire control system",
  "control column,airc",   // aircraft control column
  "c0ntrol column,airc",   // OCR variant with zero instead of letter O
  // IT / professional services (not trades)
  "software license",
  "saas subscription",
  "cloud hosting",
];

// ── General Contracting capability definitions ────────────────────────────────

export const GENERAL_CONTRACTING_CAPABILITIES: CapabilityDefinition[] = [
  {
    capabilityKey: "waste_hauling",
    name: "Debris & Waste Removal / Hauling",
    description:
      "Owner-operator with a single dump trailer — NOT a large fleet. " +
      "Performs debris removal, site cleanup, junk/appliance removal, and non-hazardous solid waste hauling " +
      "for residential and commercial clients within ~150 miles. " +
      "EQUIPMENT: dump trailer + pickup truck. " +
      "CANNOT perform: hazardous/chemical/medical/radioactive waste; large municipal garbage-route contracts " +
      "requiring a fleet of automated trucks; wastewater/septic/liquid waste; remediation requiring " +
      "special certifications. " +
      "IMPORTANT: the presence of words like 'hauling', 'removal', or 'waste' in a title is NOT sufficient " +
      "to call this a fit — the scope must be achievable with one dump trailer and a pickup truck.",
    naicsCodes: [
      "562111", // Solid waste collection
      "562119", // Other waste collection
      "562910", // Cleanup/remediation services (non-hazardous scope only)
      // NOTE: 484110/484122 (general freight trucking) intentionally excluded.
      // Those NAICS codes surface broad trucking/freight RFPs with no connection
      // to dump-trailer debris work. Relevant hauling opportunities are captured
      // via keyword searches (debris, junk removal, site cleanup) instead.
    ],
    keywords: [
      "debris removal",
      "waste removal",
      "debris hauling",
      "junk removal",
      "cleanout",
      "cleanup services",
      "solid waste collection",
      "roll-off",
      "dumpster service",
      "trash removal",
      "rubbish removal",
      "material removal",
      "site cleanup",
      "construction debris",
      "demolition debris",
      "property cleanup",
    ],
    negativeKeywords: [
      ...HAZMAT_NEGATIVE_TERMS,
      ...LARGE_FLEET_NEGATIVE_TERMS,
      "freight",
      "LTL",
      "full truckload",
      "FTL",
      "intermodal",
      "carrier",
      "logistics company",
    ],
    equipment: ["dump trailer", "pickup truck", "utility trailer"],
    localKeywords: [
      "debris", "waste", "hauling", "cleanup", "junk", "removal",
      "cleanout", "disposal", "roll-off", "dumpster",
    ],
    active: true,
    sortOrder: 10,
  },
  {
    capabilityKey: "mh_finishing",
    name: "Manufactured Home Finishing & Trim",
    description:
      "Experienced contractor specializing in manufactured home (HUD-code) setup and finishing: " +
      "interior and exterior trim installation, drywall hanging and finishing/texture, " +
      "plumbing hookup, LVP/vinyl plank flooring, carpet installation, painting, " +
      "and general home completion work. Operates in KY/IN for dealers and builders " +
      "including Clayton Homes, Champion, and Cavco.",
    naicsCodes: [
      "236118", // Residential remodelers
      "238310", // Drywall & insulation
      "238330", // Flooring contractors
      "238350", // Finish carpentry
      "238220", // Plumbing, heating & A/C
      "238390", // Other finish trade contractors
    ],
    keywords: [
      "manufactured home",
      "manufactured housing",
      "mobile home",
      "modular home",
      "HUD code",
      "HUD-code home",
      "trim installation",
      "interior trim",
      "exterior trim",
      "finish carpentry",
      "drywall finishing",
      "drywall installation",
      "texture coat",
      "LVP installation",
      "vinyl plank flooring",
      "flooring installation",
      "plumbing hookup",
      "home setup",
      "manufactured home setup",
      "MH completion",
    ],
    negativeKeywords: [],
    equipment: ["hand tools", "power tools", "van/truck"],
    localKeywords: [
      "manufactured home", "manufactured housing", "mobile home", "modular",
      "MH setup", "trim", "drywall", "flooring", "plumbing hookup",
    ],
    active: true,
    sortOrder: 20,
  },
  {
    capabilityKey: "flooring",
    name: "Flooring, Trim & Interior Finish",
    description:
      "Residential and light-commercial interior finish contractor. " +
      "Installs LVP (luxury vinyl plank), vinyl sheet, carpet, hardwood, laminate, and tile. " +
      "Also performs drywall patching and repair (NOT full commercial drywall installs), " +
      "interior trim and finish carpentry (baseboards, casings, door/window trim), " +
      "and basic painting prep. Works best in single-family homes, manufactured homes, " +
      "and small commercial spaces. " +
      "CANNOT perform: large-scale commercial drywall installation requiring multiple crews; " +
      "work requiring a general contractor license (KY requires license for projects >$10,000 " +
      "in some jurisdictions — verify threshold); electrical, plumbing, or HVAC work.",
    naicsCodes: [
      "238330", // Flooring contractors
      "238340", // Tile & terrazzo
      "238310", // Drywall & insulation
      "238350", // Finish carpentry
    ],
    keywords: [
      "flooring installation",
      "floor installation",
      "LVP",
      "luxury vinyl plank",
      "vinyl plank",
      "carpet installation",
      "hardwood flooring",
      "laminate flooring",
      "tile installation",
      "vinyl flooring",
      "floor replacement",
      "flooring contractor",
      "drywall repair",
      "drywall patch",
      "drywall finishing",
      "interior trim",
      "trim installation",
      "finish carpentry",
      "baseboard",
      "door casing",
      "window trim",
      "interior finish",
    ],
    negativeKeywords: [
      "commercial drywall",
      "drywall installation 10,000 square",
      "electrical",
      "plumbing",
      "HVAC",
      "mechanical",
    ],
    equipment: ["hand tools", "flooring nailer", "power tools", "compound", "drywall tools"],
    localKeywords: [
      "flooring", "floor installation", "LVP", "carpet", "tile", "hardwood",
      "drywall repair", "drywall finishing", "trim", "finish carpentry", "interior finish",
    ],
    active: true,
    sortOrder: 30,
  },
  {
    capabilityKey: "site_work",
    name: "Small Excavation / Grading / Site Work",
    description:
      "Compact tractor, front-end loader, and backhoe operator capable of small-scale " +
      "excavation, grading, land clearing, lot cleanup, culvert installation, " +
      "erosion control, and drainage work. Suitable for residential and rural sites; " +
      "NOT equipped for large highway or heavy civil excavation.",
    naicsCodes: [
      "238910", // Site preparation
      "237990", // Other heavy & civil engineering
      "237110", // Water & sewer line construction
    ],
    keywords: [
      "site preparation",
      "site work",
      "grading",
      "excavation",
      "land clearing",
      "lot clearing",
      "dirt work",
      "earthwork",
      "grubbing",
      "topsoil",
      "fill dirt",
      "compaction",
      "drainage",
      "culvert",
      "erosion control",
      "stormwater",
      "demolition",
      "concrete removal",
    ],
    negativeKeywords: [
      "highway construction",
      "interstate",
      "bridge construction",
      "dam construction",
      "tunnel",
    ],
    equipment: ["compact tractor", "front-end loader", "backhoe", "box blade", "auger"],
    localKeywords: [
      "grading", "excavation", "site prep", "land clearing", "dirt work",
      "drainage", "culvert", "demolition", "earthwork",
    ],
    active: true,
    sortOrder: 40,
  },
  {
    capabilityKey: "general_contracting",
    name: "General Contracting & Property Maintenance",
    description:
      "Small general contractor / handyman performing residential and light commercial " +
      "renovation, remodeling, interior finish work, drywall repair, painting, " +
      "carpentry, roofing, property maintenance, and facilities repair. " +
      "Best suited for: government facility minor repairs, preventive maintenance, " +
      "occupied building maintenance, residential remodel, and small commercial work. " +
      "IMPORTANT LICENSE LIMIT: Most work requiring a contractor license (KY: projects " +
      "over certain dollar thresholds) or specialized trade licenses (electrical, plumbing, " +
      "HVAC/mechanical) is OUTSIDE this contractor's scope. " +
      "CANNOT perform: large new-construction GC work, projects requiring a general " +
      "contractor's license as prime on major commercial builds, licensed electrical, " +
      "licensed plumbing installation, mechanical/HVAC systems work.",
    naicsCodes: [
      "236115", // New single-family home
      "236116", // Remodeling of single-family homes
      "236118", // Residential remodelers
      "238110", // Foundation, structure & exterior
      "238140", // Masonry
      "238160", // Roofing
      "238170", // Siding
      "238310", // Drywall & insulation
      "238320", // Painting & wall covering
      "238350", // Finish carpentry
      "238390", // Other finish trade
      "238990", // Other specialty trade
    ],
    keywords: [
      "general contractor",
      "general contracting",
      "renovation",
      "remodel",
      "building renovation",
      "facility renovation",
      "construction services",
      "roofing",
      "drywall",
      "painting contractor",
      "masonry",
      "finish carpentry",
      "property maintenance",
      "facilities maintenance",
      "building maintenance",
      "building repair",
      "facility repair",
      "minor repairs",
      "handyman",
      "preventive maintenance",
      "janitorial services",
    ],
    negativeKeywords: [
      // Licensed trades clearly outside scope
      "electrical work",
      "electrical installation",
      "licensed electrician",
      "plumbing installation",
      "licensed plumber",
      "HVAC installation",
      "HVAC system",
      "mechanical system",
      "fire suppression",
      "sprinkler system",
      // Large-scale commercial GC work
      "new construction office building",
      "new construction commercial",
      "multistory",
      "high-rise",
    ],
    equipment: ["hand tools", "power tools", "ladder", "scaffolding", "van/truck"],
    localKeywords: [
      "renovation", "remodel", "construction", "maintenance", "repair",
      "carpentry", "roofing", "drywall", "painting",
    ],
    active: true,
    sortOrder: 50,
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
      "asphalt",
      "sealcoat",
      "sealcoating",
      "pavement",
      "parking lot",
      "parking-lot",
      "striping",
      "crack seal",
      "crack-seal",
      "paving",
      "asphalt paving",
      "asphalt repair",
      "pothole",
      "milling",
      "road resurfacing",
      "driveway",
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

// ── Lookup by business type slug ──────────────────────────────────────────────

export function getCapabilitiesForBusinessType(businessType: string): CapabilityDefinition[] {
  if (businessType === "asphalt_sealing") return ASPHALT_SEALING_CAPABILITIES;
  return GENERAL_CONTRACTING_CAPABILITIES;
}

/** Merge all active capability NAICS + keywords into a single deduplicated search set. */
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
    naicsCodes: [...naicsSet],
    keywords: [...kwSet],
    pscCodes: [],           // PSC codes retained from existing hardcoded sets; extend here later
    localKeywords: [...localKwSet],
    negativeKeywords: [...negSet],
    description: descParts.join("\n\n"),
  };
}
