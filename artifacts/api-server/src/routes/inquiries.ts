import { Router, type IRouter, type Request, type Response } from "express";
import { db, inquiriesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const items = await db
      .select()
      .from(inquiriesTable)
      .orderBy(desc(inquiriesTable.createdAt));
    res.json(items);
  } catch (err) {
    console.error("inquiries GET error", err);
    res.status(500).json({ error: "Failed to load inquiries" });
  }
});

router.patch("/:id/read", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [item] = await db
      .update(inquiriesTable)
      .set({ read: true })
      .where(eq(inquiriesTable.id, id))
      .returning();
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    res.json(item);
  } catch (err) {
    console.error("inquiries PATCH read error", err);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(inquiriesTable).where(eq(inquiriesTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error("inquiries DELETE error", err);
    res.status(500).json({ error: "Failed to delete inquiry" });
  }
});

export default router;
