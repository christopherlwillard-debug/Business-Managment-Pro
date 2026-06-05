import React, { useState } from "react";
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
}

export interface ColumnsContent {
  columnCount?: number;
  columns: ColumnDef[];
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function defaultColumnsContent(): ColumnsContent {
  return {
    columnCount: 2,
    columns: [
      {
        id: uid(),
        blocks: [
          { type: "text", id: uid(), content: "Your heading here", style: { fontWeight: "700", fontSize: "1.5rem" } },
          { type: "text", id: uid(), content: "Edit this text to describe your services, share your story, or highlight a key message.", style: {} },
        ],
      },
      {
        id: uid(),
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
}

const MD_GRID_COLS: Record<number, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
};

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

export function ColumnsSection({
  content,
  settings,
  isEditing,
  onChange,
  blockStyle,
  onImageUpload,
  uploadingImageKeys,
}: ColumnsSectionProps) {
  const [activeColId, setActiveColId] = useState<string | null>(null);
  const [showAddBlock, setShowAddBlock] = useState<string | null>(null);

  const count = Math.max(1, Math.min(4, content.columnCount ?? 2));
  const columns = content.columns ?? [];

  function update(patch: Partial<ColumnsContent>) {
    onChange?.({ ...content, ...patch });
  }

  function changeColumnCount(n: number) {
    const newCols = [...columns];
    while (newCols.length < n) {
      newCols.push({ id: uid(), blocks: [] });
    }
    update({ columnCount: n, columns: newCols.slice(0, n) });
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

  const mdCols = MD_GRID_COLS[count] ?? "md:grid-cols-2";

  if (!isEditing) {
    return (
      <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-6 py-12" isEditing={false}>
        <div className="max-w-5xl mx-auto">
          <div className={`grid grid-cols-1 ${mdCols} gap-8 items-start`}>
            {columns.slice(0, count).map(col => (
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
        </div>

        {/* Columns grid */}
        <div className={`grid grid-cols-1 ${mdCols} gap-4 items-start`}>
          {columns.slice(0, count).map(col => {
            const isActive = activeColId === col.id;
            return (
              <div
                key={col.id}
                onClick={() => setActiveColId(col.id)}
                className={`rounded-lg border-2 transition-all cursor-pointer min-h-[80px] p-3 space-y-2 ${
                  isActive ? "border-white/70 bg-white/5" : "border-white/20 hover:border-white/40"
                }`}
              >
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
            );
          })}
        </div>
      </div>
    </BlockStyleWrapper>
  );
}
