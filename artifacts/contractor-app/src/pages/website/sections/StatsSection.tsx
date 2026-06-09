import { Plus } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { InlineEditableText } from "../InlineEditableText";
import { UniversalCard, GripVertical } from "./UniversalCard";
import type { CardComponent, SiteSettings } from "../website-types";

// ── Legacy type (kept for backward-compat migration only) ─────────────────────

export interface StatItem {
  id: string;
  value: string;
  label: string;
}

// ── Content type ──────────────────────────────────────────────────────────────

export interface StatsContent {
  heading?: string;
  subheading?: string;
  /** Primary storage — CardComponent[]. Populated on first normalise. */
  items?: CardComponent[];
  /** Legacy field — kept for data that predates the card engine. */
  stats?: StatItem[];
}

// ── Migration helper ──────────────────────────────────────────────────────────

const STAT_ICONS = ["Star", "CheckCircle2", "Award", "Clock", "Users", "Briefcase"];

function normalizeContent(raw: StatsContent): StatsContent & { items: CardComponent[] } {
  if (raw.items && raw.items.length > 0) return raw as StatsContent & { items: CardComponent[] };
  if (raw.stats && raw.stats.length > 0) {
    const items: CardComponent[] = raw.stats.map((s, idx) => ({
      id: s.id,
      title: s.value,
      description: s.label,
      mediaType: "icon" as const,
      iconName: STAT_ICONS[idx % STAT_ICONS.length],
      layout: "icon-top" as const,
      textAlign: "center" as const,
      hoverEffect: "none" as const,
      clickAction: "none" as const,
    }));
    return { ...raw, items };
  }
  return { ...raw, items: [] };
}

function uid() {
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createStatCard(): CardComponent {
  return {
    id: uid(),
    title: "0",
    description: "Stat Label",
    mediaType: "icon",
    iconName: "Star",
    layout: "icon-top",
    textAlign: "center",
    hoverEffect: "none",
    clickAction: "none",
  };
}

export function defaultStatsContent(): StatsContent {
  const iconNames = ["CheckCircle2", "Clock", "Award", "Star"];
  const defaults = [
    { value: "500+", label: "Projects Completed" },
    { value: "15+",  label: "Years in Business" },
    { value: "100%", label: "Licensed & Insured" },
    { value: "5★",   label: "Average Rating" },
  ];
  return {
    heading: "By the Numbers",
    items: defaults.map((d, i) => ({
      id: uid(),
      title: d.value,
      description: d.label,
      mediaType: "icon" as const,
      iconName: iconNames[i],
      layout: "icon-top" as const,
      textAlign: "center" as const,
      hoverEffect: "none" as const,
      clickAction: "none" as const,
    })),
  };
}

// ── SortableCard wrapper ───────────────────────────────────────────────────────

interface SortableCardProps {
  card: CardComponent;
  settings: SiteSettings;
  isEditing?: boolean;
  selected?: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleHide: () => void;
}

function SortableCard({
  card, settings, isEditing, selected, onSelect, onDuplicate, onDelete, onToggleHide,
}: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const wrapStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : undefined,
    position: "relative",
  };

  const dragHandle = isEditing ? (
    <button
      {...attributes}
      {...listeners}
      type="button"
      className="p-1 rounded hover:bg-muted text-muted-foreground cursor-grab active:cursor-grabbing"
      title="Drag to reorder"
      onClick={e => e.stopPropagation()}
    >
      <GripVertical className="w-3 h-3" />
    </button>
  ) : null;

  return (
    <div ref={setNodeRef} style={wrapStyle}>
      <UniversalCard
        card={card}
        settings={settings}
        isEditing={isEditing}
        selected={selected}
        onSelect={onSelect}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onToggleHide={onToggleHide}
        dragHandle={dragHandle}
      />
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

interface StatsSectionProps {
  content: StatsContent;
  settings: SiteSettings;
  isEditing?: boolean;
  onChange?: (content: StatsContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
  selectedCardId?: string | null;
  onSelectCard?: (id: string | null) => void;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

export function StatsSection({
  content,
  settings,
  isEditing,
  onChange,
  blockStyle,
  sectionId,
  selectedCardId,
  onSelectCard,
}: StatsSectionProps) {
  const sid = sectionId ?? "stats";
  const normalized = normalizeContent(content);
  const items = normalized.items;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const colClass =
    items.length <= 2 ? "sm:grid-cols-2" :
    items.length === 3 ? "sm:grid-cols-3" :
    "sm:grid-cols-2 lg:grid-cols-4";

  function update(patch: Partial<StatsContent>) {
    onChange?.({ ...normalized, ...patch });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = items.findIndex(i => i.id === active.id);
      const newIdx = items.findIndex(i => i.id === over.id);
      update({ items: arrayMove(items, oldIdx, newIdx) });
    }
  }

  function updateCard(id: string, patch: Partial<CardComponent>) {
    update({ items: items.map(i => i.id === id ? { ...i, ...patch } : i) });
  }

  function duplicateCard(id: string) {
    const idx = items.findIndex(i => i.id === id);
    if (idx < 0) return;
    const duped = { ...items[idx], id: uid() };
    update({ items: [...items.slice(0, idx + 1), duped, ...items.slice(idx + 1)] });
  }

  function deleteCard(id: string) {
    update({ items: items.filter(i => i.id !== id) });
    if (selectedCardId === id) onSelectCard?.(null);
  }

  function toggleHide(id: string) {
    updateCard(id, { hidden: !items.find(i => i.id === id)?.hidden });
  }

  function addItem() {
    if (items.length >= 6) return;
    update({ items: [...items, createStatCard()] });
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-6 py-16" isEditing={isEditing}>
      <div
        className="max-w-5xl mx-auto"
        onClick={e => {
          if ((e.target as HTMLElement).closest("[data-universal-card]")) return;
          onSelectCard?.(null);
        }}
      >
        {/* Heading */}
        {isEditing ? (
          <div className="text-center space-y-1 mb-10">
            <InlineEditableText
              id={`${sid}-heading`}
              as="h2"
              value={content.heading ?? ""}
              placeholder="Section heading (optional)"
              className="text-3xl font-bold"
              style={{ color: "var(--theme-text, #111827)" }}
              onCommit={v => update({ heading: v || undefined })}
            />
            <InlineEditableText
              id={`${sid}-subheading`}
              as="p"
              value={content.subheading ?? ""}
              placeholder="Subheading (optional)"
              style={{ color: "var(--theme-text-muted, #6b7280)" }}
              onCommit={v => update({ subheading: v || undefined })}
            />
          </div>
        ) : (
          content.heading && (
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>{content.heading}</h2>
              {content.subheading && <p className="mt-2" style={{ color: "var(--theme-text-muted, #6b7280)" }}>{content.subheading}</p>}
            </div>
          )
        )}

        {/* Cards grid */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
            <div className={`grid grid-cols-2 ${colClass} gap-6`}>
              {items.map(item => (
                <div key={item.id} data-universal-card>
                  <SortableCard
                    card={item}
                    settings={settings}
                    isEditing={isEditing}
                    selected={selectedCardId === item.id}
                    onSelect={() => onSelectCard?.(item.id)}
                    onDuplicate={() => duplicateCard(item.id)}
                    onDelete={() => deleteCard(item.id)}
                    onToggleHide={() => toggleHide(item.id)}
                  />
                </div>
              ))}

              {isEditing && items.length < 6 && (
                <button
                  type="button"
                  onClick={addItem}
                  className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-200 rounded-xl p-4 text-gray-400 hover:text-blue-500 hover:border-blue-300 transition-colors min-h-[80px] bg-gray-50"
                  style={{ borderRadius: "var(--theme-card-radius, 0.75rem)" }}
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-xs">Add Stat</span>
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </BlockStyleWrapper>
  );
}
