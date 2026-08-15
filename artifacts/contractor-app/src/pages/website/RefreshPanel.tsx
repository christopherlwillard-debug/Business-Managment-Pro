/**
 * RefreshPanel.tsx — M18: AI Website Refresh
 *
 * Slide-in right-hand panel that:
 *  1. Calls POST /api/website/refresh-analysis to scan the current site
 *  2. Displays suggestions grouped by category with Accept / Skip per card
 *  3. "Apply N changes" CTA sends accepted suggestions back to WebsiteEditor
 *  4. Stores/displays lastRefreshedAt date
 *
 * Props:
 *   show            — controls visibility
 *   onClose         — dismiss handler
 *   businessId      — active business numeric ID
 *   sections        — current home-page sections (snapshot at open time)
 *   settings        — current site settings (snapshot at open time)
 *   businessContext — optional AI context object
 *   lastRefreshedAt — ISO string or null; shown in panel header
 *   onApply         — called with accepted suggestions + new timestamp
 */

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X, RefreshCw, Sparkles, Loader2, CheckCircle2, SkipForward,
  ChevronRight, AlertCircle, Clock, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RefreshSuggestion, RefreshCategory, BusinessContext, SiteSettings } from "./website-types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Skipped-suggestion persistence ───────────────────────────────────────────
// Fingerprint = "category::label" — stable across re-runs unlike AI-generated IDs.

function skippedKey(businessId: number) { return `refresh-skipped-${businessId}`; }

function loadSkippedFingerprints(businessId: number): Set<string> {
  try {
    const raw = localStorage.getItem(skippedKey(businessId));
    const arr = raw ? JSON.parse(raw) as string[] : [];
    return new Set(arr);
  } catch { return new Set(); }
}

function saveSkippedFingerprints(businessId: number, fps: Set<string>) {
  try { localStorage.setItem(skippedKey(businessId), JSON.stringify([...fps])); } catch { /* ignore */ }
}

function fingerprint(sug: RefreshSuggestion): string {
  return `${sug.category}::${sug.label.toLowerCase().trim()}`;
}

// ── Category metadata ─────────────────────────────────────────────────────────

const CAT_CONFIG: Record<RefreshCategory, { label: string; color: string; bg: string; emoji: string }> = {
  "Hero":             { label: "Hero",            color: "text-indigo-700 dark:text-indigo-300", bg: "bg-indigo-100 dark:bg-indigo-950/50", emoji: "🎯" },
  "Copy":             { label: "Copy",             color: "text-violet-700 dark:text-violet-300", bg: "bg-violet-100 dark:bg-violet-950/50", emoji: "✍️" },
  "Layout":           { label: "Layout",           color: "text-blue-700 dark:text-blue-300",     bg: "bg-blue-100 dark:bg-blue-950/50",     emoji: "🗂️" },
  "SEO":              { label: "SEO",              color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-950/50", emoji: "🔍" },
  "Services":         { label: "Services",         color: "text-amber-700 dark:text-amber-300",   bg: "bg-amber-100 dark:bg-amber-950/50",   emoji: "🔧" },
  "Trust":            { label: "Trust",            color: "text-rose-700 dark:text-rose-300",     bg: "bg-rose-100 dark:bg-rose-950/50",     emoji: "⭐" },
  "Missing Section":  { label: "Missing",          color: "text-cyan-700 dark:text-cyan-300",     bg: "bg-cyan-100 dark:bg-cyan-950/50",     emoji: "➕" },
};

const PRIORITY_DOT: Record<string, string> = {
  high:   "bg-red-500",
  medium: "bg-amber-400",
  low:    "bg-sky-400",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Section {
  id: string;
  type: string;
  enabled: boolean;
  content: Record<string, unknown>;
}

interface Props {
  show: boolean;
  onClose: () => void;
  businessId: number;
  sections: Section[];
  settings: SiteSettings;
  businessContext?: BusinessContext;
  lastRefreshedAt?: string | null;
  onApply: (suggestions: RefreshSuggestion[], newTimestamp: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RefreshPanel({
  show,
  onClose,
  businessId,
  sections,
  settings,
  businessContext,
  lastRefreshedAt,
  onApply,
}: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [suggestions, setSuggestions] = useState<RefreshSuggestion[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState("");
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);
  const runRef = useRef(false);

  // Auto-analyze when panel opens (once per mount)
  useEffect(() => {
    if (!show || runRef.current) return;
    runRef.current = true;
    analyze();
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  async function analyze() {
    setStatus("loading");
    setAccepted(new Set());
    setSkipped(new Set());
    setSuggestions([]);
    setErrorMsg("");

    try {
      // Build a compact section summary for the API
      const sectionSummary = sections
        .filter(s => s.enabled && s.type !== "header" && s.type !== "footer")
        .map(s => ({
          id: s.id,
          type: s.type,
          headline: (s.content.headline as string | undefined)
            || (s.content.heading as string | undefined)
            || null,
          itemCount: Array.isArray(s.content.items) ? s.content.items.length
            : Array.isArray(s.content.testimonials) ? s.content.testimonials.length
            : Array.isArray(s.content.stats) ? s.content.stats.length
            : null,
        }));

      const res = await fetch(
        `${BASE}/api/website/refresh-analysis?businessId=${businessId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            sectionSummary,
            settings: {
              brandColor: settings.brandColor,
              themeId: settings.themeId,
              fontFamily: settings.fontFamily,
              logoUrl: settings.logoUrl,
            },
            businessContext: businessContext ?? null,
            lastRefreshedAt: lastRefreshedAt ?? null,
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((err as any).error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { suggestions: RefreshSuggestion[]; analyzedAt: string };
      const sugs = data.suggestions ?? [];
      setSuggestions(sugs);
      // Pre-mark any suggestions whose fingerprint was previously skipped
      const storedFps = loadSkippedFingerprints(businessId);
      if (storedFps.size > 0) {
        const preSkipped = new Set(sugs.filter(s => storedFps.has(fingerprint(s))).map(s => s.id));
        if (preSkipped.size > 0) setSkipped(preSkipped);
      }
      setAnalyzedAt(data.analyzedAt ?? new Date().toISOString());
      setStatus("done");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Analysis failed.");
      setStatus("error");
    }
  }

  function reAnalyze() {
    runRef.current = false;
    analyze();
  }

  function toggleAccept(id: string) {
    setAccepted(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      next.add(id);
      setSkipped(sk => { const s = new Set(sk); s.delete(id); return s; });
      return next;
    });
  }

  function toggleSkip(id: string) {
    setSkipped(prev => {
      const next = new Set(prev);
      const sug = suggestions.find(s => s.id === id);
      if (next.has(id)) {
        next.delete(id);
        // Remove from persisted fingerprints
        if (sug) {
          const fps = loadSkippedFingerprints(businessId);
          fps.delete(fingerprint(sug));
          saveSkippedFingerprints(businessId, fps);
        }
        return next;
      }
      next.add(id);
      // Persist fingerprint so future runs pre-skip this suggestion type
      if (sug) {
        const fps = loadSkippedFingerprints(businessId);
        fps.add(fingerprint(sug));
        saveSkippedFingerprints(businessId, fps);
      }
      setAccepted(ac => { const a = new Set(ac); a.delete(id); return a; });
      return next;
    });
  }

  function applyAccepted() {
    const toApply = suggestions.filter(s => accepted.has(s.id));
    if (toApply.length === 0) return;
    const ts = new Date().toISOString();
    onApply(toApply, ts);
    onClose();
  }

  function formatDate(iso: string | null | undefined): string {
    if (!iso) return "Never";
    try {
      return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return iso; }
  }

  function monthsAgo(iso: string | null | undefined): number {
    if (!iso) return Infinity;
    const diff = Date.now() - new Date(iso).getTime();
    return diff / (1000 * 60 * 60 * 24 * 30);
  }

  const pendingCount = suggestions.filter(s => !accepted.has(s.id) && !skipped.has(s.id)).length;
  const acceptedCount = accepted.size;
  const isStale = monthsAgo(lastRefreshedAt) >= 6;

  // Group suggestions by category
  const grouped = suggestions.reduce<Partial<Record<RefreshCategory, RefreshSuggestion[]>>>(
    (acc, s) => {
      (acc[s.category] ??= []).push(s);
      return acc;
    },
    {},
  );

  if (!show) return null;

  return createPortal(
    <div className="fixed inset-y-0 right-0 z-[400] flex flex-col w-[480px] max-w-full bg-background border-l border-border shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <RefreshCw className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight">AI Website Refresh</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="text-[11px] text-muted-foreground">
                Last refreshed: {formatDate(lastRefreshedAt)}
              </span>
              {isStale && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  overdue
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Loading */}
        {status === "loading" && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Scanning your site…</p>
            <p className="text-xs text-center max-w-xs">
              AI is reviewing your sections, copy, and layout against current best practices.
            </p>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 p-6">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-sm font-medium text-center">Analysis failed</p>
            <p className="text-xs text-muted-foreground text-center">{errorMsg}</p>
            <button
              type="button"
              onClick={reAnalyze}
              className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Results */}
        {status === "done" && suggestions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground p-6">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
            <p className="text-sm font-semibold text-foreground">Your site looks great!</p>
            <p className="text-xs text-center">
              No major improvements found. Come back after making changes to get fresh suggestions.
            </p>
          </div>
        )}

        {status === "done" && suggestions.length > 0 && (
          <div className="p-4 space-y-5">
            {/* Summary row */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>
                <span className="font-semibold text-foreground">{suggestions.length}</span> suggestion{suggestions.length !== 1 ? "s" : ""} found
                {acceptedCount > 0 && (
                  <> · <span className="text-green-600 font-semibold">{acceptedCount} accepted</span></>
                )}
                {pendingCount > 0 && (
                  <> · {pendingCount} pending</>
                )}
              </span>
              <button
                type="button"
                onClick={reAnalyze}
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Re-analyze"
              >
                <RefreshCw className="w-3 h-3" />
                Re-analyze
              </button>
            </div>

            {/* Suggestion groups */}
            {(Object.keys(CAT_CONFIG) as RefreshCategory[])
              .filter(cat => grouped[cat]?.length)
              .map(cat => (
                <div key={cat} className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{CAT_CONFIG[cat].emoji}</span>
                    <span className={cn("text-xs font-semibold uppercase tracking-wide", CAT_CONFIG[cat].color)}>
                      {CAT_CONFIG[cat].label}
                    </span>
                  </div>

                  {grouped[cat]!.map(sug => {
                    const isAccepted = accepted.has(sug.id);
                    const isSkipped  = skipped.has(sug.id);
                    return (
                      <div
                        key={sug.id}
                        className={cn(
                          "rounded-lg border p-3 transition-all",
                          isAccepted ? "border-green-400 bg-green-50 dark:bg-green-950/30"
                            : isSkipped ? "border-border bg-muted/20 opacity-50"
                            : "border-border bg-muted/30 hover:bg-muted/50",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {/* Priority dot */}
                          <span
                            className={cn(
                              "flex-shrink-0 w-2 h-2 rounded-full mt-1.5",
                              PRIORITY_DOT[sug.priority] ?? "bg-sky-400",
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug">{sug.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                              {sug.description}
                            </p>

                            {/* Action buttons */}
                            {!isAccepted && !isSkipped && (
                              <div className="flex items-center gap-2 mt-2">
                                <button
                                  type="button"
                                  onClick={() => toggleAccept(sug.id)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleSkip(sug.id)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
                                >
                                  <SkipForward className="w-3 h-3" />
                                  Skip
                                </button>
                              </div>
                            )}

                            {isAccepted && (
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> Accepted
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleAccept(sug.id)}
                                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                                >
                                  Undo
                                </button>
                              </div>
                            )}

                            {isSkipped && (
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <SkipForward className="w-3 h-3" /> Skipped
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleSkip(sug.id)}
                                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                                >
                                  Undo
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

            {/* Analyzed at */}
            {analyzedAt && (
              <p className="text-[11px] text-muted-foreground text-center">
                Analysis ran {formatDate(analyzedAt)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {status === "done" && suggestions.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border flex-shrink-0 bg-muted/20">
          <div className="text-xs text-muted-foreground">
            {acceptedCount === 0
              ? "Accept suggestions above to apply them"
              : `${acceptedCount} change${acceptedCount !== 1 ? "s" : ""} ready to apply`}
          </div>
          <button
            type="button"
            disabled={acceptedCount === 0}
            onClick={applyAccepted}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              acceptedCount > 0
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Apply {acceptedCount > 0 ? `${acceptedCount} ` : ""}Change{acceptedCount !== 1 ? "s" : ""}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
