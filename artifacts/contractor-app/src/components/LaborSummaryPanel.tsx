import { useState } from "react";
import { Users, Plus, Trash2, Clock } from "lucide-react";
import {
  useJobLaborEntries,
  useAddLaborEntry,
  useDeleteLaborEntry,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

function fmtHrs(n: number | string | null | undefined) {
  if (n == null || n === "") return "—";
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(v)) return "—";
  return v % 1 === 0 ? `${v} hrs` : `${v.toFixed(1)} hrs`;
}

const EMPTY_FORM = { workers: "1", days: "1", hrsPerDay: "", travelHrsPerDay: "" };

interface Props {
  jobId: number;
  compact?: boolean;
}

export function LaborSummaryPanel({ jobId, compact = false }: Props) {
  const { toast } = useToast();
  const { data, isLoading } = useJobLaborEntries(jobId);
  const addEntry = useAddLaborEntry();
  const deleteEntry = useDeleteLaborEntry();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const entries = data?.entries ?? [];
  const summary = data?.summary ?? { crewCount: 0, totalProductiveHours: 0, totalTravelHours: 0, totalHours: 0 };

  const workers = Math.max(1, parseInt(form.workers) || 1);
  const days = Math.max(1, parseInt(form.days) || 1);
  const hrsPerDay = parseFloat(form.hrsPerDay) || 0;
  const travelPerDay = parseFloat(form.travelHrsPerDay) || 0;
  const previewProductive = workers * days * hrsPerDay;
  const previewTravel = workers * days * travelPerDay;
  const canAdd = hrsPerDay > 0 || travelPerDay > 0;

  async function handleAdd() {
    if (!canAdd) return;
    try {
      const label = `${workers} worker${workers !== 1 ? "s" : ""} · ${days} day${days !== 1 ? "s" : ""}`;
      await addEntry.mutateAsync({
        jobId,
        personName: label,
        workerType: "sub",
        productiveHours: previewProductive,
        travelHours: previewTravel,
        linkedSubcontractorId: null,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      toast({ title: "Crew time logged" });
    } catch {
      toast({ title: "Failed to log crew time", variant: "destructive" });
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-sm text-foreground">Labor Summary</span>
          {entries.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {entries.length}
            </span>
          )}
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-amber-600 hover:bg-amber-50 transition-colors"
          >
            <Plus className="w-3 h-3" /> Log Crew Time
          </button>
        )}
      </div>

      {/* Summary tiles */}
      {entries.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/30 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Workers</p>
            <p className="font-bold text-sm text-foreground">{summary.crewCount}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-amber-600">Work</p>
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
        <div className="border border-amber-200 rounded-xl p-3 bg-amber-50/40 space-y-3">
          <p className="text-xs font-semibold text-amber-700">Log Crew Time</p>

          {/* Row 1: Workers + Days */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">Workers</label>
              <input
                autoFocus
                type="number" min="1" step="1"
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-background text-center font-medium"
                value={form.workers}
                onChange={e => setForm(f => ({ ...f, workers: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">Days on Job</label>
              <input
                type="number" min="1" step="1"
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-background text-center font-medium"
                value={form.days}
                onChange={e => setForm(f => ({ ...f, days: e.target.value }))}
              />
            </div>
          </div>

          {/* Row 2: Work hrs/day + Travel hrs/day */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">Work Hrs / Day</label>
              <input
                type="number" min="0" step="0.5"
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-background text-center font-medium"
                placeholder="0"
                value={form.hrsPerDay}
                onChange={e => setForm(f => ({ ...f, hrsPerDay: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">Travel Hrs / Day</label>
              <input
                type="number" min="0" step="0.5"
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-background text-center font-medium"
                placeholder="0"
                value={form.travelHrsPerDay}
                onChange={e => setForm(f => ({ ...f, travelHrsPerDay: e.target.value }))}
              />
            </div>
          </div>

          {/* Live preview */}
          {canAdd && (
            <div className="flex gap-2 text-[11px] font-semibold rounded-lg bg-white border border-amber-200 px-3 py-2">
              <span className="text-amber-700 flex-1">
                {workers} × {days} days
                {hrsPerDay > 0 && ` = ${fmtHrs(previewProductive)} work`}
                {travelPerDay > 0 && ` + ${fmtHrs(previewTravel)} travel`}
              </span>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
              className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/50 text-muted-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!canAdd || addEntry.isPending}
              className="px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50"
            >
              {addEntry.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Entries list */}
      {entries.length === 0 && !showForm ? (
        <div className="py-4 text-center text-xs text-muted-foreground">
          <Clock className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1.5" />
          No crew time logged yet.
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/10 group">
              <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Users className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{entry.personName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {fmtHrs(entry.productiveHours)} work
                  {parseFloat(entry.travelHours) > 0 && ` · ${fmtHrs(entry.travelHours)} travel`}
                </p>
              </div>
              <button
                onClick={() => handleDelete(entry.id)}
                className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Total footer */}
      {entries.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/20 border border-border text-xs">
          <span className="font-semibold text-foreground">
            {fmtHrs(summary.totalProductiveHours)} work
          </span>
          {summary.totalTravelHours > 0 && (
            <span className="text-muted-foreground">+ {fmtHrs(summary.totalTravelHours)} travel</span>
          )}
        </div>
      )}
    </div>
  );
}
