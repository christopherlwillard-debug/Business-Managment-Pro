import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronRight, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServiceAreaContent } from "./sections/ServiceAreaSection";
// ServiceAreaContent.displayMode now accepts "selected_only" as a 4th mode
import { REGIONS, STATE_CODE_TO_NAME, buildCaption, migrateAreas } from "./sections/USMapData";

interface Props {
  content: ServiceAreaContent;
  onChange: (patch: Partial<ServiceAreaContent>) => void;
}

// ── Map style swatch definitions ─────────────────────────────────────────────
const MAP_STYLE_SWATCHES: Array<{
  value: NonNullable<ServiceAreaContent["mapStyle"]>;
  label: string;
  base: string;
  highlight: string; // fixed highlight for preview only; actual uses brandColor unless overridden
}> = [
  { value: "outline",   label: "Classic",   base: "#f1f5f9", highlight: "#2563eb" },
  { value: "minimal",   label: "Minimal",   base: "#ffffff", highlight: "#94a3b8" },
  { value: "filled",    label: "Filled",    base: "#e2e8f0", highlight: "#2563eb" },
  { value: "modern",    label: "Modern",    base: "#d1d5db", highlight: "#2563eb" },
  { value: "dark",      label: "Dark",      base: "#1e293b", highlight: "#38bdf8" },
  { value: "patriotic", label: "Patriotic", base: "#1e3a5f", highlight: "#dc2626" },
];

// ── Collapsible section ──────────────────────────────────────────────────────
function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-xs font-medium text-foreground/80">{title}</span>
        {open
          ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
          : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      </button>
      {open && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-foreground">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30"
        )}
      >
        <span
          className={cn(
            "inline-block h-3 w-3 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-3.5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

// ── Main inspector ────────────────────────────────────────────────────────────

export function CoverageMapInspector({ content, onChange }: Props) {
  const [stateSearch, setStateSearch] = useState("");

  const migrated = useMemo(() => migrateAreas(content.areas ?? []), [content.areas]);
  const selectedStates: string[] = content.selectedStates ?? migrated.selectedStates;
  const freeformAreas: string[] = content.selectedStates !== undefined
    ? (content.areas ?? [])
    : migrated.areas;

  const displayMode   = content.displayMode ?? "both";
  const mapStyle      = content.mapStyle ?? "outline";
  const ctaActionType = content.ctaActionType ?? "button";

  function toggleState(code: string) {
    const next = selectedStates.includes(code)
      ? selectedStates.filter(c => c !== code)
      : [...selectedStates, code];
    onChange({ selectedStates: next });
  }

  function addArea(text = "New Location") {
    onChange({ areas: [...freeformAreas, text] });
  }

  function updateArea(idx: number, val: string) {
    const next = [...freeformAreas];
    next[idx] = val;
    onChange({ areas: next });
  }

  function removeArea(idx: number) {
    onChange({ areas: freeformAreas.filter((_, i) => i !== idx) });
  }

  const q = stateSearch.toLowerCase().trim();
  const autoCaption = buildCaption(selectedStates);

  // For swatch preview: use custom highlight or blue as preview base
  const userHighlight = content.highlightColor ?? "#2563eb";

  return (
    <div className="flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-border">
        <p className="text-xs font-semibold text-foreground">Coverage Map</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {selectedStates.length === 0
            ? "No states selected — click states on the map or check below"
            : `${selectedStates.length} state${selectedStates.length !== 1 ? "s" : ""} selected`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── 📍 States ──────────────────────────────────────── */}
        <Section title="📍 States" defaultOpen>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Filter states…"
              value={stateSearch}
              onChange={e => setStateSearch(e.target.value)}
              className="w-full pl-6 pr-2 py-1 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {stateSearch && (
              <button
                type="button"
                onClick={() => setStateSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Quick-select region buttons */}
          {!q && (
            <div className="flex flex-wrap gap-1 mb-1">
              <button
                type="button"
                onClick={() => onChange({ selectedStates: [] })}
                className="text-[9px] px-1.5 py-0.5 rounded border border-border hover:bg-muted text-muted-foreground"
              >
                Clear all
              </button>
              {REGIONS.map(r => (
                <button
                  key={r.name}
                  type="button"
                  onClick={() => onChange({ selectedStates: [...new Set([...selectedStates, ...r.codes])] })}
                  className="text-[9px] px-1.5 py-0.5 rounded border border-border hover:bg-primary/10 hover:text-primary hover:border-primary/40 text-muted-foreground transition-colors"
                  title={`Select all ${r.name} states`}
                >
                  + {r.name}
                </button>
              ))}
            </div>
          )}

          {/* Checkbox list grouped by region */}
          <div className="space-y-3 max-h-64 overflow-y-auto pr-0.5">
            {REGIONS.map(region => {
              const visible = region.codes.filter(code => {
                if (!q) return true;
                return (
                  code.toLowerCase().includes(q) ||
                  (STATE_CODE_TO_NAME[code] ?? "").toLowerCase().includes(q)
                );
              });
              if (visible.length === 0) return null;
              return (
                <div key={region.name}>
                  {!q && (
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">
                      {region.name}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-0.5">
                    {visible.map(code => {
                      const checked = selectedStates.includes(code);
                      return (
                        <label
                          key={code}
                          className={cn(
                            "flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer transition-colors text-xs",
                            checked
                              ? "bg-primary/10 text-primary font-medium"
                              : "hover:bg-muted text-foreground"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleState(code)}
                            className="w-3 h-3 accent-primary"
                          />
                          <span className="font-mono text-[10px] font-bold">{code}</span>
                          <span className="text-[10px] truncate opacity-70">
                            {STATE_CODE_TO_NAME[code]}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {q && REGIONS.every(r =>
              r.codes.filter(c =>
                c.toLowerCase().includes(q) ||
                (STATE_CODE_TO_NAME[c] ?? "").toLowerCase().includes(q)
              ).length === 0
            ) && (
              <p className="text-xs text-muted-foreground text-center py-2">
                No states match "{stateSearch}"
              </p>
            )}
          </div>
        </Section>

        {/* ── 🎨 Appearance ──────────────────────────────────── */}
        <Section title="🎨 Appearance">
          {/* Display mode */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Show</p>
            <div className="grid grid-cols-2 gap-1">
              {(["both", "map", "list", "selected_only"] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChange({ displayMode: m })}
                  className={cn(
                    "py-1 text-[10px] font-medium rounded border transition-colors",
                    displayMode === m
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {m === "both"          ? "Map + List"
                   : m === "map"         ? "Map Only"
                   : m === "list"        ? "List Only"
                   : "Selected States ✦"}
                </button>
              ))}
            </div>
          </div>

          {/* Caption */}
          {(displayMode === "map" || displayMode === "both") && (
            <div className="space-y-1.5">
              <ToggleRow
                label="Show caption"
                checked={!content.captionHidden}
                onChange={v => onChange({ captionHidden: !v })}
              />
              {!content.captionHidden && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-0.5">Caption text</p>
                  <input
                    type="text"
                    className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    value={content.captionText ?? ""}
                    placeholder={autoCaption || "Auto-generated from selected states"}
                    onChange={e => onChange({ captionText: e.target.value || undefined })}
                  />
                  {content.captionText && (
                    <button
                      type="button"
                      onClick={() => onChange({ captionText: undefined })}
                      className="text-[10px] text-primary hover:underline mt-0.5"
                    >
                      Reset to auto
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Map style swatches — 3×2 visual grid */}
          {(displayMode === "map" || displayMode === "both") && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">Map style</p>
              <div className="grid grid-cols-3 gap-1.5">
                {MAP_STYLE_SWATCHES.map(opt => {
                  const isSelected = mapStyle === opt.value;
                  // Use user's highlight color for styles that respond to it
                  const previewHighlight =
                    opt.value === "patriotic" ? opt.highlight :
                    opt.value === "dark"      ? opt.highlight :
                    opt.value === "minimal"   ? userHighlight :
                    userHighlight;

                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onChange({ mapStyle: opt.value })}
                      className={cn(
                        "rounded border transition-all p-1.5 flex flex-col items-center gap-1",
                        isSelected
                          ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                          : "border-border hover:border-muted-foreground/40"
                      )}
                    >
                      {/* Mini color preview: base fill + highlight stripe */}
                      <div
                        className="w-full rounded overflow-hidden border border-border/40 flex flex-col"
                        style={{ height: 28 }}
                      >
                        <div className="flex-1" style={{ backgroundColor: opt.base }} />
                        <div style={{ height: 8, backgroundColor: previewHighlight }} />
                      </div>
                      <span className={cn(
                        "text-[9px] font-medium leading-none",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )}>
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Section>

        {/* ── 🔘 CTA ─────────────────────────────────────────── */}
        <Section title="🔘 CTA">
          {/* Action type segmented control */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Action type</p>
            <div className="grid grid-cols-4 gap-0.5">
              {(["button", "phone", "form", "directions"] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    const patch: Partial<ServiceAreaContent> = { ctaActionType: type };
                    if (type === "form") patch.ctaUrl = "#contact";
                    onChange(patch);
                  }}
                  className={cn(
                    "py-1 text-[9px] font-medium rounded border transition-colors",
                    ctaActionType === type
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {type === "button"     ? "Button" :
                   type === "phone"      ? "Phone" :
                   type === "form"       ? "Form" :
                   "Maps"}
                </button>
              ))}
            </div>
          </div>

          {/* Button text */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Button text</p>
            <input
              type="text"
              className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              value={content.ctaText ?? ""}
              placeholder={
                ctaActionType === "phone"      ? "Call Us Now" :
                ctaActionType === "form"       ? "Get a Free Estimate" :
                ctaActionType === "directions" ? "Get Directions" :
                "Request a Free Estimate"
              }
              onChange={e => onChange({ ctaText: e.target.value || undefined })}
            />
          </div>

          {/* Conditional second field based on action type */}
          {ctaActionType === "phone" && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Phone number</p>
              <input
                type="tel"
                className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                value={content.ctaUrl ?? ""}
                placeholder="(555) 867-5309"
                onChange={e => onChange({ ctaUrl: e.target.value || undefined })}
              />
            </div>
          )}

          {ctaActionType === "form" && (
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Button scrolls the visitor down to the contact form on this page.
            </p>
          )}

          {ctaActionType === "directions" && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Google Maps URL</p>
              <input
                type="url"
                className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                value={content.ctaUrl ?? ""}
                placeholder="https://maps.google.com/?q=your+business"
                onChange={e => onChange({ ctaUrl: e.target.value || undefined })}
              />
            </div>
          )}

          {ctaActionType === "button" && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Button URL</p>
              <input
                type="text"
                className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                value={content.ctaUrl ?? ""}
                placeholder="#contact"
                onChange={e => onChange({ ctaUrl: e.target.value || undefined })}
              />
            </div>
          )}
        </Section>

        {/* ── 📍 Radius Circle ────────────────────────────────── */}
        <Section title="📍 Radius Circle">
          <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
            Show your exact service radius as a circle on a map. Enter a center city and radius in miles.
          </p>
          <div className="space-y-2">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Coverage display</p>
              <div className="grid grid-cols-2 gap-1">
                {(["states", "radius"] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onChange({ radiusMode: mode })}
                    aria-pressed={(content.radiusMode ?? "states") === mode}
                    className={cn(
                      "py-1 text-[10px] font-medium rounded border transition-colors",
                      (content.radiusMode ?? "states") === mode
                        ? "bg-primary/10 border-primary/40 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {mode === "states" ? "States" : "Radius"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Center city / address</label>
              <input
                type="text"
                placeholder="e.g. Louisville, KY"
                value={content.radiusCity ?? ""}
                onChange={e => onChange({ radiusCity: e.target.value || undefined })}
                className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Radius (miles)</label>
              <input
                type="number"
                min={1}
                max={500}
                step={5}
                placeholder="e.g. 50"
                value={content.serviceRadius ?? ""}
                onChange={e => {
                  const val = parseInt(e.target.value, 10);
                  onChange({ serviceRadius: isNaN(val) ? undefined : val });
                }}
                className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {content.serviceRadius && content.radiusCity && (
              <button
                type="button"
                onClick={() => onChange({ serviceRadius: undefined, radiusCity: undefined })}
                className="text-[10px] text-destructive hover:underline"
              >
                Remove radius circle
              </button>
            )}
          </div>
        </Section>

        {/* ── ⚙ Advanced ─────────────────────────────────────── */}
        <Section title="⚙ Advanced">
          {/* Custom freeform entries */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1 leading-relaxed">
              Freeform entries like "Nationwide Travel" that don't map to a state.
            </p>
            <div className="space-y-1 mb-1.5">
              {freeformAreas.map((area, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <input
                    className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    value={area}
                    onChange={e => updateArea(idx, e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeArea(idx)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => addArea()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted w-full px-2 py-1 rounded border border-dashed border-border transition-colors"
            >
              <Plus className="w-3 h-3" /> Add custom entry
            </button>
          </div>

          {/* Labels / borders toggles */}
          <ToggleRow
            label="Show state labels"
            checked={content.showLabels !== false}
            onChange={v => onChange({ showLabels: v })}
          />
          <ToggleRow
            label="Show state borders"
            checked={content.showBorders !== false}
            onChange={v => onChange({ showBorders: v })}
          />

          {/* Highlight color */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground">Highlight color</span>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={content.highlightColor ?? "#2563eb"}
                onChange={e => onChange({ highlightColor: e.target.value })}
                className="w-6 h-6 rounded border border-border cursor-pointer p-0"
              />
              {content.highlightColor && (
                <button
                  type="button"
                  onClick={() => onChange({ highlightColor: undefined })}
                  className="text-[10px] text-primary hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </Section>

      </div>
    </div>
  );
}
