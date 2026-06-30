import { useState } from "react";
import { Users, Plus, Trash2, Pencil, Clock, CheckCircle2 } from "lucide-react";
import {
  useJobLaborEntries,
  useAddLaborEntry,
  usePatchLaborEntry,
  useDeleteLaborEntry,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const WORKER_TYPES: { value: string; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "profit_share", label: "Profit Share" },
  { value: "sub", label: "Subcontractor" },
  { value: "hourly", label: "Hourly" },
  { value: "helper", label: "Helper" },
];

function fmtHrs(n: number | string | null | undefined) {
  if (n == null || n === "") return "—";
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(v)) return "—";
  return v.toFixed(1) + " hrs";
}

const EMPTY_FORM = { personName: "", workerType: "sub", productiveHours: "", travelHours: "" };

interface Props {
  jobId: number;
  compact?: boolean;
}

export function LaborSummaryPanel({ jobId, compact = false }: Props) {
  const { toast } = useToast();
  const { data, isLoading } = useJobLaborEntries(jobId);
  const addEntry = useAddLaborEntry();
  const patchEntry = usePatchLaborEntry();
  const deleteEntry = useDeleteLaborEntry();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  const entries = data?.entries ?? [];
  const summary = data?.summary ?? { crewCount: 0, totalProductiveHours: 0, totalTravelHours: 0, totalHours: 0 };

  async function handleAdd() {
    if (!form.personName.trim()) return;
    try {
      await addEntry.mutateAsync({
        jobId,
        personName: form.personName.trim(),
        workerType: form.workerType,
        productiveHours: parseFloat(form.productiveHours || "0") || 0,
        travelHours: parseFloat(form.travelHours || "0") || 0,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      toast({ title: "Crew member added" });
    } catch {
      toast({ title: "Failed to add entry", variant: "destructive" });
    }
  }

  function startEdit(entry: NonNullable<typeof data>["entries"][0]) {
    setEditingId(entry.id);
    setEditForm({
      personName: entry.personName,
      workerType: entry.workerType,
      productiveHours: entry.productiveHours,
      travelHours: entry.travelHours,
    });
  }

  async function handleSaveEdit() {
    if (!editingId || !editForm.personName.trim()) return;
    try {
      await patchEntry.mutateAsync({
        jobId,
        id: editingId,
        personName: editForm.personName.trim(),
        workerType: editForm.workerType,
        productiveHours: parseFloat(editForm.productiveHours || "0") || 0,
        travelHours: parseFloat(editForm.travelHours || "0") || 0,
      });
      setEditingId(null);
      toast({ title: "Updated" });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteEntry.mutateAsync({ jobId, id });
      toast({ title: "Removed" });
    } catch {
      toast({ title: "Failed to remove", variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        Loading labor summary…
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${compact ? "" : "mt-1"}`}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-sm text-foreground">Labor Summary</span>
          {entries.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{entries.length}</span>
          )}
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-amber-600 hover:bg-amber-50 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add Crew
          </button>
        )}
      </div>

      {/* Summary tiles */}
      {entries.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/30 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Crew Size</p>
            <p className="font-bold text-sm text-foreground">{summary.crewCount}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-amber-600">Productive</p>
            <p className="font-bold text-sm text-amber-700">{fmtHrs(summary.totalProductiveHours)}</p>
          </div>
          <div className="bg-muted/30 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Travel</p>
            <p className="font-bold text-sm text-foreground">{fmtHrs(summary.totalTravelHours)}</p>
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="border border-amber-200 rounded-xl p-3 bg-amber-50/40 space-y-2.5">
          <p className="text-xs font-semibold text-amber-700">Add Crew Member</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">Name</label>
              <input
                autoFocus
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background"
                placeholder="e.g. John D."
                value={form.personName}
                onChange={e => setForm(f => ({ ...f, personName: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setShowForm(false); setForm(EMPTY_FORM); } }}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">Type</label>
              <select
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background"
                value={form.workerType}
                onChange={e => setForm(f => ({ ...f, workerType: e.target.value }))}
              >
                {WORKER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">Productive Hrs</label>
              <input
                type="number" min="0" step="0.5"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background"
                placeholder="0"
                value={form.productiveHours}
                onChange={e => setForm(f => ({ ...f, productiveHours: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">Travel Hrs</label>
              <input
                type="number" min="0" step="0.5"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background"
                placeholder="0"
                value={form.travelHours}
                onChange={e => setForm(f => ({ ...f, travelHours: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
              className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/50 text-muted-foreground">
              Cancel
            </button>
            <button onClick={handleAdd} disabled={!form.personName.trim() || addEntry.isPending}
              className="px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50">
              {addEntry.isPending ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* Entries list */}
      {entries.length === 0 && !showForm ? (
        <div className="py-4 text-center text-xs text-muted-foreground">
          <Clock className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1.5" />
          No crew members logged yet.
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map(entry => (
            editingId === entry.id ? (
              <div key={entry.id} className="border border-amber-200 rounded-xl p-3 bg-amber-50/30 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground">Name</label>
                    <input autoFocus className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background"
                      value={editForm.personName} onChange={e => setEditForm(f => ({ ...f, personName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground">Type</label>
                    <select className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background"
                      value={editForm.workerType} onChange={e => setEditForm(f => ({ ...f, workerType: e.target.value }))}>
                      {WORKER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground">Productive Hrs</label>
                    <input type="number" min="0" step="0.5" className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background"
                      value={editForm.productiveHours} onChange={e => setEditForm(f => ({ ...f, productiveHours: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground">Travel Hrs</label>
                    <input type="number" min="0" step="0.5" className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background"
                      value={editForm.travelHours} onChange={e => setEditForm(f => ({ ...f, travelHours: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditingId(null)} className="px-3 py-1 text-xs rounded-lg border border-border hover:bg-muted/50 text-muted-foreground">Cancel</button>
                  <button onClick={handleSaveEdit} disabled={patchEntry.isPending}
                    className="px-3 py-1 text-xs rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50">
                    {patchEntry.isPending ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/10 group">
                <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-amber-700">{entry.personName.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{entry.personName}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{WORKER_TYPES.find(t => t.value === entry.workerType)?.label ?? entry.workerType}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-foreground">{fmtHrs(entry.productiveHours)}</p>
                  {parseFloat(entry.travelHours) > 0 && (
                    <p className="text-[10px] text-muted-foreground">+{fmtHrs(entry.travelHours)} travel</p>
                  )}
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEdit(entry)} className="p-1 rounded hover:bg-amber-50 text-muted-foreground hover:text-amber-600 transition-colors">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => handleDelete(entry.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {/* Total row */}
      {entries.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/20 border border-border">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-foreground">{summary.crewCount} crew · {fmtHrs(summary.totalProductiveHours)} productive</span>
          </div>
          {summary.totalTravelHours > 0 && (
            <span className="text-[10px] text-muted-foreground">+ {fmtHrs(summary.totalTravelHours)} travel</span>
          )}
        </div>
      )}
    </div>
  );
}
