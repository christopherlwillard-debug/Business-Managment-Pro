import { cn } from "@/lib/utils";
import type {
  GrantTypeFilter, FundingFilter, DeadlineFilter, EligibilityFilter, GrantFilters,
} from "./types";

// ── Filter option definitions ─────────────────────────────────────────────────

const GRANT_TYPE_TABS: Array<{ value: GrantTypeFilter; label: string }> = [
  { value: "all",           label: "All Types"       },
  { value: "small_business",label: "Small Business"  },
  { value: "veteran",       label: "Veteran"         },
  { value: "construction",  label: "Construction"    },
  { value: "workforce",     label: "Workforce"       },
  { value: "rural",         label: "Rural"           },
  { value: "equipment",     label: "Equipment"       },
  { value: "technology",    label: "Technology"      },
  { value: "economic_dev",  label: "Economic Dev"    },
];

const FUNDING_OPTIONS: Array<{ value: FundingFilter; label: string }> = [
  { value: "all",       label: "Any Amount"  },
  { value: "under_10k", label: "Under $10K"  },
  { value: "10k_50k",   label: "$10K – $50K" },
  { value: "50k_250k",  label: "$50K – $250K"},
  { value: "over_250k", label: "$250K+"      },
];

const DEADLINE_OPTIONS: Array<{ value: DeadlineFilter; label: string }> = [
  { value: "all",        label: "Any Deadline"  },
  { value: "this_month", label: "This Month"    },
  { value: "30_days",    label: "Within 30 Days"},
  { value: "90_days",    label: "Within 90 Days"},
];

const ELIGIBILITY_TABS: Array<{ value: EligibilityFilter; label: string; color?: string }> = [
  { value: "all",      label: "All Matches"  },
  { value: "likely",   label: "Likely",   color: "emerald" },
  { value: "maybe",    label: "Maybe",    color: "amber"   },
  { value: "unlikely", label: "Unlikely"                  },
];

interface Props {
  filters:    GrantFilters;
  setFilters: (f: GrantFilters) => void;
  counts: {
    total:    number;
    likely:   number;
    maybe:    number;
    unlikely: number;
    saved:    number;
    applied:  number;
  };
}

export default function GrantFilterBar({ filters, setFilters, counts }: Props) {
  function set<K extends keyof GrantFilters>(key: K, value: GrantFilters[K]) {
    setFilters({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-3">
      {/* ── Eligibility / stage row ──────────────────────────────────────── */}
      <div
        className="flex gap-1.5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible pb-0.5 md:pb-0"
        style={{ scrollbarWidth: "none" } as React.CSSProperties}
      >
        {ELIGIBILITY_TABS.map(({ value, label, color }) => {
          const count =
            value === "all"      ? counts.total    :
            value === "likely"   ? counts.likely   :
            value === "maybe"    ? counts.maybe    :
            value === "unlikely" ? counts.unlikely : 0;
          const active = filters.eligibility === value;

          const activeClass =
            color === "emerald" ? "bg-emerald-600 text-white border-emerald-600" :
            color === "amber"   ? "bg-amber-500  text-white border-amber-500"   :
            "bg-primary text-primary-foreground border-primary";

          return (
            <button
              key={value}
              onClick={() => set("eligibility", value)}
              className={cn(
                "flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border whitespace-nowrap",
                active ? activeClass : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              )}
            >
              {label}
              <span className={cn(
                "ml-1.5 text-xs px-1.5 py-0.5 rounded-full",
                active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
              )}>
                {count}
              </span>
            </button>
          );
        })}

        {/* Saved / Applied quick filters */}
        {counts.saved > 0 && (
          <button
            onClick={() => set("stage", filters.stage === "saved" ? "all" : "saved")}
            className={cn(
              "flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border whitespace-nowrap",
              filters.stage === "saved"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            )}
          >
            Saved
            <span className={cn(
              "ml-1.5 text-xs px-1.5 py-0.5 rounded-full",
              filters.stage === "saved" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
            )}>
              {counts.saved}
            </span>
          </button>
        )}
        {counts.applied > 0 && (
          <button
            onClick={() => set("stage", filters.stage === "applied" ? "all" : "applied")}
            className={cn(
              "flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border whitespace-nowrap",
              filters.stage === "applied"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-card text-muted-foreground border-border hover:border-emerald-500/50 hover:text-foreground"
            )}
          >
            Applied
            <span className={cn(
              "ml-1.5 text-xs px-1.5 py-0.5 rounded-full",
              filters.stage === "applied" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
            )}>
              {counts.applied}
            </span>
          </button>
        )}
      </div>

      {/* ── Grant type row ───────────────────────────────────────────────── */}
      <div
        className="flex gap-1.5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible pb-0.5 md:pb-0"
        style={{ scrollbarWidth: "none" } as React.CSSProperties}
      >
        <span className="flex-shrink-0 text-xs text-muted-foreground font-medium self-center">Type:</span>
        {GRANT_TYPE_TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => set("grantType", value)}
            className={cn(
              "flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border whitespace-nowrap",
              filters.grantType === value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Funding + Deadline + non-grants toggle ───────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">Funding:</span>
        <select
          value={filters.funding}
          onChange={(e) => set("funding", e.target.value as FundingFilter)}
          className="px-2 py-1 rounded-md text-xs border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
        >
          {FUNDING_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <span className="text-xs text-muted-foreground font-medium ml-1">Deadline:</span>
        <select
          value={filters.deadline}
          onChange={(e) => set("deadline", e.target.value as DeadlineFilter)}
          className="px-2 py-1 rounded-md text-xs border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
        >
          {DEADLINE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        {/* Non-grants toggle */}
        <button
          onClick={() => set("includeNonGrants", !filters.includeNonGrants)}
          className={cn(
            "ml-auto flex-shrink-0 px-3 py-1 rounded-md text-xs font-medium transition-colors border whitespace-nowrap",
            filters.includeNonGrants
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-card text-muted-foreground border-border hover:border-blue-400/50"
          )}
          title="Also show loans, tax credits, and cooperative agreements"
        >
          {filters.includeNonGrants ? "✓ " : ""}Loans &amp; tax credits
        </button>
      </div>
    </div>
  );
}
