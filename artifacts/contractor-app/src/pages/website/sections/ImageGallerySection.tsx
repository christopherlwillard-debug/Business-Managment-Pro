import { Plus, Trash2, ImageIcon } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

export interface GalleryImage {
  id: string;
  url: string;
  caption?: string;
  objectPath?: string;
}

export interface ImageGalleryContent {
  heading?: string;
  subheading?: string;
  images: GalleryImage[];
  columns?: 2 | 3 | 4;
  aspectRatio?: "square" | "video" | "auto";
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function defaultImageGalleryContent(): ImageGalleryContent {
  return {
    heading: "Our Work",
    subheading: "A look at some of our recent projects.",
    images: [
      { id: uid(), url: "", caption: "Project 1" },
      { id: uid(), url: "", caption: "Project 2" },
      { id: uid(), url: "", caption: "Project 3" },
    ],
    columns: 3,
    aspectRatio: "square",
  };
}

interface ImageGallerySectionProps {
  content: ImageGalleryContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: ImageGalleryContent) => void;
  onImageUpload?: (imageId: string, file: File) => Promise<void>;
  uploadingImageIds?: Set<string>;
  blockStyle?: BlockStyle;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

const ASPECT_MAP: Record<string, string> = {
  square: "aspect-square",
  video: "aspect-video",
  auto: "aspect-auto min-h-[180px]",
};

const COL_MAP: Record<number, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-2 md:grid-cols-4",
};

export function ImageGallerySection({
  content,
  settings,
  isEditing,
  onChange,
  onImageUpload,
  uploadingImageIds,
  blockStyle,
  onOpenMediaLibrary,
}: ImageGallerySectionProps) {
  const images = content.images ?? [];
  const columns = content.columns ?? 3;
  const aspectRatio = content.aspectRatio ?? "square";
  const colClass = COL_MAP[columns] ?? COL_MAP[3];
  const aspectClass = ASPECT_MAP[aspectRatio] ?? "aspect-square";

  function update(patch: Partial<ImageGalleryContent>) {
    onChange?.({ ...content, ...patch });
  }

  function updateImage(id: string, patch: Partial<GalleryImage>) {
    update({ images: images.map(img => img.id === id ? { ...img, ...patch } : img) });
  }

  function addImage() {
    if (images.length >= 12) return;
    if (onOpenMediaLibrary) {
      // Open media library directly — only add the slot once the user picks an image
      onOpenMediaLibrary(url => {
        update({ images: [...images, { id: uid(), url, caption: "" }] });
      });
    } else {
      update({ images: [...images, { id: uid(), url: "", caption: "" }] });
    }
  }

  function removeImage(id: string) {
    update({ images: images.filter(img => img.id !== id) });
  }

  async function handleFileChange(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onImageUpload) return;
    await onImageUpload(id, file);
  }

  if (!isEditing) {
    const visibleImages = images.filter(img => img.url);
    if (visibleImages.length === 0 && !content.heading) return null;
    return (
      <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-6 py-14" isEditing={false}>
        <div className="max-w-6xl mx-auto">
          {(content.heading || content.subheading) && (
            <div className="text-center mb-10">
              {content.heading && (
                <h2 className="text-3xl md:text-4xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>{content.heading}</h2>
              )}
              {content.subheading && (
                <p className="mt-2 text-lg" style={{ color: "var(--theme-text-muted, #6b7280)" }}>{content.subheading}</p>
              )}
            </div>
          )}
          {visibleImages.length > 0 && (
            <div className={`grid ${colClass} gap-4`}>
              {visibleImages.map(img => (
                <div
                  key={img.id}
                  className="group overflow-hidden"
                  style={{
                    borderRadius: "var(--theme-card-radius, 0.75rem)",
                    boxShadow: "var(--theme-card-shadow, 0 1px 3px rgba(0,0,0,0.08))",
                  }}
                >
                  <div className={`${aspectClass} overflow-hidden bg-gray-100`}>
                    <img
                      src={img.url}
                      alt={img.caption ?? "Gallery image"}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  {img.caption && (
                    <p className="text-center text-sm text-gray-500 mt-2 px-2 pb-1">{img.caption}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-4 py-8" isEditing={true}>
      <div onClick={e => e.stopPropagation()} className="space-y-4">
        <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">Image Gallery</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-white/40 mb-1">Columns</p>
            <div className="flex rounded-lg overflow-hidden border border-white/20">
              {([2, 3, 4] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => update({ columns: c })}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    columns === c
                      ? "bg-white/20 text-white"
                      : "bg-white/5 text-white/50 hover:bg-white/10"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-white/40 mb-1">Aspect Ratio</p>
            <div className="flex rounded-lg overflow-hidden border border-white/20">
              {(["square", "video", "auto"] as const).map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => update({ aspectRatio: a })}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors capitalize ${
                    aspectRatio === a
                      ? "bg-white/20 text-white"
                      : "bg-white/5 text-white/50 hover:bg-white/10"
                  }`}
                >
                  {a === "video" ? "16:9" : a === "auto" ? "auto" : "1:1"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <input
          type="text"
          className="w-full text-xl font-bold bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-lg px-3 py-2 outline-none focus:border-white/60"
          placeholder="Gallery heading (optional)"
          value={content.heading ?? ""}
          onChange={e => update({ heading: e.target.value })}
        />
        <input
          type="text"
          className="w-full text-sm bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-lg px-3 py-1.5 outline-none focus:border-white/60"
          placeholder="Subheading (optional)"
          value={content.subheading ?? ""}
          onChange={e => update({ subheading: e.target.value })}
        />

        <div className={`grid ${COL_MAP[columns] ?? COL_MAP[3]} gap-3`}>
          {images.map(img => {
            const isUploading = uploadingImageIds?.has(img.id);
            return (
              <div key={img.id} className="bg-white/10 border border-white/20 rounded-xl overflow-hidden relative group">
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute top-2 right-2 z-10 p-1 rounded bg-black/40 text-white/60 hover:text-red-400 hover:bg-red-400/20 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>

                {/* Empty tile — clicking opens media library directly if available */}
                {!img.url && onOpenMediaLibrary && !isUploading ? (
                  <button
                    type="button"
                    onClick={() => onOpenMediaLibrary(url => updateImage(img.id, { url }))}
                    className="block w-full cursor-pointer"
                  >
                    <div className="aspect-square bg-white/5 flex items-center justify-center overflow-hidden hover:bg-white/10 transition-colors">
                      <div className="flex flex-col items-center gap-1 text-white/40 hover:text-white/70 transition-colors">
                        <ImageIcon className="w-6 h-6" />
                        <span className="text-[10px]">Pick from library</span>
                      </div>
                    </div>
                  </button>
                ) : (
                  <label className="block cursor-pointer">
                    <div className="aspect-square bg-white/5 flex items-center justify-center overflow-hidden">
                      {img.url ? (
                        <img src={img.url} alt={img.caption ?? ""} className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-white/30">
                          {isUploading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white/70 rounded-full animate-spin" />
                          ) : (
                            <>
                              <ImageIcon className="w-6 h-6" />
                              <span className="text-[10px]">Upload photo</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={isUploading}
                      onChange={e => handleFileChange(img.id, e)}
                    />
                  </label>
                )}
                {onOpenMediaLibrary && img.url && (
                  <button
                    type="button"
                    onClick={() => onOpenMediaLibrary(url => updateImage(img.id, { url }))}
                    className="w-full text-[9px] text-white/40 hover:text-white/70 py-0.5 transition-colors"
                  >
                    Replace from Library
                  </button>
                )}

                <div className="p-2">
                  <input
                    type="text"
                    className="w-full text-xs bg-white/10 border border-white/20 text-white placeholder-white/30 rounded px-2 py-1 outline-none focus:border-white/50"
                    placeholder="Caption (optional)"
                    value={img.caption ?? ""}
                    onChange={e => updateImage(img.id, { caption: e.target.value })}
                  />
                </div>
              </div>
            );
          })}

          {images.length < 12 && (
            <button
              type="button"
              onClick={addImage}
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-white/30 rounded-xl text-white/40 hover:text-white hover:border-white/60 transition-colors aspect-square"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs">Add Image</span>
            </button>
          )}
        </div>
      </div>
    </BlockStyleWrapper>
  );
}
