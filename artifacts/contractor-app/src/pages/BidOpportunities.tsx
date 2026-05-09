import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink, Star, EyeOff, RefreshCw, Building2,
  FileSearch, Sparkles, X, CheckCircle2, XCircle,
  Calendar, ShieldCheck, DollarSign, Briefcase
} from "lucide-react";
import { cn } from "@/lib/utils";
const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AiSummary {
  description?: string;
  estimatedValue?: string | null;
  requirements?: string[];
  veteranPreference?: boolean;
  importantDates?: Array<{ label: string; date: string }>;
  isFit?: boolean;
  fitReason?: string;
}

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
  aiSummary: AiSummary | null;
  aiSummaryAt: string | null;
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

function SummaryPanel({
  bid,
  summary,
  loading,
  error,
  onClose,
}: {
  bid: BidOpportunity;
  summary: AiSummary | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="relative w-full max-w-lg h-full bg-card border-l border-border shadow-2xl overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-xs font-semibold text-primary uppercase tracking-wide">AI Summary</span>
            </div>
            <p className="font-semibold text-foreground text-sm leading-snug line-clamp-2">{bid.title}</p>
            {bid.agency && <p className="text-xs text-muted-foreground mt-0.5">{bid.agency}</p>}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 p-5 space-y-5">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <RefreshCw className="w-7 h-7 animate-spin text-primary/60" />
              <p className="text-sm text-muted-foreground font-medium">Reading the solicitation…</p>
              <p className="text-xs text-muted-foreground/60">This takes 5–15 seconds</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
              <XCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {summary && !loading && (
            <>
              {summary.isFit !== undefined && (
                <div className={cn(
                  "flex items-start gap-3 p-4 rounded-xl border",
                  summary.isFit
                    ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                    : "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
                )}>
                  {summary.isFit
                    ? <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    : <XCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  }
                  <div>
                    <p className={cn(
                      "font-semibold text-sm",
                      summary.isFit ? "text-green-800 dark:text-green-300" : "text-amber-800 dark:text-amber-300"
                    )}>
                      {summary.isFit ? "Looks like a good fit" : "May not be a fit"}
                    </p>
                    {summary.fitReason && (
                      <p className="text-xs mt-1 text-muted-foreground">{summary.fitReason}</p>
                    )}
                    {summary.veteranPreference && (
                      <p className="text-xs mt-1 font-medium text-blue-700 dark:text-blue-400">
                        Veteran-owned preference mentioned
                      </p>
                    )}
                  </div>
                </div>
              )}

              {summary.description && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">The Job</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed pl-6">{summary.description}</p>
                </div>
              )}

              {summary.estimatedValue && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estimated Value</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground pl-6">{summary.estimatedValue}</p>
                </div>
              )}

              {summary.requirements && summary.requirements.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Requirements</span>
                  </div>
                  <ul className="space-y-1.5 pl-6">
                    {summary.requirements.map((req, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                        {req}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.importantDates && summary.importantDates.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Important Dates</span>
                  </div>
                  <ul className="space-y-2 pl-6">
                    {summary.importantDates.map((d, i) => (
                      <li key={i} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{d.label}</span>
                        <span className="font-medium text-foreground">{d.date}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground/60">
                  AI summary — always verify against the original solicitation.
                </p>
              </div>
            </>
          )}
        </div>

        {bid.url && (
          <div className="sticky bottom-0 bg-card border-t border-border px-5 py-3">
            <a
              href={bid.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View Original Solicitation
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BidOpportunities() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "new" | "interested" | "dismissed">("all");
  const [panelBid, setPanelBid] = useState<BidOpportunity | null>(null);
  const [panelSummary, setPanelSummary] = useState<AiSummary | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [summaryCache, setSummaryCache] = useState<Record<number, AiSummary>>({});

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
        credentials: "include",
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

  const dismissedBids = bids.filter((b) => b.status === "dismissed");

  const counts = {
    all: bids.length,
    new: bids.filter((b) => b.status === "new").length,
    interested: bids.filter((b) => b.status === "interested").length,
    dismissed: dismissedBids.length,
  };

  const displayedBids = filter === "dismissed" ? dismissedBids
    : filter === "all" ? bids
    : bids.filter((b) => b.status === filter);

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
                        {(bid.aiSummary || summaryCache[bid.id]) && (
                          <span className="inline-flex items-center gap-1 text-xs text-primary/70">
                            <Sparkles className="w-3 h-3" />
                            Summarized
                          </span>
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
