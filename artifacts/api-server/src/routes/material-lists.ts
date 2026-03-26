import { Router } from "express";
import { db } from "@workspace/db";
import {
  materialListsTable,
  materialListItemsTable,
  materialsTable,
  jobsTable,
  invoicesTable,
  clientsTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

const router = Router();

interface ItemInput {
  materialId?: number | null;
  nameSnapshot: string;
  unitSnapshot?: string;
  unitCostSnapshot: number;
  qty: number;
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

router.post("/:id/attach-to-invoice", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const list = await getListWithItems(id);
    if (!list) return res.status(404).json({ error: "Material list not found" });

    const markup = list.markup / 100 + 1;
    const totalCost = list.items.reduce((s, item) => {
      return s + item.unitCostSnapshot * item.qty * markup;
    }, 0);

    const description = `Materials – ${list.name}`;

    if (list.jobId) {
      const [existingInvoice] = await db
        .select()
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.jobId, list.jobId),
            eq(invoicesTable.status, "draft")
          )
        )
        .limit(1);

      if (existingInvoice) {
        const lineItems = Array.isArray(existingInvoice.lineItems) ? existingInvoice.lineItems as any[] : [];
        const matIdx = lineItems.findIndex((li: any) => li.description?.startsWith("Materials – "));
        const newLineItem = {
          id: matIdx >= 0 ? lineItems[matIdx].id : (lineItems.length + 1),
          description,
          quantity: 1,
          unitPrice: parseFloat(totalCost.toFixed(2)),
          total: parseFloat(totalCost.toFixed(2)),
        };
        const newItems = matIdx >= 0
          ? lineItems.map((li: any, i: number) => i === matIdx ? newLineItem : li)
          : [...lineItems, newLineItem];

        const subtotal = newItems.reduce((s: number, li: any) => s + (li.quantity * li.unitPrice), 0);
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
    }

    res.json({
      invoiceId: null,
      created: false,
      lineItem: {
        description,
        quantity: 1,
        unitPrice: parseFloat(totalCost.toFixed(2)),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to attach to invoice" });
  }
});

export default router;
