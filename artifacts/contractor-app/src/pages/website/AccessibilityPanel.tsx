/**
 * M14 – AI Accessibility Panel
 * Slide-in right-hand panel showing WCAG a11y findings grouped by category,
 * with Fix/Review action buttons that reach back into the editor.
 */
import { createPortal } from "react-dom";
import {
  X, CheckCircle, AlertCircle, AlertTriangle, Info,
  ChevronRight, RefreshCw, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  A11yCheckResult, A11yFinding, A11yCategory, A11ySeverity, A11yFixAction,
} from "./accessibilityChecker";

// ── Completion arc ────────────────────────────────────────────────────────────

const ARC_R = 44;
const ARC_STROKE = 8;
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_R;

function CompletionArc({ pct }: { pct: number }) {
  const fraction = Math.min(1, Math.max(0, pct / 100));
  const offset = ARC_CIRCUMFERENCE * (1 - fraction);
  const color = pct >= 85 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative w-24 h-24 flex-shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={ARC_R} fill="none"
          stroke="currentColor" strokeWidth={ARC_STROKE}
          className="text-muted/30" />
        <circle cx="50" cy="50" r={ARC_R} fill="none"
          stroke={color} strokeWidth={ARC_STROKE} strokeLinecap="round"
          strokeDasharray={ARC_CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.4s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black leading-none" style={{ color }}>{pct}%</span>
        <span className="text-[9px] text-muted-foreground mt-0.5 font-medium">A11y</span>
      </div>
    </div>
  );
}

// ── Severity icon ─────────────────────────────────────────────────────────────

function SeverityIcon({ severity }: { severity: A11ySeverity }) {
  if (severity === "error")   return <AlertCircle   className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />;
  if (severity === "warning") return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />;
  return                             <Info          className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />;
}

function SeverityBadge({ severity }: { severity: A11ySeverity }) {
  if (severity === "error")   return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">Error</span>;
  if (severity === "warning") return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">Warning</span>;
  return                             <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">Info</span>;
}

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<A11yCategory, { emoji: string; color: string }> = {
  Contrast:  { emoji: "🎨", color: "text-violet-600 dark:text-violet-400" },
  Images:    { emoji: "🖼️", color: "text-blue-600 dark:text-blue-400" },
  Headings:  { emoji: "📝", color: "text-emerald-600 dark:text-emerald-400" },
  Buttons:   { emoji: "🔘", color: "text-orange-600 dark:text-orange-400" },
  Forms:     { emoji: "📋", color: "text-pink-600 dark:text-pink-400" },
  Links:     { emoji: "🔗", color: "text-cyan-600 dark:text-cyan-400" },
};

// ── Finding card ──────────────────────────────────────────────────────────────

function FindingCard({
  finding,
  onAction,
}: {
  finding: A11yFinding;
  onAction: (action: A11yFixAction) => void;
}) {
  const hasAction = !!finding.fixAction;

  return (
    <div className={cn(
      "rounded-xl border p-3 flex gap-2.5",
      finding.severity === "error"
        ? "border-red-200/60 bg-red-50/40 dark:border-red-900/40 dark:bg-red-950/20"
        : finding.severity === "warning"
        ? "border-amber-200/60 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20"
        : "border-blue-200/40 bg-blue-50/30 dark:border-blue-900/30 dark:bg-blue-950/10",
    )}>
      <SeverityIcon severity={finding.severity} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className="text-xs font-semibold text-foreground">{finding.label}</span>
          <SeverityBadge severity={finding.severity} />
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug mb-2">
          {finding.description}
        </p>
        {hasAction && (
          <button
            type="button"
            onClick={() => onAction(finding.fixAction!)}
            className={cn(
              "flex items-center gap-1 text-[11px] font-semibold transition-colors",
              finding.fixable
                ? "text-primary hover:text-primary/80"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ChevronRight className="w-3 h-3" />
            {finding.fixButtonLabel ?? (finding.fixable ? "Fix it" : "Review")}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Category group ────────────────────────────────────────────────────────────

function CategoryGroup({
  category,
  findings,
  totalInCategory,
  onAction,
}: {
  category: A11yCategory;
  findings: A11yFinding[];
  totalInCategory: number;
  onAction: (action: A11yFixAction) => void;
}) {
  const cfg = CATEGORY_CONFIG[category];
  const passed = totalInCategory - findings.length;

  if (totalInCategory === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("text-xs font-semibold flex items-center gap-1.5", cfg.color)}>
          <span>{cfg.emoji}</span>
          {category}
        </span>
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-[10px] text-muted-foreground">
          {passed}/{totalInCategory} passed
        </span>
      </div>

      {findings.length > 0 ? (
        <div className="space-y-1.5">
          {findings.map(f => (
            <FindingCard key={f.id} finding={f} onAction={onAction} />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200/50 bg-emerald-50/30 dark:border-emerald-900/30 dark:bg-emerald-950/15">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
            All {category.toLowerCase()} checks pass
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export interface AccessibilityPanelProps {
  show: boolean;
  onClose: () => void;
  result: A11yCheckResult;
  onAction: (action: A11yFixAction) => void;
  onRefresh?: () => void;
}

const CATEGORY_ORDER: A11yCategory[] = ["Contrast", "Headings", "Buttons", "Images", "Forms", "Links"];

// The total checks per category (used to show pass/fail even when findings = 0)
const CHECKS_PER_CATEGORY: Record<A11yCategory, number> = {
  Contrast:  3,   // text-bg, brand-btn, muted-text
  Headings:  2,   // hero headline, services heading
  Buttons:   2,   // hero cta, cta section
  Images:    3,   // service images, gallery images, about photo
  Forms:     1,   // contact heading
  Links:     1,   // footer contact
};

export function AccessibilityPanel({
  show,
  onClose,
  result,
  onAction,
  onRefresh,
}: AccessibilityPanelProps) {
  if (!show) return null;

  const errorCount   = result.findings.filter(f => f.severity === "error").length;
  const warningCount = result.findings.filter(f => f.severity === "warning").length;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[400] bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 z-[401] w-full max-w-[440px] h-full bg-card border-l border-border shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Accessibility Checker"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border">
          <ShieldCheck className="w-4 h-4 text-violet-500 flex-shrink-0" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">Accessibility Check</h2>
            <p className="text-[11px] text-muted-foreground">
              {result.passedChecks} of {result.totalChecks} checks passed
            </p>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="Re-run checks"
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Summary bar */}
        <div className="flex-shrink-0 flex items-center gap-4 px-4 py-4 border-b border-border bg-muted/20">
          <CompletionArc pct={result.completionPct} />

          <div className="flex-1 space-y-2.5">
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">
                {result.findings.length === 0
                  ? "🎉 No issues found!"
                  : `${result.findings.length} issue${result.findings.length > 1 ? "s" : ""} to address`}
              </p>
              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${result.completionPct}%`,
                    backgroundColor: result.completionPct >= 85
                      ? "#22c55e"
                      : result.completionPct >= 60
                      ? "#f59e0b"
                      : "#ef4444",
                  }}
                />
              </div>
            </div>

            {/* Severity chips */}
            <div className="flex gap-2">
              {errorCount > 0 && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/40">
                  <AlertCircle className="w-2.5 h-2.5 text-red-500" />
                  <span className="text-[10px] font-semibold text-red-700 dark:text-red-400">
                    {errorCount} error{errorCount > 1 ? "s" : ""}
                  </span>
                </div>
              )}
              {warningCount > 0 && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40">
                  <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                    {warningCount} warning{warningCount > 1 ? "s" : ""}
                  </span>
                </div>
              )}
              {result.findings.length === 0 && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                  <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">All clear</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Findings list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {CATEGORY_ORDER.map(cat => {
            const catFindings = result.byCategory[cat] ?? [];
            const totalInCat = CHECKS_PER_CATEGORY[cat] ?? catFindings.length;
            return (
              <CategoryGroup
                key={cat}
                category={cat}
                findings={catFindings}
                totalInCategory={totalInCat}
                onAction={onAction}
              />
            );
          })}

          <p className="text-[10px] text-muted-foreground/60 text-center pb-2">
            Checks update automatically after each fix. Based on WCAG 2.1 AA guidelines.
          </p>
        </div>
      </div>
    </>,
    document.body,
  );
}
