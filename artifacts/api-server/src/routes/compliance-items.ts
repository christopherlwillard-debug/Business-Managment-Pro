import { Router } from "express";
import { db } from "@workspace/db";
import { complianceItemsTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router = Router();

function format(item: any) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(item.dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  let computedStatus = item.status;
  if (item.status !== "complete") {
    if (diffDays < 0) computedStatus = "overdue";
    else if (diffDays <= 30) computedStatus = "due-soon";
    else computedStatus = "upcoming";
  }

  return { ...item, computedStatus, daysUntilDue: diffDays };
}

router.get("/", async (_req, res) => {
  try {
    const items = await db
      .select()
      .from(complianceItemsTable)
      .orderBy(asc(complianceItemsTable.dueDate));
    res.json(items.map(format));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch compliance items" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, category, jurisdiction, dueDate, recurrence, notes } = req.body;
    if (!title?.trim() || !dueDate) {
      return res.status(400).json({ error: "Title and due date are required" });
    }
    const [item] = await db
      .insert(complianceItemsTable)
      .values({ title: title.trim(), category: category || "Other", jurisdiction: jurisdiction || null, dueDate, recurrence: recurrence || "one-time", status: "upcoming", notes: notes || null })
      .returning();
    res.status(201).json(format(item));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create compliance item" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, category, jurisdiction, dueDate, recurrence, status, notes } = req.body;
    const [item] = await db
      .update(complianceItemsTable)
      .set({ title, category, jurisdiction: jurisdiction || null, dueDate, recurrence, status, notes: notes || null })
      .where(eq(complianceItemsTable.id, id))
      .returning();
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(format(item));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update compliance item" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(complianceItemsTable).where(eq(complianceItemsTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete" });
  }
});

export default router;
