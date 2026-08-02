/**
 * alignmentUtils.ts
 * Pure functions for computing Canva-style alignment guide lines.
 * Used during drag-to-reorder (ContentSection) and component resize (SelectionHandles).
 */

/** A single horizontal guide line to display as a viewport overlay. */
export interface AlignmentGuide {
  /** Viewport Y coordinate of the line. */
  y: number;
  /** Left endpoint of the line (viewport X). */
  x1: number;
  /** Right endpoint of the line (viewport X). */
  x2: number;
  /** Optional distance badge label, e.g. "16px". */
  label?: string;
  /** Visual style of the guide line. */
  style: "edge" | "center" | "spacing";
}

/** Snap threshold — within this many pixels is considered aligned. */
const SNAP_THRESHOLD = 4;

export type SimpleRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

/**
 * Given a dragged/resized element's current viewport rect and an array of
 * sibling viewport rects (within the same section), returns the set of
 * alignment guide lines to overlay.
 *
 * Guide types:
 *  - "edge"   — top/bottom edge of dragged aligns with top/bottom of a sibling
 *  - "center" — center-Y of dragged aligns with center-Y of a sibling
 *  - "spacing" — dragged element is equidistant from the nearest element above
 *                and below (equal-spacing, shown with a distance badge)
 */
export function computeAlignmentGuides(
  draggedRect: SimpleRect,
  siblingRects: SimpleRect[],
): AlignmentGuide[] {
  if (siblingRects.length === 0) return [];

  const guides: AlignmentGuide[] = [];
  const dragCenterY = (draggedRect.top + draggedRect.bottom) / 2;

  // X extent spans all rects plus a small margin on each side for readability
  const allRects = [draggedRect, ...siblingRects];
  const x1 = Math.min(...allRects.map((r) => r.left)) - 24;
  const x2 = Math.max(...allRects.map((r) => r.right)) + 24;

  for (const sib of siblingRects) {
    const sibCenterY = (sib.top + sib.bottom) / 2;

    // Top-edge to top-edge
    if (Math.abs(draggedRect.top - sib.top) <= SNAP_THRESHOLD) {
      guides.push({ y: sib.top, x1, x2, style: "edge" });
    }
    // Bottom-edge to bottom-edge
    if (Math.abs(draggedRect.bottom - sib.bottom) <= SNAP_THRESHOLD) {
      guides.push({ y: sib.bottom, x1, x2, style: "edge" });
    }
    // Top of dragged aligns with bottom of sibling (flush stacking from above)
    if (
      Math.abs(draggedRect.top - sib.bottom) <= SNAP_THRESHOLD &&
      sib.bottom < draggedRect.bottom
    ) {
      guides.push({ y: sib.bottom, x1, x2, style: "edge" });
    }
    // Bottom of dragged aligns with top of sibling (flush stacking from below)
    if (
      Math.abs(draggedRect.bottom - sib.top) <= SNAP_THRESHOLD &&
      sib.top > draggedRect.top
    ) {
      guides.push({ y: sib.top, x1, x2, style: "edge" });
    }
    // Center-Y alignment
    if (Math.abs(dragCenterY - sibCenterY) <= SNAP_THRESHOLD) {
      guides.push({ y: sibCenterY, x1, x2, style: "center" });
    }
  }

  // Equal-spacing detection — nearest element above and below
  const above = siblingRects
    .filter((s) => s.bottom <= draggedRect.top + SNAP_THRESHOLD)
    .sort((a, b) => b.bottom - a.bottom); // closest first

  const below = siblingRects
    .filter((s) => s.top >= draggedRect.bottom - SNAP_THRESHOLD)
    .sort((a, b) => a.top - b.top); // closest first

  if (above.length > 0 && below.length > 0) {
    const aboveEl = above[0];
    const belowEl = below[0];
    const gapAbove = draggedRect.top - aboveEl.bottom;
    const gapBelow = belowEl.top - draggedRect.bottom;

    if (
      gapAbove >= 0 &&
      gapBelow >= 0 &&
      Math.abs(gapAbove - gapBelow) <= SNAP_THRESHOLD * 2
    ) {
      const dist = Math.round((gapAbove + gapBelow) / 2);
      if (dist > 0) {
        // Four lines: bottom of above-element, top of dragged, bottom of dragged, top of below-element
        guides.push({
          y: aboveEl.bottom,
          x1,
          x2,
          style: "spacing",
          label: `${dist}px`,
        });
        guides.push({ y: draggedRect.top, x1, x2, style: "spacing" });
        guides.push({ y: draggedRect.bottom, x1, x2, style: "spacing" });
        guides.push({
          y: belowEl.top,
          x1,
          x2,
          style: "spacing",
          label: `${dist}px`,
        });
      }
    }
  }

  // Deduplicate by rounded Y position (0.5px granularity)
  const seen = new Set<number>();
  return guides.filter((g) => {
    const key = Math.round(g.y * 2);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
