import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Layers3,
  ListTodo,
  Settings2,
  Users,
} from "lucide-react";
import type { Job } from "@workspace/api-client-react";
import type { ScheduleJob } from "@/pages/Jobs";
import { localDateString } from "@/lib/utils";
import { JobPresencePanel, type JobPresenceSnapshot } from "./JobPresencePanel";
import { JobScheduleHistory } from "./JobScheduleHistory";

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

function ActiveJobPresence({ job }: { job: ScheduleJob }) {
  const [snapshot, setSnapshot] = useState<JobPresenceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetch(`${BASE}/api/jobs/production-presence?jobIds=${job.id}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(response =>
        response.ok
          ? response.json() as Promise<{ jobs: JobPresenceSnapshot[] }>
          : Promise.reject(new Error("Production presence request failed"))
      )
      .then(data => {
        const nextSnapshot = data.jobs.find(candidate => candidate.jobId === job.id);
        if (!nextSnapshot) throw new Error("Production presence snapshot missing");
        setSnapshot(nextSnapshot);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSnapshot(null);
          setError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [job.id]);

  return (
    <JobPresencePanel
      job={job}
      snapshot={snapshot}
      loading={loading}
      error={error}
      onSnapshotChange={setSnapshot}
    />
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
  const [presenceJobId, setPresenceJobId] = useState<number | null>(null);
  const requestEnd = addScheduleDays(today, 180);

  useEffect(() => {
    if (scheduleMode !== "active") return;
    const controller = new AbortController();
    const params = new URLSearchParams({ from: today, to: requestEnd });
    if (businessId != null) params.set("businessId", String(businessId));
    setLoading(true);
    setError(false);
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
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSchedule(null);
          onLoaded([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // onLoaded is intentionally excluded so parent renders do not refetch the schedule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, today, requestEnd, retryKey, refreshKey, scheduleMode]);

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
        {!isChecklist && presenceJobId === entry.job.id && <ActiveJobPresence job={entry.job} />}
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