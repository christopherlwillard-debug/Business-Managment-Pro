import { useState } from "react";
import {
  X, Images, Image, Smile, Palette, LayoutGrid, Sparkles,
  ArrowRight, ChevronDown, ChevronRight as ChevronRightIcon, Eye, EyeOff,
} from "lucide-react";
import { LUCIDE_ICON_MAP } from "./sections/UniversalCard";
import type {
  CardComponent, CardClickAction, CardHoverEffect, CardLayout, CardTextAlign, CardMediaType,
} from "./website-types";

interface CardItemEditorPanelProps {
  card: CardComponent;
  onChange: (card: CardComponent) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onClose?: () => void;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

type EditorTab = "content" | "media" | "design" | "layout" | "presets";

// ── Presets ───────────────────────────────────────────────────────────────────

interface Preset {
  id: string;
  label: string;
  iconName: string;
  apply: Partial<CardComponent>;
}

const CARD_PRESETS: Preset[] = [
  {
    id: "modern", label: "Modern", iconName: "Layers",
    apply: { hoverEffect: "lift", layout: "icon-top", textAlign: "left", cardBgColor: null, cardBorderColor: null },
  },
  {
    id: "contractor", label: "Contractor", iconName: "HardHat",
    apply: { hoverEffect: "lift", layout: "icon-left", textAlign: "left" },
  },
  {
    id: "minimal", label: "Minimal", iconName: "Minus" as any,
    apply: { hoverEffect: "none", layout: "icon-top", textAlign: "center", cardBgColor: null },
  },
  {
    id: "outline", label: "Outline", iconName: "Square" as any,
    apply: { hoverEffect: "border", layout: "icon-top", textAlign: "left" },
  },
  {
    id: "elevated", label: "Elevated", iconName: "Layers",
    apply: { hoverEffect: "lift", layout: "icon-top", textAlign: "left" },
  },
  {
    id: "feature", label: "Feature Card", iconName: "Star",
    apply: { hoverEffect: "lift", layout: "horizontal", textAlign: "left" },
  },
  {
    id: "image-card", label: "Image Card", iconName: "Image" as any,
    apply: { hoverEffect: "lift", layout: "image-bg", textAlign: "left" },
  },
  {
    id: "service-tile", label: "Service Tile", iconName: "Wrench",
    apply: { hoverEffect: "none", layout: "icon-left", textAlign: "left" },
  },
  {
    id: "trust-card", label: "Trust Card", iconName: "Shield",
    apply: { hoverEffect: "none", layout: "icon-top", textAlign: "center" },
  },
];

// ── Templates ─────────────────────────────────────────────────────────────────

interface CardTemplate {
  id: string;
  label: string;
  iconName: string;
  apply: Partial<CardComponent>;
}

const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: "service", label: "Service Card", iconName: "Wrench",
    apply: { title: "Our Service", description: "We provide professional, reliable service every time.", mediaType: "icon", iconName: "Wrench", templateType: "service" },
  },
  {
    id: "team", label: "Team Member", iconName: "Users",
    apply: { title: "Team Member", description: "Expert craftsman with 10+ years of experience.", mediaType: "image", layout: "icon-left", templateType: "team" },
  },
  {
    id: "trust", label: "Trust Card", iconName: "Shield",
    apply: { title: "Licensed & Insured", description: "Fully licensed and insured for your peace of mind.", mediaType: "icon", iconName: "Shield", templateType: "trust" },
  },
  {
    id: "pricing", label: "Pricing Tier", iconName: "DollarSign",
    apply: { title: "Starter Plan", description: "Everything you need to get started.", buttonLabel: "Get Started", mediaType: "icon", iconName: "DollarSign", templateType: "pricing" },
  },
  {
    id: "testimonial", label: "Testimonial", iconName: "Star",
    apply: { title: "Happy Customer", description: '"This team was incredible — fast, professional, and affordable."', mediaType: "icon", iconName: "Star", templateType: "testimonial" },
  },
  {
    id: "process", label: "Process Step", iconName: "CheckCircle2",
    apply: { title: "Step 1: Consult", description: "We start with a free on-site consultation to understand your needs.", mediaType: "icon", iconName: "CheckCircle2", badgeText: "1", templateType: "process" },
  },
  {
    id: "portfolio", label: "Portfolio Item", iconName: "Camera",
    apply: { title: "Project Name", description: "A brief description of this project.", mediaType: "image", layout: "image-bg", templateType: "portfolio" },
  },
];

// ── Trust Content Pack ────────────────────────────────────────────────────────

const TRUST_CONTENT_PACK = [
  { label: "Veteran Owned", iconName: "Shield", desc: "Proudly veteran-owned and operated." },
  { label: "Disabled Veteran Owned", iconName: "Award", desc: "Disabled veteran-owned business committed to service." },
  { label: "SBA Certified", iconName: "Award", desc: "Small Business Administration certified contractor." },
  { label: "Licensed & Insured", iconName: "Shield", desc: "Fully licensed and insured for your protection." },
  { label: "Bonded", iconName: "Lock", desc: "Bonded for your peace of mind on every project." },
  { label: "BBB Accredited", iconName: "Star", desc: "A+ rating from the Better Business Bureau." },
  { label: "OSHA Compliant", iconName: "HardHat", desc: "OSHA safety standards followed on every job." },
  { label: "Family Owned", iconName: "Heart", desc: "Family-owned business serving our community." },
  { label: "5-Star Rated", iconName: "Star", desc: "Consistently rated 5 stars by our customers." },
  { label: "24/7 Emergency Service", iconName: "Phone", desc: "Available around the clock for emergency calls." },
  { label: "10,000+ Projects Completed", iconName: "CheckCircle2", desc: "Over 10,000 successfully completed projects." },
  { label: "Serving Since 2010", iconName: "Clock", desc: "Trusted by homeowners since 2010." },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const ICON_NAMES = Object.keys(LUCIDE_ICON_MAP);

function ColorInput({ label, value, onChange }: { label: string; value?: string | null; onChange: (v: string | null) => void }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value ?? "#888888"}
          onChange={e => onChange(e.target.value)}
          className="w-7 h-7 rounded border border-border cursor-pointer p-0.5 bg-transparent"
        />
        <input
          type="text"
          value={value ?? ""}
          onChange={e => onChange(e.target.value || null)}
          placeholder="inherit"
          className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {value && (
          <button type="button" onClick={() => onChange(null)}
            className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, multiline }: {
  value?: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
}) {
  const cls = "w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none";
  if (multiline) {
    return (
      <textarea
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={cls}
      />
    );
  }
  return (
    <input
      type="text"
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={cls}
    />
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function CardItemEditorPanel({
  card,
  onChange,
  onDuplicate,
  onDelete,
  onClose,
  onOpenMediaLibrary,
}: CardItemEditorPanelProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("content");
  const [iconSearch, setIconSearch] = useState("");
  const [showTrustPack, setShowTrustPack] = useState(false);
  const [showDesignOverrides, setShowDesignOverrides] = useState(false);

  function patch(p: Partial<CardComponent>) {
    onChange({ ...card, ...p });
  }

  const filteredIcons = ICON_NAMES.filter(k =>
    iconSearch === "" || k.toLowerCase().includes(iconSearch.toLowerCase())
  );

  const TABS: { id: EditorTab; label: string }[] = [
    { id: "content", label: "Content" },
    { id: "media", label: "Icon/Img" },
    { id: "design", label: "Design" },
    { id: "layout", label: "Layout" },
    { id: "presets", label: "Presets" },
  ];

  // ── Tab: Content ────────────────────────────────────────────────────────

  function renderContentTab() {
    return (
      <div className="p-3 space-y-3">
        <Field label="Title">
          <TextInput value={card.title} onChange={v => patch({ title: v })} placeholder="Card title" />
        </Field>
        <Field label="Description">
          <TextInput value={card.description} onChange={v => patch({ description: v })} placeholder="Card description…" multiline />
        </Field>

        <div className="border-t border-border pt-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Button / CTA</p>
          <Field label="Button Label">
            <TextInput value={card.buttonLabel ?? ""} onChange={v => patch({ buttonLabel: v || undefined })} placeholder="e.g. Learn More" />
          </Field>
          {card.buttonLabel && (
            <Field label="Button URL">
              <TextInput value={card.buttonUrl ?? ""} onChange={v => patch({ buttonUrl: v || undefined })} placeholder="https:// or #anchor" />
            </Field>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Badge</p>
          <Field label="Badge Text">
            <TextInput value={card.badgeText ?? ""} onChange={v => patch({ badgeText: v || undefined })} placeholder="e.g. Popular, New, #1" />
          </Field>
          {card.badgeText && (
            <div className="grid grid-cols-2 gap-2">
              <ColorInput label="Badge BG" value={card.badgeBgColor} onChange={v => patch({ badgeBgColor: v })} />
              <ColorInput label="Badge Text" value={card.badgeColor} onChange={v => patch({ badgeColor: v })} />
            </div>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Analytics</p>
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={card.trackClicks ?? false}
              onChange={e => patch({ trackClicks: e.target.checked })}
              className="w-3.5 h-3.5 accent-primary"
            />
            <span className="text-xs text-foreground">Track clicks</span>
          </label>
          {card.trackClicks && (
            <Field label="Analytics Label">
              <TextInput value={card.analyticsLabel ?? ""} onChange={v => patch({ analyticsLabel: v || undefined })} placeholder={card.title} />
            </Field>
          )}
        </div>

        <div className="border-t border-border pt-3 flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer flex-1">
            <input
              type="checkbox"
              checked={card.hidden ?? false}
              onChange={e => patch({ hidden: e.target.checked })}
              className="w-3.5 h-3.5 accent-primary"
            />
            <span className="text-xs text-foreground flex items-center gap-1">
              {card.hidden ? <EyeOff className="w-3 h-3 text-muted-foreground" /> : <Eye className="w-3 h-3 text-muted-foreground" />}
              Hide this card
            </span>
          </label>
        </div>
      </div>
    );
  }

  // ── Tab: Icon / Image ───────────────────────────────────────────────────

  function renderMediaTab() {
    const mediaType = card.mediaType ?? "icon";

    return (
      <div className="p-3 space-y-3">
        <Field label="Media Type">
          <div className="flex gap-1">
            {(["none", "icon", "image"] as CardMediaType[]).map(mt => (
              <button
                key={mt}
                type="button"
                onClick={() => patch({ mediaType: mt })}
                className={`flex-1 py-1.5 text-xs rounded capitalize transition-colors ${mediaType === mt ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                {mt === "none" ? "None" : mt === "icon" ? "Icon" : "Image"}
              </button>
            ))}
          </div>
        </Field>

        {mediaType === "icon" && (
          <>
            <Field label="Search Icons">
              <input
                type="text"
                value={iconSearch}
                onChange={e => setIconSearch(e.target.value)}
                placeholder="Filter icons…"
                className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </Field>
            <div className="grid grid-cols-7 gap-1 max-h-44 overflow-y-auto border border-border rounded p-1 bg-muted/20">
              {filteredIcons.map(key => {
                const IconComp = LUCIDE_ICON_MAP[key]!;
                const isSelected = (card.iconName ?? "Wrench") === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => patch({ iconName: key })}
                    title={key}
                    className={`p-1.5 rounded flex items-center justify-center transition-colors ${isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
                  >
                    <IconComp className="w-4 h-4" />
                  </button>
                );
              })}
              {filteredIcons.length === 0 && (
                <p className="col-span-7 text-xs text-muted-foreground text-center py-4">No icons match</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ColorInput label="Icon Color" value={card.iconColor} onChange={v => patch({ iconColor: v })} />
              <ColorInput label="Icon BG Color" value={card.iconBgColor} onChange={v => patch({ iconBgColor: v })} />
            </div>
          </>
        )}

        {mediaType === "image" && (
          <>
            {card.imageUrl && (
              <div className="relative rounded overflow-hidden border border-border">
                <img src={card.imageUrl} alt="preview" className="w-full h-32 object-cover" />
                <button
                  type="button"
                  onClick={() => patch({ imageUrl: undefined, imageObjectPath: undefined })}
                  className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded hover:bg-black/70 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {onOpenMediaLibrary && (
              <button
                type="button"
                onClick={() => onOpenMediaLibrary(url => patch({ imageUrl: url }))}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs rounded border border-dashed border-border hover:border-primary hover:text-primary transition-colors text-muted-foreground"
              >
                <Images className="w-3.5 h-3.5" />
                Choose from Media Library
              </button>
            )}
            <Field label="Or paste image URL">
              <TextInput
                value={card.imageUrl ?? ""}
                onChange={v => patch({ imageUrl: v || undefined })}
                placeholder="https://…"
              />
            </Field>
          </>
        )}
      </div>
    );
  }

  // ── Tab: Design ─────────────────────────────────────────────────────────

  function renderDesignTab() {
    const action = card.clickAction ?? "none";

    return (
      <div className="p-3 space-y-3">
        <Field label="Hover Effect">
          <div className="grid grid-cols-2 gap-1">
            {([["none", "None"], ["lift", "Lift"], ["glow", "Glow"], ["border", "Border"]] as [CardHoverEffect, string][]).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => patch({ hoverEffect: v })}
                className={`py-1.5 text-xs rounded transition-colors ${(card.hoverEffect ?? "none") === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </Field>

        <div className="border-t border-border pt-3">
          <Field label="On Click">
            <select
              value={action}
              onChange={e => patch({ clickAction: e.target.value as CardClickAction })}
              className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="none">No action</option>
              <option value="url">Open URL</option>
              <option value="page">Go to page</option>
              <option value="scroll">Scroll to section</option>
              <option value="contact-form">Scroll to contact form</option>
              <option value="tel">Call phone number</option>
              <option value="email">Send email</option>
            </select>
          </Field>
          {action !== "none" && action !== "contact-form" && (
            <Field label={action === "tel" ? "Phone number" : action === "email" ? "Email address" : action === "scroll" ? "Section anchor ID" : "URL or path"}>
              <TextInput
                value={card.clickTarget ?? ""}
                onChange={v => patch({ clickTarget: v || undefined })}
                placeholder={
                  action === "tel" ? "555-867-5309" :
                  action === "email" ? "info@company.com" :
                  action === "scroll" ? "contact" :
                  action === "page" ? "/services" :
                  "https://"
                }
              />
            </Field>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Card Background Image</p>
          {card.bgImageUrl && (
            <div className="relative rounded overflow-hidden border border-border mb-2">
              <img src={card.bgImageUrl} alt="bg" className="w-full h-24 object-cover" />
              <button
                type="button"
                onClick={() => patch({ bgImageUrl: undefined, bgImageObjectPath: undefined })}
                className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded hover:bg-black/70"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {onOpenMediaLibrary && (
            <button
              type="button"
              onClick={() => onOpenMediaLibrary(url => patch({ bgImageUrl: url }))}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs rounded border border-dashed border-border hover:border-primary hover:text-primary transition-colors text-muted-foreground mb-2"
            >
              <Images className="w-3.5 h-3.5" />
              Choose background image
            </button>
          )}
          {card.bgImageUrl && (
            <div className="grid grid-cols-2 gap-2">
              <ColorInput label="Overlay Color" value={card.bgOverlayColor} onChange={v => patch({ bgOverlayColor: v })} />
              <Field label="Overlay Opacity">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={card.bgOverlayOpacity ?? 0.5}
                  onChange={e => patch({ bgOverlayOpacity: parseFloat(e.target.value) })}
                  className="w-full accent-primary"
                />
                <span className="text-[10px] text-muted-foreground">{Math.round((card.bgOverlayOpacity ?? 0.5) * 100)}%</span>
              </Field>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowDesignOverrides(v => !v)}
            className="w-full flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 hover:text-foreground transition-colors"
          >
            <span>Per-Card Color Overrides</span>
            {showDesignOverrides ? <ChevronDown className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
          </button>
          {showDesignOverrides && (
            <div className="space-y-2">
              <ColorInput label="Card BG Color" value={card.cardBgColor} onChange={v => patch({ cardBgColor: v })} />
              <ColorInput label="Card Border Color" value={card.cardBorderColor} onChange={v => patch({ cardBorderColor: v })} />
              <ColorInput label="Title Color" value={card.cardTitleColor} onChange={v => patch({ cardTitleColor: v })} />
              <ColorInput label="Text Color" value={card.cardTextColor} onChange={v => patch({ cardTextColor: v })} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Tab: Layout ─────────────────────────────────────────────────────────

  function renderLayoutTab() {
    const LAYOUTS: [CardLayout, string, string][] = [
      ["icon-top", "Icon Top", "Icon above title (default)"],
      ["icon-left", "Icon Left", "Icon beside title"],
      ["horizontal", "Horizontal", "Wide feature card"],
      ["image-bg", "Image BG", "Full card background image"],
    ];
    const ALIGNS: [CardTextAlign, string][] = [
      ["left", "Left"],
      ["center", "Center"],
      ["right", "Right"],
    ];

    return (
      <div className="p-3 space-y-3">
        <Field label="Layout Variant">
          <div className="grid grid-cols-2 gap-1">
            {LAYOUTS.map(([v, l, desc]) => (
              <button
                key={v}
                type="button"
                onClick={() => patch({ layout: v })}
                title={desc}
                className={`py-2 px-2 text-xs rounded text-left transition-colors leading-tight ${(card.layout ?? "icon-top") === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Text Alignment">
          <div className="flex gap-1">
            {ALIGNS.map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => patch({ textAlign: v })}
                className={`flex-1 py-1.5 text-xs rounded transition-colors ${(card.textAlign ?? "left") === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </Field>
      </div>
    );
  }

  // ── Tab: Presets ─────────────────────────────────────────────────────────

  function renderPresetsTab() {
    return (
      <div className="p-3 space-y-4">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Style Presets</p>
          <div className="grid grid-cols-3 gap-1.5">
            {CARD_PRESETS.map(preset => {
              const IconComp = LUCIDE_ICON_MAP[preset.iconName] ?? LUCIDE_ICON_MAP["Layers"]!;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => patch(preset.apply)}
                  className="flex flex-col items-center gap-1 py-2 px-1 rounded border border-border hover:border-primary hover:bg-primary/5 text-muted-foreground hover:text-primary transition-colors text-[10px] text-center"
                >
                  <IconComp className="w-4 h-4" />
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Content Templates</p>
          <p className="text-[10px] text-muted-foreground/70 mb-2">Replaces title, description, and media with a ready-made starting point.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {CARD_TEMPLATES.map(tmpl => {
              const IconComp = LUCIDE_ICON_MAP[tmpl.iconName] ?? LUCIDE_ICON_MAP["Wrench"]!;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => patch(tmpl.apply)}
                  className="flex items-center gap-2 py-1.5 px-2 rounded border border-border hover:border-primary hover:bg-primary/5 text-muted-foreground hover:text-primary transition-colors text-xs text-left"
                >
                  <IconComp className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{tmpl.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowTrustPack(v => !v)}
            className="w-full flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors mb-2"
          >
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Trust Card Content Pack
            </span>
            {showTrustPack ? <ChevronDown className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
          </button>
          {showTrustPack && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground/70 mb-2">Quick-fill this card with a trust signal.</p>
              {TRUST_CONTENT_PACK.map(item => {
                const IconComp = LUCIDE_ICON_MAP[item.iconName] ?? LUCIDE_ICON_MAP["Shield"]!;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => patch({
                      title: item.label,
                      description: item.desc,
                      mediaType: "icon",
                      iconName: item.iconName,
                      templateType: "trust",
                    })}
                    className="w-full flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs text-left border border-transparent hover:border-border"
                  >
                    <IconComp className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {(onDuplicate || onDelete) && (
          <div className="border-t border-border pt-3 flex gap-2">
            {onDuplicate && (
              <button
                type="button"
                onClick={onDuplicate}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                Duplicate
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
              >
                Delete Card
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div data-card-editor-panel className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground truncate">{card.title || "Untitled Card"}</span>
          {onClose && (
            <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex border-b border-border flex-shrink-0 bg-card overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`flex-shrink-0 px-2 py-2 text-[10px] font-medium transition-colors ${activeTab === t.id ? "text-foreground border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "content" && renderContentTab()}
        {activeTab === "media" && renderMediaTab()}
        {activeTab === "design" && renderDesignTab()}
        {activeTab === "layout" && renderLayoutTab()}
        {activeTab === "presets" && renderPresetsTab()}
      </div>
    </div>
  );
}
