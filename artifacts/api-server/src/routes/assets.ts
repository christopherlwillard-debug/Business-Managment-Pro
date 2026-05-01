import { Router } from "express";
import { db } from "@workspace/db";
import { assetsTable, assetBusinessUseTable } from "@workspace/db/schema";
import { eq, and, like, inArray } from "drizzle-orm";
import multer from "multer";
import sharp from "sharp";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorage = new ObjectStorageService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function toServingUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("/objects/")) return `/api/storage/objects/${raw.slice("/objects/".length)}`;
  if (raw.startsWith("/uploads/")) return `/api${raw}`;
  return raw;
}

function formatAsset(a: typeof assetsTable.$inferSelect) {
  return {
    ...a,
    purchasePrice: parseFloat(a.purchasePrice ?? "0"),
    salePrice: a.salePrice != null ? parseFloat(a.salePrice) : null,
    salvageValue: a.salvageValue != null ? parseFloat(a.salvageValue) : 0,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    receiptUrl: toServingUrl(a.receiptUrl),
  };
}

router.get("/", async (req, res) => {
  try {
    const { status, year } = req.query;
    const conditions: ReturnType<typeof eq>[] = [];
    if (status) conditions.push(eq(assetsTable.status, status as string));
    if (year) conditions.push(like(assetsTable.purchaseDate, `${year}-%`));

    let query = db.select().from(assetsTable);
    const rows = await (conditions.length > 0
      ? query.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : query
    ).orderBy(assetsTable.purchaseDate);

    const busUseRows = rows.length > 0
      ? await db.select().from(assetBusinessUseTable)
          .where(inArray(assetBusinessUseTable.assetId, rows.map(r => r.id)))
          .orderBy(assetBusinessUseTable.year)
      : [];
    const busUseMap = new Map<number, { year: number; businessUsePct: number }[]>();
    for (const r of busUseRows) {
      if (!busUseMap.has(r.assetId)) busUseMap.set(r.assetId, []);
      busUseMap.get(r.assetId)!.push({ year: r.year, businessUsePct: r.businessUsePct });
    }

    res.json(rows.map(a => ({ ...formatAsset(a), businessUseRows: busUseMap.get(a.id) ?? [] })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch assets" });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      name, assetType, purchaseDate, purchasePrice, vendor, serialNumber,
      notes, receiptUrl, section179Eligible, status, saleDate, salePrice,
      usefulLifeYears, salvageValue, depreciationMethod, bonusDepreciationPct,
    } = req.body;

    if (!name || !purchaseDate || purchasePrice == null) {
      return res.status(400).json({ error: "name, purchaseDate, and purchasePrice are required" });
    }

    const [asset] = await db.insert(assetsTable).values({
      name,
      assetType: assetType ?? "Other",
      purchaseDate,
      purchasePrice: purchasePrice.toString(),
      vendor: vendor ?? null,
      serialNumber: serialNumber ?? null,
      notes: notes ?? null,
      receiptUrl: receiptUrl ?? null,
      section179Eligible: section179Eligible === true,
      status: status ?? "active",
      saleDate: saleDate ?? null,
      salePrice: salePrice != null ? salePrice.toString() : null,
      usefulLifeYears: usefulLifeYears != null ? parseInt(usefulLifeYears) : null,
      salvageValue: salvageValue != null ? salvageValue.toString() : "0",
      depreciationMethod: depreciationMethod ?? "straight-line",
      bonusDepreciationPct: bonusDepreciationPct != null ? parseInt(bonusDepreciationPct) : 60,
    }).returning();

    res.status(201).json(formatAsset(asset));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create asset" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
    if (!asset) return res.status(404).json({ error: "Asset not found" });
    const busUseRows = await db.select().from(assetBusinessUseTable)
      .where(eq(assetBusinessUseTable.assetId, id))
      .orderBy(assetBusinessUseTable.year);
    res.json({
      ...formatAsset(asset),
      businessUseRows: busUseRows.map(r => ({ year: r.year, businessUsePct: r.businessUsePct })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch asset" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      name, assetType, purchaseDate, purchasePrice, vendor, serialNumber,
      notes, receiptUrl, section179Eligible, status, saleDate, salePrice,
      usefulLifeYears, salvageValue, depreciationMethod, bonusDepreciationPct,
    } = req.body;

    const [updated] = await db.update(assetsTable).set({
      ...(name !== undefined && { name }),
      ...(assetType !== undefined && { assetType }),
      ...(purchaseDate !== undefined && { purchaseDate }),
      ...(purchasePrice !== undefined && { purchasePrice: purchasePrice.toString() }),
      ...(vendor !== undefined && { vendor }),
      ...(serialNumber !== undefined && { serialNumber }),
      ...(notes !== undefined && { notes }),
      ...(receiptUrl !== undefined && { receiptUrl }),
      ...(section179Eligible !== undefined && { section179Eligible: section179Eligible === true }),
      ...(status !== undefined && { status }),
      ...(saleDate !== undefined && { saleDate }),
      ...(salePrice !== undefined && { salePrice: salePrice != null ? salePrice.toString() : null }),
      ...(usefulLifeYears !== undefined && { usefulLifeYears: usefulLifeYears != null ? parseInt(usefulLifeYears) : null }),
      ...(salvageValue !== undefined && { salvageValue: salvageValue != null ? salvageValue.toString() : "0" }),
      ...(depreciationMethod !== undefined && { depreciationMethod }),
      ...(bonusDepreciationPct !== undefined && { bonusDepreciationPct: bonusDepreciationPct != null ? parseInt(bonusDepreciationPct) : 60 }),
    }).where(eq(assetsTable.id, id)).returning();

    if (!updated) return res.status(404).json({ error: "Asset not found" });
    res.json(formatAsset(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update asset" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(assetsTable).where(eq(assetsTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete asset" });
  }
});

router.get("/:id/business-use", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db.select().from(assetBusinessUseTable)
      .where(eq(assetBusinessUseTable.assetId, id))
      .orderBy(assetBusinessUseTable.year);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch business-use rows" });
  }
});

router.put("/:id/business-use", async (req, res) => {
  try {
    const assetId = parseInt(req.params.id);
    if (isNaN(assetId)) return res.status(400).json({ error: "Invalid asset id" });
    const { year, businessUsePct } = req.body;
    const yearInt = parseInt(year);
    const pctInt = parseInt(businessUsePct);
    if (!year || businessUsePct == null || isNaN(yearInt) || isNaN(pctInt)) {
      return res.status(400).json({ error: "year and businessUsePct are required and must be numbers" });
    }
    if (pctInt < 1 || pctInt > 100) {
      return res.status(400).json({ error: "businessUsePct must be between 1 and 100" });
    }
    if (yearInt < 1900 || yearInt > 2100) {
      return res.status(400).json({ error: "year must be a valid calendar year" });
    }
    const [row] = await db.insert(assetBusinessUseTable)
      .values({ assetId, year: yearInt, businessUsePct: pctInt })
      .onConflictDoUpdate({
        target: [assetBusinessUseTable.assetId, assetBusinessUseTable.year],
        set: { businessUsePct: pctInt },
      })
      .returning();
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upsert business-use row" });
  }
});

router.delete("/:id/business-use/:year", async (req, res) => {
  try {
    const assetId = parseInt(req.params.id);
    const year = parseInt(req.params.year);
    await db.delete(assetBusinessUseTable)
      .where(and(eq(assetBusinessUseTable.assetId, assetId), eq(assetBusinessUseTable.year, year)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete business-use row" });
  }
});

router.post("/:id/receipt", upload.single("receipt"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    let fileBuffer = req.file.buffer;
    let fileMimetype = req.file.mimetype;
    let originalFilename = req.file.originalname;

    const isHeic =
      fileMimetype === "image/heic" ||
      fileMimetype === "image/heif" ||
      /\.(heic|heif)$/i.test(originalFilename);

    if (isHeic) {
      fileBuffer = await sharp(fileBuffer).jpeg({ quality: 90 }).toBuffer();
      fileMimetype = "image/jpeg";
      originalFilename = originalFilename.replace(/\.[^.]+$/, "") + ".jpg";
    }

    const objectPath = await objectStorage.uploadBufferWithFilename(
      fileBuffer,
      fileMimetype,
      "uploads/asset-receipts",
      originalFilename
    );

    const [updated] = await db.update(assetsTable).set({ receiptUrl: objectPath }).where(eq(assetsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Asset not found" });

    res.json(formatAsset(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload receipt" });
  }
});

export default router;
