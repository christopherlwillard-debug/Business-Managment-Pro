import { Router } from "express";
import { db, productionServiceTypesTable } from "@workspace/db";
import { eq, asc, or, isNull } from "drizzle-orm";
import { wrapAsync } from "./guards";

const router = Router();

router.get("/", wrapAsync(async (req, res) => {
  const businessId = req.query.businessId ? parseInt(req.query.businessId as string) : null;
  const rows = await db
    .select()
    .from(productionServiceTypesTable)
    .where(
      eq(productionServiceTypesTable.active, true)
    )
    .orderBy(asc(productionServiceTypesTable.sortOrder), asc(productionServiceTypesTable.createdAt));

  if (businessId && !isNaN(businessId)) {
    res.json(rows.filter(r => r.businessId === null || r.businessId === businessId));
  } else {
    res.json(rows);
  }
}));

router.post("/", wrapAsync(async (req, res) => {
  const { name, sortOrder, businessId } = req.body as { name?: string; sortOrder?: number; businessId?: number };
  if (!name?.trim()) return res.status(400).json({ error: "name is required" });
  const [row] = await db
    .insert(productionServiceTypesTable)
    .values({ name: name.trim(), sortOrder: sortOrder ?? 0, businessId: businessId ?? null })
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
