import { Shield, Clock, FileText, TrendingUp, Send, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BidOpportunity } from "./types";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

interface Props {
  bids: BidOpportunity[];
}

export default function BidStatsBar({ bids }: Props) {
  const activeBids = bids.filter((b) => b.stage !== "no_bid");

  const sdvosbEligible = activeBids.filter((b) => {
    const s = b.aiSummary;
    if (!s) return false;
    return s.setAsideType === "sdvosb" || s.veteranPreference === true;
  }).length;

  const expiringSoon = activeBids.filter((b) => {
    const days = daysUntil(b.responseDeadline);
    return days !== null && days >= 0 && days <= 7;
  }).length;

  const bidding   = bids.filter((b) => b.stage === "bidding").length;
  const submitted = bids.filter((b) => b.stage === "submitted").length;
  const won       = bids.filter((b) => b.stage === "won").length;
  const lost      = bids.filter((b) => b.stage === "lost").length;
  const total     = won + lost;
  const winRate   = total > 0 ? Math.round((won / total) * 100) : null;

  const tiles = [
    {
      label: "Active Bids",
      value: activeBids.length,
      icon: FileText,
      color: "text-blue-600 dark:text-blue-400",
      bg:    "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "SDVOSB Eligible",
      value: sdvosbEligible,
      icon: Shield,
      color: "text-emerald-600 dark:text-emerald-400",
      bg:    "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      label: "Due This Week",
      value: expiringSoon,
      icon: Clock,
      color: expiringSoon > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
      bg:    expiringSoon > 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-muted/40",
    },
    {
      label: "Bidding",
      value: bidding,
      icon: Pencil,
      color: bidding > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground",
      bg:    bidding > 0 ? "bg-orange-50 dark:bg-orange-900/20" : "bg-muted/40",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
        {tiles.map(({ label, value, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="bg-card border border-border rounded-xl px-3 py-2.5 md:px-4 md:py-3 flex items-center gap-2 md:gap-3"
          >
            {/* Icon — smaller on mobile to leave room for text */}
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

      {(submitted > 0 || winRate !== null) && (
        <div className="flex flex-wrap items-center gap-2 md:gap-3 px-3 md:px-4 py-2 rounded-xl bg-card border border-border text-xs md:text-sm">
          {submitted > 0 && (
            <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-medium">
              <Send className="w-3 h-3 md:w-3.5 md:h-3.5" />
              {submitted} Submitted
            </span>
          )}
          {submitted > 0 && winRate !== null && (
            <span className="text-border">·</span>
          )}
          {winRate !== null && (
            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-medium">
              <TrendingUp className="w-3 h-3 md:w-3.5 md:h-3.5" />
              {won}W / {lost}L — {winRate}% win rate
            </span>
          )}
        </div>
      )}
    </div>
  );
}
