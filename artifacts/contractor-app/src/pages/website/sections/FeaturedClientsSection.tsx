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

export interface FeaturedClientsContent {
  heading: string;
  subheading?: string;
  items: CardComponent[];
  columns?: 2 | 3 | 4 | 5;
}

interface Props {
  content: FeaturedClientsContent;
  settings: SiteSettings;
  isEditing?: boolean;
  onChange?: (content: FeaturedClientsContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
  selectedCardId?: string | null;
  onSelectCard?: (id: string | null) => void;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

const COL_CLASS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 md:grid-cols-4",
  5: "sm:grid-cols-3 md:grid-cols-5",
};

function uid() {
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createNewCard(): CardComponent {
  return {
    id: uid(),
    title: "Client Name",
    description: "",
    mediaType: "none",
    layout: "icon-top",
    textAlign: "center",
    hoverEffect: "lift",
    clickAction: "none",
  };
}

function SortableCard({
  card, settings, isEditing, selected, onSelect, onDuplicate, onDelete, onToggleHide, onUpdateCard,
}: {
  card: CardComponent; settings: SiteSettings; isEditing?: boolean; selected?: boolean;
  onSelect: () => void; onDuplicate: () => void; onDelete: () => void;
  onToggleHide: () => void; onUpdateCard: (patch: Partial<CardComponent>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: "relative", zIndex: isDragging ? 999 : undefined }}>
      <UniversalCard
        card={card} settings={settings} isEditing={isEditing} selected={selected}
        onSelect={onSelect} onDuplicate={onDuplicate} onDelete={onDelete}
        onToggleHide={onToggleHide} onUpdateCard={onUpdateCard}
        dragHandle={isEditing ? (
          <button {...attributes} {...listeners} type="button"
            className="p-1 rounded hover:bg-muted text-muted-foreground cursor-grab active:cursor-grabbing"
            onClick={e => e.stopPropagation()}>
            <GripVertical className="w-3 h-3" />
          </button>
        ) : null}
      />
    </div>
  );
}

export function FeaturedClientsSection({ content, settings, isEditing, onChange, blockStyle, sectionId, selectedCardId, onSelectCard }: Props) {
  const sid = sectionId ?? "featured-clients";
  const cols = content.columns ?? 3;
  const colClass = COL_CLASS[cols] ?? "sm:grid-cols-3";
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function update(patch: Partial<FeaturedClientsContent>) { onChange?.({ ...content, ...patch }); }
  function updateCard(id: string, patch: Partial<CardComponent>) {
    update({ items: content.items.map(i => i.id === id ? { ...i, ...patch } : i) });
  }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oi = content.items.findIndex(i => i.id === active.id);
      const ni = content.items.findIndex(i => i.id === over.id);
      update({ items: arrayMove(content.items, oi, ni) });
    }
  }

  return (
    <BlockStyleWrapper wrapperClassName="py-16 px-6 bg-white dark:bg-gray-900" blockStyle={blockStyle} isEditing={isEditing}>
      <div className="max-w-5xl mx-auto" onClick={e => { if (!(e.target as HTMLElement).closest("[data-universal-card]")) onSelectCard?.(null); }}>
        <InlineEditableText
          id={`${sid}-heading`} as="h2" value={content.heading} placeholder="Section heading"
          className="text-2xl font-bold mb-2 text-center w-full"
          style={{ color: "var(--theme-text, #111827)" }}
          onCommit={v => update({ heading: v })}
          
        />
        {(content.subheading !== undefined || isEditing) && (
          <InlineEditableText
            id={`${sid}-subheading`} as="p" value={content.subheading ?? ""}
            placeholder="Subheading (optional)"
            className="text-center text-sm mb-10 w-full"
            style={{ color: "var(--theme-text-muted, #6b7280)" }}
            onCommit={v => update({ subheading: v || undefined })}
            
          />
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={content.items.map(i => i.id)} strategy={rectSortingStrategy}>
            <div className={`grid grid-cols-2 ${colClass} gap-4`}>
              {content.items.map(card => (
                <SortableCard
                  key={card.id} card={card} settings={settings} isEditing={isEditing}
                  selected={selectedCardId === card.id}
                  onSelect={() => onSelectCard?.(card.id)}
                  onDuplicate={() => { const duped = { ...card, id: uid() }; const idx = content.items.findIndex(i => i.id === card.id); update({ items: [...content.items.slice(0, idx + 1), duped, ...content.items.slice(idx + 1)] }); onSelectCard?.(duped.id); }}
                  onDelete={() => { update({ items: content.items.filter(i => i.id !== card.id) }); if (selectedCardId === card.id) onSelectCard?.(null); }}
                  onToggleHide={() => updateCard(card.id, { hidden: !card.hidden })}
                  onUpdateCard={p => updateCard(card.id, p)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {isEditing && (
          <div className="flex justify-center mt-6">
            <button type="button" onClick={() => update({ items: [...content.items, createNewCard()] })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors">
              <Plus className="w-3 h-3" /> Add Client
            </button>
          </div>
        )}
      </div>
    </BlockStyleWrapper>
  );
}

export function defaultFeaturedClientsContent(): FeaturedClientsContent {
  const make = (title: string): CardComponent => ({
    id: uid(), title, description: "", mediaType: "none",
    layout: "icon-top", textAlign: "center", hoverEffect: "lift", clickAction: "none",
  });
  return {
    heading: "Trusted By",
    subheading: "Companies and organizations we've worked with.",
    items: [
      make("Client Name"), make("Builder Name"), make("Property Management Company"),
      make("Local Business"), make("Community Organization"),
    ],
    columns: 3,
  };
}
