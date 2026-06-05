import { useState } from "react";
import { Plus, Trash2, Star } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

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
}

export function TestimonialsSection({ content, settings, isEditing, onChange, blockStyle }: TestimonialsSectionProps) {
  const testimonials = content.testimonials ?? [];

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
              <h2 className="text-3xl font-bold text-gray-900">{content.heading}</h2>
              {content.subheading && <p className="text-gray-500 mt-2 text-lg">{content.subheading}</p>}
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
                <p className="text-gray-700 text-sm leading-relaxed flex-1">"{t.quote}"</p>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                  {t.location && <p className="text-xs text-gray-400">{t.location}</p>}
                </div>
              </div>
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {testimonials.map(t => (
            <div key={t.id} className="bg-white/10 border border-white/20 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <StarRow rating={t.rating} onChange={r => updateTestimonial(t.id, { rating: r })} />
                <button
                  type="button"
                  onClick={() => removeTestimonial(t.id)}
                  className="p-1 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                rows={3}
                className="w-full text-xs bg-white/10 border border-white/20 text-white placeholder-white/40 rounded px-2 py-1.5 outline-none focus:border-white/50 resize-none"
                placeholder="Customer quote…"
                value={t.quote}
                onChange={e => updateTestimonial(t.id, { quote: e.target.value })}
              />
              <input
                type="text"
                className="w-full text-xs bg-white/10 border border-white/20 text-white placeholder-white/40 rounded px-2 py-1.5 outline-none focus:border-white/50"
                placeholder="Customer name"
                value={t.name}
                onChange={e => updateTestimonial(t.id, { name: e.target.value })}
              />
              <input
                type="text"
                className="w-full text-xs bg-white/10 border border-white/20 text-white placeholder-white/40 rounded px-2 py-1.5 outline-none focus:border-white/50"
                placeholder="City, State"
                value={t.location}
                onChange={e => updateTestimonial(t.id, { location: e.target.value })}
              />
            </div>
          ))}

          <button
            type="button"
            onClick={addTestimonial}
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-white/30 rounded-xl p-6 text-white/50 hover:text-white hover:border-white/60 transition-colors min-h-[160px]"
          >
            <Plus className="w-6 h-6" />
            <span className="text-sm font-medium">Add Testimonial</span>
          </button>
        </div>
      </div>
    </BlockStyleWrapper>
  );
}
