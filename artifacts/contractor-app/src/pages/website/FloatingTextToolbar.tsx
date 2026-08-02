import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bold, Italic, Underline, Link, AlignLeft, AlignCenter, AlignRight, X,
} from "lucide-react";
import { useInlineEditContext } from "./InlineEditContext";

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
 * Must be rendered INSIDE the InlineEditContext.Provider so it can read context.
 * Because it renders via a React portal to document.body the actual DOM sits
 * outside the provider, but React context propagates through the React tree,
 * not the DOM tree, so the context is still available.
 */
export function FloatingTextToolbar() {
  const ctx = useInlineEditContext();
  const [domRect, setDomRect] = useState<DOMRect | null>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const rafRef = useRef<number>(0);

  const activeId = ctx?.editingId ?? ctx?.selectedId ?? null;

  useEffect(() => {
    if (!activeId) {
      setDomRect(null);
      setShowLinkInput(false);
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

  const btn =
    "p-1.5 rounded hover:bg-white/20 transition-colors text-white/70 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50";

  return createPortal(
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
        </>
      )}
    </div>,
    document.body,
  );
}
