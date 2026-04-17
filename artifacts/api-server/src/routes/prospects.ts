import { Router } from "express";
import { db } from "@workspace/db";
import {
  prospectsTable,
  estimatesTable,
  clientsTable,
  PROSPECT_PROPERTY_TYPES,
  PROSPECT_STATUSES,
  type Prospect as ProspectRow,
} from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router = Router();

type ProspectWithEstimate = ProspectRow & { estimateNumber: string | null };

function toProspectPropertyType(value: unknown): typeof PROSPECT_PROPERTY_TYPES[number] {
  if (typeof value === "string" && PROSPECT_PROPERTY_TYPES.includes(value as typeof PROSPECT_PROPERTY_TYPES[number])) {
    return value as typeof PROSPECT_PROPERTY_TYPES[number];
  }
  return "Other";
}

function toProspectStatus(value: unknown): typeof PROSPECT_STATUSES[number] {
  if (typeof value === "string" && PROSPECT_STATUSES.includes(value as typeof PROSPECT_STATUSES[number])) {
    return value as typeof PROSPECT_STATUSES[number];
  }
  return "cold";
}

function format(p: ProspectWithEstimate) {
  return {
    id: p.id,
    address: p.address,
    propertyType: p.propertyType,
    estimatedSqft: p.estimatedSqft ?? null,
    roughQuote: p.roughQuote != null ? parseFloat(p.roughQuote) : null,
    contactName: p.contactName ?? null,
    contactPhone: p.contactPhone ?? null,
    contactEmail: p.contactEmail ?? null,
    notes: p.notes ?? null,
    status: p.status,
    linkedEstimateId: p.linkedEstimateId ?? null,
    linkedEstimateNumber: p.estimateNumber ?? null,
    stripePaymentLinkId: p.stripePaymentLinkId ?? null,
    stripePaymentLinkUrl: p.stripePaymentLinkUrl ?? null,
    depositPaidAt: p.depositPaidAt instanceof Date ? p.depositPaidAt.toISOString() : (p.depositPaidAt ?? null),
    depositPaidAmount: p.depositPaidAmount != null ? parseFloat(p.depositPaidAmount) : null,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    const statusFilter = typeof status === "string" && PROSPECT_STATUSES.includes(status as typeof PROSPECT_STATUSES[number])
      ? (status as typeof PROSPECT_STATUSES[number])
      : null;

    const rows = await db
      .select({ ...prospectsTable, estimateNumber: estimatesTable.title })
      .from(prospectsTable)
      .leftJoin(estimatesTable, eq(prospectsTable.linkedEstimateId, estimatesTable.id))
      .where(statusFilter ? eq(prospectsTable.status, statusFilter) : undefined)
      .orderBy(asc(prospectsTable.createdAt));

    res.json(rows.map((r) => format(r as ProspectWithEstimate)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch prospects" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = req.body as {
      address: string;
      propertyType?: string;
      estimatedSqft?: number | null;
      roughQuote?: number | null;
      contactName?: string | null;
      contactPhone?: string | null;
      notes?: string | null;
      status?: string;
      linkedEstimateId?: number | null;
    };

    if (!body.address) return res.status(400).json({ error: "Address is required" });

    const [prospect] = await db
      .insert(prospectsTable)
      .values({
        address: body.address,
        propertyType: toProspectPropertyType(body.propertyType),
        estimatedSqft: body.estimatedSqft ?? null,
        roughQuote: body.roughQuote != null ? body.roughQuote.toString() : null,
        contactName: body.contactName ?? null,
        contactPhone: body.contactPhone ?? null,
        notes: body.notes ?? null,
        status: toProspectStatus(body.status),
        linkedEstimateId: body.linkedEstimateId ?? null,
      })
      .returning();

    let estimateNumber: string | null = null;
    if (prospect.linkedEstimateId) {
      const [est] = await db
        .select({ title: estimatesTable.title })
        .from(estimatesTable)
        .where(eq(estimatesTable.id, prospect.linkedEstimateId));
      estimateNumber = est?.title ?? null;
    }

    res.status(201).json(format({ ...prospect, estimateNumber }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create prospect" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const body = req.body as {
      address?: string;
      propertyType?: string;
      estimatedSqft?: number | null;
      roughQuote?: number | null;
      contactName?: string | null;
      contactPhone?: string | null;
      notes?: string | null;
      status?: string;
      linkedEstimateId?: number | null;
    };

    const patch: Partial<typeof prospectsTable.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (body.address !== undefined) patch.address = body.address;
    if (body.propertyType !== undefined) patch.propertyType = toProspectPropertyType(body.propertyType);
    if (body.estimatedSqft !== undefined) patch.estimatedSqft = body.estimatedSqft ?? null;
    if (body.roughQuote !== undefined) patch.roughQuote = body.roughQuote != null ? body.roughQuote.toString() : null;
    if (body.contactName !== undefined) patch.contactName = body.contactName ?? null;
    if (body.contactPhone !== undefined) patch.contactPhone = body.contactPhone ?? null;
    if (body.notes !== undefined) patch.notes = body.notes ?? null;
    if (body.status !== undefined) patch.status = toProspectStatus(body.status);
    if (body.linkedEstimateId !== undefined) patch.linkedEstimateId = body.linkedEstimateId ?? null;

    await db.update(prospectsTable).set(patch).where(eq(prospectsTable.id, id));

    const [p] = await db
      .select({ ...prospectsTable, estimateNumber: estimatesTable.title })
      .from(prospectsTable)
      .leftJoin(estimatesTable, eq(prospectsTable.linkedEstimateId, estimatesTable.id))
      .where(eq(prospectsTable.id, id));

    if (!p) return res.status(404).json({ error: "Prospect not found" });
    res.json(format(p as ProspectWithEstimate));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update prospect" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(prospectsTable).where(eq(prospectsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete prospect" });
  }
});

router.post("/:id/convert-to-client", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [prospect] = await db
      .select()
      .from(prospectsTable)
      .where(eq(prospectsTable.id, id));

    if (!prospect) return res.status(404).json({ error: "Prospect not found" });
    if (prospect.status !== "won") return res.status(400).json({ error: "Only won prospects can be converted to clients" });

    const [client] = await db
      .insert(clientsTable)
      .values({
        name: prospect.contactName ?? prospect.address,
        phone: prospect.contactPhone ?? null,
        address: prospect.address,
        notes: prospect.notes ?? null,
      })
      .returning();

    res.status(201).json({ ...client, createdAt: client.createdAt.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to convert prospect to client" });
  }
});

export default router;
