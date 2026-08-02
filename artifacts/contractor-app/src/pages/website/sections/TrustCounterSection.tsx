import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { nanoid } from "nanoid";

export interface CounterItem {
  id: string;
  value: number;
  suffix: string;
  label: string;
  icon?: string;
}

export interface TrustCounterContent {
  heading?: string;
  subheading?: string;
  items: CounterItem[];
  layout?: "row" | "grid";
}

export function defaultTrustCounterContent(): TrustCounterContent {
  return {
    heading: "Why Contractors Trust Us",
    items: [
      { id: nanoid(6), value: 500, suffix: "+", label: "Homes Finished", icon: "🏠" },
      { id: nanoid(6), value: 15,  suffix: "+", label: "Years Experience", icon: "📅" },
      { id: nanoid(6), value: 98,  suffix: "%", label: "Customer Satisfaction", icon: "⭐" },
      { id: nanoid(6), value: 5,   suffix: "★", label: "Average Rating", icon: "🏆" },
    ],
    layout: "row",
  };
}

// ── Animated counter hook ─────────────────────────────────────────────────────

function useCountUp(target: number, triggered: boolean, duration = 1400) {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!triggered) return;
    const start = performance.now();
    function step(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [triggered, target, duration]);

  return count;
}

// ── Single counter item ────────────────────────────────────────────────────────

function CounterCard({ item, brandColor, triggered }: { item: CounterItem; brandColor: string; triggered: boolean }) {
  const count = useCountUp(item.value, triggered);

  return (
    <div className="flex flex-col items-center text-center px-4 py-6">
      {item.icon && (
        <span className="text-3xl mb-2 leading-none" role="img" aria-hidden="true">{item.icon}</span>
      )}
      <div className="text-4xl md:text-5xl font-extrabold leading-none" style={{ color: brandColor }}>
        {count}{item.suffix}
      </div>
      <p className="mt-2 text-sm font-medium" style={{ color: "var(--theme-text-muted, #6b7280)" }}>
        {item.label}
      </p>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

interface TrustCounterSectionProps {
  content: TrustCounterContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: TrustCounterContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
}

export function TrustCounterSection({ content, settings, isEditing, onChange, blockStyle }: TrustCounterSectionProps) {
  const c: TrustCounterContent = {
    ...defaultTrustCounterContent(),
    ...content,
    items: content.items?.length ? content.items : defaultTrustCounterContent().items,
  };

  const sectionRef = useRef<HTMLDivElement>(null);
  const [triggered, setTriggered] = useState(false);

  // IntersectionObserver — trigger counter animation when in view
  useEffect(() => {
    if (isEditing || triggered) return;
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setTriggered(true);
          obs.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isEditing, triggered]);

  function update(patch: Partial<TrustCounterContent>) {
    onChange?.({ ...c, ...patch });
  }

  function updateItem(id: string, patch: Partial<CounterItem>) {
    update({ items: c.items.map(it => it.id === id ? { ...it, ...patch } : it) });
  }

  function addItem() {
    if (c.items.length >= 6) return;
    update({ items: [...c.items, { id: nanoid(6), value: 0, suffix: "+", label: "New Stat", icon: "✅" }] });
  }

  function removeItem(id: string) {
    update({ items: c.items.filter(it => it.id !== id) });
  }

  const colClass =
    c.items.length <= 2 ? "grid-cols-2" :
    c.items.length === 3 ? "grid-cols-3" :
    c.layout === "grid" ? "grid-cols-2 md:grid-cols-4" :
    "grid-cols-2 md:grid-cols-4";

  if (!isEditing) {
    return (
      <BlockStyleWrapper blockStyle={blockStyle} isEditing={false} wrapperClassName="px-6 py-16">
        <div className="max-w-5xl mx-auto" ref={sectionRef}>
          {c.heading && (
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>{c.heading}</h2>
              {c.subheading && <p className="mt-2" style={{ color: "var(--theme-text-muted, #6b7280)" }}>{c.subheading}</p>}
            </div>
          )}
          <div className={`grid ${colClass} divide-x divide-y md:divide-y-0`} style={{ borderColor: "var(--theme-border, #e5e7eb)" }}>
            {c.items.map(item => (
              <CounterCard key={item.id} item={item} brandColor={settings.brandColor} triggered={triggered} />
            ))}
          </div>
        </div>
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} isEditing={true} wrapperClassName="px-4 py-2">
      <div onClick={e => e.stopPropagation()} className="space-y-3 bg-card/95 backdrop-blur-sm rounded-xl border border-border p-4 shadow-sm">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Trust Counter</p>

        <input
          type="text"
          className="w-full text-lg font-bold bg-background border border-border text-foreground rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          placeholder="Section heading (optional)"
          value={c.heading ?? ""}
          onChange={e => update({ heading: e.target.value })}
        />

        <input
          type="text"
          className="w-full text-sm bg-background border border-border text-foreground rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary"
          placeholder="Subheading (optional)"
          value={c.subheading ?? ""}
          onChange={e => update({ subheading: e.target.value })}
        />

        <div className="space-y-2">
          <div className="grid grid-cols-[32px_1fr_64px_64px_1fr_28px] gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-1">
            <span>Icon</span><span>Label</span><span>Value</span><span>Suffix</span><span></span><span></span>
          </div>
          {c.items.map(item => (
            <div key={item.id} className="grid grid-cols-[32px_1fr_64px_64px_28px] gap-1.5 items-center">
              <input
                type="text"
                className="text-center text-sm bg-background border border-border rounded px-1 py-1 outline-none"
                value={item.icon ?? ""}
                maxLength={4}
                onChange={e => updateItem(item.id, { icon: e.target.value })}
              />
              <input
                type="text"
                className="text-xs bg-background border border-border text-foreground rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary"
                placeholder="Label"
                value={item.label}
                onChange={e => updateItem(item.id, { label: e.target.value })}
              />
              <input
                type="number"
                className="text-xs bg-background border border-border text-foreground rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary text-center"
                placeholder="0"
                value={item.value}
                min={0}
                onChange={e => updateItem(item.id, { value: parseInt(e.target.value) || 0 })}
              />
              <input
                type="text"
                className="text-xs bg-background border border-border text-foreground rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary text-center"
                placeholder="+"
                maxLength={4}
                value={item.suffix}
                onChange={e => updateItem(item.id, { suffix: e.target.value })}
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                disabled={c.items.length <= 1}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {c.items.length < 6 && (
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> Add stat
          </button>
        )}
      </div>
    </BlockStyleWrapper>
  );
}
