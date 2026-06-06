import { Images } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

interface ImageContent {
  imageUrl?: string;
  altText?: string;
  linkUrl?: string;
  width?: "full" | "contained";
  alignment?: "left" | "center" | "right";
}

export function defaultImageContent(): ImageContent {
  return { imageUrl: "", altText: "", linkUrl: "", width: "contained", alignment: "center" };
}

interface ImageSectionProps {
  content: ImageContent;
  settings: Record<string, unknown>;
  isEditing?: boolean;
  onChange?: (content: ImageContent) => void;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
  blockStyle?: BlockStyle;
}

export function ImageSection({ content, isEditing, onChange, onOpenMediaLibrary, blockStyle }: ImageSectionProps) {
  function update(patch: Partial<ImageContent>) {
    onChange?.({ ...content, ...patch });
  }

  const alignClass =
    content.alignment === "left" ? "mr-auto" : content.alignment === "right" ? "ml-auto" : "mx-auto";
  const widthClass = content.width === "full" ? "w-full" : "max-w-4xl";

  if (isEditing) {
    return (
      <BlockStyleWrapper wrapperClassName="py-8 px-6" blockStyle={blockStyle} isEditing={isEditing}>
        <div className={`${widthClass} ${alignClass}`}>
          {content.imageUrl ? (
            <div className="relative group rounded-lg overflow-hidden">
              <img src={content.imageUrl} alt={content.altText || ""} className="w-full block" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                {onOpenMediaLibrary && (
                  <button
                    type="button"
                    onClick={() => onOpenMediaLibrary((url) => update({ imageUrl: url }))}
                    className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded-md hover:bg-gray-100 transition-colors"
                  >
                    Replace
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => update({ imageUrl: "" })}
                  className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-md hover:bg-red-600 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-border rounded-xl p-16 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              onClick={() => onOpenMediaLibrary?.((url) => update({ imageUrl: url }))}
            >
              <Images className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">Click to choose from media library</p>
              {!onOpenMediaLibrary && (
                <p className="text-xs text-muted-foreground/60">Open the Media Library from the toolbar above</p>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Alt text</label>
              <input
                type="text"
                value={content.altText || ""}
                onChange={(e) => update({ altText: e.target.value })}
                placeholder="Describe the image"
                className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Link URL (optional)</label>
              <input
                type="text"
                value={content.linkUrl || ""}
                onChange={(e) => update({ linkUrl: e.target.value })}
                placeholder="https://..."
                className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Width</label>
              <div className="flex gap-1">
                {(["contained", "full"] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => update({ width: w })}
                    className={`flex-1 py-1 text-xs rounded transition-colors capitalize ${
                      (content.width ?? "contained") === w
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Alignment</label>
              <div className="flex gap-1">
                {(["left", "center", "right"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => update({ alignment: a })}
                    className={`flex-1 py-1 text-xs rounded transition-colors capitalize ${
                      (content.alignment ?? "center") === a
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </BlockStyleWrapper>
    );
  }

  if (!content.imageUrl) return null;

  const img = (
    <img
      src={content.imageUrl}
      alt={content.altText || ""}
      className={`${widthClass} ${alignClass} block`}
    />
  );

  return (
    <BlockStyleWrapper wrapperClassName="py-8 px-6" blockStyle={blockStyle} isEditing={isEditing}>
      {content.linkUrl ? (
        <a href={content.linkUrl} target="_blank" rel="noopener noreferrer">
          {img}
        </a>
      ) : (
        img
      )}
    </BlockStyleWrapper>
  );
}
