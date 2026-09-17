import { useState, useEffect } from "react";
import {
  Sparkles, X, RefreshCw, XCircle, CheckCircle2,
  Briefcase, DollarSign, ShieldCheck, Calendar, ExternalLink,
  Shield, Users, Globe, Award, AlertTriangle, ChevronDown,
  StickyNote, Check, Eye, Minus, HelpCircle, BadgeCheck, Lock,
  FileSearch, MapPin, Mail, Phone, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AiSummary, BidOpportunity, BidStage, SetAsideType,
  RecommendationFactor, FactorSignal, OfficialSourceStatus, DeepRead,
  DeepReadEvidence,
} from "./types";
import { PIPELINE_STAGES } from "./types";

const SET_ASIDE_CONFIG: Record<SetAsideType, { label: string; icon: typeof Shield; color: string; bg: string; detail: string }> = {
  sdvosb: {
    label:  "SDVOSB Set-Aside",
    icon:   Shield,
    color:  "text-emerald-700 dark:text-emerald-300",
    bg:     "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800",
    detail: "Reserved for Service-Disabled Veteran-Owned Small Businesses. Your SDVOSB certification makes you directly eligible.",
  },
  vosb: {
    label:  "VOSB Set-Aside",
    icon:   Shield,
    color:  "text-teal-700 dark:text-teal-300",
    bg:     "bg-teal-50 border-teal-200 dark:bg-teal-900/20 dark:border-teal-800",
    detail: "Reserved for Veteran-Owned Small Businesses. Both VOSB and SDVOSB certifications qualify.",
  },
  small_business: {
    label:  "Small Business Set-Aside",
    icon:   Users,
    color:  "text-blue-700 dark:text-blue-300",
    bg:     "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",
    detail: "Reserved for small businesses — your size status applies.",
  },
  veteran_preference: {
    label:  "Veteran Preference",
    icon:   Award,
    color:  "text-violet-700 dark:text-violet-300",
    bg:     "bg-violet-50 border-violet-200 dark:bg-violet-900/20 dark:border-violet-800",
    detail: "Not a formal set-aside — all businesses may compete, but veteran-owned firms receive an evaluation advantage.",
  },
  open: {
    label:  "Open Competition",
    icon:   Globe,
    color:  "text-muted-foreground",
    bg:     "bg-muted/40 border-border",
    detail: "Full & open — no set-aside restriction. All businesses may compete.",
  },
  other: {
    label:  "Cert-Specific Set-Aside",
    icon:   Award,
    color:  "text-purple-700 dark:text-purple-300",
    bg:     "bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800",
    detail: "HUBZone, 8(a), WOSB, or another certified-business set-aside. Verify your eligibility before responding.",
  },
};

// ── Recommendation engine UI ──────────────────────────────────────────────────

const REC_HEADER_CONFIG = {
  bid: {
    label:     "BID",
    icon:      BadgeCheck,
    className: "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800",
    textColor: "text-green-700 dark:text-green-300",
    iconColor: "text-green-600 dark:text-green-400",
  },
  review: {
    label:     "REVIEW",
    icon:      Eye,
    className: "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",
    textColor: "text-amber-700 dark:text-amber-300",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  pass: {
    label:     "PASS",
    icon:      XCircle,
    className: "bg-slate-100 border-border dark:bg-slate-800/30 dark:border-border",
    textColor: "text-slate-600 dark:text-slate-400",
    iconColor: "text-slate-500 dark:text-slate-400",
  },
} as const;

const SIGNAL_ICON: Record<FactorSignal, { icon: typeof CheckCircle2; color: string; title: string }> = {
  positive: { icon: CheckCircle2, color: "text-green-600 dark:text-green-400",  title: "Favourable" },
  negative: { icon: XCircle,      color: "text-red-600 dark:text-red-400",      title: "Unfavourable" },
  neutral:  { icon: Minus,        color: "text-muted-foreground",               title: "Neutral" },
  unknown:  { icon: HelpCircle,   color: "text-amber-500 dark:text-amber-400",  title: "Unknown" },
};

function FactorRow({ factor }: { factor: RecommendationFactor }) {
  const { icon: Icon, color, title: signalTitle } = SIGNAL_ICON[factor.signal] ?? SIGNAL_ICON.neutral;
  return (
    <li className="flex items-start gap-2.5">
      <span title={signalTitle} className="flex-shrink-0 mt-0.5">
        <Icon className={cn("w-4 h-4", color)} />
      </span>
      <div>
        <span className="text-xs font-semibold text-foreground">{factor.label}</span>
        {factor.detail && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{factor.detail}</p>
        )}
      </div>
    </li>
  );
}

function DeepReadEvidenceBlock({
  evidence,
  officialSourceUrl,
}: {
  evidence?: DeepReadEvidence;
  officialSourceUrl?: string | null;
}) {
  if (!evidence || evidence.status !== "confirmed") {
    return (
      <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50/70 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span>
          <span className="font-semibold">
            {evidence?.status === "ambiguous" ? "Manual verification recommended" : "Manual verification needed"}
          </span>
          {evidence?.source && <span> · {evidence.source}</span>}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/70 bg-muted/30 px-2.5 py-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-muted-foreground">
          Source{evidence.source ? ` · ${evidence.source}` : ""}
        </p>
        {officialSourceUrl && evidence.excerpt && (
          <a
            href={officialSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open official solicitation for this finding"
            className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Open source
          </a>
        )}
      </div>
      {evidence.excerpt ? (
        <p className="mt-0.5 leading-relaxed text-foreground/80">“{evidence.excerpt}”</p>
      ) : (
        <p className="mt-0.5 text-amber-700 dark:text-amber-300">Manual verification needed — no excerpt was returned.</p>
      )}
    </div>
  );
}

function DeepReadValue({
  value,
  evidence,
  officialSourceUrl,
}: {
  value: string | null | undefined;
  evidence?: DeepReadEvidence;
  officialSourceUrl?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <span className={cn(
        "text-sm",
        value ? "text-foreground" : "text-muted-foreground/60 italic",
      )}>
        {value ?? "Not stated in the solicitation"}
      </span>
      {evidence && <DeepReadEvidenceBlock evidence={evidence} officialSourceUrl={officialSourceUrl} />}
    </div>
  );
}

function DeepReadList({
  items,
  evidence,
  officialSourceUrl,
}: {
  items: string[];
  evidence?: DeepReadEvidence[];
  officialSourceUrl?: string | null;
}) {
  if (items.length === 0) {
    return <DeepReadValue value={null} evidence={evidence?.[0]} officialSourceUrl={officialSourceUrl} />;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="space-y-1.5 text-sm text-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
            <span>{item}</span>
          </div>
          <div className="pl-3.5">
            <DeepReadEvidenceBlock evidence={evidence?.[index]} officialSourceUrl={officialSourceUrl} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DeepReadSection({
  deepRead,
  officialSourceUrl,
}: {
  deepRead: DeepRead;
  officialSourceUrl?: string | null;
}) {
  const deadline = deepRead.submissionDeadline;
  const siteVisit = deepRead.siteVisit;
  const contact = deepRead.pointOfContact;
  const insurance = deepRead.insuranceRequirements;
  const insuranceRows = [
    ["General liability", insurance.generalLiability, deepRead.evidence?.insuranceRequirements.generalLiability],
    ["Workers' compensation", insurance.workersCompensation, deepRead.evidence?.insuranceRequirements.workersCompensation],
    ["Commercial auto", insurance.auto, deepRead.evidence?.insuranceRequirements.auto],
  ] as const;

  return (
    <details className="rounded-xl border border-primary/20 bg-primary/[0.03] overflow-hidden" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 hover:bg-primary/[0.04]">
        <div className="flex items-center gap-2">
          <FileSearch className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Full Requirements</span>
        </div>
        <span className="text-xs text-muted-foreground">AI deep read</span>
      </summary>

      <div className="border-t border-primary/10 px-4 py-4 space-y-5">
        <section className="space-y-2">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            Submission deadline
          </h4>
          <div className="pl-5 space-y-1">
            <DeepReadValue value={deadline.raw} evidence={deepRead.evidence?.submissionDeadline} officialSourceUrl={officialSourceUrl} />
            {!deadline.raw && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><span className="text-xs text-muted-foreground">Date</span><br /><DeepReadValue value={deadline.date} /></div>
                <div><span className="text-xs text-muted-foreground">Time</span><br /><DeepReadValue value={deadline.time} /></div>
                <div><span className="text-xs text-muted-foreground">Timezone</span><br /><DeepReadValue value={deadline.timezone} /></div>
              </div>
            )}
            {deadline.raw && (
              <p className="text-xs text-muted-foreground">
                {[deadline.date, deadline.time, deadline.timezone].filter(Boolean).join(" · ") || "Exact components not separately identified"}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <MapPin className="w-3.5 h-3.5" />
            Site visit
          </h4>
          <div className="pl-5 space-y-1">
            {siteVisit ? (
              <>
                <DeepReadValue value={[siteVisit.date, siteVisit.time, siteVisit.timezone].filter(Boolean).join(" · ") || null} />
                <DeepReadValue value={siteVisit.location} />
                <DeepReadEvidenceBlock evidence={deepRead.evidence?.siteVisit} officialSourceUrl={officialSourceUrl} />
              </>
            ) : <DeepReadValue value={null} evidence={deepRead.evidence?.siteVisit} officialSourceUrl={officialSourceUrl} />}
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5" />
            Insurance
          </h4>
          <div className="pl-5 space-y-2">
            {insuranceRows.map(([label, value, evidence]) => (
              <div key={label} className="grid grid-cols-[9rem_1fr] gap-2 items-start">
                <span className="text-xs text-muted-foreground">{label}</span>
                <DeepReadValue value={value} evidence={evidence} officialSourceUrl={officialSourceUrl} />
              </div>
            ))}
            {insurance.other.length > 0 && (
              <div className="pt-1"><DeepReadList items={insurance.other} evidence={deepRead.evidence?.insuranceRequirements.other} officialSourceUrl={officialSourceUrl} /></div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bonding</h4>
            <div className="pl-1 space-y-1">
              <p className={cn("text-sm font-medium", deepRead.bonding.required ? "text-orange-700 dark:text-orange-300" : "text-foreground")}>
                {deepRead.bonding.required ? "Required" : "Not identified"}
              </p>
              <DeepReadValue value={deepRead.bonding.amounts} />
              <DeepReadValue value={deepRead.bonding.details} />
              <DeepReadEvidenceBlock evidence={deepRead.evidence?.bonding} officialSourceUrl={officialSourceUrl} />
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prevailing wage</h4>
            <div className="pl-1 space-y-1">
              <p className={cn("text-sm font-medium", deepRead.prevailingWage.required ? "text-orange-700 dark:text-orange-300" : "text-foreground")}>
                {deepRead.prevailingWage.required ? "Required" : "Not identified"}
              </p>
              <DeepReadValue value={deepRead.prevailingWage.wageDeterminationNumber ? `Wage determination ${deepRead.prevailingWage.wageDeterminationNumber}` : null} />
              <DeepReadValue value={deepRead.prevailingWage.details} />
              <DeepReadEvidenceBlock evidence={deepRead.evidence?.prevailingWage} officialSourceUrl={officialSourceUrl} />
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Small-business subcontracting</h4>
          <div className="pl-1 space-y-1">
            <p className="text-sm font-medium text-foreground">
              {deepRead.smallBusinessSubcontracting.required ? "Required" : "Not identified"}
            </p>
            <DeepReadValue value={deepRead.smallBusinessSubcontracting.details} />
            <DeepReadEvidenceBlock evidence={deepRead.evidence?.smallBusinessSubcontracting} officialSourceUrl={officialSourceUrl} />
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evaluation criteria</h4>
          <DeepReadList items={deepRead.evaluationCriteria} evidence={deepRead.evidence?.evaluationCriteria} officialSourceUrl={officialSourceUrl} />
        </section>

        <section className="space-y-2">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            Point of contact
          </h4>
          {contact ? (
            <div className="pl-5 space-y-1">
              <DeepReadValue value={contact.name} />
              {contact.email && <a className="flex items-center gap-1.5 text-sm text-primary hover:underline" href={`mailto:${contact.email}`}><Mail className="w-3.5 h-3.5" />{contact.email}</a>}
              {contact.phone && <a className="flex items-center gap-1.5 text-sm text-primary hover:underline" href={`tel:${contact.phone}`}><Phone className="w-3.5 h-3.5" />{contact.phone}</a>}
              <DeepReadEvidenceBlock evidence={deepRead.evidence?.pointOfContact} officialSourceUrl={officialSourceUrl} />
            </div>
          ) : <div className="pl-5"><DeepReadValue value={null} evidence={deepRead.evidence?.pointOfContact} officialSourceUrl={officialSourceUrl} /></div>}
        </section>

        <section className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Award slots</h4>
          <DeepReadValue value={deepRead.awardSlots === null ? null : String(deepRead.awardSlots)} evidence={deepRead.evidence?.awardSlots} officialSourceUrl={officialSourceUrl} />
        </section>

        <section className="space-y-2 rounded-lg border border-red-200 bg-red-50/60 p-3 dark:border-red-900/60 dark:bg-red-950/20">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            Red flags
          </h4>
          <DeepReadList items={deepRead.redFlags} evidence={deepRead.evidence?.redFlags} officialSourceUrl={officialSourceUrl} />
        </section>
      </div>
    </details>
  );
}

// ── Official source UI ────────────────────────────────────────────────────────

const OFFICIAL_SOURCE_CONFIG: Record<Exclude<OfficialSourceStatus, "not_checked">, {
  icon: typeof BadgeCheck; iconColor: string; label: string; detail: string; bg: string;
}> = {
  found: {
    icon:      BadgeCheck,
    iconColor: "text-green-600 dark:text-green-400",
    label:     "Official government source",
    detail:    "A publicly accessible government posting was located.",
    bg:        "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800",
  },
  aggregator_only: {
    icon:      AlertTriangle,
    iconColor: "text-amber-500 dark:text-amber-400",
    label:     "Aggregator listing only",
    detail:    "This listing appears on a third-party bid board. Verify directly with the issuing agency before submitting a response.",
    bg:        "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",
  },
  subscription_required: {
    icon:      Lock,
    iconColor: "text-orange-500 dark:text-orange-400",
    label:     "Subscription required",
    detail:    "Full access to this listing requires a paid portal account. Search SAM.gov or the agency site for free access.",
    bg:        "bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800",
  },
};

export default function SummaryPanel({
  bid,
  summary,
  loading,
  error,
  onClose,
  onStageChange,
  onNotesSave,
  jobs,
  onJobChange,
  onRegenerate,
  regenerating,
  onDeepRead,
  deepReading,
}: {
  bid: BidOpportunity;
  summary: AiSummary | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onStageChange: (stage: BidStage) => void;
  onNotesSave: (notes: string) => void;
  jobs?: Array<{ id: number; title: string; status?: string | null }>;
  onJobChange?: (jobId: number | null) => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  onDeepRead?: (force?: boolean) => void;
  deepReading?: boolean;
}) {
  const [notes, setNotes] = useState(bid.notes ?? "");
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [jobSaving, setJobSaving] = useState(false);

  useEffect(() => {
    setNotes(bid.notes ?? "");
  }, [bid.id, bid.notes]);

  function handleNotesBlur() {
    const trimmed = notes.trim();
    const prev = (bid.notes ?? "").trim();
    if (trimmed !== prev) {
      onNotesSave(trimmed);
      setSavedIndicator(true);
      setTimeout(() => setSavedIndicator(false), 2000);
    }
  }

  async function handleJobChange(value: string) {
    if (!onJobChange) return;
    setJobSaving(true);
    try {
      onJobChange(value ? Number(value) : null);
    } finally {
      setJobSaving(false);
    }
  }

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
            <div className="flex items-center gap-2 mt-2.5">
              <span className="text-xs text-muted-foreground font-medium">Stage:</span>
              <div className="relative">
                <select
                  value={bid.stage}
                  onChange={(e) => onStageChange(e.target.value as BidStage)}
                  className="appearance-none pl-2.5 pr-7 py-1 text-xs font-medium rounded-lg border border-border bg-card text-foreground cursor-pointer hover:border-primary/50 transition-colors"
                >
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              </div>
            </div>
            {onJobChange && (
              <div className="flex items-center gap-2 mt-2">
                <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Job:</span>
                <select
                  value={bid.jobId ?? ""}
                  onChange={(e) => void handleJobChange(e.target.value)}
                  disabled={jobSaving}
                  className="min-w-0 flex-1 appearance-none px-2.5 py-1 text-xs rounded-lg border border-border bg-card text-foreground cursor-pointer disabled:opacity-50"
                  aria-label="Link this opportunity to a job"
                >
                  <option value="">No linked job</option>
                  {(jobs ?? []).map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title}{job.status ? ` · ${job.status}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {bid.url && onDeepRead && (
            <button
              onClick={() => onDeepRead(Boolean(summary?.deepRead))}
              disabled={deepReading || loading}
              title={summary?.deepRead ? "Read the solicitation again after an amendment" : "Extract the full solicitation requirements"}
              className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              <FileSearch className={cn("w-3.5 h-3.5", deepReading && "animate-pulse")} />
              {deepReading ? "Reading…" : summary?.deepRead ? "Re-read" : "Deep Read"}
            </button>
          )}
          {summary && !loading && onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={regenerating}
              title="Re-run the AI summary with fresh data"
              className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", regenerating && "animate-spin")} />
              {regenerating ? "Regenerating…" : "Regenerate"}
            </button>
          )}
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
              {/* ── Recommendation section ──────────────────────────────────────── */}
              {bid.recommendation && (() => {
                const rc = REC_HEADER_CONFIG[bid.recommendation];
                if (!rc) return null;
                const { icon: RIcon, className: rcCls, textColor, iconColor } = rc;
                const factors = (bid.recommendationFactors ?? []) as RecommendationFactor[];
                return (
                  <div className={cn("rounded-xl border p-4 space-y-3", rcCls)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <RIcon className={cn("w-5 h-5 flex-shrink-0", iconColor)} />
                        <span className={cn("font-bold text-base tracking-wide", textColor)}>{rc.label}</span>
                      </div>
                    </div>

                    {factors.length > 0 && (
                      <ul className="space-y-2.5 pt-1 border-t border-current/10">
                        {factors.map((f) => (
                          <FactorRow key={f.key} factor={f} />
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })()}

              {/* Fit verdict */}
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
                  </div>
                </div>
              )}

              {/* Set-aside type */}
              {summary.setAsideType && (() => {
                const config = SET_ASIDE_CONFIG[summary.setAsideType as SetAsideType];
                if (!config) return null;
                const Icon = config.icon;
                return (
                  <div className={cn("flex items-start gap-3 p-4 rounded-xl border", config.bg)}>
                    <Icon className={cn("w-5 h-5 flex-shrink-0 mt-0.5", config.color)} />
                    <div>
                      <p className={cn("font-semibold text-sm", config.color)}>
                        {config.label}
                      </p>
                      <p className="text-xs mt-0.5 text-muted-foreground">{config.detail}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Veteran preference — only show when setAsideType doesn't already convey it */}
              {summary.veteranPreference
                && !["sdvosb", "vosb", "veteran_preference"].includes(summary.setAsideType ?? "")
                && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-50 border border-violet-200 dark:bg-violet-900/20 dark:border-violet-800">
                  <Shield className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                  <p className="text-sm font-medium text-violet-700 dark:text-violet-400">
                    Veteran-owned preference mentioned
                  </p>
                </div>
              )}

              {/* Bonding required */}
              {summary.bondingRequired && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 border border-orange-200 dark:bg-orange-900/20 dark:border-orange-800">
                  <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                    Performance / payment bond required
                  </p>
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

              {summary.deepRead && (
                <DeepReadSection
                  deepRead={summary.deepRead}
                  officialSourceUrl={bid.officialSourceStatus === "found" ? bid.officialSourceUrl : null}
                />
              )}

              {/* ── Official source section ──────────────────────────────────── */}
              {bid.officialSourceStatus && bid.officialSourceStatus !== "not_checked" && (() => {
                const sc = OFFICIAL_SOURCE_CONFIG[bid.officialSourceStatus as Exclude<OfficialSourceStatus, "not_checked">];
                if (!sc) return null;
                const { icon: SIcon, iconColor, label, detail, bg } = sc;
                const viewUrl = bid.officialSourceUrl ?? bid.url;
                return (
                  <div className={cn("rounded-xl border p-4 space-y-2", bg)}>
                    <div className="flex items-center gap-2">
                      <SIcon className={cn("w-4 h-4 flex-shrink-0", iconColor)} />
                      <p className={cn("text-sm font-semibold", iconColor)}>{label}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{detail}</p>
                    {viewUrl && bid.officialSourceStatus === "found" && bid.officialSourceUrl && (
                      <a
                        href={bid.officialSourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline mt-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open Official Posting
                      </a>
                    )}
                  </div>
                );
              })()}

              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground/60">
                  AI summary — always verify against the original solicitation.
                </p>
              </div>
            </>
          )}

          {/* Notes section — always visible */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Your Notes</span>
              </div>
              {savedIndicator && (
                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              rows={4}
              placeholder="Site visit dates, go/no-go reasoning, team contacts, key requirements to address…"
              className="w-full resize-none rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors"
            />
            <p className="text-xs text-muted-foreground/50">Auto-saves when you click away.</p>
          </div>
        </div>

        {bid.url && (
          <div className="sticky bottom-0 bg-card border-t border-border px-5 py-3">
            <a
              href={bid.officialSourceUrl ?? bid.url}
              target="_blank"
              rel="noopener noreferrer"
              title={bid.officialSourceUrl ? "Opens verified official government posting" : undefined}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {bid.officialSourceUrl ? "Open Official Solicitation" : "View Original Solicitation"}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
