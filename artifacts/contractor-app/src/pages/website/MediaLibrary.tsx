import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2, X, Check, Images } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MediaItem {
  id: number;
  filename: string;
  url: string;
  size: number;
  uploadedAt: string;
}

interface MediaLibraryProps {
  businessId: number;
  mode?: "browse" | "select";
  onSelect?: (url: string) => void;
  onClose?: () => void;
}

export function MediaLibrary({ businessId, mode = "browse", onSelect, onClose }: MediaLibraryProps) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: items = [], isLoading } = useQuery<MediaItem[]>({
    queryKey: ["website-media", businessId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/website/media?businessId=${businessId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load media library");
      return res.json();
    },
    enabled: !!businessId,
  });

  async function handleUpload(files: FileList | File[]) {
    const fileArr = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!fileArr.length) return;
    setUploading(true);
    try {
      for (const file of fileArr) {
        const urlRes = await fetch(`${BASE}/api/website/media/upload-url?businessId=${businessId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        });
        if (!urlRes.ok) continue;
        const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
        await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        const uuid = objectPath.split("/").pop()!;
        const url = `${BASE}/api/website/media-image/${uuid}`;
        await fetch(`${BASE}/api/website/media?businessId=${businessId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ filename: file.name, objectPath, url, size: file.size }),
        });
      }
      qc.invalidateQueries({ queryKey: ["website-media", businessId] });
    } finally {
      setUploading(false);
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/website/media/${id}?businessId=${businessId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["website-media", businessId] });
      setDeleteConfirm(null);
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Images className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">
            {mode === "select" ? "Choose from Library" : "Media Library"}
          </p>
          {items.length > 0 && <span className="text-xs text-muted-foreground">({items.length})</span>}
        </div>
        <div className="flex items-center gap-2">
          <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium cursor-pointer hover:bg-muted transition-colors ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
            {uploading ? "Uploading…" : "Upload"}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={e => { if (e.target.files) handleUpload(e.target.files); e.target.value = ""; }}
            />
          </label>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Close">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div
        className={`flex-1 overflow-y-auto p-4 relative transition-colors ${dragOver ? "bg-primary/5" : ""}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) handleUpload(e.dataTransfer.files); }}
      >
        {dragOver && (
          <div className="absolute inset-2 border-2 border-dashed border-primary rounded-xl pointer-events-none flex items-center justify-center z-10 bg-primary/5">
            <p className="text-primary text-sm font-medium">Drop images here to upload</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground">
            <Images className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">No images yet</p>
            <p className="text-xs mt-1 max-w-[200px] leading-relaxed">
              Upload images once, then reuse them anywhere on your site
            </p>
            <label className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary text-primary text-xs font-medium cursor-pointer hover:bg-primary/5 transition-colors">
              <ImagePlus className="w-3 h-3" />
              Upload your first image
              <input type="file" accept="image/*" multiple className="sr-only" onChange={e => { if (e.target.files) handleUpload(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {items.map(item => (
              <div key={item.id} className="group relative rounded-lg overflow-hidden border border-border bg-muted/30 aspect-square">
                {deleteConfirm === item.id ? (
                  <div className="absolute inset-0 bg-destructive/90 flex flex-col items-center justify-center gap-2 z-20">
                    <p className="text-white text-[10px] font-medium text-center px-2 leading-snug">Delete this image?</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => deleteMutation.mutate(item.id)}
                        disabled={deleteMutation.isPending}
                        className="px-2.5 py-0.5 bg-white text-destructive rounded text-[10px] font-semibold hover:bg-gray-100 transition-colors"
                      >
                        {deleteMutation.isPending ? "…" : "Delete"}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-2.5 py-0.5 bg-white/20 text-white rounded text-[10px] font-semibold hover:bg-white/30 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="absolute top-1.5 right-1.5 z-10 p-1 rounded bg-black/50 text-white/70 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setDeleteConfirm(item.id)}
                    title="Delete image"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}

                <button
                  type="button"
                  className={`absolute inset-0 w-full h-full ${mode === "select" ? "cursor-pointer" : "cursor-default"}`}
                  onClick={() => {
                    if (mode === "select" && onSelect) {
                      onSelect(item.url);
                      onClose?.();
                    }
                  }}
                >
                  <img src={item.url} alt={item.filename} className="w-full h-full object-cover" />
                  {mode === "select" && (
                    <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/20 transition-colors flex items-center justify-center">
                      <Check className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-opacity" />
                    </div>
                  )}
                </button>

                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1.5 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {item.filename}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
