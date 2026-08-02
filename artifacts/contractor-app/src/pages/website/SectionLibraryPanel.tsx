import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, Star, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTION_TEMPLATES } from "./sectionTemplates";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LibraryItem {
  id: string;
  kind: "blank" | "template";
  label: string;
  description: string;
  emoji: string;
  category: string;
  /** Section type string for kind="blank" insertions */
  sectionType?: string;
  /** Template ID for kind="template" insertions */
  templateId?: string;
}

export interface SectionLibraryPanelProps {
  show: boolean;
  onClose: () => void;
  /** Insert a blank section by type name */
  onAddSection: (type: string) => void;
  /** Insert a section from a pre-built template */
  onAddSectionFromTemplate: (id: string) => void;
}

// ─── Static data ──────────────────────────────────────────────────────────────

/** Blank sections — one entry per addable section type */
const BLANK_ITEMS: LibraryItem[] = [
  // Hero
  { id: "b:hero",            kind: "blank", label: "Hero Banner",            description: "Full-width headline, subtext, and a CTA button",                emoji: "🚀", category: "Hero",         sectionType: "hero" },
  { id: "b:cta",             kind: "blank", label: "CTA Banner",             description: "Bold call-to-action strip with headline and button",           emoji: "📣", category: "Marketing",    sectionType: "cta" },
  // Contractor
  { id: "b:why-choose-us",   kind: "blank", label: "Why Choose Us",          description: "Selling points explaining why customers should hire you",      emoji: "🏆", category: "Contractor",   sectionType: "why-choose-us" },
  { id: "b:certifications",  kind: "blank", label: "Certifications",         description: "Show licenses, awards, and industry credentials",              emoji: "🎖️", category: "Contractor",   sectionType: "certifications" },
  { id: "b:service-area",    kind: "blank", label: "Coverage Map",           description: "Interactive US state map showing where you work",              emoji: "🗺️", category: "Contractor",   sectionType: "service-area" },
  { id: "b:before-after",    kind: "blank", label: "Before & After",         description: "Side-by-side before/after photo pairs from real jobs",         emoji: "↔️", category: "Contractor",   sectionType: "before-after" },
  { id: "b:featured-clients",kind: "blank", label: "Featured Clients",       description: "Highlight companies and organizations you've worked with",     emoji: "🤝", category: "Contractor",   sectionType: "featured-clients" },
  { id: "b:partners",        kind: "blank", label: "Partners & Brands",      description: "Manufacturers, suppliers, and brands you install or service",  emoji: "🏭", category: "Contractor",   sectionType: "partners" },
  // Business
  { id: "b:services",        kind: "blank", label: "Services",               description: "Showcase what you offer with a grid of service cards",         emoji: "🔧", category: "Business",     sectionType: "services" },
  { id: "b:stats",           kind: "blank", label: "Stats / Numbers",        description: "Highlight key numbers like years in business or jobs done",    emoji: "📊", category: "Business",     sectionType: "stats" },
  { id: "b:faq",             kind: "blank", label: "FAQ",                    description: "Accordion Q&A to answer common questions",                     emoji: "❓", category: "Business",     sectionType: "faq" },
  // Social Proof
  { id: "b:testimonials",    kind: "blank", label: "Testimonials",           description: "Customer reviews in a card or carousel layout",                emoji: "💬", category: "Social Proof", sectionType: "testimonials" },
  // Layout
  { id: "b:columns",         kind: "blank", label: "Columns",                description: "Two or three side-by-side columns of mixed content",           emoji: "⬛", category: "Layout",       sectionType: "columns" },
  { id: "b:content",         kind: "blank", label: "Content Block",          description: "Rich content area with text, images, and components",          emoji: "📝", category: "Layout",       sectionType: "content" },
  { id: "b:row",             kind: "blank", label: "Row",                    description: "Flexible row for custom component layouts",                    emoji: "📐", category: "Layout",       sectionType: "row" },
  { id: "b:text",            kind: "blank", label: "Text Block",             description: "Simple heading and paragraph for announcements",               emoji: "✍️", category: "Layout",       sectionType: "text" },
  // Media
  { id: "b:gallery",         kind: "blank", label: "Image Gallery",          description: "A responsive photo grid for portfolio or projects",            emoji: "🖼️", category: "Media",        sectionType: "gallery" },
  { id: "b:image",           kind: "blank", label: "Image",                  description: "A single full-width or constrained image with caption",        emoji: "📷", category: "Media",        sectionType: "image" },
  // Contact
  { id: "b:contact",         kind: "blank", label: "Contact / Quote Form",   description: "A form visitors use to request a quote or reach out",          emoji: "📬", category: "Contact",      sectionType: "contact" },
  // Legal
  { id: "b:legal",           kind: "blank", label: "Legal / Disclaimer",     description: "Privacy policy, terms of service, or a legal disclosure",     emoji: "⚖️", category: "Legal",        sectionType: "legal" },
];

/** Pre-built template items sourced from sectionTemplates.ts */
const TEMPLATE_ITEMS: LibraryItem[] = SECTION_TEMPLATES.map(tpl => ({
  id: `t:${tpl.id}`,
  kind: "template" as const,
  label: tpl.name,
  description: tpl.description,
  emoji: tpl.emoji,
  category: tpl.category,
  templateId: tpl.id,
}));

const ALL_ITEMS: LibraryItem[] = [...BLANK_ITEMS, ...TEMPLATE_ITEMS];

/** Ordered category list shown in the tab bar */
const CATEGORIES = ["All", "Hero", "Contractor", "Business", "Social Proof", "Marketing", "Layout", "Media", "Contact", "Legal"];

const LS_FAV_KEY = "website-section-library-favorites-v1";

function loadFavs(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_FAV_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavs(favs: Set<string>) {
  try {
    localStorage.setItem(LS_FAV_KEY, JSON.stringify([...favs]));
  } catch { /* quota */ }
}

// ─── Main panel component ─────────────────────────────────────────────────────

export function SectionLibraryPanel({
  show,
  onClose,
  onAddSection,
  onAddSectionFromTemplate,
}: SectionLibraryPanelProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [showFavs, setShowFavs] = useState(false);
  const [favIds, setFavIds] = useState<Set<string>>(() => loadFavs());
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset and focus on open
  useEffect(() => {
    if (show) {
      setSearch("");
      setActiveCategory("All");
      setShowFavs(false);
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  }, [show]);

  // Esc closes (capture phase so it fires before canvas Esc handler)
  useEffect(() => {
    if (!show) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [show, onClose]);

  function toggleFav(id: string) {
    setFavIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavs(next);
      return next;
    });
  }

  const q = search.toLowerCase().trim();

  const filteredItems = useMemo<LibraryItem[]>(() => {
    let base = showFavs ? ALL_ITEMS.filter(it => favIds.has(it.id)) : ALL_ITEMS;
    if (!showFavs && activeCategory !== "All") base = base.filter(it => it.category === activeCategory);
    if (q) base = base.filter(it =>
      it.label.toLowerCase().includes(q) ||
      it.description.toLowerCase().includes(q) ||
      it.category.toLowerCase().includes(q)
    );
    return base;
  }, [showFavs, activeCategory, q, favIds]);

  /** When showing "All" without search, group items by category for readability */
  const groupedItems = useMemo<Map<string, LibraryItem[]> | null>(() => {
    if (q || showFavs || activeCategory !== "All") return null;
    const map = new Map<string, LibraryItem[]>();
    for (const item of filteredItems) {
      const arr = map.get(item.category) ?? [];
      arr.push(item);
      map.set(item.category, arr);
    }
    return map;
  }, [filteredItems, q, showFavs, activeCategory]);

  function handleInsert(item: LibraryItem) {
    if (item.kind === "blank" && item.sectionType) {
      onAddSection(item.sectionType);
    } else if (item.kind === "template" && item.templateId) {
      onAddSectionFromTemplate(item.templateId);
    }
    // onClose is called inside addSection / addSectionFromTemplate already
  }

  if (!show) return null;

  return createPortal(
    <>
      {/* Backdrop — click to close */}
      <div
        className="fixed inset-0 z-[400] bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in panel — from right */}
      <div
        className="fixed top-0 right-0 z-[401] w-full max-w-[460px] h-full bg-card border-l border-border shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Section Library"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search sections…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-muted/50 border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Category tabs ────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center gap-1 px-3 py-2 border-b border-border overflow-x-auto scrollbar-none">
          {/* Favorites tab */}
          <button
            type="button"
            onClick={() => { setShowFavs(true); setActiveCategory("All"); }}
            className={cn(
              "flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
              showFavs
                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Star className={cn("w-3 h-3", showFavs && "fill-current")} />
            Favorites
            {favIds.size > 0 && (
              <span className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 rounded-full px-1 text-[9px] font-bold">
                {favIds.size}
              </span>
            )}
          </button>

          <div className="w-px h-3.5 bg-border flex-shrink-0 mx-1" />

          {CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => { setShowFavs(false); setActiveCategory(cat); }}
              className={cn(
                "flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
                !showFavs && activeCategory === cat
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* ── Card grid ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {filteredItems.length === 0 ? (
            <EmptyState search={q} showFavs={showFavs} />
          ) : groupedItems ? (
            /* All-category grouped view */
            [...groupedItems.entries()].map(([cat, items]) => (
              <div key={cat} className="mb-5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-1 mb-2">
                  {cat}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {items.map(item => (
                    <SectionCard
                      key={item.id}
                      item={item}
                      isFav={favIds.has(item.id)}
                      onInsert={() => handleInsert(item)}
                      onToggleFav={() => toggleFav(item.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            /* Flat grid — filtered or single-category */
            <div className="grid grid-cols-2 gap-2">
              {filteredItems.map(item => (
                <SectionCard
                  key={item.id}
                  item={item}
                  isFav={favIds.has(item.id)}
                  onInsert={() => handleInsert(item)}
                  onToggleFav={() => toggleFav(item.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Footer — AI teaser ───────────────────────────────── */}
        <div className="flex-shrink-0 border-t border-border p-3">
          <button
            type="button"
            disabled
            title="Coming in a future release"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-border/60 bg-muted/20 text-muted-foreground/60 cursor-not-allowed text-sm select-none"
          >
            <Sparkles className="w-4 h-4 text-purple-400/60" />
            Generate section with AI
            <span className="ml-1 text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground/50">Coming Soon</span>
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
  item,
  isFav,
  onInsert,
  onToggleFav,
}: {
  item: LibraryItem;
  isFav: boolean;
  onInsert: () => void;
  onToggleFav: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onInsert}
      className="relative flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* Favorite star — visible on hover or when already favorited */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onToggleFav(); }}
        className={cn(
          "absolute top-1.5 right-1.5 p-0.5 rounded transition-all",
          isFav
            ? "text-yellow-500 opacity-100"
            : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-yellow-500"
        )}
        title={isFav ? "Remove from favorites" : "Save to favorites"}
        aria-label={isFav ? "Remove from favorites" : "Save to favorites"}
      >
        <Star className={cn("w-3.5 h-3.5", isFav && "fill-current")} />
      </button>

      {/* Emoji thumbnail */}
      <span className="text-3xl leading-none select-none" role="img" aria-hidden="true">
        {item.emoji}
      </span>

      {/* Label + description */}
      <div className="min-w-0 w-full">
        <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">
          {item.label}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
          {item.description}
        </div>
      </div>

      {/* Kind badge — "Template" for pre-built items */}
      {item.kind === "template" && (
        <span className="absolute bottom-1.5 left-1.5 text-[8px] font-bold uppercase tracking-wide text-primary/50 bg-primary/8 px-1 py-0.5 rounded">
          Template
        </span>
      )}
    </button>
  );
}

// ─── Empty states ─────────────────────────────────────────────────────────────

function EmptyState({ search, showFavs }: { search: string; showFavs: boolean }) {
  if (showFavs) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <Star className="w-10 h-10 text-muted-foreground/20 mb-3" />
        <p className="text-sm font-semibold text-foreground mb-1">No favorites yet</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Click the <Star className="w-3 h-3 inline text-yellow-500" /> on any section card to save it here for quick access.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      <Search className="w-10 h-10 text-muted-foreground/20 mb-3" />
      <p className="text-sm font-semibold text-foreground mb-1">No sections match</p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        No results for <span className="font-medium text-foreground">"{search}"</span>. Try a different keyword or browse a category tab.
      </p>
    </div>
  );
}
