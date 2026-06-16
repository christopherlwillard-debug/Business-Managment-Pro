import { Router } from "express";
import { db } from "@workspace/db";
import { ownerCapitalEntriesTable, settingsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

function formatEntry(e: typeof ownerCapitalEntriesTable.$inferSelect) {
  return {
    id: e.id,
    date: e.date,
    description: e.description,
    amount: parseFloat(e.amount as string),
    createdAt: e.createdAt,
  };
}

router.get("/", async (_req, res) => {
  try {
    const entries = await db
      .select()
      .from(ownerCapitalEntriesTable)
      .orderBy(desc(ownerCapitalEntriesTable.date), desc(ownerCapitalEntriesTable.createdAt));

    if (entries.length === 0) {
      const [settings] = await db.select().from(settingsTable).limit(1);
      const legacy = parseFloat((settings?.calculatorDefaults as any)?.ownerPersonalInvestment ?? "0") || 0;
      if (legacy > 0) {
        const [migrated] = await db.insert(ownerCapitalEntriesTable).values({
          date: new Date().toISOString().split("T")[0],
          description: "Initial investment (migrated from previous records)",
          amount: String(legacy),
        }).returning();
        return res.json([formatEntry(migrated)]);
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
    const { date, description, amount } = req.body;
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Invalid or missing date" });
    }
    if (!description || typeof description !== "string" || description.trim() === "") {
      return res.status(400).json({ error: "Description is required" });
    }
    const parsedAmount = parseFloat(String(amount));
    if (amount == null || isNaN(parsedAmount)) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    const [entry] = await db.insert(ownerCapitalEntriesTable).values({
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
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(ownerCapitalEntriesTable).where(eq(ownerCapitalEntriesTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete entry" });
  }
});

export default router;
