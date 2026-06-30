import { Router } from "express";
import { db } from "@workspace/db";
import { clientBillingProfilesTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

function num(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? null : n.toFixed(2);
}

function formatProfile(p: typeof clientBillingProfilesTable.$inferSelect) {
  return {
    id: p.id,
    clientId: p.clientId,
    name: p.name,
    repairRate1Tech: p.repairRate1Tech != null ? parseFloat(p.repairRate1Tech) : null,
    repairRate2Tech: p.repairRate2Tech != null ? parseFloat(p.repairRate2Tech) : null,
    driveRate1Tech: p.driveRate1Tech != null ? parseFloat(p.driveRate1Tech) : null,
    driveRate2Tech: p.driveRate2Tech != null ? parseFloat(p.driveRate2Tech) : null,
    mileageRate: p.mileageRate != null ? parseFloat(p.mileageRate) : null,
    partsReimbursable: p.partsReimbursable,
    defaultTechCount: p.defaultTechCount,
    billingNotes: p.billingNotes,
    active: p.active,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  };
}

// GET /client-billing-profiles?clientId=N
router.get("/", async (req, res) => {
  try {
    const { clientId } = req.query;
    const conditions = [];
    if (clientId != null) {
      const cid = parseInt(clientId as string);
      if (isNaN(cid)) return res.status(400).json({ error: "clientId must be a number" });
      conditions.push(eq(clientBillingProfilesTable.clientId, cid));
    }
    const rows = await db
      .select()
      .from(clientBillingProfilesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(clientBillingProfilesTable.active), clientBillingProfilesTable.name);
    res.json(rows.map(formatProfile));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch billing profiles" });
  }
});

// POST /client-billing-profiles
router.post("/", async (req, res) => {
  try {
    const { clientId, name, repairRate1Tech, repairRate2Tech, driveRate1Tech, driveRate2Tech, mileageRate, partsReimbursable, defaultTechCount, billingNotes, active } = req.body;
    if (!clientId || isNaN(parseInt(clientId))) return res.status(400).json({ error: "clientId is required" });
    if (!name || !String(name).trim()) return res.status(400).json({ error: "name is required" });
    const tc = defaultTechCount != null ? parseInt(defaultTechCount) : 2;
    if (![1, 2].includes(tc)) return res.status(400).json({ error: "defaultTechCount must be 1 or 2" });

    const [created] = await db.insert(clientBillingProfilesTable).values({
      clientId: parseInt(clientId),
      name: String(name).trim(),
      repairRate1Tech: num(repairRate1Tech),
      repairRate2Tech: num(repairRate2Tech),
      driveRate1Tech: num(driveRate1Tech),
      driveRate2Tech: num(driveRate2Tech),
      mileageRate: num(mileageRate),
      partsReimbursable: partsReimbursable !== false,
      defaultTechCount: tc,
      billingNotes: billingNotes || null,
      active: active !== false,
    }).returning();
    res.status(201).json(formatProfile(created));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create billing profile" });
  }
});

// PUT /client-billing-profiles/:id
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { name, repairRate1Tech, repairRate2Tech, driveRate1Tech, driveRate2Tech, mileageRate, partsReimbursable, defaultTechCount, billingNotes, active } = req.body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: "name cannot be empty" });
      updates.name = String(name).trim();
    }
    if ("repairRate1Tech" in req.body) updates.repairRate1Tech = num(repairRate1Tech);
    if ("repairRate2Tech" in req.body) updates.repairRate2Tech = num(repairRate2Tech);
    if ("driveRate1Tech" in req.body) updates.driveRate1Tech = num(driveRate1Tech);
    if ("driveRate2Tech" in req.body) updates.driveRate2Tech = num(driveRate2Tech);
    if ("mileageRate" in req.body) updates.mileageRate = num(mileageRate);
    if ("partsReimbursable" in req.body) updates.partsReimbursable = partsReimbursable === true;
    if ("defaultTechCount" in req.body) {
      const tc = parseInt(defaultTechCount);
      if (![1, 2].includes(tc)) return res.status(400).json({ error: "defaultTechCount must be 1 or 2" });
      updates.defaultTechCount = tc;
    }
    if ("billingNotes" in req.body) updates.billingNotes = billingNotes || null;
    if ("active" in req.body) updates.active = active === true;

    const [updated] = await db.update(clientBillingProfilesTable).set(updates).where(eq(clientBillingProfilesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Billing profile not found" });
    res.json(formatProfile(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update billing profile" });
  }
});

// DELETE /client-billing-profiles/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(clientBillingProfilesTable).where(eq(clientBillingProfilesTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete billing profile" });
  }
});

export default router;
