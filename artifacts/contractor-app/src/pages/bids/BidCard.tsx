import {
  ExternalLink, Sparkles, XCircle, CheckCircle2,
  Building2, Shield, Users, Globe, Award, ChevronDown, Handshake, Info, Calendar, BookOpen,
  Eye, Lock, BadgeCheck, Zap, AlertTriangle, AlertCircle, Wrench, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiSummary, BidOpportunity, BidStage, SetAsideType, RecommendationLevel, OfficialSourceStatus } from "./types";
import { PIPELINE_STAGES } from "./types";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function DeadlineBadge({ deadline, dataCompleteness }: { deadline: string | null; dataCompleteness?: string | null }) {
  if (!deadline) {
    // For incomplete records, show an amber "No deadline on file" warning
    if (dataCompleteness === "needs_verification" || dataCompleteness === "partial") {
      return (
        <span
          className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
          title="Deadline not found in source record — verify directly with the issuing agency"
        >
          <AlertCircle className="w-3 h-3" />
          No deadline on file
        </span>
      );
    }
    return <span className="text-muted-foreground text-xs">No deadline</span>;
  }
  const days = daysUntil(deadline);
  const isUrgent = days !== null && days >= 0 && days <= 7;
  const isPast   = days !== null && days < 0;
  return (
    <span className={cn(
      "text-xs font-medium",
      isPast ? "text-muted-foreground line-through"
             : isUrgent ? "text-red-600 dark:text-red-400 font-semibold"
             : "text-foreground"
    )}>
      Due {deadline}
      {isUrgent && !isPast && <span className="ml-1 text-red-500">({days}d)</span>}
      {isPast && <span className="ml-1 text-muted-foreground">(expired)</span>}
    </span>
  );
}

const SET_ASIDE_CONFIG: Record<SetAsideType, { label: string; icon: typeof Shield; color: string; title?: string }> = {
  sdvosb: {
    label: "SDVOSB",
    icon:  Shield,
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    title: "SDVOSB set-aside — restricted to Service-Disabled Veteran-Owned Small Businesses",
  },
  vosb: {
    label: "VOSB",
    icon:  Shield,
    color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
    title: "VOSB set-aside — restricted to Veteran-Owned Small Businesses (SDVOSB qualifies)",
  },
  small_business: {
    label: "Small Biz",
    icon:  Users,
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    title: "Small Business set-aside — restricted to small businesses",
  },
  veteran_preference: {
    label: "Vet Pref",
    icon:  Award,
    color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    title: "Veteran preference in evaluation — all businesses may compete; veteran-owned get a scoring advantage",
  },
  open: {
    label: "Open",
    icon:  Globe,
    color: "bg-muted text-muted-foreground",
    title: "Full & open competition — all businesses may compete",
  },
  other: {
    label: "Set-Aside",
    icon:  Award,
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    title: "Cert-specific set-aside (HUBZone, 8(a), WOSB, etc.) — verify eligibility",
  },
};

// ── Recommendation badge ─────────────────────────────────────────────────────

const REC_CONFIG: Record<RecommendationLevel, { label: string; icon: typeof CheckCircle2; className: string; title: string }> = {
  bid: {
    label: "BID",
    icon:  BadgeCheck,
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    title: "Recommendation: Pursue this opportunity",
  },
  review: {
    label: "REVIEW",
    icon:  Eye,
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    title: "Recommendation: Read the solicitation before deciding",
  },
  pass: {
    label: "PASS",
    icon:  XCircle,
    className: "bg-slate-100 text-slate-500 dark:bg-slate-800/30 dark:text-slate-400",
    title: "Recommendation: This opportunity is not a good fit — skip it",
  },
};

function RecommendationBadge({ recommendation }: { recommendation: RecommendationLevel | null | undefined }) {
  if (!recommendation) return null;
  const config = REC_CONFIG[recommendation];
  if (!config) return null;
  const { label, icon: Icon, className, title } = config;
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full tracking-wide", className)}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// ── Official source badge (compact) ─────────────────────────────────────────

const SOURCE_STATUS_CONFIG: Partial<Record<OfficialSourceStatus, { icon: typeof BadgeCheck; className: string; label: string; title: string }>> = {
  found: {
    icon:      BadgeCheck,
    className: "text-green-600 dark:text-green-400",
    label:     "Official source",
    title:     "Official government posting found — this link goes directly to the government's procurement page",
  },
  aggregator_only: {
    icon:      Lock,
    className: "text-amber-500 dark:text-amber-400",
    label:     "Aggregator listing",
    title:     "Aggregator listing only — verify directly with the issuing agency before submitting",
  },
  subscription_required: {
    icon:      Lock,
    className: "text-orange-500 dark:text-orange-400",
    label:     "Sub required",
    title:     "Full access requires a paid subscription — search SAM.gov or the agency website for free access",
  },
};

function OfficialSourceChip({ status }: { status: OfficialSourceStatus | null | undefined }) {
  if (!status || status === "not_checked") return null;
  const config = SOURCE_STATUS_CONFIG[status];
  if (!config) return null;
  const { icon: Icon, className, label, title } = config;
  return (
    <span title={title} className={cn("inline-flex items-center gap-0.5 text-xs", className)}>
      <Icon className="w-3 h-3" />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

function EligibilityBadge({ summary }: { summary: AiSummary | null }) {
  if (!summary) return null;

  const setAsideType = summary.setAsideType;
  if (!setAsideType) {
    // Fall back to veteranPreference flag for bids summarised before the expanded type system
    if (summary.veteranPreference) {
      const { label, icon: Icon, color, title } = SET_ASIDE_CONFIG.veteran_preference;
      return (
        <span title={title} className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full", color)}>
          <Icon className="w-3 h-3" /> {label}
        </span>
      );
    }
    return null;
  }

  const config = SET_ASIDE_CONFIG[setAsideType as SetAsideType];
  if (!config) return null;
  const { label, icon: Icon, color, title } = config;
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full", color)}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}

// ── Opportunity type badge ───────────────────────────────────────────────────

const OPP_TYPE_CONFIG: Record<string, { label: string; icon: typeof Info; className: string; title: string }> = {
  sources_sought: {
    label: "Sources Sought",
    icon:  Info,
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
    title: "RFI / Market Research — the agency is not yet accepting bids",
  },
  presolicitation: {
    label: "Pre-Solicitation",
    icon:  Calendar,
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    title: "Early notice — a solicitation is planned but not yet posted",
  },
  forecast: {
    label: "Forecast",
    icon:  Calendar,
    className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
    title: "Planned acquisition from GSA Forecast — not yet solicited",
  },
};

function OpportunityTypeBadge({ type }: { type?: string | null }) {
  if (!type) return null;
  const config = OPP_TYPE_CONFIG[type];
  if (!config) return null;
  const { label, icon: Icon, className, title: tooltip } = config;
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full", className)}
      title={tooltip}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// ── Contract-type badge ───────────────────────────────────────────────────────

const CONTRACT_TYPE_CONFIG: Record<string, { label: string; icon: typeof Zap; className: string; title: string }> = {
  "T&M":                 { label: "T&M",          icon: Zap,           className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",  title: "Time & Materials contract — billed on actual hours and materials used" },
  "labor_hour":          { label: "Labor Hour",    icon: Zap,           className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",  title: "Labor-Hour contract — billed per hour worked" },
  "on_call":             { label: "On-Call",       icon: Zap,           className: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",          title: "On-Call / As-Needed contract — work ordered as required" },
  "idiq":                { label: "IDIQ",          icon: Zap,           className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",  title: "IDIQ — Indefinite Delivery, Indefinite Quantity; work ordered via task orders" },
  "task_order":          { label: "Task Order",    icon: Zap,           className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",  title: "Task Order contract — individual tasks released under a master agreement" },
  "shutdown_turnaround": { label: "Shutdown/TA",   icon: Zap,           className: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",          title: "Shutdown / Turnaround — time-critical plant outage or scheduled maintenance window" },
};

function ContractTypeBadge({ contractType }: { contractType: string }) {
  const config = CONTRACT_TYPE_CONFIG[contractType];
  if (!config) return null;
  const { label, icon: Icon, className, title } = config;
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full", className)}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

const STAGE_BADGE: Record<string, { label: string; className: string }> = {
  reviewing: { label: "Reviewing", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  bidding:   { label: "Bidding",   className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  submitted: { label: "Submitted", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  won:       { label: "Won",       className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  lost:      { label: "Lost",      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  no_bid:    { label: "No Bid",    className: "bg-muted text-muted-foreground" },
};

// ── Readiness verdict badge (from qualification analysis) ─────────────────────

const READINESS_BADGE: Record<string, { label: string; className: string }> = {
  ready:        { label: "Ready",        className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  almost_ready: { label: "Almost Ready", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  not_a_fit:    { label: "Not a Fit",    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  needs_review: { label: "Needs Review", className: "bg-muted text-muted-foreground" },
};

interface Props {
  bid:                   BidOpportunity;
  summary:               AiSummary | null;
  onSummarize:           (bid: BidOpportunity) => void;
  onEducate:             (bid: BidOpportunity) => void;
  onQualify?:            (bid: BidOpportunity) => void;
  onStageChange:         (bid: BidOpportunity, stage: BidStage) => void;
  onDismiss:             (bid: BidOpportunity) => void;
  onRestore:             (bid: BidOpportunity) => void;
  isUpdating:            boolean;
  /** Show business relevance chips (only meaningful in multi-business context). */
  multipleBusinesses?:   boolean;
  relevantBusinessNames?: string[];
  /** Whether the bid's NAICS code matches the owner's capability profiles. */
  naicsMatch?:           boolean;
}

export default function BidCard({
  bid, summary, onSummarize, onEducate, onQualify, onStageChange, onDismiss, onRestore, isUpdating,
  multipleBusinesses, relevantBusinessNames, naicsMatch,
}: Props) {
  const effectiveSummary = summary;
  const isNoBid   = bid.stage === "no_bid";
  const stageBadge = STAGE_BADGE[bid.stage];

  return (
    <div className={cn(
      "bg-card border border-border rounded-xl p-4 flex flex-col gap-3 transition-opacity",
      "hover:border-border/80",
      isNoBid && "opacity-60"
    )}>

      {/* ── Top badge row: source · opportunity type · stage · eligibility ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Source badge */}
        {bid.isPrivateOpportunity === true || bid.isPrivateOpportunity === "true" || bid.source === "private" ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
            <Wrench className="w-3 h-3" />
            Private
          </span>
        ) : bid.source === "state-local" ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            {bid.sourceLabel ?? "KY Local"}
          </span>
        ) : bid.source === "subnet" ? (
          <span
            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
            title="SBA SUBNet — a prime contractor is seeking a subcontractor"
          >
            <Handshake className="w-3 h-3" />
            Subcontracting
          </span>
        ) : bid.source === "gsa-forecast" ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
            GSA Forecast
          </span>
        ) : (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            Federal
          </span>
        )}

        {/* Opportunity type badge (shown only for non-default types not already conveyed by source) */}
        {bid.source !== "subnet" && bid.source !== "gsa-forecast" && (
          <OpportunityTypeBadge type={bid.opportunityType} />
        )}

        {/* Recommendation badge — always shown when computed; BID/REVIEW/PASS */}
        <RecommendationBadge recommendation={bid.recommendation} />

        {stageBadge && bid.stage !== "new" && (
          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", stageBadge.className)}>
            {stageBadge.label}
          </span>
        )}

        <EligibilityBadge summary={effectiveSummary} />

        {bid.geography && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
              bid.geography === "local" && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
              bid.geography === "regional" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
              bid.geography === "outside_area" && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
              bid.geography === "unknown" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
            )}
            title={bid.geographyReason ?? undefined}
          >
            {bid.geography === "local" ? "Local" : bid.geography === "regional" ? "Regional" : bid.geography === "outside_area" ? "Outside area" : "Location unknown"}
          </span>
        )}

        {effectiveSummary?.bondingRequired && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
            Bond Req
          </span>
        )}

        {/* ── Contract-type badge (T&M / On-Call / IDIQ / etc.) ── */}
        {bid.contractType && bid.contractType !== "unknown" && bid.contractType !== "fixed_price" && (
          <ContractTypeBadge contractType={bid.contractType} />
        )}

        {/* ── Scope size warning ── */}
        {bid.scopeSize === "large" && (
          <span
            title="This opportunity may be sized for a large prime contractor — review crew size requirements before bidding"
            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
          >
            <AlertTriangle className="w-3 h-3" />
            Large scale
          </span>
        )}

        {/* ── License-verify flags ── */}
        {bid.licenseFlags && bid.licenseFlags.length > 0 && (
          <span
            title={`Verify before bidding: ${bid.licenseFlags.join(", ")}`}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
          >
            <AlertCircle className="w-3 h-3" />
            Verify license
          </span>
        )}

        {/* ── Out-of-scope flags (shown, not hidden) ── */}
        {bid.outOfScopeFlags && bid.outOfScopeFlags.length > 0 && (
          <span
            title={`Outside typical scope: ${bid.outOfScopeFlags.join(", ")}`}
            className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
          >
            Outside scope
          </span>
        )}

        {/* ── Readiness verdict badge (from qualification analysis) ── */}
        {bid.industrialQualSummary && (() => {
          const verdict = (bid.industrialQualSummary as { readinessVerdict?: string }).readinessVerdict;
          const rb = verdict ? READINESS_BADGE[verdict] : null;
          if (!rb) return null;
          return (
            <span
              className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full", rb.className)}
              title="Industrial qualification readiness — click Qualify to view full analysis"
            >
              <Wrench className="w-3 h-3" />
              {rb.label}
            </span>
          );
        })()}

        {/* ── Data completeness warning (Phase 7) ── */}
        {bid.dataCompleteness === "needs_verification" && (
          <span
            title="This record is missing key details (deadline, NAICS code, or description). Verify the original source before acting on it."
            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          >
            <AlertCircle className="w-3 h-3" />
            Incomplete
          </span>
        )}
        {bid.dataCompleteness === "partial" && (
          <span
            title="This record is missing some details — verify the source for complete information before submitting a bid."
            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
          >
            <AlertCircle className="w-3 h-3" />
            Partial data
          </span>
        )}
        {bid.lifecycleState === "expired" && (
          <span
            title="The response deadline has passed. This record is retained in history and is not part of the default active feed."
            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
          >
            <Clock className="w-3 h-3" />
            Expired
          </span>
        )}
      </div>
      {bid.geographyReason && (
        <p className="text-xs text-muted-foreground flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
          {bid.placeOfPerformance ? `${bid.placeOfPerformance} — ` : ""}{bid.geographyReason}
        </p>
      )}

      {/* ── Title + agency ── */}
      <div>
        {/* Allow up to 3 lines on mobile so more text is readable */}
        <p className="font-semibold text-foreground leading-snug line-clamp-3 md:line-clamp-2">
          {bid.title}
        </p>
        {bid.agency && (
          <p className="flex items-start gap-1 text-xs text-muted-foreground mt-1">
            <Building2 className="w-3 h-3 flex-shrink-0 mt-0.5" />
            {/* Show 2 lines of agency on mobile to avoid cutting important context */}
            <span className="line-clamp-2 md:line-clamp-1">{bid.agency}</span>
          </p>
        )}
      </div>

      {/* ── Meta row: NAICS · deadline · fit indicator ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {bid.naicsCode && (
          <span className={cn("text-xs", naicsMatch ? "text-emerald-700 dark:text-emerald-400 font-semibold" : "text-muted-foreground")}>
            NAICS {bid.naicsCode}
            {naicsMatch !== undefined && (
              <span className={cn(
                "ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                naicsMatch
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800/30 dark:text-slate-400"
              )}>
                {naicsMatch ? "✓ Match" : "No match"}
              </span>
            )}
          </span>
        )}
        {bid.relevanceReason && (
          <span
            className="inline-flex items-center gap-1 text-xs text-primary/70 font-medium"
            title="Why this bid matched your capability profile"
          >
            <Zap className="w-3 h-3 flex-shrink-0" />
            {bid.relevanceReason}
          </span>
        )}
        <DeadlineBadge deadline={bid.responseDeadline} dataCompleteness={bid.dataCompleteness} />
        {effectiveSummary?.isFit !== undefined && (
          <button
            onClick={() => onSummarize(bid)}
            className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md transition-colors",
              effectiveSummary.isFit
                ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                : "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400"
            )}
          >
            {effectiveSummary.isFit
              ? <><CheckCircle2 className="w-3 h-3" /> Fit</>
              : <><XCircle className="w-3 h-3" /> No fit</>
            }
          </button>
        )}
        {effectiveSummary && effectiveSummary.isFit === undefined && (
          <span className="inline-flex items-center gap-1 text-xs text-primary/70">
            <Sparkles className="w-3 h-3" />
            Summarized
          </span>
        )}
      </div>

      {/* ── Business relevance chips (multi-business only) ── */}
      {multipleBusinesses && relevantBusinessNames && relevantBusinessNames.length > 0 && (
        <div className="flex flex-wrap gap-1 -mt-1">
          {relevantBusinessNames.map((name) => (
            <span
              key={name}
              className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground/70 font-medium"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* ── Action row ── */}
      {/* py-2.5 on mobile gives 44px-ish touch target height; desktop stays compact */}
      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border/50">
        <button
          onClick={() => onSummarize(bid)}
          className="flex items-center gap-1 px-3 py-2.5 md:py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5 md:w-3 md:h-3" />
          {effectiveSummary ? "Summary" : "Summarize"}
        </button>

        <button
          onClick={() => onEducate(bid)}
          className={cn(
            "flex items-center gap-1 px-3 py-2.5 md:py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap",
            bid.educationSummary
              ? "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/40"
              : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
          title="Get a plain-English explanation of this bid"
        >
          <BookOpen className="w-3.5 h-3.5 md:w-3 md:h-3" />
          {bid.educationSummary ? "Learn More" : "Learn"}
        </button>

        {/* Qualify button — only for industrial maintenance bids or private opportunities */}
        {onQualify && (
          bid.capabilityCategories?.includes("industrial_maintenance") ||
          bid.isPrivateOpportunity === true || bid.isPrivateOpportunity === "true"
        ) && (
          <button
            onClick={() => onQualify(bid)}
            className={cn(
              "flex items-center gap-1 px-3 py-2.5 md:py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap",
              bid.industrialQualSummary
                ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/40"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
            title="Run AI qualification analysis for this industrial maintenance bid"
          >
            <Wrench className="w-3.5 h-3.5 md:w-3 md:h-3" />
            Qualify
          </button>
        )}

        {bid.url && (
          <div className="inline-flex items-center gap-1.5">
            <a
              href={bid.officialSourceUrl ?? bid.url}
              target="_blank"
              rel="noopener noreferrer"
              title={bid.officialSourceUrl ? "Opens official government posting" : undefined}
              className="flex items-center gap-1 px-3 py-2.5 md:py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5 md:w-3 md:h-3" />
              View
            </a>
            <OfficialSourceChip status={bid.officialSourceStatus} />
          </div>
        )}

        {!isNoBid && (
          <div className="relative ml-auto">
            <select
              value={bid.stage}
              onChange={(e) => {
                const newStage = e.target.value as BidStage;
                if (newStage === "no_bid") onDismiss(bid);
                else onStageChange(bid, newStage);
              }}
              disabled={isUpdating}
              className="appearance-none pl-3 pr-7 py-2.5 md:py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground cursor-pointer hover:border-primary/50 transition-colors disabled:opacity-60"
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          </div>
        )}

        {isNoBid && (
          <button
            onClick={() => onRestore(bid)}
            disabled={isUpdating}
            className="ml-auto flex items-center gap-1 px-3 py-2.5 md:py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            Restore
          </button>
        )}
      </div>
    </div>
  );
}
