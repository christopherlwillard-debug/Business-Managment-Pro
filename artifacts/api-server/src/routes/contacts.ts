import { Router } from "express";
import { db } from "@workspace/db";
import { contactsTable } from "@workspace/db/schema";
import { eq, ilike, or, and } from "drizzle-orm";

const router = Router();

function fmt(c: typeof contactsTable.$inferSelect) {
  return {
    ...c,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const { type, q } = req.query as { type?: string; q?: string };
    const conditions = [];
    if (type && type !== "All") conditions.push(eq(contactsTable.type, type));
    if (q?.trim()) {
      const p = `%${q.trim()}%`;
      conditions.push(
        or(
          ilike(contactsTable.name, p),
          ilike(contactsTable.company, p),
          ilike(contactsTable.phone, p),
          ilike(contactsTable.email, p),
          ilike(contactsTable.address, p),
          ilike(contactsTable.city, p),
        )!
      );
    }
    const where = conditions.length === 0 ? undefined
      : conditions.length === 1 ? conditions[0]
      : and(...conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]);
    const rows = await db.select().from(contactsTable)
      .where(where)
      .orderBy(contactsTable.name);
    res.json(rows.map(fmt));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, company, type, title, phone, fax, email, address, city, state, zip, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    const [contact] = await db
      .insert(contactsTable)
      .values({ name: name.trim(), company, type, title, phone, fax, email, address, city, state, zip, notes })
      .returning();
    res.status(201).json(fmt(contact));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create contact" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const { name, company, type, title, phone, fax, email, address, city, state, zip, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    const [contact] = await db
      .update(contactsTable)
      .set({ name: name.trim(), company, type, title, phone, fax, email, address, city, state, zip, notes, updatedAt: new Date() })
      .where(eq(contactsTable.id, id))
      .returning();
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    res.json(fmt(contact));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update contact" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    await db.delete(contactsTable).where(eq(contactsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

export default router;
