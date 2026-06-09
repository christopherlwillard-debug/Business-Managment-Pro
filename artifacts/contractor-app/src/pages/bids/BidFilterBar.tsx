import { CheckCircle2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BidStage } from "./types";

export type BidFilter = "all" | BidStage;
export type SourceFilter = "all" | "federal" | "local" | "usa-spending";

const STAGE_FILTER_TABS: Array<{ value: BidFilter; label: string }> = [
  { value: "all",       label: "All" },
  { value: "new",       label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "bidding",   label: "Bidding" },
  { value: "submitted", label: "Submitted" },
  { value: "won",       label: "Won" },
  { value: "lost",      label: "Lost" },
  { value: "no_bid",    label: "No Bid" },
];

interface Props {
  filter: BidFilter;
  setFilter: (f: BidFilter) => void;
  fitOnly: boolean;
  setFitOnly: (fn: (v: boolean) => boolean) => void;
  counts: Partial<Record<BidFilter, number>>;
  fitCount: number;
  sourceFilter: SourceFilter;
  setSourceFilter: (s: SourceFilter) => void;
  awardsCount?: number;
}

export default function BidFilterBar({
  filter, setFilter, fitOnly, setFitOnly, counts, fitCount,
  sourceFilter, setSourceFilter, awardsCount = 0,
}: Props) {
  return (
    <div className="space-y-2">
      {sourceFilter !== "usa-spending" && (
        <div className="flex flex-wrap gap-2">
          {STAGE_FILTER_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                filter === value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              )}
            >
              {label}
              <span className={cn(
                "ml-1.5 text-xs px-1.5 py-0.5 rounded-full",
                filter === value ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {counts[value] ?? 0}
              </span>
            </button>
          ))}
          <button
            onClick={() => setFitOnly((v) => !v)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
              fitOnly
                ? "bg-green-600 text-white border-green-600"
                : "bg-card text-muted-foreground border-border hover:border-green-500/50 hover:text-foreground"
            )}
          >
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Fit
            </span>
            <span className={cn(
              "ml-1.5 text-xs px-1.5 py-0.5 rounded-full",
              fitOnly ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
            )}>
              {fitCount}
            </span>
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground font-medium mr-1">Source:</span>
        {(["all", "federal", "local"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSourceFilter(s)}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors border",
              sourceFilter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            )}
          >
            {s === "all" ? "All" : s === "federal" ? "Federal" : "Local"}
          </button>
        ))}
        <button
          onClick={() => setSourceFilter(sourceFilter === "usa-spending" ? "all" : "usa-spending")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border",
            sourceFilter === "usa-spending"
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-card text-muted-foreground border-border hover:border-violet-400/50 hover:text-foreground"
          )}
        >
          <Trophy className="w-3 h-3" />
          Awards Intel
          {awardsCount > 0 && (
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded-full",
              sourceFilter === "usa-spending" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
            )}>
              {awardsCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
