import { Router } from "express";
import { db } from "@workspace/db";
import { assetsTable, assetBusinessUseTable } from "@workspace/db/schema";
import { eq, and, like, inArray } from "drizzle-orm";
import multer from "multer";
import sharp from "sharp";
import { ObjectStorageService } from "../lib/objectStorage";
import { sendEmail } from "../lib/sendEmail";
import { requestedBusiness, hasRequestedBusiness, invalidBusinessScope, resolveMutationBusiness, belongsToBusiness, mutationBusinessPredicate } from "../lib/business-scope.js";

const router = Router();
const objectStorage = new ObjectStorageService();

router.param("id", (req, res, next, rawId) => {
  void (async () => {
    const id = Number(rawId);
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    if (!scope) return next();
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
    if (!asset || !belongsToBusiness(asset, scope)) return res.status(404).json({ error: "Asset not found" });
    res.locals.businessScopedAsset = asset;
    next();
  })().catch(next);
});

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
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    const conditions: any[] = [];
    if (status) conditions.push(eq(assetsTable.status, status as string));
    if (year) conditions.push(like(assetsTable.purchaseDate, `${year}-%`));
    if (scope) conditions.push(eq(assetsTable.businessId, scope.id));

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
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const scope = ownership.business;

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
       businessId: scope.id,
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
    const id = parseInt(req.params.id as string);
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    const [asset] = await db.select().from(assetsTable).where(and(eq(assetsTable.id, id), ...(scope ? [eq(assetsTable.businessId, scope.id)] : [])));
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
    const id = parseInt(req.params.id as string);
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const scope = ownership.business;
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
      businessId: scope.id,
    }).where(and(eq(assetsTable.id, id), mutationBusinessPredicate(assetsTable, scope))).returning();

    if (!updated) return res.status(404).json({ error: "Asset not found" });
    res.json(formatAsset(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update asset" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    await db.delete(assetsTable).where(and(
      eq(assetsTable.id, parseInt(req.params.id)),
      mutationBusinessPredicate(assetsTable, ownership.business),
    ));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete asset" });
  }
});

router.get("/:id/business-use", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid asset ID" });
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    const [asset] = await db.select().from(assetsTable)
      .where(and(eq(assetsTable.id, id), ...(scope ? [eq(assetsTable.businessId, scope.id)] : [])));
    if (!asset) return res.status(404).json({ error: "Asset not found" });
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
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const scope = ownership.business;
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
    const [asset] = await db.select({ id: assetsTable.id }).from(assetsTable)
      .where(and(eq(assetsTable.id, assetId), ...(scope ? [eq(assetsTable.businessId, scope.id)] : [])));
    if (!asset) return res.status(404).json({ error: "Asset not found" });
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
    const assetId = Number(req.params.id);
    const year = Number(req.params.year);
    if (!Number.isSafeInteger(assetId) || assetId <= 0 || !Number.isInteger(year) || year < 1900 || year > 2200) {
      return res.status(400).json({ error: "Invalid asset ID or year" });
    }
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    const [asset] = await db.select({ id: assetsTable.id }).from(assetsTable)
      .where(and(eq(assetsTable.id, assetId), ...(scope ? [eq(assetsTable.businessId, scope.id)] : [])));
    if (!asset) return res.status(404).json({ error: "Asset not found" });
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
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid asset ID" });
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
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

    const [updated] = await db.update(assetsTable).set({ receiptUrl: objectPath })
      .where(and(eq(assetsTable.id, id), ...(scope ? [eq(assetsTable.businessId, scope.id)] : []))).returning();
    if (!updated) return res.status(404).json({ error: "Asset not found" });

    res.json(formatAsset(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload receipt" });
  }
});

router.post("/email-pdf", async (req, res) => {
  try {
    const { to, pdfBase64, filename } = req.body as {
      to?: string;
      pdfBase64?: string;
      filename?: string;
    };

    if (!to || typeof to !== "string" || !to.trim()) {
      return res.status(400).json({ error: "Recipient email address is required" });
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(to.trim())) {
      return res.status(400).json({ error: "Invalid recipient email address" });
    }
    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return res.status(400).json({ error: "PDF data is required" });
    }
    const maxBase64Mb = 20;
    if (pdfBase64.length > maxBase64Mb * 1024 * 1024 * (4 / 3)) {
      return res.status(400).json({ error: "PDF exceeds maximum allowed size" });
    }

    const safeFilename = (filename ?? "asset-depreciation-schedule.pdf").replace(/[^a-zA-Z0-9._\- ]/g, "_");
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    const htmlBody = `
<p>Hello,</p>
<p>Please find attached the <strong>Asset Depreciation Schedule</strong> generated on ${today}.</p>
<p>This report contains depreciation schedules for all tracked equipment and assets. Please review with your tax professional before filing.</p>
<p>This email was sent automatically from your Contractor Management App.</p>
`;

    await sendEmail({
      to: to.trim(),
      subject: `Asset Depreciation Schedule — ${today}`,
      html: htmlBody,
      attachment: {
        filename: safeFilename,
        mimeType: "application/pdf",
        base64Data: pdfBase64,
      },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to email asset PDF:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send email" });
  }
});

export default router;
