import React, { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import {
  useGetTrimOutCatalog
} from "@workspace/api-client-react";
import {
  Image as ImageIcon,
  ChevronRight,
  FolderOpen,
  ArrowLeft,
  Camera,
  Layers,
  MapPin,
  CheckCircle2,
  Calendar,
  Grid,
  Search
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ──────────────────────────────────────────────────────────────────
interface ChecklistFinishedPhoto {
  id: number;
  url: string;
  createdAt: string;
  caption?: string | null;
}

interface ChecklistItemPhoto {
  id: number;
  url: string;
  caption: string | null;
}

interface ChecklistItem {
  id: number;
  title: string;
  photos: ChecklistItemPhoto[];
}

interface ChecklistSection {
  id: number;
  name: string;
  items: ChecklistItem[];
}

interface JobChecklist {
  id: number;
  jobId: number;
  startPhotos: ChecklistFinishedPhoto[];
  finishedPhotos: ChecklistFinishedPhoto[];
  sections: ChecklistSection[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

// We use the same base path logic to ensure images load
function imgUrl(url: string) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "Unknown Date";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type CatalogPhoto = {
  id: string;
  url: string;
  category: "start" | "checklist" | "finished";
  caption: string;
  context: string;
};

function checklistPhotos(checklist?: JobChecklist): CatalogPhoto[] {
  if (!checklist) return [];

  return [
    ...checklist.startPhotos.map((photo) => ({
      id: `start-${photo.id}`,
      url: photo.url,
      category: "start" as const,
      caption: photo.caption || "Start photo",
      context: "Before work began",
    })),
    ...checklist.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.photos.map((photo) => ({
          id: `item-${photo.id}`,
          url: photo.url,
          category: "checklist" as const,
          caption: photo.caption || item.title,
          context: `${section.name} · ${item.title}`,
        })),
      ),
    ),
    ...checklist.finishedPhotos.map((photo) => ({
      id: `finished-${photo.id}`,
      url: photo.url,
      category: "finished" as const,
      caption: photo.caption || "Finished photo",
      context: "Completed home",
    })),
  ];
}

function useHomeChecklist(jobId: number | null) {
  const [checklist, setChecklist] = useState<JobChecklist | undefined>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function fetchChecklist() {
      setChecklist(undefined);
      if (jobId == null) return;
      setLoading(true);
      try {
        const res = await fetch(`${BASE}/api/jobs/${jobId}/checklist`, { credentials: "include" });
        if (res.ok && mounted) setChecklist(await res.json());
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchChecklist();
    return () => { mounted = false; };
  }, [jobId]);

  return { checklist, loading };
}

// ── View States ────────────────────────────────────────────────────────────
type ViewState = 
  | { type: "catalog" }
  | { type: "builder"; mfrId: number }
  | { type: "model"; mfrId: number; modelId: number }
  | { type: "home"; mfrId: number; modelId: number; jobId: number };

// ── Main Component ─────────────────────────────────────────────────────────

export default function TrimOutCatalog() {
  const [view, setView] = useState<ViewState>({ type: "catalog" });
  const [page, setPage] = useState(1);
  
  // Local Selection Mode (prototype action)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [selectedHomes, setSelectedHomes] = useState<Set<number>>(new Set());
  const [selectedHomePhotoCounts, setSelectedHomePhotoCounts] = useState<Record<number, number>>({});

  const selectedManufacturerId = view.type === "catalog" ? undefined : view.mfrId;
  const selectedModelId = view.type === "model" || view.type === "home" ? view.modelId : undefined;
  const { data: catalog, isLoading } = useGetTrimOutCatalog({
    page,
    pageSize: 25,
    manufacturerId: selectedManufacturerId,
    modelId: selectedModelId,
  });
  const builders = catalog?.builders ?? [];
  const homes = catalog?.homes ?? [];
  const openJobId = view.type === "home" ? view.jobId : null;
  const { checklist: openChecklist, loading: checklistLoading } = useHomeChecklist(openJobId);
  const selectedPhotoCount = selectedPhotos.size + Array.from(selectedHomes)
    .reduce((total, jobId) => total + (selectedHomePhotoCounts[jobId] ?? 0), 0);

  const [searchQuery, setSearchQuery] = useState("");

  const buildersWithJobs = useMemo(() => {
    let list = builders;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(b => b.name.toLowerCase().includes(q));
    }
    return list;
  }, [builders, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col h-full bg-[#f8f7f4]">
        <div className="flex items-center justify-center h-64 text-amber-800">
          <ImageIcon className="w-8 h-8 animate-pulse opacity-50" />
        </div>
      </div>
    );
  }

  // --- Sub-views ---

  function renderCatalog() {
    // Check total jobs before filtering by search
    const hasAnyJobs = builders.length > 0;

    if (!hasAnyJobs) {
      return (
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <FolderOpen className="w-16 h-16 text-slate-300 mb-4" />
          <h2 className="text-xl font-display font-semibold text-slate-800 mb-2">No completed trim-outs yet</h2>
          <p className="text-slate-500 max-w-md">
            Completed jobs with assigned manufacturers and models will automatically appear here to build your visual catalog.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-2xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-colors shadow-sm"
            placeholder="Search builders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {buildersWithJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white border border-slate-200 rounded-2xl">
            <Search className="w-12 h-12 text-slate-300 mb-3" />
            <h3 className="text-lg font-display font-semibold text-slate-800">No builders found</h3>
            <p className="text-slate-500 text-sm max-w-sm mt-1">Try adjusting your search terms.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {buildersWithJobs.map((b) => (
              <button
                key={b.id}
                 onClick={() => {
                   setPage(1);
                   setView({ type: "builder", mfrId: b.id });
                 }}
                className="group text-left bg-white border border-slate-200 hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 hover:shadow-lg transition-all rounded-2xl p-6 flex flex-col"
              >
                <div className="flex items-start justify-between mb-8">
                  <div className="w-12 h-12 rounded-xl bg-[#fdfaf5] border border-amber-100 flex items-center justify-center text-amber-700">
                    <Grid className="w-6 h-6" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-amber-500 transition-colors" />
                </div>
                <h3 className="text-2xl font-display font-bold text-slate-900 mb-2">{b.name}</h3>
                <div className="flex items-center gap-4 text-sm font-medium text-slate-500 mt-auto">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-slate-400" />
                     {b.modelCount} Models
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-slate-400" />
                     {b.homeCount} Homes
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-slate-400" />
                     {b.photoCount} Photos
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderBuilder(mfrId: number) {
    const builder = buildersWithJobs.find(b => b.id === mfrId);
    if (!builder) return null;

    // Group jobs by model
    const modelsList = builder.models;

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => setView({ type: "catalog" })} className="p-2 -ml-2 rounded-xl text-slate-500 hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-3xl font-display font-bold text-slate-900">{builder.name} Models</h2>
        </div>

        {modelsList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white border border-slate-200 rounded-2xl">
            <Layers className="w-12 h-12 text-slate-300 mb-3" />
            <h3 className="text-lg font-display font-semibold text-slate-800">No models found</h3>
            <p className="text-slate-500 text-sm max-w-sm mt-1">This builder doesn't have any completed trim-out jobs assigned to specific models yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modelsList.map((m) => (
              <button
                key={m.id}
                 onClick={() => {
                   setPage(1);
                   setView({ type: "model", mfrId, modelId: m.id });
                 }}
                className="group text-left bg-white border border-slate-200 hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 hover:shadow-lg transition-all rounded-2xl overflow-hidden flex flex-col"
              >
                <div className="h-32 bg-slate-50 border-b border-slate-100 flex items-center justify-center relative overflow-hidden">
                   {m.coverPhotoUrl ? (
                     <img src={imgUrl(m.coverPhotoUrl)} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] opacity-50" />
                      <ImageIcon className="w-8 h-8 text-slate-300 relative z-10" />
                    </>
                  )}
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-display font-bold text-slate-900 mb-1 group-hover:text-amber-700 transition-colors">{m.name}</h3>
                  <p className="text-sm font-medium text-slate-500 mb-4">
                     {m.homeCount} completed {m.homeCount === 1 ? "home" : "homes"} · {m.photoCount} photos
                  </p>
                  <div className="flex items-center justify-between text-amber-600 font-semibold text-sm">
                    <span>Browse gallery</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function ModelView({ mfrId, modelId }: { mfrId: number, modelId: number }) {
    const builder = buildersWithJobs.find(b => b.id === mfrId);
    const mJobs = homes;
    const modelInfo = builder?.models.find(m => m.id === modelId);
    const modelName = modelInfo?.name || "Unknown Model";

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setView({ type: "builder", mfrId })} className="p-2 -ml-2 rounded-xl text-slate-500 hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <p className="text-sm font-medium text-slate-500">{builder?.name}</p>
              <h2 className="text-3xl font-display font-bold text-slate-900">{modelName}</h2>
            </div>
          </div>
          
          <button 
            onClick={() => {
              setSelectionMode(!selectionMode);
              if (selectionMode) {
                setSelectedPhotos(new Set()); // Reset on exit
                setSelectedHomes(new Set());
                 setSelectedHomePhotoCounts({});
              }
            }}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border focus:outline-none focus:ring-2 focus:ring-amber-500 ${
              selectionMode 
              ? "bg-slate-800 text-white border-slate-800 shadow-md" 
              : "bg-white text-slate-700 border-slate-200 hover:border-amber-400 hover:text-amber-700 shadow-sm"
            }`}
          >
            {selectionMode ? "Cancel Selection" : "Create Trim-Out Catalog"}
          </button>
        </div>

        {selectionMode && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                {selectedPhotoCount}
              </div>
              <div>
                <p className="font-semibold text-amber-900">Prototype Mode Active</p>
                <p className="text-xs text-amber-700">Select entire homes or open a gallery to choose individual photos. Nothing is published.</p>
              </div>
            </div>
            <button 
              disabled={selectedPhotoCount === 0}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors shadow-sm whitespace-nowrap"
              type="button"
            >
              Review {selectedPhotoCount} selected
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          {mJobs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center">
              <Camera className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No completed homes found for this model.</p>
            </div>
          ) : mJobs.map((job) => {
            const photoCount = job.photoCount;
            const coverPhotoUrl = job.coverPhotoUrl;
            const isHomeSelected = selectedHomes.has(job.jobId);

            return (
              <div 
                key={job.jobId}
                onClick={() => {
                  if (selectionMode) {
                    const next = new Set(selectedHomes);
                    const nextPhotos = new Set(selectedPhotos);
                    if (next.has(job.jobId)) {
                      next.delete(job.jobId);
                      setSelectedHomePhotoCounts(current => {
                        const nextCounts = { ...current };
                        delete nextCounts[job.jobId];
                        return nextCounts;
                      });
                    } else {
                      next.add(job.jobId);
                      setSelectedHomePhotoCounts(current => ({ ...current, [job.jobId]: job.photoCount }));
                    }
                    setSelectedHomes(next);
                    setSelectedPhotos(nextPhotos);
                  }
                }}
                className={`bg-white rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-6 transition-all ${
                  selectionMode ? "cursor-pointer" : ""
                } ${
                  selectionMode && isHomeSelected 
                    ? "border-2 border-amber-500 shadow-md ring-4 ring-amber-500/10" 
                    : "border border-slate-200 hover:shadow-md"
                }`}
              >
                <div className="relative h-40 sm:h-24 w-full sm:w-32 bg-slate-100 rounded-xl border border-slate-200 flex-shrink-0 flex items-center justify-center overflow-hidden">
                   {coverPhotoUrl ? (
                      <img src={imgUrl(coverPhotoUrl)} alt="Cover" className="w-full h-full object-cover" />
                   ) : photoCount > 0 ? (
                      <Camera className="w-8 h-8 text-slate-300" />
                   ) : (
                      <ImageIcon className="w-8 h-8 text-slate-200" />
                   )}
                   
                   {selectionMode && (
                    <div className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors z-10 ${
                      isHomeSelected ? "bg-amber-500 border-amber-500 text-white" : "bg-white/90 border-slate-300 text-transparent"
                    }`}>
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold text-slate-900 truncate">
                      {job.locationName || job.address || `Job #${job.jobId}`}
                    </h3>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Completed {formatDate(job.endDate)}</span>
                    <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {job.city || "Unknown City"}{job.state ? `, ${job.state}` : ""}</span>
                  </div>
                </div>

                <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 flex-shrink-0 mt-2 sm:mt-0 border-t sm:border-t-0 border-slate-100 pt-4 sm:pt-0">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-100 text-sm font-semibold text-slate-600">
                    {photoCount} Photos
                  </span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setView({ type: "home", mfrId, modelId, jobId: job.jobId });
                    }}
                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-colors shadow-sm"
                  >
                    View Gallery
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {catalog && catalog.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold disabled:opacity-40">Previous</button>
            <span className="text-sm text-slate-500">Page {catalog.page} of {catalog.totalPages}</span>
            <button type="button" disabled={page >= catalog.totalPages} onClick={() => setPage(p => p + 1)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold disabled:opacity-40">Next</button>
          </div>
        )}
      </div>
    );
  }

  function HomeGalleryView({ mfrId, modelId, jobId }: { mfrId: number, modelId: number, jobId: number }) {
    const job = homes.find(j => j.jobId === jobId);
    const cl = openChecklist;

    const [filter, setFilter] = useState<"all" | "start" | "checklist" | "finished">("all");

    // Gather all photos for flat display
    const photos = useMemo(() => checklistPhotos(cl), [cl]);

    const filteredPhotos = useMemo(() => {
      if (filter === "all") return photos;
      return photos.filter(p => p.category === filter);
    }, [photos, filter]);

    const toggleSelection = (photoId: string) => {
      const next = new Set(selectedPhotos);
      if (selectedHomes.has(jobId)) {
        photos.forEach(photo => next.add(photo.id));
        next.delete(photoId);
      } else if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      setSelectedPhotos(next);
      setSelectedHomes((current) => {
        if (!current.has(jobId)) return current;
        const nextHomes = new Set(current);
        nextHomes.delete(jobId);
        setSelectedHomePhotoCounts(counts => {
          const nextCounts = { ...counts };
          delete nextCounts[jobId];
          return nextCounts;
        });
        return nextHomes;
      });
    };

    const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

    if (checklistLoading && !cl) {
      return (
        <div className="flex-1 flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setView({ type: "model", mfrId, modelId })} className="p-2 -ml-2 rounded-xl text-slate-500 hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <p className="text-sm font-medium text-slate-500">{job?.locationName || job?.address}</p>
              <h2 className="text-3xl font-display font-bold text-slate-900">Home Gallery</h2>
            </div>
          </div>
          
          {/* Link back to job detail */}
          <Link href={`/jobs?openJob=${jobId}`} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:border-amber-400 hover:text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors shadow-sm inline-flex items-center gap-2">
             Go to Job Record
             <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Prototype Selection Persistence Banner */}
        {selectionMode && (
          <div className="sticky top-4 z-20 bg-amber-500 text-white rounded-xl p-3 shadow-lg flex items-center justify-between mb-6">
            <div className="font-bold">{selectedPhotoCount} photos selected for catalog</div>
            <button onClick={() => {
              setSelectionMode(false);
              setSelectedPhotos(new Set());
              setSelectedHomes(new Set());
              setSelectedHomePhotoCounts({});
            }} className="text-sm underline hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-white rounded px-1">Exit prototype mode</button>
          </div>
        )}

        <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 inline-flex flex-wrap gap-1">
          {(["all", "start", "checklist", "finished"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-bold capitalize transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                filter === f ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {filteredPhotos.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl py-24 text-center">
             <Camera className="w-12 h-12 text-slate-200 mx-auto mb-4" />
             <p className="text-slate-500 font-medium">No photos in this category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredPhotos.map(photo => {
               const isSelected = selectedHomes.has(jobId) || selectedPhotos.has(photo.id);
              return (
                <div 
                  key={photo.id} 
                  className={`group relative aspect-square bg-slate-100 rounded-2xl overflow-hidden border-2 transition-all ${
                    selectionMode && isSelected 
                      ? "border-amber-500 shadow-md ring-4 ring-amber-500/20" 
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                  onClick={() => {
                    if (selectionMode) toggleSelection(photo.id);
                  }}
                  role={selectionMode ? "button" : "img"}
                >
                  {photo.url && !imageErrors.has(photo.id) ? (
                    <img 
                      src={imgUrl(photo.url)} 
                      alt={photo.caption || "Trim out photo"} 
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={() => {
                        setImageErrors(prev => new Set(prev).add(photo.id));
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-slate-50">
                      <ImageIcon className="w-8 h-8 mb-2" />
                      {imageErrors.has(photo.id) && <span className="text-xs font-medium">Image unavailable</span>}
                    </div>
                  )}

                  {/* Gradient Overlay for caption */}
                  <div className="absolute inset-x-0 bottom-0 p-4 pt-12 bg-gradient-to-t from-slate-900/80 to-transparent">
                     <p className="text-white text-sm font-medium truncate drop-shadow-md">
                       {photo.caption}
                     </p>
                     <p className="text-white/75 text-xs truncate">{photo.context}</p>
                  </div>

                  {/* Selection Checkmark */}
                  {selectionMode && (
                    <div className={`absolute top-3 left-3 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isSelected ? "bg-amber-500 border-amber-500 text-white" : "bg-white/80 border-slate-300 text-transparent"
                    }`}>
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // --- Render Router ---
  return (
    <div className="flex-1 bg-[#faf9f5] min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-10">
          <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">Trim-Out Catalog</h1>
          <p className="text-lg text-slate-500 mt-2 font-medium">Browse finished field work by Builder and Model.</p>
        </header>

        {view.type === "catalog" && renderCatalog()}
        {view.type === "builder" && renderBuilder(view.mfrId)}
        {view.type === "model" && <ModelView mfrId={view.mfrId} modelId={view.modelId} />}
        {view.type === "home" && <HomeGalleryView mfrId={view.mfrId} modelId={view.modelId} jobId={view.jobId} />}
      </div>
    </div>
  );
}
