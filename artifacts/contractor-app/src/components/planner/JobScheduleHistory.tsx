import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, CalendarDays, CheckCircle2, Clock3, History, Loader2 } from "lucide-react";
import type { ScheduleJob } from "@/pages/Jobs";
import { localDateString } from "@/lib/utils";
import { JobPresencePanel, type JobPresenceSnapshot } from "./JobPresencePanel";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type HistoryRange = { from: string; to: string };

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

function formatScheduleDate(date: string | null | undefined): string {
  if (!date) return "Date not recorded";
  return scheduleDate(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatStatus(status: string | null | undefined): string {
  if (!status) return "Completed";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function jobDateLabel(job: ScheduleJob): string {
  if (job.startDate && job.endDate && job.startDate !== job.endDate) {
    return `${formatScheduleDate(job.startDate)} – ${formatScheduleDate(job.endDate)}`;
  }
  return formatScheduleDate(job.startDate ?? job.endDate);
}

function formatPresenceRefreshTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function JobScheduleHistory({
  businessId,
  onOpenActive,
}: {
  businessId?: number;
  onOpenActive: () => void;
}) {
  const today = localDateString();
  const defaultTo = addScheduleDays(today, -1);
  const defaultFrom = addScheduleDays(defaultTo, -364);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [appliedRange, setAppliedRange] = useState<HistoryRange>({
    from: defaultFrom,
    to: defaultTo,
  });
  const [jobs, setJobs] = useState<ScheduleJob[]>([]);
  const [presenceByJob, setPresenceByJob] = useState<Record<number, JobPresenceSnapshot>>({});
  const [presenceLoading, setPresenceLoading] = useState(false);
  const [presenceError, setPresenceError] = useState(false);
  const [presenceRefreshStale, setPresenceRefreshStale] = useState(false);
  const [presenceLastRefreshedAt, setPresenceLastRefreshedAt] = useState<number | null>(null);
  const [presenceRetrying, setPresenceRetrying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const presenceBusyRef = useRef(new Set<number>());

  const updatePresenceBusy = useCallback((jobId: number, isBusy: boolean) => {
    const next = new Set(presenceBusyRef.current);
    if (isBusy) next.add(jobId);
    else next.delete(jobId);
    presenceBusyRef.current = next;
  }, []);

  useEffect(() => {
    const activeJobIds = new Set(jobs.map(job => job.id));
    presenceBusyRef.current = new Set(
      [...presenceBusyRef.current].filter(jobId => activeJobIds.has(jobId)),
    );
  }, [jobs]);

  const refreshPresence = useCallback(async (signal: AbortSignal) => {
    const jobIds = jobs.map(job => job.id);
    if (jobIds.length === 0 || jobIds.every(jobId => presenceBusyRef.current.has(jobId))) return;
    const response = await fetch(`${BASE}/api/jobs/production-presence?jobIds=${jobIds.join(",")}`, {
      credentials: "include",
      signal,
    });
    if (!response.ok) throw new Error("Production presence request failed");
    const data = await response.json() as { jobs: JobPresenceSnapshot[] };
    if (signal.aborted) return;
    setPresenceLastRefreshedAt(Date.now());
    setPresenceRefreshStale(false);
    setPresenceByJob(current => {
      const next = { ...current };
      for (const snapshot of data.jobs) {
        if (!presenceBusyRef.current.has(snapshot.jobId)) next[snapshot.jobId] = snapshot;
      }
      return next;
    });
  }, [jobs]);

  const refreshPresenceInBackground = useCallback(async (signal: AbortSignal) => {
    try {
      await refreshPresence(signal);
    } catch {
      if (!signal.aborted) setPresenceRefreshStale(true);
    }
  }, [refreshPresence]);

  const retryPresenceRefresh = useCallback(async () => {
    const controller = new AbortController();
    setPresenceRetrying(true);
    try {
      await refreshPresence(controller.signal);
    } catch {
      if (!controller.signal.aborted) setPresenceRefreshStale(true);
    } finally {
      setPresenceRetrying(false);
    }
  }, [refreshPresence]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      from: appliedRange.from,
      to: appliedRange.to,
    });
    if (businessId != null) params.set("businessId", String(businessId));

    setLoading(true);
    setError(false);
    fetch(`${BASE}/api/jobs/schedule-history?${params.toString()}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(response =>
        response.ok
          ? response.json() as Promise<{ jobs: ScheduleJob[] }>
          : Promise.reject(new Error("Schedule history request failed"))
      )
      .then(data => setJobs(data.jobs))
      .catch(() => {
        if (!controller.signal.aborted) {
          setJobs([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [businessId, appliedRange]);

  useEffect(() => {
    const jobIds = jobs.map(job => job.id);
    if (jobIds.length === 0) {
      setPresenceByJob({});
      setPresenceLoading(false);
      setPresenceError(false);
      return;
    }
    const controller = new AbortController();
    setPresenceLoading(true);
    setPresenceError(false);
    setPresenceRefreshStale(false);
    setPresenceLastRefreshedAt(null);
    refreshPresence(controller.signal)
      .catch(() => {
        if (!controller.signal.aborted) {
          setPresenceByJob({});
          setPresenceError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPresenceLoading(false);
      });
    return () => controller.abort();
  }, [jobs, refreshPresence]);

  useEffect(() => {
    if (jobs.length === 0) return;
    const controller = new AbortController();
    let interval: number | null = null;

    const refreshOnVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (interval !== null) {
          window.clearInterval(interval);
          interval = null;
        }
        return;
      }
      if (interval === null) interval = window.setInterval(() => {
        void refreshPresenceInBackground(controller.signal);
      }, 30_000);
      void refreshPresenceInBackground(controller.signal);
    };
    const refreshOnFocus = () => {
      if (document.visibilityState !== "hidden") void refreshPresenceInBackground(controller.signal);
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisibility);
    if (document.visibilityState !== "hidden") {
      interval = window.setInterval(() => {
        void refreshPresenceInBackground(controller.signal);
      }, 30_000);
    }
    return () => {
      controller.abort();
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
      if (interval !== null) window.clearInterval(interval);
    };
  }, [jobs.length, refreshPresenceInBackground]);

  const updatePresenceSnapshot = useCallback((snapshot: JobPresenceSnapshot) => {
    setPresenceByJob(current => ({ ...current, [snapshot.jobId]: snapshot }));
  }, []);

  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) =>
      (b.endDate ?? b.startDate ?? "").localeCompare(a.endDate ?? a.startDate ?? "") ||
      a.title.localeCompare(b.title),
    ),
    [jobs],
  );

  function submitRange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to || from > to) {
      setRangeError("Choose a valid start and end date.");
      return;
    }
    setRangeError(null);
    setAppliedRange({ from, to });
  }

  function applyPreset(days: number) {
    const nextTo = addScheduleDays(today, -1);
    const nextFrom = addScheduleDays(nextTo, -(days - 1));
    setFrom(nextFrom);
    setTo(nextTo);
    setRangeError(null);
    setAppliedRange({ from: nextFrom, to: nextTo });
  }

  return (
    <section
      className="overflow-hidden rounded-3xl border border-border bg-card shadow-[0_18px_50px_-32px_rgba(15,23,42,0.55)]"
      data-testid="jobs-schedule-history"
    >
      <div className="border-b border-border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-5 text-white sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-200 text-slate-900 shadow-lg shadow-slate-950/20">
              <History className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">Schedule history</p>
              <h2 className="mt-1 text-2xl font-display font-bold tracking-tight !text-white">Past jobs, still findable</h2>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                Read-only history from the existing job dates and scheduled checklist dates.
              </p>
            </div>
          </div>
          <div className="flex items-center rounded-xl border border-white/15 bg-white/10 p-1" role="tablist" aria-label="Schedule view">
            <button
              type="button"
              role="tab"
              onClick={onOpenActive}
              data-testid="schedule-active-tab"
              className="rounded-lg px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              Active Schedule
            </button>
            <button
              type="button"
              role="tab"
              aria-selected="true"
              data-testid="schedule-history-tab"
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-950 shadow-sm"
            >
              Schedule History
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-border bg-muted/10 px-5 py-4 sm:px-7">
        <form onSubmit={submitRange} className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-foreground">
              From
              <input
                type="date"
                value={from}
                onChange={event => setFrom(event.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal text-foreground"
              />
            </label>
            <label className="text-xs font-bold text-foreground">
              To
              <input
                type="date"
                value={to}
                onChange={event => setTo(event.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal text-foreground"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => applyPreset(90)} className="rounded-xl border border-border px-3 py-2.5 text-xs font-bold text-muted-foreground hover:bg-background hover:text-foreground">
              Last 90 days
            </button>
            <button type="button" onClick={() => applyPreset(365)} className="rounded-xl border border-border px-3 py-2.5 text-xs font-bold text-muted-foreground hover:bg-background hover:text-foreground">
              Last year
            </button>
            <button type="submit" className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800">
              Load history
            </button>
          </div>
        </form>
        {rangeError && <p className="mt-2 text-xs font-semibold text-red-700">{rangeError}</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          Showing {formatScheduleDate(appliedRange.from)} through {formatScheduleDate(appliedRange.to)}. History never edits the source job or checklist records.
        </p>
      </div>

      <div className="px-4 py-5 sm:px-7">
        {presenceRefreshStale && (
          <div
            className="mb-4 flex flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
            data-testid="job-presence-refresh-stale"
          >
            <div>
              <p className="font-bold">Historical presence may be out of date.</p>
              <p className="mt-0.5 text-xs text-orange-900/75">The last successful snapshot is still shown.</p>
              {presenceLastRefreshedAt != null && (
                <p className="mt-1 text-xs font-semibold text-orange-900/75" data-testid="job-presence-last-refreshed">
                  <time
                    dateTime={new Date(presenceLastRefreshedAt).toISOString()}
                    data-last-refreshed-at={presenceLastRefreshedAt}
                  >
                    Last successful refresh: {formatPresenceRefreshTime(presenceLastRefreshedAt)}
                  </time>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void retryPresenceRefresh()}
              disabled={presenceRetrying}
              data-testid="job-presence-refresh-retry"
              className="rounded-xl border border-orange-300 bg-white px-3 py-2 text-xs font-bold text-orange-900 hover:bg-orange-100 disabled:cursor-wait disabled:opacity-60"
            >
              {presenceRetrying ? "Retrying…" : "Retry presence"}
            </button>
          </div>
        )}
        {error ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
            <span>Could not load schedule history.</span>
            <button type="button" onClick={() => setAppliedRange(range => ({ ...range }))} className="font-bold underline">Retry</button>
          </div>
        ) : loading ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading schedule history…
          </div>
        ) : sortedJobs.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 px-6 text-center">
            <Archive className="h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-bold text-foreground">No completed jobs in this range</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">Choose a wider historical range to see jobs that have left the Active Schedule.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedJobs.map(job => {
              const datedItems = [...job.checklistItems].sort((a, b) =>
                (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? "") || a.title.localeCompare(b.title),
              );
              return (
                <article key={job.id} className="rounded-2xl border border-border bg-background p-4 shadow-sm" data-testid={`schedule-history-job-${job.id}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" />
                        <h3 className="truncate text-base font-bold text-foreground">{job.title}</h3>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{jobDateLabel(job)}</p>
                      {(job.locationName || job.address) && (
                        <p className="mt-1 text-xs text-muted-foreground">{[job.locationName, job.address].filter(Boolean).join(" · ")}</p>
                      )}
                    </div>
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {formatStatus(job.status)}
                    </span>
                  </div>

                   {datedItems.length > 0 && (
                    <div className="mt-4 border-t border-border pt-3">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" /> Scheduled checklist history
                      </p>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {datedItems.map(item => (
                          <div key={item.id} className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
                            <p className="text-sm font-semibold text-foreground">{item.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {formatScheduleDate(item.scheduledDate)}
                              {item.completed ? " · Completed" : item.skipped ? " · Skipped" : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                   <JobPresencePanel
                     job={job}
                     snapshot={presenceByJob[job.id] ?? null}
                     loading={presenceLoading}
                     error={presenceError}
                      onSnapshotChange={updatePresenceSnapshot}
                      onInteractionStateChange={isBusy => updatePresenceBusy(job.id, isBusy)}
                   />
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}