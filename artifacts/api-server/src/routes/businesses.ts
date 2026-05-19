import { Router } from "express";
import { db } from "@workspace/db";
import { businessesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import multer from "multer";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorage = new ObjectStorageService();

// Allowed business type values — validated at route level
export const BUSINESS_TYPES = [
  "general_contracting",
  "asphalt_sealing",
  "real_estate",
  "landscaping",
  "electrical",
  "plumbing",
  "hvac",
  "painting",
  "roofing",
  "other",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

function isValidBusinessType(t: unknown): t is BusinessType {
  return typeof t === "string" && (BUSINESS_TYPES as readonly string[]).includes(t);
}

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

function toServingUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("/objects/")) return `/api/storage/objects/${raw.slice("/objects/".length)}`;
  if (raw.startsWith("/uploads/")) return `/api${raw}`;
  return raw;
}

const router = Router();

router.get("/", async (req, res) => {
  try {
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
    const resolvedType = type || "other";
    if (!isValidBusinessType(resolvedType)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${BUSINESS_TYPES.join(", ")}` });
    }
    const [business] = await db.insert(businessesTable).values({
      name, slug, type: resolvedType, logoUrl, address, city, state, zip, phone, email, licenseNumber, taxId,
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
    if (type !== undefined) {
      if (!isValidBusinessType(type)) {
        return res.status(400).json({ error: `Invalid type. Must be one of: ${BUSINESS_TYPES.join(", ")}` });
      }
      updates.type = type;
    }
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

router.post("/:id/logo", logoUpload.single("logo"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const objectPath = await objectStorage.uploadBufferWithFilename(
      req.file.buffer,
      req.file.mimetype,
      "uploads/logos",
      req.file.originalname
    );
    const servingUrl = toServingUrl(objectPath)!;
    const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, id)).limit(1);
    if (!biz) return res.status(404).json({ error: "Business not found" });
    if (biz.logoUrl && biz.logoUrl.startsWith("/objects/")) {
      try { await objectStorage.deleteObject(biz.logoUrl); } catch { /* ignore */ }
    }
    await db.update(businessesTable).set({ logoUrl: objectPath }).where(eq(businessesTable.id, id));
    res.json({ logoUrl: servingUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload logo" });
  }
});

router.delete("/:id/logo", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, id)).limit(1);
    if (!biz) return res.status(404).json({ error: "Business not found" });
    if (biz.logoUrl && biz.logoUrl.startsWith("/objects/")) {
      try { await objectStorage.deleteObject(biz.logoUrl); } catch { /* ignore */ }
    }
    await db.update(businessesTable).set({ logoUrl: null }).where(eq(businessesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete logo" });
  }
});

export default router;
