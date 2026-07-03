import { useState, useRef, useEffect } from "react";
import {
  Star, Search, X, ChevronDown, ChevronUp, ImagePlus, Loader2, Images,
  Copy, ClipboardPaste, Eye, EyeOff, ChevronsLeft, ChevronsRight, Layers,
  Monitor, Tablet, Smartphone, Lock, Trash2, RotateCcw, Zap, Clock,
} from "lucide-react";
import type { BlockStyle } from "./sections/BlockStyleWrapper";
import type { SiteComponent } from "./sections/ContentSection";
import type { RowSectionData } from "./sections/RowSection";
import { ComponentEditorPanel } from "./ComponentEditorPanel";
import { RowEditorPanel } from "./RowEditorPanel";
import {
  ALL_FIELDS, CORE_FIELDS, type InspectorTab, type FieldDescriptor,
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
  /**
   * When set, switches the inspector to this tab (context-aware routing from right-click menu).
   * The `id` field is a nonce (Date.now()) so repeated same-tab clicks still fire the effect.
   */
  initialTab?: { tab: InspectorTab; id: number };
}

// ── Context passed into every field renderer ───────────────────────────────────

interface FieldCtx {
  bs: BlockStyle;
  patch: (p: Partial<BlockStyle>) => void;
  trackRecent: (id: string) => void;
  sectionEnabled: boolean;
  onToggleSection: () => void;
  switchTab: (t: InspectorTab) => void;
  handlePin: (id: string) => void;
  pins: string[];
  onOpenMediaLibrary: (cb: (url: string) => void) => void;
  onBgImageUpload: (file: File) => void;
  isBgUploading: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PANEL_WIDTH_KEY    = "inspector-panel-width";
const SECTION_TAB_KEY    = "inspector-tab-section";
const COMPONENT_TAB_KEY  = "inspector-tab-component";
const TABS: InspectorTab[] = ["quick", "content", "style", "layout", "advanced"];
const TAB_LABELS: Record<InspectorTab, string> = {
  quick: "Quick", content: "Content", style: "Style", layout: "Layout", advanced: "Advanced",
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

function AccordionBlock({ title, defaultOpen = false, children }: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-0">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors">
        <span>{title}</span>
        {open ? <ChevronUp className="w-3 h-3 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 flex-shrink-0" />}
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

function FieldWrap({ fieldId, label, onPin, pinned, onReset, children }: {
  fieldId: string; label: string; onPin: (id: string) => void;
  pinned: boolean; onReset?: () => void; children: React.ReactNode;
}) {
  return (
    <div className="group mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</label>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onReset && (
            <button type="button" onClick={onReset} title="Reset to default"
              className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors">
              <RotateCcw className="w-2.5 h-2.5" />
            </button>
          )}
          <button type="button" onClick={() => onPin(fieldId)}
            title={pinned ? "Unpin" : "Pin to Quick tab"}
            className={`p-0.5 rounded transition-colors ${pinned ? "!opacity-100 text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-foreground"}`}>
            <Star className="w-2.5 h-2.5" fill={pinned ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function ComingSoonPlaceholder() {
  return (
    <div className="flex items-center justify-center h-6" title="Responsive breakpoints coming soon">
      <span className="text-xs text-muted-foreground/30 select-none">—</span>
      <Lock className="w-2.5 h-2.5 text-muted-foreground/20 ml-1" />
    </div>
  );
}

// ── Compound/complex sub-renderers ────────────────────────────────────────────

function BgFullEditor({ bs, patch, trackRecent, onOpenMediaLibrary, onBgImageUpload, isBgUploading }: {
  bs: BlockStyle; patch: (p: Partial<BlockStyle>) => void; trackRecent: (id: string) => void;
  onOpenMediaLibrary: (cb: (url: string) => void) => void;
  onBgImageUpload: (file: File) => void; isBgUploading: boolean;
}) {
  const bgType = bs.bgType ?? "color";
  return (
    <>
      <div className="flex gap-1 mb-3">
        {(["color","image","gradient"] as const).map(t => (
          <button key={t} onClick={() => { patch({ bgType: t }); trackRecent("background"); }}
            className={`flex-1 py-1.5 text-xs font-medium rounded capitalize transition-colors ${bgType === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>
      {bgType === "color" && (
        <div className="flex items-center gap-2">
          <input type="color" value={bs.bgColor ?? "#ffffff"}
            onChange={e => { patch({ bgColor: e.target.value }); trackRecent("background"); }}
            className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent flex-shrink-0" />
          <input type="text" value={bs.bgColor ?? ""}
            onChange={e => { patch({ bgColor: e.target.value }); trackRecent("background"); }}
            placeholder="#ffffff"
            className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-background font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
          {bs.bgColor && (
            <button onClick={() => patch({ bgColor: undefined })}
              className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      {bgType === "image" && (
        <>
          {bs.bgImageUrl && (
            <div className="relative mb-2 rounded-lg overflow-hidden h-24 bg-muted">
              <img src={bs.bgImageUrl} alt="" className="w-full h-full object-cover" />
              <button onClick={() => patch({ bgImageUrl: undefined, bgImageObjectPath: undefined })}
                className="absolute top-1 right-1 p-0.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <label className={`flex items-center justify-center gap-1.5 w-full text-xs border border-border rounded px-2 py-2 cursor-pointer hover:bg-muted mb-2 ${isBgUploading ? "opacity-60 pointer-events-none" : ""}`}>
            {isBgUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
            {isBgUploading ? "Uploading…" : bs.bgImageUrl ? "Replace Image" : "Upload Image"}
            <input type="file" accept="image/*" className="sr-only" disabled={isBgUploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) onBgImageUpload(f); e.target.value = ""; }} />
          </label>
          <button type="button"
            onClick={() => onOpenMediaLibrary(url => patch({ bgImageUrl: url, bgImageObjectPath: undefined }))}
            className="flex items-center justify-center gap-1.5 w-full text-xs border border-border rounded px-2 py-2 hover:bg-muted mb-2 text-muted-foreground hover:text-foreground transition-colors">
            <Images className="w-3 h-3" /> Choose from Library
          </button>
          <input type="text" value={bs.bgImageObjectPath ? "" : (bs.bgImageUrl ?? "")}
            placeholder="Or paste image URL"
            onChange={e => patch({ bgImageUrl: e.target.value, bgImageObjectPath: undefined })}
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
        </>
      )}
      {bgType === "gradient" && (
        <>
          <div className="flex gap-2 mb-2">
            {([["From","bgGradientFrom","#1a1a2e"],["To","bgGradientTo","#4a4a8a"]] as const).map(([lbl, key, def]) => (
              <div key={key} className="flex-1 min-w-0">
                <label className="text-[10px] text-muted-foreground block mb-1">{lbl}</label>
                <div className="flex items-center gap-1">
                  <input type="color" value={(bs as Record<string,string>)[key] ?? def}
                    onChange={e => patch({ [key]: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent flex-shrink-0" />
                  <input type="text" value={(bs as Record<string,string>)[key] ?? ""}
                    onChange={e => patch({ [key]: e.target.value })}
                    className="flex-1 min-w-0 text-[10px] border border-border rounded px-1 py-1 bg-background font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
            ))}
          </div>
          <SliderRow label="Angle" value={bs.bgGradientAngle} min={0} max={360} unit="°"
            onChange={v => patch({ bgGradientAngle: v })} />
          {bs.bgGradientFrom && bs.bgGradientTo && (
            <div className="w-full h-8 rounded-lg mt-1"
              style={{ backgroundImage: `linear-gradient(${bs.bgGradientAngle ?? 135}deg, ${bs.bgGradientFrom}, ${bs.bgGradientTo})` }} />
          )}
        </>
      )}
      {(bgType === "image" || bgType === "gradient") && (
        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Overlay</p>
          <div className="flex items-center gap-2 mb-3">
            <label className="text-xs text-muted-foreground w-14 flex-shrink-0">Color</label>
            <input type="color" value={bs.overlayColor ?? "#000000"}
              onChange={e => patch({ overlayColor: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent" />
          </div>
          <SliderRow label="Opacity" value={Math.round((bs.overlayOpacity ?? 0) * 100)} min={0} max={90} unit="%"
            onChange={v => patch({ overlayOpacity: v / 100 })} />
        </div>
      )}
    </>
  );
}

function PaddingQuadControl({ bs, patch, trackRecent }: {
  bs: BlockStyle; patch: (p: Partial<BlockStyle>) => void; trackRecent: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {([["Top","paddingTop"],["Bottom","paddingBottom"]] as const).map(([lbl, key]) => (
        <div key={key}>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>{lbl}</span><span>{bs[key] ?? 0}px</span>
          </div>
          <input type="range" min={0} max={200} value={bs[key] ?? 0}
            onChange={e => { patch({ [key]: parseInt(e.target.value) }); trackRecent("padding"); }}
            className="w-full h-1.5 appearance-none rounded-full cursor-pointer bg-border accent-primary" />
        </div>
      ))}
    </div>
  );
}

// ── Registry-driven field renderer ────────────────────────────────────────────

function renderField(f: FieldDescriptor, ctx: FieldCtx): React.ReactNode {
  const { bs, patch, trackRecent, sectionEnabled, onToggleSection, switchTab } = ctx;
  const k = f.kind;

  function onChange(v: unknown) {
    patch(f.setValue(v));
    trackRecent(f.id);
  }

  switch (k.type) {
    case "content-link":
      return (
        <button type="button" onClick={() => switchTab("content")}
          className="w-full flex items-center justify-between px-2 py-1.5 text-xs rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors">
          <span>Edit in Content tab</span>
          <span className="text-[9px] font-bold uppercase opacity-50">Content →</span>
        </button>
      );

    case "section-visible":
      return (
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground">
            {sectionEnabled ? "Visible on published site" : "Hidden on published site"}
          </span>
          <Toggle checked={sectionEnabled}
            onChange={() => { onToggleSection(); trackRecent(f.id); }} />
        </div>
      );

    case "padding-quad":
      return <PaddingQuadControl bs={bs} patch={patch} trackRecent={trackRecent} />;

    case "bg-full":
      return (
        <BgFullEditor bs={bs} patch={patch} trackRecent={trackRecent}
          onOpenMediaLibrary={ctx.onOpenMediaLibrary}
          onBgImageUpload={ctx.onBgImageUpload}
          isBgUploading={ctx.isBgUploading} />
      );

    case "color-text": {
      const val = f.getValue(bs) as string | undefined;
      return (
        <div className="flex items-center gap-2">
          <input type="color" value={val ?? "#000000"}
            onChange={e => onChange(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent flex-shrink-0" />
          <input type="text" value={val ?? ""}
            onChange={e => onChange(e.target.value || undefined)}
            placeholder="Inherit from theme"
            className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-background font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
          {val && (
            <button onClick={() => onChange(undefined)}
              className="flex-shrink-0 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      );
    }

    case "color-only": {
      const val = f.getValue(bs) as string;
      return (
        <input type="color" value={val}
          onChange={e => onChange(e.target.value)}
          className="w-full h-8 rounded cursor-pointer border border-border bg-transparent" />
      );
    }

    case "range": {
      const val = (f.getValue(bs) as number) ?? 0;
      const unit = k.unit ?? "px";
      return (
        <div>
          <div className="flex justify-end text-[10px] text-muted-foreground/60 mb-1">
            <span className="font-mono tabular-nums">{val}{unit}</span>
          </div>
          <input type="range" min={k.min} max={k.max} step={k.step ?? 1} value={val}
            onChange={e => onChange(parseInt(e.target.value))}
            className="w-full h-1.5 appearance-none rounded-full cursor-pointer bg-border accent-primary" />
        </div>
      );
    }

    case "select": {
      const val = f.getValue(bs) as string;
      return (
        <select value={val} onChange={e => onChange(e.target.value)}
          className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary">
          {k.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      );
    }

    case "pills": {
      const val = f.getValue(bs) as string;
      return (
        <div className="flex gap-1">
          {k.options.map(([v, l]) => (
            <button key={v} onClick={() => onChange(v)}
              className={`flex-1 py-1.5 text-[10px] rounded transition-colors ${val === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              {l}
            </button>
          ))}
        </div>
      );
    }

    case "number": {
      const val = f.getValue(bs) as number | undefined;
      return (
        <input type="number" min={k.min} max={k.max} step={k.step ?? 1}
          value={val ?? ""}
          onChange={e => onChange(parseFloat(e.target.value) || undefined)}
          placeholder={k.placeholder}
          className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
      );
    }

    case "toggle": {
      const val = f.getValue(bs) as boolean;
      return (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{val ? "On" : "Off"}</span>
          <Toggle checked={val} onChange={v => onChange(v)} />
        </div>
      );
    }

    case "text": {
      const val = f.getValue(bs) as string;
      return (
        <input type="text" value={val}
          onChange={e => onChange(e.target.value || undefined)}
          placeholder={k.placeholder}
          className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
      );
    }

    case "font-picker": {
      const val = f.getValue(bs) as string | undefined;
      return (
        <select value={val ?? ""} onChange={e => onChange(e.target.value || undefined)}
          className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="">Inherit from theme</option>
          {FONT_OPTIONS.map(font => <option key={font} value={font}>{font}</option>)}
        </select>
      );
    }

    case "shadow-preset": {
      const val = f.getValue(bs) as string;
      return (
        <div className="flex gap-1 flex-wrap">
          {(["none","sm","md","lg","xl"] as const).map(s => (
            <button key={s} onClick={() => onChange(s)}
              className={`px-2 py-1 text-xs rounded capitalize transition-colors ${val === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              {s}
            </button>
          ))}
        </div>
      );
    }

    case "animation-preset": {
      const val = f.getValue(bs) as string;
      return (
        <div className="grid grid-cols-2 gap-1">
          {([["none","None"],["fadeIn","Fade In"],["slideUp","Slide Up"],["slideLeft","Slide Left"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => onChange(v)}
              className={`py-1.5 text-xs rounded transition-colors ${val === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              {l}
            </button>
          ))}
        </div>
      );
    }

    default:
      return null;
  }
}

// ── Universal field wrapper — applies pin / reset / recent to every field ─────

function RenderedField({ f, ctx }: { f: FieldDescriptor; ctx: FieldCtx }) {
  const isSpecial = ["content-link","bg-full","padding-quad"].includes(f.kind.type);

  const resetFn: (() => void) | undefined =
    f.kind.type === "section-visible"
      ? () => { if (!ctx.sectionEnabled) ctx.onToggleSection(); ctx.trackRecent(f.id); }
      : f.resetOverride
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

  // ── Tab state ──────────────────────────────────────────────────────────────
  const tabKey = hasComponent ? COMPONENT_TAB_KEY : SECTION_TAB_KEY;
  const [activeTab, setActiveTab] = useState<InspectorTab>(() => {
    const saved = localStorage.getItem(tabKey) as InspectorTab | null;
    if (TABS.includes(saved as InspectorTab)) return saved as InspectorTab;
    return hasComponent ? "content" : "quick";
  });

  useEffect(() => {
    const saved = localStorage.getItem(tabKey) as InspectorTab | null;
    if (TABS.includes(saved as InspectorTab)) setActiveTab(saved as InspectorTab);
    else setActiveTab(hasComponent ? "content" : "quick");
  }, [hasComponent, tabKey]);

  // When the parent requests a specific tab (from right-click Inspect routing), honour it.
  // id is a nonce so repeated same-tab Inspect clicks re-trigger the effect.
  useEffect(() => {
    if (initialTab && TABS.includes(initialTab.tab)) {
      switchTab(initialTab.tab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);

  // ── Tab scroll memory — preserve per-tab scroll position across switches ──
  const tabScrollRef = useRef<Map<string, number>>(new Map());
  const tabContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tabContentRef.current) {
      tabContentRef.current.scrollTop = tabScrollRef.current.get(activeTab) ?? 0;
    }
  }, [activeTab]);

  function switchTab(t: InspectorTab) {
    if (tabContentRef.current) {
      tabScrollRef.current.set(activeTab, tabContentRef.current.scrollTop);
    }
    setActiveTab(t);
    localStorage.setItem(tabKey, t);
  }

  // ── Pin / recent state ─────────────────────────────────────────────────────
  const [pins, setPins] = useState<string[]>(() => getPinnedFields());
  const [recent, setRecent] = useState<string[]>(() => getRecentFields());

  function handlePin(id: string) { setPins(togglePin(id)); }

  function trackRecent(id: string) {
    recordRecentField(id);
    setRecent(getRecentFields());
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  const [searchRaw, setSearchRaw] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

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

  // ── Field context (shared by all renderers) ────────────────────────────────
  const fieldCtx: FieldCtx = {
    bs, patch, trackRecent,
    sectionEnabled: section.enabled,
    onToggleSection, switchTab, handlePin, pins,
    onOpenMediaLibrary, onBgImageUpload, isBgUploading,
  };

  // ── Derived lists ──────────────────────────────────────────────────────────
  const searchResults = isSearching
    ? ALL_FIELDS.filter(f =>
        f.label.toLowerCase().includes(searchQuery) || f.id.includes(searchQuery)
      )
    : [];

  const pinnedDescriptors = ALL_FIELDS.filter(f => pins.includes(f.id));

  const recentDescriptors = ALL_FIELDS
    .filter(f => recent.includes(f.id) && !pins.includes(f.id))
    .sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id))
    .slice(0, 5);

  // ── Collapsed view ─────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <CollapsedPanel onExpand={onExpand}
        autoCollapsed={autoCollapsed} onClearAutoCollapse={onClearAutoCollapse} />
    );
  }

  // ── Tab renderers ──────────────────────────────────────────────────────────

  function renderQuickTab() {
    return (
      <div className="p-3">
        {pinnedDescriptors.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Star className="w-3 h-3 text-amber-500" fill="currentColor" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Pinned</p>
            </div>
            {pinnedDescriptors.map(f => (
              <div key={f.id} className="group flex items-center gap-1 mb-1 border border-border rounded overflow-hidden">
                <button type="button" onClick={() => switchTab(f.tab)}
                  className="flex-1 flex items-center justify-between px-2 py-1.5 hover:bg-muted transition-colors text-left">
                  <span className="text-xs text-foreground">{f.label}</span>
                  <span className="text-[9px] font-bold uppercase text-muted-foreground/50 group-hover:text-muted-foreground">
                    {TAB_LABELS[f.tab]}
                  </span>
                </button>
                <button type="button" onClick={() => handlePin(f.id)} title="Unpin"
                  className="px-1.5 py-1.5 rounded-r hover:bg-muted text-amber-500 hover:text-muted-foreground transition-colors opacity-0 group-hover:opacity-100">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {recentDescriptors.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="w-3 h-3 text-muted-foreground/60" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Recent</p>
            </div>
            {recentDescriptors.map(f => (
              <button key={f.id} type="button" onClick={() => switchTab(f.tab)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted transition-colors text-left mb-0.5">
                <span className="text-xs text-foreground">{f.label}</span>
                <span className="text-[9px] uppercase font-bold text-muted-foreground/50">{TAB_LABELS[f.tab]}</span>
              </button>
            ))}
          </div>
        )}

        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <Zap className="w-3 h-3 text-muted-foreground/60" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Core</p>
          </div>
          {CORE_FIELDS.map(f => <RenderedField key={f.id} f={f} ctx={fieldCtx} />)}
        </div>

        {recentDescriptors.length === 0 && pinnedDescriptors.length === 0 && (
          <p className="text-[10px] text-muted-foreground/50 text-center pt-2">
            Hover any field and click ⭐ to pin it here
          </p>
        )}
      </div>
    );
  }

  function renderContentTab() {
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
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
          <Layers className="w-5 h-5 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">Edit on canvas</p>
        <p className="text-xs text-muted-foreground">
          Click directly on text, images, or buttons in the canvas to edit this section's content.
        </p>
        {section.type === "row" && !hasComponent && (
          <p className="text-xs text-muted-foreground mt-2">
            Click a component inside a row column to see its settings here.
          </p>
        )}
      </div>
    );
  }

  function renderStyleTab() {
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
            <AccordionBlock key={secName} title={secName} defaultOpen={secName === "Backgrounds"}>
              {secFields.map(f => <RenderedField key={f.id} f={f} ctx={fieldCtx} />)}
            </AccordionBlock>
          );
        })}

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

  function renderLayoutTab() {
    const layoutFields = ALL_FIELDS.filter(f => f.tab === "layout");
    const grouped = new Map<string, FieldDescriptor[]>();
    for (const f of layoutFields) {
      const sec = f.section ?? "";
      if (!grouped.has(sec)) grouped.set(sec, []);
      grouped.get(sec)!.push(f);
    }

    const SECTION_TITLES: Record<string, string> = {
      "": "Alignment",
      "Spacing": "Spacing",
      "Sizing": "Sizing",
    };

    return (
      <div className="p-3 space-y-0">
        {LAYOUT_SECTION_ORDER.map((secName, i) => {
          const secFields = grouped.get(secName);
          if (!secFields?.length) return null;
          const title = SECTION_TITLES[secName] ?? secName;
          return (
            <AccordionBlock key={secName || "root"} title={title} defaultOpen={i === 0}>
              <div className="space-y-1 pb-1">
                {secFields.map(f => (
                  <div key={f.id}>
                    <RenderedField f={f} ctx={fieldCtx} />
                  </div>
                ))}
              </div>
            </AccordionBlock>
          );
        })}

        {section.type === "row" && rowData && onChangeRowData && (
          <AccordionBlock title="Row Layout" defaultOpen={true}>
            <RowEditorPanel data={rowData} onChange={onChangeRowData} />
          </AccordionBlock>
        )}
      </div>
    );
  }

  function renderAdvancedTab() {
    const advancedFields = ALL_FIELDS.filter(f => f.tab === "advanced");
    return (
      <div className="p-3">
        {advancedFields.map(f => <RenderedField key={f.id} f={f} ctx={fieldCtx} />)}
        <div className="pt-3 mt-2 border-t border-border">
          <button type="button" onClick={onDeleteSection}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border border-red-200 dark:border-red-900">
            <Trash2 className="w-3.5 h-3.5" /> Delete Section
          </button>
        </div>
      </div>
    );
  }

  // ── Full render ────────────────────────────────────────────────────────────
  const sectionLabel = hasComponent ? "Component" : (SECTION_LABELS[section.type] ?? section.type);

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
            <span className="font-medium text-muted-foreground truncate">{sectionLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest truncate">{sectionLabel}</span>
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

        {isSearching ? (
          <div className="flex-1 overflow-y-auto p-3">
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
                      onClick={() => { handleSearchChange(""); setSearchRaw(""); switchTab(f.tab); }}
                      className="w-full flex items-center justify-between px-2 py-2 rounded hover:bg-muted transition-colors text-left group">
                      <span className="text-xs font-medium text-foreground">{f.label}</span>
                      <span className="text-[9px] uppercase font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        {TAB_LABELS[f.tab]}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex border-b border-border flex-shrink-0 bg-card">
              {TABS.map(t => (
                <button key={t} onClick={() => switchTab(t)}
                  className={`flex-1 py-2 text-[10px] font-medium capitalize transition-colors ${activeTab === t ? "text-foreground border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"}`}>
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
            <div ref={tabContentRef} className="flex-1 overflow-y-auto min-h-0">
              {activeTab === "quick"    && renderQuickTab()}
              {activeTab === "content"  && renderContentTab()}
              {activeTab === "style"    && renderStyleTab()}
              {activeTab === "layout"   && renderLayoutTab()}
              {activeTab === "advanced" && renderAdvancedTab()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
