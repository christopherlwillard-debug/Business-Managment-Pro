import { useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import type { BlockStyle } from "./sections/BlockStyleWrapper";

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border pb-4 mb-4 last:border-0 last:mb-0">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  unit = "px",
  onChange,
}: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const v = value ?? min;
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1.5">
        <label className="text-xs text-muted-foreground">{label}</label>
        <span className="text-xs font-mono text-foreground tabular-nums">
          {v}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={v}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 appearance-none rounded-full cursor-pointer bg-border accent-primary"
      />
    </div>
  );
}

interface SectionStylePanelProps {
  sectionId: string;
  sectionType: string;
  blockStyle: BlockStyle;
  onChange: (bs: BlockStyle) => void;
  onBgImageUpload?: (file: File) => void;
  isBgUploading?: boolean;
}

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero Banner",
  services: "Services",
  about: "About Us",
  contact: "Contact / Quote Form",
  footer: "Footer",
  portfolio: "Portfolio / Gallery",
  deposit: "Pay Deposit",
  content: "Content Block",
};

export function SectionStylePanel({
  sectionId: _sectionId,
  sectionType,
  blockStyle,
  onChange,
  onBgImageUpload,
  isBgUploading,
}: SectionStylePanelProps) {
  const [tab, setTab] = useState<"style" | "advanced">("style");
  const bs = blockStyle;

  function patch(update: Partial<BlockStyle>) {
    onChange({ ...bs, ...update });
  }

  const bgType = bs.bgType ?? "color";

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b border-border flex-shrink-0">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Section Style</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{SECTION_LABELS[sectionType] ?? sectionType}</p>
      </div>

      <div className="flex border-b border-border flex-shrink-0">
        {(["style", "advanced"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t
                ? "text-foreground border-b-2 border-primary -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "style" ? (
          <>
            <PanelSection title="Background">
              <div className="flex gap-1 mb-3">
                {(["color", "image", "gradient"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => patch({ bgType: t })}
                    className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors capitalize ${
                      bgType === t
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {bgType === "color" && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={bs.bgColor ?? "#ffffff"}
                    onChange={(e) => patch({ bgColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent flex-shrink-0"
                  />
                  <input
                    type="text"
                    value={bs.bgColor ?? ""}
                    onChange={(e) => patch({ bgColor: e.target.value })}
                    placeholder="#ffffff"
                    className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-background font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {bs.bgColor && (
                    <button
                      onClick={() => patch({ bgColor: undefined })}
                      className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                      title="Clear"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {bgType === "image" && (
                <>
                  {bs.bgImageUrl && (
                    <div className="relative mb-2 rounded-lg overflow-hidden h-24 bg-muted">
                      <img src={bs.bgImageUrl} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => patch({ bgImageUrl: undefined, bgImageObjectPath: undefined })}
                        className="absolute top-1 right-1 p-0.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <label
                    className={`flex items-center justify-center gap-1.5 w-full text-xs border border-border rounded px-2 py-2 cursor-pointer transition-colors hover:bg-muted mb-2 ${
                      isBgUploading ? "opacity-60 pointer-events-none" : ""
                    }`}
                  >
                    {isBgUploading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ImagePlus className="w-3 h-3" />
                    )}
                    {isBgUploading
                      ? "Uploading…"
                      : bs.bgImageUrl
                      ? "Replace Image"
                      : "Upload Image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={isBgUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onBgImageUpload?.(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <input
                    type="text"
                    value={bs.bgImageObjectPath ? "" : (bs.bgImageUrl ?? "")}
                    placeholder="Or paste image URL"
                    onChange={(e) => patch({ bgImageUrl: e.target.value, bgImageObjectPath: undefined })}
                    className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </>
              )}

              {bgType === "gradient" && (
                <>
                  <div className="flex gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] text-muted-foreground block mb-1">From</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="color"
                          value={bs.bgGradientFrom ?? "#1a1a2e"}
                          onChange={(e) => patch({ bgGradientFrom: e.target.value })}
                          className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent flex-shrink-0"
                        />
                        <input
                          type="text"
                          value={bs.bgGradientFrom ?? ""}
                          onChange={(e) => patch({ bgGradientFrom: e.target.value })}
                          className="flex-1 min-w-0 text-[10px] border border-border rounded px-1 py-1 bg-background font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] text-muted-foreground block mb-1">To</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="color"
                          value={bs.bgGradientTo ?? "#4a4a8a"}
                          onChange={(e) => patch({ bgGradientTo: e.target.value })}
                          className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent flex-shrink-0"
                        />
                        <input
                          type="text"
                          value={bs.bgGradientTo ?? ""}
                          onChange={(e) => patch({ bgGradientTo: e.target.value })}
                          className="flex-1 min-w-0 text-[10px] border border-border rounded px-1 py-1 bg-background font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>
                  <SliderRow
                    label="Angle"
                    value={bs.bgGradientAngle}
                    min={0}
                    max={360}
                    unit="°"
                    onChange={(v) => patch({ bgGradientAngle: v })}
                  />
                  {bs.bgGradientFrom && bs.bgGradientTo && (
                    <div
                      className="w-full h-8 rounded-lg mt-1"
                      style={{
                        backgroundImage: `linear-gradient(${bs.bgGradientAngle ?? 135}deg, ${bs.bgGradientFrom}, ${bs.bgGradientTo})`,
                      }}
                    />
                  )}
                </>
              )}
            </PanelSection>

            {(bgType === "image" || bgType === "gradient") && (
              <PanelSection title="Overlay">
                <div className="flex items-center gap-2 mb-3">
                  <label className="text-xs text-muted-foreground w-14 flex-shrink-0">Color</label>
                  <input
                    type="color"
                    value={bs.overlayColor ?? "#000000"}
                    onChange={(e) => patch({ overlayColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent"
                  />
                </div>
                <SliderRow
                  label="Opacity"
                  value={Math.round((bs.overlayOpacity ?? 0) * 100)}
                  min={0}
                  max={90}
                  unit="%"
                  onChange={(v) => patch({ overlayOpacity: v / 100 })}
                />
              </PanelSection>
            )}

            <PanelSection title="Spacing">
              <SliderRow
                label="Padding Top"
                value={bs.paddingTop}
                min={0}
                max={200}
                onChange={(v) => patch({ paddingTop: v })}
              />
              <SliderRow
                label="Padding Bottom"
                value={bs.paddingBottom}
                min={0}
                max={200}
                onChange={(v) => patch({ paddingBottom: v })}
              />
              <SliderRow
                label="Padding Left"
                value={bs.paddingLeft}
                min={0}
                max={100}
                onChange={(v) => patch({ paddingLeft: v })}
              />
              <SliderRow
                label="Padding Right"
                value={bs.paddingRight}
                min={0}
                max={100}
                onChange={(v) => patch({ paddingRight: v })}
              />
              <SliderRow
                label="Margin Top"
                value={bs.marginTop}
                min={0}
                max={200}
                onChange={(v) => patch({ marginTop: v || undefined })}
              />
              <SliderRow
                label="Margin Bottom"
                value={bs.marginBottom}
                min={0}
                max={200}
                onChange={(v) => patch({ marginBottom: v || undefined })}
              />
              <SliderRow
                label="Min Height"
                value={bs.minHeight}
                min={0}
                max={800}
                onChange={(v) => patch({ minHeight: v || undefined })}
              />
            </PanelSection>

            <PanelSection title="Decoration">
              <div className="mb-3">
                <label className="text-xs text-muted-foreground block mb-2">Shadow</label>
                <div className="flex gap-1 flex-wrap">
                  {(["none", "sm", "md", "lg", "xl"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => patch({ shadow: s })}
                      className={`px-2 py-1 text-xs rounded capitalize transition-colors ${
                        (bs.shadow ?? "none") === s
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <SliderRow
                label="Border Radius"
                value={bs.borderRadius}
                min={0}
                max={48}
                onChange={(v) => patch({ borderRadius: v || undefined })}
              />
            </PanelSection>

            <PanelSection title="Animation">
              <p className="text-[10px] text-muted-foreground mb-2">
                Entrance animation — plays on the live site when the section scrolls into view
              </p>
              <div className="grid grid-cols-2 gap-1">
                {(
                  [
                    { value: "none", label: "None" },
                    { value: "fadeIn", label: "Fade In" },
                    { value: "slideUp", label: "Slide Up" },
                    { value: "slideLeft", label: "Slide Left" },
                  ] as const
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => patch({ animation: value })}
                    className={`py-1.5 text-xs rounded transition-colors ${
                      (bs.animation ?? "none") === value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </PanelSection>

            <button
              onClick={() => onChange({})}
              className="w-full text-xs text-muted-foreground hover:text-destructive text-center py-2 hover:bg-muted rounded transition-colors mt-1"
            >
              Reset all styles
            </button>
          </>
        ) : (
          <>
            <PanelSection title="Visibility">
              <div className="space-y-3">
                {(
                  [
                    { key: "hideOnMobile", label: "Hide on Mobile" },
                    { key: "hideOnTablet", label: "Hide on Tablet" },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <label className="text-xs text-foreground">{label}</label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={!!bs[key]}
                        onChange={(e) => patch({ [key]: e.target.checked })}
                      />
                      <div className="w-8 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
                    </label>
                  </div>
                ))}
              </div>
            </PanelSection>

            <PanelSection title="Custom CSS Class">
              <input
                type="text"
                value={bs.customClass ?? ""}
                onChange={(e) => patch({ customClass: e.target.value })}
                placeholder="e.g. my-custom-section"
                className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Applied to the section's outer wrapper element</p>
            </PanelSection>
          </>
        )}
      </div>
    </div>
  );
}
