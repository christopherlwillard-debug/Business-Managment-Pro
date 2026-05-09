import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Star, EyeOff, RefreshCw, Building2, Calendar, FileSearch } from "lucide-react";
import { cn } from "@/lib/utils";
const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

interface BidOpportunity {
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
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  interested: "Interested",
  dismissed: "Dismissed",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  interested: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  dismissed: "bg-muted text-muted-foreground",
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function DeadlineBadge({ deadline }: { deadline: string | null }) {
  if (!deadline) return <span className="text-muted-foreground text-sm">—</span>;
  const days = daysUntil(deadline);
  const isUrgent = days !== null && days >= 0 && days <= 7;
  const isPast = days !== null && days < 0;
  return (
    <span className={cn(
      "text-sm font-medium",
      isPast ? "text-muted-foreground line-through" : isUrgent ? "text-red-600 dark:text-red-400 font-semibold" : "text-foreground"
    )}>
      {deadline}
      {isUrgent && !isPast && <span className="ml-1 text-xs text-red-500">({days}d left)</span>}
      {isPast && <span className="ml-1 text-xs text-muted-foreground">(expired)</span>}
    </span>
  );
}

export default function BidOpportunities() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "new" | "interested" | "dismissed">("all");

  const { data: bids = [], isLoading } = useQuery<BidOpportunity[]>({
    queryKey: ["bids", filter],
    queryFn: async () => {
      const url = filter === "all"
        ? `${BASE_URL}/api/bids`
        : `${BASE_URL}/api/bids?status=${filter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load bids");
      return res.json();
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`${BASE_URL}/api/bids/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update bid");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bids"] });
    },
  });

  const activeBids = bids.filter((b) => b.status !== "dismissed");
  const dismissedBids = bids.filter((b) => b.status === "dismissed");

  const counts = {
    all: bids.length,
    new: bids.filter((b) => b.status === "new").length,
    interested: bids.filter((b) => b.status === "interested").length,
    dismissed: dismissedBids.length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bid Opportunities</h1>
        <p className="text-muted-foreground mt-1">Federal &amp; Kentucky local contracts — asphalt, sealcoating &amp; pavement work</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "new", "interested", "dismissed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            )}
          >
            {f === "all" ? "All" : STATUS_LABELS[f]}
            <span className={cn(
              "ml-1.5 text-xs px-1.5 py-0.5 rounded-full",
              filter === f ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
            )}>
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : bids.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <FileSearch className="w-10 h-10 text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">No bid opportunities yet</p>
          <p className="text-sm text-muted-foreground/70 max-w-sm">
            The system checks SAM.gov and Kentucky county bid pages daily at 7 AM. New opportunities will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Source</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Title</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">Agency</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden sm:table-cell">Posted</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Due Date</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(filter === "dismissed" ? dismissedBids : filter === "all" ? bids : bids.filter((b) => b.status === filter)).map((bid) => (
                  <tr
                    key={bid.id}
                    className={cn(
                      "hover:bg-muted/30 transition-colors",
                      bid.status === "dismissed" && "opacity-60"
                    )}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", STATUS_COLORS[bid.status] ?? STATUS_COLORS.new)}>
                        {STATUS_LABELS[bid.status] ?? bid.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {bid.source === "state-local" ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                          {bid.sourceLabel ?? "KY Local"}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          Federal
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground leading-snug">{bid.title}</p>
                        {bid.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{bid.description}</p>
                        )}
                        {bid.naicsCode && (
                          <span className="text-xs text-muted-foreground">NAICS {bid.naicsCode}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {bid.agency ? (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate max-w-[200px]">{bid.agency}</span>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground whitespace-nowrap">
                      {bid.postedDate ?? "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <DeadlineBadge deadline={bid.responseDeadline} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {bid.url && (
                          <a
                            href={bid.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View
                          </a>
                        )}
                        {bid.status !== "interested" && (
                          <button
                            onClick={() => updateStatus.mutate({ id: bid.id, status: "interested" })}
                            disabled={updateStatus.isPending}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 transition-colors whitespace-nowrap"
                          >
                            <Star className="w-3 h-3" />
                            Interested
                          </button>
                        )}
                        {bid.status !== "dismissed" && (
                          <button
                            onClick={() => updateStatus.mutate({ id: bid.id, status: "dismissed" })}
                            disabled={updateStatus.isPending}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                          >
                            <EyeOff className="w-3 h-3" />
                            Dismiss
                          </button>
                        )}
                        {bid.status === "dismissed" && (
                          <button
                            onClick={() => updateStatus.mutate({ id: bid.id, status: "new" })}
                            disabled={updateStatus.isPending}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Restore
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
