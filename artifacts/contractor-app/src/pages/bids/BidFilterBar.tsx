import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  interested: "Interested",
  dismissed: "Dismissed",
};

export type BidFilter = "all" | "new" | "interested" | "dismissed";
export type SourceFilter = "all" | "federal" | "local";

interface Props {
  filter: BidFilter;
  setFilter: (f: BidFilter) => void;
  fitOnly: boolean;
  setFitOnly: (fn: (v: boolean) => boolean) => void;
  counts: Record<BidFilter, number>;
  fitCount: number;
  sourceFilter: SourceFilter;
  setSourceFilter: (s: SourceFilter) => void;
}

export default function BidFilterBar({
  filter, setFilter, fitOnly, setFitOnly, counts, fitCount,
  sourceFilter, setSourceFilter,
}: Props) {
  return (
    <div className="space-y-2">
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
      </div>
    </div>
  );
}
