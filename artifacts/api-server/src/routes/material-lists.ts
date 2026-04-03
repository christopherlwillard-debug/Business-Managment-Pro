import { Router } from "express";
import { db } from "@workspace/db";
import {
  materialListsTable,
  materialListItemsTable,
  jobsTable,
  invoicesTable,
  settingsTable,
} from "@workspace/db/schema";
import { eq, and, inArray, desc, SQL } from "drizzle-orm";

const router = Router();

interface ItemInput {
  materialId?: number | null;
  nameSnapshot: string;
  unitSnapshot?: string;
  unitCostSnapshot: number;
  qty: number;
}

interface LineItem {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface InvoiceAttachment {
  name: string;
  url: string;
  size?: number | null;
}

function fmtItem(row: typeof materialListItemsTable.$inferSelect) {
  return {
    ...row,
    unitCostSnapshot: parseFloat(row.unitCostSnapshot ?? "0"),
    qty: parseFloat(row.qty ?? "1"),
  };
}

async function getListWithItems(id: number, userId?: string) {
  const conditions: SQL[] = [eq(materialListsTable.id, id)];
  if (userId) conditions.push(eq(materialListsTable.userId, userId));

  const [list] = await db
    .select({
      id: materialListsTable.id,
      name: materialListsTable.name,
      jobId: materialListsTable.jobId,
      jobTitle: jobsTable.title,
      markup: materialListsTable.markup,
      createdAt: materialListsTable.createdAt,
    })
    .from(materialListsTable)
    .leftJoin(jobsTable, eq(materialListsTable.jobId, jobsTable.id))
    .where(and(...conditions));

  if (!list) return null;

  const items = await db
    .select()
    .from(materialListItemsTable)
    .where(eq(materialListItemsTable.listId, id));

  return {
    ...list,
    markup: parseFloat(list.markup ?? "40"),
    createdAt: list.createdAt instanceof Date ? list.createdAt.toISOString() : list.createdAt,
    items: items.map(fmtItem),
  };
}

router.get("/", async (req, res) => {
  try {
    const { jobId } = req.query;
    const userId = req.user?.id;

    const conditions: SQL[] = [];
    if (userId) conditions.push(eq(materialListsTable.userId, userId));
    if (jobId) conditions.push(eq(materialListsTable.jobId, parseInt(jobId as string)));

    const lists = await db
      .select({
        id: materialListsTable.id,
        name: materialListsTable.name,
        jobId: materialListsTable.jobId,
        jobTitle: jobsTable.title,
        markup: materialListsTable.markup,
        createdAt: materialListsTable.createdAt,
      })
      .from(materialListsTable)
      .leftJoin(jobsTable, eq(materialListsTable.jobId, jobsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(materialListsTable.createdAt);

    const listIds = lists.map(l => l.id);
    const scopedItems = listIds.length > 0
      ? await db.select().from(materialListItemsTable).where(inArray(materialListItemsTable.listId, listIds))
      : [];

    const itemsByList: Record<number, ReturnType<typeof fmtItem>[]> = {};
    for (const item of scopedItems) {
      if (!itemsByList[item.listId]) itemsByList[item.listId] = [];
      itemsByList[item.listId].push(fmtItem(item));
    }

    res.json(lists.map(l => ({
      ...l,
      markup: parseFloat(l.markup ?? "40"),
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
      items: itemsByList[l.id] ?? [],
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch material lists" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, jobId, markup = 40, items = [] } = req.body as {
      name: string;
      jobId?: number | null;
      markup?: number;
      items?: ItemInput[];
    };

    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const userId = req.user?.id ?? null;

    const [list] = await db
      .insert(materialListsTable)
      .values({
        name: name.trim(),
        userId,
        jobId: jobId || null,
        markup: markup.toString(),
      })
      .returning();

    if (items.length > 0) {
      await db.insert(materialListItemsTable).values(
        items.map(item => ({
          listId: list.id,
          materialId: item.materialId ?? null,
          nameSnapshot: item.nameSnapshot,
          unitSnapshot: item.unitSnapshot || "ea",
          unitCostSnapshot: item.unitCostSnapshot.toString(),
          qty: item.qty.toString(),
        }))
      );
    }

    const result = await getListWithItems(list.id);
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create material list" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const result = await getListWithItems(id, req.user?.id);
    if (!result) return res.status(404).json({ error: "Material list not found" });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch material list" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const { name, jobId, markup = 40, items = [] } = req.body as {
      name: string;
      jobId?: number | null;
      markup?: number;
      items?: ItemInput[];
    };

    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const userId = req.user?.id;

    // Verify ownership before making any changes
    const ownerCheck = await db
      .select({ id: materialListsTable.id })
      .from(materialListsTable)
      .where(
        userId
          ? and(eq(materialListsTable.id, id), eq(materialListsTable.userId, userId))
          : eq(materialListsTable.id, id)
      )
      .limit(1);

    if (ownerCheck.length === 0) return res.status(404).json({ error: "Material list not found" });

    await db
      .update(materialListsTable)
      .set({
        name: name.trim(),
        jobId: jobId || null,
        markup: markup.toString(),
      })
      .where(eq(materialListsTable.id, id));

    await db.delete(materialListItemsTable).where(eq(materialListItemsTable.listId, id));

    if (items.length > 0) {
      await db.insert(materialListItemsTable).values(
        items.map(item => ({
          listId: id,
          materialId: item.materialId ?? null,
          nameSnapshot: item.nameSnapshot,
          unitSnapshot: item.unitSnapshot || "ea",
          unitCostSnapshot: item.unitCostSnapshot.toString(),
          qty: item.qty.toString(),
        }))
      );
    }

    const result = await getListWithItems(id, userId);
    if (!result) return res.status(404).json({ error: "Material list not found" });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update material list" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const userId = req.user?.id;
    const delConditions: SQL[] = [eq(materialListsTable.id, id)];
    if (userId) delConditions.push(eq(materialListsTable.userId, userId));
    await db.delete(materialListsTable).where(and(...delConditions));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete material list" });
  }
});

async function getNextInvoiceNumber() {
  const [settings] = await db.select().from(settingsTable).limit(1);
  const prefix = settings?.invoicePrefix ?? "INV-2026-";
  const num = settings?.invoiceNextNumber ?? 1001;
  if (settings) {
    await db
      .update(settingsTable)
      .set({ invoiceNextNumber: num + 1 })
      .where(eq(settingsTable.id, settings.id));
  }
  return `${prefix}${num}`;
}

router.post("/:id/attach-to-invoice", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const { attachmentUrl, attachmentName, attachmentSize, invoiceId: targetInvoiceId } = (req.body ?? {}) as {
      attachmentUrl?: string;
      attachmentName?: string;
      attachmentSize?: number;
      invoiceId?: number;
    };

    const list = await getListWithItems(id, req.user?.id);
    if (!list) return res.status(404).json({ error: "Material list not found" });

    if (!list.jobId && !targetInvoiceId) {
      return res.status(400).json({ error: "This list is not linked to a job. Link it to a job first." });
    }

    const markupMult = list.markup / 100 + 1;
    const totalCost = list.items.reduce((s, item) => {
      return s + item.unitCostSnapshot * item.qty * markupMult;
    }, 0);

    const description = "Materials";

    let existingInvoice: typeof invoicesTable.$inferSelect | undefined;

    if (targetInvoiceId) {
      const [found] = await db
        .select()
        .from(invoicesTable)
        .where(eq(invoicesTable.id, targetInvoiceId))
        .limit(1);
      existingInvoice = found;
    } else {
      const [found] = await db
        .select()
        .from(invoicesTable)
        .where(and(
          eq(invoicesTable.jobId, list.jobId!),
          eq(invoicesTable.status, "draft"),
        ))
        .orderBy(desc(invoicesTable.id))
        .limit(1);
      existingInvoice = found;
    }

    const lineItemEntry: Omit<LineItem, "id"> = {
      description,
      quantity: 1,
      unitPrice: parseFloat(totalCost.toFixed(2)),
      total: parseFloat(totalCost.toFixed(2)),
    };

    const newAttachment: InvoiceAttachment | null = attachmentUrl
      ? { name: attachmentName ?? `Material List – ${list.name}.html`, url: attachmentUrl, size: attachmentSize ?? null }
      : null;

    if (targetInvoiceId) {
      if (!existingInvoice) {
        return res.status(400).json({ error: "Invoice not found." });
      }
      if (existingInvoice.status !== "draft") {
        return res.status(400).json({ error: "Invoice is not a draft and cannot be modified." });
      }
    }

    if (!existingInvoice) {
      const today = new Date().toISOString().split("T")[0];
      const invoiceNumber = await getNextInvoiceNumber();
      const subtotal = parseFloat(totalCost.toFixed(2));
      const autoLineItems = [{ id: 1, description, quantity: 1, unitPrice: subtotal, total: subtotal }];
      const newAttachmentArr: InvoiceAttachment[] = newAttachment ? [newAttachment] : [];
      const [created] = await db.insert(invoicesTable).values({
        invoiceNumber,
        jobId: list.jobId,
        status: "draft",
        issueDate: today,
        subtotal: subtotal.toFixed(2),
        taxAmount: "0",
        total: subtotal.toFixed(2),
        lineItems: autoLineItems,
        attachments: newAttachmentArr,
      }).returning();
      return res.json({ invoiceId: created.id, created: true });
    }

    const invoice = existingInvoice;

    const rawItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
    const lineItems = rawItems as LineItem[];
    const matIdx = lineItems.findIndex((li) => li.description === "Materials");
    const newLineItem: LineItem = {
      id: matIdx >= 0 ? lineItems[matIdx].id : (lineItems.length + 1),
      ...lineItemEntry,
    };
    const newItems: LineItem[] = matIdx >= 0
      ? lineItems.map((li, i) => i === matIdx ? newLineItem : li)
      : [...lineItems, newLineItem];

    const subtotal = newItems.reduce((s, li) => s + (li.quantity * li.unitPrice), 0);
    const taxRate = invoice.taxRate ? parseFloat(invoice.taxRate) : 0;
    const taxAmount = taxRate ? subtotal * (taxRate / 100) : 0;

    const rawAttachments = Array.isArray(invoice.attachments) ? invoice.attachments : [];
    const existingAttachments = rawAttachments as InvoiceAttachment[];
    const updatedAttachments: InvoiceAttachment[] = newAttachment
      ? [...existingAttachments.filter(a => a.name !== newAttachment.name), newAttachment]
      : existingAttachments;

    await db.update(invoicesTable).set({
      lineItems: newItems,
      subtotal: subtotal.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      total: (subtotal + taxAmount).toFixed(2),
      attachments: updatedAttachments,
    }).where(eq(invoicesTable.id, invoice.id));

    return res.json({ invoiceId: invoice.id, created: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to attach to invoice" });
  }
});

export default router;
