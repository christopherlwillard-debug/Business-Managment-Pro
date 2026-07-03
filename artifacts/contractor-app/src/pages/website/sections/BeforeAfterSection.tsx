import { Plus, ImagePlus, X, ArrowRight } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { InlineEditableText } from "../InlineEditableText";
import type { SiteSettings } from "../website-types";

export interface BeforeAfterPair {
  id: string;
  beforeUrl?: string;
  afterUrl?: string;
  caption?: string;
  beforeLabel?: string;
  afterLabel?: string;
}

export interface BeforeAfterContent {
  heading: string;
  subheading?: string;
  pairs: BeforeAfterPair[];
}

interface Props {
  content: BeforeAfterContent;
  settings: SiteSettings;
  isEditing?: boolean;
  onChange?: (content: BeforeAfterContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

function uid() {
  return `pair-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createPair(): BeforeAfterPair {
  return { id: uid(), beforeLabel: "Before", afterLabel: "After", caption: "" };
}

function ImageSlot({
  url, label, isEditing, onUpload, onClear, placeholder,
}: {
  url?: string; label: string; isEditing?: boolean;
  onUpload?: () => void; onClear?: () => void; placeholder: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="relative rounded-lg overflow-hidden bg-muted/50 border border-border" style={{ aspectRatio: "4/3" }}>
        {url ? (
          <img src={url} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImagePlus className="w-8 h-8 opacity-30" />
            <span className="text-xs opacity-50">{placeholder}</span>
          </div>
        )}
        {isEditing && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 hover:opacity-100 transition-opacity bg-black/40">
            {onUpload && (
              <button type="button" onClick={onUpload}
                className="px-2 py-1 text-xs bg-white text-gray-900 rounded font-medium hover:bg-gray-100 transition-colors">
                {url ? "Replace" : "Add Photo"}
              </button>
            )}
            {url && onClear && (
              <button type="button" onClick={onClear}
                className="p-1 bg-white text-gray-900 rounded hover:bg-gray-100 transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] font-bold text-white uppercase tracking-widest"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          {label}
        </div>
      </div>
    </div>
  );
}

export function BeforeAfterSection({ content, settings: _settings, isEditing, onChange, blockStyle, sectionId, onOpenMediaLibrary }: Props) {
  const sid = sectionId ?? "before-after";

  function update(patch: Partial<BeforeAfterContent>) { onChange?.({ ...content, ...patch }); }
  function updatePair(id: string, patch: Partial<BeforeAfterPair>) {
    update({ pairs: content.pairs.map(p => p.id === id ? { ...p, ...patch } : p) });
  }
  function addPair() { update({ pairs: [...content.pairs, createPair()] }); }
  function deletePair(id: string) { update({ pairs: content.pairs.filter(p => p.id !== id) }); }

  const openMedia = (cb: (url: string) => void) => onOpenMediaLibrary?.(cb);

  return (
    <BlockStyleWrapper wrapperClassName="py-16 px-6 bg-white dark:bg-gray-900" blockStyle={blockStyle} isEditing={isEditing}>
      <div className="max-w-5xl mx-auto">
        <InlineEditableText
          id={`${sid}-heading`} as="h2" value={content.heading} placeholder="Before & After"
          className="text-3xl font-bold mb-3 text-center w-full"
          style={{ color: "var(--theme-text, #111827)" }}
          onCommit={v => update({ heading: v })}
          disabled={!isEditing}
        />
        {(content.subheading !== undefined || isEditing) && (
          <InlineEditableText
            id={`${sid}-subheading`} as="p" value={content.subheading ?? ""}
            placeholder="Subheading (optional)"
            className="text-center text-base mb-10 w-full"
            style={{ color: "var(--theme-text-muted, #6b7280)" }}
            onCommit={v => update({ subheading: v || undefined })}
            disabled={!isEditing}
          />
        )}

        <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-8">
          {content.pairs.map(pair => (
            <div key={pair.id} className="relative group rounded-xl border border-border overflow-hidden bg-muted/20 p-4">
              {isEditing && (
                <button type="button" onClick={() => deletePair(pair.id)}
                  className="absolute top-2 right-2 z-10 p-1 rounded bg-background/80 border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors opacity-0 group-hover:opacity-100">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="flex items-stretch gap-2 mb-3">
                <ImageSlot
                  url={pair.beforeUrl}
                  label={pair.beforeLabel ?? "Before"}
                  isEditing={isEditing}
                  onUpload={() => openMedia(url => updatePair(pair.id, { beforeUrl: url }))}
                  onClear={() => updatePair(pair.id, { beforeUrl: undefined })}
                  placeholder="Before photo"
                />
                <div className="flex items-center flex-shrink-0 text-muted-foreground">
                  <ArrowRight className="w-4 h-4" />
                </div>
                <ImageSlot
                  url={pair.afterUrl}
                  label={pair.afterLabel ?? "After"}
                  isEditing={isEditing}
                  onUpload={() => openMedia(url => updatePair(pair.id, { afterUrl: url }))}
                  onClear={() => updatePair(pair.id, { afterUrl: undefined })}
                  placeholder="After photo"
                />
              </div>
              {(pair.caption !== undefined || isEditing) && (
                isEditing ? (
                  <input
                    value={pair.caption ?? ""}
                    onChange={e => updatePair(pair.id, { caption: e.target.value || undefined })}
                    placeholder="Caption (optional)"
                    className="w-full text-xs text-center border-0 border-b border-border bg-transparent focus:outline-none focus:border-primary py-0.5 pb-1"
                    style={{ color: "var(--theme-text-muted, #6b7280)" }}
                  />
                ) : pair.caption ? (
                  <p className="text-xs text-center" style={{ color: "var(--theme-text-muted, #6b7280)" }}>{pair.caption}</p>
                ) : null
              )}
            </div>
          ))}
        </div>

        {isEditing && (
          <div className="flex justify-center mt-6">
            <button type="button" onClick={addPair}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors">
              <Plus className="w-3 h-3" /> Add Before & After
            </button>
          </div>
        )}
      </div>
    </BlockStyleWrapper>
  );
}

export function defaultBeforeAfterContent(): BeforeAfterContent {
  return {
    heading: "Before & After",
    subheading: "See the quality of our work firsthand.",
    pairs: [
      { id: uid(), beforeLabel: "Before", afterLabel: "After", caption: "Project description" },
      { id: uid(), beforeLabel: "Before", afterLabel: "After", caption: "Project description" },
    ],
  };
}
