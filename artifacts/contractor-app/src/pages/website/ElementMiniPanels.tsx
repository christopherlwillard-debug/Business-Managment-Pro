/**
 * ElementMiniPanels.tsx
 * Focused, element-specific inspector mini-panels for the website editor.
 * Shown in InspectorPanel when a sub-element is selected via double-click
 * drill-down, or as a compact section panel when nothing specific is selected.
 */

import { ImagePlus, Loader2, Images, ChevronDown } from "lucide-react";
import type { BlockStyle } from "./sections/BlockStyleWrapper";

// ── Shared helpers ────────────────────────────────────────────────────────────

const FONT_OPTIONS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins",
  "Playfair Display", "Merriweather", "Georgia", "Times New Roman", "Arial", "Helvetica",
];

const FONT_WEIGHT_OPTIONS: [string, string][] = [
  ["300", "Light"], ["400", "Regular"], ["500", "Medium"],
  ["600", "Semi Bold"], ["700", "Bold"], ["800", "Extra Bold"], ["900", "Black"],
];

function SliderRow({ label, value, min, max, unit = "px", onChange }: {
  label: string; value: number | undefined; min: number; max: number;
  unit?: string; onChange: (v: number) => void;
}) {
  const v = value ?? min;
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1.5">
        <label className="text-xs text-muted-foreground">{label}</label>
        <span className="text-xs font-mono tabular-nums text-foreground">{v}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={v}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 appearance-none rounded-full cursor-pointer bg-border accent-primary" />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" className="sr-only peer" checked={checked}
        onChange={e => onChange(e.target.checked)} />
      <div className="w-8 h-4 bg-muted peer-focus:outline-none rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
    </label>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="text-xs text-muted-foreground block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ColorRow({ label, value, onChange }: {
  label: string; value: string | undefined; onChange: (v: string) => void;
}) {
  return (
    <FieldRow label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={value || "#000000"} onChange={e => onChange(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent flex-shrink-0" />
        <input type="text" value={value ?? ""} onChange={e => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono" />
      </div>
    </FieldRow>
  );
}

/** The "Advanced →" chevron at the bottom of every mini-panel. */
export function AdvancedToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2.5 border-t border-border hover:bg-muted/50 transition-colors text-xs font-medium text-muted-foreground hover:text-foreground mt-1 -mx-3 rounded-none">
      <span>{open ? "Hide advanced" : "Advanced settings →"}</span>
      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

// ── Content field resolver ────────────────────────────────────────────────────

/** Returns the text value and a setter that returns the updated content object
 *  for a given sub-element type + section type combination. */
function resolveTextField(
  sectionType: string,
  subType: string,
  content: Record<string, unknown>,
): { value: string; setter: (v: string) => Record<string, unknown> } | null {
  const headingKeys: Record<string, string> = {
    hero: "headline", cta: "heading", about: "heading", services: "heading",
    "why-choose-us": "heading", "meet-owner": "heading", process: "heading",
    stats: "heading", "trust-counter": "heading", "business-hours": "heading",
    testimonials: "heading", faq: "heading", text: "heading", columns: "heading",
    "sticky-cta": "heading", "alert-bar": "text",
  };
  const subheadingKeys: Record<string, string> = {
    hero: "subheadline", cta: "subheading", about: "subheading", services: "subheading",
    "why-choose-us": "subheading", "meet-owner": "subheading", process: "subheading",
    stats: "subheading", testimonials: "subheading", faq: "subheading", text: "body",
  };
  const buttonTextKeys: Record<string, string> = {
    hero: "ctaLabel", cta: "buttonText", services: "ctaText",
    "sticky-cta": "buttonText", "alert-bar": "buttonText",
  };

  let key: string | undefined;
  if (subType === "heading") key = headingKeys[sectionType];
  else if (subType === "subheading") key = subheadingKeys[sectionType];
  else if (subType === "button") key = buttonTextKeys[sectionType];

  if (!key || !(key in content)) return null;
  const value = (content[key] as string) ?? "";
  return { value, setter: (v: string) => ({ ...content, [key!]: v }) };
}

// ── Button link helpers ───────────────────────────────────────────────────────
// HeroSection uses content.ctaButton (ButtonConfig) for its CTA href.
// Other sections use a flat string field.

function getButtonLinkValue(sectionType: string, content: Record<string, unknown>): string {
  if (sectionType === "hero") {
    const ctaBtn = (content.ctaButton as Record<string, unknown>) ?? {};
    return (ctaBtn.url as string) ?? "";
  }
  const flatKeys: Record<string, string> = {
    cta: "buttonUrl", services: "ctaUrl", "sticky-cta": "buttonUrl", "alert-bar": "buttonUrl",
  };
  return (content[flatKeys[sectionType] ?? "ctaUrl"] as string) ?? "";
}

function setButtonLinkValue(
  sectionType: string,
  content: Record<string, unknown>,
  url: string,
): Record<string, unknown> {
  if (sectionType === "hero") {
    const ctaBtn = (content.ctaButton as Record<string, unknown>) ?? {};
    return { ...content, ctaButton: { ...ctaBtn, url } };
  }
  const flatKeys: Record<string, string> = {
    cta: "buttonUrl", services: "ctaUrl", "sticky-cta": "buttonUrl", "alert-bar": "buttonUrl",
  };
  return { ...content, [flatKeys[sectionType] ?? "ctaUrl"]: url };
}

// ── Footer contact block helpers ─────────────────────────────────────────────
// Footer stores contact data in content.columns[] → ContactBlock column →
// props.{ phone: { show, value }, email: { show, value }, ... }
// These helpers read and write through that nested path.

type ContactFieldEntry = { show?: boolean; value?: string; label?: string };

function getContactFieldEntry(
  subType: string,
  content: Record<string, unknown>,
): ContactFieldEntry {
  const columns = (content.columns as Array<Record<string, unknown>>) ?? [];
  for (const col of columns) {
    if (col.component === "ContactBlock") {
      const props = (col.props as Record<string, unknown>) ?? {};
      return (props[subType] as ContactFieldEntry) ?? {};
    }
  }
  return {};
}

function setContactFieldEntry(
  subType: string,
  content: Record<string, unknown>,
  updates: Partial<ContactFieldEntry>,
): Record<string, unknown> {
  const columns = (content.columns as Array<Record<string, unknown>>) ?? [];
  const newColumns = columns.map(col => {
    if (col.component !== "ContactBlock") return col;
    const props = (col.props as Record<string, unknown>) ?? {};
    const existing = (props[subType] as ContactFieldEntry) ?? {};
    return { ...col, props: { ...props, [subType]: { ...existing, ...updates } } };
  });
  // If no ContactBlock column existed, content is returned unchanged (graceful no-op)
  return { ...content, columns: newColumns };
}

// ── Shared props interface ────────────────────────────────────────────────────

export interface MiniPanelProps {
  bs: BlockStyle;
  patch: (p: Partial<BlockStyle>) => void;
  content: Record<string, unknown>;
  onChangeContent: (content: Record<string, unknown>) => void;
  sectionType: string;
  sectionEnabled: boolean;
  onToggleSection: () => void;
  onOpenMediaLibrary: (cb: (url: string) => void) => void;
  onBgImageUpload: (file: File) => void;
  isBgUploading: boolean;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
}

// ── HeadingElementPanel ───────────────────────────────────────────────────────

export function HeadingElementPanel({
  subType, bs, patch, content, onChangeContent, sectionType,
  sectionEnabled, onToggleSection, advancedOpen, onToggleAdvanced,
}: MiniPanelProps & { subType: string }) {
  const tf = resolveTextField(sectionType, subType, content);
  const textFieldLabel =
    subType === "heading" ? "Heading Text"
    : subType === "subheading" ? "Subheading Text"
    : subType === "tagline" ? "Tagline"
    : subType === "copyright" ? "Copyright Text"
    : "Text";

  return (
    <div className="p-3">
      {tf && (
        <FieldRow label={textFieldLabel}>
          <textarea rows={2} value={tf.value}
            onChange={e => onChangeContent(tf.setter(e.target.value))}
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
        </FieldRow>
      )}

      <ColorRow label="Text Color" value={bs.textColor}
        onChange={v => patch({ textColor: v })} />

      <FieldRow label="Font Family">
        <select value={bs.fontFamily ?? ""} onChange={e => patch({ fontFamily: e.target.value || undefined })}
          className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          style={{ fontFamily: bs.fontFamily || "inherit" }}>
          <option value="">Inherit theme font</option>
          {FONT_OPTIONS.map(fn => (
            <option key={fn} value={fn} style={{ fontFamily: fn }}>{fn}</option>
          ))}
        </select>
      </FieldRow>

      <div className="flex gap-2">
        <div className="flex-1">
          <FieldRow label="Size (px)">
            <input type="number" min={10} max={120} value={bs.fontSize ?? ""}
              onChange={e => patch({ fontSize: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder="Auto"
              className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
          </FieldRow>
        </div>
        <div className="flex-1">
          <FieldRow label="Weight">
            <select value={bs.fontWeight ?? ""} onChange={e => patch({ fontWeight: e.target.value || undefined })}
              className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Auto</option>
              {FONT_WEIGHT_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </FieldRow>
        </div>
      </div>

      <FieldRow label="Alignment">
        <div className="flex gap-1">
          {(["left", "center", "right"] as const).map(a => (
            <button key={a} type="button" onClick={() => patch({ alignment: a })}
              className={`flex-1 py-1 text-xs rounded capitalize transition-colors ${(bs.alignment ?? "left") === a ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              {a}
            </button>
          ))}
        </div>
      </FieldRow>

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">Section visible</span>
        <Toggle checked={sectionEnabled} onChange={onToggleSection} />
      </div>

      <AdvancedToggle open={advancedOpen} onToggle={onToggleAdvanced} />
    </div>
  );
}

// ── ButtonElementPanel ────────────────────────────────────────────────────────

export function ButtonElementPanel({
  bs, patch, content, onChangeContent, sectionType,
  sectionEnabled, onToggleSection, advancedOpen, onToggleAdvanced,
}: MiniPanelProps) {
  const tf = resolveTextField(sectionType, "button", content);
  const urlValue = getButtonLinkValue(sectionType, content);

  return (
    <div className="p-3">
      {tf && (
        <FieldRow label="Button Label">
          <input type="text" value={tf.value}
            onChange={e => onChangeContent(tf.setter(e.target.value))}
            placeholder="Click Here"
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
        </FieldRow>
      )}

      <FieldRow label="Link URL">
        <input type="text" value={urlValue}
          onChange={e => onChangeContent(setButtonLinkValue(sectionType, content, e.target.value))}
          placeholder="https://…"
          className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
      </FieldRow>

      <ColorRow label="Button Color" value={bs.accentColor}
        onChange={v => patch({ accentColor: v })} />

      <SliderRow label="Button Border Radius" value={bs.borderRadius} min={0} max={48}
        onChange={v => patch({ borderRadius: v || undefined })} />

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">Section visible</span>
        <Toggle checked={sectionEnabled} onChange={onToggleSection} />
      </div>

      <AdvancedToggle open={advancedOpen} onToggle={onToggleAdvanced} />
    </div>
  );
}

// ── ContactElementPanel (phone, email, address, hours, badge) ─────────────────

export function ContactElementPanel({
  subType, bs, patch, content, onChangeContent,
  sectionEnabled, onToggleSection, advancedOpen, onToggleAdvanced,
}: MiniPanelProps & { subType: string }) {
  // Footer contact data lives in content.columns[] → ContactBlock.props.<field>
  const entry = getContactFieldEntry(subType, content);
  const currentValue = entry.value ?? "";
  const isEnabled = entry.show !== false;

  const labelMap: Record<string, string> = {
    phone: "Phone Number", email: "Email Address", address: "Address",
    hours: "Business Hours", licenseNumber: "License Number",
    emergencyNumber: "Emergency Line", badge: "Badge Text",
  };
  const label = labelMap[subType] ?? "Contact Field";

  const hasContactBlock = (content.columns as Array<Record<string, unknown>> | undefined)
    ?.some(col => col.component === "ContactBlock") ?? false;

  return (
    <div className="p-3">
      <FieldRow label={label}>
        <input
          type={subType === "email" ? "email" : subType === "phone" || subType === "emergencyNumber" ? "tel" : "text"}
          value={currentValue}
          onChange={e => onChangeContent(setContactFieldEntry(subType, content, { value: e.target.value }))}
          placeholder={`Enter ${label.toLowerCase()}…`}
          className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
      </FieldRow>

      {hasContactBlock && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground">Show {label.toLowerCase()}</span>
          <Toggle checked={isEnabled}
            onChange={v => onChangeContent(setContactFieldEntry(subType, content, { show: v }))} />
        </div>
      )}

      <ColorRow label="Icon & Text Color" value={bs.textColor}
        onChange={v => patch({ textColor: v })} />

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">Section visible</span>
        <Toggle checked={sectionEnabled} onChange={onToggleSection} />
      </div>

      <AdvancedToggle open={advancedOpen} onToggle={onToggleAdvanced} />
    </div>
  );
}

// ── BackgroundElementPanel ────────────────────────────────────────────────────

export function BackgroundElementPanel({
  bs, patch, onOpenMediaLibrary, onBgImageUpload, isBgUploading,
  sectionEnabled, onToggleSection, advancedOpen, onToggleAdvanced,
}: MiniPanelProps) {
  const bgType = bs.bgType ?? "color";

  return (
    <div className="p-3">
      <FieldRow label="Background Type">
        <div className="flex gap-1">
          {(["color", "image", "gradient"] as const).map(t => (
            <button key={t} type="button" onClick={() => patch({ bgType: t })}
              className={`flex-1 py-1.5 text-xs rounded border capitalize transition-colors ${bgType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
              {t}
            </button>
          ))}
        </div>
      </FieldRow>

      {bgType === "color" && (
        <ColorRow label="Background Color" value={bs.bgColor}
          onChange={v => patch({ bgColor: v, bgType: "color" })} />
      )}

      {bgType === "image" && (
        <>
          {bs.bgImageUrl && (
            <div className="mb-2 rounded overflow-hidden h-16 bg-muted">
              <img src={bs.bgImageUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex gap-1 mb-3">
            <label className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs border border-border rounded cursor-pointer hover:bg-muted transition-colors ${isBgUploading ? "opacity-60 pointer-events-none" : ""}`}>
              {isBgUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
              {isBgUploading ? "Uploading…" : "Upload"}
              <input type="file" accept="image/*" className="sr-only" disabled={isBgUploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) onBgImageUpload(f); e.target.value = ""; }} />
            </label>
            <button type="button" onClick={() => onOpenMediaLibrary(url => patch({ bgImageUrl: url, bgType: "image" }))}
              className="flex items-center gap-1 px-2 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">
              <Images className="w-3 h-3" /> Library
            </button>
          </div>
          <FieldRow label="Overlay">
            <div className="flex items-center gap-2">
              <input type="color" value={bs.overlayColor || "#000000"}
                onChange={e => patch({ overlayColor: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer border border-border flex-shrink-0" />
              <input type="range" min={0} max={90} value={Math.round((bs.overlayOpacity ?? 0) * 100)}
                onChange={e => patch({ overlayOpacity: parseInt(e.target.value) / 100 })}
                className="flex-1 h-1.5 appearance-none rounded-full cursor-pointer accent-primary" />
              <span className="text-xs tabular-nums w-8 text-right text-muted-foreground">
                {Math.round((bs.overlayOpacity ?? 0) * 100)}%
              </span>
            </div>
          </FieldRow>
        </>
      )}

      {bgType === "gradient" && (
        <>
          <div className="flex gap-2 mb-2">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground block mb-1">From</label>
              <input type="color" value={bs.bgGradientFrom || "#3b82f6"}
                onChange={e => patch({ bgGradientFrom: e.target.value, bgType: "gradient" })}
                className="w-full h-8 rounded cursor-pointer border border-border" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground block mb-1">To</label>
              <input type="color" value={bs.bgGradientTo || "#8b5cf6"}
                onChange={e => patch({ bgGradientTo: e.target.value, bgType: "gradient" })}
                className="w-full h-8 rounded cursor-pointer border border-border" />
            </div>
          </div>
          <SliderRow label="Angle" value={bs.bgGradientAngle ?? 135} min={0} max={360} unit="°"
            onChange={v => patch({ bgGradientAngle: v, bgType: "gradient" })} />
        </>
      )}

      <SliderRow label="Padding Top" value={bs.paddingTop} min={0} max={200}
        onChange={v => patch({ paddingTop: v || undefined })} />
      <SliderRow label="Padding Bottom" value={bs.paddingBottom} min={0} max={200}
        onChange={v => patch({ paddingBottom: v || undefined })} />

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">Section visible</span>
        <Toggle checked={sectionEnabled} onChange={onToggleSection} />
      </div>

      <AdvancedToggle open={advancedOpen} onToggle={onToggleAdvanced} />
    </div>
  );
}

// ── ImageElementPanel (image, logo) ──────────────────────────────────────────

export function ImageElementPanel({
  bs, patch, content, onChangeContent, sectionType,
  onOpenMediaLibrary,
  sectionEnabled, onToggleSection, advancedOpen, onToggleAdvanced,
}: MiniPanelProps) {
  // Try to find a logo/image URL directly in section content
  const contentImageKey = "logoUrl" in content ? "logoUrl"
    : "imageUrl" in content ? "imageUrl"
    : "photoUrl" in content ? "photoUrl"
    : null;
  const contentImageUrl = contentImageKey ? (content[contentImageKey] as string | undefined) : undefined;
  const isLogo = sectionType === "footer" || sectionType === "header";

  return (
    <div className="p-3">
      <FieldRow label={isLogo ? "Logo Image" : "Image"}>
        {(contentImageUrl || bs.bgImageUrl) && (
          <div className="mb-2 rounded overflow-hidden h-12 bg-muted flex items-center justify-center px-2">
            <img src={contentImageUrl ?? bs.bgImageUrl} alt=""
              className="max-h-full max-w-full object-contain" />
          </div>
        )}
        <button type="button"
          onClick={() => onOpenMediaLibrary(url => {
            if (contentImageKey) {
              onChangeContent({ ...content, [contentImageKey]: url });
            } else {
              patch({ bgImageUrl: url, bgType: "image" });
            }
          })}
          className="w-full flex items-center justify-center gap-1.5 text-xs border border-border rounded px-2 py-1.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <Images className="w-3 h-3" />
          {(contentImageUrl || bs.bgImageUrl) ? "Replace Image" : "Choose Image"}
        </button>
      </FieldRow>

      <SliderRow label="Border Radius" value={bs.borderRadius} min={0} max={48}
        onChange={v => patch({ borderRadius: v || undefined })} />

      <SliderRow label="Section Padding" value={bs.paddingTop} min={0} max={120}
        onChange={v => patch({ paddingTop: v || undefined, paddingBottom: v || undefined })} />

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">Section visible</span>
        <Toggle checked={sectionEnabled} onChange={onToggleSection} />
      </div>

      <AdvancedToggle open={advancedOpen} onToggle={onToggleAdvanced} />
    </div>
  );
}

// ── SectionCompactPanel ───────────────────────────────────────────────────────
// Shown when a whole section is selected but no sub-element is drilled into.

export function SectionCompactPanel({
  bs, patch, sectionEnabled, onToggleSection,
  onOpenMediaLibrary, onBgImageUpload, isBgUploading,
  advancedOpen, onToggleAdvanced,
}: MiniPanelProps) {
  const bgType = bs.bgType ?? "color";

  return (
    <div className="p-3">
      {/* Background quick-pick */}
      <FieldRow label="Background">
        <div className="flex gap-1 mb-2">
          {(["color", "image", "gradient"] as const).map(t => (
            <button key={t} type="button" onClick={() => patch({ bgType: t })}
              className={`flex-1 py-1 text-[10px] rounded border capitalize transition-colors ${bgType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
              {t}
            </button>
          ))}
        </div>

        {bgType === "color" && (
          <div className="flex items-center gap-2">
            <input type="color" value={bs.bgColor || "#ffffff"}
              onChange={e => patch({ bgColor: e.target.value, bgType: "color" })}
              className="w-7 h-7 rounded cursor-pointer border border-border flex-shrink-0" />
            <input type="text" value={bs.bgColor ?? ""} placeholder="Inherit"
              onChange={e => patch({ bgColor: e.target.value, bgType: "color" })}
              className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none font-mono" />
          </div>
        )}

        {bgType === "image" && (
          <>
            {bs.bgImageUrl && (
              <div className="mb-1.5 rounded overflow-hidden h-12 bg-muted">
                <img src={bs.bgImageUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex gap-1">
              <label className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs border border-border rounded cursor-pointer hover:bg-muted transition-colors ${isBgUploading ? "opacity-60 pointer-events-none" : ""}`}>
                {isBgUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                {isBgUploading ? "Uploading…" : "Upload"}
                <input type="file" accept="image/*" className="sr-only" disabled={isBgUploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) onBgImageUpload(f); e.target.value = ""; }} />
              </label>
              <button type="button"
                onClick={() => onOpenMediaLibrary(url => patch({ bgImageUrl: url, bgType: "image" }))}
                className="flex items-center gap-1 px-2 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">
                <Images className="w-3 h-3" /> Library
              </button>
            </div>
          </>
        )}

        {bgType === "gradient" && (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground block mb-1">From</label>
              <input type="color" value={bs.bgGradientFrom || "#3b82f6"}
                onChange={e => patch({ bgGradientFrom: e.target.value, bgType: "gradient" })}
                className="w-full h-7 rounded cursor-pointer border border-border" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground block mb-1">To</label>
              <input type="color" value={bs.bgGradientTo || "#8b5cf6"}
                onChange={e => patch({ bgGradientTo: e.target.value, bgType: "gradient" })}
                className="w-full h-7 rounded cursor-pointer border border-border" />
            </div>
          </div>
        )}
      </FieldRow>

      <SliderRow label="Padding Top" value={bs.paddingTop} min={0} max={200}
        onChange={v => patch({ paddingTop: v || undefined })} />
      <SliderRow label="Padding Bottom" value={bs.paddingBottom} min={0} max={200}
        onChange={v => patch({ paddingBottom: v || undefined })} />

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">Section visible</span>
        <Toggle checked={sectionEnabled} onChange={onToggleSection} />
      </div>

      <AdvancedToggle open={advancedOpen} onToggle={onToggleAdvanced} />
    </div>
  );
}

// ── Element mini-panel router ─────────────────────────────────────────────────

/** Routes to the correct mini-panel based on the selected sub-element type. */
export function ElementMiniPanelRouter({
  subElementType, ...props
}: MiniPanelProps & { subElementType: string }) {
  const textTypes = new Set(["heading", "subheading", "paragraph", "tagline", "copyright"]);
  const contactTypes = new Set(["phone", "email", "address", "hours", "badge", "contact", "licenseNumber", "emergencyNumber"]);
  const imageTypes = new Set(["image", "logo"]);

  if (textTypes.has(subElementType)) {
    return <HeadingElementPanel subType={subElementType} {...props} />;
  }
  if (subElementType === "button") {
    return <ButtonElementPanel {...props} />;
  }
  if (contactTypes.has(subElementType)) {
    return <ContactElementPanel subType={subElementType} {...props} />;
  }
  if (subElementType === "background") {
    return <BackgroundElementPanel {...props} />;
  }
  if (imageTypes.has(subElementType)) {
    return <ImageElementPanel {...props} />;
  }
  // Fallback: show compact section panel for unknown element types
  return <SectionCompactPanel {...props} />;
}
