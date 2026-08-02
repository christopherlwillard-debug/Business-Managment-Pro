import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

export interface DividerContent {
  style?: "solid" | "dashed" | "dotted" | "double" | "decorative";
  color?: string;
  thickness?: number;
  /** Width as a percentage of the container */
  widthPercent?: number;
  paddingTop?: number;
  paddingBottom?: number;
}

export function defaultDividerContent(): DividerContent {
  return {
    style: "solid",
    color: "#e5e7eb",
    thickness: 1,
    widthPercent: 100,
    paddingTop: 16,
    paddingBottom: 16,
  };
}

interface DividerSectionProps {
  content: DividerContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: DividerContent) => void;
  blockStyle?: BlockStyle;
}

const STYLE_OPTIONS = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "double", label: "Double" },
  { value: "decorative", label: "Decorative" },
];

export function DividerSection({ content, settings, isEditing, onChange, blockStyle }: DividerSectionProps) {
  const c = { ...defaultDividerContent(), ...content };

  function update(patch: Partial<DividerContent>) {
    onChange?.({ ...c, ...patch });
  }

  const hrStyle: React.CSSProperties =
    c.style === "decorative"
      ? {
          border: "none",
          height: `${c.thickness ?? 1}px`,
          background: `linear-gradient(to right, transparent, ${c.color ?? "#e5e7eb"}, transparent)`,
          width: `${c.widthPercent ?? 100}%`,
          margin: "0 auto",
        }
      : {
          borderStyle: c.style ?? "solid",
          borderTopWidth: `${c.thickness ?? 1}px`,
          borderColor: c.color ?? "#e5e7eb",
          width: `${c.widthPercent ?? 100}%`,
          borderBottomWidth: 0,
          borderLeftWidth: 0,
          borderRightWidth: 0,
        };

  if (!isEditing) {
    return (
      <BlockStyleWrapper blockStyle={blockStyle} isEditing={false} wrapperClassName="">
        <div style={{ paddingTop: `${c.paddingTop ?? 16}px`, paddingBottom: `${c.paddingBottom ?? 16}px` }}>
          <hr style={hrStyle} />
        </div>
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} isEditing={true} wrapperClassName="px-4 py-2">
      <div onClick={e => e.stopPropagation()} className="space-y-3 bg-card/95 backdrop-blur-sm rounded-xl border border-border p-4 shadow-sm">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Divider</p>

        {/* Preview */}
        <div style={{ paddingTop: `${c.paddingTop ?? 16}px`, paddingBottom: `${c.paddingBottom ?? 16}px` }}>
          <hr style={hrStyle} />
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 gap-3">
          {/* Style */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Line Style</p>
            <select
              className="w-full text-xs border border-border bg-background text-foreground rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
              value={c.style ?? "solid"}
              onChange={e => update({ style: e.target.value as DividerContent["style"] })}
            >
              {STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Color */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Color</p>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                className="w-7 h-7 rounded border border-border cursor-pointer bg-background p-0"
                value={c.color ?? "#e5e7eb"}
                onChange={e => update({ color: e.target.value })}
              />
              <input
                type="text"
                className="flex-1 text-xs border border-border bg-background text-foreground rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary font-mono"
                value={c.color ?? "#e5e7eb"}
                onChange={e => update({ color: e.target.value })}
              />
            </div>
          </div>

          {/* Thickness */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Thickness: {c.thickness ?? 1}px</p>
            <input
              type="range" min={1} max={12} step={1}
              className="w-full accent-primary"
              value={c.thickness ?? 1}
              onChange={e => update({ thickness: parseInt(e.target.value) })}
            />
          </div>

          {/* Width */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Width: {c.widthPercent ?? 100}%</p>
            <input
              type="range" min={10} max={100} step={5}
              className="w-full accent-primary"
              value={c.widthPercent ?? 100}
              onChange={e => update({ widthPercent: parseInt(e.target.value) })}
            />
          </div>

          {/* Padding top */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Space Above: {c.paddingTop ?? 16}px</p>
            <input
              type="range" min={0} max={120} step={4}
              className="w-full accent-primary"
              value={c.paddingTop ?? 16}
              onChange={e => update({ paddingTop: parseInt(e.target.value) })}
            />
          </div>

          {/* Padding bottom */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Space Below: {c.paddingBottom ?? 16}px</p>
            <input
              type="range" min={0} max={120} step={4}
              className="w-full accent-primary"
              value={c.paddingBottom ?? 16}
              onChange={e => update({ paddingBottom: parseInt(e.target.value) })}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => update({ color: settings.brandColor })}
          className="text-xs text-primary hover:underline"
        >
          Use brand color
        </button>
      </div>
    </BlockStyleWrapper>
  );
}
