import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { featuredClientsTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const clients = await db
      .select()
      .from(featuredClientsTable)
      .orderBy(asc(featuredClientsTable.sortOrder), asc(featuredClientsTable.createdAt));
    res.json(clients);
  } catch (err) {
    console.error("featured-clients GET error", err);
    res.status(500).json({ error: "Failed to load featured clients" });
  }
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { name, logoUrl, websiteUrl, sortOrder } = req.body ?? {};
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  try {
    const [client] = await db
      .insert(featuredClientsTable)
      .values({
        name,
        logoUrl: logoUrl ?? null,
        websiteUrl: websiteUrl ?? null,
        sortOrder: sortOrder ?? 0,
        active: true,
      })
      .returning();
    res.status(201).json(client);
  } catch (err) {
    console.error("featured-clients POST error", err);
    res.status(500).json({ error: "Failed to create featured client" });
  }
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, logoUrl, websiteUrl, sortOrder, active } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (logoUrl !== undefined) updates.logoUrl = logoUrl;
  if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl;
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;
  if (active !== undefined) updates.active = active;
  try {
    const [client] = await db
      .update(featuredClientsTable)
      .set(updates)
      .where(eq(featuredClientsTable.id, id))
      .returning();
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
    res.json(client);
  } catch (err) {
    console.error("featured-clients PATCH error", err);
    res.status(500).json({ error: "Failed to update featured client" });
  }
});

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(featuredClientsTable).where(eq(featuredClientsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error("featured-clients DELETE error", err);
    res.status(500).json({ error: "Failed to delete featured client" });
  }
});

export default router;
