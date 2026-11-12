import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ImagePlus, Loader2, Trash2, X, Check, Images, Search, LayoutGrid, List,
  Folder, FolderPlus, FolderOpen, Pencil, AlertTriangle, RefreshCw, MapPin,
  Sparkles, Wand2,
} from "lucide-react";
import { consumeWebsiteRenameBlurCommit, partitionWebsiteMediaFiles } from "./storageUtils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const SECTION_LABELS: Record<string, string> = {
  header: "Header",
  hero: "Hero Banner",
  services: "Services",
  about: "About Us",
  contact: "Contact Form",
  footer: "Footer",
  portfolio: "Portfolio",
  deposit: "Pay Deposit",
  image: "Image",
  columns: "Columns",
  testimonials: "Testimonials",
  faq: "FAQ",
  cta: "CTA Banner",
  stats: "Stats / Numbers",
  content: "Content Block",
  row: "Row",
  text: "Text Block",
  gallery: "Image Gallery",
  settings: "Site settings (logo/favicon)",
};

interface MediaItem {
  id: number;
  filename: string;
  displayName: string | null;
  url: string;
  size: number;
  uploadedAt: string;
  folderId: number | null;
  /** True once WebP / thumbnail / display variants have been generated. */
  optimized?: boolean;
  /** Path to 300×200 thumbnail variant (for faster grid display). */
  thumbnailObjectPath?: string | null;
  /** Accessibility alt text — editable by user, auto-filled by AI. */
  alt?: string | null;
}

interface MediaFolder {
  id: number;
  name: string;
  createdAt: string;
  itemCount: number;
}

interface UsageLocation {
  sectionId: string;
  sectionType: string;
}

interface MediaLibraryProps {
  businessId: number;
  mode?: "browse" | "select";
  onSelect?: (url: string) => void;
  onClose?: () => void;
}

function formatSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function displayLabel(item: MediaItem): string {
  return item.displayName || item.filename;
}

export function MediaLibrary({ businessId, mode = "browse", onSelect, onClose }: MediaLibraryProps) {
  const qc = useQueryClient();

  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    try {
      return localStorage.getItem("media-view-mode") === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  const [folderFilter, setFolderFilter] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);

  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<number | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState("");
  const folderRenameShouldCommitOnBlurRef = useRef(false);

  const [uploading, setUploading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [operationNotice, setOperationNotice] = useState<{ tone: "error" | "success"; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const [dragOverContent, setDragOverContent] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<number | "all" | null>(null);
  const isDraggingMediaRef = useRef(false);

  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const [detailRenaming, setDetailRenaming] = useState(false);
  const [detailRenameValue, setDetailRenameValue] = useState("");

  // A mounted library can be reused when the selected business changes. Never
  // carry selections, dialogs, or item details across business boundaries.
  useEffect(() => {
    setFolderFilter("all");
    setSearch("");
    setSelectedIds(new Set());
    setDetailItem(null);
    setRenamingId(null);
    setRenamingFolderId(null);
    setDetailRenaming(false);
    setDeleteConfirm(null);
    setBulkDeleteConfirm(false);
    setOperationNotice(null);
  }, [businessId]);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: items = [], isLoading, isError: mediaLoadFailed, refetch: refetchMedia } = useQuery<MediaItem[]>({
    queryKey: ["website-media", businessId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/website/media?businessId=${businessId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: !!businessId,
  });

  const { data: folders = [] } = useQuery<MediaFolder[]>({
    queryKey: ["website-media-folders", businessId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/website/media/folders?businessId=${businessId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!businessId,
  });

  const { data: usageCounts, isError: usageCountsFailed } = useQuery<Record<number, number>>({
    queryKey: ["website-media-usage", businessId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/website/media/usage-counts?businessId=${businessId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not verify image usage.");
      return res.json();
    },
    enabled: !!businessId,
  });

  const { data: usageDetails, isLoading: isLoadingDetails, isError: usageDetailsFailed } = useQuery<{ locations: UsageLocation[]; total: number }>({
    queryKey: ["website-media-usage-details", businessId, detailItem?.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/website/media/${detailItem!.id}/usage-details?businessId=${businessId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not verify image usage.");
      return res.json();
    },
    enabled: !!detailItem && mode === "browse" && !!businessId,
  });

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (search) {
        // When searching, ignore folder filter — cross-folder search
        return displayLabel(item).toLowerCase().includes(search.toLowerCase());
      }
      if (folderFilter !== "all" && item.folderId !== folderFilter) return false;
      return true;
    });
  }, [items, folderFilter, search]);

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["website-media", businessId] });
    qc.invalidateQueries({ queryKey: ["website-media-folders", businessId] });
    qc.invalidateQueries({ queryKey: ["website-media-usage", businessId] });
  }

  // ── Upload / Replace ──────────────────────────────────────────────────────

  async function handleUpload(files: FileList | File[]) {
    const { uploadable: fileArr, unsupported } = partitionWebsiteMediaFiles(Array.from(files));
    if (!fileArr.length) {
      if (unsupported.length) {
        setOperationNotice({
          tone: "error",
          message: `No images uploaded. Unsupported files: ${unsupported.map(file => file.name).join(", ")}.`,
        });
      }
      return;
    }
    // Keep every file in this batch in the folder selected when upload began,
    // even if the user changes the folder while sequential uploads are running.
    const destinationFolderId = folderFilter;
    setUploading(true);
    setOperationNotice(null);
    const succeeded: string[] = [];
    const failed: string[] = unsupported.map(file => `${file.name} (not an image file)`);
    try {
      for (const file of fileArr) {
        const formData = new FormData();
        formData.append("file", file);
        if (destinationFolderId !== "all") formData.append("folderId", String(destinationFolderId));
        const res = await fetch(`${BASE}/api/website/media/upload?businessId=${businessId}`, {
          method: "POST", credentials: "include", body: formData,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: string } | null;
          failed.push(`${file.name} (${body?.error ?? `HTTP ${res.status}`})`);
          continue;
        }
        succeeded.push(file.name);
      }
      invalidateAll();
      if (failed.length > 0) {
        setOperationNotice({
          tone: "error",
          message: `${succeeded.length} uploaded; ${failed.length} failed: ${failed.join(", ")}. Retry the failed files.`,
        });
      } else {
        setOperationNotice({ tone: "success", message: `${succeeded.length} image${succeeded.length === 1 ? "" : "s"} uploaded.` });
      }
    } catch {
      setOperationNotice({
        tone: "error",
        message: `${succeeded.length} uploaded; the remaining files could not be uploaded. Retry the failed files.`,
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleReplace(file: File, target: MediaItem) {
    setReplacing(true);
    setOperationNotice(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${BASE}/api/website/media/${target.id}/replace-upload?businessId=${businessId}`, {
        method: "POST", credentials: "include", body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setOperationNotice({ tone: "error", message: body?.error ?? "Replacement failed. Your original image is still in place. Retry." });
        return;
      }
      const body = await res.json().catch(() => null) as { cleanupWarnings?: string[]; replacedInDraft?: number } | null;
      invalidateAll();
      qc.invalidateQueries({ queryKey: ["website-media-usage-details", businessId, target.id] });
      setDetailItem(null);
      setOperationNotice(body?.cleanupWarnings?.length
        ? { tone: "error", message: `Image replaced, but old files could not all be cleaned up. ${body.cleanupWarnings[0]}` }
        : {
          tone: "success",
          message: body?.replacedInDraft
            ? "Replacement staged in the draft. The published website keeps the original until you publish."
            : "The new image is in your library. It is not live until you add it to the draft and publish.",
        });
    } catch {
      setOperationNotice({ tone: "error", message: "Replacement failed. Your original image is still in place. Retry." });
    } finally {
      setReplacing(false);
    }
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      if (usageCountsFailed || !usageCounts) {
        throw new Error("Image usage could not be verified. Retry loading the Media Library before deleting images.");
      }
      const res = await fetch(`${BASE}/api/website/media/${id}?businessId=${businessId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => null) as { error?: string } | null)?.error ?? "Delete failed");
      return res.json() as Promise<{ cleanupWarnings?: string[] }>;
    },
    onSuccess: (result, id) => {
      invalidateAll();
      setDeleteConfirm(null);
      setSelectedIds(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (renamingId === id) setRenamingId(null);
      if (detailItem?.id === id) setDetailItem(null);
      setOperationNotice(result.cleanupWarnings?.length
        ? { tone: "error", message: `Image deleted, but cleanup needs attention: ${result.cleanupWarnings[0]}` }
        : { tone: "success", message: "Image deleted." });
    },
    onError: (error) => setOperationNotice({ tone: "error", message: error.message }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      if (usageCountsFailed || !usageCounts) {
        throw new Error("Image usage could not be verified. Retry loading the Media Library before deleting images.");
      }
      const res = await fetch(`${BASE}/api/website/media/bulk-delete?businessId=${businessId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null) as { error?: string } | null)?.error ?? "Bulk delete failed");
      return res.json() as Promise<{ deleted: number; cleanupWarnings?: string[] }>;
    },
    onSuccess: (result) => {
      invalidateAll();
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      setOperationNotice(result.cleanupWarnings?.length
        ? { tone: "error", message: `${result.deleted} images deleted, but cleanup needs attention: ${result.cleanupWarnings[0]}` }
        : { tone: "success", message: `${result.deleted} images deleted.` });
    },
    onError: (error) => setOperationNotice({ tone: "error", message: error.message }),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, displayName }: { id: number; displayName: string }) => {
      const res = await fetch(`${BASE}/api/website/media/${id}?businessId=${businessId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ displayName: displayName || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not rename image.");
      }
      return res.json();
    },
    onSuccess: (updated: MediaItem) => {
      qc.invalidateQueries({ queryKey: ["website-media", businessId] });
      setRenamingId(null);
      setDetailRenaming(false);
      if (detailItem?.id === updated.id) setDetailItem(updated);
    },
    onError: (error) => setOperationNotice({ tone: "error", message: error.message }),
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, folderId }: { id: number; folderId: number | null }) => {
      const res = await fetch(`${BASE}/api/website/media/${id}?businessId=${businessId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ folderId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not move image.");
      }
      return res.json();
    },
    onSuccess: (updated: MediaItem) => {
      invalidateAll();
      if (detailItem?.id === updated.id) setDetailItem(updated);
    },
    onError: (error) => setOperationNotice({ tone: "error", message: error.message }),
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${BASE}/api/website/media/folders?businessId=${businessId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not create folder.");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["website-media-folders", businessId] });
      setShowNewFolder(false);
      setNewFolderName("");
    },
    onError: (error) => setOperationNotice({ tone: "error", message: error.message }),
  });

  const renameFolderMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await fetch(`${BASE}/api/website/media/folders/${id}?businessId=${businessId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not rename folder.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["website-media-folders", businessId] });
      setRenamingFolderId(null);
    },
    onError: (error) => setOperationNotice({ tone: "error", message: error.message }),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/website/media/folders/${id}?businessId=${businessId}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not delete folder.");
      }
    },
    onSuccess: () => {
      invalidateAll();
      if (folderFilter !== "all") setFolderFilter("all");
    },
    onError: (error) => setOperationNotice({ tone: "error", message: error.message }),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function changeViewMode(m: "grid" | "list") {
    setViewMode(m);
    try { localStorage.setItem("media-view-mode", m); } catch { /* storage is optional */ }
  }

  function handleItemDragStart(itemId: number, e: React.DragEvent) {
    isDraggingMediaRef.current = true;
    e.dataTransfer.setData("x-media-id", itemId.toString());
    e.dataTransfer.effectAllowed = "move";
  }

  function handleItemDragEnd() {
    isDraggingMediaRef.current = false;
    setDragOverFolderId(null);
  }

  function handleFolderDrop(e: React.DragEvent, targetFolderId: number | null) {
    e.preventDefault();
    setDragOverFolderId(null);
    const itemIdStr = e.dataTransfer.getData("x-media-id");
    if (itemIdStr) {
      const itemId = parseInt(itemIdStr);
      moveMutation.mutate({ id: itemId, folderId: targetFolderId });
    }
  }

  const selectedWithUsage = Array.from(selectedIds).filter(id => (usageCounts?.[id] ?? 0) > 0).length;
  const currentFolderName = folderFilter === "all" ? null : folders.find(f => f.id === folderFilter)?.name ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border flex-shrink-0">
        <Images className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-sm font-semibold text-foreground flex-shrink-0">
          {mode === "select" ? "Choose Image" : "Media Library"}
        </span>

        <div className="flex-1 relative min-w-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search all images…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-6 pr-3 py-1 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <div className="flex border border-border rounded-md overflow-hidden">
            <button onClick={() => changeViewMode("grid")}
              className={`p-1 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`} title="Grid">
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => changeViewMode("list")}
              className={`p-1 transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`} title="List">
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <label className={`flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium cursor-pointer hover:opacity-90 transition-opacity ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
            {uploading ? "Uploading…" : "Upload"}
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="sr-only" disabled={uploading}
              onChange={e => { if (e.target.files) handleUpload(e.target.files); e.target.value = ""; }} />
          </label>

          {onClose && (
            <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {operationNotice && (
        <div className={`flex items-start gap-2 px-4 py-2 text-xs border-b ${
          operationNotice.tone === "error"
            ? "bg-destructive/10 border-destructive/20 text-destructive"
            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
        }`}>
          {operationNotice.tone === "error" ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
          <span className="flex-1">{operationNotice.message}</span>
          <button type="button" onClick={() => setOperationNotice(null)} className="opacity-70 hover:opacity-100" aria-label="Dismiss notification">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Bulk bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-primary/10 border-b border-primary/20 flex-shrink-0">
          <span className="text-xs font-medium text-primary">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
            {selectedWithUsage > 0 && (
              <span className="text-[10px] text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{selectedWithUsage} in use
              </span>
            )}
            <button onClick={() => setBulkDeleteConfirm(true)}
              className="flex items-center gap-1 px-2 py-0.5 bg-destructive text-destructive-foreground text-[11px] font-medium rounded hover:opacity-90">
              <Trash2 className="w-3 h-3" />Delete
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="text-[11px] text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Folder sidebar */}
        <div className="w-36 flex-shrink-0 border-r border-border overflow-y-auto bg-muted/15 flex flex-col py-1.5">
          {/* "All images" — also a drop target to remove from folder */}
          <button
            onClick={() => setFolderFilter("all")}
            onDragOver={e => { e.preventDefault(); if (isDraggingMediaRef.current) setDragOverFolderId("all"); }}
            onDragLeave={() => setDragOverFolderId(null)}
            onDrop={e => handleFolderDrop(e, null)}
            className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs transition-colors rounded-r-sm mr-1
              ${dragOverFolderId === "all" ? "bg-primary/20 text-primary" : folderFilter === "all" ? "text-primary font-semibold bg-primary/10" : "text-foreground hover:bg-muted/50"}`}
          >
            <Images className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
            <span className="flex-1 truncate">All images</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{items.length}</span>
          </button>

          {folders.map(folder => (
            <div key={folder.id} className="group relative">
              {renamingFolderId === folder.id ? (
                <div className="px-2 py-1">
                  <input
                    autoFocus
                    aria-label="Rename folder"
                    maxLength={100}
                    value={renameFolderValue}
                    onChange={e => setRenameFolderValue(e.target.value)}
                    onBlur={() => {
                      if (!consumeWebsiteRenameBlurCommit(folderRenameShouldCommitOnBlurRef)) return;
                      if (renameFolderValue.trim()) renameFolderMutation.mutate({ id: folder.id, name: renameFolderValue.trim() });
                      else setRenamingFolderId(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        folderRenameShouldCommitOnBlurRef.current = false;
                        setRenamingFolderId(null);
                      }
                    }}
                    className="w-full text-xs border border-primary rounded px-1.5 py-0.5 focus:outline-none bg-background"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setFolderFilter(folder.id)}
                  onDoubleClick={() => { folderRenameShouldCommitOnBlurRef.current = true; setRenamingFolderId(folder.id); setRenameFolderValue(folder.name); }}
                  onDragOver={e => { e.preventDefault(); if (isDraggingMediaRef.current) setDragOverFolderId(folder.id); }}
                  onDragLeave={() => setDragOverFolderId(null)}
                  onDrop={e => handleFolderDrop(e, folder.id)}
                  className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs transition-colors rounded-r-sm mr-1
                    ${dragOverFolderId === folder.id ? "bg-primary/25 text-primary scale-[1.01]" : folderFilter === folder.id ? "text-primary font-semibold bg-primary/10" : "text-foreground hover:bg-muted/50"}`}
                >
                  {dragOverFolderId === folder.id
                    ? <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                    : folderFilter === folder.id
                      ? <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                      : <Folder className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />}
                  <span className="flex-1 truncate">{folder.name}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{folder.itemCount}</span>
                </button>
              )}
              <div className="absolute right-0.5 top-1/2 -translate-y-1/2 hidden items-center gap-0 group-hover:flex group-focus-within:flex">
                <button type="button" onClick={() => { folderRenameShouldCommitOnBlurRef.current = true; setRenamingFolderId(folder.id); setRenameFolderValue(folder.name); }}
                  className="p-0.5 rounded text-muted-foreground hover:text-primary"
                  title="Rename" aria-label={`Rename ${folder.name} folder`}>
                  <Pencil className="w-2.5 h-2.5" />
                </button>
                <button type="button" onClick={() => deleteFolderMutation.mutate(folder.id)}
                  className="p-0.5 rounded text-muted-foreground hover:text-destructive"
                  title="Delete" aria-label={`Delete ${folder.name} folder`}>
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          ))}

          <div className="mt-auto pt-1 border-t border-border/50 mx-2">
            {showNewFolder ? (
              <div className="py-1">
                <input
                  autoFocus
                  aria-label="New folder name"
                  maxLength={100}
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  onBlur={() => { if (!newFolderName.trim()) setShowNewFolder(false); }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newFolderName.trim()) createFolderMutation.mutate(newFolderName.trim());
                    if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); }
                  }}
                  className="w-full text-xs border border-primary rounded px-1.5 py-0.5 focus:outline-none bg-background"
                />
              </div>
            ) : (
              <button
                onClick={() => setShowNewFolder(true)}
                className="flex items-center gap-1.5 w-full py-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
              >
                <FolderPlus className="w-3 h-3" />New folder
              </button>
            )}
          </div>
        </div>

        {/* Main grid/list + detail panel */}
        <div className="flex flex-1 min-w-0 min-h-0">
          <div
            className={`flex-1 overflow-y-auto p-2.5 relative transition-colors ${dragOverContent ? "bg-primary/5" : ""}`}
            onDragOver={e => {
              e.preventDefault();
              if (!isDraggingMediaRef.current) setDragOverContent(true);
            }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverContent(false); }}
            onDrop={e => {
              e.preventDefault();
              setDragOverContent(false);
              if (!isDraggingMediaRef.current && e.dataTransfer.files.length > 0) {
                handleUpload(e.dataTransfer.files);
              }
            }}
          >
            {dragOverContent && !isDraggingMediaRef.current && (
              <div className="absolute inset-1 border-2 border-dashed border-primary rounded-xl pointer-events-none flex items-center justify-center z-10">
                <p className="text-primary text-sm font-medium">Drop to upload</p>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : mediaLoadFailed ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-center text-muted-foreground">
                <AlertTriangle className="w-7 h-7 text-destructive/80" />
                <p className="text-sm font-medium text-foreground">Couldn’t load your media library</p>
                <p className="text-xs">Your images are safe. Try again to reconnect.</p>
                <button type="button" onClick={() => refetchMedia()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary text-primary text-xs font-medium hover:bg-primary/5">
                  <RefreshCw className="w-3 h-3" />Retry
                </button>
              </div>
            ) : filteredItems.length === 0 ? (
              <EmptyState
                hasItems={items.length > 0}
                search={search}
                folderName={currentFolderName}
                onUpload={() => fileInputRef.current?.click()}
              />
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-3 gap-2">
                {filteredItems.map(item => (
                  <GridItem
                    key={item.id}
                    item={item}
                    usageCount={usageCounts?.[item.id] ?? 0}
                    selected={selectedIds.has(item.id)}
                    isActive={detailItem?.id === item.id}
                    isDeleteConfirm={deleteConfirm === item.id}
                    deleting={deleteMutation.isPending && deleteConfirm === item.id}
                    mode={mode}
                    onActivate={() => {
                      if (mode === "select") { onSelect?.(item.url); onClose?.(); }
                      else { setDetailItem(item); setDeleteConfirm(null); }
                    }}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onDeleteRequest={() => setDeleteConfirm(item.id)}
                    onDeleteCancel={() => setDeleteConfirm(null)}
                    onDelete={() => deleteMutation.mutate(item.id)}
                    onDragStart={e => handleItemDragStart(item.id, e)}
                    onDragEnd={handleItemDragEnd}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredItems.map(item => (
                  <ListItem
                    key={item.id}
                    item={item}
                    usageCount={usageCounts?.[item.id] ?? 0}
                    selected={selectedIds.has(item.id)}
                    isActive={detailItem?.id === item.id}
                    renamingId={renamingId}
                    renameValue={renameValue}
                    renameRef={renameRef as any}
                    folders={folders}
                    mode={mode}
                    onActivate={() => {
                      if (mode === "select") { onSelect?.(item.url); onClose?.(); }
                      else { setDetailItem(item); setDeleteConfirm(null); }
                    }}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onStartRename={() => { setRenamingId(item.id); setRenameValue(item.displayName ?? item.filename); }}
                    onRenameChange={setRenameValue}
                    onRenameCommit={() => renameMutation.mutate({ id: item.id, displayName: renameValue.trim() })}
                    onRenameCancel={() => setRenamingId(null)}
                    isDeleteConfirm={deleteConfirm === item.id}
                    deleting={deleteMutation.isPending && deleteConfirm === item.id}
                    onDeleteRequest={() => setDeleteConfirm(item.id)}
                    onDeleteCancel={() => setDeleteConfirm(null)}
                    onDelete={() => deleteMutation.mutate(item.id)}
                    onMoveToFolder={folderId => moveMutation.mutate({ id: item.id, folderId })}
                    onDragStart={e => handleItemDragStart(item.id, e)}
                    onDragEnd={handleItemDragEnd}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          {detailItem && mode === "browse" && (
            <DetailPanel
              key={detailItem.id}
              item={detailItem}
              businessId={businessId}
              usageDetails={usageDetails ?? null}
              usageDetailsFailed={usageDetailsFailed}
              isLoadingDetails={isLoadingDetails}
              folders={folders}
              replacing={replacing}
              detailRenaming={detailRenaming}
              detailRenameValue={detailRenameValue}
              isDeleting={deleteMutation.isPending && deleteConfirm === detailItem.id}
              isDeleteConfirm={deleteConfirm === detailItem.id}
              onClose={() => { setDetailItem(null); setDeleteConfirm(null); }}
              onStartRename={() => { setDetailRenaming(true); setDetailRenameValue(detailItem.displayName ?? detailItem.filename); }}
              onRenameChange={setDetailRenameValue}
              onRenameCommit={() => renameMutation.mutate({ id: detailItem.id, displayName: detailRenameValue.trim() })}
              onRenameCancel={() => setDetailRenaming(false)}
              onMoveToFolder={folderId => moveMutation.mutate({ id: detailItem.id, folderId })}
              onDeleteRequest={() => setDeleteConfirm(detailItem.id)}
              onDeleteCancel={() => setDeleteConfirm(null)}
              onDelete={() => deleteMutation.mutate(detailItem.id)}
              onReplace={() => replaceInputRef.current?.click()}
              onEnhanceDone={() => qc.invalidateQueries({ queryKey: ["website-media", businessId] })}
            />
          )}
        </div>
      </div>

      {/* Bulk delete dialog */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center z-[200]">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-xs w-full mx-4">
            <h3 className="font-semibold text-sm mb-2">Delete {selectedIds.size} image{selectedIds.size > 1 ? "s" : ""}?</h3>
            {selectedWithUsage > 0 && (
              <div className="flex items-start gap-2 mb-3 p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  {selectedWithUsage} image{selectedWithUsage > 1 ? "s are" : " is"} used on your site. Deleting removes them from the library and existing pages may no longer display them.
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground mb-4">This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setBulkDeleteConfirm(false)} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted">Cancel</button>
              <button
                onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                disabled={bulkDeleteMutation.isPending}
                className="px-3 py-1.5 text-xs bg-destructive text-destructive-foreground rounded-lg hover:opacity-90 disabled:opacity-60"
              >
                {bulkDeleteMutation.isPending ? "Deleting…" : "Delete all"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden replace file input */}
      <input ref={replaceInputRef} type="file" accept="image/*" className="sr-only"
        onChange={e => {
          if (e.target.files?.[0] && detailItem) handleReplace(e.target.files[0], detailItem);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function EmptyState({ hasItems, search, folderName, onUpload }: {
  hasItems: boolean; search: string; folderName: string | null; onUpload: () => void;
}) {
  if (search) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground">
        <Search className="w-8 h-8 mb-2 opacity-20" />
        <p className="text-sm font-medium">No results for "{search}"</p>
        <p className="text-xs mt-0.5">Try a different search term</p>
      </div>
    );
  }
  if (hasItems && folderName) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground">
        <Folder className="w-8 h-8 mb-2 opacity-20" />
        <p className="text-sm font-medium">"{folderName}" is empty</p>
        <p className="text-xs mt-0.5">Upload images here, or drag an image from the grid onto this folder</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground">
      <Images className="w-12 h-12 mb-3 opacity-20" />
      <p className="text-sm font-medium">No images yet</p>
      <p className="text-xs mt-1 max-w-[200px] leading-relaxed">Upload images once, then reuse them anywhere on your site</p>
      <button onClick={onUpload} className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary text-primary text-xs font-medium hover:bg-primary/5 transition-colors">
        <ImagePlus className="w-3 h-3" />Upload your first image
      </button>
    </div>
  );
}

function UsageBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-semibold bg-blue-500 text-white leading-4"
      title={`Used in ${count} section${count > 1 ? "s" : ""}`}>
      {count}
    </span>
  );
}

function GridItem({ item, usageCount, selected, isActive, isDeleteConfirm, deleting, mode,
  onActivate, onToggleSelect, onDeleteRequest, onDeleteCancel, onDelete, onDragStart, onDragEnd }: {
  item: MediaItem; usageCount: number; selected: boolean; isActive: boolean;
  isDeleteConfirm: boolean; deleting: boolean; mode: string;
  onActivate: () => void; onToggleSelect: () => void;
  onDeleteRequest: () => void; onDeleteCancel: () => void; onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group relative rounded-lg overflow-hidden border bg-muted/30 aspect-square cursor-grab active:cursor-grabbing transition-all
        ${isActive ? "border-primary ring-1 ring-primary" : selected ? "border-primary/60" : "border-border hover:border-muted-foreground/50"}`}
    >
      {isDeleteConfirm ? (
        <div className="absolute inset-0 bg-destructive/90 flex flex-col items-center justify-center gap-2 z-20">
          <p className="text-white text-[10px] font-medium text-center px-2">Delete this image?</p>
          {usageCount > 0 && (
            <p className="text-white/90 text-[9px] text-center px-2">
              Used in {usageCount} site section{usageCount === 1 ? "" : "s"}.
            </p>
          )}
          <div className="flex gap-1.5">
            <button onClick={onDelete} disabled={deleting || usageCount > 0}
              className="px-2 py-0.5 bg-white text-destructive rounded text-[10px] font-semibold hover:bg-gray-100 disabled:opacity-50">
              {deleting ? "…" : usageCount > 0 ? "In use" : "Delete"}
            </button>
            <button onClick={onDeleteCancel}
              className="px-2 py-0.5 bg-white/20 text-white rounded text-[10px] font-semibold hover:bg-white/30">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={e => { e.stopPropagation(); onToggleSelect(); }}
            className={`absolute top-1 left-1 z-10 w-4 h-4 rounded border flex items-center justify-center transition-all
              ${selected ? "bg-primary border-primary opacity-100" : "bg-white/80 border-gray-400 opacity-0 group-hover:opacity-100"}`}
          >
            {selected && <Check className="w-2.5 h-2.5 text-white" />}
          </button>

          {usageCount > 0 && (
            <div className="absolute top-1 right-1 z-10">
              <UsageBadge count={usageCount} />
            </div>
          )}

          {item.optimized && (
            <div className="absolute top-1 left-5 z-10" title="Photo optimized — WebP variant ready">
              <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-semibold bg-emerald-500 text-white leading-4">
                <Sparkles className="w-2 h-2" />Optimized
              </span>
            </div>
          )}

          <button
            onClick={e => { e.stopPropagation(); onDeleteRequest(); }}
            className="absolute bottom-1 right-1 z-10 p-0.5 rounded bg-black/50 text-white/70 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>

          <button type="button" className={`absolute inset-0 w-full h-full cursor-${mode === "select" ? "pointer" : "grab"}`} onClick={onActivate}>
            <img src={item.url} alt={displayLabel(item)} className="w-full h-full object-cover" draggable={false} />
            {mode === "select" && (
              <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/20 transition-colors flex items-center justify-center">
                <Check className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-opacity" />
              </div>
            )}
          </button>

          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-1.5 py-1.5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="text-white text-[9px] truncate leading-tight">{displayLabel(item)}</p>
          </div>
        </>
      )}
    </div>
  );
}

function ListItem({ item, usageCount, selected, isActive, renamingId, renameValue, renameRef, folders, mode,
  isDeleteConfirm, deleting, onActivate, onToggleSelect, onStartRename, onRenameChange, onRenameCommit, onRenameCancel,
  onDeleteRequest, onDeleteCancel, onDelete, onMoveToFolder, onDragStart, onDragEnd }: {
  item: MediaItem; usageCount: number; selected: boolean; isActive: boolean;
  renamingId: number | null; renameValue: string; renameRef: React.RefObject<HTMLInputElement>;
  folders: MediaFolder[]; mode: string; isDeleteConfirm: boolean; deleting: boolean;
  onActivate: () => void; onToggleSelect: () => void;
  onStartRename: () => void; onRenameChange: (v: string) => void;
  onRenameCommit: () => void; onRenameCancel: () => void;
  onDeleteRequest: () => void; onDeleteCancel: () => void; onDelete: () => void;
  onMoveToFolder: (folderId: number | null) => void;
  onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void;
}) {
  const isRenaming = renamingId === item.id;
  const renameShouldCommitOnBlurRef = useRef(false);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg group cursor-grab active:cursor-grabbing transition-colors
        ${isActive ? "bg-primary/8 border border-primary/30" : selected ? "bg-primary/5" : "hover:bg-muted/50"}`}
      onClick={onActivate}
    >
      <button type="button" aria-label={selected ? "Deselect image" : "Select image"} onClick={e => { e.stopPropagation(); onToggleSelect(); }} className="flex-shrink-0">
        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors
          ${selected ? "bg-primary border-primary" : "border-border group-hover:border-muted-foreground"}`}>
          {selected && <Check className="w-2.5 h-2.5 text-white" />}
        </div>
      </button>

      <div className="w-8 h-8 rounded overflow-hidden border border-border flex-shrink-0 bg-muted">
        <img src={item.url} alt="" className="w-full h-full object-cover" draggable={false} />
      </div>

      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={e => onRenameChange(e.target.value)}
            onBlur={() => {
              if (consumeWebsiteRenameBlurCommit(renameShouldCommitOnBlurRef)) onRenameCommit();
            }}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                renameShouldCommitOnBlurRef.current = false;
                onRenameCancel();
              }
            }}
            onClick={e => e.stopPropagation()}
            className="w-full text-xs border border-primary rounded px-1.5 py-0.5 focus:outline-none bg-background"
          />
        ) : (
          <button type="button" onClick={e => { e.stopPropagation(); onActivate(); }}
            className="block w-full text-left text-xs font-medium text-foreground truncate">{displayLabel(item)}</button>
        )}
        <p className="text-[10px] text-muted-foreground">{formatSize(item.size)} · {formatDate(item.uploadedAt)}</p>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <UsageBadge count={usageCount} />
        {item.optimized && (
          <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 leading-4" title="Optimized">
            <Sparkles className="w-2 h-2" />
          </span>
        )}
        {folders.length > 0 && (
          <div onClick={e => e.stopPropagation()}>
            <select
              value={item.folderId ?? ""}
              onChange={e => onMoveToFolder(e.target.value ? parseInt(e.target.value) : null)}
              className="text-[10px] border border-border rounded px-1 py-0.5 bg-background text-muted-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary max-w-[80px]"
              title="Move to folder"
            >
              <option value="">No folder</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}
        <button type="button" aria-label={`Rename ${displayLabel(item)}`} onClick={e => { e.stopPropagation(); renameShouldCommitOnBlurRef.current = true; onStartRename(); }}
          className="p-1 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          <Pencil className="w-3 h-3" />
        </button>
        {isDeleteConfirm ? (
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <span className="text-[10px] text-destructive font-medium">Delete?</span>
            {usageCount > 0 && <span className="text-[9px] text-amber-600">{usageCount} in use</span>}
            <button type="button" onClick={onDelete} disabled={deleting || usageCount > 0}
              className="px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground text-[10px] font-semibold disabled:opacity-60">
              {deleting ? "…" : usageCount > 0 ? "In use" : "Yes"}
            </button>
            <button type="button" onClick={onDeleteCancel} disabled={deleting}
              className="px-1.5 py-0.5 rounded border border-border text-[10px] disabled:opacity-60">
              No
            </button>
          </div>
        ) : (
          <button type="button" onClick={e => { e.stopPropagation(); onDeleteRequest(); }}
            className="p-1 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" title="Delete" aria-label="Delete image">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function DetailPanel({ item, businessId, usageDetails, usageDetailsFailed, isLoadingDetails, folders, replacing,
  detailRenaming, detailRenameValue, isDeleting, isDeleteConfirm,
  onClose, onStartRename, onRenameChange, onRenameCommit, onRenameCancel,
  onMoveToFolder, onDeleteRequest, onDeleteCancel, onDelete, onReplace, onEnhanceDone }: {
  item: MediaItem;
  businessId: number;
  usageDetails: { locations: UsageLocation[]; total: number } | null;
  usageDetailsFailed: boolean;
  isLoadingDetails: boolean;
  folders: MediaFolder[];
  replacing: boolean;
  detailRenaming: boolean;
  detailRenameValue: string;
  isDeleting: boolean;
  isDeleteConfirm: boolean;
  onClose: () => void;
  onStartRename: () => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onMoveToFolder: (folderId: number | null) => void;
  onDeleteRequest: () => void;
  onDeleteCancel: () => void;
  onDelete: () => void;
  onReplace: () => void;
  onEnhanceDone: () => void;
}) {
  // ── Enhance panel state ────────────────────────────────────────────────────
  const [showEnhance, setShowEnhance] = useState(false);
  const [enhBrighten, setEnhBrighten]       = useState(false);
  const [enhStraighten, setEnhStraighten]   = useState(false);
  const [enhCrop, setEnhCrop]               = useState<"16:9" | "4:3" | "1:1" | "">("");
  const [isEnhancing, setIsEnhancing]       = useState(false);
  const [enhError, setEnhError]             = useState<string | null>(null);

  // ── Alt text state ─────────────────────────────────────────────────────────
  const [altValue, setAltValue]         = useState(item.alt ?? "");
  const [altSaving, setAltSaving]       = useState(false);
  const [altGenerating, setAltGenerating] = useState(false);
  const [altError, setAltError]         = useState<string | null>(null);
  const [altSaved, setAltSaved]         = useState(false);
  const renameShouldCommitOnBlurRef = useRef(false);

  async function handleSaveAlt() {
    if (altSaving) return;
    setAltSaving(true);
    setAltError(null);
    setAltSaved(false);
    try {
      const res = await fetch(`${BASE}/api/website/media/${item.id}?businessId=${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ alt: altValue || null }),
      });
      if (!res.ok) throw new Error("Failed to save alt text");
      setAltSaved(true);
      setTimeout(() => setAltSaved(false), 1800);
      onEnhanceDone();
    } catch {
      setAltError("Failed to save");
    } finally {
      setAltSaving(false);
    }
  }

  async function handleGenerateAlt() {
    if (altGenerating) return;
    setAltGenerating(true);
    setAltError(null);
    try {
      const res = await fetch(`${BASE}/api/website/media/${item.id}/generate-alt?businessId=${businessId}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("AI generation failed");
      const data = await res.json() as { alt: string };
      setAltValue(data.alt);
    } catch {
      setAltError("AI generation failed");
    } finally {
      setAltGenerating(false);
    }
  }

  const hasEnhancement = enhBrighten || enhStraighten || enhCrop !== "";

  async function handleApplyEnhance() {
    if (!hasEnhancement || isEnhancing) return;
    setIsEnhancing(true);
    setEnhError(null);
    try {
      const res = await fetch(
        `${BASE}/api/website/media/${item.id}/enhance?businessId=${businessId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            enhancements: {
              brighten:    enhBrighten    || undefined,
              straighten:  enhStraighten  || undefined,
              crop:        enhCrop || undefined,
            },
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Enhance failed");
      }
      // Reset toggles and close panel
      setEnhBrighten(false);
      setEnhStraighten(false);
      setEnhCrop("");
      setShowEnhance(false);
      onEnhanceDone();
    } catch (e) {
      setEnhError(e instanceof Error ? e.message : "Enhance failed");
    } finally {
      setIsEnhancing(false);
    }
  }

  return (
    <div className="w-52 flex-shrink-0 border-l border-border overflow-y-auto bg-muted/10 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Details</p>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-2 border-b border-border/50 flex-shrink-0">
        <div className="aspect-square rounded-lg overflow-hidden bg-muted border border-border relative">
          <img src={item.url} alt={displayLabel(item)} className="w-full h-full object-cover" />
          {item.optimized && (
            <div className="absolute bottom-1 right-1">
              <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-semibold bg-emerald-500 text-white leading-4">
                <Sparkles className="w-2 h-2" />Optimized
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="p-3 space-y-3 flex-1 overflow-y-auto">
        {/* Name */}
        <div>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1">Name</p>
          {detailRenaming ? (
            <input
              autoFocus
              value={detailRenameValue}
              onChange={e => onRenameChange(e.target.value)}
              onBlur={() => {
                if (consumeWebsiteRenameBlurCommit(renameShouldCommitOnBlurRef)) onRenameCommit();
              }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  renameShouldCommitOnBlurRef.current = false;
                  onRenameCancel();
                }
              }}
              className="w-full text-xs border border-primary rounded px-1.5 py-1 focus:outline-none bg-background"
            />
          ) : (
            <button onClick={() => { renameShouldCommitOnBlurRef.current = true; onStartRename(); }} className="group/name flex items-center gap-1 w-full text-left" title="Click to rename">
              <p className="text-xs text-foreground font-medium break-all line-clamp-2 flex-1">{displayLabel(item)}</p>
              <Pencil className="w-2.5 h-2.5 text-muted-foreground flex-shrink-0 opacity-0 group-hover/name:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        {/* Meta */}
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground">{formatSize(item.size)}</p>
          <p className="text-[10px] text-muted-foreground">{formatDate(item.uploadedAt)}</p>
        </div>

        {/* Usage locations */}
        <div>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1 flex items-center gap-1">
            <MapPin className="w-2.5 h-2.5" />Used in
          </p>
          {isLoadingDetails ? (
            <div className="flex items-center gap-1 py-1">
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Checking…</span>
            </div>
          ) : usageDetailsFailed ? (
            <p className="text-[11px] text-destructive">Could not verify image usage. Try again before deleting.</p>
          ) : !usageDetails || usageDetails.total === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">Not used on site</p>
          ) : (
            <ul className="space-y-0.5">
              {usageDetails.locations.map((loc, i) => (
                <li key={i} className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                  <span className="text-[11px] text-foreground truncate">
                    {SECTION_LABELS[loc.sectionType] ?? loc.sectionType}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Folder */}
        {folders.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1">Folder</p>
            <select
              value={item.folderId ?? ""}
              onChange={e => onMoveToFolder(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full text-xs border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">No folder</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}

        {/* ── Alt text ─────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Alt Text</p>
            <button
              type="button"
              onClick={handleGenerateAlt}
              disabled={altGenerating}
              title="Generate with AI"
              className="flex items-center gap-0.5 text-[9px] text-purple-600 hover:text-purple-700 disabled:opacity-50 font-medium"
            >
              {altGenerating
                ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                : <Sparkles className="w-2.5 h-2.5" />}
              AI
            </button>
          </div>
          <textarea
            rows={2}
            value={altValue}
            onChange={e => setAltValue(e.target.value)}
            placeholder="Describe this image for screen readers and SEO…"
            className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-snug"
          />
          {altError && <p className="text-[9px] text-destructive mt-0.5">{altError}</p>}
          <button
            type="button"
            onClick={handleSaveAlt}
            disabled={altSaving}
            className="mt-1 w-full flex items-center justify-center gap-1 text-[10px] font-medium border border-border rounded-md py-1 hover:bg-muted transition-colors disabled:opacity-50"
          >
            {altSaving
              ? <><Loader2 className="w-2.5 h-2.5 animate-spin" />Saving…</>
              : altSaved
              ? <><Check className="w-2.5 h-2.5 text-emerald-500" />Saved</>
              : "Save Alt"}
          </button>
        </div>

        {/* ── Enhance panel ────────────────────────────────────────────────── */}
        {showEnhance && (
          <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10 p-2.5 space-y-2">
            <p className="text-[10px] font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-1">
              <Wand2 className="w-3 h-3" />Enhance Options
            </p>

            {/* Toggle: Straighten */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={enhStraighten} onChange={e => setEnhStraighten(e.target.checked)}
                className="w-3 h-3 rounded border-border accent-purple-600" />
              <span className="text-[11px] text-foreground">Straighten (fix EXIF rotation)</span>
            </label>

            {/* Toggle: Brighten */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={enhBrighten} onChange={e => setEnhBrighten(e.target.checked)}
                className="w-3 h-3 rounded border-border accent-purple-600" />
              <span className="text-[11px] text-foreground">Auto-Brighten</span>
            </label>

            {/* Crop ratio */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Crop to ratio</p>
              <div className="flex flex-wrap gap-1">
                {(["", "16:9", "4:3", "1:1"] as const).map(ratio => (
                  <button key={ratio} type="button"
                    onClick={() => setEnhCrop(ratio)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                      enhCrop === ratio
                        ? "bg-purple-600 text-white border-purple-600"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {ratio === "" ? "None" : ratio}
                  </button>
                ))}
              </div>
            </div>

            {enhError && <p className="text-[10px] text-destructive">{enhError}</p>}

            <div className="flex gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={handleApplyEnhance}
                disabled={!hasEnhancement || isEnhancing}
                className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-md px-2 py-1.5 transition-colors disabled:opacity-50"
              >
                {isEnhancing
                  ? <><Loader2 className="w-3 h-3 animate-spin" />Applying…</>
                  : <><Sparkles className="w-3 h-3" />Apply</>}
              </button>
              <button type="button" onClick={() => setShowEnhance(false)}
                className="px-2 py-1.5 rounded-md text-[11px] text-muted-foreground hover:text-foreground border border-border transition-colors">
                Cancel
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground leading-tight">
              Creates a new enhanced copy — original is preserved.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-border space-y-2 flex-shrink-0">
        {!showEnhance && (
          <button onClick={() => { setShowEnhance(true); setEnhError(null); }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">
            <Wand2 className="w-3 h-3" />
            Enhance ✨
          </button>
        )}
        <button onClick={onReplace} disabled={replacing}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-60">
          {replacing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {replacing ? "Replacing…" : "Replace everywhere"}
        </button>
        {isDeleteConfirm ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 space-y-2">
            <p className="text-[11px] font-medium text-destructive">Delete this image permanently?</p>
            {usageDetails?.total ? (
              <p className="text-[10px] text-destructive/80">It is currently used in {usageDetails.total} site section{usageDetails.total === 1 ? "" : "s"}.</p>
            ) : null}
            <div className="flex gap-2">
              <button type="button" onClick={onDelete} disabled={isDeleting || isLoadingDetails || usageDetailsFailed || (usageDetails?.total ?? 0) > 0}
                className="flex-1 px-2 py-1 text-[10px] font-semibold bg-destructive text-destructive-foreground rounded disabled:opacity-60">
                {isDeleting ? "Deleting…" : isLoadingDetails ? "Checking…" : usageDetailsFailed ? "Usage unavailable" : (usageDetails?.total ?? 0) > 0 ? "In use" : "Delete"}
              </button>
              <button type="button" onClick={onDeleteCancel} disabled={isDeleting}
                className="flex-1 px-2 py-1 text-[10px] border border-border rounded disabled:opacity-60">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={onDeleteRequest} disabled={isDeleting}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/5 transition-colors disabled:opacity-60">
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
