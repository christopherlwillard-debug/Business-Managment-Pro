import { Router, type Request } from "express";
import { db } from "@workspace/db";
import { jobDailyPresenceTable, jobsTable } from "@workspace/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getRequestUser } from "./guards";
import { belongsToBusiness, invalidBusinessScope, requestedBusiness } from "../lib/business-scope.js";
import {
  isNotHereReason,
  isPresenceState,
  type NotHereReason,
  type PresenceState,
} from "../lib/production-intelligence-contract.js";
import { applicationDate, calculateProductionTiming, type ProductionTiming } from "../lib/production-presence.js";
import {
  getJobProductionComponents,
  resolveJobExpectedDuration,
} from "../lib/job-production-components.js";

const router = Router();

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function parsePositiveIds(value: unknown): number[] {
  if (typeof value !== "string") return [];
  return Array.from(new Set(
    value.split(",")
      .map(part => Number(part.trim()))
      .filter(id => Number.isInteger(id) && id > 0),
  ));
}

function responseRecord(record: typeof jobDailyPresenceTable.$inferSelect) {
  return {
    id: record.id,
    jobId: record.jobId,
    date: record.date,
    state: record.state as PresenceState,
    workStartedAt: record.workStartedAt,
    workEndedAt: record.workEndedAt,
    notHereReason: record.notHereReason as NotHereReason | null,
    notes: record.notes,
    source: record.source,
    provenance: record.provenance,
    createdAt: record.createdAt,
    createdByUserId: record.createdByUserId,
    createdByName: record.createdByName,
    updatedAt: record.updatedAt,
    updatedByUserId: record.updatedByUserId,
    updatedByName: record.updatedByName,
  };
}

async function loadWorkdaySnapshot(
  query: any,
  jobId: number,
  job: typeof jobsTable.$inferSelect,
  date: string,
) {
  const records: Array<typeof jobDailyPresenceTable.$inferSelect> = await query
    .select()
    .from(jobDailyPresenceTable)
    .where(eq(jobDailyPresenceTable.jobId, jobId))
    .orderBy(asc(jobDailyPresenceTable.date));
  const record = records.find(row => row.date === date) ?? null;
  return {
    jobId,
    record: record ? responseRecord(record) : null,
    timing: await timingFor(records, job),
  };
}

async function timingFor(
  records: Array<typeof jobDailyPresenceTable.$inferSelect>,
  job: typeof jobsTable.$inferSelect,
): Promise<ProductionTiming> {
  // Real rows always carry the provenance flag after the duration migration.
  // Treat older lightweight test/mocked rows with a duration but no flag as
  // already resolved so presence reads do not need an unrelated component query.
  const components = job.daysOnJobExplicit === false
    ? await getJobProductionComponents(job)
    : [];
  const durationJob = job.daysOnJobExplicit === undefined
    ? { ...job, daysOnJobExplicit: job.daysOnJob != null }
    : job;
  const duration = resolveJobExpectedDuration(durationJob, components);
  return {
    ...calculateProductionTiming(
    records.map(record => ({ date: record.date, state: record.state as PresenceState })),
    duration.expectedDurationDays,
    ),
    expectedDurationSource: duration.source,
  };
}

function startMode(
  records: Array<typeof jobDailyPresenceTable.$inferSelect>,
  date: string,
): "first_day" | "resume" | "additional_day" {
  const prior = records
    .filter(record =>
      record.date < date &&
      (record.state === "here" || (record.state === "not_here" && record.provenance === "confirmed")),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const hasPriorHere = prior.some(record => record.state === "here");
  if (!hasPriorHere) return "first_day";
  return prior[0]?.state === "not_here" ? "resume" : "additional_day";
}

async function scopedJobs(req: Request, ids: number[]) {
  const scope = await requestedBusiness(req);
  if (ids.length === 0) return { scope, jobs: [] as Array<typeof jobsTable.$inferSelect> };
  const rows = await db.select().from(jobsTable).where(inArray(jobsTable.id, ids));
  return {
    scope,
    jobs: rows.filter(job => belongsToBusiness(job, scope)),
  };
}

router.get("/production-presence", async (req, res) => {
  try {
    const ids = parsePositiveIds(req.query.jobIds);
    if (ids.length === 0 || ids.length > 100) {
      return res.status(400).json({ error: "jobIds must contain between 1 and 100 job IDs" });
    }

    const { scope, jobs } = await scopedJobs(req, ids);
    if (invalidBusinessScope(res, scope)) return;
    if (jobs.length === 0) return res.json({ jobs: [] });

    const rows = await db
      .select()
      .from(jobDailyPresenceTable)
      .where(inArray(jobDailyPresenceTable.jobId, jobs.map(job => job.id)))
      .orderBy(asc(jobDailyPresenceTable.date));
    const rowsByJob = new Map<number, Array<typeof jobDailyPresenceTable.$inferSelect>>();
    for (const row of rows) {
      const list = rowsByJob.get(row.jobId) ?? [];
      list.push(row);
      rowsByJob.set(row.jobId, list);
    }

    return res.json({
      jobs: await Promise.all(jobs.map(async job => {
        const records = rowsByJob.get(job.id) ?? [];
        return {
          jobId: job.id,
          records: records.map(responseRecord),
          timing: await timingFor(records, job),
        };
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load production presence" });
  }
});

router.post("/:jobId/workday/start", async (req, res) => {
  try {
    const jobId = Number(req.params.jobId);
    const date = req.body?.date;
    if (!Number.isInteger(jobId) || jobId <= 0) return res.status(400).json({ error: "Invalid jobId" });
    if (!isDateOnly(date)) return res.status(400).json({ error: "date must be a valid YYYY-MM-DD date" });
    if (date > applicationDate()) {
      return res.status(400).json({ error: "Future production dates are not allowed", code: "FUTURE_PRODUCTION_DATE" });
    }

    const { scope, jobs } = await scopedJobs(req, [jobId]);
    if (invalidBusinessScope(res, scope)) return;
    const job = jobs[0];
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.status === "completed" || job.status === "invoiced" || job.status === "closed" || job.closedAt != null) {
      return res.status(409).json({ error: "Completed or closed jobs cannot be started" });
    }

    const user = getRequestUser(req);
    const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || null;
    const result = await db.transaction(async tx => {
      const [lockedJob] = await tx
        .select()
        .from(jobsTable)
        .where(eq(jobsTable.id, jobId))
        .for("update");
      if (!lockedJob) return null;
      const priorRecords: Array<typeof jobDailyPresenceTable.$inferSelect> = await tx
        .select()
        .from(jobDailyPresenceTable)
        .where(eq(jobDailyPresenceTable.jobId, jobId))
        .orderBy(asc(jobDailyPresenceTable.date));
      const mode = startMode(priorRecords, date);
      const [existing] = await tx
        .select()
        .from(jobDailyPresenceTable)
        .where(and(
          eq(jobDailyPresenceTable.jobId, jobId),
          eq(jobDailyPresenceTable.date, date),
        ))
        .limit(1);
      if (existing?.state === "here" && existing.workStartedAt) {
        const [activeJob] = await tx
          .update(jobsTable)
          .set({ status: "active" })
          .where(eq(jobsTable.id, jobId))
          .returning();
        const snapshot = await loadWorkdaySnapshot(tx, jobId, activeJob ?? job, date);
        return { job: activeJob ?? lockedJob, startMode: mode, alreadyStarted: true, ...snapshot };
      }
      const startedAt = new Date();
      const [record] = await tx
        .insert(jobDailyPresenceTable)
        .values({
          jobId,
          date,
          state: "here",
          workStartedAt: startedAt,
          workEndedAt: null,
          notHereReason: null,
          notes: null,
          source: "workday_action",
          provenance: "confirmed",
          createdByUserId: user?.id ?? null,
          createdByName: userName,
          updatedByUserId: user?.id ?? null,
          updatedByName: userName,
        })
        .onConflictDoUpdate({
          target: [jobDailyPresenceTable.jobId, jobDailyPresenceTable.date],
          set: {
            state: "here",
            workStartedAt: startedAt,
            workEndedAt: null,
            notHereReason: null,
            notes: null,
            source: "workday_action",
            provenance: "confirmed",
            updatedAt: startedAt,
            updatedByUserId: user?.id ?? null,
            updatedByName: userName,
          },
        })
        .returning();
      const [updatedJob] = await tx
        .update(jobsTable)
        .set({ status: "active" })
        .where(eq(jobsTable.id, jobId))
        .returning();
      if (!record || !updatedJob) throw new Error("Could not start workday");
      const snapshot = await loadWorkdaySnapshot(tx, jobId, updatedJob, date);
      return { job: updatedJob, startMode: mode, alreadyStarted: false, ...snapshot };
    });
    if (!result) return res.status(404).json({ error: "Job not found" });
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to start work today", code: "WORKDAY_START_FAILED" });
  }
});

router.post("/:jobId/workday/end", async (req, res) => {
  try {
    const jobId = Number(req.params.jobId);
    const date = req.body?.date;
    if (!Number.isInteger(jobId) || jobId <= 0) return res.status(400).json({ error: "Invalid jobId" });
    if (!isDateOnly(date)) return res.status(400).json({ error: "date must be a valid YYYY-MM-DD date" });
    if (date > applicationDate()) {
      return res.status(400).json({ error: "Future production dates are not allowed", code: "FUTURE_PRODUCTION_DATE" });
    }

    const { scope, jobs } = await scopedJobs(req, [jobId]);
    if (invalidBusinessScope(res, scope)) return;
    const job = jobs[0];
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.status === "completed" || job.status === "invoiced" || job.status === "closed" || job.closedAt != null) {
      return res.status(409).json({ error: "Completed or closed jobs cannot be updated" });
    }

    const user = getRequestUser(req);
    const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || null;
    const result = await db.transaction(async tx => {
      const [existing] = await tx
        .select()
        .from(jobDailyPresenceTable)
        .where(and(
          eq(jobDailyPresenceTable.jobId, jobId),
          eq(jobDailyPresenceTable.date, date),
        ))
        .limit(1);
      if (!existing || existing.state !== "here" || !existing.workStartedAt) {
        return null;
      }
      if (existing.workEndedAt) {
        const snapshot = await loadWorkdaySnapshot(tx, jobId, job, date);
        return { job, ...snapshot };
      }
      const endedAt = new Date();
      const [record] = await tx
        .update(jobDailyPresenceTable)
        .set({
          workEndedAt: endedAt,
          source: "workday_action",
          provenance: "confirmed",
          updatedAt: endedAt,
          updatedByUserId: user?.id ?? null,
          updatedByName: userName,
        })
        .where(eq(jobDailyPresenceTable.id, existing.id))
        .returning();
      const snapshot = await loadWorkdaySnapshot(tx, jobId, job, date);
      return { job, ...snapshot, record: record ? responseRecord(record) : null };
    });
    if (!result) return res.status(409).json({ error: "Start work today before ending today's work" });
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to finish today's work" });
  }
});

router.put("/:jobId/production-presence/:date", async (req, res) => {
  try {
    const jobId = Number(req.params.jobId);
    const date = req.params.date;
    if (!Number.isInteger(jobId) || jobId <= 0) return res.status(400).json({ error: "Invalid jobId" });
    if (!isDateOnly(date)) return res.status(400).json({ error: "date must be a valid YYYY-MM-DD date" });
    if (date > applicationDate()) {
      return res.status(400).json({ error: "Future production dates are not allowed", code: "FUTURE_PRODUCTION_DATE" });
    }

    const { scope, jobs } = await scopedJobs(req, [jobId]);
    if (invalidBusinessScope(res, scope)) return;
    const job = jobs[0];
    if (!job) return res.status(404).json({ error: "Job not found" });

    const state = req.body?.state;
    if (typeof state !== "string" || !isPresenceState(state)) {
      return res.status(400).json({ error: "state must be unrecorded, here, or not_here" });
    }
    const rawReason = req.body?.notHereReason;
    const notHereReason = rawReason == null || rawReason === "" ? null : rawReason;
    if (notHereReason != null && (typeof notHereReason !== "string" || !isNotHereReason(notHereReason))) {
      return res.status(400).json({ error: "Invalid not-here reason" });
    }
    if (notHereReason != null && state !== "not_here") {
      return res.status(400).json({ error: "notHereReason is only valid when state is not_here" });
    }
    const notes = state === "not_here" && typeof req.body?.notes === "string"
      ? req.body.notes.trim().slice(0, 2000) || null
      : null;
    const user = getRequestUser(req);
    const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || null;

    const [record] = await db
      .insert(jobDailyPresenceTable)
      .values({
        jobId,
        date,
        state,
        notHereReason,
        notes,
        source: "manual_presence",
        provenance: "confirmed",
        createdByUserId: user?.id ?? null,
        createdByName: userName,
        updatedByUserId: user?.id ?? null,
        updatedByName: userName,
      })
      .onConflictDoUpdate({
        target: [jobDailyPresenceTable.jobId, jobDailyPresenceTable.date],
        set: {
          state,
          notHereReason,
          notes,
          source: "manual_presence",
          provenance: "confirmed",
          updatedAt: new Date(),
          updatedByUserId: user?.id ?? null,
          updatedByName: userName,
        },
      })
      .returning();

    const rows = await db
      .select()
      .from(jobDailyPresenceTable)
      .where(eq(jobDailyPresenceTable.jobId, jobId))
      .orderBy(asc(jobDailyPresenceTable.date));

    return res.json({
      jobId,
      record: responseRecord(record),
      timing: await timingFor(rows, job),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to save production presence" });
  }
});

export default router;