import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, Copy, Check, ChevronDown, ChevronUp,
  Edit2, Save, X, Plus, Trash2, DollarSign,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Service {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  icon: string | null;
  pricingType: string | null;
  basePrice: string | null;
  priceMin: string | null;
  priceMax: string | null;
  unit: string | null;
  priceDisplay: string | null;
  priceNote: string | null;
  whatsIncluded: string | null;
  addOns: string | null;
  notes: string | null;
  sortOrder: number | null;
  active: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  Carpentry: "🪵",
  Exterior: "🏠",
  Flooring: "🔲",
  Plumbing: "🔧",
  HVAC: "❄️",
};

async function fetchServices(): Promise<Service[]> {
  const res = await fetch(`${BASE}/api/public-services`);
  if (!res.ok) throw new Error("Failed to load");
  return res.json();
}

async function patchService(id: number, body: Partial<Service>): Promise<Service> {
  const res = await fetch(`${BASE}/api/public-services/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update");
  return res.json();
}

async function postService(body: Partial<Service>): Promise<Service> {
  const res = await fetch(`${BASE}/api/public-services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to create");
  return res.json();
}

async function deleteService(id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/public-services/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
}

function fmt(n: string | null | undefined): string {
  if (!n) return "—";
  const num = parseFloat(n);
  return isNaN(num) ? n : num % 1 === 0 ? `$${num.toLocaleString()}` : `$${num.toFixed(2)}`;
}

function buildExportText(services: Service[]): string {
  const lines: string[] = [
    "WILLARD'S GENERAL CONTRACTING LLC",
    "Services & Pricing Guide",
    "=".repeat(48),
    "",
  ];
  for (const s of services) {
    lines.push(`▌ ${s.name.toUpperCase()}${s.category ? ` (${s.category})` : ""}`);
    if (s.description) lines.push(s.description);
    lines.push("");
    if (s.priceDisplay) lines.push(`  Pricing: ${s.priceDisplay}`);
    if (s.priceNote) lines.push(`  Note: ${s.priceNote}`);
    if (s.whatsIncluded) {
      lines.push("  What's Included:");
      for (const b of s.whatsIncluded.split("\n").filter(Boolean)) lines.push(`    • ${b.trim()}`);
    }
    if (s.addOns) {
      lines.push("  Add-ons:");
      for (const b of s.addOns.split("\n").filter(Boolean)) lines.push(`    + ${b.trim()}`);
    }
    if (s.notes) {
      lines.push("  Notes:");
      for (const b of s.notes.split("\n").filter(Boolean)) lines.push(`    ${b.trim()}`);
    }
    lines.push("-".repeat(48));
    lines.push("");
  }
  return lines.join("\n");
}

function buildExportJSON(services: Service[]): string {
  return JSON.stringify(
    services.map(s => ({
      name: s.name,
      slug: s.slug,
      category: s.category,
      description: s.description,
      pricingType: s.pricingType,
      basePrice: s.basePrice,
      priceMin: s.priceMin,
      priceMax: s.priceMax,
      unit: s.unit,
      priceDisplay: s.priceDisplay,
      priceNote: s.priceNote,
      whatsIncluded: s.whatsIncluded ? s.whatsIncluded.split("\n").filter(Boolean) : [],
      addOns: s.addOns ? s.addOns.split("\n").filter(Boolean) : [],
      notes: s.notes,
    })),
    null,
    2,
  );
}

interface EditDraft {
  name: string;
  description: string;
  category: string;
  icon: string;
  pricingType: string;
  basePrice: string;
  priceMin: string;
  priceMax: string;
  unit: string;
  priceDisplay: string;
  priceNote: string;
  whatsIncluded: string;
  addOns: string;
  notes: string;
}

function emptyDraft(): EditDraft {
  return {
    name: "", description: "", category: "", icon: "",
    pricingType: "flat", basePrice: "", priceMin: "", priceMax: "",
    unit: "", priceDisplay: "", priceNote: "",
    whatsIncluded: "", addOns: "", notes: "",
  };
}

function serviceToDraft(s: Service): EditDraft {
  return {
    name: s.name,
    description: s.description ?? "",
    category: s.category ?? "",
    icon: s.icon ?? "",
    pricingType: s.pricingType ?? "flat",
    basePrice: s.basePrice ?? "",
    priceMin: s.priceMin ?? "",
    priceMax: s.priceMax ?? "",
    unit: s.unit ?? "",
    priceDisplay: s.priceDisplay ?? "",
    priceNote: s.priceNote ?? "",
    whatsIncluded: s.whatsIncluded ?? "",
    addOns: s.addOns ?? "",
    notes: s.notes ?? "",
  };
}

interface EditFormProps {
  draft: EditDraft;
  setDraft: (fn: (d: EditDraft) => EditDraft) => void;
}

function EditForm({ draft, setDraft }: EditFormProps) {
  function field(
    label: string,
    key: keyof EditDraft,
    opts?: { type?: string; placeholder?: string }
  ) {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-0.5">{label}</label>
        <input
          type={opts?.type ?? "text"}
          placeholder={opts?.placeholder ?? ""}
          value={draft[key]}
          onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
    );
  }

  function textarea(label: string, key: keyof EditDraft, rows: number, placeholder?: string) {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-0.5">{label}</label>
        <textarea
          rows={rows}
          placeholder={placeholder ?? "One item per line"}
          value={draft[key]}
          onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-4">
      {field("Service Name", "name")}
      {field("Category", "category", { placeholder: "Carpentry, Plumbing, Flooring…" })}
      {field("Icon Emoji", "icon", { placeholder: "🔧" })}
      {field("Unit", "unit", { placeholder: "LF, SF, Job, Platform…" })}
      {field("Pricing Type", "pricingType", { placeholder: "flat, per_sqft, per_lf…" })}
      {field("Base / Flat Price", "basePrice", { type: "number", placeholder: "1000" })}
      {field("Price Min", "priceMin", { type: "number", placeholder: "6" })}
      {field("Price Max", "priceMax", { type: "number", placeholder: "35" })}
      <div className="sm:col-span-2">
        {field("Price Display (shown on cards)", "priceDisplay", { placeholder: "$6–$35/LF" })}
      </div>
      <div className="sm:col-span-2">
        {field("Price Note", "priceNote", { placeholder: "Short clarification note" })}
      </div>
      <div className="sm:col-span-2">
        {textarea("Description", "description", 2, "One or two sentence summary of the service")}
      </div>
      <div className="sm:col-span-2">
        {textarea("What's Included (one per line)", "whatsIncluded", 3)}
      </div>
      <div className="sm:col-span-2">
        {textarea("Add-ons (one per line)", "addOns", 3)}
      </div>
      <div className="sm:col-span-2">
        {textarea("Notes / Reference Info", "notes", 3, "Internal reference notes")}
      </div>
    </div>
  );
}

function ServiceCard({ service, onSaved, onDeleted }: {
  service: Service;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft>(emptyDraft());
  const qc = useQueryClient();

  const patchMut = useMutation({
    mutationFn: (body: Partial<Service>) => patchService(service.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pricing-guide"] }); onSaved(); },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteService(service.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pricing-guide"] }); onDeleted(); },
  });

  function startEdit() {
    setDraft(serviceToDraft(service));
    setEditing(true);
    setExpanded(true);
  }

  async function save() {
    await patchMut.mutateAsync({
      name: draft.name || undefined,
      description: draft.description || null,
      category: draft.category || null,
      icon: draft.icon || null,
      pricingType: draft.pricingType || null,
      basePrice: draft.basePrice || null,
      priceMin: draft.priceMin || null,
      priceMax: draft.priceMax || null,
      unit: draft.unit || null,
      priceDisplay: draft.priceDisplay || null,
      priceNote: draft.priceNote || null,
      whatsIncluded: draft.whatsIncluded || null,
      addOns: draft.addOns || null,
      notes: draft.notes || null,
    });
    setEditing(false);
  }

  const included = (service.whatsIncluded ?? "").split("\n").filter(Boolean);
  const addOns = (service.addOns ?? "").split("\n").filter(Boolean);
  const notes = (service.notes ?? "").split("\n").filter(Boolean);
  const icon = service.icon ?? CATEGORY_ICONS[service.category ?? ""] ?? "🔧";

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="p-5 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-2xl flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900 text-base">{service.name}</h3>
            {service.category && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                {service.category}
              </span>
            )}
          </div>
          {service.description && (
            <p className="text-sm text-gray-500 mt-0.5 leading-snug">{service.description}</p>
          )}
          {service.priceDisplay && (
            <p className="text-sm font-semibold text-gray-800 mt-1">{service.priceDisplay}</p>
          )}
          {service.priceNote && (
            <p className="text-xs text-gray-400 mt-0.5">{service.priceNote}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {editing ? (
            <>
              <button
                onClick={save}
                disabled={patchMut.isPending}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <Save className="w-3 h-3" /> Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEdit}
                className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                title="Edit"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${service.name}"? This cannot be undone.`)) deleteMut.mutate();
                }}
                disabled={deleteMut.isPending}
                className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors disabled:opacity-40"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setExpanded(e => !e)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                title={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pricing summary strip */}
      {(service.basePrice || service.priceMin) && !editing && (
        <div className="px-5 pb-3 flex flex-wrap gap-4">
          {service.basePrice && (
            <div className="text-center">
              <p className="text-xs text-gray-400">Base / Flat</p>
              <p className="text-base font-bold text-gray-900">{fmt(service.basePrice)}{service.unit ? `/${service.unit}` : ""}</p>
            </div>
          )}
          {service.priceMin && (
            <div className="text-center">
              <p className="text-xs text-gray-400">Min</p>
              <p className="text-base font-bold text-gray-900">{fmt(service.priceMin)}{service.unit ? `/${service.unit}` : ""}</p>
            </div>
          )}
          {service.priceMax && (
            <div className="text-center">
              <p className="text-xs text-gray-400">Max</p>
              <p className="text-base font-bold text-gray-900">{fmt(service.priceMax)}{service.unit ? `/${service.unit}` : ""}</p>
            </div>
          )}
        </div>
      )}

      {/* Expanded detail / edit */}
      {(expanded || editing) && (
        <div className="border-t border-gray-100">
          {editing ? (
            <div className="p-5">
              <EditForm draft={draft} setDraft={setDraft} />
            </div>
          ) : (
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
              {included.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">What&apos;s Included</h4>
                  <ul className="space-y-1">
                    {included.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-green-500 mt-0.5">✓</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {addOns.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Add-ons</h4>
                  <ul className="space-y-1">
                    {addOns.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-blue-400 mt-0.5">+</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {notes.length > 0 && (
                <div className="sm:col-span-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Reference Notes</h4>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                    {notes.map((n, i) => (
                      <p key={i} className="text-xs text-amber-800 font-mono leading-relaxed">{n}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddServiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [draft, setDraft] = useState<EditDraft>(emptyDraft());
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () => postService({
      name: draft.name,
      slug: draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      description: draft.description || null,
      category: draft.category || null,
      icon: draft.icon || null,
      pricingType: draft.pricingType || null,
      basePrice: draft.basePrice || null,
      priceMin: draft.priceMin || null,
      priceMax: draft.priceMax || null,
      unit: draft.unit || null,
      priceDisplay: draft.priceDisplay || null,
      priceNote: draft.priceNote || null,
      whatsIncluded: draft.whatsIncluded || null,
      addOns: draft.addOns || null,
      notes: draft.notes || null,
      active: true,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing-guide"] });
      onCreated();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-10 px-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" /> Add New Service
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 pb-6">
          <EditForm draft={draft} setDraft={setDraft} />
          <div className="flex gap-3 mt-5">
            <button
              onClick={() => mut.mutate()}
              disabled={!draft.name || mut.isPending}
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {mut.isPending ? "Adding…" : "Add Service"}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
          {mut.error && (
            <p className="mt-2 text-sm text-red-600">Failed to create service. Please try again.</p>
          )}
        </div>
      </div>
    </div>
  );
}

type ExportFormat = "text" | "json";

export default function PricingGuide() {
  const { data: services = [], isLoading, error } = useQuery<Service[]>({
    queryKey: ["pricing-guide"],
    queryFn: fetchServices,
  });

  const [copied, setCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("text");
  const [showAdd, setShowAdd] = useState(false);

  function copyGuide() {
    const text = exportFormat === "json" ? buildExportJSON(services) : buildExportText(services);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const byCategory = services.reduce<Record<string, Service[]>>((acc, s) => {
    const cat = s.category ?? "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Services & Pricing Guide</h1>
            <p className="text-sm text-gray-500">Internal reference for all services, pricing ranges, and add-ons</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-lg border border-gray-300 overflow-hidden text-xs font-medium">
            <button
              onClick={() => setExportFormat("text")}
              className={`px-3 py-1.5 ${exportFormat === "text" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"} transition-colors`}
            >
              Text
            </button>
            <button
              onClick={() => setExportFormat("json")}
              className={`px-3 py-1.5 ${exportFormat === "json" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"} transition-colors`}
            >
              JSON
            </button>
          </div>
          <button
            onClick={copyGuide}
            disabled={services.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy for Website"}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Service
          </button>
        </div>
      </div>

      {/* Summary strip */}
      {services.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{services.length}</p>
            <p className="text-xs text-gray-500">Total Services</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{services.filter(s => s.active).length}</p>
            <p className="text-xs text-gray-500">On Website</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{Object.keys(byCategory).length}</p>
            <p className="text-xs text-gray-500">Categories</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
            <DollarSign className="w-6 h-6 text-green-600 mx-auto" />
            <p className="text-xs text-gray-500 mt-0.5">All Rates Set</p>
          </div>
        </div>
      )}

      {/* Loading / error */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      )}
      {error && <p className="text-red-600 text-sm">Failed to load services. Please refresh.</p>}

      {/* Services by category */}
      <div className="space-y-8">
        {Object.entries(byCategory).map(([cat, catServices]) => (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{CATEGORY_ICONS[cat] ?? "🔧"}</span>
              <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">{cat}</h2>
              <div className="flex-1 border-t border-gray-200" />
            </div>
            <div className="space-y-3">
              {catServices.map(s => (
                <ServiceCard
                  key={s.id}
                  service={s}
                  onSaved={() => {}}
                  onDeleted={() => {}}
                />
              ))}
            </div>
          </div>
        ))}
        {!isLoading && services.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No services yet</p>
            <p className="text-sm">Add your first service to build your pricing guide.</p>
          </div>
        )}
      </div>

      {/* Add modal */}
      {showAdd && (
        <AddServiceModal
          onClose={() => setShowAdd(false)}
          onCreated={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
