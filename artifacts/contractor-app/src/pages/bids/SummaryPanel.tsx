import { useState, useEffect } from "react";
import {
  Sparkles, X, RefreshCw, XCircle, CheckCircle2,
  Briefcase, DollarSign, ShieldCheck, Calendar, ExternalLink,
  Shield, Users, Globe, Award, AlertTriangle, ChevronDown,
  StickyNote, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiSummary, BidOpportunity, BidStage, SetAsideType } from "./types";
import { PIPELINE_STAGES } from "./types";

const SET_ASIDE_CONFIG: Record<SetAsideType, { label: string; icon: typeof Shield; color: string; bg: string }> = {
  sdvosb: {
    label: "SDVOSB Set-Aside",
    icon: Shield,
    color: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800",
  },
  small_business: {
    label: "Small Business Set-Aside",
    icon: Users,
    color: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",
  },
  open: {
    label: "Open Competition",
    icon: Globe,
    color: "text-muted-foreground",
    bg: "bg-muted/40 border-border",
  },
  other: {
    label: "Veteran Preference",
    icon: Award,
    color: "text-purple-700 dark:text-purple-300",
    bg: "bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800",
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
}: {
  bid: BidOpportunity;
  summary: AiSummary | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onStageChange: (stage: BidStage) => void;
  onNotesSave: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(bid.notes ?? "");
  const [savedIndicator, setSavedIndicator] = useState(false);

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
                const config = SET_ASIDE_CONFIG[summary.setAsideType];
                const Icon = config.icon;
                return (
                  <div className={cn("flex items-start gap-3 p-4 rounded-xl border", config.bg)}>
                    <Icon className={cn("w-5 h-5 flex-shrink-0 mt-0.5", config.color)} />
                    <div>
                      <p className={cn("font-semibold text-sm", config.color)}>
                        {config.label}
                      </p>
                      {summary.setAsideType === "sdvosb" && (
                        <p className="text-xs mt-0.5 text-muted-foreground">
                          Your SDVOSB certification makes you eligible for this set-aside.
                        </p>
                      )}
                      {summary.setAsideType === "small_business" && (
                        <p className="text-xs mt-0.5 text-muted-foreground">
                          Reserved for small businesses — your size status applies.
                        </p>
                      )}
                      {summary.setAsideType === "open" && (
                        <p className="text-xs mt-0.5 text-muted-foreground">
                          Open to all — no set-aside restriction.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Veteran preference (only when not already sdvosb set-aside) */}
              {summary.veteranPreference && summary.setAsideType !== "sdvosb" && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                  <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
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
