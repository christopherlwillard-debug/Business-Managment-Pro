import { Router } from "express";
import { db } from "@workspace/db";
import { businessesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

async function ensureDefaults() {
  const existing = await db.select({ id: businessesTable.id }).from(businessesTable).limit(1);
  if (existing.length === 0) {
    await db.insert(businessesTable).values([
      { name: "General Contracting", slug: "general_contracting", type: "general_contracting" },
      { name: "Asphalt Sealing", slug: "asphalt_sealing", type: "asphalt_sealing" },
    ]);
  }
}

router.get("/", async (req, res) => {
  try {
    await ensureDefaults();
    const businesses = await db.select().from(businessesTable).orderBy(businessesTable.id);
    res.json(businesses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch businesses" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, slug, type, logoUrl, address, city, state, zip, phone, email, licenseNumber, taxId } = req.body;
    if (!name || !slug) return res.status(400).json({ error: "name and slug are required" });
    const [business] = await db.insert(businessesTable).values({
      name, slug, type: type || "other", logoUrl, address, city, state, zip, phone, email, licenseNumber, taxId,
    }).returning();
    res.status(201).json(business);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create business" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, slug, type, logoUrl, address, city, state, zip, phone, email, licenseNumber, taxId } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (slug !== undefined) updates.slug = slug;
    if (type !== undefined) updates.type = type;
    if (logoUrl !== undefined) updates.logoUrl = logoUrl;
    if (address !== undefined) updates.address = address;
    if (city !== undefined) updates.city = city;
    if (state !== undefined) updates.state = state;
    if (zip !== undefined) updates.zip = zip;
    if (phone !== undefined) updates.phone = phone;
    if (email !== undefined) updates.email = email;
    if (licenseNumber !== undefined) updates.licenseNumber = licenseNumber;
    if (taxId !== undefined) updates.taxId = taxId;
    const [updated] = await db.update(businessesTable).set(updates).where(eq(businessesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Business not found" });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update business" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(businessesTable).where(eq(businessesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete business" });
  }
});

export default router;
