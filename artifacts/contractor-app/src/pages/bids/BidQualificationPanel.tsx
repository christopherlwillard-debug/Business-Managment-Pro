/**
 * BidQualificationPanel
 * ─────────────────────
 * A Sheet-based side panel showing the AI-powered industrial maintenance
 * qualification analysis for a bid.
 *
 * Sections:
 *   1. Readiness verdict badge + 2-sentence summary
 *   2. Contract/payment structure explanation
 *   3. Requirements table (grouped by category)
 *   4. Crew readiness (one row per crew member)
 *   5. Equipment gap analysis
 *   6. Scope-fit note (if present)
 *   7. License verify callout (amber warning)
 *   8. How-to-pursue (private opportunities only)
 *   9. Refresh Analysis button
 */

import { useState, useEffect } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Loader2, CheckCircle2, AlertTriangle, XCircle, HelpCircle,
  Zap, Wrench, HardHat, Package, RefreshCw, AlertCircle,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  BidOpportunity, IndustrialQualSummary,
  QualRequirement, QualCrewMember, QualEquipmentItem,
  ReadinessVerdict, QualMeetStatus, QualRequirementTag,
} from "./types";

// ── Readiness verdict ──────────────────────────────────────────────────────────

const VERDICT_CONFIG: Record<ReadinessVerdict, {
  label: string; icon: typeof CheckCircle2; className: string; textColor: string;
}> = {
  ready:        { label: "Ready to Bid",   icon: CheckCircle2,  className: "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800",   textColor: "text-green-700 dark:text-green-300" },
  almost_ready: { label: "Almost Ready",   icon: AlertTriangle, className: "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",   textColor: "text-amber-700 dark:text-amber-300" },
  not_a_fit:    { label: "Not a Fit",      icon: XCircle,       className: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800",           textColor: "text-red-700 dark:text-red-300" },
  needs_review: { label: "Needs Review",   icon: HelpCircle,    className: "bg-slate-50 border-border dark:bg-slate-800/30 dark:border-border",         textColor: "text-slate-600 dark:text-slate-400" },
};

// ── Requirement tag ────────────────────────────────────────────────────────────

const TAG_CONFIG: Record<QualRequirementTag, { label: string; className: string }> = {
  REQUIRED:    { label: "Required",    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  RECOMMENDED: { label: "Recommended", className: "bg-slate-100 text-slate-600 dark:bg-slate-800/30 dark:text-slate-400" },
  UNKNOWN:     { label: "Unknown",     className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
};

// ── Meet status ────────────────────────────────────────────────────────────────

const MEET_CONFIG: Record<QualMeetStatus, { icon: typeof CheckCircle2; color: string; label: string }> = {
  yes:     { icon: CheckCircle2,  color: "text-green-600 dark:text-green-400",   label: "Meets" },
  no:      { icon: XCircle,       color: "text-red-600 dark:text-red-400",       label: "Gap" },
  verify:  { icon: AlertTriangle, color: "text-amber-500 dark:text-amber-400",   label: "Verify" },
  unknown: { icon: HelpCircle,    color: "text-muted-foreground",                label: "Unknown" },
};

// ── Equipment status ───────────────────────────────────────────────────────────

const EQUIP_CONFIG: Record<string, { label: string; color: string }> = {
  owned:              { label: "Owned",           color: "text-green-600 dark:text-green-400" },
  rental_recommended: { label: "Rental likely",   color: "text-amber-600 dark:text-amber-400" },
  must_acquire:       { label: "Must acquire",    color: "text-red-600 dark:text-red-400" },
  unknown:            { label: "Unknown",          color: "text-muted-foreground" },
};

// ── Loading skeleton ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="rounded-xl bg-muted border border-border p-4 space-y-2">
        <div className="h-4 bg-muted-foreground/10 rounded w-1/3" />
        <div className="h-3 bg-muted-foreground/10 rounded w-3/4" />
        <div className="h-3 bg-muted-foreground/10 rounded w-2/3" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 bg-muted-foreground/10 rounded w-1/4" />
          <div className="h-3 bg-muted-foreground/10 rounded w-full" />
          <div className="h-3 bg-muted-foreground/10 rounded w-5/6" />
        </div>
      ))}
    </div>
  );
}

// ── Collapsible section ────────────────────────────────────────────────────────

function CollapseSection({
  title, icon: Icon, defaultOpen = true, count, children,
}: {
  title: string; icon: typeof HardHat; defaultOpen?: boolean; count?: number; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {count !== undefined && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{count}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 py-3">{children}</div>}
    </div>
  );
}

// ── Requirements table ─────────────────────────────────────────────────────────

function RequirementsSection({ requirements }: { requirements: QualRequirement[] }) {
  if (requirements.length === 0) return <p className="text-sm text-muted-foreground">No specific requirements identified.</p>;

  // Group by category
  const grouped = new Map<string, QualRequirement[]>();
  for (const req of requirements) {
    const g = grouped.get(req.category);
    if (g) g.push(req); else grouped.set(req.category, [req]);
  }

  return (
    <div className="space-y-4">
      {[...grouped.entries()].map(([category, reqs]) => (
        <div key={category}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{category}</p>
          <div className="space-y-2">
            {reqs.map((req, i) => {
              const tagConf  = TAG_CONFIG[req.tag]   ?? TAG_CONFIG.UNKNOWN;
              const meetConf = MEET_CONFIG[req.companyMeets] ?? MEET_CONFIG.unknown;
              const MeetIcon = meetConf.icon;
              return (
                <div key={i} className="flex gap-2 items-start">
                  <MeetIcon className={cn("w-4 h-4 flex-shrink-0 mt-0.5", meetConf.color)} aria-label={meetConf.label} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-medium text-foreground">{req.name}</span>
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", tagConf.className)}>
                        {tagConf.label}
                      </span>
                    </div>
                    {req.meetDetail && (
                      <p className="text-xs text-muted-foreground leading-snug">{req.meetDetail}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground/50 italic pt-1">
        Verify items are informational — always confirm with the solicitation before bidding.
      </p>
    </div>
  );
}

// ── Crew readiness ─────────────────────────────────────────────────────────────

function CrewReadinessSection({ crew }: { crew: QualCrewMember[] }) {
  if (crew.length === 0) return (
    <p className="text-sm text-muted-foreground">
      No crew data loaded. Add crew members in{" "}
      <a href="/crew" className="text-primary hover:underline">Field Crew</a>{" "}
      to see readiness analysis here.
    </p>
  );
  return (
    <div className="space-y-4">
      {crew.map((member, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <HardHat className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">{member.memberName}</span>
            <span className="text-xs text-muted-foreground">{member.role}</span>
          </div>
          {member.relevantCerts.length > 0 && (
            <div className="ml-5.5 space-y-0.5">
              {member.relevantCerts.map((cert, j) => (
                <div key={j} className="flex items-start gap-1.5 text-xs text-green-700 dark:text-green-400">
                  <CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  {cert}
                </div>
              ))}
            </div>
          )}
          {member.gaps.length > 0 && (
            <div className="ml-5.5 space-y-0.5">
              {member.gaps.map((gap, j) => (
                <div key={j} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  {gap}
                </div>
              ))}
            </div>
          )}
          {member.relevantCerts.length === 0 && member.gaps.length === 0 && (
            <p className="ml-5.5 text-xs text-muted-foreground">No gaps or matching certs identified for this bid.</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Equipment section ──────────────────────────────────────────────────────────

function EquipmentSection({ equipment }: { equipment: QualEquipmentItem[] }) {
  if (equipment.length === 0) return (
    <p className="text-sm text-muted-foreground">No specific equipment requirements identified in this bid.</p>
  );
  return (
    <div className="space-y-2">
      {equipment.map((item, i) => {
        const conf = EQUIP_CONFIG[item.status] ?? EQUIP_CONFIG.unknown;
        return (
          <div key={i} className="flex items-start gap-2">
            <Package className={cn("w-3.5 h-3.5 flex-shrink-0 mt-0.5", conf.color)} />
            <div>
              <span className="text-sm font-medium text-foreground">{item.name}</span>
              <span className={cn("ml-2 text-xs font-medium", conf.color)}>{conf.label}</span>
              {item.ownedItemName && (
                <span className="ml-1 text-xs text-muted-foreground">({item.ownedItemName})</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Private opportunity how-to-pursue ─────────────────────────────────────────

function HowToPursueSection({ sourceType }: { sourceType: string | null | undefined }) {
  const PURSUIT_GUIDES: Record<string, { title: string; steps: string[] }> = {
    subcontract:         { title: "Getting a subcontract", steps: ["Identify the prime contractors winning work in your region via USASpending.gov.", "Find their subcontracting or supplier portal (often under \"suppliers\" on their website).", "Submit a capability statement emphasizing your industrial certs and safety record.", "Follow up with the small business liaison officer (SBLO) at the prime."] },
    direct_service:      { title: "Pursuing direct service", steps: ["Contact the maintenance manager or plant engineer directly — not procurement.", "Send a capability sheet (1-2 pages): crew certs, OSHA record, equipment, insurance limits, prior plant work.", "Offer a site visit to walk the scope before quoting.", "Request to be added to their approved contractor list (ACL)."] },
    prequalification:    { title: "Getting prequalified", steps: ["Register on the plant's prequalification platform (ISN, Avetta, PEC Safe — check which one they use).", "Upload: proof of insurance, OSHA 300 log, crew cert copies, written safety program.", "Allow 2–4 weeks for review.", "Once approved, you'll be invited to bid on as-needed work orders."] },
    on_call_list:        { title: "Getting on the on-call list", steps: ["Contact the plant's maintenance or reliability manager.", "Ask specifically: 'How do I get onto your approved contractor list for on-call mechanical/maintenance work?'", "Submit proof of insurance, crew certs, and safety metrics (EMR, TRIR).", "Be patient — lists are rarely updated more than once or twice a year."] },
    purchasing_portal:   { title: "Reaching them via purchasing portal", steps: ["Register as a supplier in the plant's purchasing system (Ariba, SAP Fieldglass, Coupa, iSupplier, or similar).", "List your NAICS codes (811310, 238190, 238290) and capabilities precisely.", "Watch for posted maintenance task orders matching your trade.", "Respond with a competitive T&M rate + crew qualifications."] },
  };

  const guide = PURSUIT_GUIDES[sourceType ?? ""] ?? PURSUIT_GUIDES["direct_service"];
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">{guide.title}</p>
      <ol className="space-y-2">
        {guide.steps.map((step, i) => (
          <li key={i} className="flex gap-3 items-start">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
              {i + 1}
            </span>
            <p className="text-sm text-foreground leading-snug">{step}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

interface Props {
  bid:         BidOpportunity;
  open:        boolean;
  onClose:     () => void;
  businessId:  number;
  apiBaseUrl:  string;
  initialQual?: IndustrialQualSummary | null;
  onGenerated?: (qual: IndustrialQualSummary) => void;
}

export default function BidQualificationPanel({
  bid, open, onClose, businessId, apiBaseUrl, initialQual, onGenerated,
}: Props) {
  const [qual, setQual]           = useState<IndustrialQualSummary | null>(initialQual ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Auto-generate when panel opens for the first time
  useEffect(() => {
    if (!open) return;
    const existing = initialQual ?? bid.industrialQualSummary;
    if (existing) { setQual(existing as IndustrialQualSummary); return; }
    generateAnalysis(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bid.id]);

  useEffect(() => {
    if (initialQual) setQual(initialQual);
  }, [initialQual]);

  async function generateAnalysis(force: boolean) {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/bids/${bid.id}/qualify`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body:    JSON.stringify({ businessId, force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Analysis failed");
      const q = (data as { qualification: IndustrialQualSummary }).qualification;
      setQual(q);
      if (!(data as { cached?: boolean }).cached) onGenerated?.(q);
    } catch (err) {
      setError((err as Error).message || "Failed to generate analysis");
    } finally {
      setIsGenerating(false);
    }
  }

  const isPrivate = bid.isPrivateOpportunity === true || bid.isPrivateOpportunity === "true";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0 gap-0 overflow-hidden">
        {/* ── Sticky header ── */}
        <SheetHeader className="flex-shrink-0 px-5 py-4 border-b bg-background">
          <div className="flex items-start gap-3 pr-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Wrench className="w-4 h-4 text-primary flex-shrink-0" />
                <SheetTitle className="text-base font-semibold">Qualify for this bid</SheetTitle>
                {isPrivate && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400 font-medium">Private</span>
                )}
              </div>
              <SheetDescription className="text-xs text-muted-foreground line-clamp-2 leading-snug">
                {bid.title}
              </SheetDescription>
              {bid.agency && <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{bid.agency}</p>}
            </div>
            {qual && !isGenerating && (() => {
              const vc = VERDICT_CONFIG[qual.readinessVerdict];
              if (!vc) return null;
              const VIcon = vc.icon;
              return (
                <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0", vc.className, vc.textColor)}>
                  <VIcon className="w-3.5 h-3.5" />
                  {vc.label}
                </span>
              );
            })()}
          </div>
        </SheetHeader>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Loading */}
          {isGenerating && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Analyzing qualification requirements…
              </div>
              <LoadingSkeleton />
            </div>
          )}

          {/* Error */}
          {error && !isGenerating && (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 space-y-2">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              <button onClick={() => generateAnalysis(false)} className="text-xs font-medium text-red-600 dark:text-red-400 underline">
                Try again
              </button>
            </div>
          )}

          {/* Content */}
          {qual && !isGenerating && (
            <>
              {/* 1 — Readiness verdict block */}
              {(() => {
                const vc = VERDICT_CONFIG[qual.readinessVerdict];
                if (!vc) return null;
                const VIcon = vc.icon;
                return (
                  <div className={cn("rounded-xl border p-4 space-y-2", vc.className)}>
                    <div className="flex items-center gap-2">
                      <VIcon className={cn("w-5 h-5 flex-shrink-0", vc.textColor)} />
                      <span className={cn("font-bold text-base", vc.textColor)}>{vc.label}</span>
                    </div>
                    <p className={cn("text-sm leading-relaxed", vc.textColor)}>{qual.readinessSummary}</p>
                    <p className="text-[10px] text-muted-foreground/60 pt-1">
                      This analysis is informational only — it does not replace your judgment. Review the full solicitation before deciding to bid.
                    </p>
                  </div>
                );
              })()}

              {/* 2 — Contract/payment structure */}
              {qual.contractStructure && qual.contractStructure !== "Unknown" && (
                <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-foreground">
                      Payment structure: {qual.contractStructure}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{qual.contractStructureExplanation}</p>
                </div>
              )}

              {/* 3 — License verify callout */}
              {qual.licenseVerifyItems.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">Verify state licensing requirements</span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    The following items require licensing verification before bidding. This tool never auto-declares license requirements met or unmet.
                  </p>
                  <ul className="space-y-1">
                    {qual.licenseVerifyItems.map((item, i) => (
                      <li key={i} className="text-xs text-amber-800 dark:text-amber-200 flex gap-1.5 items-start">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 4 — Scope fit note */}
              {qual.scopeFitNote && (
                <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 flex gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Scope size concern</p>
                    <p className="text-sm text-red-700 dark:text-red-300">{qual.scopeFitNote}</p>
                  </div>
                </div>
              )}

              {/* 5 — Requirements table */}
              <CollapseSection
                title="Requirements"
                icon={CheckCircle2}
                count={qual.requirements.length}
              >
                <RequirementsSection requirements={qual.requirements} />
              </CollapseSection>

              {/* 6 — Crew readiness */}
              <CollapseSection title="Crew Readiness" icon={HardHat} count={qual.crewReadiness.length}>
                <CrewReadinessSection crew={qual.crewReadiness} />
              </CollapseSection>

              {/* 7 — Equipment */}
              <CollapseSection
                title="Equipment Needed"
                icon={Package}
                count={qual.equipmentNeeded.length}
                defaultOpen={qual.equipmentNeeded.some((e) => e.status === "must_acquire")}
              >
                <EquipmentSection equipment={qual.equipmentNeeded} />
              </CollapseSection>

              {/* 8 — How to pursue (private opportunities) */}
              {isPrivate && (
                <CollapseSection title="How to Pursue" icon={Zap} defaultOpen>
                  <HowToPursueSection sourceType={bid.privateSourceType} />
                </CollapseSection>
              )}

              {/* 9 — Refresh button */}
              <div className="pt-1 border-t border-border/50">
                <button
                  onClick={() => generateAnalysis(true)}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh analysis
                </button>
                <p className="text-[10px] text-muted-foreground/50 mt-1">
                  Analysis uses crew certifications and equipment inventory at time of generation. Always verify requirements with the solicitation.
                </p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
