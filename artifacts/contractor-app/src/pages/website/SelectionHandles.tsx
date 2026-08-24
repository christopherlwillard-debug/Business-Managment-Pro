/**
 * SelectionHandles — M6: Smart Selection & Resize
 *
 * Portal-rendered overlay that draws a primary-colour selection ring and eight
 * resize handles around the currently selected canvas element.
 *
 * Positioning uses `position:fixed` + `getBoundingClientRect()` so it naturally
 * accounts for the canvas zoom transform and page scroll.
 *
 * Resize drag: when onResizeStart/Live/Commit are provided, each handle captures
 * pointer events and fires deltas so the parent can apply live DOM overrides
 * (during drag) and commit prop updates (on release).
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface SelectionHandlesProps {
  /** The data-section-canvas-id of the selected component/section. */
  selectedId: string | null;
  /** When true (preview mode) suppress the handles entirely. */
  hidden?: boolean;
  /**
   * Called once on the first pointer-down of a resize drag.
   * Caller should push a history snapshot here.
   * When undefined, handles are purely cosmetic (no drag behaviour).
   */
  onResizeStart?: (edge: string) => void;
  /**
   * Called on every pointermove during a drag.
   * `deltaX` and `deltaY` are pixel offsets from the drag-start point in screen
   * coordinates (already accounts for any CSS transform / canvas zoom via
   * setPointerCapture).
   */
  onResizeLive?: (edge: string, deltaX: number, deltaY: number) => void;
  /**
   * Called on pointerup to commit the final resize.
   * After this call the parent should clear any live DOM style overrides and
   * apply the permanent prop update.
   */
  onResizeCommit?: (edge: string, deltaX: number, deltaY: number) => void;
}

// Eight handle descriptors: position is relative to the selection rect corners / mid-points.
const HANDLES = [
  { id: "nw", style: { top: -5, left: -5 },                cursor: "nw-resize" },
  { id: "n",  style: { top: -5, left: "calc(50% - 5px)" }, cursor: "n-resize"  },
  { id: "ne", style: { top: -5, right: -5 },               cursor: "ne-resize" },
  { id: "e",  style: { top: "calc(50% - 5px)", right: -5 },cursor: "e-resize"  },
  { id: "se", style: { bottom: -5, right: -5 },            cursor: "se-resize" },
  { id: "s",  style: { bottom: -5, left: "calc(50% - 5px)" }, cursor: "s-resize" },
  { id: "sw", style: { bottom: -5, left: -5 },             cursor: "sw-resize" },
  { id: "w",  style: { top: "calc(50% - 5px)", left: -5 }, cursor: "w-resize"  },
] as const;

type HandleId = typeof HANDLES[number]["id"];

export function SelectionHandles({
  selectedId,
  hidden,
  onResizeStart,
  onResizeLive,
  onResizeCommit,
}: SelectionHandlesProps) {
  const [rect, setRect] = useState<Rect | null>(null);
  // Drag state tracked via ref (not state) to avoid re-renders on every pointermove.
  const dragRef = useRef<{ edge: HandleId; startX: number; startY: number } | null>(null);

  useEffect(() => {
    if (!selectedId || hidden) { setRect(null); return; }

    function update() {
      const el = document.querySelector<HTMLElement>(`[data-section-canvas-id="${selectedId}"]`);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }

    update();

    const ro = new ResizeObserver(update);
    const el = document.querySelector<HTMLElement>(`[data-section-canvas-id="${selectedId}"]`);
    if (el) ro.observe(el);

    // Update on any scroll (canvas scroll, page scroll) using capture so nested scrollers fire it.
    window.addEventListener("scroll", update, { capture: true, passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
    };
  }, [selectedId, hidden]);

  if (!rect || !selectedId || hidden) return null;

  const hasResize = !!(onResizeStart && onResizeLive && onResizeCommit);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>, edge: HandleId) {
    if (!hasResize) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { edge, startX: e.clientX, startY: e.clientY };
    onResizeStart!(edge);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>, edge: HandleId) {
    if (!dragRef.current || dragRef.current.edge !== edge) return;
    e.stopPropagation();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    onResizeLive!(edge, dx, dy);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>, edge: HandleId) {
    if (!dragRef.current || dragRef.current.edge !== edge) return;
    e.stopPropagation();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    dragRef.current = null;
    onResizeCommit!(edge, dx, dy);
  }

  return createPortal(
    <div
      className="pointer-events-none fixed z-[9998]"
      style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
    >
      {/* Animated selection border — slightly thicker than EditableWrapper's ring so it stands out */}
      <div
        className="absolute inset-0 rounded-[2px]"
        style={{ boxShadow: "0 0 0 2px hsl(var(--primary) / 0.9), 0 0 0 4px hsl(var(--primary) / 0.15)" }}
      />

      {/* Resize handles — pointer-events-auto so cursors still show and drag events fire */}
      {HANDLES.map(h => (
        <button
          key={h.id}
          type="button"
          aria-label={`Resize ${h.id.toUpperCase()} edge`}
          className="pointer-events-auto absolute w-[10px] h-[10px] rounded-[2px] bg-white border-[2px] shadow-sm transition-transform hover:scale-125"
          style={{
            ...h.style as React.CSSProperties,
            cursor: h.cursor,
            borderColor: "hsl(var(--primary))",
          }}
          onPointerDown={hasResize ? e => handlePointerDown(e, h.id) : undefined}
          onPointerMove={hasResize ? e => handlePointerMove(e, h.id) : undefined}
          onPointerUp={hasResize ? e => handlePointerUp(e, h.id) : undefined}
          onKeyDown={hasResize ? e => {
            if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
            e.preventDefault();
            const step = e.shiftKey ? 10 : 2;
            const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
            const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
            onResizeStart!(h.id);
            onResizeLive!(h.id, dx, dy);
            onResizeCommit!(h.id, dx, dy);
          } : undefined}
        />
      ))}
    </div>,
    document.body
  );
}
