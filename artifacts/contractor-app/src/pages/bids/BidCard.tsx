import {
  ExternalLink, Star, EyeOff, Sparkles, XCircle, CheckCircle2,
  Building2, RefreshCw, Shield, Users, Globe, Award,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiSummary, BidOpportunity, SetAsideType } from "./types";

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
  const isPast = days !== null && days < 0;
  return (
    <span className={cn(
      "text-xs font-medium",
      isPast ? "text-muted-foreground line-through" : isUrgent ? "text-red-600 dark:text-red-400 font-semibold" : "text-foreground"
    )}>
      Due {deadline}
      {isUrgent && !isPast && <span className="ml-1 text-red-500">({days}d)</span>}
      {isPast && <span className="ml-1 text-muted-foreground">(expired)</span>}
    </span>
  );
}

const SET_ASIDE_CONFIG: Record<SetAsideType, { label: string; icon: typeof Shield; color: string }> = {
  sdvosb: {
    label: "SDVOSB Set-Aside",
    icon: Shield,
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  small_business: {
    label: "Small Business Set-Aside",
    icon: Users,
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  open: {
    label: "Open Competition",
    icon: Globe,
    color: "bg-muted text-muted-foreground",
  },
  other: {
    label: "Veteran Preference",
    icon: Award,
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
          <Icon className="w-3 h-3" />
          {label}
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
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

interface Props {
  bid: BidOpportunity;
  summary: AiSummary | null;
  onSummarize: (bid: BidOpportunity) => void;
  onInterested: (bid: BidOpportunity) => void;
  onDismiss: (bid: BidOpportunity) => void;
  onRestore: (bid: BidOpportunity) => void;
  isUpdating: boolean;
}

export default function BidCard({
  bid,
  summary,
  onSummarize,
  onInterested,
  onDismiss,
  onRestore,
  isUpdating,
}: Props) {
  const effectiveSummary = summary;
  const isDismissed = bid.status === "dismissed";

  return (
    <div className={cn(
      "bg-card border border-border rounded-xl p-4 flex flex-col gap-3 transition-opacity hover:border-border/80",
      isDismissed && "opacity-60"
    )}>
      {/* Top row: source badge + status badge + eligibility */}
      <div className="flex flex-wrap items-center gap-1.5">
        {bid.source === "state-local" ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            {bid.sourceLabel ?? "KY Local"}
          </span>
        ) : (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            Federal
          </span>
        )}

        {bid.status === "interested" && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
            Interested
          </span>
        )}
        {bid.status === "dismissed" && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            Hidden
          </span>
        )}

        <EligibilityBadge summary={effectiveSummary} />

        {effectiveSummary?.bondingRequired && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
            Bond Required
          </span>
        )}
      </div>

      {/* Title */}
      <div>
        <p className="font-semibold text-foreground leading-snug line-clamp-2">{bid.title}</p>
        {bid.agency && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <Building2 className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{bid.agency}</span>
          </p>
        )}
      </div>

      {/* Meta row: NAICS + deadline + fit */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {bid.naicsCode && (
          <span className="text-xs text-muted-foreground">NAICS {bid.naicsCode}</span>
        )}
        <DeadlineBadge deadline={bid.responseDeadline} />
        {effectiveSummary?.isFit !== undefined && (
          <button
            onClick={() => onSummarize(bid)}
            className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-md transition-colors",
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

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border/50">
        <button
          onClick={() => onSummarize(bid)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
        >
          <Sparkles className="w-3 h-3" />
          {effectiveSummary ? "Summary" : "Summarize"}
        </button>
        {bid.url && (
          <a
            href={bid.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors whitespace-nowrap"
          >
            <ExternalLink className="w-3 h-3" />
            View
          </a>
        )}
        {bid.status !== "interested" && !isDismissed && (
          <button
            onClick={() => onInterested(bid)}
            disabled={isUpdating}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 transition-colors whitespace-nowrap"
          >
            <Star className="w-3 h-3" />
            Interested
          </button>
        )}
        {!isDismissed && (
          <button
            onClick={() => onDismiss(bid)}
            disabled={isUpdating}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            <EyeOff className="w-3 h-3" />
            Hide
          </button>
        )}
        {isDismissed && (
          <button
            onClick={() => onRestore(bid)}
            disabled={isUpdating}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Restore
          </button>
        )}
      </div>
    </div>
  );
}
