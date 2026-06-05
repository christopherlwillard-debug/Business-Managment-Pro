import { ROW_RATIO_PRESETS, type RowSectionData, type RowColumn } from "./sections/RowSection";

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

const MAX_WIDTH_OPTIONS = [
  { value: "sm", label: "Narrow" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Wide" },
  { value: "xl", label: "X-Wide" },
  { value: "full", label: "Full" },
] as const;

const ALIGN_OPTIONS = [
  { value: "start", label: "Top" },
  { value: "center", label: "Mid" },
  { value: "end", label: "Bot" },
  { value: "stretch", label: "Fill" },
] as const;

interface RowEditorPanelProps {
  data: RowSectionData;
  onChange: (data: RowSectionData) => void;
}

export function RowEditorPanel({ data, onChange }: RowEditorPanelProps) {
  const columns = data.columns ?? [];
  const colCount = columns.length;

  function patch(update: Partial<RowSectionData>) {
    onChange({ ...data, ...update });
  }

  function changeColumnCount(n: number) {
    const newCols: RowColumn[] = Array.from({ length: n }, (_, i) => ({
      ...(columns[i] ?? { id: uid(), components: [] }),
      widthRatio: columns[i]?.widthRatio ?? 1,
    }));
    patch({ columns: newCols });
  }

  function applyPreset(ratios: number[]) {
    const newCols: RowColumn[] = ratios.map((r, i) => ({
      ...(columns[i] ?? { id: uid(), components: [] }),
      widthRatio: r,
    }));
    patch({ columns: newCols });
  }

  const presets = ROW_RATIO_PRESETS[colCount] ?? [];
  const currentRatioKey = JSON.stringify(columns.map(c => c.widthRatio));

  return (
    <div className="flex-shrink-0 border-b border-border">
      <div className="px-3 py-2.5 border-b border-border">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Row Layout</p>
      </div>
      <div className="p-3 space-y-3.5">
        <div>
          <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
            Columns
          </label>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => changeColumnCount(n)}
                className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
                  colCount === n
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {presets.length > 1 && (
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
              Width Ratio
            </label>
            <div className="grid grid-cols-3 gap-1 mb-2">
              {presets.map(preset => {
                const isActive = currentRatioKey === JSON.stringify(preset.ratios);
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyPreset(preset.ratios)}
                    className={`py-1.5 rounded text-[10px] font-semibold transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div className="flex rounded overflow-hidden" style={{ height: 5 }}>
              {columns.map((col, i) => (
                <div
                  key={col.id}
                  style={{ flex: col.widthRatio, backgroundColor: i % 2 === 0 ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.4)" }}
                />
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Gap</label>
            <span className="text-xs font-mono tabular-nums text-foreground">{data.gap ?? 24}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={80}
            value={data.gap ?? 24}
            onChange={e => patch({ gap: Number(e.target.value) })}
            className="w-full h-1.5 appearance-none rounded-full cursor-pointer bg-border accent-primary"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
            Max Width
          </label>
          <div className="flex gap-1 flex-wrap">
            {MAX_WIDTH_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => patch({ maxWidth: opt.value })}
                className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                  (data.maxWidth ?? "lg") === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
            Vertical Align
          </label>
          <div className="flex gap-1">
            {ALIGN_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => patch({ verticalAlign: opt.value })}
                className={`flex-1 py-1.5 rounded text-[10px] font-semibold transition-colors ${
                  (data.verticalAlign ?? "start") === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
