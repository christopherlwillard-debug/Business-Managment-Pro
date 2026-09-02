import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, FileSearch, Shield, List, Columns, CheckCircle2, AlertCircle, Building2, Layers2, FileDown,
  Plus, RotateCcw, ChevronDown, EyeOff,
} from "lucide-react";
import { ToastAction } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useBusiness } from "@/contexts/BusinessContext";
import QuickLinksPanel from "./bids/QuickLinksPanel";
import SourceManagementPanel from "./bids/SourceManagementPanel";
import SummaryPanel from "./bids/SummaryPanel";
import BidFilterBar from "./bids/BidFilterBar";
import BidStatsBar from "./bids/BidStatsBar";
import BidCard from "./bids/BidCard";
import PipelineBoard from "./bids/PipelineBoard";
import AwardsPanel from "./bids/AwardsPanel";
import BidEducationPanel from "./bids/BidEducationPanel";
import BidQualificationPanel from "./bids/BidQualificationPanel";
import type { BidFilter, SourceFilter, CapabilityFilter, GeographyFilter, QualityFilter } from "./bids/BidFilterBar";
import { getNaicsMatch, type QuickLink, type AiSummary, type BidOpportunity, type BidStage, type EducationSummary, type BidSourceConnection, type IndustrialQualSummary } from "./bids/types";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

const VIEW_KEY = "bid-view-preference";
interface BidSettings {
  isSdvosb?: boolean;
  primaryNaicsCodes?: string[];
  samLastSuccessAt?: string | null;
  samLastError?: string | null;
  localLastSuccessAt?: string | null;
  localLastError?: string | null;
  awardsLastSuccessAt?: string | null;
  awardsLastError?: string | null;
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function BidOpportunities() {
  const queryClient  = useQueryClient();
  const { toast }    = useToast();
  const { isOwner }  = useUserPermissions();
  const { activeBusiness, businesses, setActiveBusiness } = useBusiness();
  const businessId = activeBusiness?.id ?? null;

  const [view, setView] = useState<"list" | "pipeline">(() =>
    (localStorage.getItem(VIEW_KEY) as "list" | "pipeline") ?? "list"
  );
  const [filter,       setFilter]       = useState<BidFilter>("all");
  const [fitOnly,      setFitOnly]      = useState(false);
  const [tmOnlyFilter, setTmOnlyFilter] = useState(false);
  const [sourceFilter,     setSourceFilter]     = useState<SourceFilter>("all");
  const [geographyFilter,  setGeographyFilter]  = useState<GeographyFilter>("service_area");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("ready");
  const [capabilityFilter, setCapabilityFilter] = useState<CapabilityFilter>("all");
  const [panelBid,     setPanelBid]     = useState<BidOpportunity | null>(null);
  const [panelSummary, setPanelSummary] = useState<AiSummary | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError,        setPanelError]        = useState<string | null>(null);
  const [panelRegenerating, setPanelRegenerating] = useState(false);
  const [panelDeepReading,  setPanelDeepReading]  = useState(false);
  const [summaryCache,   setSummaryCache]   = useState<Record<number, AiSummary>>({});
  const [educatingBid,   setEducatingBid]   = useState<BidOpportunity | null>(null);
  const [educationCache, setEducationCache] = useState<Record<number, EducationSummary>>({});
  const [qualifyingBid,  setQualifyingBid]  = useState<BidOpportunity | null>(null);
  const [qualCache,      setQualCache]      = useState<Record<number, IndustrialQualSummary>>({});
  const [addingPrivate,  setAddingPrivate]  = useState(false);
  const [showFiltered,   setShowFiltered]   = useState(false);
  const [generatingCapabilityStatement, setGeneratingCapabilityStatement] = useState(false);
  const [privateForm, setPrivateForm] = useState({
    companyName:   "",
    description:   "",
    sourceType:    "direct_service",
    contactName:   "",
    contactEmail:  "",
    contactPhone:  "",
    url:           "",
    deadline:      "",
  });

  function switchView(v: "list" | "pipeline") {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  }

  async function downloadCapabilityStatement() {
    if (!businessId || !activeBusiness) {
      toast({
        title: "Select a business first",
        description: "Choose one business to generate its capability statement.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingCapabilityStatement(true);
    try {
      const res = await fetch(
        `${BASE_URL}/api/pdf/capability-statement?businessId=${businessId}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Failed to generate capability statement");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `Capability Statement - ${activeBusiness.name}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Capability statement downloaded" });
    } catch (err) {
      toast({
        title: "Couldn't generate capability statement",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setGeneratingCapabilityStatement(false);
    }
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

  // ── Bid business settings (isSdvosb, etc.) ───────────────────────────────
  const { data: bidSettings } = useQuery<BidSettings>({
    queryKey: ["bid-settings", businessId],
    queryFn: async () => {
      if (!businessId) return {};
      const res = await fetch(`${BASE_URL}/api/bids/settings?businessId=${businessId}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!businessId,
  });

  // ── Bid sources ──────────────────────────────────────────────────────────
  const { data: bidSources = [] } = useQuery<BidSourceConnection[]>({
    queryKey: ["bid-sources", businessId],
    queryFn:  async () => {
      if (!businessId) return [];
      const res = await fetch(`${BASE_URL}/api/bids/sources?businessId=${businessId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!businessId,
  });

  const patchSource = useMutation({
    mutationFn: async ({
      slug, patch,
    }: { slug: string; patch: { enabled?: boolean; portalUrl?: string; portalLabel?: string } }) => {
      const res = await fetch(`${BASE_URL}/api/bids/sources/${slug}?businessId=${businessId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to update source");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bid-sources", businessId] });
    },
    onError: () => {
      toast({ title: "Couldn't update source", variant: "destructive" });
    },
  });

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

  // ── Create private opportunity ──────────────────────────────────────────────

  const createPrivateBid = useMutation({
    mutationFn: async (form: typeof privateForm) => {
      if (!businessId) throw new Error("Select a business first");
      const res = await fetch(`${BASE_URL}/api/bids/private`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ businessId, ...form }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Failed to create opportunity");
      }
      return res.json() as Promise<BidOpportunity>;
    },
    onSuccess: () => {
      setAddingPrivate(false);
      setPrivateForm({ companyName: "", description: "", sourceType: "direct_service", contactName: "", contactEmail: "", contactPhone: "", url: "", deadline: "" });
      queryClient.invalidateQueries({ queryKey: ["bids-unified"] });
      toast({ title: "Private opportunity added" });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't add opportunity", description: err.message, variant: "destructive" });
    },
  });

  // ── Bids ─────────────────────────────────────────────────────────────────

  const syncBids = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (businessId) body.businessId = businessId;
      const res = await fetch(`${BASE_URL}/api/bids/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Sync failed");
      }
      return res.json() as Promise<{ ok: boolean; syncing?: boolean; businesses?: number }>;
    },
    onSuccess: (data) => {
      const description = data.businesses && data.businesses > 1
        ? `Syncing across all ${data.businesses} businesses. New bids will appear shortly.`
        : "Checking federal, local, and USASpending sources. New bids will appear shortly.";
      toast({ title: "Syncing bids…", description });
      const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["bids-unified"] });
        queryClient.invalidateQueries({ queryKey: ["bid-settings", businessId] });
      };
      setTimeout(invalidate, 15_000);
      setTimeout(invalidate, 60_000);
      setTimeout(invalidate, 120_000);
    },
    onError: (err: Error) => {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    },
  });

  // Unified feed — all businesses, deduplicated by noticeId.
  // scoringBusinessId overlays that business's isFit / score / stage on each row.
  const { data: bids = [], isLoading } = useQuery<BidOpportunity[]>({
    queryKey: ["bids-unified", activeBusiness?.id ?? "all"],
    queryFn:  async () => {
      const scoringParam = activeBusiness ? `?scoringBusinessId=${activeBusiness.id}` : "";
      const res = await fetch(`${BASE_URL}/api/bids/unified${scoringParam}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load bids");
      return res.json();
    },
  });

  // Separate recovery feed: the server chooses hidden representatives and
  // excludes award intelligence before it reaches the UI.
  const { data: hiddenBids = [] } = useQuery<BidOpportunity[]>({
    queryKey: ["bids-hidden", activeBusiness?.id ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ includeHidden: "true" });
      if (activeBusiness) params.set("scoringBusinessId", String(activeBusiness.id));
      const res = await fetch(`${BASE_URL}/api/bids/unified?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load filtered bids");
      return res.json();
    },
  });

  const { data: jobs = [] } = useQuery<Array<{ id: number; title: string; status?: string | null }>>({
    queryKey: ["bid-jobs", businessId],
    queryFn: async () => {
      if (!businessId) return [];
      const res = await fetch(`${BASE_URL}/api/bids/jobs?businessId=${businessId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load jobs");
      return res.json();
    },
    enabled: !!businessId && !!panelBid,
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, stage, bidBusinessId }: { id: number; stage: BidStage; bidBusinessId?: number | null }) => {
      const res = await fetch(`${BASE_URL}/api/bids/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stage, businessId: bidBusinessId ?? businessId }),
      });
      if (!res.ok) throw new Error("Failed to update bid");
      return res.json() as Promise<BidOpportunity>;
    },
    onSuccess: (updated) => {
      // Patch just the mutable fields so enriched unified fields (capabilityCategories, etc.) are preserved
      queryClient.setQueryData<BidOpportunity[]>(
        ["bids-unified", activeBusiness?.id ?? "all"],
        (prev = []) => prev.map((b) => b.id === updated.id ? { ...b, stage: updated.stage, notes: updated.notes } : b)
      );
      queryClient.invalidateQueries({ queryKey: ["bids-active-count"] });
      queryClient.invalidateQueries({ queryKey: ["bids-hidden"] });
      if (panelBid?.id === updated.id) setPanelBid((prev) => prev ? { ...prev, stage: updated.stage } : null);
    },
  });

  const updateNotes = useMutation({
    mutationFn: async ({ id, notes, bidBusinessId }: { id: number; notes: string; bidBusinessId?: number | null }) => {
      const res = await fetch(`${BASE_URL}/api/bids/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes, businessId: bidBusinessId ?? businessId }),
      });
      if (!res.ok) throw new Error("Failed to save notes");
      return res.json() as Promise<BidOpportunity>;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<BidOpportunity[]>(
        ["bids-unified", activeBusiness?.id ?? "all"],
        (prev = []) => prev.map((b) => b.id === updated.id ? { ...b, notes: updated.notes } : b)
      );
      if (panelBid?.id === updated.id) setPanelBid((prev) => prev ? { ...prev, notes: updated.notes } : null);
    },
  });

  const updateJob = useMutation({
    mutationFn: async ({ id, jobId, bidBusinessId }: { id: number; jobId: number | null; bidBusinessId?: number | null }) => {
      const res = await fetch(`${BASE_URL}/api/bids/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ jobId, businessId: bidBusinessId ?? businessId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Failed to update linked job");
      }
      return res.json() as Promise<BidOpportunity>;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<BidOpportunity[]>(
        ["bids-unified", activeBusiness?.id ?? "all"],
        (prev = []) => prev.map((b) => b.id === updated.id ? { ...b, jobId: updated.jobId } : b)
      );
      setPanelBid((prev) => prev?.id === updated.id ? { ...prev, jobId: updated.jobId } : prev);
      toast({ title: updated.jobId ? "Job linked" : "Job link cleared" });
    },
    onError: (err: Error) => toast({ title: "Couldn't update linked job", description: err.message, variant: "destructive" }),
  });

  function dismissBid(bid: BidOpportunity) {
    const previousStage = bid.stage;
    updateStage.mutate({ id: bid.id, stage: "no_bid", bidBusinessId: bid.businessId }, {
      onSuccess: () => {
        toast({
          title: "Bid moved to No Bid",
          description: bid.title.length > 60 ? bid.title.slice(0, 60) + "…" : bid.title,
          action: (
            <ToastAction
              altText="Undo"
              onClick={() => updateStage.mutate({ id: bid.id, stage: previousStage, bidBusinessId: bid.businessId })}
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
        body: JSON.stringify({ businessId: bid.businessId ?? businessId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Failed to generate summary");
      }
      const data = await res.json() as { summary: AiSummary };
      setPanelSummary(data.summary);
      setSummaryCache((prev) => ({ ...prev, [bid.id]: data.summary }));
      queryClient.invalidateQueries({ queryKey: ["bids-unified"] });
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setPanelLoading(false);
    }
  }

  async function handleRegenerate() {
    if (!panelBid || panelRegenerating) return;
    const effectiveBizId = panelBid.businessId ?? businessId;
    if (!effectiveBizId) {
      toast({ title: "Select a business first to regenerate the summary", variant: "destructive" });
      return;
    }
    setPanelRegenerating(true);
    setPanelError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/bids/${panelBid.id}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ businessId: effectiveBizId, force: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Failed to regenerate summary");
      }
      const data = await res.json() as { summary: AiSummary };
      setPanelSummary(data.summary);
      setSummaryCache((prev) => ({ ...prev, [panelBid.id]: data.summary }));
      queryClient.invalidateQueries({ queryKey: ["bids-unified"] });
    } catch (err) {
      toast({ title: "Regenerate failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setPanelRegenerating(false);
    }
  }

  async function handleDeepRead(force = false) {
    if (!panelBid || panelDeepReading) return;
    const effectiveBizId = panelBid.businessId ?? businessId;
    if (!effectiveBizId) {
      toast({ title: "Select a business first to read the solicitation", variant: "destructive" });
      return;
    }

    setPanelDeepReading(true);
    setPanelError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/bids/${panelBid.id}/deep-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ businessId: effectiveBizId, force }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Failed to read the solicitation");
      }
      const data = await res.json() as { summary: AiSummary };
      setPanelSummary(data.summary);
      setSummaryCache((prev) => ({ ...prev, [panelBid.id]: data.summary }));
      queryClient.invalidateQueries({ queryKey: ["bids-unified"] });
    } catch (err) {
      toast({
        title: force ? "Re-read failed" : "Deep read failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setPanelDeepReading(false);
    }
  }

  // ── USASpending awards (separate source) ─────────────────────────────────
  const isAward = (b: BidOpportunity) => b.source === "usa-spending" || b.opportunityType === "award_intelligence";
  const awards = bids.filter(isAward);
  const pipelineBids = bids.filter((b) => !isAward(b));
  const isReady = (b: BidOpportunity) => b.defaultActive === true
    || (b.defaultActive === undefined
      && b.stage !== "no_bid"
      && b.stage !== "score_rejected"
      && b.opportunityScore !== 0
      && b.lifecycleState !== "expired"
      && b.lifecycleState !== "incomplete"
      && b.lifecycleState !== "verification_needed");
  const qualityFiltered = qualityFilter === "ready"
    ? pipelineBids.filter(isReady)
    : qualityFilter === "verification"
      ? pipelineBids.filter((b) => b.lifecycleState === "incomplete" || b.lifecycleState === "verification_needed" || b.dataCompleteness === "partial" || b.dataCompleteness === "needs_verification")
      : qualityFilter === "history"
        ? pipelineBids.filter((b) => b.lifecycleState === "expired" || b.lifecycleState === "historical" || b.stage === "no_bid" || b.stage === "score_rejected")
        : pipelineBids;
  const profileNaicsCodes = bidSettings?.primaryNaicsCodes ?? [];

  // ── Capability category filter — outermost lens ───────────────────────────
  // Private opportunities (source="private") always appear in the industrial_maintenance view
  const isPrivateBid = (b: BidOpportunity) => b.isPrivateOpportunity === true || b.isPrivateOpportunity === "true";
  const capabilityFiltered = capabilityFilter === "all"
    ? qualityFiltered
    : qualityFiltered.filter((b) =>
        (b.capabilityCategories?.includes(capabilityFilter) ?? false) ||
        (capabilityFilter === "industrial_maintenance" && isPrivateBid(b))
      );

  // Counts per capability key (computed from all pipeline bids, stage !== no_bid)
  const ALL_CAP_KEYS: CapabilityFilter[] = [
    "asphalt", "dump_waste", "flooring", "mfg_homes",
    "site_work", "general_contracting", "industrial_maintenance", "subcontracting",
  ];
  const capabilityCounts: Partial<Record<CapabilityFilter, number>> = {
    all: qualityFiltered.filter((b) => b.stage !== "no_bid").length,
    ...Object.fromEntries(ALL_CAP_KEYS.map((key) => [
      key,
       qualityFiltered.filter((b) => {
        if (b.stage === "no_bid") return false;
        if (b.capabilityCategories?.includes(key)) return true;
        if (key === "industrial_maintenance" && isPrivateBid(b)) return true;
        return false;
      }).length,
    ])),
  };

  // ── Filtering ─────────────────────────────────────────────────────────────

  const counts: Partial<Record<BidFilter, number>> = {
    all:       capabilityFiltered.filter((b) => b.stage !== "no_bid" && b.stage !== "score_rejected").length,
    new:       capabilityFiltered.filter((b) => b.stage === "new").length,
    reviewing: capabilityFiltered.filter((b) => b.stage === "reviewing").length,
    bidding:   capabilityFiltered.filter((b) => b.stage === "bidding").length,
    submitted: capabilityFiltered.filter((b) => b.stage === "submitted").length,
    won:       capabilityFiltered.filter((b) => b.stage === "won").length,
    lost:      capabilityFiltered.filter((b) => b.stage === "lost").length,
    no_bid:    capabilityFiltered.filter((b) => b.stage === "no_bid").length,
  };

  const stageFiltered = filter === "all"
    ? (qualityFilter === "history"
      ? capabilityFiltered
      : capabilityFiltered.filter((b) => b.stage !== "no_bid" && b.stage !== "score_rejected"))
    : capabilityFiltered.filter((b) => b.stage === filter);

  const geographyFiltered = sourceFilter === "usa-spending"
    ? stageFiltered
    : stageFiltered.filter((b) => geographyFilter === "all"
      ? true
      : geographyFilter === "service_area"
        ? b.geography === "local" || b.geography === "regional"
        : b.geography === geographyFilter);

  const sourceFiltered = sourceFilter === "federal"
    ? geographyFiltered.filter((b) => b.source === "federal")
    : sourceFilter === "local"
    ? geographyFiltered.filter((b) => b.source === "state-local")
    : sourceFilter === "subnet"
    ? geographyFiltered.filter((b) => b.source === "subnet" || b.source === "gsa-forecast")
    : geographyFiltered;

  const fitCount = sourceFiltered.filter(
    (b) => (summaryCache[b.id] ?? b.aiSummary)?.isFit === true
  ).length;

  const TM_CONTRACT_TYPES = new Set([
    "T&M", "labor_hour", "on_call", "idiq", "task_order", "shutdown_turnaround",
  ]);
  const tmCount = sourceFiltered.filter(
    (b) => b.contractType && TM_CONTRACT_TYPES.has(b.contractType)
  ).length;

  const fitFiltered = fitOnly
    ? sourceFiltered.filter((b) => (summaryCache[b.id] ?? b.aiSummary)?.isFit === true)
    : sourceFiltered;

  const displayedBids = tmOnlyFilter
    ? fitFiltered.filter((b) => b.contractType && TM_CONTRACT_TYPES.has(b.contractType))
    : fitFiltered;

  const subnetCount = pipelineBids.filter(
    (b) => b.source === "subnet" || b.source === "gsa-forecast"
  ).length;

  const showPipeline = sourceFilter !== "usa-spending";
  const showAwards   = sourceFilter === "all" || sourceFilter === "usa-spending";

  // ── Shared card list renderer (used in both mobile fallback + list view) ──
  function renderCardList(bidsToRender: BidOpportunity[]) {
    const isEmpty = bidsToRender.length === 0;
    const showAddPrivate = capabilityFilter === "industrial_maintenance" && businessId;

    return (
      <>
        {/* "Add Private Opportunity" prompt for industrial maintenance view */}
        {showAddPrivate && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-dashed border-border bg-muted/20">
            <div>
              <p className="text-sm font-medium text-foreground">Track a private maintenance opportunity</p>
              <p className="text-xs text-muted-foreground">Direct service, subcontract, or prequalification — not publicly posted</p>
            </div>
            <button
              onClick={() => setAddingPrivate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors flex-shrink-0 ml-3"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Private
            </button>
          </div>
        )}

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
            <FileSearch className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-muted-foreground font-medium">No bids match your filters</p>
            <p className="text-sm text-muted-foreground/60">Try adjusting the stage, source, or fit filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
            {bidsToRender.map((bid) => {
              const naicsMatch = bid.naicsCode
                ? getNaicsMatch(bid.naicsCode, profileNaicsCodes)
                : undefined;
              return (
              <BidCard
                key={bid.id}
                bid={bid}
                summary={summaryCache[bid.id] ?? bid.aiSummary}
                onSummarize={openSummaryPanel}
                onEducate={(b) => setEducatingBid(b)}
                onQualify={(b) => setQualifyingBid(b)}
                onStageChange={(b, stage) => updateStage.mutate({ id: b.id, stage, bidBusinessId: b.businessId })}
                onDismiss={dismissBid}
                onRestore={(b) => updateStage.mutate({ id: b.id, stage: "new", bidBusinessId: b.businessId })}
                isUpdating={updateStage.isPending}
                multipleBusinesses={!activeBusiness && businesses.length > 1}
                relevantBusinessNames={bid.relevantBusinessNames}
                naicsMatch={naicsMatch}
              />
              );
            })}
          </div>
        )}
      </>
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
          onStageChange={(stage) => updateStage.mutate({ id: panelBid.id, stage, bidBusinessId: panelBid.businessId })}
          onNotesSave={(notes) => updateNotes.mutate({ id: panelBid.id, notes, bidBusinessId: panelBid.businessId })}
          jobs={jobs}
          onJobChange={(jobId) => updateJob.mutate({ id: panelBid.id, jobId, bidBusinessId: panelBid.businessId })}
          onRegenerate={handleRegenerate}
          regenerating={panelRegenerating}
          onDeepRead={handleDeepRead}
          deepReading={panelDeepReading}
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
            {/* SDVOSB badge — only shown when is_sdvosb = true in bid_business_settings */}
            {bidSettings?.isSdvosb && (
              <span className={cn(
                "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              )}>
                <Shield className="w-3 h-3" />
                <span className="hidden sm:inline">SBA-Certified </span>SDVOSB
              </span>
            )}
          </div>
          {/* Subtitle — hidden on smallest mobile to save space */}
          {activeBusiness ? (
            <p className="hidden sm:block text-sm text-muted-foreground mt-0.5 truncate">
              Showing opportunities matched to{" "}
              <span className="font-medium text-foreground">{activeBusiness.name}</span>
            </p>
          ) : (
            <p className="hidden sm:block text-sm text-muted-foreground mt-0.5">
              {businesses.length > 1 ? "All businesses — select a tab to filter by business" : "All bid opportunities"}
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
            onClick={downloadCapabilityStatement}
            disabled={generatingCapabilityStatement}
            title={businessId ? "Download capability statement" : "Select a business to generate a capability statement"}
            className={cn(
              "flex items-center gap-2 rounded-lg border border-border bg-card text-foreground font-medium",
              "hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed transition-colors",
              "p-2.5 md:px-4 md:py-2 md:text-sm",
            )}
          >
            <FileDown className={cn("w-4 h-4 flex-shrink-0", generatingCapabilityStatement && "animate-pulse")} />
            <span className="hidden md:inline whitespace-nowrap">
              {generatingCapabilityStatement ? "Generating…" : "Capability Statement"}
            </span>
          </button>

          {/* Refresh — icon-only on mobile (44px touch target), full label on desktop */}
          <button
            onClick={() => syncBids.mutate()}
            disabled={syncBids.isPending}
            title={businessId ? "Refresh bids" : "Refresh bids for all businesses"}
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
      <BidStatsBar bids={pipelineBids} primaryNaicsCodes={profileNaicsCodes} />

      {/* ── Quick Links ─────────────────────────────────────────────────────── */}
      <QuickLinksPanel
        links={quickLinks}
        onSave={(links) => saveQuickLinks.mutate(links)}
        isSaving={saveQuickLinks.isPending}
        isOwner={isOwner}
      />

      {/* ── Source management panel ─────────────────────────────────────────── */}
      {bidSources.length > 0 && businessId && (
        <SourceManagementPanel
          sources={bidSources}
          onUpdate={(slug, patch) => patchSource.mutate({ slug, patch })}
          isUpdating={patchSource.isPending}
          showPrivatePathways={capabilityFilter === "industrial_maintenance"}
        />
      )}

      {/* ── Business selector tabs ───────────────────────────────────────────
          Primary lens: which business are we viewing bids for?
          Selecting a business shows only bids its sync engine discovered.
          "All Businesses" shows the full deduplicated feed.                 */}
      {businesses.length > 1 && (
        <div
          className="flex gap-1.5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-0.5"
          style={{ scrollbarWidth: "none" } as React.CSSProperties}
        >
          <button
            onClick={() => { setActiveBusiness(null); setCapabilityFilter("all"); }}
            className={cn(
              "flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border whitespace-nowrap",
              !activeBusiness
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            )}
          >
            <Layers2 className="w-3.5 h-3.5" />
            All Businesses
          </button>
          {businesses.map((biz) => (
            <button
              key={biz.id}
              onClick={() => { setActiveBusiness(biz); setCapabilityFilter("all"); }}
              className={cn(
                "flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border whitespace-nowrap",
                activeBusiness?.id === biz.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              {biz.name}
            </button>
          ))}
        </div>
      )}

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
        subnetCount={subnetCount}
        capabilityFilter={capabilityFilter}
        setCapabilityFilter={setCapabilityFilter}
        capabilityCounts={capabilityCounts}
        activeBusinessType={activeBusiness?.type}
        tmOnlyFilter={tmOnlyFilter}
        setTmOnlyFilter={setTmOnlyFilter}
        tmCount={tmCount}
        geographyFilter={geographyFilter}
        setGeographyFilter={setGeographyFilter}
        qualityFilter={qualityFilter}
        setQualityFilter={setQualityFilter}
      />

      {/* ── Sync health strip ───────────────────────────────────────────────── */}
      {bidSettings && businessId && (
        bidSettings.samLastSuccessAt ?? bidSettings.samLastError ??
        bidSettings.localLastSuccessAt ?? bidSettings.localLastError ??
        bidSettings.awardsLastSuccessAt ?? bidSettings.awardsLastError
      ) && (
        <div className="flex flex-wrap gap-2">
          {([
            { label: "Federal",  successAt: bidSettings.samLastSuccessAt,    error: bidSettings.samLastError },
            { label: "KY Local", successAt: bidSettings.localLastSuccessAt,  error: bidSettings.localLastError },
            { label: "Awards",   successAt: bidSettings.awardsLastSuccessAt, error: bidSettings.awardsLastError },
          ] as { label: string; successAt?: string | null; error?: string | null }[])
            .filter((s) => s.successAt || s.error)
            .map((source) => (
              <span
                key={source.label}
                title={source.error ?? undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium",
                  source.error
                    ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
                    : "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400"
                )}
              >
                {source.error
                  ? <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  : <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                }
                {source.label}
                {!source.error && source.successAt && (
                  <span className="opacity-70">{relativeTime(source.successAt)}</span>
                )}
                {source.error && <span className="opacity-70">failed</span>}
              </span>
            ))
          }
        </div>
      )}

      {/* ── Content area ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {showPipeline && (
            <>
              {qualityFiltered.length === 0 ? (
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
                      bids={capabilityFiltered}
                      summaryCache={summaryCache}
                      onSummarize={openSummaryPanel}
                      onEducate={(b) => setEducatingBid(b)}
                      onStageChange={(bid, stage) => {
                        if (stage === "no_bid") dismissBid(bid);
                        else updateStage.mutate({ id: bid.id, stage, bidBusinessId: bid.businessId });
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

      {/* ── Filtered / Hidden Bids Panel ─────────────────────────────────── */}
      {hiddenBids.length > 0 && (
        <div className="mt-4 border border-border/40 rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            onClick={() => setShowFiltered((v) => !v)}
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <EyeOff className="h-4 w-4" />
                <span className="font-medium">Filtered Out ({hiddenBids.length})</span>
                <span className="text-xs hidden sm:inline">— review lower-scored and dismissed opportunities for false positives</span>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showFiltered ? "rotate-180" : ""}`} />
          </button>
          {showFiltered && (
            <div className="divide-y divide-border/30">
              {hiddenBids.map((bid) => (
                <div key={bid.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{bid.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {bid.agency ?? "Unknown agency"}
                      {bid.opportunityScore != null && ` · Score ${bid.opportunityScore}/100`}
                      {bid.naicsCode && ` · NAICS ${bid.naicsCode}`}
                    </p>
                    {bid.filterReason && (
                      <p className="text-xs text-muted-foreground/60 mt-0.5 italic">{bid.filterReason}</p>
                    )}
                  </div>
                  <button
                    onClick={() => updateStage.mutate({ id: bid.id, stage: "new", bidBusinessId: bid.businessId })}
                    className="shrink-0 text-xs text-primary hover:text-primary/80 font-medium transition-colors py-1"
                    disabled={updateStage.isPending}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Bid Education Panel ─────────────────────────────────────────── */}
      <BidEducationPanel
        bid={educatingBid ?? ({} as BidOpportunity)}
        open={!!educatingBid}
        onClose={() => setEducatingBid(null)}
        businessId={educatingBid?.businessId ?? businessId ?? 0}
        apiBaseUrl={BASE_URL}
        initialEducation={
          educatingBid
            ? ((educationCache[educatingBid.id] ?? educatingBid.educationSummary) as import("./bids/types").EducationSummary | null)
            : null
        }
        onGenerated={(edu) => {
          if (educatingBid) {
            const id = educatingBid.id;
            setEducationCache((prev) => ({ ...prev, [id]: edu }));
          }
        }}
      />

      {/* ── Bid Qualification Panel ──────────────────────────────────────── */}
      <BidQualificationPanel
        bid={qualifyingBid ?? ({} as BidOpportunity)}
        open={!!qualifyingBid}
        onClose={() => setQualifyingBid(null)}
        businessId={qualifyingBid?.businessId ?? businessId ?? 0}
        apiBaseUrl={BASE_URL}
        initialQual={
          qualifyingBid
            ? (qualCache[qualifyingBid.id] ?? (qualifyingBid.industrialQualSummary as IndustrialQualSummary | null))
            : null
        }
        onGenerated={(qual) => {
          if (qualifyingBid) {
            const id = qualifyingBid.id;
            // Update local cache so re-opening the panel is instant
            setQualCache((prev) => ({ ...prev, [id]: qual }));
            // Patch the bid in the query cache so BidCard renders the verdict badge immediately
            // (without waiting for the next full bids-unified refetch)
            queryClient.setQueryData<BidOpportunity[]>(
              ["bids-unified", activeBusiness?.id ?? "all"],
              (prev = []) =>
                prev.map((b) =>
                  b.id === id
                    ? { ...b, industrialQualSummary: qual, industrialQualSummaryAt: new Date().toISOString() }
                    : b
                )
            );
          }
        }}
      />

      {/* ── Add Private Opportunity Dialog ───────────────────────────────── */}
      <Dialog open={addingPrivate} onOpenChange={(o) => !o && setAddingPrivate(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Private Opportunity</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Company/plant name */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">
                Company / Plant name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={privateForm.companyName}
                onChange={(e) => setPrivateForm((p) => ({ ...p, companyName: e.target.value }))}
                placeholder="e.g. Acme Chemical Plant, Toyota Georgetown"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Opportunity type */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Opportunity type</label>
              <select
                value={privateForm.sourceType}
                onChange={(e) => setPrivateForm((p) => ({ ...p, sourceType: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="direct_service">Direct service (plant maintenance manager reached out)</option>
                <option value="subcontract">Subcontracting (prime contractor looking for subs)</option>
                <option value="prequalification">Prequalification (ISN / Avetta / PEC Safe)</option>
                <option value="on_call_list">On-call / approved contractor list</option>
                <option value="purchasing_portal">Purchasing portal (Ariba / Fieldglass / Coupa)</option>
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Work description</label>
              <textarea
                value={privateForm.description}
                onChange={(e) => setPrivateForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="What type of industrial maintenance work is needed?"
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>

            {/* Contact info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">Contact name</label>
                <input
                  type="text"
                  value={privateForm.contactName}
                  onChange={(e) => setPrivateForm((p) => ({ ...p, contactName: e.target.value }))}
                  placeholder="Maintenance manager name"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">Contact email</label>
                <input
                  type="email"
                  value={privateForm.contactEmail}
                  onChange={(e) => setPrivateForm((p) => ({ ...p, contactEmail: e.target.value }))}
                  placeholder="email@plant.com"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">Contact phone</label>
                <input
                  type="tel"
                  value={privateForm.contactPhone}
                  onChange={(e) => setPrivateForm((p) => ({ ...p, contactPhone: e.target.value }))}
                  placeholder="555-000-0000"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">Target deadline</label>
                <input
                  type="date"
                  value={privateForm.deadline}
                  onChange={(e) => setPrivateForm((p) => ({ ...p, deadline: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            {/* URL */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Website / portal URL (optional)</label>
              <input
                type="url"
                value={privateForm.url}
                onChange={(e) => setPrivateForm((p) => ({ ...p, url: e.target.value }))}
                placeholder="https://"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              onClick={() => setAddingPrivate(false)}
              className="px-4 py-2 text-sm rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => createPrivateBid.mutate(privateForm)}
              disabled={!privateForm.companyName.trim() || createPrivateBid.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {createPrivateBid.isPending ? "Adding…" : "Add Opportunity"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
