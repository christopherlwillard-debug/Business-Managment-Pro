import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import {
  equipmentInventoryTable,
  equipmentSourcesTable,
  equipmentOpportunitiesTable,
} from "@workspace/db/schema";
import { eq, desc, and, isNull, or } from "drizzle-orm";

const router = Router();

// ── Inventory ──────────────────────────────────────────────────────────────────

/** GET /api/equipment/inventory — list all equipment (optionally filtered by businessId) */
router.get("/inventory", async (req: Request, res: Response) => {
  try {
    const businessId = req.query.businessId ? Number(req.query.businessId) : null;

    const rows = await db
      .select()
      .from(equipmentInventoryTable)
      .where(
        businessId
          ? eq(equipmentInventoryTable.businessId, businessId)
          : undefined
      )
      .orderBy(desc(equipmentInventoryTable.createdAt));

    res.json(rows);
  } catch (err) {
    console.error("[equipment] GET /inventory:", err);
    res.status(500).json({ error: "Failed to load equipment inventory" });
  }
});

/** POST /api/equipment/inventory — add an item */
router.post("/inventory", async (req: Request, res: Response) => {
  try {
    const {
      name, category, subcategory, year, make, model, serialNumber,
      condition, status, estimatedValue, purchasePrice, purchaseDate,
      businessId, notes,
    } = req.body as Record<string, unknown>;

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const [row] = await db
      .insert(equipmentInventoryTable)
      .values({
        name:            String(name).trim(),
        category:        typeof category === "string" ? category : "other",
        subcategory:     typeof subcategory === "string" ? subcategory.trim() || null : null,
        year:            typeof year === "number" ? year : (year ? Number(year) : null),
        make:            typeof make === "string" ? make.trim() || null : null,
        model:           typeof model === "string" ? model.trim() || null : null,
        serialNumber:    typeof serialNumber === "string" ? serialNumber.trim() || null : null,
        condition:       typeof condition === "string" ? condition : "good",
        status:          typeof status === "string" ? status : "in_service",
        estimatedValue:  estimatedValue != null ? String(estimatedValue) : null,
        purchasePrice:   purchasePrice != null ? String(purchasePrice) : null,
        purchaseDate:    typeof purchaseDate === "string" ? purchaseDate || null : null,
        businessId:      businessId != null ? Number(businessId) : null,
        notes:           typeof notes === "string" ? notes.trim() || null : null,
      })
      .returning();

    res.status(201).json(row);
  } catch (err) {
    console.error("[equipment] POST /inventory:", err);
    res.status(500).json({ error: "Failed to add equipment item" });
  }
});

/** PATCH /api/equipment/inventory/:id — update an item */
router.patch("/inventory/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id as string);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

    const {
      name, category, subcategory, year, make, model, serialNumber,
      condition, status, estimatedValue, purchasePrice, purchaseDate,
      businessId, notes,
    } = req.body as Record<string, unknown>;

    const [row] = await db
      .update(equipmentInventoryTable)
      .set({
        ...(name != null && { name: String(name).trim() }),
        ...(category != null && { category: String(category) }),
        ...(subcategory !== undefined && { subcategory: typeof subcategory === "string" ? subcategory.trim() || null : null }),
        ...(year !== undefined && { year: year ? Number(year) : null }),
        ...(make !== undefined && { make: typeof make === "string" ? make.trim() || null : null }),
        ...(model !== undefined && { model: typeof model === "string" ? model.trim() || null : null }),
        ...(serialNumber !== undefined && { serialNumber: typeof serialNumber === "string" ? serialNumber.trim() || null : null }),
        ...(condition != null && { condition: String(condition) }),
        ...(status != null && { status: String(status) }),
        ...(estimatedValue !== undefined && { estimatedValue: estimatedValue != null ? String(estimatedValue) : null }),
        ...(purchasePrice !== undefined && { purchasePrice: purchasePrice != null ? String(purchasePrice) : null }),
        ...(purchaseDate !== undefined && { purchaseDate: typeof purchaseDate === "string" ? purchaseDate || null : null }),
        ...(businessId !== undefined && { businessId: businessId != null ? Number(businessId) : null }),
        ...(notes !== undefined && { notes: typeof notes === "string" ? notes.trim() || null : null }),
        updatedAt: new Date(),
      })
      .where(eq(equipmentInventoryTable.id, id))
      .returning();

    if (!row) { res.status(404).json({ error: "Item not found" }); return; }
    res.json(row);
  } catch (err) {
    console.error("[equipment] PATCH /inventory/:id:", err);
    res.status(500).json({ error: "Failed to update equipment item" });
  }
});

/** DELETE /api/equipment/inventory/:id */
router.delete("/inventory/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id as string);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

    await db
      .delete(equipmentInventoryTable)
      .where(eq(equipmentInventoryTable.id, id));

    res.status(204).end();
  } catch (err) {
    console.error("[equipment] DELETE /inventory/:id:", err);
    res.status(500).json({ error: "Failed to delete equipment item" });
  }
});

// ── Sources ────────────────────────────────────────────────────────────────────

/** GET /api/equipment/sources — list the source catalog */
router.get("/sources", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(equipmentSourcesTable)
      .orderBy(
        equipmentSourcesTable.category,
        equipmentSourcesTable.name
      );
    res.json(rows);
  } catch (err) {
    console.error("[equipment] GET /sources:", err);
    res.status(500).json({ error: "Failed to load equipment sources" });
  }
});

// ── Opportunities ──────────────────────────────────────────────────────────────

/** GET /api/equipment/opportunities — list opportunities (empty until sync integrations are built) */
router.get("/opportunities", async (req: Request, res: Response) => {
  try {
    const category = typeof req.query.category === "string" ? req.query.category : null;
    const decision = typeof req.query.decision === "string" ? req.query.decision : null;

    const rows = await db
      .select()
      .from(equipmentOpportunitiesTable)
      .where(
        and(
          category ? eq(equipmentOpportunitiesTable.category, category) : undefined,
          decision ? eq(equipmentOpportunitiesTable.userDecision, decision) : undefined
        )
      )
      .orderBy(desc(equipmentOpportunitiesTable.relevanceScore), desc(equipmentOpportunitiesTable.firstSeenAt));

    res.json(rows);
  } catch (err) {
    console.error("[equipment] GET /opportunities:", err);
    res.status(500).json({ error: "Failed to load equipment opportunities" });
  }
});

/** PATCH /api/equipment/opportunities/:id/decision — BUY | BID_NOW | WATCH | PASS | null (clear) */
router.patch("/opportunities/:id/decision", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id as string);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

    const { decision, businessId, notes } = req.body as {
      decision: string | null;
      businessId?: number | null;
      notes?: string | null;
    };

    const VALID = ["buy", "bid_now", "watch", "pass", null];
    if (!VALID.includes(decision)) {
      res.status(400).json({ error: `decision must be one of: buy, bid_now, watch, pass, null` });
      return;
    }

    const [row] = await db
      .update(equipmentOpportunitiesTable)
      .set({
        userDecision:           decision,
        userDecisionAt:         decision ? new Date() : null,
        userDecisionBusinessId: businessId ?? null,
        ...(notes !== undefined && { userNotes: notes }),
      })
      .where(eq(equipmentOpportunitiesTable.id, id))
      .returning();

    if (!row) { res.status(404).json({ error: "Opportunity not found" }); return; }
    res.json(row);
  } catch (err) {
    console.error("[equipment] PATCH /opportunities/:id/decision:", err);
    res.status(500).json({ error: "Failed to set decision" });
  }
});

export default router;
