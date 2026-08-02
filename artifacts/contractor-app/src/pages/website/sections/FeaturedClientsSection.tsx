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
import { LogoCell } from "./LogoCell";
import type { CardComponent, SiteSettings } from "../website-types";

// ── Content interface ─────────────────────────────────────────────────────────

export interface FeaturedClientsContent {
  heading: string;
  subheading?: string;
  items: CardComponent[];
  columns?: 2 | 3 | 4 | 5;
  // Logo mode options
  displayMode?: "card" | "logo";
  logoMaxHeight?: number;
  normalizePadding?: boolean;
  showHoverEffect?: boolean;
  grayscaleUntilHover?: boolean;
  roundedCorners?: boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────────

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

// ── Column class lookup (mode-specific) ──────────────────────────────────────

/** Card mode: restores original tablet-safe breakpoints — cards need more space. */
const CARD_COL_CLASS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 md:grid-cols-4",
  5: "sm:grid-cols-3 md:grid-cols-5",
};

/** Logo mode: logos are compact images so more columns earlier is fine. */
const LOGO_COL_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 md:grid-cols-5",
};

/** Auto-derive column count from item count when not manually set. */
function autoLogoColumns(count: number): 1 | 2 | 3 | 4 | 5 {
  if (count <= 1) return 1;
  if (count <= 2) return 2;
  if (count <= 3) return 3;
  if (count === 4) return 4;
  if (count <= 6) return 3;
  if (count <= 8) return 4;
  return 5;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Sortable card wrapper ─────────────────────────────────────────────────────

function SortableCard({
  card, settings, isEditing, selected, displayMode,
  logoMaxHeight, normalizePadding, showHoverEffect, grayscaleUntilHover, roundedCorners,
  onSelect, onDuplicate, onDelete, onToggleHide, onUpdateCard, onOpenMediaLibrary,
}: {
  card: CardComponent;
  settings: SiteSettings;
  isEditing?: boolean;
  selected?: boolean;
  displayMode: "card" | "logo";
  logoMaxHeight: number;
  normalizePadding: boolean;
  showHoverEffect: boolean;
  grayscaleUntilHover: boolean;
  roundedCorners: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleHide: () => void;
  onUpdateCard: (patch: Partial<CardComponent>) => void;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const dragHandle = isEditing ? (
    <button
      {...attributes} {...listeners}
      type="button"
      className="p-1 rounded hover:bg-muted text-muted-foreground cursor-grab active:cursor-grabbing"
      onClick={e => e.stopPropagation()}
    >
      <GripVertical className="w-3 h-3" />
    </button>
  ) : null;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: "relative",
        zIndex: isDragging ? 999 : undefined,
      }}
    >
      {displayMode === "logo" ? (
        <LogoCell
          item={card}
          logoMaxHeight={logoMaxHeight}
          normalizePadding={normalizePadding}
          showHoverEffect={showHoverEffect}
          grayscaleUntilHover={grayscaleUntilHover}
          roundedCorners={roundedCorners}
          isEditing={isEditing}
          selected={selected}
          onSelect={onSelect}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onToggleHide={onToggleHide}
          dragHandle={dragHandle}
          onPickImage={onOpenMediaLibrary
            ? () => onOpenMediaLibrary(url => onUpdateCard({ imageUrl: url }))
            : undefined}
        />
      ) : (
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
      )}
    </div>
  );
}

// ── Section component ─────────────────────────────────────────────────────────

export function FeaturedClientsSection({
  content, settings, isEditing, onChange, blockStyle, sectionId, selectedCardId, onSelectCard,
  onOpenMediaLibrary,
}: Props) {
  const sid = sectionId ?? "featured-clients";

  const isLogoMode    = content.displayMode === "logo";
  const logoMaxHeight = content.logoMaxHeight ?? 64;
  const normPad       = content.normalizePadding ?? false;
  const hoverFx       = content.showHoverEffect ?? false;
  const grayscale     = content.grayscaleUntilHover ?? false;
  const rounded       = content.roundedCorners ?? false;

  // Determine effective column count
  const cols: number = content.columns
    ?? (isLogoMode ? autoLogoColumns(content.items.length) : 3);
  // Card mode restores original `grid-cols-2` base + tablet/desktop breakpoints.
  // Logo mode uses the denser LOGO_COL_CLASS which includes the mobile base.
  const colClass = isLogoMode
    ? (LOGO_COL_CLASS[cols] ?? "grid-cols-2 sm:grid-cols-3")
    : (`grid-cols-2 ${CARD_COL_CLASS[cols] ?? "sm:grid-cols-3"}`);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function update(patch: Partial<FeaturedClientsContent>) {
    onChange?.({ ...content, ...patch });
  }
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
    <BlockStyleWrapper
      wrapperClassName="py-16 px-6 bg-white dark:bg-gray-900"
      blockStyle={blockStyle}
      isEditing={isEditing}
    >
      <div
        className="max-w-5xl mx-auto"
        onClick={e => {
          if (!(e.target as HTMLElement).closest("[data-universal-card]")) onSelectCard?.(null);
        }}
      >
        <InlineEditableText
          id={`${sid}-heading`}
          as="h2"
          value={content.heading}
          placeholder="Section heading"
          className="text-2xl font-bold mb-2 text-center w-full"
          style={{ color: "var(--theme-text, #111827)" }}
          onCommit={v => update({ heading: v })}
        />
        {(content.subheading !== undefined || isEditing) && (
          <InlineEditableText
            id={`${sid}-subheading`}
            as="p"
            value={content.subheading ?? ""}
            placeholder="Subheading (optional)"
            className="text-center text-sm mb-10 w-full"
            style={{ color: "var(--theme-text-muted, #6b7280)" }}
            onCommit={v => update({ subheading: v || undefined })}
          />
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={content.items.map(i => i.id)} strategy={rectSortingStrategy}>
            <div className={`grid ${colClass} gap-4`}>
              {content.items.map(card => (
                <SortableCard
                  key={card.id}
                  card={card}
                  settings={settings}
                  isEditing={isEditing}
                  selected={selectedCardId === card.id}
                  displayMode={isLogoMode ? "logo" : "card"}
                  logoMaxHeight={logoMaxHeight}
                  normalizePadding={normPad}
                  showHoverEffect={hoverFx}
                  grayscaleUntilHover={grayscale}
                  roundedCorners={rounded}
                  onSelect={() => onSelectCard?.(card.id)}
                  onDuplicate={() => {
                    const duped = { ...card, id: uid() };
                    const idx = content.items.findIndex(i => i.id === card.id);
                    update({ items: [...content.items.slice(0, idx + 1), duped, ...content.items.slice(idx + 1)] });
                    onSelectCard?.(duped.id);
                  }}
                  onDelete={() => {
                    update({ items: content.items.filter(i => i.id !== card.id) });
                    if (selectedCardId === card.id) onSelectCard?.(null);
                  }}
                  onToggleHide={() => updateCard(card.id, { hidden: !card.hidden })}
                  onUpdateCard={p => updateCard(card.id, p)}
                  onOpenMediaLibrary={onOpenMediaLibrary}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {isEditing && (
          <div className="flex justify-center mt-6">
            <button
              type="button"
              onClick={() => {
                const newCard = createNewCard();
                const newItems = [...content.items, newCard];
                update({ items: newItems });
                if (isLogoMode && onOpenMediaLibrary) {
                  // Open media library immediately so user can pick the logo image
                  onOpenMediaLibrary(url => {
                    onChange?.({ ...content, items: newItems.map(i => i.id === newCard.id ? { ...i, imageUrl: url } : i) });
                  });
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
            >
              <Plus className="w-3 h-3" />
              {isLogoMode ? "Add Logo" : "Add Client"}
            </button>
          </div>
        )}
      </div>
    </BlockStyleWrapper>
  );
}

// ── Default content ───────────────────────────────────────────────────────────

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
