// ── Equipment category labels & metadata ────────────────────────────────────

export type EquipmentCategory =
  | "earthmoving"
  | "asphalt_sealing"
  | "hauling"
  | "trailers"
  | "compaction"
  | "attachments"
  | "tools"
  | "other";

export type EquipmentCondition = "excellent" | "good" | "fair" | "poor" | "for_parts";
export type EquipmentStatus    = "in_service" | "stored" | "for_sale" | "retired";

/** Decision on an individual equipment opportunity */
export type EquipmentDecision =
  | "buy"       // Buy It Now / make offer
  | "bid_now"   // Actively bidding at auction
  | "watch"     // Saved for later consideration
  | "pass";     // Not interested

export interface EquipmentInventoryItem {
  id:             number;
  businessId:     number | null;
  name:           string;
  category:       EquipmentCategory;
  subcategory:    string | null;
  year:           number | null;
  make:           string | null;
  model:          string | null;
  serialNumber:   string | null;
  condition:      EquipmentCondition;
  status:         EquipmentStatus;
  estimatedValue: string | null;  // numeric from db arrives as string
  purchasePrice:  string | null;
  purchaseDate:   string | null;
  notes:          string | null;
  createdAt:      string;
  updatedAt:      string;
}

export type EquipmentSourceCategory =
  | "government_surplus"
  | "commercial_auction"
  | "marketplace";

export type EquipmentConnectionMethod =
  | "api"
  | "public_feed"
  | "portal_link_only";

export interface EquipmentSource {
  slug:               string;
  name:               string;
  category:           EquipmentSourceCategory;
  connectionMethod:   EquipmentConnectionMethod;
  automatedDiscovery: boolean;
  baseUrl:            string | null;
  notes:              string | null;
  globallyActive:     boolean;
}

export type EquipmentListingType = "auction" | "buy_it_now" | "surplus_sale";

export interface EquipmentOpportunity {
  id:                     number;
  sourceSlug:             string;
  externalId:             string;
  title:                  string;
  description:            string | null;
  category:               EquipmentCategory | null;
  locationText:           string | null;
  locationState:          string | null;
  listingType:            EquipmentListingType;
  startPrice:             string | null;
  currentPrice:           string | null;
  buyNowPrice:            string | null;
  auctionEndAt:           string | null;
  listingUrl:             string;
  imageUrl:               string | null;
  isGovernmentSurplus:    boolean;
  conditionNotes:         string | null;
  userDecision:           EquipmentDecision | null;
  userDecisionAt:         string | null;
  userDecisionBusinessId: number | null;
  userNotes:              string | null;
  relevanceScore:         number;
  matchedCategories:      string[] | null;
  firstSeenAt:            string;
  lastSyncedAt:           string;
}

// ── Category display metadata ─────────────────────────────────────────────────

export interface CategoryMeta {
  label:       string;
  description: string;
  examples:    string;
  emoji:       string;
  /** Which business types this is most relevant to */
  relevantFor: string[];
}

export const CATEGORY_META: Record<EquipmentCategory, CategoryMeta> = {
  earthmoving: {
    label:       "Earthmoving",
    description: "Heavy excavation and grading machinery",
    examples:    "Tractors, Loaders, Backhoes, Skid Steers, Excavators, Graders",
    emoji:       "🚜",
    relevantFor: ["general_contracting", "asphalt_sealing"],
  },
  asphalt_sealing: {
    label:       "Asphalt & Sealing",
    description: "Paving, sealing, and striping equipment",
    examples:    "Sealcoating rigs, Crack seal machines, Distributors, Line stripers, Kettles",
    emoji:       "🛣️",
    relevantFor: ["asphalt_sealing"],
  },
  hauling: {
    label:       "Hauling",
    description: "Trucks and vehicles for transporting loads",
    examples:    "Dump trucks, Flatbeds, Box trucks, Water trucks, Service trucks",
    emoji:       "🚛",
    relevantFor: ["general_contracting", "asphalt_sealing"],
  },
  trailers: {
    label:       "Trailers",
    description: "Towable trailers for hauling and transport",
    examples:    "Dump trailers, Equipment trailers, Utility trailers, Lowboys, Goosenecks",
    emoji:       "🚚",
    relevantFor: ["general_contracting", "asphalt_sealing"],
  },
  compaction: {
    label:       "Compaction",
    description: "Soil and asphalt compaction equipment",
    examples:    "Rollers, Plate compactors, Rammers, Walk-behind rollers",
    emoji:       "🔩",
    relevantFor: ["general_contracting", "asphalt_sealing"],
  },
  attachments: {
    label:       "Attachments",
    description: "Interchangeable equipment attachments",
    examples:    "Buckets, Augers, Grapples, Hydraulic breakers, Tillers, Forks",
    emoji:       "🔧",
    relevantFor: ["general_contracting"],
  },
  tools: {
    label:       "Tools & Equipment",
    description: "Portable power equipment and hand tools",
    examples:    "Compressors, Generators, Pressure washers, Power tools, Pumps",
    emoji:       "🛠️",
    relevantFor: ["general_contracting", "asphalt_sealing"],
  },
  other: {
    label:       "Other",
    description: "Miscellaneous equipment not listed above",
    examples:    "Safety equipment, Storage, Office trailers, Miscellaneous",
    emoji:       "📦",
    relevantFor: ["general_contracting", "asphalt_sealing"],
  },
};

export const CONDITION_META: Record<EquipmentCondition, { label: string; color: string }> = {
  excellent: { label: "Excellent",  color: "text-green-600 bg-green-50 border-green-200" },
  good:      { label: "Good",       color: "text-blue-600 bg-blue-50 border-blue-200" },
  fair:      { label: "Fair",       color: "text-amber-600 bg-amber-50 border-amber-200" },
  poor:      { label: "Poor",       color: "text-red-600 bg-red-50 border-red-200" },
  for_parts: { label: "Parts Only", color: "text-slate-600 bg-slate-100 border-slate-200" },
};

export const STATUS_META: Record<EquipmentStatus, { label: string; color: string }> = {
  in_service: { label: "In Service", color: "text-green-700 bg-green-50 border-green-200" },
  stored:     { label: "Stored",     color: "text-slate-600 bg-slate-50 border-slate-200" },
  for_sale:   { label: "For Sale",   color: "text-violet-700 bg-violet-50 border-violet-200" },
  retired:    { label: "Retired",    color: "text-slate-400 bg-slate-50 border-slate-100" },
};

/** Ordered list of all equipment categories — use this to iterate in the frontend. */
export const EQUIPMENT_CATEGORIES: readonly EquipmentCategory[] = [
  "earthmoving",
  "asphalt_sealing",
  "hauling",
  "trailers",
  "compaction",
  "attachments",
  "tools",
  "other",
] as const;

export const SOURCE_CATEGORY_META: Record<EquipmentSourceCategory, { label: string; color: string; description: string }> = {
  government_surplus: {
    label:       "Government Surplus",
    color:       "text-blue-700 bg-blue-50 border-blue-200",
    description: "Official surplus programs from federal, state, and local government agencies",
  },
  commercial_auction: {
    label:       "Commercial Auction",
    color:       "text-amber-700 bg-amber-50 border-amber-200",
    description: "Private auction houses specializing in heavy equipment and commercial assets",
  },
  marketplace: {
    label:       "Marketplace",
    color:       "text-slate-700 bg-slate-100 border-slate-200",
    description: "General-purpose classified and dealer listing platforms",
  },
};
