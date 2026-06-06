export interface QuickLink {
  id: string;
  label: string;
  url: string;
  username?: string;
  password?: string;
}

export type SetAsideType = "sdvosb" | "small_business" | "open" | "other";

export interface AiSummary {
  description?: string;
  estimatedValue?: string | null;
  requirements?: string[];
  veteranPreference?: boolean;
  importantDates?: Array<{ label: string; date: string }>;
  isFit?: boolean;
  fitReason?: string;
  setAsideType?: SetAsideType;
  bondingRequired?: boolean;
}

export interface BidOpportunity {
  id: number;
  noticeId: string;
  title: string;
  agency: string | null;
  naicsCode: string | null;
  description: string | null;
  postedDate: string | null;
  responseDeadline: string | null;
  url: string | null;
  status: string;
  source: string;
  sourceLabel: string | null;
  aiSummary: AiSummary | null;
  aiSummaryAt: string | null;
  createdAt: string;
}
