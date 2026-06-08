import { useState } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { InlineEditableText } from "../InlineEditableText";

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export interface FAQContent {
  heading: string;
  subheading?: string;
  items: FAQItem[];
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function defaultFAQContent(): FAQContent {
  return {
    heading: "Frequently Asked Questions",
    subheading: "Have questions? We've got answers.",
    items: [
      { id: uid(), question: "How do I get a quote?", answer: "Simply fill out our contact form or give us a call. We'll schedule a free on-site estimate at a time that's convenient for you." },
      { id: uid(), question: "Are you licensed and insured?", answer: "Yes — we are fully licensed, bonded, and insured in this state. We're happy to provide proof of insurance upon request." },
      { id: uid(), question: "How long does a typical project take?", answer: "Project timelines vary based on scope and complexity. We'll give you a detailed schedule during the estimate process and keep you updated throughout the job." },
      { id: uid(), question: "Do you offer warranties on your work?", answer: "Absolutely. We stand behind our craftsmanship and offer warranties on both labor and materials. Ask us for details specific to your project." },
    ],
  };
}

interface FAQSectionProps {
  content: FAQContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: FAQContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
}

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

export function FAQSection({ content, settings, isEditing, onChange, blockStyle, sectionId }: FAQSectionProps) {
  const items = content.items ?? [];
  const sid = sectionId ?? "faq";

  function update(patch: Partial<FAQContent>) {
    onChange?.({ ...content, ...patch });
  }

  function updateItem(id: string, patch: Partial<FAQItem>) {
    update({ items: items.map(it => it.id === id ? { ...it, ...patch } : it) });
  }

  function addItem() {
    update({
      items: [...items, {
        id: uid(),
        question: "Your question here?",
        answer: "Write your answer here. Be clear and helpful.",
      }],
    });
  }

  function removeItem(id: string) {
    update({ items: items.filter(it => it.id !== id) });
  }

  if (!isEditing) {
    return (
      <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-6 py-16" isEditing={false}>
        <div className="max-w-2xl mx-auto">
          {content.heading && (
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>{content.heading}</h2>
              {content.subheading && <p className="mt-2 text-lg" style={{ color: "var(--theme-text-muted, #6b7280)" }}>{content.subheading}</p>}
            </div>
          )}
          <div className="space-y-3">
            {items.map(item => (
              <FAQAccordionItem key={item.id} item={item} brandColor={settings.brandColor} />
            ))}
          </div>
        </div>
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-6 py-12" isEditing={true}>
      <div onClick={e => e.stopPropagation()} className="max-w-2xl mx-auto space-y-6">
        {/* Section headings */}
        <div className="text-center space-y-1">
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

        {/* FAQ items — expanded in edit mode so both Q and A are always visible */}
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
                  className="font-semibold text-sm flex-1"
                  style={{ color: "var(--theme-text, #111827)" }}
                  onCommit={v => updateItem(item.id, { question: v })}
                />
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
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
                  multiline
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--theme-text-muted, #4b5563)" }}
                  onCommit={v => updateItem(item.id, { answer: v })}
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-blue-500 transition-colors py-1"
          >
            <Plus className="w-4 h-4" />
            Add Question
          </button>
        </div>
      </div>
    </BlockStyleWrapper>
  );
}
