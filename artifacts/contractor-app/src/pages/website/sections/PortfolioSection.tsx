import { useEffect, useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, rectSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight, GripVertical, ImagePlus, Loader2, Plus, X } from "lucide-react";

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

function SortablePhotoCard({
  photo,
  isUploading,
  brandColor,
  onRemove,
  onPhotoUpload,
  onUrlChange,
  onCaptionChange,
}: {
  photo: PortfolioPhoto;
  isUploading: boolean;
  brandColor: string;
  onRemove: () => void;
  onPhotoUpload?: (file: File) => Promise<void>;
  onUrlChange: (url: string) => void;
  onCaptionChange: (caption: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800 flex flex-col"
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center py-1.5 cursor-grab active:cursor-grabbing bg-gray-100 dark:bg-gray-700/60 text-gray-400 hover:text-gray-600 transition-colors"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="absolute top-8 right-2 z-10 p-1 rounded-full bg-black/50 text-white hover:bg-red-600 transition-colors"
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
            style={{ color: brandColor + "80" }}
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
            {isUploading ? "Uploading…" : photo.photoUrl ? "Replace Photo" : "Upload Photo"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={isUploading}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) onPhotoUpload(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
        <input
          className="text-xs text-gray-500 bg-transparent border-b border-gray-200 dark:border-gray-600 focus:border-blue-500 outline-none w-full placeholder-gray-400"
          value={photo.photoUrl && !photo.photoObjectPath ? photo.photoUrl : ""}
          placeholder="Or paste an image URL"
          onChange={e => onUrlChange(e.target.value)}
        />
        <input
          className="text-xs text-gray-600 dark:text-gray-300 bg-transparent border-b border-gray-200 dark:border-gray-600 focus:border-blue-500 outline-none w-full placeholder-gray-400"
          value={photo.caption ?? ""}
          placeholder="Caption (optional)"
          onChange={e => onCaptionChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function Lightbox({
  photos,
  startIndex,
  onClose,
}: {
  photos: PortfolioPhoto[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);

  const prev = () => setIndex(i => (i - 1 + photos.length) % photos.length);
  const next = () => setIndex(i => (i + 1) % photos.length);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const photo = photos[index];

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Prev arrow */}
      {photos.length > 1 && (
        <button
          onClick={e => { e.stopPropagation(); prev(); }}
          className="absolute left-3 sm:left-6 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="Previous photo"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}

      {/* Image + caption */}
      <div
        className="flex flex-col items-center max-w-4xl w-full px-16"
        onClick={e => e.stopPropagation()}
      >
        <img
          key={photo.id}
          src={photo.photoUrl}
          alt={photo.caption || "Portfolio photo"}
          className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl"
        />
        {photo.caption && (
          <p className="mt-4 text-center text-white/90 text-sm sm:text-base max-w-xl">
            {photo.caption}
          </p>
        )}
        {photos.length > 1 && (
          <p className="mt-2 text-white/40 text-xs">
            {index + 1} / {photos.length}
          </p>
        )}
      </div>

      {/* Next arrow */}
      {photos.length > 1 && (
        <button
          onClick={e => { e.stopPropagation(); next(); }}
          className="absolute right-3 sm:right-6 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="Next photo"
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      )}
    </div>
  );
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = photos.findIndex(p => p.id === active.id);
    const newIndex = photos.findIndex(p => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    update({ photos: arrayMove(photos, oldIndex, newIndex) });
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={photos.map(p => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {photos.map(photo => (
                  <SortablePhotoCard
                    key={photo.id}
                    photo={photo}
                    isUploading={uploadingPhotoIds.has(photo.id)}
                    brandColor={settings.brandColor}
                    onRemove={() => removePhoto(photo.id)}
                    onPhotoUpload={onPhotoUpload ? (file) => onPhotoUpload(photo.id, file) : undefined}
                    onUrlChange={url => updatePhoto(photo.id, { photoUrl: url, photoObjectPath: undefined })}
                    onCaptionChange={caption => updatePhoto(photo.id, { caption })}
                  />
                ))}

                {/* Add photo card — outside sortable items so it doesn't get dragged */}
                <button
                  onClick={addPhoto}
                  className="aspect-[4/3] flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors p-6"
                >
                  <Plus className="w-6 h-6" />
                  <span className="text-sm">Add Photo</span>
                </button>
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    );
  }

  const visiblePhotos = photos.filter(p => p.photoUrl);

  if (visiblePhotos.length === 0) return null;

  return (
    <>
      {lightboxIndex !== null && (
        <Lightbox
          photos={visiblePhotos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      <div className="py-16 px-6 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-10 text-center">
            {content.heading}
          </h2>
          <div className="columns-1 sm:columns-2 md:columns-3 gap-4 space-y-4">
            {visiblePhotos.map((photo, i) => (
              <div
                key={photo.id}
                className="break-inside-avoid rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-pointer group"
                onClick={() => setLightboxIndex(i)}
              >
                <div className="relative">
                  <img
                    src={photo.photoUrl}
                    alt={photo.caption || "Portfolio photo"}
                    className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/20 backdrop-blur-sm rounded-full p-3">
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0zm-3-3v2m0 4h.01" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 11h2m-2 0h-2" />
                      </svg>
                    </div>
                  </div>
                </div>
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
    </>
  );
}
