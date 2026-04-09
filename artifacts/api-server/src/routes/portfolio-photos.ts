import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { portfolioPhotosTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const photos = await db
      .select()
      .from(portfolioPhotosTable)
      .orderBy(asc(portfolioPhotosTable.sortOrder));
    res.json(photos);
  } catch (err) {
    console.error("portfolio-photos GET error", err);
    res.status(500).json({ error: "Failed to load portfolio photos" });
  }
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { url, caption, category, sortOrder, active } = req.body ?? {};
  if (!url) { res.status(400).json({ error: "url is required" }); return; }
  try {
    const [photo] = await db
      .insert(portfolioPhotosTable)
      .values({ url, caption: caption ?? null, category: category ?? null, sortOrder: sortOrder ?? 0, active: active ?? true })
      .returning();
    res.status(201).json(photo);
  } catch (err) {
    console.error("portfolio-photos POST error", err);
    res.status(500).json({ error: "Failed to create portfolio photo" });
  }
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { caption, category, sortOrder, active } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (caption !== undefined) updates.caption = caption;
  if (category !== undefined) updates.category = category;
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;
  if (active !== undefined) updates.active = active;
  try {
    const [photo] = await db
      .update(portfolioPhotosTable)
      .set(updates)
      .where(eq(portfolioPhotosTable.id, id))
      .returning();
    if (!photo) { res.status(404).json({ error: "Not found" }); return; }
    res.json(photo);
  } catch (err) {
    console.error("portfolio-photos PATCH error", err);
    res.status(500).json({ error: "Failed to update portfolio photo" });
  }
});

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(portfolioPhotosTable).where(eq(portfolioPhotosTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error("portfolio-photos DELETE error", err);
    res.status(500).json({ error: "Failed to delete portfolio photo" });
  }
});

export default router;
