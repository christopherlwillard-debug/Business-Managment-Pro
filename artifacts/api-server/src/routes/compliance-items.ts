import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { complianceItemsTable } from "@workspace/db/schema";
import type { ComplianceDocument } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorage = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function toServingUrl(objectPath: string): string {
  if (objectPath.startsWith("/objects/")) return `/api/storage/objects/${objectPath.slice("/objects/".length)}`;
  return objectPath;
}

function format(item: any) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(item.dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  let computedStatus = item.status;
  if (item.status !== "complete") {
    if (diffDays < 0) computedStatus = "overdue";
    else if (diffDays <= 30) computedStatus = "due-soon";
    else computedStatus = "upcoming";
  }

  const docs: ComplianceDocument[] = Array.isArray(item.documents) ? item.documents : [];
  return {
    ...item,
    computedStatus,
    daysUntilDue: diffDays,
    enabled: item.enabled ?? true,
    documents: docs.map(d => ({
      ...d,
      servingUrl: toServingUrl(d.objectPath),
    })),
  };
}

router.get("/", async (_req, res) => {
  try {
    const items = await db
      .select()
      .from(complianceItemsTable)
      .orderBy(asc(complianceItemsTable.dueDate));
    res.json(items.map(format));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch compliance items" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, category, jurisdiction, dueDate, recurrence, notes } = req.body;
    if (!title?.trim() || !dueDate) {
      return res.status(400).json({ error: "Title and due date are required" });
    }
    const [item] = await db
      .insert(complianceItemsTable)
      .values({
        title: title.trim(),
        category: category || "Other",
        jurisdiction: jurisdiction || null,
        dueDate,
        recurrence: recurrence || "one-time",
        status: "upcoming",
        notes: notes || null,
        enabled: true,
        documents: [],
      })
      .returning();
    res.status(201).json(format(item));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create compliance item" });
  }
});

function advanceDueDate(dueDate: string, recurrence: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  let date = new Date(y, m - 1, d);
  switch (recurrence) {
    case "monthly":
      date.setMonth(date.getMonth() + 1);
      break;
    case "quarterly":
      date.setMonth(date.getMonth() + 3);
      break;
    case "annual":
      date.setFullYear(date.getFullYear() + 1);
      break;
    case "every_5_years":
      date.setFullYear(date.getFullYear() + 5);
      break;
  }
  const ny = date.getFullYear();
  const nm = String(date.getMonth() + 1).padStart(2, "0");
  const nd = String(date.getDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, category, jurisdiction, dueDate, recurrence, status, notes, enabled } = req.body;

    let resolvedDueDate = dueDate;
    let resolvedStatus = status;

    if (status === "complete" && recurrence && recurrence !== "one-time") {
      if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        return res.status(400).json({ error: "A valid due date (YYYY-MM-DD) is required to advance a recurring item" });
      }
      resolvedDueDate = advanceDueDate(dueDate, recurrence);
      resolvedStatus = "upcoming";
    }

    const updateData: Record<string, any> = {
      title, category,
      jurisdiction: jurisdiction || null,
      dueDate: resolvedDueDate, recurrence, status: resolvedStatus,
      notes: notes || null,
    };
    if (enabled !== undefined) updateData.enabled = enabled;
    const [item] = await db
      .update(complianceItemsTable)
      .set(updateData)
      .where(eq(complianceItemsTable.id, id))
      .returning();
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(format(item));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update compliance item" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [item] = await db.select().from(complianceItemsTable).where(eq(complianceItemsTable.id, id));
    if (item && Array.isArray(item.documents)) {
      for (const doc of item.documents as ComplianceDocument[]) {
        try { await objectStorage.deleteObject(doc.objectPath); } catch {}
      }
    }
    await db.delete(complianceItemsTable).where(eq(complianceItemsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete" });
  }
});

router.post("/:id/documents", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  try {
    const id = parseInt(req.params.id);
    const [item] = await db.select().from(complianceItemsTable).where(eq(complianceItemsTable.id, id));
    if (!item) { res.status(404).json({ error: "Not found" }); return; }

    const objectPath = await objectStorage.uploadBufferWithFilename(
      req.file.buffer,
      req.file.mimetype,
      `compliance-items/${id}`,
      req.file.originalname,
    );

    const existing: ComplianceDocument[] = Array.isArray(item.documents) ? (item.documents as ComplianceDocument[]) : [];
    const newDoc: ComplianceDocument = {
      objectPath,
      fileName: req.file.originalname,
      uploadedAt: new Date().toISOString(),
    };
    const updated = [...existing, newDoc];

    const [updatedItem] = await db
      .update(complianceItemsTable)
      .set({ documents: updated })
      .where(eq(complianceItemsTable.id, id))
      .returning();

    res.json(format(updatedItem));
  } catch (err) {
    console.error("Document upload failed:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

router.delete("/:id/documents/:docIndex", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const docIndex = parseInt(req.params.docIndex);
    const [item] = await db.select().from(complianceItemsTable).where(eq(complianceItemsTable.id, id));
    if (!item) return res.status(404).json({ error: "Not found" });

    const docs: ComplianceDocument[] = Array.isArray(item.documents) ? (item.documents as ComplianceDocument[]) : [];
    if (docIndex < 0 || docIndex >= docs.length) return res.status(404).json({ error: "Document index out of range" });

    const [removed] = docs.splice(docIndex, 1);
    try { await objectStorage.deleteObject(removed.objectPath); } catch {}

    const [updatedItem] = await db
      .update(complianceItemsTable)
      .set({ documents: docs })
      .where(eq(complianceItemsTable.id, id))
      .returning();

    res.json(format(updatedItem));
  } catch (err) {
    console.error("Document delete failed:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;
