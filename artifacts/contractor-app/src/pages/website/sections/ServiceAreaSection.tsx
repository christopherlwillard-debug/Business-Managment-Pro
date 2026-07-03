import { Plus, MapPin, X } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { InlineEditableText } from "../InlineEditableText";
import type { SiteSettings } from "../website-types";

export interface ServiceAreaContent {
  heading: string;
  subheading?: string;
  areas: string[];
  ctaText?: string;
  ctaUrl?: string;
}

interface Props {
  content: ServiceAreaContent;
  settings: SiteSettings;
  isEditing?: boolean;
  onChange?: (content: ServiceAreaContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
}

export function ServiceAreaSection({ content, settings: _settings, isEditing, onChange, blockStyle, sectionId }: Props) {
  const sid = sectionId ?? "service-area";

  function update(patch: Partial<ServiceAreaContent>) { onChange?.({ ...content, ...patch }); }
  function addArea() { update({ areas: [...content.areas, "New Location"] }); }
  function updateArea(idx: number, val: string) {
    const next = [...content.areas];
    next[idx] = val;
    update({ areas: next });
  }
  function removeArea(idx: number) {
    update({ areas: content.areas.filter((_, i) => i !== idx) });
  }

  return (
    <BlockStyleWrapper wrapperClassName="py-16 px-6 bg-white dark:bg-gray-900" blockStyle={blockStyle} isEditing={isEditing}>
      <div className="max-w-3xl mx-auto text-center">
        <div className="flex justify-center mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--theme-brand, #2563eb)" }}>
            <MapPin className="w-5 h-5 text-white" />
          </div>
        </div>
        <InlineEditableText
          id={`${sid}-heading`} as="h2" value={content.heading} placeholder="Service Area"
          className="text-3xl font-bold mb-3 w-full text-center"
          style={{ color: "var(--theme-text, #111827)" }}
          onCommit={v => update({ heading: v })}
          disabled={!isEditing}
        />
        {(content.subheading !== undefined || isEditing) && (
          <InlineEditableText
            id={`${sid}-subheading`} as="p" value={content.subheading ?? ""}
            placeholder="Brief description (optional)"
            className="text-base mb-8 w-full text-center"
            style={{ color: "var(--theme-text-muted, #6b7280)" }}
            onCommit={v => update({ subheading: v || undefined })}
            disabled={!isEditing}
          />
        )}

        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {content.areas.map((area, idx) => (
            <div key={idx} className="relative group">
              {isEditing ? (
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-border bg-muted/40">
                  <input
                    value={area}
                    onChange={e => updateArea(idx, e.target.value)}
                    className="text-sm bg-transparent focus:outline-none min-w-0 w-28"
                    style={{ color: "var(--theme-text, #111827)" }}
                  />
                  <button type="button" onClick={() => removeArea(idx)}
                    className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-border bg-muted/40"
                  style={{ color: "var(--theme-text, #111827)" }}>
                  <MapPin className="w-3 h-3 opacity-50" />
                  {area}
                </span>
              )}
            </div>
          ))}
          {isEditing && (
            <button type="button" onClick={addArea}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors">
              <Plus className="w-3 h-3" /> Add Location
            </button>
          )}
        </div>

        {(content.ctaText || isEditing) && (
          <div className="mt-4">
            {isEditing ? (
              <div className="flex flex-col items-center gap-2">
                <input
                  value={content.ctaText ?? ""}
                  onChange={e => update({ ctaText: e.target.value || undefined })}
                  placeholder="CTA button text (optional)"
                  className="text-sm border border-border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary w-52 text-center"
                />
                {content.ctaText && (
                  <input
                    value={content.ctaUrl ?? ""}
                    onChange={e => update({ ctaUrl: e.target.value || undefined })}
                    placeholder="Button URL (e.g. #contact)"
                    className="text-xs border border-border rounded px-3 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary w-52 text-center"
                  />
                )}
              </div>
            ) : content.ctaText ? (
              <a
                href={content.ctaUrl ?? "#contact"}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: "var(--theme-brand, #2563eb)" }}
              >
                {content.ctaText}
              </a>
            ) : null}
          </div>
        )}
      </div>
    </BlockStyleWrapper>
  );
}

export function defaultServiceAreaContent(): ServiceAreaContent {
  return {
    heading: "Our Service Area",
    subheading: "Proudly serving customers across the region.",
    areas: ["Owensboro", "Henderson", "Evansville", "Bowling Green", "Western Kentucky", "Southern Indiana"],
    ctaText: "Request a Free Estimate",
    ctaUrl: "#contact",
  };
}
