import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe, Eye, EyeOff, Edit2, Save, X } from "lucide-react";

interface PublicService {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  priceDisplay: string | null;
  priceNote: string | null;
  whatsIncluded: string | null;
  addOns: string | null;
  sortOrder: number | null;
  active: boolean;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchServices(): Promise<PublicService[]> {
  const res = await fetch(`${BASE}/api/public-services`);
  if (!res.ok) throw new Error("Failed to load services");
  return res.json();
}

async function patchService(id: number, body: Partial<PublicService>): Promise<PublicService> {
  const res = await fetch(`${BASE}/api/public-services/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update service");
  return res.json();
}

function ServiceRow({ service }: { service: PublicService }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<PublicService>>({});

  const mutation = useMutation({
    mutationFn: (body: Partial<PublicService>) => patchService(service.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["public-services"] }),
  });

  function startEdit() {
    setDraft({
      name: service.name,
      priceDisplay: service.priceDisplay ?? "",
      priceNote: service.priceNote ?? "",
      whatsIncluded: service.whatsIncluded ?? "",
      addOns: service.addOns ?? "",
      description: service.description ?? "",
    });
    setEditing(true);
  }

  function cancelEdit() {
    setDraft({});
    setEditing(false);
  }

  async function saveEdit() {
    await mutation.mutateAsync(draft);
    setEditing(false);
  }

  async function toggleActive() {
    await mutation.mutateAsync({ active: !service.active });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl">{service.icon ?? "🔧"}</span>
          <div className="min-w-0">
            {editing ? (
              <input
                className="border border-gray-300 rounded px-2 py-1 text-sm font-semibold w-full"
                value={draft.name ?? ""}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              />
            ) : (
              <h3 className="font-semibold text-gray-900">{service.name}</h3>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full ${service.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              {service.active ? "Visible on website" : "Hidden"}
            </span>
          </div>
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
              <button onClick={saveEdit} className="p-1.5 rounded hover:bg-green-50 text-green-700" title="Save"><Save className="w-4 h-4" /></button>
              <button onClick={cancelEdit} className="p-1.5 rounded hover:bg-red-50 text-red-600" title="Cancel"><X className="w-4 h-4" /></button>
            </>
          ) : (
            <button onClick={startEdit} className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="Edit"><Edit2 className="w-4 h-4" /></button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-3 grid grid-cols-1 gap-2">
          <label className="block text-xs font-medium text-gray-600">Price Display</label>
          <input
            className="border border-gray-300 rounded px-2 py-1 text-sm"
            placeholder="e.g. Starting at $X/LF"
            value={draft.priceDisplay ?? ""}
            onChange={e => setDraft(d => ({ ...d, priceDisplay: e.target.value }))}
          />
          <label className="block text-xs font-medium text-gray-600">Price Note</label>
          <input
            className="border border-gray-300 rounded px-2 py-1 text-sm"
            placeholder="e.g. Based on linear footage"
            value={draft.priceNote ?? ""}
            onChange={e => setDraft(d => ({ ...d, priceNote: e.target.value }))}
          />
          <label className="block text-xs font-medium text-gray-600">What&apos;s Included (one per line)</label>
          <textarea
            className="border border-gray-300 rounded px-2 py-1 text-sm resize-none"
            rows={3}
            value={draft.whatsIncluded ?? ""}
            onChange={e => setDraft(d => ({ ...d, whatsIncluded: e.target.value }))}
          />
          <label className="block text-xs font-medium text-gray-600">Add-ons (one per line)</label>
          <textarea
            className="border border-gray-300 rounded px-2 py-1 text-sm resize-none"
            rows={2}
            value={draft.addOns ?? ""}
            onChange={e => setDraft(d => ({ ...d, addOns: e.target.value }))}
          />
        </div>
      )}

      {!editing && (
        <div className="mt-2 text-sm text-gray-600 space-y-0.5">
          {service.priceDisplay && <p className="font-medium text-gray-800">{service.priceDisplay}</p>}
          {service.priceNote && <p className="text-xs text-gray-500">{service.priceNote}</p>}
        </div>
      )}
    </div>
  );
}

export default function PublicServices() {
  const { data: services = [], isLoading, error } = useQuery<PublicService[]>({
    queryKey: ["public-services"],
    queryFn: fetchServices,
  });

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <div className="flex items-center gap-3 mb-6">
        <Globe className="w-6 h-6 text-blue-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Website Services</h1>
          <p className="text-sm text-gray-500">Manage the services displayed on the public website. Changes reflect immediately.</p>
        </div>
      </div>

      {isLoading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-600">Failed to load services.</p>}

      <div className="space-y-3">
        {services.map(service => (
          <ServiceRow key={service.id} service={service} />
        ))}
      </div>
    </div>
  );
}
