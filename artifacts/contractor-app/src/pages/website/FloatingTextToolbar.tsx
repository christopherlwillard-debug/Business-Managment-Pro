import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bold, Italic, Underline, Link, AlignLeft, AlignCenter, AlignRight, X, Sparkles, Loader2,
  Check, RefreshCcw,
} from "lucide-react";
import { useInlineEditContext } from "./InlineEditContext";
import type { BusinessContext } from "./website-types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * FloatingTextToolbar
 *
 * Renders a compact floating pill toolbar above the currently selected or
 * actively edited InlineEditableText element. Positioning is driven by
 * getBoundingClientRect on the element's [data-inline-editable] node.
 *
 * The toolbar itself carries data-inline-toolbar="true" so InlineEditContext's
 * mousedown guard does not dismiss the selection when the user clicks a button.
 *
 * Formatting buttons use document.execCommand (still universally supported in
 * contenteditable contexts): Bold, Italic, Underline, justifyLeft/Center/Right,
 * foreColor, and createLink.
 *
 * The optional ✨ Rewrite button calls POST /api/website/generate-copy with
 * businessContext + a field type derived from the activeId suffix, then replaces
 * the element's text in-place via execCommand.
 *
 * The ✨ Improve button calls POST /api/website/improve-copy with the current
 * text and a user-chosen tone, then shows a before/after preview with
 * Accept / Reject / Try Again controls.
 *
 * Must be rendered INSIDE the InlineEditContext.Provider so it can read context.
 * Because it renders via a React portal to document.body the actual DOM sits
 * outside the provider, but React context propagates through the React tree,
 * not the DOM tree, so the context is still available.
 */

interface FloatingTextToolbarProps {
  /** When provided, shows the ✨ Rewrite and ✨ Improve buttons for per-block AI copy. */
  businessContext?: BusinessContext;
}

/**
 * Maps the suffix of an inline-edit field ID (e.g. "hero123-headline") to a
 * copy field key understood by POST /generate-copy.
 * Returns null for field types with no structured copy variant.
 *
 * IMPORTANT: specific suffixes must be checked before their shorter generic
 * counterparts (-subheadline before -headline, -subheading before -heading)
 * to prevent endsWith false-positives.
 */
export function deriveFieldKey(id: string): string | null {
  const lower = id.toLowerCase();
  // Specific suffixes first — avoids swallowing them with shorter matches below
  if (lower.endsWith("-subheadline")) return "hero-subheadline";
  if (lower.endsWith("-headline"))    return "hero-headline";
  if (lower.endsWith("-subheading"))  return "section-subheading";
  if (lower.endsWith("-heading"))     return "section-heading";
  if (lower.endsWith("-cta"))         return "cta-label";
  if (lower.endsWith("-body"))        return "about-body";
  if (lower.endsWith("-description")) return "service-description";
  if (lower.endsWith("-answer"))      return "faq-answer";
  // -question has no backend structured variant → return null (button hidden)
  return null;
}

// ── Tone definitions ──────────────────────────────────────────────────────────

interface ToneOption {
  value: string;
  label: string;
  emoji: string;
  description: string;
}

const TONES: ToneOption[] = [
  { value: "Professional",   label: "Professional",   emoji: "🏢", description: "Formal & authoritative" },
  { value: "Friendly",       label: "Friendly",       emoji: "😊", description: "Warm & conversational" },
  { value: "Sales Focused",  label: "Sales Focused",  emoji: "💼", description: "Persuasive & action-driven" },
  { value: "Simple",         label: "Simple",         emoji: "✏️",  description: "Plain & easy to read" },
  { value: "SEO Optimized",  label: "SEO Optimized",  emoji: "🔍", description: "Keyword-rich & search-friendly" },
  { value: "Luxury",         label: "Luxury",         emoji: "✨", description: "Premium & elevated" },
  { value: "Commercial",     label: "Commercial",     emoji: "🏗️",  description: "Targets business clients" },
  { value: "Veteran",        label: "Veteran",        emoji: "🎖️",  description: "Veteran-owned pride" },
  { value: "Shorter",        label: "Shorter",        emoji: "⬆️",  description: "Condensed — same message" },
  { value: "Longer",         label: "Longer",         emoji: "⬇️",  description: "Expanded with more detail" },
];

type ImproveMode = "closed" | "tones" | "loading" | "preview";

// ── Component ─────────────────────────────────────────────────────────────────

export function FloatingTextToolbar({ businessContext }: FloatingTextToolbarProps) {
  const ctx = useInlineEditContext();
  const [domRect, setDomRect] = useState<DOMRect | null>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const rafRef = useRef<number>(0);

  // ── Improve-with-AI state ─────────────────────────────────────────────────
  const [improveMode, setImproveMode] = useState<ImproveMode>("closed");
  const [improveTone, setImproveTone] = useState("");
  const [improveResult, setImproveResult] = useState("");
  const [improveOriginal, setImproveOriginal] = useState("");
  const [improveError, setImproveError] = useState<string | null>(null);

  const activeId = ctx?.editingId ?? ctx?.selectedId ?? null;

  // Reset improve panel when the user moves to a different element
  useEffect(() => {
    setImproveMode("closed");
    setImproveError(null);
  }, [activeId]);

  useEffect(() => {
    if (!activeId) {
      setDomRect(null);
      setShowLinkInput(false);
      setRegenError(null);
      return;
    }

    function updateRect() {
      const el = document.querySelector<HTMLElement>(`[data-inline-editable="${activeId}"]`);
      if (!el) { setDomRect(null); return; }
      setDomRect(el.getBoundingClientRect());
    }

    updateRect();

    // Re-measure on any scroll or resize so the pill stays aligned.
    const obs = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateRect);
    });
    const el = document.querySelector<HTMLElement>(`[data-inline-editable="${activeId}"]`);
    if (el) obs.observe(el);
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
      cancelAnimationFrame(rafRef.current);
    };
  }, [activeId]);

  if (!domRect || !activeId) return null;

  const TOOLBAR_H = 40;
  const GAP = 6;
  const top = Math.max(4, domRect.top - TOOLBAR_H - GAP);
  const centerX = domRect.left + domRect.width / 2;

  // Panel appears below the element; flip above if near the bottom edge
  const PANEL_ESTIMATED_H = 260;
  const panelBelow = domRect.bottom + 8;
  const panelAbove = domRect.top - PANEL_ESTIMATED_H - 8;
  const panelTop = panelBelow + PANEL_ESTIMATED_H < window.innerHeight - 16
    ? panelBelow
    : Math.max(8, panelAbove);

  function execCmd(cmd: string, value?: string) {
    const el = document.querySelector<HTMLElement>(`[data-inline-editable="${activeId}"]`);
    if (el && document.activeElement !== el) el.focus();
    document.execCommand(cmd, false, value);
  }

  function handleLinkSubmit() {
    if (linkUrl.trim()) execCmd("createLink", linkUrl.trim());
    setShowLinkInput(false);
    setLinkUrl("");
  }

  /** Derive field type, call generate-copy, replace element text. */
  async function handleRegenerate() {
    if (!activeId || !businessContext || isRegenerating) return;
    const fieldKey = deriveFieldKey(activeId);
    if (!fieldKey) return;

    setIsRegenerating(true);
    setRegenError(null);

    try {
      const el = document.querySelector<HTMLElement>(`[data-inline-editable="${activeId}"]`);
      const currentText = el?.textContent?.trim() ?? "";

      const res = await fetch(`${BASE}/api/website/generate-copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ field: fieldKey, businessContext, currentText }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { result?: string };
      const result = (data.result ?? "").trim();
      if (!result) return;

      // Replace the element text in-place via execCommand so it integrates
      // with the existing undo/redo and inline-edit commit flow.
      if (el) {
        if (document.activeElement !== el) el.focus();
        document.execCommand("selectAll", false);
        document.execCommand("insertText", false, result);
      }
    } catch {
      setRegenError("Try again");
    } finally {
      setIsRegenerating(false);
    }
  }

  // ── Improve-with-AI handlers ───────────────────────────────────────────────

  function handleOpenImprove() {
    const el = document.querySelector<HTMLElement>(`[data-inline-editable="${activeId}"]`);
    const text = el?.textContent?.trim() ?? "";
    setImproveOriginal(text);
    setImproveError(null);
    setImproveMode("tones");
  }

  async function handleImprove(tone: string) {
    setImproveTone(tone);
    setImproveMode("loading");
    setImproveError(null);
    try {
      const res = await fetch(`${BASE}/api/website/improve-copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          text: improveOriginal,
          tone,
          context: businessContext,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { result?: string };
      const result = (data.result ?? "").trim();
      setImproveResult(result);
      setImproveMode("preview");
    } catch {
      setImproveError("Generation failed. Try again.");
      setImproveMode("tones");
    }
  }

  function handleAcceptImprove() {
    const el = document.querySelector<HTMLElement>(`[data-inline-editable="${activeId}"]`);
    if (el && improveResult) {
      if (document.activeElement !== el) el.focus();
      document.execCommand("selectAll", false);
      document.execCommand("insertText", false, improveResult);
    }
    setImproveMode("closed");
  }

  function handleTryAgain() {
    setImproveMode("loading");
    handleImprove(improveTone);
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  const fieldKey = deriveFieldKey(activeId);
  const showRegenButton = !!businessContext && !!fieldKey;

  const btn =
    "p-1.5 rounded hover:bg-white/20 transition-colors text-white/70 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50";

  const panelBase: React.CSSProperties = {
    position: "fixed",
    top: panelTop,
    left: centerX,
    transform: "translateX(-50%)",
    zIndex: 9999,
    pointerEvents: "auto",
    width: 340,
  };

  return (
    <>
      {/* ── Main toolbar pill ──────────────────────────────────────────────── */}
      {createPortal(
        <div
          data-inline-toolbar="true"
          role="toolbar"
          aria-label="Text formatting"
          style={{
            position: "fixed",
            top,
            left: centerX,
            transform: "translateX(-50%)",
            zIndex: 9999,
            pointerEvents: "auto",
          }}
          className="flex items-center gap-0.5 bg-gray-900/96 backdrop-blur-sm rounded-lg px-1.5 py-1 shadow-2xl border border-white/10"
        >
          {showLinkInput ? (
            /* ── Link URL input ────────────────────────────────── */
            <div className="flex items-center gap-1" data-inline-toolbar="true">
              <input
                autoFocus
                type="url"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); handleLinkSubmit(); }
                  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setShowLinkInput(false); setLinkUrl(""); }
                }}
                className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-xs text-white placeholder-white/40 outline-none w-44 focus:border-white/50"
              />
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); handleLinkSubmit(); }}
                className="text-xs font-medium text-white/80 hover:text-white px-1.5 py-0.5 rounded hover:bg-white/20 transition-colors"
              >
                OK
              </button>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); setShowLinkInput(false); setLinkUrl(""); }}
                className={btn}
                title="Cancel"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <>
              {/* ── Style buttons ─────────────────────────────── */}
              <button type="button" onMouseDown={e => { e.preventDefault(); execCmd("bold"); }}
                className={btn} title="Bold">
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button type="button" onMouseDown={e => { e.preventDefault(); execCmd("italic"); }}
                className={btn} title="Italic">
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button type="button" onMouseDown={e => { e.preventDefault(); execCmd("underline"); }}
                className={btn} title="Underline">
                <Underline className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-3.5 bg-white/20 mx-0.5 flex-shrink-0" />

              {/* ── Alignment ─────────────────────────────────── */}
              <button type="button" onMouseDown={e => { e.preventDefault(); execCmd("justifyLeft"); }}
                className={btn} title="Align left">
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
              <button type="button" onMouseDown={e => { e.preventDefault(); execCmd("justifyCenter"); }}
                className={btn} title="Align center">
                <AlignCenter className="w-3.5 h-3.5" />
              </button>
              <button type="button" onMouseDown={e => { e.preventDefault(); execCmd("justifyRight"); }}
                className={btn} title="Align right">
                <AlignRight className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-3.5 bg-white/20 mx-0.5 flex-shrink-0" />

              {/* ── Text color — native color input overlay ───── */}
              <label
                className={`${btn} cursor-pointer relative overflow-hidden`}
                title="Text color"
                onMouseDown={e => e.stopPropagation()}
              >
                <span className="text-[11px] font-black leading-none select-none">A</span>
                <input
                  type="color"
                  defaultValue="#ffffff"
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  onChange={e => execCmd("foreColor", e.target.value)}
                />
              </label>

              <div className="w-px h-3.5 bg-white/20 mx-0.5 flex-shrink-0" />

              {/* ── Link ──────────────────────────────────────── */}
              <button type="button" onMouseDown={e => { e.preventDefault(); setShowLinkInput(true); }}
                className={btn} title="Insert link">
                <Link className="w-3.5 h-3.5" />
              </button>

              {/* ── AI Regenerate ─────────────────────────────── */}
              {showRegenButton && (
                <>
                  <div className="w-px h-3.5 bg-white/20 mx-0.5 flex-shrink-0" />
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); handleRegenerate(); }}
                    disabled={isRegenerating}
                    className={`${btn} disabled:opacity-50 flex items-center gap-1 text-[10px] font-semibold text-purple-300 hover:text-purple-200 px-1`}
                    title="Rewrite with AI (fresh copy)"
                  >
                    {isRegenerating
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Sparkles className="w-3 h-3" />}
                    {!isRegenerating && <span>Rewrite</span>}
                  </button>
                  {regenError && (
                    <span className="text-[10px] text-red-400 px-1">{regenError}</span>
                  )}
                </>
              )}

              {/* ── AI Improve ────────────────────────────────── */}
              {businessContext && (
                <>
                  {!showRegenButton && <div className="w-px h-3.5 bg-white/20 mx-0.5 flex-shrink-0" />}
                  <button
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault();
                      if (improveMode !== "closed") {
                        setImproveMode("closed");
                      } else {
                        handleOpenImprove();
                      }
                    }}
                    className={`${btn} flex items-center gap-1 text-[10px] font-semibold px-1 ${
                      improveMode !== "closed"
                        ? "text-purple-200 bg-purple-600/30"
                        : "text-purple-300 hover:text-purple-200"
                    }`}
                    title="Improve with AI — choose a tone"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Improve</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>,
        document.body,
      )}

      {/* ── Tone picker panel ─────────────────────────────────────────────── */}
      {improveMode === "tones" && createPortal(
        <div
          data-inline-toolbar="true"
          style={panelBase}
          className="bg-gray-900/98 backdrop-blur-sm rounded-xl border border-white/10 shadow-2xl p-3 space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-purple-400" />
              Improve with AI
            </p>
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); setImproveMode("closed"); }}
              className="text-white/40 hover:text-white/80 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[10px] text-white/40">Choose a voice for this text block:</p>
          {improveError && (
            <p className="text-[10px] text-red-400">{improveError}</p>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            {TONES.map(tone => (
              <button
                key={tone.value}
                type="button"
                onMouseDown={e => { e.preventDefault(); handleImprove(tone.value); }}
                className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-white/5 hover:bg-purple-600/20 text-left transition-colors border border-white/10 hover:border-purple-400/40 group"
              >
                <span className="text-sm leading-none mt-0.5">{tone.emoji}</span>
                <div>
                  <p className="text-xs font-medium text-white/80 group-hover:text-white transition-colors leading-tight">{tone.label}</p>
                  <p className="text-[10px] text-white/35 mt-0.5 leading-tight">{tone.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}

      {/* ── Loading state ─────────────────────────────────────────────────── */}
      {improveMode === "loading" && createPortal(
        <div
          data-inline-toolbar="true"
          style={panelBase}
          className="bg-gray-900/98 backdrop-blur-sm rounded-xl border border-white/10 shadow-2xl px-4 py-5 flex items-center gap-3"
        >
          <Loader2 className="w-4 h-4 animate-spin text-purple-400 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-white/80">Rewriting…</p>
            <p className="text-[10px] text-white/40 mt-0.5">{improveTone} voice</p>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Before / After preview ────────────────────────────────────────── */}
      {improveMode === "preview" && createPortal(
        <div
          data-inline-toolbar="true"
          style={panelBase}
          className="bg-gray-900/98 backdrop-blur-sm rounded-xl border border-white/10 shadow-2xl p-3 space-y-2.5"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-purple-400" />
              {improveTone} version
            </p>
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); setImproveMode("closed"); }}
              className="text-white/40 hover:text-white/80 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Before */}
          <div>
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">Before</p>
            <p className="text-[11px] text-white/35 leading-relaxed bg-white/5 rounded-lg px-2.5 py-2 max-h-14 overflow-y-auto line-through decoration-white/20">
              {improveOriginal}
            </p>
          </div>

          {/* After */}
          <div>
            <p className="text-[10px] font-semibold text-green-400/80 uppercase tracking-wider mb-1">After</p>
            <p className="text-[11px] text-white/90 leading-relaxed bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-2 max-h-20 overflow-y-auto">
              {improveResult}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); handleAcceptImprove(); }}
              className="flex items-center gap-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-1.5 transition-colors"
            >
              <Check className="w-3 h-3" />
              Apply
            </button>
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); handleTryAgain(); }}
              className="flex items-center gap-1.5 text-xs border border-white/20 text-white/60 hover:text-white rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <RefreshCcw className="w-3 h-3" />
              Try Again
            </button>
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); setImproveMode("tones"); }}
              className="text-xs text-white/40 hover:text-white/70 px-2 py-1.5 transition-colors"
            >
              Change tone
            </button>
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); setImproveMode("closed"); }}
              className="ml-auto text-xs text-white/30 hover:text-white/60 px-2 py-1.5 transition-colors"
            >
              Reject
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
