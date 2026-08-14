export type GrantStage = "new" | "saved" | "applied" | "no_interest";
export type EligibilityLabel = "likely" | "maybe" | "unlikely";

export interface GrantOpportunity {
  id: number;
  businessId: number | null;
  externalId: string;
  title: string;
  agency: string | null;
  description: string | null;
  postedDate: string | null;
  deadline: string | null;
  fundingMin: number | null;
  fundingMax: number | null;
  opportunityType: string; // grant | cooperative_agreement | loan | tax_credit | other
  grantCategories: string[];
  useOfFunds: string | null;
  keyRequirements: string[];
  applicationUrl: string | null;
  source: string;
  stage: GrantStage;
  fitScore: number | null;
  eligibilityLabel: EligibilityLabel | null;
  matchReasons: string[];
  notes: string | null;
  createdAt: string;
}

export interface GrantSourceConnection {
  slug: string;
  name: string;
  category: string;
  connectionMethod: string; // api | website | manual
  automatedDiscovery: boolean;
  notes: string | null;
  websiteUrl: string | null;
  isGloballyActive: boolean;
  enabled: boolean;
  connectionStatus: string; // active | error | not_configured | manual_only
  lastSyncAt: string | null;
  lastSyncSuccessAt: string | null;
  lastSyncError: string | null;
  recordsImported: number | null;
}

export interface GrantSettings {
  businessId?: number;
  isSmallBusiness?: boolean;
  isSdvosb?: boolean;
  isVosb?: boolean;
  isHubzone?: boolean;
  is8a?: boolean;
  homeZip?: string | null;
  profileStatus?: string;
}

export type GrantTypeFilter =
  | "all"
  | "small_business"
  | "veteran"
  | "equipment"
  | "workforce"
  | "technology"
  | "rural"
  | "construction"
  | "economic_dev";

export type FundingFilter = "all" | "under_10k" | "10k_50k" | "50k_250k" | "over_250k";
export type DeadlineFilter = "all" | "this_month" | "30_days" | "90_days";
export type EligibilityFilter = "all" | EligibilityLabel;

export interface GrantFilters {
  grantType:       GrantTypeFilter;
  funding:         FundingFilter;
  deadline:        DeadlineFilter;
  eligibility:     EligibilityFilter;
  includeNonGrants: boolean;
  stage:           "all" | "new" | "saved" | "applied" | "no_interest";
}
