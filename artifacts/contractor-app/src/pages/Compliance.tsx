import { useState, useRef, useEffect } from "react";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useGetComplianceReport } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert, AlertTriangle, CheckCircle2, Plus, X, Pencil,
  CalendarClock, RefreshCw, MapPin, Trash2, Bell, FileCheck, Undo2,
} from "lucide-react";
import { RegisteredAgentSection } from "@/components/RegisteredAgentSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = `${BASE}/api`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface ComplianceItem {
  id: number;
  title: string;
  category: string;
  jurisdiction: string | null;
  dueDate: string;
  recurrence: string;
  status: string;
  computedStatus: string;
  daysUntilDue: number;
  notes: string | null;
}

const CATEGORIES = [
  "License", "Tax Filing", "Permit", "Insurance", "Bond",
  "Registration", "Certification", "Inspection", "Other",
];

const RECURRENCES = [
  { value: "one-time",   label: "One-time" },
  { value: "monthly",    label: "Monthly" },
  { value: "quarterly",  label: "Quarterly" },
  { value: "annual",     label: "Annual" },
  { value: "every_5_years", label: "Every 5 Years" },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useComplianceItems() {
  return useQuery<ComplianceItem[]>({
    queryKey: ["compliance-items"],
    queryFn: async () => {
      const res = await fetch(`${API}/compliance-items`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

function useCreateComplianceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<ComplianceItem>) => {
      const res = await fetch(`${API}/compliance-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-items"] }),
  });
}

function useUpdateComplianceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<ComplianceItem> & { id: number }) => {
      const res = await fetch(`${API}/compliance-items/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-items"] }),
  });
}

function useDeleteComplianceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${API}/compliance-items/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-items"] }),
  });
}

// ─── Status helpers ────────────────────────────────────────────────────────────
function statusBadge(s: string) {
  if (s === "overdue")   return "bg-red-100 text-red-700 border-red-200";
  if (s === "due-soon")  return "bg-amber-100 text-amber-700 border-amber-200";
  if (s === "complete")  return "bg-emerald-100 text-emerald-700 border-emerald-200";
  return "bg-blue-100 text-blue-700 border-blue-200";
}

function statusLabel(s: string) {
  if (s === "overdue")  return "Overdue";
  if (s === "due-soon") return "Due Soon";
  if (s === "complete") return "Complete";
  return "Upcoming";
}

function daysLabel(days: number, status: string) {
  if (status === "complete") return "Completed";
  if (days < 0)  return `${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} overdue`;
  if (days === 0) return "Due today";
  return `${days} day${days !== 1 ? "s" : ""} away`;
}

function categoryIcon(cat: string) {
  switch (cat) {
    case "License":       return "🪪";
    case "Tax Filing":    return "📋";
    case "Permit":        return "📝";
    case "Insurance":     return "🛡️";
    case "Bond":          return "🔒";
    case "Registration":  return "📄";
    case "Certification": return "🎓";
    case "Inspection":    return "🔍";
    default:              return "📌";
  }
}

function formatDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(day))
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Item Form ────────────────────────────────────────────────────────────────
const inp = "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-300";
const lbl = "block text-xs font-semibold text-gray-500 mb-1";

function ItemForm({
  initial, onSave, onCancel, saving,
}: {
  initial?: Partial<ComplianceItem>;
  onSave: (d: Partial<ComplianceItem>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    title:        initial?.title        ?? "",
    category:     initial?.category     ?? "License",
    jurisdiction: initial?.jurisdiction ?? "",
    dueDate:      initial?.dueDate      ?? "",
    recurrence:   initial?.recurrence   ?? "one-time",
    notes:        initial?.notes        ?? "",
    status:       initial?.status       ?? "upcoming",
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...form,
      jurisdiction: form.jurisdiction.trim() || undefined,
      notes: form.notes.trim() || undefined,
    } as Partial<ComplianceItem>);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={lbl}>Item Name *</label>
        <input className={inp} required placeholder="e.g. Business License Renewal"
          value={form.title} onChange={e => set("title", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Category *</label>
          <select className={inp} value={form.category} onChange={e => set("category", e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Due Date *</label>
          <input type="date" className={inp} required
            value={form.dueDate} onChange={e => set("dueDate", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Jurisdiction</label>
          <input className={inp} placeholder="e.g. City of Louisville, KY"
            value={form.jurisdiction} onChange={e => set("jurisdiction", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Recurrence</label>
          <select className={inp} value={form.recurrence} onChange={e => set("recurrence", e.target.value)}>
            {RECURRENCES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {initial?.id && (
        <div>
          <label className={lbl}>Status</label>
          <select className={inp} value={form.status} onChange={e => set("status", e.target.value)}>
            <option value="upcoming">Upcoming</option>
            <option value="complete">Complete</option>
          </select>
        </div>
      )}

      <div>
        <label className={lbl}>Notes</label>
        <textarea className={inp + " resize-none"} rows={2}
          placeholder="Filing instructions, contact info, account numbers…"
          value={form.notes} onChange={e => set("notes", e.target.value)} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="px-5 py-2 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-60 shadow">
          {saving ? "Saving…" : initial?.id ? "Update Item" : "Add Item"}
        </button>
      </div>
    </form>
  );
}

// ─── Compliance Item Card ─────────────────────────────────────────────────────
function ItemCard({
  item, onEdit, onDelete, onToggleComplete, canEditCompliance,
}: {
  item: ComplianceItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleComplete: () => void;
  canEditCompliance: boolean;
}) {
  const s = item.computedStatus;
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 flex gap-4 group transition-all hover:shadow-md ${
      s === "overdue"   ? "border-red-200"    :
      s === "due-soon"  ? "border-amber-200"  :
      s === "complete"  ? "border-emerald-200 opacity-70" :
      "border-gray-200"
    }`}>
      {/* Category emoji + left bar */}
      <div className={`flex-shrink-0 w-1 rounded-full ${
        s === "overdue"  ? "bg-red-400"    :
        s === "due-soon" ? "bg-amber-400"  :
        s === "complete" ? "bg-emerald-400":
        "bg-blue-400"
      }`} />

      <div className="text-2xl flex-shrink-0 mt-0.5">{categoryIcon(item.category)}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`font-semibold text-gray-900 leading-tight ${s === "complete" ? "line-through text-gray-400" : ""}`}>
              {item.title}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${statusBadge(s)}`}>
                {statusLabel(s)}
              </span>
              <span className="text-xs text-gray-400 font-medium">
                {daysLabel(item.daysUntilDue, s)}
              </span>
            </div>
          </div>

          {/* Actions — shown to editors only */}
          {canEditCompliance && (
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={onToggleComplete} title={s === "complete" ? "Mark upcoming" : "Mark complete"}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                <CheckCircle2 className="w-4 h-4" />
              </button>
              <button onClick={onEdit} title="Edit"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={onDelete} title="Delete"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <CalendarClock className="w-3 h-3" />
            {formatDate(item.dueDate)}
          </span>
          {item.jurisdiction && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {item.jurisdiction}
            </span>
          )}
          {item.recurrence !== "one-time" && (
            <span className="flex items-center gap-1 capitalize">
              <RefreshCw className="w-3 h-3" />
              {RECURRENCES.find(r => r.value === item.recurrence)?.label}
            </span>
          )}
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px]">
            {item.category}
          </span>
        </div>

        {item.notes && (
          <p className="mt-2 text-xs text-gray-500 leading-relaxed bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-100">
            {item.notes}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Compliance() {
  const { canEdit } = useUserPermissions();
  const { data: autoReport, isLoading: loadingAuto } = useGetComplianceReport();
  const { data: items = [], isLoading: loadingItems } = useComplianceItems();
  const createItem   = useCreateComplianceItem();
  const updateItem   = useUpdateComplianceItem();
  const deleteItem   = useDeleteComplianceItem();

  const { toast } = useToast();

  const [showForm,    setShowForm]    = useState(false);
  const [editTarget,  setEditTarget]  = useState<ComplianceItem | null>(null);
  const [filterCat,   setFilterCat]   = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [undoState, setUndoState] = useState<{
    id: number;
    title: string;
    originalDueDate: string;
    originalStatus: string;
    progress: number;
    newDueDate?: string;
    error?: boolean;
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const UNDO_DURATION = 6000;

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearInterval(undoTimerRef.current);
    };
  }, []);

  function dismissUndo() {
    if (undoTimerRef.current) {
      clearInterval(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoState(null);
  }

  const overdue  = items.filter(i => i.computedStatus === "overdue");
  const dueSoon  = items.filter(i => i.computedStatus === "due-soon");
  const complete = items.filter(i => i.computedStatus === "complete");
  const upcoming = items.filter(i => i.computedStatus === "upcoming");

  const filtered = items.filter(i => {
    const catOk    = filterCat    === "All" || i.category === filterCat;
    const statusOk = filterStatus === "All" ||
      (filterStatus === "overdue"  && i.computedStatus === "overdue")  ||
      (filterStatus === "due-soon" && i.computedStatus === "due-soon") ||
      (filterStatus === "upcoming" && i.computedStatus === "upcoming") ||
      (filterStatus === "complete" && i.computedStatus === "complete");
    return catOk && statusOk;
  });

  const allCats = Array.from(new Set(items.map(i => i.category)));

  async function handleSave(data: Partial<ComplianceItem>) {
    if (editTarget) {
      await updateItem.mutateAsync({ id: editTarget.id, ...data });
      setEditTarget(null);
    } else {
      await createItem.mutateAsync(data);
      setShowForm(false);
    }
  }

  async function handleToggleComplete(item: ComplianceItem) {
    const newStatus = item.status === "complete" ? "upcoming" : "complete";
    const isAutoAdvance = newStatus === "complete" && item.recurrence && item.recurrence !== "one-time";

    if (isAutoAdvance) {
      dismissUndo();
    }

    const updated = await updateItem.mutateAsync({ ...item, status: newStatus });

    if (isAutoAdvance) {
      const startTime = Date.now();
      setUndoState({
        id: item.id,
        title: item.title,
        originalDueDate: item.dueDate,
        originalStatus: item.status,
        progress: 100,
        newDueDate: updated?.dueDate,
      });
      undoTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / UNDO_DURATION) * 100);
        if (remaining <= 0) {
          dismissUndo();
        } else {
          setUndoState(prev => prev ? { ...prev, progress: remaining } : null);
        }
      }, 50);
    } else if (newStatus === "complete") {
      toast({ title: "Marked complete" });
    }
  }

  async function handleUndo() {
    if (!undoState) return;
    const { id, originalDueDate, originalStatus } = undoState;
    dismissUndo();
    const item = items.find(i => i.id === id);
    if (!item) return;
    try {
      await updateItem.mutateAsync({
        ...item,
        id,
        dueDate: originalDueDate,
        status: originalStatus,
      });
    } catch {
      setUndoState({
        id,
        title: item.title,
        originalDueDate,
        originalStatus,
        progress: 0,
        error: true,
      });
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this compliance item?")) return;
    await deleteItem.mutateAsync(id);
  }

  const saving = createItem.isPending || updateItem.isPending;

  return (
    <div className="space-y-8 max-w-5xl">

      {/* Undo toast */}
      {undoState && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
          <div className={`rounded-2xl shadow-xl overflow-hidden ${undoState.error ? "bg-red-700" : "bg-gray-900"} text-white`}>
            <div className="flex items-center gap-3 px-4 py-3">
              {undoState.error
                ? <AlertTriangle className="w-4 h-4 text-red-200 flex-shrink-0" />
                : <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              }
              <p className="text-sm flex-1 min-w-0 truncate">
                {undoState.error
                  ? <span className="font-semibold">Undo failed — please try editing the item manually</span>
                  : <>
                      <span className="font-semibold">
                        {undoState.newDueDate
                          ? `Auto-advanced to ${formatDate(undoState.newDueDate)}`
                          : "Marked complete"}
                      </span>
                      {" — "}
                      <span className="text-gray-300">{undoState.title}</span>
                    </>
                }
              </p>
              {!undoState.error && (
                <button
                  onClick={handleUndo}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm font-semibold flex-shrink-0"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Undo
                </button>
              )}
              <button onClick={dismissUndo} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            {!undoState.error && (
              <div
                className="h-1 bg-emerald-500 transition-none"
                style={{ width: `${undoState.progress}%` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Compliance Center</h1>
          <p className="text-muted-foreground mt-1">Track license renewals, tax deadlines, permits, and filings.</p>
        </div>
        {canEdit("compliance") && (
          <button
            onClick={() => { setShowForm(true); setEditTarget(null); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" /> Add Compliance Item
          </button>
        )}
      </div>

      {/* ── Registered Agent Section ── */}
      <RegisteredAgentSection canEdit={canEdit("compliance")} />

      {/* Summary ribbon */}
      {!loadingItems && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Overdue",   count: overdue.length,  color: "border-red-200 bg-red-50",     text: "text-red-700",     dot: "bg-red-400",     filter: "overdue"  },
            { label: "Due Soon",  count: dueSoon.length,  color: "border-amber-200 bg-amber-50", text: "text-amber-700",   dot: "bg-amber-400",   filter: "due-soon" },
            { label: "Upcoming",  count: upcoming.length, color: "border-blue-200 bg-blue-50",   text: "text-blue-700",    dot: "bg-blue-400",    filter: "upcoming" },
            { label: "Complete",  count: complete.length, color: "border-emerald-200 bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400", filter: "complete" },
          ].map(({ label, count, color, text, dot, filter }) => (
            <button
              key={label}
              onClick={() => setFilterStatus(filterStatus === filter ? "All" : filter)}
              className={`rounded-2xl border p-4 text-left transition-all hover:shadow-sm active:scale-95 ${color} ${filterStatus === filter ? "ring-2 ring-offset-1 ring-gray-400" : ""}`}
            >
              <div className={`flex items-center gap-2 mb-1`}>
                <div className={`w-2 h-2 rounded-full ${dot}`} />
                <span className={`text-xs font-semibold uppercase tracking-wide ${text}`}>{label}</span>
              </div>
              <p className={`text-2xl font-black ${text}`}>{count}</p>
            </button>
          ))}
        </div>
      )}

      {/* Add / Edit form panel */}
      {(showForm || editTarget) && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-amber-500" />
              {editTarget ? "Edit Compliance Item" : "New Compliance Item"}
            </h2>
            <button onClick={() => { setShowForm(false); setEditTarget(null); }}
              className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <ItemForm
            initial={editTarget ?? undefined}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditTarget(null); }}
            saving={saving}
          />
        </div>
      )}

      {/* Empty state */}
      {!loadingItems && items.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
            <Bell className="w-8 h-8 text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-gray-700 text-base">No compliance items yet</p>
            <p className="text-sm text-gray-400 mt-1 max-w-sm">
              Add license renewals, tax filing deadlines, permit expirations, insurance renewals, and more.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-amber-500 text-white hover:bg-amber-600 shadow transition-colors"
          >
            <Plus className="w-4 h-4" /> Add your first item
          </button>

          {/* Suggested items */}
          <div className="mt-4 w-full max-w-lg">
            <p className="text-xs text-gray-400 mb-3 font-semibold uppercase tracking-wide">Common items for KY contractors</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { title: "KY Contractor License Renewal",    category: "License",    jurisdiction: "State of Kentucky" },
                { title: "Annual Business Report",           category: "Registration", jurisdiction: "KY Secretary of State" },
                { title: "City Occupational Tax License",    category: "License",    jurisdiction: "City" },
                { title: "General Liability Insurance",      category: "Insurance",  jurisdiction: "" },
                { title: "Workers' Comp Policy Renewal",     category: "Insurance",  jurisdiction: "" },
                { title: "Q1 Estimated Tax Payment",         category: "Tax Filing", jurisdiction: "IRS / KY DOR" },
              ].map(s => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => { setEditTarget(null); setShowForm(true); }}
                  className="text-left px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:border-amber-300 hover:bg-amber-50 transition-colors text-xs"
                >
                  <span className="text-base mr-1.5">{categoryIcon(s.category)}</span>
                  <span className="font-medium text-gray-700">{s.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Item list */}
      {!loadingItems && items.length > 0 && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">Filter:</span>
            {["All", ...allCats].map(c => (
              <button key={c} onClick={() => setFilterCat(c)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
                  filterCat === c
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-white text-gray-500 border-gray-200 hover:border-amber-300"
                }`}>
                {c}
              </button>
            ))}
            {filterStatus !== "All" && (
              <button onClick={() => setFilterStatus("All")}
                className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-800 text-white border border-gray-800 flex items-center gap-1">
                <X className="w-3 h-3" /> Clear filter
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="text-center text-gray-400 italic py-8 text-sm">No items match the selected filters.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onEdit={() => { setEditTarget(item); setShowForm(false); }}
                  onDelete={() => handleDelete(item.id)}
                  onToggleComplete={() => handleToggleComplete(item)}
                  canEditCompliance={canEdit("compliance")}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Automated Alerts (existing logic) ── */}
      {!loadingAuto && autoReport && (
        <div className="space-y-4 pt-4 border-t border-border/50">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-accent" /> Automated Alerts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                <CardTitle className="font-display flex items-center text-base">
                  <ShieldAlert className={`w-4 h-4 mr-2 ${autoReport.subcontractor1099Alerts.length > 0 ? "text-accent" : "text-muted-foreground"}`} />
                  1099 Subcontractor Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {autoReport.subcontractor1099Alerts.length === 0 ? (
                  <div className="p-5 text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> No W-9 issues found.
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {autoReport.subcontractor1099Alerts.map((alert, i) => (
                      <div key={i} className="p-4 bg-accent/5">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-bold text-foreground">{alert.name}</span>
                          <span className="text-accent font-bold font-display">{formatCurrency(alert.ytdPayments)}</span>
                        </div>
                        <div className="text-sm text-muted-foreground flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                          {alert.alert}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                <CardTitle className="font-display flex items-center text-base">
                  Mileage Classification
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                {autoReport.uncategorizedMileageCount === 0 ? (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> All trips categorized.
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <div className="text-4xl font-display font-bold text-primary mb-2">{autoReport.uncategorizedMileageCount}</div>
                    <p className="text-sm text-muted-foreground mb-4">Trips missing classification.</p>
                    <button className="text-sm font-medium bg-primary/10 text-primary px-4 py-2 rounded-lg hover:bg-primary/20 transition-colors">
                      Review Trips
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
