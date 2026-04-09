import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { servicesTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

type AddOnItem = { name: string; price: number };

function parseStringArray(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
      return null;
    } catch { return null; }
  }
  return null;
}

function parseAddOns(value: unknown): AddOnItem[] | null {
  if (value === null || value === undefined) return null;
  const arr = Array.isArray(value) ? value : (() => {
    if (typeof value !== "string") return null;
    try { return JSON.parse(value); } catch { return null; }
  })();
  if (!Array.isArray(arr)) return null;
  return arr
    .filter((x): x is Record<string, unknown> => x !== null && typeof x === "object")
    .map(x => ({ name: String(x.name ?? ""), price: parseFloat(String(x.price ?? "0")) || 0 }));
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
  if (body["addOns"] !== undefined) updates["addOns"] = parseAddOns(body["addOns"]);
  if (body["whatsIncluded"] !== undefined) updates["whatsIncluded"] = parseStringArray(body["whatsIncluded"]);
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
    const msg = String((err as { message?: string }).message ?? "");
    if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("slug")) {
      res.status(409).json({ error: "A service with this slug already exists. Use a different name." });
      return;
    }
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
