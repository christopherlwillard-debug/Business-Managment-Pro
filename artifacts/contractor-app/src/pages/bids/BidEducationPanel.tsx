/**
 * BidEducationPanel
 * ─────────────────
 * A Sheet-based side panel that explains a government bid opportunity in plain
 * English for a contractor who is new to government contracting.
 *
 * Sections:
 *   1. Next step (most prominent)
 *   2. What the government is buying
 *   3. Fit analysis — "Why this fits" / "Why you may want to pass"
 *   4. Requirements at a glance (color-coded)
 *   5. How to respond (step-by-step)
 *   6. Questions to ask the contracting officer
 *   7. Procurement terms detected in this bid
 */

import { useState, useEffect } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Loader2, BookOpen, ArrowRight, CheckCircle2, AlertTriangle, XCircle,
  HelpCircle, ClipboardList, MessagesSquare, Library, RefreshCw, Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BidOpportunity, EducationSummary, CapabilityVerdict } from "./types";

// ── Capability verdict ────────────────────────────────────────────────────────

const VERDICT_CONFIG: Record<CapabilityVerdict, { label: string; className: string; dot: string }> = {
  good_fit:       { label: "Good Fit",       className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",   dot: "bg-green-500" },
  possible_fit:   { label: "Possible Fit",   className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",   dot: "bg-amber-400" },
  need_more_info: { label: "Need Info",      className: "bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-300",   dot: "bg-slate-400" },
  likely_not_fit: { label: "Likely Not Fit", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300", dot: "bg-orange-400" },
};

function VerdictChip({ verdict }: { verdict: CapabilityVerdict }) {
  const cfg = VERDICT_CONFIG[verdict] ?? VERDICT_CONFIG.need_more_info;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0", cfg.className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

// ── Requirements ─────────────────────────────────────────────────────────────

const ACTION_CONFIG = {
  must_have:           { label: "Must Have",  className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  verify:              { label: "Verify",     className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  nice_to_have:        { label: "Nice to Have", className: "bg-slate-100 text-slate-500 dark:bg-slate-800/30 dark:text-slate-400" },
  likely_disqualifier: { label: "⚠ Verify First", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

// ── Section wrappers ──────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  className,
  children,
}: {
  icon: typeof BookOpen;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 space-y-2">
        <div className="h-3 bg-muted rounded w-24" />
        <div className="h-4 bg-muted rounded w-3/4" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 bg-muted rounded w-32" />
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-5/6" />
        </div>
      ))}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  bid:          BidOpportunity;
  open:         boolean;
  onClose:      () => void;
  businessId:   number;
  apiBaseUrl:   string;
  /** Education data pre-loaded from bid record or parent cache (may be null) */
  initialEducation?: EducationSummary | null;
  /** Called once when education is freshly generated, so parent can cache it */
  onGenerated?: (education: EducationSummary) => void;
}

export default function BidEducationPanel({
  bid,
  open,
  onClose,
  businessId,
  apiBaseUrl,
  initialEducation,
  onGenerated,
}: Props) {
  const [education, setEducation] = useState<EducationSummary | null>(initialEducation ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the panel opens for a new bid, auto-generate if not yet available
  useEffect(() => {
    if (!open) return;
    const edu = initialEducation ?? bid.educationSummary;
    if (edu) {
      setEducation(edu as EducationSummary);
      return;
    }
    generateEducation(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bid.id]);

  // Also update if initialEducation changes externally (from cache)
  useEffect(() => {
    if (initialEducation) setEducation(initialEducation);
  }, [initialEducation]);

  async function generateEducation(force: boolean) {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/bids/${bid.id}/educate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ businessId, force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      const edu = data.education as EducationSummary;
      setEducation(edu);
      if (!data.cached) onGenerated?.(edu);
    } catch (err) {
      setError((err as Error).message || "Failed to generate analysis");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col p-0 gap-0 overflow-hidden"
      >
        {/* ── Sticky header ── */}
        <SheetHeader className="flex-shrink-0 px-5 py-4 border-b bg-background">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="w-4 h-4 text-primary flex-shrink-0" />
                <SheetTitle className="text-base font-semibold">Understanding this bid</SheetTitle>
              </div>
              <SheetDescription className="text-xs text-muted-foreground line-clamp-2 leading-snug">
                {bid.title}
              </SheetDescription>
              {bid.agency && (
                <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{bid.agency}</p>
              )}
            </div>
            {education && (
              <VerdictChip verdict={education.capabilityVerdict as CapabilityVerdict} />
            )}
          </div>
        </SheetHeader>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Loading state */}
          {isGenerating && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Analyzing this bid for you…
              </div>
              <LoadingSkeleton />
            </div>
          )}

          {/* Error state */}
          {error && !isGenerating && (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 space-y-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              <button
                onClick={() => generateEducation(false)}
                className="text-xs font-medium text-red-600 dark:text-red-400 underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* Education content */}
          {education && !isGenerating && (
            <>
              {/* 1 ── Next Step — most prominent ── */}
              {education.nextStep && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex gap-3">
                  <Lightbulb className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-primary mb-0.5 uppercase tracking-wide">Next step</p>
                    <p className="text-sm text-foreground leading-snug">{education.nextStep}</p>
                  </div>
                </div>
              )}

              {/* 2 ── What the gov is buying ── */}
              <Section icon={ClipboardList} title="What the government is buying">
                <p className="text-sm text-foreground leading-relaxed">{education.whatTheGovIsBuying}</p>
                {education.noticeTypeContext && (
                  <div className="rounded-lg bg-muted/50 border border-border px-3 py-2.5 mt-1">
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">What this notice type means for you</p>
                    <p className="text-sm text-foreground leading-snug">{education.noticeTypeContext}</p>
                  </div>
                )}
              </Section>

              {/* 3 ── Fit analysis ── */}
              {(education.whyItFits.length > 0 || education.whyYouMayPass.length > 0) && (
                <Section icon={HelpCircle} title="Fit analysis">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Why it fits */}
                    {education.whyItFits.length > 0 && (
                      <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-3 space-y-2">
                        <p className="text-xs font-semibold text-green-700 dark:text-green-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Why this fits
                        </p>
                        <ul className="space-y-1.5">
                          {education.whyItFits.map((reason, i) => (
                            <li key={i} className="text-xs text-green-800 dark:text-green-200 leading-snug flex gap-1.5">
                              <ArrowRight className="w-3 h-3 flex-shrink-0 mt-0.5 text-green-500" />
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Why you may pass */}
                    {education.whyYouMayPass.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 space-y-2">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Things to check first
                        </p>
                        <ul className="space-y-1.5">
                          {education.whyYouMayPass.map((concern, i) => (
                            <li key={i} className="text-xs text-amber-800 dark:text-amber-200 leading-snug flex gap-1.5">
                              <ArrowRight className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-500" />
                              {concern}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* 4 ── Requirements at a glance ── */}
              {education.requirements.length > 0 && (
                <Section icon={ClipboardList} title="Requirements at a glance">
                  <div className="space-y-2">
                    {education.requirements.map((req, i) => {
                      const cfg = ACTION_CONFIG[req.action as keyof typeof ACTION_CONFIG] ?? ACTION_CONFIG.verify;
                      return (
                        <div key={i} className="flex gap-2.5 items-start">
                          <span className={cn(
                            "flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap mt-0.5",
                            cfg.className
                          )}>
                            {cfg.label}
                          </span>
                          <div>
                            <p className="text-xs font-medium text-foreground">{req.item}</p>
                            <p className="text-xs text-muted-foreground leading-snug">{req.plain}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 italic mt-1">
                    "Verify" items are not confirmed disqualifiers — check before deciding.
                  </p>
                </Section>
              )}

              {/* 5 ── How to respond ── */}
              {education.howToRespond.length > 0 && (
                <Section icon={ClipboardList} title="How to respond">
                  <ol className="space-y-2">
                    {education.howToRespond.map((step, i) => (
                      <li key={i} className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-sm text-foreground leading-snug">{step}</p>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {/* 6 ── Questions for the CO ── */}
              {education.questionsForCO.length > 0 && (
                <Section icon={MessagesSquare} title="Questions to ask the contracting officer">
                  <p className="text-xs text-muted-foreground">
                    If the solicitation lists a point of contact, you can email these questions before submitting.
                  </p>
                  <ul className="space-y-2 mt-1">
                    {education.questionsForCO.map((q, i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <HelpCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-primary/60" />
                        <p className="text-sm text-foreground leading-snug">{q}</p>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* 7 ── Detected terms ── */}
              {education.detectedTerms.length > 0 && (
                <Section icon={Library} title="Procurement terms in this bid">
                  <p className="text-xs text-muted-foreground">
                    These terms appeared in the bid. Here's what they mean.
                  </p>
                  <Accordion type="multiple" className="space-y-1 mt-1">
                    {education.detectedTerms.map((t, i) => (
                      <AccordionItem
                        key={i}
                        value={`term-${i}`}
                        className="border border-border rounded-lg px-3 overflow-hidden"
                      >
                        <AccordionTrigger className="py-2 text-sm font-medium text-foreground hover:no-underline">
                          {t.term}
                        </AccordionTrigger>
                        <AccordionContent className="pb-2.5 text-sm text-muted-foreground leading-relaxed">
                          {t.plain}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </Section>
              )}

              {/* 8 ── Regenerate ── */}
              <div className="pt-1 border-t border-border/50">
                <button
                  onClick={() => generateEducation(true)}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Regenerate analysis
                </button>
                <p className="text-[10px] text-muted-foreground/50 mt-1">
                  This is educational guidance, not legal advice. Verify requirements with the contracting officer before bidding.
                </p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
