/**
 * SelectionHandles — M6: Smart Selection & Resize
 *
 * Portal-rendered overlay that draws a primary-colour selection ring and eight
 * resize handles around the currently selected canvas element.
 *
 * Positioning uses `position:fixed` + `getBoundingClientRect()` so it naturally
 * accounts for the canvas zoom transform and page scroll.
 */

import { useEffect, useState } from "react";
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

export function SelectionHandles({ selectedId, hidden }: SelectionHandlesProps) {
  const [rect, setRect] = useState<Rect | null>(null);

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

      {/* Resize handles — pointer-events-auto so cursors still show */}
      {HANDLES.map(h => (
        <div
          key={h.id}
          className="pointer-events-auto absolute w-[10px] h-[10px] rounded-[2px] bg-white border-[2px] shadow-sm transition-transform hover:scale-125"
          style={{
            ...h.style as React.CSSProperties,
            cursor: h.cursor,
            borderColor: "hsl(var(--primary))",
          }}
        />
      ))}
    </div>,
    document.body
  );
}
