import { Router } from "express";
import { db } from "@workspace/db";
import { materialsTable, type Material } from "@workspace/db/schema";
import { eq, ilike, and, or, type SQL } from "drizzle-orm";

const router = Router();

function fmt(row: Material) {
  return {
    ...row,
    unitCost: parseFloat(row.unitCost ?? "0"),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const { search, category, includeInactive } = req.query;
    const conditions: SQL<unknown>[] = [];

    if (includeInactive !== "true") {
      conditions.push(eq(materialsTable.isActive, true));
    }
    if (category && typeof category === "string") {
      conditions.push(eq(materialsTable.category, category));
    }
    if (search && typeof search === "string") {
      const term = `%${search}%`;
      conditions.push(
        or(
          ilike(materialsTable.name, term),
          ilike(materialsTable.description, term),
          ilike(materialsTable.category, term)
        ) as SQL<unknown>
      );
    }

    const rows = await db
      .select()
      .from(materialsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(materialsTable.name);

    res.json(rows.map(fmt));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch materials" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, description, unit, unitCost, category, isActive } = req.body as {
      name: string;
      description?: string;
      unit?: string;
      unitCost?: string | number;
      category?: string;
      isActive?: boolean;
    };
    if (!name) return res.status(400).json({ error: "Name is required" });

    const [row] = await db
      .insert(materialsTable)
      .values({
        name,
        description: description || null,
        unit: unit || "ea",
        unitCost: (parseFloat(String(unitCost ?? 0)) || 0).toString(),
        category: category || null,
        isActive: isActive !== false,
      })
      .returning();

    res.status(201).json(fmt(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create material" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid material ID" });
    const [row] = await db
      .select()
      .from(materialsTable)
      .where(eq(materialsTable.id, id));
    if (!row) return res.status(404).json({ error: "Material not found" });
    res.json(fmt(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch material" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid material ID" });
    const { name, description, unit, unitCost, category, isActive } = req.body as {
      name: string;
      description?: string;
      unit?: string;
      unitCost?: string | number;
      category?: string;
      isActive?: boolean;
    };
    if (!name) return res.status(400).json({ error: "Name is required" });

    await db
      .update(materialsTable)
      .set({
        name,
        description: description || null,
        unit: unit || "ea",
        unitCost: (parseFloat(String(unitCost ?? 0)) || 0).toString(),
        category: category || null,
        isActive: isActive !== false,
      })
      .where(eq(materialsTable.id, id));

    const [row] = await db.select().from(materialsTable).where(eq(materialsTable.id, id));
    if (!row) return res.status(404).json({ error: "Material not found" });
    res.json(fmt(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update material" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid material ID" });
    await db.delete(materialsTable).where(eq(materialsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete material" });
  }
});

export default router;
