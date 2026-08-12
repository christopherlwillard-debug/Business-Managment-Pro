/**
 * Dashboard to-do / task list routes.
 *
 * GET    /api/dashboard-tasks       — list all tasks (incomplete first, then recent completed)
 * POST   /api/dashboard-tasks       — create a new task
 * PATCH  /api/dashboard-tasks/:id  — update title, notes, priority, dueDate, completedAt
 * DELETE /api/dashboard-tasks/:id  — delete permanently
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { dashboardTasksTable } from "@workspace/db/schema";
import { eq, isNull, isNotNull, desc, asc, sql } from "drizzle-orm";

const router = Router();

// ── GET / — list all tasks ────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  try {
    // Incomplete tasks: high priority first, then by due date asc (nulls last)
    const incomplete = await db
      .select()
      .from(dashboardTasksTable)
      .where(isNull(dashboardTasksTable.completedAt))
      .orderBy(
        // priority sort: high=0, medium=1, low=2
        sql`CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`,
        asc(dashboardTasksTable.dueDate),
        asc(dashboardTasksTable.createdAt),
      );

    // Completed tasks: most recent 10, ordered newest first
    const completed = await db
      .select()
      .from(dashboardTasksTable)
      .where(isNotNull(dashboardTasksTable.completedAt))
      .orderBy(desc(dashboardTasksTable.completedAt))
      .limit(10);

    res.json({ incomplete, completed });
  } catch (err) {
    console.error("[dashboard-tasks] GET / error:", err);
    res.status(500).json({ error: "Failed to load tasks" });
  }
});

// ── POST / — create a task ────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { title, notes, priority, dueDate, businessId } = req.body as {
    title?:      string;
    notes?:      string;
    priority?:   string;
    dueDate?:    string | null;
    businessId?: number | null;
  };

  if (!title?.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const validPriorities = ["high", "medium", "low"];
  const prio = validPriorities.includes(priority ?? "") ? priority! : "medium";

  try {
    const [task] = await db
      .insert(dashboardTasksTable)
      .values({
        title:      title.trim(),
        notes:      notes?.trim() ?? null,
        priority:   prio,
        dueDate:    dueDate || null,
        businessId: businessId ?? null,
      })
      .returning();

    res.status(201).json(task);
  } catch (err) {
    console.error("[dashboard-tasks] POST / error:", err);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// ── PATCH /:id — update a task ────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task id" }); return; }

  const { title, notes, priority, dueDate, completedAt } = req.body as {
    title?:       string;
    notes?:       string | null;
    priority?:    string;
    dueDate?:     string | null;
    completedAt?: string | null; // ISO string or null
  };

  const validPriorities = ["high", "medium", "low"];

  const updates: Partial<typeof dashboardTasksTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (title !== undefined) updates.title    = title.trim();
  if (notes !== undefined) updates.notes    = notes?.trim() ?? null;
  if (priority !== undefined && validPriorities.includes(priority)) updates.priority = priority;
  if (dueDate !== undefined) updates.dueDate = dueDate || null;
  if (completedAt !== undefined) {
    updates.completedAt = completedAt ? new Date(completedAt) : null;
  }

  try {
    const [task] = await db
      .update(dashboardTasksTable)
      .set(updates)
      .where(eq(dashboardTasksTable.id, id))
      .returning();

    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    res.json(task);
  } catch (err) {
    console.error(`[dashboard-tasks] PATCH /${id} error:`, err);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// ── DELETE /:id — delete a task ───────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task id" }); return; }

  try {
    await db
      .delete(dashboardTasksTable)
      .where(eq(dashboardTasksTable.id, id));

    res.status(204).send();
  } catch (err) {
    console.error(`[dashboard-tasks] DELETE /${id} error:`, err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

export default router;
