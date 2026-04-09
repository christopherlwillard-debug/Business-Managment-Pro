import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { servicesTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

function parseJsonbArray(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
}

function parseServiceBody(body: Record<string, unknown>): Record<string, unknown> {
  const textFields = [
    "name", "slug", "description", "category", "icon", "pricingType",
    "basePrice", "priceMin", "priceMax", "unit",
    "priceDisplay", "priceNote", "notes",
    "sortOrder",
  ] as const;
  const updates: Record<string, unknown> = {};
  for (const f of textFields) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  if (body["active"] !== undefined) updates["active"] = body["active"];
  if (body["addOns"] !== undefined) updates["addOns"] = parseJsonbArray(body["addOns"]);
  if (body["whatsIncluded"] !== undefined) updates["whatsIncluded"] = parseJsonbArray(body["whatsIncluded"]);
  return updates;
}

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const services = await db
      .select()
      .from(servicesTable)
      .orderBy(asc(servicesTable.sortOrder));
    res.json(services);
  } catch (err) {
    console.error("public-services GET error", err);
    res.status(500).json({ error: "Failed to load services" });
  }
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { name, slug } = req.body ?? {};
  if (!name || !slug) { res.status(400).json({ error: "name and slug are required" }); return; }
  const updates = parseServiceBody(req.body ?? {});
  try {
    const [service] = await db.insert(servicesTable).values(updates as typeof servicesTable.$inferInsert).returning();
    res.status(201).json(service);
  } catch (err) {
    console.error("public-services POST error", err);
    res.status(500).json({ error: "Failed to create service" });
  }
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const updates = parseServiceBody(req.body ?? {});
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  try {
    const [service] = await db
      .update(servicesTable)
      .set(updates)
      .where(eq(servicesTable.id, id))
      .returning();
    if (!service) { res.status(404).json({ error: "Not found" }); return; }
    res.json(service);
  } catch (err) {
    console.error("public-services PATCH error", err);
    res.status(500).json({ error: "Failed to update service" });
  }
});

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [deleted] = await db.delete(servicesTable).where(eq(servicesTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error("public-services DELETE error", err);
    res.status(500).json({ error: "Failed to delete service" });
  }
});

export default router;
