import {
  ExternalLink, Sparkles, XCircle, CheckCircle2,
  Building2, Shield, Users, Globe, Award, ChevronDown, Handshake, Info, Calendar, BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiSummary, BidOpportunity, BidStage, SetAsideType } from "./types";
import { PIPELINE_STAGES } from "./types";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function DeadlineBadge({ deadline }: { deadline: string | null }) {
  if (!deadline) return <span className="text-muted-foreground text-xs">No deadline</span>;
  const days = daysUntil(deadline);
  const isUrgent = days !== null && days >= 0 && days <= 7;
  const isPast   = days !== null && days < 0;
  return (
    <span className={cn(
      "text-xs font-medium",
      isPast ? "text-muted-foreground line-through"
             : isUrgent ? "text-red-600 dark:text-red-400 font-semibold"
             : "text-foreground"
    )}>
      Due {deadline}
      {isUrgent && !isPast && <span className="ml-1 text-red-500">({days}d)</span>}
      {isPast && <span className="ml-1 text-muted-foreground">(expired)</span>}
    </span>
  );
}

const SET_ASIDE_CONFIG: Record<SetAsideType, { label: string; icon: typeof Shield; color: string }> = {
  sdvosb: {
    label: "SDVOSB",
    icon:  Shield,
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  small_business: {
    label: "Small Biz",
    icon:  Users,
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  open: {
    label: "Open",
    icon:  Globe,
    color: "bg-muted text-muted-foreground",
  },
  other: {
    label: "Vet Pref",
    icon:  Award,
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
};

function EligibilityBadge({ summary }: { summary: AiSummary | null }) {
  if (!summary) return null;

  const setAsideType = summary.setAsideType;
  if (!setAsideType) {
    if (summary.veteranPreference) {
      const { label, icon: Icon, color } = SET_ASIDE_CONFIG.other;
      return (
        <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full", color)}>
          <Icon className="w-3 h-3" /> {label}
        </span>
      );
    }
    return null;
  }

  const config = SET_ASIDE_CONFIG[setAsideType];
  if (!config) return null;
  const { label, icon: Icon, color } = config;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full", color)}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}

// ── Opportunity type badge ───────────────────────────────────────────────────

const OPP_TYPE_CONFIG: Record<string, { label: string; icon: typeof Info; className: string; title: string }> = {
  sources_sought: {
    label: "Sources Sought",
    icon:  Info,
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
    title: "RFI / Market Research — the agency is not yet accepting bids",
  },
  presolicitation: {
    label: "Pre-Solicitation",
    icon:  Calendar,
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    title: "Early notice — a solicitation is planned but not yet posted",
  },
  forecast: {
    label: "Forecast",
    icon:  Calendar,
    className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
    title: "Planned acquisition from GSA Forecast — not yet solicited",
  },
};

function OpportunityTypeBadge({ type }: { type?: string | null }) {
  if (!type) return null;
  const config = OPP_TYPE_CONFIG[type];
  if (!config) return null;
  const { label, icon: Icon, className, title: tooltip } = config;
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full", className)}
      title={tooltip}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

const STAGE_BADGE: Record<string, { label: string; className: string }> = {
  reviewing: { label: "Reviewing", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  bidding:   { label: "Bidding",   className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  submitted: { label: "Submitted", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  won:       { label: "Won",       className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  lost:      { label: "Lost",      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  no_bid:    { label: "No Bid",    className: "bg-muted text-muted-foreground" },
};

interface Props {
  bid:                   BidOpportunity;
  summary:               AiSummary | null;
  onSummarize:           (bid: BidOpportunity) => void;
  onEducate:             (bid: BidOpportunity) => void;
  onStageChange:         (bid: BidOpportunity, stage: BidStage) => void;
  onDismiss:             (bid: BidOpportunity) => void;
  onRestore:             (bid: BidOpportunity) => void;
  isUpdating:            boolean;
  /** Show business relevance chips (only meaningful in multi-business context). */
  multipleBusinesses?:   boolean;
  relevantBusinessNames?: string[];
}

export default function BidCard({
  bid, summary, onSummarize, onEducate, onStageChange, onDismiss, onRestore, isUpdating,
  multipleBusinesses, relevantBusinessNames,
}: Props) {
  const effectiveSummary = summary;
  const isNoBid   = bid.stage === "no_bid";
  const stageBadge = STAGE_BADGE[bid.stage];

  return (
    <div className={cn(
      "bg-card border border-border rounded-xl p-4 flex flex-col gap-3 transition-opacity",
      "hover:border-border/80",
      isNoBid && "opacity-60"
    )}>

      {/* ── Top badge row: source · opportunity type · stage · eligibility ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Source badge */}
        {bid.source === "state-local" ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            {bid.sourceLabel ?? "KY Local"}
          </span>
        ) : bid.source === "subnet" ? (
          <span
            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
            title="SBA SUBNet — a prime contractor is seeking a subcontractor"
          >
            <Handshake className="w-3 h-3" />
            Subcontracting
          </span>
        ) : bid.source === "gsa-forecast" ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
            GSA Forecast
          </span>
        ) : (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            Federal
          </span>
        )}

        {/* Opportunity type badge (shown only for non-default types not already conveyed by source) */}
        {bid.source !== "subnet" && bid.source !== "gsa-forecast" && (
          <OpportunityTypeBadge type={bid.opportunityType} />
        )}

        {stageBadge && bid.stage !== "new" && (
          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", stageBadge.className)}>
            {stageBadge.label}
          </span>
        )}

        <EligibilityBadge summary={effectiveSummary} />

        {effectiveSummary?.bondingRequired && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
            Bond Req
          </span>
        )}
      </div>

      {/* ── Title + agency ── */}
      <div>
        {/* Allow up to 3 lines on mobile so more text is readable */}
        <p className="font-semibold text-foreground leading-snug line-clamp-3 md:line-clamp-2">
          {bid.title}
        </p>
        {bid.agency && (
          <p className="flex items-start gap-1 text-xs text-muted-foreground mt-1">
            <Building2 className="w-3 h-3 flex-shrink-0 mt-0.5" />
            {/* Show 2 lines of agency on mobile to avoid cutting important context */}
            <span className="line-clamp-2 md:line-clamp-1">{bid.agency}</span>
          </p>
        )}
      </div>

      {/* ── Meta row: NAICS · deadline · fit indicator ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {bid.naicsCode && (
          <span className="text-xs text-muted-foreground">NAICS {bid.naicsCode}</span>
        )}
        <DeadlineBadge deadline={bid.responseDeadline} />
        {effectiveSummary?.isFit !== undefined && (
          <button
            onClick={() => onSummarize(bid)}
            className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md transition-colors",
              effectiveSummary.isFit
                ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                : "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400"
            )}
          >
            {effectiveSummary.isFit
              ? <><CheckCircle2 className="w-3 h-3" /> Fit</>
              : <><XCircle className="w-3 h-3" /> No fit</>
            }
          </button>
        )}
        {effectiveSummary && effectiveSummary.isFit === undefined && (
          <span className="inline-flex items-center gap-1 text-xs text-primary/70">
            <Sparkles className="w-3 h-3" />
            Summarized
          </span>
        )}
      </div>

      {/* ── Business relevance chips (multi-business only) ── */}
      {multipleBusinesses && relevantBusinessNames && relevantBusinessNames.length > 0 && (
        <div className="flex flex-wrap gap-1 -mt-1">
          {relevantBusinessNames.map((name) => (
            <span
              key={name}
              className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground/70 font-medium"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* ── Action row ── */}
      {/* py-2.5 on mobile gives 44px-ish touch target height; desktop stays compact */}
      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border/50">
        <button
          onClick={() => onSummarize(bid)}
          className="flex items-center gap-1 px-3 py-2.5 md:py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5 md:w-3 md:h-3" />
          {effectiveSummary ? "Summary" : "Summarize"}
        </button>

        <button
          onClick={() => onEducate(bid)}
          className={cn(
            "flex items-center gap-1 px-3 py-2.5 md:py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap",
            bid.educationSummary
              ? "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/40"
              : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
          title="Get a plain-English explanation of this bid"
        >
          <BookOpen className="w-3.5 h-3.5 md:w-3 md:h-3" />
          {bid.educationSummary ? "Learn More" : "Learn"}
        </button>

        {bid.url && (
          <a
            href={bid.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-2.5 md:py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5 md:w-3 md:h-3" />
            View
          </a>
        )}

        {!isNoBid && (
          <div className="relative ml-auto">
            <select
              value={bid.stage}
              onChange={(e) => {
                const newStage = e.target.value as BidStage;
                if (newStage === "no_bid") onDismiss(bid);
                else onStageChange(bid, newStage);
              }}
              disabled={isUpdating}
              className="appearance-none pl-3 pr-7 py-2.5 md:py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground cursor-pointer hover:border-primary/50 transition-colors disabled:opacity-60"
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          </div>
        )}

        {isNoBid && (
          <button
            onClick={() => onRestore(bid)}
            disabled={isUpdating}
            className="ml-auto flex items-center gap-1 px-3 py-2.5 md:py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            Restore
          </button>
        )}
      </div>
    </div>
  );
}
