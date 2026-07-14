import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { kyFilingSettingsTable } from "@workspace/db/schema";
import type { ComplianceDocument } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorage = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const ALL_FILING_IDS = [
  "ky-annual-report",
  "ky-llet-725",
  "federal-1040",
  "est-q1",
  "est-q2",
  "est-q3",
  "est-q4",
  "owensboro-occ-license",
  "ky-sales-use-tax",
  "boi-report",
  "personal-property-tax",
];

const DEFAULT_DISABLED = new Set(["boi-report"]);

function toServingUrl(objectPath: string): string {
  if (objectPath.startsWith("/objects/")) return `/api/storage/objects/${objectPath.slice("/objects/".length)}`;
  return objectPath;
}

function formatSetting(row: any) {
  const docs: ComplianceDocument[] = Array.isArray(row.documents) ? row.documents : [];
  return {
    ...row,
    documents: docs.map(d => ({ ...d, servingUrl: toServingUrl(d.objectPath) })),
  };
}

router.get("/", async (_req, res) => {
  try {
    const existing = await db.select().from(kyFilingSettingsTable);
    const existingMap = new Map(existing.map(r => [r.filingId, r]));

    const toInsert = ALL_FILING_IDS.filter(id => !existingMap.has(id)).map(id => ({
      filingId: id,
      enabled: !DEFAULT_DISABLED.has(id),
      documents: [] as ComplianceDocument[],
    }));

    if (toInsert.length > 0) {
      await db.insert(kyFilingSettingsTable).values(toInsert).onConflictDoNothing();
    }

    const all = await db.select().from(kyFilingSettingsTable);
    res.json(all.map(formatSetting));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch KY filing settings" });
  }
});

router.put("/:filingId", async (req, res) => {
  try {
    const filingId = req.params.filingId as string;
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled (boolean) is required" });

    const [existing] = await db.select().from(kyFilingSettingsTable).where(eq(kyFilingSettingsTable.filingId, filingId));
    if (!existing) {
      const [inserted] = await db
        .insert(kyFilingSettingsTable)
        .values({ filingId, enabled, documents: [] })
        .returning();
      return res.json(formatSetting(inserted));
    }

    const [updated] = await db
      .update(kyFilingSettingsTable)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(kyFilingSettingsTable.filingId, filingId))
      .returning();

    res.json(formatSetting(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update KY filing setting" });
  }
});

router.post("/:filingId/documents", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  try {
    const filingId = req.params.filingId as string;

    const [existing] = await db.select().from(kyFilingSettingsTable).where(eq(kyFilingSettingsTable.filingId, filingId));
    const currentDocs: ComplianceDocument[] = existing && Array.isArray(existing.documents) ? (existing.documents as ComplianceDocument[]) : [];

    const objectPath = await objectStorage.uploadBufferWithFilename(
      req.file.buffer,
      req.file.mimetype,
      `ky-filings/${filingId}`,
      req.file.originalname as string,
    );

    const newDoc: ComplianceDocument = {
      objectPath,
      fileName: req.file.originalname as string,
      uploadedAt: new Date().toISOString(),
    };
    const updated = [...currentDocs, newDoc];

    if (!existing) {
      const [inserted] = await db
        .insert(kyFilingSettingsTable)
        .values({ filingId, enabled: !DEFAULT_DISABLED.has(filingId), documents: updated })
        .returning();
      res.json(formatSetting(inserted));
      return;
    }

    const [updatedRow] = await db
      .update(kyFilingSettingsTable)
      .set({ documents: updated, updatedAt: new Date() })
      .where(eq(kyFilingSettingsTable.filingId, filingId))
      .returning();

    res.json(formatSetting(updatedRow));
  } catch (err) {
    console.error("KY filing document upload failed:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

router.delete("/:filingId/documents/:docIndex", async (req, res) => {
  try {
    const filingId = req.params.filingId as string;
    const docIndex = parseInt(req.params.docIndex);

    const [existing] = await db.select().from(kyFilingSettingsTable).where(eq(kyFilingSettingsTable.filingId, filingId));
    if (!existing) return res.status(404).json({ error: "Filing not found" });

    const docs: ComplianceDocument[] = Array.isArray(existing.documents) ? (existing.documents as ComplianceDocument[]) : [];
    if (docIndex < 0 || docIndex >= docs.length) return res.status(404).json({ error: "Document index out of range" });

    const [removed] = docs.splice(docIndex, 1);
    try { await objectStorage.deleteObject(removed.objectPath); } catch {}

    const [updatedRow] = await db
      .update(kyFilingSettingsTable)
      .set({ documents: docs, updatedAt: new Date() })
      .where(eq(kyFilingSettingsTable.filingId, filingId))
      .returning();

    res.json(formatSetting(updatedRow));
  } catch (err) {
    console.error("KY filing document delete failed:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;
