import { Router } from "express";
import { db, productionServiceTypesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { wrapAsync } from "./guards";

const router = Router();

router.get("/", wrapAsync(async (_req, res) => {
  const rows = await db
    .select()
    .from(productionServiceTypesTable)
    .where(eq(productionServiceTypesTable.active, true))
    .orderBy(asc(productionServiceTypesTable.sortOrder), asc(productionServiceTypesTable.createdAt));
  res.json(rows);
}));

router.post("/", wrapAsync(async (req, res) => {
  const { name, sortOrder } = req.body as { name?: string; sortOrder?: number };
  if (!name?.trim()) return res.status(400).json({ error: "name is required" });
  const [row] = await db
    .insert(productionServiceTypesTable)
    .values({ name: name.trim(), sortOrder: sortOrder ?? 0 })
    .returning();
  res.status(201).json(row);
}));

router.delete("/:id", wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [row] = await db
    .update(productionServiceTypesTable)
    .set({ active: false })
    .where(eq(productionServiceTypesTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
}));

export default router;
