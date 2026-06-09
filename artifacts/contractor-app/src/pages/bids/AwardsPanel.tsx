import { useState } from "react";
import { ChevronDown, ChevronRight, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import AwardCard from "./AwardCard";
import type { BidOpportunity } from "./types";

interface Props {
  awards: BidOpportunity[];
  profileNaicsCodes?: string[];
}

export default function AwardsPanel({ awards, profileNaicsCodes }: Props) {
  const [expanded, setExpanded] = useState(true);

  if (awards.length === 0) return null;

  const matchCount = profileNaicsCodes
    ? awards.filter((a) => a.naicsCode && profileNaicsCodes.includes(a.naicsCode)).length
    : 0;

  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-800/50 bg-violet-50/40 dark:bg-violet-950/10 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-violet-100/50 dark:hover:bg-violet-900/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          <span className="font-semibold text-foreground text-sm">Awards Intelligence</span>
          <span className="text-xs text-muted-foreground">
            {awards.length} awarded contract{awards.length !== 1 ? "s" : ""} via USASpending.gov
            {matchCount > 0 && (
              <span className="ml-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                · {matchCount} similar to your work
              </span>
            )}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            These are past awarded contracts from government agencies — competitors who have won similar work. Use this to identify which companies are winning, how much they're getting, and which agencies are buying.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {awards.map((award) => (
              <AwardCard
                key={award.id}
                award={award}
                profileNaicsCodes={profileNaicsCodes}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
