import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink, Star, EyeOff, RefreshCw, Building2,
  FileSearch, Sparkles, XCircle, CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { ToastAction } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useBusiness } from "@/contexts/BusinessContext";
import QuickLinksPanel from "./bids/QuickLinksPanel";
import SummaryPanel from "./bids/SummaryPanel";
import BidFilterBar from "./bids/BidFilterBar";
import type { BidFilter } from "./bids/BidFilterBar";
import type { QuickLink, AiSummary, BidOpportunity } from "./bids/types";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  const { toast } = useToast();
  const { isOwner } = useUserPermissions();
  const { activeBusiness } = useBusiness();
  const businessId = activeBusiness?.id ?? null;
  const [filter, setFilter] = useState<BidFilter>("all");
  const [fitOnly, setFitOnly] = useState(false);
  const [panelBid, setPanelBid] = useState<BidOpportunity | null>(null);
  const [panelSummary, setPanelSummary] = useState<AiSummary | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [summaryCache, setSummaryCache] = useState<Record<number, AiSummary>>({});

  // ── Quick Links ──────────────────────────────────────────────────────────
  const { data: settings } = useQuery<{ quickLinks?: QuickLink[] }>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
  });

  const quickLinks: QuickLink[] = settings?.quickLinks ?? [];

  const saveQuickLinks = useMutation({
    mutationFn: async (links: QuickLink[]) => {
      const res = await fetch(`${BASE_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ quickLinks: links }),
      });
      if (!res.ok) throw new Error("Failed to save links");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "Portal links saved" });
    },
    onError: () => {
      toast({ title: "Couldn't save links", variant: "destructive" });
    },
  });

  // ── Bids ─────────────────────────────────────────────────────────────────

  const syncBids = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("No business selected");
      const res = await fetch(`${BASE_URL}/api/bids/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ businessId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Sync failed");
      }
      return res.json() as Promise<{ ok: boolean; syncing?: boolean }>;
    },
    onSuccess: () => {
      toast({
        title: "Syncing bids…",
        description: "Checking federal and local sources. New bids will appear shortly.",
      });
      // Re-fetch at 15 s, 60 s, and 120 s to pick up results as they arrive
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["bids"] }), 15_000);
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["bids"] }), 60_000);
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["bids"] }), 120_000);
    },
    onError: (err: Error) => {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    },
  });

  const { data: bids = [], isLoading } = useQuery<BidOpportunity[]>({
    queryKey: ["bids", filter, businessId],
    enabled: businessId !== null,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      params.set("businessId", String(businessId));
      const url = `${BASE_URL}/api/bids?${params.toString()}`;
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
        body: JSON.stringify({ status, businessId }),
      });
      if (!res.ok) throw new Error("Failed to update bid");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bids"] });
      queryClient.invalidateQueries({ queryKey: ["bids-active-count"] });
    },
  });

  function dismissBid(bid: BidOpportunity) {
    const previousStatus = bid.status;
    updateStatus.mutate({ id: bid.id, status: "dismissed" }, {
      onSuccess: () => {
        toast({
          title: "Bid hidden",
          description: bid.title.length > 60 ? bid.title.slice(0, 60) + "…" : bid.title,
          action: (
            <ToastAction
              altText="Undo"
              onClick={() => updateStatus.mutate({ id: bid.id, status: previousStatus })}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1 inline" />
              Undo
            </ToastAction>
          ),
        });
      },
    });
  }

  async function openSummaryPanel(bid: BidOpportunity) {
    setPanelBid(bid);
    setPanelError(null);

    if (summaryCache[bid.id]) {
      setPanelSummary(summaryCache[bid.id]);
      setPanelLoading(false);
      return;
    }

    if (bid.aiSummary) {
      setPanelSummary(bid.aiSummary);
      setSummaryCache((prev) => ({ ...prev, [bid.id]: bid.aiSummary as AiSummary }));
      setPanelLoading(false);
      return;
    }

    setPanelSummary(null);
    setPanelLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/bids/${bid.id}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ businessId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Failed to generate summary");
      }
      const data = await res.json() as { summary: AiSummary };
      setPanelSummary(data.summary);
      setSummaryCache((prev) => ({ ...prev, [bid.id]: data.summary }));
      queryClient.invalidateQueries({ queryKey: ["bids"] });
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setPanelLoading(false);
    }
  }

  const activeBids = bids.filter((b) => b.status !== "dismissed");
  const dismissedBids = bids.filter((b) => b.status === "dismissed");

  const counts = {
    all: activeBids.length,
    new: bids.filter((b) => b.status === "new").length,
    interested: bids.filter((b) => b.status === "interested").length,
    dismissed: dismissedBids.length,
  };

  const statusFiltered = filter === "dismissed" ? dismissedBids
    : filter === "all" ? activeBids
    : bids.filter((b) => b.status === filter);

  const fitCount = statusFiltered.filter((b) => (summaryCache[b.id] ?? b.aiSummary)?.isFit === true).length;

  const displayedBids = fitOnly
    ? statusFiltered.filter((b) => (summaryCache[b.id] ?? b.aiSummary)?.isFit === true)
    : statusFiltered;

  return (
    <div className="space-y-6">
      {panelBid && (
        <SummaryPanel
          bid={panelBid}
          summary={panelSummary}
          loading={panelLoading}
          error={panelError}
          onClose={() => setPanelBid(null)}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bid Opportunities</h1>
          {activeBusiness ? (
            <p className="text-muted-foreground mt-1">
              Federal &amp; Kentucky local contracts for{" "}
              <span className="font-medium text-foreground">{activeBusiness.name}</span>
            </p>
          ) : (
            <p className="text-muted-foreground mt-1">Select a business to see its bid feed</p>
          )}
        </div>
        <button
          onClick={() => syncBids.mutate()}
          disabled={syncBids.isPending || !businessId}
          title={!businessId ? "Select a business first" : undefined}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors whitespace-nowrap flex-shrink-0"
        >
          <RefreshCw className={cn("w-4 h-4", syncBids.isPending && "animate-spin")} />
          {syncBids.isPending ? "Refreshing…" : "Refresh Bids"}
        </button>
      </div>

      {/* Quick Links panel */}
      <QuickLinksPanel
        links={quickLinks}
        onSave={(links) => saveQuickLinks.mutate(links)}
        isSaving={saveQuickLinks.isPending}
        isOwner={isOwner}
      />

      <BidFilterBar
        filter={filter}
        setFilter={setFilter}
        fitOnly={fitOnly}
        setFitOnly={setFitOnly}
        counts={counts}
        fitCount={fitCount}
      />

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
                {displayedBids.map((bid) => (
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
                        {(() => {
                          const summary = summaryCache[bid.id] ?? bid.aiSummary;
                          if (!summary) return null;
                          if (summary.isFit !== undefined) {
                            return (
                              <button
                                onClick={() => openSummaryPanel(bid)}
                                className={cn(
                                  "inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-md transition-colors",
                                  summary.isFit
                                    ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                                    : "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
                                )}
                              >
                                {summary.isFit
                                  ? <><CheckCircle2 className="w-3 h-3" /> Fit</>
                                  : <><XCircle className="w-3 h-3" /> No fit</>
                                }
                              </button>
                            );
                          }
                          return (
                            <span className="inline-flex items-center gap-1 text-xs text-primary/70">
                              <Sparkles className="w-3 h-3" />
                              Summarized
                            </span>
                          );
                        })()}
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
                        <button
                          onClick={() => openSummaryPanel(bid)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
                        >
                          <Sparkles className="w-3 h-3" />
                          {bid.aiSummary || summaryCache[bid.id] ? "Summary" : "Summarize"}
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
                            onClick={() => dismissBid(bid)}
                            disabled={updateStatus.isPending}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                          >
                            <EyeOff className="w-3 h-3" />
                            Hide
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
