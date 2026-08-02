import React, { useState, useMemo } from "react";
import {
  Type, AlignLeft, MousePointer, Image as ImageIcon, Minus, Smile, PlayCircle,
  Square, Quote, Mail, MapPin, GripVertical, Search, X,
} from "lucide-react";
import type { ComponentType } from "./sections/ContentSection";

// ── Component registry ──────────────────────────────────────────────────────

interface ComponentEntry {
  type: ComponentType;
  label: string;
  description: string;
  Icon: React.FC<{ className?: string }>;
}

/** All component types grouped by category for the library panel. */
export const COMPONENT_CATEGORIES: Array<{ name: string; items: ComponentEntry[] }> = [
  {
    name: "Text",
    items: [
      { type: "heading",   label: "Heading",   description: "H1–H4 title text",          Icon: Type },
      { type: "paragraph", label: "Paragraph", description: "Body text block",            Icon: AlignLeft },
    ],
  },
  {
    name: "Media",
    items: [
      { type: "image", label: "Image",       description: "Photo or graphic",            Icon: ImageIcon },
      { type: "video", label: "Video",       description: "YouTube / Vimeo embed",       Icon: PlayCircle },
      { type: "icon",  label: "Icon / Emoji", description: "Emoji or decorative symbol", Icon: Smile },
    ],
  },
  {
    name: "Interactive",
    items: [
      { type: "button", label: "Button", description: "Clickable button or link", Icon: MousePointer },
      { type: "form",   label: "Form",   description: "Simple contact form",      Icon: Mail },
      { type: "map",    label: "Map",    description: "Google Maps embed",        Icon: MapPin },
    ],
  },
  {
    name: "Content",
    items: [
      { type: "card",        label: "Card",        description: "Image + text + CTA card",  Icon: Square },
      { type: "testimonial", label: "Testimonial", description: "Customer quote block",     Icon: Quote },
      { type: "divider",     label: "Divider",     description: "Horizontal rule / spacer", Icon: Minus },
    ],
  },
];

/** Flat map from type → label for ghost rendering in WebsiteEditor. */
export const COMPONENT_TYPE_LABELS: Partial<Record<ComponentType, string>> = Object.fromEntries(
  COMPONENT_CATEGORIES.flatMap(cat => cat.items.map(item => [item.type, item.label]))
);

// ── Panel component ──────────────────────────────────────────────────────────

interface ComponentLibraryPanelProps {
  /** Type of the currently active section — determines double-click availability hint */
  activeSectionType: string | null;
  /**
   * Called on pointerdown on a component entry — starts the library drag.
   * The caller should attach global pointermove/pointerup listeners.
   */
  onDragStart: (type: ComponentType, label: string, e: React.PointerEvent<HTMLElement>) => void;
  /**
   * Called on double-click — quick-inserts into the active content section.
   * Caller is responsible for showing a toast if no content section is selected.
   */
  onDoubleClick: (type: ComponentType) => void;
}

export function ComponentLibraryPanel({
  activeSectionType,
  onDragStart,
  onDoubleClick,
}: ComponentLibraryPanelProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return COMPONENT_CATEGORIES;
    const q = search.toLowerCase();
    return COMPONENT_CATEGORIES.map(cat => ({
      ...cat,
      items: cat.items.filter(
        item =>
          item.label.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
      ),
    })).filter(cat => cat.items.length > 0);
  }, [search]);

  const canQuickInsert = activeSectionType === "content";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search */}
      <div className="px-2 py-1.5 border-b border-border/50 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search components…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-6 pr-6 py-0.5 text-[11px] border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* Component groups */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3">
        {filtered.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-6">
            No components match "{search}"
          </p>
        )}
        {filtered.map(cat => (
          <div key={cat.name}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1">
              {cat.name}
            </p>
            <div className="space-y-0.5">
              {cat.items.map(item => {
                const Icon = item.Icon;
                return (
                  <div
                    key={item.type}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab active:cursor-grabbing hover:bg-accent/60 border border-transparent hover:border-border/50 transition-colors select-none group"
                    onPointerDown={e => onDragStart(item.type, item.label, e)}
                    onDoubleClick={e => { e.stopPropagation(); onDoubleClick(item.type); }}
                    title={`${item.description}${canQuickInsert ? "\n\nDouble-click to add to the selected section" : "\n\nDrag onto a Content Block section to add"}`}
                  >
                    <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-[11px] font-medium text-foreground flex-1 min-w-0 truncate">
                      {item.label}
                    </span>
                    <GripVertical className="w-3 h-3 text-muted-foreground/40 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Usage hint */}
      <div className="px-3 py-2 border-t border-border/50 flex-shrink-0">
        <p className="text-[10px] text-muted-foreground leading-tight">
          {canQuickInsert
            ? "Drag onto canvas · double-click to insert"
            : "Select a Content Block, then drag or double-click"}
        </p>
      </div>
    </div>
  );
}
