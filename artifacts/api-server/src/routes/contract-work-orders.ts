import { Router } from "express";
import { db } from "@workspace/db";
import {
  businessesTable, clientsTable, contactsTable, contactBusinessLinksTable,
  contractClientProgramsTable, contractWorkOrdersTable, jobsTable,
  propertiesTable, propertyBusinessAccessTable,
} from "@workspace/db/schema";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { resolveMutationBusiness, requestedBusiness, sameLegalBusiness } from "../lib/business-scope.js";
import { hasPropertyPermission } from "../lib/property-access.js";
import { getRequestUserId } from "./guards";
import crypto from "crypto";
import {
  jobChecklistsTable,
  jobChecklistSectionsTable,
  jobChecklistItemsTable,
} from "@workspace/db/schema";

const router = Router();

async function getProgram(id: number) {
  const [row] = await db.select({
    id: contractClientProgramsTable.id,
    businessId: contractClientProgramsTable.businessId,
    payerClientId: contractClientProgramsTable.payerClientId,
    payerName: clientsTable.name,
    name: contractClientProgramsTable.name,
    requiresInstallationPhotos: contractClientProgramsTable.requiresInstallationPhotos,
    requiresCompletionDocumentation: contractClientProgramsTable.requiresCompletionDocumentation,
    active: contractClientProgramsTable.active,
  }).from(contractClientProgramsTable)
    .innerJoin(clientsTable, eq(contractClientProgramsTable.payerClientId, clientsTable.id))
    .where(eq(contractClientProgramsTable.id, id)).limit(1);
  return row;
}

async function getOrder(id: number) {
  const [row] = await db.select({
    id: contractWorkOrdersTable.id,
    businessId: contractWorkOrdersTable.businessId,
    programId: contractWorkOrdersTable.programId,
    programName: contractClientProgramsTable.name,
    payerClientId: contractClientProgramsTable.payerClientId,
    payerName: clientsTable.name,
    externalOrderNumber: contractWorkOrdersTable.externalOrderNumber,
    title: contractWorkOrdersTable.title,
    scope: contractWorkOrdersTable.scope,
    homeownerContactId: contractWorkOrdersTable.homeownerContactId,
    homeownerName: sql<string | null>`CASE WHEN EXISTS (
      SELECT 1 FROM contact_business_links cbl
      JOIN businesses b ON b.id = ${contractWorkOrdersTable.businessId}
      WHERE cbl.contact_id = ${contractWorkOrdersTable.homeownerContactId}
        AND cbl.legal_business_id = COALESCE(b.legal_business_id, b.id)
    ) THEN ${contactsTable.name} ELSE NULL END`,
    propertyId: contractWorkOrdersTable.propertyId,
    propertyLabel: sql<string | null>`CASE WHEN ${propertiesTable.businessId} = ${contractWorkOrdersTable.businessId}
      OR ${propertyBusinessAccessTable.id} IS NOT NULL THEN ${propertiesTable.label} ELSE NULL END`,
    propertyAddress: sql<string | null>`CASE WHEN ${propertiesTable.businessId} = ${contractWorkOrdersTable.businessId}
      OR ${propertyBusinessAccessTable.id} IS NOT NULL
      THEN concat_ws(', ', ${propertiesTable.street}, ${propertiesTable.city}, ${propertiesTable.state}, ${propertiesTable.zip})
      ELSE NULL END`,
    agreedPrice: contractWorkOrdersTable.agreedPrice,
    status: contractWorkOrdersTable.status,
    jobId: contractWorkOrdersTable.jobId,
    acceptedAt: contractWorkOrdersTable.acceptedAt,
    declineReason: contractWorkOrdersTable.declineReason,
    cancellationReason: contractWorkOrdersTable.cancellationReason,
  }).from(contractWorkOrdersTable)
    .innerJoin(contractClientProgramsTable, eq(contractWorkOrdersTable.programId, contractClientProgramsTable.id))
    .innerJoin(clientsTable, eq(contractClientProgramsTable.payerClientId, clientsTable.id))
    .leftJoin(contactsTable, eq(contractWorkOrdersTable.homeownerContactId, contactsTable.id))
    .leftJoin(propertiesTable, eq(contractWorkOrdersTable.propertyId, propertiesTable.id))
    .leftJoin(propertyBusinessAccessTable, and(
      eq(propertyBusinessAccessTable.propertyId, propertiesTable.id),
      eq(propertyBusinessAccessTable.businessId, contractWorkOrdersTable.businessId),
      isNull(propertyBusinessAccessTable.revokedAt),
    ))
    .where(eq(contractWorkOrdersTable.id, id)).limit(1);
  return row ? { ...row, agreedPrice: row.agreedPrice == null ? null : Number(row.agreedPrice) } : row;
}

async function validateProperty(propertyId: number | null, businessId: number): Promise<boolean> {
  if (propertyId == null) return true;
  const [property] = await db.select({
    businessId: propertiesTable.businessId,
  }).from(propertiesTable).where(eq(propertiesTable.id, propertyId)).limit(1);
  if (!property || !await sameLegalBusiness(property.businessId, businessId)) return false;
  if (property.businessId === businessId) return true;
  const [grant] = await db.select({ permission: propertyBusinessAccessTable.permission })
    .from(propertyBusinessAccessTable).where(and(
      eq(propertyBusinessAccessTable.propertyId, propertyId),
      eq(propertyBusinessAccessTable.businessId, businessId),
      isNull(propertyBusinessAccessTable.revokedAt),
    )).limit(1);
  return hasPropertyPermission(grant?.permission, "view");
}

async function addContractCompletionChecklist(
  tx: any,
  jobId: number,
  externalOrderNumber: string,
  requirements: { requiresInstallationPhotos: boolean; requiresCompletionDocumentation: boolean },
): Promise<void> {
  const items = [
    ...(requirements.requiresInstallationPhotos
      ? [{ title: "Capture installation photos", requiredEvidenceType: "image" }]
      : []),
    ...(requirements.requiresCompletionDocumentation
      ? [{ title: "Upload required completion documentation", requiredEvidenceType: "document" }]
      : []),
  ];
  if (items.length === 0) return;

  let [checklist] = await tx.select({ id: jobChecklistsTable.id })
    .from(jobChecklistsTable)
    .where(eq(jobChecklistsTable.jobId, jobId))
    .for("update")
    .limit(1);

  if (!checklist) {
    [checklist] = await tx.insert(jobChecklistsTable).values({
      jobId,
      templateId: null,
      templateName: "Contract Work Order Completion",
      shareToken: crypto.randomUUID(),
      shareEnabled: false,
    }).returning({ id: jobChecklistsTable.id });
  }

  const sectionName = `Contract completion — ${externalOrderNumber}`;
  const [existingSection] = await tx.select({ id: jobChecklistSectionsTable.id })
    .from(jobChecklistSectionsTable)
    .where(and(
      eq(jobChecklistSectionsTable.jobChecklistId, checklist.id),
      eq(jobChecklistSectionsTable.name, sectionName),
    ))
    .limit(1);
  if (existingSection) return;

  const [section] = await tx.insert(jobChecklistSectionsTable).values({
    jobChecklistId: checklist.id,
    templateSectionId: null,
    name: sectionName,
    active: true,
    sortOrder: 1000,
  }).returning({ id: jobChecklistSectionsTable.id });

  for (const [index, item] of items.entries()) {
    await tx.insert(jobChecklistItemsTable).values({
      jobChecklistId: checklist.id,
      jobChecklistSectionId: section.id,
      title: item.title,
      requiredEvidenceType: item.requiredEvidenceType,
      sortOrder: index + 1,
    }).returning({ id: jobChecklistItemsTable.id });
  }
}

router.get("/contract-client-programs", async (req, res): Promise<void> => {
  const businessId = Number(req.query.businessId);
  const scope = await requestedBusiness(req);
  if (!scope || !Number.isSafeInteger(businessId) || businessId !== scope.id) {
    res.status(400).json({ error: "A valid businessId is required" }); return;
  }
  const rows = await db.select({
    id: contractClientProgramsTable.id,
    businessId: contractClientProgramsTable.businessId,
    payerClientId: contractClientProgramsTable.payerClientId,
    payerName: clientsTable.name,
    name: contractClientProgramsTable.name,
    requiresInstallationPhotos: contractClientProgramsTable.requiresInstallationPhotos,
    requiresCompletionDocumentation: contractClientProgramsTable.requiresCompletionDocumentation,
    active: contractClientProgramsTable.active,
  }).from(contractClientProgramsTable)
    .innerJoin(clientsTable, eq(contractClientProgramsTable.payerClientId, clientsTable.id))
    .where(eq(contractClientProgramsTable.businessId, scope.id))
    .orderBy(contractClientProgramsTable.name);
  res.json(rows);
});

router.post("/contract-client-programs", async (req, res): Promise<void> => {
  const ownership = await resolveMutationBusiness(req);
  if (!ownership.ok || !Number.isSafeInteger(Number(req.body?.payerClientId))) {
    res.status(400).json({ error: "Valid businessId and payerClientId are required" }); return;
  }
  const [client] = await db.select({ businessId: clientsTable.businessId, businessLine: clientsTable.businessLine })
    .from(clientsTable).where(eq(clientsTable.id, Number(req.body.payerClientId))).limit(1);
  if (!client) { res.status(400).json({ error: "Payer client not found" }); return; }
  const [business] = await db.select({ id: businessesTable.id, legalBusinessId: businessesTable.legalBusinessId })
    .from(businessesTable).where(eq(businessesTable.id, ownership.business.id)).limit(1);
  const payerSlug = client.businessLine === "contracting" ? "general_contracting"
    : client.businessLine === "asphalt" ? "asphalt_sealing" : client.businessLine;
  const [payerBusiness] = client.businessId != null
    ? await db.select({ id: businessesTable.id, legalBusinessId: businessesTable.legalBusinessId })
      .from(businessesTable).where(eq(businessesTable.id, client.businessId)).limit(1)
    : payerSlug
      ? await db.select({ id: businessesTable.id, legalBusinessId: businessesTable.legalBusinessId })
        .from(businessesTable).where(eq(businessesTable.slug, payerSlug)).limit(1)
      : [];
  if (!business || !payerBusiness ||
      (business.legalBusinessId ?? business.id) !== (payerBusiness.legalBusinessId ?? payerBusiness.id)) {
    res.status(400).json({ error: "Payer client must belong to the provider's legal business" }); return;
  }
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 160) { res.status(400).json({ error: "Program name is required (160 characters maximum)" }); return; }
  for (const field of ["requiresInstallationPhotos", "requiresCompletionDocumentation"] as const) {
    if (req.body[field] !== undefined && typeof req.body[field] !== "boolean") {
      res.status(400).json({ error: `${field} must be a boolean` }); return;
    }
  }
  const [created] = await db.insert(contractClientProgramsTable).values({
    businessId: ownership.business.id,
    payerClientId: Number(req.body.payerClientId),
    name,
    requiresInstallationPhotos: req.body.requiresInstallationPhotos === true,
    requiresCompletionDocumentation: req.body.requiresCompletionDocumentation === true,
    createdByUserId: getRequestUserId(req) ?? null,
  }).returning({ id: contractClientProgramsTable.id });
  res.status(201).json(await getProgram(created.id));
});

router.get("/contract-work-orders/options", async (req, res): Promise<void> => {
  const businessId = Number(req.query.businessId);
  const scope = await requestedBusiness(req);
  if (!scope || scope.id !== businessId) {
    res.status(400).json({ error: "A valid businessId is required" }); return;
  }
  const [business] = await db.select({ legalBusinessId: businessesTable.legalBusinessId })
    .from(businessesTable).where(eq(businessesTable.id, scope.id)).limit(1);
  const legalBusinessId = business?.legalBusinessId ?? scope.id;
  const memberBusinesses = await db.select({ id: businessesTable.id }).from(businessesTable)
    .where(or(eq(businessesTable.id, legalBusinessId), eq(businessesTable.legalBusinessId, legalBusinessId)));
  const payerClients = await db.select({ id: clientsTable.id, name: clientsTable.name })
    .from(clientsTable).where(inArray(clientsTable.businessId, memberBusinesses.map(row => row.id)))
    .orderBy(clientsTable.name);
  const contacts = await db.selectDistinct({
    id: contactsTable.id,
    name: contactsTable.name,
  }).from(contactsTable)
    .innerJoin(contactBusinessLinksTable, eq(contactBusinessLinksTable.contactId, contactsTable.id))
    .where(eq(contactBusinessLinksTable.legalBusinessId, legalBusinessId))
    .orderBy(contactsTable.name);
  const propertyRows = await db.selectDistinct({
    id: propertiesTable.id,
    businessId: propertiesTable.businessId,
    label: propertiesTable.label,
    street: propertiesTable.street,
    city: propertiesTable.city,
    state: propertiesTable.state,
    zip: propertiesTable.zip,
  }).from(propertiesTable)
    .leftJoin(propertyBusinessAccessTable, and(
      eq(propertyBusinessAccessTable.propertyId, propertiesTable.id),
      eq(propertyBusinessAccessTable.businessId, scope.id),
      isNull(propertyBusinessAccessTable.revokedAt),
    ))
    .where(sql`(${propertiesTable.businessId} = ${scope.id} OR ${propertyBusinessAccessTable.id} IS NOT NULL)`)
    .orderBy(propertiesTable.label);
  const properties = [];
  for (const property of propertyRows) {
    if (!await sameLegalBusiness(property.businessId, scope.id)) continue;
    if (property.businessId !== scope.id) {
      const [grant] = await db.select({ permission: propertyBusinessAccessTable.permission })
        .from(propertyBusinessAccessTable).where(and(
          eq(propertyBusinessAccessTable.propertyId, property.id),
          eq(propertyBusinessAccessTable.businessId, scope.id),
          isNull(propertyBusinessAccessTable.revokedAt),
        )).limit(1);
      if (!hasPropertyPermission(grant?.permission, "view")) continue;
    }
    properties.push({
      id: property.id,
      label: property.label,
      address: [property.street, property.city, property.state, property.zip].filter(Boolean).join(", ") || null,
    });
  }
  res.json({ contacts, properties, payerClients });
});

router.get("/contract-work-orders", async (req, res): Promise<void> => {
  const businessId = Number(req.query.businessId);
  const scope = await requestedBusiness(req);
  if (!scope || !Number.isSafeInteger(businessId) || businessId !== scope.id) {
    res.status(400).json({ error: "A valid businessId is required" }); return;
  }
  const ids = await db.select({ id: contractWorkOrdersTable.id })
    .from(contractWorkOrdersTable)
    .where(eq(contractWorkOrdersTable.businessId, scope.id))
    .orderBy(desc(contractWorkOrdersTable.createdAt));
  const rows = await Promise.all(ids.map(({ id }) => getOrder(id)));
  res.json(rows.filter(Boolean));
});

router.post("/contract-work-orders", async (req, res): Promise<void> => {
  const programId = Number(req.body?.programId);
  const [program] = await db.select().from(contractClientProgramsTable)
    .where(and(eq(contractClientProgramsTable.id, programId), eq(contractClientProgramsTable.active, true))).limit(1);
  if (!program) { res.status(404).json({ error: "Active contract program not found" }); return; }
  const scope = await requestedBusiness(req);
  if (!scope || scope.id !== program.businessId || Number(req.body?.businessId) !== scope.id) {
    res.status(404).json({ error: "Contract program not found" }); return;
  }
  const externalOrderNumber = typeof req.body.externalOrderNumber === "string" ? req.body.externalOrderNumber.trim() : "";
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  if (!externalOrderNumber || externalOrderNumber.length > 160 || !title || title.length > 240) {
    res.status(400).json({ error: "External order number and title are required" }); return;
  }
  const propertyId = req.body.propertyId == null ? null : Number(req.body.propertyId);
  const contactId = req.body.homeownerContactId == null ? null : Number(req.body.homeownerContactId);
  if ((propertyId != null && !Number.isSafeInteger(propertyId)) ||
      (contactId != null && !Number.isSafeInteger(contactId)) ||
      !await validateProperty(propertyId, program.businessId)) {
    res.status(400).json({ error: "Property is not available to this provider business" }); return;
  }
  if (contactId != null) {
    const [business] = await db.select({ legalBusinessId: businessesTable.legalBusinessId })
      .from(businessesTable).where(eq(businessesTable.id, program.businessId)).limit(1);
    const [link] = await db.select({ id: contactBusinessLinksTable.id })
      .from(contactBusinessLinksTable)
      .where(and(eq(contactBusinessLinksTable.contactId, contactId),
        eq(contactBusinessLinksTable.legalBusinessId, business?.legalBusinessId ?? program.businessId))).limit(1);
    if (!link) { res.status(400).json({ error: "Homeowner contact is not associated with this legal business" }); return; }
  }
  const price = req.body.agreedPrice == null ? null : Number(req.body.agreedPrice);
  if (price != null && (!Number.isFinite(price) || price < 0)) { res.status(400).json({ error: "Agreed price must be non-negative" }); return; }
  const [created] = await db.insert(contractWorkOrdersTable).values({
    businessId: program.businessId,
    programId,
    externalOrderNumber,
    title,
    scope: typeof req.body.scope === "string" ? req.body.scope.trim() || null : null,
    homeownerContactId: contactId,
    propertyId,
    agreedPrice: price == null ? null : price.toFixed(2),
    createdByUserId: getRequestUserId(req) ?? null,
  }).returning({ id: contractWorkOrdersTable.id });
  res.status(201).json(await getOrder(created.id));
});

router.post("/contract-work-orders/:id/decision", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id)) { res.status(400).json({ error: "Invalid work order id" }); return; }
  const scope = await requestedBusiness(req);
  if (!scope) { res.status(400).json({ error: "A business selection is required" }); return; }
  const decision = req.body?.decision;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!["accept", "decline", "cancel"].includes(decision)) { res.status(400).json({ error: "Invalid decision" }); return; }
  if (decision === "cancel" && !reason) { res.status(400).json({ error: "A cancellation reason is required" }); return; }
  const userId = getRequestUserId(req) ?? null;
  try {
    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(contractWorkOrdersTable)
        .where(and(eq(contractWorkOrdersTable.id, id), eq(contractWorkOrdersTable.businessId, scope.id)))
        .for("update").limit(1);
      if (!order) throw Object.assign(new Error("Work order not found"), { status: 404 });
      if (decision === "accept") {
        if (order.status === "accepted" && order.jobId != null) return;
        if (order.status !== "pending_review") throw Object.assign(new Error("Only pending work orders can be accepted"), { status: 409 });
        const [program] = await tx.select().from(contractClientProgramsTable)
          .where(and(eq(contractClientProgramsTable.id, order.programId), eq(contractClientProgramsTable.active, true))).limit(1);
        if (!program || program.businessId !== order.businessId) throw Object.assign(new Error("Contract program is inactive"), { status: 409 });
        if (!await validateProperty(order.propertyId, order.businessId)) throw Object.assign(new Error("Property access is no longer available"), { status: 409 });
        const [{ maxNum }] = await tx.select({ maxNum: sql<number>`COALESCE(MAX(${jobsTable.jobNumber}), 0)` }).from(jobsTable);
        const [job] = await tx.insert(jobsTable).values({
          title: order.title,
          description: order.scope,
          clientId: program.payerClientId,
          propertyId: order.propertyId,
          status: "scheduled",
          businessId: order.businessId,
          businessLine: scope.slug,
          jobNumber: (maxNum ?? 0) + 1,
          address: null,
          workflow: null,
        }).returning({ id: jobsTable.id });
        await addContractCompletionChecklist(tx, job.id, order.externalOrderNumber, {
          requiresInstallationPhotos: program.requiresInstallationPhotos,
          requiresCompletionDocumentation: program.requiresCompletionDocumentation,
        });
        await tx.update(contractWorkOrdersTable).set({
          status: "accepted", jobId: job.id, acceptedAt: new Date(), acceptedByUserId: userId,
        }).where(eq(contractWorkOrdersTable.id, id));
      } else if (decision === "decline") {
        if (order.status !== "pending_review") throw Object.assign(new Error("Only pending work orders can be declined"), { status: 409 });
        await tx.update(contractWorkOrdersTable).set({
          status: "declined", declinedAt: new Date(), declinedByUserId: userId, declineReason: reason || null,
        }).where(eq(contractWorkOrdersTable.id, id));
      } else {
        if (order.status !== "accepted" || order.jobId == null) throw Object.assign(new Error("Only accepted work orders can be cancelled"), { status: 409 });
        await tx.update(contractWorkOrdersTable).set({
          status: "cancelled", cancelledAt: new Date(), cancelledByUserId: userId, cancellationReason: reason,
        }).where(eq(contractWorkOrdersTable.id, id));
      }
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    res.status(status).json({ error: error instanceof Error ? error.message : "Failed to update work order" }); return;
  }
  const updated = await getOrder(id);
  if (!updated || updated.businessId !== scope.id) { res.status(404).json({ error: "Work order not found" }); return; }
  res.json(updated);
});

export default router;
