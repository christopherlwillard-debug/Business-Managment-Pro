import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe, Eye, EyeOff, Edit2, Save, X, Plus } from "lucide-react";

interface PublicService {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  priceDisplay: string | null;
  priceNote: string | null;
  whatsIncluded: string[] | null;
  addOns: string[] | null;
  sortOrder: number | null;
  active: boolean;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchServices(): Promise<PublicService[]> {
  const res = await fetch(`${BASE}/api/public-services`);
  if (!res.ok) throw new Error("Failed to load services");
  return res.json();
}

async function patchService(id: number, body: Record<string, unknown>): Promise<PublicService> {
  const res = await fetch(`${BASE}/api/public-services/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update service");
  return res.json();
}

async function createService(name: string, description: string): Promise<PublicService> {
  const slug = name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const res = await fetch(`${BASE}/api/public-services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description: description || null, slug, active: true }),
  });
  if (!res.ok) throw new Error("Failed to create service");
  return res.json();
}

function ServiceRow({ service }: { service: PublicService }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? "");

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => patchService(service.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["public-services"] }),
  });

  function startEdit() {
    setName(service.name);
    setDescription(service.description ?? "");
    setEditing(true);
  }

  async function saveEdit() {
    await mutation.mutateAsync({
      name,
      description: description || null,
    });
    setEditing(false);
  }

  async function toggleActive() {
    await mutation.mutateAsync({ active: !service.active });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <input
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-semibold w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Service name"
                value={name}
                onChange={e => setName(e.target.value)}
              />
              <textarea
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Short description (optional)"
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
          ) : (
            <>
              <h3 className="font-semibold text-gray-900">{service.name}</h3>
              {service.description && (
                <p className="text-xs text-gray-500 mt-0.5">{service.description}</p>
              )}
            </>
          )}
          <span className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full ${service.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {service.active ? "Visible on website" : "Hidden"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggleActive}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            title={service.active ? "Hide from website" : "Show on website"}
          >
            {service.active ? <Eye className="w-4 h-4 text-green-600" /> : <EyeOff className="w-4 h-4" />}
          </button>
          {editing ? (
            <>
              <button onClick={saveEdit} disabled={mutation.isPending || !name.trim()} className="p-1.5 rounded hover:bg-green-50 text-green-700 disabled:opacity-40" title="Save"><Save className="w-4 h-4" /></button>
              <button onClick={() => setEditing(false)} className="p-1.5 rounded hover:bg-red-50 text-red-600" title="Cancel"><X className="w-4 h-4" /></button>
            </>
          ) : (
            <button onClick={startEdit} className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="Edit"><Edit2 className="w-4 h-4" /></button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddServiceForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: () => createService(name, description),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-services"] });
      onDone();
    },
  });

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
      <p className="text-sm font-semibold text-blue-800">Add a new service</p>
      <input
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
        placeholder="Service name (required)"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />
      <textarea
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
        placeholder="Short description (optional)"
        rows={2}
        value={description}
        onChange={e => setDescription(e.target.value)}
      />
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !name.trim()}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {mutation.isPending ? "Adding…" : "Add Service"}
        </button>
        <button
          onClick={onDone}
          className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
      {mutation.isError && <p className="text-xs text-red-600">Failed to add service. Please try again.</p>}
    </div>
  );
}

export function WebsiteServicesTab() {
  const { data: services = [], isLoading, error } = useQuery<PublicService[]>({
    queryKey: ["public-services"],
    queryFn: fetchServices,
  });
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Globe className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Website Services</h1>
            <p className="text-sm text-gray-500">Manage the services listed on your public website.</p>
          </div>
        </div>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Service
          </button>
        )}
      </div>

      {showAdd && <div className="mb-4"><AddServiceForm onDone={() => setShowAdd(false)} /></div>}

      {isLoading && <p className="text-gray-500 text-sm">Loading…</p>}
      {error && <p className="text-red-600 text-sm">Failed to load services.</p>}

      {!isLoading && !error && services.length === 0 && !showAdd && (
        <div className="text-center py-12 text-gray-400">
          <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-gray-600">No services yet</p>
          <p className="text-sm">Tap "Add Service" to create your first one.</p>
        </div>
      )}

      <div className="space-y-3">
        {services.map(service => (
          <ServiceRow key={service.id} service={service} />
        ))}
      </div>
    </div>
  );
}
export default WebsiteServicesTab;
