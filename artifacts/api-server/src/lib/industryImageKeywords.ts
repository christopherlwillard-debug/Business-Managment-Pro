/**
 * Phase 5 M5 — Industry Image Keywords
 *
 * Curated, license-free image library for AI Image Suggestions.
 * Each entry maps (businessType, sectionType) → ImageSuggestion[].
 *
 * All images are from Unsplash (unsplash.com) and are freely usable
 * under the Unsplash License (https://unsplash.com/license) for any purpose.
 *
 * URL format:
 *   Full:   https://images.unsplash.com/photo-{id}?auto=format&fit=crop&w=1200&q=80
 *   Thumb:  https://images.unsplash.com/photo-{id}?auto=format&fit=crop&w=400&q=70
 */

export interface ImageSuggestion {
  /** Unsplash photo ID (without the "photo-" prefix) */
  id: string;
  /** Full URL for use in the website */
  url: string;
  /** Thumbnail URL for the picker grid */
  thumbUrl: string;
  /** Photographer credit */
  attribution: string;
  /** Unsplash profile URL for attribution */
  attributionUrl: string;
  /** Human-readable category shown under the thumbnail */
  category: string;
  /** Alt text for accessibility */
  alt: string;
}

function photo(
  id: string,
  attribution: string,
  unsplashHandle: string,
  category: string,
  alt: string,
): ImageSuggestion {
  return {
    id,
    url:       `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=80`,
    thumbUrl:  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=400&q=70`,
    attribution,
    attributionUrl: `https://unsplash.com/@${unsplashHandle}`,
    category,
    alt,
  };
}

// ── Shared pools (used as fallbacks and generic sections) ─────────────────────

const HERO_HOMES: ImageSuggestion[] = [
  photo("1560518883-ce09059eeffa", "Collov Home Design", "collovhome",     "Exterior",      "Beautiful suburban home exterior with manicured lawn"),
  photo("1449844908441-8829b2c80cde", "Tierra Mallorca",  "tierramallorca", "Front Exterior","Classic American house front with landscaped yard"),
  photo("1523217582562-09d05ab1b167", "Chloe Evans",       "chloe_evans_",   "Renovation",    "Home exterior renovation in progress"),
  photo("1516455590571-18b4e3b48a86", "Derek Torsani",     "dtorsani",       "Neighborhood",  "Residential neighborhood streetscape"),
  photo("1484154218962-a197022b5858", "Lotus Design N Print", "lotus_design", "Interior",     "Bright modern interior living room"),
  photo("1600585154526-990dced4db0d", "Collov Home Design", "collovhome",    "Interior",      "Cozy modern living room with natural light"),
];

const HERO_CONSTRUCTION: ImageSuggestion[] = [
  photo("1504307651254-35680f356dfd", "Henry & Co.",       "hngstrm",        "Job Site",      "Construction worker at job site"),
  photo("1503387762-592deb58ef4e",    "Josue Isai Ramos",  "jramos168",      "Framing",       "Wood framing during new home construction"),
  photo("1541888946425-d81bb19240f5", "Ricardo Gomez",     "ripato",         "Renovation",    "Residential renovation in progress"),
  photo("1581094794329-c8112a89af12", "Theme Photos",      "theme_photos",   "Tools",         "Professional contractor tools and equipment"),
];

const TEAM_ABOUT: ImageSuggestion[] = [
  photo("1581578731548-c64695cc6952", "Alexander Dummer",  "alexanderdummer","Team",          "Professional contractor handshake"),
  photo("1507003211169-0a1dd7228f2d", "Ben Parker",        "ben__parker",    "Owner",         "Confident business owner portrait"),
  photo("1519085360753-af0119f7cbe7", "Ben Parker",        "ben__parker",    "Professional",  "Professional tradesperson outdoors"),
  photo("1556157382-97eda2d62296",    "Austin Distel",     "austindistel",   "Team",          "Small business team photo"),
];

const SERVICES_GRID: ImageSuggestion[] = [
  photo("1564540574859-0dfb63985953", "Theme Photos",      "theme_photos",   "Services",      "Professional contractor services overview"),
  photo("1516455590571-18b4e3b48a86", "Derek Torsani",     "dtorsani",       "Residential",   "Residential service area"),
];

// ── Industry-specific pools ────────────────────────────────────────────────────

const ROOFING: ImageSuggestion[] = [
  photo("1558618666-fcd25c85cd64", "Unsplash",            "unsplash",       "Shingles",      "Close-up of asphalt roof shingles"),
  photo("1588776814546-1b2c8b53f281", "Raze Solar",       "razesolar",      "Roofer at Work","Roofer installing shingles on residential roof"),
  photo("1506126613408-eca07ce68773", "Jeremy Bezanger",   "unarchive",      "Roof Ridge",    "Roof ridge line against blue sky"),
  photo("1576158114254-3a14c583b742", "Unsplash",          "unsplash",       "Storm Damage",  "Roof damage inspection from above"),
  photo("1504109586057-7a2ae83d1338", "Ussama Azam",       "ussamaazam",     "New Roof",      "Freshly installed roof on new home"),
  photo("1635406453990-53a7ef5b7d4f", "Unsplash",          "unsplash",       "Tear-off",      "Roof replacement project in progress"),
  photo("1580587771525-78b9dba3b914", "Unsplash",          "unsplash",       "Aerial View",   "Aerial view of roofed neighborhood"),
];

const HVAC: ImageSuggestion[] = [
  photo("1621905251189-08b45d6a269e", "Unsplash",          "unsplash",       "Condenser Unit","HVAC condenser unit on a residential property"),
  photo("1589820296156-2454bb8a6ad1", "Unsplash",          "unsplash",       "Interior AC",   "Ceiling air conditioning unit installation"),
  photo("1607471289-491916a7e9a5",    "Unsplash",          "unsplash",       "System Unit",   "Modern HVAC system installation"),
  photo("1595428774223-ef52624120d2", "Sten Rademaker",    "stenrademaker",  "Thermostat",    "Smart thermostat on wall"),
  photo("1564540574859-0dfb63985953", "Theme Photos",      "theme_photos",   "Ductwork",      "HVAC ductwork installation in attic"),
  photo("1609942071601-dc6b1a4d6d41", "Unsplash",          "unsplash",       "Furnace",       "Gas furnace in utility room"),
];

const PLUMBING: ImageSuggestion[] = [
  photo("1584622650111-993a426fbf0a", "Unsplash",          "unsplash",       "Plumber",       "Plumber working under kitchen sink"),
  photo("1606472529001-9c0b2da47afe", "Unsplash",          "unsplash",       "Pipe Fitting",  "Copper pipe fittings and plumbing hardware"),
  photo("1571786256765-a69a99ada3be", "Unsplash",          "unsplash",       "Bathroom",      "Modern bathroom renovation with new fixtures"),
  photo("1563861826100-9cb868fdbe1c", "Unsplash",          "unsplash",       "Water Heater",  "Water heater installation in utility closet"),
  photo("1585771724684-38269d6639fd", "Unsplash",          "unsplash",       "Drain Repair",  "Drain pipe repair work"),
  photo("1513694203232-719a280e022f", "Unsplash",          "unsplash",       "Kitchen Plumb.", "Kitchen sink and faucet installation"),
];

const ELECTRICAL: ImageSuggestion[] = [
  photo("1587560699334-cc4ff634909a", "Unsplash",          "unsplash",       "Breaker Panel", "Electrical panel breaker box installation"),
  photo("1621905252472-942e2c35ab1b", "Unsplash",          "unsplash",       "Electrician",   "Electrician working on wiring"),
  photo("1558618047-3c8c76ca7d13",    "Unsplash",          "unsplash",       "Outlet Install","Outlet installation in new construction"),
  photo("1489175638613-7c5c90a86bd2", "Unsplash",          "unsplash",       "Exterior Light","Outdoor lighting fixture installation"),
  photo("1565049786474-1dea82a8b995", "Unsplash",          "unsplash",       "Smart Lighting","Modern LED smart lighting system"),
];

const LANDSCAPING: ImageSuggestion[] = [
  photo("1416879595882-3373a0480b5b", "Markus Spiske",     "markusspiske",   "Green Lawn",    "Lush green residential lawn"),
  photo("1558618047-3c8c76ca7d13",    "Unsplash",          "unsplash",       "Landscape Plan","Landscaping design and layout"),
  photo("1592417817038-d13fd7342c13", "Unsplash",          "unsplash",       "Lawn Mowing",   "Lawn mowing and maintenance service"),
  photo("1625246333-a8b56c3c63d8",    "Unsplash",          "unsplash",       "Lawn Care",     "Grass cutting and lawn care"),
  photo("1558904541-efa843a96f01",    "Unsplash",          "unsplash",       "Garden Design", "Professional garden design with flower beds"),
  photo("1563241527-3004b3eeea96",    "Unsplash",          "unsplash",       "Irrigation",    "Sprinkler system installation in lawn"),
  photo("1547499417-765bbc2e4e11",    "Daniel Mirlea",     "dmirlea",        "Tree Service",  "Tree trimming and removal service"),
];

const FLOORING: ImageSuggestion[] = [
  photo("1555041469-5be0a10b65df",    "Nathan Fertig",     "nathanfertig",   "Hardwood Floor","Wide plank hardwood flooring installation"),
  photo("1589568165773-cc6e99ec7b66", "Unsplash",          "unsplash",       "LVP Flooring",  "Luxury vinyl plank flooring installation"),
  photo("1558618666-fcd25c85cd64",    "Unsplash",          "unsplash",       "Tile Work",     "Tile flooring installation close-up"),
  photo("1600166898405-da9535204843", "Collov Home Design","collovhome",     "Living Room",   "Modern living room with new hardwood floors"),
  photo("1600607687644-c7171b42498b", "Collov Home Design","collovhome",     "Open Concept",  "Open concept home with beautiful LVP floors"),
  photo("1556909114-f6e7ad7d3136",    "Unsplash",          "unsplash",       "Carpet Install","Carpet installation in residential bedroom"),
];

const PAINTING: ImageSuggestion[] = [
  photo("1562259949-e8e7290adbb4",    "Unsplash",          "unsplash",       "Painter",       "Professional painter rolling paint on wall"),
  photo("1589612528573-5de55f2be8a6", "Unsplash",          "unsplash",       "Exterior Paint","House exterior painting with ladder"),
  photo("1558618666-fcd25c85cd64",    "Unsplash",          "unsplash",       "Color Match",   "Paint color swatches and samples"),
  photo("1615529182904-14819c35db37", "Tina Dawson",       "fattydoge",      "Interior Walls","Freshly painted bright interior walls"),
  photo("1589945425011-44ab91283451", "Unsplash",          "unsplash",       "Brush Work",    "Detailed trim painting work"),
];

const MANUFACTURED_HOME: ImageSuggestion[] = [
  photo("1560518883-ce09059eeffa",    "Collov Home Design","collovhome",     "Home Exterior", "Modern manufactured home exterior"),
  photo("1449844908441-8829b2c80cde", "Tierra Mallorca",   "tierramallorca", "Neighborhood",  "Manufactured home community"),
  photo("1484154218962-a197022b5858", "Lotus Design",      "lotus_design",   "Living Room",   "Bright manufactured home interior"),
  photo("1600585154526-990dced4db0d", "Collov Home Design","collovhome",     "Kitchen",       "Modern manufactured home kitchen"),
  photo("1600166898405-da9535204843", "Collov Home Design","collovhome",     "New Floors",    "Manufactured home with new LVP floors"),
  photo("1518780664697-55e3ad937233", "Jens Kreuter",      "jenskreuter",    "Delivery",      "Manufactured home being delivered and set"),
  photo("1590325139592-e2b9e9d33498", "Khachik Simonian",  "khachik_s",      "Installation",  "Manufactured home installation and setup"),
  photo("1523217582562-09d05ab1b167", "Chloe Evans",       "chloe_evans_",   "Setup",         "Manufactured home site preparation"),
];

const ASPHALT: ImageSuggestion[] = [
  photo("1536640712-4d4c36ff0e4e",    "Unsplash",          "unsplash",       "Driveway",      "Freshly sealed asphalt driveway"),
  photo("1569041023534-df0d5cd53e62", "Unsplash",          "unsplash",       "Parking Lot",   "Commercial parking lot paving"),
  photo("1615397349754-cfa2066a298e", "Unsplash",          "unsplash",       "Paving",        "Asphalt paving machine in operation"),
  photo("1504307651254-35680f356dfd", "Henry & Co.",       "hngstrm",        "Crew",          "Paving crew at work"),
  photo("1485955900006-10f4d324d411", "Jaromír Kavan",     "jerrykavan",     "Road Work",     "Asphalt road construction and repair"),
];

const GENERAL_CONTRACTOR: ImageSuggestion[] = [
  ...HERO_CONSTRUCTION,
  photo("1590325139592-e2b9e9d33498", "Khachik Simonian",  "khachik_s",      "Renovation",    "Residential renovation in progress"),
  photo("1581094794329-c8112a89af12", "Theme Photos",      "theme_photos",   "Tools",         "Contractor tools and work belt"),
  photo("1527576539890-dfa815648363", "Unsplash",          "unsplash",       "Blueprint",     "Blueprint review on construction site"),
  photo("1504307651254-35680f356dfd", "Henry & Co.",       "hngstrm",        "Job Site",      "General contractor job site overview"),
];

// ── Index: businessType → sectionType → ImageSuggestion[] ────────────────────

type SectionPool = Record<string, ImageSuggestion[]>;
type IndustryMap  = Record<string, SectionPool>;

const INDUSTRY_IMAGE_MAP: IndustryMap = {
  "roofing": {
    hero:        ROOFING.slice(0, 6),
    services:    ROOFING.slice(0, 4),
    about:       [...TEAM_ABOUT.slice(0, 2), ...ROOFING.slice(0, 2)],
    portfolio:   ROOFING,
    gallery:     ROOFING,
    "before-after": ROOFING,
    image:       [...ROOFING.slice(0, 4), ...HERO_HOMES.slice(0, 2)],
    _default:    ROOFING,
  },
  "hvac": {
    hero:        HVAC.slice(0, 5),
    services:    HVAC.slice(0, 4),
    about:       [...TEAM_ABOUT.slice(0, 2), ...HVAC.slice(0, 2)],
    portfolio:   HVAC,
    gallery:     HVAC,
    "before-after": HVAC,
    image:       [...HVAC, ...HERO_HOMES.slice(0, 2)],
    _default:    HVAC,
  },
  "plumbing": {
    hero:        PLUMBING.slice(0, 5),
    services:    PLUMBING.slice(0, 4),
    about:       [...TEAM_ABOUT.slice(0, 2), ...PLUMBING.slice(0, 2)],
    portfolio:   PLUMBING,
    gallery:     PLUMBING,
    "before-after": PLUMBING,
    image:       [...PLUMBING, ...HERO_HOMES.slice(0, 2)],
    _default:    PLUMBING,
  },
  "electrical": {
    hero:        ELECTRICAL.slice(0, 5),
    services:    ELECTRICAL.slice(0, 4),
    about:       [...TEAM_ABOUT.slice(0, 2), ...ELECTRICAL.slice(0, 2)],
    portfolio:   ELECTRICAL,
    gallery:     ELECTRICAL,
    "before-after": ELECTRICAL,
    image:       [...ELECTRICAL, ...HERO_HOMES.slice(0, 2)],
    _default:    ELECTRICAL,
  },
  "landscaping": {
    hero:        LANDSCAPING.slice(0, 6),
    services:    LANDSCAPING.slice(0, 5),
    about:       [...TEAM_ABOUT.slice(0, 2), ...LANDSCAPING.slice(0, 2)],
    portfolio:   LANDSCAPING,
    gallery:     LANDSCAPING,
    "before-after": LANDSCAPING,
    image:       [...LANDSCAPING, ...HERO_HOMES.slice(0, 2)],
    _default:    LANDSCAPING,
  },
  "flooring": {
    hero:        FLOORING.slice(0, 5),
    services:    FLOORING.slice(0, 4),
    about:       [...TEAM_ABOUT.slice(0, 2), ...FLOORING.slice(0, 2)],
    portfolio:   FLOORING,
    gallery:     FLOORING,
    "before-after": FLOORING,
    image:       [...FLOORING, ...HERO_HOMES.slice(0, 2)],
    _default:    FLOORING,
  },
  "painting": {
    hero:        PAINTING.slice(0, 5),
    services:    PAINTING.slice(0, 4),
    about:       [...TEAM_ABOUT.slice(0, 2), ...PAINTING.slice(0, 2)],
    portfolio:   PAINTING,
    gallery:     PAINTING,
    "before-after": PAINTING,
    image:       [...PAINTING, ...HERO_HOMES.slice(0, 2)],
    _default:    PAINTING,
  },
  "manufactured-home": {
    hero:        MANUFACTURED_HOME.slice(0, 6),
    services:    MANUFACTURED_HOME.slice(0, 5),
    about:       [...TEAM_ABOUT.slice(0, 2), ...MANUFACTURED_HOME.slice(0, 3)],
    portfolio:   MANUFACTURED_HOME,
    gallery:     MANUFACTURED_HOME,
    "before-after": MANUFACTURED_HOME,
    image:       MANUFACTURED_HOME,
    _default:    MANUFACTURED_HOME,
  },
  "asphalt-sealing": {
    hero:        ASPHALT.slice(0, 5),
    services:    ASPHALT.slice(0, 4),
    about:       [...TEAM_ABOUT.slice(0, 2), ...ASPHALT.slice(0, 2)],
    portfolio:   ASPHALT,
    gallery:     ASPHALT,
    "before-after": ASPHALT,
    image:       [...ASPHALT, ...HERO_HOMES.slice(0, 2)],
    _default:    ASPHALT,
  },
  "general-contractor": {
    hero:        [...HERO_CONSTRUCTION, ...HERO_HOMES.slice(0, 2)],
    services:    GENERAL_CONTRACTOR.slice(0, 5),
    about:       [...TEAM_ABOUT, ...GENERAL_CONTRACTOR.slice(0, 2)],
    portfolio:   GENERAL_CONTRACTOR,
    gallery:     GENERAL_CONTRACTOR,
    "before-after": GENERAL_CONTRACTOR,
    image:       [...GENERAL_CONTRACTOR, ...HERO_HOMES.slice(0, 2)],
    _default:    GENERAL_CONTRACTOR,
  },
};

// ── Fallback: used when businessType isn't in the map ─────────────────────────

const FALLBACK: SectionPool = {
  hero:        [...HERO_HOMES.slice(0, 3), ...HERO_CONSTRUCTION.slice(0, 3)],
  services:    [...SERVICES_GRID, ...GENERAL_CONTRACTOR.slice(0, 4)],
  about:       TEAM_ABOUT,
  portfolio:   GENERAL_CONTRACTOR,
  gallery:     [...HERO_HOMES, ...GENERAL_CONTRACTOR],
  "before-after": GENERAL_CONTRACTOR,
  image:       [...HERO_HOMES, ...HERO_CONSTRUCTION],
  _default:    [...HERO_HOMES.slice(0, 3), ...HERO_CONSTRUCTION.slice(0, 3)],
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get up to 12 suggested images for a given businessType + sectionType
 * combination.  Falls back gracefully when no specific map entry exists.
 *
 * @param businessType  — e.g. "roofing", "hvac", "manufactured-home"
 * @param sectionType   — e.g. "hero", "services", "gallery", "image"
 * @returns             Up to 12 deduplicated ImageSuggestion objects
 */
export function getSuggestedImages(
  businessType: string,
  sectionType:  string,
): ImageSuggestion[] {
  const bt = businessType.toLowerCase().trim();
  const st = sectionType.toLowerCase().trim();

  const industryPool = INDUSTRY_IMAGE_MAP[bt] ?? FALLBACK;
  const sectionPool  = industryPool[st] ?? industryPool["_default"] ?? FALLBACK["_default"];

  // Deduplicate by photo ID and cap at 12
  const seen = new Set<string>();
  const out: ImageSuggestion[] = [];
  for (const img of sectionPool) {
    if (!seen.has(img.id)) {
      seen.add(img.id);
      out.push(img);
      if (out.length >= 12) break;
    }
  }
  return out;
}

export type { ImageSuggestion as SuggestedImage };
