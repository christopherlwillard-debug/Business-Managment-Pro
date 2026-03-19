import { Router } from "express";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const clients = await db.select().from(clientsTable).orderBy(clientsTable.createdAt);
    res.json(clients.map(c => ({ ...c, createdAt: c.createdAt.toISOString() })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, email, phone, address, city, state, zip, notes } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const [client] = await db.insert(clientsTable).values({ name, email, phone, address, city, state, zip, notes }).returning();
    res.status(201).json({ ...client, createdAt: client.createdAt.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create client" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json({ ...client, createdAt: client.createdAt.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch client" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, email, phone, address, city, state, zip, notes } = req.body;
    const [client] = await db.update(clientsTable).set({ name, email, phone, address, city, state, zip, notes }).where(eq(clientsTable.id, id)).returning();
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json({ ...client, createdAt: client.createdAt.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update client" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(clientsTable).where(eq(clientsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete client" });
  }
});

export default router;
