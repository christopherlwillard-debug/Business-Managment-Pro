import { useState } from "react";
import { Building2, Plus, ChevronRight, HardHat, Home, Layers } from "lucide-react";
import { useBusiness, type Business } from "@/contexts/BusinessContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const BUSINESS_COLORS: Record<string, { bg: string; text: string; border: string; iconBg: string }> = {
  general_contracting: { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    iconBg: "bg-blue-100"    },
  asphalt_sealing:     { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   iconBg: "bg-amber-100"   },
  real_estate:         { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", iconBg: "bg-emerald-100" },
  other:               { bg: "bg-gray-50",    text: "text-gray-700",    border: "border-gray-200",    iconBg: "bg-gray-100"    },
};

export const BUSINESS_TYPE_LABELS: Record<string, string> = {
  general_contracting: "General Contracting",
  asphalt_sealing:     "Asphalt Sealing",
  real_estate:         "Real Estate",
  other:               "Other",
};

export function BusinessIcon({ type, className }: { type: string; className?: string }) {
  if (type === "general_contracting") return <HardHat className={className} />;
  if (type === "asphalt_sealing")     return <Layers className={className} />;
  if (type === "real_estate")         return <Home className={className} />;
  return <Building2 className={className} />;
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export default function BusinessSelector({ onSelect }: { onSelect: (b: Business | null) => void }) {
  const { businesses, setActiveBusiness, refresh } = useBusiness();
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ name: "", type: "other" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleSelect(b: Business | null) {
    setActiveBusiness(b);
    onSelect(b);
  }

  async function handleAddBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Business name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/businesses`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), slug: slugify(form.name.trim()), type: form.type }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || "Failed to create business"); return; }
      await refresh();
      setShowAddForm(false);
      setForm({ name: "", type: "other" });
    } catch {
      setError("Failed to create business");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center py-10 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground">Willard's Businesses</h1>
          <p className="text-muted-foreground mt-1">Choose which business to work in</p>
        </div>

        <div className="space-y-3">
          {/* All Businesses card */}
          <button
            onClick={() => handleSelect(null)}
            className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-border bg-card hover:border-primary/40 hover:shadow-md transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground text-base">All Businesses</p>
              <p className="text-sm text-muted-foreground">View combined data across all businesses</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </button>

          {/* Individual business cards */}
          {businesses.map(b => {
            const colors = BUSINESS_COLORS[b.type] ?? BUSINESS_COLORS.other;
            return (
              <button
                key={b.id}
                onClick={() => handleSelect(b)}
                className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 ${colors.border} ${colors.bg} hover:shadow-md transition-all text-left group`}
              >
                <div className={`w-12 h-12 rounded-xl ${colors.iconBg} flex items-center justify-center flex-shrink-0`}>
                  {b.logoUrl ? (
                    <img src={`${BASE}${b.logoUrl}`} alt={b.name} className="w-10 h-10 rounded-lg object-contain" />
                  ) : (
                    <BusinessIcon type={b.type} className={`w-6 h-6 ${colors.text}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-base ${colors.text}`}>{b.name}</p>
                  <p className="text-sm text-muted-foreground">{BUSINESS_TYPE_LABELS[b.type] ?? b.type}</p>
                </div>
                <ChevronRight className={`w-5 h-5 ${colors.text} opacity-40 group-hover:opacity-100 transition-opacity`} />
              </button>
            );
          })}

          {/* Add Business */}
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-muted-foreground group-hover:text-foreground transition-colors">Add Business</p>
                <p className="text-sm text-muted-foreground">e.g. Real Estate LLC, new DBA</p>
              </div>
            </button>
          ) : (
            <form onSubmit={handleAddBusiness} className="p-5 rounded-2xl border-2 border-primary/30 bg-card space-y-4">
              <h3 className="font-bold text-foreground">New Business</h3>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Name</label>
                <input
                  type="text" required autoFocus
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="e.g. Willard's Real Estate LLC"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Type</label>
                <select
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                >
                  <option value="general_contracting">General Contracting</option>
                  <option value="asphalt_sealing">Asphalt Sealing</option>
                  <option value="real_estate">Real Estate</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setShowAddForm(false); setError(""); }}
                  className="flex-1 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving ? "Adding…" : "Add Business"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
