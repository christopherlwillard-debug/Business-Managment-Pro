import React, { useState, useRef, useCallback } from "react";
import { Plus, Trash2, Type, Image as ImageIcon, MousePointer, Minus, Loader2, Upload } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { TextStyleToolbar, textStyleToCSS, type TextStyle } from "./TextStyleToolbar";
import { ButtonEditor, buttonConfigToStyle, buttonConfigToClasses, type ButtonConfig } from "./ButtonEditor";

export interface TextBlock {
  type: "text";
  id: string;
  content: string;
  style?: TextStyle;
}

export interface ImageBlock {
  type: "image";
  id: string;
  url?: string;
  objectPath?: string;
  alt?: string;
}

export interface ButtonBlock {
  type: "button";
  id: string;
  label: string;
  config?: ButtonConfig;
}

export interface DividerBlock {
  type: "divider";
  id: string;
  color?: string;
  thickness?: number;
}

export type ColumnBlock = TextBlock | ImageBlock | ButtonBlock | DividerBlock;

export interface ColumnDef {
  id: string;
  blocks: ColumnBlock[];
  /** Grid span (1–11) out of 12; all column spans should sum to 12 */
  span?: number;
}

export interface ColumnsContent {
  columnCount?: number;
  columns: ColumnDef[];
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/** Assign equal 12-grid spans when any column is missing a span value */
function migrateSpans(columns: ColumnDef[], count: number): ColumnDef[] {
  const sliced = columns.slice(0, count);
  const hasAllSpans = sliced.length > 0 && sliced.every(c => typeof c.span === "number" && c.span > 0);
  if (hasAllSpans) return sliced;
  const base = Math.floor(12 / count);
  const remainder = 12 - base * count;
  return sliced.map((col, i) => ({
    ...col,
    span: base + (i < remainder ? 1 : 0),
  }));
}

/** Redistribute columns to equal spans for a given count, preserving existing column data */
function equalSpans(columns: ColumnDef[], count: number): ColumnDef[] {
  const base = Math.floor(12 / count);
  const remainder = 12 - base * count;
  return columns.slice(0, count).map((col, i) => ({
    ...col,
    span: base + (i < remainder ? 1 : 0),
  }));
}

export function defaultColumnsContent(): ColumnsContent {
  return {
    columnCount: 2,
    columns: [
      {
        id: uid(),
        span: 6,
        blocks: [
          { type: "text", id: uid(), content: "Your heading here", style: { fontWeight: "700", fontSize: "1.5rem" } },
          { type: "text", id: uid(), content: "Edit this text to describe your services, share your story, or highlight a key message.", style: {} },
        ],
      },
      {
        id: uid(),
        span: 6,
        blocks: [
          { type: "image", id: uid(), url: "", alt: "Column image" },
        ],
      },
    ],
  };
}

interface ColumnsSectionProps {
  content: ColumnsContent;
  settings: { brandColor: string; accentColor?: string; secondaryColor?: string };
  isEditing?: boolean;
  onChange?: (content: ColumnsContent) => void;
  blockStyle?: BlockStyle;
  onImageUpload?: (colId: string, blockId: string, file: File) => Promise<void>;
  uploadingImageKeys?: Set<string>;
  onBeforeAction?: () => void;
}

function renderBlock(
  block: ColumnBlock,
  settings: { brandColor: string; accentColor?: string },
) {
  switch (block.type) {
    case "text":
      return (
        <p
          className="text-gray-800 leading-relaxed"
          style={textStyleToCSS(block.style)}
          dangerouslySetInnerHTML={{ __html: block.content.replace(/\n/g, "<br/>") }}
        />
      );
    case "image":
      return block.url ? (
        <img
          src={block.url}
          alt={block.alt || ""}
          className="w-full rounded-lg object-cover max-h-96"
        />
      ) : (
        <div className="w-full h-48 rounded-lg bg-gray-100 flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-gray-300" />
        </div>
      );
    case "button": {
      const bStyle = buttonConfigToStyle(block.config);
      const bClasses = buttonConfigToClasses(block.config);
      const bg = bStyle.backgroundColor ?? settings.accentColor ?? settings.brandColor;
      const color = bStyle.color ?? "white";
      const radius = bStyle.borderRadius ?? "var(--theme-btn-radius, 9999px)";
      return (
        <a
          href={block.config?.url || "#contact"}
          target={block.config?.newTab ? "_blank" : undefined}
          rel={block.config?.newTab ? "noopener noreferrer" : undefined}
          className={`inline-block transition-opacity hover:opacity-90 ${bClasses}`}
          style={{
            backgroundColor: bg,
            color,
            borderRadius: radius,
            fontWeight: "var(--theme-btn-font-weight, 600)" as React.CSSProperties["fontWeight"],
            boxShadow: "var(--theme-btn-shadow, none)",
          }}
        >
          {block.label || "Click here"}
        </a>
      );
    }
    case "divider":
      return (
        <hr
          style={{
            borderColor: block.color || "#e5e7eb",
            borderTopWidth: block.thickness ?? 1,
          }}
          className="my-2"
        />
      );
    default:
      return null;
  }
}

function BlockTypeIcon({ type }: { type: ColumnBlock["type"] }) {
  switch (type) {
    case "text": return <Type className="w-3 h-3" />;
    case "image": return <ImageIcon className="w-3 h-3" />;
    case "button": return <MousePointer className="w-3 h-3" />;
    case "divider": return <Minus className="w-3 h-3" />;
  }
}

interface BlockEditorProps {
  block: ColumnBlock;
  onUpdate: (b: ColumnBlock) => void;
  onDelete: () => void;
  onImageUpload?: (file: File) => Promise<void>;
  uploadingKey?: string;
  uploadingImageKeys?: Set<string>;
}

function BlockEditor({ block, onUpdate, onDelete, onImageUpload, uploadingKey, uploadingImageKeys }: BlockEditorProps) {
  const isUploading = uploadingKey ? uploadingImageKeys?.has(uploadingKey) : false;

  return (
    <div className="rounded border border-dashed border-white/30 bg-black/20 p-2 text-white space-y-1.5" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 text-[10px] font-semibold text-white/70 uppercase tracking-wide">
          <BlockTypeIcon type={block.type} />
          {block.type}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="p-0.5 rounded text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-colors"
          title="Delete block"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {block.type === "text" && (
        <>
          <textarea
            className="w-full text-xs bg-white/10 border border-white/20 text-white placeholder-white/30 rounded px-2 py-1.5 outline-none focus:border-white/50 resize-none"
            rows={3}
            value={block.content}
            placeholder="Enter your text…"
            onChange={e => onUpdate({ ...block, content: e.target.value })}
          />
          <TextStyleToolbar
            style={block.style}
            onChange={s => onUpdate({ ...block, style: s })}
            dark
          />
        </>
      )}

      {block.type === "image" && (
        <div className="space-y-1.5">
          {block.url && (
            <img src={block.url} alt={block.alt || ""} className="w-full h-24 object-cover rounded" />
          )}
          <label className={`flex items-center justify-center gap-1.5 w-full text-[11px] border border-white/30 rounded px-2 py-1.5 cursor-pointer transition-colors hover:bg-white/10 ${isUploading ? "opacity-60 pointer-events-none" : ""}`}>
            {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            {isUploading ? "Uploading…" : block.url ? "Replace Image" : "Upload Image"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={isUploading}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f && onImageUpload) onImageUpload(f);
                e.target.value = "";
              }}
            />
          </label>
          <input
            type="text"
            className="w-full text-[11px] bg-white/10 border border-white/20 text-white placeholder-white/30 rounded px-2 py-1 outline-none focus:border-white/50"
            placeholder="Or paste image URL…"
            value={block.url || ""}
            onChange={e => onUpdate({ ...block, url: e.target.value })}
          />
          <input
            type="text"
            className="w-full text-[11px] bg-white/10 border border-white/20 text-white placeholder-white/30 rounded px-2 py-1 outline-none focus:border-white/50"
            placeholder="Alt text (for accessibility)"
            value={block.alt || ""}
            onChange={e => onUpdate({ ...block, alt: e.target.value })}
          />
        </div>
      )}

      {block.type === "button" && (
        <div className="space-y-1">
          <input
            type="text"
            className="w-full text-[11px] bg-white/10 border border-white/20 text-white placeholder-white/30 rounded px-2 py-1.5 outline-none focus:border-white/50"
            placeholder="Button label"
            value={block.label}
            onChange={e => onUpdate({ ...block, label: e.target.value })}
          />
          <ButtonEditor config={block.config} onChange={cfg => onUpdate({ ...block, config: cfg })} />
        </div>
      )}

      {block.type === "divider" && (
        <div className="flex gap-2 items-center">
          <label className="text-[10px] text-white/60">Color</label>
          <input
            type="color"
            value={block.color || "#e5e7eb"}
            onChange={e => onUpdate({ ...block, color: e.target.value })}
            className="w-6 h-6 rounded cursor-pointer border border-white/20 bg-transparent p-0"
          />
          <label className="text-[10px] text-white/60 ml-2">Thickness</label>
          <input
            type="number"
            min={1}
            max={8}
            value={block.thickness ?? 1}
            onChange={e => onUpdate({ ...block, thickness: Number(e.target.value) })}
            className="w-12 text-[11px] bg-white/10 border border-white/20 text-white rounded px-2 py-0.5 outline-none"
          />
        </div>
      )}
    </div>
  );
}

// ─── Column Divider (drag-resize handle) ───────────────────────────────────

interface ColumnDividerProps {
  leftSpan: number;
  rightSpan: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSpanChange: (newLeft: number, newRight: number) => void;
  onBeforeAction?: () => void;
}

function ColumnDivider({ leftSpan, rightSpan, containerRef, onSpanChange, onBeforeAction }: ColumnDividerProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    onBeforeAction?.();

    const startX = e.clientX;
    const containerWidth = containerRef.current?.offsetWidth ?? 800;
    const startLeft = leftSpan;
    const startRight = rightSpan;
    const pairTotal = startLeft + startRight; // locked during this drag

    setIsDragging(true);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const rawDelta = (dx / containerWidth) * 12;
      const spanDelta = Math.round(rawDelta);
      const newLeft = Math.max(1, Math.min(startLeft + spanDelta, pairTotal - 1));
      const newRight = pairTotal - newLeft;
      onSpanChange(newLeft, newRight);
    };

    const onUp = () => {
      setIsDragging(false);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [leftSpan, rightSpan, containerRef, onSpanChange, onBeforeAction]);

  return (
    <div
      className={`flex-shrink-0 w-5 self-stretch flex items-center justify-center cursor-col-resize select-none group relative z-10 ${isDragging ? "opacity-100" : ""}`}
      onPointerDown={handlePointerDown}
      title="Drag to resize columns"
    >
      {/* Vertical line */}
      <div
        className={`w-0.5 h-full min-h-[40px] rounded-full transition-all duration-150 ${
          isDragging ? "bg-white/90 w-1" : "bg-white/25 group-hover:bg-white/70"
        }`}
      />
      {/* Resize arrows indicator */}
      <div
        className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-150 ${
          isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <div className="bg-slate-700/90 text-white/90 rounded px-1 py-0.5 text-[9px] font-medium leading-none shadow-md">
          ⟷
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ColumnsSection({
  content,
  settings,
  isEditing,
  onChange,
  blockStyle,
  onImageUpload,
  uploadingImageKeys,
  onBeforeAction,
}: ColumnsSectionProps) {
  const [activeColId, setActiveColId] = useState<string | null>(null);
  const [showAddBlock, setShowAddBlock] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const count = Math.max(1, Math.min(4, content.columnCount ?? 2));
  // Run migration on every render — ensures existing saved data gets spans assigned
  const columns = migrateSpans(content.columns ?? [], count);

  function update(patch: Partial<ColumnsContent>) {
    onChange?.({ ...content, ...patch });
  }

  function changeColumnCount(n: number) {
    const extended: ColumnDef[] = [...(content.columns ?? [])];
    while (extended.length < n) {
      extended.push({ id: uid(), blocks: [] });
    }
    // Always redistribute spans equally when changing count
    update({ columnCount: n, columns: equalSpans(extended, n) });
  }

  function updateColumnSpan(colId: string, newSpan: number) {
    const colIdx = columns.findIndex(c => c.id === colId);
    if (colIdx === -1) return;

    const otherCount = count - 1;
    // Target span: at least 1, at most leave room for 1 per remaining column
    const targetSpan = Math.max(1, Math.min(Math.round(newSpan), 12 - otherCount));
    const remaining = 12 - targetSpan; // always >= otherCount

    if (otherCount === 0) {
      // Single column — always full width
      update({ columns: [{ ...columns[0], span: 12 }, ...(content.columns ?? []).slice(1)] });
      return;
    }

    // Weights from current other-column spans
    const otherCols = columns.slice(0, count).filter((_, i) => i !== colIdx);
    const totalWeight = otherCols.reduce((s, c) => s + (c.span ?? 1), 0) || 1;

    // Largest-remainder allocation: each gets at minimum 1, surplus distributed
    // by weight. This guarantees sum === remaining and every value >= 1.
    const surplus = remaining - otherCount; // >= 0
    const rawSurplus = otherCols.map(c => ((c.span ?? 1) / totalWeight) * surplus);
    const floorSurplus = rawSurplus.map(s => Math.floor(s));
    let leftover = surplus - floorSurplus.reduce((a, b) => a + b, 0);

    // Give leftover units to columns with the largest fractional parts
    const fracs = rawSurplus
      .map((s, i) => ({ i, frac: s - Math.floor(s) }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < leftover; k++) {
      floorSurplus[fracs[k].i]++;
    }

    const allocatedSpans = floorSurplus.map(s => 1 + s); // minimum 1 + surplus share

    // Rebuild the column array preserving order
    let otherIdx = 0;
    const newCols = columns.slice(0, count).map((col, i) => {
      if (i === colIdx) return { ...col, span: targetSpan };
      return { ...col, span: allocatedSpans[otherIdx++] };
    });

    update({ columns: [...newCols, ...(content.columns ?? []).slice(count)] });
  }

  function updateColumn(colId: string, blocks: ColumnBlock[]) {
    update({ columns: columns.map(c => c.id === colId ? { ...c, blocks } : c) });
  }

  function addBlock(colId: string, type: ColumnBlock["type"]) {
    const id = uid();
    const newBlock: ColumnBlock =
      type === "text" ? { type, id, content: "Add your text here…", style: {} } :
      type === "image" ? { type, id, url: "", alt: "" } :
      type === "button" ? { type, id, label: "Learn More" } :
      { type: "divider", id };
    const col = columns.find(c => c.id === colId);
    if (col) updateColumn(colId, [...col.blocks, newBlock]);
    setShowAddBlock(null);
  }

  function updateBlock(colId: string, blockId: string, updated: ColumnBlock) {
    const col = columns.find(c => c.id === colId);
    if (col) updateColumn(colId, col.blocks.map(b => b.id === blockId ? updated : b));
  }

  function deleteBlock(colId: string, blockId: string) {
    const col = columns.find(c => c.id === colId);
    if (col) updateColumn(colId, col.blocks.filter(b => b.id !== blockId));
  }

  // ─── View mode ────────────────────────────────────────────────────────────
  const viewGridTemplate = columns.map(c => `${c.span ?? Math.round(12 / count)}fr`).join(" ");

  if (!isEditing) {
    return (
      <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-6 py-12" isEditing={false}>
        <div className="max-w-5xl mx-auto">
          {/* Desktop: proportional grid using span-based fr units */}
          <div
            className="hidden md:grid gap-8 items-start"
            style={{ gridTemplateColumns: viewGridTemplate }}
          >
            {columns.map(col => (
              <div key={col.id} className="space-y-4 min-w-0">
                {col.blocks.map(block => (
                  <div key={block.id}>
                    {renderBlock(block, settings)}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {/* Mobile: single-column stack */}
          <div className="flex flex-col gap-8 md:hidden">
            {columns.map(col => (
              <div key={col.id} className="space-y-4">
                {col.blocks.map(block => (
                  <div key={block.id}>
                    {renderBlock(block, settings)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </BlockStyleWrapper>
    );
  }

  // ─── Edit mode ─────────────────────────────────────────────────────────────
  return (
    <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-4 py-8" isEditing={true} defaultBg="#1e293b">
      <div onClick={e => e.stopPropagation()}>
        {/* Column count selector */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wide">Columns:</span>
          {[1, 2, 3, 4].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => changeColumnCount(n)}
              className={`px-3 py-1 rounded text-xs font-semibold border transition-colors ${
                count === n
                  ? "bg-white text-gray-900 border-white"
                  : "text-white/70 border-white/30 hover:border-white hover:text-white"
              }`}
            >
              {n}
            </button>
          ))}
          {/* Span summary */}
          <span className="ml-auto text-[10px] text-white/40 font-mono">
            {columns.slice(0, count).map(c => c.span).join(" + ")} = 12
          </span>
        </div>

        {/* Columns row with drag dividers */}
        <div
          ref={containerRef}
          className="flex items-stretch"
          style={{ gap: 0 }}
        >
          {columns.slice(0, count).map((col, i) => {
            const isActive = activeColId === col.id;
            const span = col.span ?? Math.round(12 / count);
            return (
              <React.Fragment key={col.id}>
                {/* Column */}
                <div
                  style={{ flexGrow: span, flexShrink: 1, flexBasis: 0, minWidth: 60 }}
                  className={`rounded-lg border-2 transition-all cursor-pointer min-h-[80px] p-3 space-y-2 ${
                    isActive ? "border-white/70 bg-white/5" : "border-white/20 hover:border-white/40"
                  }`}
                  onClick={() => setActiveColId(col.id)}
                >
                  {/* Column header with span badge */}
                  <div className="flex items-center justify-between mb-1 select-none">
                    <span className="text-[9px] font-semibold text-white/30 uppercase tracking-wide">Col {i + 1}</span>
                    {isActive ? (
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <span className="text-[9px] text-white/50">Width:</span>
                        <input
                          type="number"
                          min={1}
                          max={12 - (count - 1)}
                          value={span}
                          onChange={e => updateColumnSpan(col.id, Number(e.target.value))}
                          className="w-8 text-[10px] bg-white/10 border border-white/30 text-white rounded px-1 py-0 outline-none focus:border-white/60 text-center"
                          title="Column width in grid units (1–11 out of 12)"
                        />
                        <span className="text-[9px] text-white/40">/12</span>
                      </div>
                    ) : (
                      <span className="text-[9px] text-white/30 font-mono">{span}/12</span>
                    )}
                  </div>

                  {col.blocks.map(block => (
                    isActive ? (
                      <BlockEditor
                        key={block.id}
                        block={block}
                        onUpdate={updated => updateBlock(col.id, block.id, updated)}
                        onDelete={() => deleteBlock(col.id, block.id)}
                        onImageUpload={onImageUpload ? (file) => onImageUpload(col.id, block.id, file) : undefined}
                        uploadingKey={`${col.id}:${block.id}`}
                        uploadingImageKeys={uploadingImageKeys}
                      />
                    ) : (
                      <div key={block.id} className="pointer-events-none opacity-90">
                        {block.type === "text" && (
                          <p className="text-white text-xs truncate" style={textStyleToCSS(block.style)}>
                            {block.content}
                          </p>
                        )}
                        {block.type === "image" && (
                          block.url
                            ? <img src={block.url} alt="" className="w-full h-20 object-cover rounded" />
                            : <div className="w-full h-20 rounded bg-white/10 flex items-center justify-center"><ImageIcon className="w-5 h-5 text-white/30" /></div>
                        )}
                        {block.type === "button" && (
                          <span className="inline-block text-xs px-3 py-1 rounded-full bg-white/20 text-white">{block.label || "Button"}</span>
                        )}
                        {block.type === "divider" && (
                          <hr style={{ borderColor: block.color || "#e5e7eb", borderTopWidth: block.thickness ?? 1 }} />
                        )}
                      </div>
                    )
                  ))}

                  {isActive && (
                    <div className="pt-1">
                      {showAddBlock === col.id ? (
                        <div className="flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
                          {(["text", "image", "button", "divider"] as const).map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => addBlock(col.id, t)}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-white/20 text-white hover:bg-white/30 transition-colors"
                            >
                              <BlockTypeIcon type={t} />
                              {t[0].toUpperCase() + t.slice(1)}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setShowAddBlock(null)}
                            className="px-2 py-1 rounded text-[10px] text-white/50 hover:text-white transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowAddBlock(col.id)}
                          className="flex items-center gap-1 text-[11px] text-white/60 hover:text-white transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Add block
                        </button>
                      )}
                    </div>
                  )}

                  {!isActive && col.blocks.length === 0 && (
                    <p className="text-white/30 text-xs text-center py-4">Click to add content</p>
                  )}
                </div>

                {/* Drag divider between columns */}
                {i < count - 1 && (
                  <ColumnDivider
                    leftSpan={columns[i].span ?? Math.round(12 / count)}
                    rightSpan={columns[i + 1].span ?? Math.round(12 / count)}
                    containerRef={containerRef}
                    onSpanChange={(newLeft, newRight) => {
                      const newCols = columns.slice(0, count).map((c, j) => {
                        if (j === i) return { ...c, span: newLeft };
                        if (j === i + 1) return { ...c, span: newRight };
                        return c;
                      });
                      update({ columns: [...newCols, ...(content.columns ?? []).slice(count)] });
                    }}
                    onBeforeAction={onBeforeAction}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </BlockStyleWrapper>
  );
}
