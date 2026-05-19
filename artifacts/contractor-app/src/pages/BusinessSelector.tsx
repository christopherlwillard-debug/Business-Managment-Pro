import { useState, useRef } from "react";
import { Building2, Plus, ChevronRight, HardHat, Home, Layers, Briefcase, FileText, Pencil, Upload, X } from "lucide-react";
import { useBusiness, type Business } from "@/contexts/BusinessContext";
import { useGetDashboardStats } from "@workspace/api-client-react";

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

function BusinessCardStats({ business }: { business: Business }) {
  const { data: stats, isLoading } = useGetDashboardStats({ period: "month", businessLine: business.slug });
  if (isLoading) return <div className="flex gap-3 mt-1.5"><div className="h-3.5 w-16 bg-current opacity-10 rounded animate-pulse" /><div className="h-3.5 w-20 bg-current opacity-10 rounded animate-pulse" /></div>;
  if (!stats) return null;
  return (
    <div className="flex items-center gap-3 mt-1 text-xs opacity-75">
      <span className="flex items-center gap-1">
        <Briefcase className="w-3 h-3" />
        {stats.activeJobs} active job{stats.activeJobs !== 1 ? "s" : ""}
      </span>
      {stats.pendingInvoices > 0 && (
        <span className="flex items-center gap-1">
          <FileText className="w-3 h-3" />
          {stats.pendingInvoices} open invoice{stats.pendingInvoices !== 1 ? "s" : ""}
        </span>
      )}
      {stats.overdueInvoices > 0 && (
        <span className="flex items-center gap-1 text-red-600">
          {stats.overdueInvoices} overdue
        </span>
      )}
    </div>
  );
}

const EMPTY_FORM = { name: "", type: "other", address: "", city: "", state: "", zip: "", phone: "", email: "", licenseNumber: "", taxId: "" };

export default function BusinessSelector({ onSelect }: { onSelect: (b: Business | null) => void }) {
  const { businesses, setActiveBusiness, refresh } = useBusiness();
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const logoBlobRef = useRef<string | null>(null);

  function revokeBlobPreview() {
    if (logoBlobRef.current) {
      URL.revokeObjectURL(logoBlobRef.current);
      logoBlobRef.current = null;
    }
  }

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
        body: JSON.stringify({
          name: form.name.trim(),
          slug: slugify(form.name.trim()),
          type: form.type,
          address: form.address || null,
          city: form.city || null,
          state: form.state || null,
          zip: form.zip || null,
          phone: form.phone || null,
          email: form.email || null,
          licenseNumber: form.licenseNumber || null,
          taxId: form.taxId || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || "Failed to create business"); return; }
      await refresh();
      setShowAddForm(false);
      setForm(EMPTY_FORM);
    } catch {
      setError("Failed to create business");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(b: Business, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingBusiness(b);
    setEditForm({
      name: b.name,
      type: b.type,
      address: b.address ?? "",
      city: b.city ?? "",
      state: b.state ?? "",
      zip: b.zip ?? "",
      phone: b.phone ?? "",
      email: b.email ?? "",
      licenseNumber: b.licenseNumber ?? "",
      taxId: b.taxId ?? "",
    });
    setEditError("");
    revokeBlobPreview();
    setLogoPreview(null);
    setLogoError("");
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!editingBusiness) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError("");
    revokeBlobPreview();
    const localPreview = URL.createObjectURL(file);
    logoBlobRef.current = localPreview;
    setLogoPreview(localPreview);
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch(`${BASE}/api/businesses/${editingBusiness.id}/logo`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json();
        setLogoError(d.error || "Failed to upload logo");
        revokeBlobPreview();
        setLogoPreview(null);
        return;
      }
      const { logoUrl } = await res.json();
      revokeBlobPreview();
      setLogoPreview(`${BASE}${logoUrl}`);
      await refresh();
    } catch {
      setLogoError("Failed to upload logo");
      revokeBlobPreview();
      setLogoPreview(null);
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function handleRemoveLogo() {
    if (!editingBusiness) return;
    setLogoError("");
    setLogoUploading(true);
    try {
      const res = await fetch(`${BASE}/api/businesses/${editingBusiness.id}/logo`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const d = await res.json();
        setLogoError(d.error || "Failed to remove logo");
        return;
      }
      revokeBlobPreview();
      setLogoPreview(null);
      await refresh();
    } catch {
      setLogoError("Failed to remove logo");
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleEditBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBusiness) return;
    if (!editForm.name.trim()) { setEditError("Business name is required"); return; }
    setEditSaving(true);
    setEditError("");
    try {
      const res = await fetch(`${BASE}/api/businesses/${editingBusiness.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          type: editForm.type,
          address: editForm.address || null,
          city: editForm.city || null,
          state: editForm.state || null,
          zip: editForm.zip || null,
          phone: editForm.phone || null,
          email: editForm.email || null,
          licenseNumber: editForm.licenseNumber || null,
          taxId: editForm.taxId || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); setEditError(d.error || "Failed to update business"); return; }
      await refresh();
      setEditingBusiness(null);
    } catch {
      setEditError("Failed to update business");
    } finally {
      setEditSaving(false);
    }
  }

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const setEF = (k: string, v: string) => setEditForm(f => ({ ...f, [k]: v }));
  const inp = "w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";

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
            const isEditing = editingBusiness?.id === b.id;
            return (
              <div key={b.id} className="space-y-0">
                <div
                  role="group"
                  className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 ${colors.border} ${colors.bg} hover:shadow-md transition-all ${isEditing ? "rounded-b-none border-b-0" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelect(b)}
                    className="flex items-center gap-4 flex-1 min-w-0 text-left"
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
                      <BusinessCardStats business={b} />
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => isEditing ? (e.stopPropagation(), setEditingBusiness(null)) : openEdit(b, e)}
                    className={`p-2 rounded-lg transition-colors flex-shrink-0 ${isEditing ? `${colors.text} opacity-100 bg-black/10` : `${colors.text} opacity-30 hover:opacity-100 hover:bg-black/10`}`}
                    title={isEditing ? "Close editor" : "Edit business"}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <ChevronRight className={`w-5 h-5 ${colors.text} opacity-40 flex-shrink-0`} />
                </div>

                {isEditing && (
                  <form onSubmit={handleEditBusiness} className={`p-5 rounded-2xl rounded-t-none border-2 border-t-0 ${colors.border} bg-card space-y-3`}>
                    <h3 className="font-bold text-foreground text-sm">Edit Business</h3>
                    {editError && <p className="text-sm text-destructive">{editError}</p>}

                    {/* Logo upload section */}
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-2">Logo</label>
                      <div className="flex items-center gap-3">
                        <div className={`w-14 h-14 rounded-xl ${colors.iconBg} flex items-center justify-center flex-shrink-0 overflow-hidden`}>
                          {logoPreview ? (
                            <img src={logoPreview} alt="logo preview" className="w-12 h-12 object-contain rounded-lg" />
                          ) : b.logoUrl ? (
                            <img src={`${BASE}${b.logoUrl}`} alt={b.name} className="w-12 h-12 object-contain rounded-lg" />
                          ) : (
                            <BusinessIcon type={b.type} className={`w-6 h-6 ${colors.text}`} />
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            disabled={logoUploading}
                            onClick={() => logoInputRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-60"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            {logoUploading ? "Uploading…" : (b.logoUrl || logoPreview) ? "Change Logo" : "Upload Logo"}
                          </button>
                          {(b.logoUrl || logoPreview) && !logoUploading && (
                            <button
                              type="button"
                              onClick={handleRemoveLogo}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                              Remove Logo
                            </button>
                          )}
                        </div>
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                          className="hidden"
                          onChange={handleLogoChange}
                        />
                      </div>
                      {logoError && <p className="text-xs text-destructive mt-1">{logoError}</p>}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Business Name *</label>
                        <input type="text" required autoFocus className={inp} value={editForm.name} onChange={e => setEF("name", e.target.value)} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Type</label>
                        <select className={inp} value={editForm.type} onChange={e => setEF("type", e.target.value)}>
                          <option value="general_contracting">General Contracting</option>
                          <option value="asphalt_sealing">Asphalt Sealing</option>
                          <option value="real_estate">Real Estate</option>
                          <option value="landscaping">Landscaping</option>
                          <option value="electrical">Electrical</option>
                          <option value="plumbing">Plumbing</option>
                          <option value="hvac">HVAC</option>
                          <option value="painting">Painting</option>
                          <option value="roofing">Roofing</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Phone</label>
                        <input className={inp} placeholder="(270) 555-0123" value={editForm.phone} onChange={e => setEF("phone", e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Email</label>
                        <input type="email" className={inp} placeholder="contact@business.com" value={editForm.email} onChange={e => setEF("email", e.target.value)} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Address</label>
                        <input className={inp} placeholder="123 Main St" value={editForm.address} onChange={e => setEF("address", e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">City</label>
                        <input className={inp} placeholder="Bowling Green" value={editForm.city} onChange={e => setEF("city", e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">State</label>
                        <input className={inp} placeholder="KY" value={editForm.state} onChange={e => setEF("state", e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">ZIP</label>
                        <input className={inp} placeholder="42101" value={editForm.zip} onChange={e => setEF("zip", e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">License Number</label>
                        <input className={inp} placeholder="KY-2024-XXXXX" value={editForm.licenseNumber} onChange={e => setEF("licenseNumber", e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Tax ID / EIN</label>
                        <input className={inp} placeholder="XX-XXXXXXX" value={editForm.taxId} onChange={e => setEF("taxId", e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => { setEditingBusiness(null); setEditError(""); }}
                        className="flex-1 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors">
                        Cancel
                      </button>
                      <button type="submit" disabled={editSaving || logoUploading}
                        className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60">
                        {editSaving ? "Saving…" : logoUploading ? "Uploading logo…" : "Save Changes"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
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
            <form onSubmit={handleAddBusiness} className="p-5 rounded-2xl border-2 border-primary/30 bg-card space-y-3">
              <h3 className="font-bold text-foreground">New Business</h3>
              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Business Name *</label>
                  <input type="text" required autoFocus className={inp} placeholder="e.g. Willard's Real Estate LLC" value={form.name} onChange={e => setF("name", e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Type</label>
                  <select className={inp} value={form.type} onChange={e => setF("type", e.target.value)}>
                    <option value="general_contracting">General Contracting</option>
                    <option value="asphalt_sealing">Asphalt Sealing</option>
                    <option value="real_estate">Real Estate</option>
                    <option value="landscaping">Landscaping</option>
                    <option value="electrical">Electrical</option>
                    <option value="plumbing">Plumbing</option>
                    <option value="hvac">HVAC</option>
                    <option value="painting">Painting</option>
                    <option value="roofing">Roofing</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Phone</label>
                  <input className={inp} placeholder="(270) 555-0123" value={form.phone} onChange={e => setF("phone", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Email</label>
                  <input type="email" className={inp} placeholder="contact@business.com" value={form.email} onChange={e => setF("email", e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Address</label>
                  <input className={inp} placeholder="123 Main St" value={form.address} onChange={e => setF("address", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">City</label>
                  <input className={inp} placeholder="Bowling Green" value={form.city} onChange={e => setF("city", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">State</label>
                  <input className={inp} placeholder="KY" value={form.state} onChange={e => setF("state", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">ZIP</label>
                  <input className={inp} placeholder="42101" value={form.zip} onChange={e => setF("zip", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">License Number</label>
                  <input className={inp} placeholder="KY-2024-XXXXX" value={form.licenseNumber} onChange={e => setF("licenseNumber", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Tax ID / EIN</label>
                  <input className={inp} placeholder="XX-XXXXXXX" value={form.taxId} onChange={e => setF("taxId", e.target.value)} />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setShowAddForm(false); setError(""); setForm(EMPTY_FORM); }}
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
