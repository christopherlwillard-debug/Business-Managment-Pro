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
  ALL_FIELDS, type InspectorTab,
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
  onApplyStyleTo: (scope: "page" | "site", style: BlockStyle) => void;
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
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PANEL_WIDTH_KEY = "inspector-panel-width";
const SECTION_TAB_KEY = "inspector-tab-section";
const COMPONENT_TAB_KEY = "inspector-tab-component";
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

// ── Small helpers ─────────────────────────────────────────────────────────────

function SectionLabel({ type }: { type: string }) {
  return <>{SECTION_LABELS[type] ?? type}</>;
}

function SliderRow({
  label, value, min, max, unit = "px", onChange,
}: {
  label: string; value: number | undefined; min: number; max: number;
  unit?: string; onChange: (v: number) => void;
}) {
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

function Toggle({
  checked, onChange,
}: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" className="sr-only peer" checked={checked}
        onChange={e => onChange(e.target.checked)} />
      <div className="w-8 h-4 bg-muted peer-focus:outline-none rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
    </label>
  );
}

function AccordionBlock({
  title, defaultOpen = false, children,
}: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
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

function FieldWrap({
  fieldId, label, onPin, pinned, children,
}: {
  fieldId: string; label: string; onPin: (id: string) => void;
  pinned: boolean; children: React.ReactNode;
}) {
  return (
    <div className="group mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</label>
        <button type="button" onClick={() => onPin(fieldId)}
          title={pinned ? "Unpin" : "Pin to Quick tab"}
          className={`opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all ${
            pinned ? "opacity-100 text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-foreground"
          }`}>
          <Star className="w-2.5 h-2.5" fill={pinned ? "currentColor" : "none"} />
        </button>
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

// ── Main Component ─────────────────────────────────────────────────────────────

export function InspectorPanel({
  pageName, section, selectedComponent, rowData, selectedRowColumnId,
  onChangeBlockStyle, onBgImageUpload, isBgUploading, onOpenMediaLibrary,
  copiedStyle, onCopyStyle, onPasteStyle, onApplyStyleTo,
  onToggleSection, onDuplicateSection, onDeleteSection,
  onChangeComponent, onComponentImageUpload, onChangeRowData,
  collapsed, onCollapse, onExpand, autoCollapsed, onClearAutoCollapse,
  specialContent,
}: InspectorPanelProps) {
  const hasComponent = !!selectedComponent;

  // ── Width (resizable) ──────────────────────────────────────────────────────
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem(PANEL_WIDTH_KEY) ?? "288", 10);
    return Math.max(280, Math.min(520, isNaN(saved) ? 288 : saved));
  });
  const panelWidthRef = useRef(panelWidth);
  panelWidthRef.current = panelWidth;

  function handleResizeDrag(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidthRef.current;
    function onMove(ev: MouseEvent) {
      const delta = startX - ev.clientX;
      setPanelWidth(Math.max(280, Math.min(520, startWidth + delta)));
    }
    function onUp() {
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidthRef.current));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Tab state (section vs component stored separately) ─────────────────────
  const tabKey = hasComponent ? COMPONENT_TAB_KEY : SECTION_TAB_KEY;
  const [activeTab, setActiveTab] = useState<InspectorTab>(() => {
    const saved = localStorage.getItem(tabKey) as InspectorTab | null;
    return TABS.includes(saved as InspectorTab) ? (saved as InspectorTab) : "quick";
  });

  useEffect(() => {
    const saved = localStorage.getItem(tabKey) as InspectorTab | null;
    setActiveTab(TABS.includes(saved as InspectorTab) ? (saved as InspectorTab) : "quick");
  }, [hasComponent, tabKey]);

  function switchTab(t: InspectorTab) {
    setActiveTab(t);
    localStorage.setItem(tabKey, t);
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  const [searchRaw, setSearchRaw] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(v: string) {
    setSearchRaw(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchQuery(v.trim().toLowerCase()), 150);
  }

  // ── Pins + Recently Used ───────────────────────────────────────────────────
  const [pins, setPins] = useState<string[]>(() => getPinnedFields());
  const [recentFields, setRecentFields] = useState<string[]>(() => getRecentFields());

  function handlePin(id: string) { setPins(togglePin(id)); }
  function trackRecent(id: string) { recordRecentField(id); setRecentFields(getRecentFields()); }

  // ── BlockStyle helpers ─────────────────────────────────────────────────────
  const bs = section.blockStyle ?? {};
  function patch(update: Partial<BlockStyle>) {
    onChangeBlockStyle({ ...bs, ...update });
  }

  // ── Apply Style To scope ───────────────────────────────────────────────────
  const [applyScope, setApplyScope] = useState<"page" | "site">("page");

  // ── Collapsed view ─────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="flex-shrink-0 border-l border-border bg-card flex flex-col items-center py-2 gap-3"
        style={{ width: 36 }}>
        <button type="button" onClick={() => { onClearAutoCollapse?.(); onExpand(); }}
          title={autoCollapsed ? "Expand panel (auto-collapsed)" : "Expand panel"}
          className="relative p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <ChevronsLeft className="w-4 h-4" />
          {autoCollapsed && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />}
        </button>
        <Layers className="w-4 h-4 text-muted-foreground/40" />
      </div>
    );
  }

  // ── Search results ─────────────────────────────────────────────────────────
  const searchResults = searchQuery.length >= 2
    ? ALL_FIELDS.filter(f => f.label.toLowerCase().includes(searchQuery))
    : [];
  const isSearching = searchQuery.length >= 2;

  // ── Tab renderers ──────────────────────────────────────────────────────────

  function renderQuickTab() {
    const pinnedDescriptors = pins.map(id => ALL_FIELDS.find(f => f.id === id)).filter(Boolean) as typeof ALL_FIELDS;
    const recentDescriptors = recentFields.map(id => ALL_FIELDS.find(f => f.id === id)).filter(Boolean).slice(0, 8) as typeof ALL_FIELDS;

    return (
      <div className="p-3 space-y-4">
        {/* Recently Used */}
        {recentDescriptors.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="w-3 h-3 text-muted-foreground/60" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Recently Used</p>
            </div>
            <div className="space-y-0.5">
              {recentDescriptors.map(f => (
                <button key={f.id} type="button" onClick={() => switchTab(f.tab)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted transition-colors text-left group">
                  <span className="text-xs text-foreground">{f.label}</span>
                  <span className="text-[9px] font-bold uppercase text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                    {TAB_LABELS[f.tab]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pinned */}
        {pinnedDescriptors.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Star className="w-3 h-3 text-amber-500" fill="currentColor" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Pinned</p>
            </div>
            <div className="space-y-0.5">
              {pinnedDescriptors.map(f => (
                <div key={f.id} className="flex items-center group">
                  <button type="button" onClick={() => switchTab(f.tab)}
                    className="flex-1 flex items-center justify-between px-2 py-1.5 rounded-l hover:bg-muted transition-colors text-left">
                    <span className="text-xs text-foreground">{f.label}</span>
                    <span className="text-[9px] font-bold uppercase text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                      {TAB_LABELS[f.tab]}
                    </span>
                  </button>
                  <button type="button" onClick={() => handlePin(f.id)}
                    title="Unpin"
                    className="px-1.5 py-1.5 rounded-r hover:bg-muted text-amber-500 hover:text-muted-foreground transition-colors opacity-0 group-hover:opacity-100">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Core controls */}
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <Zap className="w-3 h-3 text-muted-foreground/60" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Core</p>
          </div>

          {/* Background Color */}
          <FieldWrap fieldId="bg-color" label="Background Color" onPin={handlePin} pinned={pins.includes("bg-color")}>
            <div className="flex items-center gap-2">
              <input type="color" value={bs.bgColor ?? "#ffffff"}
                onChange={e => { patch({ bgColor: e.target.value, bgType: "color" }); trackRecent("bg-color"); }}
                className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent flex-shrink-0" />
              <input type="text" value={bs.bgColor ?? ""}
                onChange={e => { patch({ bgColor: e.target.value, bgType: "color" }); trackRecent("bg-color"); }}
                placeholder="#ffffff"
                className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-background font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
              {bs.bgColor && (
                <button onClick={() => patch({ bgColor: undefined })}
                  className="flex-shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </FieldWrap>

          {/* Padding top + bottom quick sliders */}
          <FieldWrap fieldId="padding" label="Padding" onPin={handlePin} pinned={pins.includes("padding")}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Top</span><span>{bs.paddingTop ?? 0}px</span>
                </div>
                <input type="range" min={0} max={200} value={bs.paddingTop ?? 0}
                  onChange={e => { patch({ paddingTop: parseInt(e.target.value) }); trackRecent("padding"); }}
                  className="w-full h-1.5 appearance-none rounded-full cursor-pointer bg-border accent-primary" />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Bottom</span><span>{bs.paddingBottom ?? 0}px</span>
                </div>
                <input type="range" min={0} max={200} value={bs.paddingBottom ?? 0}
                  onChange={e => { patch({ paddingBottom: parseInt(e.target.value) }); trackRecent("padding"); }}
                  className="w-full h-1.5 appearance-none rounded-full cursor-pointer bg-border accent-primary" />
              </div>
            </div>
          </FieldWrap>

          {/* Shadow */}
          <FieldWrap fieldId="shadow" label="Shadow" onPin={handlePin} pinned={pins.includes("shadow")}>
            <div className="flex gap-1 flex-wrap">
              {(["none", "sm", "md", "lg", "xl"] as const).map(s => (
                <button key={s} onClick={() => { patch({ shadow: s }); trackRecent("shadow"); }}
                  className={`px-2 py-1 text-xs rounded capitalize transition-colors ${
                    (bs.shadow ?? "none") === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}>{s}</button>
              ))}
            </div>
          </FieldWrap>

          {/* Animation */}
          <FieldWrap fieldId="animation" label="Animation" onPin={handlePin} pinned={pins.includes("animation")}>
            <div className="grid grid-cols-2 gap-1">
              {([["none","None"],["fadeIn","Fade In"],["slideUp","Slide Up"],["slideLeft","Slide Left"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => { patch({ animation: v }); trackRecent("animation"); }}
                  className={`py-1.5 text-xs rounded transition-colors ${
                    (bs.animation ?? "none") === v
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}>{l}</button>
              ))}
            </div>
          </FieldWrap>

          {/* Visibility */}
          <FieldWrap fieldId="visibility" label="Visibility" onPin={handlePin} pinned={pins.includes("visibility")}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground">
                {section.enabled ? "Visible on published site" : "Hidden on published site"}
              </span>
              <Toggle checked={section.enabled} onChange={onToggleSection} />
            </div>
          </FieldWrap>

          {(recentDescriptors.length === 0 && pinnedDescriptors.length === 0) && (
            <p className="text-[10px] text-muted-foreground/50 text-center pt-2">
              Hover any field and click ⭐ to pin it here
            </p>
          )}
        </div>
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
    if (specialContent) {
      return <div className="overflow-y-auto">{specialContent}</div>;
    }
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
    const bgType = bs.bgType ?? "color";
    return (
      <div className="p-3">
        {/* Copy / paste / apply toolbar */}
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          <button type="button" onClick={onCopyStyle} title="Copy styles"
            className="flex items-center gap-1 px-2 py-1.5 text-xs rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors">
            <Copy className="w-3 h-3" /> Copy
          </button>
          <button type="button" onClick={onPasteStyle} disabled={!copiedStyle}
            title={copiedStyle ? "Paste styles" : "No styles copied"}
            className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded transition-colors ${
              copiedStyle
                ? "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                : "bg-muted/50 text-muted-foreground/30 cursor-not-allowed"
            }`}>
            <ClipboardPaste className="w-3 h-3" /> Paste
          </button>
          <button type="button" onClick={() => onChangeBlockStyle({})}
            title="Reset all styles"
            className="flex items-center gap-1 px-2 py-1.5 text-xs rounded bg-muted hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-500 transition-colors ml-auto">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>

        <AccordionBlock title="Backgrounds" defaultOpen>
          <div className="flex gap-1 mb-3">
            {(["color", "image", "gradient"] as const).map(t => (
              <button key={t} onClick={() => { patch({ bgType: t }); trackRecent("bg-color"); }}
                className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors capitalize ${
                  bgType === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}>{t}</button>
            ))}
          </div>

          {bgType === "color" && (
            <div className="flex items-center gap-2">
              <input type="color" value={bs.bgColor ?? "#ffffff"}
                onChange={e => { patch({ bgColor: e.target.value }); trackRecent("bg-color"); }}
                className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent flex-shrink-0" />
              <input type="text" value={bs.bgColor ?? ""}
                onChange={e => { patch({ bgColor: e.target.value }); trackRecent("bg-color"); }}
                placeholder="#ffffff"
                className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-background font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
              {bs.bgColor && (
                <button onClick={() => patch({ bgColor: undefined })}
                  className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
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
              <label className={`flex items-center justify-center gap-1.5 w-full text-xs border border-border rounded px-2 py-2 cursor-pointer transition-colors hover:bg-muted mb-2 ${isBgUploading ? "opacity-60 pointer-events-none" : ""}`}>
                {isBgUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                {isBgUploading ? "Uploading…" : bs.bgImageUrl ? "Replace Image" : "Upload Image"}
                <input type="file" accept="image/*" className="sr-only" disabled={isBgUploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) onBgImageUpload(f); e.target.value = ""; }} />
              </label>
              <button type="button"
                onClick={() => onOpenMediaLibrary(url => patch({ bgImageUrl: url, bgImageObjectPath: undefined }))}
                className="flex items-center justify-center gap-1.5 w-full text-xs border border-border rounded px-2 py-2 cursor-pointer transition-colors hover:bg-muted mb-2 text-muted-foreground hover:text-foreground">
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
                {([["From", "bgGradientFrom", "#1a1a2e"], ["To", "bgGradientTo", "#4a4a8a"]] as const).map(([lbl, key, def]) => (
                  <div key={key} className="flex-1 min-w-0">
                    <label className="text-[10px] text-muted-foreground block mb-1">{lbl}</label>
                    <div className="flex items-center gap-1">
                      <input type="color" value={(bs as Record<string, string>)[key] ?? def}
                        onChange={e => patch({ [key]: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent flex-shrink-0" />
                      <input type="text" value={(bs as Record<string, string>)[key] ?? ""}
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
        </AccordionBlock>

        <AccordionBlock title="Shadows">
          <div className="flex gap-1 flex-wrap mb-2">
            {(["none", "sm", "md", "lg", "xl"] as const).map(s => (
              <button key={s} onClick={() => { patch({ shadow: s }); trackRecent("shadow"); }}
                className={`px-2 py-1 text-xs rounded capitalize transition-colors ${
                  (bs.shadow ?? "none") === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}>{s}</button>
            ))}
          </div>
        </AccordionBlock>

        <AccordionBlock title="Borders">
          <SliderRow label="Border Radius" value={bs.borderRadius} min={0} max={48}
            onChange={v => patch({ borderRadius: v || undefined })} />
        </AccordionBlock>

        {/* Bulk Apply */}
        <div className="pt-3 mt-2 border-t border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Apply Style To</p>
          <div className="flex gap-1 mb-2">
            {(["page", "site"] as const).map(s => (
              <button key={s} onClick={() => setApplyScope(s)}
                className={`flex-1 py-1.5 text-xs rounded capitalize transition-colors ${
                  applyScope === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}>
                {s === "page" ? "This Page" : "Entire Website"}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => onApplyStyleTo(applyScope, bs)}
            className="w-full py-1.5 text-xs font-medium rounded bg-muted hover:bg-muted/80 text-foreground transition-colors">
            Apply background &amp; spacing to {applyScope === "page" ? "all sections on this page" : "all pages"}
          </button>
        </div>
      </div>
    );
  }

  function renderLayoutTab() {
    return (
      <div className="p-3">
        {/* Responsive column headers */}
        <div className="grid grid-cols-[1fr_60px_60px] gap-1 mb-2">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Field</div>
          <div className="flex items-center justify-center gap-0.5 text-[9px] text-muted-foreground">
            <Monitor className="w-2.5 h-2.5" /><span>Desktop</span>
          </div>
          <div className="flex items-center justify-center gap-0.5 text-[9px] text-muted-foreground/50" title="Responsive breakpoints coming soon">
            <Tablet className="w-2.5 h-2.5" /><span>Tab</span>
          </div>
        </div>

        {([
          ["Padding Top",    "paddingTop",    0, 200],
          ["Padding Right",  "paddingRight",  0, 100],
          ["Padding Bottom", "paddingBottom", 0, 200],
          ["Padding Left",   "paddingLeft",   0, 100],
        ] as const).map(([lbl, key, min, max]) => (
          <div key={key} className="grid grid-cols-[1fr_60px_60px] gap-1 items-center mb-2">
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                <span>{lbl}</span><span>{(bs as Record<string, number | undefined>)[key] ?? 0}px</span>
              </div>
              <input type="range" min={min} max={max}
                value={(bs as Record<string, number | undefined>)[key] ?? 0}
                onChange={e => { patch({ [key]: parseInt(e.target.value) }); trackRecent("padding"); }}
                className="w-full h-1.5 appearance-none rounded-full cursor-pointer bg-border accent-primary" />
            </div>
            <ComingSoonPlaceholder />
            <ComingSoonPlaceholder />
          </div>
        ))}

        <div className="border-t border-border my-3" />

        {([
          ["Margin Top",    "marginTop",    0, 200],
          ["Margin Bottom", "marginBottom", 0, 200],
        ] as const).map(([lbl, key, min, max]) => (
          <div key={key} className="grid grid-cols-[1fr_60px_60px] gap-1 items-center mb-2">
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                <span>{lbl}</span><span>{(bs as Record<string, number | undefined>)[key] ?? 0}px</span>
              </div>
              <input type="range" min={min} max={max}
                value={(bs as Record<string, number | undefined>)[key] ?? 0}
                onChange={e => { patch({ [key]: parseInt(e.target.value) || undefined }); trackRecent("margin-top"); }}
                className="w-full h-1.5 appearance-none rounded-full cursor-pointer bg-border accent-primary" />
            </div>
            <ComingSoonPlaceholder />
            <ComingSoonPlaceholder />
          </div>
        ))}

        <div className="border-t border-border my-3" />

        <div className="grid grid-cols-[1fr_60px_60px] gap-1 items-center mb-2">
          <div>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
              <span>Min Height</span><span>{bs.minHeight ?? 0}px</span>
            </div>
            <input type="range" min={0} max={800} value={bs.minHeight ?? 0}
              onChange={e => { patch({ minHeight: parseInt(e.target.value) || undefined }); trackRecent("min-height"); }}
              className="w-full h-1.5 appearance-none rounded-full cursor-pointer bg-border accent-primary" />
          </div>
          <ComingSoonPlaceholder />
          <ComingSoonPlaceholder />
        </div>

        {/* Row-specific layout controls */}
        {section.type === "row" && rowData && onChangeRowData && (
          <>
            <div className="border-t border-border my-3" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Row Layout</p>
            <RowEditorPanel data={rowData} onChange={onChangeRowData} />
          </>
        )}
      </div>
    );
  }

  function renderAdvancedTab() {
    return (
      <div className="p-3 space-y-0">
        <AccordionBlock title="Visibility" defaultOpen>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-foreground font-medium">Show on published site</p>
                <p className="text-[10px] text-muted-foreground">Hides section from visitors when off</p>
              </div>
              <Toggle checked={section.enabled} onChange={onToggleSection} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-foreground">Hide on Mobile</p>
                <p className="text-[10px] text-muted-foreground">Screens &lt; 768px</p>
              </div>
              <Toggle checked={!!bs.hideOnMobile} onChange={v => { patch({ hideOnMobile: v }); trackRecent("hide-mobile"); }} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-foreground">Hide on Tablet</p>
                <p className="text-[10px] text-muted-foreground">768px–1023px screens</p>
              </div>
              <Toggle checked={!!bs.hideOnTablet} onChange={v => { patch({ hideOnTablet: v }); trackRecent("hide-tablet"); }} />
            </div>
          </div>
        </AccordionBlock>

        <AccordionBlock title="Animation">
          <p className="text-[10px] text-muted-foreground mb-2">
            Entrance animation — plays on the live site when the section scrolls into view
          </p>
          <div className="grid grid-cols-2 gap-1">
            {([["none","None"],["fadeIn","Fade In"],["slideUp","Slide Up"],["slideLeft","Slide Left"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => { patch({ animation: v }); trackRecent("animation"); }}
                className={`py-1.5 text-xs rounded transition-colors ${
                  (bs.animation ?? "none") === v
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}>{l}</button>
            ))}
          </div>
        </AccordionBlock>

        <AccordionBlock title="Anchor ID">
          <input type="text" value={bs.anchorId ?? ""}
            onChange={e => { patch({ anchorId: e.target.value || undefined }); trackRecent("anchor-id"); }}
            placeholder="e.g. about-section"
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono" />
          <p className="text-[10px] text-muted-foreground mt-1">
            Renders as <code className="font-mono bg-muted px-0.5 rounded">id="…"</code> on the public site. Link with <code className="font-mono bg-muted px-0.5 rounded">#about-section</code>
          </p>
        </AccordionBlock>

        <AccordionBlock title="CSS Class">
          <input type="text" value={bs.customClass ?? ""}
            onChange={e => { patch({ customClass: e.target.value || undefined }); trackRecent("css-class"); }}
            placeholder="e.g. my-custom-section"
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono" />
          <p className="text-[10px] text-muted-foreground mt-1">
            Appended to the section wrapper's <code className="font-mono bg-muted px-0.5 rounded">className</code>
          </p>
        </AccordionBlock>

        <AccordionBlock title="Custom Attributes">
          <p className="text-[10px] text-muted-foreground mb-2">
            JSON object of <code className="font-mono bg-muted px-0.5 rounded">data-*</code> attributes. Future-ready for analytics and integrations.
          </p>
          <textarea value={bs.customAttrs ?? ""}
            onChange={e => { patch({ customAttrs: e.target.value || undefined }); trackRecent("custom-attrs"); }}
            placeholder={'{\n  "data-section": "hero",\n  "data-track": "cta-view"\n}'}
            rows={4}
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono resize-none" />
          <p className="text-[10px] text-muted-foreground mt-1">
            Keys without <code className="font-mono bg-muted px-0.5 rounded">data-</code> prefix are auto-prefixed
          </p>
        </AccordionBlock>

        <div className="pt-3">
          <button type="button" onClick={onDeleteSection}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border border-red-200 dark:border-red-900">
            <Trash2 className="w-3.5 h-3.5" /> Delete Section
          </button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const sectionLabel = hasComponent
    ? "Component"
    : (SECTION_LABELS[section.type] ?? section.type);

  return (
    <div className="flex-shrink-0 border-l border-border bg-card flex flex-col overflow-hidden relative"
      style={{ width: panelWidth }}>

      {/* Resize handle — drag left edge to resize */}
      <div onMouseDown={handleResizeDrag}
        className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-20 group flex items-center"
        title="Drag to resize panel">
        <div className="w-px h-full bg-border group-hover:bg-primary/50 group-hover:w-0.5 transition-all" />
      </div>

      {/* Content — offset for resize handle */}
      <div className="flex flex-col h-full overflow-hidden">

        {/* Header: breadcrumb + action buttons */}
        <div className="px-3 pt-2 pb-1.5 flex-shrink-0 border-b border-border">
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50 mb-1 truncate">
            <span className="truncate">{pageName}</span>
            <span>›</span>
            <span className="font-medium text-muted-foreground truncate">{sectionLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest truncate">
              {sectionLabel}
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

        {/* Search results overlay */}
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
          <>
            {/* Tab bar */}
            <div className="flex border-b border-border flex-shrink-0 bg-card">
              {TABS.map(t => (
                <button key={t} onClick={() => switchTab(t)}
                  className={`flex-1 py-2 text-[10px] font-medium capitalize transition-colors ${
                    activeTab === t
                      ? "text-foreground border-b-2 border-primary -mb-px"
                      : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === "quick"    && renderQuickTab()}
              {activeTab === "content"  && renderContentTab()}
              {activeTab === "style"    && renderStyleTab()}
              {activeTab === "layout"   && renderLayoutTab()}
              {activeTab === "advanced" && renderAdvancedTab()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
