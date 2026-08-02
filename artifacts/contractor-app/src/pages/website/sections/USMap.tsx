import { useState } from "react";
import { US_STATES } from "./USMapData";

interface USMapProps {
  selectedStates: string[];
  onToggleState?: (code: string) => void;
  highlightColor?: string;
  showLabels?: boolean;
  showBorders?: boolean;
  mapStyle?: "outline" | "filled" | "minimal" | "modern" | "dark" | "patriotic";
  className?: string;
}

const VIEWBOX = "0 0 960 600";

// Small / dense states that don't have room for an inline label
const SMALL_STATES = new Set(["RI","DE","CT","NJ","MD","DC","VT","NH","MA"]);

export function USMap({
  selectedStates,
  onToggleState,
  highlightColor,
  showLabels = true,
  showBorders = true,
  mapStyle = "modern",
  className = "",
}: USMapProps) {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const isInteractive = !!onToggleState;

  const brandColor = highlightColor ?? "var(--theme-brand, #2563eb)";

  function getFill(code: string): string {
    const selected = selectedStates.includes(code);
    const hovered  = hoveredCode === code;

    if (selected) {
      // Patriotic preset uses a fixed red highlight for selected states
      return mapStyle === "patriotic" ? "#dc2626" : brandColor;
    }
    if (hovered && isInteractive) {
      if (mapStyle === "dark" || mapStyle === "patriotic") return "rgba(255,255,255,0.10)";
      return mapStyle === "minimal" ? "rgba(0,0,0,0.06)" : "rgba(37,99,235,0.14)";
    }
    switch (mapStyle) {
      case "filled":    return "#e2e8f0";
      case "minimal":   return "transparent";
      case "modern":    return "#d1d5db";
      case "dark":      return "#1e293b";
      case "patriotic": return "#1e3a5f";
      case "outline":
      default:          return "#f1f5f9";
    }
  }

  function getStroke(code: string): string {
    if (!showBorders) return "transparent";
    const selected = selectedStates.includes(code);
    if (selected) return "#ffffff";               // white border on selected states
    switch (mapStyle) {
      case "minimal":   return "rgba(0,0,0,0.10)";
      case "dark":      return "#374151";
      case "patriotic": return "#243b6e";
      default:          return "#9ca3af";
    }
  }

  // Uniform stroke weight — selected state border is thinner (white on color bg looks bold)
  function getStrokeWidth(code: string): number {
    return selectedStates.includes(code) ? 1.5 : 0.6;
  }

  function getLabelFill(code: string): string {
    if (selectedStates.includes(code)) return "#ffffff";
    if (mapStyle === "dark" || mapStyle === "patriotic") return "#94a3b8";
    return "#6b7280";
  }

  return (
    <svg
      viewBox={VIEWBOX}
      className={`w-full h-auto select-none ${className}`}
      aria-label="US Coverage Map"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      <defs>
        {/* Glow applied to selected states for "modern" style */}
        <filter id="selected-glow" x="-8%" y="-8%" width="116%" height="116%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={brandColor} floodOpacity="0.45" />
        </filter>
        {/* Subtle shadow for all states in modern mode */}
        <filter id="state-shadow" x="-3%" y="-3%" width="106%" height="106%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.08" />
        </filter>
      </defs>

      {/* Inset boxes — sized to fit the Albers USA fitSize([960,600]) AK/HI insets */}
      <rect x="0" y="440" width="252" height="142" rx="4" fill={mapStyle === "minimal" ? "transparent" : mapStyle === "dark" ? "#1e293b" : mapStyle === "patriotic" ? "#1e3a5f" : "#e5e7eb"} stroke={mapStyle === "dark" ? "#374151" : mapStyle === "patriotic" ? "#243b6e" : "#d1d5db"} strokeWidth="0.8" />
      <rect x="254" y="500" width="120" height="84" rx="4" fill={mapStyle === "minimal" ? "transparent" : mapStyle === "dark" ? "#1e293b" : mapStyle === "patriotic" ? "#1e3a5f" : "#e5e7eb"} stroke={mapStyle === "dark" ? "#374151" : mapStyle === "patriotic" ? "#243b6e" : "#d1d5db"} strokeWidth="0.8" />

      {/* State paths — render unselected first, then selected on top */}
      {[false, true].map(renderSelected =>
        US_STATES.filter(s => selectedStates.includes(s.code) === renderSelected).map(s => {
          const selected  = selectedStates.includes(s.code);
          const hovered   = hoveredCode === s.code;
          const smallLabel = SMALL_STATES.has(s.code);

          return (
            <g key={s.code}>
              <path
                d={s.d}
                fill={getFill(s.code)}
                stroke={getStroke(s.code)}
                strokeWidth={getStrokeWidth(s.code)}
                strokeLinejoin="round"
                filter={
                  selected
                    ? mapStyle === "modern" ? "url(#selected-glow)" : undefined
                    : mapStyle === "modern" ? "url(#state-shadow)" : undefined
                }
                style={{
                  cursor: isInteractive ? "pointer" : "default",
                  transition: "fill 0.12s ease",
                }}
                onClick={() => onToggleState?.(s.code)}
                onMouseEnter={() => setHoveredCode(s.code)}
                onMouseLeave={() => setHoveredCode(null)}
              >
                <title>{s.name}{selected ? " ✓ (selected)" : " — click to toggle"}</title>
              </path>

              {/* State abbreviation label */}
              {showLabels && !smallLabel && (
                <text
                  x={s.lx}
                  y={s.ly + 3}
                  fontSize={s.code === "AK" || s.code === "HI" ? 8 : 7.5}
                  fontWeight={selected ? "700" : "500"}
                  fill={getLabelFill(s.code)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {s.code}
                </text>
              )}

              {/* Hover tooltip for small/dense NE states */}
              {hovered && smallLabel && (
                <g style={{ pointerEvents: "none" }}>
                  <rect
                    x={s.lx - 14} y={s.ly - 15}
                    width={28} height={13}
                    rx={3}
                    fill="rgba(0,0,0,0.75)"
                  />
                  <text
                    x={s.lx} y={s.ly - 5}
                    fontSize={7}
                    fill="#ffffff"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {s.code}
                  </text>
                </g>
              )}
            </g>
          );
        })
      )}
    </svg>
  );
}
