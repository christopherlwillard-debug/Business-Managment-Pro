import { Router, type Request, type Response } from "express";
import { db, settingsTable, accessRequestsTable, sessionsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

async function isOwner(userId: string): Promise<boolean> {
  const [settings] = await db.select({ ownerUserId: settingsTable.ownerUserId }).from(settingsTable).limit(1);
  return settings?.ownerUserId === userId;
}

async function requireOwner(req: Request, res: Response, next: Function) {
  const userId = (req as any).user?.id as string;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isOwner(userId))) { res.status(403).json({ error: "Owner access required" }); return; }
  next();
}

router.use(requireOwner as any);

router.get("/requests", async (_req: Request, res: Response) => {
  try {
    const requests = await db
      .select()
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.status, "pending"))
      .orderBy(accessRequestsTable.requestedAt);
    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

router.post("/requests/:id/approve", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { permissions } = req.body;
    if (!permissions) { res.status(400).json({ error: "permissions required" }); return; }

    const [updated] = await db
      .update(accessRequestsTable)
      .set({ status: "approved", permissions, resolvedAt: new Date() })
      .where(eq(accessRequestsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Request not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to approve request" });
  }
});

router.post("/requests/:id/reject", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db
      .update(accessRequestsTable)
      .set({ status: "rejected", resolvedAt: new Date() })
      .where(eq(accessRequestsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Request not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reject request" });
  }
});

router.get("/members", async (_req: Request, res: Response) => {
  try {
    const members = await db
      .select()
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.status, "approved"))
      .orderBy(accessRequestsTable.resolvedAt);
    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch members" });
  }
});

router.put("/members/:userId/permissions", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;
    if (!permissions) { res.status(400).json({ error: "permissions required" }); return; }

    const [updated] = await db
      .update(accessRequestsTable)
      .set({ permissions })
      .where(and(eq(accessRequestsTable.userId, userId), eq(accessRequestsTable.status, "approved")))
      .returning();
    if (!updated) { res.status(404).json({ error: "Member not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update permissions" });
  }
});

router.delete("/members/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const [settings] = await db.select({ ownerUserId: settingsTable.ownerUserId }).from(settingsTable).limit(1);
    if (settings?.ownerUserId === userId) {
      res.status(400).json({ error: "Cannot remove the owner" });
      return;
    }

    await db.delete(accessRequestsTable).where(eq(accessRequestsTable.userId, userId));

    const allSessions = await db.select({ sid: sessionsTable.sid, sess: sessionsTable.sess }).from(sessionsTable);
    for (const s of allSessions) {
      const sess = s.sess as any;
      if (sess?.user?.id === userId) {
        await db.delete(sessionsTable).where(eq(sessionsTable.sid, s.sid));
      }
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove member" });
  }
});

export default router;
