import { Router } from "express";
import { db } from "@workspace/db";
import { ownerCapitalEntriesTable, settingsTable } from "@workspace/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";

const router = Router();

function formatEntry(e: typeof ownerCapitalEntriesTable.$inferSelect) {
  return {
    id: e.id,
    businessId: e.businessId,
    date: e.date,
    description: e.description,
    amount: parseFloat(e.amount as string),
    createdAt: e.createdAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const rawBid = req.query.businessId;
    const businessId = rawBid != null && String(rawBid) !== "" ? parseInt(String(rawBid)) : null;

    const whereClause = businessId != null && Number.isFinite(businessId)
      ? eq(ownerCapitalEntriesTable.businessId, businessId)
      : undefined;

    const entries = await db
      .select()
      .from(ownerCapitalEntriesTable)
      .where(whereClause)
      .orderBy(desc(ownerCapitalEntriesTable.date), desc(ownerCapitalEntriesTable.createdAt));

    if (entries.length === 0) {
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
    const { date, description, amount, businessId } = req.body;
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: "Invalid or missing date" });
      return;
    }
    if (!description || typeof description !== "string" || description.trim() === "") {
      res.status(400).json({ error: "Description is required" });
      return;
    }
    const parsedAmount = parseFloat(String(amount));
    if (amount == null || isNaN(parsedAmount)) {
      res.status(400).json({ error: "Invalid amount" });
      return;
    }
    const parsedBusinessId = businessId != null && !isNaN(parseInt(String(businessId)))
      ? parseInt(String(businessId))
      : null;

    const [entry] = await db.insert(ownerCapitalEntriesTable).values({
      businessId: parsedBusinessId,
      date,
      description: description.trim(),
      amount: String(parsedAmount),
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
