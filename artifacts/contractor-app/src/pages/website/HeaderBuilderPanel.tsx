import React, { useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Eye, EyeOff, GripVertical, ChevronDown, Phone, Mail, MousePointer,
  Image as ImageIcon, List, Type, Award, Plus, X,
  AlignLeft, AlignCenter, AlignRight, FileText,
} from "lucide-react";
import type { HeaderContent, HeaderSectionSettings, SitePageRef, NavLink } from "./sections/HeaderSection";
import { HeaderPreviewBar, DEFAULT_HEADER_ZONES, type HeaderBlockId } from "./sections/HeaderSection";
import { ButtonEditor } from "./sections/ButtonEditor";

// ── Block metadata ────────────────────────────────────────────────────────────

interface BlockDef {
  id: HeaderBlockId;
  label: string;
  icon: React.ReactNode;
}

const BLOCK_DEFS: BlockDef[] = [
  { id: "logo",          label: "Logo",          icon: <ImageIcon    className="w-3.5 h-3.5" /> },
  { id: "nav",           label: "Navigation",    icon: <List         className="w-3.5 h-3.5" /> },
  { id: "phone",         label: "Phone",         icon: <Phone        className="w-3.5 h-3.5" /> },
  { id: "email",         label: "Email",         icon: <Mail         className="w-3.5 h-3.5" /> },
  { id: "cta",           label: "CTA Button",    icon: <MousePointer className="w-3.5 h-3.5" /> },
  { id: "tagline",       label: "Tagline",       icon: <Type         className="w-3.5 h-3.5" /> },
  { id: "veteran-badge", label: "Veteran Badge", icon: <Award        className="w-3.5 h-3.5" /> },
  { id: "sdvosb-badge",  label: "SDVOSB Badge",  icon: <Award        className="w-3.5 h-3.5" /> },
];

const BLOCK_DEF_MAP = Object.fromEntries(BLOCK_DEFS.map(d => [d.id, d])) as Record<HeaderBlockId, BlockDef>;

// ── Visibility helpers ────────────────────────────────────────────────────────

function getBlockVisible(id: HeaderBlockId, c: HeaderContent): boolean {
  switch (id) {
    case "logo":          return (c.showLogo !== false) || (c.showBusinessName !== false);
    case "nav":           return c.showNav !== false;
    case "phone":         return c.showPhone !== false;
    case "email":         return c.showEmail === true;
    case "cta":           return c.showCta !== false;
    case "tagline":       return c.showTagline === true;
    case "veteran-badge": return c.showVeteranBadge === true;
    case "sdvosb-badge":  return c.showSdvosbBadge === true;
    default:              return false;
  }
}

function setBlockVisible(id: HeaderBlockId, visible: boolean, c: HeaderContent): HeaderContent {
  switch (id) {
    case "logo":          return { ...c, showLogo: visible, showBusinessName: visible };
    case "nav":           return { ...c, showNav: visible };
    case "phone":         return { ...c, showPhone: visible };
    case "email":         return { ...c, showEmail: visible };
    case "cta":           return { ...c, showCta: visible };
    case "tagline":       return { ...c, showTagline: visible };
    case "veteran-badge": return { ...c, showVeteranBadge: visible };
    case "sdvosb-badge":  return { ...c, showSdvosbBadge: visible };
    default:              return c;
  }
}

function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Sortable block row ────────────────────────────────────────────────────────

interface SortableBlockRowProps {
  blockId: HeaderBlockId;
  visible: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleVisible: () => void;
  children?: React.ReactNode;
}

function SortableBlockRow({
  blockId, visible, expanded, onToggleExpand, onToggleVisible, children,
}: SortableBlockRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: blockId });
  const def = BLOCK_DEF_MAP[blockId];

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors select-none ${
          isDragging ? "shadow-md bg-card border border-border" : "hover:bg-accent/40"
        }`}
      >
        <button
          type="button"
          className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleVisible}
          className={`p-0.5 rounded transition-colors flex-shrink-0 ${
            visible ? "text-foreground" : "text-muted-foreground/30"
          }`}
          title={visible ? "Hide block" : "Show block"}
        >
          {visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <span className={`flex-shrink-0 ${visible ? "text-muted-foreground" : "text-muted-foreground/30"}`}>
          {def?.icon}
        </span>
        <span className={`text-xs font-medium flex-1 min-w-0 truncate ${
          visible ? "text-foreground" : "text-muted-foreground/40"
        }`}>
          {def?.label ?? blockId}
        </span>
        <button
          type="button"
          onClick={onToggleExpand}
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          title={expanded ? "Collapse" : "Edit"}
        >
          <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>
      {expanded && children && (
        <div className="ml-8 mr-1 mb-1">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export interface HeaderBuilderPanelProps {
  content: HeaderContent;
  settings: HeaderSectionSettings;
  onChange: (content: HeaderContent) => void;
  businessName?: string;
  siteSlug?: string;
  pages?: SitePageRef[];
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

export function HeaderBuilderPanel({
  content,
  settings,
  onChange,
  businessName,
  siteSlug,
  pages = [],
}: HeaderBuilderPanelProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [navPagePickerOpen, setNavPagePickerOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const zones = content.blockZones ?? DEFAULT_HEADER_ZONES;

  function update(patch: Partial<HeaderContent>) {
    onChange({ ...content, ...patch });
  }

  function toggleVisible(id: HeaderBlockId) {
    onChange(setBlockVisible(id, !getBlockVisible(id, content), content));
  }

  function handleZoneDragEnd(zone: "left" | "center" | "right", event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const zoneBlocks = zones[zone];
    const oldIdx = zoneBlocks.indexOf(active.id as string);
    const newIdx = zoneBlocks.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    update({ blockZones: { ...zones, [zone]: arrayMove(zoneBlocks, oldIdx, newIdx) } });
  }

  // ── Nav link helpers ──────────────────────────────────────────────────────

  const navLinks: NavLink[] = content.navLinks ?? [];

  function addNavLink(page?: SitePageRef) {
    const newLink: NavLink = (page && siteSlug)
      ? { id: uid(), label: page.name, href: `/site/${siteSlug}/${page.slug}` }
      : { id: uid(), label: "New Link", href: "#" };
    update({ navLinks: [...navLinks, newLink] });
    setNavPagePickerOpen(false);
  }

  function updateNavLink(id: string, patch: Partial<NavLink>) {
    update({ navLinks: navLinks.map(l => l.id === id ? { ...l, ...patch } : l) });
  }

  function removeNavLink(id: string) {
    update({ navLinks: navLinks.filter(l => l.id !== id) });
  }

  // ── Logo height resolution ─────────────────────────────────────────────────

  const LOGO_SIZE_TO_PX: Record<string, number> = {
    sm: 48, small: 48, md: 64, medium: 64, lg: 80, large: 80,
  };
  const currentLogoHeightPx =
    typeof content.logoSize === "number"
      ? content.logoSize
      : LOGO_SIZE_TO_PX[content.logoSize as string] ?? 64;

  // ── Block inline editors ──────────────────────────────────────────────────

  function renderBlockEditor(id: HeaderBlockId): React.ReactNode {
    switch (id) {

      case "logo":
        return (
          <div className="space-y-2.5">
            <label className="flex items-center justify-between py-0.5 cursor-pointer">
              <span className="text-xs text-muted-foreground">Show logo image</span>
              <input
                type="checkbox" className="w-3.5 h-3.5 accent-primary"
                checked={content.showLogo !== false}
                onChange={e => update({ showLogo: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between py-0.5 cursor-pointer">
              <span className="text-xs text-muted-foreground">Show business name</span>
              <input
                type="checkbox" className="w-3.5 h-3.5 accent-primary"
                checked={content.showBusinessName !== false}
                onChange={e => update({ showBusinessName: e.target.checked })}
              />
            </label>
            {settings.logoUrl && (
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Logo Height</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{currentLogoHeightPx}px</span>
                </div>
                <input
                  type="range" min={40} max={120} step={4} value={currentLogoHeightPx}
                  onChange={e => update({ logoSize: parseInt(e.target.value) })}
                  className="w-full h-1.5 appearance-none rounded-full cursor-pointer accent-primary bg-muted"
                />
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Alignment</p>
              <div className="flex gap-1">
                {(["left", "center", "right"] as const).map(a => (
                  <button
                    key={a} type="button" onClick={() => update({ logoAlignment: a })}
                    className={`flex-1 flex items-center justify-center py-1 rounded border text-xs transition-colors ${
                      (content.logoAlignment ?? "left") === a
                        ? "bg-primary/10 border-primary text-primary"
                        : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                    }`}
                  >
                    {a === "left" ? <AlignLeft className="w-3 h-3" /> : a === "center" ? <AlignCenter className="w-3 h-3" /> : <AlignRight className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            </div>
            {!settings.logoUrl && (
              <p className="text-[10px] text-muted-foreground italic">Upload a logo in Site Settings → Branding.</p>
            )}
          </div>
        );

      case "tagline":
        return (
          <div className="space-y-1.5">
            <input
              type="text"
              value={content.tagline ?? ""}
              onChange={e => update({ tagline: e.target.value })}
              placeholder="e.g. Serving the DMV since 2005"
              className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary placeholder-muted-foreground/50"
            />
          </div>
        );

      case "nav":
        return (
          <div className="space-y-2">
            <div className="space-y-1.5">
              {navLinks.map(link => (
                <div key={link.id} className="flex items-center gap-1">
                  <input
                    type="text" value={link.label}
                    onChange={e => updateNavLink(link.id, { label: e.target.value })}
                    placeholder="Label"
                    className="flex-1 min-w-0 text-[11px] border border-border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="text" value={link.href}
                    onChange={e => updateNavLink(link.id, { href: e.target.value })}
                    placeholder="#section"
                    className={`flex-1 min-w-0 text-[11px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary ${
                      link.href.startsWith("/site/") ? "border-primary/50 text-primary/90" : "border-border"
                    }`}
                  />
                  <button
                    type="button" onClick={() => removeNavLink(link.id)}
                    className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="relative">
              {pages.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setNavPagePickerOpen(v => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add link
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                  {navPagePickerOpen && (
                    <>
                      <div className="fixed inset-0 z-[99]" onClick={() => setNavPagePickerOpen(false)} />
                      <div className="absolute top-full left-0 mt-1 z-[100] bg-card border border-border rounded-lg shadow-lg overflow-hidden min-w-[160px]">
                        <div className="px-2.5 py-1.5 border-b border-border">
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Your Pages</p>
                        </div>
                        {pages.map(page => (
                          <button
                            key={page.id} type="button" onClick={() => addNavLink(page)}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent transition-colors"
                          >
                            <FileText className="w-3 h-3 text-primary/60 flex-shrink-0" />
                            {page.name}
                          </button>
                        ))}
                        <div className="border-t border-border">
                          <button
                            type="button" onClick={() => addNavLink()}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent transition-colors"
                          >
                            <Plus className="w-3 h-3 flex-shrink-0" /> Custom link
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <button
                  type="button" onClick={() => addNavLink()}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add link
                </button>
              )}
            </div>
          </div>
        );

      case "phone":
        return (
          <input
            type="tel" value={content.phone ?? ""}
            onChange={e => update({ phone: e.target.value })}
            placeholder="(555) 555-5555"
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        );

      case "email":
        return (
          <input
            type="email" value={content.email ?? ""}
            onChange={e => update({ email: e.target.value })}
            placeholder="info@yourbusiness.com"
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        );

      case "cta":
        return (
          <div className="space-y-2">
            <input
              type="text" value={content.ctaLabel ?? ""}
              onChange={e => update({ ctaLabel: e.target.value })}
              placeholder="Get a Quote"
              className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Button Style</p>
              <ButtonEditor config={content.ctaConfig} onChange={cfg => update({ ctaConfig: cfg })} />
            </div>
          </div>
        );

      case "veteran-badge":
        return (
          <p className="text-[11px] text-muted-foreground">
            Displays a "Veteran-Owned" badge next to your logo.
          </p>
        );

      case "sdvosb-badge":
        return (
          <p className="text-[11px] text-muted-foreground">
            Displays an "SDVOSB" (Service-Disabled Veteran-Owned Small Business) badge.
          </p>
        );

      default:
        return null;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const ZONE_LABELS: Record<string, string> = { left: "Left", center: "Center", right: "Right" };

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Panel header */}
      <div className="px-4 py-2.5 border-b border-border flex-shrink-0">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Header Builder</p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Mini preview — 40% scale live header */}
        <div
          className="mx-3 mt-3 mb-2 rounded-md border border-border shadow-sm overflow-hidden"
          style={{ height: 36 }}
          aria-hidden
        >
          <div style={{ transform: "scale(0.4)", transformOrigin: "top left", width: "250%", pointerEvents: "none" }}>
            <HeaderPreviewBar content={content} settings={settings} businessName={businessName} />
          </div>
        </div>

        {/* Zone sections */}
        <div className="px-3 py-1 space-y-4">
          {(["left", "center", "right"] as const).map(zone => {
            const zoneBlocks = zones[zone];
            return (
              <div key={zone}>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-muted">{ZONE_LABELS[zone]}</span>
                  <span className="font-normal text-muted-foreground/40">zone</span>
                </p>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={e => handleZoneDragEnd(zone, e)}
                >
                  <SortableContext items={zoneBlocks} strategy={verticalListSortingStrategy}>
                    <div className="space-y-0.5">
                      {zoneBlocks.map(blockId => {
                        const bid = blockId as HeaderBlockId;
                        const visible = getBlockVisible(bid, content);
                        const expandKey = `${zone}:${blockId}`;
                        const expanded = expandedKey === expandKey;
                        const editor = renderBlockEditor(bid);
                        return (
                          <SortableBlockRow
                            key={blockId}
                            blockId={bid}
                            visible={visible}
                            expanded={expanded}
                            onToggleExpand={() => setExpandedKey(prev => prev === expandKey ? null : expandKey)}
                            onToggleVisible={() => toggleVisible(bid)}
                          >
                            {editor && (
                              <div className="border border-border rounded-lg p-2.5 bg-muted/20">
                                {editor}
                              </div>
                            )}
                          </SortableBlockRow>
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            );
          })}
        </div>

        {/* Advanced settings */}
        <div className="px-3 pt-2 pb-4 border-t border-border mt-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen(v => !v)}
            className="flex items-center justify-between w-full py-1.5"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Advanced</span>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 ${advancedOpen ? "rotate-180" : ""}`} />
          </button>
          {advancedOpen && (
            <div className="space-y-3 pt-1 pb-2">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Header Style</p>
                <div className="flex gap-1">
                  {(["light", "dark", "transparent"] as const).map(s => (
                    <button
                      key={s} type="button" onClick={() => update({ headerStyle: s })}
                      className={`flex-1 py-1 text-[10px] rounded border capitalize transition-colors ${
                        (content.headerStyle ?? settings.headerStyle ?? "light") === s
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-border/80 bg-background"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between py-0.5 cursor-pointer">
                <span className="text-xs text-foreground">Sticky header</span>
                <input
                  type="checkbox" className="w-3.5 h-3.5 accent-primary"
                  checked={content.sticky !== false}
                  onChange={e => update({ sticky: e.target.checked })}
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
