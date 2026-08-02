import { useState } from "react";
import { US_STATES } from "./USMapData";

interface USMapProps {
  selectedStates: string[];
  onToggleState?: (code: string) => void;
  highlightColor?: string;
  showLabels?: boolean;
  showBorders?: boolean;
  mapStyle?: "outline" | "filled" | "minimal" | "modern";
  className?: string;
}

const VIEWBOX = "0 0 960 600";

export function USMap({
  selectedStates,
  onToggleState,
  highlightColor,
  showLabels = true,
  showBorders = true,
  mapStyle = "outline",
  className = "",
}: USMapProps) {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const isInteractive = !!onToggleState;

  // Resolve fill color for a state
  function getFill(code: string): string {
    const selected = selectedStates.includes(code);
    const hovered = hoveredCode === code;

    if (selected) {
      return highlightColor ?? "var(--theme-brand, #2563eb)";
    }
    if (hovered && isInteractive) {
      return mapStyle === "minimal" ? "rgba(0,0,0,0.07)" : "rgba(37,99,235,0.12)";
    }

    switch (mapStyle) {
      case "filled":   return "#e5e7eb";
      case "minimal":  return "transparent";
      case "modern":   return "#f3f4f6";
      case "outline":
      default:         return "#f9fafb";
    }
  }

  function getStroke(code: string): string {
    if (!showBorders) return "transparent";
    const selected = selectedStates.includes(code);
    if (selected) {
      // Slightly darker than fill
      return "rgba(0,0,0,0.15)";
    }
    switch (mapStyle) {
      case "minimal": return "rgba(0,0,0,0.12)";
      case "modern":  return "#d1d5db";
      default:        return "#d1d5db";
    }
  }

  function getStrokeWidth(code: string): number {
    return selectedStates.includes(code) ? 1.5 : 0.8;
  }

  function getLabelFill(code: string): string {
    const selected = selectedStates.includes(code);
    if (selected) return "#ffffff";
    return mapStyle === "minimal" ? "#6b7280" : "#9ca3af";
  }

  // AK/HI inset label rects (drawn below main map)
  const insetLabel = (text: string, x: number, y: number) => (
    <text x={x} y={y} fontSize={7} fill="#9ca3af" textAnchor="middle" fontFamily="system-ui, sans-serif">
      {text}
    </text>
  );

  return (
    <svg
      viewBox={VIEWBOX}
      className={`w-full h-auto select-none ${className}`}
      aria-label="US Coverage Map"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      {/* Drop shadow for modern style */}
      {mapStyle === "modern" && (
        <defs>
          <filter id="state-shadow" x="-2%" y="-2%" width="104%" height="104%">
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.1" />
          </filter>
        </defs>
      )}

      {/* Inset boxes */}
      <rect x="104" y="466" width="148" height="110" rx="3" fill="#f3f4f6" stroke="#e5e7eb" strokeWidth="0.8" />
      <rect x="244" y="530" width="58" height="48" rx="3" fill="#f3f4f6" stroke="#e5e7eb" strokeWidth="0.8" />
      {insetLabel("AK", 178, 583)}
      {insetLabel("HI", 273, 583)}

      {/* State paths */}
      {US_STATES.map(s => {
        const selected = selectedStates.includes(s.code);
        const hovered = hoveredCode === s.code;
        const smallLabel = ["RI","DE","CT","NJ","MD","DC","VT","NH","MA"].includes(s.code);

        return (
          <g key={s.code}>
            <path
              d={s.d}
              fill={getFill(s.code)}
              stroke={getStroke(s.code)}
              strokeWidth={getStrokeWidth(s.code)}
              strokeLinejoin="round"
              filter={mapStyle === "modern" && selected ? "url(#state-shadow)" : undefined}
              style={{
                cursor: isInteractive ? "pointer" : "default",
                transition: "fill 0.15s ease",
              }}
              onClick={() => onToggleState?.(s.code)}
              onMouseEnter={() => setHoveredCode(s.code)}
              onMouseLeave={() => setHoveredCode(null)}
            >
              <title>{s.name}{selected ? " ✓" : ""}</title>
            </path>

            {/* State abbreviation label */}
            {showLabels && !smallLabel && (
              <text
                x={s.lx}
                y={s.ly + 3.5}
                fontSize={s.code === "AK" ? 8 : 7.5}
                fontWeight={selected ? "700" : "500"}
                fill={getLabelFill(s.code)}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {s.code}
              </text>
            )}

            {/* Hover tooltip for small states */}
            {hovered && smallLabel && (
              <text
                x={s.lx}
                y={s.ly - 6}
                fontSize={7}
                fill="#374151"
                textAnchor="middle"
                style={{ pointerEvents: "none" }}
              >
                {s.code}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
