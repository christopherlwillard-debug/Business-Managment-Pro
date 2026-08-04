// AI Layout Assistant panel — slide-over that analyzes the section tree
// and returns actionable layout suggestions with one-click Apply.

import { useState } from "react";
import { Sparkles, X, Loader2, ChevronDown, ChevronRight, CheckCircle2, RotateCcw } from "lucide-react";
import type { LayoutSuggestion } from "./website-types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CATEGORY_ORDER: LayoutSuggestion["category"][] = [
  "Hero", "Services", "Gallery", "Footer", "Trust Signals", "Structure",
];

const CATEGORY_COLORS: Record<LayoutSuggestion["category"], string> = {
  Hero:           "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  Services:       "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Gallery:        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  Footer:         "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  "Trust Signals":"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Structure:      "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  bizId: number;
  sections: Array<{ id: string; type: string; enabled: boolean; order: number; content: Record<string, unknown> }>;
  businessName?: string;
  onApplySuggestion: (suggestion: LayoutSuggestion) => void;
}

export function LayoutAssistantPanel({ isOpen, onClose, bizId, sections, businessName, onApplySuggestion }: Props) {
  const [suggestions, setSuggestions] = useState<LayoutSuggestion[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [appliedIds, setAppliedIds]   = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    new Set(CATEGORY_ORDER)
  );

  if (!isOpen) return null;

  async function analyze() {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setAppliedIds(new Set());
    setDismissedIds(new Set());
    try {
      const res = await fetch(`${BASE}/api/website/suggest-layout?businessId=${bizId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections, businessName }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json() as { suggestions: LayoutSuggestion[] };
      setSuggestions(data.suggestions ?? []);
      if (data.suggestions.length === 0) setError("No suggestions — your layout looks good!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyze layout");
    } finally {
      setLoading(false);
    }
  }

  function applyAndMark(s: LayoutSuggestion) {
    onApplySuggestion(s);
    setAppliedIds(prev => new Set(prev).add(s.id));
  }

  function dismiss(id: string) {
    setDismissedIds(prev => new Set(prev).add(id));
  }

  function toggleCategory(cat: string) {
    setOpenCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  const visible = suggestions.filter(s => !dismissedIds.has(s.id));
  const grouped = CATEGORY_ORDER.reduce<Record<string, LayoutSuggestion[]>>((acc, cat) => {
    const items = visible.filter(s => s.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});

  const appliedCount   = suggestions.filter(s => appliedIds.has(s.id)).length;
  const remainingCount = visible.length - appliedCount;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[360px] bg-background border-l border-border shadow-2xl flex flex-col">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="font-semibold text-sm text-foreground">AI Layout Assistant</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Analyze button + status */}
          <div className="px-4 py-4 border-b border-border/60 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Scans your section tree and suggests structural improvements — spacing, ordering, grid sizing, and trust signal placement.
            </p>
            <button
              type="button"
              onClick={analyze}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…</>
                : <><Sparkles className="w-3.5 h-3.5" /> Analyze Layout</>}
            </button>

            {!loading && suggestions.length > 0 && (
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""} found</span>
                {appliedCount > 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {appliedCount} applied
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Error */}
          {error && !loading && (
            <div className="mx-4 mt-4 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="px-4 pt-4 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-xl border border-border/60 p-3 space-y-2 animate-pulse">
                  <div className="h-3 bg-muted rounded w-16" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              ))}
            </div>
          )}

          {/* Suggestions grouped by category */}
          {!loading && Object.keys(grouped).length > 0 && (
            <div className="pb-4">
              {(Object.entries(grouped) as [LayoutSuggestion["category"], LayoutSuggestion[]][]).map(([cat, items]) => {
                const isOpen = openCategories.has(cat);
                return (
                  <div key={cat} className="border-b border-border/40 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[cat]}`}>
                          {cat}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{items.length}</span>
                      </div>
                      {isOpen
                        ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                        : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-3 space-y-2">
                        {items.map(s => {
                          const applied = appliedIds.has(s.id);
                          return (
                            <div
                              key={s.id}
                              className={`rounded-xl border p-3 space-y-2 transition-all ${
                                applied
                                  ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30"
                                  : "border-border/60 bg-card"
                              }`}
                            >
                              <p className="text-xs font-semibold text-foreground leading-snug">{s.label}</p>
                              <p className="text-[11px] text-muted-foreground leading-relaxed">{s.description}</p>

                              {applied ? (
                                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Applied — undo with Ctrl+Z
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => applyAndMark(s)}
                                    className="flex-1 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                                  >
                                    Apply
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => dismiss(s.id)}
                                    className="px-2 py-1.5 text-[11px] rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
                                    title="Dismiss"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Re-analyze nudge when all applied */}
          {!loading && suggestions.length > 0 && remainingCount === 0 && appliedCount > 0 && (
            <div className="px-4 py-4 text-center space-y-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="text-sm font-medium text-foreground">All suggestions applied!</p>
              <button
                type="button"
                onClick={analyze}
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <RotateCcw className="w-3 h-3" /> Re-analyze
              </button>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-border/60 text-[10px] text-muted-foreground/60 text-center">
          Suggestions use existing style properties only · all changes are undoable
        </div>
      </div>
    </>
  );
}
