import { useState, useRef, ReactNode } from "react";
import { useUserPermissions } from "@/contexts/UserPermissions";
import {
  useListJobs, useCreateJob, useUpdateJob, useDeleteJob,
  useListClients, useListSubcontractors, useListInvoices,
  useUpdateInvoiceStatus, useDeleteInvoice, getJobInvoiceDraft,
  useListDailyLogs, useCreateDailyLog, useDeleteDailyLog,
  useGetSettings,
  useListMaterials, useListMaterialLists, useCreateMaterialList,
  useDeleteMaterialList,
  useCreateEstimate, useUpdateEstimate,
  Job, Invoice, Client, Subcontractor, InvoiceDraft, CreateJobRequest, DailyLog,
  MaterialList, MaterialListItemInput,
  Estimate, CreateEstimateRequest, getListEstimatesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { EstimateModal } from "./Estimates";
import { formatCurrency, formatDate, localDateString } from "@/lib/utils";
import { autoAttachMaterialsPdf } from "@/lib/autoAttachMaterialsPdf";
import { Card } from "@/components/ui/card";
import { InvoiceEditorDialog } from "@/components/InvoiceEditorDialog";
import { InvoiceViewModal } from "@/components/InvoiceViewModal";
import {
  Briefcase, MapPin, Calendar, HardHat, Users,
  Plus, Check, X, Trash2, ChevronDown, ChevronUp, FileText,
  Edit2, CheckCircle, Clock, ClipboardList, Upload,
  AlertCircle, ArrowLeft, Eye, Package, ListChecks, Search,
  Calculator, DollarSign,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Status helpers ────────────────────────────────────────────────────────────
const INVOICE_STATUS_COLORS: Record<string, string> = {
  paid:      "bg-emerald-100 text-emerald-700",
  sent:      "bg-blue-100 text-blue-700",
  overdue:   "bg-red-100 text-red-700",
  draft:     "bg-gray-100 text-gray-600",
  cancelled: "bg-orange-100 text-orange-700",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  paid:      "Paid",
  sent:      "Pending",
  draft:     "Draft",
  overdue:   "Overdue",
  cancelled: "Cancelled",
};

function displayStatus(status: string): "scheduled" | "completed" {
  if (status === "completed" || status === "invoiced") return "completed";
  return "scheduled";
}

// ─── Subcontractor multi-select chip picker ────────────────────────────────────
function SubcontractorPicker({
  subcontractors, selected, onChange,
}: {
  subcontractors: Subcontractor[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedSubs = subcontractors.filter(s => selected.includes(s.id));

  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter(i => i !== id) : [...selected, id]);
  }

  return (
    <div className="relative">
      <button type="button"
        className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground flex flex-wrap gap-1.5 items-center focus:outline-none focus:ring-2 focus:ring-primary/20"
        onClick={() => setOpen(o => !o)}>
        {selectedSubs.length === 0
          ? <span className="text-muted-foreground">Select subcontractors…</span>
          : selectedSubs.map(s => (
            <span key={s.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
              {s.name}
              <span className="cursor-pointer" onMouseDown={e => { e.stopPropagation(); toggle(s.id); }}><X className="w-3 h-3" /></span>
            </span>
          ))
        }
        <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-background border border-border rounded-xl shadow-xl max-h-48 overflow-y-auto">
            {subcontractors.length === 0
              ? <p className="px-3 py-2 text-xs text-muted-foreground">No subcontractors yet</p>
              : subcontractors.map(s => (
                <button key={s.id} type="button"
                  className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted/40 text-sm transition-colors"
                  onClick={() => toggle(s.id)}>
                  <span className={`w-4 h-4 rounded flex items-center justify-center border ${selected.includes(s.id) ? "bg-amber-500 border-amber-500" : "border-gray-300"}`}>
                    {selected.includes(s.id) && <Check className="w-3 h-3 text-white" />}
                  </span>
                  {s.name}
                </button>
              ))
            }
          </div>
        </>
      )}
    </div>
  );
}

// ─── Job Materials Panel ───────────────────────────────────────────────────────
function JobMaterialsPanel({ job, onClose }: { job: Job; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: lists = [], isLoading } = useListMaterialLists({ jobId: job.id });
  const { data: allMaterials = [] } = useListMaterials({ includeInactive: false });
  const { data: settings } = useGetSettings();
  const createList = useCreateMaterialList();
  const deleteList = useDeleteMaterialList();
  const { canEdit } = useUserPermissions();

  const [showForm, setShowForm] = useState(false);
  const [newMarkup, setNewMarkup] = useState(40);
  const [newItems, setNewItems] = useState<MaterialListItemInput[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = allMaterials.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase())
  );

  function addItem(m: typeof allMaterials[0]) {
    const idx = newItems.findIndex(i => i.materialId === m.id);
    if (idx >= 0) {
      setNewItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: it.qty + 1 } : it));
    } else {
      setNewItems(prev => [...prev, {
        materialId: m.id,
        nameSnapshot: m.name,
        unitSnapshot: m.unit,
        unitCostSnapshot: m.unitCost,
        qty: 1,
      }]);
    }
  }

  function removeItem(idx: number) {
    setNewItems(prev => prev.filter((_, i) => i !== idx));
  }

  function setQty(idx: number, val: number) {
    setNewItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: Math.max(0.01, val) } : it));
  }

  function resetForm() {
    setNewMarkup(40);
    setNewItems([]);
    setSearch("");
    setFormError("");
  }

  async function handleCreate() {
    if (newItems.length === 0) { setFormError("Add at least one material."); return; }
    setFormError("");
    setSaving(true);
    try {
      await createList.mutateAsync({
        name: "Materials",
        jobId: job.id,
        markup: newMarkup,
        items: newItems,
      });
      qc.invalidateQueries({ queryKey: ["/api/material-lists"] });
      resetForm();
      setShowForm(false);
      // Auto-generate & attach the itemized materials PDF to the draft invoice
      autoAttachMaterialsPdf(job.id, job.title, settings?.companyName ?? undefined).catch(console.error);
    } catch {
      setFormError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(listId: number) {
    setDeletingId(listId);
    try {
      await deleteList.mutateAsync(listId);
      qc.invalidateQueries({ queryKey: ["/api/material-lists"] });
      // Regenerate the PDF attachment reflecting the updated material totals
      autoAttachMaterialsPdf(job.id, job.title, settings?.companyName ?? undefined).catch(console.error);
    } finally {
      setDeletingId(null);
    }
  }

  const formSubtotal = newItems.reduce((s, it) => s + it.unitCostSnapshot * it.qty * (newMarkup / 100 + 1), 0);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-lg bg-card border-l border-border flex flex-col h-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50 flex-shrink-0 bg-card">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <ListChecks className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Material Lists</p>
              <h2 className="font-bold text-foreground text-sm truncate">{job.title}</h2>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Add new list form */}
          {showForm ? (
            <div className="p-5 border-b border-border/50 bg-muted/20 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-amber-500" /> New Material List
                </h3>
                <button onClick={() => { setShowForm(false); resetForm(); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {formError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {formError}
                </p>
              )}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Markup %</label>
                <input
                  type="number" min="0" max="200" step="5"
                  value={newMarkup}
                  onChange={e => setNewMarkup(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Catalog picker */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Add from Catalog</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search materials…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-7 pr-3 py-1.5 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="bg-background border border-border rounded-xl max-h-36 overflow-y-auto divide-y divide-border/50">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground text-center">No materials found</p>
                  ) : filtered.map(m => (
                    <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{m.name}</p>
                        <p className="text-[10px] text-muted-foreground">{formatCurrency(m.unitCost)}/{m.unit}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addItem(m)}
                        className="w-5 h-5 flex items-center justify-center bg-amber-500 text-white rounded-full hover:bg-amber-600 transition-colors flex-shrink-0"
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Selected items */}
              {newItems.length > 0 && (
                <div className="bg-background border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase">Item</th>
                        <th className="text-right px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase">Qty</th>
                        <th className="text-right px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase">Extended</th>
                        <th className="w-6" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {newItems.map((it, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-1.5 font-medium text-foreground">{it.nameSnapshot}</td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number" min="0.01" step="0.5"
                              value={it.qty}
                              onChange={e => setQty(idx, parseFloat(e.target.value) || 0)}
                              className="w-14 text-right px-1 py-0.5 border border-border rounded-lg text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold text-amber-600">
                            {formatCurrency(it.unitCostSnapshot * it.qty * (newMarkup / 100 + 1))}
                          </td>
                          <td className="pr-2 py-1.5 text-center">
                            <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive">
                              <X className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/20">
                      <tr>
                        <td colSpan={2} className="px-3 py-1.5 text-right text-xs font-bold text-foreground">Total</td>
                        <td className="px-2 py-1.5 text-right font-bold text-amber-600">{formatCurrency(formSubtotal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors shadow-sm disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save List"}
              </button>
            </div>
          ) : canEdit("jobs") ? (
            <div className="p-5 border-b border-border/50 bg-muted/20">
              <button
                onClick={() => setShowForm(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-amber-300 text-amber-600 text-sm font-semibold hover:bg-amber-50 transition-colors"
              >
                <Plus className="w-4 h-4" /> New Material List
              </button>
            </div>
          ) : null}

          {/* Existing lists */}
          <div className="p-5 space-y-4">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5 text-muted-foreground" />
              Lists
              {lists.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">{lists.length}</span>
              )}
            </h3>

            {isLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : lists.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Package className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">No material lists yet. Create one above.</p>
              </div>
            ) : (
              lists.map((list: MaterialList) => {
                const subtotal = list.items.reduce((s, it) => s + it.unitCostSnapshot * it.qty * (list.markup / 100 + 1), 0);
                const isExpanded = expandedId === list.id;
                return (
                  <div key={list.id} className="rounded-xl border border-border/50 bg-background overflow-hidden">
                    <div className="p-3.5 flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground">{list.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {list.items.length} item{list.items.length !== 1 ? "s" : ""} · {list.markup}% markup · <span className="text-amber-600 font-semibold">{formatCurrency(subtotal)}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : list.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        {canEdit("jobs") && (
                          <button
                            onClick={() => handleDelete(list.id)}
                            disabled={deletingId === list.id}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded items */}
                    {isExpanded && list.items.length > 0 && (
                      <div className="border-t border-border/50">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/30">
                            <tr>
                              <th className="text-left px-3.5 py-1.5 text-[10px] font-bold text-muted-foreground uppercase">Item</th>
                              <th className="text-right px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase">Qty</th>
                              <th className="text-right px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase">Extended</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {list.items.map(item => (
                              <tr key={item.id} className="hover:bg-muted/20">
                                <td className="px-3.5 py-1.5 text-foreground">{item.nameSnapshot}</td>
                                <td className="px-2 py-1.5 text-right text-muted-foreground">{item.qty}</td>
                                <td className="px-3 py-1.5 text-right font-semibold text-amber-600">
                                  {formatCurrency(item.unitCostSnapshot * item.qty * (list.markup / 100 + 1))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Job Daily Log Panel ───────────────────────────────────────────────────────
function JobDailyLogPanel({
  job, onClose,
}: {
  job: Job;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: logs = [], isLoading } = useListDailyLogs({ jobId: job.id });
  const { data: materialLists = [] } = useListMaterialLists({ jobId: job.id });
  const createLog  = useCreateDailyLog();
  const deleteLog  = useDeleteDailyLog();
  const { canEdit } = useUserPermissions();

  const today = localDateString();
  const [form, setForm] = useState({ date: today, notes: "", workCompleted: "", materialListId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedLogs = [...logs].sort((a, b) => b.date.localeCompare(a.date));

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setPhotoError("Only image files are allowed."); return; }
    setUploadingPhoto(true);
    setPhotoError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE}/api/uploads`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      setPendingPhotos(p => [...p, url]);
    } catch {
      setPhotoError("Photo upload failed. Please try again.");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.date) return;
    setSubmitting(true);
    try {
      await createLog.mutateAsync({
        data: {
          jobId: job.id,
          date: form.date,
          notes: form.notes || undefined,
          workCompleted: form.workCompleted || undefined,
          photoUrls: pendingPhotos.length > 0 ? pendingPhotos : undefined,
          materialListId: form.materialListId ? parseInt(form.materialListId) : undefined,
        },
      });
      setForm({ date: today, notes: "", workCompleted: "", materialListId: "" });
      setPendingPhotos([]);
      queryClient.invalidateQueries({ queryKey: ["/api/daily-logs"] });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteLog(id: number) {
    setDeletingId(id);
    try {
      await deleteLog.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-logs"] });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="relative ml-auto w-full max-w-lg bg-card border-l border-border flex flex-col h-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50 flex-shrink-0 bg-card">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <ClipboardList className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Daily Log</p>
              <h2 className="font-bold text-foreground text-sm truncate">{job.title}</h2>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Add entry form — only for users with daily_logs edit permission */}
          {canEdit("daily_logs") && (
          <div className="p-5 border-b border-border/50 bg-muted/20">
            <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-amber-500" /> Add Entry
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
                <input type="date"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Work Completed</label>
                <textarea rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  placeholder="Describe what was done today…"
                  value={form.workCompleted}
                  onChange={e => setForm(f => ({ ...f, workCompleted: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Additional Notes / Issues</label>
                <textarea rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  placeholder="Any issues, materials, or other notes…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              {/* Material List picker */}
              {materialLists.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Attach Material List</label>
                  <select
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={form.materialListId}
                    onChange={e => setForm(f => ({ ...f, materialListId: e.target.value }))}>
                    <option value="">None</option>
                    {materialLists.map(l => (
                      <option key={l.id} value={String(l.id)}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Photo upload */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Photos</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {pendingPhotos.map((url, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
                      <img src={`${BASE}${url}`} alt="" className="w-full h-full object-cover" />
                      <button type="button"
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        onClick={() => setPendingPhotos(p => p.filter((_, j) => j !== i))}>
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ))}
                  <button type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="w-16 h-16 rounded-lg border-2 border-dashed border-border hover:border-amber-400 hover:bg-amber-50 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-amber-600 disabled:opacity-50">
                    {uploadingPhoto
                      ? <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      : <><Upload className="w-3.5 h-3.5" /><span className="text-[10px] font-medium">Add</span></>}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </div>
                {photoError && (
                  <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{photoError}</p>
                )}
              </div>

              <button type="submit" disabled={submitting || !form.date}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors shadow-sm disabled:opacity-60">
                {submitting ? "Saving…" : "Save Entry"}
              </button>
            </form>
          </div>
          )}

          {/* Log history */}
          <div className="p-5 space-y-4">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-muted-foreground" />
              Log History
              {logs.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">{logs.length}</span>
              )}
            </h3>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : sortedLogs.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <ClipboardList className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">No entries yet. Add your first log above.</p>
              </div>
            ) : (
              sortedLogs.map((log: DailyLog) => (
                <div key={log.id} className={`rounded-xl border p-4 space-y-2.5 ${log.authorName ? "border-amber-200 bg-amber-50/40" : "border-border/50 bg-background"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-sm text-foreground">{formatDate(log.date)}</span>
                      {log.authorName && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
                          <HardHat className="w-2.5 h-2.5" /> {log.authorName}
                        </span>
                      )}
                    </div>
                    {canEdit("daily_logs") && (
                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        disabled={deletingId === log.id}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {log.workCompleted && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Work Completed</p>
                      <p className="text-sm text-foreground">{log.workCompleted}</p>
                    </div>
                  )}
                  {log.notes && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Notes</p>
                      <p className="text-sm text-foreground">{log.notes}</p>
                    </div>
                  )}
                  {log.photoUrls && log.photoUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {log.photoUrls.map((url: string, i: number) => (
                        <a key={i} href={url.startsWith("/api") ? `${BASE}${url}` : url} target="_blank" rel="noopener noreferrer"
                          className="w-16 h-16 rounded-lg overflow-hidden border border-border block hover:opacity-90 transition-opacity">
                          <img src={url.startsWith("/api") ? `${BASE}${url}` : url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  {log.materialListId != null && (() => {
                    const list = materialLists.find(l => l.id === log.materialListId);
                    if (!list) return null;
                    const markupMult = list.markup / 100 + 1;
                    const total = list.items.reduce((s, it) => s + it.unitCostSnapshot * it.qty * markupMult, 0);
                    return (
                      <div className="mt-1 p-3 rounded-xl bg-amber-50 border border-amber-200">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-0.5">Material List</p>
                        <p className="text-xs font-medium text-foreground truncate">{list.name}</p>
                        <p className="text-xs text-amber-600 font-bold">{formatCurrency(total)}</p>
                      </div>
                    );
                  })()}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Job Estimates Panel ───────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent:  "bg-blue-100 text-blue-700",
  won:   "bg-emerald-100 text-emerald-700",
  lost:  "bg-red-100 text-red-700",
};

function JobEstimatesPanel({ job, onClose, onLoadAllIntoInvoice }: { job: Job; onClose: () => void; onLoadAllIntoInvoice?: (estimates: Estimate[]) => void }) {
  const qc = useQueryClient();
  const { canEdit } = useUserPermissions();
  const createMut = useCreateEstimate();
  const updateMut = useUpdateEstimate();

  const { data: estimates = [], isLoading } = useQuery<(Estimate & { jobTitle?: string })[]>({
    queryKey: ["job-estimates", job.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/estimates/by-job/${job.id}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [showModal, setShowModal] = useState(false);
  const [editEst, setEditEst] = useState<Estimate | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["job-estimates", job.id] });
    qc.invalidateQueries({ queryKey: getListEstimatesQueryKey() });
  }

  async function handleCreate(req: CreateEstimateRequest) {
    await createMut.mutateAsync({ data: req });
    invalidate();
    setShowModal(false);
  }

  async function handleUpdate(id: number, req: CreateEstimateRequest) {
    await updateMut.mutateAsync({ id, data: req });
    invalidate();
    setEditEst(null);
  }

  const totalLinked = estimates.reduce((s, e) => s + e.total, 0);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-50 w-full max-w-md h-full bg-background shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div>
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Calculator className="w-4 h-4 text-amber-500" /> Estimates
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[260px]">{job.title}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary */}
        {estimates.length > 0 && (
          <div className="px-5 py-3 border-b border-border/50 bg-muted/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground flex-shrink-0">{estimates.length} estimate{estimates.length !== 1 ? "s" : ""}</span>
              <span className="text-sm font-bold text-amber-600 flex items-center gap-1 flex-shrink-0">
                <DollarSign className="w-3.5 h-3.5" />{formatCurrency(totalLinked).replace("$", "")}
              </span>
            </div>
            {onLoadAllIntoInvoice && canEdit("invoices") && (
              <button
                onClick={() => { onLoadAllIntoInvoice(estimates); onClose(); }}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
              >
                <FileText className="w-3 h-3" /> Create Invoice
              </button>
            )}
          </div>
        )}

        {/* New estimate button */}
        {canEdit("estimates") && (
          <div className="px-5 py-3 border-b border-border/50">
            <button
              onClick={() => setShowModal(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-amber-300 text-amber-600 text-sm font-semibold hover:bg-amber-50 transition-colors"
            >
              <Plus className="w-4 h-4" /> Build Estimate for this Job
            </button>
          </div>
        )}

        {/* Estimates list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isLoading ? (
            [1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />)
          ) : estimates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <Calculator className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No estimates linked yet</p>
              <p className="text-xs text-muted-foreground mt-1">Click "Build Estimate" to add one</p>
            </div>
          ) : (
            estimates.map(est => (
              <div key={est.id} className="rounded-xl border border-border/50 bg-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_BADGE[est.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {est.status}
                  </span>
                  <div className="flex items-center gap-1">
                    {canEdit("estimates") && (
                      <button
                        onClick={() => setEditEst(est)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-0.5 rounded-lg border border-border hover:bg-muted/50"
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                    )}
                  </div>
                </div>
                <p className="font-semibold text-sm text-foreground">{est.title}</p>
                {est.lineItems && est.lineItems.length > 0 && (
                  <div className="space-y-0.5">
                    {est.lineItems.slice(0, 2).map((l, i) => (
                      <div key={i} className="flex justify-between text-xs text-muted-foreground">
                        <span className="truncate max-w-[60%]">{l.description}</span>
                        <span>{formatCurrency(l.total ?? l.quantity * l.unitCost)}</span>
                      </div>
                    ))}
                    {est.lineItems.length > 2 && (
                      <p className="text-xs text-muted-foreground italic">+{est.lineItems.length - 2} more</p>
                    )}
                  </div>
                )}
                <div className="pt-1 border-t border-border/50 flex justify-end">
                  <span className="text-sm font-bold text-amber-600">{formatCurrency(est.total)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <EstimateModal
          prelinkedJobId={job.id}
          prelinkedJobTitle={job.title}
          prelinkedClientId={job.clientId ?? undefined}
          onClose={() => setShowModal(false)}
          onSave={handleCreate}
        />
      )}
      {editEst && (
        <EstimateModal
          initial={editEst}
          prelinkedJobId={job.id}
          prelinkedJobTitle={job.title}
          onClose={() => setEditEst(null)}
          onSave={req => handleUpdate(editEst.id, req)}
        />
      )}
    </div>
  );
}

// ─── Job Card ──────────────────────────────────────────────────────────────────
function JobCard({
  job, onEdit, onDelete, onReviewInvoice, onMarkCompleted, logCount, lastLogDate, materialListCount, onLoadEstimateIntoInvoice,
}: {
  job: Job;
  onEdit: (job: Job) => void;
  onDelete: (job: Job) => void;
  onReviewInvoice: (job: Job) => void;
  onMarkCompleted: (job: Job) => void;
  logCount: number;
  lastLogDate?: string;
  materialListCount: number;
  onLoadEstimateIntoInvoice?: (job: Job, estimates: Estimate[]) => void;
}) {
  const { canEdit } = useUserPermissions();
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [materialsPanelOpen, setMaterialsPanelOpen] = useState(false);
  const [estimatesPanelOpen, setEstimatesPanelOpen] = useState(false);
  const isCompleted = displayStatus(job.status) === "completed";

  return (
    <>
      <Card className="p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-semibold text-foreground text-sm truncate">{job.title}</h3>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isCompleted ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
              }`}>
                {isCompleted ? <CheckCircle className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                {isCompleted ? "Completed" : "Scheduled"}
              </span>
            </div>
            {job.estimatedAmount && (
              <p className="text-amber-600 font-bold text-sm">{formatCurrency(job.estimatedAmount)}</p>
            )}
          </div>
          {canEdit("jobs") && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => onEdit(job)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDelete(job)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          {job.clientName && (
            <div className="flex items-center gap-1.5">
              <Users className="w-3 h-3 flex-shrink-0" />
              <span>{job.clientName}</span>
            </div>
          )}
          {(job.locationName || job.city || job.state) && (
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span>{[job.locationName, job.city, job.state].filter(Boolean).join(", ")}</span>
            </div>
          )}
          {job.startDate && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              <span>{formatDate(job.startDate)}{job.endDate && ` – ${formatDate(job.endDate)}`}</span>
            </div>
          )}
          {job.subcontractorNames?.length > 0 && (
            <div className="flex items-center gap-1.5">
              <HardHat className="w-3 h-3 flex-shrink-0" />
              <span>{job.subcontractorNames.join(", ")}</span>
            </div>
          )}
        </div>

        {/* Daily Log button + indicator */}
        <button
          onClick={() => setLogPanelOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-muted/40 transition-colors text-xs font-medium text-muted-foreground w-full">
          <ClipboardList className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <span className="flex-1 text-left">Daily Log</span>
          {logCount > 0 ? (
            <span className="flex items-center gap-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{logCount}</span>
              {lastLogDate && <span className="text-[10px] text-muted-foreground">Last: {formatDate(lastLogDate)}</span>}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">No entries</span>
          )}
        </button>

        {/* Material Lists button */}
        <button
          onClick={() => setMaterialsPanelOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-muted/40 transition-colors text-xs font-medium text-muted-foreground w-full">
          <Package className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <span className="flex-1 text-left">Materials</span>
          {materialListCount > 0 ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{materialListCount}</span>
          ) : (
            <span className="text-[10px] text-muted-foreground">No lists</span>
          )}
        </button>

        {/* Estimates button */}
        <button
          onClick={() => setEstimatesPanelOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-muted/40 transition-colors text-xs font-medium text-muted-foreground w-full">
          <Calculator className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <span className="flex-1 text-left">Estimates</span>
          <span className="text-[10px] text-muted-foreground">View / Build</span>
        </button>

        {isCompleted ? (
          canEdit("invoices") && (
            <button
              onClick={() => onReviewInvoice(job)}
              className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors shadow-sm">
              <FileText className="w-3.5 h-3.5" /> Review Invoice
            </button>
          )
        ) : (
          canEdit("jobs") && (
            <button
              onClick={() => onMarkCompleted(job)}
              className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold hover:bg-emerald-100 transition-colors">
              <CheckCircle className="w-3.5 h-3.5" /> Mark Completed
            </button>
          )
        )}
      </Card>

      {logPanelOpen && (
        <JobDailyLogPanel job={job} onClose={() => setLogPanelOpen(false)} />
      )}
      {materialsPanelOpen && (
        <JobMaterialsPanel job={job} onClose={() => setMaterialsPanelOpen(false)} />
      )}
      {estimatesPanelOpen && (
        <JobEstimatesPanel
          job={job}
          onClose={() => setEstimatesPanelOpen(false)}
          onLoadAllIntoInvoice={onLoadEstimateIntoInvoice
            ? (ests) => onLoadEstimateIntoInvoice(job, ests)
            : undefined}
        />
      )}
    </>
  );
}

// ─── Job Form Dialog ───────────────────────────────────────────────────────────
function JobFormDialog({
  open, onOpenChange, editJob, clients, subcontractors, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editJob: Job | null;
  clients: Client[];
  subcontractors: Subcontractor[];
  onSaved: () => void;
}) {
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();

  function makeForm() {
    if (editJob) {
      return {
        title: editJob.title,
        clientId: String(editJob.clientId ?? ""),
        status: displayStatus(editJob.status),
        locationName: editJob.locationName ?? "",
        city: editJob.city ?? "",
        state: editJob.state ?? "KY",
        estimatedAmount: editJob.estimatedAmount ? String(editJob.estimatedAmount) : "",
        startDate: editJob.startDate ?? "",
        endDate: editJob.endDate ?? "",
        notes: editJob.notes ?? "",
      };
    }
    return {
      title: "", clientId: "", status: "scheduled",
      locationName: "", city: "", state: "KY",
      estimatedAmount: "", startDate: "", endDate: "", notes: "",
    };
  }

  const [form, setFormState] = useState(makeForm);
  const [subIds, setSubIds]   = useState<number[]>(editJob?.subcontractorIds ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function setField(k: string, v: string) { setFormState(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required"); return; }
    setSubmitting(true);
    setError("");
    try {
      const payload: CreateJobRequest = {
        title: form.title.trim(),
        clientId: form.clientId ? parseInt(form.clientId) : undefined,
        subcontractorIds: subIds,
        status: form.status as CreateJobRequest["status"],
        locationName: form.locationName || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        estimatedAmount: form.estimatedAmount ? parseFloat(form.estimatedAmount) : undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        notes: form.notes || undefined,
      };
      if (editJob) {
        await updateJob.mutateAsync({ id: editJob.id, data: payload });
      } else {
        await createJob.mutateAsync({ data: payload });
      }
      onSaved();
      onOpenChange(false);
    } catch {
      setError("Failed to save job. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="h-1 bg-gradient-to-r from-amber-500 to-amber-400 flex-shrink-0 rounded-t-2xl" />
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
            <h2 className="text-lg font-bold text-foreground">{editJob ? "Edit Job" : "New Job"}</h2>
            <button type="button" onClick={() => onOpenChange(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-2">

          {error && (
            <div className="px-4 py-2.5 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive flex items-center gap-2">
              <X className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Job Title *</label>
            <input type="text" required
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="e.g. Kitchen Renovation"
              value={form.title} onChange={e => setField("title", e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Status</label>
            <div className="flex gap-3">
              {["scheduled", "completed"].map(s => (
                <label key={s} className="flex-1">
                  <input type="radio" name="status" value={s} checked={form.status === s}
                    onChange={() => setField("status", s)} className="sr-only" />
                  <span className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer transition-all ${
                    form.status === s
                      ? s === "completed"
                        ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
                        : "bg-blue-500 border-blue-500 text-white shadow-sm"
                      : "bg-background border-border text-muted-foreground hover:border-primary/30"
                  }`}>
                    {s === "completed" ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    {s === "completed" ? "Completed" : "Scheduled"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Client</label>
            <select
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={form.clientId} onChange={e => setField("clientId", e.target.value)}>
              <option value="">No client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3">
              <label className="block text-sm font-medium text-foreground mb-1">
                <MapPin className="w-3 h-3 inline mr-1 text-amber-500" />Work Location Name
              </label>
              <input type="text"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. 123 Main St"
                value={form.locationName} onChange={e => setField("locationName", e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1">City</label>
              <input type="text"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={form.city} onChange={e => setField("city", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">State</label>
              <input type="text"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={form.state} onChange={e => setField("state", e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              <HardHat className="w-3 h-3 inline mr-1" />Subcontractors
            </label>
            <SubcontractorPicker subcontractors={subcontractors} selected={subIds} onChange={setSubIds} />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Est. Amount</label>
            <input type="number" min="0" step="0.01"
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={form.estimatedAmount} onChange={e => setField("estimatedAmount", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Start Date</label>
              <input type="date"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={form.startDate} onChange={e => setField("startDate", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                End Date <span className="text-[10px] font-normal text-muted-foreground">(optional)</span>
              </label>
              <input type="date"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={form.endDate} onChange={e => setField("endDate", e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <textarea rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              value={form.notes} onChange={e => setField("notes", e.target.value)} />
          </div>

          </div>

          <div className="flex gap-3 px-6 py-4 border-t border-border/50 flex-shrink-0">
            <button type="button" onClick={() => onOpenChange(false)}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors shadow disabled:opacity-60">
              {submitting ? "Saving…" : editJob ? "Save Changes" : "Create Job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirmation ───────────────────────────────────────────────────────
function DeleteConfirm({
  label, onConfirm, onCancel, deleting, details,
}: {
  label: string; onConfirm: () => void; onCancel: () => void; deleting: boolean;
  details?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <Trash2 className="w-6 h-6 text-destructive" />
        </div>
        <div>
          <h3 className="font-bold text-foreground">Delete {label}?</h3>
          <p className="text-sm text-muted-foreground mt-1">This action cannot be undone.</p>
          {details && (
            <div className="mt-2 px-3 py-2 bg-destructive/5 border border-destructive/15 rounded-lg text-xs text-muted-foreground text-left">
              {details}
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold hover:bg-destructive/90 transition-colors shadow disabled:opacity-60">
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Saved Invoices Section ────────────────────────────────────────────────────
const UNPAID_STATUSES = new Set(["draft", "pending", "sent", "overdue"]);

function SavedInvoicesSection() {
  const { canEdit } = useUserPermissions();
  const { data: invoices = [], isLoading } = useListInvoices();
  const { data: settings }  = useGetSettings();
  const updateStatus  = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();
  const queryClient   = useQueryClient();

  const [collapsed, setCollapsed]       = useState(false);
  const [activeTab, setActiveTab]       = useState<"unpaid" | "paid">("unpaid");
  const [editInvoice, setEditInvoice]   = useState<Invoice | null>(null);
  const [viewInvoice, setViewInvoice]   = useState<Invoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [deleting, setDeleting]         = useState(false);

  const jobInvoices = invoices.filter(inv => inv.jobId != null);
  const unpaidInvoices = jobInvoices.filter(inv => UNPAID_STATUSES.has(inv.status));
  const paidInvoices   = jobInvoices.filter(inv => inv.status === "paid");
  const tabInvoices    = activeTab === "unpaid" ? unpaidInvoices : paidInvoices;

  async function handleMarkPaid(inv: Invoice) {
    await updateStatus.mutateAsync({ id: inv.id, data: { status: "paid" } });
    queryClient.invalidateQueries();
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteInvoice.mutateAsync({ id: deleteTarget.id });
      queryClient.invalidateQueries();
      if (viewInvoice?.id === deleteTarget.id) setViewInvoice(null);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  function renderTable(rows: Invoice[]) {
    if (rows.length === 0) {
      return (
        <div className="py-10 text-center space-y-2 text-muted-foreground px-6">
          <FileText className="w-8 h-8 mx-auto text-muted-foreground/30" />
          {activeTab === "unpaid"
            ? <p className="text-sm">No outstanding invoices. Mark a job Completed and click "Review Invoice" to create one.</p>
            : <p className="text-sm">No paid invoices yet.</p>}
        </div>
      );
    }
    return (
      <table className="w-full text-sm">
        <thead className="bg-muted/30 border-b border-border/50">
          <tr>
            <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice #</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
            <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</th>
            <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
            <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((inv: Invoice) => (
            <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
              <td className="px-5 py-3 font-mono text-xs font-semibold text-foreground">{inv.invoiceNumber}</td>
              <td className="px-5 py-3 text-sm text-foreground">{inv.clientName ?? <span className="text-muted-foreground italic">No client</span>}</td>
              <td className="px-5 py-3 text-sm text-muted-foreground">{formatDate(inv.issueDate)}</td>
              <td className="px-5 py-3 text-right font-bold text-amber-600">{formatCurrency(inv.total)}</td>
              <td className="px-5 py-3 text-center">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${INVOICE_STATUS_COLORS[inv.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                </span>
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => setViewInvoice(inv)}
                    title="View / Print"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
                    <Eye className="w-3 h-3" /> View
                  </button>
                  {canEdit("invoices") && (
                    <>
                      <button onClick={() => setEditInvoice(inv)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors">
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                      {inv.status !== "paid" && (
                        <button onClick={() => handleMarkPaid(inv)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors">
                          <Check className="w-3 h-3" /> Paid
                        </button>
                      )}
                      <button onClick={() => setDeleteTarget(inv)}
                        className="p-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-border/50 cursor-pointer hover:bg-muted/20 transition-colors"
          onClick={() => setCollapsed(c => !c)}>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-foreground">Invoices</span>
            {unpaidInvoices.length > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                {unpaidInvoices.length} unpaid
              </span>
            )}
          </div>
          {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </div>

        {!collapsed && (
          <>
            {/* Tabs */}
            <div className="flex border-b border-border/50 bg-muted/10">
              <button
                onClick={() => setActiveTab("unpaid")}
                className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 ${activeTab === "unpaid" ? "border-amber-500 text-amber-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                Unpaid
                {unpaidInvoices.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                    {unpaidInvoices.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("paid")}
                className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 ${activeTab === "paid" ? "border-emerald-500 text-emerald-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                Paid
                {paidInvoices.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                    {paidInvoices.length}
                  </span>
                )}
              </button>
            </div>

            <div className="overflow-x-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : renderTable(tabInvoices)}
            </div>
          </>
        )}
      </Card>

      {editInvoice && (
        <InvoiceEditorDialog
          open={Boolean(editInvoice)}
          onOpenChange={open => { if (!open) setEditInvoice(null); }}
          existingInvoice={editInvoice}
          onSaved={() => { setEditInvoice(null); queryClient.invalidateQueries(); }}
        />
      )}

      {viewInvoice && (
        <InvoiceViewModal
          invoice={viewInvoice}
          settings={settings}
          onClose={() => setViewInvoice(null)}
          onDelete={() => { setDeleteTarget(viewInvoice); setViewInvoice(null); }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          label={`Invoice ${deleteTarget.invoiceNumber}`}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </>
  );
}

// ─── Main Jobs Page ────────────────────────────────────────────────────────────
export default function Jobs() {
  const { canEdit, canView } = useUserPermissions();
  const canEditJobs = canEdit("jobs");
  const queryClient = useQueryClient();
  const { data: jobs = [],    isLoading } = useListJobs();
  const { data: clients = [] }            = useListClients();
  const { data: subcontractors = [] }     = useListSubcontractors();
  const deleteJobMutation                 = useDeleteJob();
  const updateJob                         = useUpdateJob();
  const { data: allLogs = [] }            = useListDailyLogs();
  const { data: allMaterialLists = [] }   = useListMaterialLists();

  // Compute per-job log indicators
  const logsByJob = allLogs.reduce<Record<number, DailyLog[]>>((acc, log) => {
    if (log.jobId == null) return acc;
    if (!acc[log.jobId]) acc[log.jobId] = [];
    acc[log.jobId].push(log);
    return acc;
  }, {});

  const materialListCountByJob = allMaterialLists.reduce<Record<number, number>>((acc, list) => {
    if (list.jobId == null) return acc;
    acc[list.jobId] = (acc[list.jobId] ?? 0) + 1;
    return acc;
  }, {});

  const [jobSearch, setJobSearch]       = useState("");
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [jobFormOpen, setJobFormOpen]   = useState(false);
  const [editJob, setEditJob]           = useState<Job | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [relatedCounts, setRelatedCounts] = useState<{ dailyLogs: number; expenses: number; mileageLogs: number; recurringExpenses: number } | null>(null);

  const [invoiceEditorOpen, setInvoiceEditorOpen]       = useState(false);
  const [invoiceDraftData, setInvoiceDraftData]         = useState<InvoiceDraft | null>(null);
  const [selectedExistingInvoice, setSelectedExistingInvoice] = useState<Invoice | null>(null);
  const [invoiceFetching, setInvoiceFetching]           = useState(false);

  const searchLower   = jobSearch.toLowerCase().trim();
  const jobMatchesSearch = (j: Job) => {
    if (!searchLower) return true;
    return (
      j.title?.toLowerCase().includes(searchLower) ||
      j.clientName?.toLowerCase().includes(searchLower) ||
      j.locationName?.toLowerCase().includes(searchLower) ||
      j.city?.toLowerCase().includes(searchLower) ||
      j.state?.toLowerCase().includes(searchLower)
    );
  };
  const totalCompletedCount = jobs.filter(j => displayStatus(j.status) === "completed").length;
  const scheduledJobs = jobs.filter(j => displayStatus(j.status) === "scheduled" && jobMatchesSearch(j));
  const completedJobs = completedExpanded
    ? jobs.filter(j => displayStatus(j.status) === "completed" && jobMatchesSearch(j))
    : [];

  function openNewJob() { setEditJob(null); setJobFormOpen(true); }
  function openEditJob(job: Job) { setEditJob(job); setJobFormOpen(true); }

  async function openDeleteTarget(job: Job) {
    setDeleteTarget(job);
    setRelatedCounts(null);
    try {
      const res = await fetch(`${BASE}/api/jobs/${job.id}/related-counts`);
      if (res.ok) setRelatedCounts(await res.json());
    } catch { /* ignore */ }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteJobMutation.mutateAsync({ id: deleteTarget.id });
      queryClient.invalidateQueries();
    } finally { setDeleting(false); setDeleteTarget(null); setRelatedCounts(null); }
  }

  async function handleMarkCompleted(job: Job) {
    await updateJob.mutateAsync({ id: job.id, data: { status: "completed" } });
    queryClient.invalidateQueries();
  }

  async function handleReviewInvoice(job: Job) {
    setInvoiceFetching(true);
    try {
      // Fetch all drafts and job invoice draft data in parallel
      const [invRes, jobDraft] = await Promise.all([
        fetch(`${BASE}/api/invoices?status=draft`),
        getJobInvoiceDraft(job.id).catch(() => null),
      ]);

      let existingDraft: Invoice | undefined;
      if (invRes.ok) {
        const allDrafts: Invoice[] = await invRes.json();
        existingDraft = allDrafts.find(inv => inv.jobId === job.id);
      }

      if (existingDraft) {
        // Ensure the job's labor/service line item is present on the existing draft.
        // Auto-sync only manages the "Materials" line; the labor line must also be there.
        const currentLineItems: Array<{ id: number; description: string; quantity: number; unitPrice: number; total: number }> =
          Array.isArray(existingDraft.lineItems) ? existingDraft.lineItems : [];

        const laborDesc = jobDraft?.lineItems?.[0]?.description;
        const laborPrice = jobDraft?.lineItems?.[0]?.unitPrice ?? 0;
        const hasLaborLine = laborDesc
          ? currentLineItems.some(li => li.description === laborDesc)
          : false;

        if (!hasLaborLine && laborDesc) {
          // Add the labor/service line item to the existing draft
          const nextId = currentLineItems.length > 0
            ? Math.max(...currentLineItems.map((li: { id: number }) => li.id)) + 1
            : 1;
          const updatedLineItems = [
            { id: nextId, description: laborDesc, quantity: 1, unitPrice: laborPrice, total: laborPrice },
            ...currentLineItems,
          ];
          const putRes = await fetch(`${BASE}/api/invoices/${existingDraft.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...existingDraft,
              lineItems: updatedLineItems,
            }),
          });
          if (putRes.ok) {
            existingDraft = await putRes.json();
          }
        }

        setInvoiceDraftData(null);
        setSelectedExistingInvoice(existingDraft ?? null);
        setInvoiceEditorOpen(true);
        return;
      }

      // No existing draft — open the editor using job draft data (creates new invoice on save)
      if (jobDraft) {
        setInvoiceDraftData(jobDraft);
        setSelectedExistingInvoice(null);
        setInvoiceEditorOpen(true);
      }
    } catch {
      // ignore — if the draft fetch fails the dialog just won't open
    } finally { setInvoiceFetching(false); }
  }

  function handleLoadAllEstimatesIntoInvoice(job: Job, estimates: Estimate[]) {
    const lineItems = estimates.map((estimate) => ({
      description: estimate.title,
      quantity: 1,
      unitPrice: estimate.total,
    }));
    const draft: InvoiceDraft = {
      clientId: job.clientId ?? null,
      clientName: job.clientName ?? null,
      clientEmail: null,
      clientAddress: null,
      clientPhone: null,
      clientCity: null,
      clientState: null,
      clientZip: null,
      jobId: job.id,
      jobTitle: job.title,
      locationName: job.locationName ?? null,
      city: job.city ?? null,
      state: job.state ?? null,
      lineItems,
    };
    setInvoiceDraftData(draft);
    setSelectedExistingInvoice(null);
    setInvoiceEditorOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Jobs</h1>
          <p className="text-muted-foreground mt-1">Manage jobs and generate invoices for completed work.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search jobs…"
              value={jobSearch}
              onChange={e => setJobSearch(e.target.value)}
              className="pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 w-48"
            />
          </div>
          {canEditJobs && (
            <button onClick={openNewJob}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 transition-colors shadow-sm">
              <Plus className="w-4 h-4" /> New Job
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && jobs.length === 0 && (
        <Card className="py-16 text-center space-y-3">
          <Briefcase className="w-12 h-12 text-muted-foreground/30 mx-auto" />
          <p className="font-semibold text-foreground">No jobs yet</p>
          <p className="text-sm text-muted-foreground">Create your first job to get started.</p>
          {canEditJobs && (
            <button onClick={openNewJob}
              className="mx-auto mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 transition-colors shadow-sm">
              <Plus className="w-4 h-4" /> New Job
            </button>
          )}
        </Card>
      )}

      {/* Jobs grid */}
      {!isLoading && jobs.length > 0 && (
        <>
          {scheduledJobs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-blue-500" />
                <h2 className="font-semibold text-foreground">Scheduled</h2>
                <span className="text-sm text-muted-foreground">({scheduledJobs.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {scheduledJobs.map(job => {
                  const jobLogs = logsByJob[job.id] ?? [];
                  const lastLog = jobLogs.sort((a, b) => b.date.localeCompare(a.date))[0];
                  return (
                    <JobCard key={job.id} job={job} onEdit={openEditJob}
                      onDelete={openDeleteTarget} onReviewInvoice={handleReviewInvoice}
                      onMarkCompleted={handleMarkCompleted}
                      logCount={jobLogs.length} lastLogDate={lastLog?.date}
                      materialListCount={materialListCountByJob[job.id] ?? 0}
                      onLoadEstimateIntoInvoice={handleLoadAllEstimatesIntoInvoice} />
                  );
                })}
              </div>
            </div>
          )}

          {totalCompletedCount > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setCompletedExpanded(v => !v)}
                className="flex items-center gap-2 w-full text-left group mb-3"
              >
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <h2 className="font-semibold text-foreground">Completed</h2>
                <span className="text-sm text-muted-foreground">({totalCompletedCount})</span>
                <span className="ml-auto text-muted-foreground group-hover:text-foreground transition-colors">
                  {completedExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>
              {completedExpanded && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {completedJobs.length > 0 ? completedJobs.map(job => {
                    const jobLogs = logsByJob[job.id] ?? [];
                    const lastLog = jobLogs.sort((a, b) => b.date.localeCompare(a.date))[0];
                    return (
                      <JobCard key={job.id} job={job} onEdit={openEditJob}
                        onDelete={openDeleteTarget} onReviewInvoice={handleReviewInvoice}
                        onMarkCompleted={handleMarkCompleted}
                        logCount={jobLogs.length} lastLogDate={lastLog?.date}
                        materialListCount={materialListCountByJob[job.id] ?? 0}
                        onLoadEstimateIntoInvoice={handleLoadAllEstimatesIntoInvoice} />
                    );
                  }) : (
                    <p className="col-span-3 py-4 text-sm text-muted-foreground text-center">
                      No completed jobs match "{jobSearch}".
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {scheduledJobs.length === 0 && !searchLower && totalCompletedCount === 0 && (
            <div className="py-10 text-center text-muted-foreground">
              <p>No jobs found.</p>
            </div>
          )}
          {scheduledJobs.length === 0 && searchLower && completedJobs.length === 0 && (
            <div className="py-10 text-center text-muted-foreground">
              <p>No jobs match "{jobSearch}".</p>
            </div>
          )}
        </>
      )}

      {/* Saved Invoices section — only shown when user has invoices view access */}
      {canView("invoices") && <SavedInvoicesSection />}

      {/* Dialogs */}
      {jobFormOpen && (
        <JobFormDialog
          open={jobFormOpen}
          onOpenChange={setJobFormOpen}
          editJob={editJob}
          clients={clients}
          subcontractors={subcontractors}
          onSaved={() => queryClient.invalidateQueries()}
        />
      )}

      {invoiceEditorOpen && (
        <InvoiceEditorDialog
          open={invoiceEditorOpen}
          onOpenChange={open => {
            if (!open) {
              setInvoiceEditorOpen(false);
              setInvoiceDraftData(null);
              setSelectedExistingInvoice(null);
            }
          }}
          initialData={invoiceDraftData}
          existingInvoice={selectedExistingInvoice ?? undefined}
          onSaved={() => {
            setInvoiceEditorOpen(false);
            setInvoiceDraftData(null);
            setSelectedExistingInvoice(null);
            queryClient.invalidateQueries();
          }}
        />
      )}

      {invoiceFetching && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl p-6 flex items-center gap-3 shadow-xl">
            <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-gray-700">Loading invoice data…</span>
          </div>
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirm
          label={`job "${deleteTarget.title}"`}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => { setDeleteTarget(null); setRelatedCounts(null); }}
          deleting={deleting}
          details={relatedCounts ? (
            (() => {
              const parts: string[] = [];
              if (relatedCounts.dailyLogs > 0) parts.push(`${relatedCounts.dailyLogs} daily log${relatedCounts.dailyLogs !== 1 ? "s" : ""}`);
              if (relatedCounts.expenses > 0) parts.push(`${relatedCounts.expenses} expense${relatedCounts.expenses !== 1 ? "s" : ""}`);
              if (relatedCounts.mileageLogs > 0) parts.push(`${relatedCounts.mileageLogs} mileage entr${relatedCounts.mileageLogs !== 1 ? "ies" : "y"}`);
              if (relatedCounts.recurringExpenses > 0) parts.push(`${relatedCounts.recurringExpenses} recurring expense${relatedCounts.recurringExpenses !== 1 ? "s" : ""}`);
              return parts.length > 0
                ? `This will also permanently delete ${parts.join(", ")} linked to this job.`
                : "No additional records are linked to this job.";
            })()
          ) : undefined}
        />
      )}
    </div>
  );
}
