import { Shield, Clock, FileText, TrendingUp, Send, Pencil, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BidOpportunity } from "./types";
import { calculateBidStats } from "./bidStats";

interface Props {
  bids: BidOpportunity[];
  primaryNaicsCodes?: string[];
}

export default function BidStatsBar({ bids, primaryNaicsCodes = [] }: Props) {
  const stats = calculateBidStats(bids, primaryNaicsCodes);
  const tiles = [
    {
      label: "Active Bids",
      value: stats.activeBids,
      icon: FileText,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      // This is an opportunity count, not a determination that the business is certified/eligible.
      label: "Veteran Opportunities",
      value: stats.veteranOpportunities,
      icon: Shield,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      label: "Due This Week",
      value: stats.dueThisWeek,
      icon: Clock,
      color: stats.dueThisWeek > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
      bg: stats.dueThisWeek > 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-muted/40",
    },
    {
      label: "Bidding",
      value: stats.bidding,
      icon: Pencil,
      color: stats.bidding > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground",
      bg: stats.bidding > 0 ? "bg-orange-50 dark:bg-orange-900/20" : "bg-muted/40",
    },
    {
      label: "NAICS Match",
      value: stats.naicsMatchCount,
      icon: Target,
      color: stats.naicsMatchCount > 0 ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground",
      bg: stats.naicsMatchCount > 0 ? "bg-violet-50 dark:bg-violet-900/20" : "bg-muted/40",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 md:gap-3">
        {tiles.map(({ label, value, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="bg-card border border-border rounded-xl px-3 py-2.5 md:px-4 md:py-3 flex items-center gap-2 md:gap-3"
          >
            <div className={cn(
              "w-7 h-7 md:w-9 md:h-9 rounded-lg flex items-center justify-center flex-shrink-0",
              bg
            )}>
              <Icon className={cn("w-3.5 h-3.5 md:w-4 md:h-4", color)} />
            </div>
            <div className="min-w-0">
              <p className={cn("text-lg md:text-xl font-bold leading-none", color)}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {(stats.submitted > 0 || stats.winRate !== null) && (
        <div className="flex flex-wrap items-center gap-2 md:gap-3 px-3 md:px-4 py-2 rounded-xl bg-card border border-border text-xs md:text-sm">
          {stats.submitted > 0 && (
            <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-medium">
              <Send className="w-3 h-3 md:w-3.5 md:h-3.5" />
              {stats.submitted} Submitted
            </span>
          )}
          {stats.submitted > 0 && stats.winRate !== null && <span className="text-border">·</span>}
          {stats.winRate !== null && (
            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-medium">
              <TrendingUp className="w-3 h-3 md:w-3.5 md:h-3.5" />
              {stats.won}W / {stats.lost}L — {stats.winRate}% win rate
            </span>
          )}
        </div>
      )}
    </div>
  );
}
