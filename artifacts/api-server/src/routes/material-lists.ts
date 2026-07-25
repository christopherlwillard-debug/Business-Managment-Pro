import { Router } from "express";
import { db } from "@workspace/db";
import {
  materialListsTable,
  materialListItemsTable,
  jobsTable,
  invoicesTable,
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
  source?: string;
}

/** True for both the new per-item material lines and the legacy aggregate "Materials" line */
function isMaterialLine(li: LineItem): boolean {
  return li.source === "material" || li.description === "Materials";
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


/**
 * Exported so other route handlers (e.g. jobs.ts) can trigger a sync
 * when job-level events occur (e.g. status → completed).
 *
 * Expands all material list items for a job into individual invoice line items,
 * each priced at unitCostSnapshot × qty × (1 + markup%). Each line carries
 * source: "material" so subsequent syncs can cleanly replace them without
 * touching labor/service lines.
 *
 * IMPORTANT: This function never creates a new invoice. It only updates an
 * existing draft invoice that was already created by the user on the job card.
 * If no draft invoice exists, the sync returns silently. This prevents ghost
 * (orphaned) draft invoices from being auto-created by material list activity.
 */
export async function syncMaterialsToJobInvoice(jobId: number) {
  // Fetch all material lists for this job
  const lists = await db
    .select()
    .from(materialListsTable)
    .where(eq(materialListsTable.jobId, jobId));

  if (lists.length === 0) {
    // No lists — remove all material-sourced lines from the draft invoice if it exists
    const [existing] = await db
      .select()
      .from(invoicesTable)
      .where(and(eq(invoicesTable.jobId, jobId), eq(invoicesTable.status, "draft")))
      .orderBy(desc(invoicesTable.id))
      .limit(1);

    if (existing) {
      const rawItems = Array.isArray(existing.lineItems) ? existing.lineItems : [];
      const lineItems = rawItems as LineItem[];
      const filtered = lineItems.filter(li => !isMaterialLine(li));
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

  // Gather all items across all lists for this job
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

  // Compute ONE aggregate "Materials" total across all lists (each list has its own markup)
  let materialsGrandTotal = 0;
  for (const list of lists) {
    const markup = parseFloat(list.markup ?? "40");
    const markupMult = 1 + markup / 100;
    const listItems = itemsByList[list.id] ?? [];
    for (const item of listItems) {
      const unitCost = parseFloat(item.unitCostSnapshot ?? "0");
      const qty = parseFloat(item.qty ?? "1");
      materialsGrandTotal += qty * unitCost * markupMult;
    }
  }
  materialsGrandTotal = parseFloat(materialsGrandTotal.toFixed(2));

  // One aggregate "Materials" line — source: "material" so cleanup logic still works
  const newMaterialLines: LineItem[] = materialsGrandTotal > 0
    ? [{
        id: 0, // reassigned below
        description: "Materials",
        quantity: 1,
        unitPrice: materialsGrandTotal,
        total: materialsGrandTotal,
        source: "material",
      }]
    : [];

  const hasMaterialItems = newMaterialLines.length > 0;

  // Find or create a draft invoice for this job
  let [existingInvoice] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.jobId, jobId), eq(invoicesTable.status, "draft")))
    .orderBy(desc(invoicesTable.id))
    .limit(1);

  // Materials only attach to an existing job-card draft — never create their own invoice.
  // If no draft exists yet, wait silently; the user will create one from the job card.
  if (!existingInvoice) return;

  // Strip all existing material-sourced lines (handles both old aggregate line and new per-item lines)
  const rawItems = Array.isArray(existingInvoice.lineItems) ? existingInvoice.lineItems : [];
  let laborLines = (rawItems as LineItem[]).filter(li => !isMaterialLine(li));

  // Safety net: if there are no labor/service lines at all, inject a placeholder
  if (laborLines.length === 0) {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
    if (job) {
      const locationParts = [job.locationName, job.address, job.city, job.state].filter(Boolean);
      const locationSuffix = locationParts.length ? ` — ${locationParts.join(", ")}` : "";
      const laborDesc = `${job.title}${locationSuffix}`;
      laborLines = [{
        id: 1,
        description: laborDesc,
        quantity: 1,
        unitPrice: 0,
        total: 0,
      }];
    }
  }

  // Assign fresh sequential IDs to the new material lines
  const maxLaborId = laborLines.length > 0 ? Math.max(...laborLines.map(li => li.id)) : 0;
  const materialLines = newMaterialLines.map((li, i) => ({ ...li, id: maxLaborId + i + 1 }));

  // Labor/service lines first, then individual material lines
  const newItems: LineItem[] = [...laborLines, ...materialLines];

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

// ── GET /jobs/:jobId/materials-pdf — download itemized materials as PDF ────────
router.get("/jobs/:jobId/materials-pdf", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });
    const { generateMaterialsPdfBuffer } = await import("../lib/generateMaterialsPdf.js");
    const result = await generateMaterialsPdfBuffer(jobId);
    if (!result) return res.status(404).json({ error: "No material lists found for this job" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate materials PDF" });
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
