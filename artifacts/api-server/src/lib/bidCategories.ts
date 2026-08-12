/**
 * Canonical capability category definitions for the unified bid feed.
 *
 * Each opportunity's NAICS code (and source field for subcontracting) is matched
 * against these definitions at query time to populate `capabilityCategories[]`.
 * An opportunity can match multiple categories (e.g. NAICS 238330 → flooring +
 * general_contracting).  Categories with no matching NAICS prefix are returned
 * as an empty array — they are still visible under the "All" tab.
 *
 * The ordering here determines the display-tab order on the frontend.
 */

export interface CapabilityCategory {
  key:        string;
  label:      string;
  /** Exact 6-digit NAICS codes that map to this category. Empty = source-based only. */
  naicsCodes: string[];
}

export const CAPABILITY_CATEGORIES: CapabilityCategory[] = [
  {
    key:       "asphalt",
    label:     "Asphalt & Paving",
    naicsCodes: ["237310"],
  },
  {
    key:       "dump_waste",
    label:     "Dump & Waste",
    naicsCodes: ["562111", "562119", "562910"],
  },
  {
    key:       "flooring",
    label:     "Flooring",
    // These codes also appear in general_contracting and mfg_homes — intentional multi-match
    naicsCodes: ["238330", "238340"],
  },
  {
    key:       "mfg_homes",
    label:     "Manufactured Homes",
    // Mirrors the mh_finishing capability profile codes from bidCapabilitySeeds.ts.
    // Several overlap with general_contracting (238310, 238330, 238350, 238390, 238220) — intentional.
    naicsCodes: [
      "236118", // Residential remodelers (MH setup/completion)
      "238310", // Drywall & insulation
      "238330", // Flooring contractors (also in flooring tab)
      "238350", // Finish carpentry
      "238220", // Plumbing, heating & A/C
      "238390", // Other finish trade contractors
    ],
  },
  {
    key:       "site_work",
    label:     "Site Work & Excavation",
    naicsCodes: ["238910", "237990", "237110"],
  },
  {
    key:       "general_contracting",
    label:     "General Contracting",
    // Broad set covering residential/commercial building and all finish trades.
    // 238330/238340 overlap with flooring; 238310/238350/238390/238220 overlap with mfg_homes.
    // This is intentional: NAICS 238330 → flooring + general_contracting + mfg_homes.
    naicsCodes: [
      "236115", "236116", "236118",            // residential builders / remodelers
      "238110",                                 // poured concrete
      "238140",                                 // masonry / stonework
      "238160",                                 // roofing
      "238170",                                 // siding / sheet metal
      "238310",                                 // drywall & insulation (also mfg_homes)
      "238320",                                 // painting & wall covering
      "238330", "238340",                       // flooring (also flooring + mfg_homes tabs)
      "238350",                                 // finish carpentry (also mfg_homes)
      "238390",                                 // other finish trades (also mfg_homes)
      "238220",                                 // plumbing / HVAC (also mfg_homes)
      "238990",                                 // other specialty trade contractors
    ],
  },
  {
    // Source-based — subnet opportunities regardless of NAICS code
    key:       "subcontracting",
    label:     "Subcontracting",
    naicsCodes: [],
  },
];

/**
 * Derives all matching capability categories for a bid opportunity at query time.
 *
 * @param naicsCode - The 6-digit NAICS code from the opportunity, or null.
 * @param source    - The `source` field value (e.g. "federal", "subnet", "state-local").
 * @returns Ordered array of matching category keys; may be empty; may be multiple.
 */
export function deriveCapabilityCategories(naicsCode: string | null, source: string): string[] {
  // Subcontracting is purely source-based — subnet postings carry no useful NAICS
  if (source === "subnet") return ["subcontracting"];

  if (!naicsCode) return [];

  return CAPABILITY_CATEGORIES
    .filter(c => c.naicsCodes.length > 0 && c.naicsCodes.includes(naicsCode))
    .map(c => c.key);
}
