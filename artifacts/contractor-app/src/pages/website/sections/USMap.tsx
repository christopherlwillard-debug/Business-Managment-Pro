import { useState } from "react";
import { US_STATES, computeSelectedBBox } from "./USMapData";

interface USMapProps {
  selectedStates: string[];
  onToggleState?: (code: string) => void;
  highlightColor?: string;
  showLabels?: boolean;
  showBorders?: boolean;
  mapStyle?: "outline" | "filled" | "minimal" | "modern" | "dark" | "patriotic";
  className?: string;
  /** When true, zoom into only the selected states and hide everything else. */
  focusMode?: boolean;
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
  focusMode = false,
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

  // ── Focus mode: render only selected states zoomed in ──────────────────────
  if (focusMode && selectedStates.length > 0) {
    const { viewBox: focusViewBox } = computeSelectedBBox(selectedStates);
    const parts = focusViewBox.split(" ").map(Number);
    const vbW = parts[2];
    const vbH = parts[3];

    const INSET_CODES = new Set(["AK", "HI"]);
    const continental = selectedStates.filter(c => !INSET_CODES.has(c));
    const focusCodes  = continental.length > 0 ? continental : selectedStates;
    const focusStates = US_STATES.filter(s => focusCodes.includes(s.code));

    const strokeW  = Math.max(0.4, vbW / 250);
    const fontSize = Math.max(5, Math.min(14, vbW / 22));

    return (
      <svg
        viewBox={focusViewBox}
        className={`w-full h-auto select-none ${className}`}
        aria-label="Selected service states"
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        <defs>
          <filter id="focus-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="0" stdDeviation={vbW / 60} floodColor={brandColor} floodOpacity="0.40" />
          </filter>
          {/* Clip mask so the glow doesn't extend into the SVG background */}
          <clipPath id="focus-clip">
            {focusStates.map(s => (
              <path key={s.code} d={s.d} />
            ))}
          </clipPath>
        </defs>

        {/* Background fill — all states same color, no internal borders */}
        {focusStates.map(s => (
          <path
            key={s.code}
            d={s.d}
            fill={brandColor}
            stroke="none"
            filter="url(#focus-glow)"
            style={{
              cursor: isInteractive ? "pointer" : "default",
              transition: "opacity 0.12s ease",
              opacity: hoveredCode === s.code ? 0.85 : 1,
            }}
            onClick={() => onToggleState?.(s.code)}
            onMouseEnter={() => setHoveredCode(s.code)}
            onMouseLeave={() => setHoveredCode(null)}
          >
            <title>{s.name}</title>
          </path>
        ))}

        {/* Thin white stroke on each state path so touching states show a hairline border */}
        {focusStates.map(s => (
          <path
            key={`stroke-${s.code}`}
            d={s.d}
            fill="none"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={strokeW}
            strokeLinejoin="round"
            style={{ pointerEvents: "none" }}
          />
        ))}

        {/* Outer perimeter glow rectangle — gives the cluster a clean edge */}
        <rect
          x={parts[0]} y={parts[1]} width={vbW} height={vbH}
          fill="none"
          stroke={brandColor}
          strokeWidth={strokeW * 0.5}
          strokeOpacity={0}
        />

        {/* State abbreviation labels */}
        {showLabels && focusStates.map(s => (
          <text
            key={`label-${s.code}`}
            x={s.lx}
            y={s.ly + fontSize * 0.15}
            fontSize={fontSize}
            fontWeight="700"
            fill="#ffffff"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {s.code}
          </text>
        ))}
      </svg>
    );
  }

  // ── Standard full-USA map ──────────────────────────────────────────────────
  const akSelected = selectedStates.includes("AK");
  const hiSelected = selectedStates.includes("HI");

  // Inset border: visible only when the state is selected (for light styles);
  // dark/patriotic always keep a subtle structural border.
  function insetStroke(selected: boolean): string {
    if (selected) return brandColor;
    if (mapStyle === "dark")      return "#374151";
    if (mapStyle === "patriotic") return "#243b6e";
    return "transparent";
  }
  function insetStrokeWidth(selected: boolean): number {
    return selected ? 1.5 : 0.8;
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

      {/* Inset boxes — border only when the respective state is selected */}
      <rect x="0" y="440" width="252" height="142" rx="4"
        fill={mapStyle === "minimal" ? "transparent" : mapStyle === "dark" ? "#1e293b" : mapStyle === "patriotic" ? "#1e3a5f" : "#e5e7eb"}
        stroke={insetStroke(akSelected)}
        strokeWidth={insetStrokeWidth(akSelected)} />
      <rect x="254" y="500" width="120" height="84" rx="4"
        fill={mapStyle === "minimal" ? "transparent" : mapStyle === "dark" ? "#1e293b" : mapStyle === "patriotic" ? "#1e3a5f" : "#e5e7eb"}
        stroke={insetStroke(hiSelected)}
        strokeWidth={insetStrokeWidth(hiSelected)} />

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
