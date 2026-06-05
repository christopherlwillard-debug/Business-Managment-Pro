import { useEffect, useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, rectSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GripVertical,
  ImagePlus, Loader2, Plus, Trash2, X,
} from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

export interface PhotoSettings {
  borderRadius?: number;
  shadow?: "none" | "sm" | "md" | "lg" | "xl";
  alt?: string;
  objectFit?: "cover" | "contain";
}

const PHOTO_SHADOW_CLASSES: Record<string, string> = {
  none: "shadow-none",
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
  xl: "shadow-xl",
};

export interface PortfolioPhoto {
  id: string;
  photoUrl: string;
  photoObjectPath?: string;
  caption?: string;
  settings?: PhotoSettings;
}

export interface PortfolioProject {
  id: string;
  name: string;
  description?: string;
  photos: PortfolioPhoto[];
}

export interface PortfolioContent {
  heading: string;
  projects: PortfolioProject[];
  photos?: PortfolioPhoto[];
}

function migrateContent(raw: Record<string, unknown>): PortfolioContent {
  if (Array.isArray((raw as any).projects)) return raw as unknown as PortfolioContent;
  const legacy = ((raw.photos ?? []) as PortfolioPhoto[]);
  return {
    heading: (raw.heading as string) ?? "Our Work",
    projects: legacy.length > 0
      ? [{ id: "default", name: "Featured Work", description: "", photos: legacy }]
      : [],
  };
}

interface PortfolioSectionProps {
  content: Record<string, unknown>;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: PortfolioContent) => void;
  onPhotoUpload?: (projectId: string, photoId: string, file: File) => Promise<void>;
  uploadingPhotoIds?: Set<string>;
  blockStyle?: BlockStyle;
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
  onSettingsChange?: (settings: PhotoSettings) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ps = photo.settings ?? {};
  const shadows = ["none", "sm", "md", "lg", "xl"] as const;
  function patchSettings(p: Partial<PhotoSettings>) {
    onSettingsChange?.({ ...ps, ...p });
  }
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800 flex flex-col">
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center py-1.5 cursor-grab active:cursor-grabbing bg-gray-100 dark:bg-gray-700/60 text-gray-400 hover:text-gray-600 transition-colors"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <button
        onClick={onRemove}
        className="absolute top-8 right-2 z-10 p-1 rounded-full bg-black/50 text-white hover:bg-red-600 transition-colors"
        title="Remove photo"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center relative">
        {photo.photoUrl ? (
          <img src={photo.photoUrl} alt={photo.caption || "Portfolio photo"} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs font-medium" style={{ color: brandColor + "80" }}>
            No photo yet
          </div>
        )}
        {isUploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
        )}
      </div>
      <div className="p-2 space-y-1.5">
        {onPhotoUpload && (
          <label className={`flex items-center justify-center gap-1.5 w-full text-xs border border-border rounded px-2 py-1.5 cursor-pointer transition-colors hover:bg-muted ${isUploading ? "opacity-60 pointer-events-none" : ""}`}>
            {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
            {isUploading ? "Uploading…" : photo.photoUrl ? "Replace Photo" : "Upload Photo"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={isUploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) onPhotoUpload(f); e.target.value = ""; }}
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
        {onSettingsChange && (
          <div className="mt-0.5 rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button type="button" onClick={() => setSettingsOpen(v => !v)} className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <span>Image Settings</span>
              {settingsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {settingsOpen && (
              <div className="px-2 pb-2 space-y-1.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div>
                  <label className="text-[9px] text-gray-500 block mt-1.5 mb-0.5">Radius: {ps.borderRadius ?? 12}px</label>
                  <input type="range" min={0} max={50} value={ps.borderRadius ?? 12} onChange={e => patchSettings({ borderRadius: parseInt(e.target.value) })} className="w-full h-1.5 accent-blue-500" />
                </div>
                <div>
                  <label className="text-[9px] text-gray-500 block mb-0.5">Shadow</label>
                  <div className="flex gap-0.5">
                    {shadows.map(s => (
                      <button key={s} type="button" onClick={() => patchSettings({ shadow: s })} className={`flex-1 text-[8px] py-0.5 rounded border capitalize ${(ps.shadow ?? "none") === s ? "bg-blue-500 text-white border-blue-500" : "border-gray-200 dark:border-gray-600 text-gray-400 hover:border-blue-300"}`}>{s}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[9px] text-gray-500 block mb-0.5">Object Fit</label>
                  <div className="flex gap-0.5">
                    {(["cover", "contain"] as const).map(f => (
                      <button key={f} type="button" onClick={() => patchSettings({ objectFit: f })} className={`flex-1 text-[9px] py-0.5 rounded border capitalize ${(ps.objectFit ?? "cover") === f ? "bg-blue-500 text-white border-blue-500" : "border-gray-200 dark:border-gray-600 text-gray-400 hover:border-blue-300"}`}>{f}</button>
                    ))}
                  </div>
                </div>
                <input value={ps.alt ?? ""} onChange={e => patchSettings({ alt: e.target.value || undefined })} placeholder="Alt text…" className="w-full text-[10px] border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 outline-none focus:border-blue-500 text-gray-700 dark:text-gray-300 placeholder-gray-400" />
              </div>
            )}
          </div>
        )}
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" aria-label="Close">
        <X className="w-6 h-6" />
      </button>
      {photos.length > 1 && (
        <button onClick={e => { e.stopPropagation(); prev(); }} className="absolute left-3 sm:left-6 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" aria-label="Previous photo">
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}
      <div className="flex flex-col items-center max-w-4xl w-full px-16" onClick={e => e.stopPropagation()}>
        <img key={photo.id} src={photo.photoUrl} alt={photo.caption || "Portfolio photo"} className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl" />
        {photo.caption && (
          <p className="mt-4 text-center text-white/90 text-sm sm:text-base max-w-xl">{photo.caption}</p>
        )}
        {photos.length > 1 && (
          <p className="mt-2 text-white/40 text-xs">{index + 1} / {photos.length}</p>
        )}
      </div>
      {photos.length > 1 && (
        <button onClick={e => { e.stopPropagation(); next(); }} className="absolute right-3 sm:right-6 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" aria-label="Next photo">
          <ChevronRight className="w-7 h-7" />
        </button>
      )}
    </div>
  );
}

function ProjectEditPanel({
  project,
  isFirst,
  isLast,
  brandColor,
  uploadingPhotoIds,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onPhotoUpload,
}: {
  project: PortfolioProject;
  isFirst: boolean;
  isLast: boolean;
  brandColor: string;
  uploadingPhotoIds: Set<string>;
  onUpdate: (p: PortfolioProject) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPhotoUpload?: (photoId: string, file: File) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function updatePhoto(photoId: string, patch: Partial<PortfolioPhoto>) {
    onUpdate({ ...project, photos: project.photos.map(p => p.id === photoId ? { ...p, ...patch } : p) });
  }

  function addPhoto() {
    onUpdate({ ...project, photos: [...project.photos, { id: `${project.id}_${Date.now()}`, photoUrl: "", caption: "" }] });
  }

  function removePhoto(photoId: string) {
    onUpdate({ ...project, photos: project.photos.filter(p => p.id !== photoId) });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = project.photos.findIndex(p => p.id === active.id);
    const newIdx = project.photos.findIndex(p => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    onUpdate({ ...project, photos: arrayMove(project.photos, oldIdx, newIdx) });
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-700/60 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Move project up"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Move project down"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <input
            className="text-sm font-semibold text-gray-800 dark:text-white bg-transparent border-b border-transparent focus:border-blue-500 outline-none w-full placeholder-gray-400"
            value={project.name}
            placeholder="Project name"
            onChange={e => onUpdate({ ...project, name: e.target.value })}
            onClick={e => e.stopPropagation()}
          />
          {expanded && (
            <input
              className="text-xs text-gray-500 dark:text-gray-400 bg-transparent border-b border-transparent focus:border-blue-500 outline-none w-full placeholder-gray-400 mt-0.5"
              value={project.description ?? ""}
              placeholder="Short description (optional)"
              onChange={e => onUpdate({ ...project, description: e.target.value })}
              onClick={e => e.stopPropagation()}
            />
          )}
        </div>
        <span className="text-xs text-gray-400 flex-shrink-0">{project.photos.length} photo{project.photos.length !== 1 ? "s" : ""}</span>
        <button
          onClick={() => setExpanded(v => !v)}
          className="p-1 rounded text-gray-400 hover:text-gray-600 transition-colors"
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button
          onClick={onRemove}
          className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors"
          title="Delete project"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="p-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={project.photos.map(p => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {project.photos.map(photo => (
                  <SortablePhotoCard
                    key={photo.id}
                    photo={photo}
                    isUploading={uploadingPhotoIds.has(photo.id)}
                    brandColor={brandColor}
                    onRemove={() => removePhoto(photo.id)}
                    onPhotoUpload={onPhotoUpload ? (file) => onPhotoUpload(photo.id, file) : undefined}
                    onUrlChange={url => updatePhoto(photo.id, { photoUrl: url, photoObjectPath: undefined })}
                    onCaptionChange={caption => updatePhoto(photo.id, { caption })}
                    onSettingsChange={settings => updatePhoto(photo.id, { settings })}
                  />
                ))}
                <button
                  onClick={addPhoto}
                  className="aspect-[4/3] flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors p-6"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-xs">Add Photo</span>
                </button>
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

export function PortfolioSection({
  content: rawContent,
  settings,
  isEditing,
  onChange,
  onPhotoUpload,
  uploadingPhotoIds = new Set(),
  blockStyle,
}: PortfolioSectionProps) {
  const content = migrateContent(rawContent);
  const projects = content.projects;

  const [activeTab, setActiveTab] = useState(0);
  const [lightbox, setLightbox] = useState<{ photos: PortfolioPhoto[]; index: number } | null>(null);

  function update(patch: Partial<PortfolioContent>) {
    onChange?.({ ...content, ...patch });
  }

  function updateProject(id: string, proj: PortfolioProject) {
    update({ projects: projects.map(p => p.id === id ? proj : p) });
  }

  function addProject() {
    const id = `proj_${Date.now()}`;
    update({ projects: [...projects, { id, name: "New Project", description: "", photos: [] }] });
  }

  function removeProject(id: string) {
    update({ projects: projects.filter(p => p.id !== id) });
  }

  function moveProject(index: number, dir: -1 | 1) {
    const newProjects = [...projects];
    const target = index + dir;
    if (target < 0 || target >= newProjects.length) return;
    [newProjects[index], newProjects[target]] = [newProjects[target], newProjects[index]];
    update({ projects: newProjects });
  }

  if (isEditing) {
    return (
      <BlockStyleWrapper
        wrapperClassName="py-16 px-6 bg-white dark:bg-gray-900"
        blockStyle={blockStyle}
        isEditing={isEditing}
      >
        <div className="max-w-5xl mx-auto">
          <input
            className="text-3xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-gray-200 focus:border-blue-500 outline-none mb-6 w-full"
            value={content.heading}
            onChange={e => update({ heading: e.target.value })}
          />
          <div className="space-y-4">
            {projects.map((proj, i) => (
              <ProjectEditPanel
                key={proj.id}
                project={proj}
                isFirst={i === 0}
                isLast={i === projects.length - 1}
                brandColor={settings.brandColor}
                uploadingPhotoIds={uploadingPhotoIds}
                onUpdate={updated => updateProject(proj.id, updated)}
                onRemove={() => removeProject(proj.id)}
                onMoveUp={() => moveProject(i, -1)}
                onMoveDown={() => moveProject(i, 1)}
                onPhotoUpload={onPhotoUpload ? (photoId, file) => onPhotoUpload(proj.id, photoId, file) : undefined}
              />
            ))}
            <button
              onClick={addProject}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors text-sm"
            >
              <Plus className="w-5 h-5" />
              Add Project Group
            </button>
          </div>
        </div>
      </BlockStyleWrapper>
    );
  }

  const visibleProjects = projects
    .map(p => ({ ...p, photos: p.photos.filter(ph => ph.photoUrl) }))
    .filter(p => p.photos.length > 0);

  if (visibleProjects.length === 0) return null;

  const safeTab = Math.min(activeTab, visibleProjects.length - 1);

  return (
    <>
      {lightbox && (
        <Lightbox
          photos={lightbox.photos}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
      <BlockStyleWrapper
        wrapperClassName="py-16 px-6 bg-gray-50 dark:bg-gray-900"
        blockStyle={blockStyle}
        isEditing={isEditing}
      >
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">
            {content.heading}
          </h2>

          {visibleProjects.length > 1 && (
            <div className="flex flex-wrap gap-2 justify-center mb-8">
              {visibleProjects.map((proj, i) => (
                <button
                  key={proj.id}
                  onClick={() => setActiveTab(i)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    safeTab === i
                      ? "text-white shadow-sm"
                      : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-gray-300"
                  }`}
                  style={safeTab === i ? { backgroundColor: settings.brandColor } : {}}
                >
                  {proj.name}
                </button>
              ))}
            </div>
          )}

          {(() => {
            const proj = visibleProjects[safeTab];
            if (!proj) return null;
            return (
              <div>
                {visibleProjects.length === 1 && proj.name && proj.name !== "Featured Work" && (
                  <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-6 text-center">{proj.name}</h3>
                )}
                {proj.description && (
                  <p className="text-gray-500 dark:text-gray-400 text-center mb-6 max-w-2xl mx-auto text-sm">{proj.description}</p>
                )}
                <div className="columns-1 sm:columns-2 md:columns-3 gap-4 space-y-4">
                  {proj.photos.map((photo, photoIdx) => (
                    <div
                      key={photo.id}
                      className={`break-inside-avoid overflow-hidden border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-pointer group ${photo.settings?.shadow ? PHOTO_SHADOW_CLASSES[photo.settings.shadow] : "shadow-sm"}`}
                      style={{ borderRadius: photo.settings?.borderRadius !== undefined ? `${photo.settings.borderRadius}px` : "0.75rem" }}
                      onClick={() => setLightbox({ photos: proj.photos, index: photoIdx })}
                    >
                      <div className="relative">
                        <img
                          src={photo.photoUrl}
                          alt={photo.settings?.alt || photo.caption || "Portfolio photo"}
                          className="w-full transition-transform duration-300 group-hover:scale-[1.02]"
                          style={{ objectFit: photo.settings?.objectFit ?? "cover" }}
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
                        <p className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 text-center">{photo.caption}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </BlockStyleWrapper>
    </>
  );
}
