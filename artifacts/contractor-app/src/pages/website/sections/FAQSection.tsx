import { useState } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

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
}

function FAQAccordionItem({ item, brandColor }: { item: FAQItem; brandColor: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left bg-white hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-900 text-sm">{item.question}</span>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 flex-shrink-0 ml-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-5 pb-4 bg-white">
          <p className="text-gray-600 text-sm leading-relaxed">{item.answer}</p>
        </div>
      )}
    </div>
  );
}

export function FAQSection({ content, settings, isEditing, onChange, blockStyle }: FAQSectionProps) {
  const items = content.items ?? [];

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
              <h2 className="text-3xl font-bold text-gray-900">{content.heading}</h2>
              {content.subheading && <p className="text-gray-500 mt-2 text-lg">{content.subheading}</p>}
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
    <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-4 py-8" isEditing={true}>
      <div onClick={e => e.stopPropagation()} className="space-y-4">
        <div className="space-y-2">
          <input
            type="text"
            className="w-full text-lg font-bold bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-lg px-3 py-2 outline-none focus:border-white/60"
            placeholder="Section heading"
            value={content.heading}
            onChange={e => update({ heading: e.target.value })}
          />
          <input
            type="text"
            className="w-full text-sm bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-lg px-3 py-1.5 outline-none focus:border-white/60"
            placeholder="Subheading (optional)"
            value={content.subheading ?? ""}
            onChange={e => update({ subheading: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={item.id} className="bg-white/10 border border-white/20 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">Q{idx + 1}</span>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="p-1 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                type="text"
                className="w-full text-sm font-semibold bg-white/10 border border-white/20 text-white placeholder-white/40 rounded px-2 py-1.5 outline-none focus:border-white/50"
                placeholder="Question"
                value={item.question}
                onChange={e => updateItem(item.id, { question: e.target.value })}
              />
              <textarea
                rows={2}
                className="w-full text-xs bg-white/10 border border-white/20 text-white placeholder-white/40 rounded px-2 py-1.5 outline-none focus:border-white/50 resize-none"
                placeholder="Answer"
                value={item.answer}
                onChange={e => updateItem(item.id, { answer: e.target.value })}
              />
            </div>
          ))}

          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors py-1"
          >
            <Plus className="w-4 h-4" />
            Add Question
          </button>
        </div>
      </div>
    </BlockStyleWrapper>
  );
}
