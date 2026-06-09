import { useState } from "react";
import {
  X, Images, ChevronDown, ChevronRight as ChevronRightIcon,
  Eye, EyeOff, Sparkles,
} from "lucide-react";
import { LUCIDE_ICON_MAP } from "./sections/UniversalCard";
import type {
  CardComponent, CardClickAction, CardHoverEffect, CardLayout,
  CardTextAlign, CardMediaType, CardTemplateType, CardIconSize,
  CardBadgePosition,
} from "./website-types";

// ── Quick Templates (shown ABOVE tab strip) ───────────────────────────────────

interface CardTemplate {
  id: CardTemplateType;
  label: string;
  iconName: string;
  apply: Partial<CardComponent>;
}

const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: "service", label: "Service", iconName: "Wrench",
    apply: {
      title: "Our Service", description: "We provide professional, reliable service every time.",
      mediaType: "icon", iconName: "Wrench", layout: "icon-top", hoverEffect: "lift",
      templateType: "service",
    },
  },
  {
    id: "trust", label: "Trust", iconName: "Shield",
    apply: {
      title: "Licensed & Insured", description: "Fully licensed and insured for your peace of mind.",
      mediaType: "icon", iconName: "Shield", layout: "icon-top", textAlign: "center",
      badgeEnabled: true, badgeText: "Licensed & Insured", badgePosition: "top-right",
      hoverEffect: "none",
      templateType: "trust",
    },
  },
  {
    id: "process-step", label: "Process Step", iconName: "CheckCircle2",
    apply: {
      title: "Step 1: Consult", description: "We start with a free on-site consultation.",
      mediaType: "icon", iconName: "CheckCircle2",
      badgeEnabled: true, badgeText: "1", layout: "icon-left",
      templateType: "process-step",
    },
  },
  {
    id: "pricing", label: "Pricing", iconName: "DollarSign",
    apply: {
      title: "Starter Plan", description: "Everything you need to get started.",
      buttonLabel: "Get Started", mediaType: "icon", iconName: "DollarSign",
      layout: "icon-top", textAlign: "center", hoverEffect: "lift",
      templateType: "pricing",
    },
  },
  {
    id: "testimonial", label: "Testimonial", iconName: "Star",
    apply: {
      title: "Happy Customer",
      description: '"This team was incredible — fast, professional, and affordable."',
      mediaType: "icon", iconName: "Star", layout: "icon-top", textAlign: "center",
      templateType: "testimonial",
    },
  },
  {
    id: "team", label: "Team Member", iconName: "Users",
    apply: {
      title: "Team Member", description: "Expert craftsman with 10+ years of experience.",
      mediaType: "image", layout: "icon-top", textAlign: "center",
      templateType: "team",
    },
  },
  {
    id: "certification", label: "Certification", iconName: "Award",
    apply: {
      title: "Certified Professional", description: "Industry-recognized certification demonstrates our commitment to excellence.",
      mediaType: "icon", iconName: "Award", layout: "icon-top", textAlign: "center",
      badgeEnabled: true, badgeText: "Certified", badgePosition: "top-right",
      templateType: "certification",
    },
  },
  {
    id: "portfolio", label: "Portfolio", iconName: "Camera",
    apply: {
      title: "Project Name", description: "A brief description of this project.",
      mediaType: "image", layout: "image-bg",
      templateType: "portfolio",
    },
  },
];

// ── Style Presets ─────────────────────────────────────────────────────────────

interface StylePreset {
  id: string;
  label: string;
  iconName: string;
  apply: Partial<CardComponent>;
}

const STYLE_PRESETS: StylePreset[] = [
  {
    id: "modern", label: "Modern", iconName: "Layers",
    apply: { hoverEffect: "lift", layout: "icon-top", textAlign: "left", cardBgColor: null, cardBorderColor: null },
  },
  {
    id: "contractor", label: "Contractor", iconName: "HardHat",
    apply: { hoverEffect: "lift", layout: "icon-left", textAlign: "left" },
  },
  {
    id: "minimal", label: "Minimal", iconName: "Layers",
    apply: { hoverEffect: "none", layout: "icon-top", textAlign: "center", cardBgColor: null },
  },
  {
    id: "outline", label: "Outline", iconName: "Layers",
    apply: { hoverEffect: "border", layout: "icon-top", textAlign: "left" },
  },
  {
    id: "elevated", label: "Elevated", iconName: "Layers",
    apply: { hoverEffect: "lift", layout: "icon-top", textAlign: "left", cardShadow: "0 8px 24px rgba(0,0,0,0.12)" },
  },
  {
    id: "feature", label: "Feature", iconName: "Star",
    apply: { hoverEffect: "lift", layout: "horizontal", textAlign: "left" },
  },
  {
    id: "image-card", label: "Image Card", iconName: "Camera",
    apply: { hoverEffect: "lift", layout: "image-bg", textAlign: "left" },
  },
  {
    id: "service-tile", label: "Service Tile", iconName: "Wrench",
    apply: { hoverEffect: "none", layout: "icon-left", textAlign: "left" },
  },
  {
    id: "trust", label: "Trust Card", iconName: "Shield",
    apply: { hoverEffect: "none", layout: "icon-top", textAlign: "center" },
  },
];

// ── Trust Content Pack ────────────────────────────────────────────────────────

const TRUST_PACK = [
  { label: "Veteran Owned",         iconName: "Shield",       desc: "Proudly veteran-owned and operated." },
  { label: "Disabled Veteran Owned",iconName: "Award",        desc: "Disabled veteran-owned business committed to service." },
  { label: "SBA Certified",         iconName: "Award",        desc: "Small Business Administration certified contractor." },
  { label: "Licensed & Insured",    iconName: "Shield",       desc: "Fully licensed and insured for your protection." },
  { label: "Bonded",                iconName: "Lock",         desc: "Bonded for your peace of mind on every project." },
  { label: "BBB Accredited",        iconName: "Star",         desc: "A+ rating from the Better Business Bureau." },
  { label: "OSHA Compliant",        iconName: "HardHat",      desc: "OSHA safety standards followed on every job." },
  { label: "Family Owned",          iconName: "Heart",        desc: "Family-owned business serving our community." },
  { label: "5-Star Rated",          iconName: "Star",         desc: "Consistently rated 5 stars by our customers." },
  { label: "24/7 Emergency",        iconName: "Phone",        desc: "Available around the clock for emergency calls." },
  { label: "10,000+ Projects",      iconName: "CheckCircle2", desc: "Over 10,000 successfully completed projects." },
  { label: "Serving Since 2010",    iconName: "Clock",        desc: "Trusted by homeowners since 2010." },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function ColorInput({
  label, value, onChange,
}: { label: string; value?: string | null; onChange: (v: string | null) => void }) {
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
          <button type="button" onClick={() => onChange(null)} className="p-1 text-muted-foreground hover:text-foreground">
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

function TextInput({
  value, onChange, placeholder, multiline,
}: { value?: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  const cls = "w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none";
  if (multiline) {
    return <textarea value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} className={cls} />;
  }
  return <input type="text" value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />;
}

// ── Main panel ────────────────────────────────────────────────────────────────

type EditorTab = "content" | "media" | "design" | "layout" | "presets";

interface CardItemEditorPanelProps {
  card: CardComponent;
  onChange: (card: CardComponent) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onClose?: () => void;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

export function CardItemEditorPanel({
  card, onChange, onDuplicate, onDelete, onClose, onOpenMediaLibrary,
}: CardItemEditorPanelProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("content");
  const [iconSearch, setIconSearch] = useState("");
  const [showTrustPack, setShowTrustPack] = useState(false);
  const [showDesignOverrides, setShowDesignOverrides] = useState(false);

  function patch(p: Partial<CardComponent>) {
    onChange({ ...card, ...p });
  }

  const ICON_NAMES = Object.keys(LUCIDE_ICON_MAP);
  const filteredIcons = ICON_NAMES.filter(k =>
    iconSearch === "" || k.toLowerCase().includes(iconSearch.toLowerCase())
  );

  const TABS: { id: EditorTab; label: string }[] = [
    { id: "content", label: "Content" },
    { id: "media",   label: "Icon/Img" },
    { id: "design",  label: "Design" },
    { id: "layout",  label: "Layout" },
    { id: "presets", label: "Presets" },
  ];

  // ── Content tab ─────────────────────────────────────────────────────────

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
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Analytics</p>
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input type="checkbox" checked={card.trackClicks ?? false} onChange={e => patch({ trackClicks: e.target.checked })} className="w-3.5 h-3.5 accent-primary" />
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
            <input type="checkbox" checked={card.hidden ?? false} onChange={e => patch({ hidden: e.target.checked })} className="w-3.5 h-3.5 accent-primary" />
            <span className="text-xs text-foreground flex items-center gap-1">
              {card.hidden ? <EyeOff className="w-3 h-3 text-muted-foreground" /> : <Eye className="w-3 h-3 text-muted-foreground" />}
              Hide this card
            </span>
          </label>
        </div>
      </div>
    );
  }

  // ── Media tab ────────────────────────────────────────────────────────────

  function renderMediaTab() {
    const mediaType = card.mediaType ?? "icon";
    const iconSize  = card.iconSize  ?? "md";

    return (
      <div className="p-3 space-y-3">
        <Field label="Media Type">
          <div className="flex gap-1">
            {(["none", "icon", "image"] as CardMediaType[]).map(mt => (
              <button key={mt} type="button" onClick={() => patch({ mediaType: mt })}
                className={`flex-1 py-1.5 text-xs rounded capitalize transition-colors ${mediaType === mt ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                {mt === "none" ? "None" : mt === "icon" ? "Icon" : "Image"}
              </button>
            ))}
          </div>
        </Field>

        {mediaType === "icon" && (
          <>
            <Field label="Icon Size">
              <div className="flex gap-1">
                {(["sm", "md", "lg", "xl"] as CardIconSize[]).map(sz => (
                  <button key={sz} type="button" onClick={() => patch({ iconSize: sz })}
                    className={`flex-1 py-1.5 text-xs rounded uppercase transition-colors ${iconSize === sz ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                    {sz}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Search Icons">
              <input type="text" value={iconSearch} onChange={e => setIconSearch(e.target.value)}
                placeholder="Filter icons…"
                className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </Field>
            <div className="grid grid-cols-7 gap-1 max-h-44 overflow-y-auto border border-border rounded p-1 bg-muted/20">
              {filteredIcons.map(key => {
                const IconComp = LUCIDE_ICON_MAP[key]!;
                const isSel = (card.iconName ?? "Wrench") === key;
                return (
                  <button key={key} type="button" onClick={() => patch({ iconName: key })} title={key}
                    className={`p-1.5 rounded flex items-center justify-center transition-colors ${isSel ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}>
                    <IconComp className="w-4 h-4" />
                  </button>
                );
              })}
              {filteredIcons.length === 0 && (
                <p className="col-span-7 text-xs text-muted-foreground text-center py-4">No icons match</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ColorInput label="Icon Color"    value={card.iconColor}   onChange={v => patch({ iconColor: v })} />
              <ColorInput label="Icon BG Color" value={card.iconBgColor} onChange={v => patch({ iconBgColor: v })} />
            </div>
          </>
        )}

        {mediaType === "image" && (
          <>
            <Field label="Image Size">
              <div className="flex gap-1">
                {(["sm", "md", "lg", "xl"] as CardIconSize[]).map(sz => (
                  <button key={sz} type="button" onClick={() => patch({ iconSize: sz })}
                    className={`flex-1 py-1.5 text-xs rounded uppercase transition-colors ${iconSize === sz ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                    {sz}
                  </button>
                ))}
              </div>
            </Field>
            {card.imageUrl && (
              <div className="relative rounded overflow-hidden border border-border">
                <img src={card.imageUrl} alt="preview" className="w-full h-32 object-cover" />
                <button type="button" onClick={() => patch({ imageUrl: undefined, imageObjectPath: undefined })}
                  className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded hover:bg-black/70">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {onOpenMediaLibrary && (
              <button type="button" onClick={() => onOpenMediaLibrary(url => patch({ imageUrl: url }))}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs rounded border border-dashed border-border hover:border-primary hover:text-primary transition-colors text-muted-foreground">
                <Images className="w-3.5 h-3.5" />
                Choose from Media Library
              </button>
            )}
            <Field label="Or paste URL">
              <TextInput value={card.imageUrl ?? ""} onChange={v => patch({ imageUrl: v || undefined })} placeholder="https://…" />
            </Field>
            <Field label="Alt text">
              <TextInput value={card.imageAlt ?? ""} onChange={v => patch({ imageAlt: v || undefined })} placeholder={card.title} />
            </Field>
          </>
        )}
      </div>
    );
  }

  // ── Design tab ───────────────────────────────────────────────────────────

  function renderDesignTab() {
    const action = card.clickAction ?? "none";
    const badgePos = card.badgePosition ?? "top-right";

    return (
      <div className="p-3 space-y-3">

        {/* Hover effect */}
        <Field label="Hover Effect">
          <div className="grid grid-cols-2 gap-1">
            {([["none","None"],["lift","Lift"],["glow","Glow"],["border","Border"]] as [CardHoverEffect,string][]).map(([v,l]) => (
              <button key={v} type="button" onClick={() => patch({ hoverEffect: v })}
                className={`py-1.5 text-xs rounded transition-colors ${(card.hoverEffect ?? "none") === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                {l}
              </button>
            ))}
          </div>
        </Field>

        {/* Click action */}
        <div className="border-t border-border pt-3">
          <Field label="On Click">
            <select value={action} onChange={e => patch({ clickAction: e.target.value as CardClickAction })}
              className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary">
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
            <Field label={action === "tel" ? "Phone number" : action === "email" ? "Email address" : action === "scroll" ? "Anchor ID" : "URL"}>
              <TextInput value={card.clickTarget ?? ""} onChange={v => patch({ clickTarget: v || undefined })}
                placeholder={action === "tel" ? "555-867-5309" : action === "email" ? "info@company.com" : action === "scroll" ? "contact" : "https://"} />
            </Field>
          )}
        </div>

        {/* Badge */}
        <div className="border-t border-border pt-3">
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input type="checkbox" checked={card.badgeEnabled ?? false} onChange={e => patch({ badgeEnabled: e.target.checked })} className="w-3.5 h-3.5 accent-primary" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Show Badge</span>
          </label>
          {card.badgeEnabled && (
            <div className="space-y-2 pl-1">
              <Field label="Badge Text">
                <TextInput value={card.badgeText ?? ""} onChange={v => patch({ badgeText: v || undefined })} placeholder="e.g. Popular, New, #1" />
                {(card.templateType === "trust" || card.templateType === "certification") && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {TRUST_PACK.map(({ label: t }) => (
                      <button key={t} type="button" onClick={() => patch({ badgeText: t })}
                        className={`px-1.5 py-0.5 text-[9px] rounded border transition-colors ${card.badgeText === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
              <Field label="Badge Position">
                <div className="grid grid-cols-2 gap-1">
                  {([["top-left","↖ Top Left"],["top-right","↗ Top Right"],["bottom-left","↙ Bot Left"],["bottom-right","↘ Bot Right"]] as [CardBadgePosition,string][]).map(([v,l]) => (
                    <button key={v} type="button" onClick={() => patch({ badgePosition: v })}
                      className={`py-1 text-[10px] rounded transition-colors ${badgePos === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <ColorInput label="Badge BG"   value={card.badgeColor}   onChange={v => patch({ badgeColor: v })} />
                <ColorInput label="Badge Text" value={card.badgeTextColor} onChange={v => patch({ badgeTextColor: v })} />
              </div>
            </div>
          )}
        </div>

        {/* Card style overrides */}
        <div className="border-t border-border pt-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Card Style</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Field label="Border Width">
              <TextInput value={card.cardBorderWidth ?? ""} onChange={v => patch({ cardBorderWidth: v || null })} placeholder="1px" />
            </Field>
            <Field label="Border Radius">
              <TextInput value={card.cardBorderRadius ?? ""} onChange={v => patch({ cardBorderRadius: v || null })} placeholder="0.75rem" />
            </Field>
          </div>
          <Field label="Shadow">
            <div className="grid grid-cols-4 gap-1 mb-1">
              {[["none","None"],["0 1px 4px rgba(0,0,0,0.08)","Soft"],["0 4px 16px rgba(0,0,0,0.12)","Med"],["0 8px 30px rgba(0,0,0,0.18)","Hard"]].map(([v,l]) => (
                <button key={v} type="button" onClick={() => patch({ cardShadow: v || null })}
                  className={`py-1 text-[10px] rounded transition-colors ${(card.cardShadow ?? null) === (v || null) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                  {l}
                </button>
              ))}
            </div>
            <TextInput value={card.cardShadow ?? ""} onChange={v => patch({ cardShadow: v || null })} placeholder="custom CSS box-shadow" />
          </Field>
          <Field label="Padding">
            <TextInput value={card.cardPadding ?? ""} onChange={v => patch({ cardPadding: v || null })} placeholder="1.5rem (default)" />
          </Field>
        </div>

        {/* Background image */}
        <div className="border-t border-border pt-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Card Background Image</p>
          {card.cardBgImage && (
            <div className="relative rounded overflow-hidden border border-border mb-2">
              <img src={card.cardBgImage} alt="bg" className="w-full h-24 object-cover" />
              <button type="button" onClick={() => patch({ cardBgImage: undefined, cardBgImageObjectPath: undefined })}
                className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded hover:bg-black/70">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {onOpenMediaLibrary && (
            <button type="button" onClick={() => onOpenMediaLibrary(url => patch({ cardBgImage: url }))}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs rounded border border-dashed border-border hover:border-primary hover:text-primary transition-colors text-muted-foreground mb-2">
              <Images className="w-3.5 h-3.5" />
              Choose background image
            </button>
          )}
          {card.cardBgImage && (
            <div className="space-y-2">
              <Field label="BG Position">
                <div className="grid grid-cols-3 gap-1 mb-1">
                  {["top","center","bottom"].map(v => (
                    <button key={v} type="button" onClick={() => patch({ cardBgPosition: v })}
                      className={`py-1 text-[10px] rounded capitalize transition-colors ${(card.cardBgPosition ?? "center") === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                      {v}
                    </button>
                  ))}
                </div>
                <TextInput value={card.cardBgPosition ?? ""} onChange={v => patch({ cardBgPosition: v || undefined })} placeholder="center (default)" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <ColorInput label="Overlay Color" value={card.cardBgOverlayColor} onChange={v => patch({ cardBgOverlayColor: v })} />
                <Field label="Overlay Opacity">
                  <input type="range" min={0} max={1} step={0.05}
                    value={card.cardBgOverlayOpacity ?? 0.5}
                    onChange={e => patch({ cardBgOverlayOpacity: parseFloat(e.target.value) })}
                    className="w-full accent-primary" />
                  <span className="text-[10px] text-muted-foreground">{Math.round((card.cardBgOverlayOpacity ?? 0.5) * 100)}%</span>
                </Field>
              </div>
            </div>
          )}
        </div>

        {/* Per-card color overrides */}
        <div className="border-t border-border pt-3">
          <button type="button" onClick={() => setShowDesignOverrides(v => !v)}
            className="w-full flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors mb-2">
            <span>Per-Card Color Overrides</span>
            {showDesignOverrides ? <ChevronDown className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
          </button>
          {showDesignOverrides && (
            <div className="space-y-2">
              <ColorInput label="Card BG"     value={card.cardBgColor}     onChange={v => patch({ cardBgColor: v })} />
              <ColorInput label="Border Color" value={card.cardBorderColor} onChange={v => patch({ cardBorderColor: v })} />
              <ColorInput label="Title Color" value={card.cardTitleColor}  onChange={v => patch({ cardTitleColor: v })} />
              <ColorInput label="Text Color"  value={card.cardTextColor}   onChange={v => patch({ cardTextColor: v })} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Layout tab ───────────────────────────────────────────────────────────

  function renderLayoutTab() {
    const LAYOUTS: [CardLayout, string, string][] = [
      ["icon-top",    "Icon Top",    "Icon above title (default)"],
      ["icon-left",   "Icon Left",   "Icon beside title"],
      ["horizontal",  "Horizontal",  "Wide feature card"],
      ["image-bg",    "Image BG",    "Full card background image"],
    ];
    const ALIGNS: [CardTextAlign, string][] = [
      ["left", "Left"], ["center", "Center"], ["right", "Right"],
    ];
    return (
      <div className="p-3 space-y-3">
        <Field label="Layout Variant">
          <div className="grid grid-cols-2 gap-1">
            {LAYOUTS.map(([v,l,desc]) => (
              <button key={v} type="button" onClick={() => patch({ layout: v })} title={desc}
                className={`py-2 px-2 text-xs rounded text-left transition-colors leading-tight ${(card.layout ?? "icon-top") === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                {l}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Text Alignment">
          <div className="flex gap-1">
            {ALIGNS.map(([v,l]) => (
              <button key={v} type="button" onClick={() => patch({ textAlign: v })}
                className={`flex-1 py-1.5 text-xs rounded transition-colors ${(card.textAlign ?? "left") === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                {l}
              </button>
            ))}
          </div>
        </Field>
        {/* Visibility rule editing deferred to a future milestone; rule data is persisted and evaluated at public render time */}
      </div>
    );
  }

  // ── Presets tab ──────────────────────────────────────────────────────────

  function renderPresetsTab() {
    return (
      <div className="p-3 space-y-4">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Style Presets</p>
          <div className="grid grid-cols-4 gap-1">
            {STYLE_PRESETS.map(preset => {
              const IconComp = LUCIDE_ICON_MAP[preset.iconName] ?? LUCIDE_ICON_MAP["Layers"]!;
              return (
                <button key={preset.id} type="button" onClick={() => patch(preset.apply)}
                  className="flex flex-col items-center gap-1 py-2 px-1 rounded border border-border hover:border-primary hover:bg-primary/5 text-muted-foreground hover:text-primary transition-colors text-[10px] text-center">
                  <IconComp className="w-4 h-4" />
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <button type="button" onClick={() => setShowTrustPack(v => !v)}
            className="w-full flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors mb-2">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Trust Card Content Pack
            </span>
            {showTrustPack ? <ChevronDown className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
          </button>
          {showTrustPack && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground/70 mb-2">Fills this card with a trust signal.</p>
              {TRUST_PACK.map(item => {
                const IconComp = LUCIDE_ICON_MAP[item.iconName] ?? LUCIDE_ICON_MAP["Shield"]!;
                return (
                  <button key={item.label} type="button"
                    onClick={() => patch({ title: item.label, description: item.desc, mediaType: "icon", iconName: item.iconName, templateType: "trust" })}
                    className="w-full flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs text-left border border-transparent hover:border-border">
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
              <button type="button" onClick={onDuplicate}
                className="flex-1 flex items-center justify-center py-1.5 text-xs rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                Duplicate
              </button>
            )}
            {onDelete && (
              <button type="button" onClick={onDelete}
                className="flex-1 flex items-center justify-center py-1.5 text-xs rounded border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors">
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

      {/* Header */}
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

      {/* ── Quick Templates — always visible above the tab strip ── */}
      <div className="flex-shrink-0 px-2 pt-2 pb-1 border-b border-border bg-muted/30">
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 px-1">Quick Templates</p>
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          {CARD_TEMPLATES.map(tmpl => {
            const IconComp = LUCIDE_ICON_MAP[tmpl.iconName] ?? LUCIDE_ICON_MAP["Wrench"]!;
            const isActive = card.templateType === tmpl.id;
            return (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => patch(tmpl.apply)}
                title={tmpl.label}
                className={`flex-shrink-0 flex flex-col items-center gap-0.5 py-1.5 px-2.5 rounded text-[9px] font-medium transition-colors min-w-[44px] ${isActive ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-primary hover:bg-primary/5 border border-border"}`}
              >
                <IconComp className="w-3.5 h-3.5" />
                {tmpl.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex border-b border-border flex-shrink-0 bg-card overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
            className={`flex-shrink-0 px-2 py-2 text-[10px] font-medium transition-colors ${activeTab === t.id ? "text-foreground border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "content" && renderContentTab()}
        {activeTab === "media"   && renderMediaTab()}
        {activeTab === "design"  && renderDesignTab()}
        {activeTab === "layout"  && renderLayoutTab()}
        {activeTab === "presets" && renderPresetsTab()}
      </div>
    </div>
  );
}
