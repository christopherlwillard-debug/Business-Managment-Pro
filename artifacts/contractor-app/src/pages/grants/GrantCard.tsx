import { useState } from "react";
import {
  ChevronDown, ChevronUp, ExternalLink, Bookmark, CheckCheck, X,
  RotateCcw, AlertCircle, Calendar, DollarSign, Building2, Award,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GrantOpportunity, GrantStage, EligibilityLabel } from "./types";

// ── Eligibility chip ──────────────────────────────────────────────────────────

function EligibilityChip({ label, fitScore }: { label: EligibilityLabel | null; fitScore: number | null }) {
  if (!label) return null;
  const config = {
    likely:   { text: "Likely Match",   bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-700", color: "text-emerald-700 dark:text-emerald-400" },
    maybe:    { text: "Possible Match", bg: "bg-amber-50 dark:bg-amber-900/20",   border: "border-amber-200 dark:border-amber-700",   color: "text-amber-700 dark:text-amber-400"   },
    unlikely: { text: "Less Likely",    bg: "bg-muted",                            border: "border-border",                            color: "text-muted-foreground"                  },
  }[label];

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
        config.bg, config.border, config.color
      )}>
        <Award className="w-3 h-3 flex-shrink-0" />
        {config.text}
      </span>
      {fitScore != null && (
        <span className="text-xs text-muted-foreground font-mono">{fitScore}%</span>
      )}
    </div>
  );
}

// ── Funding range formatter ───────────────────────────────────────────────────

function formatFunding(min: number | null, max: number | null): string | null {
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
    return `$${n.toLocaleString()}`;
  };
  if (max && min && min !== max) return `${fmt(min)} – ${fmt(max)}`;
  if (max) return `Up to ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  return null;
}

// ── Deadline formatter ────────────────────────────────────────────────────────

function DeadlineBadge({ deadline }: { deadline: string | null }) {
  if (!deadline) return null;
  const date = new Date(deadline);
  const now  = Date.now();
  const daysOut = Math.ceil((date.getTime() - now) / (1000 * 60 * 60 * 24));

  if (daysOut < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground line-through">
        <Calendar className="w-3 h-3" />
        {date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </span>
    );
  }

  const urgent = daysOut <= 14;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs font-medium",
      urgent ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
    )}>
      <Calendar className="w-3 h-3 flex-shrink-0" />
      {daysOut <= 0 ? "Today" : daysOut === 1 ? "Tomorrow" : `${daysOut}d left`}
      <span className="text-muted-foreground/60 font-normal">
        ({date.toLocaleDateString("en-US", { month: "short", day: "numeric" })})
      </span>
    </span>
  );
}

// ── Stage action buttons ──────────────────────────────────────────────────────

interface StageActionsProps {
  stage:    GrantStage;
  onSave:   () => void;
  onApply:  () => void;
  onDismiss: () => void;
  disabled: boolean;
}

function StageActions({ stage, onSave, onApply, onDismiss, disabled }: StageActionsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {stage !== "saved" && stage !== "applied" && (
        <button
          type="button"
          onClick={onSave}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground disabled:opacity-50"
        >
          <Bookmark className="w-3.5 h-3.5" />
          Save
        </button>
      )}

      {stage === "saved" && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20">
          <Bookmark className="w-3.5 h-3.5 fill-current" />
          Saved
        </span>
      )}

      {stage !== "applied" && (
        <button
          type="button"
          onClick={onApply}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border bg-card text-muted-foreground border-border hover:border-emerald-500/50 hover:text-foreground disabled:opacity-50"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          Mark Applied
        </button>
      )}

      {stage === "applied" && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700">
          <CheckCheck className="w-3.5 h-3.5" />
          Applied
        </span>
      )}

      {stage !== "no_interest" && (
        <button
          type="button"
          onClick={onDismiss}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
          title="Hide this grant"
        >
          <X className="w-3.5 h-3.5" />
          No Thanks
        </button>
      )}
    </div>
  );
}

// ── Category chip ─────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  small_business: "Small Business",
  veteran:        "Veteran",
  rural:          "Rural",
  workforce:      "Workforce",
  technology:     "Technology",
  equipment:      "Equipment",
  construction:   "Construction",
  economic_dev:   "Economic Dev",
  energy:         "Energy",
  trade:          "Trade",
};

function CategoryChip({ cat }: { cat: string }) {
  const label = CATEGORY_LABELS[cat] ?? cat.replace(/_/g, " ");
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border/50">
      {label}
    </span>
  );
}

// ── Opportunity type badge ────────────────────────────────────────────────────

function OpportunityTypeBadge({ type }: { type: string }) {
  if (type === "grant" || type === "cooperative_agreement") return null;
  const label = type === "loan" ? "Loan" : type === "tax_credit" ? "Tax Credit" : "Other";
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
      {label}
    </span>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

interface GrantCardProps {
  grant:     GrantOpportunity;
  onStage:   (id: number, stage: GrantStage, previousStage: GrantStage) => void;
  isMutating: boolean;
}

export default function GrantCard({ grant, onStage, isMutating }: GrantCardProps) {
  const [expanded, setExpanded] = useState(false);
  const funding = formatFunding(grant.fundingMin, grant.fundingMax);

  function handleSave()    { onStage(grant.id, "saved",   grant.stage); }
  function handleApply()   { onStage(grant.id, "applied", grant.stage); }
  function handleDismiss() { onStage(grant.id, "no_interest", grant.stage); }

  return (
    <div className={cn(
      "bg-card border border-border rounded-xl overflow-hidden transition-shadow hover:shadow-sm",
      grant.stage === "applied" && "border-emerald-200 dark:border-emerald-800",
      grant.stage === "saved"   && "border-primary/30",
    )}>
      {/* ── Card header ────────────────────────────────────────────────────── */}
      <div className="p-4">
        {/* Top line: eligibility + type */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <EligibilityChip label={grant.eligibilityLabel} fitScore={grant.fitScore} />
          <div className="flex items-center gap-1">
            <OpportunityTypeBadge type={grant.opportunityType} />
          </div>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-foreground leading-snug mb-1">
          {grant.title}
        </h3>

        {/* Agency */}
        {grant.agency && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
            <Building2 className="w-3 h-3 flex-shrink-0" />
            {grant.agency}
          </p>
        )}

        {/* Key metadata row */}
        <div className="flex flex-wrap items-center gap-3 text-xs mb-3">
          {funding && (
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <DollarSign className="w-3 h-3 text-emerald-600 flex-shrink-0" />
              {funding}
            </span>
          )}
          <DeadlineBadge deadline={grant.deadline} />
        </div>

        {/* Categories */}
        {grant.grantCategories.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {grant.grantCategories.slice(0, 5).map((cat) => (
              <CategoryChip key={cat} cat={cat} />
            ))}
          </div>
        )}

        {/* Match reasons */}
        {grant.matchReasons.length > 0 && (
          <div className="space-y-0.5 mb-3">
            {grant.matchReasons.slice(0, 2).map((reason, i) => (
              <p key={i} className="text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-1">
                <span className="flex-shrink-0 mt-0.5">✓</span>
                {reason}
              </p>
            ))}
          </div>
        )}

        {/* Eligibility disclaimer */}
        {grant.eligibilityLabel && grant.eligibilityLabel !== "unlikely" && (
          <p className="text-[10px] text-muted-foreground/60 italic mb-3">
            Screening assessment based on your profile. Always verify official requirements.
          </p>
        )}

        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {expanded ? (
            <><ChevronUp className="w-3 h-3" />Less details</>
          ) : (
            <><ChevronDown className="w-3 h-3" />More details &amp; apply</>
          )}
        </button>
      </div>

      {/* ── Expanded section ────────────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
          {/* Description */}
          {grant.description && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">About</p>
              <p className="text-xs text-foreground leading-relaxed line-clamp-5">{grant.description}</p>
            </div>
          )}

          {/* Use of funds */}
          {grant.useOfFunds && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">What funds can be used for</p>
              <p className="text-xs text-foreground leading-relaxed">{grant.useOfFunds}</p>
            </div>
          )}

          {/* Key requirements */}
          {grant.keyRequirements.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Key requirements</p>
              <ul className="space-y-0.5">
                {grant.keyRequirements.map((req, i) => (
                  <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                    <span className="flex-shrink-0 w-3.5 h-3.5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold mt-0.5">
                      {i + 1}
                    </span>
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* All match reasons */}
          {grant.matchReasons.length > 2 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Why this matches</p>
              <ul className="space-y-0.5">
                {grant.matchReasons.map((reason, i) => (
                  <li key={i} className="text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-1">
                    <span className="flex-shrink-0 mt-0.5">✓</span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Apply link */}
          {grant.applicationUrl && (
            <a
              href={grant.applicationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View on Grants.gov
            </a>
          )}
        </div>
      )}

      {/* ── Stage actions ───────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-border/50 bg-muted/10">
        <StageActions
          stage={grant.stage}
          onSave={handleSave}
          onApply={handleApply}
          onDismiss={handleDismiss}
          disabled={isMutating}
        />
      </div>
    </div>
  );
}
