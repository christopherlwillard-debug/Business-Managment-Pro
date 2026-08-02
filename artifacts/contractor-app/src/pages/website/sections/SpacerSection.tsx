import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

export interface SpacerContent {
  height?: number;
}

export function defaultSpacerContent(): SpacerContent {
  return { height: 64 };
}

interface SpacerSectionProps {
  content: SpacerContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: SpacerContent) => void;
  blockStyle?: BlockStyle;
}

const PRESETS = [
  { label: "XS", value: 16 },
  { label: "S", value: 32 },
  { label: "M", value: 64 },
  { label: "L", value: 96 },
  { label: "XL", value: 128 },
  { label: "2XL", value: 192 },
];

export function SpacerSection({ content, isEditing, onChange, blockStyle }: SpacerSectionProps) {
  const height = content.height ?? 64;

  function update(patch: Partial<SpacerContent>) {
    onChange?.({ ...content, ...patch });
  }

  if (!isEditing) {
    return (
      <BlockStyleWrapper blockStyle={blockStyle} isEditing={false} wrapperClassName="">
        <div style={{ height: `${height}px` }} aria-hidden="true" />
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} isEditing={true} wrapperClassName="px-4 py-2">
      <div
        onClick={e => e.stopPropagation()}
        className="bg-card/95 backdrop-blur-sm rounded-xl border border-dashed border-border p-4 shadow-sm space-y-3"
      >
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Spacer</p>
          <span className="text-xs font-mono text-primary font-bold">{height}px</span>
        </div>

        {/* Visual spacer preview */}
        <div
          className="w-full rounded bg-muted/40 border border-dashed border-border/60 flex items-center justify-center text-[10px] text-muted-foreground/50 select-none transition-all"
          style={{ height: `${Math.max(24, Math.min(height, 80))}px` }}
        >
          ↕ {height}px gap
        </div>

        {/* Preset buttons */}
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => update({ height: p.value })}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                height === p.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Fine-tune slider */}
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Custom height</p>
          <input
            type="range" min={8} max={400} step={8}
            className="w-full accent-primary"
            value={height}
            onChange={e => update({ height: parseInt(e.target.value) })}
          />
        </div>
      </div>
    </BlockStyleWrapper>
  );
}
