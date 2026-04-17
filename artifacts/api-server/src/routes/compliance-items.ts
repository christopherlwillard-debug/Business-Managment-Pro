import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { complianceItemsTable, settingsTable, usersTable } from "@workspace/db/schema";
import type { ComplianceDocument } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import { sendEmail, escapeHtml } from "../lib/sendEmail";

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

async function sendComplianceAdvanceEmail(itemTitle: string, newDueDate: string): Promise<void> {
  const [settings] = await db
    .select({
      ownerUserId: settingsTable.ownerUserId,
      companyEmail: settingsTable.companyEmail,
      complianceNotificationEmail: settingsTable.complianceNotificationEmail,
      complianceEmailEnabled: settingsTable.complianceEmailEnabled,
    })
    .from(settingsTable)
    .limit(1);

  if (settings?.complianceEmailEnabled === 0) {
    console.log("Compliance email notifications are disabled; skipping.");
    return;
  }

  let recipientEmail: string | null = null;

  if (settings?.complianceNotificationEmail) {
    recipientEmail = settings.complianceNotificationEmail;
  } else if (settings?.ownerUserId) {
    const [owner] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, settings.ownerUserId))
      .limit(1);
    recipientEmail = owner?.email ?? null;
  }

  if (!recipientEmail) {
    recipientEmail = settings?.companyEmail ?? null;
  }

  if (!recipientEmail) {
    console.warn("No recipient email found for compliance advance notification; skipping.");
    return;
  }

  const [y, m, d] = newDueDate.split("-");
  const formattedDate = new Date(Number(y), Number(m) - 1, Number(d))
    .toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const safeTitle = escapeHtml(itemTitle);
  const subject = `Compliance Reminder: "${itemTitle}" is now due ${formattedDate}`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1a56db;">Compliance Item Auto-Advanced</h2>
  <p>Your recurring compliance item has been marked complete and its next due date has been set.</p>
  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold; width: 40%;">Item</td>
      <td style="padding: 8px 12px; border-left: 1px solid #e5e7eb;">${safeTitle}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f3f4f6; font-weight: bold;">Next Due Date</td>
      <td style="padding: 8px 12px; border-left: 1px solid #e5e7eb;">${formattedDate}</td>
    </tr>
  </table>
  ${process.env.APP_URL ? `<p>
    <a href="${process.env.APP_URL}/compliance" style="display: inline-block; background: #1a56db; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px;">
      View Compliance Center
    </a>
  </p>` : ""}
  <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
    This is an automated notification from your Contractor Management App.
  </p>
</body>
</html>
  `.trim();

  const text = `Compliance Item Auto-Advanced\n\nItem: ${itemTitle}\nNext Due Date: ${formattedDate}\n\nLog in to your Contractor Management App to view the Compliance Center.`;

  await sendEmail({ to: recipientEmail, subject, html, text });
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

    if (status === "complete" && recurrence && recurrence !== "one-time") {
      sendComplianceAdvanceEmail(item.title, resolvedDueDate).catch((err) =>
        console.error("Failed to send compliance advance email:", err)
      );
    }

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
