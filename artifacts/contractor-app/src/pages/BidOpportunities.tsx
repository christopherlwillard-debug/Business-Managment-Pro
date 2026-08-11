import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, FileSearch, Shield, List, Columns,
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
import PipelineBoard from "./bids/PipelineBoard";
import AwardsPanel from "./bids/AwardsPanel";
import type { BidFilter, SourceFilter } from "./bids/BidFilterBar";
import type { QuickLink, AiSummary, BidOpportunity, BidStage } from "./bids/types";
import { RotateCcw } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

const VIEW_KEY = "bid-view-preference";

// NAICS codes associated with each business type — used to flag "Similar to your work" awards
const BUSINESS_NAICS: Record<string, string[]> = {
  asphalt_sealing: ["237310"],
  general_contracting: [
    "236220", "236210", "236115", "236116", "236118",
    "238110", "238140", "238150", "238160", "238170", "238190",
    "238210", "238220", "238310", "238320", "238330", "238340",
    "238350", "238390", "238910", "238990",
  ],
};

export default function BidOpportunities() {
  const queryClient  = useQueryClient();
  const { toast }    = useToast();
  const { isOwner }  = useUserPermissions();
  const { activeBusiness } = useBusiness();
  const businessId = activeBusiness?.id ?? null;

  const [view, setView] = useState<"list" | "pipeline">(() =>
    (localStorage.getItem(VIEW_KEY) as "list" | "pipeline") ?? "list"
  );
  const [filter,       setFilter]       = useState<BidFilter>("all");
  const [fitOnly,      setFitOnly]      = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [panelBid,     setPanelBid]     = useState<BidOpportunity | null>(null);
  const [panelSummary, setPanelSummary] = useState<AiSummary | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError,   setPanelError]   = useState<string | null>(null);
  const [summaryCache, setSummaryCache] = useState<Record<number, AiSummary>>({});

  function switchView(v: "list" | "pipeline") {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  }

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
        description: "Checking federal, local, and USASpending sources. New bids will appear shortly.",
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
    queryKey: ["bids", businessId],
    enabled:  businessId !== null,
    queryFn:  async () => {
      const res = await fetch(`${BASE_URL}/api/bids?businessId=${businessId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load bids");
      return res.json();
    },
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: number; stage: BidStage }) => {
      const res = await fetch(`${BASE_URL}/api/bids/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stage, businessId }),
      });
      if (!res.ok) throw new Error("Failed to update bid");
      return res.json() as Promise<BidOpportunity>;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<BidOpportunity[]>(["bids", businessId], (prev = []) =>
        prev.map((b) => b.id === updated.id ? updated : b)
      );
      queryClient.invalidateQueries({ queryKey: ["bids-active-count"] });
      if (panelBid?.id === updated.id) setPanelBid(updated);
    },
  });

  const updateNotes = useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes: string }) => {
      const res = await fetch(`${BASE_URL}/api/bids/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes, businessId }),
      });
      if (!res.ok) throw new Error("Failed to save notes");
      return res.json() as Promise<BidOpportunity>;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<BidOpportunity[]>(["bids", businessId], (prev = []) =>
        prev.map((b) => b.id === updated.id ? updated : b)
      );
      if (panelBid?.id === updated.id) setPanelBid(updated);
    },
  });

  function dismissBid(bid: BidOpportunity) {
    const previousStage = bid.stage;
    updateStage.mutate({ id: bid.id, stage: "no_bid" }, {
      onSuccess: () => {
        toast({
          title: "Bid moved to No Bid",
          description: bid.title.length > 60 ? bid.title.slice(0, 60) + "…" : bid.title,
          action: (
            <ToastAction
              altText="Undo"
              onClick={() => updateStage.mutate({ id: bid.id, stage: previousStage })}
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

  // ── USASpending awards (separate source) ─────────────────────────────────
  const awards = bids.filter((b) => b.source === "usa-spending");
  const pipelineBids = bids.filter((b) => b.source !== "usa-spending");

  const profileNaicsCodes = BUSINESS_NAICS[activeBusiness?.type ?? ""] ?? [];

  // ── Filtering ─────────────────────────────────────────────────────────────

  const counts: Partial<Record<BidFilter, number>> = {
    all:       pipelineBids.filter((b) => b.stage !== "no_bid").length,
    new:       pipelineBids.filter((b) => b.stage === "new").length,
    reviewing: pipelineBids.filter((b) => b.stage === "reviewing").length,
    bidding:   pipelineBids.filter((b) => b.stage === "bidding").length,
    submitted: pipelineBids.filter((b) => b.stage === "submitted").length,
    won:       pipelineBids.filter((b) => b.stage === "won").length,
    lost:      pipelineBids.filter((b) => b.stage === "lost").length,
    no_bid:    pipelineBids.filter((b) => b.stage === "no_bid").length,
  };

  const stageFiltered = filter === "all"
    ? pipelineBids.filter((b) => b.stage !== "no_bid")
    : pipelineBids.filter((b) => b.stage === filter);

  const sourceFiltered = sourceFilter === "federal"
    ? stageFiltered.filter((b) => b.source === "federal")
    : sourceFilter === "local"
    ? stageFiltered.filter((b) => b.source === "state-local")
    : stageFiltered;

  const fitCount = sourceFiltered.filter(
    (b) => (summaryCache[b.id] ?? b.aiSummary)?.isFit === true
  ).length;

  const displayedBids = fitOnly
    ? sourceFiltered.filter((b) => (summaryCache[b.id] ?? b.aiSummary)?.isFit === true)
    : sourceFiltered;

  const showPipeline = sourceFilter !== "usa-spending";
  const showAwards   = sourceFilter === "all" || sourceFilter === "usa-spending";

  // ── Shared card list renderer (used in both mobile fallback + list view) ──
  function renderCardList(bidsToRender: BidOpportunity[]) {
    if (bidsToRender.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
          <FileSearch className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium">No bids match your filters</p>
          <p className="text-sm text-muted-foreground/60">Try adjusting the stage, source, or fit filter.</p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
        {bidsToRender.map((bid) => (
          <BidCard
            key={bid.id}
            bid={bid}
            summary={summaryCache[bid.id] ?? bid.aiSummary}
            onSummarize={openSummaryPanel}
            onStageChange={(b, stage) => updateStage.mutate({ id: b.id, stage })}
            onDismiss={dismissBid}
            onRestore={(b) => updateStage.mutate({ id: b.id, stage: "new" })}
            isUpdating={updateStage.isPending}
          />
        ))}
      </div>
    );
  }

  return (
    /* Tighter vertical rhythm on mobile (space-y-3), desktop keeps space-y-5 */
    <div className="space-y-3 md:space-y-5">
      {panelBid && (
        <SummaryPanel
          bid={panelBid}
          summary={panelSummary}
          loading={panelLoading}
          error={panelError}
          onClose={() => setPanelBid(null)}
          onStageChange={(stage) => updateStage.mutate({ id: panelBid.id, stage })}
          onNotesSave={(notes) => updateNotes.mutate({ id: panelBid.id, notes })}
        />
      )}

      {/* ── Page header ─────────────────────────────────────────────────────
          Mobile: single compact row — smaller title, icon-only refresh button,
          view toggle hidden (Kanban collapses to list on small screens anyway).
          Desktop: full layout with subtitle, view toggle, and full button.    */}
      <div className="flex items-center justify-between gap-2">
        {/* Left: title + SDVOSB badge */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2.5">
            <h1 className="text-xl md:text-2xl font-bold text-foreground leading-tight">
              Bid Opportunities
            </h1>
            {/* SDVOSB badge — visible on all screen sizes but abbreviated on mobile */}
            <span className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
              "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            )}>
              <Shield className="w-3 h-3" />
              <span className="hidden sm:inline">SBA-Certified </span>SDVOSB
            </span>
          </div>
          {/* Subtitle — hidden on smallest mobile to save space */}
          {activeBusiness ? (
            <p className="hidden sm:block text-sm text-muted-foreground mt-0.5 truncate">
              Federal &amp; Kentucky local contracts for{" "}
              <span className="font-medium text-foreground">{activeBusiness.name}</span>
            </p>
          ) : (
            <p className="hidden sm:block text-sm text-muted-foreground mt-0.5">
              Select a business to see its bid feed
            </p>
          )}
        </div>

        {/* Right: view toggle (desktop only) + refresh button */}
        <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
          {/* View toggle — hidden on mobile; Kanban falls back to card list on small screens */}
          {showPipeline && (
            <div className="hidden md:flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => switchView("list")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                  view === "list"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="w-3.5 h-3.5" />
                List
              </button>
              <button
                onClick={() => switchView("pipeline")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-border",
                  view === "pipeline"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                <Columns className="w-3.5 h-3.5" />
                Pipeline
              </button>
            </div>
          )}

          {/* Refresh — icon-only on mobile (44px touch target), full label on desktop */}
          <button
            onClick={() => syncBids.mutate()}
            disabled={syncBids.isPending || !businessId}
            title={!businessId ? "Select a business first" : "Refresh bids"}
            className={cn(
              "flex items-center gap-2 rounded-lg bg-primary text-primary-foreground font-medium",
              "hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors",
              // Mobile: square icon-only button with comfortable tap size
              "p-2.5 md:px-4 md:py-2 md:text-sm"
            )}
          >
            <RefreshCw className={cn("w-4 h-4 flex-shrink-0", syncBids.isPending && "animate-spin")} />
            <span className="hidden md:inline whitespace-nowrap">
              {syncBids.isPending ? "Refreshing…" : "Refresh Bids"}
            </span>
          </button>
        </div>
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <BidStatsBar bids={pipelineBids} />

      {/* ── Quick Links ─────────────────────────────────────────────────────── */}
      <QuickLinksPanel
        links={quickLinks}
        onSave={(links) => saveQuickLinks.mutate(links)}
        isSaving={saveQuickLinks.isPending}
        isOwner={isOwner}
      />

      {/* ── Filter bar ──────────────────────────────────────────────────────── */}
      <BidFilterBar
        filter={filter}
        setFilter={setFilter}
        fitOnly={fitOnly}
        setFitOnly={setFitOnly}
        counts={counts}
        fitCount={fitCount}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        awardsCount={awards.length}
      />

      {/* ── Content area ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {showPipeline && (
            <>
              {pipelineBids.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                  <FileSearch className="w-10 h-10 text-muted-foreground/40" />
                  <p className="text-muted-foreground font-medium">No bid opportunities yet</p>
                  <p className="text-sm text-muted-foreground/70 max-w-sm">
                    The system checks SAM.gov and Kentucky county bid pages daily at 7 AM. New opportunities will appear here automatically.
                  </p>
                </div>
              ) : view === "pipeline" ? (
                <>
                  {/*
                    Desktop: full Kanban pipeline board.
                    Mobile: Kanban is replaced by a single-column card feed —
                    a horizontal board with multiple columns is unusable on a phone.
                  */}
                  <div className="hidden md:block">
                    <PipelineBoard
                      bids={pipelineBids}
                      summaryCache={summaryCache}
                      onSummarize={openSummaryPanel}
                      onStageChange={(bid, stage) => {
                        if (stage === "no_bid") dismissBid(bid);
                        else updateStage.mutate({ id: bid.id, stage });
                      }}
                      isUpdating={updateStage.isPending}
                      fitOnly={fitOnly}
                      sourceFilter={sourceFilter}
                    />
                  </div>
                  {/* Mobile fallback for pipeline view — same cards, single column */}
                  <div className="md:hidden">
                    {renderCardList(displayedBids)}
                  </div>
                </>
              ) : (
                renderCardList(displayedBids)
              )}
            </>
          )}

          {/* Awards Intelligence panel */}
          {showAwards && (
            <AwardsPanel
              awards={awards}
              profileNaicsCodes={profileNaicsCodes}
            />
          )}

          {/* Empty state when Awards Intel filter is active */}
          {sourceFilter === "usa-spending" && awards.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
              <FileSearch className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">No award intelligence yet</p>
              <p className="text-sm text-muted-foreground/70 max-w-sm">
                Tap Refresh Bids to fetch recent awarded contracts from USASpending.gov for your NAICS codes.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
