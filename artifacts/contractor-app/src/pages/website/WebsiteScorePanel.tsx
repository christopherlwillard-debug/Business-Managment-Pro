/**
 * M13 – AI Homepage Score Panel
 * Slide-in panel (right-hand side) showing the 0–100 website score with
 * per-rule breakdowns, severity badges, and "Fix it" action buttons.
 */
import { createPortal } from "react-dom";
import { X, CheckCircle, AlertCircle, Info, ChevronRight, RefreshCw, TrendingUp, Target, Shield, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WebsiteScoreResult, ScoreRule, RuleCategory, ScoreFixAction, RuleSeverity } from "./websiteScorer";

// ── Score ring ────────────────────────────────────────────────────────────────

const RING_R = 52;
const RING_STROKE = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

function ScoreRing({ score }: { score: number }) {
  const fraction = Math.min(1, Math.max(0, score / 100));
  const offset = RING_CIRCUMFERENCE * (1 - fraction);

  const color =
    score >= 80 ? "#22c55e" :
    score >= 55 ? "#f59e0b" :
    "#ef4444";

  const grade =
    score >= 80 ? "A" :
    score >= 65 ? "B" :
    score >= 50 ? "C" :
    "D";

  const label =
    score >= 80 ? "Great" :
    score >= 65 ? "Good" :
    score >= 50 ? "Fair" :
    "Needs work";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 130 130" className="w-full h-full -rotate-90">
          {/* Track */}
          <circle
            cx="65" cy="65" r={RING_R}
            fill="none"
            stroke="currentColor"
            strokeWidth={RING_STROKE}
            className="text-muted/30"
          />
          {/* Progress */}
          <circle
            cx="65" cy="65" r={RING_R}
            fill="none"
            stroke={color}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
          />
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black leading-none" style={{ color }}>{score}</span>
          <span className="text-[11px] text-muted-foreground font-medium mt-0.5">/ 100</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold" style={{ color }}>{grade}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

// ── Severity badge ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: RuleSeverity }) {
  if (severity === "critical") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
        <AlertCircle className="w-2.5 h-2.5" />
        Critical
      </span>
    );
  }
  if (severity === "recommended") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
        <Info className="w-2.5 h-2.5" />
        Suggested
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
      <Info className="w-2.5 h-2.5" />
      Optional
    </span>
  );
}

// ── Category icon ─────────────────────────────────────────────────────────────

function CategoryIcon({ cat }: { cat: RuleCategory }) {
  const cls = "w-3.5 h-3.5";
  if (cat === "Conversion") return <Target className={cls} />;
  if (cat === "Trust")      return <Shield className={cls} />;
  if (cat === "Content")    return <TrendingUp className={cls} />;
  return <Palette className={cls} />;
}

// ── Rule card ─────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  onFix,
}: {
  rule: ScoreRule;
  onFix: (action: ScoreFixAction) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex gap-2.5 transition-colors",
        rule.passed
          ? "border-emerald-200/60 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-border bg-card",
      )}
    >
      {/* Status icon */}
      <div className="flex-shrink-0 mt-0.5">
        {rule.passed ? (
          <CheckCircle className="w-4 h-4 text-emerald-500" />
        ) : (
          <div
            className={cn(
              "w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5",
              rule.severity === "critical"
                ? "border-red-400"
                : rule.severity === "recommended"
                ? "border-amber-400"
                : "border-muted-foreground/30",
            )}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className={cn(
            "text-xs font-semibold leading-tight",
            rule.passed ? "text-foreground" : "text-foreground",
          )}>
            {rule.label}
          </span>
          {!rule.passed && <SeverityBadge severity={rule.severity} />}
          <span className="ml-auto text-[10px] text-muted-foreground font-medium flex-shrink-0">
            {rule.passed ? `+${rule.points}` : `0/${rule.points}`} pts
          </span>
        </div>

        {!rule.passed && (
          <>
            <p className="text-[11px] text-muted-foreground leading-snug mb-2">
              {rule.description}
            </p>
            {rule.fixAction && (
              <button
                type="button"
                onClick={() => onFix(rule.fixAction!)}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <ChevronRight className="w-3 h-3" />
                {rule.fixHint}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Category group ────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<RuleCategory, string> = {
  Conversion: "text-blue-600 dark:text-blue-400",
  Trust:      "text-violet-600 dark:text-violet-400",
  Content:    "text-emerald-600 dark:text-emerald-400",
  Design:     "text-orange-600 dark:text-orange-400",
};

function CategoryGroup({
  category,
  earned,
  max,
  rules,
  onFix,
}: {
  category: RuleCategory;
  earned: number;
  max: number;
  rules: ScoreRule[];
  onFix: (action: ScoreFixAction) => void;
}) {
  const pct = max > 0 ? (earned / max) * 100 : 0;

  return (
    <div>
      {/* Category header */}
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("flex items-center gap-1.5 text-xs font-semibold", CATEGORY_COLORS[category])}>
          <CategoryIcon cat={category} />
          {category}
        </span>
        <div className="flex-1 h-1 rounded-full bg-muted/50 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              backgroundColor: pct >= 80 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444",
            }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground font-medium flex-shrink-0">
          {earned}/{max}
        </span>
      </div>

      {/* Rules */}
      <div className="flex flex-col gap-1.5">
        {rules.map(rule => (
          <RuleCard key={rule.id} rule={rule} onFix={onFix} />
        ))}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface WebsiteScorePanelProps {
  show: boolean;
  onClose: () => void;
  result: WebsiteScoreResult;
  onFixAction: (action: ScoreFixAction) => void;
  onRefresh?: () => void;
}

const CATEGORY_ORDER: RuleCategory[] = ["Conversion", "Trust", "Content", "Design"];

export function WebsiteScorePanel({
  show,
  onClose,
  result,
  onFixAction,
  onRefresh,
}: WebsiteScorePanelProps) {
  if (!show) return null;

  const failingCritical = result.rules.filter(r => !r.passed && r.severity === "critical").length;

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
        aria-label="Website Score"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">Website Score</h2>
            <p className="text-[11px] text-muted-foreground">
              {result.passedCount} of {result.totalCount} checks passed
            </p>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="Recalculate score"
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Score ring + summary */}
        <div className="flex-shrink-0 flex flex-col items-center gap-3 px-5 py-5 border-b border-border bg-muted/20">
          <ScoreRing score={result.score} />

          {/* Quick-summary chips */}
          <div className="flex flex-wrap justify-center gap-2">
            {CATEGORY_ORDER.map(cat => {
              const { earned, max } = result.byCategory[cat];
              const pct = max > 0 ? Math.round((earned / max) * 100) : 0;
              return (
                <div
                  key={cat}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-card text-xs"
                >
                  <span className={cn("font-medium", CATEGORY_COLORS[cat])}>
                    <CategoryIcon cat={cat} />
                  </span>
                  <span className="text-foreground font-medium">{cat}</span>
                  <span className={cn(
                    "font-bold",
                    pct >= 80 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-red-500",
                  )}>{pct}%</span>
                </div>
              );
            })}
          </div>

          {failingCritical > 0 && (
            <div className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              <p className="text-[11px] text-red-700 dark:text-red-400">
                <span className="font-semibold">{failingCritical} critical issue{failingCritical > 1 ? "s" : ""}</span>{" "}
                are hurting your conversion rate. Fix these first.
              </p>
            </div>
          )}
        </div>

        {/* ── Rule list (scrollable) */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {CATEGORY_ORDER.map(cat => {
            const group = result.byCategory[cat];
            if (!group) return null;
            return (
              <CategoryGroup
                key={cat}
                category={cat}
                earned={group.earned}
                max={group.max}
                rules={group.rules}
                onFix={onFixAction}
              />
            );
          })}

          {/* Footer hint */}
          <p className="text-[10px] text-muted-foreground/60 text-center pb-2">
            Score updates automatically each time you fix an issue.
          </p>
        </div>
      </div>
    </>,
    document.body,
  );
}
