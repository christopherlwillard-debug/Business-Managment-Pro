// Dedicated inspector panel for the Hero section.
// Mounted as specialContent in WebsiteEditor for all three inspector locations
// (docked, floating, mobile drawer).

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, Image } from "lucide-react";
import type { HeroContent } from "./sections/HeroSection";

interface Props {
  content: HeroContent;
  onChange: (patch: Partial<HeroContent>) => void;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

// ── Collapsible section ────────────────────────────────────────────────────────
function Section({
  title, defaultOpen = false, children,
}: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-xs font-medium text-foreground/80">{title}</span>
        {open
          ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
          : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      </button>
      {open && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  );
}

// ── Preset button ──────────────────────────────────────────────────────────────
function PresetBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs rounded px-2 py-1.5 border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
      }`}
    >
      {children}
    </button>
  );
}

// ── Toggle row ─────────────────────────────────────────────────────────────────
function ToggleRow({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        className="rounded border-border cursor-pointer"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="text-xs font-medium text-foreground">{label}</span>
    </label>
  );
}

// ── Text input row ─────────────────────────────────────────────────────────────
function InputRow({
  label, value, placeholder, onChange,
}: { label: string; value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground block mb-0.5">{label}</label>
      <input
        type="text"
        className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Image picker button ────────────────────────────────────────────────────────
function ImagePickerBtn({
  label, hasImage, onClick, onClear,
}: { label: string; hasImage: boolean; onClick: () => void; onClear: () => void }) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={onClick}
        className={`flex-1 flex items-center justify-center gap-1.5 text-xs rounded border px-2 py-1.5 transition-colors ${
          hasImage
            ? "border-green-500 text-green-700 bg-green-50 hover:bg-green-100"
            : "border-border text-muted-foreground hover:bg-muted"
        }`}
      >
        <Image className="w-3 h-3" />
        {hasImage ? `✓ ${label}` : label}
      </button>
      {hasImage && (
        <button
          type="button"
          onClick={onClear}
          className="p-1.5 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
          title="Remove"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ── Default trust bar items ────────────────────────────────────────────────────
function uid() { return `ti-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }
const DEFAULT_TRUST_ITEMS = [
  { id: uid(), icon: "🇺🇸", label: "Veteran Owned" },
  { id: uid(), icon: "🛡️", label: "Fully Insured" },
  { id: uid(), icon: "⚡", label: "Fast Turnaround" },
  { id: uid(), icon: "🔧", label: "Licensed & Bonded" },
  { id: uid(), icon: "⭐", label: "5-Star Rated" },
];

// ── Main component ─────────────────────────────────────────────────────────────
export function HeroInspector({ content, onChange, onOpenMediaLibrary }: Props) {
  const layout = content.layout ?? "centered";
  const trustBar = content.trustBar ?? { enabled: false, items: [] };
  const secondaryCta = content.secondaryCta ?? { label: "Call Now", href: "tel:", enabled: false };
  const badge = content.badge ?? { imageUrl: "", position: "top-right" as const };

  return (
    <div className="overflow-y-auto flex flex-col divide-y divide-border">
      {/* ── Layout ── */}
      <Section title="Layout" defaultOpen>
        <div className="grid grid-cols-3 gap-1">
          <PresetBtn active={layout === "centered"} onClick={() => onChange({ layout: "centered" })}>
            ⊙ Centered
          </PresetBtn>
          <PresetBtn active={layout === "split"} onClick={() => onChange({ layout: "split" })}>
            ◧ Split
          </PresetBtn>
          <PresetBtn active={layout === "minimal"} onClick={() => onChange({ layout: "minimal" })}>
            ─ Minimal
          </PresetBtn>
        </div>
        <p className="text-[10px] text-muted-foreground leading-snug">
          {layout === "centered" && "Full-width background with centered text — classic hero."}
          {layout === "split" && "Text on left, image on right — great for photos."}
          {layout === "minimal" && "Light background, dark text — clean and understated."}
        </p>
      </Section>

      {/* ── Background ── */}
      {layout !== "minimal" && (
        <Section title="Background Image" defaultOpen={!!content.backgroundImage}>
          <ImagePickerBtn
            label={layout === "split" ? "Right-side Image" : "Background Photo"}
            hasImage={!!content.backgroundImage}
            onClick={() => onOpenMediaLibrary?.(url => onChange({ backgroundImage: url }))}
            onClear={() => onChange({ backgroundImage: undefined })}
          />
          {content.backgroundImage && layout !== "split" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-muted-foreground">Overlay Opacity</label>
                <span className="text-[10px] font-medium text-foreground">
                  {Math.round((content.overlayOpacity ?? 0.45) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.9}
                step={0.05}
                value={content.overlayOpacity ?? 0.45}
                onChange={e => onChange({ overlayOpacity: parseFloat(e.target.value) })}
                className="w-full accent-primary"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Higher = darker overlay, text more readable.
              </p>
            </div>
          )}
        </Section>
      )}

      {/* ── Primary CTA ── */}
      <Section title="Primary Button">
        <p className="text-[10px] text-muted-foreground">
          Click the button text on the canvas to edit the label. Use the button editor popover for color and style.
        </p>
        <InputRow
          label="Button Link"
          value={content.ctaButton?.url ?? ""}
          placeholder="#contact or https://..."
          onChange={v => onChange({ ctaButton: { ...(content.ctaButton ?? {}), url: v } })}
        />
      </Section>

      {/* ── Secondary CTA ── */}
      <Section title="Secondary Button">
        <ToggleRow
          label="Show secondary button"
          checked={secondaryCta.enabled ?? false}
          onChange={v => onChange({ secondaryCta: { ...secondaryCta, enabled: v } })}
        />
        {secondaryCta.enabled && (
          <>
            <InputRow
              label="Label"
              value={secondaryCta.label}
              placeholder="Call Now"
              onChange={v => onChange({ secondaryCta: { ...secondaryCta, label: v } })}
            />
            <InputRow
              label="Link"
              value={secondaryCta.href}
              placeholder="tel:+1... or #section"
              onChange={v => onChange({ secondaryCta: { ...secondaryCta, href: v } })}
            />
          </>
        )}
      </Section>

      {/* ── Badge ── */}
      <Section title="Certification Badge">
        <ImagePickerBtn
          label="Upload Badge"
          hasImage={!!badge.imageUrl}
          onClick={() => onOpenMediaLibrary?.(url => onChange({ badge: { ...badge, imageUrl: url } }))}
          onClear={() => onChange({ badge: { ...badge, imageUrl: "" } })}
        />
        {badge.imageUrl && (
          <>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Position</label>
              <div className="grid grid-cols-2 gap-1">
                <PresetBtn
                  active={(badge.position ?? "top-right") === "top-right"}
                  onClick={() => onChange({ badge: { ...badge, position: "top-right" } })}
                >
                  Top Right
                </PresetBtn>
                <PresetBtn
                  active={badge.position === "bottom-right"}
                  onClick={() => onChange({ badge: { ...badge, position: "bottom-right" } })}
                >
                  Bottom Right
                </PresetBtn>
              </div>
            </div>
            <div className="flex justify-center">
              <img src={badge.imageUrl} className="h-12 object-contain rounded border border-border p-1" />
            </div>
          </>
        )}
        <p className="text-[10px] text-muted-foreground leading-snug">
          Veteran-owned, SDVOSB, SBA, or manufacturer certification badge.
        </p>
      </Section>

      {/* ── Trust Bar ── */}
      <Section title="Trust Bar Strip">
        <ToggleRow
          label="Show trust bar below hero"
          checked={trustBar.enabled}
          onChange={v => {
            const items = trustBar.items.length > 0 ? trustBar.items : DEFAULT_TRUST_ITEMS;
            onChange({ trustBar: { ...trustBar, enabled: v, items } });
          }}
        />
        {trustBar.enabled && (
          <div className="space-y-1.5 mt-1">
            {trustBar.items.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-1">
                <input
                  type="text"
                  className="w-9 text-sm border border-border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary text-center"
                  value={item.icon}
                  placeholder="🛡"
                  onChange={e => {
                    const items = trustBar.items.map(it => it.id === item.id ? { ...it, icon: e.target.value } : it);
                    onChange({ trustBar: { ...trustBar, items } });
                  }}
                />
                <input
                  type="text"
                  className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  value={item.label}
                  placeholder="Label"
                  onChange={e => {
                    const items = trustBar.items.map(it => it.id === item.id ? { ...it, label: e.target.value } : it);
                    onChange({ trustBar: { ...trustBar, items } });
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const items = trustBar.items.filter((_, i) => i !== idx);
                    onChange({ trustBar: { ...trustBar, items } });
                  }}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const items = [...trustBar.items, { id: uid(), icon: "✅", label: "New Item" }];
                onChange({ trustBar: { ...trustBar, items } });
              }}
              className="w-full flex items-center justify-center gap-1 text-xs border border-dashed border-border rounded px-2 py-1.5 hover:bg-muted text-muted-foreground transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Item
            </button>
          </div>
        )}
      </Section>
    </div>
  );
}
