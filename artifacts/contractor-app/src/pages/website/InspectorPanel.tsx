import { useState, useRef, useEffect } from "react";
import {
  Search, X, ChevronDown, ImagePlus, Loader2, Images,
  Copy, ClipboardPaste, Eye, EyeOff, ChevronsLeft, ChevronsRight, Layers,
  Trash2, RotateCcw,
} from "lucide-react";
import type { BlockStyle } from "./sections/BlockStyleWrapper";
import type { SiteComponent } from "./sections/ContentSection";
import type { RowSectionData } from "./sections/RowSection";
import { ComponentEditorPanel } from "./ComponentEditorPanel";
import { RowEditorPanel } from "./RowEditorPanel";
import {
  ALL_FIELDS, type InspectorTab, type FieldDescriptor,
  getPinnedFields, togglePin, getRecentFields, recordRecentField,
} from "./inspectorFields";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SectionInfo {
  id: string;
  type: string;
  enabled: boolean;
  blockStyle?: BlockStyle;
  content?: Record<string, unknown>;
}

export interface InspectorPanelProps {
  pageName: string;
  section: SectionInfo;
  selectedComponent?: SiteComponent;
  rowData?: RowSectionData;
  selectedRowColumnId?: string;
  onChangeBlockStyle: (bs: BlockStyle) => void;
  onBgImageUpload: (file: File) => void;
  isBgUploading: boolean;
  onOpenMediaLibrary: (onSelect: (url: string) => void) => void;
  copiedStyle: BlockStyle | null;
  onCopyStyle: () => void;
  onPasteStyle: () => void;
  onApplyStyleTo: (scope: "section" | "page" | "site", style: BlockStyle) => void;
  onToggleSection: () => void;
  onDuplicateSection: () => void;
  onDeleteSection: () => void;
  onChangeComponent?: (comp: SiteComponent) => void;
  onComponentImageUpload?: (file: File) => Promise<string>;
  onChangeRowData?: (data: RowSectionData) => void;
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  autoCollapsed?: boolean;
  onClearAutoCollapse?: () => void;
  specialContent?: React.ReactNode;
  initialTab?: { tab: InspectorTab; id: number };
  /** Sub-element selected via double-click drill-down.  Shown in breadcrumb. */
  selectedSubElement?: { type: string; label: string } | null;
  /** Called when the user clicks the breadcrumb sub-element crumb to step back up. */
  onClearSubElement?: () => void;
}

// ── Context passed into every field renderer ───────────────────────────────────

interface FieldCtx {
  bs: BlockStyle;
  patch: (p: Partial<BlockStyle>) => void;
  trackRecent: (id: string) => void;
  sectionEnabled: boolean;
  onToggleSection: () => void;
  switchToAccordion: (acc: AccordionId) => void;
  handlePin: (id: string) => void;
  pins: string[];
  onOpenMediaLibrary: (cb: (url: string) => void) => void;
  onBgImageUpload: (file: File) => void;
  isBgUploading: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PANEL_WIDTH_KEY = "inspector-panel-width";

const ACC_KEYS = {
  content:  "insp-acc-content",
  style:    "insp-acc-style",
  layout:   "insp-acc-layout",
  advanced: "insp-acc-advanced",
};

const STYLE_SUB_KEYS = {
  Typography:  "insp-acc-style-typography",
  Colors:      "insp-acc-style-colors",
  Backgrounds: "insp-acc-style-backgrounds",
  Borders:     "insp-acc-style-borders",
  Shadows:     "insp-acc-style-shadows",
};

const LAYOUT_SUB_KEYS = {
  "": "insp-acc-layout-align",
  Spacing: "insp-acc-layout-spacing",
  Sizing:  "insp-acc-layout-sizing",
};

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero Banner", services: "Services", about: "About Us",
  contact: "Contact Form", footer: "Footer", portfolio: "Portfolio",
  deposit: "Pay Deposit", content: "Content Block", row: "Row",
  text: "Text Block", gallery: "Gallery", columns: "Columns",
  testimonials: "Testimonials", faq: "FAQ", cta: "CTA", stats: "Stats",
};

const FONT_OPTIONS = [
  "Inter","Roboto","Open Sans","Lato","Montserrat","Poppins",
  "Playfair Display","Merriweather","Georgia","Times New Roman","Arial","Helvetica",
];

const STYLE_SECTION_ORDER = ["Typography","Colors","Backgrounds","Borders","Shadows"];
const LAYOUT_SECTION_ORDER = ["","Spacing","Sizing"];

/** Every sub-section storage key — used to bulk-reset on auto-expand. */
const ALL_STYLE_SUB_KEYS = [
  ...Object.values(STYLE_SUB_KEYS),
  "insp-acc-style-layout-adv",
  ...Object.values(LAYOUT_SUB_KEYS),
  "insp-acc-row-layout",
] as const;

type AccordionId = "content" | "style" | "layout" | "advanced"; // layout/advanced fold into Style

// ── localStorage helpers ───────────────────────────────────────────────────────

function readAccordion(key: string, defaultVal: boolean): boolean {
  try {
    const s = localStorage.getItem(key);
    return s !== null ? s === "true" : defaultVal;
  } catch { return defaultVal; }
}

function writeAccordion(key: string, val: boolean) {
  try { localStorage.setItem(key, String(val)); } catch {}
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function SliderRow({
  label, value, min, max, unit = "px", onChange,
}: { label: string; value: number | undefined; min: number; max: number; unit?: string; onChange: (v: number) => void }) {
  const v = value ?? min;
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1.5">
        <label className="text-xs text-muted-foreground">{label}</label>
        <span className="text-xs font-mono tabular-nums text-foreground">{v}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={v}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 appearance-none rounded-full cursor-pointer bg-border accent-primary" />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" className="sr-only peer" checked={checked}
        onChange={e => onChange(e.target.checked)} />
      <div className="w-8 h-4 bg-muted peer-focus:outline-none rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
    </label>
  );
}

// AccordionBlock — supports both uncontrolled (storageKey) and controlled (open/onToggle) modes
function AccordionBlock({
  title, defaultOpen = false, storageKey,
  open: externalOpen, onToggle: externalToggle,
  children, action,
}: {
  title: string;
  defaultOpen?: boolean;
  storageKey?: string;
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const isControlled = externalOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(() =>
    storageKey ? readAccordion(storageKey, defaultOpen) : defaultOpen
  );
  const open = isControlled ? externalOpen! : internalOpen;

  function toggle() {
    if (isControlled) {
      externalToggle?.();
    } else {
      const next = !internalOpen;
      setInternalOpen(next);
      if (storageKey) writeAccordion(storageKey, next);
    }
  }

  return (
    <div className="border-b border-border">
      <button type="button" onClick={toggle}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 transition-colors select-none">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{title}</span>
        <div className="flex items-center gap-1">
          {action}
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {/* CSS grid trick: animates from 0fr → 1fr for smooth height transition */}
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── FieldWrap ──────────────────────────────────────────────────────────────────

function FieldWrap({ fieldId, label, onPin, pinned, onReset, children }: {
  fieldId: string; label: string;
  onPin?: (id: string) => void; pinned?: boolean;
  onReset?: () => void; children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div className="mb-3 group" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        <div className={`flex items-center gap-0.5 transition-opacity ${hover ? "opacity-100" : "opacity-0"}`}>
          {onReset && (
            <button type="button" onClick={onReset} title="Reset to default"
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <RotateCcw className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Individual field renderers ────────────────────────────────────────────────

function renderField(f: FieldDescriptor, ctx: FieldCtx): React.ReactNode {
  const { bs, patch, trackRecent, onOpenMediaLibrary, onBgImageUpload, isBgUploading } = ctx;

  function change(val: unknown) {
    trackRecent(f.id);
    patch(f.setValue(val));
  }

  const k = f.kind;

  if (k.type === "content-link") {
    return (
      <button type="button" onClick={() => ctx.switchToAccordion("content")}
        className="w-full text-left px-2 py-1.5 text-xs rounded bg-muted/60 hover:bg-muted text-primary font-medium transition-colors">
        → Go to Content
      </button>
    );
  }

  if (k.type === "section-visible") {
    return (
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Section visible</span>
        <Toggle checked={ctx.sectionEnabled} onChange={() => ctx.onToggleSection()} />
      </div>
    );
  }

  if (k.type === "color-text" || k.type === "color-only") {
    const val = (f.getValue(bs) as string | undefined) ?? "";
    return (
      <div className="flex items-center gap-2">
        <input type="color" value={val || "#000000"}
          onChange={e => change(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent flex-shrink-0" />
        {k.type === "color-text" && (
          <input type="text" value={val} onChange={e => change(e.target.value)}
            placeholder="#000000"
            className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono" />
        )}
      </div>
    );
  }

  if (k.type === "range") {
    const val = (f.getValue(bs) as number | undefined) ?? k.min;
    return (
      <SliderRow label="" value={val} min={k.min} max={k.max} unit={k.unit}
        onChange={v => change(k.step && k.step < 1 ? v : v)} />
    );
  }

  if (k.type === "number") {
    const val = (f.getValue(bs) as number | undefined) ?? "";
    return (
      <input type="number" value={val} min={k.min} max={k.max} step={k.step ?? 1}
        placeholder={k.placeholder}
        onChange={e => change(e.target.value === "" ? undefined : parseFloat(e.target.value))}
        className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
    );
  }

  if (k.type === "select") {
    const val = (f.getValue(bs) as string | undefined) ?? "";
    return (
      <select value={val} onChange={e => change(e.target.value)}
        className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary">
        {k.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
  }

  if (k.type === "pills") {
    const val = (f.getValue(bs) as string | undefined) ?? "";
    return (
      <div className="flex gap-1 flex-wrap">
        {k.options.map(([v, l]) => (
          <button key={v} type="button" onClick={() => change(v)}
            className={`px-2.5 py-1 text-xs rounded border transition-colors ${val === v ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
            {l}
          </button>
        ))}
      </div>
    );
  }

  if (k.type === "toggle") {
    const val = (f.getValue(bs) as boolean | undefined) ?? false;
    return (
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{f.label}</span>
        <Toggle checked={val} onChange={v => change(v)} />
      </div>
    );
  }

  if (k.type === "text") {
    const val = (f.getValue(bs) as string | undefined) ?? "";
    return (
      <input type="text" value={val} placeholder={k.placeholder}
        onChange={e => change(e.target.value)}
        className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
    );
  }

  if (k.type === "font-picker") {
    const val = (f.getValue(bs) as string | undefined) ?? "";
    return (
      <select value={val} onChange={e => change(e.target.value)}
        className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        style={{ fontFamily: val || "inherit" }}>
        <option value="">Inherit</option>
        {FONT_OPTIONS.map(fn => <option key={fn} value={fn} style={{ fontFamily: fn }}>{fn}</option>)}
      </select>
    );
  }

  if (k.type === "padding-quad") {
    const vals = f.getValue(bs) as { top: number; bottom: number };
    return (
      <div className="space-y-1.5">
        <SliderRow label="Top" value={vals.top} min={0} max={200}
          onChange={v => patch({ paddingTop: v || undefined })} />
        <SliderRow label="Bottom" value={vals.bottom} min={0} max={200}
          onChange={v => patch({ paddingBottom: v || undefined })} />
      </div>
    );
  }

  if (k.type === "bg-full") {
    const bgType = (bs.bgType ?? "color") as string;
    return (
      <div className="space-y-2">
        <div className="flex gap-1">
          {(["color","image","gradient"] as const).map(t => (
            <button key={t} type="button" onClick={() => patch({ bgType: t })}
              className={`flex-1 py-1 text-[10px] rounded border transition-colors capitalize ${bgType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
              {t}
            </button>
          ))}
        </div>
        {bgType === "color" && (
          <div className="flex items-center gap-2">
            <input type="color" value={bs.bgColor || "#ffffff"}
              onChange={e => patch({ bgColor: e.target.value, bgType: "color" })}
              className="w-7 h-7 rounded cursor-pointer border border-border" />
            <input type="text" value={bs.bgColor ?? ""} placeholder="#ffffff"
              onChange={e => patch({ bgColor: e.target.value || undefined, bgType: "color" })}
              className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none font-mono" />
          </div>
        )}
        {bgType === "image" && (
          <div className="space-y-1.5">
            {bs.bgImageUrl && <img src={bs.bgImageUrl} alt="" className="w-full h-16 object-cover rounded border border-border" />}
            <div className="flex gap-1">
              <label className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs border border-border rounded cursor-pointer hover:bg-muted transition-colors ${isBgUploading ? "opacity-60 pointer-events-none" : ""}`}>
                {isBgUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                {isBgUploading ? "Uploading…" : "Upload"}
                <input type="file" accept="image/*" className="sr-only" disabled={isBgUploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) { onBgImageUpload(f); trackRecent(f.name); } e.target.value = ""; }} />
              </label>
              <button type="button" onClick={() => onOpenMediaLibrary(url => patch({ bgImageUrl: url, bgType: "image" }))}
                className="flex items-center gap-1 px-2 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">
                <Images className="w-3 h-3" /> Library
              </button>
            </div>
            {bs.bgImageUrl && (
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Overlay opacity</label>
                <div className="flex gap-1.5">
                  <input type="color" value={bs.overlayColor || "#000000"}
                    onChange={e => patch({ overlayColor: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-border" />
                  <input type="range" min={0} max={100} value={(bs.overlayOpacity ?? 0) * 100}
                    onChange={e => patch({ overlayOpacity: parseInt(e.target.value) / 100 })}
                    className="flex-1 h-1.5 appearance-none rounded-full cursor-pointer accent-primary" />
                  <span className="text-[10px] text-muted-foreground w-6 text-right tabular-nums">{Math.round((bs.overlayOpacity ?? 0) * 100)}%</span>
                </div>
              </div>
            )}
          </div>
        )}
        {bgType === "gradient" && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground w-8">From</label>
              <input type="color" value={bs.bgGradientFrom || "#3b82f6"}
                onChange={e => patch({ bgGradientFrom: e.target.value, bgType: "gradient" })}
                className="w-7 h-7 rounded cursor-pointer border border-border" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground w-8">To</label>
              <input type="color" value={bs.bgGradientTo || "#8b5cf6"}
                onChange={e => patch({ bgGradientTo: e.target.value, bgType: "gradient" })}
                className="w-7 h-7 rounded cursor-pointer border border-border" />
            </div>
            <SliderRow label="Angle" value={bs.bgGradientAngle ?? 135} min={0} max={360} unit="°"
              onChange={v => patch({ bgGradientAngle: v, bgType: "gradient" })} />
          </div>
        )}
      </div>
    );
  }

  if (k.type === "shadow-preset") {
    const val = (f.getValue(bs) as string | undefined) ?? "none";
    const presets: { label: string; value: BlockStyle["shadow"] }[] = [
      { label: "None",   value: "none" },
      { label: "Sm",     value: "sm" },
      { label: "Md",     value: "md" },
      { label: "Lg",     value: "lg" },
      { label: "XL",     value: "xl" },
    ];
    return (
      <div className="flex gap-1">
        {presets.map(p => (
          <button key={p.value} type="button" onClick={() => change(p.value)}
            className={`flex-1 py-1.5 text-[10px] rounded border transition-colors ${val === p.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
            {p.label}
          </button>
        ))}
      </div>
    );
  }

  if (k.type === "animation-preset") {
    const val = (f.getValue(bs) as string | undefined) ?? "none";
    const presets: { label: string; value: BlockStyle["animation"] }[] = [
      { label: "None",    value: "none" },
      { label: "Fade",    value: "fadeIn" },
      { label: "Slide ↑", value: "slideUp" },
      { label: "Slide ←", value: "slideLeft" },
    ];
    return (
      <div className="grid grid-cols-3 gap-1">
        {presets.map(p => (
          <button key={p.value} type="button" onClick={() => change(p.value)}
            className={`py-1.5 text-[10px] rounded border transition-colors ${val === p.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
            {p.label}
          </button>
        ))}
      </div>
    );
  }

  return <span className="text-xs text-muted-foreground/50">Unknown field type</span>;
}

function RenderedField({ f, ctx }: { f: FieldDescriptor; ctx: FieldCtx }) {
  if (f.kind.type === "toggle") {
    const isSpecial = f.kind.type === "toggle";
    const resetFn = f.resetOverride
      ? () => { f.resetOverride!(ctx.patch); ctx.trackRecent(f.id); }
      : isSpecial
        ? undefined
        : () => { ctx.patch(f.setValue(f.defaultValue)); ctx.trackRecent(f.id); };
    return (
      <FieldWrap fieldId={f.id} label={f.label}
        onPin={ctx.handlePin} pinned={ctx.pins.includes(f.id)}
        onReset={resetFn}>
        {renderField(f, ctx)}
      </FieldWrap>
    );
  }

  const isSpecial = ["section-visible","content-link","padding-quad","bg-full","shadow-preset","animation-preset"].includes(f.kind.type);
  const resetFn = f.resetOverride
    ? () => { f.resetOverride!(ctx.patch); ctx.trackRecent(f.id); }
    : !isSpecial
      ? () => { ctx.patch(f.setValue(f.defaultValue)); ctx.trackRecent(f.id); }
      : undefined;

  return (
    <FieldWrap fieldId={f.id} label={f.label}
      onPin={ctx.handlePin} pinned={ctx.pins.includes(f.id)}
      onReset={resetFn}>
      {renderField(f, ctx)}
    </FieldWrap>
  );
}

// ── Collapsed state ───────────────────────────────────────────────────────────

function CollapsedPanel({ onExpand, autoCollapsed, onClearAutoCollapse }: {
  onExpand: () => void; autoCollapsed?: boolean; onClearAutoCollapse?: () => void;
}) {
  return (
    <div className="flex-shrink-0 border-l border-border bg-card flex flex-col items-center pt-3 gap-2 w-8">
      <button type="button" onClick={() => { onExpand(); onClearAutoCollapse?.(); }}
        title="Expand inspector"
        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
        <ChevronsLeft className="w-3.5 h-3.5" />
      </button>
      {autoCollapsed && (
        <span className="text-[8px] text-muted-foreground/40 [writing-mode:vertical-rl] rotate-180 select-none">
          Inspector
        </span>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function InspectorPanel({
  pageName, section, selectedComponent, rowData, selectedRowColumnId,
  onChangeBlockStyle, onBgImageUpload, isBgUploading, onOpenMediaLibrary,
  copiedStyle, onCopyStyle, onPasteStyle, onApplyStyleTo,
  onToggleSection, onDuplicateSection, onDeleteSection,
  onChangeComponent, onComponentImageUpload, onChangeRowData,
  collapsed, onCollapse, onExpand, autoCollapsed, onClearAutoCollapse,
  specialContent, initialTab,
  selectedSubElement, onClearSubElement,
}: InspectorPanelProps) {
  const hasComponent = !!selectedComponent;

  // ── Panel width (resizable) ────────────────────────────────────────────────
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem(PANEL_WIDTH_KEY) ?? "280", 10);
    return Math.max(240, Math.min(300, isNaN(saved) ? 280 : saved));
  });
  const panelWidthRef = useRef(panelWidth);
  panelWidthRef.current = panelWidth;

  function handleResizeDrag(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidthRef.current;
    function onMove(ev: MouseEvent) {
      const delta = startX - ev.clientX;
      setPanelWidth(Math.max(240, Math.min(300, startWidth + delta)));
    }
    function onUp() {
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidthRef.current));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Accordion open states (top-level: Content / Style only) ─────────────────
  // Layout and Advanced are nested inside the Style accordion as a collapsed sub-section.
  const [contentOpen, setContentOpen] = useState(() => readAccordion(ACC_KEYS.content, false));
  const [styleOpen,   setStyleOpen]   = useState(() => readAccordion(ACC_KEYS.style, false));

  function toggleAcc(id: AccordionId) {
    if (id === "content") { const n = !contentOpen; setContentOpen(n); writeAccordion(ACC_KEYS.content, n); }
    if (id === "style" || id === "layout" || id === "advanced") {
      const n = !styleOpen; setStyleOpen(n); writeAccordion(ACC_KEYS.style, n);
    }
  }

  function switchToAccordion(id: AccordionId) {
    if (id === "content") { setContentOpen(true); writeAccordion(ACC_KEYS.content, true); }
    else { setStyleOpen(true); writeAccordion(ACC_KEYS.style, true); }
    panelScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  const panelScrollRef = useRef<HTMLDivElement>(null);

  // When initialTab changes, expand the corresponding accordion
  useEffect(() => {
    if (!initialTab) return;
    const { tab } = initialTab;
    if (tab === "content" || tab === "quick") switchToAccordion("content");
    else if (tab === "style") switchToAccordion("style");
    else if (tab === "layout") switchToAccordion("layout");
    else if (tab === "advanced") switchToAccordion("advanced");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab?.id]);

  // ── Sub-section controlled open state ──────────────────────────────────────
  // Keyed by storageKey; overrides the persisted localStorage default.
  const [subOpenOverrides, setSubOpenOverrides] = useState<Record<string, boolean>>({});

  function isSubOpen(key: string): boolean {
    if (key in subOpenOverrides) return subOpenOverrides[key];
    return readAccordion(key, false); // default: collapsed
  }

  function toggleSub(key: string) {
    const next = !isSubOpen(key);
    setSubOpenOverrides(prev => ({ ...prev, [key]: next }));
    writeAccordion(key, next);
  }

  // Context-aware auto-expand: fires on section change or component change.
  // Maps element type → which groups to open so the inspector surfaces only
  // what's relevant and collapses everything else.
  useEffect(() => {
    const compType = selectedComponent?.type;
    let newContent: boolean;
    let newStyle: boolean;
    const subKeys: string[] = [];

    if (compType === "heading" || compType === "paragraph") {
      // Text component → show content editor + Typography style group
      newContent = true;
      newStyle = true;
      subKeys.push(STYLE_SUB_KEYS.Typography);
    } else if (compType === "image") {
      // Image component → show content editor + Backgrounds style group
      newContent = true;
      newStyle = true;
      subKeys.push(STYLE_SUB_KEYS.Backgrounds);
    } else if (compType) {
      // Button, icon, divider, etc. → content editor is the primary surface
      newContent = true;
      newStyle = false;
    } else {
      // No component selected — section-level editing; style is more useful
      // than "click to edit on canvas" placeholder
      newContent = false;
      newStyle = true;
      subKeys.push(STYLE_SUB_KEYS.Backgrounds, "insp-acc-style-layout-adv");
    }

    setContentOpen(newContent);
    writeAccordion(ACC_KEYS.content, newContent);
    setStyleOpen(newStyle);
    writeAccordion(ACC_KEYS.style, newStyle);

    // Reset ALL sub-sections to collapsed, then open the relevant ones
    const overrides: Record<string, boolean> = {};
    for (const k of ALL_STYLE_SUB_KEYS) overrides[k] = false;
    for (const k of subKeys) overrides[k] = true;
    setSubOpenOverrides(overrides);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id, selectedComponent?.id]);

  // ── Pin state ──────────────────────────────────────────────────────────────
  const [pins, setPins] = useState<string[]>(() => getPinnedFields());
  const [, setRecent] = useState<string[]>(() => getRecentFields());

  function handlePin(id: string) { setPins(togglePin(id)); }

  function trackRecent(id: string) {
    recordRecentField(id);
    setRecent(getRecentFields());
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  const [searchRaw, setSearchRaw] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleSearchChange(raw: string) {
    setSearchRaw(raw);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const q = raw.trim().toLowerCase();
      setSearchQuery(q);
      setIsSearching(q.length > 0);
    }, 150);
  }

  // ── BlockStyle helpers ─────────────────────────────────────────────────────
  const bs: BlockStyle = section.blockStyle ?? {};
  function patch(p: Partial<BlockStyle>) { onChangeBlockStyle({ ...bs, ...p }); }

  // ── Apply Style To ─────────────────────────────────────────────────────────
  const [applyScope, setApplyScope] = useState<"section" | "page" | "site">("section");

  // ── Field context ──────────────────────────────────────────────────────────
  const fieldCtx: FieldCtx = {
    bs, patch, trackRecent,
    sectionEnabled: section.enabled,
    onToggleSection, switchToAccordion, handlePin, pins,
    onOpenMediaLibrary, onBgImageUpload, isBgUploading,
  };

  // ── Search results ─────────────────────────────────────────────────────────
  const searchResults = isSearching
    ? ALL_FIELDS.filter(f =>
        f.label.toLowerCase().includes(searchQuery) || f.id.includes(searchQuery)
      )
    : [];

  // ── Collapsed view ─────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <CollapsedPanel onExpand={onExpand}
        autoCollapsed={autoCollapsed} onClearAutoCollapse={onClearAutoCollapse} />
    );
  }

  // ── Section label ──────────────────────────────────────────────────────────
  const sectionLabel = hasComponent ? "Component" : (SECTION_LABELS[section.type] ?? section.type);

  // ── CONTENT accordion body ─────────────────────────────────────────────────
  function renderContentBody() {
    if (hasComponent && onChangeComponent) {
      return (
        <ComponentEditorPanel
          component={selectedComponent!}
          onChange={onChangeComponent}
          onImageUpload={onComponentImageUpload ?? (() => Promise.resolve(""))}
          onOpenMediaLibrary={onOpenMediaLibrary}
        />
      );
    }
    if (specialContent) return <>{specialContent}</>;
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
          <Layers className="w-5 h-5 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">Click to edit on canvas</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Click directly on text, images, or buttons in the preview to edit this section's content.
        </p>
        {section.type === "row" && !hasComponent && (
          <p className="text-xs text-muted-foreground mt-2">
            Click a component inside a row column to see its settings here.
          </p>
        )}
      </div>
    );
  }

  // ── STYLE accordion body ───────────────────────────────────────────────────
  function renderStyleBody() {
    const styleFields = ALL_FIELDS.filter(f => f.tab === "style");
    const grouped = new Map<string, FieldDescriptor[]>();
    for (const f of styleFields) {
      const sec = f.section ?? "";
      if (!grouped.has(sec)) grouped.set(sec, []);
      grouped.get(sec)!.push(f);
    }

    return (
      <div className="p-3">
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          <button type="button" onClick={onCopyStyle}
            className="flex items-center gap-1 px-2 py-1.5 text-xs rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors">
            <Copy className="w-3 h-3" /> Copy
          </button>
          <button type="button" onClick={onPasteStyle} disabled={!copiedStyle}
            className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded transition-colors ${copiedStyle ? "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground" : "bg-muted/50 text-muted-foreground/30 cursor-not-allowed"}`}>
            <ClipboardPaste className="w-3 h-3" /> Paste
          </button>
          <button type="button" onClick={() => onChangeBlockStyle({})}
            className="flex items-center gap-1 px-2 py-1.5 text-xs rounded bg-muted hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-500 transition-colors ml-auto">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>

        {STYLE_SECTION_ORDER.map(secName => {
          const secFields = grouped.get(secName);
          if (!secFields?.length) return null;
          return (
            <AccordionBlock key={secName} title={secName}
              open={isSubOpen(STYLE_SUB_KEYS[secName as keyof typeof STYLE_SUB_KEYS])}
              onToggle={() => toggleSub(STYLE_SUB_KEYS[secName as keyof typeof STYLE_SUB_KEYS])}>
              <div className="px-3 pb-2">
                {secFields.map(f => <RenderedField key={f.id} f={f} ctx={fieldCtx} />)}
              </div>
            </AccordionBlock>
          );
        })}

        {/* Layout + Advanced folded in as a collapsed disclosure */}
        <AccordionBlock title="Layout & Advanced"
          open={isSubOpen("insp-acc-style-layout-adv")}
          onToggle={() => toggleSub("insp-acc-style-layout-adv")}>
          <div>
            {LAYOUT_SECTION_ORDER.map(secName => {
              const layoutFields = ALL_FIELDS.filter(f => f.tab === "layout" && (f.section ?? "") === secName);
              if (!layoutFields.length) return null;
              const title = secName === "" ? "Alignment" : secName;
              return (
                <AccordionBlock key={secName || "align"} title={title}
                  open={isSubOpen(LAYOUT_SUB_KEYS[secName as keyof typeof LAYOUT_SUB_KEYS])}
                  onToggle={() => toggleSub(LAYOUT_SUB_KEYS[secName as keyof typeof LAYOUT_SUB_KEYS])}>
                  <div className="px-3 pb-2">
                    {layoutFields.map(f => <RenderedField key={f.id} f={f} ctx={fieldCtx} />)}
                  </div>
                </AccordionBlock>
              );
            })}
            {section.type === "row" && rowData && onChangeRowData && (
              <AccordionBlock title="Row Layout"
                open={isSubOpen("insp-acc-row-layout")}
                onToggle={() => toggleSub("insp-acc-row-layout")}>
                <div className="px-3 pb-2">
                  <RowEditorPanel data={rowData} onChange={onChangeRowData} />
                </div>
              </AccordionBlock>
            )}
            <div className="p-3 border-t border-border">
              {ALL_FIELDS.filter(f => f.tab === "advanced").map(f => (
                <RenderedField key={f.id} f={f} ctx={fieldCtx} />
              ))}
              <div className="pt-3 mt-2 border-t border-border">
                <button type="button" onClick={onDeleteSection}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border border-red-200 dark:border-red-900">
                  <Trash2 className="w-3.5 h-3.5" /> Delete Section
                </button>
              </div>
            </div>
          </div>
        </AccordionBlock>

        <div className="pt-3 mt-2 border-t border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Apply Style To</p>
          <div className="flex gap-1 mb-2">
            {([["section","This Section"],["page","This Page"],["site","Entire Website"]] as const).map(([s, lbl]) => (
              <button key={s} onClick={() => setApplyScope(s)}
                className={`flex-1 py-1.5 text-[10px] rounded transition-colors ${applyScope === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                {lbl}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => onApplyStyleTo(applyScope, bs)}
            className="w-full py-1.5 text-xs font-medium rounded bg-muted hover:bg-muted/80 text-foreground transition-colors">
            Apply styles to {applyScope === "section" ? "this section" : applyScope === "page" ? "all sections on this page" : "all sections on all pages"}
          </button>
        </div>
      </div>
    );
  }

  // ── Full render ────────────────────────────────────────────────────────────
  return (
    <div className="flex-shrink-0 border-l border-border bg-card flex flex-col overflow-hidden relative"
      style={{ width: panelWidth }}>

      <div onMouseDown={handleResizeDrag}
        className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-20 group flex items-center"
        title="Drag to resize panel">
        <div className="w-px h-full bg-border group-hover:bg-primary/50 group-hover:w-0.5 transition-all" />
      </div>

      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-3 pt-2 pb-1.5 flex-shrink-0 border-b border-border">
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50 mb-1 truncate">
            <span className="truncate">{pageName}</span>
            <span>›</span>
            <span
              className={`font-medium truncate ${selectedSubElement ? "text-muted-foreground cursor-pointer hover:text-foreground transition-colors" : "text-muted-foreground"}`}
              onClick={selectedSubElement ? onClearSubElement : undefined}
              title={selectedSubElement ? "Back to section" : undefined}
            >
              {sectionLabel}
            </span>
            {selectedSubElement && (
              <>
                <span>›</span>
                <span className="font-medium text-foreground truncate">{selectedSubElement.label}</span>
              </>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest truncate">
              {selectedSubElement ? selectedSubElement.label : sectionLabel}
            </span>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {!hasComponent && (
                <>
                  <button type="button" onClick={onToggleSection}
                    title={section.enabled ? "Hide section" : "Show section"}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    {section.enabled ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button type="button" onClick={onDuplicateSection} title="Duplicate section"
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={onDeleteSection} title="Delete section"
                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <button type="button" onClick={onCollapse} title="Collapse panel"
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50 pointer-events-none" />
            <input type="text" value={searchRaw}
              onChange={e => handleSearchChange(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") { handleSearchChange(""); setSearchRaw(""); } }}
              placeholder="Search settings…"
              className="w-full text-xs border border-border rounded pl-6 pr-6 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            {searchRaw && (
              <button onClick={() => { handleSearchChange(""); setSearchRaw(""); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div ref={panelScrollRef} className="flex-1 overflow-y-auto min-h-0">
          {isSearching ? (
            <div className="p-3">
              {searchResults.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No settings match "{searchQuery}"
                </p>
              ) : (
                <>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
                  </p>
                  <div className="space-y-0.5">
                    {searchResults.map(f => (
                      <button key={f.id} type="button"
                        onClick={() => {
                          handleSearchChange(""); setSearchRaw("");
                          const accId: AccordionId =
                            f.tab === "style" ? "style" :
                            f.tab === "layout" ? "layout" :
                            f.tab === "advanced" ? "advanced" : "content";
                          switchToAccordion(accId);
                        }}
                        className="w-full flex items-center justify-between px-2 py-2 rounded hover:bg-muted transition-colors text-left group">
                        <span className="text-xs font-medium text-foreground">{f.label}</span>
                        <span className="text-[9px] uppercase font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                          {f.tab}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              {/* CONTENT */}
              <AccordionBlock title="Content"
                open={contentOpen} onToggle={() => toggleAcc("content")}>
                {renderContentBody()}
              </AccordionBlock>

              {/* STYLE */}
              <AccordionBlock title="Style"
                open={styleOpen} onToggle={() => toggleAcc("style")}>
                {renderStyleBody()}
              </AccordionBlock>

              {/* Layout & Advanced are nested inside Style accordion */}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
