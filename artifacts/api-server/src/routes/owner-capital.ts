import { Router } from "express";
import { db } from "@workspace/db";
import { ownerCapitalEntriesTable, settingsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";

const router = Router();

/**
 * Sign convention for owner_capital_entries.amount:
 *   positive  = capital contribution (owner puts money INTO the business)
 *   negative  = owner withdrawal from capital account (owner takes money OUT)
 *
 * The UI always stores the user-entered value as-is. Report routes sum positive
 * entries for ownerContributionsTotal and use |negative entries| for capital
 * withdrawals. Owner draws recorded as expenses use the "Owner Draw" /
 * "Owner Compensation" / "Owner Withdrawal" category and are NOT stored here.
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

    // Optional job filter — used by the job Pay Breakdown tab to show only
    // owner pay entries recorded from that specific job.
    const rawJid = req.query.jobId;
    const jobId = rawJid != null && String(rawJid) !== "" ? parseInt(String(rawJid)) : null;

    const conditions = [];
    if (businessId != null && Number.isFinite(businessId)) {
      conditions.push(eq(ownerCapitalEntriesTable.businessId, businessId));
    }
    if (jobId != null && Number.isFinite(jobId)) {
      conditions.push(eq(ownerCapitalEntriesTable.jobId, jobId));
    }

    const whereClause = conditions.length > 0
      ? conditions.length === 1 ? conditions[0] : and(...conditions as [any, any])
      : undefined;

    const entries = await db
      .select()
      .from(ownerCapitalEntriesTable)
      .where(whereClause)
      .orderBy(desc(ownerCapitalEntriesTable.date), desc(ownerCapitalEntriesTable.createdAt));

    // Only run the legacy one-time seed for the full business ledger (no jobId filter).
    // Never seed for job-scoped requests — an empty result there just means no pay
    // has been recorded for that job yet, which is the normal starting state.
    if (entries.length === 0 && jobId == null) {
      const [settings] = await db.select().from(settingsTable).limit(1);
      const legacy = parseFloat((settings?.calculatorDefaults as any)?.ownerPersonalInvestment ?? "0") || 0;
      if (legacy > 0) {
        const [migrated] = await db.insert(ownerCapitalEntriesTable).values({
          businessId: businessId ?? null,
          date: new Date().toISOString().split("T")[0],
          description: "Initial investment (migrated from previous records)",
          amount: String(legacy),
        }).returning();
        res.json([formatEntry(migrated)]);
        return;
      }
    }

    res.json(entries.map(formatEntry));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch owner capital entries" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { date, description, amount, businessId, jobId, type } = req.body;
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: "Invalid or missing date" });
      return;
    }
    if (!description || typeof description !== "string" || description.trim() === "") {
      res.status(400).json({ error: "Description is required" });
      return;
    }
    const rawAmount = parseFloat(String(amount));
    if (amount == null || isNaN(rawAmount)) {
      res.status(400).json({ error: "Invalid amount" });
      return;
    }
    const parsedBusinessId = businessId != null && !isNaN(parseInt(String(businessId)))
      ? parseInt(String(businessId))
      : null;
    // Optional job link — set when recording pay from a job's Pay Breakdown tab
    const parsedJobId = jobId != null && !isNaN(parseInt(String(jobId)))
      ? parseInt(String(jobId))
      : null;

    // ── Canonical sign convention (enforced server-side) ────────────────────────
    // amount > 0 = capital contribution (owner puts money IN)
    // amount < 0 = withdrawal / distribution (owner takes money OUT)
    //
    // Derive source and normalized amount from the caller context:
    //   • jobId present → Job Financials panel → always a withdrawal (negative)
    //   • type = 'withdrawal' → Capital Entry Take Out → negative
    //   • type = 'injection' → Capital Entry Put In → positive
    //   • legacy: accept signed amount as-is, infer source from sign
    let normalizedAmount: number;
    let resolvedSource: string;

    if (parsedJobId != null) {
      // Job Financials: always a withdrawal regardless of sign sent by client
      normalizedAmount = -Math.abs(rawAmount);
      resolvedSource = "job_financials";
    } else if (type === "withdrawal") {
      normalizedAmount = -Math.abs(rawAmount);
      resolvedSource = "capital_entry_withdrawal";
    } else if (type === "injection") {
      normalizedAmount = Math.abs(rawAmount);
      resolvedSource = "capital_entry_injection";
    } else {
      // Legacy path: client sends signed amount, infer direction from sign
      normalizedAmount = rawAmount;
      resolvedSource = rawAmount < 0 ? "capital_entry_withdrawal" : "capital_entry_injection";
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
    await db.delete(ownerCapitalEntriesTable).where(eq(ownerCapitalEntriesTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete entry" });
  }
});

export default router;
