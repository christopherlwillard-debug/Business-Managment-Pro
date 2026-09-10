import { Router, type Request } from "express";
import { db } from "@workspace/db";
import { jobDailyPresenceTable, jobsTable } from "@workspace/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { getRequestUser } from "./guards";
import { belongsToBusiness, invalidBusinessScope, requestedBusiness } from "../lib/business-scope.js";
import {
  isNotHereReason,
  isPresenceState,
  type NotHereReason,
  type PresenceState,
} from "../lib/production-intelligence-contract.js";
import { calculateProductionTiming, type ProductionTiming } from "../lib/production-presence.js";

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

function expectedDurationDays(job: typeof jobsTable.$inferSelect): number | null {
  return job.daysOnJob != null && job.daysOnJob > 0 ? job.daysOnJob : null;
}

function timingFor(
  records: Array<typeof jobDailyPresenceTable.$inferSelect>,
  job: typeof jobsTable.$inferSelect,
): ProductionTiming {
  return calculateProductionTiming(
    records.map(record => ({ date: record.date, state: record.state as PresenceState })),
    expectedDurationDays(job),
  );
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
      jobs: jobs.map(job => {
        const records = rowsByJob.get(job.id) ?? [];
        return {
          jobId: job.id,
          records: records.map(responseRecord),
          timing: timingFor(records, job),
        };
      }),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load production presence" });
  }
});

router.put("/:jobId/production-presence/:date", async (req, res) => {
  try {
    const jobId = Number(req.params.jobId);
    const date = req.params.date;
    if (!Number.isInteger(jobId) || jobId <= 0) return res.status(400).json({ error: "Invalid jobId" });
    if (!isDateOnly(date)) return res.status(400).json({ error: "date must be a valid YYYY-MM-DD date" });

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
      timing: timingFor(rows, job),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to save production presence" });
  }
});

export default router;