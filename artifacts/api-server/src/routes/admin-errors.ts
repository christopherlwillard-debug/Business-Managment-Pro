import { Router, type IRouter } from "express";
import { db, clientErrorsTable } from "@workspace/db";
import { desc, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  try {
    const errors = await db
      .select()
      .from(clientErrorsTable)
      .orderBy(desc(clientErrorsTable.createdAt))
      .limit(200);

    const grouped = new Map<string, {
      message: string;
      location: string | null;
      stack: string | null;
      componentStack: string | null;
      firstSeen: string;
      lastSeen: string;
      count: number;
      ids: number[];
    }>();

    for (const row of errors) {
      const key = `${row.message}|||${row.location ?? ""}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        existing.ids.push(row.id);
        if (row.createdAt.toISOString() < existing.firstSeen) {
          existing.firstSeen = row.createdAt.toISOString();
        }
        if (row.createdAt.toISOString() > existing.lastSeen) {
          existing.lastSeen = row.createdAt.toISOString();
          existing.stack = row.stack;
          existing.componentStack = row.componentStack;
        }
      } else {
        grouped.set(key, {
          message: row.message,
          location: row.location,
          stack: row.stack,
          componentStack: row.componentStack,
          firstSeen: row.createdAt.toISOString(),
          lastSeen: row.createdAt.toISOString(),
          count: 1,
          ids: [row.id],
        });
      }
    }

    const result = Array.from(grouped.values()).sort((a, b) => b.count - a.count);
    res.json(result);
  } catch (err) {
    console.error("[admin/errors] query failed:", err);
    res.status(500).json({ error: "Failed to load errors" });
  }
});

router.delete("/", async (req, res) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids must be a non-empty array" });
    return;
  }

  try {
    await db.delete(clientErrorsTable).where(inArray(clientErrorsTable.id, ids));
    res.status(204).end();
  } catch (err) {
    console.error("[admin/errors] delete failed:", err);
    res.status(500).json({ error: "Failed to dismiss errors" });
  }
});

export default router;
