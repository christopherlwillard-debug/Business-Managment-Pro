import { Router } from "express";
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema";
import { eq, ilike } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { q } = req.query;
    let rows;
    if (q) {
      rows = await db
        .select()
        .from(vendorsTable)
        .where(ilike(vendorsTable.name, `%${q}%`))
        .orderBy(vendorsTable.name)
        .limit(20);
    } else {
      rows = await db
        .select()
        .from(vendorsTable)
        .orderBy(vendorsTable.name);
    }
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, category } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const existing = await db
      .select()
      .from(vendorsTable)
      .where(ilike(vendorsTable.name, name.trim()))
      .limit(1);

    if (existing.length > 0) {
      return res.json(existing[0]);
    }

    const [vendor] = await db
      .insert(vendorsTable)
      .values({ name: name.trim(), category: category || null })
      .returning();

    res.status(201).json(vendor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create vendor" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(vendorsTable).where(eq(vendorsTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete vendor" });
  }
});

export default router;
