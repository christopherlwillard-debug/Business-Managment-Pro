import type { BlockStyle } from "./sections/BlockStyleWrapper";

// ── Tab identifiers ────────────────────────────────────────────────────────────
export type InspectorTab = "quick" | "content" | "style" | "layout" | "advanced";

// ── Field kind discriminated union (drives renderField() in InspectorPanel) ───
export type FieldKind =
  | { type: "color-text" }           // color swatch + hex input
  | { type: "color-only" }           // color swatch only
  | { type: "range"; min: number; max: number; step?: number; unit?: string }
  | { type: "select"; options: ReadonlyArray<readonly [string, string]> }
  | { type: "pills"; options: ReadonlyArray<readonly [string, string]> }
  | { type: "number"; min?: number; max?: number; step?: number; placeholder?: string }
  | { type: "toggle" }
  | { type: "text"; placeholder?: string }
  | { type: "font-picker" }
  | { type: "content-link" }         // shortcut → Content tab
  | { type: "section-visible" }      // section.enabled toggle (not a BlockStyle field)
  | { type: "padding-quad" }         // compound top+bottom quick sliders
  | { type: "bg-full" }              // full background editor (color/image/gradient)
  | { type: "shadow-preset" }        // preset pill row
  | { type: "animation-preset" };    // preset grid

// ── Field descriptor ──────────────────────────────────────────────────────────
export interface FieldDescriptor {
  id: string;
  label: string;
  /**
   * Primary tab where this field lives.
   * Fields with isCore:true also appear in Quick tab Core regardless of tab.
   */
  tab: InspectorTab;
  /** Accordion section label within the tab (optional). */
  section?: string;
  /** Show in Quick tab Core section. */
  isCore?: boolean;
  defaultValue?: unknown;
  kind: FieldKind;
  /** Read current value from BlockStyle. */
  getValue: (bs: BlockStyle) => unknown;
  /** Produce a BlockStyle patch from a new value. */
  setValue: (value: unknown) => Partial<BlockStyle>;
  /** Optional custom reset logic for compound fields (e.g. padding-quad). */
  resetOverride?: (patch: (p: Partial<BlockStyle>) => void) => void;
}

// ── Field registry ─────────────────────────────────────────────────────────────
export const ALL_FIELDS: FieldDescriptor[] = [

  // ─────────────────────────────────────────────────────────────────────────────
  // QUICK TAB — Core 8 (tab:"quick", isCore:true appear only in Quick Core)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "text", label: "Text Content", tab: "quick", isCore: true,
    defaultValue: "",
    kind: { type: "content-link" },
    getValue: () => undefined,
    setValue: () => ({}),
  },
  {
    id: "image", label: "Image", tab: "quick", isCore: true,
    defaultValue: "",
    kind: { type: "content-link" },
    getValue: () => undefined,
    setValue: () => ({}),
  },
  {
    id: "link", label: "Link URL", tab: "quick", isCore: true,
    defaultValue: "",
    kind: { type: "content-link" },
    getValue: () => undefined,
    setValue: () => ({}),
  },
  {
    id: "bg-color", label: "Background Color", tab: "quick", isCore: true,
    defaultValue: undefined,
    kind: { type: "color-text" },
    getValue: (bs) => bs.bgColor,
    setValue: (v) => ({ bgColor: (v as string) || undefined, bgType: v ? "color" : undefined }),
    resetOverride: (patch) => patch({ bgColor: undefined, bgType: undefined }),
  },
  {
    id: "padding", label: "Padding", tab: "quick", isCore: true,
    defaultValue: 0,
    kind: { type: "padding-quad" },
    getValue: (bs) => ({ top: bs.paddingTop ?? 0, bottom: bs.paddingBottom ?? 0 }),
    setValue: () => ({}),
    resetOverride: (patch) => patch({ paddingTop: undefined, paddingBottom: undefined }),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // LAYOUT TAB — also isCore so they appear in Quick
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "alignment", label: "Alignment", tab: "layout", isCore: true,
    defaultValue: undefined,
    kind: {
      type: "pills",
      options: [["left","Left"],["center","Center"],["right","Right"],["full","Full"]] as const,
    },
    getValue: (bs) => bs.alignment ?? "left",
    setValue: (v) => ({ alignment: (v as BlockStyle["alignment"]) || undefined }),
    resetOverride: (patch) => patch({ alignment: undefined }),
  },
  {
    id: "width", label: "Width / Max Width", tab: "layout", isCore: true,
    defaultValue: undefined,
    kind: { type: "range", min: 0, max: 1440, step: 40, unit: "px" },
    getValue: (bs) => bs.maxWidth ?? 0,
    setValue: (v) => ({ maxWidth: (v as number) || undefined }),
    resetOverride: (patch) => patch({ maxWidth: undefined }),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ADVANCED TAB — visibility is isCore so it appears in Quick too
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "visibility", label: "Visibility", tab: "advanced", isCore: true,
    defaultValue: true,
    kind: { type: "section-visible" },
    getValue: () => undefined,
    setValue: () => ({}),
    // resetOverride handled in InspectorPanel (needs onToggleSection callback)
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // STYLE TAB — Typography
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "font-family", label: "Font Family", tab: "style", section: "Typography",
    defaultValue: undefined,
    kind: { type: "font-picker" },
    getValue: (bs) => bs.fontFamily,
    setValue: (v) => ({ fontFamily: (v as string) || undefined }),
    resetOverride: (patch) => patch({ fontFamily: undefined }),
  },
  {
    id: "font-size", label: "Font Size (px)", tab: "style", section: "Typography",
    defaultValue: undefined,
    kind: { type: "number", min: 10, max: 96, placeholder: "Inherit" },
    getValue: (bs) => bs.fontSize,
    setValue: (v) => ({ fontSize: (v as number) || undefined }),
    resetOverride: (patch) => patch({ fontSize: undefined }),
  },
  {
    id: "font-weight", label: "Font Weight", tab: "style", section: "Typography",
    defaultValue: undefined,
    kind: {
      type: "select",
      options: [
        ["","Inherit"],["300","Light"],["400","Regular"],["500","Medium"],
        ["600","Semi-bold"],["700","Bold"],["800","Extra bold"],["900","Black"],
      ] as const,
    },
    getValue: (bs) => bs.fontWeight ?? "",
    setValue: (v) => ({ fontWeight: (v as string) || undefined }),
    resetOverride: (patch) => patch({ fontWeight: undefined }),
  },
  {
    id: "line-height", label: "Line Height", tab: "style", section: "Typography",
    defaultValue: undefined,
    kind: { type: "number", min: 1, max: 3, step: 0.1, placeholder: "Inherit" },
    getValue: (bs) => bs.lineHeight,
    setValue: (v) => ({ lineHeight: (v as number) || undefined }),
    resetOverride: (patch) => patch({ lineHeight: undefined }),
  },
  {
    id: "letter-spacing", label: "Letter Spacing", tab: "style", section: "Typography",
    defaultValue: undefined,
    kind: { type: "number", min: -2, max: 20, step: 0.5, placeholder: "0" },
    getValue: (bs) => bs.letterSpacing,
    setValue: (v) => ({ letterSpacing: (v as number) || undefined }),
    resetOverride: (patch) => patch({ letterSpacing: undefined }),
  },
  {
    id: "text-transform", label: "Text Transform", tab: "style", section: "Typography",
    defaultValue: "none",
    kind: {
      type: "pills",
      options: [["none","—"],["uppercase","AA"],["lowercase","aa"],["capitalize","Aa"]] as const,
    },
    getValue: (bs) => bs.textTransform ?? "none",
    setValue: (v) => ({ textTransform: (v as BlockStyle["textTransform"]) || undefined }),
    resetOverride: (patch) => patch({ textTransform: undefined }),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // STYLE TAB — Colors
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "text-color", label: "Text Color", tab: "style", section: "Colors",
    defaultValue: undefined,
    kind: { type: "color-text" },
    getValue: (bs) => bs.textColor,
    setValue: (v) => ({ textColor: (v as string) || undefined }),
    resetOverride: (patch) => patch({ textColor: undefined }),
  },
  {
    id: "accent-color", label: "Accent / Button Color", tab: "style", section: "Colors",
    defaultValue: undefined,
    kind: { type: "color-text" },
    getValue: (bs) => bs.accentColor,
    setValue: (v) => ({ accentColor: (v as string) || undefined }),
    resetOverride: (patch) => patch({ accentColor: undefined }),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // STYLE TAB — Backgrounds (complex — bg-full kind)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "background", label: "Background", tab: "style", section: "Backgrounds",
    defaultValue: undefined,
    kind: { type: "bg-full" },
    getValue: (bs) => bs.bgType,
    setValue: () => ({}),
    resetOverride: (patch) =>
      patch({
        bgType: undefined, bgColor: undefined, bgImageUrl: undefined,
        bgImageObjectPath: undefined, bgGradientFrom: undefined,
        bgGradientTo: undefined, bgGradientAngle: undefined,
        overlayColor: undefined, overlayOpacity: undefined,
      }),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // STYLE TAB — Borders
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "border-radius", label: "Border Radius", tab: "style", section: "Borders",
    defaultValue: 0,
    kind: { type: "range", min: 0, max: 48, unit: "px" },
    getValue: (bs) => bs.borderRadius ?? 0,
    setValue: (v) => ({ borderRadius: (v as number) || undefined }),
    resetOverride: (patch) => patch({ borderRadius: undefined }),
  },
  {
    id: "border-width", label: "Border Width", tab: "style", section: "Borders",
    defaultValue: 0,
    kind: { type: "range", min: 0, max: 16, unit: "px" },
    getValue: (bs) => bs.borderWidth ?? 0,
    setValue: (v) => ({ borderWidth: (v as number) || undefined }),
    resetOverride: (patch) => patch({ borderWidth: undefined }),
  },
  {
    id: "border-style", label: "Border Style", tab: "style", section: "Borders",
    defaultValue: "none",
    kind: {
      type: "select",
      options: [["none","None"],["solid","Solid"],["dashed","Dashed"],["dotted","Dotted"]] as const,
    },
    getValue: (bs) => bs.borderStyle ?? "none",
    setValue: (v) => ({ borderStyle: (v as BlockStyle["borderStyle"]) }),
    resetOverride: (patch) => patch({ borderStyle: undefined }),
  },
  {
    id: "border-color", label: "Border Color", tab: "style", section: "Borders",
    defaultValue: undefined,
    kind: { type: "color-only" },
    getValue: (bs) => bs.borderColor ?? "#e5e7eb",
    setValue: (v) => ({ borderColor: (v as string) || undefined }),
    resetOverride: (patch) => patch({ borderColor: undefined }),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // STYLE TAB — Shadows
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "shadow", label: "Shadow", tab: "style", section: "Shadows",
    defaultValue: "none",
    kind: { type: "shadow-preset" },
    getValue: (bs) => bs.shadow ?? "none",
    setValue: (v) => ({ shadow: (v as BlockStyle["shadow"]) }),
    resetOverride: (patch) => patch({ shadow: undefined }),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // LAYOUT TAB — Spacing
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "padding-top", label: "Padding Top", tab: "layout", section: "Spacing",
    defaultValue: 0,
    kind: { type: "range", min: 0, max: 200, unit: "px" },
    getValue: (bs) => bs.paddingTop ?? 0,
    setValue: (v) => ({ paddingTop: (v as number) || undefined }),
    resetOverride: (patch) => patch({ paddingTop: undefined }),
  },
  {
    id: "padding-right", label: "Padding Right", tab: "layout", section: "Spacing",
    defaultValue: 0,
    kind: { type: "range", min: 0, max: 100, unit: "px" },
    getValue: (bs) => bs.paddingRight ?? 0,
    setValue: (v) => ({ paddingRight: (v as number) || undefined }),
    resetOverride: (patch) => patch({ paddingRight: undefined }),
  },
  {
    id: "padding-bottom", label: "Padding Bottom", tab: "layout", section: "Spacing",
    defaultValue: 0,
    kind: { type: "range", min: 0, max: 200, unit: "px" },
    getValue: (bs) => bs.paddingBottom ?? 0,
    setValue: (v) => ({ paddingBottom: (v as number) || undefined }),
    resetOverride: (patch) => patch({ paddingBottom: undefined }),
  },
  {
    id: "padding-left", label: "Padding Left", tab: "layout", section: "Spacing",
    defaultValue: 0,
    kind: { type: "range", min: 0, max: 100, unit: "px" },
    getValue: (bs) => bs.paddingLeft ?? 0,
    setValue: (v) => ({ paddingLeft: (v as number) || undefined }),
    resetOverride: (patch) => patch({ paddingLeft: undefined }),
  },
  {
    id: "margin-top", label: "Margin Top", tab: "layout", section: "Spacing",
    defaultValue: 0,
    kind: { type: "range", min: 0, max: 200, unit: "px" },
    getValue: (bs) => bs.marginTop ?? 0,
    setValue: (v) => ({ marginTop: (v as number) || undefined }),
    resetOverride: (patch) => patch({ marginTop: undefined }),
  },
  {
    id: "margin-bottom", label: "Margin Bottom", tab: "layout", section: "Spacing",
    defaultValue: 0,
    kind: { type: "range", min: 0, max: 200, unit: "px" },
    getValue: (bs) => bs.marginBottom ?? 0,
    setValue: (v) => ({ marginBottom: (v as number) || undefined }),
    resetOverride: (patch) => patch({ marginBottom: undefined }),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // LAYOUT TAB — Sizing
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "min-height", label: "Min Height", tab: "layout", section: "Sizing",
    defaultValue: 0,
    kind: { type: "range", min: 0, max: 800, unit: "px" },
    getValue: (bs) => bs.minHeight ?? 0,
    setValue: (v) => ({ minHeight: (v as number) || undefined }),
    resetOverride: (patch) => patch({ minHeight: undefined }),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ADVANCED TAB
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "animation", label: "Animation", tab: "advanced",
    defaultValue: "none",
    kind: { type: "animation-preset" },
    getValue: (bs) => bs.animation ?? "none",
    setValue: (v) => ({ animation: (v as BlockStyle["animation"]) }),
    resetOverride: (patch) => patch({ animation: undefined }),
  },
  {
    id: "anchor-id", label: "Anchor ID", tab: "advanced",
    defaultValue: undefined,
    kind: { type: "text", placeholder: "e.g. contact-us" },
    getValue: (bs) => bs.anchorId ?? "",
    setValue: (v) => ({ anchorId: (v as string) || undefined }),
    resetOverride: (patch) => patch({ anchorId: undefined }),
  },
  {
    id: "css-class", label: "CSS Class", tab: "advanced",
    defaultValue: undefined,
    kind: { type: "text", placeholder: "e.g. my-custom-class" },
    getValue: (bs) => bs.customClass ?? "",
    setValue: (v) => ({ customClass: (v as string) || undefined }),
    resetOverride: (patch) => patch({ customClass: undefined }),
  },
  {
    id: "hide-mobile", label: "Hide on Mobile", tab: "advanced",
    defaultValue: false,
    kind: { type: "toggle" },
    getValue: (bs) => bs.hideOnMobile ?? false,
    setValue: (v) => ({ hideOnMobile: v as boolean }),
    resetOverride: (patch) => patch({ hideOnMobile: undefined }),
  },
  {
    id: "hide-tablet", label: "Hide on Tablet", tab: "advanced",
    defaultValue: false,
    kind: { type: "toggle" },
    getValue: (bs) => bs.hideOnTablet ?? false,
    setValue: (v) => ({ hideOnTablet: v as boolean }),
    resetOverride: (patch) => patch({ hideOnTablet: undefined }),
  },
  {
    id: "custom-attrs", label: "Custom Attributes (JSON)", tab: "advanced",
    defaultValue: undefined,
    kind: { type: "text", placeholder: '{"data-foo": "bar"}' },
    getValue: (bs) => bs.customAttrs ?? "",
    setValue: (v) => ({ customAttrs: (v as string) || undefined }),
    resetOverride: (patch) => patch({ customAttrs: undefined }),
  },
];

// ── Core fields (shown in Quick tab) ─────────────────────────────────────────
export const CORE_FIELDS = ALL_FIELDS.filter(f => f.isCore);

// ── localStorage helpers ──────────────────────────────────────────────────────
const PINS_KEY   = "inspector-pinned-v1";
const RECENT_KEY = "inspector-recent-v1";

export function getPinnedFields(): string[] {
  try { return JSON.parse(localStorage.getItem(PINS_KEY) ?? "[]"); } catch { return []; }
}

export function togglePin(id: string): string[] {
  const pins = getPinnedFields();
  const next = pins.includes(id) ? pins.filter(p => p !== id) : [...pins, id];
  try { localStorage.setItem(PINS_KEY, JSON.stringify(next)); } catch {}
  return next;
}

export function getRecentFields(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}

export function recordRecentField(id: string): void {
  const recent = getRecentFields().filter(r => r !== id);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recent].slice(0, 10))); } catch {}
}

export function getFieldById(id: string): FieldDescriptor | undefined {
  return ALL_FIELDS.find(f => f.id === id);
}

export function getFieldDefault(id: string): unknown {
  return ALL_FIELDS.find(f => f.id === id)?.defaultValue;
}
