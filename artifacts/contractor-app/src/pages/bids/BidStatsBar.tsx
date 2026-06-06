import { Shield, Clock, Star, FileText } from "lucide-react";
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
  const activeBids = bids.filter((b) => b.status !== "dismissed");

  const sdvosbEligible = activeBids.filter((b) => {
    const s = b.aiSummary;
    if (!s) return false;
    return s.setAsideType === "sdvosb" || s.veteranPreference === true;
  }).length;

  const expiringSoon = activeBids.filter((b) => {
    const days = daysUntil(b.responseDeadline);
    return days !== null && days >= 0 && days <= 7;
  }).length;

  const interested = activeBids.filter((b) => b.status === "interested").length;

  const tiles = [
    {
      label: "Active Bids",
      value: activeBids.length,
      icon: FileText,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "SDVOSB Eligible",
      value: sdvosbEligible,
      icon: Shield,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      label: "Expiring Soon",
      value: expiringSoon,
      icon: Clock,
      color: expiringSoon > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
      bg: expiringSoon > 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-muted/40",
    },
    {
      label: "Interested",
      value: interested,
      icon: Star,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-900/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {tiles.map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-4 h-4 ${color}`} />
          </div>
          <div className="min-w-0">
            <p className={`text-xl font-bold leading-none ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
