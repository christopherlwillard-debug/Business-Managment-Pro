import { Router } from "express";
import { db } from "@workspace/db";
import { businessesTable, jobsTable, ownerCapitalEntriesTable } from "@workspace/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { ownerGuard } from "./guards.js";
import { resolveMutationBusiness, mutationBusinessPredicate, belongsToBusiness } from "../lib/business-scope.js";

const router = Router();
router.use(ownerGuard());

/**
 * Sign convention for owner_capital_entries.amount:
 *   positive  = capital contribution (owner puts money INTO the business)
 *   negative  = owner withdrawal from capital account (owner takes money OUT)
 *
 * The UI always stores the user-entered value as-is. Report routes sum positive
 * entries for ownerContributionsTotal and use |negative entries| for capital
 * withdrawals. Owner draws are stored here as negative entries, including
 * job-linked withdrawals recorded from the Pay Breakdown tab.
 */
function formatEntry(e: typeof ownerCapitalEntriesTable.$inferSelect) {
  return {
    id: e.id,
    businessId: e.businessId,
    jobId: e.jobId ?? null,
    date: e.date,
    description: e.description,
    // Amount is returned as-is; callers interpret sign per the convention above.
    amount: parseFloat(e.amount as string),
    createdAt: e.createdAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const rawBid = req.query.businessId;
    const businessId = rawBid != null && String(rawBid) !== "" ? parseInt(String(rawBid)) : null;
    if (rawBid != null && (!Number.isFinite(businessId) || businessId == null)) {
      return res.status(400).json({ error: "Invalid business id" });
    }
    if (businessId != null) {
      const [business] = await db.select({ id: businessesTable.id }).from(businessesTable)
        .where(eq(businessesTable.id, businessId)).limit(1);
      if (!business) return res.status(404).json({ error: "Business not found" });
    }

    // Optional job filter — used by the job Pay Breakdown tab to show only
    // owner withdrawal entries recorded from that specific job.
    const conditions = [];
    const rawJid = req.query.jobId;
    const jobId = rawJid != null && String(rawJid) !== "" ? parseInt(String(rawJid)) : null;
    if (rawJid != null && (!Number.isFinite(jobId) || jobId == null)) {
      return res.status(400).json({ error: "Invalid job id" });
    }
    if (jobId != null) {
      const [job] = await db.select({ businessId: jobsTable.businessId }).from(jobsTable)
        .where(eq(jobsTable.id, jobId)).limit(1);
      if (!job || (businessId != null && job.businessId !== businessId)) {
        return res.status(404).json({ error: "Job not found" });
      }
      if (job.businessId != null) conditions.push(eq(ownerCapitalEntriesTable.businessId, job.businessId));
    }

    if (businessId != null && Number.isFinite(businessId)) {
      conditions.push(eq(ownerCapitalEntriesTable.businessId, businessId));
    }
    if (jobId != null && Number.isFinite(jobId)) {
      conditions.push(eq(ownerCapitalEntriesTable.jobId, jobId));
    }

    conditions.push(isNull(ownerCapitalEntriesTable.voidedAt));
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions as [any, any]);
    const entries = await db
      .select()
      .from(ownerCapitalEntriesTable)
      .where(whereClause)
      .orderBy(desc(ownerCapitalEntriesTable.date), desc(ownerCapitalEntriesTable.createdAt));

    res.json(entries.map(formatEntry));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch owner capital entries" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { date, description, amount, jobId, type } = req.body;
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: "Invalid or missing date" });
      return;
    }
    if (!description || typeof description !== "string" || description.trim() === "") {
      res.status(400).json({ error: "Description is required" });
      return;
    }
    const rawAmount = parseFloat(String(amount));
    if (amount == null || !Number.isFinite(rawAmount) || rawAmount <= 0) {
      res.status(400).json({ error: "Amount must be greater than zero" });
      return;
    }
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const owner = ownership.business;
    let parsedBusinessId = owner.id;
    // Optional job link — set when recording pay from a job's Pay Breakdown tab
    const parsedJobId = jobId != null && !isNaN(parseInt(String(jobId)))
      ? parseInt(String(jobId))
      : null;
    if (parsedJobId != null) {
      const [job] = await db.select({ businessId: jobsTable.businessId, businessLine: jobsTable.businessLine }).from(jobsTable)
        .where(eq(jobsTable.id, parsedJobId)).limit(1);
      if (!job || !belongsToBusiness(job, owner) || job.businessId == null) {
        return res.status(404).json({ error: "Job not found" });
      }
      parsedBusinessId = job.businessId;
    }

     // New user-facing transactions are withdrawals only. Historical positive
     // contribution rows remain readable in this ledger, but callers may not
     // create new contributions or use the old signed-amount fallback.
    let normalizedAmount: number;
    let resolvedSource: string;

    if (parsedJobId != null) {
      normalizedAmount = -Math.abs(rawAmount);
      resolvedSource = "job_financials";
    } else if (type === "withdrawal") {
      normalizedAmount = -Math.abs(rawAmount);
      resolvedSource = "capital_entry_withdrawal";
    } else {
       return res.status(400).json({
         error: "Only owner withdrawals can be created. Historical contributions remain available for reporting.",
       });
    }

    const [entry] = await db.insert(ownerCapitalEntriesTable).values({
      businessId: parsedBusinessId,
      jobId: parsedJobId,
      date,
      description: description.trim(),
      amount: String(normalizedAmount),
      source: resolvedSource,
    }).returning();
    res.status(201).json(formatEntry(entry));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create entry" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    return res.status(409).json({ error: "Posted owner-capital entries cannot be deleted. Use the void action to preserve financial history." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete entry" });
  }
});

router.post("/:id/void", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    if (!reason) return res.status(400).json({ error: "A void reason is required" });
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const [updated] = await db.update(ownerCapitalEntriesTable)
      .set({ voidedAt: new Date(), voidReason: reason })
      .where(and(
        eq(ownerCapitalEntriesTable.id, id),
        mutationBusinessPredicate(ownerCapitalEntriesTable, ownership.business),
        isNull(ownerCapitalEntriesTable.voidedAt),
      ))
      .returning();
    if (!updated) return res.status(404).json({ error: "Owner-capital entry not found or already voided" });
    res.json(formatEntry(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to void owner-capital entry" });
  }
});

export default router;
