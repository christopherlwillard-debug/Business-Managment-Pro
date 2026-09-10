import { useMemo, useState } from "react";
import { CalendarCheck2, Check, CircleHelp, Loader2, Save, X } from "lucide-react";
import type { ScheduleJob } from "@/pages/Jobs";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const REASON_LABELS = {
  pulled_off: "Pulled Off",
  customer_delay: "Customer Delay",
  material_delay: "Material Delay",
  weather: "Weather",
  waiting_on_other_trade: "Waiting on Other Trade",
  other: "Other",
} as const;

type PresenceState = "unrecorded" | "here" | "not_here";
type NotHereReason = keyof typeof REASON_LABELS;

export type JobPresenceRecord = {
  id: number;
  jobId: number;
  date: string;
  state: PresenceState;
  notHereReason: NotHereReason | null;
  notes: string | null;
  source: string;
  provenance: string;
  createdAt: string;
  createdByUserId: string | null;
  createdByName: string | null;
  updatedAt: string;
  updatedByUserId: string | null;
  updatedByName: string | null;
};

export type JobPresenceTiming = {
  expectedDurationDays: number | null;
  actualProductionStartDate: string | null;
  lastWorkDate: string | null;
  calendarSpanDays: number | null;
  actualProductionDays: number;
  pausedNotHereDays: number;
  productionDayVariance: number | null;
};

export type JobPresenceSnapshot = {
  jobId: number;
  records: JobPresenceRecord[];
  timing: JobPresenceTiming;
};

function parseDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateString(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDate(date: string | null): string {
  return date
    ? parseDate(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Not recorded";
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = parseDate(start);
  const last = parseDate(end);
  while (cursor <= last) {
    dates.push(dateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function provenanceLabel(record: JobPresenceRecord): string {
  if (record.provenance === "confirmed" && record.source === "manual_presence") {
    return "Confirmed manually";
  }
  return `${record.provenance.charAt(0).toUpperCase()}${record.provenance.slice(1)}`;
}

function stateLabel(state: PresenceState): string {
  if (state === "here") return "Here";
  if (state === "not_here") return "Not here";
  return "Unrecorded";
}

export function JobPresencePanel({
  job,
  snapshot,
  loading,
  error,
  onSnapshotChange,
}: {
  job: ScheduleJob;
  snapshot: JobPresenceSnapshot | null;
  loading: boolean;
  error: boolean;
  onSnapshotChange: (snapshot: JobPresenceSnapshot) => void;
}) {
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [draftReason, setDraftReason] = useState<NotHereReason | "">("");
  const [draftNotes, setDraftNotes] = useState("");
  const [newDate, setNewDate] = useState("");
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const recordByDate = useMemo(
    () => new Map((snapshot?.records ?? []).map(record => [record.date, record])),
    [snapshot],
  );

  const timeline = useMemo(() => {
    const checklistDates = job.checklistItems
      .map(item => item.scheduledDate)
      .filter((date): date is string => Boolean(date))
      .sort();
    const start = job.startDate ?? checklistDates[0] ?? snapshot?.timing.actualProductionStartDate ?? null;
    const end = job.endDate ?? checklistDates[checklistDates.length - 1] ?? snapshot?.timing.lastWorkDate ?? null;
    if (!start || !end) return [];
    return dateRange(start <= end ? start : end, start <= end ? end : start);
  }, [job, snapshot]);

  async function savePresence(date: string, state: PresenceState, reason: NotHereReason | null = null, notes: string | null = null) {
    setSavingDate(date);
    setSaveError(null);
    try {
      const response = await fetch(`${BASE}/api/jobs/${job.id}/production-presence/${date}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, notHereReason: reason, notes }),
      });
      if (!response.ok) throw new Error("Presence save failed");
      const data = await response.json() as {
        jobId: number;
        record: JobPresenceRecord;
        timing: JobPresenceTiming;
      };
      const records = (snapshot?.records ?? [])
        .filter(record => record.date !== date)
        .concat(data.record)
        .sort((a, b) => a.date.localeCompare(b.date));
      onSnapshotChange({ jobId: data.jobId, records, timing: data.timing });
      setEditingDate(null);
      setDraftReason("");
      setDraftNotes("");
    } catch {
      setSaveError("Could not save this day. Try again.");
    } finally {
      setSavingDate(null);
    }
  }

  function beginNotHere(date: string) {
    const existing = recordByDate.get(date);
    setEditingDate(date);
    setDraftReason(existing?.state === "not_here" ? existing.notHereReason ?? "" : "");
    setDraftNotes(existing?.state === "not_here" ? existing.notes ?? "" : "");
    setSaveError(null);
  }

  const activeRecord = editingDate ? recordByDate.get(editingDate) : undefined;

  return (
    <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-3" data-testid={`job-presence-panel-${job.id}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">
            <CalendarCheck2 className="h-3.5 w-3.5" /> Daily production presence
          </p>
          <p className="mt-1 text-xs text-amber-900/70">
            Mark only what is known. Unrecorded is not the same as not here.
          </p>
        </div>
        {snapshot && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-right text-[11px] text-amber-950/75 sm:grid-cols-4">
            <span><strong>{snapshot.timing.actualProductionDays}</strong> production days</span>
            <span><strong>{snapshot.timing.pausedNotHereDays}</strong> paused days</span>
            <span><strong>{snapshot.timing.calendarSpanDays ?? "—"}</strong> calendar days</span>
            <span>
              <strong>
                {snapshot.timing.productionDayVariance == null
                  ? "—"
                  : `${snapshot.timing.productionDayVariance > 0 ? "+" : ""}${snapshot.timing.productionDayVariance}`}
              </strong>{" "}
              variance
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="mt-3 flex items-center text-xs text-muted-foreground"><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Loading recorded days…</div>
      ) : error ? (
        <p className="mt-3 text-xs font-semibold text-red-700">Presence is unavailable right now.</p>
      ) : snapshot ? (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-amber-200 bg-white/70 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900/60">Actual production start</p>
              <p className="mt-0.5 text-xs font-semibold text-amber-950">{formatDate(snapshot.timing.actualProductionStartDate)}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white/70 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900/60">Last work date</p>
              <p className="mt-0.5 text-xs font-semibold text-amber-950">{formatDate(snapshot.timing.lastWorkDate)}</p>
            </div>
            {snapshot.timing.expectedDurationDays != null && (
              <div className="rounded-xl border border-amber-200 bg-white/70 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900/60">Expected duration</p>
                <p className="mt-0.5 text-xs font-semibold text-amber-950">{snapshot.timing.expectedDurationDays} production days</p>
              </div>
            )}
          </div>

          {timeline.length > 0 ? (
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {timeline.map(date => {
                const record = recordByDate.get(date);
                const state = record?.state ?? "unrecorded";
                const isSaving = savingDate === date;
                return (
                  <div key={date} className="rounded-xl border border-amber-200 bg-white/80 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-foreground">{formatDate(date)}</p>
                      {record && <span className="text-[10px] font-semibold text-amber-800">{provenanceLabel(record)}</span>}
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      {(["unrecorded", "here", "not_here"] as const).map(option => (
                        <button
                          key={option}
                          type="button"
                          disabled={Boolean(savingDate)}
                          onClick={() => option === "not_here"
                            ? beginNotHere(date)
                            : savePresence(date, option)}
                          className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors ${
                            state === option
                              ? option === "here"
                                ? "bg-emerald-600 text-white"
                                : option === "not_here"
                                  ? "bg-orange-600 text-white"
                                  : "bg-slate-200 text-slate-800"
                              : "border border-border bg-background text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {isSaving && state === option ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : stateLabel(option)}
                        </button>
                      ))}
                    </div>
                    {state === "not_here" && record?.notHereReason && (
                      <p className="mt-1.5 text-[10px] text-orange-800">
                        {REASON_LABELS[record.notHereReason]}{record.notes ? ` · ${record.notes}` : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-amber-300 bg-white/60 p-3">
              <p className="text-xs text-amber-900/75">This job has no existing job or checklist date. Choose a production date to begin recording.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input type="date" value={newDate} onChange={event => setNewDate(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs" />
                <button type="button" disabled={!newDate || Boolean(savingDate)} onClick={() => savePresence(newDate, "here")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                  Record Here
                </button>
                <button type="button" disabled={!newDate || Boolean(savingDate)} onClick={() => beginNotHere(newDate)} className="rounded-lg border border-orange-300 px-3 py-1.5 text-xs font-bold text-orange-800 disabled:opacity-50">
                  Record Not Here
                </button>
              </div>
            </div>
          )}

          {editingDate && (
            <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-orange-950">Not here on {formatDate(editingDate)}</p>
                <button type="button" onClick={() => setEditingDate(null)} className="rounded-md p-1 text-orange-800 hover:bg-orange-100" aria-label="Close not-here editor"><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
                <label className="text-[11px] font-bold text-orange-950">
                  Reason
                  <select value={draftReason} onChange={event => setDraftReason(event.target.value as NotHereReason | "")} className="mt-1 w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-xs font-normal">
                    <option value="">No reason recorded</option>
                    {Object.entries(REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="text-[11px] font-bold text-orange-950">
                  Notes
                  <input value={draftNotes} onChange={event => setDraftNotes(event.target.value)} maxLength={2000} placeholder="Optional note" className="mt-1 w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-xs font-normal" />
                </label>
                <button type="button" disabled={Boolean(savingDate)} onClick={() => savePresence(editingDate, "not_here", draftReason || null, draftNotes.trim() || null)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                  {savingDate === editingDate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </button>
              </div>
              {activeRecord?.provenance && <p className="mt-2 text-[10px] text-orange-900/70">Saving will retain confirmed manual provenance for this day.</p>}
            </div>
          )}
          {saveError && <p className="mt-2 text-xs font-semibold text-red-700">{saveError}</p>}
          <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <CircleHelp className="h-3 w-3" /> Only Here days count as actual production days. No hours are required or created.
          </p>
        </>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">No presence record is available for this job.</p>
      )}
    </section>
  );
}