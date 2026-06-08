import { useState } from "react";
import { Plus, Trash2, Star } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { InlineEditableText } from "../InlineEditableText";

export interface Testimonial {
  id: string;
  name: string;
  location: string;
  rating: number;
  quote: string;
}

export interface TestimonialsContent {
  heading: string;
  subheading?: string;
  testimonials: Testimonial[];
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function defaultTestimonialsContent(): TestimonialsContent {
  return {
    heading: "What Our Customers Say",
    subheading: "Trusted by homeowners and businesses across the region.",
    testimonials: [
      { id: uid(), name: "John M.", location: "Springfield, IL", rating: 5, quote: "Outstanding work from start to finish. The crew was professional, on time, and the quality speaks for itself. I'd hire them again without hesitation." },
      { id: uid(), name: "Sarah K.", location: "Riverside, CA", rating: 5, quote: "They completed our renovation ahead of schedule and within budget. Communication was excellent the entire time. Highly recommend!" },
      { id: uid(), name: "Tom R.", location: "Austin, TX", rating: 5, quote: "Great attention to detail and very fair pricing. Our project turned out better than we imagined. Five stars all the way." },
    ],
  };
}

function StarRow({ rating, onChange }: { rating: number; onChange?: (r: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          onClick={() => onChange?.(i)}
          onMouseEnter={() => onChange && setHover(i)}
          onMouseLeave={() => onChange && setHover(0)}
          className={onChange ? "cursor-pointer" : "cursor-default"}
          disabled={!onChange}
        >
          <Star
            className={`w-4 h-4 ${i <= (hover || rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
          />
        </button>
      ))}
    </div>
  );
}

interface TestimonialsSectionProps {
  content: TestimonialsContent;
  settings: { brandColor: string; accentColor?: string };
  isEditing?: boolean;
  onChange?: (content: TestimonialsContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
}

export function TestimonialsSection({ content, settings, isEditing, onChange, blockStyle, sectionId }: TestimonialsSectionProps) {
  const testimonials = content.testimonials ?? [];
  const sid = sectionId ?? "testimonials";

  function update(patch: Partial<TestimonialsContent>) {
    onChange?.({ ...content, ...patch });
  }

  function updateTestimonial(id: string, patch: Partial<Testimonial>) {
    update({ testimonials: testimonials.map(t => t.id === id ? { ...t, ...patch } : t) });
  }

  function addTestimonial() {
    update({
      testimonials: [...testimonials, {
        id: uid(),
        name: "Customer Name",
        location: "City, State",
        rating: 5,
        quote: "Write your customer testimonial here. Great experiences make the best reviews.",
      }],
    });
  }

  function removeTestimonial(id: string) {
    update({ testimonials: testimonials.filter(t => t.id !== id) });
  }

  if (!isEditing) {
    return (
      <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-6 py-16" isEditing={false}>
        <div className="max-w-5xl mx-auto">
          {content.heading && (
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>{content.heading}</h2>
              {content.subheading && <p className="mt-2 text-lg" style={{ color: "var(--theme-text-muted, #6b7280)" }}>{content.subheading}</p>}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map(t => (
              <div
                key={t.id}
                className="flex flex-col gap-3 p-6 bg-white"
                style={{
                  borderRadius: "var(--theme-card-radius, 1rem)",
                  boxShadow: "var(--theme-card-shadow, 0 1px 3px rgba(0,0,0,0.08))",
                  border: "var(--theme-card-border, 1px solid #f3f4f6)",
                }}
              >
                <StarRow rating={t.rating} />
                <p className="text-sm leading-relaxed flex-1" style={{ color: "var(--theme-text-muted, #374151)" }}>"{t.quote}"</p>
                <div>
                  <p className="font-semibold text-sm" style={{ color: "var(--theme-text, #111827)" }}>{t.name}</p>
                  {t.location && <p className="text-xs" style={{ color: "var(--theme-text-muted, #9ca3af)" }}>{t.location}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-6 py-12" isEditing={true}>
      <div onClick={e => e.stopPropagation()} className="max-w-5xl mx-auto space-y-6">
        {/* Section headings — inline editable */}
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
            placeholder="Subheading (optional — double-click to add)"
            className="text-lg"
            style={{ color: "var(--theme-text-muted, #6b7280)" }}
            onCommit={v => update({ subheading: v || undefined })}
          />
        </div>

        {/* Testimonial cards — look like the public view */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {testimonials.map(t => (
            <div
              key={t.id}
              className="relative flex flex-col gap-3 p-5 bg-white"
              style={{
                borderRadius: "var(--theme-card-radius, 1rem)",
                boxShadow: "var(--theme-card-shadow, 0 1px 3px rgba(0,0,0,0.08))",
                border: "var(--theme-card-border, 1px solid #f3f4f6)",
              }}
            >
              <button
                type="button"
                onClick={() => removeTestimonial(t.id)}
                className="absolute top-2 right-2 p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors z-10"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <StarRow rating={t.rating} onChange={r => updateTestimonial(t.id, { rating: r })} />
              <InlineEditableText
                id={`${sid}-t-${t.id}-quote`}
                as="p"
                value={t.quote}
                placeholder="Customer quote…"
                multiline
                className="text-sm leading-relaxed flex-1"
                style={{ color: "var(--theme-text-muted, #374151)" }}
                onCommit={v => updateTestimonial(t.id, { quote: v })}
              />
              <div>
                <InlineEditableText
                  id={`${sid}-t-${t.id}-name`}
                  as="p"
                  value={t.name}
                  placeholder="Customer name"
                  className="font-semibold text-sm"
                  style={{ color: "var(--theme-text, #111827)" }}
                  onCommit={v => updateTestimonial(t.id, { name: v })}
                />
                <InlineEditableText
                  id={`${sid}-t-${t.id}-location`}
                  as="p"
                  value={t.location}
                  placeholder="City, State"
                  className="text-xs"
                  style={{ color: "var(--theme-text-muted, #9ca3af)" }}
                  onCommit={v => updateTestimonial(t.id, { location: v })}
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addTestimonial}
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-6 text-gray-400 hover:text-blue-500 hover:border-blue-300 transition-colors min-h-[160px] bg-gray-50"
          >
            <Plus className="w-6 h-6" />
            <span className="text-sm font-medium">Add Testimonial</span>
          </button>
        </div>
      </div>
    </BlockStyleWrapper>
  );
}
