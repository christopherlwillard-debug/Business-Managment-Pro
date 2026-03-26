import { Router } from "express";
import { db } from "@workspace/db";
import {
  materialListsTable,
  materialListItemsTable,
  jobsTable,
  invoicesTable,
  settingsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

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

function fmtItem(row: typeof materialListItemsTable.$inferSelect) {
  return {
    ...row,
    unitCostSnapshot: parseFloat(row.unitCostSnapshot ?? "0"),
    qty: parseFloat(row.qty ?? "1"),
  };
}

async function getListWithItems(id: number) {
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
    .where(eq(materialListsTable.id, id));

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
      .where(jobId ? eq(materialListsTable.jobId, parseInt(jobId as string)) : undefined)
      .orderBy(materialListsTable.createdAt);

    const allItems = await db.select().from(materialListItemsTable);

    const itemsByList: Record<number, ReturnType<typeof fmtItem>[]> = {};
    for (const item of allItems) {
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

    const [list] = await db
      .insert(materialListsTable)
      .values({
        name: name.trim(),
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
    const result = await getListWithItems(id);
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

    const result = await getListWithItems(id);
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
    await db.delete(materialListsTable).where(eq(materialListsTable.id, id));
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

    const list = await getListWithItems(id);
    if (!list) return res.status(404).json({ error: "Material list not found" });

    if (!list.jobId) {
      return res.status(400).json({ error: "This list is not linked to a job. Link it to a job first." });
    }

    const markupMult = list.markup / 100 + 1;
    const totalCost = list.items.reduce((s, item) => {
      return s + item.unitCostSnapshot * item.qty * markupMult;
    }, 0);

    const description = "Materials";

    const [existingInvoice] = await db
      .select()
      .from(invoicesTable)
      .where(and(eq(invoicesTable.jobId, list.jobId), eq(invoicesTable.status, "draft")))
      .limit(1);

    const lineItemEntry: Omit<LineItem, "id"> = {
      description,
      quantity: 1,
      unitPrice: parseFloat(totalCost.toFixed(2)),
      total: parseFloat(totalCost.toFixed(2)),
    };

    if (existingInvoice) {
      const rawItems = Array.isArray(existingInvoice.lineItems) ? existingInvoice.lineItems : [];
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
      const taxRate = existingInvoice.taxRate ? parseFloat(existingInvoice.taxRate) : 0;
      const taxAmount = taxRate ? subtotal * (taxRate / 100) : 0;

      await db.update(invoicesTable).set({
        lineItems: newItems,
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        total: (subtotal + taxAmount).toFixed(2),
      }).where(eq(invoicesTable.id, existingInvoice.id));

      return res.json({ invoiceId: existingInvoice.id, created: false });
    }

    const today = new Date().toISOString().split("T")[0];
    const invoiceNumber = await getNextInvoiceNumber();
    const subtotal = parseFloat(totalCost.toFixed(2));
    const lineItems = [{ id: 1, ...lineItemEntry }];

    const [newInvoice] = await db.insert(invoicesTable).values({
      invoiceNumber,
      jobId: list.jobId,
      status: "draft",
      issueDate: today,
      subtotal: subtotal.toFixed(2),
      taxAmount: "0",
      total: subtotal.toFixed(2),
      lineItems,
      attachments: [],
    }).returning();

    return res.json({ invoiceId: newInvoice.id, created: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to attach to invoice" });
  }
});

export default router;
