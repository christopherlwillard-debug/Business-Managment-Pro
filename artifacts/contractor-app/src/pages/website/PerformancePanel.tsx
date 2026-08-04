/**
 * M15 – Performance Panel
 * Slide-in right-hand panel showing heuristic page speed findings grouped by
 * category, with an overall Fast/Moderate/Slow indicator and action buttons.
 */
import { createPortal } from "react-dom";
import {
  X, Zap, AlertCircle, AlertTriangle, Info,
  ChevronRight, RefreshCw, CheckCircle, Image as ImageIcon,
  Play, Type, LayoutTemplate, Layers, Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PerfCheckResult, PerfFinding, PerfCategory, PerfSeverity, PerfFixAction, PageSpeedRating,
} from "./performanceAnalyzer";

// ── Page Speed indicator ──────────────────────────────────────────────────────

const SPEED_CONFIG: Record<PageSpeedRating, { color: string; bg: string; label: string; emoji: string }> = {
  Fast:     { color: "#22c55e", bg: "bg-emerald-100 dark:bg-emerald-950/40", label: "text-emerald-700 dark:text-emerald-400", emoji: "🚀" },
  Moderate: { color: "#f59e0b", bg: "bg-amber-100 dark:bg-amber-950/40",     label: "text-amber-700 dark:text-amber-400",     emoji: "⚡" },
  Slow:     { color: "#ef4444", bg: "bg-red-100 dark:bg-red-950/40",         label: "text-red-700 dark:text-red-400",         emoji: "🐢" },
};

function SpeedBadge({ rating }: { rating: PageSpeedRating }) {
  const cfg = SPEED_CONFIG[rating];
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold",
      cfg.bg, cfg.label,
    )}>
      <span>{cfg.emoji}</span>
      {rating}
    </span>
  );
}

// ── Speed arc ─────────────────────────────────────────────────────────────────

const ARC_R = 40;
const ARC_STROKE = 7;
const ARC_CIRC = 2 * Math.PI * ARC_R;

function SpeedArc({ rating, passedChecks, totalChecks }: { rating: PageSpeedRating; passedChecks: number; totalChecks: number }) {
  const fraction = totalChecks > 0 ? passedChecks / totalChecks : 1;
  const cfg = SPEED_CONFIG[rating];
  return (
    <div className="relative w-20 h-20 flex-shrink-0">
      <svg viewBox="0 0 90 90" className="w-full h-full -rotate-90">
        <circle cx="45" cy="45" r={ARC_R} fill="none" stroke="currentColor" strokeWidth={ARC_STROKE} className="text-muted/30" />
        <circle cx="45" cy="45" r={ARC_R} fill="none" stroke={cfg.color} strokeWidth={ARC_STROKE} strokeLinecap="round"
          strokeDasharray={ARC_CIRC}
          strokeDashoffset={ARC_CIRC * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Zap className="w-5 h-5" style={{ color: cfg.color }} />
      </div>
    </div>
  );
}

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<PerfCategory, { icon: React.ReactNode; color: string; label: string }> = {
  Images:     { icon: <ImageIcon className="w-3.5 h-3.5" />,     color: "text-blue-600 dark:text-blue-400",   label: "Images" },
  Video:      { icon: <Play className="w-3.5 h-3.5" />,          color: "text-red-600 dark:text-red-400",     label: "Video & Maps" },
  Fonts:      { icon: <Type className="w-3.5 h-3.5" />,          color: "text-violet-600 dark:text-violet-400", label: "Fonts" },
  Sections:   { icon: <LayoutTemplate className="w-3.5 h-3.5" />, color: "text-orange-600 dark:text-orange-400", label: "Page Length" },
  Loading:    { icon: <Layers className="w-3.5 h-3.5" />,        color: "text-cyan-600 dark:text-cyan-400",   label: "Loading" },
  Animations: { icon: <Monitor className="w-3.5 h-3.5" />,       color: "text-pink-600 dark:text-pink-400",   label: "Animations" },
};

// ── Severity icon ─────────────────────────────────────────────────────────────

function SeverityIcon({ severity }: { severity: PerfSeverity }) {
  if (severity === "error")   return <AlertCircle   className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />;
  if (severity === "warning") return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />;
  return                             <Info          className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />;
}

function SeverityBadge({ severity }: { severity: PerfSeverity }) {
  if (severity === "error")   return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">High</span>;
  if (severity === "warning") return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">Medium</span>;
  return                             <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">Low</span>;
}

// ── Finding card ──────────────────────────────────────────────────────────────

function FindingCard({ finding, onAction }: { finding: PerfFinding; onAction: (a: PerfFixAction) => void }) {
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
        <p className="text-[11px] font-medium text-muted-foreground mb-0.5">{finding.current}</p>
        <p className="text-[11px] text-muted-foreground leading-snug mb-2">{finding.recommendation}</p>
        {finding.fixAction && (
          <button
            type="button"
            onClick={() => onAction(finding.fixAction!)}
            className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            <ChevronRight className="w-3 h-3" />
            {finding.fixButtonLabel ?? "Fix it"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Impact bar ────────────────────────────────────────────────────────────────

function ImpactBar({
  label, value, maxValue, color, icon
}: { label: string; value: number; maxValue: number; color: string; icon: React.ReactNode }) {
  const pct = maxValue > 0 ? Math.min(100, (value / maxValue) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className={cn("flex-shrink-0", color)}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-0.5">
          <span className="text-[11px] font-medium text-foreground">{label}</span>
          <span className="text-[11px] text-muted-foreground">{value}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: pct > 66 ? "#ef4444" : pct > 33 ? "#f59e0b" : "#22c55e" }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Category group ────────────────────────────────────────────────────────────

const CATEGORY_CHECKS: Record<PerfCategory, number> = {
  Images:     4,  // image-total, gallery, service-images, external-images
  Video:      2,  // hero-video, map-embed
  Fonts:      1,  // font-count
  Sections:   2,  // disabled, total
  Loading:    2,  // portfolio, before-after
  Animations: 0,  // future
};

function CategoryGroup({
  category,
  findings,
  onAction,
}: {
  category: PerfCategory;
  findings: PerfFinding[];
  onAction: (a: PerfFixAction) => void;
}) {
  const cfg = CATEGORY_CONFIG[category];
  const totalInCat = CATEGORY_CHECKS[category] ?? findings.length;
  const passed = totalInCat - findings.length;

  if (totalInCat === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("text-xs font-semibold flex items-center gap-1.5", cfg.color)}>
          {cfg.icon}
          {cfg.label}
        </span>
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-[10px] text-muted-foreground">
          {Math.max(0, passed)}/{totalInCat} checks passed
        </span>
      </div>

      {findings.length > 0 ? (
        <div className="space-y-1.5">
          {findings.map(f => <FindingCard key={f.id} finding={f} onAction={onAction} />)}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200/50 bg-emerald-50/30 dark:border-emerald-900/30 dark:bg-emerald-950/15">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
            No {cfg.label.toLowerCase()} issues found
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export interface PerformancePanelProps {
  show: boolean;
  onClose: () => void;
  result: PerfCheckResult;
  onAction: (action: PerfFixAction) => void;
  onRefresh?: () => void;
}

const CATEGORY_ORDER: PerfCategory[] = ["Images", "Video", "Fonts", "Sections", "Loading"];

export function PerformancePanel({ show, onClose, result, onAction, onRefresh }: PerformancePanelProps) {
  if (!show) return null;

  const errorCount   = result.findings.filter(f => f.severity === "error").length;
  const warningCount = result.findings.filter(f => f.severity === "warning").length;
  const speedCfg     = SPEED_CONFIG[result.pageSpeed];

  const imageKBStr = result.estimatedImageKB >= 1000
    ? `${(result.estimatedImageKB / 1000).toFixed(1)} MB`
    : `${result.estimatedImageKB} KB`;

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[400] bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 z-[401] w-full max-w-[440px] h-full bg-card border-l border-border shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Performance Analyzer"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border">
          <Zap className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">Performance Analyzer</h2>
            <p className="text-[11px] text-muted-foreground">{result.passedChecks} of {result.totalChecks} checks passed</p>
          </div>
          {onRefresh && (
            <button type="button" onClick={onRefresh} title="Re-run analysis"
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Summary */}
        <div className="flex-shrink-0 flex items-start gap-4 px-4 py-4 border-b border-border bg-muted/20">
          <SpeedArc rating={result.pageSpeed} passedChecks={result.passedChecks} totalChecks={result.totalChecks} />

          <div className="flex-1 space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-muted-foreground">Estimated Page Speed</span>
              </div>
              <SpeedBadge rating={result.pageSpeed} />
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground mb-0.5">Images detected</p>
                <p className="text-sm font-bold text-foreground">{result.estimatedImageCount}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground mb-0.5">Est. image weight</p>
                <p className="text-sm font-bold text-foreground">{imageKBStr}</p>
              </div>
            </div>

            {/* Severity chips */}
            {(errorCount > 0 || warningCount > 0) && (
              <div className="flex gap-2">
                {errorCount > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/40">
                    <AlertCircle className="w-2.5 h-2.5 text-red-500" />
                    <span className="text-[10px] font-semibold text-red-700 dark:text-red-400">{errorCount} high impact</span>
                  </div>
                )}
                {warningCount > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40">
                    <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                    <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">{warningCount} medium</span>
                  </div>
                )}
              </div>
            )}
            {result.findings.length === 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 w-fit">
                <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">All checks pass 🎉</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Image impact bar (when images are significant) */}
        {result.estimatedImageCount > 3 && (
          <div className="flex-shrink-0 px-4 py-3 border-b border-border/50 space-y-2 bg-muted/10">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Image Load Breakdown</p>
            <ImpactBar
              label="Total images"
              value={result.estimatedImageCount}
              maxValue={20}
              color="text-blue-500"
              icon={<ImageIcon className="w-3.5 h-3.5" />}
            />
            <ImpactBar
              label={`Est. weight (${imageKBStr})`}
              value={result.estimatedImageKB}
              maxValue={3000}
              color="text-orange-500"
              icon={<Layers className="w-3.5 h-3.5" />}
            />
          </div>
        )}

        {/* ── Findings list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {CATEGORY_ORDER.map(cat => (
            <CategoryGroup
              key={cat}
              category={cat}
              findings={result.byCategory[cat] ?? []}
              onAction={onAction}
            />
          ))}

          <p className="text-[10px] text-muted-foreground/60 text-center pb-2">
            Analysis updates automatically. Estimates are based on typical image sizes — actual load time depends on hosting and visitor connection.
          </p>
        </div>
      </div>
    </>,
    document.body,
  );
}
