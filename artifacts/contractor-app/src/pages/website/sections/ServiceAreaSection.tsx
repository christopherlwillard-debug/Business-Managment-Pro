import { Plus, MapPin, X } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { InlineEditableText } from "../InlineEditableText";
import type { SiteSettings } from "../website-types";
import { USMap } from "./USMap";
import { STATE_CODE_TO_NAME, buildCaption, migrateAreas } from "./USMapData";

export interface ServiceAreaContent {
  heading: string;
  subheading?: string;
  /** Freeform text entries (e.g. "Nationwide Travel", "Remote Consulting") */
  areas: string[];
  /** USPS two-letter state codes (e.g. ["KY","IN","IL"]) */
  selectedStates?: string[];
  ctaText?: string;
  ctaUrl?: string;
  /** "map" | "list" | "both" — default "both" */
  displayMode?: "map" | "list" | "both";
  captionText?: string;
  captionHidden?: boolean;
  mapStyle?: "outline" | "filled" | "minimal" | "modern";
  showLabels?: boolean;
  showBorders?: boolean;
  highlightColor?: string;
}

interface Props {
  content: ServiceAreaContent;
  settings: SiteSettings;
  isEditing?: boolean;
  onChange?: (content: ServiceAreaContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
}

export function ServiceAreaSection({
  content,
  settings,
  isEditing,
  onChange,
  blockStyle,
  sectionId,
}: Props) {
  const sid = sectionId ?? "service-area";

  // ── Migration: promote matching state names from areas → selectedStates ──
  const migrated = migrateAreas(content.areas ?? []);
  const selectedStates: string[] = content.selectedStates ?? migrated.selectedStates;
  const freeformAreas: string[] = content.selectedStates !== undefined
    ? (content.areas ?? [])
    : migrated.areas;

  const displayMode = content.displayMode ?? "both";
  const mapStyle = content.mapStyle ?? "outline";
  const showLabels = content.showLabels !== false;
  const showBorders = content.showBorders !== false;
  const highlightColor = content.highlightColor ?? settings.brandColor;

  // Auto-caption from selected states
  const autoCaption = buildCaption(selectedStates);
  const caption = content.captionText || autoCaption;

  function update(patch: Partial<ServiceAreaContent>) {
    onChange?.({ ...content, ...patch });
  }

  function toggleState(code: string) {
    const next = selectedStates.includes(code)
      ? selectedStates.filter(c => c !== code)
      : [...selectedStates, code];
    update({ selectedStates: next });
  }

  function addArea() {
    update({ areas: [...freeformAreas, "New Location"] });
  }

  function updateArea(idx: number, val: string) {
    const next = [...freeformAreas];
    next[idx] = val;
    update({ areas: next });
  }

  function removeArea(idx: number) {
    update({ areas: freeformAreas.filter((_, i) => i !== idx) });
  }

  const showMap = displayMode === "map" || displayMode === "both";
  const showList = displayMode === "list" || displayMode === "both";

  // All items to show in the list (state names + freeform)
  const listItems: string[] = [
    ...selectedStates.map(c => STATE_CODE_TO_NAME[c] ?? c),
    ...freeformAreas,
  ].sort((a, b) => a.localeCompare(b));

  return (
    <BlockStyleWrapper
      wrapperClassName="py-16 px-6 bg-white dark:bg-gray-900"
      blockStyle={blockStyle}
      isEditing={isEditing}
    >
      <div className="max-w-4xl mx-auto text-center">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: highlightColor }}
          >
            <MapPin className="w-5 h-5 text-white" />
          </div>
        </div>

        {/* Heading */}
        <InlineEditableText
          id={`${sid}-heading`}
          as="h2"
          value={content.heading}
          placeholder="Coverage Map"
          className="text-3xl font-bold mb-3 w-full text-center"
          style={{ color: "var(--theme-text, #111827)" }}
          onCommit={v => update({ heading: v })}
          disabled={!isEditing}
        />

        {/* Subheading */}
        {(content.subheading !== undefined || isEditing) && (
          <InlineEditableText
            id={`${sid}-subheading`}
            as="p"
            value={content.subheading ?? ""}
            placeholder="Brief description (optional)"
            className="text-base mb-8 w-full text-center"
            style={{ color: "var(--theme-text-muted, #6b7280)" }}
            onCommit={v => update({ subheading: v || undefined })}
            disabled={!isEditing}
          />
        )}

        {/* SVG Map */}
        {showMap && (
          <div className="mb-4">
            <USMap
              selectedStates={selectedStates}
              onToggleState={isEditing ? toggleState : undefined}
              highlightColor={highlightColor}
              showLabels={showLabels}
              showBorders={showBorders}
              mapStyle={mapStyle}
              className="max-w-2xl mx-auto"
            />

            {/* Caption */}
            {!content.captionHidden && caption && (
              <p
                className="text-sm mt-3 italic"
                style={{ color: "var(--theme-text-muted, #6b7280)" }}
              >
                {caption}
              </p>
            )}
          </div>
        )}

        {/* State pill list */}
        {showList && listItems.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mb-8 mt-4">
            {listItems.map((item, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-border bg-muted/40"
                style={{ color: "var(--theme-text, #111827)" }}
              >
                <MapPin className="w-3 h-3 opacity-50" />
                {item}
              </span>
            ))}
          </div>
        )}

        {/* Editing: freeform areas management */}
        {isEditing && (
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {freeformAreas.map((area, idx) => (
              <div key={idx} className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-border bg-muted/20">
                <input
                  value={area}
                  onChange={e => updateArea(idx, e.target.value)}
                  className="text-sm bg-transparent focus:outline-none min-w-0 w-28"
                  style={{ color: "var(--theme-text, #111827)" }}
                />
                <button
                  type="button"
                  onClick={() => removeArea(idx)}
                  className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addArea}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
            >
              <Plus className="w-3 h-3" /> Add Custom Area
            </button>
          </div>
        )}

        {/* CTA */}
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
                style={{ backgroundColor: highlightColor }}
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
    heading: "Our Coverage Map",
    subheading: "Proudly serving customers across the region.",
    areas: [],
    selectedStates: ["KY", "IN", "IL", "TN", "OH"],
    displayMode: "both",
    mapStyle: "outline",
    showLabels: true,
    showBorders: true,
    ctaText: "Request a Free Estimate",
    ctaUrl: "#contact",
  };
}
