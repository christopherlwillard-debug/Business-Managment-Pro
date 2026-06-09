import { useState } from "react";
import { Plus, Trash2, ChevronDown, LayoutGrid, AlignLeft } from "lucide-react";
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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export interface FAQContent {
  heading: string;
  subheading?: string;
  /** Accordion items — always the source of truth for accordion mode */
  items: FAQItem[];
  /** "accordion" (default) or "cards" for feature-highlight card grid */
  displayMode?: "accordion" | "cards";
  /**
   * Full CardComponent[] used when displayMode === "cards".
   * Seeded from accordion items when first switching to cards mode.
   * All card engine fields (media, design, layout, badge, hidden, etc.) are
   * persisted here — no lossy accordion↔card mapping at runtime.
   */
  cards?: CardComponent[];
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function cardId() {
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultFAQContent(): FAQContent {
  return {
    heading: "Frequently Asked Questions",
    subheading: "Have questions? We've got answers.",
    displayMode: "accordion",
    items: [
      { id: uid(), question: "How do I get a quote?", answer: "Simply fill out our contact form or give us a call. We'll schedule a free on-site estimate at a time that's convenient for you." },
      { id: uid(), question: "Are you licensed and insured?", answer: "Yes — we are fully licensed, bonded, and insured in this state. We're happy to provide proof of insurance upon request." },
      { id: uid(), question: "How long does a typical project take?", answer: "Project timelines vary based on scope and complexity. We'll give you a detailed schedule during the estimate process and keep you updated throughout the job." },
      { id: uid(), question: "Do you offer warranties on your work?", answer: "Absolutely. We stand behind our craftsmanship and offer warranties on both labor and materials. Ask us for details specific to your project." },
    ],
  };
}

// ── Seed accordion items → CardComponent[] (first-time switch to cards mode) ──

function seedCardsFromItems(items: FAQItem[]): CardComponent[] {
  return items.map(item => ({
    id: item.id.startsWith("card-") ? item.id : cardId(),
    title: item.question,
    description: item.answer,
    mediaType: "icon" as const,
    iconName: "FileText",
    layout: "icon-top" as const,
    textAlign: "left" as const,
    hoverEffect: "lift" as const,
    clickAction: "none" as const,
  }));
}

// ── Accordion item (public view — animated collapse) ─────────────────────────

function FAQAccordionItem({ item, brandColor }: { item: FAQItem; brandColor: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="overflow-hidden"
      style={{
        border: "var(--theme-card-border, 1px solid #e5e7eb)",
        borderRadius: "var(--theme-card-radius, 0.75rem)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left bg-white hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-sm" style={{ color: "var(--theme-text, #111827)" }}>{item.question}</span>
        <ChevronDown
          className={`w-5 h-5 flex-shrink-0 ml-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          style={{ color: brandColor }}
        />
      </button>
      {open && (
        <div className="px-5 pb-4 bg-white">
          <p className="text-sm leading-relaxed" style={{ color: "var(--theme-text-muted, #4b5563)" }}>{item.answer}</p>
        </div>
      )}
    </div>
  );
}

// ── SortableCard wrapper (cards mode) ─────────────────────────────────────────

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

interface FAQSectionProps {
  content: FAQContent;
  settings: SiteSettings;
  isEditing?: boolean;
  onChange?: (content: FAQContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
  selectedCardId?: string | null;
  onSelectCard?: (id: string | null) => void;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

export function FAQSection({
  content, settings, isEditing, onChange, blockStyle, sectionId,
  selectedCardId, onSelectCard,
}: FAQSectionProps) {
  const items = content.items ?? [];
  const sid = sectionId ?? "faq";
  const displayMode = content.displayMode ?? "accordion";
  const cards = content.cards ?? [];

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function update(patch: Partial<FAQContent>) {
    onChange?.({ ...content, ...patch });
  }

  // ── Accordion helpers ─────────────────────────────────────────────────────

  function updateItem(id: string, patch: Partial<FAQItem>) {
    update({ items: items.map(it => it.id === id ? { ...it, ...patch } : it) });
  }

  function addAccordionItem() {
    update({ items: [...items, { id: uid(), question: "Your question here?", answer: "Write your answer here. Be clear and helpful." }] });
  }

  function removeAccordionItem(id: string) {
    update({ items: items.filter(it => it.id !== id) });
  }

  // ── Mode toggle ──────────────────────────────────────────────────────────

  function switchMode(mode: "accordion" | "cards") {
    onSelectCard?.(null);
    if (mode === "cards" && cards.length === 0) {
      // First switch: seed cards from current accordion items
      update({ displayMode: mode, cards: seedCardsFromItems(items) });
    } else {
      update({ displayMode: mode });
    }
  }

  // ── Cards helpers ────────────────────────────────────────────────────────

  function updateCard(id: string, patch: Partial<CardComponent>) {
    update({ cards: cards.map(c => c.id === id ? { ...c, ...patch } : c) });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = cards.findIndex(c => c.id === active.id);
      const newIdx = cards.findIndex(c => c.id === over.id);
      update({ cards: arrayMove(cards, oldIdx, newIdx) });
    }
  }

  function duplicateCard(id: string) {
    const idx = cards.findIndex(c => c.id === id);
    if (idx < 0) return;
    const duped = { ...cards[idx], id: cardId() };
    update({ cards: [...cards.slice(0, idx + 1), duped, ...cards.slice(idx + 1)] });
  }

  function deleteCard(id: string) {
    update({ cards: cards.filter(c => c.id !== id) });
    if (selectedCardId === id) onSelectCard?.(null);
  }

  function toggleCardHide(id: string) {
    updateCard(id, { hidden: !cards.find(c => c.id === id)?.hidden });
  }

  function addCard() {
    const newCard: CardComponent = {
      id: cardId(),
      title: "New Question",
      description: "Write your answer here. Be clear and helpful.",
      mediaType: "icon",
      iconName: "FileText",
      layout: "icon-top",
      textAlign: "left",
      hoverEffect: "lift",
      clickAction: "none",
    };
    update({ cards: [...cards, newCard] });
  }

  // ── Mode toggle UI ────────────────────────────────────────────────────────

  function renderModeToggle() {
    if (!isEditing) return null;
    return (
      <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 mb-6 w-fit mx-auto">
        <button
          type="button"
          onClick={() => switchMode("accordion")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            displayMode === "accordion"
              ? "bg-white dark:bg-gray-800 shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlignLeft className="w-3.5 h-3.5" />
          Accordion
        </button>
        <button
          type="button"
          onClick={() => switchMode("cards")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            displayMode === "cards"
              ? "bg-white dark:bg-gray-800 shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          Cards
        </button>
      </div>
    );
  }

  // ── Heading block ─────────────────────────────────────────────────────────

  function renderHeading() {
    if (isEditing) {
      return (
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
            placeholder="Subheading (optional)"
            className="text-lg"
            style={{ color: "var(--theme-text-muted, #6b7280)" }}
            onCommit={v => update({ subheading: v || undefined })}
          />
        </div>
      );
    }
    return content.heading ? (
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>{content.heading}</h2>
        {content.subheading && <p className="mt-2 text-lg" style={{ color: "var(--theme-text-muted, #6b7280)" }}>{content.subheading}</p>}
      </div>
    ) : null;
  }

  // ── Accordion mode ────────────────────────────────────────────────────────

  function renderAccordion() {
    if (!isEditing) {
      return (
        <div className="space-y-3">
          {items.map(item => (
            <FAQAccordionItem key={item.id} item={item} brandColor={settings.brandColor} />
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="relative overflow-hidden bg-white"
            style={{
              border: "var(--theme-card-border, 1px solid #e5e7eb)",
              borderRadius: "var(--theme-card-radius, 0.75rem)",
            }}
          >
            <div className="flex items-start gap-2 px-5 pt-4 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest mt-1 flex-shrink-0" style={{ color: settings.brandColor }}>Q{idx + 1}</span>
              <InlineEditableText
                id={`${sid}-faq-${item.id}-q`}
                as="span"
                value={item.question}
                placeholder="Question"
                enterBehavior="commit"
                escapeBehavior="cancel"
                className="font-semibold text-sm flex-1"
                style={{ color: "var(--theme-text, #111827)" }}
                onCommit={v => updateItem(item.id, { question: v })}
              />
              <button
                type="button"
                onClick={() => removeAccordionItem(item.id)}
                className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="px-5 pb-4 pl-10">
              <InlineEditableText
                id={`${sid}-faq-${item.id}-a`}
                as="p"
                value={item.answer}
                placeholder="Answer…"
                className="text-sm leading-relaxed"
                style={{ color: "var(--theme-text-muted, #4b5563)" }}
                onCommit={v => updateItem(item.id, { answer: v })}
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addAccordionItem}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-blue-500 transition-colors py-1"
        >
          <Plus className="w-4 h-4" />
          Add Question
        </button>
      </div>
    );
  }

  // ── Cards mode ────────────────────────────────────────────────────────────

  function renderCards() {
    if (!isEditing) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map(card => (
            <UniversalCard
              key={card.id}
              card={card}
              settings={settings}
              isEditing={false}
            />
          ))}
        </div>
      );
    }

    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
            onClick={e => {
              if ((e.target as HTMLElement).closest("[data-universal-card]")) return;
              onSelectCard?.(null);
            }}
          >
            {cards.map(card => (
              <div key={card.id} data-universal-card>
                <SortableCard
                  card={card}
                  settings={settings}
                  isEditing={isEditing}
                  selected={selectedCardId === card.id}
                  onSelect={() => onSelectCard?.(card.id)}
                  onDuplicate={() => duplicateCard(card.id)}
                  onDelete={() => deleteCard(card.id)}
                  onToggleHide={() => toggleCardHide(card.id)}
                />
              </div>
            ))}

            <button
              type="button"
              onClick={addCard}
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-6 text-gray-400 hover:text-blue-500 hover:border-blue-300 transition-colors min-h-[120px] bg-gray-50"
              style={{ borderRadius: "var(--theme-card-radius, 0.75rem)" }}
            >
              <Plus className="w-6 h-6" />
              <span className="text-sm font-medium">Add Card</span>
            </button>
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <BlockStyleWrapper
      blockStyle={blockStyle}
      wrapperClassName={`px-6 ${isEditing ? "py-12" : "py-16"}`}
      isEditing={isEditing}
    >
      <div
        className={displayMode === "accordion" ? "max-w-2xl mx-auto" : "max-w-5xl mx-auto"}
        onClick={displayMode === "accordion" ? e => e.stopPropagation() : undefined}
      >
        {renderHeading()}
        {renderModeToggle()}
        {displayMode === "cards" ? renderCards() : renderAccordion()}
      </div>
    </BlockStyleWrapper>
  );
}
