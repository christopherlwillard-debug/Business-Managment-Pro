import { useState, useRef, ReactNode, useEffect, useMemo, Fragment } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useLocation, Link } from "wouter";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  useListJobs, useCreateJob, useUpdateJob, useDeleteJob,
  useListClients, useListSubcontractors, getJobInvoiceDraft,
  useListDailyLogs, useCreateDailyLog, useDeleteDailyLog,
  useGetSettings,
  useListMaterials, useListMaterialLists, useCreateMaterialList,
  useUpdateMaterialList, useDeleteMaterialList,
  useListEstimates, useCreateEstimate, useUpdateEstimate, useDeleteEstimate,
  useCreateInvoicePaymentLink,
  Job, Invoice, Client, Subcontractor, InvoiceDraft, CreateJobRequest, DailyLog,
  MaterialList, MaterialListItemInput,
  Estimate, CreateEstimateRequest, getListEstimatesQueryKey,
} from "@workspace/api-client-react";
import {
  useListMfhManufacturers, useMfhPanelData, useListMfhConstructionTypes,
  useCreateMfhManufacturer, useUpdateMfhManufacturer, useCreateMfhModel,
  useListProductionServiceTypes, useCreateProductionServiceType,
  useUpdateProductionServiceType, useDeleteProductionServiceType,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { EstimateModal } from "./Estimates";
import { formatCurrency, formatDate, localDateString } from "@/lib/utils";
import { autoAttachMaterialsPdf } from "@/lib/autoAttachMaterialsPdf";
import { ClientProfileDrawer } from "@/components/ClientProfileDrawer";
import { Card } from "@/components/ui/card";
import { InvoicePanel } from "@/components/InvoicePanel";
import {
  Briefcase, MapPin, Calendar, HardHat, Users,
  Plus, Check, X, Trash2, ChevronDown, ChevronUp, FileText,
  Edit2, CheckCircle, Clock, ClipboardList, Upload,
  AlertCircle, ArrowLeft, Eye, Package, ListChecks, Search,
  Calculator, DollarSign, Receipt, Layers, TrendingUp,
  CreditCard, Copy, ExternalLink, Bell, ArrowRight, Wand2,
  Timer, BarChart2, PieChart, Pencil, Archive, RotateCcw, ImageIcon, Download, CheckSquare, Home, Wrench, Navigation,
} from "lucide-react";
import { GCEstimateWizard } from "@/components/GCEstimateWizard";
import { JobChecklistPanel } from "@/components/JobChecklistPanel";
import { MfhPanel } from "@/components/MfhPanel";
import { ApplyProductionPricingDialog } from "@/components/ApplyProductionPricingDialog";
import { KbTrainingModal } from "@/components/KbTrainingModal";
import { LaborSummaryPanel } from "@/components/LaborSummaryPanel";
import { ServiceBillingPanel } from "@/components/ServiceBillingPanel";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const JOB_WORKFLOWS = {
  mh_production:       { label: "Production",  emoji: "🏠", color: "bg-amber-100 text-amber-800" },
  mh_service:          { label: "Service",      emoji: "🔧", color: "bg-blue-100 text-blue-800" },
  general_contracting: { label: "GC",           emoji: "🏡", color: "bg-green-100 text-green-800" },
} as const;
type WorkflowKey = keyof typeof JOB_WORKFLOWS;

function getJobWorkflow(job: Job): WorkflowKey | null {
  const w = (job as unknown as Record<string, unknown>).workflow as string | null;
  if (w && w in JOB_WORKFLOWS) return w as WorkflowKey;
  if (job.businessLine === "general_contracting") return "general_contracting";
  if ((job as unknown as Record<string, unknown>).mfhManufacturerId != null) return "mh_production";
  return null;
}

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
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const selectedSubs = subcontractors.filter(s => selected.includes(s.id));

  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter(i => i !== id) : [...selected, id]);
  }

  function handleOpen() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(o => !o);
  }

  return (
    <div className="relative">
      <button ref={btnRef} type="button"
        className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground flex flex-wrap gap-1.5 items-center focus:outline-none focus:ring-2 focus:ring-primary/20"
        onClick={handleOpen}>
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
      {open && dropRect && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[201] bg-background border border-border rounded-xl shadow-xl max-h-48 overflow-y-auto"
            style={{ top: dropRect.top, left: dropRect.left, width: dropRect.width }}
          >
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
        </>,
        document.body
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
  const updateList = useUpdateMaterialList();
  const deleteList = useDeleteMaterialList();
  const { canEdit } = useUserPermissions();

  const [showForm, setShowForm] = useState(false);
  const [editingList, setEditingList] = useState<MaterialList | null>(null);
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
    setEditingList(null);
  }

  function handleStartEdit(list: MaterialList) {
    setEditingList(list);
    setNewMarkup(list.markup);
    setNewItems(list.items.map(it => ({
      materialId: it.materialId ?? undefined,
      nameSnapshot: it.nameSnapshot,
      unitSnapshot: it.unitSnapshot ?? "ea",
      unitCostSnapshot: it.unitCostSnapshot,
      qty: it.qty,
    })));
    setSearch("");
    setFormError("");
    setShowForm(true);
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

  async function handleUpdate() {
    if (!editingList) return;
    if (newItems.length === 0) { setFormError("Add at least one material."); return; }
    setFormError("");
    setSaving(true);
    try {
      await updateList.mutateAsync({
        id: editingList.id,
        name: editingList.name,
        jobId: job.id,
        markup: newMarkup,
        items: newItems,
      });
      qc.invalidateQueries({ queryKey: ["/api/material-lists"] });
      resetForm();
      setShowForm(false);
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
                  {editingList
                    ? <><Pencil className="w-3.5 h-3.5 text-amber-500" /> Edit Material List</>
                    : <><Plus className="w-3.5 h-3.5 text-amber-500" /> New Material List</>
                  }
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
                onClick={editingList ? handleUpdate : handleCreate}
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors shadow-sm disabled:opacity-60"
              >
                {saving ? "Saving…" : editingList ? "Update List" : "Save List"}
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
                            onClick={() => handleStartEdit(list)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            title="Edit list"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
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
type JobProfit = { grossInvoiced: number; collected: number; jobExpenses: number; auditTrailTotal?: number; tripTravelTotal?: number; tripMealsDeductible?: number; subLaborCost?: number; allocPaid?: number; totalSubHours?: number; manHours?: number | null; netProfit: number };


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
  const subLaborCost = data?.subLaborCost ?? 0;
  const allocPaid = data?.allocPaid ?? 0;
  const totalSubHours = data?.totalSubHours ?? 0;

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

              {(data.auditTrailTotal ?? 0) > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-blue-700 font-bold uppercase tracking-wide">Travel & Audit Docs</p>
                      <p className="text-xl font-bold text-blue-600 mt-0.5">{formatCurrency(data.auditTrailTotal ?? 0)}</p>
                      <p className="text-xs text-blue-600/70 mt-0.5">Linked for tax records — not deducted from profit</p>
                    </div>
                    <FileText className="w-7 h-7 text-blue-200" />
                  </div>
                  {(data.tripTravelTotal ?? 0) > 0 && (
                    <div className="mt-3 pt-3 border-t border-blue-200/60 space-y-1.5">
                      <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">Trip/Travel (audit)</p>
                      <div className="flex items-center justify-between text-xs text-blue-700">
                        <span>Total trip spend</span>
                        <span className="font-medium tabular-nums">{formatCurrency(data.tripTravelTotal ?? 0)}</span>
                      </div>
                      {(data.tripMealsDeductible ?? 0) > 0 && (
                        <div className="flex items-center justify-between text-xs text-blue-600/80">
                          <span>Deductible meals (50%)</span>
                          <span className="tabular-nums">{formatCurrency(data.tripMealsDeductible ?? 0)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {subLaborCost > 0 && (
                <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Sub Labor Cost</p>
                      <p className="text-xl font-bold text-orange-500 mt-0.5">{formatCurrency(subLaborCost)}</p>
                    </div>
                    <Timer className="w-7 h-7 text-orange-200" />
                  </div>
                  {totalSubHours > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{totalSubHours.toFixed(1)} tracked sub hours</p>
                  )}
                </div>
              )}

              {allocPaid > 0 && (
                <div className="rounded-xl border border-border/50 bg-muted/20 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Split Payouts</p>
                    <p className="text-xl font-bold text-violet-500 mt-0.5">{formatCurrency(allocPaid)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Paid to %-split subs</p>
                  </div>
                  <Users className="w-7 h-7 text-violet-200" />
                </div>
              )}

              <div className={`rounded-xl border p-4 flex items-center justify-between ${
                isProfit ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
              }`}>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wide ${isProfit ? "text-emerald-700" : "text-red-700"}`}>Net Profit</p>
                  <p className={`text-2xl font-bold mt-0.5 ${isProfit ? "text-emerald-700" : "text-red-600"}`}>
                    {isProfit ? "+" : ""}{formatCurrency(net)}
                  </p>
                  {(subLaborCost > 0 || allocPaid > 0) && (
                    <p className={`text-[10px] mt-0.5 ${isProfit ? "text-emerald-600" : "text-red-500"}`}>
                      After expenses + sub labor{allocPaid > 0 ? " + split payouts" : ""}
                    </p>
                  )}
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

// ─── Unified Job Financials Panel ─────────────────────────────────────────────
function JobFinancialsPanel({ job, profitData: initialProfit, initialTab = "pl", onClose, onSubsPaidChanged }: {
  job: Job;
  profitData?: JobProfit | null;
  initialTab?: "pl" | "breakdown" | "hours";
  onClose: () => void;
  onSubsPaidChanged?: (allPaid: boolean) => void;
}) {
  const [tab, setTab] = useState<"pl" | "breakdown" | "hours">(initialTab);
  const [profit, setProfit] = useState<JobProfit | null>(initialProfit ?? null);
  const [payments, setPayments] = useState<SubPaymentRow[]>([]);
  const [loading, setLoading] = useState(!initialProfit);
  const [deletingPayId, setDeletingPayId] = useState<number | null>(null);
  const [subHours, setSubHours] = useState<SubHourEntry[]>([]);
  const [deletingHourId, setDeletingHourId] = useState<number | null>(null);

  const [ownerSplitPct, setOwnerSplitPct] = useState(50);
  const [taxReservePct, setTaxReservePct] = useState(25);
  const [useCollected, setUseCollected] = useState(false);

  const { toast } = useToast();
  const { data: settingsData } = useGetSettings();
  const splitSettingsLoaded = useRef(false);
  const splitSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function owedFor(p: SubPaymentRow, splitPool?: number): number {
    if (p.amountOwed != null) return p.amountOwed;
    if (p.compensationType === 'allocation') return splitPool != null ? splitPool * ((p.allocationPct ?? 0) / 100) : 0;
    if (p.compensationType === 'fixed') return p.fixedAmount ?? p.computedOwed;
    return p.computedOwed;
  }

  function notifySubsPaid(rows: SubPaymentRow[]) {
    if (!onSubsPaidChanged || rows.length === 0) return;
    const allPaid = rows.every(p => {
      if (p.paymentStatus === 'paid') return true;
      const paid = p.amountPaid ?? 0;
      if (p.compensationType === 'allocation') return paid > 0;
      const owed = owedFor(p);
      return owed <= 0 || paid >= owed;
    });
    onSubsPaidChanged(allPaid);
  }

  async function refreshPayments() {
    const rows: SubPaymentRow[] = await fetch(`${BASE}/api/jobs/${job.id}/sub-payments`, { credentials: "include" })
      .then(r => r.ok ? r.json() : []).catch(() => []);
    setPayments(rows);
    notifySubsPaid(rows);
  }

  async function handleDeletePayment(subId: number, payId: number, amount: number) {
    if (!window.confirm(`Delete this $${amount.toFixed(2)} payment? This cannot be undone.`)) return;
    setDeletingPayId(payId);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/sub-payments/${payId}`, {
        method: "DELETE", credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      await refreshPayments();
      toast({ title: "Payment deleted", description: "Balance has been recalculated." });
    } catch {
      toast({ title: "Failed to delete payment", variant: "destructive" });
    } finally {
      setDeletingPayId(null);
    }
  }

  function saveOwnerSplit(pct: number) {
    setOwnerSplitPct(pct);
    if (splitSaveTimer.current) clearTimeout(splitSaveTimer.current);
    splitSaveTimer.current = setTimeout(() => {
      fetch(`${BASE}/api/settings`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ ownerSplitPct: pct }),
      }).catch(() => {});
    }, 500);
  }

  function saveTaxReserve(pct: number) {
    setTaxReservePct(pct);
    if (splitSaveTimer.current) clearTimeout(splitSaveTimer.current);
    splitSaveTimer.current = setTimeout(() => {
      fetch(`${BASE}/api/settings`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ taxReservePct: pct }),
      }).catch(() => {});
    }, 500);
  }

  async function handleDeleteHour(id: number) {
    setDeletingHourId(id);
    try {
      const r = await fetch(`${BASE}/api/jobs/sub-hours/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error();
      setSubHours(prev => prev.filter(h => h.id !== id));
      toast({ title: "Hours entry deleted" });
    } catch {
      toast({ title: "Failed to delete hours entry", variant: "destructive" });
    } finally {
      setDeletingHourId(null);
    }
  }

  useEffect(() => {
    if (settingsData && !splitSettingsLoaded.current) {
      splitSettingsLoaded.current = true;
      if (settingsData.ownerSplitPct != null) setOwnerSplitPct(settingsData.ownerSplitPct);
      if (settingsData.taxReservePct != null) setTaxReservePct(settingsData.taxReservePct);
    }
  }, [settingsData]);

  useEffect(() => {
    const fetches: Promise<any>[] = [
      fetch(`${BASE}/api/jobs/${job.id}/sub-payments`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/api/jobs/${job.id}/sub-hours`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    ];
    if (!initialProfit) {
      fetches.push(fetch(`${BASE}/api/jobs/${job.id}/profit`, { credentials: "include" }).then(r => r.ok ? r.json() : null));
    }
    Promise.allSettled(fetches).then(results => {
      const [pRes, hRes, profRes] = results;
      if (pRes.status === "fulfilled" && Array.isArray(pRes.value)) {
        const rows = pRes.value as SubPaymentRow[];
        setPayments(rows);
        notifySubsPaid(rows);
      }
      if (hRes.status === "fulfilled" && Array.isArray(hRes.value)) setSubHours(hRes.value as SubHourEntry[]);
      if (profRes?.status === "fulfilled" && profRes.value) setProfit(profRes.value as JobProfit);
      setLoading(false);
    });
  }, [job.id]);

  const revenue = useCollected
    ? (profit?.collected || profit?.grossInvoiced || 0)
    : (profit?.grossInvoiced || 0);
  const jobExpenses = profit?.jobExpenses ?? 0;
  const jobIncome = Math.max(0, revenue - jobExpenses);
  const memberSubs = payments.filter(p => p.role === 'member');
  const hourlyFixedSubs = payments.filter(p => p.compensationType !== 'allocation');
  const pctSubs = payments.filter(p => p.compensationType === 'allocation');
  const hourlyFixedCost = hourlyFixedSubs.reduce((s, p) => {
    if (p.compensationType === 'fixed') return s + (p.fixedAmount ?? 0);
    return s + p.computedOwed;
  }, 0);
  const hourlyWorkers = Math.max(profit?.subLaborCost ?? 0, hourlyFixedCost);
  const afterWorkers = Math.max(0, jobIncome - hourlyWorkers);
  const growthReserve = afterWorkers * 0.05;
  const toSplit = Math.max(0, afterWorkers - growthReserve);
  const totalAllocPct = pctSubs.reduce((s, p) => s + (p.allocationPct ?? 0), 0);
  const allocWarning = pctSubs.length > 0 && Math.abs(totalAllocPct - 100) > 0.5;
  const ownerPct = pctSubs.length > 0 ? Math.max(0, 100 - totalAllocPct) : ownerSplitPct;
  const ownerShare = toSplit * (ownerPct / 100);
  const subShare = toSplit * ((100 - ownerPct) / 100);
  const taxReserve = ownerShare * (taxReservePct / 100);
  const ownerTakeHome = ownerShare - taxReserve;
  const net = profit?.netProfit ?? 0;
  const isProfit = net > 0;
  const subLaborCost = profit?.subLaborCost ?? 0;
  const allocPaid = profit?.allocPaid ?? 0;
  const totalSubHours = profit?.totalSubHours ?? 0;

  function fmt(n: number) {
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const TAB_LABELS: Record<string, string> = { pl: "P&L", breakdown: "Pay Breakdown", hours: "Sub Hours" };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-card border-l border-border shadow-2xl flex flex-col">
        <div className="h-1 bg-gradient-to-r from-emerald-500 via-amber-500 to-orange-400 flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-amber-500" />
            <div>
              <h2 className="font-bold text-foreground text-sm">Job Financials</h2>
              <p className="text-xs text-muted-foreground truncate max-w-[180px]">{job.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Tab bar */}
        <div className="flex border-b border-border/50 flex-shrink-0 bg-muted/20">
          {(["pl", "breakdown", "hours"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${tab === t ? "text-amber-700 border-b-2 border-amber-500 bg-amber-50/60" : "text-muted-foreground hover:text-foreground"}`}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />)}</div>
          ) : tab === "pl" ? (
            /* ── P&L tab ── */
            <div className="space-y-3">
              {profit == null ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <TrendingUp className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No financial data yet</p>
                </div>
              ) : (<>
                <div className="rounded-xl border border-border/50 bg-muted/20 p-4 flex items-center justify-between">
                  <div><p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Invoiced</p><p className="text-xl font-bold text-foreground mt-0.5">{formatCurrency(profit.grossInvoiced)}</p></div>
                  <Receipt className="w-7 h-7 text-muted-foreground/30" />
                </div>
                <div className="rounded-xl border border-border/50 bg-muted/20 p-4 flex items-center justify-between">
                  <div><p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Collected</p><p className="text-xl font-bold text-emerald-600 mt-0.5">{formatCurrency(profit.collected)}</p></div>
                  <DollarSign className="w-7 h-7 text-emerald-200" />
                </div>
                <div className="rounded-xl border border-border/50 bg-muted/20 p-4 flex items-center justify-between">
                  <div><p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Job Expenses</p><p className="text-xl font-bold text-red-500 mt-0.5">{formatCurrency(profit.jobExpenses)}</p></div>
                  <Briefcase className="w-7 h-7 text-red-100" />
                </div>
                {(profit.auditTrailTotal ?? 0) > 0 && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-blue-700 font-bold uppercase tracking-wide">Travel & Audit Docs</p>
                        <p className="text-xl font-bold text-blue-600 mt-0.5">{formatCurrency(profit.auditTrailTotal ?? 0)}</p>
                        <p className="text-xs text-blue-600/70 mt-0.5">Linked for tax records — not deducted from profit</p>
                      </div>
                      <FileText className="w-7 h-7 text-blue-200" />
                    </div>
                    {(profit.tripTravelTotal ?? 0) > 0 && (
                      <div className="mt-3 pt-3 border-t border-blue-200/60 space-y-1.5">
                        <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">Trip/Travel (audit)</p>
                        <div className="flex items-center justify-between text-xs text-blue-700">
                          <span>Total trip spend</span>
                          <span className="font-medium tabular-nums">{formatCurrency(profit.tripTravelTotal ?? 0)}</span>
                        </div>
                        {(profit.tripMealsDeductible ?? 0) > 0 && (
                          <div className="flex items-center justify-between text-xs text-blue-600/80">
                            <span>Deductible meals (50%)</span>
                            <span className="tabular-nums">{formatCurrency(profit.tripMealsDeductible ?? 0)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {subLaborCost > 0 && (
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                    <div className="flex items-center justify-between">
                      <div><p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Sub Labor Cost</p><p className="text-xl font-bold text-orange-500 mt-0.5">{formatCurrency(subLaborCost)}</p></div>
                      <Timer className="w-7 h-7 text-orange-200" />
                    </div>
                    {totalSubHours > 0 && <p className="text-xs text-muted-foreground mt-1">{totalSubHours.toFixed(1)} tracked sub hours</p>}
                  </div>
                )}
                {allocPaid > 0 && (
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Split Payouts</p>
                      <p className="text-xl font-bold text-violet-500 mt-0.5">{formatCurrency(allocPaid)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Paid to %-split subs</p>
                    </div>
                    <Users className="w-7 h-7 text-violet-200" />
                  </div>
                )}
                <div className={`rounded-xl border p-4 flex items-center justify-between ${isProfit ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-wide ${isProfit ? "text-emerald-700" : "text-red-700"}`}>Net Profit</p>
                    <p className={`text-2xl font-bold mt-0.5 ${isProfit ? "text-emerald-700" : "text-red-600"}`}>{isProfit ? "+" : ""}{formatCurrency(net)}</p>
                    {(subLaborCost > 0 || allocPaid > 0) && <p className={`text-[10px] mt-0.5 ${isProfit ? "text-emerald-600" : "text-red-500"}`}>After expenses + sub labor{allocPaid > 0 ? " + split payouts" : ""}</p>}
                  </div>
                  <TrendingUp className={`w-8 h-8 ${isProfit ? "text-emerald-300" : "text-red-300"}`} />
                </div>
                {profit.grossInvoiced > 0 && profit.collected < profit.grossInvoiced && (
                  <p className="text-xs text-muted-foreground text-center pt-1">{formatCurrency(profit.grossInvoiced - profit.collected)} outstanding (not yet collected)</p>
                )}
              </>)}
              <Link href={`/trip-packet/${job.id}`}
                className="flex items-center justify-center gap-2 w-full rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100/60 transition-colors">
                <FileText className="w-4 h-4" /> Trip Documentation Packet
              </Link>
            </div>
          ) : tab === "breakdown" ? (
            /* ── Pay Breakdown tab ── */
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-muted/30 rounded-xl px-4 py-2.5">
                <span className="text-xs font-semibold text-muted-foreground">Use Collected Revenue</span>
                <button onClick={() => setUseCollected(v => !v)} className={`relative w-10 h-5 rounded-full transition-colors ${useCollected ? "bg-amber-500" : "bg-muted-foreground/30"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${useCollected ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/30 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-amber-700">Growth Reserve</p>
                  <p className="text-[10px] text-amber-600">5% of Remaining · auto-deducted before split</p>
                </div>
                <span className="text-sm font-bold text-amber-600">{formatCurrency(growthReserve)}</span>
              </div>
              {pctSubs.length === 0 ? (
                <div className="rounded-xl border border-border/50 bg-muted/10 px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Your Split</span>
                    <span className="text-xs font-bold text-blue-600">{ownerSplitPct}% · {formatCurrency(ownerShare)}</span>
                  </div>
                  <input type="range" min={0} max={100} value={ownerSplitPct} onChange={e => saveOwnerSplit(Number(e.target.value))} className="w-full" />
                  <div className="flex justify-between text-[10px] text-muted-foreground"><span>0%</span><span>100%</span></div>
                </div>
              ) : (
                <div className="rounded-xl border border-border/50 bg-muted/10 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Your Split</span>
                    <span className="text-xs font-bold text-blue-600">Auto · {ownerPct.toFixed(1)}% · {formatCurrency(ownerShare)}</span>
                  </div>
                  {allocWarning && <p className="text-[10px] text-amber-600 mt-1">⚠ Allocations total {totalAllocPct.toFixed(1)}% — must equal 100%</p>}
                </div>
              )}
              <div className="rounded-xl border border-border/50 bg-muted/10 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Tax Reserve</span>
                  <span className="text-xs font-bold text-red-600">{taxReservePct}% · {formatCurrency(taxReserve)}</span>
                </div>
                <input type="range" min={0} max={40} value={taxReservePct} onChange={e => saveTaxReserve(Number(e.target.value))} className="w-full" />
                <div className="flex justify-between text-[10px] text-muted-foreground"><span>0%</span><span>40%</span></div>
              </div>
              <div className="rounded-xl border border-border/50 overflow-hidden">
                <div className="bg-muted/30 px-4 py-2.5 border-b border-border/50"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Breakdown</p></div>
                <div className="divide-y divide-border/30">
                  <div className="flex items-center justify-between px-4 py-3"><span className="text-sm text-foreground">Job Revenue</span><span className="text-sm font-bold text-foreground">${fmt(revenue)}</span></div>
                  {jobExpenses > 0 && <div className="flex items-center justify-between px-4 py-3"><span className="text-sm text-foreground">Materials & Expenses</span><span className="text-sm font-bold text-red-500">−${fmt(jobExpenses)}</span></div>}
                  {jobExpenses > 0 && <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20"><span className="text-xs font-semibold text-muted-foreground">Job Income</span><span className="text-sm font-bold">${fmt(jobIncome)}</span></div>}
                  <div className="flex items-center justify-between px-4 py-3"><span className="text-sm text-foreground">Hourly Workers</span><span className="text-sm font-bold text-red-500">−${fmt(hourlyWorkers)}</span></div>
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20"><span className="text-xs font-semibold text-muted-foreground">Remaining</span><span className="text-sm font-bold">${fmt(afterWorkers)}</span></div>
                  <div className="flex items-center justify-between px-4 py-3"><span className="text-sm text-foreground">Growth Reserve (5%)</span><span className="text-sm font-bold text-amber-600">−${fmt(growthReserve)}</span></div>
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20"><span className="text-xs font-semibold text-muted-foreground">Split Pool</span><span className="text-sm font-bold">${fmt(toSplit)}</span></div>
                  {pctSubs.length > 0 ? (
                    <>
                      {allocWarning && (
                        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
                          <p className="text-[10px] text-amber-700 font-medium">⚠ Allocations total {totalAllocPct.toFixed(1)}%</p>
                        </div>
                      )}
                      {pctSubs.map(p => (
                        <div key={p.subcontractorId} className="flex items-center justify-between px-4 py-3">
                          <span className="text-sm text-foreground">{p.subName ?? "Sub"} ({(p.allocationPct ?? 0).toFixed(1)}%)</span>
                          <span className="text-sm font-bold">${fmt(toSplit * ((p.allocationPct ?? 0) / 100))}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-4 py-3 bg-blue-50/60"><span className="text-sm font-semibold text-blue-800">Your Share ({ownerPct.toFixed(1)}%)</span><span className="text-sm font-bold text-blue-700">${fmt(ownerShare)}</span></div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-foreground">Sub Share ({100 - ownerSplitPct}%)</span>
                        <div className="text-right">
                          <p className="text-sm font-bold">${fmt(subShare)}</p>
                          {payments.length > 0 && (() => {
                            const tp = payments.reduce((s, p) => s + (p.amountPaid ?? 0), 0);
                            const to = payments.reduce((s, p) => s + owedFor(p, toSplit), 0);
                            return to > 0 ? <p className="text-[10px] text-muted-foreground">Recorded: ${fmt(to)}{tp > 0 ? ` · Paid: $${fmt(tp)}` : ""}</p> : null;
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 bg-blue-50/60"><span className="text-sm font-semibold text-blue-800">Your Share ({ownerSplitPct}%)</span><span className="text-sm font-bold text-blue-700">${fmt(ownerShare)}</span></div>
                    </>
                  )}
                  {taxReservePct > 0 && <div className="flex items-center justify-between px-4 py-3"><span className="text-sm text-foreground">Tax Reserve ({taxReservePct}%)</span><span className="text-sm font-bold text-red-500">−${fmt(taxReserve)}</span></div>}
                  <div className="flex items-center justify-between px-4 py-4 bg-emerald-50">
                    <div><p className="text-sm font-black text-emerald-800">Your Take-Home</p>{taxReservePct > 0 && <p className="text-[10px] text-emerald-600">After {taxReservePct}% tax reserve</p>}</div>
                    <span className="text-xl font-black text-emerald-700">${fmt(ownerTakeHome)}</span>
                  </div>
                </div>
              </div>
              {payments.length > 0 && (
                <div className="rounded-xl border border-border/50 overflow-hidden">
                  <div className="bg-muted/30 px-4 py-2.5 border-b border-border/50">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Sub Payment Records</p>
                  </div>
                  <div className="divide-y divide-border/30">
                    {payments.map(p => {
                      const owed = owedFor(p, toSplit);
                      const paid = p.amountPaid ?? 0;
                      const appliedAdvances = (p.paymentHistory ?? []).reduce((s, h) => s + (h.advanceAmount ?? 0), 0);
                      const bal  = Math.max(0, owed - paid - appliedAdvances);
                      const settled = p.paymentStatus === "paid";
                      const isPartial = p.paymentStatus === "partial";
                      const borderCls = settled ? "bg-emerald-50/40" : isPartial ? "bg-amber-50/40" : "";
                      const history = p.paymentHistory ?? [];
                      return (
                        <div key={p.subcontractorId} className={borderCls}>
                          {/* Sub summary row */}
                          <div className="px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <HardHat className={`w-3.5 h-3.5 flex-shrink-0 ${settled ? "text-emerald-500" : isPartial ? "text-amber-500" : "text-muted-foreground/50"}`} />
                              <div>
                                <p className="text-sm font-medium text-foreground">{p.subName ?? "Sub"}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {p.compensationType === "allocation"
                                    ? `${(p.allocationPct ?? 0).toFixed(1)}% of split pool`
                                    : p.compensationType === "fixed"
                                      ? "Fixed"
                                      : p.totalHours > 0 ? `${p.totalHours.toFixed(1)} hrs` : "Hourly"}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-foreground">{formatCurrency(owed)}</p>
                              {settled && <p className="text-[10px] font-bold text-emerald-600">✓ Settled</p>}
                              {isPartial && <p className="text-[10px] text-amber-600">Due: {formatCurrency(bal)}</p>}
                              {!settled && !isPartial && bal > 0 && <p className="text-[10px] text-orange-600">Due: {formatCurrency(bal)}</p>}
                            </div>
                          </div>
                          {/* Individual payment records with delete buttons */}
                          {history.length > 0 && (
                            <div className="px-4 pb-3 space-y-1.5">
                              {history.map(h => (
                                <div key={h.id} className="flex items-center justify-between py-1.5 px-2.5 bg-white/70 rounded-lg border border-border/40">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-semibold text-foreground">{h.date ? new Date(h.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</span>
                                      {h.paymentMethod && <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-100 px-1 py-0.5 rounded">{h.paymentMethod}</span>}
                                    </div>
                                    {h.workHours != null && <p className="text-[10px] text-muted-foreground">{h.workHours} hrs @ ${h.workRate}/hr</p>}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-xs font-bold text-emerald-700">${(h.netPaid ?? h.amount).toFixed(2)}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeletePayment(p.subcontractorId, h.id, h.netPaid ?? h.amount)}
                                      disabled={deletingPayId === h.id}
                                      className="p-1 rounded text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                                      title="Delete this payment"
                                    >
                                      {deletingPayId === h.id
                                        ? <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                                        : <Trash2 className="w-3 h-3" />}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <Link href={`/jobs/${job.id}/payroll`}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition-colors shadow-sm">
                <Timer className="w-3.5 h-3.5" /> Track Hours &amp; Manage Pay →
              </Link>
              {ownerTakeHome > 0.01 && (
                <button
                  onClick={async () => {
                    try {
                      await fetch(`${BASE}/api/jobs/${job.id}/record-owner-draw`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ amount: ownerTakeHome, description: `Owner Draw — ${job.title}` }),
                      });
                      toast({ title: "Owner draw recorded", description: `${formatCurrency(ownerTakeHome)} logged as draw` });
                    } catch { toast({ title: "Failed to record draw", variant: "destructive" }); }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Record Owner Draw ({formatCurrency(ownerTakeHome)})
                </button>
              )}
              {revenue === 0 && <p className="text-center text-xs text-muted-foreground py-4">Add an invoice to this job to see the breakdown.</p>}
            </div>
          ) : (
            /* ── Sub Hours tab ── */
            <div className="space-y-4">
              {/* Individual logged hour entries with delete buttons */}
              {subHours.length > 0 ? (
                <div className="rounded-xl border border-border/50 overflow-hidden">
                  <div className="bg-muted/30 px-4 py-2 border-b border-border/50 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Logged Hours</p>
                    <p className="text-[10px] text-muted-foreground">{subHours.reduce((s, h) => s + h.hours, 0).toFixed(1)} hrs total</p>
                  </div>
                  <div className="divide-y divide-border/30">
                    {subHours.map(h => (
                      <div key={h.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-foreground truncate">{h.subName ?? "Sub"}</span>
                            {h.hourType === "travel" && <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-1 rounded shrink-0">travel</span>}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {h.date ? new Date(h.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                            {h.rateSnapshot != null ? ` · $${h.rateSnapshot.toFixed(2)}/hr` : ""}
                            {h.description ? ` · ${h.description}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <span className="text-xs font-bold text-foreground">{h.hours.toFixed(1)} hrs</span>
                            {h.rateSnapshot != null && h.rateSnapshot > 0 && (
                              <p className="text-[10px] text-muted-foreground">${(h.hours * h.rateSnapshot).toFixed(0)}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteHour(h.id)}
                            disabled={deletingHourId === h.id}
                            className="p-1 rounded text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Delete this hours entry"
                          >
                            {deletingHourId === h.id
                              ? <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                              : <Trash2 className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Timer className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No hours logged yet</p>
                </div>
              )}
              {/* Sub payment status summary */}
              {payments.length > 0 && (
                <div className="space-y-2">
                  {payments.map(p => {
                    const owed = owedFor(p, toSplit);
                    const paid = p.amountPaid ?? 0;
                    const appliedAdvances = (p.paymentHistory ?? []).reduce((s, h) => s + (h.advanceAmount ?? 0), 0);
                    const bal = Math.max(0, owed - paid - appliedAdvances);
                    const isOverpaidRow = p.paymentStatus === 'overpaid';
                    // Gate "Settled" on balance math, not just paymentStatus.
                    // paymentStatus can be stale (e.g. hourly subs always get "paid"
                    // from pay-worker regardless of hours×rate coverage).
                    const settled = (p.paymentStatus === 'paid' || isOverpaidRow) && bal <= 0.005;
                    const isPartial = !settled && (p.paymentStatus === 'partial' || bal > 0.005);
                    const overpaidAmt = isOverpaidRow ? Math.max(0, paid - owed) : 0;
                    const borderCls = isOverpaidRow ? "border-amber-200 bg-amber-50/60" : settled ? "border-emerald-200 bg-emerald-50/60" : isPartial ? "border-amber-200 bg-amber-50/60" : "border-orange-200 bg-orange-50/60";
                    const iconCls = isOverpaidRow ? "text-amber-500" : settled ? "text-emerald-600" : isPartial ? "text-amber-500" : "text-orange-500";
                    return (
                      <div key={p.subcontractorId} className={`rounded-xl border p-3 flex items-center justify-between ${borderCls}`}>
                        <div className="flex items-center gap-2">
                          <HardHat className={`w-4 h-4 ${iconCls}`} />
                          <div>
                            <p className="text-sm font-semibold">{p.subName ?? "Sub"}</p>
                            <p className="text-[10px] text-muted-foreground">{p.totalHours > 0 ? `${p.totalHours.toFixed(1)} hrs` : p.payType ?? "—"}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">{formatCurrency(owed)}</p>
                          {paid > 0 && <p className="text-[10px] text-emerald-600">Paid: {formatCurrency(paid)}</p>}
                          {settled && !isOverpaidRow && <p className="text-[10px] font-bold text-emerald-600">✓ Settled</p>}
                          {isOverpaidRow && <p className="text-[10px] font-bold text-amber-600">⚠ Payroll Correction +{formatCurrency(overpaidAmt)}</p>}
                          {isPartial && <p className="text-[10px] font-bold text-amber-600">● Partial · Due {formatCurrency(bal)}</p>}
                          {!settled && !isPartial && bal > 0 && <p className="text-[10px] text-orange-600">Due: {formatCurrency(bal)}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <Link href={`/jobs/${job.id}/payroll`} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 transition-colors shadow-sm">
                <Timer className="w-4 h-4" /> Track Hours &amp; Manage Pay →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub Payment Row Card ──────────────────────────────────────────────────────
function SubPaymentRowCard({ p, jobId, owed, calculatedOwed, onRefresh }: {
  p: SubPaymentRow;
  jobId: number;
  owed: number;           // effective owed (override ?? calculated)
  calculatedOwed: number; // raw calculated value (before any override)
  onRefresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const paid = p.amountPaid ?? 0;
  const balance = Math.max(0, owed - paid);
  const pct = owed > 0 ? Math.min(100, Math.round((paid / owed) * 100)) : 0;
  const hasOverride = p.amountOwed != null; // true when user has manually set an agreed owed

  const [payInput, setPayInput] = useState(() => balance > 0.01 ? balance.toFixed(2) : owed > 0 ? owed.toFixed(2) : "");
  const [paying, setPaying] = useState(false);
  const [editingOwed, setEditingOwed] = useState(false);
  const [owedInput, setOwedInput] = useState(() => owed > 0 ? owed.toFixed(2) : "");
  const [savingOwed, setSavingOwed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const history = p.paymentHistory ?? [];

  // Breakdown form state (hourly subs)
  const [bdWorkHours, setBdWorkHours] = useState(() => {
    const wh = p.totalWorkHours ?? 0;
    return wh > 0 ? wh.toFixed(2) : p.totalHours > 0 ? p.totalHours.toFixed(2) : "";
  });
  const [bdWorkRate, setBdWorkRate]   = useState(() => { const r = p.hourlyRate ?? p.payRate; return r != null ? String(r) : ""; });
  const [bdTravelHours, setBdTravelHours] = useState(() => {
    const th = p.totalTravelHours ?? 0;
    return th > 0 ? th.toFixed(2) : "";
  });
  const [bdTravelRate, setBdTravelRate]   = useState(() => { const r = p.travelRate ?? p.travelPayRate; return r != null ? String(r) : ""; });
  const [bdBonus,      setBdBonus]      = useState("");
  const [bdBonusNote,  setBdBonusNote]  = useState("");
  const [bdAdvance,    setBdAdvance]    = useState("");
  const [bdAdvanceNote, setBdAdvanceNote] = useState("");

  const bdWorkPay    = (parseFloat(bdWorkHours)   || 0) * (parseFloat(bdWorkRate)   || 0);
  const bdTravelPay  = (parseFloat(bdTravelHours) || 0) * (parseFloat(bdTravelRate) || 0);
  const bdBonusAmt   = parseFloat(bdBonus)   || 0;
  const bdAdvanceAmt = parseFloat(bdAdvance) || 0;
  const bdTotal      = bdWorkPay + bdTravelPay + bdBonusAmt - bdAdvanceAmt;

  function fmt(n: number) {
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function handlePay(amount: number, breakdown?: {
    workHours: number; workRate: number;
    travelHours?: number; travelRate?: number;
    bonusAmount?: number; bonusNote?: string;
    advanceAmount?: number; advanceNote?: string;
  }) {
    if (amount <= 0) return;
    setPaying(true);
    try {
      const body: Record<string, unknown> = {
        subName: p.subName,
        idempotencyKey: crypto.randomUUID(),
        agreedOwed: owed > 0 ? owed : undefined,
      };
      if (breakdown) {
        body.workHours  = breakdown.workHours;
        body.workRate   = breakdown.workRate;
        if ((breakdown.travelHours ?? 0) > 0) {
          body.travelHours = breakdown.travelHours;
          body.travelRate  = breakdown.travelRate;
        }
        if ((breakdown.bonusAmount ?? 0) > 0) {
          body.bonusAmount = breakdown.bonusAmount;
          body.bonusNote   = breakdown.bonusNote;
        }
        if ((breakdown.advanceAmount ?? 0) > 0) {
          body.advanceAmount = breakdown.advanceAmount;
          body.advanceNote   = breakdown.advanceNote;
        }
      } else {
        body.amount = amount;
      }
      const r = await fetch(`${BASE}/api/jobs/${jobId}/pay-worker/${p.subcontractorId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      await onRefresh();
      const isPartial = data.status === "partial";
      toast({
        title: isPartial ? "Partial payment recorded" : "Payment recorded",
        description: isPartial
          ? `${p.subName ?? "Sub"}: $${fmt(amount)} paid — $${fmt(owed - (data.accumulated ?? 0))} remaining`
          : `${p.subName ?? "Sub"} fully paid`,
      });
    } catch {
      toast({ title: "Failed to record payment", variant: "destructive" });
    } finally {
      setPaying(false);
    }
  }

  function handlePayBreakdown() {
    const wh = parseFloat(bdWorkHours) || 0;
    const wr = parseFloat(bdWorkRate)  || 0;
    if (wh <= 0 || wr <= 0) {
      toast({ title: "Enter work hours and rate to record payment", variant: "destructive" });
      return;
    }
    handlePay(bdTotal, {
      workHours:     wh,
      workRate:      wr,
      travelHours:   parseFloat(bdTravelHours) || undefined,
      travelRate:    parseFloat(bdTravelRate)  || undefined,
      bonusAmount:   bdBonusAmt  > 0 ? bdBonusAmt  : undefined,
      bonusNote:     bdBonusNote || undefined,
      advanceAmount: bdAdvanceAmt > 0 ? bdAdvanceAmt : undefined,
      advanceNote:   bdAdvanceNote || undefined,
    });
  }

  async function handleSaveOwed(valueOrNull: number | null) {
    if (valueOrNull !== null && (isNaN(valueOrNull) || valueOrNull < 0)) return;
    setSavingOwed(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${jobId}/sub-payments/${p.subcontractorId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ amountOwed: valueOrNull }),
      });
      if (!r.ok) throw new Error();
      await onRefresh();
      setEditingOwed(false);
      toast({ title: valueOrNull === null ? "Override cleared — using calculated amount" : "Agreed owed updated" });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    } finally {
      setSavingOwed(false);
    }
  }

  const isFullyPaid = p.paymentStatus === "paid";
  const isPartial = p.paymentStatus === "partial";

  return (
    <div className="px-4 py-3 space-y-1.5">
      {/* Name + status row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <HardHat className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-sm font-medium text-foreground">{p.subName ?? "Sub"}</span>
            {p.compensationType === "allocation"
              ? <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">%Alloc</span>
              : p.compensationType === "fixed"
                ? <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">Fixed</span>
                : <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">Hourly</span>
            }
            {isFullyPaid
              ? <span className="ml-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">✓ Paid</span>
              : isPartial
                ? <span className="ml-1 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">● Partial</span>
                : null
            }
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <p className="text-sm font-bold text-foreground">${fmt(owed)}</p>
          {hasOverride && calculatedOwed > 0 && Math.abs(calculatedOwed - owed) > 0.005 && (
            <p className="text-[10px] text-muted-foreground line-through">Calc: ${fmt(calculatedOwed)}</p>
          )}
          {isPartial && <p className="text-[10px] text-amber-600">Paid: ${fmt(paid)}</p>}
          {balance > 0.01 && !isFullyPaid && <p className="text-[10px] text-orange-600">Balance: ${fmt(balance)}</p>}
          {isFullyPaid && paid > 0 && <p className="text-[10px] text-emerald-600 font-semibold">✓ Settled</p>}
        </div>
      </div>

      {/* Comp type detail — show locked agreed amount once obligation is set, calc otherwise */}
      {p.compensationType === "allocation" && (
        <div className="pl-6 text-[10px] text-purple-600">
          {(p.allocationPct ?? 0).toFixed(1)}% of split pool
          {hasOverride
            ? <span className="ml-1 text-muted-foreground">· Agreed: ${fmt(owed)}</span>
            : calculatedOwed > 0 && <span className="ml-1 text-muted-foreground">· Calc: ${fmt(calculatedOwed)}</span>
          }
        </div>
      )}
      {p.compensationType === "fixed" && (
        <div className="pl-6 text-[10px] text-orange-600">
          Fixed: ${fmt(p.fixedAmount ?? 0)}
          {hasOverride && <span className="ml-1 text-muted-foreground">· Agreed: ${fmt(owed)}</span>}
        </div>
      )}
      {p.compensationType === "hourly" && p.totalHours > 0 && <div className="pl-6 text-[10px] text-blue-600">Hourly · {p.totalHours.toFixed(1)} hrs</div>}

      {/* Progress bar (partial only) */}
      {isPartial && owed > 0 && (
        <div className="pl-6 space-y-0.5">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>${fmt(paid)} paid</span><span>{pct}% of ${fmt(owed)}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          {p.lastPaidAt && <p className="text-[10px] text-muted-foreground">Last payment: {new Date(p.lastPaidAt).toLocaleDateString()}</p>}
        </div>
      )}

      {/* Payment History — collapsible, hidden when no records */}
      {history.length > 0 && (
        <div className="pl-6">
          <button
            onClick={() => setHistoryOpen(h => !h)}
            className="text-[10px] text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <span>{historyOpen ? "▼" : "▶"}</span>
            <span>Payment History ({history.length})</span>
          </button>
          {historyOpen && (
            <div className="mt-1 space-y-1 border-l border-border/50 pl-2 ml-0.5">
              {history.map((e, i) => (
                <div key={i} className="space-y-0.5">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{new Date(e.date + "T12:00:00").toLocaleDateString()}</span>
                    <span className="font-medium text-foreground">${fmt(e.amount)}</span>
                  </div>
                  {e.workHours != null && e.workRate != null && (
                    <div className="text-[9px] text-blue-600 space-y-0.5 pl-1">
                      <div>Work: {e.workHours}h × ${fmt(e.workRate)}/hr = ${fmt(e.workHours * e.workRate)}</div>
                      {(e.travelHours ?? 0) > 0 && e.travelRate != null && (
                        <div>Travel: {e.travelHours}h × ${fmt(e.travelRate)}/hr = ${fmt((e.travelHours ?? 0) * e.travelRate)}</div>
                      )}
                      {(e.bonusAmount ?? 0) > 0 && (
                        <div className="text-emerald-600">Bonus: +${fmt(e.bonusAmount ?? 0)}{e.bonusNote ? ` (${e.bonusNote})` : ""}</div>
                      )}
                      {(e.advanceAmount ?? 0) > 0 && (
                        <div className="text-amber-600">Advancement deducted: −${fmt(e.advanceAmount ?? 0)}{e.advanceNote ? ` (${e.advanceNote})` : ""}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Agreed Owed inline edit (only when not paid) */}
      {!isFullyPaid && (
        <div className="pl-6">
          {editingOwed ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground">Agreed Owed: $</span>
              <input type="number" step="0.01" min="0" value={owedInput} onChange={e => setOwedInput(e.target.value)}
                className="w-24 px-2 py-0.5 text-xs border border-border rounded-lg bg-background outline-none focus:ring-1 focus:ring-primary/30" />
              <button onClick={() => handleSaveOwed(parseFloat(owedInput))} disabled={savingOwed}
                className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full hover:bg-emerald-100 transition-colors disabled:opacity-50">
                {savingOwed ? "…" : "Save"}
              </button>
              {hasOverride && (
                <button onClick={() => handleSaveOwed(null)} disabled={savingOwed}
                  className="text-[10px] font-semibold text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full hover:bg-muted/80 transition-colors disabled:opacity-50">
                  Clear Override
                </button>
              )}
              <button onClick={() => { setEditingOwed(false); setOwedInput(owed > 0 ? owed.toFixed(2) : ""); }}
                className="text-[10px] text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditingOwed(true); setOwedInput(owed > 0 ? owed.toFixed(2) : ""); }}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                <Pencil className="w-2.5 h-2.5" /> {hasOverride ? "Edit Override" : "Set Agreed Owed"}
              </button>
              {hasOverride && (
                <button onClick={() => handleSaveOwed(null)} disabled={savingOwed}
                  className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors">
                  × Clear Override
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Payment section (only when not fully paid) */}
      {!isFullyPaid && owed > 0.01 && (
        <div className="pl-6 space-y-2">
          {p.compensationType === "hourly" ? (
            /* ── Breakdown form for hourly subs ── */
            <div className="space-y-2 bg-muted/20 rounded-xl p-2.5 border border-border">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Record Payment</p>

              {/* Work hours × rate */}
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">Work Hours</label>
                  <input type="number" step="0.25" min="0" placeholder="0.00"
                    value={bdWorkHours} onChange={e => setBdWorkHours(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-border rounded-lg bg-background outline-none focus:ring-1 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">Work Rate/hr $</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00"
                    value={bdWorkRate} onChange={e => setBdWorkRate(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-border rounded-lg bg-background outline-none focus:ring-1 focus:ring-primary/20" />
                </div>
              </div>
              {bdWorkPay > 0 && (
                <p className="text-[9px] text-blue-600">Work pay: ${fmt(bdWorkPay)}</p>
              )}

              {/* Travel hours × rate */}
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">Travel Hours <span className="text-muted-foreground/60">(opt)</span></label>
                  <input type="number" step="0.25" min="0" placeholder="0.00"
                    value={bdTravelHours} onChange={e => setBdTravelHours(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-border rounded-lg bg-background outline-none focus:ring-1 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">Travel Rate/hr $</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00"
                    value={bdTravelRate} onChange={e => setBdTravelRate(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-border rounded-lg bg-background outline-none focus:ring-1 focus:ring-primary/20" />
                </div>
              </div>
              {bdTravelPay > 0 && (
                <p className="text-[9px] text-sky-600">Travel pay: ${fmt(bdTravelPay)}</p>
              )}

              {/* Bonus */}
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">Bonus $ <span className="text-muted-foreground/60">(opt)</span></label>
                  <input type="number" step="0.01" min="0" placeholder="0.00"
                    value={bdBonus} onChange={e => setBdBonus(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-border rounded-lg bg-background outline-none focus:ring-1 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">Bonus Note</label>
                  <input type="text" placeholder="reason…"
                    value={bdBonusNote} onChange={e => setBdBonusNote(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-border rounded-lg bg-background outline-none focus:ring-1 focus:ring-primary/20" />
                </div>
              </div>

              {/* Advance against wages */}
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">Advance Deduct $ <span className="text-muted-foreground/60">(opt)</span></label>
                  <input type="number" step="0.01" min="0" placeholder="0.00"
                    value={bdAdvance} onChange={e => setBdAdvance(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-border rounded-lg bg-background outline-none focus:ring-1 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">Advance Note</label>
                  <input type="text" placeholder="prev advance #…"
                    value={bdAdvanceNote} onChange={e => setBdAdvanceNote(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-border rounded-lg bg-background outline-none focus:ring-1 focus:ring-primary/20" />
                </div>
              </div>

              {/* Computed total */}
              {bdTotal > 0 && (
                <div className="flex items-center justify-between pt-1 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground">Net to pay</span>
                  <span className="text-sm font-bold text-emerald-600">${fmt(bdTotal)}</span>
                </div>
              )}

              <button onClick={handlePayBreakdown} disabled={paying || bdTotal <= 0}
                className="w-full py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-40">
                {paying ? "Recording…" : bdTotal > 0 ? `Record Payment — $${fmt(bdTotal)}` : "Enter hours & rate above"}
              </button>
            </div>
          ) : (
            /* ── Simple amount input for fixed / allocation subs ── */
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">Amount: $</span>
                <input type="number" step="0.01" min="0.01" value={payInput} onChange={e => setPayInput(e.target.value)}
                  className="w-24 px-2 py-0.5 text-xs border border-border rounded-lg bg-background outline-none focus:ring-1 focus:ring-emerald-500/30" />
                <button
                  onClick={() => { const a = parseFloat(payInput); if (!isNaN(a) && a > 0) handlePay(a); }}
                  disabled={paying}
                  className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full hover:bg-emerald-100 transition-colors disabled:opacity-50">
                  {paying ? "…" : "Record Payment"}
                </button>
              </div>
              {isPartial && balance > 0.01 ? (
                <button onClick={() => handlePay(balance)} disabled={paying}
                  className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-colors disabled:opacity-50">
                  Pay Full Balance (${fmt(balance)})
                </button>
              ) : !isPartial ? (
                <button onClick={() => handlePay(owed)} disabled={paying}
                  className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-colors disabled:opacity-50">
                  Mark Paid (${fmt(owed)})
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub Hours & Payments Panel ────────────────────────────────────────────────
type SubHourEntry = { id: number; subcontractorId: number; subName: string | null; date: string; hours: number; hourType: "work" | "travel" | null; description: string | null; rateSnapshot: number | null };
type SubPayHistoryEntry = { id: number; date: string; amount: number; workHours?: number; workRate?: number; travelHours?: number; travelRate?: number; bonusAmount?: number; bonusNote?: string | null; advanceAmount?: number; advanceNote?: string | null; netPaid?: number; paymentMethod?: string | null };
type SubPaymentRow = { subcontractorId: number; subName: string | null; amountOwed: number | null; computedOwed: number; amountOwedIsManual?: boolean; amountPaid: number | null; balance: number | null; percentComplete: number | null; paidDate: string | null; paidNotes: string | null; totalHours: number; totalWorkHours: number; totalTravelHours: number; payRate: number | null; travelPayRate: number | null; payType: string | null; role: string | null; growthPct: number | null; compensationType: string; hourlyRate: number | null; travelRate: number | null; fixedAmount: number | null; allocationPct: number | null; paymentStatus: string; paidAt: string | null; lastPaidAt: string | null; paymentHistory?: SubPayHistoryEntry[] };
type BenchmarkRow = { id: number; jobType: string; estimatedHours: number | null; estimatedLaborCost: number | null; estimatedMaterialCost: number | null; notes: string | null };

function JobSubHoursPanel({ job, onClose, initialTab = "hours" }: { job: Job; onClose: () => void; initialTab?: "hours" | "payments" | "benchmark" }) {
  const { canEdit } = useUserPermissions();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"hours" | "payments" | "benchmark">(initialTab);
  const [hours, setHours] = useState<SubHourEntry[]>([]);
  const [payments, setPayments] = useState<SubPaymentRow[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkRow | null>(null);
  const [profit, setProfit] = useState<JobProfit | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editPayId, setEditPayId] = useState<number | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<number | null>(null);
  const [resetPayId, setResetPayId] = useState<number | null>(null);
  type SubExpenseRow = { id: number; subcontractorId: number | null; subName: string | null; amount: string; date: string; description: string | null };
  const [subExpenses, setSubExpenses] = useState<SubExpenseRow[]>([]);

  const today = localDateString();
  const [form, setForm] = useState({ subcontractorId: "", date: today, hours: "", description: "", rateSnapshot: "", hourType: "work" as "work" | "travel" });
  const [payForm, setPayForm] = useState<Record<number, { amountOwed: string; amountPaid: string; paidDate: string; paidNotes: string }>>({});

  const { data: subs = [] } = useListSubcontractors();
  const jobSubs = Array.isArray(job.subcontractorIds) ? (job.subcontractorIds as number[]) : [];
  const linkedSubs = (subs as Subcontractor[]).filter(s => jobSubs.includes(s.id));

  async function loadData() {
    setLoading(true);
    try {
      const [hRes, pRes, bmRes, seRes, prRes] = await Promise.allSettled([
        fetch(`${BASE}/api/jobs/${job.id}/sub-hours`).then(r => r.json()),
        fetch(`${BASE}/api/jobs/${job.id}/sub-payments`).then(r => r.json()),
        fetch(`${BASE}/api/job-type-benchmarks`).then(r => r.ok ? r.json() : Promise.resolve(null)),
        fetch(`${BASE}/api/jobs/${job.id}/sub-expenses`).then(r => r.json()),
        fetch(`${BASE}/api/jobs/${job.id}/profit`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
      ]);
      const h = hRes.status === "fulfilled" ? hRes.value : [];
      const p = pRes.status === "fulfilled" ? pRes.value : [];
      const allBenchmarks = bmRes.status === "fulfilled" ? bmRes.value : null;
      const se = seRes.status === "fulfilled" ? seRes.value : [];
      setHours(Array.isArray(h) ? h : []);
      setPayments(Array.isArray(p) ? p : []);
      setSubExpenses(Array.isArray(se) ? se : []);
      if (prRes.status === "fulfilled" && prRes.value) setProfit(prRes.value as JobProfit);
      // Find matching benchmark for this job's type (silently skipped if endpoint forbidden)
      if (Array.isArray(allBenchmarks) && job.jobType) {
        const match = allBenchmarks.find((b: BenchmarkRow) =>
          b.jobType.toLowerCase() === (job.jobType ?? "").toLowerCase()
        );
        setBenchmark(match ?? null);
      }
      const pf: typeof payForm = {};
      for (const row of (Array.isArray(p) ? p : [])) {
        pf[row.subcontractorId] = {
          amountOwed: row.amountOwed != null ? String(row.amountOwed) : "",
          amountPaid: row.amountPaid != null ? String(row.amountPaid) : "",
          paidDate: row.paidDate ?? "",
          paidNotes: row.paidNotes ?? "",
        };
      }
      setPayForm(pf);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [job.id]);

  async function handleAddHours(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subcontractorId || !form.date || !form.hours) return;
    setSubmitting(true);
    try {
      const rateVal = form.rateSnapshot !== "" ? parseFloat(form.rateSnapshot) : undefined;
      const res = await fetch(`${BASE}/api/jobs/${job.id}/sub-hours`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subcontractorId: parseInt(form.subcontractorId),
          date: form.date,
          hours: parseFloat(form.hours),
          description: form.description || undefined,
          rateSnapshot: rateVal,
          hourType: form.hourType,
        }),
      });
      if (!res.ok) throw new Error();
      const entry = await res.json();
      setHours(prev => [...prev, entry]);
      setForm(f => ({ ...f, hours: "", description: "", hourType: "work" }));
      qc.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Hours logged", description: `${form.hours} hrs added` });
    } catch {
      toast({ title: "Failed to log hours", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteHours(id: number) {
    setDeletingId(id);
    try {
      await fetch(`${BASE}/api/jobs/sub-hours/${id}`, { method: "DELETE" });
      setHours(prev => prev.filter(h => h.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSavePayment(subId: number) {
    const pf = payForm[subId];
    if (!pf) return;
    try {
      await fetch(`${BASE}/api/jobs/${job.id}/sub-payments/${subId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountOwed: pf.amountOwed ? parseFloat(pf.amountOwed) : null,
          amountPaid: pf.amountPaid ? parseFloat(pf.amountPaid) : null,
          paidDate: pf.paidDate || null,
          paidNotes: pf.paidNotes || null,
        }),
      });
      await loadData();
      setEditPayId(null);
      qc.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Payment updated" });
    } catch {
      toast({ title: "Failed to save payment", variant: "destructive" });
    }
  }

  async function handleResetPayment(subId: number) {
    setResetPayId(subId);
    try {
      await fetch(`${BASE}/api/jobs/${job.id}/sub-payments/${subId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPaid: null }),
      });
      await loadData();
      qc.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Payment record reset", description: "Status set back to unpaid" });
    } catch {
      toast({ title: "Failed to reset payment", variant: "destructive" });
    } finally {
      setResetPayId(null);
    }
  }

  async function handleQuickPay(subId: number, amount: number, subName?: string | null) {
    setMarkingPaidId(subId);
    try {
      await fetch(`${BASE}/api/jobs/${job.id}/pay-worker/${subId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, subName, idempotencyKey: crypto.randomUUID() }),
      });
      await loadData();
      qc.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Marked as paid", description: `${formatCurrency(amount)} recorded` });
    } catch {
      toast({ title: "Failed to record payment", variant: "destructive" });
    } finally {
      setMarkingPaidId(null);
    }
  }

  const totalHours = hours.reduce((s, h) => s + h.hours, 0);
  const totalSubLabor = hours.reduce((s, h) => s + (h.hours * (h.rateSnapshot ?? 0)), 0);

  const grouped: Record<number, { name: string; hours: SubHourEntry[] }> = {};
  for (const h of hours) {
    if (!grouped[h.subcontractorId]) grouped[h.subcontractorId] = { name: h.subName ?? `Sub #${h.subcontractorId}`, hours: [] };
    grouped[h.subcontractorId].hours.push(h);
  }

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
            <Timer className="w-4 h-4 text-orange-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Sub Hours & Pay</p>
              <h2 className="font-bold text-foreground text-sm truncate">{job.title}</h2>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/50 flex-shrink-0">
          {([
            ["hours", "Track Hours"],
            ["payments", "Sub Payments"],
            ["benchmark", "vs Benchmark"],
          ] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${activeTab === tab ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* HOURS TAB */}
          {activeTab === "hours" && (
            <div className="p-4 space-y-4">
              {/* Summary */}
              {totalHours > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-orange-50 border border-orange-100 p-3 text-center">
                    <p className="text-xs text-orange-600 font-medium">Total Hours</p>
                    <p className="text-lg font-bold text-orange-700">{totalHours.toFixed(1)}</p>
                  </div>
                  <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-center">
                    <p className="text-xs text-red-600 font-medium">Sub Labor Cost</p>
                    <p className="text-lg font-bold text-red-700">{formatCurrency(totalSubLabor)}</p>
                  </div>
                </div>
              )}

              {/* Add form */}
              {canEdit("jobs") && (
                <form onSubmit={handleAddHours} className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Log Hours</p>
                  {linkedSubs.length === 0 ? (
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
                      No subcontractors assigned to this job. Assign subs in the job details first.
                    </p>
                  ) : (
                  <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Subcontractor</label>
                      <select value={form.subcontractorId}
                        onChange={e => {
                          const subId = e.target.value;
                          const selectedSub = linkedSubs.find(s => String(s.id) === subId);
                          // Prefer job-level hourlyRate from payment record; fall back to sub profile payRate
                          const paymentRow = payments.find(p => String(p.subcontractorId) === subId);
                          const defaultRate = paymentRow?.hourlyRate != null
                            ? String(paymentRow.hourlyRate)
                            : selectedSub && (selectedSub as any).payRate != null
                              ? String((selectedSub as any).payRate)
                              : "";
                          setForm(f => ({ ...f, subcontractorId: subId, rateSnapshot: defaultRate }));
                        }}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" required>
                        <option value="">Select sub…</option>
                        {linkedSubs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Date</label>
                      <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Hours</label>
                      <input type="number" step="0.25" min="0.25" placeholder="e.g. 4.5" value={form.hours}
                        onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" required />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Hour Type</label>
                      <div className="flex rounded-xl border border-border overflow-hidden text-xs font-semibold h-[38px]">
                        <button type="button"
                          onClick={() => setForm(f => ({ ...f, hourType: "work" }))}
                          className={`flex-1 transition-colors ${form.hourType === "work" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"}`}>
                          Work
                        </button>
                        <button type="button"
                          onClick={() => setForm(f => ({ ...f, hourType: "travel" }))}
                          className={`flex-1 transition-colors ${form.hourType === "travel" ? "bg-sky-500 text-white" : "bg-background text-muted-foreground hover:bg-muted/50"}`}>
                          Travel
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Rate/hr
                        {form.rateSnapshot && <span className="ml-1 text-[9px] text-muted-foreground">(auto-filled)</span>}
                      </label>
                      <input type="number" step="0.01" min="0" placeholder="e.g. 35.00" value={form.rateSnapshot}
                        onChange={e => setForm(f => ({ ...f, rateSnapshot: e.target.value }))}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Notes (optional)</label>
                    <input type="text" placeholder="What they worked on…" value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  </>
                  )}
                  <button type="submit" disabled={submitting}
                    className="w-full py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {submitting ? "Saving…" : "Log Hours"}
                  </button>
                </form>
              )}

              {/* Hours list grouped by sub */}
              {loading ? (
                <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-xl bg-muted/40 animate-pulse" />)}</div>
              ) : hours.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Timer className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No hours logged yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(grouped).map(([subIdStr, grp]) => {
                    const subHrs = grp.hours.reduce((s, h) => s + h.hours, 0);
                    const subCost = grp.hours.reduce((s, h) => s + h.hours * (h.rateSnapshot ?? 0), 0);
                    return (
                      <div key={subIdStr} className="rounded-xl border border-border overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                          <p className="text-xs font-bold text-foreground">{grp.name}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{subHrs.toFixed(1)} hrs</span>
                            {subCost > 0 && <span className="text-orange-600 font-medium">{formatCurrency(subCost)}</span>}
                          </div>
                        </div>
                        <div className="divide-y divide-border/50">
                          {grp.hours.map(h => (
                            <div key={h.id} className="flex items-center gap-2 px-3 py-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-medium text-foreground">{formatDate(h.date)} — {h.hours}h</p>
                                  {h.hourType === "travel" && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-sky-100 text-sky-700 border border-sky-200">Travel</span>
                                  )}
                                </div>
                                {h.description && <p className="text-[10px] text-muted-foreground truncate">{h.description}</p>}
                                {h.rateSnapshot != null && <p className="text-[10px] text-orange-600">${h.rateSnapshot}/hr → {formatCurrency(h.hours * h.rateSnapshot)}</p>}
                              </div>
                              {canEdit("jobs") && (
                                <button onClick={() => handleDeleteHours(h.id)} disabled={deletingId === h.id}
                                  className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
                                  {deletingId === h.id ? <span className="w-3 h-3 border border-muted-foreground/50 border-t-muted-foreground rounded-full animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* PAYMENTS TAB */}
          {activeTab === "payments" && (
            <div className="p-4 space-y-3">
              {/* Independence notice */}
              <div className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2.5">
                <p className="text-[11px] text-blue-800 font-semibold">Crew Pay — independent of client payment</p>
                <p className="text-[10px] text-blue-700 mt-0.5">Mark each person paid whenever you pay them. Client invoice status doesn't affect this.</p>
              </div>

              {loading ? (
                <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />)}</div>
              ) : payments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <DollarSign className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">No crew assigned yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Add subs to this job from the job card, then track pay here</p>
                </div>
              ) : (
                payments.map(pay => {
                  const pf = payForm[pay.subcontractorId] ?? { amountOwed: "", amountPaid: "", paidDate: "", paidNotes: "" };
                  // Compute split pool for allocation workers (mirrors JobFinancialsPanel waterfall)
                  const _rev = profit?.grossInvoiced ?? 0;
                  const _exp = profit?.jobExpenses ?? 0;
                  const _jobIncome = Math.max(0, _rev - _exp);
                  const _hfCost = payments.filter(p => p.compensationType !== 'allocation').reduce((s, p) => s + (p.compensationType === 'fixed' ? (p.fixedAmount ?? 0) : p.computedOwed), 0);
                  const _afterW = Math.max(0, _jobIncome - Math.max(profit?.subLaborCost ?? 0, _hfCost));
                  const _toSplit = Math.max(0, _afterW - _afterW * 0.05);
                  const displayOwed = pay.amountOwed != null
                    ? pay.amountOwed
                    : pay.compensationType === 'allocation' ? _toSplit * ((pay.allocationPct ?? 0) / 100)
                    : pay.compensationType === 'fixed' ? (pay.fixedAmount ?? pay.computedOwed)
                    : pay.computedOwed;
                  const amountPaid = pay.amountPaid ?? 0;
                  const balance = Math.max(0, displayOwed - amountPaid);
                  const isOverpaidStatus = pay.paymentStatus === 'overpaid';
                  const isPaid = pay.paymentStatus === 'paid' || isOverpaidStatus;
                  const isPartialStatus = pay.paymentStatus === 'partial';
                  const overpaidByAmt = isOverpaidStatus ? parseFloat(Math.max(0, amountPaid - displayOwed).toFixed(2)) : 0;
                  const hasExpenses = subExpenses.some(e => e.subcontractorId === pay.subcontractorId);
                  const isEditing = editPayId === pay.subcontractorId;
                  const isMarkingThisOne = markingPaidId === pay.subcontractorId;
                  const isResettingThisOne = resetPayId === pay.subcontractorId;

                  return (
                    <div key={pay.subcontractorId} className="rounded-xl border border-border overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30">
                        <div>
                          <p className="text-xs font-bold text-foreground">{pay.subName ?? `Sub #${pay.subcontractorId}`}</p>
                          {pay.totalHours > 0 && (
                            <p className="text-[10px] text-muted-foreground">{pay.totalHours.toFixed(1)} hrs logged</p>
                          )}
                        </div>
                        {isOverpaidStatus ? (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">⚠ Payroll Correction +{formatCurrency(overpaidByAmt)}</span>
                        ) : isPaid ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Paid ✓</span>
                        ) : isPartialStatus ? (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">● Partial · Due {formatCurrency(balance)}</span>
                        ) : displayOwed > 0 ? (
                          <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">{formatCurrency(balance)} owed</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">No amount set</span>
                        )}
                      </div>

                      <div className="p-3 space-y-2">
                        {canEdit("jobs") && (
                          <div className="space-y-1.5">
                            <div className="flex gap-1">
                              {(['hourly', 'fixed', 'allocation'] as const).map(type => (
                                <button key={type}
                                  onClick={async () => {
                                    if (pay.compensationType === type) return;
                                    await fetch(`${BASE}/api/jobs/${job.id}/sub-payments/${pay.subcontractorId}`, {
                                      method: "PUT", headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ compensationType: type }),
                                    });
                                    await loadData();
                                  }}
                                  className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition-colors ${
                                    pay.compensationType === type
                                      ? type === 'allocation' ? 'bg-purple-500 text-white border-purple-500'
                                        : type === 'fixed' ? 'bg-orange-500 text-white border-orange-500'
                                        : 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-background text-muted-foreground border-border hover:bg-muted/50'
                                  }`}>
                                  {type === 'hourly' ? 'Hourly' : type === 'fixed' ? 'Fixed $' : '% Alloc'}
                                </button>
                              ))}
                            </div>
                            {pay.compensationType === 'hourly' && (
                              <>
                              <div key={`rate-${pay.hourlyRate}`} className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground w-20 flex-shrink-0">Work rate/hr $</span>
                                <input type="number" step="0.01" min="0"
                                  defaultValue={pay.hourlyRate ?? pay.payRate ?? ""}
                                  placeholder={pay.payRate ? String(pay.payRate) : "0.00"}
                                  onBlur={async (e) => {
                                    const v = parseFloat(e.target.value);
                                    if (!isNaN(v) && v !== (pay.hourlyRate ?? pay.payRate ?? 0)) {
                                      await fetch(`${BASE}/api/jobs/${job.id}/sub-payments/${pay.subcontractorId}`, {
                                        method: "PUT", headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ hourlyRate: v }),
                                      });
                                      await loadData();
                                    }
                                  }}
                                  className="flex-1 px-2 py-1 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary/20" />
                              </div>
                              <div key={`travel-rate-${pay.travelRate}`} className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground w-20 flex-shrink-0">Travel rate/hr $</span>
                                <input type="number" step="0.01" min="0"
                                  defaultValue={pay.travelRate ?? pay.travelPayRate ?? ""}
                                  placeholder={pay.travelPayRate ? String(pay.travelPayRate) : "0.00"}
                                  onBlur={async (e) => {
                                    const v = e.target.value ? parseFloat(e.target.value) : null;
                                    if (v !== (pay.travelRate ?? pay.travelPayRate ?? null)) {
                                      await fetch(`${BASE}/api/jobs/${job.id}/sub-payments/${pay.subcontractorId}`, {
                                        method: "PUT", headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ travelRate: v }),
                                      });
                                      await loadData();
                                    }
                                  }}
                                  className="flex-1 px-2 py-1 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary/20" />
                              </div>
                              </>
                            )}
                            {pay.compensationType === 'fixed' && (
                              <div key={`fixed-${pay.fixedAmount}`} className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground w-16 flex-shrink-0">Amount $</span>
                                <input type="number" step="0.01" min="0"
                                  defaultValue={pay.fixedAmount ?? ""}
                                  placeholder="0.00"
                                  onBlur={async (e) => {
                                    const v = parseFloat(e.target.value);
                                    if (!isNaN(v)) {
                                      await fetch(`${BASE}/api/jobs/${job.id}/sub-payments/${pay.subcontractorId}`, {
                                        method: "PUT", headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ fixedAmount: v }),
                                      });
                                      await loadData();
                                    }
                                  }}
                                  className="flex-1 px-2 py-1 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary/20" />
                              </div>
                            )}
                            {pay.compensationType === 'allocation' && (
                              <div key={`alloc-${pay.allocationPct}`} className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground w-16 flex-shrink-0">Alloc %</span>
                                <input type="number" step="0.1" min="0" max="100"
                                  defaultValue={pay.allocationPct ?? ""}
                                  placeholder="0.0"
                                  onBlur={async (e) => {
                                    const v = parseFloat(e.target.value);
                                    if (!isNaN(v)) {
                                      await fetch(`${BASE}/api/jobs/${job.id}/sub-payments/${pay.subcontractorId}`, {
                                        method: "PUT", headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ allocationPct: v }),
                                      });
                                      await loadData();
                                    }
                                  }}
                                  className="flex-1 px-2 py-1 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary/20" />
                                <span className="text-[10px] text-purple-600 font-medium">→ Pay Breakdown</span>
                              </div>
                            )}
                          </div>
                        )}
                        {!isEditing ? (
                          <>
                            {/* Amount rows */}
                            {displayOwed > 0 && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">
                                  Owed{pay.computedOwed > 0 && !pay.amountOwedIsManual && (
                                    <span className="ml-1 text-[9px] text-orange-500">(hrs × rate)</span>
                                  )}
                                </span>
                                <span className="font-medium">{formatCurrency(displayOwed)}</span>
                              </div>
                            )}
                            {amountPaid > 0 && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Paid</span>
                                <span className="font-medium text-emerald-600">{formatCurrency(amountPaid)}</span>
                              </div>
                            )}
                            {pay.paidDate && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Paid on</span>
                                <span>{formatDate(pay.paidDate)}</span>
                              </div>
                            )}
                            {pay.paidNotes && (
                              <p className="text-[10px] text-muted-foreground italic">{pay.paidNotes}</p>
                            )}

                            {/* Action buttons */}
                            {canEdit("jobs") && (
                              <>
                                <div className="flex gap-2 pt-1">
                                  {!isPaid && displayOwed > 0 && (
                                    <button
                                      onClick={() => handleQuickPay(pay.subcontractorId, balance, pay.subName)}
                                      disabled={isMarkingThisOne}
                                      className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50">
                                      {isMarkingThisOne ? "Recording…" : `Mark Paid — ${formatCurrency(balance)}`}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setEditPayId(pay.subcontractorId)}
                                    className={`${!isPaid && displayOwed > 0 ? "px-3" : "flex-1"} py-2.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors`}>
                                    {isPaid ? "Edit / Adjust" : displayOwed > 0 ? "Adjust" : "Set Amount"}
                                  </button>
                                </div>
                                {(amountPaid > 0 || pay.paymentStatus !== 'unpaid') && (
                                  <div className="pt-1">
                                    {!hasExpenses ? (
                                      <button
                                        onClick={() => handleResetPayment(pay.subcontractorId)}
                                        disabled={isResettingThisOne}
                                        className="w-full py-1.5 rounded-lg border border-amber-300 text-amber-700 bg-amber-50 text-xs font-medium hover:bg-amber-100 transition-colors disabled:opacity-50">
                                        {isResettingThisOne ? "Resetting…" : "Reset Payment Record"}
                                      </button>
                                    ) : (
                                      <div>
                                        <button disabled className="w-full py-1.5 rounded-lg border border-border text-muted-foreground bg-muted text-xs font-medium cursor-not-allowed opacity-60">
                                          Reset Payment Record
                                        </button>
                                        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">Payment expenses have been recorded. Edit the payment amount or add a reversing adjustment in Expenses.</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </>
                        ) : (
                          <div className="space-y-2">
                            {pay.computedOwed > 0 && (
                              <p className="text-[10px] text-orange-600 bg-orange-50 rounded-lg px-2 py-1">
                                Auto-computed from hours: {formatCurrency(pay.computedOwed)}. Only override if different.
                              </p>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-medium mb-1 text-muted-foreground">Owed Override</label>
                                <input type="number" step="0.01" min="0"
                                  placeholder={pay.computedOwed > 0 ? String(pay.computedOwed) : "0.00"}
                                  value={pf.amountOwed}
                                  onChange={e => setPayForm(prev => ({ ...prev, [pay.subcontractorId]: { ...pf, amountOwed: e.target.value } }))}
                                  className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background outline-none" />
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium mb-1 text-muted-foreground">Amount Paid</label>
                                <input type="number" step="0.01" min="0" placeholder="0.00"
                                  value={pf.amountPaid}
                                  onChange={e => setPayForm(prev => ({ ...prev, [pay.subcontractorId]: { ...pf, amountPaid: e.target.value } }))}
                                  className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background outline-none" />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium mb-1 text-muted-foreground">Paid Date</label>
                              <input type="date" value={pf.paidDate}
                                onChange={e => setPayForm(prev => ({ ...prev, [pay.subcontractorId]: { ...pf, paidDate: e.target.value } }))}
                                className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background outline-none" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium mb-1 text-muted-foreground">Notes (optional)</label>
                              <input type="text" placeholder="Check #, Venmo, cash…" value={pf.paidNotes}
                                onChange={e => setPayForm(prev => ({ ...prev, [pay.subcontractorId]: { ...pf, paidNotes: e.target.value } }))}
                                className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background outline-none" />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setEditPayId(null)} className="flex-1 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors">Cancel</button>
                              <button onClick={() => handleSavePayment(pay.subcontractorId)} className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">Save</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* BENCHMARK TAB */}
          {activeTab === "benchmark" && (
            <div className="p-4 space-y-4">
              {loading ? (
                <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />)}</div>
              ) : !benchmark ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <BarChart2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">No benchmark for this job type</p>
                  {job.jobType ? (
                    <p className="text-xs text-muted-foreground mt-1">Add a benchmark for "<strong>{job.jobType}</strong>" in Settings → Job Benchmarks</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">Set a job type on this job, then add a benchmark in Settings → Job Benchmarks</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Benchmark: {benchmark.jobType}
                  </p>
                  {benchmark.notes && (
                    <p className="text-xs text-muted-foreground italic">{benchmark.notes}</p>
                  )}

                  {/* Hours comparison */}
                  {benchmark.estimatedHours != null && (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <div className="px-3 py-2 bg-muted/30 text-xs font-semibold text-foreground">Hours</div>
                      <div className="p-3 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Estimated</span>
                          <span className="font-medium">{benchmark.estimatedHours}h</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Actual (tracked)</span>
                          <span className={`font-bold ${totalHours > benchmark.estimatedHours ? "text-red-600" : "text-emerald-600"}`}>
                            {totalHours.toFixed(1)}h
                          </span>
                        </div>
                        {totalHours > 0 && (
                          <div className="mt-1">
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${totalHours > benchmark.estimatedHours ? "bg-red-500" : "bg-emerald-500"}`}
                                style={{ width: `${Math.min(100, (totalHours / benchmark.estimatedHours) * 100)}%` }}
                              />
                            </div>
                            <p className={`text-[10px] mt-1 text-right ${totalHours > benchmark.estimatedHours ? "text-red-600" : "text-emerald-600"}`}>
                              {totalHours > benchmark.estimatedHours
                                ? `+${(totalHours - benchmark.estimatedHours).toFixed(1)}h over budget`
                                : `${(benchmark.estimatedHours - totalHours).toFixed(1)}h under budget`}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Labor cost comparison */}
                  {benchmark.estimatedLaborCost != null && (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <div className="px-3 py-2 bg-muted/30 text-xs font-semibold text-foreground">Sub Labor Cost</div>
                      <div className="p-3 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Estimated</span>
                          <span className="font-medium">{formatCurrency(benchmark.estimatedLaborCost)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Actual (from hours)</span>
                          <span className={`font-bold ${totalSubLabor > benchmark.estimatedLaborCost ? "text-red-600" : "text-emerald-600"}`}>
                            {formatCurrency(totalSubLabor)}
                          </span>
                        </div>
                        {totalSubLabor > 0 && (
                          <p className={`text-[10px] text-right ${totalSubLabor > benchmark.estimatedLaborCost ? "text-red-600" : "text-emerald-600"}`}>
                            {totalSubLabor > benchmark.estimatedLaborCost
                              ? `+${formatCurrency(totalSubLabor - benchmark.estimatedLaborCost)} over`
                              : `${formatCurrency(benchmark.estimatedLaborCost - totalSubLabor)} under`}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Material cost benchmark (informational) */}
                  {benchmark.estimatedMaterialCost != null && (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <div className="px-3 py-2 bg-muted/30 text-xs font-semibold text-foreground">Materials Budget</div>
                      <div className="p-3">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Estimated</span>
                          <span className="font-medium">{formatCurrency(benchmark.estimatedMaterialCost)}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">Compare against job expenses in the P&L panel</p>
                      </div>
                    </div>
                  )}
                </div>
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

// ─── Job Trips Panel ───────────────────────────────────────────────────────────

const TRIP_RECEIPT_CATEGORIES = [
  "Hotel/Lodging", "Meals", "Parking/Tolls", "Airfare",
  "Rental Car", "Taxi/Rideshare", "Campground/RV Site",
  "Supplies", "Tools", "Other Travel",
];

function getTripAuditBadge(trip: any): { isReady: boolean; label: string } {
  if (!trip.businessPurpose?.trim()) return { isReady: false, label: "Missing Business Purpose" };
  if (trip.missingReceipts > 0) return { isReady: false, label: "Missing Receipt" };
  if (trip.mealsCount > 0 && trip.mealsHaveOvernightAnswered < trip.mealsCount) {
    return { isReady: false, label: "Meal Needs Overnight Status" };
  }
  if (trip.receiptCount === 0) return { isReady: false, label: "No Receipts Yet" };
  return { isReady: true, label: "Audit Ready" };
}

function JobTripReceipts({ tripId, tripStatus, refreshKey }: { tripId: number; tripStatus: string; refreshKey?: number }) {
  const [receipts, setReceipts] = useState<any[] | null>(null);
  const [toggling, setToggling] = useState<Set<number>>(new Set());
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const isLocked = tripStatus !== "open";

  function buildReceiptUrl(raw: string | null | undefined): string | null {
    if (!raw) return null;
    if (raw.startsWith("http")) return raw;
    if (raw.startsWith("/objects/")) return `${BASE}/api/storage${raw}`;
    return `${BASE}${raw}`;
  }

  useEffect(() => {
    fetch(`${BASE}/api/trips/${tripId}/receipts`, { credentials: "include" })
      .then(r => r.ok ? r.json() : []).then(setReceipts).catch(() => setReceipts([]));
  }, [tripId, refreshKey]);

  async function toggleJobProfit(r: any) {
    const newVal = r.countsTowardJobProfit === false;
    setToggling(prev => new Set(prev).add(r.id));
    try {
      const res = await fetch(`${BASE}/api/expenses/${r.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ countsTowardJobProfit: newVal }),
      });
      if (res.ok) {
        setReceipts(prev => prev ? prev.map(x => x.id === r.id ? { ...x, countsTowardJobProfit: newVal } : x) : prev);
      }
    } finally {
      setToggling(prev => { const next = new Set(prev); next.delete(r.id); return next; });
    }
  }

  if (receipts === null) return <p className="text-xs text-muted-foreground italic animate-pulse py-2">Loading receipts…</p>;
  if (receipts.length === 0) return <p className="text-xs text-muted-foreground italic py-2">No receipts logged yet.</p>;
  return (
    <>
    <div className="space-y-1.5 mt-2">
      {receipts.map((r: any) => (
        <div key={r.id} className="flex items-start justify-between gap-2 bg-white rounded-xl px-3 py-2 border border-border/40 text-xs">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-foreground">{r.description}</span>
              {r.vendor && <span className="text-muted-foreground">· {r.vendor}</span>}
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">{r.category}</span>
              {r.receiptUrl ? (
                <button
                  type="button"
                  onClick={() => { setImgError(false); setViewingPhotoUrl(buildReceiptUrl(r.receiptUrl)); }}
                  title="Tap to view receipt photo"
                  className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full hover:bg-blue-100 transition-colors cursor-pointer"
                >📎 Photo</button>
              ) : r.receiptStatus === "missing" ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">⚠ Missing</span>
              ) : null}
              {isLocked ? (
                <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                  r.countsTowardJobProfit !== false
                    ? "text-green-700 bg-green-50 border-green-200"
                    : "text-blue-700 bg-blue-50 border-blue-200"
                }`}>
                  {r.countsTowardJobProfit !== false ? "Job P&L" : "Audit Trail"}
                </span>
              ) : (
                <button
                  onClick={() => toggleJobProfit(r)}
                  disabled={toggling.has(r.id)}
                  title={r.countsTowardJobProfit !== false
                    ? "Counts toward job P&L — click to move to Audit Trail only"
                    : "Audit Trail only — click to count toward job P&L"}
                  className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
                    r.countsTowardJobProfit !== false
                      ? "text-green-700 bg-green-50 border-green-200 hover:bg-green-100"
                      : "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100"
                  }`}
                >
                  {toggling.has(r.id) ? "…" : (r.countsTowardJobProfit !== false ? "Job P&L" : "Audit Trail")}
                </button>
              )}
            </div>
            <p className="text-muted-foreground mt-0.5">{r.date}{r.paidBy ? ` · ${r.paidBy}` : ""}</p>
            {r.overnightTravel === false && r.category?.toLowerCase() === "meals" && (
              <p className="text-amber-600 mt-0.5">⚠ Day-trip meal — may be non-deductible</p>
            )}
            {r.receiptMissingExplanation && (
              <p className="text-amber-700 mt-0.5 italic">Reason: {r.receiptMissingExplanation}</p>
            )}
          </div>
          <span className="font-bold text-foreground flex-shrink-0">${Number(r.amount).toFixed(2)}</span>
        </div>
      ))}
    </div>

    {/* Full-screen receipt photo lightbox */}
    {viewingPhotoUrl && createPortal(
      <div
        className="fixed inset-0 z-[200] bg-black/95 overflow-hidden"
        onClick={() => setViewingPhotoUrl(null)}
      >
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setViewingPhotoUrl(null); }}
          className="absolute z-10 right-4 flex items-center gap-1.5 text-white font-bold text-sm bg-black/70 hover:bg-black/90 px-4 py-2 rounded-xl border border-white/30 backdrop-blur-sm transition-colors"
          style={{ top: "max(16px, env(safe-area-inset-top, 16px))" }}
          aria-label="Close"
        >
          <X className="w-4 h-4" /> Close
        </button>
        <div
          className="absolute inset-0 flex items-center justify-center overflow-hidden px-4"
          style={{ paddingTop: "calc(max(52px, env(safe-area-inset-top, 52px)) + 32px)" }}
        >
          {!imgError ? (
            <img
              src={viewingPhotoUrl}
              alt="Receipt full view"
              className="max-w-full max-h-full object-contain select-none"
              onClick={e => e.stopPropagation()}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex flex-col items-center gap-4 p-8 text-center" onClick={e => e.stopPropagation()}>
              <ImageIcon className="w-16 h-16 text-red-300" />
              <p className="text-white font-semibold text-lg">Receipt no longer available</p>
              <p className="text-white/70 text-sm">This file may have been lost. Close and re-upload the receipt.</p>
            </div>
          )}
        </div>
        {!imgError && (
          <a
            href={viewingPhotoUrl}
            download
            onClick={e => e.stopPropagation()}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 px-5 py-3 bg-white/15 text-white rounded-xl font-semibold hover:bg-white/25 transition-colors text-sm"
          >
            <Download className="w-4 h-4" /> Download
          </a>
        )}
      </div>,
      document.body
    )}
    </>
  );
}

function JobTripsPanel({ job, onClose }: { job: Job; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [activeReceiptFormTripId, setActiveReceiptFormTripId] = useState<number | null>(null);
  const [showNewTripForm, setShowNewTripForm] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [receiptRefreshKeys, setReceiptRefreshKeys] = useState<Record<number, number>>({});
  const [editingTripId, setEditingTripId] = useState<number | null>(null);
  const [editDest, setEditDest] = useState("");
  const [editPurpose, setEditPurpose] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingTripId, setDeletingTripId] = useState<number | null>(null);
  const [confirmDeleteTripId, setConfirmDeleteTripId] = useState<number | null>(null);

  // New trip form — pre-fill from job
  const jobLocation = [job.locationName, job.city, job.state].filter(Boolean).join(", ");
  const [tripDest, setTripDest] = useState(jobLocation);
  const [tripPurpose, setTripPurpose] = useState(job.title ?? "");
  const [tripStart, setTripStart] = useState(job.startDate ?? "");
  const [tripEnd, setTripEnd] = useState(job.endDate ?? "");

  // Receipt form state
  const [rcptDesc, setRcptDesc] = useState("");
  const [rcptVendor, setRcptVendor] = useState("");
  const [rcptAmount, setRcptAmount] = useState("");
  const [rcptCategory, setRcptCategory] = useState("Hotel/Lodging");
  const [rcptDate, setRcptDate] = useState(new Date().toISOString().slice(0, 10));
  const [rcptOvernight, setRcptOvernight] = useState<boolean | null>(null);
  const [rcptFile, setRcptFile] = useState<File | null>(null);
  const [rcptPreview, setRcptPreview] = useState<string | null>(null);
  const rcptFileInputRef = useRef<HTMLInputElement>(null);

  function resetReceiptForm() {
    setRcptDesc(""); setRcptVendor(""); setRcptAmount(""); setRcptCategory("Hotel/Lodging");
    setRcptDate(new Date().toISOString().slice(0, 10)); setRcptOvernight(null);
    setRcptFile(null); setRcptPreview(null);
    if (rcptFileInputRef.current) rcptFileInputRef.current.value = "";
  }

  async function fetchTrips() {
    const data = await fetch(`${BASE}/api/trips?jobId=${job.id}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : []).catch(() => []);
    setTrips(data);
  }

  useEffect(() => {
    setLoading(true);
    fetchTrips().finally(() => setLoading(false));
  }, [job.id]);

  function toggleExpand(id: number) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function money(n: number) { return `$${Number(n).toFixed(2)}`; }

  async function createTrip() {
    if (!tripDest.trim()) return;
    setSavingTrip(true);
    try {
      const res = await fetch(`${BASE}/api/trips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          destination: tripDest.trim(),
          businessPurpose: tripPurpose.trim() || null,
          startDate: tripStart || null,
          endDate: tripEnd || null,
          jobId: job.id,
        }),
      });
      if (res.ok) {
        const newTrip = await res.json();
        setShowNewTripForm(false);
        setTripDest(jobLocation); setTripPurpose(job.title ?? "");
        setTripStart(job.startDate ?? ""); setTripEnd(job.endDate ?? "");
        await fetchTrips();
        qc.invalidateQueries({ queryKey: ["business-trips"] });
        setExpandedIds(prev => new Set(prev).add(newTrip.id));
        setActiveReceiptFormTripId(newTrip.id);
        resetReceiptForm();
      }
    } finally {
      setSavingTrip(false);
    }
  }

  async function addReceipt(tripId: number) {
    if (!rcptDesc.trim() || !rcptAmount) return;
    setSavingReceipt(true);
    const fileToUpload = rcptFile;
    try {
      const body: any = {
        description: rcptDesc.trim(), amount: rcptAmount,
        category: rcptCategory, date: rcptDate,
        tripId, jobId: job.id, receiptStatus: "uploaded",
        ...(rcptVendor.trim() && { vendor: rcptVendor.trim() }),
        ...(job.businessLine && { businessLine: job.businessLine }),
      };
      if (rcptCategory === "Meals" && rcptOvernight !== null) body.overnightTravel = rcptOvernight;
      const res = await fetch(`${BASE}/api/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const expense = await res.json();
        setActiveReceiptFormTripId(null);
        resetReceiptForm();
        // Upload photo before refreshing so the 📎 badge shows immediately
        if (fileToUpload && expense?.id) {
          const fd = new FormData();
          fd.append("receipt", fileToUpload);
          try {
            const uploadRes = await fetch(`${BASE}/api/expenses/${expense.id}/receipt`, {
              method: "POST",
              body: fd,
              credentials: "include",
            });
            if (!uploadRes.ok) throw new Error("upload failed");
          } catch {
            toast({
              title: "Photo upload failed",
              description: "Receipt saved but photo upload failed — open the expense to re-attach.",
              variant: "destructive",
            });
          }
        }
        setReceiptRefreshKeys(prev => ({ ...prev, [tripId]: (prev[tripId] ?? 0) + 1 }));
        await fetchTrips();
        qc.invalidateQueries({ queryKey: ["business-trips"] });
        qc.invalidateQueries({ queryKey: ["trip-receipts", tripId] });
      }
    } finally {
      setSavingReceipt(false);
    }
  }

  function startEdit(trip: any) {
    setEditingTripId(trip.id);
    setEditDest(trip.destination ?? "");
    setEditPurpose(trip.businessPurpose ?? "");
    setEditStart(trip.startDate ?? "");
    setEditEnd(trip.endDate ?? "");
  }

  async function saveEdit(tripId: number) {
    if (!editDest.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`${BASE}/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          destination: editDest.trim(),
          businessPurpose: editPurpose.trim() || null,
          startDate: editStart || null,
          endDate: editEnd || null,
        }),
      });
      if (res.ok) {
        setEditingTripId(null);
        await fetchTrips();
        qc.invalidateQueries({ queryKey: ["business-trips"] });
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteTrip(tripId: number) {
    setDeletingTripId(tripId);
    try {
      const res = await fetch(`${BASE}/api/trips/${tripId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setConfirmDeleteTripId(null);
        setExpandedIds(prev => { const next = new Set(prev); next.delete(tripId); return next; });
        if (activeReceiptFormTripId === tripId) { setActiveReceiptFormTripId(null); resetReceiptForm(); }
        await fetchTrips();
        qc.invalidateQueries({ queryKey: ["business-trips"] });
      }
    } finally {
      setDeletingTripId(null);
    }
  }

  async function closeOrReopenTrip(tripId: number, newStatus: "completed" | "open") {
    setClosingId(tripId);
    try {
      const res = await fetch(`${BASE}/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        if (newStatus === "completed") {
          setExpandedIds(prev => { const next = new Set(prev); next.delete(tripId); return next; });
          if (activeReceiptFormTripId === tripId) { setActiveReceiptFormTripId(null); resetReceiptForm(); }
        }
        await fetchTrips();
        qc.invalidateQueries({ queryKey: ["business-trips"] });
      }
    } finally {
      setClosingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-blue-50/60">
          <div className="flex items-center gap-2.5">
            <Briefcase className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-foreground">Business Trips</span>
            <span className="text-xs text-muted-foreground">— {job.title}</span>
          </div>
          <div className="flex items-center gap-2">
            {!showNewTripForm && (
              <button
                onClick={() => setShowNewTripForm(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Trip
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">

          {/* ── Inline New Trip Form ── */}
          {showNewTripForm && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
              <p className="text-xs font-bold text-blue-800 uppercase tracking-widest">New Business Trip</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">Destination *</label>
                  <input
                    type="text"
                    value={tripDest}
                    onChange={e => setTripDest(e.target.value)}
                    placeholder="e.g. Evansville, IN"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">Business Purpose</label>
                  <input
                    type="text"
                    value={tripPurpose}
                    onChange={e => setTripPurpose(e.target.value)}
                    placeholder="e.g. HVAC service call"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-foreground block mb-1">Start Date</label>
                    <input type="date" value={tripStart} onChange={e => setTripStart(e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground block mb-1">End Date</label>
                    <input type="date" value={tripEnd} onChange={e => setTripEnd(e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={createTrip} disabled={savingTrip || !tripDest.trim()}
                  className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {savingTrip ? "Creating…" : "Create Trip"}
                </button>
                <button onClick={() => setShowNewTripForm(false)}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted/40 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Trip list ── */}
          {loading ? (
            <p className="text-sm text-center text-muted-foreground animate-pulse py-8">Loading trips…</p>
          ) : trips.length === 0 && !showNewTripForm ? (
            <div className="text-center py-10 text-muted-foreground">
              <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm font-medium">No trips on this job yet</p>
              <p className="text-xs mt-1">Tap "Add Trip" to create an IRS-ready receipt folder.</p>
            </div>
          ) : (
            trips.map(trip => {
              const isExpanded = expandedIds.has(trip.id);
              const isTripOpen = trip.status === "open";
              const dateRange = [trip.startDate, trip.endDate].filter(Boolean).join(" → ");
              const badge = getTripAuditBadge(trip);
              const isClosing = closingId === trip.id;
              const showReceiptForm = activeReceiptFormTripId === trip.id;

              return (
                <div key={trip.id} className={`rounded-xl border overflow-hidden bg-background ${isTripOpen ? "border-border/50" : "border-border/30"}`}>

                  {/* Collapsed summary row / inline edit form */}
                  {editingTripId === trip.id ? (
                    <div className="px-4 py-3 space-y-2 bg-blue-50/40">
                      <p className="text-[11px] font-bold text-blue-800 uppercase tracking-widest">Edit Trip</p>
                      <div>
                        <label className="text-xs font-medium text-foreground block mb-1">Destination *</label>
                        <input type="text" value={editDest} onChange={e => setEditDest(e.target.value)}
                          placeholder="e.g. Evansville, IN"
                          className="w-full rounded-lg border border-border px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-foreground block mb-1">Business Purpose</label>
                        <input type="text" value={editPurpose} onChange={e => setEditPurpose(e.target.value)}
                          placeholder="e.g. HVAC service call"
                          className="w-full rounded-lg border border-border px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-medium text-foreground block mb-1">Start Date</label>
                          <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)}
                            className="w-full rounded-lg border border-border px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-foreground block mb-1">End Date</label>
                          <input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                            className="w-full rounded-lg border border-border px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => saveEdit(trip.id)} disabled={savingEdit || !editDest.trim()}
                          className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                          {savingEdit ? "Saving…" : "Save Changes"}
                        </button>
                        <button onClick={() => setEditingTripId(null)}
                          className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={() => toggleExpand(trip.id)}>
                      <div className="mt-0.5 flex-shrink-0">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{trip.destination}</span>
                          {!isTripOpen && (
                            <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border text-gray-500 bg-gray-100 border-gray-200 font-medium">Closed</span>
                          )}
                          {dateRange && <span className="text-xs text-muted-foreground">{dateRange}</span>}
                          <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${badge.isReady ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                            {badge.isReady ? "🟢" : "🟡"} {badge.label}
                          </span>
                        </div>
                        {trip.businessPurpose && <p className="text-xs text-muted-foreground mt-0.5 truncate">{trip.businessPurpose}</p>}
                        {/* At-a-glance stats */}
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-[11px] text-muted-foreground">
                            {trip.receiptCount} receipt{trip.receiptCount !== 1 ? "s" : ""} · {money(trip.totalAmount ?? 0)}
                          </span>
                          {trip.mealTotal > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              Meals: {money(trip.mealTotal)} ({money(trip.deductibleMeals ?? 0)} deductible)
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); startEdit(trip); }}
                        className="flex-shrink-0 p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                        title="Edit trip details"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-border/30 bg-gray-50/60 px-4 py-3 space-y-3">

                      {/* Meals breakdown */}
                      {trip.mealTotal > 0 && (
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="bg-white rounded-xl border border-border/50 px-3 py-2">
                            <p className="text-xs text-muted-foreground">Meals (50% deductible)</p>
                            <p className="text-sm font-bold text-emerald-700">{money(trip.deductibleMeals ?? 0)}</p>
                          </div>
                          <div className="bg-white rounded-xl border border-border/50 px-3 py-2">
                            <p className="text-xs text-muted-foreground">Total Travel Spend</p>
                            <p className="text-sm font-bold text-foreground">{money(trip.totalAmount ?? 0)}</p>
                          </div>
                        </div>
                      )}

                      {/* Receipt list */}
                      <div>
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Receipts</p>
                        <p className="text-[10px] text-blue-700 italic mb-1">Expenses marked "Audit Trail" don't reduce job profit — tracked for tax purposes only.</p>
                        <JobTripReceipts tripId={trip.id} tripStatus={trip.status} refreshKey={receiptRefreshKeys[trip.id] ?? 0} />
                      </div>

                      {/* Add Receipt form (open trips only) */}
                      {isTripOpen && (
                        <>
                          {showReceiptForm ? (
                            <div className="rounded-xl border border-border bg-white p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Add Receipt</p>
                                <button
                                  type="button"
                                  onClick={() => rcptFileInputRef.current?.click()}
                                  title="Attach receipt photo"
                                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                                    rcptFile
                                      ? "border-blue-300 bg-blue-50 text-blue-700"
                                      : "border-border text-muted-foreground hover:bg-muted/40"
                                  }`}
                                >
                                  <ImageIcon className="w-3 h-3" />
                                  {rcptFile ? "Photo added" : "Add Photo"}
                                </button>
                                <input
                                  ref={rcptFileInputRef}
                                  type="file"
                                  accept="image/*,application/pdf"
                                  className="hidden"
                                  onChange={e => {
                                    const file = e.target.files?.[0] ?? null;
                                    setRcptFile(file);
                                    if (file) {
                                      const url = URL.createObjectURL(file);
                                      setRcptPreview(url);
                                    } else {
                                      setRcptPreview(null);
                                    }
                                  }}
                                />
                              </div>
                              {rcptPreview && (
                                <div className="relative w-full">
                                  <img src={rcptPreview} alt="Receipt preview" className="w-full max-h-36 object-contain rounded-lg border border-border bg-gray-50" />
                                  <button
                                    type="button"
                                    onClick={() => { setRcptFile(null); setRcptPreview(null); if (rcptFileInputRef.current) rcptFileInputRef.current.value = ""; }}
                                    className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                              <div className="space-y-2">
                                <div>
                                  <label className="text-xs font-medium text-foreground block mb-1">Description *</label>
                                  <input type="text" value={rcptDesc} onChange={e => setRcptDesc(e.target.value)}
                                    placeholder="e.g. Hampton Inn stay"
                                    className="w-full rounded-lg border border-border px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30" />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-foreground block mb-1">Vendor</label>
                                  <input type="text" value={rcptVendor} onChange={e => setRcptVendor(e.target.value)}
                                    placeholder="e.g. Home Depot"
                                    className="w-full rounded-lg border border-border px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs font-medium text-foreground block mb-1">Amount *</label>
                                    <input type="number" step="0.01" value={rcptAmount} onChange={e => setRcptAmount(e.target.value)}
                                      placeholder="0.00"
                                      className="w-full rounded-lg border border-border px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30" />
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium text-foreground block mb-1">Date *</label>
                                    <input type="date" value={rcptDate} onChange={e => setRcptDate(e.target.value)}
                                      className="w-full rounded-lg border border-border px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30" />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-foreground block mb-1">Category *</label>
                                  <select value={rcptCategory} onChange={e => setRcptCategory(e.target.value)}
                                    className="w-full rounded-lg border border-border px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                                    {TRIP_RECEIPT_CATEGORIES.map(cat => (
                                      <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                  </select>
                                </div>
                                {rcptCategory === "Meals" && (
                                  <div>
                                    <label className="text-xs font-medium text-foreground block mb-1">Overnight trip?</label>
                                    <div className="flex gap-2">
                                      {([{ label: "Yes", val: true }, { label: "No", val: false }] as { label: string; val: boolean }[]).map(opt => (
                                        <button key={opt.label} type="button" onClick={() => setRcptOvernight(opt.val)}
                                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                            rcptOvernight === opt.val
                                              ? "bg-primary text-primary-foreground border-primary"
                                              : "border-border text-muted-foreground hover:bg-muted/40"
                                          }`}>
                                          {opt.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2 pt-1">
                                <button onClick={() => addReceipt(trip.id)}
                                  disabled={savingReceipt || !rcptDesc.trim() || !rcptAmount}
                                  className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                                  {savingReceipt ? "Saving…" : "Add Receipt"}
                                </button>
                                <button onClick={() => { setActiveReceiptFormTripId(null); resetReceiptForm(); }}
                                  className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setActiveReceiptFormTripId(trip.id); resetReceiptForm(); }}
                              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 text-xs font-semibold hover:bg-primary/20 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" /> Add Receipt
                            </button>
                          )}
                        </>
                      )}

                      {/* Close / Reopen + Delete */}
                      <div className="pt-1 border-t border-border/20 space-y-2">
                        {isTripOpen ? (
                          <>
                            <button onClick={() => closeOrReopenTrip(trip.id, "completed")} disabled={isClosing}
                              className="w-full py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors disabled:opacity-50">
                              {isClosing ? "Closing…" : "✓ Close Trip"}
                            </button>
                            {confirmDeleteTripId === trip.id ? (
                              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                                <p className="flex-1 text-xs text-red-700 font-medium">Delete this trip and all its receipts?</p>
                                <button
                                  onClick={() => deleteTrip(trip.id)}
                                  disabled={deletingTripId === trip.id}
                                  className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                                >
                                  {deletingTripId === trip.id ? "Deleting…" : "Delete"}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteTripId(null)}
                                  className="px-2.5 py-1 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteTripId(trip.id)}
                                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete Trip
                              </button>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground italic">
                              Completed{trip.closedAt ? ` ${new Date(trip.closedAt).toLocaleDateString()}` : ""}
                            </p>
                            <button onClick={() => closeOrReopenTrip(trip.id, "open")} disabled={isClosing}
                              className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors disabled:opacity-50">
                              {isClosing ? "…" : "Reopen"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/30 bg-muted/10 flex items-center justify-end">
          <button onClick={onClose} className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">Done</button>
        </div>
      </div>
    </div>
  );
}

// ─── Job Card ──────────────────────────────────────────────────────────────────
type ChecklistSummary = { completedItems: number; totalItems: number; overallPercent: number };

function JobCard({
  job, onEdit, onDelete, onReviewInvoice, onMarkCompleted, materialListCount, estimateTotal, onLoadEstimateIntoInvoice,
  invoiceSummary, onCreateInvoice, onClientClick, hasSubExpenses, profitData,
  onSendPaymentLink, onGoToInvoices, generatingLinkId, onSmartEstimate, onArchiveJob, subsSettled,
  checklistSummary, productionServiceTypes = [], onApplyProductionPricing, onAcceptInvoice,
}: {
  job: Job;
  onEdit: (job: Job) => void;
  onDelete: (job: Job) => void;
  onReviewInvoice: (job: Job) => void;
  onMarkCompleted: (job: Job) => void;
  materialListCount: number;
  estimateTotal?: number;
  onLoadEstimateIntoInvoice?: (job: Job, estimates: Estimate[]) => void;
  invoiceSummary?: Invoice | null;
  onCreateInvoice?: () => void;
  onClientClick?: (clientId: number) => void;
  hasSubExpenses?: boolean;
  profitData?: JobProfit | null;
  onSendPaymentLink?: (invoiceId: number, invoiceNumber: string, currentTotal: number, jobId: number) => void;
  onGoToInvoices?: () => void;
  generatingLinkId?: number | null;
  onSmartEstimate?: (job: Job) => void;
  onArchiveJob?: (job: Job) => void;
  subsSettled?: boolean;
  checklistSummary?: ChecklistSummary | null;
  productionServiceTypes?: import("@workspace/api-client-react").ProductionServiceType[];
  onApplyProductionPricing?: () => void;
  onAcceptInvoice?: (job: Job, invoice: Invoice) => void;
}) {
  const { canEdit } = useUserPermissions();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: routeDistData } = useQuery<{ miles: number | null }>({
    queryKey: ["route-distance", job.id],
    queryFn: () =>
      fetch(`${BASE}/api/route-distance?clientId=${job.clientId}&jobId=${job.id}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : { miles: null }),
    enabled: job.clientId != null && !!(job.address || job.city),
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
  });
  const routeMiles = routeDistData?.miles ?? null;

  const [showSmartEstimate, setShowSmartEstimate] = useState(false);
  const [materialsPanelOpen, setMaterialsPanelOpen] = useState(false);
  const [estimatesPanelOpen, setEstimatesPanelOpen] = useState(false);
  const [financialsPanelOpen, setFinancialsPanelOpen] = useState(false);
  const [financialsInitialTab, setFinancialsInitialTab] = useState<"pl" | "breakdown" | "hours">("pl");
  const [phasesPanelOpen, setPhasesPanelOpen] = useState(false);
  const [checklistPanelOpen, setChecklistPanelOpen] = useState(false);
  const [mfhPanelOpen, setMfhPanelOpen] = useState(false);
  const [serviceBillingOpen, setServiceBillingOpen] = useState(false);
  const [tripsPanelOpen, setTripsPanelOpen] = useState(false);
  const [localSubPaid, setLocalSubPaid] = useState(job.subPaid);
  const jobWorkflow = getJobWorkflow(job);
  const isCompleted = displayStatus(job.status) === "completed";
  const inv = invoiceSummary as (Invoice & { squarePaidAt?: string | null }) | null | undefined;
  const squarePaid = !!inv?.squarePaidAt;

  type OutstandingSubRow = { subcontractorId: number; subName: string; compensationType: string; fixedAmount: number | null; allocationPct: number | null; amountOwed: number | null; amountPaid?: number; paymentStatus?: string; totalHours?: number | null; accruedBonus?: number | null };
  const [unpaidSubs, setUnpaidSubs] = useState<OutstandingSubRow[] | null>(null);
  const [markingSubId, setMarkingSubId] = useState<number | null>(null);
  const hasSubs = Array.isArray(job.subcontractorIds) && (job.subcontractorIds as number[]).length > 0;

  useEffect(() => {
    if (!hasSubs) return;
    fetch(`${BASE}/api/jobs/${job.id}/outstanding-sub-payments`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((rows: OutstandingSubRow[]) => setUnpaidSubs(rows))
      .catch(() => setUnpaidSubs([]));
  }, [job.id, hasSubs, localSubPaid]);

  // Compute split pool for allocation sub amounts (mirrors JobFinancialsPanel waterfall)
  const toSplit = (() => {
    if (!profitData) return 0;
    const income = Math.max(0, (profitData.grossInvoiced ?? 0) - (profitData.jobExpenses ?? 0));
    const afterWorkers = Math.max(0, income - (profitData.subLaborCost ?? 0));
    return Math.max(0, afterWorkers - afterWorkers * 0.05);
  })();

  function outstandingAmount(sub: OutstandingSubRow): number {
    const fullOwed = sub.amountOwed != null ? sub.amountOwed
      : sub.compensationType === "fixed" ? (sub.fixedAmount ?? 0)
      : sub.compensationType === "allocation" ? toSplit * ((sub.allocationPct ?? 0) / 100)
      : 0;
    const alreadyPaid = sub.amountPaid ?? 0;
    return Math.max(0, fullOwed - alreadyPaid);
  }

  function agreedOwedAmount(sub: OutstandingSubRow): number {
    if (sub.amountOwed != null) return sub.amountOwed;
    if (sub.compensationType === "fixed") return sub.fixedAmount ?? 0;
    if (sub.compensationType === "allocation") return toSplit * ((sub.allocationPct ?? 0) / 100);
    return 0;
  }

  async function handleMarkSubPaidInline(sub: OutstandingSubRow) {
    const amount = outstandingAmount(sub);
    if (amount <= 0) {
      toast({ title: "Amount unknown", description: "Open Pay Breakdown to set this sub's amount before marking paid.", variant: "destructive" });
      return;
    }
    setMarkingSubId(sub.subcontractorId);
    try {
      const agreedOwed = agreedOwedAmount(sub);
      const res = await fetch(`${BASE}/api/jobs/${job.id}/pay-worker/${sub.subcontractorId}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, agreedOwed: agreedOwed > 0 ? agreedOwed : undefined, subName: sub.subName, idempotencyKey: crypto.randomUUID() }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Marked paid", description: `${sub.subName} — ${formatCurrency(amount)} recorded.` });
      // Refresh outstanding list; if empty, update localSubPaid
      const updated: OutstandingSubRow[] = await fetch(`${BASE}/api/jobs/${job.id}/outstanding-sub-payments`, { credentials: "include" })
        .then(r => r.ok ? r.json() : []).catch(() => []);
      setUnpaidSubs(updated);
      if (updated.length === 0) setLocalSubPaid(true);
    } catch {
      toast({ title: "Failed to record payment", variant: "destructive" });
    } finally {
      setMarkingSubId(null);
    }
  }

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
              {jobWorkflow && job.businessLine !== "asphalt_sealing" && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${JOB_WORKFLOWS[jobWorkflow].color}`}>
                  {JOB_WORKFLOWS[jobWorkflow].emoji} {JOB_WORKFLOWS[jobWorkflow].label}
                </span>
              )}
              {jobWorkflow === "mh_production" && (job as unknown as Record<string, unknown>).mfhConstructionType ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-300 text-amber-700 bg-transparent">
                  {(() => {
                    const ct = (job as unknown as Record<string, unknown>).mfhConstructionType as string;
                    const up = ct.toUpperCase();
                    if (up.startsWith("FIELD_")) return `Field · ${ct.split("_")[1]}`;
                    if (up.startsWith("LOT_")) return `Lot · ${ct.split("_")[1]}`;
                    return ct; // legacy bare value
                  })()}
                </span>
              ) : null}
              {jobWorkflow === "mh_production" && Array.isArray((job as unknown as Record<string, unknown>).mhProductionServices) &&
                ((job as unknown as Record<string, unknown>).mhProductionServices as number[]).map(svcId => {
                  const svc = productionServiceTypes.find(t => t.id === svcId);
                  if (!svc) return null;
                  return (
                    <span key={svcId} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                      {svc.name}
                    </span>
                  );
                })
              }
              {hasSubExpenses && localSubPaid && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                  <HardHat className="w-2.5 h-2.5" />
                  Sub Paid
                </span>
              )}
              {hasSubExpenses && !localSubPaid && (
                <button
                  onClick={() => { setFinancialsInitialTab("hours"); setFinancialsPanelOpen(true); }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors cursor-pointer">
                  <HardHat className="w-2.5 h-2.5" />
                  Sub Pay Outstanding — tap to settle
                </button>
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
              {checklistSummary != null && checklistSummary.totalItems > 0 && (
                <button
                  onClick={() => setChecklistPanelOpen(true)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                    checklistSummary.overallPercent === 100
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      : checklistSummary.overallPercent > 0
                        ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>
                  <CheckSquare className="w-2.5 h-2.5" />
                  {checklistSummary.completedItems}/{checklistSummary.totalItems} · {checklistSummary.overallPercent}%
                </button>
              )}
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
          {routeMiles != null && (
            <div className="flex items-center gap-1.5 text-blue-600">
              <Navigation className="w-3 h-3 flex-shrink-0" />
              <span className="font-medium">{routeMiles} mi from client</span>
            </div>
          )}
          {job.startDate && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              <span>{formatDate(job.startDate)}{job.endDate && ` – ${formatDate(job.endDate)}`}</span>
            </div>
          )}
          {(job.subcontractorNames?.length ?? 0) > 0 && (
            <div className="flex items-center gap-1.5">
              <HardHat className="w-3 h-3 flex-shrink-0" />
              <span>{job.subcontractorNames!.join(", ")}</span>
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

          {(job as unknown as Record<string, unknown>).manHours != null && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Timer className="w-3 h-3 flex-shrink-0" />
              <span className="font-medium">{parseFloat(String((job as unknown as Record<string, unknown>).manHours)).toLocaleString(undefined, { maximumFractionDigits: 1 })} man-hrs</span>
            </div>
          )}

          {/* Invoice status indicator */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <Receipt className="w-3 h-3 flex-shrink-0" />
            {invoiceSummary ? (
              <span className={`inline-flex items-center gap-1 font-medium ${
                invoiceSummary.status === "paid"
                  ? "text-emerald-600"
                  : invoiceSummary.status === "partiallyPaid"
                  ? "text-emerald-500"
                  : invoiceSummary.status === "sent"
                  ? "text-amber-600"
                  : invoiceSummary.status === "approved"
                  ? "text-blue-600"
                  : "text-muted-foreground"
              }`}>
                {invoiceSummary.status === "paid" ? "Paid"
                  : invoiceSummary.status === "partiallyPaid" ? "Partially Paid"
                  : invoiceSummary.status === "sent" ? "Invoice Sent"
                  : invoiceSummary.status === "approved" ? "Approved"
                  : "Draft"}
                {invoiceSummary.status === "partiallyPaid" && (invoiceSummary as any).amountPaid != null && invoiceSummary.total != null
                  ? ` · ${formatCurrency(Math.max(0, invoiceSummary.total - (invoiceSummary as any).amountPaid))} remaining`
                  : invoiceSummary.total != null ? ` · ${formatCurrency(invoiceSummary.total)}` : ""}
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

        {/* Estimates button — GC only */}
        {jobWorkflow === "general_contracting" && (
        <button
          onClick={() => setEstimatesPanelOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-muted/40 transition-colors text-xs font-medium text-muted-foreground w-full">
          <Calculator className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <span className="flex-1 text-left">Estimates</span>
          <span className="text-[10px] text-muted-foreground">View / Build</span>
        </button>
        )}

        {/* Smart Estimate Wizard — GC only */}
        {jobWorkflow === "general_contracting" && onSmartEstimate && canEdit("estimates") && (
          showSmartEstimate ? (
            <button
              onClick={() => onSmartEstimate(job)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors text-xs font-bold text-amber-700 w-full">
              <Wand2 className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <span className="flex-1 text-left">Smart Estimate Wizard</span>
              <span className="text-[10px] text-amber-500 font-semibold">KY Rates</span>
            </button>
          ) : (
            <button
              onClick={() => setShowSmartEstimate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-amber-600 transition-colors w-full">
              <Wand2 className="w-3 h-3 flex-shrink-0" />
              <span>Smart Estimate Wizard</span>
              <ChevronDown className="w-3 h-3 ml-auto" />
            </button>
          )
        )}

        {/* Phases — GC only, hidden when a checklist is active */}
        {jobWorkflow === "general_contracting" && !checklistSummary && (
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

        {/* Manufactured Home panel — MH Production and MH Service only */}
        {(jobWorkflow === "mh_production" || jobWorkflow === "mh_service" || (!jobWorkflow && job.businessLine !== "general_contracting" && job.businessLine !== "asphalt_sealing")) && (
          (job.jobType === "Manufactured Home" || (job as unknown as Record<string, unknown>).mfhManufacturerId != null) ? (
            <button
              onClick={() => setMfhPanelOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-100/80 transition-colors text-xs font-medium text-amber-700 w-full">
              <Home className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <span className="flex-1 text-left">Manufactured Home</span>
              {(job as unknown as Record<string, unknown>).mfhQuotedPrice ? (
                <span className="text-[10px] font-bold text-amber-600 font-mono">
                  {`$${parseFloat(String((job as unknown as Record<string, unknown>).mfhQuotedPrice)).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                </span>
              ) : (
                <span className="text-[10px] text-amber-400">{jobWorkflow === "mh_production" ? "Builder & model" : "Set pricing"}</span>
              )}
            </button>
          ) : (
            <button
              onClick={() => setMfhPanelOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-muted/40 transition-colors text-xs font-medium text-muted-foreground w-full">
              <Home className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span className="flex-1 text-left">Manufactured Home</span>
              <span className="text-[10px] text-muted-foreground">{jobWorkflow === "mh_production" ? "Builder & model" : "Apply pricing"}</span>
            </button>
          )
        )}

        {/* Service Billing worksheet — MH Service only */}
        {jobWorkflow === "mh_service" && (
          <button
            onClick={() => setServiceBillingOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100/80 transition-colors text-xs font-medium text-blue-700 w-full">
            <Wrench className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
            <span className="flex-1 text-left">Service Billing</span>
            {job.serviceBilling ? (
              <span className="text-[10px] font-bold text-blue-600 font-mono">
                {(() => {
                  const sb = job.serviceBilling;
                  const snap = sb.rateSnapshot;
                  const rr = sb.techCount === 1 ? (snap?.repairRate1Tech ?? 0) : (snap?.repairRate2Tech ?? 0);
                  const dr = sb.techCount === 1 ? (snap?.driveRate1Tech ?? 0) : (snap?.driveRate2Tech ?? 0);
                  const total = (sb.repairHours || 0) * rr + (sb.driveHours || 0) * dr
                    + (sb.mileage || 0) * (snap?.mileageRate ?? 0)
                    + (sb.parts || []).filter(p => p.reimbursable).reduce((s, p) => s + p.quantity * p.unitCost, 0);
                  return `$${total.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                })()}
              </span>
            ) : (
              <span className="text-[10px] text-blue-400">Build worksheet</span>
            )}
          </button>
        )}

        {/* Labor Summary for MH Production, MH Service, and any job with a linked MFH model */}
        {(jobWorkflow === "mh_production" || jobWorkflow === "mh_service" || (job as unknown as Record<string, unknown>).mfhModelId != null) && (
          <div className="border border-border rounded-xl p-3">
            <LaborSummaryPanel jobId={job.id} compact />
          </div>
        )}

        {/* Checklist — MH Production only */}
        {(jobWorkflow === "mh_production" || !jobWorkflow) && (
        <button
          onClick={() => setChecklistPanelOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-muted/40 transition-colors text-xs font-medium text-muted-foreground w-full">
          <ClipboardList className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          <span className="flex-1 text-left">Checklist</span>
          {checklistSummary ? (
            checklistSummary.overallPercent === 100 ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                {checklistSummary.completedItems}/{checklistSummary.totalItems} · 100%
              </span>
            ) : checklistSummary.overallPercent === 0 ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                {checklistSummary.completedItems}/{checklistSummary.totalItems} · 0%
              </span>
            ) : (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {checklistSummary.completedItems}/{checklistSummary.totalItems} · {checklistSummary.overallPercent}%
              </span>
            )
          ) : (
            <span className="text-[10px] text-muted-foreground">Track progress</span>
          )}
        </button>
        )}

        {/* Business Trips — out-of-town receipt folders */}
        <button
          onClick={() => setTripsPanelOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-muted/40 transition-colors text-xs font-medium text-muted-foreground w-full">
          <Briefcase className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <span className="flex-1 text-left">Business Trips</span>
          <span className="text-[10px] text-muted-foreground">Travel receipts</span>
        </button>

        {/* Job Financials — consolidated P&L, Pay Breakdown, Sub Hours */}
        <button
          onClick={() => { setFinancialsInitialTab("pl"); setFinancialsPanelOpen(true); }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-100/80 transition-colors text-xs font-medium text-amber-700 w-full">
          <BarChart2 className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <span className="flex-1 text-left">Job Financials</span>
          {profitData != null && (profitData.grossInvoiced > 0 || profitData.jobExpenses > 0) ? (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              profitData.netProfit > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
            }`}>
              {profitData.netProfit > 0 ? "+" : ""}{formatCurrency(profitData.netProfit)}
            </span>
          ) : (
            <span className="text-[10px] text-amber-400">P&amp;L · Breakdown · Hours</span>
          )}
        </button>

        {/* Create Invoice — no invoice exists yet. MH Production uses the Production Pricing engine. */}
        {!invoiceSummary && canEdit("invoices") && (
          jobWorkflow === "mh_production" && onApplyProductionPricing ? (
            <button
              onClick={onApplyProductionPricing}
              className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors shadow-sm">
              <Receipt className="w-3.5 h-3.5" /> Apply Production Pricing
            </button>
          ) : onCreateInvoice ? (
            <button
              onClick={onCreateInvoice}
              className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 text-xs font-bold hover:bg-primary/20 transition-colors">
              <Receipt className="w-3.5 h-3.5" /> Create Invoice
            </button>
          ) : null
        )}

        {/* Draft invoice panel — Edit + Accept Invoice actions */}
        {invoiceSummary && invoiceSummary.status === "draft" && canEdit("invoices") && (
          <div className="mt-1 rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-amber-200/60">
              <FileText className="w-3 h-3 text-amber-600 flex-shrink-0" />
              <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">Draft Invoice</span>
              {invoiceSummary.total != null && (
                <span className="ml-auto text-[11px] font-semibold text-amber-700">{formatCurrency(invoiceSummary.total)}</span>
              )}
            </div>
            <div className="flex gap-1.5 p-2">
              <button
                onClick={() => onReviewInvoice(job)}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-700 text-[11px] font-semibold hover:bg-amber-50 transition-colors">
                <FileText className="w-3 h-3" /> Edit
              </button>
              {onAcceptInvoice && (
                <button
                  onClick={() => onAcceptInvoice(job, invoiceSummary)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 transition-colors shadow-sm">
                  <Check className="w-3 h-3" /> Accept Invoice
                </button>
              )}
            </div>
          </div>
        )}

        {/* Re-apply Production Pricing — rebuild the draft from checked items (MH Production) */}
        {invoiceSummary && invoiceSummary.status === "draft" && canEdit("invoices") && jobWorkflow === "mh_production" && onApplyProductionPricing && (
          <button
            onClick={onApplyProductionPricing}
            className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors">
            <Wand2 className="w-3.5 h-3.5" /> Re-apply Production Pricing
          </button>
        )}

        {/* Approved / Sent / Partially Paid / Paid — compact read-only summary */}
        {invoiceSummary && invoiceSummary.status !== "draft" && invoiceSummary.status !== "cancelled" && (
          <div className="mt-1 rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/40">
              <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="text-[11px] font-semibold text-foreground">
                {invoiceSummary.invoiceNumber ?? "—"}
              </span>
              <span className={`ml-1 inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${
                invoiceSummary.status === "paid" ? "bg-emerald-100 text-emerald-700"
                : invoiceSummary.status === "partiallyPaid" ? "bg-emerald-50 text-emerald-600"
                : invoiceSummary.status === "sent" ? "bg-blue-100 text-blue-700"
                : invoiceSummary.status === "approved" ? "bg-indigo-100 text-indigo-700"
                : invoiceSummary.status === "overdue" ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-600"
              }`}>
                {invoiceSummary.status === "partiallyPaid" ? "Partial" : invoiceSummary.status}
              </span>
              {invoiceSummary.total != null && (
                <span className="ml-auto text-[11px] font-semibold text-foreground">{formatCurrency(invoiceSummary.total)}</span>
              )}
            </div>
            {(invoiceSummary as any).acceptedAt && (
              <div className="px-3 py-1 text-[10px] text-muted-foreground">
                Accepted {formatDate((invoiceSummary as any).acceptedAt)}
              </div>
            )}
            {onGoToInvoices && (
              <button
                onClick={onGoToInvoices}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/5 transition-colors border-t border-border/40">
                <Eye className="w-3 h-3" /> View Invoice
              </button>
            )}
          </div>
        )}

        {/* Sent/overdue invoice — legacy view button removed; handled by summary panel above */}

        {/* Worker Pay Due banner — all unpaid subs (fixed/allocation inline; hourly → payroll screen) */}
        {unpaidSubs && unpaidSubs.length > 0 && (() => {
          const hourlySubs    = unpaidSubs.filter(s => s.compensationType === "hourly");
          const fixedAllocSubs = unpaidSubs.filter(s => s.compensationType !== "hourly");
          return (
            <div className="mt-1 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-amber-200/60">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">Worker Pay Due</span>
                <span className="ml-auto text-[10px] font-semibold text-amber-600">{unpaidSubs.length} sub{unpaidSubs.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="divide-y divide-amber-100">
                {/* Fixed / allocation subs — can be settled inline */}
                {fixedAllocSubs.map(sub => {
                  const amt = outstandingAmount(sub);
                  const isAllocationNoData = sub.compensationType === "allocation" && amt === 0;
                  return (
                    <div key={sub.subcontractorId} className="flex items-center gap-2 px-3 py-2">
                      <HardHat className="w-3 h-3 text-amber-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-900 truncate">{sub.subName}</p>
                        <p className="text-[10px] text-amber-700">
                          {sub.compensationType === "allocation"
                            ? isAllocationNoData
                              ? `${sub.allocationPct ?? 0}% allocation — invoice to compute`
                              : `${sub.allocationPct ?? 0}% → ${formatCurrency(amt)}`
                            : formatCurrency(amt)
                          }
                        </p>
                      </div>
                      {canEdit("jobs") && !isAllocationNoData && (
                        <button
                          onClick={() => handleMarkSubPaidInline(sub)}
                          disabled={markingSubId === sub.subcontractorId}
                          className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500 text-white text-[10px] font-bold hover:bg-amber-600 transition-colors disabled:opacity-50">
                          {markingSubId === sub.subcontractorId
                            ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                            : <Check className="w-3 h-3" />
                          }
                          Mark Paid
                        </button>
                      )}
                      {canEdit("jobs") && isAllocationNoData && (
                        <button
                          onClick={() => { setFinancialsInitialTab("breakdown"); setFinancialsPanelOpen(true); }}
                          className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-bold hover:bg-amber-200 transition-colors border border-amber-300">
                          <PieChart className="w-3 h-3" />
                          Pay Breakdown
                        </button>
                      )}
                    </div>
                  );
                })}
                {/* Hourly subs with pending hours / accrued bonus — must use payroll screen */}
                {hourlySubs.map(sub => {
                  const hrs   = sub.totalHours ?? 0;
                  const bonus = sub.accruedBonus ?? 0;
                  const detail = [
                    hrs > 0   ? `${hrs.toFixed(1)} hrs` : "",
                    bonus > 0 ? `+${formatCurrency(bonus)} bonus` : "",
                  ].filter(Boolean).join(" · ") || "Hours pending";
                  return (
                    <div key={sub.subcontractorId} className="flex items-center gap-2 px-3 py-2">
                      <Timer className="w-3 h-3 text-amber-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-900 truncate">{sub.subName}</p>
                        <p className="text-[10px] text-amber-700">{detail}</p>
                      </div>
                      <Link
                        href={`/jobs/${job.id}/payroll`}
                        className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500 text-white text-[10px] font-bold hover:bg-amber-600 transition-colors">
                        <ArrowRight className="w-3 h-3" />
                        Payroll
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Mark Completed — for scheduled jobs with no invoice yet */}
        {!isCompleted && canEdit("jobs") && (
          <button
            onClick={() => onMarkCompleted(job)}
            className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold hover:bg-emerald-100 transition-colors">
            <CheckCircle className="w-3.5 h-3.5" /> Mark Completed
          </button>
        )}
        {/* Sub paid status badge — now computed from payment records */}
        {hasSubExpenses && localSubPaid && (
          <div className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <HardHat className="w-3.5 h-3.5" /> All Subs Paid ✓
          </div>
        )}
        {/* Close Job — all three criteria must be met: completed + invoice paid + subs settled (live-verified by parent) */}
        {isCompleted && inv?.status === "paid" && subsSettled === true && canEdit("jobs") && onArchiveJob && (
          <button
            onClick={() => onArchiveJob(job)}
            className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-50 text-slate-600 border border-slate-200 text-xs font-bold hover:bg-slate-100 transition-colors">
            <Archive className="w-3.5 h-3.5" /> Close Job
          </button>
        )}
      </Card>

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
      {financialsPanelOpen && (
        <JobFinancialsPanel job={job} profitData={profitData} initialTab={financialsInitialTab} onClose={() => setFinancialsPanelOpen(false)} onSubsPaidChanged={setLocalSubPaid} />
      )}
      {phasesPanelOpen && (
        <JobPhasePanel job={job} onClose={() => setPhasesPanelOpen(false)} />
      )}
      {checklistPanelOpen && (
        <JobChecklistPanel job={job} onClose={() => {
          setChecklistPanelOpen(false);
          qc.invalidateQueries({ queryKey: ["checklist-summaries"] });
        }} />
      )}
      {mfhPanelOpen && (
        <MfhPanel
          job={job as Parameters<typeof MfhPanel>[0]["job"]}
          onClose={() => {
            setMfhPanelOpen(false);
            qc.invalidateQueries({ queryKey: ["/api/jobs"] });
            qc.invalidateQueries({ queryKey: ["checklist-summaries"] });
          }}
          onViewEstimates={() => {
            setEstimatesPanelOpen(true);
          }}
        />
      )}
      {serviceBillingOpen && (
        <ServiceBillingPanel
          job={job as Parameters<typeof ServiceBillingPanel>[0]["job"]}
          onClose={() => {
            setServiceBillingOpen(false);
            qc.invalidateQueries({ queryKey: ["/api/jobs"] });
          }}
        />
      )}
      {tripsPanelOpen && (
        <JobTripsPanel job={job} onClose={() => setTripsPanelOpen(false)} />
      )}
    </>
  );
}

// ─── Home Model autocomplete input ─────────────────────────────────────────────
const COMMON_HOME_MODELS = [
  "Clayton 16x80", "Clayton 14x66", "Clayton 14x76", "Clayton 16x72",
  "Fleetwood 14x66", "Fleetwood 16x80", "Fleetwood 14x56",
  "Skyline 16x80", "Skyline 14x76",
  "Champion 14x66", "Champion 16x80",
  "Cavco 16x80", "Palm Harbor 16x80",
  "Commodore 16x80",
];

function HomeModelInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${BASE}/api/jobs/distinct-home-models`)
      .then(r => r.json())
      .then((data: string[]) => {
        const combined = Array.from(new Set([...data, ...COMMON_HOME_MODELS])).sort();
        setSuggestions(combined);
      })
      .catch(() => setSuggestions(COMMON_HOME_MODELS));
  }, []);

  const filtered = value.trim()
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s !== value)
    : suggestions;

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-foreground mb-1">
        <span className="text-amber-500 font-bold text-xs mr-1">🏠</span>Home Model
        <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
      </label>
      <input
        ref={inputRef}
        type="text"
        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="e.g. Clayton 16x80, Fleetwood 14x66…"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {filtered.slice(0, 12).map(s => (
            <button
              key={s}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors first:rounded-t-xl last:rounded-b-xl"
              onMouseDown={() => { onChange(s); setOpen(false); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
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
  const { toast } = useToast();

  function makeForm() {
    if (editJob) {
      return {
        title: editJob.title,
        clientId: String(editJob.clientId ?? ""),
        status: displayStatus(editJob.status),
        jobType: editJob.jobType ?? "",
        homeModel: editJob.homeModel ?? "",
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
      jobType: "", homeModel: "", address: "",
      locationName: "", city: "", state: "KY",
      startDate: "", endDate: "", notes: "",
      businessLine: activeBusiness?.slug ?? "",
      sqFt: "",
      coats: "1",
    };
  }

  const [form, setFormState] = useState(makeForm);
  const [subIds, setSubIds]   = useState<number[]>(editJob?.subcontractorIds ?? []);
  const [subCompDefaults, setSubCompDefaults] = useState<Record<number, { compensationType: string; rate: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Scroll the validation error / offending field into view on failed submit
  // (on mobile the keyboard can push them off-screen).
  const formScrollRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(
    editJob?.workflow ?? null
  );

  // MFH structured fields (separate from form string state)
  const [mfhMfgId, setMfhMfgId] = useState<number | null>((editJob as unknown as Record<string, unknown>)?.mfhManufacturerId as number | null ?? null);
  const [mfhModelId, setMfhModelId] = useState<number | null>((editJob as unknown as Record<string, unknown>)?.mfhModelId as number | null ?? null);
  const [mfhYear, setMfhYear] = useState<string>((editJob as unknown as Record<string, unknown>)?.mfhModelYear ? String((editJob as unknown as Record<string, unknown>).mfhModelYear) : "");
  const { data: mfhMfgs = [] } = useListMfhManufacturers();
  const { data: mfhPanelData } = useMfhPanelData(mfhMfgId);
  const mfhModels = mfhPanelData?.models ?? [];
  const { data: constructionTypes = [] } = useListMfhConstructionTypes();
  // Fetch all (incl. inactive) so archived/service items already checked on an
  // existing job still resolve; display filtering happens below.
  const { data: productionServiceTypes = [] } = useListProductionServiceTypes(activeBusiness?.id, true);
  const createMfhManufacturer = useCreateMfhManufacturer();
  const updateMfhManufacturer = useUpdateMfhManufacturer();
  const createMfhModel = useCreateMfhModel();
  const createProductionServiceType = useCreateProductionServiceType();
  const updateProductionServiceType = useUpdateProductionServiceType();
  const deleteProductionServiceType = useDeleteProductionServiceType();

  // MH Production: job-level construction type + services included
  const [mfhConstructionType, setMfhConstructionType] = useState<string>(
    (editJob as unknown as Record<string, unknown>)?.mfhConstructionType as string ?? ""
  );
  const [mhProductionServices, setMhProductionServices] = useState<number[]>(
    (editJob as unknown as Record<string, unknown>)?.mhProductionServices as number[] ?? []
  );
  const [showAddService, setShowAddService] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  // Inline service-type management (rename / re-categorize / archive)
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [editServiceName, setEditServiceName] = useState("");
  const [editServiceAppliesTo, setEditServiceAppliesTo] = useState<"production" | "service">("production");
  const [serviceEditBusy, setServiceEditBusy] = useState(false);

  // Production jobs only list production services; keep archived/service items
  // visible when the job already has them checked so old data stays intact.
  const visibleServiceTypes = productionServiceTypes.filter(svc =>
    (svc.active && svc.appliesTo !== "service") || mhProductionServices.includes(svc.id)
  );

  // Combobox state for builder/model
  const [builderQuery, setBuilderQuery] = useState<string>("");
  const [builderDropOpen, setBuilderDropOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState<string>("");
  const [modelDropOpen, setModelDropOpen] = useState(false);

  const builderFiltered = mfhMfgs.filter(m => m.name.toLowerCase().includes(builderQuery.toLowerCase()));
  const showBuilderCreate = builderQuery.trim().length > 0 &&
    !mfhMfgs.some(m => m.name.toLowerCase() === builderQuery.trim().toLowerCase());
  const modelFiltered = mfhModels.filter(m => m.name.toLowerCase().includes(modelQuery.toLowerCase()));
  const showModelCreate = modelQuery.trim().length > 0 &&
    !mfhModels.some(m => m.name.toLowerCase() === modelQuery.trim().toLowerCase());

  // Sync combobox text from loaded data (edit mode, or after mutation).
  // `open` is in deps so reopening the same job (same mfhMfgId) still re-fires
  // after the reset effect clears builderQuery.
  useEffect(() => {
    if (!open) return;
    if (mfhMfgId && mfhMfgs.length > 0) {
      const name = mfhMfgs.find(m => m.id === mfhMfgId)?.name ?? "";
      setBuilderQuery(name);
    }
  }, [mfhMfgId, mfhMfgs.length, open]);
  useEffect(() => {
    if (!open) return;
    if (mfhModelId && mfhModels.length > 0) {
      const m = mfhModels.find(m => m.id === mfhModelId);
      if (m) {
        setModelQuery(m.name);
        if (m.constructionTypeName && !mfhConstructionType) setMfhConstructionType(m.constructionTypeName);
      }
    }
  }, [mfhModelId, mfhModels.length, open]);

  async function handleCreateModel(name: string, ctId: number, ctName: string) {
    if (!mfhMfgId) return;
    const created = await createMfhModel.mutateAsync({ manufacturerId: mfhMfgId, name, constructionTypeId: ctId });
    setMfhModelId(created.id);
    setModelQuery(name);
    setMfhConstructionType(ctName);
    setModelDropOpen(false);
  }

  async function handleAddService() {
    if (!newServiceName.trim()) return;
    const created = await createProductionServiceType.mutateAsync({ name: newServiceName.trim(), appliesTo: "production", businessId: activeBusiness?.id ?? null });
    setMhProductionServices(prev => [...prev, created.id]);
    setNewServiceName("");
    setShowAddService(false);
  }

  function startEditService(svc: { id: number; name: string; appliesTo: string }) {
    setEditingServiceId(svc.id);
    setEditServiceName(svc.name);
    setEditServiceAppliesTo(svc.appliesTo === "service" ? "service" : "production");
  }

  async function saveServiceEdit() {
    if (editingServiceId == null || !editServiceName.trim()) return;
    setServiceEditBusy(true);
    try {
      await updateProductionServiceType.mutateAsync({
        id: editingServiceId,
        name: editServiceName.trim(),
        appliesTo: editServiceAppliesTo,
      });
      // Re-categorized to service → it no longer belongs on this production job
      if (editServiceAppliesTo === "service") {
        setMhProductionServices(prev => prev.filter(id => id !== editingServiceId));
      }
      setEditingServiceId(null);
    } catch {
      toast({ title: "Could not save service", description: "Please try again.", variant: "destructive" });
    } finally {
      setServiceEditBusy(false);
    }
  }

  async function archiveService(id: number) {
    setServiceEditBusy(true);
    try {
      await deleteProductionServiceType.mutateAsync(id);
      setMhProductionServices(prev => prev.filter(sid => sid !== id));
      setEditingServiceId(null);
    } catch {
      toast({ title: "Could not archive service", description: "Please try again.", variant: "destructive" });
    } finally {
      setServiceEditBusy(false);
    }
  }

  const [clearHoursForSubIds, setClearHoursForSubIds] = useState<number[]>([]);
  const [removeSubPrompt, setRemoveSubPrompt] = useState<{ subId: number; subName: string; pendingIds: number[] } | null>(null);

  // Man-hours calculator state
  const [manHoursExpanded, setManHoursExpanded] = useState(
    (editJob as unknown as Record<string, unknown>)?.manHours != null
  );
  const [manHoursWorkers, setManHoursWorkers] = useState("0");
  const [manHoursDays, setManHoursDays] = useState("0");
  const [manHoursHrsPerDay, setManHoursHrsPerDay] = useState("0");
  const [manHoursTotal, setManHoursTotal] = useState(
    (editJob as unknown as Record<string, unknown>)?.manHours != null
      ? String(parseFloat(String((editJob as unknown as Record<string, unknown>).manHours)))
      : ""
  );

  function recalcManHours(workers: string, days: string, hrs: string) {
    const w = parseFloat(workers);
    const d = parseFloat(days);
    const h = parseFloat(hrs);
    if (!isNaN(w) && !isNaN(d) && !isNaN(h) && w > 0 && d > 0 && h > 0) {
      setManHoursTotal(String(Math.round(w * d * h * 100) / 100));
    }
  }

  useEffect(() => {
    setClearHoursForSubIds([]);
    setRemoveSubPrompt(null);
    setSelectedWorkflow(editJob?.workflow ?? null);
    const existing = (editJob as unknown as Record<string, unknown>)?.manHours;
    setManHoursTotal(existing != null ? String(parseFloat(String(existing))) : "");
    setManHoursExpanded(existing != null);
    setManHoursWorkers("0");
    setManHoursDays("0");
    setManHoursHrsPerDay("0");
    setMfhMfgId((editJob as unknown as Record<string, unknown>)?.mfhManufacturerId as number | null ?? null);
    setMfhModelId((editJob as unknown as Record<string, unknown>)?.mfhModelId as number | null ?? null);
    setMfhYear((editJob as unknown as Record<string, unknown>)?.mfhModelYear ? String((editJob as unknown as Record<string, unknown>).mfhModelYear) : "");
    setMfhConstructionType((editJob as unknown as Record<string, unknown>)?.mfhConstructionType as string ?? "");
    setMhProductionServices((editJob as unknown as Record<string, unknown>)?.mhProductionServices as number[] ?? []);
    setBuilderQuery("");
    setModelQuery("");
    setShowAddService(false);
    setNewServiceName("");
  }, [open, editJob?.id]);

  // Pre-populate compensation types/rates when opening an existing job for edit
  useEffect(() => {
    if (!open || !editJob?.id) {
      setSubCompDefaults({});
      return;
    }
    fetch(`${BASE}/api/jobs/${editJob.id}/sub-payments`, { credentials: "include" })
      .then(r => r.json())
      .then((rows: Array<{ subcontractorId: number; compensationType: string; hourlyRate: number | null; fixedAmount: number | null; allocationPct: number | null }>) => {
        if (!Array.isArray(rows)) return;
        const defaults: Record<number, { compensationType: string; rate: string }> = {};
        for (const row of rows) {
          const ct = row.compensationType ?? "hourly";
          const rate =
            ct === "hourly"     ? (row.hourlyRate   != null ? String(row.hourlyRate)   : "")
            : ct === "fixed"    ? (row.fixedAmount  != null ? String(row.fixedAmount)  : "")
            : ct === "allocation" ? (row.allocationPct != null ? String(row.allocationPct) : "")
            : "";
          defaults[row.subcontractorId] = { compensationType: ct, rate };
        }
        setSubCompDefaults(defaults);
      })
      .catch(() => {});
  }, [open, editJob?.id]);

  function setField(k: string, v: string) {
    setFormState(f => ({ ...f, [k]: v }));
  }

  function showFormError(msg: string) {
    setError(msg);
    formScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      showFormError("Title is required");
      titleInputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload: CreateJobRequest = {
        title: form.title.trim(),
        clientId: form.clientId ? parseInt(form.clientId) : undefined,
        subcontractorIds: subIds,
        status: form.status as CreateJobRequest["status"],
        jobType: selectedWorkflow === "mh_production" ? undefined : (form.jobType || undefined),
        homeModel: form.homeModel || undefined,
        mfhManufacturerId: mfhMfgId,
        mfhModelId: mfhModelId,
        mfhModelYear: mfhYear ? parseInt(mfhYear) : null,
        mfhConstructionType: selectedWorkflow === "mh_production" ? (mfhConstructionType || null) : null,
        mhProductionServices: selectedWorkflow === "mh_production" ? mhProductionServices : null,
        address: form.address || undefined,
        locationName: form.locationName || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        notes: form.notes || undefined,
        businessLine: form.businessLine || undefined,
        workflow: selectedWorkflow || undefined,
        sqFt: form.businessLine === "asphalt_sealing" && form.sqFt !== "" ? parseInt(form.sqFt) : undefined,
        coats: form.businessLine === "asphalt_sealing" && form.coats !== "" ? parseInt(form.coats) : undefined,
        manHours: manHoursTotal !== "" ? parseFloat(manHoursTotal) : null,
      };
      if (editJob) {
        await updateJob.mutateAsync({ id: editJob.id, data: payload });
        const idsToClear = [...new Set(clearHoursForSubIds.filter(id => !subIds.includes(id)))];
        if (idsToClear.length > 0) {
          const delRes = await fetch(`${BASE}/api/jobs/${editJob.id}/sub-hours`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subIds: idsToClear }),
          }).catch(() => null);
          if (!delRes || !delRes.ok) {
            toast({ title: "Hours could not be removed", description: "Job was saved, but the hour records were not deleted. Try removing them manually.", variant: "destructive" });
          }
        }
        // Apply per-sub compensation defaults if set
        const compEntries = Object.entries(subCompDefaults);
        if (compEntries.length > 0) {
          await Promise.all(compEntries.map(([sid, comp]) => {
            const body: Record<string, unknown> = { compensationType: comp.compensationType };
            if (comp.compensationType === "hourly" && comp.rate.trim()) body.hourlyRate = parseFloat(comp.rate);
            else if (comp.compensationType === "fixed" && comp.rate.trim()) body.fixedAmount = parseFloat(comp.rate);
            else if (comp.compensationType === "allocation" && comp.rate.trim()) body.allocationPct = parseFloat(comp.rate);
            return fetch(`${BASE}/api/jobs/${editJob.id}/sub-payments/${sid}`, {
              method: "PUT", credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
          }));
        }
      } else {
        const newJob = await createJob.mutateAsync({ data: payload });
        const compEntries = Object.entries(subCompDefaults);
        if (compEntries.length > 0 && newJob?.id) {
          await Promise.all(compEntries.map(([sid, comp]) => {
            const body: Record<string, unknown> = { compensationType: comp.compensationType };
            if (comp.compensationType === "hourly" && comp.rate.trim()) body.hourlyRate = parseFloat(comp.rate);
            else if (comp.compensationType === "fixed" && comp.rate.trim()) body.fixedAmount = parseFloat(comp.rate);
            else if (comp.compensationType === "allocation" && comp.rate.trim()) body.allocationPct = parseFloat(comp.rate);
            return fetch(`${BASE}/api/jobs/${newJob.id}/sub-payments/${sid}`, {
              method: "PUT", credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
          }));
        }
      }
      onSaved();
      onOpenChange(false);
    } catch {
      showFormError("Failed to save job. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const isCreate = !editJob;
  const isAsphalt = form.businessLine === "asphalt_sealing" || activeBusiness?.slug === "asphalt_sealing";
  const showWorkflowPicker = isCreate && !isAsphalt && !selectedWorkflow;

  if (showWorkflowPicker) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
        <div className="relative w-full bg-card border border-border shadow-2xl flex flex-col rounded-t-2xl sm:rounded-2xl sm:max-w-sm mx-auto">
          <div className="h-1 bg-gradient-to-r from-amber-500 to-amber-400 flex-shrink-0 rounded-t-2xl" />
          <div className="flex items-center justify-between px-6 pt-5 pb-3 flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold text-foreground">New Job</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Choose the type of work</p>
            </div>
            <button type="button" onClick={() => onOpenChange(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-6 pb-6 space-y-2">
            {[
              { key: "mh_production",      emoji: "🏠", label: "MH Production",      desc: "Trim out, plumbing hookup, flooring, underpinning" },
              { key: "mh_service",          emoji: "🔧", label: "MH Service",          desc: "Warranty repair, service call, callback, inspection" },
              { key: "general_contracting", emoji: "🏡", label: "General Contracting", desc: "Kitchen, deck, siding, roofing, remodel, addition" },
            ].map(w => (
              <button key={w.key} type="button"
                onClick={() => setSelectedWorkflow(w.key)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-border hover:border-amber-400 hover:bg-amber-50/60 transition-all text-left group">
                <span className="text-2xl leading-none">{w.emoji}</span>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-foreground group-hover:text-amber-700">{w.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{w.desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-amber-500 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className={`relative w-full bg-card border border-border shadow-2xl flex flex-col max-h-[90dvh] sm:max-h-[90vh] ${
        isCreate
          ? "rounded-t-2xl sm:rounded-2xl sm:max-w-sm"
          : "rounded-t-2xl sm:rounded-2xl sm:max-w-lg"
      }`}>
        <div className="h-1 bg-gradient-to-r from-amber-500 to-amber-400 flex-shrink-0 rounded-t-2xl" />
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-foreground">{editJob ? "Edit Job" : "New Job"}</h2>
              {selectedWorkflow && (selectedWorkflow in JOB_WORKFLOWS) && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${JOB_WORKFLOWS[selectedWorkflow as WorkflowKey].color}`}>
                  {JOB_WORKFLOWS[selectedWorkflow as WorkflowKey].emoji} {JOB_WORKFLOWS[selectedWorkflow as WorkflowKey].label}
                  {!editJob && (
                    <button type="button" onClick={() => setSelectedWorkflow(null)}
                      className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </span>
              )}
            </div>
            <button type="button" onClick={() => onOpenChange(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div ref={formScrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 space-y-4 pb-2">

          {error && (
            <div className="px-4 py-2.5 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive flex items-center gap-2">
              <X className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Job Title *</label>
            <input type="text" autoFocus={isCreate} ref={titleInputRef}
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

          {selectedWorkflow === "mh_production" && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              <ListChecks className="w-3.5 h-3.5 inline mr-1 text-amber-500" />Services Included
            </label>
            <div className="rounded-xl border border-border p-3 space-y-2">
              {visibleServiceTypes.length === 0 && !showAddService && (
                <p className="text-xs text-muted-foreground">
                  No service types yet — click <span className="font-semibold text-amber-600">+ Add Service</span> to create your first one.
                </p>
              )}
              {visibleServiceTypes.map(svc => {
                const isChecked = mhProductionServices.includes(svc.id);
                if (editingServiceId === svc.id) {
                  return (
                    <div key={svc.id} className="rounded-lg border border-amber-300 bg-amber-50/50 p-2 space-y-2">
                      <input
                        type="text" autoFocus
                        className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={editServiceName}
                        onChange={e => setEditServiceName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveServiceEdit(); } if (e.key === "Escape") setEditingServiceId(null); }}
                      />
                      <div className="flex gap-1.5">
                        {(["production", "service"] as const).map(opt => (
                          <button key={opt} type="button" onClick={() => setEditServiceAppliesTo(opt)}
                            className={`flex-1 px-2 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${
                              editServiceAppliesTo === opt
                                ? "bg-amber-500 border-amber-500 text-white"
                                : "bg-background border-border text-muted-foreground hover:border-amber-300"
                            }`}>
                            {opt === "production" ? "Production" : "Service only"}
                          </button>
                        ))}
                      </div>
                      {editServiceAppliesTo === "service" && (
                        <p className="text-[11px] text-amber-700">Service-only items are hidden from production job lists.</p>
                      )}
                      <div className="flex gap-1.5">
                        <button type="button" onClick={saveServiceEdit} disabled={serviceEditBusy || !editServiceName.trim()}
                          className="flex-1 px-2 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold disabled:opacity-50 hover:bg-amber-600 transition-colors">Save</button>
                        <button type="button" onClick={() => setEditingServiceId(null)} disabled={serviceEditBusy}
                          className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted/50">Cancel</button>
                        {svc.active && (
                          <button type="button" onClick={() => archiveService(svc.id)} disabled={serviceEditBusy}
                            title="Archive — hides this service from lists; existing jobs keep their history"
                            className="px-2.5 py-1.5 rounded-lg border border-red-200 text-xs text-red-600 hover:bg-red-50 flex items-center gap-1">
                            <Archive className="w-3 h-3" /> Archive
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={svc.id} className="flex items-center gap-2.5 group">
                    <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                      <input type="checkbox" className="rounded accent-amber-500"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) setMhProductionServices(prev => prev.filter(id => id !== svc.id));
                          else setMhProductionServices(prev => [...prev, svc.id]);
                        }}
                      />
                      <span className={`text-sm transition-colors truncate ${!svc.active ? "text-muted-foreground line-through" : "text-foreground group-hover:text-amber-700"}`}>
                        {svc.name}
                      </span>
                      {!svc.active && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground flex-shrink-0">archived</span>}
                      {svc.active && svc.appliesTo === "service" && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground flex-shrink-0">service</span>}
                    </label>
                    <button type="button" onClick={() => startEditService(svc)}
                      title="Edit service"
                      className="p-1 rounded-md text-muted-foreground/50 hover:text-amber-600 hover:bg-amber-50 transition-colors flex-shrink-0">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              {showAddService ? (
                <div className="flex gap-2 pt-1.5 border-t border-border">
                  <input
                    type="text" autoFocus
                    className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="New service name…"
                    value={newServiceName}
                    onChange={e => setNewServiceName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddService(); } if (e.key === "Escape") { setShowAddService(false); setNewServiceName(""); } }}
                  />
                  <button type="button" onClick={handleAddService} disabled={!newServiceName.trim()}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold disabled:opacity-50 hover:bg-amber-600 transition-colors">Add</button>
                  <button type="button" onClick={() => { setShowAddService(false); setNewServiceName(""); }}
                    className="px-2 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted/50"><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowAddService(true)}
                  className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 transition-colors pt-0.5">
                  <Plus className="w-3 h-3" /> Add Service
                </button>
              )}
            </div>
          </div>
          )}

          {(editJob || selectedWorkflow) && form.businessLine !== "asphalt_sealing" && selectedWorkflow !== "mh_production" && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              <Briefcase className="w-3 h-3 inline mr-1 text-amber-500" />Job Type
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={form.jobType} onChange={e => setField("jobType", e.target.value)}>
              <option value="">Select type…</option>
              {selectedWorkflow === "mh_service" && (<>
                <option value="Warranty Repair">Warranty Repair</option>
                <option value="Service Call">Service Call</option>
                <option value="Callback">Callback</option>
                <option value="Inspection">Inspection</option>
                <option value="Dealer Punch List">Dealer Punch List</option>
              </>)}
              {(selectedWorkflow === "general_contracting" || form.businessLine === "general_contracting") && (<>
                <option value="Kitchen Remodel">Kitchen Remodel</option>
                <option value="Bathroom Remodel">Bathroom Remodel</option>
                <option value="Deck">Deck</option>
                <option value="Siding">Siding</option>
                <option value="Roofing">Roofing</option>
                <option value="Window/Door">Window/Door</option>
                <option value="Addition">Addition</option>
                <option value="Repair">Repair</option>
                <option value="Other">Other</option>
              </>)}
              {(!selectedWorkflow && form.businessLine !== "general_contracting") && (<>
                <option value="Trim Out">Trim Out</option>
                <option value="Plumbing Hookup">Plumbing Hookup</option>
                <option value="Marriage Line">Marriage Line</option>
                <option value="Flooring">Flooring</option>
                <option value="Underpinning">Underpinning</option>
                <option value="Complete Finish">Complete Finish</option>
                <option value="Warranty Completion">Warranty Completion</option>
              </>)}
            </select>
          </div>
          )}

          {/* Manufactured Home structured fields — MH Production and MH Service only */}
          {(selectedWorkflow === "mh_production" || selectedWorkflow === "mh_service" || (!selectedWorkflow && form.businessLine !== "general_contracting" && form.businessLine !== "asphalt_sealing")) && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              <span className="text-amber-500 font-bold text-xs mr-1">🏠</span>Manufactured Home
              <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <label className="block text-xs text-muted-foreground mb-1">Builder</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Search or type to add…"
                  value={builderQuery}
                  onChange={e => {
                    setBuilderQuery(e.target.value);
                    setBuilderDropOpen(true);
                    if (!e.target.value) { setMfhMfgId(null); setMfhModelId(null); setModelQuery(""); }
                  }}
                  onFocus={() => setBuilderDropOpen(true)}
                  onBlur={() => setTimeout(() => setBuilderDropOpen(false), 150)}
                />
                {builderDropOpen && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-44 overflow-y-auto">
                    {builderFiltered.map(m => (
                      <button key={m.id} type="button"
                        onMouseDown={e => { e.preventDefault(); setMfhMfgId(m.id); setBuilderQuery(m.name); setMfhModelId(null); setModelQuery(""); setBuilderDropOpen(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
                        {m.name}
                      </button>
                    ))}
                    {showBuilderCreate && (
                      <button type="button"
                        onMouseDown={async e => {
                          e.preventDefault();
                          try {
                            const c = await createMfhManufacturer.mutateAsync({ name: builderQuery.trim() });
                            setMfhMfgId(c.id);
                            setBuilderQuery(builderQuery.trim());
                            setBuilderDropOpen(false);
                          } catch (err: unknown) {
                            const msg = err instanceof Error ? err.message : "Failed to add builder";
                            // 409 = builder already exists (possibly inactive) — find it and select it silently
                            if (msg.includes("already exists")) {
                              try {
                                const all = await fetch(`${BASE}/api/mfh/manufacturers?includeInactive=true`).then(r => r.json()) as Array<{ id: number; name: string; active: boolean }>;
                                const match = all.find(m => m.name.toLowerCase() === builderQuery.trim().toLowerCase());
                                if (match) {
                                  if (!match.active) {
                                    await updateMfhManufacturer.mutateAsync({ id: match.id, active: true });
                                  }
                                  setMfhMfgId(match.id);
                                  setBuilderQuery(match.name);
                                  setMfhModelId(null);
                                  setModelQuery("");
                                  setBuilderDropOpen(false);
                                  return;
                                }
                              } catch {
                                // fall through to error toast
                              }
                            }
                            toast({ title: "Could not add builder", description: msg, variant: "destructive" });
                          }
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-amber-600 hover:bg-amber-50 border-t border-border font-medium flex items-center gap-1.5">
                        <Plus className="w-3 h-3" /> Add "{builderQuery.trim()}"
                      </button>
                    )}
                    {builderFiltered.length === 0 && !showBuilderCreate && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No builders found</p>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">Who built the home — e.g. Southern, Giles, Norris</p>
              </div>
              <div className="relative">
                <label className="block text-xs text-muted-foreground mb-1">Model</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder={mfhMfgId ? "Search or type to add…" : "Select builder first"}
                  disabled={!mfhMfgId}
                  value={modelQuery}
                  onChange={e => { setModelQuery(e.target.value); setModelDropOpen(true); if (!e.target.value) setMfhModelId(null); }}
                  onFocus={() => { if (mfhMfgId) setModelDropOpen(true); }}
                  onBlur={() => setTimeout(() => setModelDropOpen(false), 150)}
                />
                {modelDropOpen && mfhMfgId && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {modelFiltered.map(m => (
                      <button key={m.id} type="button"
                        onMouseDown={e => { e.preventDefault(); setMfhModelId(m.id); setModelQuery(m.name); if (m.constructionTypeName) setMfhConstructionType(m.constructionTypeName); setModelDropOpen(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center justify-between">
                        <span>{m.name}</span>
                        {m.constructionTypeName && <span className="text-[10px] text-muted-foreground ml-2">{m.constructionTypeName}</span>}
                      </button>
                    ))}
                    {showModelCreate && (
                      <div className="border-t border-border p-2.5 space-y-2">
                        <p className="text-xs font-semibold text-amber-600 flex items-center gap-1.5"><Plus className="w-3 h-3" /> Add "{modelQuery.trim()}"</p>
                        <p className="text-[10px] text-muted-foreground">Pick construction type:</p>
                        <div className="flex gap-1 flex-wrap">
                          {constructionTypes.map(ct => (
                            <button key={ct.id} type="button"
                              onMouseDown={e => { e.preventDefault(); handleCreateModel(modelQuery.trim(), ct.id, ct.name); }}
                              className="px-2.5 py-1 rounded-lg border border-amber-200 text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors">
                              {ct.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {modelFiltered.length === 0 && !showModelCreate && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No models — type to add one</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Model Year</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="e.g. 2022"
                  value={mfhYear}
                  min={1950}
                  max={new Date().getFullYear() + 1}
                  onChange={e => setMfhYear(e.target.value)} />
              </div>
              {selectedWorkflow === "mh_production" ? (
                (() => {
                  const ctUp = (mfhConstructionType ?? "").toUpperCase();
                  const isLegacy = ["VOG", "HYBRID", "DRYWALL"].includes(ctUp);
                  const activePl = isLegacy ? "FIELD" : (ctUp.startsWith("FIELD_") ? "FIELD" : ctUp.startsWith("LOT_") ? "LOT" : ctUp === "FIELD" || ctUp === "LOT" ? ctUp : "");
                  const activeCt = isLegacy ? ctUp : (ctUp.includes("_") ? ctUp.split("_").slice(1).join("_") : "");
                  const btnCls = (active: boolean) =>
                    `flex-1 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${active ? "bg-amber-500 border-amber-500 text-white" : "border-border text-muted-foreground hover:border-amber-300 hover:text-amber-600"}`;
                  return (
                    <div className="space-y-1.5">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Placement</label>
                        <div className="flex gap-1">
                          {(["Field", "Lot Model"] as const).map(pl => {
                            const token = pl === "Field" ? "FIELD" : "LOT";
                            return (
                              <button key={pl} type="button"
                                onClick={() => {
                                  if (activeCt) setMfhConstructionType(`${token}_${activeCt}`);
                                  else setMfhConstructionType(activePl === token ? "" : token);
                                }}
                                className={btnCls(activePl === token)}>
                                {pl}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Construction</label>
                        <div className="flex gap-1">
                          {(["VOG", "Hybrid", "Drywall"] as const).map(ct => (
                            <button key={ct} type="button"
                              onClick={() => {
                                const p = activePl || "FIELD";
                                setMfhConstructionType(`${p}_${ct.toUpperCase()}`);
                              }}
                              className={btnCls(activeCt === ct.toUpperCase())}>
                              {ct}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : mfhModelId ? (
                <div className="flex items-end pb-0.5">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Construction</label>
                    <span className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-muted/50 text-xs text-muted-foreground border border-border">
                      {mfhModels.find(m => m.id === mfhModelId)?.constructionTypeName ?? "—"}
                      <span className="text-[10px] opacity-60 font-mono">(auto)</span>
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
            {!mfhMfgId && (
              <p className="text-xs text-muted-foreground">Pricing &amp; checklists are applied from the <strong>Manufactured Home</strong> panel on the job card.</p>
            )}
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

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              <HardHat className="w-3 h-3 inline mr-1" />Subcontractors
            </label>
            <SubcontractorPicker
              subcontractors={subcontractors}
              selected={subIds}
              onChange={(newIds) => {
                if (editJob) {
                  const removed = subIds.filter(id => !newIds.includes(id));
                  if (removed.length > 0) {
                    const removedSub = subcontractors.find(s => s.id === removed[0]);
                    if (removedSub) {
                      setRemoveSubPrompt({ subId: removedSub.id, subName: removedSub.name, pendingIds: newIds });
                      return;
                    }
                  }
                }
                setSubIds(newIds);
              }}
            />
            {subIds.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Compensation per sub</p>
                {(() => {
                  const allocSids = subIds.filter(id => (subCompDefaults[id]?.compensationType ?? "hourly") === "allocation");
                  const totalAllocPct = allocSids.reduce((s, id) => s + (parseFloat(subCompDefaults[id]?.rate || "0") || 0), 0);
                  const remainingPct = Math.max(0, 100 - totalAllocPct);
                  return (<>
                    {allocSids.length > 0 && (
                      <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200">
                        <div className="flex-1 h-1.5 rounded-full bg-purple-100 overflow-hidden">
                          <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${Math.min(100, totalAllocPct)}%` }} />
                        </div>
                        <span className={`text-[10px] font-bold ${Math.abs(totalAllocPct - 100) < 0.5 ? "text-emerald-600" : totalAllocPct > 100 ? "text-red-600" : "text-purple-700"}`}>
                          {totalAllocPct.toFixed(0)}% allocated
                          {Math.abs(totalAllocPct - 100) >= 0.5 && ` · ${remainingPct.toFixed(0)}% owner`}
                        </span>
                      </div>
                    )}
                    {subIds.map(sid => {
                      const sub = subcontractors.find(s => s.id === sid);
                      const comp = subCompDefaults[sid] ?? { compensationType: "hourly", rate: "" };
                      const setComp = (patch: Partial<typeof comp>) =>
                        setSubCompDefaults(d => ({ ...d, [sid]: { ...comp, ...patch } }));
                      return (
                        <div key={sid} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/30 border border-border/50">
                          <span className="text-xs font-medium flex-1 truncate">{sub?.name ?? `Sub #${sid}`}</span>
                          <div className="flex gap-0.5">
                            {(["hourly", "fixed", "allocation"] as const).map(t => (
                              <button key={t} type="button"
                                onClick={() => {
                                  if (t === "allocation") {
                                    // Auto-seed equal % split across all allocation subs (including this one)
                                    const newAllocSids = subIds.filter(id => id === sid || (subCompDefaults[id]?.compensationType === "allocation"));
                                    const equalPct = (100 / newAllocSids.length).toFixed(1);
                                    setSubCompDefaults(d => {
                                      const next = { ...d };
                                      newAllocSids.forEach(id => { next[id] = { compensationType: "allocation", rate: equalPct }; });
                                      return next;
                                    });
                                  } else {
                                    setComp({ compensationType: t });
                                  }
                                }}
                                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                                  comp.compensationType === t
                                    ? t === "allocation" ? "bg-purple-600 text-white border-purple-600"
                                      : t === "fixed" ? "bg-orange-500 text-white border-orange-500"
                                      : "bg-blue-600 text-white border-blue-600"
                                    : "bg-background text-muted-foreground border-border"
                                }`}
                              >{t === "hourly" ? "/hr" : t === "fixed" ? "$" : "%"}</button>
                            ))}
                          </div>
                          <input
                            type="number" min="0" step={comp.compensationType === "hourly" ? "0.01" : "1"}
                            placeholder={comp.compensationType === "allocation" ? "%" : comp.compensationType === "fixed" ? "amt" : "rate"}
                            value={comp.rate}
                            onChange={e => setComp({ rate: e.target.value })}
                            className="w-16 px-2 py-0.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary/20"
                          />
                        </div>
                      );
                    })}
                  </>);
                })()}
              </div>
            )}
          </div>

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

          {/* Man Hours Calculator — collapsible */}
          <div className="rounded-xl border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setManHoursExpanded(e => !e)}
              className="w-full flex items-center gap-2 px-3.5 py-3 hover:bg-muted/30 transition-colors text-left"
            >
              <Timer className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium text-foreground flex-1">Man Hours</span>
              {manHoursTotal !== "" && (
                <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                  {parseFloat(manHoursTotal).toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs
                </span>
              )}
              {!manHoursExpanded && manHoursTotal === "" && (
                <span className="text-xs text-muted-foreground">optional</span>
              )}
              {manHoursExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
            </button>
            {manHoursExpanded && (
              <div className="px-3.5 pb-3.5 space-y-3 border-t border-border/50 pt-3">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Workers", value: manHoursWorkers, setter: setManHoursWorkers, otherA: manHoursDays, otherB: manHoursHrsPerDay },
                    { label: "Days", value: manHoursDays, setter: setManHoursDays, otherA: manHoursWorkers, otherB: manHoursHrsPerDay },
                    { label: "Hrs/Day", value: manHoursHrsPerDay, setter: setManHoursHrsPerDay, otherA: manHoursWorkers, otherB: manHoursDays },
                  ].map(({ label, value, setter, otherA, otherB }) => (
                    <div key={label}>
                      <label className="block text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">{label}</label>
                      <input
                        type="number" min="0" step="0.5"
                        className="w-full px-2 py-2 rounded-xl border border-border bg-background text-sm text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={value}
                        onChange={e => {
                          setter(e.target.value);
                          recalcManHours(
                            label === "Workers" ? e.target.value : otherA,
                            label === "Days" ? e.target.value : (label === "Workers" ? otherA : otherB),
                            label === "Hrs/Day" ? e.target.value : otherB,
                          );
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground flex-shrink-0">Total hrs</span>
                  <input
                    type="number" min="0" step="0.5"
                    className="flex-1 px-3 py-2 rounded-xl border-2 border-amber-300 bg-amber-50 text-sm font-bold text-amber-900 text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="— or type a total directly"
                    value={manHoursTotal}
                    onChange={e => setManHoursTotal(e.target.value)}
                  />
                  {manHoursTotal !== "" && (
                    <button type="button" onClick={() => { setManHoursTotal(""); setManHoursWorkers("0"); setManHoursDays("0"); setManHoursHrsPerDay("0"); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

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
    {removeSubPrompt && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRemoveSubPrompt(null)} />
        <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4">
          <h3 className="font-bold text-foreground text-base">Remove {removeSubPrompt.subName}?</h3>
          <p className="text-sm text-muted-foreground">What should happen to their logged hours on this job?</p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setSubIds(removeSubPrompt.pendingIds); setRemoveSubPrompt(null); }}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              Keep hours
            </button>
            <button
              type="button"
              onClick={() => {
                setSubIds(removeSubPrompt.pendingIds);
                setClearHoursForSubIds(prev => [...prev, removeSubPrompt.subId]);
                setRemoveSubPrompt(null);
              }}
              className="flex-1 px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold hover:opacity-90 transition-colors"
            >
              Remove hours
            </button>
          </div>
        </div>
      </div>
    )}
    </>
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

  // Batch-fetch checklist summaries for all jobs (single query, not N+1)
  const jobIds = jobs.map(j => j.id);
  const { data: checklistSummaries = {} } = useQuery<Record<number, ChecklistSummary>>({
    queryKey: ["checklist-summaries", jobIds.join(",")],
    queryFn: async () => {
      if (jobIds.length === 0) return {};
      const res = await fetch(`${BASE}/api/jobs/checklist-summaries?jobIds=${jobIds.join(",")}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: jobIds.length > 0,
    staleTime: 30 * 1000,
  });

  const { data: allEstimates = [] } = useListEstimates();
  const estimateTotalByJob = allEstimates.reduce<Record<number, number>>((acc, est) => {
    if (est.jobId == null) return acc;
    acc[est.jobId] = (acc[est.jobId] ?? 0) + est.total;
    return acc;
  }, {});

  const [profileClientId, setProfileClientId] = useState<number | null>(null);
  const [profileClientInitialTab, setProfileClientInitialTab] = useState<"overview" | "jobs" | "invoices" | "payments" | "route" | "billing" | undefined>(undefined);

  const { activeBusiness, businesses } = useBusiness();
  // Include inactive so archived service names still resolve on existing job cards
  const { data: allProductionServiceTypes = [] } = useListProductionServiceTypes(activeBusiness?.id, true);
  const [jobSearch, setJobSearch]       = useState("");
  const [localBLFilter, setLocalBLFilter] = useState<string>("");
  const jobBLFilter = activeBusiness ? activeBusiness.slug : localBLFilter;
  const [needsPayoutFilter, setNeedsPayoutFilter] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [paidExpanded, setPaidExpanded] = useState(false);
  const [closedExpanded, setClosedExpanded] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveSort, setArchiveSort] = useState<"newest" | "oldest" | "revenue" | "profit" | "hours">("newest");
  const [archiveExpandedId, setArchiveExpandedId] = useState<number | null>(null);
  const [csvPopoverOpen, setCsvPopoverOpen] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);
  const [csvPreset, setCsvPreset] = useState<"month" | "quarter" | "year" | "custom">("year");
  const [csvCustomFrom, setCsvCustomFrom] = useState("");
  const [csvCustomTo, setCsvCustomTo] = useState("");
  const [csvBL, setCsvBL] = useState<string>(() => activeBusiness?.slug ?? "all");
  const [jobFormOpen, setJobFormOpen]   = useState(false);
  const [editJob, setEditJob]           = useState<Job | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [relatedCounts, setRelatedCounts] = useState<{ dailyLogs: number; expenses: number; mileageLogs: number; recurringExpenses: number; invoices: number } | null>(null);

  const [invoiceEditorOpen, setInvoiceEditorOpen]       = useState(false);
  const [invoiceDraftData, setInvoiceDraftData]         = useState<InvoiceDraft | null>(null);
  const [selectedExistingInvoice, setSelectedExistingInvoice] = useState<Invoice | null>(null);
  const [invoiceFetching, setInvoiceFetching]           = useState(false);
  const [productionPricingJob, setProductionPricingJob] = useState<Job | null>(null);

  const [gcWizardJob, setGcWizardJob] = useState<Job | null>(null);

  const [paymentLinkResult, setPaymentLinkResult] = useState<{ url: string; invoiceNumber: string; invoiceId: number } | null>(null);
  const [generatingLinkId, setGeneratingLinkId]   = useState<number | null>(null);
  const [sendingReminderId, setSendingReminderId] = useState<number | null>(null);
  const createPaymentLinkMutation = useCreateInvoicePaymentLink();
  const { toast } = useToast();

  type CloseJobDialogSub = { subcontractorId: number; subName: string; compensationType: string; fixedAmount: number | null; allocationPct: number | null; amountOwed: number | null; amountPaid: number | null };
  const [closeJobDialog, setCloseJobDialog] = useState<{ job: Job; subs: CloseJobDialogSub[]; toSplit: number } | null>(null);
  const [kbTrainingJob, setKbTrainingJob] = useState<Job | null>(null);
  const [closeJobBusy, setCloseJobBusy] = useState(false);

  function computeCloseJobSubAmount(sub: CloseJobDialogSub, toSplit: number): number {
    // Compute the total agreed owed amount
    const totalOwed = sub.amountOwed != null ? sub.amountOwed
      : sub.compensationType === "fixed" ? (sub.fixedAmount ?? 0)
      : sub.compensationType === "allocation" ? toSplit * ((sub.allocationPct ?? 0) / 100)
      : 0;
    // Subtract any partial payments already recorded to avoid double-billing
    const alreadyPaid = sub.amountPaid ?? 0;
    return Math.max(0, totalOwed - alreadyPaid);
  }

  async function handleCloseJobMarkAllPaid() {
    if (!closeJobDialog) return;
    const { job, subs, toSplit } = closeJobDialog;
    setCloseJobBusy(true);
    try {
      await Promise.all(subs.map(async sub => {
        const amount = computeCloseJobSubAmount(sub, toSplit);
        if (amount <= 0) return;
        const res = await fetch(`${BASE}/api/jobs/${job.id}/pay-worker/${sub.subcontractorId}`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount, subName: sub.subName, idempotencyKey: crypto.randomUUID() }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(data.error ?? `Payment failed for ${sub.subName}`);
        }
      }));
      await updateJob.mutateAsync({ id: job.id, data: { status: "completed" } });
      queryClient.invalidateQueries();
      setCloseJobDialog(null);
      toast({ title: "Job completed", description: "All sub payments have been recorded." });
    } catch (err) {
      toast({ title: "Failed to record payments", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setCloseJobBusy(false);
    }
  }

  async function handleCloseJobKeepOutstanding() {
    if (!closeJobDialog) return;
    const { job } = closeJobDialog;
    setCloseJobBusy(true);
    try {
      // Server computes which subs need expenses and at what amounts from DB
      const res = await fetch(`${BASE}/api/jobs/${job.id}/record-sub-expenses`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Failed to record sub expenses");
      }
      await updateJob.mutateAsync({ id: job.id, data: { status: "completed" } });
      queryClient.invalidateQueries();
      setCloseJobDialog(null);
      toast({ title: "Job completed", description: "Sub payments remain outstanding and are tracked in the books." });
    } catch (err) {
      toast({ title: "Failed to complete job", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setCloseJobBusy(false);
    }
  }

  async function handleArchiveJob(job: Job) {
    try {
      // Fail-closed: if the outstanding check endpoint is unreachable, block the close
      let outsData: Array<{ subName: string }>;
      try {
        const res = await fetch(`${BASE}/api/jobs/${job.id}/outstanding-sub-payments`, { credentials: "include" });
        if (!res.ok) throw new Error("outstanding check failed");
        outsData = await res.json();
      } catch {
        toast({ title: "Cannot close job", description: "Couldn't verify subcontractor settlements. Please try again.", variant: "destructive" });
        return;
      }
      if (outsData.length > 0) {
        const names = outsData.map(s => s.subName).join(", ");
        toast({ title: "Cannot close job", description: `Outstanding balance owed to: ${names}`, variant: "destructive" });
        return;
      }
      await updateJob.mutateAsync({ id: job.id, data: { status: "closed" } });
      queryClient.invalidateQueries();
      toast({ title: "Job archived", description: `"${job.title}" moved to Closed Jobs.` });
    } catch {
      toast({ title: "Failed to close job", description: "Please try again.", variant: "destructive" });
    }
  }

  async function handleReopenJob(job: Job) {
    try {
      await updateJob.mutateAsync({ id: job.id, data: { status: "completed" } });
      queryClient.invalidateQueries();
      toast({ title: "Job reopened", description: `"${job.title}" moved back to active jobs.` });
    } catch {
      toast({ title: "Failed to reopen job", description: "Please try again.", variant: "destructive" });
    }
  }

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

  async function handleExportCsv() {
    setCsvExporting(true);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    let exportFrom = "";
    let exportTo = today;
    if (csvPreset === "month") {
      exportFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    } else if (csvPreset === "quarter") {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      exportFrom = `${now.getFullYear()}-${String(qMonth + 1).padStart(2, "0")}-01`;
    } else if (csvPreset === "year") {
      exportFrom = `${now.getFullYear()}-01-01`;
    } else {
      exportFrom = csvCustomFrom;
      exportTo = csvCustomTo || today;
    }
    try {
      const params = new URLSearchParams();
      if (exportFrom) params.set("from", exportFrom);
      if (exportTo) params.set("to", exportTo);
      if (csvBL && csvBL !== "all") params.set("businessLine", csvBL);
      const res = await fetch(`${BASE}/api/jobs/closed/export?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const { rows, totals } = await res.json() as {
        rows: { dateOpened: string; dateClosed: string; daysOpen: number; jobNumber: number; businessLine: string; jobName: string; customer: string; location: string; revenue: number; materials: number; labor: number; netProfit: number; invoiceStatus: string; subStatus: string }[];
        totals: { revenue: number; materials: number; labor: number; netProfit: number; count: number };
      };
      const headers = ["Date Opened", "Date Closed", "Days Open", "Job #", "Business Line", "Job Name", "Customer", "Location", "Revenue", "Materials", "Labor", "Net Profit", "Invoice Status", "Sub Status"];
      const csvRows = rows.map(r => [
        r.dateOpened, r.dateClosed, String(r.daysOpen), `#${r.jobNumber}`,
        r.businessLine, r.jobName, r.customer, r.location,
        r.revenue.toFixed(2), r.materials.toFixed(2), r.labor.toFixed(2), r.netProfit.toFixed(2),
        r.invoiceStatus, r.subStatus,
      ]);
      const totalsRow = ["TOTAL", "", "", "", "", "", "", "",
        totals.revenue.toFixed(2), totals.materials.toFixed(2), totals.labor.toFixed(2), totals.netProfit.toFixed(2), "", ""];
      const csvStr = [headers, ...csvRows, totalsRow]
        .map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blPart = (csvBL && csvBL !== "all") ? csvBL : "all";
      const filename = `closed-jobs-${blPart}-${today}.csv`;
      const blob = new Blob([csvStr], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setCsvPopoverOpen(false);
    } catch {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setCsvExporting(false);
    }
  }

  const scheduledJobs = jobs.filter(j => j.status !== "closed" && displayStatus(j.status) === "scheduled" && jobMatchesSearch(j) && jobMatchesBL(j) && jobMatchesPayout(j));

  // All completed jobs matching BL/payout — kept for invoice-summary fetching and section counts
  const allCompletedBase = jobs.filter(j => j.status !== "closed" && displayStatus(j.status) === "completed" && jobMatchesBL(j) && jobMatchesPayout(j));

  // All closed (archived) jobs matching BL filter — not affected by global job search
  const allClosedBase = jobs.filter(j => j.status === "closed" && jobMatchesBL(j));

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

  // Fetch invoice summaries for scheduled + ALL completed + closed jobs so counts stay accurate
  const visibleJobIds = useMemo(
    () => [...scheduledJobs, ...allCompletedBase, ...allClosedBase].map(j => j.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheduledJobs.map(j => j.id).join(","), allCompletedBase.map(j => j.id).join(","), allClosedBase.map(j => j.id).join(",")]
  );

  useEffect(() => {
    if (visibleJobIds.length === 0) { setInvoiceSummaryMap(new Map()); return; }
    const controller = new AbortController();
    fetch(`${BASE}/api/invoices/summaries?jobIds=${visibleJobIds.join(",")}`, { signal: controller.signal, credentials: "include" })
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

  // Outstanding sub-balance map for paidBase jobs — live check per the outstanding-sub-payments endpoint
  // true = has outstanding, false = all settled; undefined = not yet loaded (button hidden)
  const [outstandingBalanceMap, setOutstandingBalanceMap] = useState<Map<number, boolean>>(new Map());
  useEffect(() => {
    if (paidBase.length === 0) { setOutstandingBalanceMap(new Map()); return; }
    const ids = paidBase.map(j => j.id);
    const controller = new AbortController();
    fetch(`${BASE}/api/jobs/outstanding-sub-balances?jobIds=${ids.join(",")}`, { credentials: "include", signal: controller.signal })
      .then(r => r.ok ? r.json() as Promise<Record<string, boolean>> : Promise.reject())
      .then(obj => {
        if (controller.signal.aborted) return;
        setOutstandingBalanceMap(new Map(Object.entries(obj).map(([id, v]) => [parseInt(id, 10), v])));
      })
      .catch(() => { if (!controller.signal.aborted) setOutstandingBalanceMap(new Map()); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidBase.map(j => j.id).join(",")]);

  // Photo counts for closed jobs — single batch fetch
  const [photoCountMap, setPhotoCountMap] = useState<Map<number, number>>(new Map());
  useEffect(() => {
    if (allClosedBase.length === 0) { setPhotoCountMap(new Map()); return; }
    const ids = allClosedBase.map(j => j.id);
    const controller = new AbortController();
    fetch(`${BASE}/api/jobs/photo-counts?jobIds=${ids.join(",")}`, { credentials: "include", signal: controller.signal })
      .then(r => r.ok ? r.json() as Promise<Record<string, number>> : Promise.reject())
      .then(obj => {
        if (controller.signal.aborted) return;
        setPhotoCountMap(new Map(Object.entries(obj).map(([id, n]) => [parseInt(id, 10), n])));
      })
      .catch(() => { if (!controller.signal.aborted) setPhotoCountMap(new Map()); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allClosedBase.map(j => j.id).join(",")]);

  // Sorted/filtered closed jobs for the archive table (uses profitMap for sort)
  const archiveSearchLower = archiveSearch.toLowerCase().trim();
  const closedJobs = [...allClosedBase]
    .filter(j =>
      !archiveSearchLower ||
      j.title?.toLowerCase().includes(archiveSearchLower) ||
      j.clientName?.toLowerCase().includes(archiveSearchLower) ||
      j.locationName?.toLowerCase().includes(archiveSearchLower) ||
      j.city?.toLowerCase().includes(archiveSearchLower) ||
      j.state?.toLowerCase().includes(archiveSearchLower)
    )
    .sort((a, b) => {
      switch (archiveSort) {
        case "oldest":  return (a.closedAt ?? a.endDate ?? "").localeCompare(b.closedAt ?? b.endDate ?? "");
        case "revenue": return (profitMap.get(b.id)?.grossInvoiced ?? 0) - (profitMap.get(a.id)?.grossInvoiced ?? 0);
        case "profit":  return (profitMap.get(b.id)?.netProfit ?? 0) - (profitMap.get(a.id)?.netProfit ?? 0);
        case "hours": {
          const getHrs = (j: typeof a) => {
            const p = profitMap.get(j.id);
            const tracked = p?.totalSubHours ?? 0;
            const manual = p?.manHours ?? ((j as unknown as Record<string, unknown>).manHours != null ? parseFloat(String((j as unknown as Record<string, unknown>).manHours)) : 0);
            return tracked > 0 ? tracked : manual;
          };
          return getHrs(b) - getHrs(a);
        }
        default:        return (b.closedAt ?? b.endDate ?? "").localeCompare(a.closedAt ?? a.endDate ?? "");
      }
    });

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

  async function proceedWithJobCompletion(job: Job) {
    try {
      const [subsData, profitData] = await Promise.all([
        fetch(`${BASE}/api/jobs/${job.id}/outstanding-sub-payments`, { credentials: "include" })
          .then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${BASE}/api/jobs/${job.id}/profit`, { credentials: "include" })
          .then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      if ((subsData as unknown[]).length === 0) {
        // No unpaid fixed/allocation subs — close immediately
        await updateJob.mutateAsync({ id: job.id, data: { status: "completed" } });
        queryClient.invalidateQueries();
        return;
      }

      // Compute allocation split pool from profit data
      const toSplit = profitData ? (() => {
        const income = Math.max(0, profitData.grossInvoiced - profitData.jobExpenses);
        const afterWorkers = Math.max(0, income - profitData.subLaborCost);
        return Math.max(0, afterWorkers - afterWorkers * 0.05);
      })() : 0;

      setCloseJobDialog({ job, subs: subsData, toSplit });
    } catch {
      toast({
        title: "Cannot close job",
        description: "Could not verify sub payment status. Please try again.",
        variant: "destructive",
      });
    }
  }

  async function handleMarkCompleted(job: Job) {
    // Invoice gate — preserved from before: unpaid invoice blocks close with a toast
    const invoiceSummary = invoiceSummaryMap.get(job.id);
    if (invoiceSummary && invoiceSummary.status !== "paid") {
      toast({
        title: "Cannot close job",
        description: "The invoice has not been paid yet. Collect payment or void the invoice before closing.",
        variant: "destructive",
      });
      return;
    }

    // MFH jobs → show KB training review before completing
    if ((job as unknown as Record<string, unknown>).mfhModelId) {
      setKbTrainingJob(job);
      return;
    }

    await proceedWithJobCompletion(job);
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
          const isMaterialLine = (li: { description: string; [k: string]: unknown }) =>
            (li as { source?: string }).source === "material" || li.description === "Materials";
          const estimateLines = jobDraft.lineItems.filter((li: any) => !isMaterialLine(li));

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
          const updatedLines = [...mergedLines.filter(l => isMaterialLine(l) || l.unitPrice !== 0), ...missingLines.length ? missingLines : []];
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

  async function handleAcceptInvoice(job: Job, invoice: Invoice) {
    try {
      const res = await fetch(`${BASE}/api/invoices/${invoice.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to accept invoice");
      }
      const accepted = await res.json();
      toast({
        title: `Invoice ${accepted.invoiceNumber} accepted`,
        description: "The invoice is now official and ready to send.",
      });
      queryClient.invalidateQueries();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to accept invoice";
      toast({ title: "Accept failed", description: msg, variant: "destructive" });
    }
  }

  async function handleReviewInvoice(job: Job) {
    setInvoiceFetching(true);
    try {
      // Fetch the job-specific draft and the job invoice draft data in parallel
      const [draftRes, jobDraft] = await Promise.all([
        fetch(`${BASE}/api/invoices/job/${job.id}/draft`, { credentials: "include" }),
        getJobInvoiceDraft(job.id).catch(() => null),
      ]);

      let existingDraft: Invoice | undefined;
      if (draftRes.ok) {
        existingDraft = await draftRes.json();
      }

      // Helper: merge job location into a draft invoice if the invoice's location fields are empty
      function mergeJobLocation<T extends { locationName?: string | null; city?: string | null; state?: string | null }>(draft: T, j: Job): T {
        const needsLocation = !draft.locationName && !draft.city && !draft.state;
        if (!needsLocation) return draft;
        return {
          ...draft,
          locationName: draft.locationName || j.locationName || null,
          city: draft.city || j.city || null,
          state: draft.state || j.state || null,
        };
      }

      if (existingDraft) {
        // For service billing jobs: always refresh line items from current worksheet data
        // so that changes to hours/rates/mileage are immediately reflected without
        // the user having to delete and recreate the draft.
        if (job.serviceBilling && existingDraft.status === "draft" && jobDraft?.lineItems?.length) {
          const isMaterialLine = (li: any) => (li as { source?: string }).source === "material" || li.description === "Materials";
          const filteredJobDraftLines = (jobDraft!.lineItems as any[]).filter(
            (li: any) => li.source || (parseFloat(li.unitPrice) !== 0) || (parseFloat(li.quantity) !== 1)
          );
          // Preserve manually-entered material lines from the saved invoice that aren't
          // already covered by the auto-generated job draft lines (e.g. typed "Materials"
          // line item the user added directly without a job material list).
          const jobDraftDescriptions = new Set(filteredJobDraftLines.map((li: any) => li.description));
          const existingMaterialLines = (Array.isArray(existingDraft.lineItems) ? existingDraft.lineItems as any[] : [])
            .filter((li: any) => isMaterialLine(li) && !jobDraftDescriptions.has(li.description));
          const mergedLines = [...filteredJobDraftLines, ...existingMaterialLines];
          existingDraft = mergeJobLocation({ ...existingDraft, lineItems: mergedLines as any }, job);
          setInvoiceDraftData(null);
          setSelectedExistingInvoice(existingDraft);
          setInvoiceEditorOpen(true);
          return;
        }

        // Merge estimate lines from the job draft into the existing draft invoice.
        // Material lines are already managed by auto-sync; we handle all other lines here.
        const isMaterialLine = (li: { description: string; [k: string]: unknown }) =>
          (li as { source?: string }).source === "material" || li.description === "Materials";

        const currentLineItems: Array<{ id: number; description: string; quantity: number; unitPrice: number; total: number }> =
          Array.isArray(existingDraft.lineItems) ? existingDraft.lineItems : [];

        // All lines from the job draft except material-sourced lines are estimate-sourced
        const estimateLines = (jobDraft?.lineItems ?? []).filter((li: any) => !isMaterialLine(li));

        // Which estimate lines are not yet represented in the existing invoice?
        const missingLines = estimateLines.filter(
          li => !currentLineItems.some(cur => cur.description === li.description)
        );

        // Skip the merge if the invoice already has real (non-zero, non-material) line items.
        // Once the user has customised their invoice lines, their edits take precedence and
        // we must not re-add estimate lines that no longer match by description.
        const hasRealContent = currentLineItems.some(
          li => li.unitPrice !== 0 && !isMaterialLine(li)
        );

        if (!hasRealContent && missingLines.length > 0) {
          // Remove $0 placeholder lines (inserted by auto-sync before estimates were linked)
          // but keep anything manually edited (non-zero price) and material-sourced lines.
          const keepLines = currentLineItems.filter(
            li => isMaterialLine(li) || li.unitPrice !== 0
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

        // Back-fill job location into the draft if the invoice's location fields are blank
        if (existingDraft) existingDraft = mergeJobLocation(existingDraft, job);

        setInvoiceDraftData(null);
        setSelectedExistingInvoice(existingDraft ?? null);
        setInvoiceEditorOpen(true);
        return;
      }

      // No existing draft — but check if the job already has an approved/sent/paid invoice.
      // If so, open it in view/edit mode to prevent accidentally creating a duplicate.
      const existingInvoiceSummary = invoiceSummaryMap.get(job.id);
      if (existingInvoiceSummary && existingInvoiceSummary.status !== "draft") {
        setInvoiceDraftData(null);
        setSelectedExistingInvoice(existingInvoiceSummary);
        setInvoiceEditorOpen(true);
        return;
      }

      // Truly no invoice yet — open the editor using job draft data (creates new invoice on save)
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
                  return (
                    <JobCard key={job.id} job={job} onEdit={openEditJob}
                      onDelete={openDeleteTarget} onReviewInvoice={handleReviewInvoice}
                      onMarkCompleted={handleMarkCompleted}
                      materialListCount={materialListCountByJob[job.id] ?? 0}
                      estimateTotal={estimateTotalByJob[job.id]}
                      onLoadEstimateIntoInvoice={handleLoadAllEstimatesIntoInvoice}
                      invoiceSummary={invoiceSummaryMap.get(job.id) ?? null}
                      onCreateInvoice={() => handleReviewInvoice(job)}
                      onClientClick={job.clientId ? (id) => setProfileClientId(id) : undefined}
                      hasSubExpenses={jobsWithSubExpenses.has(job.id)}
                      profitData={profitMap.get(job.id) ?? null}
                      onSendPaymentLink={handleGetPaymentLink}
                      onGoToInvoices={() => { const inv = invoiceSummaryMap.get(job.id); navigate(inv ? `/invoices?open=${inv.id}` : "/invoices"); }}
                      onAcceptInvoice={handleAcceptInvoice}
                      generatingLinkId={generatingLinkId}
                      onSmartEstimate={j => setGcWizardJob(j)}
                      checklistSummary={checklistSummaries[job.id] ?? null}
                      productionServiceTypes={allProductionServiceTypes}
                      onApplyProductionPricing={getJobWorkflow(job) === "mh_production" ? () => setProductionPricingJob(job) : undefined} />
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
                    return (
                      <JobCard key={job.id} job={job} onEdit={openEditJob}
                        onDelete={openDeleteTarget} onReviewInvoice={handleReviewInvoice}
                        onMarkCompleted={handleMarkCompleted}
                        materialListCount={materialListCountByJob[job.id] ?? 0}
                        estimateTotal={estimateTotalByJob[job.id]}
                        onLoadEstimateIntoInvoice={handleLoadAllEstimatesIntoInvoice}
                        invoiceSummary={invoiceSummaryMap.get(job.id) ?? null}
                        onCreateInvoice={() => handleReviewInvoice(job)}
                        onClientClick={job.clientId ? (id) => setProfileClientId(id) : undefined}
                        hasSubExpenses={jobsWithSubExpenses.has(job.id)}
                        profitData={profitMap.get(job.id) ?? null}
                        onSendPaymentLink={handleGetPaymentLink}
                        onGoToInvoices={() => { const inv = invoiceSummaryMap.get(job.id); navigate(inv ? `/invoices?open=${inv.id}` : "/invoices"); }}
                        onAcceptInvoice={handleAcceptInvoice}
                        generatingLinkId={generatingLinkId}
                        onSmartEstimate={j => setGcWizardJob(j)}
                        checklistSummary={checklistSummaries[job.id] ?? null}
                        productionServiceTypes={allProductionServiceTypes}
                      onApplyProductionPricing={getJobWorkflow(job) === "mh_production" ? () => setProductionPricingJob(job) : undefined} />
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
                    return (
                      <JobCard key={job.id} job={job} onEdit={openEditJob}
                        onDelete={openDeleteTarget} onReviewInvoice={handleReviewInvoice}
                        onMarkCompleted={handleMarkCompleted}
                        materialListCount={materialListCountByJob[job.id] ?? 0}
                        estimateTotal={estimateTotalByJob[job.id]}
                        onLoadEstimateIntoInvoice={handleLoadAllEstimatesIntoInvoice}
                        invoiceSummary={invoiceSummaryMap.get(job.id) ?? null}
                        onCreateInvoice={() => handleReviewInvoice(job)}
                        onClientClick={job.clientId ? (id) => setProfileClientId(id) : undefined}
                        hasSubExpenses={jobsWithSubExpenses.has(job.id)}
                        profitData={profitMap.get(job.id) ?? null}
                        onSendPaymentLink={handleGetPaymentLink}
                        onGoToInvoices={() => { const inv = invoiceSummaryMap.get(job.id); navigate(inv ? `/invoices?open=${inv.id}` : "/invoices"); }}
                        onAcceptInvoice={handleAcceptInvoice}
                        generatingLinkId={generatingLinkId}
                        onSmartEstimate={j => setGcWizardJob(j)}
                        onArchiveJob={handleArchiveJob}
                        subsSettled={!jobsWithSubExpenses.has(job.id) || outstandingBalanceMap.get(job.id) === false}
                        checklistSummary={checklistSummaries[job.id] ?? null}
                        productionServiceTypes={allProductionServiceTypes}
                      onApplyProductionPricing={getJobWorkflow(job) === "mh_production" ? () => setProductionPricingJob(job) : undefined} />
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

          {/* ── Closed Jobs archive section ────────────────────────────── */}
          {allClosedBase.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setClosedExpanded(v => !v)}
                  className="flex items-center gap-2 flex-1 text-left group"
                >
                  <Archive className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <h2 className="font-semibold text-foreground">Closed Jobs</h2>
                  <span className="text-sm text-muted-foreground">({allClosedBase.length})</span>
                  <span className="ml-2 text-muted-foreground group-hover:text-foreground transition-colors">
                    {closedExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </span>
                </button>
                {/* Export CSV button + popover */}
                <div className="relative flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setCsvPopoverOpen(v => !v)}
                    disabled={csvExporting}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                  >
                    {csvExporting
                      ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      : <Download className="w-3 h-3" />}
                    Export CSV
                  </button>
                  {csvPopoverOpen && !csvExporting && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setCsvPopoverOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 z-20 w-72 bg-card border border-border rounded-xl shadow-xl p-4 space-y-3">
                        <p className="text-xs font-semibold text-foreground">Export Closed Jobs</p>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Date Range</label>
                          <select
                            value={csvPreset}
                            onChange={e => setCsvPreset(e.target.value as typeof csvPreset)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                          >
                            <option value="month">This Month</option>
                            <option value="quarter">This Quarter</option>
                            <option value="year">This Year</option>
                            <option value="custom">Custom Range</option>
                          </select>
                          {csvPreset === "custom" && (
                            <div className="flex gap-2 mt-1.5">
                              <input type="date" value={csvCustomFrom} onChange={e => setCsvCustomFrom(e.target.value)}
                                className="flex-1 px-2 py-1 text-xs rounded-lg border border-border bg-background focus:outline-none" />
                              <input type="date" value={csvCustomTo} onChange={e => setCsvCustomTo(e.target.value)}
                                className="flex-1 px-2 py-1 text-xs rounded-lg border border-border bg-background focus:outline-none" />
                            </div>
                          )}
                        </div>
                        {businesses.length > 0 && (
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Business Line</label>
                            <select
                              value={csvBL}
                              onChange={e => setCsvBL(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                              <option value="all">All Lines</option>
                              {businesses.map((b: { slug: string; name: string }) => (
                                <option key={b.slug} value={b.slug}>{b.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <button
                          onClick={handleExportCsv}
                          disabled={csvPreset === "custom" && !csvCustomFrom}
                          className="w-full py-2 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors disabled:opacity-50"
                        >
                          Download CSV
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Summary bar — always visible */}
              {(() => {
                const totalRev = allClosedBase.reduce((s, j) => s + (profitMap.get(j.id)?.grossInvoiced ?? 0), 0);
                const totalProfit = allClosedBase.reduce((s, j) => s + (profitMap.get(j.id)?.netProfit ?? 0), 0);
                const totalHrs = allClosedBase.reduce((s, j) => {
                  const p = profitMap.get(j.id);
                  const tracked = p?.totalSubHours ?? 0;
                  const manual = p?.manHours ?? ((j as unknown as Record<string, unknown>).manHours != null ? parseFloat(String((j as unknown as Record<string, unknown>).manHours)) : 0);
                  return s + (tracked > 0 ? tracked : manual);
                }, 0);
                return (
                  <div className="flex flex-wrap gap-4 mb-3 px-4 py-2.5 rounded-xl bg-slate-50 border border-border/50 text-sm">
                    <span className="text-muted-foreground">
                      Total Closed: <span className="font-semibold text-foreground">{allClosedBase.length}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Total Revenue: <span className="font-semibold text-foreground">{formatCurrency(totalRev)}</span>
                    </span>
                    <span className={totalProfit >= 0 ? "text-emerald-700" : "text-red-600"}>
                      Total Net Profit: <span className="font-semibold">{formatCurrency(totalProfit)}</span>
                    </span>
                    {totalHrs > 0 && (
                      <span className="text-orange-700">
                        Total Man-hrs: <span className="font-semibold">{totalHrs.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                      </span>
                    )}
                    {totalHrs > 0 && totalRev > 0 && (
                      <span className="text-blue-700">
                        Avg $/hr: <span className="font-semibold">{formatCurrency(totalRev / totalHrs)}</span>
                      </span>
                    )}
                  </div>
                );
              })()}

              {closedExpanded && (
                <>
                  {/* Search + Sort controls */}
                  <div className="flex gap-2 mb-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search closed jobs…"
                        value={archiveSearch}
                        onChange={e => setArchiveSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <select
                      value={archiveSort}
                      onChange={e => setArchiveSort(e.target.value as typeof archiveSort)}
                      className="px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none"
                    >
                      <option value="newest">Newest Closed</option>
                      <option value="oldest">Oldest Closed</option>
                      <option value="revenue">Highest Revenue</option>
                      <option value="profit">Highest Profit</option>
                      <option value="hours">Most Man-Hours</option>
                    </select>
                  </div>

                  {closedJobs.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground text-center">
                      No closed jobs match "{archiveSearch}".
                    </p>
                  ) : (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <table className="w-full text-sm min-w-[680px]">
                        <thead className="bg-muted/40 border-b border-border">
                          <tr>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-24">Date Closed</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-14">Job #</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Job</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground hidden md:table-cell">Customer</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Location</th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Revenue</th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Profit</th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground hidden md:table-cell">Man-hrs</th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Photos</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {closedJobs.map(job => {
                            const profit = profitMap.get(job.id);
                            const netProfit = profit?.netProfit ?? 0;
                            const grossInvoiced = profit?.grossInvoiced ?? 0;
                            const photoCount = photoCountMap.get(job.id) ?? 0;
                            const isExpanded = archiveExpandedId === job.id;
                            const locationParts = [job.locationName, job.city, job.state].filter(Boolean);
                            const closedDateStr = job.closedAt
                              ? formatDate(job.closedAt)
                              : job.endDate ? formatDate(job.endDate) : "—";
                            // Man-hours: prefer tracked sub hours, fall back to manually entered field
                            const trackedHrs = profit?.totalSubHours ?? 0;
                            const manualHrs = profit?.manHours ?? ((job as unknown as Record<string, unknown>).manHours != null ? parseFloat(String((job as unknown as Record<string, unknown>).manHours)) : 0);
                            const displayHrs = trackedHrs > 0 ? trackedHrs : manualHrs;
                            const revenuePerHr = displayHrs > 0 && grossInvoiced > 0 ? grossInvoiced / displayHrs : null;
                            return (
                              <Fragment key={job.id}>
                                <tr
                                  className="border-t border-border/60 hover:bg-muted/30 cursor-pointer transition-colors"
                                  onClick={() => setArchiveExpandedId(isExpanded ? null : job.id)}
                                >
                                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{closedDateStr}</td>
                                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">#{job.jobNumber ?? job.id}</td>
                                  <td className="px-3 py-2.5 font-medium text-foreground truncate max-w-[160px]">{job.title}</td>
                                  <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell truncate max-w-[120px]">{job.clientName ?? "—"}</td>
                                  <td className="px-3 py-2.5 text-muted-foreground hidden lg:table-cell truncate max-w-[120px]">{locationParts.join(", ") || "—"}</td>
                                  <td className="px-3 py-2.5 text-right font-semibold">{formatCurrency(grossInvoiced)}</td>
                                  <td className={`px-3 py-2.5 text-right font-semibold ${netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                    {formatCurrency(netProfit)}
                                  </td>
                                  <td className="px-3 py-2.5 text-right hidden md:table-cell">
                                    {displayHrs > 0 ? (
                                      <div className="flex flex-col items-end">
                                        <span className="font-semibold text-orange-700 text-xs">{displayHrs.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs</span>
                                        {revenuePerHr != null && (
                                          <span className="text-[10px] text-blue-600">{formatCurrency(revenuePerHr)}/hr</span>
                                        )}
                                      </div>
                                    ) : <span className="text-muted-foreground text-xs">—</span>}
                                  </td>
                                  <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                                    {photoCount > 0 ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200">
                                        <ImageIcon className="w-2.5 h-2.5" />{photoCount}
                                      </span>
                                    ) : <span className="text-muted-foreground text-xs">—</span>}
                                  </td>
                                  <td className="px-2 py-2.5 text-muted-foreground">
                                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr className="border-t border-border/40 bg-muted/20">
                                    <td colSpan={10} className="px-4 py-3">
                                      <div className="flex flex-wrap items-center gap-3 mb-3">
                                        {[
                                          { icon: <ImageIcon className="w-3 h-3" />, label: "Photos", value: photoCount },
                                          { icon: <Package className="w-3 h-3" />, label: "Materials", value: materialListCountByJob[job.id] ?? 0 },
                                          { icon: <ClipboardList className="w-3 h-3" />, label: "Logs", value: (logsByJob[job.id] ?? []).length },
                                          { icon: <Calculator className="w-3 h-3" />, label: "Est.", value: estimateTotalByJob[job.id] != null ? formatCurrency(estimateTotalByJob[job.id]) : "—" },
                                          { icon: <DollarSign className="w-3 h-3" />, label: "Invoice", value: invoiceSummaryMap.get(job.id)?.status === "paid" ? "Paid ✓" : invoiceSummaryMap.get(job.id)?.status ?? "—" },
                                          { icon: <HardHat className="w-3 h-3" />, label: "Subs", value: job.subPaid ? "Settled ✓" : "Outstanding" },
                                          ...(displayHrs > 0 ? [{ icon: <Clock className="w-3 h-3" />, label: "Man-hrs", value: `${displayHrs.toLocaleString(undefined, { maximumFractionDigits: 1 })}${revenuePerHr != null ? ` · ${formatCurrency(revenuePerHr)}/hr` : ""}` }] : []),
                                        ].map(({ icon, label, value }) => (
                                          <span key={label} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-background border border-border/60 text-xs text-muted-foreground">
                                            {icon}
                                            <span className="font-medium text-foreground">{label}:</span>
                                            {String(value)}
                                          </span>
                                        ))}
                                      </div>
                                      <div className="flex gap-2">
                                        <button
                                          onClick={e => { e.stopPropagation(); openEditJob(job); }}
                                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors">
                                          <Eye className="w-3 h-3" /> Open Full Job
                                        </button>
                                        {canEditJobs && (
                                          <button
                                            onClick={e => { e.stopPropagation(); handleReopenJob(job); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold hover:bg-amber-100 transition-colors">
                                            <RotateCcw className="w-3 h-3" /> Reopen Job
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {scheduledJobs.length === 0 && !searchLower && allCompletedBase.length === 0 && allClosedBase.length === 0 && (
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

      <InvoicePanel
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
        onSaved={() => { queryClient.invalidateQueries(); }}
      />

      {productionPricingJob && (
        <ApplyProductionPricingDialog
          open={!!productionPricingJob}
          onOpenChange={open => { if (!open) setProductionPricingJob(null); }}
          jobId={productionPricingJob.id}
          checkedServiceIds={((productionPricingJob as unknown as Record<string, unknown>).mhProductionServices as number[] | null) ?? []}
          homeType={((productionPricingJob as unknown as Record<string, unknown>).mfhConstructionType as string | null) ?? null}
          clientName={((productionPricingJob as unknown as Record<string, unknown>).clientName as string | null) ?? null}
          clientId={productionPricingJob.clientId ?? null}
          catalog={allProductionServiceTypes}
          onApplied={(invoice, meta) => {
            setInvoiceDraftData(null);
            setSelectedExistingInvoice(invoice as Invoice);
            setInvoiceEditorOpen(true);
            queryClient.invalidateQueries();
            if (meta.lockedExisting) {
              toast({
                title: "New draft created",
                description: `Invoice ${meta.lockedExisting.invoiceNumber} is ${meta.lockedExisting.status} and was left unchanged — a new draft was created for review.`,
              });
            }
          }}
          onKeepExisting={() => handleReviewInvoice(productionPricingJob)}
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

      {/* KB Training Modal — shown when marking an MFH job complete */}
      {kbTrainingJob && (
        <KbTrainingModal
          job={kbTrainingJob as unknown as Parameters<typeof KbTrainingModal>[0]["job"]}
          onClose={() => setKbTrainingJob(null)}
          onComplete={async () => {
            const job = kbTrainingJob;
            setKbTrainingJob(null);
            await proceedWithJobCompletion(job);
          }}
        />
      )}

      {/* Close-Job Dialog — shown when unpaid fixed/allocation subs exist on job completion */}
      {closeJobDialog && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-amber-400 to-amber-500" />
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <HardHat className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-lg leading-tight">Worker Pay Due</h2>
                  <p className="text-sm text-gray-500 mt-0.5">"{closeJobDialog.job.title}" has workers not yet paid. How would you like to proceed?</p>
                </div>
              </div>

              {/* Sub list */}
              <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-amber-200/60">
                  <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">Outstanding Payments</p>
                </div>
                <div className="divide-y divide-amber-100">
                  {closeJobDialog.subs.map(sub => {
                    const amt = computeCloseJobSubAmount(sub, closeJobDialog.toSplit);
                    const isAllocationNoData = sub.compensationType === "allocation" && amt === 0;
                    return (
                      <div key={sub.subcontractorId} className="flex items-center gap-3 px-3 py-2.5">
                        <HardHat className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-amber-900 truncate">{sub.subName}</p>
                          <p className="text-xs text-amber-700">
                            {sub.compensationType === "allocation"
                              ? isAllocationNoData
                                ? `${sub.allocationPct ?? 0}% allocation — amount TBD`
                                : `${sub.allocationPct ?? 0}% → ${formatCurrency(amt)}`
                              : formatCurrency(amt)
                            }
                          </p>
                        </div>
                        {isAllocationNoData && (
                          <span className="text-[10px] text-amber-600 font-medium italic flex-shrink-0">No invoice yet</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-2.5 pt-1">
                <button
                  onClick={handleCloseJobMarkAllPaid}
                  disabled={closeJobBusy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 transition-colors disabled:opacity-50 shadow-sm">
                  {closeJobBusy ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                  Mark All Paid Now
                </button>
                <button
                  onClick={handleCloseJobKeepOutstanding}
                  disabled={closeJobBusy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 transition-colors disabled:opacity-50 shadow-sm">
                  {closeJobBusy ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Complete Job &amp; Keep As Outstanding
                </button>
                <button
                  onClick={() => setCloseJobDialog(null)}
                  disabled={closeJobBusy}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors disabled:opacity-50">
                  Cancel
                </button>
              </div>
              <p className="text-xs text-gray-400 text-center">
                "Keep As Outstanding" books the cost now but leaves payment due — visible in the banner until paid.
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
          initialTab={profileClientInitialTab}
          onClose={() => { setProfileClientId(null); setProfileClientInitialTab(undefined); }}
          onAddToRoute={(id) => {
            setProfileClientId(null);
            setProfileClientInitialTab(undefined);
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
