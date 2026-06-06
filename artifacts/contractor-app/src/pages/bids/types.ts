export interface QuickLink {
  id: string;
  label: string;
  url: string;
  username?: string;
  password?: string;
}

export type SetAsideType = "sdvosb" | "small_business" | "open" | "other";

export type BidStage = "new" | "reviewing" | "bidding" | "submitted" | "won" | "lost" | "no_bid";

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
  stage: BidStage;
  notes: string | null;
  source: string;
  sourceLabel: string | null;
  aiSummary: AiSummary | null;
  aiSummaryAt: string | null;
  createdAt: string;
}

export const PIPELINE_STAGES: Array<{ value: BidStage; label: string; color: string; bg: string; dotColor: string }> = [
  { value: "new",       label: "New",       color: "text-slate-600 dark:text-slate-300",   bg: "bg-slate-50 dark:bg-slate-900/20",   dotColor: "bg-slate-400" },
  { value: "reviewing", label: "Reviewing", color: "text-yellow-700 dark:text-yellow-300", bg: "bg-yellow-50 dark:bg-yellow-900/20", dotColor: "bg-yellow-400" },
  { value: "bidding",   label: "Bidding",   color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-50 dark:bg-orange-900/20", dotColor: "bg-orange-400" },
  { value: "submitted", label: "Submitted", color: "text-blue-700 dark:text-blue-300",     bg: "bg-blue-50 dark:bg-blue-900/20",     dotColor: "bg-blue-500" },
  { value: "won",       label: "Won",       color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-900/20", dotColor: "bg-emerald-500" },
  { value: "lost",      label: "Lost",      color: "text-red-700 dark:text-red-300",       bg: "bg-red-50 dark:bg-red-900/20",       dotColor: "bg-red-400" },
  { value: "no_bid",    label: "No Bid",    color: "text-muted-foreground",                bg: "bg-muted/40",                        dotColor: "bg-muted-foreground/40" },
];
