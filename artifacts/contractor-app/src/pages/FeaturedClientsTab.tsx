import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, Upload, ExternalLink } from "lucide-react";

interface FeaturedClient {
  id: number;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  sortOrder: number | null;
  active: boolean;
  createdAt: string;
}

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

export function FeaturedClientsTab() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWebsiteUrl, setNewWebsiteUrl] = useState("");
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const { data: clients = [], isLoading } = useQuery<FeaturedClient[]>({
    queryKey: ["/api/featured-clients"],
    queryFn: () => apiFetch("/featured-clients"),
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/featured-clients", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/featured-clients"] }); setShowAdd(false); setNewName(""); setNewWebsiteUrl(""); },
  });

  const patchMut = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Record<string, unknown>) =>
      apiFetch(`/featured-clients/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/featured-clients"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/featured-clients/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/featured-clients"] }),
  });

  async function handleLogoUpload(client: FeaturedClient, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingId(client.id);
    try {
      const urlRes = await apiFetch("/storage/uploads/request-url", {
        method: "POST",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      await fetch(urlRes.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      await patchMut.mutateAsync({ id: client.id, logoUrl: urlRes.objectPath });
    } catch (err) {
      console.error("Logo upload failed", err);
    } finally {
      setUploadingId(null);
      const input = fileRefs.current[client.id];
      if (input) input.value = "";
    }
  }

  const sorted = [...clients].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" /> Featured Clients
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Logos shown in the "Our Clients" section on your public website.
          </p>
        </div>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Client
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <p className="text-sm font-semibold">New Client</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Company name *</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Family Dream Homes"
                autoFocus
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Website URL (optional)</label>
              <input
                type="url"
                value={newWebsiteUrl}
                onChange={e => setNewWebsiteUrl(e.target.value)}
                placeholder="https://..."
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => createMut.mutate({ name: newName, websiteUrl: newWebsiteUrl || null, sortOrder: clients.length })}
              disabled={!newName.trim() || createMut.isPending}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createMut.isPending ? "Adding…" : "Add Client"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewName(""); setNewWebsiteUrl(""); }}
              className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No clients yet</p>
          <p className="text-sm">Add your first client above — they'll appear on your public website.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((client, idx) => (
            <div
              key={client.id}
              className={`bg-card border border-border rounded-2xl p-4 flex items-center gap-4 ${!client.active ? "opacity-60" : ""}`}
            >
              {/* Logo preview */}
              <div className="w-20 h-14 flex-shrink-0 rounded-xl bg-muted flex items-center justify-center overflow-hidden border border-border">
                {client.logoUrl ? (
                  <img
                    src={`${base}/api/storage/objects${client.logoUrl.replace(/^\/objects/, "")}`}
                    alt={client.name}
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <Building2 className="w-6 h-6 text-muted-foreground/40" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{client.name}</p>
                {client.websiteUrl && (
                  <a
                    href={client.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary flex items-center gap-1 hover:underline truncate"
                  >
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    {client.websiteUrl.replace(/^https?:\/\//, "")}
                  </a>
                )}
                <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${client.active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                  {client.active ? "Visible on site" : "Hidden"}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Logo upload */}
                <input
                  ref={el => { fileRefs.current[client.id] = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => handleLogoUpload(client, e)}
                />
                <button
                  onClick={() => fileRefs.current[client.id]?.click()}
                  disabled={uploadingId === client.id}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title="Upload logo"
                >
                  {uploadingId === client.id
                    ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    : <Upload className="w-4 h-4" />
                  }
                </button>

                {/* Toggle visibility */}
                <button
                  onClick={() => patchMut.mutate({ id: client.id, active: !client.active })}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title={client.active ? "Hide from site" : "Show on site"}
                >
                  {client.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>

                {/* Move up */}
                <button
                  onClick={() => patchMut.mutate({ id: client.id, sortOrder: (client.sortOrder ?? 0) - 1 })}
                  disabled={idx === 0}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                  title="Move up"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>

                {/* Move down */}
                <button
                  onClick={() => patchMut.mutate({ id: client.id, sortOrder: (client.sortOrder ?? 0) + 1 })}
                  disabled={idx === sorted.length - 1}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                  title="Move down"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>

                {/* Delete */}
                <button
                  onClick={() => { if (confirm(`Remove "${client.name}" from featured clients?`)) deleteMut.mutate(client.id); }}
                  className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
