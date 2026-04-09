import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Images, Upload, Trash2, Eye, EyeOff, X, Plus, ChevronUp, ChevronDown } from "lucide-react";

interface PortfolioPhoto {
  id: number;
  url: string;
  caption: string | null;
  category: string | null;
  sortOrder: number | null;
  active: boolean;
  createdAt: string;
}

const CATEGORIES = ["Trim Work", "Siding", "Plumbing", "Flooring", "AC Platform", "General"];

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${base}/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

export default function Portfolio() {
  const qc = useQueryClient();
  const [lightbox, setLightbox] = useState<PortfolioPhoto | null>(null);
  const [filterCat, setFilterCat] = useState<string>("All");
  const [uploadCat, setUploadCat] = useState<string>(CATEGORIES[0]);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: photos = [], isLoading } = useQuery<PortfolioPhoto[]>({
    queryKey: ["/api/portfolio-photos"],
    queryFn: () => apiFetch("/portfolio-photos"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/portfolio-photos/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portfolio-photos"] }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiFetch(`/portfolio-photos/${id}`, { method: "PATCH", body: JSON.stringify({ active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portfolio-photos"] }),
  });

  const reorderMut = useMutation({
    mutationFn: ({ id, sortOrder }: { id: number; sortOrder: number }) =>
      apiFetch(`/portfolio-photos/${id}`, { method: "PATCH", body: JSON.stringify({ sortOrder }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portfolio-photos"] }),
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const urlRes = await apiFetch("/storage/uploads/request-url", {
        method: "POST",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      await fetch(urlRes.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      await apiFetch("/portfolio-photos", {
        method: "POST",
        body: JSON.stringify({
          url: urlRes.objectPath,
          caption: uploadCaption || null,
          category: uploadCat,
          sortOrder: photos.length,
          active: true,
        }),
      });
      qc.invalidateQueries({ queryKey: ["/api/portfolio-photos"] });
      setUploadCaption("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
    }
  }

  const filtered = filterCat === "All" ? photos : photos.filter(p => p.category === filterCat);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Images className="w-6 h-6 text-primary" /> Portfolio Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Photos uploaded here appear on your public website.
          </p>
        </div>
        <span className="text-sm text-muted-foreground">{photos.filter(p => p.active).length} visible on site</span>
      </div>

      {/* Upload card */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-base">Upload a New Photo</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Category</label>
            <select
              value={uploadCat}
              onChange={e => setUploadCat(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
            >
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Caption (optional)</label>
            <input
              type="text"
              value={uploadCaption}
              onChange={e => setUploadCaption(e.target.value)}
              placeholder="e.g. Crown moulding in living room"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            {uploading ? "Uploading…" : "Choose Photo"}
          </button>
          {uploading && (
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {["All", ...CATEGORIES].map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterCat === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Photo grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Images className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No photos yet</p>
          <p className="text-sm">Upload photos above to populate your portfolio.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((photo, idx) => (
            <div
              key={photo.id}
              className={`relative group rounded-xl overflow-hidden bg-muted aspect-square border ${
                photo.active ? "border-border" : "border-dashed border-muted-foreground/40 opacity-60"
              }`}
            >
              <img
                src={`${base}/api/storage/objects${photo.url.replace(/^\/objects/, "")}`}
                alt={photo.caption ?? "Portfolio photo"}
                className="w-full h-full object-cover"
                onClick={() => setLightbox(photo)}
              />
              {/* Category badge */}
              {photo.category && (
                <span className="absolute top-2 left-2 text-[10px] font-bold bg-black/60 text-white px-2 py-0.5 rounded-full">
                  {photo.category}
                </span>
              )}
              {/* Action overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => setLightbox(photo)}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
                  title="View"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggleMut.mutate({ id: photo.id, active: !photo.active })}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
                  title={photo.active ? "Hide from site" : "Show on site"}
                >
                  {photo.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => idx > 0 && reorderMut.mutate({ id: photo.id, sortOrder: (photo.sortOrder ?? 0) - 1 })}
                  disabled={idx === 0}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors disabled:opacity-30"
                  title="Move up"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => idx < filtered.length - 1 && reorderMut.mutate({ id: photo.id, sortOrder: (photo.sortOrder ?? 0) + 1 })}
                  disabled={idx === filtered.length - 1}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors disabled:opacity-30"
                  title="Move down"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this photo permanently?")) deleteMut.mutate(photo.id);
                  }}
                  className="p-2 bg-red-500/80 hover:bg-red-600 rounded-full text-white transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <img
              src={`${base}/api/storage/objects${lightbox.url.replace(/^\/objects/, "")}`}
              alt={lightbox.caption ?? ""}
              className="w-full max-h-[80vh] object-contain rounded-xl"
            />
            {lightbox.caption && (
              <p className="text-white text-center mt-3 text-sm">{lightbox.caption}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
