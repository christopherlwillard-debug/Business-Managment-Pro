import { Router } from "express";
import { db } from "@workspace/db";
import { registeredAgentsTable, registeredAgentTasksTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────
async function getOrCreateAgent() {
  const rows = await db.select().from(registeredAgentsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(registeredAgentsTable).values({}).returning();
  return created;
}

// ── GET /api/registered-agent ─────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  try {
    const agent = await getOrCreateAgent();
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
    const { agentName, companyName, address, phone, email, state, notes } = req.body;
    const existing = await db.select().from(registeredAgentsTable).limit(1);

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
        .values({ agentName, companyName, address, phone, email, state, notes })
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
router.get("/tasks", async (_req, res) => {
  try {
    const agent = await getOrCreateAgent();
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
    const { title, recurrence, notes } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
    const agent = await getOrCreateAgent();
    const [task] = await db
      .insert(registeredAgentTasksTable)
      .values({
        registeredAgentId: agent.id,
        title: title.trim(),
        recurrence: recurrence ?? "annual",
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
    const id = parseInt(req.params.id);
    const { title, recurrence, notes } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
    const [task] = await db
      .update(registeredAgentTasksTable)
      .set({ title: title.trim(), recurrence, notes: notes ?? null })
      .where(eq(registeredAgentTasksTable.id, id))
      .returning();
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// ── DELETE /api/registered-agent/tasks/:id ───────────────────────────────────
router.delete("/tasks/:id", async (req, res) => {
  try {
    await db
      .delete(registeredAgentTasksTable)
      .where(eq(registeredAgentTasksTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

export default router;
