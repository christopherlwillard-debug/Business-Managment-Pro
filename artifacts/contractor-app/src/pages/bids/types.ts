export interface QuickLink {
  id:        string;
  label:     string;
  url:       string;
  username?: string;
  password?: string;
}

export type SetAsideType = "sdvosb" | "small_business" | "open" | "other";

export type BidStage = "new" | "reviewing" | "bidding" | "submitted" | "won" | "lost" | "no_bid";

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
}

export interface BidOpportunity {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  educationSummary?:   EducationSummary | null;
  educationSummaryAt?: string | null;
  id:                number;
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
  createdAt:         string;
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
