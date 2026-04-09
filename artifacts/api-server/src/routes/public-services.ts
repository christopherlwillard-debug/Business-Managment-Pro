import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { servicesTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (req: Request, res: Response): Promise<void> => {
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

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, description, icon, priceDisplay, priceNote, whatsIncluded, addOns, sortOrder, active } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (icon !== undefined) updates.icon = icon;
  if (priceDisplay !== undefined) updates.priceDisplay = priceDisplay;
  if (priceNote !== undefined) updates.priceNote = priceNote;
  if (whatsIncluded !== undefined) updates.whatsIncluded = whatsIncluded;
  if (addOns !== undefined) updates.addOns = addOns;
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;
  if (active !== undefined) updates.active = active;
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

export default router;
