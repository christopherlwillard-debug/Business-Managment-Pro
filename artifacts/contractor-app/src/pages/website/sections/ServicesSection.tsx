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
import { UniversalCard, GripVertical, LUCIDE_ICON_MAP } from "./UniversalCard";
import type { CardComponent, SiteSettings } from "../website-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ServicesContent {
  heading: string;
  subheading?: string;
  headingStyle?: TextStyle;
  subheadingStyle?: TextStyle;
  /** Stored as CardComponent[]; old ServiceItem data (id/title/desc only) is compatible */
  items: CardComponent[];
  columns?: 1 | 2 | 3 | 4;
  /** Visual layout preset */
  layout?: "cards" | "icon_row" | "feature_grid";
  /** Icon presentation style */
  iconStyle?: "inline" | "circle";
  /** Cards rise on hover */
  hoverLift?: boolean;
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

// ── Column class lookup ────────────────────────────────────────────────────────
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

// ── Service icon (view mode only) ─────────────────────────────────────────────

function ServiceIcon({
  card, settings, iconStyle, size,
}: {
  card: CardComponent;
  settings: SiteSettings;
  iconStyle: "inline" | "circle";
  size: "sm" | "md" | "lg";
}) {
  if (card.mediaType === "none" || !card.iconName) return null;

  const iconKey  = card.iconName && LUCIDE_ICON_MAP[card.iconName] ? card.iconName : "Wrench";
  const IconComp = LUCIDE_ICON_MAP[iconKey]!;
  const iconBg   = card.iconBgColor ?? `${settings.brandColor}20`;
  const iconColor = card.iconColor  ?? settings.brandColor;

  const sizeMap = {
    sm: { wrap: "w-10 h-10", icon: "w-5 h-5" },
    md: { wrap: "w-12 h-12", icon: "w-6 h-6" },
    lg: { wrap: "w-16 h-16", icon: "w-8 h-8" },
  };
  const { wrap, icon: iconCls } = sizeMap[size];

  return (
    <div
      className={`${wrap} flex items-center justify-center flex-shrink-0 ${iconStyle === "circle" ? "rounded-full" : "rounded-xl"}`}
      style={{ backgroundColor: iconBg }}
    >
      <IconComp className={iconCls} style={{ color: iconColor }} />
    </div>
  );
}

// ── View-mode card renderers ───────────────────────────────────────────────────

/** Compact bordered card — cards layout */
function CardView({
  card, settings, iconStyle, hoverLift,
}: { card: CardComponent; settings: SiteSettings; iconStyle: "inline" | "circle"; hoverLift: boolean }) {
  if (card.hidden) return null;
  const hoverCls = hoverLift ? "hover:-translate-y-1 hover:shadow-lg transition-all duration-200" : "transition-all duration-150";
  const href = card.clickAction === "url" && card.clickTarget ? card.clickTarget : undefined;
  const isExt = href ? /^https?:\/\//.test(href) : false;

  const inner = (
    <div
      data-universal-card
      className={`h-full flex flex-col bg-card border border-border/60 p-6 ${hoverCls}`}
      style={{ borderRadius: "var(--theme-card-radius, 0.75rem)" }}
    >
      {card.mediaType !== "none" && (
        <div className="mb-4">
          <ServiceIcon card={card} settings={settings} iconStyle={iconStyle} size="md" />
        </div>
      )}
      <h3 className="font-semibold text-base mb-2" style={{ color: "var(--theme-text, #111827)" }}>
        {card.title}
      </h3>
      {card.description && (
        <p className="text-sm flex-1 leading-relaxed" style={{ color: "var(--theme-text-muted, #6b7280)" }}>
          {card.description}
        </p>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} target={isExt ? "_blank" : undefined} rel={isExt ? "noopener noreferrer" : undefined} className="block h-full">
        {inner}
      </a>
    );
  }
  return inner;
}

/** Horizontal icon + text row — icon_row layout */
function IconRowView({
  card, settings, iconStyle,
}: { card: CardComponent; settings: SiteSettings; iconStyle: "inline" | "circle" }) {
  if (card.hidden) return null;
  return (
    <div className="flex gap-4 items-start py-3">
      <ServiceIcon card={card} settings={settings} iconStyle={iconStyle} size="sm" />
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-base mb-0.5" style={{ color: "var(--theme-text, #111827)" }}>
          {card.title}
        </h3>
        {card.description && (
          <p className="text-sm leading-relaxed" style={{ color: "var(--theme-text-muted, #6b7280)" }}>
            {card.description}
          </p>
        )}
      </div>
    </div>
  );
}

/** Large card with bigger icon — feature_grid layout */
function FeatureGridView({
  card, settings, iconStyle, hoverLift,
}: { card: CardComponent; settings: SiteSettings; iconStyle: "inline" | "circle"; hoverLift: boolean }) {
  if (card.hidden) return null;
  const hoverCls = hoverLift ? "hover:-translate-y-1 hover:shadow-xl transition-all duration-200" : "transition-all duration-150";

  return (
    <div
      data-universal-card
      className={`h-full flex flex-col bg-card border border-border/60 p-8 ${hoverCls}`}
      style={{ borderRadius: "var(--theme-card-radius, 0.75rem)" }}
    >
      {card.mediaType !== "none" && (
        <div className="mb-6">
          <ServiceIcon card={card} settings={settings} iconStyle={iconStyle} size="lg" />
        </div>
      )}
      <h3 className="font-bold text-xl mb-3" style={{ color: "var(--theme-text, #111827)" }}>
        {card.title}
      </h3>
      {card.description && (
        <p className="leading-relaxed flex-1" style={{ color: "var(--theme-text-muted, #6b7280)" }}>
          {card.description}
        </p>
      )}
    </div>
  );
}

// ── Sortable editing wrapper (editing mode only, always cards style) ───────────

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
  card, settings, isEditing, selected,
  onSelect, onDuplicate, onDelete, onToggleHide, onUpdateCard,
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
  content, settings, isEditing, onChange, businessName,
  blockStyle, sectionId, selectedCardId, onSelectCard,
}: ServicesSectionProps) {
  const biz      = businessName ?? "a contractor business";
  const sid      = sectionId ?? "services";
  const columns  = content.columns ?? 3;
  const colClass = COL_CLASS[columns] ?? "md:grid-cols-3";
  const layout    = content.layout    ?? "cards";
  const iconStyle = content.iconStyle ?? "inline";
  const hoverLift = content.hoverLift ?? false;

  // feature_grid defaults to 2 columns unless overridden
  const featureColumns = content.columns ?? 2;
  const featureColClass = COL_CLASS[featureColumns] ?? "md:grid-cols-2";

  // icon_row defaults to 1 column (stacked list) unless user picks more
  const rowColumns = content.columns ?? 1;
  const rowColClass = COL_CLASS[Math.min(rowColumns, 2) as 1 | 2] ?? "md:grid-cols-1";

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
    update({ items: [...content.items.slice(0, idx + 1), duped, ...content.items.slice(idx + 1)] });
  }

  function deleteCard(id: string) {
    update({ items: content.items.filter(i => i.id !== id) });
    if (selectedCardId === id) onSelectCard?.(null);
  }

  function toggleHide(id: string) {
    updateCard(id, { hidden: !content.items.find(i => i.id === id)?.hidden });
  }

  function addItem() {
    const newCard = createNewCard();
    update({ items: [...content.items, newCard] });
    requestAnimationFrame(() => onSelectCard?.(newCard.id));
  }

  // ── Heading block (shared between editing and view) ──────────────────────────
  const headingEl = (
    <>
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

      {(content.subheading || isEditing) && (
        isEditing ? (
          <div className="relative">
            <InlineEditableText
              id={`${sid}-subheading`}
              as="p"
              value={content.subheading ?? ""}
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
        ) : content.subheading ? (
          <p className="text-center text-base mb-10"
             style={{ color: "var(--theme-text-muted, #6b7280)", ...textStyleToCSS(content.subheadingStyle) }}>
            {content.subheading}
          </p>
        ) : null
      )}

      <div className={`${content.subheading ? "" : "mt-10"}`} />
    </>
  );

  // ── Editing mode: always use UniversalCard grid ────────────────────────────
  if (isEditing) {
    return (
      <BlockStyleWrapper
        wrapperClassName="py-16 px-6 bg-white dark:bg-gray-900"
        blockStyle={blockStyle}
        isEditing={isEditing}
      >
        <div
          className="max-w-5xl mx-auto"
          onClick={e => {
            if ((e.target as HTMLElement).closest("[data-universal-card]")) return;
            onSelectCard?.(null);
          }}
        >
          {headingEl}

          {layout !== "cards" && (
            <div className="mb-4 text-center">
              <span className="text-[10px] text-muted-foreground/60 border border-border/40 rounded px-2 py-0.5">
                {layout === "icon_row" ? "Icon Row" : "Feature Grid"} layout — shown in live preview
              </span>
            </div>
          )}

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

                <button
                  type="button"
                  onClick={addItem}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl p-6 border-2 border-dashed border-gray-200 dark:border-gray-600 text-gray-400 hover:border-primary hover:text-primary transition-colors min-h-[140px]"
                  style={{ borderRadius: "var(--theme-card-radius, 0.75rem)" }}
                >
                  <Plus className="w-6 h-6" />
                  <span className="text-sm">Add Card</span>
                </button>
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </BlockStyleWrapper>
    );
  }

  // ── View mode: render per layout ──────────────────────────────────────────

  const visibleItems = content.items.filter(i => !i.hidden);

  return (
    <BlockStyleWrapper
      wrapperClassName="py-16 px-6 bg-white dark:bg-gray-900"
      blockStyle={blockStyle}
      isEditing={isEditing}
    >
      <div className="max-w-5xl mx-auto">
        {headingEl}

        {/* ── icon_row layout ── */}
        {layout === "icon_row" && (
          <div className={`grid grid-cols-1 ${rowColClass} gap-x-12`}>
            {visibleItems.map(item => (
              <div key={item.id} className="border-b border-border/40 last:border-b-0">
                <IconRowView card={item} settings={settings} iconStyle={iconStyle} />
              </div>
            ))}
          </div>
        )}

        {/* ── feature_grid layout ── */}
        {layout === "feature_grid" && (
          <div className={`grid grid-cols-1 ${featureColClass} gap-8 items-stretch`}>
            {visibleItems.map(item => (
              <FeatureGridView
                key={item.id}
                card={item}
                settings={settings}
                iconStyle={iconStyle}
                hoverLift={hoverLift}
              />
            ))}
          </div>
        )}

        {/* ── cards layout (default) ── */}
        {(layout === "cards" || !layout) && (
          <div className={`grid grid-cols-1 ${colClass} gap-6 items-stretch`}>
            {visibleItems.map(item => (
              <CardView
                key={item.id}
                card={item}
                settings={settings}
                iconStyle={iconStyle}
                hoverLift={hoverLift}
              />
            ))}
          </div>
        )}
      </div>
    </BlockStyleWrapper>
  );
}
