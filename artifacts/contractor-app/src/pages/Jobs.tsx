import { useState, useRef, ReactNode, useEffect, useMemo } from "react";
import { useSearchParams, useLocation } from "wouter";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  useListJobs, useCreateJob, useUpdateJob, useDeleteJob,
  useListClients, useListSubcontractors, getJobInvoiceDraft,
  useListDailyLogs, useCreateDailyLog, useDeleteDailyLog,
  useGetSettings,
  useListMaterials, useListMaterialLists, useCreateMaterialList,
  useDeleteMaterialList,
  useListEstimates, useCreateEstimate, useUpdateEstimate, useDeleteEstimate,
  useCreateInvoicePaymentLink,
  Job, Invoice, Client, Subcontractor, InvoiceDraft, CreateJobRequest, DailyLog,
  MaterialList, MaterialListItemInput,
  Estimate, CreateEstimateRequest, getListEstimatesQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { EstimateModal } from "./Estimates";
import { formatCurrency, formatDate, localDateString } from "@/lib/utils";
import { autoAttachMaterialsPdf } from "@/lib/autoAttachMaterialsPdf";
import { ClientProfileDrawer } from "@/components/ClientProfileDrawer";
import { Card } from "@/components/ui/card";
import { InvoiceEditorDialog } from "@/components/InvoiceEditorDialog";
import {
  Briefcase, MapPin, Calendar, HardHat, Users,
  Plus, Check, X, Trash2, ChevronDown, ChevronUp, FileText,
  Edit2, CheckCircle, Clock, ClipboardList, Upload,
  AlertCircle, ArrowLeft, Eye, Package, ListChecks, Search,
  Calculator, DollarSign, Receipt, Layers, TrendingUp,
  CreditCard, Copy, ExternalLink, Bell, ArrowRight, Wand2,
} from "lucide-react";
import { GCEstimateWizard } from "@/components/GCEstimateWizard";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");


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
  const deleteMut = useDeleteEstimate();

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["job-estimates", job.id] });
    qc.invalidateQueries({ queryKey: getListEstimatesQueryKey() });
  }

  async function handleDelete(id: number) {
    setDeleteError(null);
    try {
      await deleteMut.mutateAsync({ id });
      setConfirmDeleteId(null);
      invalidate();
    } catch {
      setDeleteError("Could not delete estimate. Please try again.");
    }
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
            <p className="text-center text-[11px] text-muted-foreground mt-1.5">
              Add one estimate per trade or scope — siding, trim, drywall, etc.
            </p>
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
              <p className="text-xs text-muted-foreground mt-1">You can add as many as you need — one per trade or scope</p>
            </div>
          ) : (
            estimates.map(est => (
              <div key={est.id} className="rounded-xl border border-border/50 bg-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_BADGE[est.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {est.status}
                  </span>
                  <div className="flex items-center gap-1">
                    {canEdit("estimates") && confirmDeleteId === est.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(est.id)}
                          disabled={deleteMut.isPending}
                          className="text-xs text-white bg-red-500 hover:bg-red-600 flex items-center gap-1 px-2 py-0.5 rounded-lg font-semibold disabled:opacity-50"
                        >
                          {deleteMut.isPending ? "Deleting…" : "Delete"}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-0.5 rounded-lg border border-border hover:bg-muted/50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : canEdit("estimates") ? (
                      <>
                        <button
                          onClick={() => setEditEst(est)}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-0.5 rounded-lg border border-border hover:bg-muted/50"
                        >
                          <Edit2 className="w-3 h-3" /> Edit
                        </button>
                        <button
                          onClick={() => { setDeleteError(null); setConfirmDeleteId(est.id); }}
                          disabled={deleteMut.isPending}
                          aria-label="Delete estimate"
                          title="Delete estimate"
                          className="text-xs text-muted-foreground hover:text-red-600 flex items-center gap-1 px-2 py-0.5 rounded-lg border border-border hover:bg-red-50 hover:border-red-200 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                {deleteError && confirmDeleteId === est.id && (
                  <p className="text-xs text-red-600">{deleteError}</p>
                )}
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

// ─── Job Profit Panel ──────────────────────────────────────────────────────────
type JobProfit = { grossInvoiced: number; collected: number; jobExpenses: number; netProfit: number };

function JobProfitPanel({ job, onClose }: { job: Job; onClose: () => void }) {
  const [data, setData] = useState<JobProfit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}/api/jobs/${job.id}/profit`)
      .then(r => r.ok ? r.json() as Promise<JobProfit> : Promise.reject())
      .then(d => { setData(d); })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [job.id]);

  const net = data?.netProfit ?? 0;
  const isProfit = net > 0;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-card border-l border-border shadow-2xl flex flex-col">
        <div className="h-1 bg-gradient-to-r from-emerald-500 to-emerald-400 flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <div>
              <h2 className="font-bold text-foreground text-sm">Profit & Loss</h2>
              <p className="text-xs text-muted-foreground truncate max-w-[180px]">{job.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />)}
            </div>
          ) : data == null ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <TrendingUp className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No financial data yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Invoiced</p>
                  <p className="text-xl font-bold text-foreground mt-0.5">{formatCurrency(data.grossInvoiced)}</p>
                </div>
                <Receipt className="w-7 h-7 text-muted-foreground/30" />
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/20 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Collected</p>
                  <p className="text-xl font-bold text-emerald-600 mt-0.5">{formatCurrency(data.collected)}</p>
                </div>
                <DollarSign className="w-7 h-7 text-emerald-200" />
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/20 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Job Expenses</p>
                  <p className="text-xl font-bold text-red-500 mt-0.5">{formatCurrency(data.jobExpenses)}</p>
                </div>
                <Briefcase className="w-7 h-7 text-red-100" />
              </div>

              <div className={`rounded-xl border p-4 flex items-center justify-between ${
                isProfit ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
              }`}>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wide ${isProfit ? "text-emerald-700" : "text-red-700"}`}>Net Profit</p>
                  <p className={`text-2xl font-bold mt-0.5 ${isProfit ? "text-emerald-700" : "text-red-600"}`}>
                    {isProfit ? "+" : ""}{formatCurrency(net)}
                  </p>
                </div>
                <TrendingUp className={`w-8 h-8 ${isProfit ? "text-emerald-300" : "text-red-300"}`} />
              </div>

              {data.grossInvoiced > 0 && data.collected < data.grossInvoiced && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  {formatCurrency(data.grossInvoiced - data.collected)} outstanding (not yet collected)
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Job Phase Panel ──────────────────────────────────────────────────────────

type Phase = { name: string; completed: boolean };

function JobPhasePanel({ job, onClose }: { job: Job; onClose: () => void }) {
  const updateJob = useUpdateJob();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [updating, setUpdating] = useState<number | null>(null);

  const phases: Phase[] = Array.isArray(job.phases) ? (job.phases as Phase[]) : [];
  const completedCount = phases.filter(p => p.completed).length;

  async function togglePhase(index: number) {
    if (updating !== null) return;
    const updated = phases.map((p, i) => i === index ? { ...p, completed: !p.completed } : p);
    setUpdating(index);
    try {
      await updateJob.mutateAsync({ id: job.id, data: { phases: updated } });
      qc.invalidateQueries({ queryKey: ["/api/jobs"] });
    } catch {
      toast({ title: "Error", description: "Failed to update phase.", variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-card border-l border-border shadow-2xl flex flex-col">
        <div className="h-1 bg-gradient-to-r from-blue-500 to-blue-400 flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-blue-500" />
            <div>
              <h2 className="font-bold text-foreground text-sm">Project Phases</h2>
              <p className="text-xs text-muted-foreground truncate max-w-[180px]">{job.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {phases.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center gap-3">
              <ListChecks className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground font-medium">No phases yet</p>
              <p className="text-xs text-muted-foreground/70">Use the GC Smart Estimate Wizard to generate a phase checklist for this job.</p>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Progress</span>
                  <span className="text-xs font-bold text-blue-600">
                    {completedCount}/{phases.length} complete
                    <span className="ml-1 text-blue-400 font-normal">
                      ({phases.length > 0 ? Math.round((completedCount / phases.length) * 100) : 0}%)
                    </span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: phases.length > 0 ? `${(completedCount / phases.length) * 100}%` : "0%" }}
                  />
                </div>
                {completedCount === phases.length && phases.length > 0 && (
                  <p className="text-xs text-emerald-600 font-bold mt-1.5 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> All phases complete!
                  </p>
                )}
              </div>

              <div className="space-y-2">
                {phases.map((phase, i) => (
                  <button
                    key={i}
                    onClick={() => togglePhase(i)}
                    disabled={updating !== null}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all ${
                      phase.completed
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-white border-border hover:bg-muted/30 text-foreground"
                    } disabled:opacity-60`}
                  >
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      phase.completed
                        ? "bg-emerald-500 border-emerald-500"
                        : "border-muted-foreground/30"
                    }`}>
                      {updating === i
                        ? <span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                        : phase.completed && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <span className={`text-sm font-medium flex-1 ${phase.completed ? "line-through opacity-60" : ""}`}>
                      {phase.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">{i + 1}/{phases.length}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Job Card ──────────────────────────────────────────────────────────────────
function JobCard({
  job, onEdit, onDelete, onReviewInvoice, onMarkCompleted, logCount, lastLogDate, materialListCount, estimateTotal, onLoadEstimateIntoInvoice,
  invoiceSummary, onCreateInvoice, onClientClick, hasSubExpenses, onToggleSubPaid, profitData,
  onSendPaymentLink, onGoToInvoices, generatingLinkId, onSmartEstimate,
}: {
  job: Job;
  onEdit: (job: Job) => void;
  onDelete: (job: Job) => void;
  onReviewInvoice: (job: Job) => void;
  onMarkCompleted: (job: Job) => void;
  logCount: number;
  lastLogDate?: string;
  materialListCount: number;
  estimateTotal?: number;
  onLoadEstimateIntoInvoice?: (job: Job, estimates: Estimate[]) => void;
  invoiceSummary?: Invoice | null;
  onCreateInvoice?: () => void;
  onClientClick?: (clientId: number) => void;
  hasSubExpenses?: boolean;
  onToggleSubPaid?: (job: Job, paid: boolean) => void;
  profitData?: JobProfit | null;
  onSendPaymentLink?: (invoiceId: number, invoiceNumber: string, currentTotal: number, jobId: number) => void;
  onGoToInvoices?: () => void;
  generatingLinkId?: number | null;
  onSmartEstimate?: (job: Job) => void;
}) {
  const { canEdit } = useUserPermissions();
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [materialsPanelOpen, setMaterialsPanelOpen] = useState(false);
  const [estimatesPanelOpen, setEstimatesPanelOpen] = useState(false);
  const [profitPanelOpen, setProfitPanelOpen] = useState(false);
  const [phasesPanelOpen, setPhasesPanelOpen] = useState(false);
  const isCompleted = displayStatus(job.status) === "completed";
  const inv = invoiceSummary as (Invoice & { squarePaidAt?: string | null }) | null | undefined;
  const squarePaid = !!inv?.squarePaidAt;

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
              {job.businessLine === "asphalt_sealing" && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                  Asphalt
                </span>
              )}
              {job.businessLine === "general_contracting" && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                  GC
                </span>
              )}
              {hasSubExpenses && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  job.subPaid ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"
                }`}>
                  <HardHat className="w-2.5 h-2.5" />
                  {job.subPaid ? "Sub Paid" : "Sub Unpaid"}
                </span>
              )}
              {Array.isArray(job.permitChecklist) && job.permitChecklist.length > 0 && (() => {
                const unchecked = (job.permitChecklist as Array<{ label: string; checked: boolean }>).filter(p => !p.checked).length;
                if (unchecked === 0) return null;
                return (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                    <FileText className="w-2.5 h-2.5" />
                    {unchecked} Permit{unchecked !== 1 ? "s" : ""} Pending
                  </span>
                );
              })()}
            </div>
            {estimateTotal != null && (
              <p className="text-amber-600 font-bold text-sm">{formatCurrency(estimateTotal)}</p>
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
              {job.clientId && onClientClick ? (
                <button
                  onClick={() => onClientClick(job.clientId!)}
                  className="text-primary hover:underline font-medium truncate"
                >
                  {job.clientName}
                </button>
              ) : (
                <span>{job.clientName}</span>
              )}
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

          {job.businessLine === "asphalt_sealing" && (job.sqFt != null || job.coats != null) && (
            <div className="flex items-center gap-1.5 text-amber-600">
              <Layers className="w-3 h-3 flex-shrink-0" />
              <span className="font-medium">
                {[
                  job.sqFt != null ? `${job.sqFt.toLocaleString()} sq ft` : null,
                  job.coats != null ? `${job.coats}×` : null,
                ].filter(Boolean).join(" · ")}
              </span>
            </div>
          )}

          {/* Invoice status indicator */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <Receipt className="w-3 h-3 flex-shrink-0" />
            {invoiceSummary ? (
              <span className={`inline-flex items-center gap-1 font-medium ${
                invoiceSummary.status === "paid"
                  ? "text-emerald-600"
                  : invoiceSummary.status === "sent"
                  ? "text-amber-600"
                  : "text-muted-foreground"
              }`}>
                {invoiceSummary.status === "paid" ? "Paid" : invoiceSummary.status === "sent" ? "Invoice Sent" : "Draft"}
                {invoiceSummary.total != null && ` · ${formatCurrency(invoiceSummary.total)}`}
                {squarePaid && (
                  <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700">
                    Paid via Square
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground/60 italic">Not Invoiced</span>
            )}
          </div>


        </div>

        {/* Inline Job P&L card — shown when invoices or expenses exist */}
        {profitData != null && (profitData.grossInvoiced > 0 || profitData.jobExpenses > 0) && (
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-3 h-3 text-emerald-500 flex-shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Job P&amp;L</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <div className="space-y-0.5">
                <p className="text-[10px] text-muted-foreground">Invoiced</p>
                <p className="font-semibold text-foreground">{formatCurrency(profitData.grossInvoiced)}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] text-muted-foreground">Collected</p>
                <p className="font-semibold text-emerald-600">{formatCurrency(profitData.collected)}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] text-muted-foreground">Expenses</p>
                <p className="font-semibold text-red-500">{formatCurrency(profitData.jobExpenses)}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] text-muted-foreground">Net Profit</p>
                <p className={`font-bold ${profitData.netProfit > 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {profitData.netProfit > 0 ? "+" : ""}{formatCurrency(profitData.netProfit)}
                </p>
              </div>
            </div>
          </div>
        )}

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

        {/* Smart Estimate Wizard — GC only */}
        {job.businessLine === "general_contracting" && onSmartEstimate && canEdit("estimates") && (
          <button
            onClick={() => onSmartEstimate(job)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors text-xs font-bold text-amber-700 w-full">
            <Wand2 className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <span className="flex-1 text-left">Smart Estimate Wizard</span>
            <span className="text-[10px] text-amber-500 font-semibold">KY Rates</span>
          </button>
        )}

        {/* Phases — GC only */}
        {job.businessLine === "general_contracting" && (
          <button
            onClick={() => setPhasesPanelOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-muted/40 transition-colors text-xs font-medium text-muted-foreground w-full">
            <ListChecks className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
            <span className="flex-1 text-left">Phases</span>
            {Array.isArray(job.phases) && job.phases.length > 0 ? (
              <span className="text-[10px] font-bold text-blue-600">
                {(job.phases as Phase[]).filter(p => p.completed).length}/{job.phases.length}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">Run wizard</span>
            )}
          </button>
        )}

        {/* P&L button */}
        <button
          onClick={() => setProfitPanelOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-muted/40 transition-colors text-xs font-medium text-muted-foreground w-full">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          <span className="flex-1 text-left">Profit & Loss</span>
          {profitData != null && (profitData.grossInvoiced > 0 || profitData.jobExpenses > 0) ? (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              profitData.netProfit > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
            }`}>
              {profitData.netProfit > 0 ? "+" : ""}{formatCurrency(profitData.netProfit)}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">View</span>
          )}
        </button>

        {/* Create Invoice — no invoice exists yet */}
        {!invoiceSummary && canEdit("invoices") && onCreateInvoice && (
          <button
            onClick={onCreateInvoice}
            className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 text-xs font-bold hover:bg-primary/20 transition-colors">
            <Receipt className="w-3.5 h-3.5" /> Create Invoice
          </button>
        )}

        {/* Draft invoice — edit + send payment link */}
        {invoiceSummary && invoiceSummary.status === "draft" && canEdit("invoices") && (
          <div className="mt-1 flex gap-1.5">
            <button
              onClick={() => onReviewInvoice(job)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-muted text-foreground border border-border text-xs font-bold hover:bg-muted/80 transition-colors">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
            <button
              onClick={() => invoiceSummary && onSendPaymentLink?.(invoiceSummary.id, invoiceSummary.invoiceNumber ?? "", invoiceSummary.total ?? 0, invoiceSummary.jobId ?? 0)}
              disabled={generatingLinkId === invoiceSummary?.id}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50">
              {generatingLinkId === invoiceSummary?.id
                ? <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />Sending…</>
                : <><CreditCard className="w-3.5 h-3.5" /> Send + Pay Link</>}
            </button>
          </div>
        )}

        {/* Sent/overdue invoice — go manage it on Invoices page */}
        {invoiceSummary && (invoiceSummary.status === "sent" || invoiceSummary.status === "overdue") && (
          <button
            onClick={onGoToInvoices}
            className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold hover:bg-blue-100 transition-colors">
            <FileText className="w-3.5 h-3.5" /> Manage Invoice <ArrowRight className="w-3 h-3 ml-auto" />
          </button>
        )}

        {/* Mark Completed — for scheduled jobs with no invoice yet */}
        {!isCompleted && canEdit("jobs") && (
          <button
            onClick={() => onMarkCompleted(job)}
            className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold hover:bg-emerald-100 transition-colors">
            <CheckCircle className="w-3.5 h-3.5" /> Mark Completed
          </button>
        )}
        {/* Sub Paid toggle — only visible when job has sub expenses */}
        {hasSubExpenses && onToggleSubPaid && canEdit("jobs") && (
          <button
            onClick={() => onToggleSubPaid(job, !job.subPaid)}
            className={`mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors border ${
              job.subPaid
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                : "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"
            }`}>
            <HardHat className="w-3.5 h-3.5" />
            {job.subPaid ? "Sub Paid ✓ — Undo" : "Mark Sub Paid"}
          </button>
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
      {profitPanelOpen && (
        <JobProfitPanel job={job} onClose={() => setProfitPanelOpen(false)} />
      )}
      {phasesPanelOpen && (
        <JobPhasePanel job={job} onClose={() => setPhasesPanelOpen(false)} />
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
  const { activeBusiness, businesses } = useBusiness();

  function makeForm() {
    if (editJob) {
      return {
        title: editJob.title,
        clientId: String(editJob.clientId ?? ""),
        status: displayStatus(editJob.status),
        jobType: editJob.jobType ?? "",
        address: editJob.address ?? "",
        locationName: editJob.locationName ?? "",
        city: editJob.city ?? "",
        state: editJob.state ?? "KY",
        startDate: editJob.startDate ?? "",
        endDate: editJob.endDate ?? "",
        notes: editJob.notes ?? "",
        businessLine: editJob.businessLine ?? "",
        sqFt: editJob.sqFt != null ? String(editJob.sqFt) : "",
        coats: editJob.coats != null ? String(editJob.coats) : "1",
      };
    }
    return {
      title: "", clientId: "", status: "scheduled",
      jobType: "", address: "",
      locationName: "", city: "", state: "KY",
      startDate: "", endDate: "", notes: "",
      businessLine: activeBusiness?.slug ?? "",
      sqFt: "",
      coats: "1",
    };
  }

  const [form, setFormState] = useState(makeForm);
  const [subIds, setSubIds]   = useState<number[]>(editJob?.subcontractorIds ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function setField(k: string, v: string) {
    setFormState(f => ({ ...f, [k]: v }));
  }

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
        jobType: form.jobType || undefined,
        address: form.address || undefined,
        locationName: form.locationName || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        notes: form.notes || undefined,
        businessLine: form.businessLine || undefined,
        sqFt: form.businessLine === "asphalt_sealing" && form.sqFt !== "" ? parseInt(form.sqFt) : undefined,
        coats: form.businessLine === "asphalt_sealing" && form.coats !== "" ? parseInt(form.coats) : undefined,
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

  const isCreate = !editJob;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className={`relative w-full bg-card border border-border shadow-2xl flex flex-col ${
        isCreate
          ? "rounded-t-2xl sm:rounded-2xl sm:max-w-sm"
          : "rounded-t-2xl sm:rounded-2xl sm:max-w-lg max-h-[90dvh] sm:max-h-[90vh]"
      }`}>
        <div className="h-1 bg-gradient-to-r from-amber-500 to-amber-400 flex-shrink-0 rounded-t-2xl" />
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
            <h2 className="text-lg font-bold text-foreground">{editJob ? "Edit Job" : "New Job"}</h2>
            <button type="button" onClick={() => onOpenChange(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className={`${isCreate ? "" : "flex-1 overflow-y-auto"} px-6 space-y-4 pb-2`}>

          {error && (
            <div className="px-4 py-2.5 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive flex items-center gap-2">
              <X className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Job Title *</label>
            <input type="text" required autoFocus={isCreate}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="e.g. Farm House Renovation"
              value={form.title} onChange={e => setField("title", e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Client <span className="text-xs font-normal text-muted-foreground">(optional)</span></label>
            <select
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={form.clientId} onChange={e => setField("clientId", e.target.value)}>
              <option value="">No client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {editJob && !activeBusiness && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Business</label>
            <div className="flex flex-wrap gap-2">
              {[{ value: "", label: "Unassigned" }, ...businesses.map(b => ({ value: b.slug, label: b.name }))].map(opt => (
                <label key={opt.value} className="flex-1 min-w-[100px]">
                  <input type="radio" name="businessLine" value={opt.value}
                    checked={form.businessLine === opt.value}
                    onChange={() => setField("businessLine", opt.value)}
                    className="sr-only" />
                  <span className={`flex items-center justify-center px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    form.businessLine === opt.value
                      ? "bg-primary border-primary text-primary-foreground shadow-sm"
                      : "bg-background border-border text-muted-foreground hover:border-primary/30"
                  }`}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
          )}

          {editJob && form.businessLine === "asphalt_sealing" && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <div>
                <label className="block text-xs font-semibold text-amber-800 mb-1">Sq Ft</label>
                <input
                  type="number" min="0" step="1"
                  className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="e.g. 1200"
                  value={form.sqFt}
                  onChange={e => setField("sqFt", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-amber-800 mb-1">Coats</label>
                <div className="flex gap-2">
                  {["1", "2"].map(c => (
                    <label key={c} className="flex-1">
                      <input type="radio" name="coats" value={c} checked={form.coats === c}
                        onChange={() => setField("coats", c)} className="sr-only" />
                      <span className={`flex items-center justify-center px-3 py-2 rounded-xl border text-sm font-bold cursor-pointer transition-all ${
                        form.coats === c
                          ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                          : "bg-white border-amber-200 text-amber-700 hover:border-amber-400"
                      }`}>{c}x</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {editJob && form.businessLine !== "asphalt_sealing" && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              <Briefcase className="w-3 h-3 inline mr-1 text-amber-500" />Job Type
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={form.jobType} onChange={e => setField("jobType", e.target.value)}>
              <option value="">Select type…</option>
              <option value="full_remodel">Full Remodel</option>
              <option value="kitchen">Kitchen Remodel</option>
              <option value="bathroom">Bathroom Remodel</option>
              <option value="siding">Siding</option>
              <option value="ceiling_repair">Ceiling Repair</option>
              <option value="plumbing">Plumbing Hookup</option>
              <option value="deck">Deck / Porch</option>
              <option value="windows_doors">Window/Door Replacement</option>
              <option value="addition">Addition</option>
              <option value="other">Other</option>
            </select>
          </div>
          )}

          {editJob && (
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
          )}

          {editJob && (
          <div className="space-y-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                <MapPin className="w-3 h-3 inline mr-1 text-amber-500" />Work Location Name
              </label>
              <input type="text"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. Smith Residence"
                value={form.locationName} onChange={e => setField("locationName", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Street Address</label>
              <input type="text"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. 123 Main St"
                value={form.address} onChange={e => setField("address", e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
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
          </div>
          )}

          {editJob && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              <HardHat className="w-3 h-3 inline mr-1" />Subcontractors
            </label>
            <SubcontractorPicker subcontractors={subcontractors} selected={subIds} onChange={setSubIds} />
          </div>
          )}

          {editJob && (
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
          )}

          {editJob && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <textarea rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              value={form.notes} onChange={e => setField("notes", e.target.value)} />
          </div>
          )}

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

// ─── Main Jobs Page ────────────────────────────────────────────────────────────
export default function Jobs() {
  const { canEdit } = useUserPermissions();
  const canEditJobs = canEdit("jobs");
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data: jobs = [],    isLoading } = useListJobs();
  const { data: clients = [] }            = useListClients();
  const { data: subcontractors = [] }     = useListSubcontractors();
  const deleteJobMutation                 = useDeleteJob();
  const updateJob                         = useUpdateJob();
  const { data: allLogs = [] }            = useListDailyLogs();
  const { data: allMaterialLists = [] }   = useListMaterialLists();

  // Fetch subcontractor-category expenses to know which jobs have sub expenses
  const { data: subExpenseData = [] } = useQuery({
    queryKey: ["expenses-subcontractor"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/expenses?category=Subcontractor`);
      if (!res.ok) return [];
      return res.json() as Promise<Array<{ id: number; jobId: number | null; amount: string }>>;
    },
    staleTime: 30 * 1000,
  });
  // Build a Set of jobIds that have subcontractor expenses
  const jobsWithSubExpenses = useMemo(
    () => new Set(subExpenseData.map(e => e.jobId).filter((id): id is number => id != null)),
    [subExpenseData]
  );

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

  const { data: allEstimates = [] } = useListEstimates();
  const estimateTotalByJob = allEstimates.reduce<Record<number, number>>((acc, est) => {
    if (est.jobId == null) return acc;
    acc[est.jobId] = (acc[est.jobId] ?? 0) + est.total;
    return acc;
  }, {});

  const [profileClientId, setProfileClientId] = useState<number | null>(null);

  const { activeBusiness, businesses } = useBusiness();
  const [jobSearch, setJobSearch]       = useState("");
  const [localBLFilter, setLocalBLFilter] = useState<string>("");
  const jobBLFilter = activeBusiness ? activeBusiness.slug : localBLFilter;
  const [needsPayoutFilter, setNeedsPayoutFilter] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [paidExpanded, setPaidExpanded] = useState(false);
  const [jobFormOpen, setJobFormOpen]   = useState(false);
  const [editJob, setEditJob]           = useState<Job | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [relatedCounts, setRelatedCounts] = useState<{ dailyLogs: number; expenses: number; mileageLogs: number; recurringExpenses: number; invoices: number } | null>(null);

  const [invoiceEditorOpen, setInvoiceEditorOpen]       = useState(false);
  const [invoiceDraftData, setInvoiceDraftData]         = useState<InvoiceDraft | null>(null);
  const [selectedExistingInvoice, setSelectedExistingInvoice] = useState<Invoice | null>(null);
  const [invoiceFetching, setInvoiceFetching]           = useState(false);

  const [gcWizardJob, setGcWizardJob] = useState<Job | null>(null);

  const [paymentLinkResult, setPaymentLinkResult] = useState<{ url: string; invoiceNumber: string; invoiceId: number } | null>(null);
  const [generatingLinkId, setGeneratingLinkId]   = useState<number | null>(null);
  const [sendingReminderId, setSendingReminderId] = useState<number | null>(null);
  const createPaymentLinkMutation = useCreateInvoicePaymentLink();
  const { toast } = useToast();

  type InvoiceWithSquare = Invoice & { squarePaidAt?: string | null };
  const [invoiceSummaryMap, setInvoiceSummaryMap] = useState<Map<number, InvoiceWithSquare | null>>(new Map());

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
  const jobMatchesBL = (j: Job) => !jobBLFilter || j.businessLine === jobBLFilter;
  const jobMatchesPayout = (j: Job) => !needsPayoutFilter || (jobsWithSubExpenses.has(j.id) && !j.subPaid);
  const scheduledJobs = jobs.filter(j => displayStatus(j.status) === "scheduled" && jobMatchesSearch(j) && jobMatchesBL(j) && jobMatchesPayout(j));

  // All completed jobs matching BL/payout — kept for invoice-summary fetching and section counts
  const allCompletedBase = jobs.filter(j => displayStatus(j.status) === "completed" && jobMatchesBL(j) && jobMatchesPayout(j));

  // Split by invoice payment status once summaries arrive
  const completedUnpaidBase = allCompletedBase.filter(j => invoiceSummaryMap.get(j.id)?.status !== "paid");
  const paidBase            = allCompletedBase.filter(j => invoiceSummaryMap.get(j.id)?.status === "paid");

  // Apply search only when expanded (same pattern as before)
  const completedJobs = (completedExpanded || needsPayoutFilter)
    ? completedUnpaidBase.filter(j => jobMatchesSearch(j))
    : [];
  const paidJobs = paidExpanded
    ? paidBase.filter(j => jobMatchesSearch(j))
    : [];

  // Fetch invoice summaries for scheduled + ALL completed jobs so split counts stay accurate
  const visibleJobIds = useMemo(
    () => [...scheduledJobs, ...allCompletedBase].map(j => j.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheduledJobs.map(j => j.id).join(","), allCompletedBase.map(j => j.id).join(",")]
  );

  useEffect(() => {
    if (visibleJobIds.length === 0) { setInvoiceSummaryMap(new Map()); return; }
    const controller = new AbortController();
    fetch(`${BASE}/api/invoices/summaries?jobIds=${visibleJobIds.join(",")}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() as Promise<Record<string, InvoiceWithSquare | null>> : Promise.reject())
      .then(summaryObj => {
        if (controller.signal.aborted) return;
        const entries = Object.entries(summaryObj).map(
          ([id, inv]) => [parseInt(id, 10), inv] as [number, InvoiceWithSquare | null]
        );
        setInvoiceSummaryMap(new Map(entries));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setInvoiceSummaryMap(new Map(visibleJobIds.map(id => [id, null])));
        }
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleJobIds.join(",")]);

  // Fetch profit summary for all visible jobs in a single batch request
  const [profitMap, setProfitMap] = useState<Map<number, JobProfit | null>>(new Map());
  useEffect(() => {
    if (visibleJobIds.length === 0) { setProfitMap(new Map()); return; }
    const controller = new AbortController();
    fetch(`${BASE}/api/jobs/profit-summary?jobIds=${visibleJobIds.join(",")}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() as Promise<Record<string, JobProfit>> : Promise.reject())
      .then(obj => {
        if (controller.signal.aborted) return;
        const entries = Object.entries(obj).map(
          ([id, p]) => [parseInt(id, 10), p] as [number, JobProfit]
        );
        setProfitMap(new Map(entries));
      })
      .catch(() => { if (!controller.signal.aborted) setProfitMap(new Map()); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleJobIds.join(",")]);

  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: ?openJob=<id> → open that job's edit form
  useEffect(() => {
    const openId = searchParams.get("openJob");
    if (!openId || jobs.length === 0) return;
    const id = parseInt(openId, 10);
    if (!isNaN(id)) {
      const target = jobs.find(j => j.id === id) ?? null;
      if (target) {
        openEditJob(target);
        setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete("openJob"); return n; }, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, jobs]);

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

  async function handleToggleSubPaid(job: Job, paid: boolean) {
    const res = await fetch(`${BASE}/api/jobs/${job.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subPaid: paid }),
    });
    if (!res.ok) {
      console.error("Failed to update sub paid status", await res.text());
      return;
    }
    queryClient.invalidateQueries();
  }

  async function handleGetPaymentLink(invoiceId: number, invoiceNumber: string, currentTotal: number = 0, jobId: number = 0) {
    setGeneratingLinkId(invoiceId);
    try {
      // If the invoice total is $0, auto-sync estimate lines before creating the link.
      // This handles the case where placeholder $0 lines were created before the estimate
      // was built, or where existing lines have $0 prices matching estimate descriptions.
      if (currentTotal <= 0 && jobId > 0) {
        const [invRes, jobDraft] = await Promise.all([
          fetch(`${BASE}/api/invoices/${invoiceId}`),
          getJobInvoiceDraft(jobId).catch(() => null),
        ]);

        if (invRes.ok && jobDraft?.lineItems?.length) {
          const inv: Invoice = await invRes.json();
          const currentLines: Array<{ id: number; description: string; quantity: number; unitPrice: number; total: number }> =
            Array.isArray(inv.lineItems) ? inv.lineItems : [];
          const estimateLines = jobDraft.lineItems.filter(li => li.description !== "Materials");

          // Update existing $0 lines that match an estimate line, and add any missing ones
          let nextId = currentLines.length > 0 ? Math.max(...currentLines.map(l => l.id)) + 1 : 1;
          const mergedLines = currentLines.map(li => {
            if (li.unitPrice !== 0) return li;
            const estMatch = estimateLines.find(e => e.description === li.description);
            if (!estMatch) return li;
            return { ...li, quantity: estMatch.quantity, unitPrice: estMatch.unitPrice, total: parseFloat((estMatch.quantity * estMatch.unitPrice).toFixed(2)) };
          });
          const existingDescriptions = new Set(mergedLines.map(l => l.description));
          const missingLines = estimateLines
            .filter(li => !existingDescriptions.has(li.description))
            .map(li => ({ id: nextId++, description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, total: parseFloat((li.quantity * li.unitPrice).toFixed(2)) }));
          const updatedLines = [...mergedLines.filter(l => l.description === "Materials" || l.unitPrice !== 0), ...missingLines.length ? missingLines : []];
          // Only PUT if something actually changed
          const newSubtotal = updatedLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
          if (newSubtotal > 0) {
            const putRes = await fetch(`${BASE}/api/invoices/${invoiceId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...inv, lineItems: updatedLines }),
            });
            if (!putRes.ok) {
              throw new Error("Failed to sync estimate pricing into invoice");
            }
            // The server recomputes total — proceed now
          } else {
            toast({ title: "No pricing found", description: "Your estimate has no line item pricing yet. Add prices to the estimate first, then try again.", variant: "destructive" });
            return;
          }
        }
      }

      const result = await createPaymentLinkMutation.mutateAsync(invoiceId);
      setPaymentLinkResult({ url: result.paymentLinkUrl, invoiceNumber, invoiceId });
      queryClient.invalidateQueries();
      if (result.emailWarning) {
        toast({ title: "Payment link created", description: result.emailWarning, variant: "destructive" });
      } else {
        toast({ title: "Payment link created & emailed", description: `Email sent to client for invoice ${invoiceNumber}.` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create payment link";
      toast({ title: "Error creating payment link", description: msg, variant: "destructive" });
    } finally {
      setGeneratingLinkId(null);
    }
  }

  async function handleSendReminder(invoiceId: number, invoiceNumber: string) {
    setSendingReminderId(invoiceId);
    try {
      const res = await fetch(`${BASE}/api/invoices/${invoiceId}/send-reminder`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send reminder");
      toast({ title: "Reminder sent!", description: `Reminder email sent for invoice ${invoiceNumber}.` });
      queryClient.invalidateQueries();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send reminder";
      toast({ title: "Reminder failed", description: msg, variant: "destructive" });
    } finally {
      setSendingReminderId(null);
    }
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
        // Merge estimate lines from the job draft into the existing draft invoice.
        // "Materials" is already managed by auto-sync; we handle all other lines here.
        const currentLineItems: Array<{ id: number; description: string; quantity: number; unitPrice: number; total: number }> =
          Array.isArray(existingDraft.lineItems) ? existingDraft.lineItems : [];

        // All lines from the job draft except "Materials" are estimate-sourced
        const estimateLines = (jobDraft?.lineItems ?? []).filter(li => li.description !== "Materials");

        // Which estimate lines are not yet represented in the existing invoice?
        const missingLines = estimateLines.filter(
          li => !currentLineItems.some(cur => cur.description === li.description)
        );

        if (missingLines.length > 0) {
          // Remove $0 placeholder lines (inserted by auto-sync before estimates were linked)
          // but keep anything manually edited (non-zero price) and the Materials line.
          const keepLines = currentLineItems.filter(
            li => li.description === "Materials" || li.unitPrice !== 0
          );
          let nextId = keepLines.length > 0
            ? Math.max(...keepLines.map(li => li.id)) + 1
            : 1;
          const insertLines = missingLines.map(li => ({
            id: nextId++,
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            total: parseFloat((li.quantity * li.unitPrice).toFixed(2)),
          }));
          // Estimate lines first, then any kept manual/materials lines
          const updatedLineItems = [...insertLines, ...keepLines];
          const putRes = await fetch(`${BASE}/api/invoices/${existingDraft.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...existingDraft, lineItems: updatedLineItems }),
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

  async function handleLoadAllEstimatesIntoInvoice(job: Job, _estimates: Estimate[]) {
    // Use the invoice-draft endpoint so estimate line items + materials are included
    try {
      const res = await fetch(`${BASE}/api/jobs/${job.id}/invoice-draft`);
      if (res.ok) {
        const draft: InvoiceDraft = await res.json();
        setInvoiceDraftData(draft);
        setSelectedExistingInvoice(null);
        setInvoiceEditorOpen(true);
      }
    } catch {
      // ignore fetch errors — dialog won't open
    }
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

      {/* Business-line filter tabs — only in All Businesses mode */}
      {!isLoading && jobs.length > 0 && activeBusiness === null && (
        <div className="flex gap-2 flex-wrap">
          {[{ value: "", label: "All Jobs" }, ...businesses.map(b => ({ value: b.slug, label: b.name }))].map((opt, idx) => {
            const count = opt.value === ""
              ? jobs.length
              : jobs.filter(j => j.businessLine === opt.value).length;
            return (
              <button
                key={opt.value}
                onClick={() => setLocalBLFilter(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                  localBLFilter === opt.value
                    ? idx === 0
                      ? "bg-foreground border-foreground text-background shadow-sm"
                      : "bg-primary border-primary text-primary-foreground shadow-sm"
                    : "bg-background border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {opt.label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  localBLFilter === opt.value ? "bg-white/20" : "bg-muted"
                }`}>{count}</span>
              </button>
            );
          })}
          {/* Needs Payout filter — only visible when there are jobs with sub expenses */}
          {jobsWithSubExpenses.size > 0 && (() => {
            const payoutCount = jobs.filter(j => jobsWithSubExpenses.has(j.id) && !j.subPaid).length;
            return (
              <button
                onClick={() => setNeedsPayoutFilter(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                  needsPayoutFilter
                    ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                    : "bg-background border-border text-muted-foreground hover:border-orange-400/60"
                }`}
              >
                <HardHat className="w-3.5 h-3.5" />
                Needs Payout
                {payoutCount > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${needsPayoutFilter ? "bg-white/20" : "bg-orange-100 text-orange-700"}`}>
                    {payoutCount}
                  </span>
                )}
              </button>
            );
          })()}
        </div>
      )}

      {/* Asphalt sealing sq ft summary bar */}
      {!isLoading && jobBLFilter === "asphalt_sealing" && (() => {
        const withSqFt = jobs.filter(j =>
          j.businessLine === "asphalt_sealing" && jobMatchesSearch(j) && j.sqFt != null && j.sqFt > 0
        );
        if (withSqFt.length === 0) return null;
        const totalSqFt = withSqFt.reduce((sum, j) => sum + (j.sqFt ?? 0), 0);
        return (
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm">
            <Layers className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-semibold text-amber-900">{totalSqFt.toLocaleString()} sq ft total</span>
            <span className="text-amber-700 text-xs">across {withSqFt.length} job{withSqFt.length !== 1 ? "s" : ""} with sq ft set</span>
          </div>
        );
      })()}

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
                      estimateTotal={estimateTotalByJob[job.id]}
                      onLoadEstimateIntoInvoice={handleLoadAllEstimatesIntoInvoice}
                      invoiceSummary={invoiceSummaryMap.get(job.id) ?? null}
                      onCreateInvoice={() => handleReviewInvoice(job)}
                      onClientClick={job.clientId ? (id) => setProfileClientId(id) : undefined}
                      hasSubExpenses={jobsWithSubExpenses.has(job.id)}
                      onToggleSubPaid={handleToggleSubPaid}
                      profitData={profitMap.get(job.id) ?? null}
                      onSendPaymentLink={handleGetPaymentLink}
                      onGoToInvoices={() => navigate("/invoices")}
                      generatingLinkId={generatingLinkId}
                      onSmartEstimate={j => setGcWizardJob(j)} />
                  );
                })}
              </div>
            </div>
          )}

          {completedUnpaidBase.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setCompletedExpanded(v => !v)}
                className="flex items-center gap-2 w-full text-left group mb-3"
              >
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <h2 className="font-semibold text-foreground">Completed</h2>
                <span className="text-sm text-muted-foreground">({completedUnpaidBase.length})</span>
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
                        estimateTotal={estimateTotalByJob[job.id]}
                        onLoadEstimateIntoInvoice={handleLoadAllEstimatesIntoInvoice}
                        invoiceSummary={invoiceSummaryMap.get(job.id) ?? null}
                        onCreateInvoice={() => handleReviewInvoice(job)}
                        onClientClick={job.clientId ? (id) => setProfileClientId(id) : undefined}
                        hasSubExpenses={jobsWithSubExpenses.has(job.id)}
                        onToggleSubPaid={handleToggleSubPaid}
                        profitData={profitMap.get(job.id) ?? null}
                        onSendPaymentLink={handleGetPaymentLink}
                        onGoToInvoices={() => navigate("/invoices")}
                        generatingLinkId={generatingLinkId}
                        onSmartEstimate={j => setGcWizardJob(j)} />
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

          {paidBase.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setPaidExpanded(v => !v)}
                className="flex items-center gap-2 w-full text-left group mb-3"
              >
                <DollarSign className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <h2 className="font-semibold text-foreground">Paid</h2>
                <span className="text-sm text-muted-foreground">({paidBase.length})</span>
                <span className="ml-auto text-muted-foreground group-hover:text-foreground transition-colors">
                  {paidExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>
              {paidExpanded && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {paidJobs.length > 0 ? paidJobs.map(job => {
                    const jobLogs = logsByJob[job.id] ?? [];
                    const lastLog = jobLogs.sort((a, b) => b.date.localeCompare(a.date))[0];
                    return (
                      <JobCard key={job.id} job={job} onEdit={openEditJob}
                        onDelete={openDeleteTarget} onReviewInvoice={handleReviewInvoice}
                        onMarkCompleted={handleMarkCompleted}
                        logCount={jobLogs.length} lastLogDate={lastLog?.date}
                        materialListCount={materialListCountByJob[job.id] ?? 0}
                        estimateTotal={estimateTotalByJob[job.id]}
                        onLoadEstimateIntoInvoice={handleLoadAllEstimatesIntoInvoice}
                        invoiceSummary={invoiceSummaryMap.get(job.id) ?? null}
                        onCreateInvoice={() => handleReviewInvoice(job)}
                        onClientClick={job.clientId ? (id) => setProfileClientId(id) : undefined}
                        hasSubExpenses={jobsWithSubExpenses.has(job.id)}
                        onToggleSubPaid={handleToggleSubPaid}
                        profitData={profitMap.get(job.id) ?? null}
                        onSendPaymentLink={handleGetPaymentLink}
                        onGoToInvoices={() => navigate("/invoices")}
                        generatingLinkId={generatingLinkId}
                        onSmartEstimate={j => setGcWizardJob(j)} />
                    );
                  }) : (
                    <p className="col-span-3 py-4 text-sm text-muted-foreground text-center">
                      No paid jobs match "{jobSearch}".
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {scheduledJobs.length === 0 && !searchLower && allCompletedBase.length === 0 && (
            <div className="py-10 text-center text-muted-foreground">
              <p>No jobs found.</p>
            </div>
          )}
          {scheduledJobs.length === 0 && searchLower && completedJobs.length === 0 && paidJobs.length === 0 && (
            <div className="py-10 text-center text-muted-foreground">
              <p>No jobs match "{jobSearch}".</p>
            </div>
          )}
        </>
      )}

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

      {/* Payment Link Modal */}
      {paymentLinkResult && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-emerald-400" />
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Payment Link Ready</h3>
                  <p className="text-sm text-gray-500">Invoice {paymentLinkResult.invoiceNumber}</p>
                </div>
                <button onClick={() => setPaymentLinkResult(null)}
                  className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                <p className="text-xs text-gray-500 mb-1 font-medium">Square Payment Link</p>
                <p className="text-sm text-gray-800 break-all font-mono">{paymentLinkResult.url}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(paymentLinkResult.url)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors">
                  <Copy className="w-4 h-4" /> Copy Link
                </button>
                <a href={paymentLinkResult.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors">
                  <ExternalLink className="w-4 h-4" /> Open
                </a>
              </div>
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <button
                  onClick={() => handleSendReminder(paymentLinkResult.invoiceId, paymentLinkResult.invoiceNumber)}
                  disabled={sendingReminderId === paymentLinkResult.invoiceId}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl font-semibold text-sm hover:bg-blue-100 transition-colors disabled:opacity-50">
                  <Bell className="w-4 h-4" />
                  {sendingReminderId === paymentLinkResult.invoiceId ? "Sending…" : "Send Reminder Now"}
                </button>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <button
                  onClick={() => { setPaymentLinkResult(null); navigate("/invoices"); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-100 transition-colors">
                  <ArrowRight className="w-4 h-4" /> Go to Invoices
                </button>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Share this link with your client. Square will process the payment and send them a receipt.
              </p>
            </div>
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
              const invCount = relatedCounts.invoices ?? 0;
              const deleteParts = parts.length > 0
                ? `This will also permanently delete ${parts.join(", ")} linked to this job.`
                : "";
              const unlinkPart = invCount > 0
                ? `${invCount} linked invoice${invCount !== 1 ? "s" : ""} will be kept but unlinked from this job.`
                : "";
              return [deleteParts, unlinkPart].filter(Boolean).join(" ") || "No additional records are linked to this job.";
            })()
          ) : undefined}
        />
      )}

      {profileClientId !== null && (
        <ClientProfileDrawer
          clientId={profileClientId}
          onClose={() => setProfileClientId(null)}
          onAddToRoute={(id) => {
            setProfileClientId(null);
            navigate(`${BASE}/route-planner?clientId=${id}`);
          }}
        />
      )}

      {gcWizardJob && (
        <GCEstimateWizard
          job={gcWizardJob}
          onClose={() => setGcWizardJob(null)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
            setGcWizardJob(null);
          }}
        />
      )}
    </div>
  );
}
