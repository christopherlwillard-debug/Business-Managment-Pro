import { Building2, Sparkles, ExternalLink, CheckCircle2, XCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiSummary, BidOpportunity, BidStage } from "./types";
import { PIPELINE_STAGES } from "./types";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function PipelineCard({
  bid,
  summary,
  onSummarize,
  onStageChange,
  isUpdating,
}: {
  bid: BidOpportunity;
  summary: AiSummary | null;
  onSummarize: (bid: BidOpportunity) => void;
  onStageChange: (bid: BidOpportunity, stage: BidStage) => void;
  isUpdating: boolean;
}) {
  const days = daysUntil(bid.responseDeadline);
  const isUrgent = days !== null && days >= 0 && days <= 7;
  const isPast = days !== null && days < 0;

  return (
    <div className="bg-background border border-border rounded-xl p-3 flex flex-col gap-2 hover:border-border/60 transition-colors">
      <p className="font-semibold text-foreground text-xs leading-snug line-clamp-2">{bid.title}</p>
      {bid.agency && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Building2 className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="truncate">{bid.agency}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {bid.responseDeadline && (
          <span className={cn(
            "text-xs",
            isPast ? "text-muted-foreground line-through" : isUrgent ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"
          )}>
            {isUrgent && !isPast ? `⚠ ${days}d` : isPast ? "Expired" : `Due ${bid.responseDeadline}`}
          </span>
        )}
        {summary?.isFit !== undefined && (
          <span className={cn(
            "inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded",
            summary.isFit
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          )}>
            {summary.isFit
              ? <><CheckCircle2 className="w-2.5 h-2.5" /> Fit</>
              : <><XCircle className="w-2.5 h-2.5" /> No fit</>
            }
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 pt-1 border-t border-border/40">
        <button
          onClick={() => onSummarize(bid)}
          className="flex items-center gap-0.5 px-2 py-1 text-xs font-medium rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <Sparkles className="w-2.5 h-2.5" />
          {summary ? "Summary" : "AI"}
        </button>
        {bid.url && (
          <a
            href={bid.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 px-2 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
        <div className="relative ml-auto">
          <select
            value={bid.stage}
            onChange={(e) => onStageChange(bid, e.target.value as BidStage)}
            disabled={isUpdating}
            className="appearance-none pl-2 pr-6 py-1 text-xs font-medium rounded-md border border-border bg-card text-foreground cursor-pointer hover:border-primary/50 transition-colors disabled:opacity-60"
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

interface Props {
  bids: BidOpportunity[];
  summaryCache: Record<number, AiSummary>;
  onSummarize: (bid: BidOpportunity) => void;
  onStageChange: (bid: BidOpportunity, stage: BidStage) => void;
  isUpdating: boolean;
  fitOnly: boolean;
  sourceFilter: "all" | "federal" | "local";
}

export default function PipelineBoard({
  bids, summaryCache, onSummarize, onStageChange, isUpdating, fitOnly, sourceFilter,
}: Props) {
  const filtered = bids.filter((b) => {
    if (sourceFilter === "federal" && b.source === "state-local") return false;
    if (sourceFilter === "local" && b.source !== "state-local") return false;
    if (fitOnly) {
      const s = summaryCache[b.id] ?? b.aiSummary;
      if (s?.isFit !== true) return false;
    }
    return true;
  });

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max">
        {PIPELINE_STAGES.map((stage) => {
          const stageBids = filtered.filter((b) => b.stage === stage.value);
          return (
            <div key={stage.value} className="w-64 flex-shrink-0 flex flex-col gap-2">
              <div className={cn(
                "flex items-center justify-between px-3 py-2 rounded-xl border",
                stage.bg,
              )}>
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full flex-shrink-0", stage.dotColor)} />
                  <span className={cn("text-xs font-semibold", stage.color)}>{stage.label}</span>
                </div>
                <span className={cn(
                  "text-xs font-bold px-1.5 py-0.5 rounded-full",
                  stageBids.length > 0 ? stage.color : "text-muted-foreground"
                )}>
                  {stageBids.length}
                </span>
              </div>

              <div className="flex flex-col gap-2 min-h-[120px]">
                {stageBids.length === 0 ? (
                  <div className="flex items-center justify-center h-16 rounded-xl border border-dashed border-border/50">
                    <span className="text-xs text-muted-foreground/50">No bids</span>
                  </div>
                ) : (
                  stageBids.map((bid) => (
                    <PipelineCard
                      key={bid.id}
                      bid={bid}
                      summary={summaryCache[bid.id] ?? bid.aiSummary}
                      onSummarize={onSummarize}
                      onStageChange={onStageChange}
                      isUpdating={isUpdating}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
