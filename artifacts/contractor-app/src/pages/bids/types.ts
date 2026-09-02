export interface QuickLink {
  id:        string;
  label:     string;
  url:       string;
  username?: string;
  password?: string;
}

/** Precise set-aside and competition-level taxonomy. */
export type SetAsideType =
  | "sdvosb"             // SDVOSB formal set-aside (SDVOSB cert required)
  | "vosb"               // VOSB set-aside (VOSB or SDVOSB cert qualifies)
  | "small_business"     // Total Small Business set-aside
  | "veteran_preference" // Veteran preference in evaluation only — not a formal set-aside
  | "open"               // Full & open competition
  | "other";             // Cert-specific (HUBZone, 8(a), WOSB, etc.)

export type BidStage = "new" | "reviewing" | "bidding" | "submitted" | "won" | "lost" | "no_bid" | "score_rejected";

/**
 * How an opportunity is classified by source + notice type.
 *
 * solicitation    — Active solicitation (open for bids)
 * sources_sought  — RFI / Market Research (informational, no bid yet)
 * presolicitation — Early notice / forecast (planned acquisition)
 * subcontracting  — SBA SUBNet posting (prime contractor seeking a sub)
 * forecast        — GSA Forecast of Contracting Opportunities (future pipeline)
 * award_intelligence — USASpending awarded contract (historical intelligence)
 */
export type OpportunityType =
  | "solicitation"
  | "sources_sought"
  | "presolicitation"
  | "subcontracting"
  | "forecast"
  | "award_intelligence";

export interface AiSummary {
  description?:      string | null;
  estimatedValue?:   string | null;
  requirements?:     string[];
  veteranPreference?: boolean;
  importantDates?:   Array<{ label: string; date: string }>;
  isFit?:            boolean;
  fitReason?:        string | null;
  setAsideType?:     SetAsideType;
  bondingRequired?:  boolean;
  capabilityMatch?:  string | null;
  licenseRisk?:      string | null;
  deepRead?:         DeepRead | null;
}

export interface DeepReadDeadline {
  date: string | null;
  time: string | null;
  timezone: string | null;
  raw: string | null;
}

export interface DeepReadSiteVisit {
  date: string | null;
  time: string | null;
  timezone: string | null;
  location: string | null;
}

export interface DeepReadInsurance {
  generalLiability: string | null;
  workersCompensation: string | null;
  auto: string | null;
  other: string[];
}

export interface DeepRead {
  submissionDeadline: DeepReadDeadline;
  siteVisit: DeepReadSiteVisit | null;
  insuranceRequirements: DeepReadInsurance;
  bonding: {
    required: boolean;
    amounts: string | null;
    details: string | null;
  };
  prevailingWage: {
    required: boolean;
    wageDeterminationNumber: string | null;
    details: string | null;
  };
  smallBusinessSubcontracting: {
    required: boolean;
    details: string | null;
  };
  evaluationCriteria: string[];
  pointOfContact: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  awardSlots: number | null;
  redFlags: string[];
}

// ── Recommendation engine ─────────────────────────────────────────────────────

export type RecommendationLevel = "bid" | "review" | "pass";
export type FactorSignal = "positive" | "negative" | "neutral" | "unknown";

export interface RecommendationFactor {
  key:    string;
  label:  string;
  signal: FactorSignal;
  detail: string;
}

export interface BidRecommendation {
  recommendation: RecommendationLevel;
  confidence:     "high" | "medium" | "low";
  summary:        string;
  factors:        RecommendationFactor[];
  unknowns:       string[];
}

// ── Official source resolution ────────────────────────────────────────────────

export type OfficialSourceStatus =
  | "found"                 // a publicly accessible official government URL was located
  | "aggregator_only"       // only aggregator listing; official source not found
  | "subscription_required" // the listing requires a paid account
  | "not_checked";          // determination has not been attempted yet

// ── Core bid opportunity type ─────────────────────────────────────────────────

export interface BidOpportunity {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  educationSummary?:   EducationSummary | null;
  educationSummaryAt?: string | null;
  id:                number;
  businessId?:       number | null;   // which business's record this row belongs to
  jobId?:            number | null;
  noticeId:          string;
  title:             string;
  agency:            string | null;
  naicsCode:         string | null;
  description:       string | null;
  postedDate:        string | null;
  responseDeadline:  string | null;
  url:               string | null;
  status:            string;
  stage:             BidStage;
  notes:             string | null;
  source:            string;
  sourceLabel:       string | null;
  aiSummary:         AiSummary | null;
  aiSummaryAt:       string | null;
  // Phase 1 — capability-aware engine
  noticeType?:       string | null;
  opportunityScore?: number | null;
  capabilityMatches?: string[] | null;
  // Phase 2 — opportunity classification
  opportunityType?:  OpportunityType | string | null;
  // Raw set-aside code from SAM.gov (e.g. "SBA", "SDVOSB"); AI summary has normalized setAsideType
  setAsideType?:     string | null;
  // Phase 4 — recommendation engine
  recommendation?:          RecommendationLevel | null;
  recommendationFactors?:   RecommendationFactor[] | null;
  // Phase 4 — official source lookup
  officialSourceUrl?:       string | null;
  officialSourceStatus?:    OfficialSourceStatus | null;
  officialSourceCheckedAt?: string | null;
  createdAt:         string;
  // Phase 5 — industrial maintenance contract-type intelligence
  contractType?:     string | null;   // T&M | labor_hour | idiq | task_order | on_call | shutdown_turnaround | fixed_price | unknown
  scopeSize?:        string | null;   // small | medium | large | unknown
  licenseFlags?:     string[] | null; // items requiring licensing verification
  outOfScopeFlags?:  string[] | null; // negative-keyword matches
  // Phase 6 — qualification analysis + private opportunities
  industrialQualSummary?:     IndustrialQualSummary | null;
  industrialQualSummaryAt?:   string | null;
  isPrivateOpportunity?:      boolean | string | null;  // backend stores as text "true"/"false"
  privateOpportunityContact?: string | null;
  privateSourceType?:         string | null;  // subcontract|direct_service|prequalification|on_call_list|purchasing_portal
  // Phase 7 — scope classification + data completeness
  scopeCategory?:     string | null;  // asphalt|flooring|general_contracting|industrial_maintenance|mfg_homes|site_work|dump_waste
  dataCompleteness?:  string | null;  // complete|partial|needs_verification|unknown
  lifecycleState?: "active" | "incomplete" | "verification_needed" | "expired" | "historical";
  defaultActive?: boolean;
  sourceReferenceId?: string | null;  // external source's own identifier
  geography?:          "local" | "regional" | "outside_area" | "unknown" | string | null;
  placeOfPerformance?: string | null;
  geographyReason?:    string | null;
  // Unified feed enrichment (present on GET /api/bids/unified responses)
  capabilityCategories?:   string[];
  relevantBusinessNames?:  string[];
  /** Short explanation of why this bid matched, e.g. "Flooring Installation (NAICS 238330)" */
  relevanceReason?:        string | null;
  /** Present on hidden-feed rows to explain why the opportunity is recoverable here. */
  filterReason?:            string | null;
}

export type NaicsMatch = "exact" | "related" | "none";
export type ReadinessVerdict = "ready" | "almost_ready" | "not_a_fit" | "needs_review";
export type QualRequirementTag = "REQUIRED" | "RECOMMENDED" | "UNKNOWN";
export type QualMeetStatus = "yes" | "no" | "verify" | "unknown";
export type QualEquipmentStatus = "owned" | "rental_recommended" | "must_acquire" | "unknown";

export interface QualRequirement {
  category:    string;
  name:        string;
  tag:         QualRequirementTag;
  companyMeets: QualMeetStatus;
  meetDetail?: string;
}

export interface QualCrewMember {
  memberName:    string;
  role:          string;
  relevantCerts: string[];
  gaps:          string[];
}

export interface QualEquipmentItem {
  name:          string;
  status:        QualEquipmentStatus;
  ownedItemName?: string;
}

export interface IndustrialQualSummary {
  readinessVerdict:              ReadinessVerdict;
  readinessSummary:              string;
  contractStructure:             string;
  contractStructureExplanation:  string;
  requirements:                  QualRequirement[];
  crewReadiness:                 QualCrewMember[];
  equipmentNeeded:               QualEquipmentItem[];
  scopeFitNote:                  string | null;
  licenseVerifyItems:            string[];
}

// ── Education Analysis ────────────────────────────────────────────────────────

export interface EducationRequirement {
  item:   string;  // requirement name (plain English)
  plain:  string;  // what it means
  action: "must_have" | "verify" | "nice_to_have" | "likely_disqualifier";
}

export interface EducationTerm {
  term:  string;
  plain: string;
}

export type CapabilityVerdict = "good_fit" | "possible_fit" | "need_more_info" | "likely_not_fit";

export interface EducationSummary {
  whatTheGovIsBuying: string;
  noticeTypeContext:   string;
  capabilityVerdict:  CapabilityVerdict;
  whyItFits:          string[];
  whyYouMayPass:      string[];
  requirements:       EducationRequirement[];
  howToRespond:       string[];
  questionsForCO:     string[];
  nextStep:           string;
  detectedTerms:      EducationTerm[];
}

// ── Bid source catalog + per-business connection state ────────────────────────
// Matches the shape returned by GET /api/bids/sources?businessId=

export type SourceCategory      = "jobs_contracts" | "auctions_surplus" | "hauling_material" | "both";
export type SourceConnectionMethod =
  | "api" | "public_feed" | "public_scrape"
  | "account_oauth" | "email_feed" | "portal_link_only";
export type SourceConnectionStatus = "active" | "error" | "not_configured" | "portal_only";

export interface BidSourceConnection {
  slug:               string;
  name:               string;
  category:           SourceCategory;
  connectionMethod:   SourceConnectionMethod;
  automatedDiscovery: boolean;
  notes:              string | null;
  isGloballyActive:   boolean;
  // Per-business state (absent row defaults: automated → enabled, portal-only → disabled)
  enabled:            boolean;
  connectionStatus:   SourceConnectionStatus | string;
  lastSyncAt:         string | null;
  lastSyncSuccessAt:  string | null;
  lastSyncError:      string | null;
  recordsImported:    number | null;
  portalUrl:          string | null;
  portalLabel:        string | null;
  // Phase 7 — data quality summary from bid_opportunities.data_completeness
  qualityStats?: {
    complete:           number;
    partial:            number;
    needs_verification: number;
    unknown:            number;
    total:              number;
  } | null;
}

export const PIPELINE_STAGES: Array<{ value: BidStage; label: string; color: string; bg: string; dotColor: string }> = [
  { value: "new",       label: "New",       color: "text-slate-600 dark:text-slate-300",     bg: "bg-slate-50 dark:bg-slate-900/20",     dotColor: "bg-slate-400" },
  { value: "reviewing", label: "Reviewing", color: "text-yellow-700 dark:text-yellow-300",   bg: "bg-yellow-50 dark:bg-yellow-900/20",   dotColor: "bg-yellow-400" },
  { value: "bidding",   label: "Bidding",   color: "text-orange-700 dark:text-orange-300",   bg: "bg-orange-50 dark:bg-orange-900/20",   dotColor: "bg-orange-400" },
  { value: "submitted", label: "Submitted", color: "text-blue-700 dark:text-blue-300",       bg: "bg-blue-50 dark:bg-blue-900/20",       dotColor: "bg-blue-500" },
  { value: "won",       label: "Won",       color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-900/20", dotColor: "bg-emerald-500" },
  { value: "lost",      label: "Lost",      color: "text-red-700 dark:text-red-300",         bg: "bg-red-50 dark:bg-red-900/20",         dotColor: "bg-red-400" },
  { value: "no_bid",    label: "No Bid",    color: "text-muted-foreground",                  bg: "bg-muted/40",                          dotColor: "bg-muted-foreground/40" },
];

/** Compare a bid code with the business's configured primary NAICS codes. */
export function getNaicsMatch(
  bidCode: string | null | undefined,
  primaryCodes: string[] | null | undefined,
): NaicsMatch {
  const bid = bidCode?.trim();
  const codes = (primaryCodes ?? [])
    .map((code) => code.trim())
    .filter((code) => /^\d{6}$/.test(code));
  if (!bid || !/^\d{6}$/.test(bid) || codes.length === 0) return "none";
  if (codes.includes(bid)) return "exact";
  return codes.some((code) => code.slice(0, 3) === bid.slice(0, 3)) ? "related" : "none";
}
