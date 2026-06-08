import { Router, type IRouter } from "express";
import { db, clientErrorsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

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
    }>();

    for (const row of errors) {
      const key = `${row.message}|||${row.location ?? ""}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
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

export default router;
