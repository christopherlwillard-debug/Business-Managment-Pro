import { CheckCircle2, Trophy, Handshake } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BidStage } from "./types";

export type BidFilter = "all" | BidStage;
export type SourceFilter = "all" | "federal" | "local" | "subnet" | "usa-spending";
export type CapabilityFilter =
  | "all"
  | "asphalt"
  | "dump_waste"
  | "flooring"
  | "mfg_homes"
  | "site_work"
  | "general_contracting"
  | "subcontracting";

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

const ALL_CAPABILITY_TABS: Array<{ value: CapabilityFilter; label: string }> = [
  { value: "all",                label: "All" },
  { value: "asphalt",            label: "Asphalt" },
  { value: "dump_waste",         label: "Dump & Waste" },
  { value: "general_contracting",label: "General Contracting" },
  { value: "flooring",           label: "Flooring" },
  { value: "site_work",          label: "Site Work" },
  { value: "mfg_homes",          label: "Mfg Homes" },
  { value: "subcontracting",     label: "Subcontracting" },
];

/**
 * Which capability tabs are relevant per business type.
 * "all" is always included.  When no business is selected, all tabs are shown.
 */
const CAPABILITY_TABS_FOR_BUSINESS: Record<string, CapabilityFilter[]> = {
  asphalt_sealing:     ["all", "asphalt"],
  general_contracting: ["all", "dump_waste", "general_contracting", "flooring", "site_work", "mfg_homes"],
};

interface Props {
  filter:              BidFilter;
  setFilter:           (f: BidFilter) => void;
  fitOnly:             boolean;
  setFitOnly:          (fn: (v: boolean) => boolean) => void;
  counts:              Partial<Record<BidFilter, number>>;
  fitCount:            number;
  sourceFilter:        SourceFilter;
  setSourceFilter:     (s: SourceFilter) => void;
  awardsCount?:        number;
  subnetCount?:        number;
  // Capability category tabs
  capabilityFilter:    CapabilityFilter;
  setCapabilityFilter: (f: CapabilityFilter) => void;
  capabilityCounts:    Partial<Record<CapabilityFilter, number>>;
  // Active business type slug — used to show only relevant capability tabs
  activeBusinessType?: string;
}

export default function BidFilterBar({
  filter, setFilter, fitOnly, setFitOnly, counts, fitCount,
  sourceFilter, setSourceFilter, awardsCount = 0, subnetCount = 0,
  capabilityFilter, setCapabilityFilter, capabilityCounts,
  activeBusinessType,
}: Props) {
  // Only show capability tabs relevant to the selected business.
  // When no business is selected (all-businesses view), show all tabs.
  const allowedKeys = activeBusinessType
    ? (CAPABILITY_TABS_FOR_BUSINESS[activeBusinessType] ?? null)
    : null;
  const capabilityTabs = allowedKeys
    ? ALL_CAPABILITY_TABS.filter((t) => allowedKeys.includes(t.value))
    : ALL_CAPABILITY_TABS;

  // If a single business is selected that only has one meaningful capability tab,
  // skip showing the capability tabs entirely (no useful filtering).
  const showCapabilityTabs = capabilityTabs.length > 2; // more than just "All" + one option

  return (
    <div className="space-y-2">
      {/* ── Capability category tabs ─────────────────────────────────────────
          Trade/capability sub-filter within the selected business context.
          Hidden when there's only one meaningful capability option.          */}
      {showCapabilityTabs && (
      <div
        className="flex gap-1.5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible pb-0.5 md:pb-0"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        {capabilityTabs.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setCapabilityFilter(value)}
            className={cn(
              "flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border whitespace-nowrap",
              capabilityFilter === value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            )}
          >
            {label}
            {(capabilityCounts[value] ?? 0) > 0 && (
              <span className={cn(
                "ml-1.5 text-xs px-1.5 py-0.5 rounded-full",
                capabilityFilter === value
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}>
                {capabilityCounts[value] ?? 0}
              </span>
            )}
          </button>
        ))}
      </div>
      )}

      {/* ── Stage + Fit pills ────────────────────────────────────────────────
          On mobile: single horizontally-scrollable row (no wrapping).
          On desktop (md+): wraps as before.                                  */}
      {sourceFilter !== "usa-spending" && (
        <div
          className="flex gap-1.5 overflow-x-auto md:flex-wrap md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-1 md:pb-0"
          style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          {STAGE_FILTER_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                "flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border whitespace-nowrap",
                filter === value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              )}
            >
              {label}
              <span className={cn(
                "ml-1.5 text-xs px-1.5 py-0.5 rounded-full",
                filter === value
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}>
                {counts[value] ?? 0}
              </span>
            </button>
          ))}

          {/* Fit toggle */}
          <button
            onClick={() => setFitOnly((v) => !v)}
            className={cn(
              "flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border whitespace-nowrap",
              fitOnly
                ? "bg-green-600 text-white border-green-600"
                : "bg-card text-muted-foreground border-border hover:border-green-500/50 hover:text-foreground"
            )}
          >
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            Fit
            <span className={cn(
              "ml-0.5 text-xs px-1.5 py-0.5 rounded-full",
              fitOnly ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
            )}>
              {fitCount}
            </span>
          </button>
        </div>
      )}

      {/* ── Source filter row — compact, scrollable on mobile ───────────── */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto md:overflow-visible"
        style={{ scrollbarWidth: "none" } as React.CSSProperties}
      >
        <span className="flex-shrink-0 text-xs text-muted-foreground font-medium">Source:</span>

        {(["all", "federal", "local"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSourceFilter(s)}
            className={cn(
              "flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border whitespace-nowrap",
              sourceFilter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            )}
          >
            {s === "all" ? "All" : s === "federal" ? "Federal" : "Local"}
          </button>
        ))}

        {/* Subcontracting — SBA SUBNet */}
        <button
          onClick={() => setSourceFilter(sourceFilter === "subnet" ? "all" : "subnet")}
          className={cn(
            "flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border whitespace-nowrap",
            sourceFilter === "subnet"
              ? "bg-teal-600 text-white border-teal-600"
              : "bg-card text-muted-foreground border-border hover:border-teal-400/50 hover:text-foreground"
          )}
        >
          <Handshake className="w-3 h-3 flex-shrink-0" />
          Subcontracting
          {subnetCount > 0 && (
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded-full",
              sourceFilter === "subnet" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
            )}>
              {subnetCount}
            </span>
          )}
        </button>

        {/* Awards Intel — USASpending */}
        <button
          onClick={() => setSourceFilter(sourceFilter === "usa-spending" ? "all" : "usa-spending")}
          className={cn(
            "flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border whitespace-nowrap",
            sourceFilter === "usa-spending"
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-card text-muted-foreground border-border hover:border-violet-400/50 hover:text-foreground"
          )}
        >
          <Trophy className="w-3 h-3 flex-shrink-0" />
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

        {/* Business context label — shown when viewing all businesses */}
        {!activeBusinessType && (
          <span className="ml-auto flex-shrink-0 text-xs text-muted-foreground/60 italic whitespace-nowrap hidden sm:inline">
            All businesses · scored per business
          </span>
        )}
      </div>
    </div>
  );
}
