import { Router, type Request } from "express";
import { db } from "@workspace/db";
import { registeredAgentsTable, registeredAgentTasksTable } from "@workspace/db/schema";
import { eq, and, asc } from "drizzle-orm";

const router = Router();

const VALID_RECURRENCES = ["one-time", "monthly", "quarterly", "annual"] as const;

function userId(req: Request): string {
  return (req.user as any)?.id as string;
}

function validateRecurrence(val: unknown): string {
  if (typeof val === "string" && (VALID_RECURRENCES as readonly string[]).includes(val)) {
    return val;
  }
  return "annual";
}

// ── GET or auto-create the single agent record for this user ──────────────────
async function getOrCreateAgentForUser(uid: string) {
  const rows = await db
    .select()
    .from(registeredAgentsTable)
    .where(eq(registeredAgentsTable.userId, uid))
    .limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db
    .insert(registeredAgentsTable)
    .values({ userId: uid })
    .returning();
  return created;
}

// ── GET /api/registered-agent ─────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const uid = userId(req);
    const agent = await getOrCreateAgentForUser(uid);
    const tasks = await db
      .select()
      .from(registeredAgentTasksTable)
      .where(eq(registeredAgentTasksTable.registeredAgentId, agent.id))
      .orderBy(asc(registeredAgentTasksTable.createdAt));
    res.json({ ...agent, tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load registered agent" });
  }
});

// ── PUT /api/registered-agent ─────────────────────────────────────────────────
router.put("/", async (req, res) => {
  try {
    const uid = userId(req);
    const { agentName, companyName, address, phone, email, state, notes } = req.body;

    const existing = await db
      .select()
      .from(registeredAgentsTable)
      .where(eq(registeredAgentsTable.userId, uid))
      .limit(1);

    let agent;
    if (existing.length > 0) {
      const [updated] = await db
        .update(registeredAgentsTable)
        .set({
          agentName:   agentName   ?? null,
          companyName: companyName ?? null,
          address:     address     ?? null,
          phone:       phone       ?? null,
          email:       email       ?? null,
          state:       state       ?? null,
          notes:       notes       ?? null,
          updatedAt:   new Date(),
        })
        .where(eq(registeredAgentsTable.id, existing[0].id))
        .returning();
      agent = updated;
    } else {
      const [created] = await db
        .insert(registeredAgentsTable)
        .values({ userId: uid, agentName, companyName, address, phone, email, state, notes })
        .returning();
      agent = created;
    }

    const tasks = await db
      .select()
      .from(registeredAgentTasksTable)
      .where(eq(registeredAgentTasksTable.registeredAgentId, agent.id))
      .orderBy(asc(registeredAgentTasksTable.createdAt));

    res.json({ ...agent, tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update registered agent" });
  }
});

// ── GET /api/registered-agent/tasks ──────────────────────────────────────────
router.get("/tasks", async (req, res) => {
  try {
    const uid = userId(req);
    const agent = await getOrCreateAgentForUser(uid);
    const tasks = await db
      .select()
      .from(registeredAgentTasksTable)
      .where(eq(registeredAgentTasksTable.registeredAgentId, agent.id))
      .orderBy(asc(registeredAgentTasksTable.createdAt));
    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load tasks" });
  }
});

// ── POST /api/registered-agent/tasks ─────────────────────────────────────────
router.post("/tasks", async (req, res) => {
  try {
    const uid = userId(req);
    const { title, recurrence, notes } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
    const agent = await getOrCreateAgentForUser(uid);
    const [task] = await db
      .insert(registeredAgentTasksTable)
      .values({
        registeredAgentId: agent.id,
        title: title.trim(),
        recurrence: validateRecurrence(recurrence),
        notes: notes ?? null,
      })
      .returning();
    res.status(201).json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// ── PUT /api/registered-agent/tasks/:id ──────────────────────────────────────
router.put("/tasks/:id", async (req, res) => {
  try {
    const uid = userId(req);
    const taskId = parseInt(req.params.id);
    const { title, recurrence, notes } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Title is required" });

    // Verify ownership: task must belong to this user's agent
    const [existingTask] = await db
      .select({ id: registeredAgentTasksTable.id, agentUserId: registeredAgentsTable.userId })
      .from(registeredAgentTasksTable)
      .innerJoin(
        registeredAgentsTable,
        eq(registeredAgentTasksTable.registeredAgentId, registeredAgentsTable.id),
      )
      .where(
        and(
          eq(registeredAgentTasksTable.id, taskId),
          eq(registeredAgentsTable.userId, uid),
        ),
      )
      .limit(1);

    if (!existingTask) return res.status(404).json({ error: "Task not found" });

    const [task] = await db
      .update(registeredAgentTasksTable)
      .set({ title: title.trim(), recurrence: validateRecurrence(recurrence), notes: notes ?? null })
      .where(eq(registeredAgentTasksTable.id, taskId))
      .returning();

    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// ── DELETE /api/registered-agent/tasks/:id ───────────────────────────────────
router.delete("/tasks/:id", async (req, res) => {
  try {
    const uid = userId(req);
    const taskId = parseInt(req.params.id);

    // Verify ownership before deleting
    const [existingTask] = await db
      .select({ id: registeredAgentTasksTable.id })
      .from(registeredAgentTasksTable)
      .innerJoin(
        registeredAgentsTable,
        eq(registeredAgentTasksTable.registeredAgentId, registeredAgentsTable.id),
      )
      .where(
        and(
          eq(registeredAgentTasksTable.id, taskId),
          eq(registeredAgentsTable.userId, uid),
        ),
      )
      .limit(1);

    if (!existingTask) return res.status(404).json({ error: "Task not found" });

    await db
      .delete(registeredAgentTasksTable)
      .where(eq(registeredAgentTasksTable.id, taskId));

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

export default router;
