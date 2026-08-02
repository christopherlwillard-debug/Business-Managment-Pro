import { createPortal } from "react-dom";
import type { AlignmentGuide } from "./alignmentUtils";

interface AlignmentGuidesProps {
  guides: AlignmentGuide[];
}

/**
 * AlignmentGuides — portal-rendered SVG overlay that shows Canva-style blue
 * horizontal guide lines when components align during drag / resize operations.
 *
 * - Fixed full-viewport SVG, pointer-events none, z-index 9998 (above selection
 *   handles but below modals).
 * - Blue (#3b82f6) for edge/center alignment, amber (#f59e0b) for equal-spacing.
 * - Each guide optionally shows a distance badge (e.g. "16px").
 */
export function AlignmentGuides({ guides }: AlignmentGuidesProps) {
  if (guides.length === 0) return null;

  return createPortal(
    <svg
      className="pointer-events-none fixed inset-0"
      style={{ width: "100vw", height: "100vh", zIndex: 9998, overflow: "visible" }}
      aria-hidden="true"
    >
      {guides.map((guide, i) => {
        const isSpacing = guide.style === "spacing";
        const color = isSpacing ? "#f59e0b" : "#3b82f6";
        const midX = (guide.x1 + guide.x2) / 2;

        return (
          <g key={i}>
            {/* Main guide line */}
            <line
              x1={guide.x1}
              y1={guide.y}
              x2={guide.x2}
              y2={guide.y}
              stroke={color}
              strokeWidth={isSpacing ? 1 : 1.5}
              strokeDasharray={isSpacing ? "4 3" : undefined}
              opacity={0.9}
            />
            {/* Center tick mark — shows the midpoint of the line */}
            <line
              x1={midX}
              y1={guide.y - 4}
              x2={midX}
              y2={guide.y + 4}
              stroke={color}
              strokeWidth={1.5}
              opacity={0.9}
            />
            {/* Distance badge (label) */}
            {guide.label && (() => {
              const badgeW = guide.label.length * 6.5 + 12;
              return (
                <>
                  <rect
                    x={midX - badgeW / 2}
                    y={guide.y - 9}
                    width={badgeW}
                    height={16}
                    rx={3}
                    fill={color}
                  />
                  <text
                    x={midX}
                    y={guide.y + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={10}
                    fontFamily="system-ui, -apple-system, sans-serif"
                    fontWeight={600}
                    fill="white"
                  >
                    {guide.label}
                  </text>
                </>
              );
            })()}
          </g>
        );
      })}
    </svg>,
    document.body,
  );
}
