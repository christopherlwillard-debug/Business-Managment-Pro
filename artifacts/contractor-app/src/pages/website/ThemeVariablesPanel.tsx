/**
 * ThemeVariablesPanel
 *
 * Standalone panel for all site-wide theme controls: colors, typography,
 * buttons, cards, forms, header/footer tints, and site assets. Includes
 * a live mini-preview strip so Willard can see the effect of each change
 * before committing.
 *
 * Phase 5 M7 — AI Color Assistant:
 *   The Colors accordion now has a "✨ Suggest Colors" button that calls
 *   POST /api/website/suggest-colors. If a logo is uploaded, dominant colors
 *   are extracted server-side (via sharp). If not, the user picks a base color.
 *   The response is shown as 4 swatch preview cards; clicking one calls
 *   patchSettings(suggestion.palette) through the existing theme system.
 */
import { useState } from "react";
import { ChevronRight, ImagePlus, Loader2, LayoutTemplate, Sparkles, CheckCircle2, X } from "lucide-react";
import type { SiteSettings } from "./website-types";
import { SITE_THEMES, HEADING_SCALES, BODY_SIZES } from "./themes";
import type { ThemeOverrides } from "./themes";
import { HEADING_FONTS, BODY_FONTS } from "./useFontLoader";
import { CustomDomainPanel } from "./CustomDomainPanel";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface ThemeVariablesPanelProps {
  settings: SiteSettings;
  patchSettings: (patch: Partial<SiteSettings>) => void;
  logoUploading: boolean;
  faviconUploading: boolean;
  handleLogoUpload: (file: File) => void;
  handleFaviconUpload: (file: File) => void;
  openResetPicker: () => void;
  onRegenerateWithAI?: () => void;
  publicUrl: string;
  appHost: string;
  onCopy: (text: string) => void;
  /** Business ID — used by the AI Color Assistant to fetch the logo from object storage. */
  bizId?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Toggle switch — shared across sections. */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
    </label>
  );
}

/** Collapsible accordion section. */
function Accordion({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details className="group border border-border rounded-lg overflow-hidden" open={defaultOpen}>
      <summary className="list-none flex items-center gap-1.5 px-4 py-3 cursor-pointer hover:bg-muted/50 select-none bg-card">
        <span className="text-sm font-semibold text-foreground flex-1">{title}</span>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-open:rotate-90 transition-transform flex-shrink-0" />
      </summary>
      <div className="px-4 pb-4 pt-2 space-y-3 bg-card">
        {children}
      </div>
    </details>
  );
}

/** Segmented button row. */
function SegmentRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { label: string; value: T; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1.5">{label}</label>
      <div className="flex gap-1.5">
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`flex-1 py-1.5 text-xs rounded transition-colors ${value === o.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Live preview strip ────────────────────────────────────────────────────────

function ThemePreviewStrip({ settings }: { settings: SiteSettings }) {
  const theme = settings.themeId ? SITE_THEMES.find(t => t.id === settings.themeId) : undefined;

  const primary   = settings.brandColor   ?? theme?.brandColor   ?? "#2563EB";
  const secondary = settings.secondaryColor ?? theme?.secondaryColor ?? "#1E40AF";
  const accent    = settings.accentColor  ?? theme?.accentColor  ?? "#60A5FA";
  const bg        = settings.bgColor      ?? theme?.bgColor      ?? "#ffffff";
  const surface   = settings.surfaceColor ?? theme?.surfaceColor ?? "#f8fafc";
  const text      = settings.textColor    ?? theme?.textColor    ?? "#0f172a";
  const muted     = settings.textMutedColor ?? theme?.textMutedColor ?? "#64748b";

  const btnRadius = settings.buttonRadius ?? theme?.buttonRadius ?? "9999px";
  const btnWeight = (settings.buttonFontWeight ?? theme?.buttonFontWeight ?? "600") as React.CSSProperties["fontWeight"];
  const btnShadow = settings.buttonShadow !== undefined ? settings.buttonShadow : (theme?.buttonShadow ?? false);

  const cardRadius = settings.cardRadius ?? theme?.cardRadius ?? "8px";
  const cardShadow = settings.cardShadow ?? theme?.cardShadow ?? "none";
  const cardBorder = settings.cardBorder !== undefined ? settings.cardBorder : (theme?.cardBorder ?? false);

  const headingFont = settings.headingFont ?? theme?.headingFont ?? "Inter";
  const bodyFont    = settings.bodyFont    ?? theme?.bodyFont    ?? "Inter";

  const headingScale = settings.headingSizeScale ?? theme?.headingSizeScale ?? "regular";
  const h2Size = HEADING_SCALES[headingScale]?.h2 ?? "2rem";

  const bodySize = BODY_SIZES[settings.baseFontSize ?? theme?.baseFontSize ?? "base"] ?? "1rem";

  return (
    <div
      className="rounded-xl overflow-hidden border border-border shadow-sm mb-1"
      style={{ backgroundColor: bg, fontFamily: `'${bodyFont}', system-ui, sans-serif`, fontSize: bodySize }}
    >
      {/* Colour swatch row */}
      <div className="flex h-6">
        {[primary, secondary, accent, bg, surface, text, muted].map((c, i) => (
          <div key={i} className="flex-1" style={{ backgroundColor: c }} title={c} />
        ))}
      </div>

      {/* Mini content preview */}
      <div className="px-4 py-3 space-y-3" style={{ backgroundColor: bg, color: text }}>
        {/* Heading */}
        <p
          className="font-bold leading-tight truncate"
          style={{ fontFamily: `'${headingFont}', system-ui, sans-serif`, fontSize: `calc(${h2Size} * 0.45)`, color: text }}
        >
          Your Business Name
        </p>

        {/* Button + card row */}
        <div className="flex items-start gap-3">
          {/* Sample button */}
          <span
            className="flex-shrink-0 text-white text-[10px] px-3 py-1.5 whitespace-nowrap"
            style={{
              backgroundColor: primary,
              borderRadius: btnRadius,
              fontWeight: btnWeight,
              boxShadow: btnShadow ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
            }}
          >
            Get a Quote
          </span>

          {/* Sample card */}
          <div
            className="flex-1 px-2.5 py-2 min-w-0"
            style={{
              backgroundColor: surface,
              borderRadius: cardRadius,
              boxShadow: cardShadow,
              border: cardBorder ? "1px solid #e5e7eb" : "none",
            }}
          >
            <p className="text-[10px] font-semibold truncate" style={{ color: text }}>Roof Replacement</p>
            <p className="text-[9px] truncate" style={{ color: muted }}>Full tear-off &amp; re-roof</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AI Color Suggestion Card ──────────────────────────────────────────────────

interface ColorSuggestion {
  id: string;
  name: string;
  description: string;
  swatchColors: string[];
  palette: ThemeOverrides;
}

function ColorSuggestionCard({
  suggestion,
  applied,
  onApply,
}: {
  suggestion: ColorSuggestion;
  applied: boolean;
  onApply: (palette: ThemeOverrides) => void;
}) {
  return (
    <div
      className={`rounded-xl border transition-all ${
        applied ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card hover:border-primary/40"
      }`}
    >
      {/* Swatch row */}
      <div className="flex h-8 rounded-t-xl overflow-hidden">
        {suggestion.swatchColors.map((c, i) => (
          <div key={i} className="flex-1" style={{ backgroundColor: c }} title={c} />
        ))}
      </div>

      {/* Info + apply */}
      <div className="px-3 py-2.5 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{suggestion.name}</p>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{suggestion.description}</p>
        </div>
        <button
          type="button"
          onClick={() => onApply(suggestion.palette)}
          className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
            applied
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground"
          }`}
        >
          {applied ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
          {applied ? "Applied" : "Apply"}
        </button>
      </div>
    </div>
  );
}

// ── AI Color Assistant panel ─────────────────────────────────────────────────

function AiColorAssistant({
  settings,
  bizId,
  onApply,
}: {
  settings: SiteSettings;
  bizId?: number;
  onApply: (palette: ThemeOverrides) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ColorSuggestion[]>([]);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [baseColor, setBaseColor] = useState(settings.brandColor ?? "#1a56db");

  const hasLogo = !!(settings.logoObjectPath || settings.logoUrl);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setAppliedId(null);
    try {
      const body: Record<string, unknown> = {};
      if (bizId && settings.logoObjectPath) {
        body.businessId = bizId;
      } else if (settings.logoUrl && /^https?:\/\//.test(settings.logoUrl)) {
        body.logoUrl = settings.logoUrl;
      } else if (bizId) {
        body.businessId = bizId;
      }
      if (!body.businessId && !body.logoUrl) {
        body.baseColor = baseColor;
      }

      const res = await fetch(`${BASE}/api/website/suggest-colors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Server error");
      const data = await res.json() as { suggestions: ColorSuggestion[] };
      setSuggestions(data.suggestions ?? []);
      setOpen(true);
    } catch {
      setError("Could not generate suggestions. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleApply(suggestion: ColorSuggestion) {
    onApply(suggestion.palette);
    setAppliedId(suggestion.id);
  }

  return (
    <div className="pt-2 border-t border-border mt-1">
      {/* Trigger row */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60 disabled:pointer-events-none"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {loading ? "Analyzing…" : hasLogo ? "Suggest from Logo" : "Suggest Colors"}
        </button>

        {/* Base color picker — shown when no logo is uploaded */}
        {!hasLogo && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Base:</span>
            <input
              type="color"
              value={baseColor}
              onChange={e => setBaseColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent"
              title="Pick a base color for suggestions"
            />
          </div>
        )}

        {/* Dismiss button when suggestions are shown */}
        {suggestions.length > 0 && (
          <button
            type="button"
            onClick={() => { setSuggestions([]); setOpen(false); setAppliedId(null); }}
            className="ml-auto text-muted-foreground hover:text-foreground p-1 rounded"
            title="Dismiss suggestions"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Error */}
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}

      {/* Suggestion cards */}
      {open && suggestions.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-muted-foreground font-medium">
            {hasLogo ? "Palettes from your logo — click to apply:" : "Palettes from your base color — click to apply:"}
          </p>
          {suggestions.map(s => (
            <ColorSuggestionCard
              key={s.id}
              suggestion={s}
              applied={appliedId === s.id}
              onApply={() => handleApply(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ThemeVariablesPanel({
  settings,
  patchSettings,
  logoUploading,
  faviconUploading,
  handleLogoUpload,
  handleFaviconUpload,
  openResetPicker,
  onRegenerateWithAI,
  publicUrl,
  appHost,
  onCopy,
  bizId,
}: ThemeVariablesPanelProps) {
  const theme = settings.themeId ? SITE_THEMES.find(t => t.id === settings.themeId) : undefined;

  /** Get the effective value for a settings key, falling back to the active theme. */
  function eff<K extends keyof SiteSettings>(key: K, fallback: SiteSettings[K]): SiteSettings[K] {
    return (settings[key] !== undefined ? settings[key] : (theme as SiteSettings | undefined)?.[key] ?? fallback) as SiteSettings[K];
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-xl mx-auto px-5 py-5 space-y-1.5">

        {/* Header */}
        <div className="mb-4">
          <h2 className="text-base font-bold text-foreground">Theme</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Colors, fonts, buttons and more — applied across your entire site.</p>
        </div>

        {/* Live preview */}
        <ThemePreviewStrip settings={settings} />

        {/* ── Colors ─────────────────────────────────────────────────────── */}
        <Accordion title="Colors" defaultOpen>
          {([
            { label: "Primary",     key: "brandColor"      as const },
            { label: "Secondary",   key: "secondaryColor"  as const },
            { label: "Accent",      key: "accentColor"     as const },
            { label: "Background",  key: "bgColor"         as const },
            { label: "Surface",     key: "surfaceColor"    as const },
            { label: "Text",        key: "textColor"       as const },
            { label: "Muted text",  key: "textMutedColor"  as const },
          ]).map(({ label, key }) => {
            const effectiveVal = (settings[key] as string | undefined) ?? (theme as Record<string, unknown> | undefined)?.[key] as string | undefined ?? "#888888";
            return (
              <div key={key} className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground flex-1">{label}</label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground font-mono">{effectiveVal.toUpperCase()}</span>
                  <input
                    type="color"
                    value={effectiveVal}
                    onChange={e => patchSettings({ [key]: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent flex-shrink-0"
                  />
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => patchSettings({ secondaryColor: theme?.secondaryColor, accentColor: theme?.accentColor, bgColor: theme?.bgColor, surfaceColor: theme?.surfaceColor, textColor: theme?.textColor, textMutedColor: theme?.textMutedColor, ...(theme ? { brandColor: theme.brandColor } : {}) })}
            className="text-xs text-muted-foreground hover:text-primary underline transition-colors mt-1"
          >
            Reset to theme defaults
          </button>

          {/* ── AI Color Assistant ─────────────────────────────────────── */}
          <AiColorAssistant
            settings={settings}
            bizId={bizId}
            onApply={palette => patchSettings(palette as Partial<SiteSettings>)}
          />
        </Accordion>

        {/* ── Typography ─────────────────────────────────────────────────── */}
        <Accordion title="Typography" defaultOpen>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Headings</label>
            <select
              value={eff("headingFont", "Inter") as string}
              onChange={e => patchSettings({ headingFont: e.target.value })}
              className="w-full text-sm border border-border rounded px-2 py-1.5 bg-background"
            >
              {HEADING_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Body text</label>
            <select
              value={eff("bodyFont", "Inter") as string}
              onChange={e => patchSettings({ bodyFont: e.target.value })}
              className="w-full text-sm border border-border rounded px-2 py-1.5 bg-background"
            >
              {BODY_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <SegmentRow
            label="Heading Scale"
            value={eff("headingSizeScale", "regular") as "compact" | "regular" | "large" | "xl"}
            options={([
              { label: "Compact", value: "compact" as const, title: `H1: ${HEADING_SCALES.compact.h1}` },
              { label: "Regular", value: "regular" as const, title: `H1: ${HEADING_SCALES.regular.h1}` },
              { label: "Large",   value: "large"   as const, title: `H1: ${HEADING_SCALES.large.h1}`   },
              { label: "XL",      value: "xl"       as const, title: `H1: ${HEADING_SCALES.xl.h1}`      },
            ])}
            onChange={v => patchSettings({ headingSizeScale: v })}
          />
          <SegmentRow
            label="Base Font Size"
            value={eff("baseFontSize", "base") as "sm" | "base" | "lg"}
            options={([
              { label: "Small",   value: "sm"   as const, title: BODY_SIZES.sm },
              { label: "Regular", value: "base" as const, title: BODY_SIZES.base },
              { label: "Large",   value: "lg"   as const, title: BODY_SIZES.lg },
            ])}
            onChange={v => patchSettings({ baseFontSize: v })}
          />
          <button
            type="button"
            onClick={() => patchSettings({ headingFont: theme?.headingFont, bodyFont: theme?.bodyFont, headingSizeScale: theme?.headingSizeScale, baseFontSize: theme?.baseFontSize })}
            className="text-xs text-muted-foreground hover:text-primary underline transition-colors"
          >
            Reset to theme defaults
          </button>
        </Accordion>

        {/* ── Buttons ────────────────────────────────────────────────────── */}
        <Accordion title="Buttons">
          <SegmentRow
            label="Shape"
            value={eff("buttonRadius", "9999px") as string}
            options={[
              { label: "Pill",   value: "9999px" },
              { label: "Round",  value: "8px"    },
              { label: "Slight", value: "4px"    },
              { label: "Sharp",  value: "0px"    },
            ]}
            onChange={v => patchSettings({ buttonRadius: v })}
          />
          <SegmentRow
            label="Weight"
            value={eff("buttonFontWeight", "600") as string}
            options={[
              { label: "400", value: "400" },
              { label: "500", value: "500" },
              { label: "600", value: "600" },
              { label: "700", value: "700" },
            ]}
            onChange={v => patchSettings({ buttonFontWeight: v })}
          />
          <div className="flex items-center justify-between">
            <label className="text-sm text-muted-foreground">Shadow</label>
            <Toggle
              checked={eff("buttonShadow", false) as boolean}
              onChange={v => patchSettings({ buttonShadow: v })}
            />
          </div>
          <button
            type="button"
            onClick={() => patchSettings({ buttonRadius: theme?.buttonRadius, buttonFontWeight: theme?.buttonFontWeight, buttonShadow: theme?.buttonShadow })}
            className="text-xs text-muted-foreground hover:text-primary underline transition-colors"
          >
            Reset to theme defaults
          </button>
        </Accordion>

        {/* ── Cards ──────────────────────────────────────────────────────── */}
        <Accordion title="Cards">
          <SegmentRow
            label="Radius"
            value={eff("cardRadius", "8px") as string}
            options={[
              { label: "Large", value: "16px" },
              { label: "Med",   value: "8px"  },
              { label: "Small", value: "4px"  },
              { label: "None",  value: "0px"  },
            ]}
            onChange={v => patchSettings({ cardRadius: v })}
          />
          <SegmentRow
            label="Shadow"
            value={eff("cardShadow", "none") as string}
            options={[
              { label: "None",   value: "none" },
              { label: "Soft",   value: "0 1px 4px rgba(0,0,0,0.08)" },
              { label: "Med",    value: "0 4px 12px rgba(0,0,0,0.12)" },
              { label: "Strong", value: "0 8px 24px rgba(0,0,0,0.18)" },
            ]}
            onChange={v => patchSettings({ cardShadow: v })}
          />
          <div className="flex items-center justify-between">
            <label className="text-sm text-muted-foreground">Border</label>
            <Toggle
              checked={eff("cardBorder", false) as boolean}
              onChange={v => patchSettings({ cardBorder: v })}
            />
          </div>
          <button
            type="button"
            onClick={() => patchSettings({ cardRadius: theme?.cardRadius, cardShadow: theme?.cardShadow, cardBorder: theme?.cardBorder })}
            className="text-xs text-muted-foreground hover:text-primary underline transition-colors"
          >
            Reset to theme defaults
          </button>
        </Accordion>

        {/* ── Forms ──────────────────────────────────────────────────────── */}
        <Accordion title="Forms">
          <SegmentRow
            label="Input Shape"
            value={eff("inputRadius", "8px") as string}
            options={[
              { label: "Pill",   value: "9999px" },
              { label: "Round",  value: "8px"    },
              { label: "Slight", value: "4px"    },
              { label: "Sharp",  value: "0px"    },
            ]}
            onChange={v => patchSettings({ inputRadius: v })}
          />
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground flex-1">Focus Ring</label>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground font-mono">
                {(settings.focusRingColor ?? settings.brandColor ?? "#2563EB").toUpperCase()}
              </span>
              <input
                type="color"
                value={settings.focusRingColor ?? settings.brandColor ?? "#2563EB"}
                onChange={e => patchSettings({ focusRingColor: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => patchSettings({ inputRadius: theme?.inputRadius, focusRingColor: undefined })}
            className="text-xs text-muted-foreground hover:text-primary underline transition-colors"
          >
            Reset to theme defaults
          </button>
        </Accordion>

        {/* ── Header & Footer ────────────────────────────────────────────── */}
        <Accordion title="Header &amp; Footer">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Header Style</label>
            <div className="flex gap-1.5">
              {(["light", "dark", "transparent"] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => patchSettings({ headerStyle: s })}
                  className={`flex-1 text-xs py-1.5 rounded border transition-colors capitalize ${
                    (settings.headerStyle ?? "light") === s
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-muted-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {([
            { label: "Header BG",    key: "headerBgColor"   as const, fallback: settings.bgColor    ?? "#ffffff"    },
            { label: "Header Text",  key: "headerTextColor" as const, fallback: settings.textColor  ?? "#111111"   },
            { label: "Header Links", key: "headerLinkColor" as const, fallback: settings.textMutedColor ?? "#4b5563" },
            { label: "Footer BG",    key: "footerBgColor"   as const, fallback: settings.brandColor ?? "#1f2937"   },
            { label: "Footer Text",  key: "footerTextColor" as const, fallback: "#ffffff"                           },
            { label: "Footer Links", key: "footerLinkColor" as const, fallback: "#ffffff"                           },
          ]).map(({ label, key, fallback }) => {
            const val = (settings[key] as string | undefined) ?? fallback;
            return (
              <div key={key} className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground flex-1">{label}</label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground font-mono">{val.toUpperCase()}</span>
                  <input
                    type="color"
                    value={val}
                    onChange={e => patchSettings({ [key]: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent flex-shrink-0"
                  />
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => patchSettings({ footerBgColor: undefined, footerTextColor: undefined, footerLinkColor: undefined, headerBgColor: undefined, headerTextColor: undefined, headerLinkColor: undefined })}
            className="text-xs text-muted-foreground hover:text-primary underline transition-colors mt-1"
          >
            Reset to theme defaults
          </button>
        </Accordion>

        {/* ── Assets ─────────────────────────────────────────────────────── */}
        <Accordion title="Assets">
          <div>
            <label className="text-sm text-muted-foreground block mb-1.5">Logo</label>
            {settings.logoUrl && (
              <img src={settings.logoUrl} alt="Logo preview" className="w-full h-12 object-contain rounded border border-border mb-2 bg-muted/30" />
            )}
            <label className={`flex items-center justify-center gap-1.5 w-full text-sm border border-border rounded px-3 py-2 cursor-pointer transition-colors hover:bg-muted ${logoUploading ? "opacity-60 pointer-events-none" : ""}`}>
              {logoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              {logoUploading ? "Uploading…" : settings.logoUrl ? "Replace Logo" : "Upload Logo"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={logoUploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }}
              />
            </label>
          </div>
          <div>
            <label className="text-sm text-muted-foreground block mb-1.5">Favicon</label>
            {settings.faviconUrl && (
              <img src={settings.faviconUrl} alt="Favicon" className="w-10 h-10 object-contain rounded border border-border mb-2 bg-muted/30" />
            )}
            <label className={`flex items-center justify-center gap-1.5 w-full text-sm border border-border rounded px-3 py-2 cursor-pointer transition-colors hover:bg-muted ${faviconUploading ? "opacity-60 pointer-events-none" : ""}`}>
              {faviconUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              {faviconUploading ? "Uploading…" : settings.faviconUrl ? "Replace Favicon" : "Upload Favicon"}
              <input
                type="file"
                accept="image/png,image/x-icon,image/svg+xml,image/jpeg"
                className="sr-only"
                disabled={faviconUploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFaviconUpload(f); e.target.value = ""; }}
              />
            </label>
          </div>
        </Accordion>

        {/* ── Apply template ──────────────────────────────────────────────── */}
        <div className="pt-1">
          <button
            type="button"
            onClick={openResetPicker}
            className="flex items-center justify-center gap-2 w-full text-sm border border-border rounded-lg px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <LayoutTemplate className="w-4 h-4" />
            Apply Template…
          </button>
          {onRegenerateWithAI && (
            <button
              type="button"
              onClick={onRegenerateWithAI}
              className="flex items-center justify-center gap-2 w-full text-sm border border-dashed border-purple-400/60 dark:border-purple-500/40 rounded-lg px-3 py-2.5 cursor-pointer transition-colors hover:bg-purple-50/60 dark:hover:bg-purple-900/20 text-purple-700 dark:text-purple-400 hover:border-purple-500"
            >
              <Sparkles className="w-4 h-4" />
              Regenerate with AI…
            </button>
          )}
        </div>

        {/* ── Custom domain ───────────────────────────────────────────────── */}
        <CustomDomainPanel
          customDomain={settings.customDomain ?? ""}
          appHost={appHost}
          siteUrl={publicUrl}
          onChange={domain => patchSettings({ customDomain: domain })}
          onCopy={onCopy}
        />
      </div>
    </div>
  );
}
