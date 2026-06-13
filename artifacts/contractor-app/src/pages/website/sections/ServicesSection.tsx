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
import { FloatingToolbar, textStyleToCSS, type TextStyle } from "./TextStyleToolbar";
import { InlineEditableText } from "../InlineEditableText";
import { UniversalCard, GripVertical } from "./UniversalCard";
import type { CardComponent, SiteSettings } from "../website-types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServicesContent {
  heading: string;
  subheading?: string;
  headingStyle?: TextStyle;
  subheadingStyle?: TextStyle;
  /** Stored as CardComponent[]; old ServiceItem data (id/title/desc only) is compatible */
  items: CardComponent[];
  columns?: 1 | 2 | 3 | 4;
}

interface ServicesSectionProps {
  content: ServicesContent;
  settings: SiteSettings;
  isEditing?: boolean;
  onChange?: (content: ServicesContent) => void;
  businessName?: string;
  blockStyle?: BlockStyle;
  sectionId?: string;
  selectedCardId?: string | null;
  onSelectCard?: (id: string | null) => void;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

// ── Grid column class lookup (Tailwind needs full class strings) ───────────────
const COL_CLASS: Record<number, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
};

function createNewCard(): CardComponent {
  return {
    id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: "New Service",
    description: "Describe this service.",
    mediaType: "icon",
    iconName: "Wrench",
    layout: "icon-top",
    hoverEffect: "lift",
    clickAction: "none",
    textAlign: "left",
  };
}

// ── Sortable wrapper ──────────────────────────────────────────────────────────

interface SortableCardProps {
  card: CardComponent;
  settings: SiteSettings;
  isEditing?: boolean;
  selected?: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleHide: () => void;
  onUpdateCard: (patch: Partial<CardComponent>) => void;
}

function SortableCard({
  card,
  settings,
  isEditing,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
  onToggleHide,
  onUpdateCard,
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
        onUpdateCard={onUpdateCard}
        dragHandle={dragHandle}
      />
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function ServicesSection({
  content,
  settings,
  isEditing,
  onChange,
  businessName,
  blockStyle,
  sectionId,
  selectedCardId,
  onSelectCard,
}: ServicesSectionProps) {
  const biz = businessName ?? "a contractor business";
  const sid = sectionId ?? "services";
  const columns = content.columns ?? 3;
  const colClass = COL_CLASS[columns] ?? "md:grid-cols-3";

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function update(patch: Partial<ServicesContent>) {
    onChange?.({ ...content, ...patch });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = content.items.findIndex(i => i.id === active.id);
      const newIdx = content.items.findIndex(i => i.id === over.id);
      update({ items: arrayMove(content.items, oldIdx, newIdx) });
    }
  }

  function updateCard(id: string, patch: Partial<CardComponent>) {
    update({ items: content.items.map(i => i.id === id ? { ...i, ...patch } : i) });
  }

  function duplicateCard(id: string) {
    const idx = content.items.findIndex(i => i.id === id);
    if (idx < 0) return;
    const duped = { ...content.items[idx], id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    const newItems = [...content.items.slice(0, idx + 1), duped, ...content.items.slice(idx + 1)];
    update({ items: newItems });
  }

  function deleteCard(id: string) {
    update({ items: content.items.filter(i => i.id !== id) });
    if (selectedCardId === id) onSelectCard?.(null);
  }

  function toggleHide(id: string) {
    updateCard(id, { hidden: !content.items.find(i => i.id === id)?.hidden });
  }

  function addItem() {
    update({ items: [...content.items, createNewCard()] });
  }

  return (
    <BlockStyleWrapper
      wrapperClassName="py-16 px-6 bg-white dark:bg-gray-900"
      blockStyle={blockStyle}
      isEditing={isEditing}
    >
      <div
        className="max-w-5xl mx-auto"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-universal-card]")) return;
          onSelectCard?.(null);
        }}
      >
        {isEditing ? (
          <div className="relative">
            <InlineEditableText
              id={`${sid}-heading`}
              as="h2"
              value={content.heading}
              placeholder="Section heading"
              className="text-3xl font-bold mb-3 text-center w-full"
              style={{ color: "var(--theme-text, #111827)", ...textStyleToCSS(content.headingStyle) }}
              onCommit={v => update({ heading: v })}
            />
            <FloatingToolbar
              id={`${sid}-heading`}
              style={content.headingStyle}
              onChange={s => update({ headingStyle: s })}
              dark={false}
            />
          </div>
        ) : (
          <h2
            data-edit-field="heading"
            className="text-3xl font-bold mb-3 text-center"
            style={{ color: "var(--theme-text, #111827)", ...textStyleToCSS(content.headingStyle) }}
          >
            {content.heading}
          </h2>
        )}

        {content.subheading && (
          isEditing ? (
            <div className="relative">
              <InlineEditableText
                id={`${sid}-subheading`}
                as="p"
                value={content.subheading}
                placeholder="Subheading (optional)"
                className="text-center text-base mb-10 w-full"
                style={{ color: "var(--theme-text-muted, #6b7280)", ...textStyleToCSS(content.subheadingStyle) }}
                onCommit={v => update({ subheading: v || undefined })}
              />
              <FloatingToolbar
                id={`${sid}-subheading`}
                style={content.subheadingStyle}
                onChange={s => update({ subheadingStyle: s })}
                dark={false}
              />
            </div>
          ) : (
            <p className="text-center text-base mb-10" style={{ color: "var(--theme-text-muted, #6b7280)", ...textStyleToCSS(content.subheadingStyle) }}>
              {content.subheading}
            </p>
          )
        )}

        <div className={`${content.subheading ? "" : "mt-10"}`} />

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={content.items.map(i => i.id)} strategy={rectSortingStrategy}>
            <div className={`grid grid-cols-1 ${colClass} gap-6`} data-services-grid>
              {content.items.map(item => (
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
                    onUpdateCard={patch => updateCard(item.id, patch)}
                  />
                </div>
              ))}

              {isEditing && (
                <button
                  type="button"
                  onClick={addItem}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl p-6 border-2 border-dashed border-gray-200 dark:border-gray-600 text-gray-400 hover:border-primary hover:text-primary transition-colors min-h-[140px]"
                  style={{ borderRadius: "var(--theme-card-radius, 0.75rem)" }}
                >
                  <Plus className="w-6 h-6" />
                  <span className="text-sm">Add Card</span>
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </BlockStyleWrapper>
  );
}
