import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, FileSearch, Shield,
} from "lucide-react";
import { ToastAction } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useBusiness } from "@/contexts/BusinessContext";
import QuickLinksPanel from "./bids/QuickLinksPanel";
import SummaryPanel from "./bids/SummaryPanel";
import BidFilterBar from "./bids/BidFilterBar";
import BidStatsBar from "./bids/BidStatsBar";
import BidCard from "./bids/BidCard";
import type { BidFilter, SourceFilter } from "./bids/BidFilterBar";
import type { QuickLink, AiSummary, BidOpportunity } from "./bids/types";
import { RotateCcw } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function BidOpportunities() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isOwner } = useUserPermissions();
  const { activeBusiness } = useBusiness();
  const businessId = activeBusiness?.id ?? null;

  const [filter, setFilter] = useState<BidFilter>("all");
  const [fitOnly, setFitOnly] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
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

  // ── Filtering ─────────────────────────────────────────────────────────────

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

  const sourceFiltered = sourceFilter === "all" ? statusFiltered
    : sourceFilter === "federal" ? statusFiltered.filter((b) => b.source !== "state-local")
    : statusFiltered.filter((b) => b.source === "state-local");

  const fitCount = sourceFiltered.filter((b) => (summaryCache[b.id] ?? b.aiSummary)?.isFit === true).length;

  const displayedBids = fitOnly
    ? sourceFiltered.filter((b) => (summaryCache[b.id] ?? b.aiSummary)?.isFit === true)
    : sourceFiltered;

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

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-foreground">Bid Opportunities</h1>
            <span className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
              "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            )}>
              <Shield className="w-3 h-3" />
              SBA-Certified SDVOSB
            </span>
          </div>
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

      {/* Stats bar */}
      <BidStatsBar bids={bids} />

      {/* Quick Links panel */}
      <QuickLinksPanel
        links={quickLinks}
        onSave={(links) => saveQuickLinks.mutate(links)}
        isSaving={saveQuickLinks.isPending}
        isOwner={isOwner}
      />

      {/* Filter bar */}
      <BidFilterBar
        filter={filter}
        setFilter={setFilter}
        fitOnly={fitOnly}
        setFitOnly={setFitOnly}
        counts={counts}
        fitCount={fitCount}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
      />

      {/* Content */}
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
      ) : displayedBids.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
          <FileSearch className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium">No bids match your filters</p>
          <p className="text-sm text-muted-foreground/60">Try adjusting the status, source, or fit filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {displayedBids.map((bid) => (
            <BidCard
              key={bid.id}
              bid={bid}
              summary={summaryCache[bid.id] ?? bid.aiSummary}
              onSummarize={openSummaryPanel}
              onInterested={(b) => updateStatus.mutate({ id: b.id, status: "interested" })}
              onDismiss={dismissBid}
              onRestore={(b) => updateStatus.mutate({ id: b.id, status: "new" })}
              isUpdating={updateStatus.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
