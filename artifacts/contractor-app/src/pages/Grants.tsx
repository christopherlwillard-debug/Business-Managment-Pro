import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Award, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

import GrantCard from "./grants/GrantCard";
import GrantFilterBar from "./grants/GrantFilterBar";
import GrantSourcePanel from "./grants/GrantSourcePanel";
import type {
  GrantOpportunity, GrantSourceConnection, GrantSettings,
  GrantFilters, GrantStage,
} from "./grants/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: GrantFilters = {
  grantType:        "all",
  funding:          "all",
  deadline:         "all",
  eligibility:      "all",
  includeNonGrants: false,
  stage:            "all",
};

// ── Filter logic ──────────────────────────────────────────────────────────────

function applyFilters(grants: GrantOpportunity[], f: GrantFilters): GrantOpportunity[] {
  const now = Date.now();

  return grants.filter((g) => {
    // Hide permanently dismissed unless explicitly viewing that stage
    if (g.stage === "no_interest" && f.stage !== "no_interest") return false;

    // Eligibility tab
    if (f.eligibility !== "all" && g.eligibilityLabel !== f.eligibility) return false;

    // Stage quick-filter
    if (f.stage !== "all" && g.stage !== f.stage) return false;

    // Grant type (categories)
    if (f.grantType !== "all" && !g.grantCategories.includes(f.grantType)) return false;

    // Opportunity type gate
    if (!f.includeNonGrants) {
      if (g.opportunityType !== "grant" && g.opportunityType !== "cooperative_agreement") return false;
    }

    // Funding range
    if (f.funding !== "all") {
      const amt = g.fundingMax ?? g.fundingMin ?? null;
      if (amt === null) return true; // pass through if no funding data
      if (f.funding === "under_10k"  && amt >= 10_000) return false;
      if (f.funding === "10k_50k"    && (amt < 10_000 || amt > 50_000)) return false;
      if (f.funding === "50k_250k"   && (amt < 50_000 || amt > 250_000)) return false;
      if (f.funding === "over_250k"  && amt <= 250_000) return false;
    }

    // Deadline
    if (f.deadline !== "all" && g.deadline) {
      const dl   = new Date(g.deadline).getTime();
      const diff = dl - now;
      const days = diff / (1000 * 60 * 60 * 24);
      if (days < 0) return false; // expired
      if (f.deadline === "this_month") {
        const dlDate = new Date(g.deadline);
        const today  = new Date();
        if (dlDate.getFullYear() !== today.getFullYear() || dlDate.getMonth() !== today.getMonth()) return false;
      }
      if (f.deadline === "30_days" && days > 30) return false;
      if (f.deadline === "90_days" && days > 90) return false;
    }

    return true;
  });
}

// ── Last-sync strip ───────────────────────────────────────────────────────────

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms   = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Undo toast ────────────────────────────────────────────────────────────────

interface UndoToast {
  id:            number;
  grantId:       number;
  label:         string;
  previousStage: GrantStage;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Grants() {
  const base  = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  const qc    = useQueryClient();

  const [filters, setFilters]   = useState<GrantFilters>(DEFAULT_FILTERS);
  const [toasts,  setToasts]    = useState<UndoToast[]>([]);
  const [toastId, setToastId]   = useState(0);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: grants = [], isLoading: grantsLoading, error: grantsError } = useQuery<GrantOpportunity[]>({
    queryKey: ["grants"],
    queryFn:  async () => {
      const r = await fetch(`${base}/api/grants`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: sources = [], isLoading: sourcesLoading } = useQuery<GrantSourceConnection[]>({
    queryKey: ["grant-sources"],
    queryFn:  async () => {
      const r = await fetch(`${base}/api/grants/sources`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: _settings } = useQuery<GrantSettings>({
    queryKey: ["grant-settings"],
    queryFn:  async () => {
      const r = await fetch(`${base}/api/grants/settings`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    staleTime: 300_000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const syncMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${base}/api/grants/sync`, {
        method:      "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grants"] });
      qc.invalidateQueries({ queryKey: ["grant-sources"] });
    },
  });

  const patchGrantMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: number; stage: GrantStage }) => {
      const r = await fetch(`${base}/api/grants/${id}`, {
        method:      "PATCH",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ stage }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grants"] });
    },
  });

  const patchSourceMutation = useMutation({
    mutationFn: async ({ slug, patch }: { slug: string; patch: { enabled?: boolean } }) => {
      const r = await fetch(`${base}/api/grants/sources/${slug}`, {
        method:      "PATCH",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grant-sources"] });
    },
  });

  // ── Stage handler (with undo) ──────────────────────────────────────────────

  const handleStage = useCallback((id: number, stage: GrantStage, previousStage: GrantStage) => {
    patchGrantMutation.mutate({ id, stage });

    const stageLabel: Record<GrantStage, string> = {
      saved:       "Saved",
      applied:     "Marked as Applied",
      no_interest: "Hidden",
      new:         "Moved back to New",
    };

    const tid = toastId + 1;
    setToastId(tid);
    setToasts(prev => [...prev, { id: tid, grantId: id, label: stageLabel[stage], previousStage }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== tid));
    }, 5000);
  }, [patchGrantMutation, toastId]);

  const handleUndo = useCallback((toast: UndoToast) => {
    patchGrantMutation.mutate({ id: toast.grantId, stage: toast.previousStage });
    setToasts(prev => prev.filter(t => t.id !== toast.id));
  }, [patchGrantMutation]);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Derived data ───────────────────────────────────────────────────────────

  const visible = useMemo(() => applyFilters(grants, filters), [grants, filters]);

  // Sort: likely first, then maybe, then unlikely; within each bucket sort by fitScore desc
  const sorted = useMemo(() => [...visible].sort((a, b) => {
    const order = { likely: 0, maybe: 1, unlikely: 2 };
    const ao = a.eligibilityLabel ? (order[a.eligibilityLabel] ?? 3) : 3;
    const bo = b.eligibilityLabel ? (order[b.eligibilityLabel] ?? 3) : 3;
    if (ao !== bo) return ao - bo;
    return (b.fitScore ?? 0) - (a.fitScore ?? 0);
  }), [visible]);

  const counts = useMemo(() => ({
    total:    grants.filter(g => g.stage !== "no_interest").length,
    likely:   grants.filter(g => g.eligibilityLabel === "likely"   && g.stage !== "no_interest").length,
    maybe:    grants.filter(g => g.eligibilityLabel === "maybe"    && g.stage !== "no_interest").length,
    unlikely: grants.filter(g => g.eligibilityLabel === "unlikely" && g.stage !== "no_interest").length,
    saved:    grants.filter(g => g.stage === "saved").length,
    applied:  grants.filter(g => g.stage === "applied").length,
  }), [grants]);

  // Last sync time from automated sources
  const lastSyncAt = useMemo(() => {
    const dates = sources
      .filter(s => s.automatedDiscovery && s.lastSyncSuccessAt)
      .map(s => new Date(s.lastSyncSuccessAt!).getTime());
    if (!dates.length) return null;
    return new Date(Math.max(...dates)).toISOString();
  }, [sources]);

  const syncError = sources.some(s => s.connectionStatus === "error");

  // ── Render ─────────────────────────────────────────────────────────────────

  const isSyncing = syncMutation.isPending;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Award className="w-5 h-5 text-primary" />
                <h1 className="text-xl font-semibold text-foreground">Small Business Grants</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Federal, state, and local funding matched to your business profile.
              </p>
              {/* Last-sync strip */}
              <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground/70">
                {syncError && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertCircle className="w-3 h-3" />
                    One or more sources had errors
                  </span>
                )}
                {lastSyncAt && (
                  <span>Last synced {relativeTime(lastSyncAt)}</span>
                )}
                {!lastSyncAt && !grantsLoading && (
                  <span>Not synced yet — click Refresh to fetch opportunities</span>
                )}
              </div>
            </div>

            {/* Sync button */}
            <button
              type="button"
              onClick={() => syncMutation.mutate()}
              disabled={isSyncing}
              className={cn(
                "flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                isSyncing
                  ? "bg-muted text-muted-foreground border-border cursor-wait"
                  : "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
              )}
            >
              <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
              {isSyncing ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {/* Sync mutation error */}
          {syncMutation.isError && (
            <div className="mt-3 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Sync failed: {(syncMutation.error as Error).message}
            </div>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">

        {/* Source panel */}
        {!sourcesLoading && sources.length > 0 && (
          <GrantSourcePanel
            sources={sources}
            onUpdate={(slug, patch) => patchSourceMutation.mutate({ slug, patch })}
            isUpdating={patchSourceMutation.isPending}
          />
        )}

        {/* Filters */}
        {grants.length > 0 && (
          <GrantFilterBar
            filters={filters}
            setFilters={setFilters}
            counts={counts}
          />
        )}

        {/* Loading state */}
        {grantsLoading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        )}

        {/* Error state */}
        {grantsError && !grantsLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
            <p className="font-medium text-foreground mb-1">Couldn't load grants</p>
            <p className="text-sm text-muted-foreground">{(grantsError as Error).message}</p>
          </div>
        )}

        {/* Empty — no grants at all */}
        {!grantsLoading && !grantsError && grants.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="rounded-full bg-primary/10 p-5 mb-5">
              <Award className="h-9 w-9 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No grants fetched yet</h2>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              Click <strong>Refresh</strong> to pull the latest opportunities from Grants.gov and your
              other configured sources. Results are matched to your business profile.
            </p>
            <button
              type="button"
              onClick={() => syncMutation.mutate()}
              disabled={isSyncing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
              {isSyncing ? "Fetching…" : "Fetch Grants Now"}
            </button>
          </div>
        )}

        {/* Empty — grants exist but filters hide them all */}
        {!grantsLoading && !grantsError && grants.length > 0 && sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <p className="font-medium text-foreground mb-1">No grants match these filters</p>
            <p className="text-sm text-muted-foreground mb-4">
              Try broadening your search — remove a filter or switch to "All Matches".
            </p>
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              Clear all filters
            </button>
          </div>
        )}

        {/* Grant cards grid */}
        {sorted.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((grant) => (
              <GrantCard
                key={grant.id}
                grant={grant}
                onStage={handleStage}
                isMutating={patchGrantMutation.isPending}
              />
            ))}
          </div>
        )}

        {/* Result count footer */}
        {!grantsLoading && sorted.length > 0 && (
          <p className="text-center text-xs text-muted-foreground pt-2">
            Showing {sorted.length} of {counts.total} opportunities
          </p>
        )}
      </div>

      {/* ── Undo toasts ─────────────────────────────────────────────────────── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-center gap-3 bg-foreground text-background rounded-xl px-4 py-3 shadow-lg text-sm min-w-[240px]"
            >
              <span className="flex-1">{toast.label}</span>
              <button
                type="button"
                onClick={() => handleUndo(toast)}
                className="font-semibold text-primary-foreground/80 hover:text-primary-foreground underline underline-offset-2"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-background/50 hover:text-background transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
