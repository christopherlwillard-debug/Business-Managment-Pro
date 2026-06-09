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

interface LegacyTestimonial {
  id: string;
  name: string;
  location: string;
  rating: number;
  quote: string;
}

// ── Content type ──────────────────────────────────────────────────────────────

export interface TestimonialsContent {
  heading: string;
  subheading?: string;
  /** Primary storage — CardComponent[]. Populated on first normalise. */
  items?: CardComponent[];
  /** Legacy field — kept for data that predates the card engine. */
  testimonials?: LegacyTestimonial[];
}

// ── Migration helper ──────────────────────────────────────────────────────────

function normalizeContent(raw: TestimonialsContent): TestimonialsContent & { items: CardComponent[] } {
  if (raw.items && raw.items.length > 0) return raw as TestimonialsContent & { items: CardComponent[] };
  if (raw.testimonials && raw.testimonials.length > 0) {
    const items: CardComponent[] = raw.testimonials.map(t => ({
      id: t.id,
      title: t.name,
      description: `"${t.quote}"${t.location ? `\n\n— ${t.location}` : ""}`,
      // image mediaType so avatars can be added later; no imageUrl means slot is hidden
      mediaType: "image" as const,
      iconSize: "lg" as const,
      layout: "horizontal" as const,
      textAlign: "left" as const,
      hoverEffect: "none" as const,
      clickAction: "none" as const,
      templateType: "testimonial" as const,
      badgeEnabled: t.rating > 0,
      badgeText: "★".repeat(Math.min(t.rating, 5)),
      badgeColor: "#f59e0b",
      badgeTextColor: "#ffffff",
      badgePosition: "top-right" as const,
    }));
    return { ...raw, items };
  }
  return { ...raw, items: [] };
}

function uid() {
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createTestimonialCard(): CardComponent {
  return {
    id: uid(),
    title: "Customer Name",
    description: '"Write your customer testimonial here. Great experiences make the best reviews."',
    mediaType: "image",
    iconSize: "lg",
    layout: "horizontal",
    textAlign: "left",
    hoverEffect: "none",
    clickAction: "none",
    templateType: "testimonial",
    badgeEnabled: true,
    badgeText: "★★★★★",
    badgeColor: "#f59e0b",
    badgeTextColor: "#ffffff",
    badgePosition: "top-right",
  };
}

export function defaultTestimonialsContent(): TestimonialsContent {
  return {
    heading: "What Our Customers Say",
    subheading: "Trusted by homeowners and businesses across the region.",
    items: [
      {
        id: uid(),
        title: "John M.",
        description: '"Outstanding work from start to finish. The crew was professional, on time, and the quality speaks for itself. I\'d hire them again without hesitation."\n\n— Springfield, IL',
        mediaType: "image",
        iconSize: "lg",
        layout: "horizontal",
        textAlign: "left",
        hoverEffect: "none",
        clickAction: "none",
        templateType: "testimonial",
        badgeEnabled: true,
        badgeText: "★★★★★",
        badgeColor: "#f59e0b",
        badgeTextColor: "#ffffff",
        badgePosition: "top-right",
      },
      {
        id: uid(),
        title: "Sarah K.",
        description: '"They completed our renovation ahead of schedule and within budget. Communication was excellent the entire time. Highly recommend!"\n\n— Riverside, CA',
        mediaType: "image",
        iconSize: "lg",
        layout: "horizontal",
        textAlign: "left",
        hoverEffect: "none",
        clickAction: "none",
        templateType: "testimonial",
        badgeEnabled: true,
        badgeText: "★★★★★",
        badgeColor: "#f59e0b",
        badgeTextColor: "#ffffff",
        badgePosition: "top-right",
      },
      {
        id: uid(),
        title: "Tom R.",
        description: '"Great attention to detail and very fair pricing. Our project turned out better than we imagined. Five stars all the way."\n\n— Austin, TX',
        mediaType: "image",
        iconSize: "lg",
        layout: "horizontal",
        textAlign: "left",
        hoverEffect: "none",
        clickAction: "none",
        templateType: "testimonial",
        badgeEnabled: true,
        badgeText: "★★★★★",
        badgeColor: "#f59e0b",
        badgeTextColor: "#ffffff",
        badgePosition: "top-right",
      },
    ],
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

interface TestimonialsSectionProps {
  content: TestimonialsContent;
  settings: SiteSettings;
  isEditing?: boolean;
  onChange?: (content: TestimonialsContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
  selectedCardId?: string | null;
  onSelectCard?: (id: string | null) => void;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

export function TestimonialsSection({
  content,
  settings,
  isEditing,
  onChange,
  blockStyle,
  sectionId,
  selectedCardId,
  onSelectCard,
}: TestimonialsSectionProps) {
  const sid = sectionId ?? "testimonials";
  const normalized = normalizeContent(content);
  const items = normalized.items;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function update(patch: Partial<TestimonialsContent>) {
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
    update({ items: [...items, createTestimonialCard()] });
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
              value={content.heading}
              placeholder="Section heading"
              className="text-3xl font-bold"
              style={{ color: "var(--theme-text, #111827)" }}
              onCommit={v => update({ heading: v })}
            />
            <InlineEditableText
              id={`${sid}-subheading`}
              as="p"
              value={content.subheading ?? ""}
              placeholder="Subheading (optional — double-click to add)"
              className="text-lg"
              style={{ color: "var(--theme-text-muted, #6b7280)" }}
              onCommit={v => update({ subheading: v || undefined })}
            />
          </div>
        ) : (
          content.heading && (
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>{content.heading}</h2>
              {content.subheading && <p className="mt-2 text-lg" style={{ color: "var(--theme-text-muted, #6b7280)" }}>{content.subheading}</p>}
            </div>
          )
        )}

        {/* Cards grid */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

              {isEditing && (
                <button
                  type="button"
                  onClick={addItem}
                  className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-6 text-gray-400 hover:text-blue-500 hover:border-blue-300 transition-colors min-h-[120px] bg-gray-50"
                  style={{ borderRadius: "var(--theme-card-radius, 0.75rem)" }}
                >
                  <Plus className="w-6 h-6" />
                  <span className="text-sm font-medium">Add Testimonial</span>
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </BlockStyleWrapper>
  );
}
