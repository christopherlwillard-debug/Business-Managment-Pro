import { MapPin } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

export interface MapEmbedContent {
  heading?: string;
  useSiteAddress?: boolean;
  manualAddress?: string;
  height?: number;
  zoom?: number;
}

export function defaultMapEmbedContent(): MapEmbedContent {
  return {
    heading: "Find Us",
    useSiteAddress: true,
    manualAddress: "",
    height: 400,
    zoom: 14,
  };
}

interface MapEmbedSectionProps {
  content: MapEmbedContent;
  settings: { brandColor: string; address?: string };
  isEditing?: boolean;
  onChange?: (content: MapEmbedContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
}

function buildMapSrc(address: string, zoom: number): string {
  const encoded = encodeURIComponent(address.trim());
  return `https://maps.google.com/maps?q=${encoded}&z=${zoom}&output=embed&hl=en`;
}

export function MapEmbedSection({ content, settings, isEditing, onChange, blockStyle }: MapEmbedSectionProps) {
  const c = { ...defaultMapEmbedContent(), ...content };

  function update(patch: Partial<MapEmbedContent>) {
    onChange?.({ ...c, ...patch });
  }

  const resolvedAddress = c.useSiteAddress
    ? (settings.address ?? "")
    : (c.manualAddress ?? "");

  const height = c.height ?? 400;
  const zoom = c.zoom ?? 14;

  const mapSrc = resolvedAddress.trim() ? buildMapSrc(resolvedAddress, zoom) : null;

  const mapEl = mapSrc ? (
    <iframe
      title="Google Map"
      src={mapSrc}
      width="100%"
      height={`${height}px`}
      style={{ border: 0, display: "block", borderRadius: "var(--theme-card-radius, 0.75rem)" }}
      allowFullScreen
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
    />
  ) : (
    <div
      className="flex flex-col items-center justify-center gap-3 bg-muted/30 border border-dashed border-border rounded-xl text-muted-foreground"
      style={{ height: `${height}px` }}
    >
      <MapPin className="w-8 h-8 opacity-30" />
      <p className="text-sm text-center px-6">
        {isEditing
          ? "Enter your business address below to show the map."
          : "Map address not configured."}
      </p>
    </div>
  );

  if (!isEditing) {
    return (
      <BlockStyleWrapper blockStyle={blockStyle} isEditing={false} wrapperClassName="px-6 py-14">
        <div className="max-w-5xl mx-auto">
          {c.heading && (
            <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: "var(--theme-text, #111827)" }}>
              {c.heading}
            </h2>
          )}
          {mapEl}
        </div>
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} isEditing={true} wrapperClassName="px-4 py-2">
      <div onClick={e => e.stopPropagation()} className="space-y-3 bg-card/95 backdrop-blur-sm rounded-xl border border-border p-4 shadow-sm">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Google Map Embed</p>

        <input
          type="text"
          className="w-full text-lg font-bold bg-background border border-border text-foreground rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          placeholder="Section heading (optional)"
          value={c.heading ?? ""}
          onChange={e => update({ heading: e.target.value })}
        />

        {/* Address source */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={c.useSiteAddress ?? true}
              onChange={e => update({ useSiteAddress: e.target.checked })}
              className="rounded accent-primary"
            />
            <span className="text-xs text-foreground">Use business address from site settings</span>
          </label>

          {c.useSiteAddress ? (
            settings.address ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-muted-foreground truncate">{settings.address}</span>
              </div>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5">
                No address set in site settings. Add one there, or enter a manual address below.
              </p>
            )
          ) : (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Manual address override</p>
              <input
                type="text"
                className="w-full text-xs border border-border bg-background text-foreground rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                placeholder="123 Main St, City, State 12345"
                value={c.manualAddress ?? ""}
                onChange={e => update({ manualAddress: e.target.value })}
              />
            </div>
          )}
        </div>

        {/* Map preview */}
        <div className="rounded-xl overflow-hidden border border-border">{mapEl}</div>

        {/* Controls */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Map Height: {height}px</p>
            <input
              type="range" min={200} max={600} step={20}
              className="w-full accent-primary"
              value={height}
              onChange={e => update({ height: parseInt(e.target.value) })}
            />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Zoom Level: {zoom}</p>
            <input
              type="range" min={8} max={20} step={1}
              className="w-full accent-primary"
              value={zoom}
              onChange={e => update({ zoom: parseInt(e.target.value) })}
            />
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground">
          The map uses Google Maps embed — no API key required for basic display. Visitors can interact with the map on the live site.
        </p>
      </div>
    </BlockStyleWrapper>
  );
}
