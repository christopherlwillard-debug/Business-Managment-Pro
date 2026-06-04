import { ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";

export interface PortfolioPhoto {
  id: string;
  photoUrl: string;
  photoObjectPath?: string;
  caption?: string;
}

export interface PortfolioContent {
  heading: string;
  photos: PortfolioPhoto[];
}

interface PortfolioSectionProps {
  content: PortfolioContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: PortfolioContent) => void;
  onPhotoUpload?: (photoId: string, file: File) => Promise<void>;
  uploadingPhotoIds?: Set<string>;
}

export function PortfolioSection({
  content,
  settings,
  isEditing,
  onChange,
  onPhotoUpload,
  uploadingPhotoIds = new Set(),
}: PortfolioSectionProps) {
  const photos = content.photos ?? [];

  function update(patch: Partial<PortfolioContent>) {
    onChange?.({ ...content, ...patch });
  }

  function updatePhoto(id: string, patch: Partial<PortfolioPhoto>) {
    update({ photos: photos.map(p => (p.id === id ? { ...p, ...patch } : p)) });
  }

  function addPhoto() {
    update({
      photos: [
        ...photos,
        { id: Date.now().toString(), photoUrl: "", caption: "" },
      ],
    });
  }

  function removePhoto(id: string) {
    update({ photos: photos.filter(p => p.id !== id) });
  }

  if (isEditing) {
    return (
      <div className="py-16 px-6 bg-white dark:bg-gray-900">
        <div className="max-w-5xl mx-auto">
          <input
            className="text-3xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-gray-200 focus:border-blue-500 outline-none mb-8 w-full"
            value={content.heading}
            onChange={e => update({ heading: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {photos.map(photo => {
              const isUploading = uploadingPhotoIds.has(photo.id);
              return (
                <div
                  key={photo.id}
                  className="relative rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800 flex flex-col"
                >
                  {/* Remove button */}
                  <button
                    onClick={() => removePhoto(photo.id)}
                    className="absolute top-2 right-2 z-10 p-1 rounded-full bg-black/50 text-white hover:bg-red-600 transition-colors"
                    title="Remove photo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  {/* Photo preview */}
                  <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center relative">
                    {photo.photoUrl ? (
                      <img
                        src={photo.photoUrl}
                        alt={photo.caption || "Portfolio photo"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-xs font-medium"
                        style={{ color: settings.brandColor + "80" }}
                      >
                        No photo yet
                      </div>
                    )}
                    {isUploading && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="p-2 space-y-1.5">
                    {onPhotoUpload && (
                      <label
                        className={`flex items-center justify-center gap-1.5 w-full text-xs border border-border rounded px-2 py-1.5 cursor-pointer transition-colors hover:bg-muted ${isUploading ? "opacity-60 pointer-events-none" : ""}`}
                      >
                        {isUploading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <ImagePlus className="w-3 h-3" />
                        )}
                        {isUploading
                          ? "Uploading…"
                          : photo.photoUrl
                          ? "Replace Photo"
                          : "Upload Photo"}
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          disabled={isUploading}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) onPhotoUpload(photo.id, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                    <input
                      className="text-xs text-gray-500 bg-transparent border-b border-gray-200 dark:border-gray-600 focus:border-blue-500 outline-none w-full placeholder-gray-400"
                      value={photo.photoUrl && !photo.photoObjectPath ? photo.photoUrl : ""}
                      placeholder="Or paste an image URL"
                      onChange={e =>
                        updatePhoto(photo.id, {
                          photoUrl: e.target.value,
                          photoObjectPath: undefined,
                        })
                      }
                    />
                    <input
                      className="text-xs text-gray-600 dark:text-gray-300 bg-transparent border-b border-gray-200 dark:border-gray-600 focus:border-blue-500 outline-none w-full placeholder-gray-400"
                      value={photo.caption ?? ""}
                      placeholder="Caption (optional)"
                      onChange={e => updatePhoto(photo.id, { caption: e.target.value })}
                    />
                  </div>
                </div>
              );
            })}

            {/* Add photo card */}
            <button
              onClick={addPhoto}
              className="aspect-[4/3] flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors p-6"
            >
              <Plus className="w-6 h-6" />
              <span className="text-sm">Add Photo</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const visiblePhotos = photos.filter(p => p.photoUrl);

  if (visiblePhotos.length === 0) return null;

  return (
    <div className="py-16 px-6 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-10 text-center">
          {content.heading}
        </h2>
        <div className="columns-1 sm:columns-2 md:columns-3 gap-4 space-y-4">
          {visiblePhotos.map(photo => (
            <div
              key={photo.id}
              className="break-inside-avoid rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800"
            >
              <img
                src={photo.photoUrl}
                alt={photo.caption || "Portfolio photo"}
                className="w-full object-cover"
                loading="lazy"
              />
              {photo.caption && (
                <p className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 text-center">
                  {photo.caption}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
