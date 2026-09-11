import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Layers3,
  ListTodo,
  Play,
  Settings2,
  Users,
  X,
} from "lucide-react";
import type { Job } from "@workspace/api-client-react";
import type { ScheduleJob } from "@/pages/Jobs";
import { localDateString } from "@/lib/utils";
import { JobPresencePanel, type JobPresenceSnapshot } from "./JobPresencePanel";
import { JobScheduleHistory } from "./JobScheduleHistory";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type ScheduleItem = ScheduleJob["checklistItems"][number];
type PlannerView = "week" | "month" | "agenda";

type PlannerEntry = {
  key: string;
  startDate: string;
  endDate: string;
  job: ScheduleJob;
  item?: ScheduleItem;
};

type ChecklistSummary = {
  completedItems?: number;
  totalItems?: number;
  overallPercent?: number;
};

function scheduleDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function scheduleDateString(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addScheduleDays(date: string, amount: number): string {
  const next = scheduleDate(date);
  next.setDate(next.getDate() + amount);
  return scheduleDateString(next);
}

function startOfScheduleWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  return result;
}

function formatScheduleDate(date: string): string {
  return scheduleDate(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatScheduleMonth(date: string): string {
  return scheduleDate(date).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function formatResourceDemand(value: string | null | undefined): string | null {
  if (!value || value === "standard") return null;
  return value === "large_crew" ? "Large crew" : "All hands";
}

function formatPlanningState(value: string | null | undefined): string {
  return value === "queue" ? "Queued" : formatLabel(value) ?? "Scheduled";
}

function getPlannerStage(job: ScheduleJob, item?: ScheduleItem): string {
  if (item?.sectionName) return item.sectionName;
  const nextSection = job.checklistItems.find(value => !value.completed && !value.skipped && value.sectionName);
  if (nextSection?.sectionName) return nextSection.sectionName;
  return formatLabel(job.jobType) ?? formatPlanningState(job.planningState);
}

function getBlocker(job: Job): string | null {
  const condition = (job as unknown as Record<string, unknown>).activeReadinessCondition;
  if (!condition || typeof condition !== "object") return null;
  const blocker = condition as { reason?: string; detail?: string | null };
  return blocker.detail?.trim() || formatLabel(blocker.reason) || "Readiness blocker";
}

function intersects(entry: PlannerEntry, startDate: string, endDate: string): boolean {
  return entry.endDate >= startDate && entry.startDate <= endDate;
}

function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  for (const date = scheduleDate(startDate); date <= scheduleDate(endDate); date.setDate(date.getDate() + 1)) {
    dates.push(scheduleDateString(new Date(date)));
  }
  return dates;
}

function createPlannerEntries(jobs: ScheduleJob[]): PlannerEntry[] {
  const entries: PlannerEntry[] = [];

  for (const job of jobs) {
    const rawStart = job.startDate ?? job.endDate;
    const rawEnd = job.endDate ?? job.startDate;
    const startDate = rawStart && rawEnd && rawStart <= rawEnd ? rawStart : rawEnd;
    const endDate = rawStart && rawEnd && rawStart <= rawEnd ? rawEnd : rawStart;
    const jobEntry = startDate && endDate
      ? { key: `job-${job.id}`, startDate, endDate, job }
      : null;

    if (jobEntry) entries.push(jobEntry);

    for (const item of job.checklistItems) {
      if (!item.scheduledDate) continue;
      if (jobEntry && item.scheduledDate >= jobEntry.startDate && item.scheduledDate <= jobEntry.endDate) continue;
      entries.push({
        key: `item-${item.id}`,
        startDate: item.scheduledDate,
        endDate: item.scheduledDate,
        job,
        item,
      });
    }
  }

  return entries.sort((a, b) =>
    a.startDate.localeCompare(b.startDate) ||
    a.endDate.localeCompare(b.endDate) ||
    a.job.title.localeCompare(b.job.title)
  );
}

function entryDisplayDate(entry: PlannerEntry, cursor: string): string {
  return entry.startDate < cursor ? cursor : entry.startDate;
}

function rangeLabel(entry: PlannerEntry): string {
  if (entry.startDate === entry.endDate) return formatScheduleDate(entry.startDate);
  return `${formatScheduleDate(entry.startDate)} – ${formatScheduleDate(entry.endDate)}`;
}

function ActiveJobPresence({
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
  const [isInteractionBusy, setIsInteractionBusy] = useState(false);
  const interactionBusyRef = useRef(false);
  const handleInteractionStateChange = useCallback((isBusy: boolean) => {
    interactionBusyRef.current = isBusy;
    setIsInteractionBusy(isBusy);
  }, []);

  useEffect(() => {
    if (loading || error || isInteractionBusy) return;
    const controller = new AbortController();

    async function refreshSnapshot() {
      if (interactionBusyRef.current || document.visibilityState === "hidden") return;
      try {
        const response = await fetch(`${BASE}/api/jobs/production-presence?jobIds=${job.id}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Production presence refresh failed");
        const data = await response.json() as { jobs: JobPresenceSnapshot[] };
        const nextSnapshot = data.jobs.find(candidate => candidate.jobId === job.id);
        if (!nextSnapshot || controller.signal.aborted || interactionBusyRef.current) return;
        onSnapshotChange(nextSnapshot);
      } catch {
        // Keep the last known snapshot when a background refresh fails.
      }
    }

    let interval: number | null = null;
    const stopInterval = () => {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    };
    const startInterval = () => {
      stopInterval();
      if (document.visibilityState !== "hidden") {
        interval = window.setInterval(() => { void refreshSnapshot(); }, 30_000);
      }
    };
    const refreshOnFocus = () => { void refreshSnapshot(); };
    const refreshOnVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopInterval();
      } else {
        startInterval();
        void refreshSnapshot();
      }
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisibilityChange);
    startInterval();
    return () => {
      controller.abort();
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibilityChange);
      stopInterval();
    };
  }, [error, isInteractionBusy, job.id, loading, onSnapshotChange]);

  return (
    <JobPresencePanel
      job={job}
      snapshot={snapshot}
      loading={loading}
      error={error}
      onSnapshotChange={onSnapshotChange}
      onInteractionStateChange={handleInteractionStateChange}
    />
  );
}

type PresenceState = "unrecorded" | "here" | "not_here";

function todayPresenceState(snapshot: JobPresenceSnapshot | undefined, today: string): PresenceState | null {
  if (!snapshot) return null;
  return snapshot.records.find(record => record.date === today)?.state ?? "unrecorded";
}

function presenceStatusLabel(state: PresenceState): string {
  if (state === "here") return "Here today";
  if (state === "not_here") return "Not here today";
  return "Unrecorded today";
}

function presenceStatusClassName(state: PresenceState): string {
  if (state === "here") return "bg-emerald-100 text-emerald-800";
  if (state === "not_here") return "bg-orange-100 text-orange-800";
  return "bg-slate-100 text-slate-700";
}

function ReadyToStartArea({
  readyJobs,
  waitingJobs,
  loading,
  error,
  onStarted,
}: {
  readyJobs: ScheduleJob[];
  waitingJobs: ScheduleJob[];
  loading: boolean;
  error: boolean;
  onStarted: () => void;
}) {
  const today = localDateString();
  const [selectedJob, setSelectedJob] = useState<ScheduleJob | null>(null);
  const [startMode, setStartMode] = useState<"today" | "specific">("today");
  const [specificDate, setSpecificDate] = useState(today);
  const [starting, setStarting] = useState(false);
  const { toast } = useToast();

  function openStartDialog(job: ScheduleJob) {
    setSelectedJob(job);
    setStartMode("today");
    setSpecificDate(today);
  }

  async function handleStartJob() {
    if (!selectedJob) return;
    const startDate = startMode === "today" ? today : specificDate;
    if (!startDate) return;
    setStarting(true);
    try {
      const response = await fetch(`${BASE}/api/jobs/${selectedJob.id}/start`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "The job could not be started");
      toast({ title: "Job moved to Active Schedule", description: `${selectedJob.title} starts ${formatScheduleDate(startDate)}.` });
      setSelectedJob(null);
      onStarted();
    } catch (error) {
      toast({
        title: "Job was not started",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setStarting(false);
    }
  }

  function renderComponents(job: ScheduleJob) {
    const components = job.productionComponents ?? [];
    if (components.length === 0) {
      return <p className="text-xs text-slate-500">No production components captured for this job.</p>;
    }
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {components.map(component => (
          <span key={component.componentInstanceKey} className="rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
            {component.componentLabel}{component.variant ? ` · ${component.variant.toUpperCase()}` : ""}
          </span>
        ))}
      </div>
    );
  }

  function renderNotes(job: ScheduleJob, tone: "ready" | "waiting") {
    const blocker = getBlocker(job);
    const notes = job.notes?.trim();
    if (!blocker && !notes) return null;
    return (
      <div className={`mt-2 space-y-1 text-xs ${tone === "waiting" ? "text-orange-900" : "text-slate-600"}`}>
        {blocker && <p><span className="font-bold">Dependency:</span> {blocker}</p>}
        {notes && <p><span className="font-bold">Job notes:</span> {notes}</p>}
      </div>
    );
  }

  return (
    <section className="border-t border-border bg-slate-50/70 px-4 py-5 sm:px-7" data-testid="planner-ready-to-start">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">Scheduling follow-up</p>
          <h3 className="mt-1 text-lg font-bold text-slate-950">Ready to Start / No Start Date</h3>
          <p className="mt-1 max-w-2xl text-xs text-slate-600">
            Start a job only when it is ready to work. Starting assigns a real calendar date and does not record daily presence or clear readiness blockers.
          </p>
        </div>
        {!loading && !error && (
          <span className="text-xs font-bold text-slate-500">
            {readyJobs.length} ready · {waitingJobs.length} waiting
          </span>
        )}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading jobs without start dates…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-700">Could not load jobs without start dates.</p>
      ) : (
        <>
          {readyJobs.length > 0 ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {readyJobs.map(job => (
                <article key={job.id} className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="truncate font-bold text-slate-950">{job.title}</h4>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">
                        {job.endDate ? `Planned end: ${formatScheduleDate(job.endDate)}` : "No planned end date"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">Queue #{job.queueOrder ?? "—"}</span>
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Ready</span>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Production components</p>
                  {renderComponents(job)}
                  {renderNotes(job, "ready")}
                  <button
                    type="button"
                    onClick={() => openStartDialog(job)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-800"
                    data-testid={`start-job-${job.id}`}
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Start Job
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-white/70 px-4 py-3 text-sm text-slate-600">
              No ready jobs are waiting for a start date.
            </p>
          )}

          {waitingJobs.length > 0 && (
            <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50/70 p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-700" />
                <h4 className="text-sm font-bold text-orange-950">Waiting on a dependency</h4>
              </div>
              <p className="mt-1 text-xs text-orange-800">
                These jobs stay out of Active Schedule until their readiness state is resolved. Starting them here would not clear the dependency.
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {waitingJobs.map(job => (
                  <div key={job.id} className="rounded-xl border border-orange-200 bg-white/80 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-bold text-orange-950">{job.title}</p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase text-slate-500">#{job.queueOrder ?? "—"}</span>
                        <span className="text-[10px] font-bold uppercase text-orange-700">Waiting</span>
                      </div>
                    </div>
                    {renderComponents(job)}
                    {renderNotes(job, "waiting")}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Close start job dialog" className="absolute inset-0 bg-black/60" onClick={() => !starting && setSelectedJob(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl" data-testid="start-job-dialog">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Start Job</p>
                <h4 className="mt-1 text-lg font-bold text-foreground">{selectedJob.title}</h4>
              </div>
              <button type="button" onClick={() => !starting && setSelectedJob(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label="Close start job dialog">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Choose the actual date this job should enter Active Schedule. This will not create a presence record.
            </p>
            <div className="mt-4 grid gap-2">
              <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${startMode === "today" ? "border-emerald-300 bg-emerald-50" : "border-border"}`}>
                <input type="radio" name="start-date-mode" checked={startMode === "today"} onChange={() => setStartMode("today")} />
                <span className="font-semibold">Today ({formatScheduleDate(today)})</span>
              </label>
              <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${startMode === "specific" ? "border-emerald-300 bg-emerald-50" : "border-border"}`}>
                <input type="radio" name="start-date-mode" checked={startMode === "specific"} onChange={() => setStartMode("specific")} />
                <span className="font-semibold">Specific date</span>
              </label>
              {startMode === "specific" && (
                <input
                  type="date"
                  value={specificDate}
                  onChange={event => setSpecificDate(event.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  aria-label="Specific actual start date"
                />
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setSelectedJob(null)} disabled={starting} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted">
                Cancel
              </button>
              <button type="button" onClick={() => void handleStartJob()} disabled={starting || (startMode === "specific" && !specificDate)} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50" data-testid="confirm-start-job">
                {starting ? "Starting…" : "Start Job"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function JobsPlanner({
  businessId,
  allJobs,
  onOpenChecklist,
  onOpenJob,
  onOpenPlanning,
  checklistSummaries,
  onLoaded,
  refreshKey,
}: {
  businessId?: number;
  allJobs: Job[];
  onOpenChecklist: (job: Job) => void;
  onOpenJob: (job: Job) => void;
  onOpenPlanning: (job: ScheduleJob) => void;
  checklistSummaries: Record<number, ChecklistSummary>;
  onLoaded: (jobs: ScheduleJob[]) => void;
  refreshKey: number;
}) {
  const today = localDateString();
  const [schedule, setSchedule] = useState<{ jobs: ScheduleJob[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [scheduleMode, setScheduleMode] = useState<"active" | "history">("active");
  const [view, setView] = useState<PlannerView>("week");
  const [cursor, setCursor] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [readyToStartJobs, setReadyToStartJobs] = useState<ScheduleJob[]>([]);
  const [waitingToStartJobs, setWaitingToStartJobs] = useState<ScheduleJob[]>([]);
  const [readyToStartLoading, setReadyToStartLoading] = useState(true);
  const [readyToStartError, setReadyToStartError] = useState(false);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const [presenceJobId, setPresenceJobId] = useState<number | null>(null);
  const [presenceSnapshots, setPresenceSnapshots] = useState<Record<number, JobPresenceSnapshot>>({});
  const [presenceLoading, setPresenceLoading] = useState(false);
  const [presenceError, setPresenceError] = useState(false);
  const requestEnd = addScheduleDays(today, 180);
  const updatePresenceSnapshot = useCallback((nextSnapshot: JobPresenceSnapshot) => {
    setPresenceSnapshots(current => ({
      ...current,
      [nextSnapshot.jobId]: nextSnapshot,
    }));
  }, []);

  useEffect(() => {
    if (scheduleMode !== "active") return;
    const controller = new AbortController();
    const params = new URLSearchParams({ from: today, to: requestEnd });
    if (businessId != null) params.set("businessId", String(businessId));
    setLoading(true);
    setError(false);
    setPresenceLoading(true);
    setPresenceError(false);
    setPresenceSnapshots({});
    fetch(`${BASE}/api/jobs/schedule-overview?${params.toString()}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(response =>
        response.ok
          ? response.json() as Promise<{ jobs: ScheduleJob[] }>
          : Promise.reject(new Error("Schedule request failed"))
      )
      .then(data => {
        setSchedule(data);
        onLoaded(data.jobs);

        const jobIds = Array.from(new Set(data.jobs.map(job => job.id)));
        if (jobIds.length === 0) {
          setPresenceSnapshots({});
          setPresenceLoading(false);
          return;
        }

        const chunks: number[][] = [];
        for (let index = 0; index < jobIds.length; index += 100) {
          chunks.push(jobIds.slice(index, index + 100));
        }
        return Promise.all(chunks.map(chunk =>
          fetch(`${BASE}/api/jobs/production-presence?jobIds=${chunk.join(",")}`, {
            credentials: "include",
            signal: controller.signal,
          }).then(response =>
            response.ok
              ? response.json() as Promise<{ jobs: JobPresenceSnapshot[] }>
              : Promise.reject(new Error("Production presence request failed"))
          )
        )).then(payloads => {
          const nextSnapshots: Record<number, JobPresenceSnapshot> = {};
          for (const payload of payloads) {
            for (const snapshot of payload.jobs) nextSnapshots[snapshot.jobId] = snapshot;
          }
          if (!controller.signal.aborted) setPresenceSnapshots(nextSnapshots);
        }).catch(() => {
          if (!controller.signal.aborted) {
            setPresenceSnapshots({});
            setPresenceError(true);
          }
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSchedule(null);
          onLoaded([]);
          setError(true);
          setPresenceSnapshots({});
          setPresenceError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setPresenceLoading(false);
        }
      });
    return () => controller.abort();
    // onLoaded is intentionally excluded so parent renders do not refetch the schedule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, today, requestEnd, retryKey, refreshKey, localRefreshKey, scheduleMode]);

  useEffect(() => {
    if (scheduleMode !== "active") return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (businessId != null) params.set("businessId", String(businessId));
    setReadyToStartLoading(true);
    setReadyToStartError(false);
    fetch(`${BASE}/api/jobs/ready-to-start${params.toString() ? `?${params.toString()}` : ""}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(response =>
        response.ok
          ? response.json() as Promise<{ readyJobs: ScheduleJob[]; waitingJobs: ScheduleJob[] }>
          : Promise.reject(new Error("Ready-to-start request failed"))
      )
      .then(data => {
        if (controller.signal.aborted) return;
        setReadyToStartJobs(data.readyJobs);
        setWaitingToStartJobs(data.waitingJobs);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setReadyToStartJobs([]);
          setWaitingToStartJobs([]);
          setReadyToStartError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setReadyToStartLoading(false);
      });
    return () => controller.abort();
  }, [businessId, localRefreshKey, scheduleMode]);

  const scheduleJobs = schedule?.jobs ?? [];
  const entries = useMemo(() => createPlannerEntries(scheduleJobs), [scheduleJobs]);
  const baseJobsById = useMemo(() => new Map(allJobs.map(job => [job.id, job])), [allJobs]);

  const weekDates = useMemo(() => {
    const start = startOfScheduleWeek(scheduleDate(cursor));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      return scheduleDateString(date);
    });
  }, [cursor]);

  const monthDates = useMemo(() => {
    const monthStart = scheduleDate(`${cursor.slice(0, 7)}-01`);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const gridStart = startOfScheduleWeek(monthStart);
    const gridEnd = new Date(startOfScheduleWeek(monthEnd));
    gridEnd.setDate(gridEnd.getDate() + 6);
    const dates: string[] = [];
    for (const date = new Date(gridStart); date <= gridEnd; date.setDate(date.getDate() + 1)) {
      dates.push(scheduleDateString(new Date(date)));
    }
    return dates;
  }, [cursor]);

  const weekEntries = useMemo(() => {
    const weekStart = weekDates[0];
    const weekEnd = weekDates[6];
    const laneEnds: string[] = [];
    return entries
      .filter(entry => intersects(entry, weekStart, weekEnd))
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate))
      .map(entry => {
        const lane = laneEnds.findIndex(endDate => endDate < entry.startDate);
        const laneIndex = lane === -1 ? laneEnds.length : lane;
        laneEnds[laneIndex] = entry.endDate;
        const startIndex = weekDates.findIndex(date => date >= entry.startDate);
        const endIndex = weekDates.reduce((last, date, index) => date <= entry.endDate ? index : last, -1);
        return {
          entry,
          lane: laneIndex,
          startIndex: Math.max(0, startIndex === -1 ? 0 : startIndex),
          endIndex: Math.min(6, endIndex === -1 ? 6 : endIndex),
        };
      });
  }, [entries, weekDates]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, PlannerEntry[]>();
    for (const entry of entries) {
      for (const date of dateRange(entry.startDate, entry.endDate)) {
        const dateEntries = map.get(date) ?? [];
        dateEntries.push(entry);
        map.set(date, dateEntries);
      }
    }
    return map;
  }, [entries]);

  const agendaDates = useMemo(() => {
    const dates = new Set<string>();
    for (const entry of entries) {
      if (entry.endDate >= cursor) dates.add(entryDisplayDate(entry, cursor));
    }
    return Array.from(dates).sort().slice(0, 30);
  }, [entries, cursor]);

  const unscheduledJobs = useMemo(() =>
    scheduleJobs
      .filter(job => !job.startDate && !job.endDate && job.planningState !== "waiting")
      .sort((a, b) => {
        const aPosition = a.queuePosition ?? Number.MAX_SAFE_INTEGER;
        const bPosition = b.queuePosition ?? Number.MAX_SAFE_INTEGER;
        return aPosition - bPosition || a.title.localeCompare(b.title);
      }),
  [scheduleJobs]);

  const waitingJobs = useMemo(() =>
    scheduleJobs.filter(job => job.planningState === "waiting"),
  [scheduleJobs]);

  const workload = useMemo(() => {
    const weekStart = weekDates[0];
    const weekEnd = weekDates[6];
    const weekJobs = scheduleJobs.filter(job => {
      const start = job.startDate ?? job.endDate;
      const end = job.endDate ?? job.startDate;
      return start && end && end >= weekStart && start <= weekEnd;
    });
    const scheduledDays = weekJobs.reduce((total, job) => {
      const start = job.startDate && job.startDate > weekStart ? job.startDate : weekStart;
      const end = job.endDate && job.endDate < weekEnd ? job.endDate : weekEnd;
      return total + dateRange(start, end).length;
    }, 0);
    const higherDemand = weekJobs.filter(job => job.resourceDemand && job.resourceDemand !== "standard").length;
    return { jobCount: weekJobs.length, scheduledDays, higherDemand };
  }, [scheduleJobs, weekDates]);

  if (scheduleMode === "history") {
    return (
      <JobScheduleHistory
        businessId={businessId}
        onOpenActive={() => setScheduleMode("active")}
      />
    );
  }

  function shiftPlanner(amount: number) {
    const date = scheduleDate(cursor);
    if (view === "week") date.setDate(date.getDate() + amount * 7);
    else if (view === "month") date.setMonth(date.getMonth() + amount);
    else date.setDate(date.getDate() + amount * 30);
    const nextCursor = scheduleDateString(date);
    setCursor(nextCursor);
    if (view === "month") setSelectedDate(`${nextCursor.slice(0, 7)}-01`);
  }

  function openEntry(entry: PlannerEntry) {
    if (entry.item) onOpenChecklist(entry.job);
    else onOpenJob(entry.job);
  }

  function renderEntry(entry: PlannerEntry, compact = false) {
    const isChecklist = Boolean(entry.item);
    const progress = checklistSummaries[entry.job.id]?.overallPercent;
    const stage = getPlannerStage(entry.job, entry.item);
    const jobType = formatLabel(entry.job.jobType);
    const secondaryLabel = isChecklist
      ? entry.item?.title
      : jobType && jobType !== stage
        ? `${jobType} · ${stage}`
        : stage;
    const priority = entry.job.priority === "urgent" || entry.job.priority === "high" ? entry.job.priority : null;
    const resourceDemand = formatResourceDemand(entry.job.resourceDemand);
    const sourceJob = baseJobsById.get(entry.job.id) ?? entry.job;
    const blocker = getBlocker(sourceJob);
    const presenceSnapshot = presenceSnapshots[entry.job.id];
    const presenceState = isChecklist ? null : todayPresenceState(presenceSnapshot, today);
    return (
      <div key={entry.key} className="min-w-0">
        <div
          className={`group flex min-w-0 items-stretch overflow-hidden rounded-xl border bg-background shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md ${
            isChecklist ? "border-blue-200" : "border-border"
          } ${compact ? "rounded-lg" : ""}`}
        >
          <button
            type="button"
            onClick={() => openEntry(entry)}
            className={`min-w-0 flex-1 text-left ${compact ? "px-2 py-1.5" : "px-3 py-2.5"}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${isChecklist ? "bg-blue-500" : "bg-amber-500"}`} />
              <span className="min-w-0 truncate text-sm font-bold text-foreground">{entry.job.title}</span>
            </span>
            <span className={`mt-1 block truncate text-xs text-muted-foreground ${compact ? "text-[11px]" : ""}`}>
              {secondaryLabel}
            </span>
            {!compact && (
              <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-foreground/70">
                {progress != null && <span>· {Math.round(progress)}% complete</span>}
                {entry.startDate !== entry.endDate && <span>· {rangeLabel(entry)}</span>}
              </span>
            )}
            {(priority || resourceDemand || blocker) && !compact && (
              <span className="mt-2 flex flex-wrap gap-1.5">
                {priority && (
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    priority === "urgent" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                  }`}>
                    {priority}
                  </span>
                )}
                {resourceDemand && <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">{resourceDemand}</span>}
                {blocker && <span className="max-w-full truncate rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{blocker}</span>}
              </span>
            )}
          </button>
          {!isChecklist && (
            <div className="flex shrink-0 items-stretch">
              {presenceState && (
                <span
                  className={`inline-flex items-center px-1.5 text-center text-[10px] font-bold leading-tight ${presenceStatusClassName(presenceState)}`}
                  data-testid={`job-presence-status-${entry.job.id}`}
                  title={presenceStatusLabel(presenceState)}
                >
                  {presenceStatusLabel(presenceState)}
                </span>
              )}
              <button
                type="button"
                onClick={() => setPresenceJobId(current => current === entry.job.id ? null : entry.job.id)}
                className="inline-flex min-w-9 items-center justify-center gap-1 px-2 text-muted-foreground transition-colors hover:bg-amber-50 hover:text-amber-700"
                aria-expanded={presenceJobId === entry.job.id}
                aria-label={`${presenceJobId === entry.job.id ? "Hide" : "Record"} daily presence for ${entry.job.title}`}
                title="Record daily presence"
                data-testid={`job-presence-toggle-${entry.job.id}`}
              >
                <CalendarCheck2 className="h-4 w-4" />
                {!compact && <span className="hidden text-[10px] font-bold uppercase tracking-wide sm:inline">Presence</span>}
              </button>
            </div>
          )}
          {!compact && (
            <button
              type="button"
              onClick={() => onOpenPlanning(entry.job)}
              className="px-2 text-muted-foreground opacity-60 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
              aria-label={`Open planning settings for ${entry.job.title}`}
              title="Planning settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          )}
        </div>
        {!isChecklist && presenceJobId === entry.job.id && (
          <ActiveJobPresence
            job={entry.job}
            snapshot={presenceSnapshot ?? null}
            loading={presenceLoading && !presenceSnapshot}
            error={presenceError}
            onSnapshotChange={updatePresenceSnapshot}
          />
        )}
      </div>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-3xl border border-border bg-card shadow-[0_18px_50px_-32px_rgba(15,23,42,0.55)]"
      data-testid="jobs-planner"
      data-planner-view={view}
    >
      <div className="border-b border-border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-5 text-white sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-950/20">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">Operations planner</p>
              <h2 className="mt-1 text-2xl font-display font-bold tracking-tight !text-white">Plan the week with confidence</h2>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                {loading ? "Loading live schedule…" : error ? "Schedule unavailable" : "Real job dates and checklist work, in one clear view."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start lg:self-auto">
            <div className="flex items-center rounded-xl border border-white/15 bg-white/10 p-1" role="tablist" aria-label="Schedule view">
              <button
                type="button"
                role="tab"
                aria-selected="true"
                data-testid="schedule-active-tab"
                className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-950 shadow-sm"
              >
                Active Schedule
              </button>
              <button
                type="button"
                role="tab"
                aria-selected="false"
                data-testid="schedule-history-tab"
                onClick={() => setScheduleMode("history")}
                className="rounded-lg px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                Schedule History
              </button>
            </div>
            <div className="flex items-center rounded-xl border border-white/15 bg-white/10 p-1">
              {(["week", "month", "agenda"] as const).map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  data-testid={`planner-view-${option}`}
                  className={`rounded-lg px-3 py-2 text-xs font-bold capitalize transition-colors ${
                    view === option ? "bg-white text-slate-950 shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setCursor(today); setSelectedDate(today); }}
              className="hidden rounded-xl border border-white/20 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white/10 sm:inline-flex"
            >
              Today
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-7">
        <button type="button" onClick={() => shiftPlanner(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground" aria-label="Previous period">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {view === "week" ? "Week at a glance" : view === "month" ? "Monthly view" : "Upcoming agenda"}
          </p>
          <p className="mt-0.5 text-base font-bold text-foreground">
            {view === "month"
              ? formatScheduleMonth(cursor)
              : view === "week"
                ? `${formatScheduleDate(weekDates[0])} – ${formatScheduleDate(weekDates[6])}`
                : `From ${formatScheduleDate(cursor)}`}
          </p>
        </div>
        <button type="button" onClick={() => shiftPlanner(1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground" aria-label="Next period">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="px-4 py-5 sm:px-7">
        {error ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
            <span>Could not load the schedule.</span>
            <button type="button" onClick={() => setRetryKey(key => key + 1)} className="font-bold underline">Retry</button>
          </div>
        ) : loading ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 text-sm text-muted-foreground">
            Loading scheduled work…
          </div>
        ) : view === "week" ? (
          <div className="overflow-x-auto rounded-2xl border border-border bg-slate-50/70">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-7 border-b border-border bg-white">
                {weekDates.map(date => (
                  <div key={date} className={`border-r border-border px-3 py-3 last:border-r-0 ${date === today ? "bg-amber-50" : ""}`}>
                    <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${date === today ? "text-amber-700" : "text-muted-foreground"}`}>
                      {date === today ? "Today" : scheduleDate(date).toLocaleDateString("en-US", { weekday: "short" })}
                    </p>
                    <p className={`mt-1 text-lg font-bold ${date === today ? "text-amber-700" : "text-foreground"}`}>{scheduleDate(date).getDate()}</p>
                  </div>
                ))}
              </div>
              <div className="relative">
                <div className="absolute inset-0 grid grid-cols-7">
                  {weekDates.map(date => (
                    <div key={date} className={`min-h-[132px] border-r border-border last:border-r-0 ${date === today ? "bg-amber-50/40" : "bg-white/50"}`} />
                  ))}
                </div>
                {weekEntries.length > 0 ? (
                  <div
                    className="relative grid grid-cols-7 gap-x-2 gap-y-2 p-3"
                    style={{
                      gridTemplateRows: `repeat(${Math.max(...weekEntries.map(entry => entry.lane), 0) + 1}, minmax(84px, auto))`,
                    }}
                  >
                    {weekEntries.map(({ entry, lane, startIndex, endIndex }) => (
                      <div
                        key={entry.key}
                        className="min-w-0"
                        data-planner-entry-key={entry.key}
                        data-planner-start={entry.startDate}
                        data-planner-end={entry.endDate}
                        style={{ gridColumn: `${startIndex + 1} / ${endIndex + 2}`, gridRow: lane + 1 }}
                      >
                        {renderEntry(entry)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="relative flex min-h-[260px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
                    No dated work on this week. Queue and waiting work stays below until real dates are assigned.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : view === "agenda" ? (
          agendaDates.length === 0 ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 px-6 text-center text-sm text-muted-foreground">
              No dated work from this point forward.
            </div>
          ) : (
            <div className="space-y-4">
              {agendaDates.map(date => (
                <div key={date} className="grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)]">
                  <div className="rounded-xl bg-muted/50 px-3 py-2 sm:bg-transparent sm:px-0">
                    <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${date === today ? "text-amber-700" : "text-muted-foreground"}`}>
                      {date === today ? "Today" : scheduleDate(date).toLocaleDateString("en-US", { weekday: "short" })}
                    </p>
                    <p className="mt-1 text-sm font-bold text-foreground">{formatScheduleDate(date)}</p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(eventsByDate.get(date) ?? []).filter(entry => entry.endDate >= date && entry.startDate <= date).map(entry => renderEntry(entry))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl border border-border">
              <div className="grid grid-cols-7 border-b border-border bg-muted/30">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => (
                  <div key={day} className="border-r border-border px-1 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground last:border-r-0">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthDates.map(date => {
                  const dateEntries = eventsByDate.get(date) ?? [];
                  const isOutsideMonth = date.slice(0, 7) !== cursor.slice(0, 7);
                  const isSelected = date === selectedDate;
                  return (
                    <button
                      type="button"
                      key={date}
                      onClick={() => setSelectedDate(date)}
                      className={`min-h-[86px] border-r border-b border-border p-2 text-left transition-colors ${
                        isOutsideMonth ? "bg-muted/10 text-muted-foreground/50" : "bg-background"
                      } ${isSelected ? "ring-2 ring-inset ring-amber-400 bg-amber-50/40" : "hover:bg-muted/30"}`}
                      aria-label={`${formatScheduleDate(date)}${dateEntries.length ? `, ${dateEntries.length} scheduled item${dateEntries.length === 1 ? "" : "s"}` : ""}`}
                    >
                      <span className={`text-xs font-bold ${date === today ? "text-amber-700" : "text-foreground"}`}>{scheduleDate(date).getDate()}</span>
                      {dateEntries.length > 0 && (
                        <span className="mt-3 flex flex-wrap gap-1">
                          {dateEntries.slice(0, 5).map(entry => <span key={`${entry.key}-${date}`} className={`h-2 w-2 rounded-full ${entry.item ? "bg-blue-500" : "bg-amber-500"}`} title={entry.job.title} />)}
                          {dateEntries.length > 5 && <span className="text-[10px] font-bold text-muted-foreground">+{dateEntries.length - 5}</span>}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-border bg-muted/10 p-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{selectedDate === today ? "Today" : scheduleDate(selectedDate).toLocaleDateString("en-US", { weekday: "long" })}</p>
                  <p className="mt-1 text-base font-bold text-foreground">{formatScheduleDate(selectedDate)}</p>
                </div>
                <span className="text-xs font-semibold text-muted-foreground">{(eventsByDate.get(selectedDate) ?? []).length} scheduled</span>
              </div>
              {(eventsByDate.get(selectedDate) ?? []).length > 0 ? (
                <div className="mt-3 grid gap-2 md:grid-cols-2">{(eventsByDate.get(selectedDate) ?? []).map(entry => renderEntry(entry))}</div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No scheduled work on this date.</p>
              )}
            </div>
          </>
        )}
      </div>

      {!loading && !error && (
        <ReadyToStartArea
          readyJobs={readyToStartJobs}
          waitingJobs={waitingToStartJobs}
          loading={readyToStartLoading}
          error={readyToStartError}
          onStarted={() => setLocalRefreshKey(key => key + 1)}
        />
      )}

      {!loading && !error && (
        <div className="grid gap-3 border-t border-border bg-muted/10 p-4 sm:grid-cols-3 sm:p-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4" data-testid="planner-unscheduled">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">Unscheduled</p>
                <p className="mt-1 text-2xl font-bold text-amber-950">{unscheduledJobs.length}</p>
              </div>
              <ListTodo className="h-5 w-5 text-amber-700" />
            </div>
            <p className="mt-1 text-xs text-amber-800">Lot models and queue order</p>
            <div className="mt-3 space-y-1">
              {unscheduledJobs.slice(0, 3).map((job, index) => (
                <button key={job.id} type="button" onClick={() => onOpenPlanning(job)} className="flex w-full items-center gap-2 truncate text-left text-sm font-semibold text-amber-950 hover:underline">
                  <span className="w-5 shrink-0 text-xs text-amber-700">{job.queuePosition ?? index + 1}</span>
                  <span className="truncate">{job.title}</span>
                </button>
              ))}
              {unscheduledJobs.length > 3 && <p className="pt-1 text-xs font-semibold text-amber-800">+{unscheduledJobs.length - 3} more in queue</p>}
              {unscheduledJobs.length === 0 && <p className="text-sm text-amber-800">No jobs waiting for dates.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4" data-testid="planner-waiting">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-orange-800">Waiting</p>
                <p className="mt-1 text-2xl font-bold text-orange-950">{waitingJobs.length}</p>
              </div>
              <AlertCircle className="h-5 w-5 text-orange-700" />
            </div>
            <p className="mt-1 text-xs text-orange-800">Blocked work stays off the calendar</p>
            <div className="mt-3 space-y-2">
              {waitingJobs.slice(0, 2).map(job => (
                <button key={job.id} type="button" onClick={() => onOpenPlanning(job)} className="flex w-full items-start gap-2 text-left text-sm font-semibold text-orange-950 hover:underline">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                  <span className="min-w-0 truncate">{job.title} <span className="font-normal text-orange-800">— {getBlocker(baseJobsById.get(job.id) ?? job) ?? "Waiting for readiness"}</span></span>
                </button>
              ))}
              {waitingJobs.length > 2 && <p className="text-xs font-semibold text-orange-800">+{waitingJobs.length - 2} more waiting</p>}
              {waitingJobs.length === 0 && <p className="text-sm text-orange-800">No active blockers.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">This week</p>
                <p className="mt-1 text-2xl font-bold text-slate-950">{workload.jobCount} <span className="text-sm font-semibold text-slate-500">jobs</span></p>
              </div>
              <Clock3 className="h-5 w-5 text-slate-500" />
            </div>
            <p className="mt-1 text-xs text-slate-600">{workload.scheduledDays} scheduled day{workload.scheduledDays === 1 ? "" : "s"} across real dates</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1"><Layers3 className="h-3.5 w-3.5" /> {workload.scheduledDays} days</span>
              {workload.higherDemand > 0 && <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-100 px-2 py-1 text-violet-700"><Users className="h-3.5 w-3.5" /> {workload.higherDemand} crew signal{workload.higherDemand === 1 ? "" : "s"}</span>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}