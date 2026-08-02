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
  /** Extra search synonyms — not displayed, only used for filtering */
  keywords?: string[];
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
  // Getting Started
  {
    id: "b:hero", kind: "blank", label: "Hero Banner", category: "Getting Started", sectionType: "hero",
    description: "Full-width headline, subtext, and a CTA button",
    emoji: "🚀",
    keywords: ["headline", "banner", "top", "first", "landing", "welcome", "above fold", "intro"],
  },
  {
    id: "b:faq", kind: "blank", label: "FAQ", category: "Getting Started", sectionType: "faq",
    description: "Accordion Q&A to answer common visitor questions",
    emoji: "❓",
    keywords: ["questions", "answers", "common", "help", "q&a", "support", "accordion"],
  },

  // About
  {
    id: "b:meet-owner", kind: "blank", label: "Owner / Team Story", category: "About", sectionType: "meet-owner",
    description: "Introduce yourself or your crew with photo, bio, stats, and badges",
    emoji: "👤",
    keywords: ["owner", "biography", "story", "meet", "introduction", "about me", "who we are", "founder", "personal", "veteran"],
  },
  {
    id: "b:service-area", kind: "blank", label: "Coverage Map", category: "About", sectionType: "service-area",
    description: "Interactive US state map showing where you work",
    emoji: "🗺️",
    keywords: ["map", "coverage", "states", "where", "location", "region", "territory", "geography", "service area"],
  },
  {
    id: "b:partners", kind: "blank", label: "Partners & Brands", category: "About", sectionType: "partners",
    description: "Manufacturers, suppliers, and brands you install or service",
    emoji: "🏭",
    keywords: ["manufacturers", "suppliers", "brands", "vendor", "distributor", "authorized dealer", "logos"],
  },

  // Services
  {
    id: "b:services", kind: "blank", label: "Services", category: "Services", sectionType: "services",
    description: "Showcase what you offer with a grid of service cards",
    emoji: "🔧",
    keywords: ["what we offer", "service list", "offerings", "packages", "work we do", "cards"],
  },
  {
    id: "b:process", kind: "blank", label: "How We Work", category: "Services", sectionType: "process",
    description: "Numbered step flow showing prospects exactly what to expect",
    emoji: "➡️",
    keywords: ["steps", "process", "how it works", "workflow", "procedure", "numbered", "what to expect", "timeline"],
  },
  {
    id: "b:before-after", kind: "blank", label: "Before & After", category: "Services", sectionType: "before-after",
    description: "Side-by-side before/after photo pairs from real jobs",
    emoji: "↔️",
    keywords: ["photos", "results", "transformation", "comparison", "project", "work samples", "portfolio", "reveal"],
  },
  {
    id: "b:why-choose-us", kind: "blank", label: "Why Choose Us", category: "Services", sectionType: "why-choose-us",
    description: "Selling points explaining why customers should hire you",
    emoji: "🏆",
    keywords: ["benefits", "reasons", "unique", "differentiator", "selling points", "value proposition", "advantages"],
  },

  // Trust
  {
    id: "b:testimonials", kind: "blank", label: "Testimonials", category: "Trust", sectionType: "testimonials",
    description: "Customer reviews in a card or carousel layout",
    emoji: "💬",
    keywords: ["reviews", "star", "rating", "social proof", "feedback", "five star", "google", "customers"],
  },
  {
    id: "b:stats", kind: "blank", label: "Stats / Numbers", category: "Trust", sectionType: "stats",
    description: "Highlight key numbers like years in business or jobs done",
    emoji: "📊",
    keywords: ["numbers", "achievements", "years", "jobs", "proven", "track record", "experience", "count"],
  },
  {
    id: "b:certifications", kind: "blank", label: "Certifications", category: "Trust", sectionType: "certifications",
    description: "Show licenses, awards, and industry credentials",
    emoji: "🎖️",
    keywords: ["license", "badge", "award", "credential", "accreditation", "certified", "insured", "bonded"],
  },
  {
    id: "b:featured-clients", kind: "blank", label: "Featured Clients", category: "Trust", sectionType: "featured-clients",
    description: "Highlight companies and organizations you've worked with",
    emoji: "🤝",
    keywords: ["clients", "customers", "logos", "companies", "references", "who we work with", "brands"],
  },

  // Marketing
  {
    id: "b:cta", kind: "blank", label: "CTA Banner", category: "Marketing", sectionType: "cta",
    description: "Bold call-to-action strip with headline and button",
    emoji: "📣",
    keywords: ["call to action", "button", "convert", "get started", "conversion", "action", "signup", "dark"],
  },

  // Layout
  {
    id: "b:columns", kind: "blank", label: "Columns", category: "Layout", sectionType: "columns",
    description: "Two or three side-by-side columns of mixed content",
    emoji: "⬛",
    keywords: ["two column", "three column", "grid", "side by side", "split layout"],
  },
  {
    id: "b:content", kind: "blank", label: "Content Block", category: "Layout", sectionType: "content",
    description: "Rich content area with text, images, and components",
    emoji: "📝",
    keywords: ["rich text", "components", "block", "custom", "flexible", "mixed"],
  },
  {
    id: "b:row", kind: "blank", label: "Row", category: "Layout", sectionType: "row",
    description: "Flexible row for custom component layouts",
    emoji: "📐",
    keywords: ["row", "horizontal", "flex", "custom layout", "drag drop"],
  },
  {
    id: "b:text", kind: "blank", label: "Text Block", category: "Layout", sectionType: "text",
    description: "Simple heading and paragraph for announcements",
    emoji: "✍️",
    keywords: ["text", "paragraph", "copy", "announcement", "simple", "heading"],
  },
  {
    id: "b:gallery", kind: "blank", label: "Image Gallery", category: "Layout", sectionType: "gallery",
    description: "A responsive photo grid for portfolio or projects",
    emoji: "🖼️",
    keywords: ["photos", "images", "portfolio", "projects", "work samples", "pictures", "grid"],
  },
  {
    id: "b:image", kind: "blank", label: "Image", category: "Layout", sectionType: "image",
    description: "A single full-width or constrained image with caption",
    emoji: "📷",
    keywords: ["photo", "picture", "banner image", "full width", "single image"],
  },

  // Contact
  {
    id: "b:contact", kind: "blank", label: "Contact / Quote Form", category: "Contact", sectionType: "contact",
    description: "A form visitors use to request a quote or reach out",
    emoji: "📬",
    keywords: ["form", "quote request", "get in touch", "email", "phone", "reach out", "message"],
  },

  // Footer
  {
    id: "b:legal", kind: "blank", label: "Legal / Disclaimer", category: "Footer", sectionType: "legal",
    description: "Privacy policy, terms of service, or a legal disclosure",
    emoji: "⚖️",
    keywords: ["privacy", "terms", "disclaimer", "policy", "compliance", "legal text"],
  },
];

/** Pre-built template items sourced from sectionTemplates.ts */
const TEMPLATE_ITEMS: LibraryItem[] = SECTION_TEMPLATES.map(tpl => ({
  id: `t:${tpl.id}`,
  kind: "template" as const,
  label: tpl.name,
  description: tpl.description,
  emoji: tpl.emoji,
  category: tpl.category,
  keywords: tpl.keywords,
  sectionType: tpl.sectionType,
  templateId: tpl.id,
}));

const ALL_ITEMS: LibraryItem[] = [...BLANK_ITEMS, ...TEMPLATE_ITEMS];

/** Ordered category list shown in the tab bar */
const CATEGORIES = ["All", "Getting Started", "About", "Services", "Trust", "Marketing", "Layout", "Contact", "Footer"];

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
      it.category.toLowerCase().includes(q) ||
      (it.keywords ?? []).some(kw => kw.toLowerCase().includes(q))
    );
    return base;
  }, [showFavs, activeCategory, q, favIds]);

  /** When showing "All" without search, group items by category for readability */
  const groupedItems = useMemo<Map<string, LibraryItem[]> | null>(() => {
    if (q || showFavs || activeCategory !== "All") return null;
    const map = new Map<string, LibraryItem[]>();
    // Use CATEGORIES order so groups appear in the correct sequence
    for (const cat of CATEGORIES.slice(1)) {
      const items = filteredItems.filter(it => it.category === cat);
      if (items.length > 0) map.set(cat, items);
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

// ─── SVG Preview Thumbnails ───────────────────────────────────────────────────

/**
 * Maps a category name to a section type when a template doesn't have an explicit
 * sectionType (i.e. it's a row-based template). The thumbnail for the category
 * is used as the visual representation.
 */
const CATEGORY_TYPE_MAP: Record<string, string> = {
  "Getting Started": "hero",
  "About":           "meet-owner",
  "Services":        "services",
  "Trust":           "testimonials",
  "Marketing":       "cta",
  "Layout":          "columns",
  "Contact":         "contact",
  "Footer":          "legal",
};

function SectionPreviewThumb({ sectionType, category }: { sectionType?: string; category: string }) {
  const type = sectionType ?? CATEGORY_TYPE_MAP[category] ?? "content";

  // Palette
  const bg  = "#f8fafc";
  const W   = "#ffffff";
  const L   = "#e2e8f0";
  const A   = "#4f46e5";
  const AL  = "#e0e7ff";
  const M   = "#cbd5e1";
  const G   = "#94a3b8";
  const D   = "#1e293b";

  let inner: React.ReactNode;

  switch (type) {
    case "hero":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        <rect x="0" y="0" width="120" height="8" fill={D} />
        <rect x="15" y="15" width="90" height="7" fill={D} rx="2" />
        <rect x="25" y="26" width="70" height="4" fill={G} rx="2" />
        <rect x="30" y="33" width="60" height="3" fill={M} rx="1.5" />
        <rect x="40" y="42" width="40" height="13" fill={A} rx="4" />
      </>;
      break;

    case "cta":
      inner = <>
        <rect width="120" height="68" fill="#1f2937" />
        <rect x="15" y="16" width="90" height="7" fill="#f1f5f9" rx="2" />
        <rect x="25" y="28" width="70" height="4" fill={G} rx="2" />
        <rect x="35" y="40" width="50" height="14" fill={A} rx="4" />
      </>;
      break;

    case "services":
    case "why-choose-us":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        {[4, 43, 82].map((x, i) => (
          <g key={i}>
            <rect x={x} y="6" width="34" height="56" fill={W} stroke={L} strokeWidth="1" rx="4" />
            <circle cx={x + 17} cy="20" r="7" fill={AL} />
            <rect x={x + 5} y="33" width="24" height="4" fill={D} rx="2" />
            <rect x={x + 5} y="41" width="24" height="3" fill={G} rx="1.5" />
            <rect x={x + 5} y="47" width="18" height="3" fill={M} rx="1.5" />
          </g>
        ))}
      </>;
      break;

    case "process":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        {[14, 46, 78, 110].map((cx, i) => (
          <g key={i}>
            <circle cx={cx} cy="26" r="10" fill={i === 3 ? A : AL} />
            <rect x={cx - 3} y="23" width="6" height="6" fill={i === 3 ? W : A} rx="1" />
            <rect x={cx - 11} y="42" width="22" height="3" fill={G} rx="1.5" />
            <rect x={cx - 9} y="48" width="18" height="2.5" fill={M} rx="1" />
          </g>
        ))}
        {[23, 55, 87].map((x, i) => (
          <rect key={i} x={x} y="25" width="14" height="2" fill={M} rx="1" />
        ))}
      </>;
      break;

    case "testimonials":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        <rect x="6" y="6" width="108" height="56" fill={W} stroke={L} strokeWidth="1" rx="6" />
        <rect x="16" y="14" width="10" height="8" fill={AL} rx="2" />
        <rect x="30" y="14" width="76" height="3" fill={G} rx="1.5" />
        <rect x="30" y="20" width="68" height="3" fill={M} rx="1.5" />
        <rect x="30" y="26" width="72" height="3" fill={M} rx="1.5" />
        <circle cx="20" cy="47" r="8" fill={AL} />
        <rect x="32" y="42" width="38" height="4" fill={D} rx="2" />
        <rect x="32" y="50" width="28" height="3" fill={G} rx="1.5" />
        {[76, 82, 88, 94, 100].map(x => (
          <rect key={x} x={x} y="43" width="5" height="5" fill={A} rx="1" />
        ))}
      </>;
      break;

    case "stats":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        {[4, 43, 82].map((x, i) => (
          <g key={i}>
            <rect x={x} y="10" width="34" height="48" fill={W} stroke={L} strokeWidth="1" rx="4" />
            <rect x={x + 5} y="16" width="24" height="16" fill={AL} rx="3" />
            <rect x={x + 7} y="36" width="20" height="4" fill={G} rx="2" />
            <rect x={x + 9} y="43" width="16" height="3" fill={M} rx="1.5" />
          </g>
        ))}
      </>;
      break;

    case "faq":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        <rect x="4" y="4" width="112" height="16" fill={W} stroke={L} strokeWidth="1" rx="4" />
        <rect x="10" y="10" width="70" height="4" fill={D} rx="2" />
        <rect x="106" y="10" width="6" height="4" fill={G} rx="1" />
        <rect x="4" y="24" width="112" height="24" fill={W} stroke={A} strokeWidth="1.5" rx="4" />
        <rect x="10" y="30" width="70" height="4" fill={D} rx="2" />
        <rect x="10" y="37" width="90" height="3" fill={G} rx="1.5" />
        <rect x="106" y="30" width="6" height="4" fill={A} rx="1" />
        <rect x="4" y="52" width="112" height="14" fill={W} stroke={L} strokeWidth="1" rx="4" />
        <rect x="10" y="58" width="70" height="4" fill={D} rx="2" />
        <rect x="106" y="58" width="6" height="4" fill={G} rx="1" />
      </>;
      break;

    case "contact":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        <rect x="4" y="4" width="30" height="3" fill={G} rx="1.5" />
        <rect x="4" y="9" width="112" height="10" fill={W} stroke={L} strokeWidth="1" rx="3" />
        <rect x="4" y="22" width="26" height="3" fill={G} rx="1.5" />
        <rect x="4" y="27" width="112" height="10" fill={W} stroke={L} strokeWidth="1" rx="3" />
        <rect x="4" y="40" width="28" height="3" fill={G} rx="1.5" />
        <rect x="4" y="45" width="112" height="14" fill={W} stroke={L} strokeWidth="1" rx="3" />
        <rect x="4" y="62" width="42" height="? " fill={A} rx="3" />
        <rect x="4" y="62" width="42" height="6" fill={A} rx="3" />
      </>;
      break;

    case "gallery":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        {[4, 43, 82].map((x, i) => (
          <g key={i}>
            <rect x={x} y="4" width="34" height="28" fill={i % 2 === 0 ? M : L} rx="2" />
            <rect x={x} y="36" width="34" height="28" fill={i % 2 === 0 ? L : M} rx="2" />
          </g>
        ))}
      </>;
      break;

    case "image":
      inner = <>
        <rect width="120" height="68" fill={L} />
        <polygon points="0,68 50,24 80,50 100,32 120,68" fill={M} />
        <circle cx="90" cy="18" r="8" fill="#fde68a" />
      </>;
      break;

    case "text":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        <rect x="10" y="10" width="90" height="7" fill={D} rx="2" />
        <rect x="10" y="24" width="100" height="3" fill={G} rx="1.5" />
        <rect x="10" y="30" width="96" height="3" fill={G} rx="1.5" />
        <rect x="10" y="36" width="98" height="3" fill={G} rx="1.5" />
        <rect x="10" y="42" width="78" height="3" fill={M} rx="1.5" />
      </>;
      break;

    case "columns":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        <rect x="4" y="8" width="52" height="52" fill={W} stroke={L} strokeWidth="1" rx="4" />
        <rect x="64" y="8" width="52" height="52" fill={W} stroke={L} strokeWidth="1" rx="4" />
        {[4, 64].map(x => (
          <g key={x}>
            <rect x={x + 6} y="16" width="40" height="6" fill={D} rx="2" />
            <rect x={x + 6} y="26" width="40" height="3" fill={G} rx="1.5" />
            <rect x={x + 6} y="32" width="36" height="3" fill={G} rx="1.5" />
            <rect x={x + 6} y="38" width="38" height="3" fill={M} rx="1.5" />
          </g>
        ))}
      </>;
      break;

    case "row":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        <rect x="4" y="18" width="112" height="32" fill={W} stroke={L} strokeWidth="1" strokeDasharray="4 2" rx="4" />
        {[10, 46, 82].map(x => (
          <rect key={x} x={x} y="26" width="28" height="16" fill="#f1f5f9" stroke={L} strokeWidth="1" rx="3" />
        ))}
      </>;
      break;

    case "content":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        <rect x="4" y="14" width="50" height="40" fill={L} rx="3" />
        <rect x="60" y="14" width="56" height="6" fill={D} rx="2" />
        <rect x="60" y="24" width="56" height="3" fill={G} rx="1.5" />
        <rect x="60" y="30" width="52" height="3" fill={G} rx="1.5" />
        <rect x="60" y="36" width="54" height="3" fill={M} rx="1.5" />
        <rect x="60" y="45" width="34" height="9" fill={A} rx="3" />
      </>;
      break;

    case "meet-owner":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        <circle cx="32" cy="34" r="24" fill={AL} />
        <circle cx="32" cy="28" r="10" fill="#c7d2fe" />
        <ellipse cx="32" cy="52" rx="14" ry="8" fill="#c7d2fe" />
        <rect x="64" y="14" width="50" height="6" fill={D} rx="2" />
        <rect x="64" y="24" width="38" height="3" fill={A} rx="1.5" />
        <rect x="64" y="32" width="50" height="2.5" fill={G} rx="1" />
        <rect x="64" y="38" width="46" height="2.5" fill={G} rx="1" />
        <rect x="64" y="44" width="48" height="2.5" fill={M} rx="1" />
        <rect x="64" y="52" width="36" height="9" fill={A} rx="3" />
      </>;
      break;

    case "certifications":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        {[4, 63].map(x => (
          <g key={x}>
            <rect x={x} y="6" width="53" height="26" fill={W} stroke={L} strokeWidth="1" rx="4" />
            <rect x={x} y="36" width="53" height="26" fill={W} stroke={L} strokeWidth="1" rx="4" />
            <circle cx={x + 12} cy="19" r="6" fill={AL} />
            <circle cx={x + 12} cy="49" r="6" fill={AL} />
            <rect x={x + 22} y="15" width="28" height="4" fill={G} rx="2" />
            <rect x={x + 22} y="45" width="28" height="4" fill={G} rx="2" />
          </g>
        ))}
      </>;
      break;

    case "service-area":
      inner = <>
        <rect width="120" height="68" fill="#f0f9ff" />
        <rect x="4" y="6" width="112" height="56" fill="#dbeafe" rx="4" />
        {[
          [10, 12, 20, 12], [32, 12, 20, 12], [54, 12, 20, 12], [76, 12, 20, 12], [98, 12, 16, 12],
          [10, 28, 20, 12], [32, 28, 20, 12], [54, 28, 20, 12], [76, 28, 20, 12], [98, 28, 16, 12],
          [10, 44, 50, 12], [64, 44, 30, 12],
        ].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h}
            fill={i % 2 === 0 ? "#93c5fd" : "#60a5fa"} rx="1.5" />
        ))}
      </>;
      break;

    case "before-after":
      inner = <>
        <rect x="0" y="0" width="57" height="68" fill={M} />
        <rect x="63" y="0" width="57" height="68" fill={L} />
        <rect x="57" y="0" width="6" height="68" fill={W} />
        <rect x="4" y="56" width="28" height="10" fill={D} rx="3" />
        <rect x="67" y="56" width="28" height="10" fill={A} rx="3" />
      </>;
      break;

    case "featured-clients":
    case "partners":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        {[4, 30, 56, 82].map((x, i) => (
          <g key={i}>
            <rect x={x} y="16" width="22" height="36" fill={W} stroke={L} strokeWidth="1" rx="3" />
            <rect x={x + 4} y="22" width="14" height="10" fill={M} rx="2" />
            <rect x={x + 4} y="36" width="14" height="3" fill={L} rx="1.5" />
            <rect x={x + 6} y="42" width="10" height="3" fill={L} rx="1.5" />
          </g>
        ))}
      </>;
      break;

    case "legal":
      inner = <>
        <rect width="120" height="68" fill={bg} />
        <rect x="4" y="6" width="70" height="5" fill={D} rx="2" />
        {[14, 20, 26, 32, 38, 44, 50, 56].map((y, i) => (
          <rect key={y} x="4" y={y} width={i % 3 === 2 ? 80 : 112} height="3" fill={G} rx="1" />
        ))}
      </>;
      break;

    default: // content / generic
      inner = <>
        <rect width="120" height="68" fill={bg} />
        <rect x="10" y="10" width="90" height="7" fill={D} rx="2" />
        <rect x="10" y="24" width="100" height="3" fill={G} rx="1.5" />
        <rect x="10" y="30" width="96" height="3" fill={G} rx="1.5" />
        <rect x="10" y="36" width="98" height="3" fill={M} rx="1.5" />
      </>;
  }

  return (
    <svg
      viewBox="0 0 120 68"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full rounded-md"
      style={{ display: "block" }}
      aria-hidden="true"
    >
      {inner}
    </svg>
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
      className="relative flex flex-col gap-2 p-2.5 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary overflow-hidden"
    >
      {/* Favorite star — visible on hover or when already favorited */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onToggleFav(); }}
        className={cn(
          "absolute top-1.5 right-1.5 p-0.5 rounded transition-all z-10",
          isFav
            ? "text-yellow-500 opacity-100"
            : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-yellow-500"
        )}
        title={isFav ? "Remove from favorites" : "Save to favorites"}
        aria-label={isFav ? "Remove from favorites" : "Save to favorites"}
      >
        <Star className={cn("w-3.5 h-3.5", isFav && "fill-current")} />
      </button>

      {/* SVG preview thumbnail */}
      <div className="w-full overflow-hidden rounded-md border border-border/60 bg-slate-50">
        <SectionPreviewThumb sectionType={item.sectionType} category={item.category} />
      </div>

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
        <span className="self-start text-[8px] font-bold uppercase tracking-wide text-primary/60 bg-primary/8 px-1.5 py-0.5 rounded">
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
