import { Router } from "express";
import { db, productionServiceTypesTable } from "@workspace/db";
import { eq, asc, or, isNull } from "drizzle-orm";
import { wrapAsync } from "./guards";

const router = Router();

// Canonical MH Production default services (mirrors 0001-mh-production.sql seed).
const DEFAULT_SERVICE_TYPES: { name: string; sortOrder: number }[] = [
  { name: "Interior Trim Out", sortOrder: 1 },
  { name: "Exterior Trim Out", sortOrder: 2 },
  { name: "Plumbing Hookup", sortOrder: 3 },
  { name: "4×4 Deck / Step Platform", sortOrder: 4 },
];

async function fetchActiveServiceTypes() {
  return db
    .select()
    .from(productionServiceTypesTable)
    .where(eq(productionServiceTypesTable.active, true))
    .orderBy(asc(productionServiceTypesTable.sortOrder), asc(productionServiceTypesTable.createdAt));
}

router.get("/", wrapAsync(async (req, res) => {
  const businessId = req.query.businessId ? parseInt(req.query.businessId as string) : null;
  let rows = await fetchActiveServiceTypes();

  // Idempotent GET-and-seed: if the catalog is empty (DB never seeded, or seed
  // failed), insert the global defaults so users are never blocked with an empty
  // checklist. Re-check inside to stay safe against concurrent first loads.
  if (rows.length === 0) {
    const existing = await db.select().from(productionServiceTypesTable).limit(1);
    if (existing.length === 0) {
      try {
        await db
          .insert(productionServiceTypesTable)
          .values(DEFAULT_SERVICE_TYPES.map(d => ({ name: d.name, sortOrder: d.sortOrder, businessId: null })));
      } catch (err) {
        console.error("Failed to auto-seed production_service_types defaults:", err);
      }
    }
    rows = await fetchActiveServiceTypes();
  }

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
