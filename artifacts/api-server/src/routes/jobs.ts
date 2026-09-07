import { Router, type Request } from "express";
import { db } from "@workspace/db";
import { jobsTable, clientsTable, jobSubcontractorsTable, subcontractorsTable, dailyLogsTable, expensesTable, jobExpenseAllocationsTable, jobMileageReimbursementsTable, mileageLogsTable, recurringExpensesTable, estimatesTable, materialListsTable, materialListItemsTable, invoicesTable, otherIncomeTable, jobSubHoursTable, phaseItemSchema, permitChecklistItemSchema, serviceBillingSchema, subPaymentRecordsTable, subAdvancesTable, settingsTable, vehiclesTable, ownerCapitalEntriesTable, mfhManufacturersTable, mfhModelsTable, businessesTable, jobReadinessConditionsTable, type ServiceBilling } from "@workspace/db/schema";
import { eq, and, count, countDistinct, inArray, sql, isNull, desc, or, ne } from "drizzle-orm";
import { RoutingEngine } from "../lib/routing-engine.js";
import { VehicleEngine } from "../lib/vehicle-engine.js";
import { countActualWorkdays } from "../lib/job-workdays.js";
import { resolveJobFuelReconciliation, type JobFuelReconciliation } from "../lib/job-fuel-reconciliation.js";
import { syncMaterialsToJobInvoice } from "./material-lists";
import { calculateAllocationSplitPool, computeAllocationSplitPool, computeAllocationSplitPools, computeSubOwed } from "../lib/allocation.js";
import { calcInvoice, buildInvoiceQuery, fmt } from "./invoices";
import { buildProductionLineItems, ensureProductionBillingSeed } from "../lib/productionBilling.js";
import { z } from "zod/v4";
import { requestedBusiness, resolveMutationBusiness, canonicalRecordBusiness, generalContractingBusiness, belongsToBusiness, invalidBusinessScope } from "../lib/business-scope.js";
import { isOwnerWithdrawalExpenseCategory } from "../lib/owner-withdrawals.js";
import { calculateJobProfit } from "../lib/job-profit.js";
import { getRequestUser } from "./guards";

const router = Router();

function catalogPhotoUrl(objectPath: string | null | undefined): string | null {
  if (!objectPath) return null;
  if (objectPath.startsWith("/objects/")) {
    return `/api/storage/objects/${objectPath.slice("/objects/".length)}`;
  }
  return objectPath;
}

router.param("id", (req, res, next, rawId) => {
  void (async () => {
    const id = Number(rawId);
    const scope = await requestedBusiness(req);
    if (!scope) return next();
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    // Permit the edit form to claim a completely unassigned legacy job for
    // the selected business. The PUT handler will validate the slug and write
    // the authoritative businessId; other scoped reads and mutations still
    // require the job to already belong to the requested business.
    const isLegacyAssignmentUpdate =
      req.method === "PUT" &&
      job != null &&
      job.businessId == null &&
      !job.businessLine &&
      req.body?.businessLine === scope.slug;
    if (!job || (!belongsToBusiness(job, scope) && !isLegacyAssignmentUpdate)) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.locals.businessScopedJob = job;
    next();
  })().catch(next);
});

router.get("/:id/mileage-reimbursement", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const scope = await requestedBusiness(req);
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
    if (!job || (scope && !belongsToBusiness(job, scope))) return res.status(404).json({ error: "Job not found" });
    const [reimbursement] = await db.select().from(jobMileageReimbursementsTable)
      .where(eq(jobMileageReimbursementsTable.jobId, id)).limit(1);
    res.json(reimbursement ?? null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch mileage reimbursement" });
  }
});

router.put("/:id/mileage-reimbursement", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const scope = await requestedBusiness(req);
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
    if (!job || (scope && !belongsToBusiness(job, scope))) return res.status(404).json({ error: "Job not found" });

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: "Reimbursement amount must be zero or greater" });
    const recipientType = ["owner", "subcontractor", "other"].includes(req.body?.recipientType)
      ? req.body.recipientType
      : "owner";
    const recipientName = typeof req.body?.recipientName === "string" && req.body.recipientName.trim()
      ? req.body.recipientName.trim()
      : recipientType === "owner" ? "Business owner" : "";
    if (!recipientName) return res.status(400).json({ error: "Reimbursement recipient is required" });

    let businessId = job.businessId ?? scope?.id;
    if (!businessId && job.businessLine) {
      const [legacyBusiness] = await db
        .select({ id: businessesTable.id })
        .from(businessesTable)
        .where(eq(businessesTable.slug, job.businessLine))
        .limit(1);
      businessId = legacyBusiness?.id;
    }
    if (!businessId) {
      return res.status(400).json({
        error: "Assign this job to a business before adding a mileage reimbursement",
      });
    }
    const subcontractorId = req.body?.recipientSubcontractorId == null
      ? null
      : Number(req.body.recipientSubcontractorId);
    if (recipientType === "subcontractor") {
      if (subcontractorId == null || !Number.isInteger(subcontractorId) || subcontractorId <= 0) {
        return res.status(400).json({ error: "Invalid subcontractor recipient" });
      }
      const [assignment] = await db.select({ subcontractorId: jobSubcontractorsTable.subcontractorId })
        .from(jobSubcontractorsTable)
        .where(and(
          eq(jobSubcontractorsTable.jobId, id),
          eq(jobSubcontractorsTable.subcontractorId, subcontractorId),
        ))
        .limit(1);
      if (!assignment) {
        return res.status(404).json({ error: "Subcontractor is not assigned to this job" });
      }
    }

    const values = {
      jobId: id,
      businessId,
      amount: amount.toFixed(2),
      estimatedAmount: req.body?.estimatedAmount == null ? null : Number(req.body.estimatedAmount).toFixed(2),
      recipientType,
      recipientName,
      recipientSubcontractorId: subcontractorId,
      status: req.body?.status === "paid" ? "paid" : "owed",
      paidAt: req.body?.status === "paid" && req.body?.paidAt ? new Date(req.body.paidAt) : null,
      notes: typeof req.body?.notes === "string" && req.body.notes.trim() ? req.body.notes.trim() : null,
      updatedAt: new Date(),
    } as const;

    const [existing] = await db.select({ id: jobMileageReimbursementsTable.id })
      .from(jobMileageReimbursementsTable).where(eq(jobMileageReimbursementsTable.jobId, id)).limit(1);
    const [saved] = existing
      ? await db.update(jobMileageReimbursementsTable).set(values).where(eq(jobMileageReimbursementsTable.id, existing.id)).returning()
      : await db.insert(jobMileageReimbursementsTable).values(values).returning();
    res.json({ ...saved, amount: Number(saved.amount), estimatedAmount: saved.estimatedAmount == null ? null : Number(saved.estimatedAmount) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save mileage reimbursement" });
  }
});

// Shared helper — recompute and persist jobs.sub_paid from per-sub payment/hour data.
// Call this any time sub_hours or sub_payments change for a job.
export async function recomputeSubPaid(jobId: number): Promise<boolean> {
  const allRows = await db.select({
    subcontractorId: jobSubcontractorsTable.subcontractorId,
    compensationType: jobSubcontractorsTable.compensationType,
    fixedAmount: jobSubcontractorsTable.fixedAmount,
    allocationPct: jobSubcontractorsTable.allocationPct,
    paymentStatus: jobSubcontractorsTable.paymentStatus,
    amountOwed: jobSubcontractorsTable.amountOwed,
    amountPaid: jobSubcontractorsTable.amountPaid,
    computedOwed: sql<string>`COALESCE((
      SELECT SUM(h.hours * COALESCE(h.rate_snapshot, 0))
      FROM job_sub_hours h
      WHERE h.job_id = ${jobId} AND h.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
    ), 0)`,
    // Authoritative ledger total — avoids relying on potentially-stale amountPaid column
    ledgerPaid: sql<string>`COALESCE((
      SELECT SUM(spr.amount + COALESCE(spr.advance_amount, 0)) FROM sub_payment_records spr
      WHERE spr.job_id = ${jobId}
        AND spr.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
        AND (spr.is_reversal IS NULL OR spr.is_reversal = false)
    ), '0')`,
    // Sum of bonuses recorded for this sub on this job — needed to adjust hourly owed amount
    totalBonuses: sql<string>`COALESCE((
      SELECT SUM(spr.bonus_amount) FROM sub_payment_records spr
      WHERE spr.job_id = ${jobId}
        AND spr.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
        AND (spr.is_reversal IS NULL OR spr.is_reversal = false)
        AND spr.bonus_amount IS NOT NULL
    ), '0')`,
  }).from(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, jobId));

  // Fetch split pool once if any allocation sub needs it
  const hasAllocation = allRows.some(r => (r.compensationType ?? "hourly") === "allocation");
  const splitPool = hasAllocation ? (await computeAllocationSplitPool(jobId)).splitPool : 0;

  const allPaid = allRows.length > 0 && allRows.every(r => {
    // paymentStatus='paid'/'overpaid' is authoritative — set by pay-worker endpoint
    if (r.paymentStatus === "paid" || r.paymentStatus === "overpaid") return true;
    // Use the ledger total as authoritative paid amount — amountPaid column can be stale
    const ledger = parseFloat(r.ledgerPaid ?? "0");
    const columnPaid = r.amountPaid != null ? parseFloat(r.amountPaid) : 0;
    const paid = Math.max(ledger, columnPaid);
    let owed = computeSubOwed(r, splitPool);
    if (owed === null) return false; // owed unknown → treat as unpaid
    // For hourly subs, computeSubOwed returns hours×rate only. Add recorded bonuses
    // so a valid bonus payment doesn't incorrectly keep the status as partial/unpaid.
    if ((r.compensationType ?? "hourly") === "hourly") {
      owed += parseFloat((r as any).totalBonuses ?? "0");
    }
    return owed <= 0 || paid >= owed - 0.01;
  });
  await db.update(jobsTable).set({ subPaid: allPaid }).where(eq(jobsTable.id, jobId));
  return allPaid;
}

const phasesInputSchema = z.array(phaseItemSchema).nullable().optional();
const permitChecklistInputSchema = z.array(permitChecklistItemSchema).nullable().optional();

function parsePhases(raw: unknown) {
  if (raw === null || raw === undefined) return null;
  const result = phasesInputSchema.safeParse(raw);
  if (!result.success) throw new Error("phases must be an array of { name: string, completed: boolean }");
  return result.data ?? null;
}

function parsePermitChecklist(raw: unknown) {
  if (raw === null || raw === undefined) return null;
  const result = permitChecklistInputSchema.safeParse(raw);
  if (!result.success) throw new Error("permitChecklist must be an array of { label: string, checked: boolean }");
  return result.data ?? null;
}

type PhaseItem = { name: string; completed: boolean };
type PermitChecklistItem = { label: string; checked: boolean };

async function validateMfhSelection(manufacturerValue: unknown, modelValue: unknown) {
  const manufacturerId = manufacturerValue == null || manufacturerValue === ""
    ? null
    : Number(manufacturerValue);
  const modelId = modelValue == null || modelValue === ""
    ? null
    : Number(modelValue);

  if (manufacturerId != null && (!Number.isInteger(manufacturerId) || manufacturerId <= 0)) {
    return { error: "Invalid builder selection" } as const;
  }
  if (modelId != null && (!Number.isInteger(modelId) || modelId <= 0)) {
    return { error: "Invalid model selection" } as const;
  }
  if (modelId != null && manufacturerId == null) {
    return { error: "A model requires a builder" } as const;
  }

  if (manufacturerId != null) {
    const [builder] = await db
      .select({ id: mfhManufacturersTable.id })
      .from(mfhManufacturersTable)
      .where(eq(mfhManufacturersTable.id, manufacturerId))
      .limit(1);
    if (!builder) return { error: "Builder not found" } as const;
  }

  if (modelId != null) {
    const [model] = await db
      .select({ manufacturerId: mfhModelsTable.manufacturerId })
      .from(mfhModelsTable)
      .where(eq(mfhModelsTable.id, modelId))
      .limit(1);
    if (!model) return { error: "Model not found" } as const;
    if (model.manufacturerId !== manufacturerId) {
      return { error: "The selected model does not belong to the selected builder" } as const;
    }
  }

  return { manufacturerId, modelId } as const;
}

type JobRow = {
  id: number;
  title: string;
  description: string | null;
  clientId: number | null;
  clientName: string | null;
  clientEmail: string | null;
  status: string;
  jobType: string | null;
  homeModel: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  locationName: string | null;
  startDate: string | null;
  endDate: string | null;
  closedAt: string | null;
  notes: string | null;
  businessLine: string | null;
  businessId: number | null;
  workflow: string | null;
  planningState: string;
  priority: string;
  resourceDemand: string;
  queuePosition: number | null;
  subPaid: boolean;
  sqFt: number | null;
  coats: number | null;
  phases: PhaseItem[] | null;
  permitChecklist: PermitChecklistItem[] | null;
  serviceBilling: ServiceBilling | null;
  mfhManufacturerId: number | null;
  mfhModelId: number | null;
  mfhManufacturerName?: string | null;
  mfhModelName?: string | null;
  mfhModelYear: number | null;
  mfhConstructionType: string | null;
  mhProductionServices: { id: number; name: string }[] | null;
  manHours: string | null;
  createdAt: Date;
  subcontractorId?: number | null;
  subcontractorName?: string | null;
};

type FormattedJob = Omit<JobRow, "createdAt" | "subcontractorId" | "subcontractorName"> & {
  createdAt: string;
  subcontractorIds: number[];
  subcontractorNames: string[];
};

function formatJob(row: JobRow & { subcontractorIds: number[]; subcontractorNames: string[] }): FormattedJob {
  const { subcontractorId: _sid, subcontractorName: _sname, ...rest } = row;
  return {
    ...rest,
    createdAt: rest.createdAt instanceof Date ? rest.createdAt.toISOString() : rest.createdAt,
    subcontractorIds: row.subcontractorIds,
    subcontractorNames: row.subcontractorNames,
  };
}

async function getJobWithSubs(jobId: number) {
  const rows = await db
    .select({
      id: jobsTable.id,
      title: jobsTable.title,
      description: jobsTable.description,
      clientId: jobsTable.clientId,
      clientName: clientsTable.name,
      clientEmail: clientsTable.email,
      status: jobsTable.status,
      jobType: jobsTable.jobType,
      homeModel: jobsTable.homeModel,
      address: jobsTable.address,
      city: jobsTable.city,
      state: jobsTable.state,
      locationName: jobsTable.locationName,
      startDate: jobsTable.startDate,
      endDate: jobsTable.endDate,
      closedAt: jobsTable.closedAt,
      notes: jobsTable.notes,
      businessLine: jobsTable.businessLine,
      businessId: jobsTable.businessId,
      workflow: jobsTable.workflow,
       planningState: jobsTable.planningState,
       priority: jobsTable.priority,
       resourceDemand: jobsTable.resourceDemand,
       queuePosition: jobsTable.queuePosition,
      subPaid: jobsTable.subPaid,
      sqFt: jobsTable.sqFt,
      coats: jobsTable.coats,
      phases: jobsTable.phases,
      permitChecklist: jobsTable.permitChecklist,
      serviceBilling: jobsTable.serviceBilling,
      mfhManufacturerId: jobsTable.mfhManufacturerId,
      mfhModelId: jobsTable.mfhModelId,
      mfhManufacturerName: mfhManufacturersTable.name,
      mfhModelName: mfhModelsTable.name,
      mfhModelYear: jobsTable.mfhModelYear,
      mfhConstructionType: jobsTable.mfhConstructionType,
      mhProductionServices: jobsTable.mhProductionServices,
      manHours: jobsTable.manHours,
      createdAt: jobsTable.createdAt,
      subcontractorId: jobSubcontractorsTable.subcontractorId,
      subcontractorName: subcontractorsTable.name,
    })
    .from(jobsTable)
    .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
    .leftJoin(mfhManufacturersTable, eq(jobsTable.mfhManufacturerId, mfhManufacturersTable.id))
    .leftJoin(mfhModelsTable, eq(jobsTable.mfhModelId, mfhModelsTable.id))
    .leftJoin(jobSubcontractorsTable, eq(jobsTable.id, jobSubcontractorsTable.jobId))
    .leftJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
    .where(eq(jobsTable.id, jobId));

  if (!rows.length) return null;

  const base = rows[0];
  const subcontractorIds: number[] = [];
  const subcontractorNames: string[] = [];
  for (const r of rows) {
    if (r.subcontractorId && !subcontractorIds.includes(r.subcontractorId)) {
      subcontractorIds.push(r.subcontractorId);
      if (r.subcontractorName) subcontractorNames.push(r.subcontractorName);
    }
  }

  return formatJob({ ...base, subcontractorIds, subcontractorNames } as any);
}

async function replaceSubcontractors(jobId: number, ids: number[]) {
  // Differential update: only insert new links and delete removed ones.
  // This preserves existing payment/hours data on unchanged job_subcontractors rows.
  const existing = await db
    .select({ subcontractorId: jobSubcontractorsTable.subcontractorId })
    .from(jobSubcontractorsTable)
    .where(eq(jobSubcontractorsTable.jobId, jobId));
  const existingIds = existing.map(r => r.subcontractorId);

  const toAdd = ids.filter(id => !existingIds.includes(id));
  const toRemove = existingIds.filter(id => !ids.includes(id));

  if (toAdd.length > 0) {
    await db.insert(jobSubcontractorsTable).values(
      toAdd.map(sid => ({ jobId, subcontractorId: sid }))
    );
  }
  if (toRemove.length > 0) {
    await db.delete(jobSubcontractorsTable).where(
      and(
        eq(jobSubcontractorsTable.jobId, jobId),
        inArray(jobSubcontractorsTable.subcontractorId, toRemove)
      )
    );
    // A reimbursement recipient must remain assigned to the job. If the
    // selected subcontractor is removed, preserve the reimbursement amount
    // but safely reset its recipient to the business owner. Other recipient
    // types are intentionally left unchanged.
    await db.update(jobMileageReimbursementsTable)
      .set({
        recipientType: "owner",
        recipientName: "Business owner",
        recipientSubcontractorId: null,
      })
      .where(and(
        eq(jobMileageReimbursementsTable.jobId, jobId),
        eq(jobMileageReimbursementsTable.recipientType, "subcontractor"),
        inArray(jobMileageReimbursementsTable.recipientSubcontractorId, toRemove),
      ));
  }
  // Keep sub_paid in sync whenever the sub assignment changes
  if (toAdd.length > 0 || toRemove.length > 0) {
    await recomputeSubPaid(jobId).catch(() => {});
  }
}

router.get("/trim-out-catalog", async (req, res): Promise<void> => {
  try {
    const parsed = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
      manufacturerId: z.coerce.number().int().positive().optional(),
      modelId: z.coerce.number().int().positive().optional(),
    }).safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope)) return;
    const conditions = [
      inArray(jobsTable.status, ["completed", "invoiced", "closed"]),
      sql`${jobsTable.mfhManufacturerId} is not null`,
      sql`${jobsTable.mfhModelId} is not null`,
    ];
    if (scope) {
      conditions.push(or(
        eq(jobsTable.businessId, scope.id),
        and(isNull(jobsTable.businessId), eq(jobsTable.businessLine, scope.slug)),
      )!);
    }

    if (parsed.data.manufacturerId) {
      conditions.push(eq(jobsTable.mfhManufacturerId, parsed.data.manufacturerId));
    }
    if (parsed.data.modelId) {
      conditions.push(eq(jobsTable.mfhModelId, parsed.data.modelId));
    }
    const where = and(...conditions);
    const photoCountExpr = sql<number>`(
      coalesce((select count(*) from job_finished_photos fp join job_checklists jc on jc.id = fp.job_checklist_id where jc.job_id = ${jobsTable.id}), 0)
      + coalesce((select count(*) from job_start_photos sp join job_checklists jc on jc.id = sp.job_checklist_id where jc.job_id = ${jobsTable.id}), 0)
      + coalesce((select count(*) from job_checklist_item_photos ip join job_checklist_items ji on ji.id = ip.job_checklist_item_id join job_checklists jc on jc.id = ji.job_checklist_id where jc.job_id = ${jobsTable.id}), 0)
    )::int`;
    const coverPathExpr = sql<string | null>`coalesce(
      (select fp.object_path from job_finished_photos fp join job_checklists jc on jc.id = fp.job_checklist_id where jc.job_id = ${jobsTable.id} order by fp.created_at asc limit 1),
      (select sp.object_path from job_start_photos sp join job_checklists jc on jc.id = sp.job_checklist_id where jc.job_id = ${jobsTable.id} order by sp.created_at asc limit 1),
      (select ip.object_path from job_checklist_item_photos ip join job_checklist_items ji on ji.id = ip.job_checklist_item_id join job_checklists jc on jc.id = ji.job_checklist_id where jc.job_id = ${jobsTable.id} order by ip.created_at asc limit 1)
    )`;

    const [{ totalHomes }] = await db
      .select({ totalHomes: count(jobsTable.id) })
      .from(jobsTable)
      .where(where);
    const totalPages = Math.max(1, Math.ceil(totalHomes / parsed.data.pageSize));
    const page = Math.min(parsed.data.page, totalPages);
    const offset = (page - 1) * parsed.data.pageSize;
    const [homeRows, builderRows, modelRows] = await Promise.all([
      db.select({
        jobId: jobsTable.id,
        manufacturerId: jobsTable.mfhManufacturerId,
        manufacturerName: mfhManufacturersTable.name,
        modelId: jobsTable.mfhModelId,
        modelName: mfhModelsTable.name,
        locationName: jobsTable.locationName,
        address: jobsTable.address,
        city: jobsTable.city,
        state: jobsTable.state,
        endDate: jobsTable.endDate,
        photoCount: photoCountExpr,
        coverPath: coverPathExpr,
      })
        .from(jobsTable)
        .innerJoin(mfhManufacturersTable, eq(jobsTable.mfhManufacturerId, mfhManufacturersTable.id))
        .innerJoin(mfhModelsTable, eq(jobsTable.mfhModelId, mfhModelsTable.id))
        .where(where)
        .orderBy(desc(jobsTable.endDate), desc(jobsTable.createdAt))
        .limit(parsed.data.pageSize)
        .offset(offset),
      db.select({
        id: mfhManufacturersTable.id,
        name: mfhManufacturersTable.name,
        homeCount: count(jobsTable.id),
        modelCount: countDistinct(jobsTable.mfhModelId),
        photoCount: sql<number>`coalesce(sum(${photoCountExpr}), 0)::int`,
      })
        .from(jobsTable)
        .innerJoin(mfhManufacturersTable, eq(jobsTable.mfhManufacturerId, mfhManufacturersTable.id))
        .where(where)
        .groupBy(mfhManufacturersTable.id, mfhManufacturersTable.name)
        .orderBy(mfhManufacturersTable.name),
      db.select({
        manufacturerId: mfhManufacturersTable.id,
        id: mfhModelsTable.id,
        name: mfhModelsTable.name,
        homeCount: count(jobsTable.id),
        photoCount: sql<number>`coalesce(sum(${photoCountExpr}), 0)::int`,
        coverPath: sql<string | null>`max(${coverPathExpr})`,
      })
        .from(jobsTable)
        .innerJoin(mfhManufacturersTable, eq(jobsTable.mfhManufacturerId, mfhManufacturersTable.id))
        .innerJoin(mfhModelsTable, eq(jobsTable.mfhModelId, mfhModelsTable.id))
        .where(where)
        .groupBy(mfhManufacturersTable.id, mfhModelsTable.id, mfhModelsTable.name)
        .orderBy(mfhModelsTable.name),
    ]);
    const homes = homeRows.map(job => ({
      jobId: job.jobId,
      manufacturerId: job.manufacturerId!,
      manufacturerName: job.manufacturerName,
      modelId: job.modelId!,
      modelName: job.modelName,
      locationName: job.locationName,
      address: job.address,
      city: job.city,
      state: job.state,
      endDate: job.endDate,
      photoCount: job.photoCount,
      coverPhotoUrl: catalogPhotoUrl(job.coverPath),
    }));
    const modelsByBuilder = new Map<number, Array<{
      id: number; name: string; homeCount: number; photoCount: number; coverPhotoUrl: string | null;
    }>>();
    for (const model of modelRows) {
      const models = modelsByBuilder.get(model.manufacturerId) ?? [];
      models.push({
        id: model.id,
        name: model.name,
        homeCount: model.homeCount,
        photoCount: model.photoCount,
        coverPhotoUrl: catalogPhotoUrl(model.coverPath),
      });
      modelsByBuilder.set(model.manufacturerId, models);
    }
    const builders = builderRows.map(builder => ({
      ...builder,
      models: modelsByBuilder.get(builder.id) ?? [],
    }));

    res.json({ builders, homes, page, pageSize: parsed.data.pageSize, totalHomes, totalPages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load Trim-Out Catalog" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { status, clientId } = req.query;
    const conditions = [];
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope)) return;
    if (scope) {
      conditions.push(or(
        eq(jobsTable.businessId, scope.id),
        and(isNull(jobsTable.businessId), eq(jobsTable.businessLine, scope.slug)),
      ));
    }
    if (status) conditions.push(eq(jobsTable.status, status as string));
    if (clientId) conditions.push(eq(jobsTable.clientId, parseInt(clientId as string)));

    const rows = await db
      .select({
        id: jobsTable.id,
        title: jobsTable.title,
        description: jobsTable.description,
        clientId: jobsTable.clientId,
        clientName: clientsTable.name,
        clientEmail: clientsTable.email,
        status: jobsTable.status,
        jobType: jobsTable.jobType,
        address: jobsTable.address,
        city: jobsTable.city,
        state: jobsTable.state,
        locationName: jobsTable.locationName,
        startDate: jobsTable.startDate,
        endDate: jobsTable.endDate,
        closedAt: jobsTable.closedAt,
        notes: jobsTable.notes,
        businessLine: jobsTable.businessLine,
        businessId: jobsTable.businessId,
        workflow: jobsTable.workflow,
         planningState: jobsTable.planningState,
         priority: jobsTable.priority,
         resourceDemand: jobsTable.resourceDemand,
         queuePosition: jobsTable.queuePosition,
        subPaid: jobsTable.subPaid,
        sqFt: jobsTable.sqFt,
        coats: jobsTable.coats,
        phases: jobsTable.phases,
        permitChecklist: jobsTable.permitChecklist,
        serviceBilling: jobsTable.serviceBilling,
        homeModel: jobsTable.homeModel,
        mfhManufacturerId: jobsTable.mfhManufacturerId,
        mfhModelId: jobsTable.mfhModelId,
        mfhManufacturerName: mfhManufacturersTable.name,
        mfhModelName: mfhModelsTable.name,
         mfhModelYear: jobsTable.mfhModelYear,
        mfhConstructionType: jobsTable.mfhConstructionType,
        mhProductionServices: jobsTable.mhProductionServices,
        manHours: jobsTable.manHours,
        createdAt: jobsTable.createdAt,
        subcontractorId: jobSubcontractorsTable.subcontractorId,
        subcontractorName: subcontractorsTable.name,
      })
      .from(jobsTable)
      .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
      .leftJoin(mfhManufacturersTable, eq(jobsTable.mfhManufacturerId, mfhManufacturersTable.id))
      .leftJoin(mfhModelsTable, eq(jobsTable.mfhModelId, mfhModelsTable.id))
      .leftJoin(jobSubcontractorsTable, eq(jobsTable.id, jobSubcontractorsTable.jobId))
      .leftJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(jobsTable.createdAt);

    const jobMap = new Map<number, JobRow & { subcontractorIds: number[]; subcontractorNames: string[] }>();
    for (const r of rows) {
      if (!jobMap.has(r.id)) {
        jobMap.set(r.id, { ...r, subcontractorIds: [], subcontractorNames: [] } as any);
      }
      const job = jobMap.get(r.id)!;
      if (r.subcontractorId && !job.subcontractorIds.includes(r.subcontractorId)) {
        job.subcontractorIds.push(r.subcontractorId);
        if (r.subcontractorName) job.subcontractorNames.push(r.subcontractorName);
      }
    }

    const formatted = Array.from(jobMap.values()).map((j) => formatJob(j as any));
    const activeConditions = formatted.length ? await db.select().from(jobReadinessConditionsTable)
      .where(and(inArray(jobReadinessConditionsTable.jobId, formatted.map(job => job.id)), isNull(jobReadinessConditionsTable.clearedAt)))
      .orderBy(desc(jobReadinessConditionsTable.createdAt)) : [];
    const activeByJob = new Map<number, typeof activeConditions[number]>();
    for (const condition of activeConditions) if (!activeByJob.has(condition.jobId)) activeByJob.set(condition.jobId, condition);
    res.json(formatted.map(job => ({ ...job, activeReadinessCondition: activeByJob.get(job.id) ?? null })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, description, clientId, subcontractorIds = [], status, jobType, homeModel, address, city, state, locationName, startDate, endDate, notes, businessLine, workflow, sqFt, coats, phases, permitChecklist, mfhManufacturerId, mfhModelId, mfhModelYear, mfhConstructionType, mhProductionServices, manHours, includeMileageInJobCosts = true, planningState = "ready", priority = "normal", resourceDemand = "standard", queuePosition = null } = req.body;
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    if (!title) return res.status(400).json({ error: "Title is required" });
    if (typeof includeMileageInJobCosts !== "boolean") return res.status(400).json({ error: "includeMileageInJobCosts must be a boolean" });
    if (sqFt != null && (isNaN(parseInt(sqFt)) || parseInt(sqFt) < 0)) return res.status(400).json({ error: "sqFt must be a non-negative integer" });
    if (coats != null && ![1, 2].includes(parseInt(coats))) return res.status(400).json({ error: "coats must be 1 or 2" });
    if (!["ready", "scheduled", "waiting", "queue"].includes(planningState)) return res.status(400).json({ error: "Invalid planningState" });
    if (!["urgent", "high", "normal", "low"].includes(priority)) return res.status(400).json({ error: "Invalid priority" });
    if (!["standard", "large_crew", "all_hands"].includes(resourceDemand)) return res.status(400).json({ error: "Invalid resourceDemand" });
    if (queuePosition != null && (!Number.isInteger(Number(queuePosition)) || Number(queuePosition) < 0)) return res.status(400).json({ error: "queuePosition must be a non-negative integer or null" });

    let parsedPhases;
    try { parsedPhases = parsePhases(phases); } catch (e: unknown) { return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid phases" }); }

    let parsedPermitChecklist;
    try { parsedPermitChecklist = parsePermitChecklist(permitChecklist); } catch (e: unknown) { return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid permitChecklist" }); }

    const mfhSelection = await validateMfhSelection(mfhManufacturerId, mfhModelId);
    if ("error" in mfhSelection) return res.status(400).json({ error: mfhSelection.error });

    // Assign the next sequential job number (max existing + 1, gap-free)
    const [{ maxNum }] = await db.select({ maxNum: sql<number>`COALESCE(MAX(job_number), 0)` }).from(jobsTable);
    const nextJobNumber = (maxNum ?? 0) + 1;

    const [job] = await db.insert(jobsTable).values({
      title, description,
      clientId: clientId || null,
      status: status || "scheduled",
      jobType, homeModel: homeModel || null, address, city, state, locationName,
      startDate, endDate,
      notes,
       businessLine: ownership.business.slug,
       businessId: ownership.business.id,
       planningState, priority, resourceDemand, queuePosition: queuePosition == null ? null : Number(queuePosition),
      workflow: workflow || null,
      sqFt: sqFt != null ? parseInt(sqFt) : null,
      coats: coats != null ? parseInt(coats) : null,
      phases: parsedPhases,
      permitChecklist: parsedPermitChecklist,
      jobNumber: nextJobNumber,
      mfhManufacturerId: mfhSelection.manufacturerId,
      mfhModelId: mfhSelection.modelId,
      mfhModelYear: mfhModelYear != null ? parseInt(mfhModelYear) : null,
      mfhConstructionType: mfhConstructionType || null,
      mhProductionServices: Array.isArray(mhProductionServices) ? mhProductionServices : null,
      manHours: manHours != null ? String(manHours) : null,
      includeMileageInJobCosts,
    }).returning();

    if (Array.isArray(subcontractorIds) && subcontractorIds.length > 0) {
      await replaceSubcontractors(job.id, subcontractorIds);
    }

    const result = await getJobWithSubs(job.id);
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create job" });
  }
});

// Per-job profit: GET /:id/profit
// NOTE: this route must be registered before /:id so it is not shadowed
router.get("/:id/profit", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });

    const [invRows, otherIncomeRows, expRows, allocationRows, reimbursementRows, sprRows, subHoursRow, subHoursSum, accruedBonusRow] = await Promise.all([
      db.select({ total: invoicesTable.total, status: invoicesTable.status })
        .from(invoicesTable).where(and(eq(invoicesTable.jobId, id), isNull(invoicesTable.voidedAt))),
      // Job-linked other income is standalone cash revenue only when it has an
      // explicit job link. Unlinked rows remain in aggregate/tax reports only.
      db.select({ amount: otherIncomeTable.amount })
        .from(otherIncomeTable).where(and(eq(otherIncomeTable.jobId, id), isNull(otherIncomeTable.voidedAt))),
      // Fetch all expenses not auto-linked to a sub-hours row.
      // Subcontractor-category expenses are moved into the sub labor bucket below
      // so they never double-count with hours-based sub labor cost.
      db.select({ id: expensesTable.id, amount: expensesTable.amount, category: expensesTable.category, subcontractorId: expensesTable.subcontractorId, countsTowardJobProfit: expensesTable.countsTowardJobProfit, tripId: expensesTable.tripId })
        .from(expensesTable).where(and(eq(expensesTable.jobId, id), isNull(expensesTable.jobSubHoursId), isNull(expensesTable.voidedAt))),
      db.select({ expenseId: jobExpenseAllocationsTable.expenseId, amount: jobExpenseAllocationsTable.amount })
        .from(jobExpenseAllocationsTable)
        .innerJoin(expensesTable, eq(jobExpenseAllocationsTable.expenseId, expensesTable.id))
        .where(and(eq(jobExpenseAllocationsTable.jobId, id), isNull(expensesTable.voidedAt))),
      db.select({
        id: jobMileageReimbursementsTable.id,
        amount: jobMileageReimbursementsTable.amount,
        estimatedAmount: jobMileageReimbursementsTable.estimatedAmount,
        recipientType: jobMileageReimbursementsTable.recipientType,
        recipientName: jobMileageReimbursementsTable.recipientName,
        recipientSubcontractorId: jobMileageReimbursementsTable.recipientSubcontractorId,
        status: jobMileageReimbursementsTable.status,
        paidAt: jobMileageReimbursementsTable.paidAt,
        notes: jobMileageReimbursementsTable.notes,
      }).from(jobMileageReimbursementsTable)
        .where(eq(jobMileageReimbursementsTable.jobId, id)),
      // sub_payment_records is the authoritative ledger for fixed/allocation sub payments
      // (pay-worker stopped writing to expenses in Task #892).
      // Only include non-hourly subs — hourly costs are already captured via job_sub_hours.
      // Grouped by compensation type: 'fixed' feeds subLaborCost, 'allocation' is
      // reported separately as allocPaid so Pay Breakdown (which treats allocation
      // subs as profit split, not labor) keeps its inputs unchanged.
      db.select({
        compType: jobSubcontractorsTable.compensationType,
        total: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.amount} + COALESCE(${subPaymentRecordsTable.advanceAmount}, 0)), 0)`,
      })
        .from(subPaymentRecordsTable)
        .innerJoin(jobSubcontractorsTable, and(
          eq(jobSubcontractorsTable.jobId, subPaymentRecordsTable.jobId),
          eq(jobSubcontractorsTable.subcontractorId, subPaymentRecordsTable.subcontractorId),
        ))
        .where(and(
          eq(subPaymentRecordsTable.jobId, id),
          sql`${subPaymentRecordsTable.isReversal} IS NOT TRUE`,
          sql`${jobSubcontractorsTable.compensationType} IN ('fixed', 'allocation')`,
        ))
        .groupBy(jobSubcontractorsTable.compensationType),
      // Hourly labor uses a job-level agreed amount when one exists; otherwise
      // it falls back to the immutable hours × rate snapshot calculation.
      db.select({ total: sql<string>`COALESCE(SUM(
        CASE
          WHEN ${jobSubcontractorsTable.compensationType} = 'hourly'
            AND ${jobSubcontractorsTable.amountOwed} IS NOT NULL
          THEN ${jobSubcontractorsTable.amountOwed}
          WHEN ${jobSubcontractorsTable.compensationType} = 'hourly'
          THEN COALESCE((
            SELECT SUM(h.hours * COALESCE(h.rate_snapshot, 0))
            FROM job_sub_hours h
            WHERE h.job_id = ${jobSubcontractorsTable.jobId}
              AND h.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
          ), 0)
          ELSE 0
        END
      ), 0)` })
        .from(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, id)),
      db.select({ total: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours}), 0)` })
        .from(jobSubHoursTable).where(eq(jobSubHoursTable.jobId, id)),
      // Accrued bonuses saved via Save Changes — counted as labor cost even before payment
      db.select({ total: sql<string>`COALESCE(SUM(${jobSubcontractorsTable.accruedBonus}), 0)` })
        .from(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, id)),
    ]);

    const mileageReimbursement = reimbursementRows[0] ?? null;
    const hasActualFuelExpense = expRows.some(e =>
      e.category === "Fuel/Travel" && e.countsTowardJobProfit !== false
    );
    const mileageReimbursementApplied = !hasActualFuelExpense;

    // ── Estimated fuel cost (job-card operational value; never affects accounting/tax reports) ──
    // RoutingEngine is the single source of truth for driving distance (Constitution Rule 51).
    // VehicleEngine owns all fuel-cost math — no caller may compute distance/mpg×price directly (Rule 53).
    let estimatedFuelCost: number | null = null;
    let operationalProfit: number | null = null;
    let fuelStatus: "ok" | "missing_address" | "geocoding_failed" | "workdays_missing" | "error" = "ok";
    let fuelReconciliation: JobFuelReconciliation = "estimate_unavailable";
    let fuelBreakdown: {
      onewayMiles: number; roundTripMiles: number; daysOnJob: number;
      totalMiles: number; fuelGallons: number; mpg: number; fuelPrice: number;
      routeProvider: "osrm" | "haversine";
    } | null = null;
    let includeMileageInJobCosts = true;

    try {
      const [[settingsRow], defaultVehicles] = await Promise.all([
        db.select({
          companyAddress: settingsTable.companyAddress,
          companyCity: settingsTable.companyCity,
          companyState: settingsTable.companyState,
          // vehicleMpg and fuelPricePerGallon are NOT selected here — those columns exist in
          // the Drizzle schema but were never migrated into the actual database.
          // The vehicles table is the correct source for both values.
        }).from(settingsTable).limit(1),
        db.select({
          avgMpg: vehiclesTable.avgMpg,
          fuelPricePerGallon: vehiclesTable.fuelPricePerGallon,
        }).from(vehiclesTable).where(eq(vehiclesTable.isDefault, true)).limit(1),
      ]);

      // Default vehicle is the sole source of MPG and fuel price.
      // Default to $3.50/gal if no vehicle is configured so the estimate still shows.
      const DEFAULT_FUEL_PRICE = 3.50;
      const defaultVehicle = defaultVehicles[0] ?? null;
      const rawFuelPrice = defaultVehicle?.fuelPricePerGallon ?? null;
      const fuelPrice = rawFuelPrice != null ? parseFloat(String(rawFuelPrice)) : DEFAULT_FUEL_PRICE;

      if (fuelPrice > 0) {
        const mpg = defaultVehicle?.avgMpg ?? 17;

        const [jobRow] = await db.select({
          address: jobsTable.address, city: jobsTable.city, state: jobsTable.state,
          startDate: jobsTable.startDate, endDate: jobsTable.endDate,
          includeMileageInJobCosts: jobsTable.includeMileageInJobCosts,
        }).from(jobsTable).where(eq(jobsTable.id, id));

        const businessAddr = [settingsRow?.companyAddress, settingsRow?.companyCity, settingsRow?.companyState]
          .filter(Boolean).join(", ");
        const jobAddr = [jobRow?.address, jobRow?.city, jobRow?.state]
          .filter(Boolean).join(", ");
        includeMileageInJobCosts = jobRow?.includeMileageInJobCosts !== false;

        // RoutingEngine.calculate() is the only place OSRM is called server-side for job routing.
        // It shares a single 24h in-memory cache with /api/business-distance — same engine,
        // same cache key — so the "X mi from shop" on the job card and this fuel estimate
        // always reflect identical mileage.
        const route = await RoutingEngine.calculate({ origin: businessAddr, destination: jobAddr });

        if (route.routeStatus === "missing_address") {
          fuelStatus = "missing_address";
        } else if (route.routeStatus === "geocoding_failed") {
          fuelStatus = "geocoding_failed";
        } else if (route.miles != null) {
          // Workdays come from actual work evidence, not the scheduled calendar span.
          // A skipped day between startDate and endDate must not create a round trip.
          const [subHourDateRows, dailyLogDateRows] = await Promise.all([
            db.select({ date: jobSubHoursTable.date })
              .from(jobSubHoursTable)
              .where(eq(jobSubHoursTable.jobId, id)),
            db.select({ date: dailyLogsTable.date })
              .from(dailyLogsTable)
              .where(eq(dailyLogsTable.jobId, id)),
          ]);
          const daysOnJob = countActualWorkdays(
            subHourDateRows.map(row => row.date),
            dailyLogDateRows.map(row => row.date),
          );

          if (daysOnJob == null) {
            fuelStatus = "workdays_missing";
          } else {
            // VehicleEngine.operatingCost() is the only place fuel math runs (Rule 53).
            // Formula: totalMiles = (onewayMiles × 2) × daysOnJob; fuelCost = totalMiles / mpg × fuelPrice
            const vehicleCost = VehicleEngine.operatingCost({
              onewayMiles: route.miles,
              daysOnJob,
              vehicleProfile: { avgMpg: mpg, fuelPricePerGallon: fuelPrice },
            });

            estimatedFuelCost = vehicleCost.fuelCost;
            operationalProfit = null;
            fuelStatus = "ok";
            fuelBreakdown = {
              onewayMiles: route.miles,
              roundTripMiles: vehicleCost.roundTripMiles,
              daysOnJob,
              totalMiles: vehicleCost.totalMiles,
              fuelGallons: vehicleCost.fuelGallons,
              mpg,
              fuelPrice,
              routeProvider: route.provider,
            };
          }
        }
      }
    } catch (fuelErr) {
      // Fuel cost is informational — never fail the profit endpoint
      fuelStatus = "error";
      console.warn("[profit] fuel cost estimation skipped:", fuelErr);
    }

    fuelReconciliation = resolveJobFuelReconciliation({
      includeMileageInJobCosts,
      hasActualFuelExpense,
      reimbursementAmount: mileageReimbursement?.amount == null
        ? null
        : parseFloat(mileageReimbursement.amount),
      estimatedFuelCost,
    });

    const profit = calculateJobProfit({
      invoices: invRows,
      otherIncome: otherIncomeRows,
      expenses: expRows,
      allocations: allocationRows,
      mileageReimbursement: mileageReimbursement?.amount == null
        ? null
        : parseFloat(mileageReimbursement.amount),
      hasMileageReimbursement: mileageReimbursement != null,
      estimatedFuelCost,
      includeMileageInJobCosts,
      hasActualFuelExpense,
      hourlyLaborCost: parseFloat(subHoursRow?.[0]?.total ?? "0"),
      totalSubHours: parseFloat(subHoursSum?.[0]?.total ?? "0"),
      fixedSubCost: parseFloat(sprRows.find(r => r.compType === "fixed")?.total ?? "0"),
      accruedBonus: parseFloat(accruedBonusRow?.[0]?.total ?? "0"),
      allocPaid: parseFloat(sprRows.find(r => r.compType === "allocation")?.total ?? "0"),
    });
    const {
      grossInvoiced, collected, otherIncomeRevenue, jobExpenses,
      auditTrailTotal, tripTravelTotal, tripMealsDeductible,
      subLaborCost, allocPaid, totalSubHours, netProfit, ownerDrawTaken,
      actualFuelCost,
    } = profit;
    if (estimatedFuelCost != null) operationalProfit = netProfit;

    const [financialSettings] = await db.select({
      growthReservePct: settingsTable.growthReservePct,
      ownerSplitPct: settingsTable.ownerSplitPct,
      taxReservePct: settingsTable.taxReservePct,
    }).from(settingsTable).limit(1);
    // Allocation pay must use the same server-side split pool as the compact
    // job-card outstanding-payments route. The job status is intentionally not
    // an input to this calculation.
    const allocationSplitPool = calculateAllocationSplitPool({
      revenue: grossInvoiced,
      directExpenses: jobExpenses,
      allocatedExpenses: 0,
      subLaborCost,
      growthReservePct: financialSettings?.growthReservePct != null
        ? parseFloat(String(financialSettings.growthReservePct))
        : 5,
    }).splitPool;

    res.json({
      grossInvoiced, collected, otherIncomeRevenue, jobExpenses, auditTrailTotal, tripTravelTotal, tripMealsDeductible,
      subLaborCost, allocPaid, totalSubHours,
      netProfit, ownerDrawTaken,
      profitBreakdown: profit.profitBreakdown,
      splitPool: allocationSplitPool,
      mileageReimbursement: mileageReimbursement ? {
        ...mileageReimbursement,
        amount: parseFloat(mileageReimbursement.amount ?? "0"),
        estimatedAmount: mileageReimbursement.estimatedAmount == null ? null : parseFloat(mileageReimbursement.estimatedAmount),
      } : null,
      mileageReimbursementApplied,
      estimatedFuelCost,
      includeMileageInJobCosts,
      actualFuelCost: actualFuelCost > 0 ? actualFuelCost : null,
      fuelStatus,
      fuelReconciliation,
      operationalProfit,
      fuelBreakdown,
      growthReservePct: financialSettings?.growthReservePct != null ? parseFloat(String(financialSettings.growthReservePct)) : 5,
      ownerSplitPct: financialSettings?.ownerSplitPct != null ? parseFloat(String(financialSettings.ownerSplitPct)) : 50,
      taxReservePct: financialSettings?.taxReservePct != null ? parseFloat(String(financialSettings.taxReservePct)) : 25,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch job profit" });
  }
});

// Job expense line items: GET /:id/expenses
// Returns individual expense rows that feed the "Job Expenses" total on the P&L tab.
// Mirrors the filtering logic in /:id/profit: excludes sub-hours auto-expenses,
// Owner Draw, Subcontractor category, and countsTowardJobProfit=false rows.
router.get("/:id/expenses", async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });

    const rows = await db
      .select({
        id: expensesTable.id,
        date: expensesTable.date,
        category: expensesTable.category,
        description: expensesTable.description,
        amount: expensesTable.amount,
        subcontractorId: expensesTable.subcontractorId,
        countsTowardJobProfit: expensesTable.countsTowardJobProfit,
        sourceType: expensesTable.sourceType,
        includeMileageInJobCosts: jobsTable.includeMileageInJobCosts,
      })
      .from(expensesTable)
      .leftJoin(jobsTable, eq(expensesTable.jobId, jobsTable.id))
      .where(
        and(
          eq(expensesTable.jobId, id),
          isNull(expensesTable.jobSubHoursId),
          isNull(expensesTable.voidedAt),
        )
      )
      .orderBy(desc(expensesTable.date));

    // Apply exactly the same exclusions as /:id/profit's jobExpenses bucket:
    // - Skip owner-pay categories (equity withdrawals, not business expenses)
    // - Skip subcontractor-linked payroll rows (payroll has its own ledger)
    // - Skip Subcontractor category (goes into sub labor/allocation buckets)
    // - Skip countsTowardJobProfit=false rows (those are audit/travel trail, not job expenses)
    const items = rows
      .filter(r =>
        !isOwnerWithdrawalExpenseCategory(r.category) &&
        r.subcontractorId == null &&
        r.category !== "Subcontractor" &&
        r.countsTowardJobProfit !== false
      )
      .map(({ countsTowardJobProfit: _ctp, includeMileageInJobCosts: _includeMileage, subcontractorId: _subcontractorId, ...rest }) => rest);

    const allocations = await db
      .select({
        id: jobExpenseAllocationsTable.id,
        date: expensesTable.date,
        category: expensesTable.category,
        description: expensesTable.description,
        amount: jobExpenseAllocationsTable.amount,
        notes: jobExpenseAllocationsTable.notes,
      })
      .from(jobExpenseAllocationsTable)
      .innerJoin(expensesTable, eq(jobExpenseAllocationsTable.expenseId, expensesTable.id))
      .where(and(eq(jobExpenseAllocationsTable.jobId, id), isNull(expensesTable.voidedAt)))
      .orderBy(desc(expensesTable.date));

    const [reimbursement] = await db
      .select({
        id: jobMileageReimbursementsTable.id,
        amount: jobMileageReimbursementsTable.amount,
        recipientName: jobMileageReimbursementsTable.recipientName,
        createdAt: jobMileageReimbursementsTable.createdAt,
      })
      .from(jobMileageReimbursementsTable)
      .where(eq(jobMileageReimbursementsTable.jobId, id))
      .limit(1);
    const includeMileageInJobCosts = rows[0]?.includeMileageInJobCosts !== false;
    const hasActualFuelExpense = rows.some(r =>
      r.category === "Fuel/Travel" && r.countsTowardJobProfit !== false
    );

    res.json([
      ...items,
      ...allocations.map(row => ({
        ...row,
        id: -row.id,
        amount: parseFloat(row.amount ?? "0"),
        sourceType: "Job Allocation",
        description: `${row.description} — allocated portion`,
      })),
      ...(reimbursement && includeMileageInJobCosts && !hasActualFuelExpense ? [{
        id: -1000000 - reimbursement.id,
        date: reimbursement.createdAt,
        category: "Mileage Reimbursement",
        description: `Estimated mileage reimbursement — ${reimbursement.recipientName}`,
        amount: parseFloat(reimbursement.amount ?? "0"),
        sourceType: "Job Mileage Reimbursement",
      }] : []),
    ]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch job expenses" });
  }
});

// Batch profit summary: GET /profit-summary?jobIds=1,2,3
router.get("/profit-summary", async (req, res) => {
  try {
    const { jobIds: jobIdsParam } = req.query;
    if (!jobIdsParam || typeof jobIdsParam !== "string") return res.json({});
    const jobIds = jobIdsParam.split(",").map(Number).filter(n => !isNaN(n) && n > 0);
    if (jobIds.length === 0) return res.json({});

    const [invRows, otherIncomeRows, expRows, allocationRows, reimbursementRows, hoursRows, hoursCountRows, manHoursRows, sprNonHoursRows, accruedBonusRows, allocationSplitPools] = await Promise.all([
      db.select({ jobId: invoicesTable.jobId, total: invoicesTable.total, status: invoicesTable.status })
        .from(invoicesTable).where(and(inArray(invoicesTable.jobId, jobIds), isNull(invoicesTable.voidedAt))),
      db.select({ jobId: otherIncomeTable.jobId, amount: otherIncomeTable.amount })
        .from(otherIncomeTable).where(and(inArray(otherIncomeTable.jobId, jobIds), isNull(otherIncomeTable.voidedAt))),
      // Exclude auto-linked sub-hour expenses; payroll-linked rows are not job costs
      db.select({ jobId: expensesTable.jobId, id: expensesTable.id, amount: expensesTable.amount, category: expensesTable.category, subcontractorId: expensesTable.subcontractorId, countsTowardJobProfit: expensesTable.countsTowardJobProfit, tripId: expensesTable.tripId })
        .from(expensesTable).where(and(inArray(expensesTable.jobId, jobIds), isNull(expensesTable.jobSubHoursId), isNull(expensesTable.voidedAt))),
      db.select({ jobId: jobExpenseAllocationsTable.jobId, expenseId: jobExpenseAllocationsTable.expenseId, amount: jobExpenseAllocationsTable.amount })
        .from(jobExpenseAllocationsTable)
        .innerJoin(expensesTable, eq(jobExpenseAllocationsTable.expenseId, expensesTable.id))
        .where(and(inArray(jobExpenseAllocationsTable.jobId, jobIds), isNull(expensesTable.voidedAt))),
      db.select({ jobId: jobMileageReimbursementsTable.jobId, amount: jobMileageReimbursementsTable.amount })
        .from(jobMileageReimbursementsTable)
        .where(inArray(jobMileageReimbursementsTable.jobId, jobIds)),
      db.select({
        jobId: jobSubcontractorsTable.jobId,
        // Match the per-job profit route: a saved hourly agreed amount wins
        // over the raw hours × rate total for that worker.
        total: sql<string>`COALESCE(SUM(
          CASE
            WHEN ${jobSubcontractorsTable.compensationType} = 'hourly'
              AND ${jobSubcontractorsTable.amountOwed} IS NOT NULL
            THEN ${jobSubcontractorsTable.amountOwed}
            WHEN ${jobSubcontractorsTable.compensationType} = 'hourly'
            THEN COALESCE((
              SELECT SUM(h.hours * COALESCE(h.rate_snapshot, 0))
              FROM job_sub_hours h
              WHERE h.job_id = ${jobSubcontractorsTable.jobId}
                AND h.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
            ), 0)
            ELSE 0
          END
        ), 0)`,
      })
        .from(jobSubcontractorsTable)
        .where(inArray(jobSubcontractorsTable.jobId, jobIds))
        .groupBy(jobSubcontractorsTable.jobId),
      // Raw hour count (not cost) — used for man-hours display in the archive table
      db.select({
        jobId: jobSubHoursTable.jobId,
        totalHours: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours}), 0)`,
      })
        .from(jobSubHoursTable)
        .where(inArray(jobSubHoursTable.jobId, jobIds))
        .groupBy(jobSubHoursTable.jobId),
      // Manually-entered man-hours from the job form (fallback when no sub hours tracked)
      db.select({ id: jobsTable.id, manHours: jobsTable.manHours, includeMileageInJobCosts: jobsTable.includeMileageInJobCosts })
        .from(jobsTable)
        .where(inArray(jobsTable.id, jobIds)),
      // sub_payment_records for non-hourly (fixed/allocation) subs — new ledger since Task #892.
      // Grouped by comp type: 'fixed' feeds subLaborCost, 'allocation' → allocPaid.
      db.select({
        jobId: subPaymentRecordsTable.jobId,
        compType: jobSubcontractorsTable.compensationType,
        total: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.amount}), 0)`,
      })
        .from(subPaymentRecordsTable)
        .innerJoin(jobSubcontractorsTable, and(
          eq(jobSubcontractorsTable.jobId, subPaymentRecordsTable.jobId),
          eq(jobSubcontractorsTable.subcontractorId, subPaymentRecordsTable.subcontractorId),
        ))
        .where(and(
          inArray(subPaymentRecordsTable.jobId, jobIds),
          sql`${subPaymentRecordsTable.isReversal} IS NOT TRUE`,
          sql`${jobSubcontractorsTable.compensationType} IN ('fixed', 'allocation')`,
        ))
        .groupBy(subPaymentRecordsTable.jobId, jobSubcontractorsTable.compensationType),
      // Accrued bonuses (saved without payment) — always count as labor cost on all job views
      db.select({
        jobId: jobSubcontractorsTable.jobId,
        total: sql<string>`COALESCE(SUM(${jobSubcontractorsTable.accruedBonus}), 0)`,
      })
        .from(jobSubcontractorsTable)
        .where(inArray(jobSubcontractorsTable.jobId, jobIds))
        .groupBy(jobSubcontractorsTable.jobId),
      // Keep the compact job-card allocation amount on the same server-owned
      // split-pool calculation as the full Job Financials panel and
      // outstanding-payment endpoint.
      computeAllocationSplitPools(jobIds),
    ]);

    const hoursMap = new Map(hoursRows.map(r => [r.jobId, parseFloat(r.total ?? "0")]));
    const hoursCountMap = new Map(hoursCountRows.map(r => [r.jobId, parseFloat(r.totalHours ?? "0")]));
    const manHoursMap = new Map(manHoursRows.map(r => [r.id, r.manHours != null ? parseFloat(r.manHours) : null]));
    const mileageIncludedMap = new Map(manHoursRows.map(r => [r.id, r.includeMileageInJobCosts !== false]));
    const sprFixedMap = new Map<number, number>();
    const sprAllocMap = new Map<number, number>();
    for (const r of sprNonHoursRows) {
      if (r.jobId == null) continue;
      const total = parseFloat(r.total ?? "0");
      if (r.compType === "fixed") sprFixedMap.set(r.jobId, (sprFixedMap.get(r.jobId) ?? 0) + total);
      else if (r.compType === "allocation") sprAllocMap.set(r.jobId, (sprAllocMap.get(r.jobId) ?? 0) + total);
    }
    const accruedBonusMap = new Map(accruedBonusRows.map(r => [r.jobId, parseFloat(r.total ?? "0")]));
    const actualFuelJobIds = new Set(
      expRows
        .filter(e => e.category === "Fuel/Travel" && e.countsTowardJobProfit !== false && e.jobId != null)
        .map(e => e.jobId as number)
    );
    type SummaryRow = {
      grossInvoiced: number;
      collected: number;
      otherIncomeRevenue: number;
      jobExpenses: number;
      subLaborCost: number;
      allocPaid: number;
      totalSubHours: number;
      manHours: number | null;
      netProfit: number;
      splitPool: number;
      estimatedFuelCost?: number | null;
      includeMileageInJobCosts: boolean;
      profitBreakdown: ReturnType<typeof calculateJobProfit>["profitBreakdown"];
    };
    const result: Record<number, SummaryRow> = {};
    for (const id of jobIds) {
      const calculation = calculateJobProfit({
        invoices: invRows.filter(row => row.jobId === id),
        otherIncome: otherIncomeRows.filter(row => row.jobId === id),
        expenses: expRows.filter(row => row.jobId === id),
        allocations: allocationRows.filter(row => row.jobId === id),
        mileageReimbursement: reimbursementRows.find(row => row.jobId === id)?.amount == null
          ? null
          : parseFloat(reimbursementRows.find(row => row.jobId === id)!.amount),
        hasMileageReimbursement: reimbursementRows.some(row => row.jobId === id),
        includeMileageInJobCosts: mileageIncludedMap.get(id) ?? true,
        hasActualFuelExpense: actualFuelJobIds.has(id),
        hourlyLaborCost: hoursMap.get(id) ?? 0,
        totalSubHours: hoursCountMap.get(id) ?? 0,
        fixedSubCost: sprFixedMap.get(id) ?? 0,
        accruedBonus: accruedBonusMap.get(id) ?? 0,
        allocPaid: sprAllocMap.get(id) ?? 0,
      });
      result[id] = {
        ...calculation,
        totalSubHours: hoursCountMap.get(id) ?? 0,
        manHours: manHoursMap.get(id) ?? null,
        splitPool: allocationSplitPools.get(id)?.splitPool ?? 0,
        includeMileageInJobCosts: mileageIncludedMap.get(id) ?? true,
      };
    }

    // ── Estimated fuel cost from cache (informational only — never affects accounting) ──
    // Only reads the RoutingEngine in-memory cache; never triggers new routing calls.
    // Jobs whose route hasn't been fetched yet (e.g. job-card not opened) get null.
    try {
      const [[settingsRow], defaultVehicles, jobAddressRows] = await Promise.all([
        db.select({
          companyAddress: settingsTable.companyAddress,
          companyCity: settingsTable.companyCity,
          companyState: settingsTable.companyState,
        }).from(settingsTable).limit(1),
        db.select({
          avgMpg: vehiclesTable.avgMpg,
          fuelPricePerGallon: vehiclesTable.fuelPricePerGallon,
        }).from(vehiclesTable).where(eq(vehiclesTable.isDefault, true)).limit(1),
        db.select({
          id: jobsTable.id,
          address: jobsTable.address,
          city: jobsTable.city,
          state: jobsTable.state,
          includeMileageInJobCosts: jobsTable.includeMileageInJobCosts,
          workdayCount: sql<number>`(
            SELECT COUNT(*)::int
            FROM (
              SELECT DISTINCT h.date
              FROM job_sub_hours h
              WHERE h.job_id = ${jobsTable.id}
              UNION
              SELECT DISTINCT d.date
              FROM daily_logs d
              WHERE d.job_id = ${jobsTable.id}
            ) AS work_dates
          )`,
        }).from(jobsTable).where(inArray(jobsTable.id, jobIds)),
      ]);

      const businessAddr = [settingsRow?.companyAddress, settingsRow?.companyCity, settingsRow?.companyState]
        .filter(Boolean).join(", ");

      const DEFAULT_FUEL_PRICE = 3.50;
      const defaultVehicle = defaultVehicles[0] ?? null;
      const rawFuelPrice = defaultVehicle?.fuelPricePerGallon ?? null;
      const fuelPrice = rawFuelPrice != null ? parseFloat(String(rawFuelPrice)) : DEFAULT_FUEL_PRICE;
      const mpg: number = defaultVehicle?.avgMpg ?? 17;

      if (businessAddr && fuelPrice > 0) {
        for (const jobRow of jobAddressRows) {
          const jobAddr = [jobRow.address, jobRow.city, jobRow.state].filter(Boolean).join(", ");
          if (!jobAddr) continue;

          const cached = RoutingEngine.getCachedRoute({ origin: businessAddr, destination: jobAddr });
          if (!cached || cached.miles == null) continue;

          const daysOnJob = Number(jobRow.workdayCount ?? 0);
          if (daysOnJob <= 0) continue;
          const vehicleCost = VehicleEngine.operatingCost({
            onewayMiles: cached.miles,
            daysOnJob,
            vehicleProfile: { avgMpg: mpg, fuelPricePerGallon: fuelPrice },
          });
           const row = result[jobRow.id];
           if (!row) continue;
           const calculation = calculateJobProfit({
             invoices: invRows.filter(item => item.jobId === jobRow.id),
             otherIncome: otherIncomeRows.filter(item => item.jobId === jobRow.id),
             expenses: expRows.filter(item => item.jobId === jobRow.id),
             allocations: allocationRows.filter(item => item.jobId === jobRow.id),
             mileageReimbursement: reimbursementRows.find(item => item.jobId === jobRow.id)?.amount == null
               ? null
               : parseFloat(reimbursementRows.find(item => item.jobId === jobRow.id)!.amount),
             hasMileageReimbursement: reimbursementRows.some(item => item.jobId === jobRow.id),
             estimatedFuelCost: vehicleCost.fuelCost,
             includeMileageInJobCosts: jobRow.includeMileageInJobCosts !== false,
             hasActualFuelExpense: actualFuelJobIds.has(jobRow.id),
             hourlyLaborCost: hoursMap.get(jobRow.id) ?? 0,
             totalSubHours: hoursCountMap.get(jobRow.id) ?? 0,
             fixedSubCost: sprFixedMap.get(jobRow.id) ?? 0,
             accruedBonus: accruedBonusMap.get(jobRow.id) ?? 0,
             allocPaid: sprAllocMap.get(jobRow.id) ?? 0,
           });
           row.grossInvoiced = calculation.grossInvoiced;
           row.collected = calculation.collected;
           row.otherIncomeRevenue = calculation.otherIncomeRevenue;
           row.jobExpenses = calculation.jobExpenses;
           row.subLaborCost = calculation.subLaborCost;
           row.allocPaid = calculation.allocPaid;
           row.netProfit = calculation.netProfit;
           row.profitBreakdown = calculation.profitBreakdown;
           row.estimatedFuelCost = vehicleCost.fuelCost;
        }
      }
    } catch (fuelErr) {
      // Fuel enrichment is best-effort — never fail the bulk endpoint
      console.warn("[profit-summary] fuel cache lookup skipped:", fuelErr);
    }

    // Finalize the pool only after every displayed Job Cost, including a saved
    // reimbursement or available fuel estimate, has been applied.
    for (const id of jobIds) {
      const row = result[id];
      row.splitPool = calculateAllocationSplitPool({
        revenue: row.grossInvoiced,
        directExpenses: row.jobExpenses,
        allocatedExpenses: 0,
        subLaborCost: row.subLaborCost,
        growthReservePct: allocationSplitPools.get(id)?.growthReservePct ?? 5,
      }).splitPool;
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch profit summary" });
  }
});

// Active-job financial visibility summary. This composes existing ledgers and
// calculation services; it does not persist a second financial representation.
// Keep this before /:id so "financials-summary" is not parsed as an id.
router.get("/financials-summary", async (req, res) => {
  try {
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope)) return;

    const jobConditions = [ne(jobsTable.status, "closed")];
    if (scope) {
      jobConditions.push(or(
        eq(jobsTable.businessId, scope.id),
        and(isNull(jobsTable.businessId), eq(jobsTable.businessLine, scope.slug)),
      ) as any);
    }

    const queriedJobs = await db
      .select({
        id: jobsTable.id,
        jobNumber: jobsTable.jobNumber,
        title: jobsTable.title,
        status: jobsTable.status,
        clientName: clientsTable.name,
        clientId: jobsTable.clientId,
        businessId: jobsTable.businessId,
        businessLine: jobsTable.businessLine,
        createdAt: jobsTable.createdAt,
      })
      .from(jobsTable)
      .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
      .where(and(...jobConditions))
      .orderBy(desc(jobsTable.createdAt), desc(jobsTable.id));
    // Keep the response fail-closed even if a future query refactor weakens the
    // SQL predicate or a test adapter returns rows without evaluating it.
    const activeJobs = queriedJobs.filter(job => job.status !== "closed");

    if (activeJobs.length === 0) {
      return res.json({
        jobs: [],
        totals: {
          workersOwed: 0,
          subcontractorsOwed: 0,
          ownerPayOwed: 0,
          activeJobs: 0,
          ownerPayUnknownJobs: 0,
          workersUnknownJobs: 0,
          subcontractorsUnknownJobs: 0,
        },
        dataStatus: "complete",
        warnings: [],
      });
    }

    const jobIds = activeJobs.map(job => job.id);
    const [
      invoiceRows,
      assignmentRows,
      ownerRows,
      readinessRows,
      settingsRows,
      profitPools,
    ] = await Promise.all([
      db.select({
        id: invoicesTable.id,
        jobId: invoicesTable.jobId,
        status: invoicesTable.status,
        total: invoicesTable.total,
        amountPaid: invoicesTable.amountPaid,
        createdAt: invoicesTable.createdAt,
      }).from(invoicesTable)
        .where(and(inArray(invoicesTable.jobId, jobIds), isNull(invoicesTable.voidedAt)))
        .orderBy(desc(invoicesTable.createdAt)),
      db.select({
        jobId: jobSubcontractorsTable.jobId,
        subcontractorId: jobSubcontractorsTable.subcontractorId,
        subName: subcontractorsTable.name,
        compensationType: jobSubcontractorsTable.compensationType,
        amountOwed: jobSubcontractorsTable.amountOwed,
        fixedAmount: jobSubcontractorsTable.fixedAmount,
        allocationPct: jobSubcontractorsTable.allocationPct,
         hourlyRate: jobSubcontractorsTable.hourlyRate,
        amountPaidColumn: jobSubcontractorsTable.amountPaid,
        paymentStatus: jobSubcontractorsTable.paymentStatus,
         hourCount: sql<string>`COALESCE((
           SELECT COUNT(*)
           FROM job_sub_hours h
           WHERE h.job_id = ${jobSubcontractorsTable.jobId}
             AND h.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
         ), 0)`,
         missingRateHours: sql<string>`COALESCE((
           SELECT COUNT(*)
           FROM job_sub_hours h
           WHERE h.job_id = ${jobSubcontractorsTable.jobId}
             AND h.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
             AND h.rate_snapshot IS NULL
         ), 0)`,
        computedOwed: sql<string>`COALESCE((
          SELECT SUM(h.hours * COALESCE(h.rate_snapshot, 0))
          FROM job_sub_hours h
          WHERE h.job_id = ${jobSubcontractorsTable.jobId}
            AND h.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
        ), 0)`,
        ledgerPaid: sql<string>`COALESCE((
          SELECT SUM(spr.amount + COALESCE(spr.advance_amount, 0))
          FROM sub_payment_records spr
          WHERE spr.job_id = ${jobSubcontractorsTable.jobId}
            AND spr.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
            AND spr.is_reversal IS NOT TRUE
        ), 0)`,
      }).from(jobSubcontractorsTable)
        .leftJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
        .where(inArray(jobSubcontractorsTable.jobId, jobIds)),
      db.select({
        jobId: ownerCapitalEntriesTable.jobId,
        amount: ownerCapitalEntriesTable.amount,
      }).from(ownerCapitalEntriesTable)
        .where(and(
          inArray(ownerCapitalEntriesTable.jobId, jobIds),
          sql`${ownerCapitalEntriesTable.amount} < 0`,
          isNull(ownerCapitalEntriesTable.voidedAt),
        )),
      db.select({
        jobId: jobReadinessConditionsTable.jobId,
        reason: jobReadinessConditionsTable.reason,
        detail: jobReadinessConditionsTable.detail,
      }).from(jobReadinessConditionsTable)
        .where(and(inArray(jobReadinessConditionsTable.jobId, jobIds), isNull(jobReadinessConditionsTable.clearedAt))),
      db.select({
        ownerSplitPct: settingsTable.ownerSplitPct,
        taxReservePct: settingsTable.taxReservePct,
      }).from(settingsTable).limit(1),
      computeAllocationSplitPools(jobIds),
    ]);

    const settings = settingsRows[0];
    const ownerSplitPct = settings?.ownerSplitPct != null ? Number(settings.ownerSplitPct) : 50;
    const taxReservePct = settings?.taxReservePct != null ? Number(settings.taxReservePct) : 25;
    const statusRank: Record<string, number> = {
      paid: 5, partiallyPaid: 4, sent: 3, approved: 2, overdue: 1, draft: 0, cancelled: -1,
    };
    type FinancialAssignment = {
      jobId: number;
      subcontractorId: number;
      subName: string | null;
      compensationType: string | null;
      amountOwed: string | null;
      fixedAmount: string | null;
      allocationPct: string | null;
      hourlyRate: string | null;
      hourCount: string;
      missingRateHours: string;
      amountPaidColumn: string | null;
      paymentStatus: string;
      computedOwed: string;
      ledgerPaid: string;
    };

    const invoiceByJob = new Map<number, typeof invoiceRows[number]>();
    for (const invoice of invoiceRows) {
      if (invoice.jobId == null) continue;
      const current = invoiceByJob.get(invoice.jobId);
      if (!current || (statusRank[invoice.status] ?? -1) > (statusRank[current.status] ?? -1)) {
        invoiceByJob.set(invoice.jobId, invoice);
      }
    }

    const assignmentsByJob = new Map<number, FinancialAssignment[]>();
    for (const row of assignmentRows as FinancialAssignment[]) {
      const rows = assignmentsByJob.get(row.jobId) ?? [];
      rows.push(row);
      assignmentsByJob.set(row.jobId, rows);
    }
    const ownerPaidByJob = new Map<number, number>();
    for (const row of ownerRows) {
      if (row.jobId == null) continue;
      ownerPaidByJob.set(row.jobId, (ownerPaidByJob.get(row.jobId) ?? 0) + Math.abs(Number(row.amount ?? 0)));
    }
    const blockersByJob = new Map<number, string[]>();
    for (const row of readinessRows) {
      const blockers = blockersByJob.get(row.jobId) ?? [];
      blockers.push(row.detail || row.reason);
      blockersByJob.set(row.jobId, blockers);
    }

    let dataStatus: "complete" | "partial" = "complete";
    const warnings: string[] = [];
    let workersOwed = 0;
    let subcontractorsOwed = 0;
    let ownerPayOwed = 0;
    let ownerPayUnknownJobs = 0;
    let workersUnknownJobs = 0;
    let subcontractorsUnknownJobs = 0;

    const summaries = activeJobs.map(job => {
      const invoice = invoiceByJob.get(job.id);
      const amountDue = invoice
        ? Math.max(0, Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? (invoice.status === "paid" ? invoice.total : 0)))
        : null;
      const paymentSatisfied = invoice?.status === "paid" || (invoice?.status === "partiallyPaid" && amountDue === 0);
      const assignments = (assignmentsByJob.get(job.id) ?? []).sort((a: FinancialAssignment, b: FinancialAssignment) =>
        (a.subName ?? "").localeCompare(b.subName ?? "") || a.subcontractorId - b.subcontractorId
      );
      const workers = assignments.filter((row: FinancialAssignment) => (row.compensationType ?? "hourly") === "hourly");
      const subcontractors = assignments.filter((row: FinancialAssignment) => (row.compensationType ?? "hourly") !== "hourly");
      const makeDetail = (
        row: FinancialAssignment,
        owed: number | null,
        unavailableReason: string | null = null,
      ) => {
        const amountPaid = row.ledgerPaid != null
          ? Number(row.ledgerPaid)
          : row.amountPaidColumn == null ? 0 : Number(row.amountPaidColumn);
        const balance = owed == null ? null : Math.max(0, owed - amountPaid);
        const status = owed == null
          ? "unavailable"
          : amountPaid > owed + 0.005 ? "overpaid"
          : balance != null && balance <= 0.005 ? "paid"
          : amountPaid > 0 ? "partial" : "unpaid";
        return {
          id: row.subcontractorId,
          name: row.subName ?? `Subcontractor #${row.subcontractorId}`,
          compensationType: row.compensationType ?? "hourly",
          amountOwed: owed,
          amountPaid,
          balance,
          status,
          unavailableReason,
        };
      };
      const workerOwed = (row: FinancialAssignment): number | null => {
        if (row.amountOwed != null) return Number(row.amountOwed);
        const hourCount = Number(row.hourCount ?? 0);
        const missingRateHours = Number(row.missingRateHours ?? 0);
        if (missingRateHours > 0) return null;
        if (hourCount === 0 && row.hourlyRate == null) return null;
        return Number(row.computedOwed ?? 0);
      };
      const workerUnavailableReason = (row: FinancialAssignment): string | null => {
        if (row.amountOwed != null) return null;
        if (Number(row.missingRateHours ?? 0) > 0) return "Hourly rate is missing for logged hours.";
        if (Number(row.hourCount ?? 0) === 0 && row.hourlyRate == null) {
          return "Add an agreed amount or log hours with an hourly rate.";
        }
        return null;
      };
      const workerDetails = workers.map((row: FinancialAssignment) => makeDetail(
        row,
        workerOwed(row),
        workerUnavailableReason(row),
      ));
      const pool = profitPools.get(job.id);
      const allocationRows = subcontractors.filter((row: FinancialAssignment) => row.compensationType === "allocation");
      const totalAllocationPct = allocationRows.reduce((sum: number, row: FinancialAssignment) => sum + Number(row.allocationPct ?? 0), 0);
      const ownerPct = allocationRows.length > 0 ? Math.max(0, 100 - totalAllocationPct) : ownerSplitPct;
      const missingAllocationPct = allocationRows.some((row: FinancialAssignment) => row.allocationPct == null);
      const subcontractorUnavailableReason = (row: FinancialAssignment): string | null => {
        if (row.amountOwed != null) return null;
        if (row.compensationType === "fixed" && row.fixedAmount == null) return "Agreed fixed amount is missing.";
        if (row.compensationType === "allocation") {
          if (row.allocationPct == null && !pool) return "Profit pool and allocation percentage are missing.";
          if (row.allocationPct == null) return "Allocation percentage is missing.";
          if (!pool) return "Profit pool is unavailable.";
        }
        return null;
      };
      const subDetails = subcontractors.map((row: FinancialAssignment) => makeDetail(
        row,
        row.amountOwed != null
          ? Number(row.amountOwed)
          : row.compensationType === "fixed"
            ? row.fixedAmount == null ? null : Number(row.fixedAmount)
            : row.allocationPct == null || !pool ? null : pool.splitPool * (Number(row.allocationPct) / 100),
        subcontractorUnavailableReason(row),
      ));
      const workersAvailable = workerDetails.every(row => row.amountOwed != null);
      const subcontractorsAvailable = subDetails.every(row => row.amountOwed != null);
      const summarizeUnavailableReasons = (details: Array<{ unavailableReason: string | null }>) => {
        const reasons = [...new Set(details.flatMap(row => row.unavailableReason ? [row.unavailableReason] : []))];
        return reasons.length > 0 ? reasons.join(" ") : null;
      };
      const workerTotal = workersAvailable
        ? workerDetails.reduce((sum: number, row) => sum + (row.balance ?? 0), 0)
        : null;
      const subcontractorTotal = subcontractorsAvailable
        ? subDetails.reduce((sum: number, row) => sum + (row.balance ?? 0), 0)
        : null;
      const ownerUnavailableReasons = [
        !pool ? "Profit pool is unavailable." : null,
        missingAllocationPct ? "Allocation percentage is missing." : null,
      ].filter((reason): reason is string => reason != null);
      const ownerUnavailableReason = ownerUnavailableReasons.length > 0
        ? ownerUnavailableReasons.join(" ")
        : null;
      const ownerEarned = !ownerUnavailableReason
        ? pool!.splitPool * (ownerPct / 100) * (1 - Math.max(0, taxReservePct) / 100)
        : null;
      const ownerPaid = ownerPaidByJob.get(job.id) ?? 0;
      const ownerRemaining = ownerEarned == null ? null : Math.max(0, ownerEarned - ownerPaid);
      const ownerOverpaid = ownerEarned == null ? 0 : Math.max(0, ownerPaid - ownerEarned);
      const blockers = blockersByJob.get(job.id) ?? [];
      if (workerDetails.some(row => row.amountOwed == null)) workersUnknownJobs++;
      if (subDetails.some(row => row.amountOwed == null)) subcontractorsUnknownJobs++;
      if (ownerEarned == null) ownerPayUnknownJobs++;
      if (workerTotal != null) workersOwed += workerTotal;
      if (subcontractorTotal != null) subcontractorsOwed += subcontractorTotal;
      if (ownerRemaining != null) ownerPayOwed += ownerRemaining;

      const internalBlocker =
        workerDetails.some(row => row.balance != null && row.balance > 0.005) ||
        subDetails.some(row => row.balance != null && row.balance > 0.005) ||
        ownerRemaining == null ||
        (ownerRemaining != null && ownerRemaining > 0.005) ||
        blockers.length > 0 ||
        workerDetails.some(row => row.amountOwed == null) ||
        subDetails.some(row => row.amountOwed == null);
      const state = internalBlocker
        ? "needs_action"
        : paymentSatisfied
          ? "ready_to_close"
          : "waiting_on_payment";
      return {
        job: {
          id: job.id,
          jobNumber: job.jobNumber,
          title: job.title,
          status: job.status,
          clientName: job.clientName,
          clientId: job.clientId,
          businessId: job.businessId,
          businessLine: job.businessLine,
        },
        payment: {
          status: invoice?.status ?? "not_invoiced",
          amountDue,
          invoiceId: invoice?.id ?? null,
        },
        workers: {
          available: workersAvailable,
          count: workerDetails.length,
          totalOwed: workerTotal,
          details: workerDetails,
          unavailableReason: summarizeUnavailableReasons(workerDetails),
        },
        subcontractors: {
          available: subcontractorsAvailable,
          count: subDetails.length,
          totalOwed: subcontractorTotal,
          details: subDetails,
          unavailableReason: summarizeUnavailableReasons(subDetails),
        },
        ownerPay: {
          supported: ownerEarned != null,
          earned: ownerEarned,
          paid: ownerEarned == null ? null : ownerPaid,
          remaining: ownerRemaining,
          overpaid: ownerOverpaid,
          unavailableReason: ownerUnavailableReason,
        },
        state,
        blockers,
        warnings: ownerEarned == null ? ["Owner Pay is unavailable for this job."] : [],
      };
    });

    if (workersUnknownJobs || subcontractorsUnknownJobs || ownerPayUnknownJobs) {
      dataStatus = "partial";
      if (workersUnknownJobs) warnings.push(`${workersUnknownJobs} job(s) have unavailable worker balances.`);
      if (subcontractorsUnknownJobs) warnings.push(`${subcontractorsUnknownJobs} job(s) have unavailable subcontractor balances.`);
      if (ownerPayUnknownJobs) warnings.push(`${ownerPayUnknownJobs} job(s) have unavailable Owner Pay balances.`);
    }

    res.json({
      jobs: summaries,
      totals: {
        workersOwed,
        subcontractorsOwed,
        ownerPayOwed,
        activeJobs: summaries.length,
        ownerPayUnknownJobs,
        workersUnknownJobs,
        subcontractorsUnknownJobs,
      },
      dataStatus,
      warnings,
    });
  } catch (err) {
    console.error("[jobs/financials-summary]", err);
    res.status(500).json({ error: "Failed to fetch active job financials" });
  }
});

// Trip documentation packet: GET /:id/trip-packet
// Compiles job + customer details, crew, travel expenses (with business
// purpose + receipts), daily logs, photos, checklist status, and invoices
// into a single audit-ready evidence package.
router.get("/:id/trip-packet", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    const { buildTripPacketData } = await import("../lib/tripPacket.js");
    const packet = await buildTripPacketData(id);
    if (!packet) return res.status(404).json({ error: "Job not found" });
    res.json(packet);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to build trip packet" });
  }
});

// Trip documentation packet PDF: GET /:id/trip-packet/pdf
router.get("/:id/trip-packet/pdf", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    const { generateTripPacketPdfBuffer } = await import("../lib/generateTripPacketPdf.js");
    const result = await generateTripPacketPdfBuffer(id);
    if (!result) return res.status(404).json({ error: "Job not found" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate trip packet PDF" });
  }
});

// Payment-category expenses for a job (not auto-linked to hours).
// Covers both "Subcontractor" (allocation pay-worker, manual entries) and
// "Labor" (hourly/fixed pay-worker). Used by the Sub Payments tab to determine
// whether "Reset Payment Record" is safe — disabled whenever any row exists here.
router.get("/:id/sub-expenses", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    const rows = await db
      .select({
        id: expensesTable.id,
        subcontractorId: expensesTable.subcontractorId,
        subName: subcontractorsTable.name,
        amount: expensesTable.amount,
        date: expensesTable.date,
        description: expensesTable.description,
      })
      .from(expensesTable)
      .leftJoin(subcontractorsTable, eq(subcontractorsTable.id, expensesTable.subcontractorId))
      .where(and(
        eq(expensesTable.jobId, id),
        inArray(expensesTable.category, ["Subcontractor", "Labor"]),
        isNull(expensesTable.jobSubHoursId),
        isNull(expensesTable.voidedAt),
      ));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch sub expenses" });
  }
});

// ── MH Production Billing Engine (Task #1062) ───────────────────────────────────
// POST /api/jobs/:id/apply-production-pricing  { quantities?: Record<svcId, number>, overwrite?: boolean }
// Builds invoice line items from the production items checked on this job, priced
// from the client's Production pricing profile, then creates/updates a DRAFT
// invoice. Never overwrites a sent/paid/overdue invoice. When a draft already
// exists and overwrite was not confirmed, returns { conflict: "draft", ... }.
router.post("/:id/apply-production-pricing", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    const body = (req.body ?? {}) as { quantities?: Record<string, unknown>; overwrite?: boolean };
    const overwrite = body.overwrite === true;

    await ensureProductionBillingSeed();

    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!job) return res.status(404).json({ error: "Job not found" });
    const jobOwnership = await canonicalRecordBusiness(job);
    if (jobOwnership.state === "invalid") {
      return res.status(409).json({ error: "Job has invalid business ownership" });
    }
    const owner = jobOwnership.state === "resolved"
      ? jobOwnership.business
      : await generalContractingBusiness();
    if (!owner) return res.status(409).json({ error: "General Contracting business was not found" });

    const serviceIds = Array.isArray(job.mhProductionServices)
      ? job.mhProductionServices.map(Number).filter((n) => Number.isFinite(n))
      : [];
    if (serviceIds.length === 0) {
      return res.status(400).json({ error: "No production items are checked on this job." });
    }

    const quantities: Record<number, number> = {};
    for (const [k, v] of Object.entries(body.quantities ?? {})) {
      const key = Number(k);
      const val = Number(v);
      if (Number.isFinite(key) && Number.isFinite(val)) quantities[key] = val;
    }

    const resolved = await buildProductionLineItems({
      clientId: job.clientId ?? null,
      homeType: job.mfhConstructionType ?? null,
      serviceTypeIds: serviceIds,
      quantities,
    });
    if (resolved.length === 0) {
      return res.status(400).json({ error: "No billable production items found for this job." });
    }

    const lineItems = resolved.map((li, i) => ({
      id: i + 1,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
    }));

    // Existing-invoice handling. Only a draft may be overwritten (with confirmation);
    // sent/paid/overdue invoices are never touched — a fresh draft is created instead.
    const existing = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.jobId, id))
      .orderBy(desc(invoicesTable.createdAt));
    const LOCKED = new Set(["sent", "paid", "overdue"]);
    const draft = existing.find((inv) => inv.status === "draft");
    const locked = existing.find((inv) => LOCKED.has(inv.status)) ?? null;

    if (draft) {
      if (!overwrite) {
        return res.json({ conflict: "draft", invoiceId: draft.id, invoiceNumber: draft.invoiceNumber });
      }
      const taxRate = draft.taxRate ? parseFloat(draft.taxRate) : null;
      const { subtotal, taxAmount, total } = calcInvoice(lineItems, taxRate);
      await db
        .update(invoicesTable)
        .set({
          lineItems,
          subtotal: subtotal.toString(),
          taxAmount: taxAmount.toString(),
          total: total.toString(),
          clientId: job.clientId ?? draft.clientId ?? null,
          businessId: owner.id,
          businessLine: owner.slug,
        })
        .where(eq(invoicesTable.id, draft.id));
      const [withJoins] = await buildInvoiceQuery().where(eq(invoicesTable.id, draft.id));
      return res.json({ invoice: fmt(withJoins), updated: true });
    }

    const { subtotal, taxAmount, total } = calcInvoice(lineItems, null);
    const issueDate = new Date().toISOString().slice(0, 10);
    const [invoice] = await db
      .insert(invoicesTable)
      .values({
        invoiceNumber: null,
        clientId: job.clientId ?? null,
        jobId: id,
        status: "draft",
        issueDate,
        subtotal: subtotal.toString(),
        taxAmount: taxAmount.toString(),
        total: total.toString(),
        city: job.city ?? null,
        state: job.state ?? null,
        locationName: job.locationName ?? null,
        lineItems,
        businessId: owner.id,
        businessLine: owner.slug,
      })
      .returning();
    const [withJoins] = await buildInvoiceQuery().where(eq(invoicesTable.id, invoice.id));
    return res.json({
      invoice: fmt(withJoins),
      created: true,
      lockedExisting: locked
        ? { invoiceId: locked.id, invoiceNumber: locked.invoiceNumber, status: locked.status }
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to apply production pricing" });
  }
});

router.get("/:id/invoice-draft", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    const job = await getJobWithSubs(id);
    if (!job) return res.status(404).json({ error: "Job not found" });

    type ClientRow = typeof clientsTable.$inferSelect;
    const clientResult: ClientRow | null = job.clientId
      ? (await db.select().from(clientsTable).where(eq(clientsTable.id, job.clientId)))[0] ?? null
      : null;

    // Fetch estimates linked to this job and expand their line items.
    // MH Production jobs are priced exclusively by the Production Billing engine
    // (Apply Production Pricing), so model-based estimate lines must never flow
    // into their invoices. Skip estimate expansion for those jobs.
    const isMhProduction = job.workflow === "mh_production";
    const estimates = isMhProduction
      ? []
      : await db.select().from(estimatesTable).where(eq(estimatesTable.jobId, id));

    type InvoiceLine = { description: string; quantity: number; unitPrice: number };
    // Shape of each line item stored in the estimates.line_items jsonb column
    type EstimateLineItem = {
      description?: string;
      quantity?: string | number;
      unitCost?: string | number;
      unitPrice?: string | number;
    };
    function isEstimateLineItem(v: unknown): v is EstimateLineItem {
      return typeof v === "object" && v !== null;
    }
    let lineItems: InvoiceLine[] = [];

    for (const est of estimates) {
      const rawLines = Array.isArray(est.lineItems) ? est.lineItems : [];
      const estLines: EstimateLineItem[] = rawLines.filter(isEstimateLineItem);
      if (estLines.length > 0) {
        // Scale each unit cost by markup × contingency so the expanded line items
        // sum to the same total as the estimate.
        const markup = parseFloat(est.markupPercent ?? "0");
        const contingency = parseFloat(est.contingencyPercent ?? "0");
        const scaleFactor = (1 + markup / 100) * (1 + contingency / 100);
        for (const li of estLines) {
          if (!String(li.description ?? "").trim()) continue;
          const rawUnit = parseFloat(String(li.unitCost ?? li.unitPrice ?? "0"));
          const qty = parseFloat(String(li.quantity ?? "1"));
          lineItems.push({
            description: li.description ?? est.title,
            quantity: qty,
            unitPrice: parseFloat((rawUnit * scaleFactor).toFixed(2)),
          });
        }
      } else {
        // Estimate has no line items — use a single summary line at the estimate total
        lineItems.push({ description: est.title, quantity: 1, unitPrice: parseFloat(est.total ?? "0") });
      }
    }

    // Fall back to a blank line item when no estimates exist
    if (lineItems.length === 0) {
      const locationParts = [job.locationName, job.address, job.city, job.state].filter(Boolean);
      const locationSuffix = locationParts.length ? ` — ${locationParts.join(", ")}` : "";
      lineItems.push({ description: `${job.title}${locationSuffix}`, quantity: 1, unitPrice: 0 });
    }

    // Fetch material lists for this job and compute total with per-list markup
    const lists = await db.select().from(materialListsTable).where(eq(materialListsTable.jobId, id));
    if (lists.length > 0) {
      const listIds = lists.map(l => l.id);
      const allItems = await db.select().from(materialListItemsTable).where(inArray(materialListItemsTable.listId, listIds));
      const itemsByList: Record<number, typeof allItems> = {};
      for (const item of allItems) {
        if (!itemsByList[item.listId]) itemsByList[item.listId] = [];
        itemsByList[item.listId].push(item);
      }
      let materialsTotal = 0;
      for (const list of lists) {
        const markupMult = parseFloat(list.markup ?? "40") / 100 + 1;
        for (const item of itemsByList[list.id] ?? []) {
          materialsTotal += parseFloat(item.unitCostSnapshot ?? "0") * parseFloat(item.qty ?? "1") * markupMult;
        }
      }
      if (materialsTotal > 0) {
        lineItems.push({ description: "Materials", quantity: 1, unitPrice: parseFloat(materialsTotal.toFixed(2)) });
      }
    }

    // If this job has a saved Service Billing worksheet, override line items with its
    // client-facing totals (Repair Labor, Drive Time, Mileage, reimbursable parts).
    // Internal cost/profit fields (internalLaborRate, fuelEstimate) are never included.
    if (job.serviceBilling) {
      const sb = job.serviceBilling;
      const snap = sb.rateSnapshot ?? {};
      const repairRate = sb.techCount === 1
        ? (snap.repairRate1Tech ?? 0)
        : (snap.repairRate2Tech ?? 0);
      const driveRate = sb.techCount === 1
        ? (snap.driveRate1Tech ?? 0)
        : (snap.driveRate2Tech ?? 0);
      const mileageRate = snap.mileageRate ?? 0;

      const sbLines: InvoiceLine[] = [];

      const techLabel = sb.techCount === 1 ? "1 Tech" : `${sb.techCount} Techs`;

      if (sb.repairHours > 0) {
        if (repairRate > 0) {
          sbLines.push({
            description: `Repair Labor (${techLabel})`,
            quantity: parseFloat(sb.repairHours.toFixed(2)),
            unitPrice: parseFloat(repairRate.toFixed(2)),
          });
        } else {
          const repairLabor = sb.repairHours * repairRate;
          if (repairLabor > 0) {
            sbLines.push({ description: "Repair Labor", quantity: 1, unitPrice: parseFloat(repairLabor.toFixed(2)) });
          }
        }
      }

      if (sb.driveHours > 0) {
        if (driveRate > 0) {
          sbLines.push({
            description: `Drive Time (${techLabel})`,
            quantity: parseFloat(sb.driveHours.toFixed(2)),
            unitPrice: parseFloat(driveRate.toFixed(2)),
          });
        } else {
          const driveTime = sb.driveHours * driveRate;
          if (driveTime > 0) {
            sbLines.push({ description: "Drive Time", quantity: 1, unitPrice: parseFloat(driveTime.toFixed(2)) });
          }
        }
      }

      const isContracted = sb.workType === "contracted";
      const sbMileageCharge = isContracted
        ? (sb.mileage > 60 ? 150 : 0)
        : sb.mileage * mileageRate;
      if (sbMileageCharge > 0) {
        sbLines.push({
          description: isContracted ? "Mileage (Day Rate)" : "Mileage",
          quantity: isContracted ? 1 : parseFloat(sb.mileage.toFixed(1)),
          unitPrice: isContracted ? 150 : parseFloat(mileageRate.toFixed(4)),
        });
      }

      for (const part of sb.parts) {
        if (part.reimbursable) {
          sbLines.push({
            description: part.description || "Part",
            quantity: part.quantity,
            unitPrice: parseFloat(part.unitCost.toFixed(2)),
          });
        }
      }

      if (sbLines.length > 0) {
        // Preserve any Materials line item that was built from the job's material lists.
        // Without this, the service billing override would silently discard materials costs.
        const materialLines = lineItems.filter(li => li.description === "Materials");
        lineItems = [...sbLines, ...materialLines];
      }
    }

    const draft = {
      clientId: job.clientId ?? null,
      clientName: job.clientName ?? null,
      clientEmail: clientResult?.email ?? null,
      clientAddress: clientResult?.address ?? null,
      clientPhone: clientResult?.phone ?? null,
      clientCity: clientResult?.city ?? null,
      clientState: clientResult?.state ?? null,
      clientZip: clientResult?.zip ?? null,
      jobId: job.id,
      jobTitle: job.title,
      locationName: job.locationName ?? null,
      city: job.city ?? null,
      state: job.state ?? null,
      businessLine: job.businessLine ?? null,
      lineItems,
    };

    res.json(draft);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to build invoice draft" });
  }
});

// Distinct home models for autocomplete — must be before /:id
router.get("/distinct-home-models", async (_req, res) => {
  try {
    const rows = await db
      .selectDistinct({ homeModel: jobsTable.homeModel })
      .from(jobsTable)
      .where(sql`home_model IS NOT NULL AND home_model <> ''`)
      .orderBy(jobsTable.homeModel);
    res.json(rows.map(r => r.homeModel).filter(Boolean));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch home models" });
  }
});

// Batch outstanding-sub check: GET /outstanding-sub-balances?jobIds=1,2,3
// Returns Record<jobId, boolean> — true means job has outstanding fixed/allocation sub balance
router.get("/outstanding-sub-balances", async (req, res) => {
  try {
    const { jobIds: jobIdsParam } = req.query;
    if (!jobIdsParam || typeof jobIdsParam !== "string") return res.json({});
    const jobIds = jobIdsParam.split(",").map(Number).filter(n => !isNaN(n) && n > 0);
    if (jobIds.length === 0) return res.json({});

    const rows = await db.select({ jobId: jobSubcontractorsTable.jobId })
      .from(jobSubcontractorsTable)
      .where(and(
        inArray(jobSubcontractorsTable.jobId, jobIds),
        inArray(jobSubcontractorsTable.paymentStatus, ["unpaid", "partial"]),
        inArray(jobSubcontractorsTable.compensationType, ["fixed", "allocation"]),
      ))
      .groupBy(jobSubcontractorsTable.jobId);

    const hasOutstanding = new Set(rows.map(r => r.jobId).filter((id): id is number => id != null));
    const result: Record<number, boolean> = {};
    for (const id of jobIds) result[id] = hasOutstanding.has(id);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch outstanding sub balances" });
  }
});

// Batch photo counts: GET /photo-counts?jobIds=1,2,3  →  Record<number, number>
// Photos are stored as JSONB arrays in daily_logs.photo_urls
router.get("/photo-counts", async (req, res) => {
  try {
    const { jobIds: jobIdsParam } = req.query;
    if (!jobIdsParam || typeof jobIdsParam !== "string") return res.json({});
    const jobIds = jobIdsParam.split(",").map(Number).filter(n => !isNaN(n) && n > 0);
    if (jobIds.length === 0) return res.json({});

    const rows = await db.select({
      jobId: dailyLogsTable.jobId,
      photoCount: sql<number>`COALESCE(SUM(jsonb_array_length(COALESCE(photo_urls, '[]'::jsonb))), 0)::int`,
    }).from(dailyLogsTable)
      .where(inArray(dailyLogsTable.jobId, jobIds))
      .groupBy(dailyLogsTable.jobId);

    const result: Record<number, number> = {};
    for (const id of jobIds) result[id] = 0;
    for (const row of rows) {
      if (row.jobId != null) result[row.jobId] = row.photoCount;
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch photo counts" });
  }
});

// Closed-jobs CSV export: GET /closed/export
// Must be registered before /:id so "closed" is not parsed as a numeric id.
router.get("/closed/export", async (req, res) => {
  try {
    const { from, to, businessLine } = req.query as Record<string, string | undefined>;

    const conditions: ReturnType<typeof eq>[] = [eq(jobsTable.status, "closed") as ReturnType<typeof eq>];
    if (from) conditions.push(sql`COALESCE(${jobsTable.closedAt}, ${jobsTable.endDate}) >= ${from}` as unknown as ReturnType<typeof eq>);
    if (to)   conditions.push(sql`COALESCE(${jobsTable.closedAt}, ${jobsTable.endDate}) <= ${to}` as unknown as ReturnType<typeof eq>);
    const rawBusinessId = req.query.businessId;
    const hasBusinessId = rawBusinessId != null && String(rawBusinessId).trim() !== "";
    const hasBusinessLine = Boolean(businessLine && businessLine !== "all");
    if (hasBusinessId || hasBusinessLine) {
      const ownership = await resolveMutationBusiness({
        query: {
          ...(hasBusinessId ? { businessId: rawBusinessId } : {}),
          ...(hasBusinessLine ? { businessLine } : {}),
        },
        body: {},
      } as unknown as Request);
      if (!ownership.ok) return res.status(400).json({ error: ownership.error });
      const scope = ownership.business;
      conditions.push(or(
        eq(jobsTable.businessId, scope.id),
        and(isNull(jobsTable.businessId), eq(jobsTable.businessLine, scope.slug)),
      ) as ReturnType<typeof eq>);
    }

    const jobs = await db.select({
      id: jobsTable.id,
      title: jobsTable.title,
      clientName: clientsTable.name,
      address: jobsTable.address,
      city: jobsTable.city,
      state: jobsTable.state,
      locationName: jobsTable.locationName,
      startDate: jobsTable.startDate,
      closedAt: jobsTable.closedAt,
      endDate: jobsTable.endDate,
      businessLine: jobsTable.businessLine,
      subPaid: jobsTable.subPaid,
    })
      .from(jobsTable)
      .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
      .where(and(...conditions))
      .orderBy(desc(sql`COALESCE(${jobsTable.closedAt}, ${jobsTable.endDate})`));

    if (jobs.length === 0) {
      return res.json({ rows: [], totals: { revenue: 0, materials: 0, labor: 0, netProfit: 0, count: 0 } });
    }

    const jobIds = jobs.map(j => j.id);

    const [invoiceRows, expenseRows] = await Promise.all([
      db.select({ jobId: invoicesTable.jobId, total: invoicesTable.total, status: invoicesTable.status })
        .from(invoicesTable)
        .where(inArray(invoicesTable.jobId, jobIds)),
      db.select({ jobId: expensesTable.jobId, amount: expensesTable.amount, category: expensesTable.category })
        .from(expensesTable)
        .where(and(inArray(expensesTable.jobId, jobIds), isNull(expensesTable.jobSubHoursId))),
    ]);

    // Best invoice status: paid > overdue > sent > draft
    const STATUS_RANK: Record<string, number> = { paid: 4, overdue: 3, sent: 2, draft: 1 };
    const invoiceByJob = new Map<number, { status: string; revenue: number }>();
    for (const inv of invoiceRows) {
      if (inv.jobId == null) continue;
      const existing = invoiceByJob.get(inv.jobId) ?? { status: "draft", revenue: 0 };
      if ((STATUS_RANK[inv.status] ?? 0) > (STATUS_RANK[existing.status] ?? 0)) existing.status = inv.status;
      if (inv.status === "paid") existing.revenue += parseFloat(inv.total ?? "0");
      invoiceByJob.set(inv.jobId, existing);
    }

    const expensesByJob = new Map<number, { materials: number; labor: number; otherOpex: number }>();
    for (const exp of expenseRows) {
      if (exp.jobId == null) continue;
      const existing = expensesByJob.get(exp.jobId) ?? { materials: 0, labor: 0, otherOpex: 0 };
      const amt = parseFloat(exp.amount ?? "0");
      const cat = (exp.category ?? "").toLowerCase();
      // mileage and owner draw are tracked separately / excluded from operational net profit
      if (cat === "mileage" || cat === "owner draw") { expensesByJob.set(exp.jobId, existing); continue; }
      if (cat === "materials") existing.materials += amt;
      else if (cat === "subcontractor" || cat === "labor") existing.labor += amt;
      else existing.otherOpex += amt;
      expensesByJob.set(exp.jobId, existing);
    }

    const rows = jobs.map(job => {
      const inv = invoiceByJob.get(job.id) ?? { status: "draft", revenue: 0 };
      const exp = expensesByJob.get(job.id) ?? { materials: 0, labor: 0, otherOpex: 0 };

      const dateOpened = job.startDate ?? "";
      const dateClosed = job.closedAt ?? job.endDate ?? "";
      let daysOpen = 0;
      if (dateOpened && dateClosed) {
        daysOpen = Math.max(0, Math.round(
          (new Date(dateClosed).getTime() - new Date(dateOpened).getTime()) / (1000 * 60 * 60 * 24)
        ));
      }

      const revenue = inv.revenue;
      const materials = exp.materials;
      const labor = exp.labor;
      const netProfit = revenue - materials - labor - exp.otherOpex;
      const location = [job.locationName, job.city, job.state].filter(Boolean).join(", ");

      return {
        dateOpened,
        dateClosed,
        daysOpen,
        jobNumber: (job as any).jobNumber ?? job.id,
        businessLine: job.businessLine ?? "",
        jobName: job.title,
        customer: job.clientName ?? "",
        location,
        revenue,
        materials,
        labor,
        netProfit,
        invoiceStatus: inv.status,
        subStatus: job.subPaid ? "Settled" : "Outstanding",
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({ revenue: acc.revenue + r.revenue, materials: acc.materials + r.materials, labor: acc.labor + r.labor, netProfit: acc.netProfit + r.netProfit, count: acc.count + 1 }),
      { revenue: 0, materials: 0, labor: 0, netProfit: 0, count: 0 }
    );

    res.json({ rows, totals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to export closed jobs" });
  }
});

router.get("/:id/readiness", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope)) return;
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
    if (!job || !scope || !belongsToBusiness(job, scope)) return res.status(404).json({ error: "Job not found" });
    const conditions = await db.select().from(jobReadinessConditionsTable)
      .where(and(eq(jobReadinessConditionsTable.jobId, id), eq(jobReadinessConditionsTable.businessId, scope.id)))
      .orderBy(desc(jobReadinessConditionsTable.createdAt));
    res.json(conditions);
  } catch (err) {
    (req as typeof req & { log: { error: (data: unknown, message: string) => void } }).log.error({ err }, "Failed to load job readiness conditions");
    res.status(500).json({ error: "Failed to load readiness conditions" });
  }
});

router.post("/:id/readiness", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope)) return;
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
    if (!job || !scope || !belongsToBusiness(job, scope)) return res.status(404).json({ error: "Job not found" });
    const reason = req.body?.reason;
    if (!["electricity", "water", "materials", "inspection", "crew", "access", "other"].includes(reason)) return res.status(400).json({ error: "Invalid readiness reason" });
    const expectedDate = req.body?.expectedDate ?? null;
    if (expectedDate != null && (typeof expectedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expectedDate))) return res.status(400).json({ error: "expectedDate must be YYYY-MM-DD or null" });
    const user = getRequestUser(req);
    const [condition] = await db.insert(jobReadinessConditionsTable).values({
      jobId: id, businessId: scope.id, reason,
      detail: typeof req.body?.detail === "string" ? req.body.detail.trim() || null : null,
      expectedDate,
      createdByUserId: user?.id ?? null,
      createdByName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null,
    }).returning();
    await db.update(jobsTable).set({ planningState: "waiting" }).where(eq(jobsTable.id, id));
    res.status(201).json(condition);
  } catch (err) {
    (req as typeof req & { log: { error: (data: unknown, message: string) => void } }).log.error({ err }, "Failed to create job readiness condition");
    res.status(500).json({ error: "Failed to create readiness condition" });
  }
});

router.post("/:id/readiness/:conditionId/clear", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const conditionId = Number(req.params.conditionId);
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope)) return;
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
    if (!job || !scope || !belongsToBusiness(job, scope)) return res.status(404).json({ error: "Job not found" });
    const [condition] = await db.select().from(jobReadinessConditionsTable).where(and(
      eq(jobReadinessConditionsTable.id, conditionId), eq(jobReadinessConditionsTable.jobId, id),
      eq(jobReadinessConditionsTable.businessId, scope.id), isNull(jobReadinessConditionsTable.clearedAt),
    )).limit(1);
    if (!condition) return res.status(404).json({ error: "Active readiness condition not found" });
    const user = getRequestUser(req);
    const [cleared] = await db.update(jobReadinessConditionsTable).set({
      clearedAt: new Date(), clearedByUserId: user?.id ?? null,
      clearedByName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null,
    }).where(eq(jobReadinessConditionsTable.id, conditionId)).returning();
    const [remaining] = await db.select({ id: jobReadinessConditionsTable.id }).from(jobReadinessConditionsTable)
      .where(and(eq(jobReadinessConditionsTable.jobId, id), isNull(jobReadinessConditionsTable.clearedAt))).limit(1);
    if (!remaining && !job.startDate) await db.update(jobsTable).set({ planningState: "ready" }).where(eq(jobsTable.id, id));
    res.json(cleared);
  } catch (err) {
    (req as typeof req & { log: { error: (data: unknown, message: string) => void } }).log.error({ err }, "Failed to clear job readiness condition");
    res.status(500).json({ error: "Failed to clear readiness condition" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    const scope = await requestedBusiness(req);
    if (scope) {
      const [ownership] = await db.select({ businessId: jobsTable.businessId, businessLine: jobsTable.businessLine }).from(jobsTable).where(eq(jobsTable.id, id));
      if (!ownership || !belongsToBusiness(ownership, scope)) return res.status(404).json({ error: "Job not found" });
    }
    const job = await getJobWithSubs(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
     const [activeReadinessCondition] = await db.select().from(jobReadinessConditionsTable)
       .where(and(eq(jobReadinessConditionsTable.jobId, id), isNull(jobReadinessConditionsTable.clearedAt)))
       .orderBy(desc(jobReadinessConditionsTable.createdAt)).limit(1);
     res.json({ ...job, activeReadinessCondition: activeReadinessCondition ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch job" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    const { title, description, clientId, subcontractorIds, status, jobType, homeModel, address, city, state, locationName, startDate, endDate, notes, businessLine, workflow, subPaid, sqFt, coats, phases, permitChecklist, serviceBilling, mfhManufacturerId, mfhModelId, mfhModelYear, mfhConstructionType, mhProductionServices, manHours, daysOnJob, includeMileageInJobCosts, planningState, priority, resourceDemand, queuePosition } = req.body;
    const [currentOwnership] = await db.select({
      businessId: jobsTable.businessId,
      businessLine: jobsTable.businessLine,
    }).from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
    if (!currentOwnership) return res.status(404).json({ error: "Job not found" });
    const requestedOwner = await resolveMutationBusiness(req);
    if (!requestedOwner.ok) return res.status(400).json({ error: requestedOwner.error });
    const existingOwnership = await canonicalRecordBusiness(currentOwnership);
    const ownershipWouldChange = requestedOwner.explicit && (
      existingOwnership.state !== "resolved" ||
      existingOwnership.business.id !== requestedOwner.business.id
    );
    if (ownershipWouldChange) {
      const [linkedInvoice] = await db.select({ id: invoicesTable.id })
        .from(invoicesTable)
        .where(eq(invoicesTable.jobId, id))
        .limit(1);
      if (linkedInvoice) {
        return res.status(409).json({
          error: "Job business cannot be changed while invoices are linked",
        });
      }
    }
    if (!requestedOwner.explicit && existingOwnership.state === "invalid") {
      return res.status(409).json({ error: "Job has invalid business ownership" });
    }
    const owner = requestedOwner.explicit
      ? requestedOwner.business
      : existingOwnership.state === "resolved"
        ? existingOwnership.business
        : requestedOwner.business;
    if (sqFt != null && (isNaN(parseInt(sqFt)) || parseInt(sqFt) < 0)) return res.status(400).json({ error: "sqFt must be a non-negative integer" });
    if (coats != null && ![1, 2].includes(parseInt(coats))) return res.status(400).json({ error: "coats must be 1 or 2" });
    if ("includeMileageInJobCosts" in req.body && typeof includeMileageInJobCosts !== "boolean") return res.status(400).json({ error: "includeMileageInJobCosts must be a boolean" });
    if ("planningState" in req.body && !["ready", "scheduled", "waiting", "queue"].includes(planningState)) return res.status(400).json({ error: "Invalid planningState" });
    if ("priority" in req.body && !["urgent", "high", "normal", "low"].includes(priority)) return res.status(400).json({ error: "Invalid priority" });
    if ("resourceDemand" in req.body && !["standard", "large_crew", "all_hands"].includes(resourceDemand)) return res.status(400).json({ error: "Invalid resourceDemand" });
    if ("queuePosition" in req.body && queuePosition != null && (!Number.isInteger(Number(queuePosition)) || Number(queuePosition) < 0)) return res.status(400).json({ error: "queuePosition must be a non-negative integer or null" });

    let mfhSelection: Awaited<ReturnType<typeof validateMfhSelection>> | null = null;
    if ("mfhManufacturerId" in req.body || "mfhModelId" in req.body) {
      mfhSelection = await validateMfhSelection(mfhManufacturerId, mfhModelId);
      if ("error" in mfhSelection) return res.status(400).json({ error: mfhSelection.error });
    }

    // Only include fields that were explicitly sent in the request body
    // to avoid wiping existing values (e.g. clientId when only status changes)
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if ("clientId" in req.body) updates.clientId = clientId || null;
    if (status !== undefined) updates.status = status;
    // Auto-manage closed_at: set when archiving, clear when reopening
    if (status === "closed") {
      const [cur] = await db.select({ closedAt: jobsTable.closedAt }).from(jobsTable).where(eq(jobsTable.id, id));
      if (!cur?.closedAt) updates.closedAt = new Date().toISOString().split("T")[0];
    } else if (status !== undefined) {
      updates.closedAt = null;
    }
    if (jobType !== undefined) updates.jobType = jobType;
    if ("homeModel" in req.body) updates.homeModel = homeModel || null;
    if (address !== undefined) updates.address = address;
    if (city !== undefined) updates.city = city;
    if (state !== undefined) updates.state = state;
    if (locationName !== undefined) updates.locationName = locationName;
    if (startDate !== undefined) updates.startDate = startDate;
    if (endDate !== undefined) updates.endDate = endDate;
    if (notes !== undefined) updates.notes = notes;
    updates.businessLine = owner.slug;
    updates.businessId = owner.id;
    if ("workflow" in req.body) updates.workflow = workflow || null;
    if ("planningState" in req.body) updates.planningState = planningState;
    if ("priority" in req.body) updates.priority = priority;
    if ("resourceDemand" in req.body) updates.resourceDemand = resourceDemand;
    if ("queuePosition" in req.body) updates.queuePosition = queuePosition == null ? null : Number(queuePosition);
    if ("subPaid" in req.body) updates.subPaid = subPaid === true;
    if ("sqFt" in req.body) updates.sqFt = sqFt != null ? parseInt(sqFt) : null;
    if ("coats" in req.body) updates.coats = coats != null ? parseInt(coats) : null;
    if ("phases" in req.body) {
      try { updates.phases = parsePhases(phases); } catch (e: unknown) { return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid phases" }); }
    }
    if ("permitChecklist" in req.body) {
      try { updates.permitChecklist = parsePermitChecklist(permitChecklist); } catch (e: unknown) { return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid permitChecklist" }); }
    }
    if ("serviceBilling" in req.body) {
      if (serviceBilling === null) {
        updates.serviceBilling = null;
      } else {
        const parsed = serviceBillingSchema.safeParse(serviceBilling);
        if (!parsed.success) return res.status(400).json({ error: "Invalid serviceBilling payload" });
        updates.serviceBilling = parsed.data;
      }
    }
    if ("mfhManufacturerId" in req.body) {
      updates.mfhManufacturerId = mfhSelection && "manufacturerId" in mfhSelection ? mfhSelection.manufacturerId : null;
      updates.mfhModelId = mfhSelection && "modelId" in mfhSelection ? mfhSelection.modelId : null;
    } else if ("mfhModelId" in req.body) {
      updates.mfhModelId = mfhSelection && "modelId" in mfhSelection ? mfhSelection.modelId : null;
    }
    if ("mfhModelYear" in req.body) updates.mfhModelYear = mfhModelYear != null ? parseInt(mfhModelYear) : null;
    if ("mfhConstructionType" in req.body) updates.mfhConstructionType = mfhConstructionType || null;
    if ("mhProductionServices" in req.body) updates.mhProductionServices = Array.isArray(mhProductionServices) ? mhProductionServices : null;
    if ("manHours" in req.body) updates.manHours = manHours != null ? String(manHours) : null;
    if ("daysOnJob" in req.body) updates.daysOnJob = daysOnJob != null ? Math.max(1, parseInt(String(daysOnJob)) || 1) : 1;
    if ("includeMileageInJobCosts" in req.body) updates.includeMileageInJobCosts = includeMileageInJobCosts;

    const [job] = await db.update(jobsTable).set(updates).where(eq(jobsTable.id, id)).returning();
    if (!job) return res.status(404).json({ error: "Job not found" });

    if (Array.isArray(subcontractorIds)) {
      await replaceSubcontractors(id, subcontractorIds);
    }

    // When a job is marked completed, ensure the draft invoice includes the
    // latest materials totals so it's ready to review without extra steps.
    if (status === "completed" || status === "invoiced") {
      await syncMaterialsToJobInvoice(id);
    }

    const result = await getJobWithSubs(id);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update job" });
  }
});

router.put("/:jobId/sub-payments/:subId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const subId = parseInt(req.params.subId);
    if (isNaN(jobId) || isNaN(subId)) return res.status(400).json({ error: "Invalid ids" });
    // Strip paymentStatus — it is always derived server-side from the numbers, never accepted from the client.
    const { amountOwed, amountPaid, paidDate, paidNotes, compensationType, hourlyRate, travelRate, fixedAmount, allocationPct } = req.body;
    const updates: Record<string, unknown> = {};
    if (amountOwed !== undefined) updates.amountOwed = amountOwed != null ? String(amountOwed) : null;
    if (amountPaid !== undefined) updates.amountPaid = amountPaid != null ? String(amountPaid) : null;
    if (paidDate !== undefined) updates.paidDate = paidDate || null;
    if (paidNotes !== undefined) updates.paidNotes = paidNotes || null;
    if (compensationType !== undefined) updates.compensationType = compensationType || "hourly";
    if (hourlyRate !== undefined) updates.hourlyRate = hourlyRate != null ? String(hourlyRate) : null;
    if (travelRate !== undefined) updates.travelRate = travelRate != null ? String(travelRate) : null;
    if (fixedAmount !== undefined) updates.fixedAmount = fixedAmount != null ? String(fixedAmount) : null;
    if (allocationPct !== undefined) updates.allocationPct = allocationPct != null ? String(allocationPct) : null;
    // Upsert: creates the sub-job link if it doesn't exist yet, then updates payment fields.
    // This allows recording a payment even when the sub was never formally assigned to the job.
    const [row] = await db.insert(jobSubcontractorsTable)
      .values({ jobId, subcontractorId: subId, ...updates })
      .onConflictDoUpdate({
        target: [jobSubcontractorsTable.jobId, jobSubcontractorsTable.subcontractorId],
        set: updates,
      })
      .returning();

    // Derive paymentStatus from the four-rule formula — status is never accepted from the client.
    //   amountPaid = null/0  → "unpaid"
    //   0 < paid < owed      → "partial"
    //   paid ≈ owed          → "paid"
    //   paid > owed + 0.005  → "overpaid" (payroll correction)
    const paidNum = row.amountPaid != null ? parseFloat(row.amountPaid) : null;
    const compType = row.compensationType ?? "hourly";

    let effectiveOwed: number | null = null;
    if (row.amountOwed != null) {
      effectiveOwed = parseFloat(row.amountOwed);
    } else if (compType === "fixed" && row.fixedAmount != null) {
      effectiveOwed = parseFloat(row.fixedAmount);
    } else if (compType === "hourly") {
      const [hoursRow] = await db
        .select({ total: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), 0)` })
        .from(jobSubHoursTable)
        .where(and(eq(jobSubHoursTable.jobId, jobId), eq(jobSubHoursTable.subcontractorId, subId)));
      const hoursTotal = parseFloat(hoursRow?.total ?? "0");
      if (hoursTotal > 0) effectiveOwed = hoursTotal;
    } else if (compType === "allocation" && row.allocationPct != null) {
      const pool = await computeAllocationSplitPool(jobId);
      effectiveOwed = computeSubOwed({ compensationType: "allocation", amountOwed: null, fixedAmount: null, allocationPct: row.allocationPct }, pool.splitPool) ?? 0;
    }

    let newStatus: string;
    let isOverpaid = false;
    let overpaidBy = 0;

    if (paidNum == null || paidNum <= 0) {
      newStatus = "unpaid";
    } else if (effectiveOwed == null || effectiveOwed <= 0) {
      newStatus = "partial";
    } else if (paidNum > effectiveOwed + 0.005) {
      newStatus = "overpaid";
      isOverpaid = true;
      overpaidBy = parseFloat((paidNum - effectiveOwed).toFixed(2));
    } else if (paidNum >= effectiveOwed - 0.005) {
      newStatus = "paid";
    } else {
      newStatus = "partial";
    }

    await db.update(jobSubcontractorsTable)
      .set({ paymentStatus: newStatus })
      .where(and(eq(jobSubcontractorsTable.jobId, jobId), eq(jobSubcontractorsTable.subcontractorId, subId)));

    const allPaid = await recomputeSubPaid(jobId);

    res.json({
      jobId: row.jobId, subcontractorId: row.subcontractorId,
      amountOwed: row.amountOwed != null ? parseFloat(row.amountOwed) : null,
      amountPaid: row.amountPaid != null ? parseFloat(row.amountPaid) : null,
      paidDate: row.paidDate, paidNotes: row.paidNotes,
      paymentStatus: newStatus,
      isOverpaid,
      overpaidBy,
      allSubsPaid: allPaid,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update sub payment" });
  }
});

router.get("/:id/sub-payments", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    const rows = await db
      .select({
        subcontractorId: jobSubcontractorsTable.subcontractorId,
        subName: subcontractorsTable.name,
        amountOwedOverride: jobSubcontractorsTable.amountOwed,
        amountPaid: sql<string>`CASE
          WHEN EXISTS (
            SELECT 1 FROM sub_payment_records spr
            WHERE spr.job_id = ${id}
              AND spr.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
              AND (spr.is_reversal IS NULL OR spr.is_reversal = false)
          )
          THEN COALESCE((
            SELECT SUM(spr.amount + COALESCE(spr.advance_amount, 0))
            FROM sub_payment_records spr
            WHERE spr.job_id = ${id}
              AND spr.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
              AND (spr.is_reversal IS NULL OR spr.is_reversal = false)
          ), 0)
          ELSE COALESCE(${jobSubcontractorsTable.amountPaid}, 0)
        END`,
        paidDate: jobSubcontractorsTable.paidDate,
        paidNotes: jobSubcontractorsTable.paidNotes,
        payRate: subcontractorsTable.payRate,
        travelPayRate: subcontractorsTable.travelPayRate,
        payType: subcontractorsTable.payType,
        role: subcontractorsTable.role,
        growthPct: subcontractorsTable.growthPct,
        compensationType: jobSubcontractorsTable.compensationType,
        hourlyRate: jobSubcontractorsTable.hourlyRate,
        travelRate: jobSubcontractorsTable.travelRate,
        fixedAmount: jobSubcontractorsTable.fixedAmount,
        allocationPct: jobSubcontractorsTable.allocationPct,
        paymentStatus: jobSubcontractorsTable.paymentStatus,
        paidAt: jobSubcontractorsTable.paidAt,
        lastPaidAt: jobSubcontractorsTable.lastPaidAt,
        accruedBonus: jobSubcontractorsTable.accruedBonus,
        accruedBonusNote: jobSubcontractorsTable.accruedBonusNote,
        accruedAdvancement: jobSubcontractorsTable.accruedAdvancement,
        paymentMethodDraft: jobSubcontractorsTable.paymentMethodDraft,
        paymentReferenceDraft: jobSubcontractorsTable.paymentReferenceDraft,
        computedOwed: sql<string>`COALESCE((
          SELECT SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0))
          FROM ${jobSubHoursTable}
          WHERE ${jobSubHoursTable.jobId} = ${id}
            AND ${jobSubHoursTable.subcontractorId} = ${jobSubcontractorsTable.subcontractorId}
        ), 0)`,
        totalHours: sql<string>`COALESCE((
          SELECT SUM(${jobSubHoursTable.hours})
          FROM ${jobSubHoursTable}
          WHERE ${jobSubHoursTable.jobId} = ${id}
            AND ${jobSubHoursTable.subcontractorId} = ${jobSubcontractorsTable.subcontractorId}
        ), 0)`,
        totalWorkHours: sql<string>`COALESCE((
          SELECT SUM(${jobSubHoursTable.hours})
          FROM ${jobSubHoursTable}
          WHERE ${jobSubHoursTable.jobId} = ${id}
            AND ${jobSubHoursTable.subcontractorId} = ${jobSubcontractorsTable.subcontractorId}
            AND (${jobSubHoursTable.hourType} IS NULL OR ${jobSubHoursTable.hourType} = 'work')
        ), 0)`,
        totalTravelHours: sql<string>`COALESCE((
          SELECT SUM(${jobSubHoursTable.hours})
          FROM ${jobSubHoursTable}
          WHERE ${jobSubHoursTable.jobId} = ${id}
            AND ${jobSubHoursTable.subcontractorId} = ${jobSubcontractorsTable.subcontractorId}
            AND ${jobSubHoursTable.hourType} = 'travel'
        ), 0)`,
        avgTravelRateSnapshot: sql<string>`COALESCE((
          SELECT AVG(${jobSubHoursTable.rateSnapshot})
          FROM ${jobSubHoursTable}
          WHERE ${jobSubHoursTable.jobId} = ${id}
            AND ${jobSubHoursTable.subcontractorId} = ${jobSubcontractorsTable.subcontractorId}
            AND ${jobSubHoursTable.hourType} = 'travel'
            AND ${jobSubHoursTable.rateSnapshot} IS NOT NULL
            AND ${jobSubHoursTable.rateSnapshot}::numeric > 0
        ), 0)`,
      })
      .from(jobSubcontractorsTable)
      .leftJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
      .where(eq(jobSubcontractorsTable.jobId, id));
    // Fetch all individual payment records for this job in one query,
    // newest first. Grouped by sub so each row can include its history.
    const paymentRecords = await db
      .select({
        id: subPaymentRecordsTable.id,
        subcontractorId: subPaymentRecordsTable.subcontractorId,
        paymentDate: subPaymentRecordsTable.paymentDate,
        amount: subPaymentRecordsTable.amount,
        workHours: subPaymentRecordsTable.workHours,
        workRate: subPaymentRecordsTable.workRate,
        travelHours: subPaymentRecordsTable.travelHours,
        travelRate: subPaymentRecordsTable.travelRate,
        bonusAmount: subPaymentRecordsTable.bonusAmount,
        bonusNote: subPaymentRecordsTable.bonusNote,
        advanceAmount: subPaymentRecordsTable.advanceAmount,
        advanceNote: subPaymentRecordsTable.advanceNote,
        netPaid: subPaymentRecordsTable.netPaid,
        paymentMethod: subPaymentRecordsTable.paymentMethod,
        referenceNumber: subPaymentRecordsTable.referenceNumber,
      })
      .from(subPaymentRecordsTable)
      .where(eq(subPaymentRecordsTable.jobId, id))
      .orderBy(desc(subPaymentRecordsTable.paymentDate), desc(subPaymentRecordsTable.id));

    const historyMap: Record<number, {
      id: number;
      date: string; amount: number;
      workHours?: number; workRate?: number;
      travelHours?: number; travelRate?: number;
      bonusAmount?: number; bonusNote?: string | null;
      advanceAmount?: number; advanceNote?: string | null;
      netPaid?: number;
      paymentMethod?: string; referenceNumber?: string;
    }[]> = {};
    for (const rec of paymentRecords) {
      const subId = rec.subcontractorId;
      if (subId == null) continue;
      if (!historyMap[subId]) historyMap[subId] = [];
      historyMap[subId].push({
        id: rec.id,
        date: rec.paymentDate ?? "",
        amount: parseFloat(rec.amount ?? "0"),
        ...(rec.workHours   != null ? { workHours:   parseFloat(rec.workHours)   } : {}),
        ...(rec.workRate    != null ? { workRate:    parseFloat(rec.workRate)    } : {}),
        ...(rec.travelHours != null ? { travelHours: parseFloat(rec.travelHours) } : {}),
        ...(rec.travelRate  != null ? { travelRate:  parseFloat(rec.travelRate)  } : {}),
        ...(rec.bonusAmount  != null ? { bonusAmount:  parseFloat(rec.bonusAmount),  bonusNote:  rec.bonusNote  } : {}),
        ...(rec.advanceAmount != null ? { advanceAmount: parseFloat(rec.advanceAmount), advanceNote: rec.advanceNote } : {}),
        ...(rec.netPaid  != null ? { netPaid: parseFloat(rec.netPaid) } : {}),
        ...(rec.paymentMethod    ? { paymentMethod:   rec.paymentMethod    } : {}),
        ...(rec.referenceNumber  ? { referenceNumber: rec.referenceNumber  } : {}),
      });
    }

    res.json(rows.map(r => {
      const computedOwed = parseFloat(r.computedOwed ?? "0");
      const manualOverride = r.amountOwedOverride != null ? parseFloat(r.amountOwedOverride) : null;
      const compType = r.compensationType ?? "hourly";
      // For fixed/allocation, amountOwed is null unless manually overridden —
      // their owed amounts are fixedAmount / allocationPct×pool, resolved in the UI.
      // For hourly, fall back to computedOwed (hours × rate) when no override.
      const amountOwed = manualOverride != null
        ? manualOverride
        : compType === "hourly"
          ? computedOwed
          : null;
      const amountPaid = r.amountPaid != null ? parseFloat(r.amountPaid) : null;
      const balance = amountOwed != null && amountPaid != null ? Math.max(0, amountOwed - amountPaid) : null;
      const percentComplete = amountOwed != null && amountOwed > 0 && amountPaid != null
        ? Math.min(100, Math.round((amountPaid / amountOwed) * 100))
        : null;
      return {
        subcontractorId: r.subcontractorId,
        subName: r.subName,
        amountOwed,
        computedOwed,
        amountOwedIsManual: manualOverride != null,
        amountPaid,
        balance,
        percentComplete,
        paidDate: r.paidDate,
        paidNotes: r.paidNotes,
        payRate: r.payRate != null ? parseFloat(r.payRate) : null,
        travelPayRate: r.travelPayRate != null ? parseFloat(r.travelPayRate) : null,
        payType: r.payType,
        role: r.role ?? "hourly",
        growthPct: r.growthPct != null ? parseFloat(r.growthPct) : 0,
        compensationType: r.compensationType ?? "hourly",
        hourlyRate: r.hourlyRate != null ? parseFloat(r.hourlyRate) : null,
        travelRate: r.travelRate != null ? parseFloat(r.travelRate) : null,
        fixedAmount: r.fixedAmount != null ? parseFloat(r.fixedAmount) : null,
        allocationPct: r.allocationPct != null ? parseFloat(r.allocationPct) : null,
        paymentStatus: r.paymentStatus ?? "unpaid",
        paidAt: r.paidAt ?? null,
        lastPaidAt: r.lastPaidAt ?? null,
        totalHours: parseFloat(r.totalHours ?? "0"),
        totalWorkHours: parseFloat((r as any).totalWorkHours ?? "0"),
        totalTravelHours: parseFloat((r as any).totalTravelHours ?? "0"),
        avgTravelRateSnapshot: parseFloat((r as any).avgTravelRateSnapshot ?? "0"),
        accruedBonus: r.accruedBonus != null ? parseFloat(r.accruedBonus) : null,
        accruedBonusNote: r.accruedBonusNote ?? null,
        accruedAdvancement: r.accruedAdvancement != null ? parseFloat(r.accruedAdvancement) : null,
        paymentMethodDraft: r.paymentMethodDraft ?? null,
        paymentReferenceDraft: r.paymentReferenceDraft ?? null,
        paymentHistory: historyMap[r.subcontractorId ?? -1] ?? [],
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch sub payments" });
  }
});

// ── Delete sub payment record ─────────────────────────────────────────────────────
router.delete("/:id/sub-payments/:paymentId", async (req, res) => {
  try {
    const jobId     = parseInt(req.params.id);
    const paymentId = parseInt(req.params.paymentId);
    if (isNaN(jobId) || isNaN(paymentId)) return res.status(400).json({ error: "Invalid ids" });

    // Verify the record belongs to this job and get the subcontractorId
    const [payment] = await db
      .select({ subcontractorId: subPaymentRecordsTable.subcontractorId })
      .from(subPaymentRecordsTable)
      .where(and(
        eq(subPaymentRecordsTable.id, paymentId),
        eq(subPaymentRecordsTable.jobId, jobId),
      ));
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    const subId = payment.subcontractorId;
    if (subId == null) return res.status(400).json({ error: "Payment has no subcontractor" });

    // Count advances linked to this payment before we unlink them
    const linkedAdvances = await db
      .select({ id: subAdvancesTable.id })
      .from(subAdvancesTable)
      .where(eq(subAdvancesTable.appliedPaymentId, paymentId));
    const releasedAdvanceCount = linkedAdvances.length;

    // Delete the payment
    await db.delete(subPaymentRecordsTable).where(and(
      eq(subPaymentRecordsTable.id, paymentId),
      eq(subPaymentRecordsTable.jobId, jobId),
    ));

    // Un-link any advances that were applied to this payment
    await db.update(subAdvancesTable)
      .set({ appliedPaymentId: null, appliedAt: null })
      .where(eq(subAdvancesTable.appliedPaymentId, paymentId));

    // Re-aggregate remaining paid total for this sub on this job
    const [remaining] = await db
      .select({ total: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.amount} + COALESCE(${subPaymentRecordsTable.advanceAmount}, 0)), '0')` })
      .from(subPaymentRecordsTable)
      .where(and(
        eq(subPaymentRecordsTable.jobId, jobId),
        eq(subPaymentRecordsTable.subcontractorId, subId),
        sql`(is_reversal IS NULL OR is_reversal = false)`,
      ));
    const newPaid = parseFloat(remaining?.total ?? "0");

    // Determine new payment status
    const [subRow] = await db
      .select({
        fixedAmount:   jobSubcontractorsTable.fixedAmount,
        amountOwed:    jobSubcontractorsTable.amountOwed,
        compensationType: jobSubcontractorsTable.compensationType,
      })
      .from(jobSubcontractorsTable)
      .where(and(
        eq(jobSubcontractorsTable.jobId, jobId),
        eq(jobSubcontractorsTable.subcontractorId, subId),
      ));

    let newStatus = "unpaid";
    if (newPaid > 0.005) {
      let owedAmount: number | null = subRow?.amountOwed != null
        ? parseFloat(String(subRow.amountOwed))
        : subRow?.fixedAmount != null
          ? parseFloat(String(subRow.fixedAmount))
          : null;

      // For hourly subs, amountOwed and fixedAmount are both null — the obligation
      // is derived from logged hours × rate. Compute it here so we can correctly
      // distinguish "paid" from "partial" instead of always falling back to "partial".
      if (owedAmount == null && (subRow?.compensationType ?? "hourly") === "hourly") {
        const [hoursRow] = await db
          .select({ computedOwed: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), '0')` })
          .from(jobSubHoursTable)
          .where(and(
            eq(jobSubHoursTable.jobId, jobId),
            eq(jobSubHoursTable.subcontractorId, subId),
          ));
        const computed = parseFloat(hoursRow?.computedOwed ?? "0");
        if (computed > 0) owedAmount = computed;
      }

      if (owedAmount != null) {
        if (newPaid > owedAmount + 0.005) newStatus = "overpaid";
        else if (newPaid >= owedAmount - 0.005) newStatus = "paid";
        else newStatus = "partial";
      } else {
        newStatus = "partial";
      }
    }

    await db.update(jobSubcontractorsTable)
      .set({
        amountPaid:    newPaid > 0.005 ? newPaid.toFixed(2) : null,
        paymentStatus: newStatus,
        ...(newPaid <= 0.005 ? { paidAt: null, lastPaidAt: null } : {}),
      })
      .where(and(
        eq(jobSubcontractorsTable.jobId, jobId),
        eq(jobSubcontractorsTable.subcontractorId, subId),
      ));

    res.json({ ok: true, newPaid, newStatus, releasedAdvanceCount });
  } catch (err) {
    console.error("Delete sub payment failed:", err);
    res.status(500).json({ error: "Failed to delete payment" });
  }
});

// ── Sub Advances CRUD ────────────────────────────────────────────────────────────
router.get("/:id/advances", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id" });
    const subId = req.query.subId ? parseInt(req.query.subId as string) : null;
    const rows = await db.select().from(subAdvancesTable)
      .where(and(
        eq(subAdvancesTable.jobId, jobId),
        ...(subId ? [eq(subAdvancesTable.subcontractorId, subId)] : []),
      ))
      .orderBy(desc(subAdvancesTable.advanceDate), desc(subAdvancesTable.id));
    res.json(rows.map(r => ({ ...r, amount: parseFloat(r.amount) })));
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch advances" }); }
});

router.post("/:id/advances", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id" });
    const { subcontractorId, amount, description, advanceDate } = req.body;
    if (!subcontractorId || !amount || !description || !advanceDate)
      return res.status(400).json({ error: "subcontractorId, amount, description, and advanceDate are required" });
    const subId = parseInt(String(subcontractorId));
    const amt = parseFloat(String(amount));
    if (isNaN(subId) || isNaN(amt) || amt <= 0)
      return res.status(400).json({ error: "Invalid subcontractorId or amount" });

    const descTrimmed = String(description).trim();
    const dateStr = String(advanceDate);

    // Look up sub name + job businessLine so the expense is properly tagged
    const [[sub], [job]] = await Promise.all([
      db.select({ name: subcontractorsTable.name }).from(subcontractorsTable).where(eq(subcontractorsTable.id, subId)),
      db.select({ businessLine: jobsTable.businessLine }).from(jobsTable).where(eq(jobsTable.id, jobId)),
    ]);

    const [row] = await db.insert(subAdvancesTable).values({
      jobId, subcontractorId: subId,
      amount: amt.toFixed(2),
      description: descTrimmed,
      advanceDate: dateStr,
    }).returning();

    // Auto-create a matching expense entry so advances appear in the Expenses ledger
    let expenseId: number | null = null;
    if (sub) {
      const [expense] = await db.insert(expensesTable).values({
        description: `${sub.name} — Advance`,
        amount: amt.toFixed(2),
        category: "Subcontractor",
        date: dateStr,
        vendor: sub.name,
        notes: descTrimmed,
        jobId,
        subcontractorId: subId,
        businessLine: job?.businessLine ?? null,
        isWageAdvance: true,
      }).returning({ id: expensesTable.id });
      expenseId = expense.id;
      await db.update(subAdvancesTable).set({ expenseId }).where(eq(subAdvancesTable.id, row.id));
    }

    res.json({ ...row, amount: parseFloat(row.amount), expenseId });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to create advance" }); }
});

router.delete("/:id/advances/:advId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const advId = parseInt(req.params.advId);
    if (isNaN(jobId) || isNaN(advId)) return res.status(400).json({ error: "Invalid ids" });
    const [row] = await db.select().from(subAdvancesTable)
      .where(and(eq(subAdvancesTable.id, advId), eq(subAdvancesTable.jobId, jobId)));
    if (!row) return res.status(404).json({ error: "Advance not found" });
    if (row.appliedPaymentId != null) return res.status(400).json({ error: "Cannot delete an advance that has already been applied to a payment" });
    // Delete the linked auto-expense first (deletion blocked once applied, so this is always safe)
    if (row.expenseId != null) {
      await db.delete(expensesTable).where(eq(expensesTable.id, row.expenseId));
    }
    await db.delete(subAdvancesTable).where(eq(subAdvancesTable.id, advId));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to delete advance" }); }
});

router.post("/:id/pay-worker/:subId", async (req, res) => {
  // Declared at handler scope so the catch block can reference it for idempotency race recovery
  const idempotencyKey: string | null = req.body.idempotencyKey ? String(req.body.idempotencyKey) : null;
  try {
    const jobId = parseInt(req.params.id);
    const subId = parseInt(req.params.subId);
    if (isNaN(jobId) || isNaN(subId)) return res.status(400).json({ error: "Invalid ids" });

    const [job] = await db.select({ businessLine: jobsTable.businessLine }).from(jobsTable).where(eq(jobsTable.id, jobId));
    if (!job) return res.status(404).json({ error: "Job not found" });

    // Breakdown fields (hourly subs with dual rates / bonus / advance)
    const workHours  = req.body.workHours  != null ? parseFloat(String(req.body.workHours))  : null;
    const workRate   = req.body.workRate   != null ? parseFloat(String(req.body.workRate))   : null;
    const travelHours = req.body.travelHours != null ? parseFloat(String(req.body.travelHours)) : null;
    const travelRate  = req.body.travelRate  != null ? parseFloat(String(req.body.travelRate))  : null;
    const bonusAmount  = req.body.bonusAmount  != null ? parseFloat(String(req.body.bonusAmount))  : null;
    const bonusNote    = req.body.bonusNote   ? String(req.body.bonusNote)  : null;
    const advanceAmount = req.body.advanceAmount != null ? parseFloat(String(req.body.advanceAmount)) : null;
    const advanceNote   = req.body.advanceNote  ? String(req.body.advanceNote) : null;
    const paymentMethod   = req.body.paymentMethod   ? String(req.body.paymentMethod)   : null;
    const paymentReference = req.body.paymentReference ? String(req.body.paymentReference) : null;
    const advanceIds: number[] = Array.isArray(req.body.advanceIds)
      ? req.body.advanceIds.map((x: unknown) => parseInt(String(x))).filter((n: number) => !isNaN(n))
      : [];

    // If breakdown is supplied, compute net from parts; otherwise fall back to explicit amount field.
    const hasBreakdown = workHours != null && workRate != null;
    let paymentAmount: number;
    if (hasBreakdown) {
      const workPay   = workHours  * workRate;
      const travelPay = (travelHours ?? 0) * (travelRate ?? 0);
      const bonus     = bonusAmount  ?? 0;
      const advance   = advanceAmount ?? 0;
      paymentAmount = workPay + travelPay + bonus - advance;
    } else {
      // For fixed/allocation subs: client sends gross as `amount`, advances are deducted server-side
      const grossAmount = parseFloat(String(req.body.amount ?? "0"));
      const advance     = advanceAmount ?? 0;
      paymentAmount = Math.max(0, grossAmount - advance);
    }
    if (paymentAmount <= 0) return res.status(400).json({ error: "No amount to pay" });

    const today = new Date().toISOString();
    const paymentDateStr = today.split("T")[0]; // YYYY-MM-DD for sub_payment_records
    const subName = String(req.body.subName ?? `Sub #${subId}`);
    const clientAgreedOwed = req.body.agreedOwed != null ? parseFloat(String(req.body.agreedOwed)) : null;

    // Idempotency fast-path — check outside transaction for known-processed keys
    if (idempotencyKey) {
      const [existing] = await db.select({ id: subPaymentRecordsTable.id, amount: subPaymentRecordsTable.amount })
        .from(subPaymentRecordsTable)
        .where(eq(subPaymentRecordsTable.idempotencyKey, idempotencyKey));
      if (existing) {
        return res.json({ ok: true, duplicate: true, paymentId: existing.id, amount: parseFloat(existing.amount), accumulated: 0, status: "duplicate" });
      }
    }

    // All state reads and writes happen inside a single transaction with a row-level lock
    // (SELECT FOR UPDATE) so concurrent payment calls cannot both read stale prevPaid
    // and overwrite each other's accumulated total.
    let txResult: { ok: true; paymentId: number; amount: number; accumulated: number; status: string } | null = null;
    await db.transaction(async (tx) => {
      // Lock the row for this transaction — prevents concurrent pay-worker calls
      // from reading stale amountPaid and computing the wrong accumulated total.
      const [subRow] = await tx.select({
        compensationType: jobSubcontractorsTable.compensationType,
        fixedAmount: jobSubcontractorsTable.fixedAmount,
        allocationPct: jobSubcontractorsTable.allocationPct,
        amountOwed: jobSubcontractorsTable.amountOwed,
        amountPaid: jobSubcontractorsTable.amountPaid,
        paymentStatus: jobSubcontractorsTable.paymentStatus,
        paidAt: jobSubcontractorsTable.paidAt,
      }).from(jobSubcontractorsTable).where(and(
        eq(jobSubcontractorsTable.jobId, jobId),
        eq(jobSubcontractorsTable.subcontractorId, subId)
      )).for("update");

      if (!subRow) throw Object.assign(new Error("NOT_FOUND"), { notFound: true });
      if (subRow.paymentStatus === "paid" || subRow.paymentStatus === "overpaid") throw Object.assign(new Error("ALREADY_PAID"), { alreadyPaid: true });

      const compType = subRow.compensationType ?? "hourly";
      const typeLabel = compType === "allocation" ? "Allocation Pay" : compType === "fixed" ? "Fixed Pay" : "Labor Pay";

      // Agreed owed: DB override → client-supplied → fixedAmount (fixed only)
      const dbOwedOverride = subRow.amountOwed != null ? parseFloat(subRow.amountOwed) : null;
      let agreedOwed = dbOwedOverride
        ?? clientAgreedOwed
        ?? (compType === "fixed" ? parseFloat(subRow.fixedAmount ?? "0") : null);

      // paidAt = first payment date (set once); lastPaidAt = most recent
      const newPaidAt = subRow.paidAt ?? today;

      // Lock the agreed owed amount on first payment so future revenue changes
      // cannot shift the balance. For allocation subs the client may not send
      // agreedOwed (e.g. "Mark All Paid Now" flow), so fall back to computing
      // the split pool right now and locking that value. Hourly subs don't lock
      // — their obligation is hours × rate and doesn't drift.
      let lockAmountOwed: string | undefined =
        dbOwedOverride == null && clientAgreedOwed != null && clientAgreedOwed > 0
          ? clientAgreedOwed.toFixed(2)
          : undefined;

      if (lockAmountOwed === undefined && dbOwedOverride == null && compType === "allocation" && subRow.allocationPct != null) {
        const { splitPool: currentSplitPool } = await computeAllocationSplitPool(jobId);
        const computed = computeSubOwed({ compensationType: "allocation", amountOwed: null, fixedAmount: null, allocationPct: subRow.allocationPct }, currentSplitPool) ?? 0;
        if (computed > 0) lockAmountOwed = computed.toFixed(2);
      }

      // For hourly subs, agreedOwed is not sent by the client (it varies with hours logged).
      // Derive it from job_sub_hours so partial payments get the right "partial"/"paid" status
      // instead of always being marked "paid" regardless of coverage.
      if (compType === "hourly" && agreedOwed == null) {
        const [hoursRow] = await tx
          .select({ total: sql<string>`COALESCE(SUM(hours * COALESCE(rate_snapshot, 0)), '0')` })
          .from(jobSubHoursTable)
          .where(and(
            eq(jobSubHoursTable.jobId, jobId),
            eq(jobSubHoursTable.subcontractorId, subId),
          ));
        const hoursOwed = parseFloat(hoursRow?.total ?? "0");
        // Include all bonuses in the "owed" ceiling so a valid bonus payment is never
        // flagged as "overpaid". Sum previously-recorded bonuses from the ledger (rows
        // before this insert) and add the current payment's bonus on top.
        const [prevBonusRow] = await tx
          .select({ total: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.bonusAmount}), '0')` })
          .from(subPaymentRecordsTable)
          .where(and(
            eq(subPaymentRecordsTable.jobId, jobId),
            eq(subPaymentRecordsTable.subcontractorId, subId),
            sql`(${subPaymentRecordsTable.isReversal} IS NULL OR ${subPaymentRecordsTable.isReversal} = false)`,
          ));
        const prevBonuses = parseFloat(prevBonusRow?.total ?? "0");
        if (hoursOwed > 0) agreedOwed = hoursOwed + prevBonuses + (bonusAmount ?? 0);
      }

      // 1. Insert the payment record first.
      // LEDGER INVARIANT: this pay-worker path must not also insert an expenses row.
      // Fixed/allocation payments are owned by sub_payment_records; hourly labor is
      // already represented by the jobSubHours-linked auto-expense. If a future
      // caller needs a linked expense, add an explicit source link/flag and update
      // the Schedule C filter rather than creating an unlinked duplicate.
      const [spr] = await tx.insert(subPaymentRecordsTable).values({
        jobId,
        subcontractorId: subId,
        businessLine: job.businessLine,
        amount: paymentAmount.toFixed(2),
        paymentDate: paymentDateStr,
        description: `${subName} — ${typeLabel}`,
        createdFrom: "pay-worker",
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(agreedOwed != null ? { agreedOwedSnapshot: agreedOwed.toFixed(2) } : {}),
        // Dual-rate breakdown (nullable — only set when client sends them)
        ...(workHours  != null ? { workHours:  workHours.toFixed(2)  } : {}),
        ...(workRate   != null ? { workRate:   workRate.toFixed(2)   } : {}),
        ...(travelHours != null && travelHours > 0 ? { travelHours: travelHours.toFixed(2) } : {}),
        ...(travelRate  != null && (travelHours ?? 0) > 0 ? { travelRate:  travelRate.toFixed(2) } : {}),
        ...(bonusAmount  != null && bonusAmount  > 0 ? { bonusAmount:  bonusAmount.toFixed(2)  } : {}),
        ...(bonusNote   ? { bonusNote   } : {}),
        ...(advanceAmount != null && advanceAmount > 0 ? { advanceAmount: advanceAmount.toFixed(2) } : {}),
        ...(advanceNote  ? { advanceNote  } : {}),
        // netPaid stored whenever advance is involved or hourly breakdown exists
        ...((hasBreakdown || (advanceAmount != null && advanceAmount > 0)) ? { netPaid: paymentAmount.toFixed(2) } : {}),
        ...(paymentMethod    ? { paymentMethod }                    : {}),
        ...(paymentReference ? { referenceNumber: paymentReference } : {}),
      }).returning({ id: subPaymentRecordsTable.id });

      // 2. (Advances are now simple deductions — no sub_advances table updates needed)

      // 3. Compute accumulated from ledger SUM — authoritative, includes the just-inserted record
      //    This prevents cached column drift regardless of reversals or manual corrections.
      const [sumRow] = await tx
        .select({
          cashPaid:      sql<string>`COALESCE(SUM(${subPaymentRecordsTable.amount}), '0')`,
          advancesApplied: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.advanceAmount}), '0')`,
        })
        .from(subPaymentRecordsTable)
        .where(and(
          eq(subPaymentRecordsTable.jobId, jobId),
          eq(subPaymentRecordsTable.subcontractorId, subId),
          sql`(${subPaymentRecordsTable.isReversal} IS NULL OR ${subPaymentRecordsTable.isReversal} = false)`,
        ));
      const newAccumulated = parseFloat(sumRow?.cashPaid ?? "0");
      // Advances were real cash already given to the sub — count them toward "paid" status.
      // Without this, a $60 advance + $1,229.71 net payment on a $1,289.71 obligation
      // would show "partial — $60 due" even though the sub is fully settled.
      const totalAdvancesApplied = parseFloat(sumRow?.advancesApplied ?? "0");
      const effectivePaid = newAccumulated + totalAdvancesApplied;

      // 4. Status: "paid"/"overpaid"/"partial" relative to agreed owed
      const newStatus: "paid" | "partial" | "overpaid" =
        agreedOwed != null && effectivePaid < agreedOwed - 0.005 ? "partial" :
        agreedOwed != null && effectivePaid > agreedOwed + 0.005 ? "overpaid" : "paid";

      // 5. Update cached columns — amount_paid includes both the net payment and
      // any earlier advance applied by this ledger row. The advance was real cash
      // already paid, so omitting it makes fully-settled jobs display as partially paid.
      await tx.update(jobSubcontractorsTable).set({
        paymentStatus: newStatus,
        paidAt: newPaidAt,
        lastPaidAt: today,
        amountPaid: effectivePaid.toFixed(2),
        // An advance is applied once to this payment. Clearing the draft prevents
        // a later installment from applying the same prior cash payout again.
        accruedAdvancement: null,
        ...(lockAmountOwed !== undefined ? { amountOwed: lockAmountOwed } : {}),
      }).where(and(
        eq(jobSubcontractorsTable.jobId, jobId),
        eq(jobSubcontractorsTable.subcontractorId, subId),
      ));

      txResult = { ok: true, paymentId: spr.id, amount: paymentAmount, accumulated: newAccumulated, status: newStatus };
    });

    await recomputeSubPaid(jobId).catch(() => {});

    res.json(txResult ?? { ok: true });
  } catch (err: any) {
    if (err?.alreadyPaid) return res.json({ ok: true, alreadyPaid: true });
    if (err?.notFound) return res.status(404).json({ error: "Sub not assigned to this job" });
    // Idempotency: unique constraint violation on idempotency_key from a race — fetch and return existing
    if ((err?.code === "23505" || err?.constraint?.includes("idempotency_key")) && idempotencyKey) {
      const [existing] = await db.select({ id: subPaymentRecordsTable.id, amount: subPaymentRecordsTable.amount })
        .from(subPaymentRecordsTable)
        .where(eq(subPaymentRecordsTable.idempotencyKey, idempotencyKey));
      if (existing) return res.json({ ok: true, duplicate: true, paymentId: existing.id, amount: parseFloat(existing.amount), accumulated: 0, status: "duplicate" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

router.post("/:id/record-owner-draw", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id" });
    const amount = parseFloat(String(req.body.amount ?? "0"));
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
    const [job] = await db.select({
      businessId: jobsTable.businessId,
      businessLine: jobsTable.businessLine,
    }).from(jobsTable).where(eq(jobsTable.id, jobId));
    if (!job || job.businessId == null) {
      return res.status(404).json({ error: "Job not found or has no business owner" });
    }
    const today = new Date().toISOString().split("T")[0];
    const description = String(req.body.description ?? `Owner Withdrawal — Job ${jobId}`);

    // Idempotency: an owner withdrawal is one ledger event, so check the ledger
    // rather than the operating-expense table.
    const [existing] = await db.select({ id: ownerCapitalEntriesTable.id })
      .from(ownerCapitalEntriesTable)
      .where(and(
        eq(ownerCapitalEntriesTable.jobId, jobId),
        eq(ownerCapitalEntriesTable.date, today),
        sql`${ownerCapitalEntriesTable.amount} < 0`,
        isNull(ownerCapitalEntriesTable.voidedAt),
      ));
    if (existing) return res.json({ ok: true, ownerCapitalId: existing.id, alreadyExists: true });

    // Owner withdrawals are not operating expenses. Keep the canonical negative
    // sign so all owner-withdrawal surfaces use one ledger.
    const [entry] = await db.insert(ownerCapitalEntriesTable).values({
      businessId: job.businessId,
      jobId,
      date: today,
      description,
      amount: String(-amount),
      source: "job_payroll",
    }).returning();

    res.status(201).json({ ok: true, ownerCapitalId: entry.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to record owner withdrawal" });
  }
});

// Record expense entries for unpaid fixed/allocation subs without changing paymentStatus.
// Used by "Complete Job & Keep As Outstanding" flow so costs land in the books immediately.
// Amounts and categories are derived server-side to match pay-worker accounting rules:
//   fixed → category "Labor", amount = fixedAmount
//   allocation → category "Subcontractor", amount = allocationPct * toSplit
router.post("/:id/record-sub-expenses", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id" });

    // 1. Fetch all unpaid/partial fixed/allocation subs from DB
    const unpaidSubs = await db.select({
      subcontractorId: jobSubcontractorsTable.subcontractorId,
      compensationType: jobSubcontractorsTable.compensationType,
      fixedAmount: jobSubcontractorsTable.fixedAmount,
      allocationPct: jobSubcontractorsTable.allocationPct,
    })
      .from(jobSubcontractorsTable)
      .where(and(
        eq(jobSubcontractorsTable.jobId, jobId),
        inArray(jobSubcontractorsTable.paymentStatus, ["unpaid", "partial"]),
        inArray(jobSubcontractorsTable.compensationType, ["fixed", "allocation"]),
      ));
    if (unpaidSubs.length === 0) return res.json({ ok: true, created: 0 });

    // Payroll obligations are derived from the payroll tables and must never
    // be copied into expenses. Keep this endpoint harmless for older clients
    // that still call it, but deliberately perform no writes.
    res.json({ ok: true, created: 0, skippedPayrollRows: unpaidSubs.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to record sub expenses" });
  }
});

// PATCH /:id/sub-payments/:subId — update (or clear) agreed owed override on job_subcontractors.
// Send { amountOwed: number } to set an override, or { amountOwed: null } to clear it
// (falling back to the computed/fixedAmount value).
router.patch("/:id/sub-payments/:subId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const subId = parseInt(req.params.subId);
    if (isNaN(jobId) || isNaN(subId)) return res.status(400).json({ error: "Invalid ids" });
    const { amountOwed } = req.body;

    let newValue: string | null;
    if (amountOwed === null || amountOwed === undefined) {
      newValue = null; // clear override — fall back to fixedAmount / computed
    } else {
      const parsed = parseFloat(String(amountOwed));
      if (isNaN(parsed) || parsed < 0) return res.status(400).json({ error: "amountOwed must be a non-negative number or null" });
      newValue = parsed.toFixed(2);
    }

    // Fetch current paid amount so we can recompute paymentStatus after the owed change
    const [current] = await db.select({
      amountPaid: jobSubcontractorsTable.amountPaid,
      fixedAmount: jobSubcontractorsTable.fixedAmount,
      compensationType: jobSubcontractorsTable.compensationType,
    }).from(jobSubcontractorsTable).where(and(
      eq(jobSubcontractorsTable.jobId, jobId),
      eq(jobSubcontractorsTable.subcontractorId, subId),
    ));
    if (!current) return res.status(404).json({ error: "Sub not found on this job" });

    const paid = current.amountPaid != null ? parseFloat(current.amountPaid) : 0;
    // Effective new owed: override ?? fixedAmount (allocation falls back to null — not recomputable here)
    const effectiveOwed = newValue != null
      ? parseFloat(newValue)
      : current.compensationType === "fixed" && current.fixedAmount != null
        ? parseFloat(current.fixedAmount)
        : null;

    let newStatus: "unpaid" | "partial" | "paid" | "overpaid";
    if (effectiveOwed != null) {
      if (paid > effectiveOwed + 0.005) newStatus = "overpaid";
      else if (paid >= effectiveOwed - 0.005) newStatus = "paid";
      else if (paid > 0) newStatus = "partial";
      else newStatus = "unpaid";
    } else {
      // No owed baseline to compare against — use paid amount as indicator
      newStatus = paid > 0 ? "partial" : "unpaid";
    }

    await db.update(jobSubcontractorsTable).set({
      amountOwed: newValue,
      paymentStatus: newStatus,
    }).where(and(
      eq(jobSubcontractorsTable.jobId, jobId),
      eq(jobSubcontractorsTable.subcontractorId, subId),
    ));
    res.json({ ok: true, amountOwed: newValue, paymentStatus: newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update agreed owed" });
  }
});

// PATCH /:jobId/sub-payment-draft/:subId
// Save draft payroll fields (bonus, advancement, payment info) WITHOUT recording a payment.
// This allows accruing labor cost on the job card before cash changes hands.
router.patch("/:jobId/sub-payment-draft/:subId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const subId = parseInt(req.params.subId);
    if (isNaN(jobId) || isNaN(subId)) return res.status(400).json({ error: "Invalid ids" });

    const { bonusAmount, bonusNote, advancementAmt, paymentMethod, paymentReference } = req.body;

    const bonusVal   = bonusAmount  != null && bonusAmount  !== "" ? parseFloat(String(bonusAmount))  : null;
    const advanceVal = advancementAmt != null && advancementAmt !== "" ? parseFloat(String(advancementAmt)) : null;

    if (bonusVal   != null && (isNaN(bonusVal)   || bonusVal   < 0)) return res.status(400).json({ error: "bonusAmount must be non-negative" });
    if (advanceVal != null && (isNaN(advanceVal) || advanceVal < 0)) return res.status(400).json({ error: "advancementAmt must be non-negative" });

    const [existing] = await db
      .select({ jobId: jobSubcontractorsTable.jobId })
      .from(jobSubcontractorsTable)
      .where(and(eq(jobSubcontractorsTable.jobId, jobId), eq(jobSubcontractorsTable.subcontractorId, subId)));
    if (!existing) return res.status(404).json({ error: "Sub not found on this job" });

    await db.update(jobSubcontractorsTable).set({
      accruedBonus:          bonusVal   != null ? String(bonusVal.toFixed(2))   : null,
      accruedBonusNote:      bonusNote  != null ? String(bonusNote)  : null,
      accruedAdvancement:    advanceVal != null ? String(advanceVal.toFixed(2)) : null,
      paymentMethodDraft:    paymentMethod    != null ? String(paymentMethod)    : null,
      paymentReferenceDraft: paymentReference != null ? String(paymentReference) : null,
    }).where(and(
      eq(jobSubcontractorsTable.jobId, jobId),
      eq(jobSubcontractorsTable.subcontractorId, subId),
    ));

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save payroll draft" });
  }
});

// Outstanding unpaid fixed/allocation subs for a single job — used by the job card banner
router.get("/:id/outstanding-sub-payments", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });

    // Ledger subquery — authoritative total paid per sub from sub_payment_records
    const ledgerSubquery = (jobId: number) => sql<string>`COALESCE((
      SELECT SUM(spr.amount + COALESCE(spr.advance_amount, 0)) FROM sub_payment_records spr
      WHERE spr.job_id = ${jobId}
        AND spr.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
        AND (spr.is_reversal IS NULL OR spr.is_reversal = false)
    ), '0')`;

    // Fetch all subs (no paymentStatus pre-filter) — we'll derive outstanding status
    // from the ledger so stale paymentStatus columns don't produce false alerts.
    const [fixedAllocRows, hourlyRows] = await Promise.all([
      db.select({
        subcontractorId: jobSubcontractorsTable.subcontractorId,
        subName: subcontractorsTable.name,
        compensationType: jobSubcontractorsTable.compensationType,
        fixedAmount: jobSubcontractorsTable.fixedAmount,
        allocationPct: jobSubcontractorsTable.allocationPct,
        amountOwed: jobSubcontractorsTable.amountOwed,
        amountPaid: jobSubcontractorsTable.amountPaid,
        paymentStatus: jobSubcontractorsTable.paymentStatus,
        ledgerPaid: ledgerSubquery(id),
      })
        .from(jobSubcontractorsTable)
        .leftJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
        .where(and(
          eq(jobSubcontractorsTable.jobId, id),
          inArray(jobSubcontractorsTable.compensationType, ["fixed", "allocation"]),
        )),

      // Hourly subs with real labor: they need the payroll screen, not inline pay.
      // Include only when they have accrued bonus OR at least one hours entry.
      db.select({
        subcontractorId: jobSubcontractorsTable.subcontractorId,
        subName: subcontractorsTable.name,
        compensationType: jobSubcontractorsTable.compensationType,
        amountOwed: jobSubcontractorsTable.amountOwed,
        amountPaid: jobSubcontractorsTable.amountPaid,
        paymentStatus: jobSubcontractorsTable.paymentStatus,
        accruedBonus: jobSubcontractorsTable.accruedBonus,
        ledgerPaid: ledgerSubquery(id),
        totalHours: sql<string>`COALESCE((
          SELECT SUM(h.hours) FROM job_sub_hours h
          WHERE h.job_id = ${id} AND h.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
        ), 0)`,
        // Raw hours×rate total — used when no agreed hourly amount is locked.
        computedOwed: sql<string>`COALESCE((
          SELECT SUM(h.hours * COALESCE(h.rate_snapshot, 0)) FROM job_sub_hours h
          WHERE h.job_id = ${id} AND h.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
        ), '0')`,
      })
        .from(jobSubcontractorsTable)
        .leftJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
        .where(and(
          eq(jobSubcontractorsTable.jobId, id),
          eq(jobSubcontractorsTable.compensationType, "hourly"),
          sql`(
            COALESCE(${jobSubcontractorsTable.accruedBonus}, 0) > 0
            OR EXISTS (
              SELECT 1 FROM job_sub_hours h
              WHERE h.job_id = ${id} AND h.subcontractor_id = ${jobSubcontractorsTable.subcontractorId}
            )
          )`,
        )),
    ]);

    // Compute split pool for allocation subs
    const hasAlloc = fixedAllocRows.some(r => r.compensationType === "allocation");
    const splitPool = hasAlloc ? (await computeAllocationSplitPool(id)).splitPool : 0;

    // Helper: pick the higher of ledger total vs stale amountPaid column
    function effectivePaid(amountPaid: string | null, ledgerPaid: string): number {
      return Math.max(
        amountPaid != null ? parseFloat(amountPaid) : 0,
        parseFloat(ledgerPaid ?? "0"),
      );
    }

    // Track subs needing background repair: [subcontractorId, lockAmountOwed | null]
    // lockAmountOwed set means we also need to write amountOwed back to the DB.
    const repairItems: { subId: number; lockOwed: string | null }[] = [];

    const fixedAllocResult = fixedAllocRows
      .map(r => {
        const paid = effectivePaid(r.amountPaid, r.ledgerPaid);
        const ledger = parseFloat(r.ledgerPaid ?? "0");

        // Legacy repair: allocation sub paid before amountOwed locking was introduced.
        // amountOwed is null so computeSubOwed recomputes from the live pool on every
        // check — if the pool grew since the payment the sub re-appears as outstanding.
        // Treat ledgerPaid as the locked owed amount: whatever was paid is what was owed.
        if (
          r.compensationType === "allocation" &&
          r.amountOwed == null &&
          ledger > 0
        ) {
          const subId = r.subcontractorId;
          if (subId != null) repairItems.push({ subId, lockOwed: ledger.toFixed(2) });
          // Not outstanding — the ledger covers the (now-locked) obligation
          return { row: r, paid, outstanding: false };
        }

        // Trust explicit user confirmation: paymentStatus='paid' + real ledger payment.
        // Handles jobs that were paid and closed under the old system then reopened for
        // edits — the user agreed to the payment amount, no re-payment should be required.
        if (r.paymentStatus === "paid" && ledger > 0) {
          return { row: r, paid, outstanding: false };
        }

        const owed = computeSubOwed({
          amountOwed: r.amountOwed, compensationType: r.compensationType,
          fixedAmount: r.fixedAmount, allocationPct: r.allocationPct, computedOwed: "0",
        }, splitPool);
        // Truly outstanding = owed is known, positive, and not yet covered
        const outstanding = owed == null || owed <= 0 ? false : paid < owed - 0.005;
        if (!outstanding && (r.paymentStatus === "unpaid" || r.paymentStatus === "partial")) {
          if (r.subcontractorId != null) repairItems.push({ subId: r.subcontractorId, lockOwed: null });
        }
        return { row: r, paid, owed, outstanding };
      })
      .filter(({ outstanding }) => outstanding)
      .map(({ row: r, paid, owed }) => ({
        subcontractorId: r.subcontractorId,
        subName: r.subName ?? `Sub #${r.subcontractorId}`,
        compensationType: r.compensationType ?? "fixed",
        fixedAmount: r.fixedAmount != null ? parseFloat(r.fixedAmount) : null,
        allocationPct: r.allocationPct != null ? parseFloat(r.allocationPct) : null,
        amountOwed: r.amountOwed != null ? parseFloat(r.amountOwed) : null,
        computedOwed: r.compensationType === "allocation" && r.amountOwed == null ? owed : undefined,
        amountPaid: paid,
        paymentStatus: r.paymentStatus ?? "unpaid",
        totalHours: null as number | null,
        accruedBonus: null as number | null,
      }));

    const hourlyResult = hourlyRows
      .map(r => {
        const paid = effectivePaid(r.amountPaid, r.ledgerPaid);
        const ledgerH = parseFloat(r.ledgerPaid ?? "0");
        const hours = parseFloat(r.totalHours ?? "0");
        const bonus = r.accruedBonus != null ? parseFloat(r.accruedBonus) : 0;
        const owedFromHours = parseFloat(r.computedOwed ?? "0");

        // Trust explicit user confirmation: paymentStatus='paid' + real ledger payment.
        if (r.paymentStatus === "paid" && ledgerH > 0) {
          return { row: r, paid, hours, bonus, outstanding: false };
        }

        // A saved agreed amount is authoritative for hourly pay, just as it is
        // in computeSubOwed and the Job Financials waterfall.
        const owed = r.amountOwed != null ? parseFloat(r.amountOwed) : owedFromHours;
        const outstanding = (owed + bonus) > (paid + 0.005);
        if (!outstanding && (r.paymentStatus === "unpaid" || r.paymentStatus === "partial")) {
          if (r.subcontractorId != null) repairItems.push({ subId: r.subcontractorId, lockOwed: null });
        }
        return { row: r, paid, hours, bonus, outstanding };
      })
      .filter(({ outstanding }) => outstanding)
      .map(({ row: r, paid, hours, bonus }) => ({
        subcontractorId: r.subcontractorId,
        subName: r.subName ?? `Sub #${r.subcontractorId}`,
        compensationType: "hourly" as const,
        fixedAmount: null as number | null,
        allocationPct: null as number | null,
        amountOwed: r.amountOwed != null ? parseFloat(r.amountOwed) : null,
         computedOwed: parseFloat(r.computedOwed ?? "0"),
        amountPaid: paid,
        paymentStatus: r.paymentStatus ?? "unpaid",
        totalHours: hours,
        accruedBonus: bonus || null,
      }));

    // Background repair: fix stale paymentStatus and lock amountOwed for legacy allocation subs
    if (repairItems.length > 0) {
      setImmediate(async () => {
        try {
          await Promise.all(repairItems.map(({ subId, lockOwed }) => {
            const updates: Record<string, unknown> = { paymentStatus: "paid" };
            if (lockOwed != null) {
              updates.amountOwed = lockOwed;
              updates.amountPaid = lockOwed;
            }
            return db.update(jobSubcontractorsTable).set(updates as any).where(and(
              eq(jobSubcontractorsTable.jobId, id),
              eq(jobSubcontractorsTable.subcontractorId, subId),
            ));
          }));
          await recomputeSubPaid(id);
        } catch (e) {
          console.error("[outstanding-sub-repair]", e);
        }
      });
    }

    res.json([...fixedAllocResult, ...hourlyResult]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch outstanding sub payments" });
  }
});

router.get("/:id/related-counts", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    const [[dl], [ex], [ml], [re], [inv]] = await Promise.all([
      db.select({ n: count() }).from(dailyLogsTable).where(eq(dailyLogsTable.jobId, id)),
      db.select({ n: count() }).from(expensesTable).where(eq(expensesTable.jobId, id)),
      db.select({ n: count() }).from(mileageLogsTable).where(eq(mileageLogsTable.jobId, id)),
      db.select({ n: count() }).from(recurringExpensesTable).where(eq(recurringExpensesTable.jobId, id)),
      db.select({ n: count() }).from(invoicesTable).where(eq(invoicesTable.jobId, id)),
    ]);
    res.json({
      dailyLogs: dl.n,
      expenses: ex.n,
      mileageLogs: ml.n,
      recurringExpenses: re.n,
      invoices: inv.n,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch related counts" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    await db.transaction(async (tx) => {
      await tx.delete(dailyLogsTable).where(eq(dailyLogsTable.jobId, id));
      await tx.delete(mileageLogsTable).where(eq(mileageLogsTable.jobId, id));
      await tx.delete(recurringExpensesTable).where(eq(recurringExpensesTable.jobId, id));
      await tx.delete(expensesTable).where(eq(expensesTable.jobId, id));
      await tx.delete(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, id));
      await tx.update(estimatesTable).set({ jobId: null }).where(eq(estimatesTable.jobId, id));
      await tx.update(invoicesTable).set({ jobId: null }).where(eq(invoicesTable.jobId, id));
      await tx.delete(jobsTable).where(eq(jobsTable.id, id));
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete job" });
  }
});

// ─── Toggle owner pay inclusion per job ──────────────────────────────────────
router.patch("/:id/owner-pay-included", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid job id" });
    const { included } = req.body as { included: boolean };
    if (typeof included !== "boolean") return res.status(400).json({ error: "included must be boolean" });
    await db.update(jobsTable).set({ ownerPayIncluded: included }).where(eq(jobsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update" });
  }
});

// ── Payroll Correction credit balance for a sub ──────────────────────────────
// Returns total unrecovered overpayment across all "overpaid" jobs for this sub.
// Recovery is tracked via advance_amount entries on payment records for other jobs.
router.get("/payroll-correction/:subId", async (req, res) => {
  try {
    const subId = parseInt(req.params.subId);
    if (isNaN(subId)) return res.status(400).json({ error: "Invalid sub id" });

    // 1. Collect all jobs where this sub was overpaid
    const overpaidRows = await db
      .select({
        jobId: jobSubcontractorsTable.jobId,
        amountOwed: jobSubcontractorsTable.amountOwed,
        amountPaid: jobSubcontractorsTable.amountPaid,
        jobTitle: jobsTable.title,
      })
      .from(jobSubcontractorsTable)
      .leftJoin(jobsTable, eq(jobSubcontractorsTable.jobId, jobsTable.id))
      .where(and(
        eq(jobSubcontractorsTable.subcontractorId, subId),
        eq(jobSubcontractorsTable.paymentStatus, "overpaid"),
      ));

    if (overpaidRows.length === 0) {
      return res.json({ correctionBalance: 0, resolved: true, sources: [] });
    }

    const overpaidJobIds = overpaidRows.map(r => r.jobId).filter((id): id is number => id != null);

    const totalOverpaid = overpaidRows.reduce((sum, r) => {
      const paid = r.amountPaid != null ? parseFloat(r.amountPaid) : 0;
      const owed = r.amountOwed != null ? parseFloat(r.amountOwed) : 0;
      return sum + Math.max(0, paid - owed);
    }, 0);

    // 2. Advances applied on non-overpaid jobs = amount already recovered
    const [advRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.advanceAmount}), '0')` })
      .from(subPaymentRecordsTable)
      .where(and(
        eq(subPaymentRecordsTable.subcontractorId, subId),
        sql`(${subPaymentRecordsTable.isReversal} IS NULL OR ${subPaymentRecordsTable.isReversal} = false)`,
        ...(overpaidJobIds.length > 0 ? [sql`${subPaymentRecordsTable.jobId} NOT IN (${sql.join(overpaidJobIds.map(id => sql`${id}`), sql`, `)})`] : []),
      ));
    const totalRecovered = parseFloat(advRow?.total ?? "0");

    const correctionBalance = parseFloat(Math.max(0, totalOverpaid - totalRecovered).toFixed(2));
    const resolved = correctionBalance < 0.005;

    const sources = overpaidRows
      .map(r => ({
        jobId: r.jobId,
        jobName: r.jobTitle ?? `Job #${r.jobId}`,
        overpaidBy: parseFloat(Math.max(0, (r.amountPaid != null ? parseFloat(r.amountPaid) : 0) - (r.amountOwed != null ? parseFloat(r.amountOwed) : 0)).toFixed(2)),
      }))
      .filter(s => s.overpaidBy > 0.005);

    res.json({ correctionBalance, resolved, sources });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get payroll correction balance" });
  }
});

export default router;
