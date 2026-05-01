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

/**
 * Exported so other route handlers (e.g. jobs.ts) can trigger a sync
 * when job-level events occur (e.g. status → completed).
 *
 * Recalculates the total materials cost for all material lists linked to a job,
 * then upserts a single "Materials" line item on that job's draft invoice.
 * If no draft invoice exists yet, one is created automatically.
 * If the total is zero (e.g., all lists deleted or items removed), the
 * Materials line item is removed from the invoice (or no invoice is created).
 */
export async function syncMaterialsToJobInvoice(jobId: number) {
  // Fetch all material lists for this job
  const lists = await db
    .select()
    .from(materialListsTable)
    .where(eq(materialListsTable.jobId, jobId));

  if (lists.length === 0) {
    // No lists — remove any Materials line item from the draft invoice if it exists
    const [existing] = await db
      .select()
      .from(invoicesTable)
      .where(and(eq(invoicesTable.jobId, jobId), eq(invoicesTable.status, "draft")))
      .orderBy(desc(invoicesTable.id))
      .limit(1);

    if (existing) {
      const rawItems = Array.isArray(existing.lineItems) ? existing.lineItems : [];
      const lineItems = rawItems as LineItem[];
      const filtered = lineItems.filter(li => li.description !== "Materials");
      if (filtered.length !== lineItems.length) {
        const subtotal = filtered.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
        const taxRate = existing.taxRate ? parseFloat(existing.taxRate) : 0;
        const taxAmount = taxRate ? subtotal * (taxRate / 100) : 0;
        await db.update(invoicesTable).set({
          lineItems: filtered,
          subtotal: subtotal.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          total: (subtotal + taxAmount).toFixed(2),
        }).where(eq(invoicesTable.id, existing.id));
      }
    }
    return;
  }

  // Gather item totals across all lists for this job
  const listIds = lists.map(l => l.id);
  const allItems = await db
    .select()
    .from(materialListItemsTable)
    .where(inArray(materialListItemsTable.listId, listIds));

  // Group items by list to apply per-list markup
  const itemsByList: Record<number, typeof allItems> = {};
  for (const item of allItems) {
    if (!itemsByList[item.listId]) itemsByList[item.listId] = [];
    itemsByList[item.listId].push(item);
  }

  let totalMaterialsCost = 0;
  for (const list of lists) {
    const markup = parseFloat(list.markup ?? "40");
    const markupMult = markup / 100 + 1;
    const listItems = itemsByList[list.id] ?? [];
    for (const item of listItems) {
      totalMaterialsCost += parseFloat(item.unitCostSnapshot ?? "0") * parseFloat(item.qty ?? "1") * markupMult;
    }
  }

  const materialsTotal = parseFloat(totalMaterialsCost.toFixed(2));

  // Find or create a draft invoice for this job
  let [existingInvoice] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.jobId, jobId), eq(invoicesTable.status, "draft")))
    .orderBy(desc(invoicesTable.id))
    .limit(1);

  if (!existingInvoice) {
    if (materialsTotal <= 0) return; // nothing to do — don't create an empty invoice

    // Get full job info to build the labor/service line alongside materials
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);

    // Build a placeholder labor/service line — price is $0 since the estimate
    // tool handles pricing; user can adjust in the invoice editor.
    const locationParts = [job?.locationName, job?.address, job?.city, job?.state].filter(Boolean);
    const locationSuffix = locationParts.length ? ` — ${locationParts.join(", ")}` : "";
    const laborDesc = job ? `${job.title}${locationSuffix}` : "Labor / Services";

    const laborLineItem: LineItem = {
      id: 1,
      description: laborDesc,
      quantity: 1,
      unitPrice: 0,
      total: 0,
    };
    const materialsLineItem: LineItem = {
      id: 2,
      description: "Materials",
      quantity: 1,
      unitPrice: materialsTotal,
      total: materialsTotal,
    };

    // Always include both lines — labor at $0 if no estimate set yet,
    // so the invoice is never materials-only.
    const lineItems = [laborLineItem, materialsLineItem];

    const today = new Date().toISOString().split("T")[0];
    const invoiceNumber = await getNextInvoiceNumber();
    const subtotal = lineItems.reduce((s, li) => s + li.unitPrice, 0);

    await db.insert(invoicesTable).values({
      invoiceNumber,
      jobId,
      clientId: job?.clientId ?? null,
      status: "draft",
      issueDate: today,
      subtotal: subtotal.toFixed(2),
      taxAmount: "0",
      total: subtotal.toFixed(2),
      lineItems,
      attachments: [],
      // Carry location fields from the job so the invoice Work Location is populated
      locationName: job?.locationName ?? null,
      city: job?.city ?? null,
      state: job?.state ?? null,
    });
    return;
  }

  // Upsert the Materials line item in the existing draft invoice
  const rawItems = Array.isArray(existingInvoice.lineItems) ? existingInvoice.lineItems : [];
  let lineItems = rawItems as LineItem[];

  // Safety net: if the existing draft has no non-Materials line item at all
  // (including the case where lineItems is empty), inject the labor/service line
  // to enforce the invariant that job invoices always contain both.
  const hasLaborLine = lineItems.some(li => li.description !== "Materials");
  if (!hasLaborLine) {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
    if (job) {
      const locationParts = [job.locationName, job.address, job.city, job.state].filter(Boolean);
      const locationSuffix = locationParts.length ? ` — ${locationParts.join(", ")}` : "";
      const laborDesc = `${job.title}${locationSuffix}`;
      const laborPrice = job.estimatedAmount ? parseFloat(job.estimatedAmount) : 0;
      const laborLineItem: LineItem = {
        id: 1,
        description: laborDesc,
        quantity: 1,
        unitPrice: laborPrice,
        total: laborPrice,
      };
      // Renumber existing items to avoid id collisions
      const reNumbered = lineItems.map((li, i) => ({ ...li, id: i + 2 }));
      lineItems = [laborLineItem, ...reNumbered];
    }
  }

  const matIdx = lineItems.findIndex(li => li.description === "Materials");

  let newItems: LineItem[];
  if (materialsTotal <= 0) {
    // Remove the Materials line item if total is zero
    newItems = lineItems.filter(li => li.description !== "Materials");
  } else if (matIdx >= 0) {
    // Update existing Materials line item
    newItems = lineItems.map((li, i) =>
      i === matIdx
        ? { ...li, unitPrice: materialsTotal, total: materialsTotal }
        : li
    );
  } else {
    // Add new Materials line item
    const nextId = lineItems.length > 0 ? Math.max(...lineItems.map(li => li.id)) + 1 : 1;
    newItems = [...lineItems, { id: nextId, description: "Materials", quantity: 1, unitPrice: materialsTotal, total: materialsTotal }];
  }

  const subtotal = newItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  const taxRate = existingInvoice.taxRate ? parseFloat(existingInvoice.taxRate) : 0;
  const taxAmount = taxRate ? subtotal * (taxRate / 100) : 0;

  await db.update(invoicesTable).set({
    lineItems: newItems,
    subtotal: subtotal.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    total: (subtotal + taxAmount).toFixed(2),
  }).where(eq(invoicesTable.id, existingInvoice.id));
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

    const userId = req.user?.id ?? null;

    // Name is optional — auto-generate one if not provided
    const resolvedName = name?.trim() || "Materials";

    const [list] = await db
      .insert(materialListsTable)
      .values({
        name: resolvedName,
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

    // Auto-sync materials to the job's draft invoice
    if (jobId) {
      await syncMaterialsToJobInvoice(jobId);
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
      .select({ id: materialListsTable.id, jobId: materialListsTable.jobId })
      .from(materialListsTable)
      .where(
        userId
          ? and(eq(materialListsTable.id, id), eq(materialListsTable.userId, userId))
          : eq(materialListsTable.id, id)
      )
      .limit(1);

    if (ownerCheck.length === 0) return res.status(404).json({ error: "Material list not found" });
    const oldJobId = ownerCheck[0].jobId;

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

    // Auto-sync materials to the job's draft invoice
    const effectiveJobId = jobId || oldJobId;
    if (effectiveJobId) {
      await syncMaterialsToJobInvoice(effectiveJobId);
      // If jobId changed, also sync the old job
      if (jobId && oldJobId && jobId !== oldJobId) {
        await syncMaterialsToJobInvoice(oldJobId);
      }
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

    // Scope the prefetch by owner to prevent cross-user info leakage
    const ownerConditions: SQL[] = [eq(materialListsTable.id, id)];
    if (userId) ownerConditions.push(eq(materialListsTable.userId, userId));

    const [listRow] = await db
      .select({ jobId: materialListsTable.jobId })
      .from(materialListsTable)
      .where(and(...ownerConditions))
      .limit(1);

    // Only proceed with delete and sync if the row belongs to this user
    if (listRow) {
      await db.delete(materialListsTable).where(and(...ownerConditions));

      // Auto-sync materials to the job's draft invoice after deletion
      if (listRow.jobId) {
        await syncMaterialsToJobInvoice(listRow.jobId);
      }
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete material list" });
  }
});

// Keep attach-to-invoice as a no-op for backward compatibility (returns existing invoice id if any)
router.post("/:id/attach-to-invoice", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const list = await getListWithItems(id, req.user?.id);
    if (!list) return res.status(404).json({ error: "Material list not found" });

    if (!list.jobId) {
      return res.status(400).json({ error: "This list is not linked to a job." });
    }

    // Materials are now auto-synced — just return the current draft invoice id
    const [invoice] = await db
      .select({ id: invoicesTable.id })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.jobId, list.jobId), eq(invoicesTable.status, "draft")))
      .orderBy(desc(invoicesTable.id))
      .limit(1);

    return res.json({ invoiceId: invoice?.id ?? null, created: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
