import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  businessesTable,
  clientsTable,
  estimatesTable,
  propertiesTable,
  propertyBusinessAccessTable,
  propertyMeasurementRevisionsTable,
  servicePricingProfileVersionsTable,
} from "@workspace/db/schema";
import {
  CalculateAerialQuoteServiceBody,
  CreateAerialQuoteEstimateBody,
  CreateAerialQuotePricingProfileVersionBody,
  CreateAerialQuotePropertyBody,
  CreatePropertyMeasurementRevisionBody,
  GrantPropertyBusinessAccessBody,
  UpdateAerialQuotePropertyBody,
} from "@workspace/api-zod";
import {
  canonicalRecordBusiness,
  invalidBusinessScope,
  hasRequestedBusiness,
  requestedBusinessReadScope,
  requestedBusiness,
  resolveMutationBusiness,
  sameLegalBusiness,
} from "../lib/business-scope.js";
import { getRequestUserId } from "./guards.js";
import { calculateEstimateTotals } from "../lib/estimate-totals.js";
import { roundCurrency } from "@workspace/api-zod";
import { calculateServiceEstimate, servicePricingRulesSchema } from "../lib/aerial-quote-engine.js";
import { hasPropertyPermission } from "../lib/property-access.js";

const router = Router();
const serviceKeys = new Set([
  "lawn_mowing",
  "landscaping",
  "parking_lot_cleaning",
  "snow_removal",
  "asphalt_sealing",
  "property_maintenance",
]);

async function loadPropertyInScope(
  propertyId: number,
  businessId: number,
  permission: "view" | "measure" | "estimate" | "manage" = "view",
) {
  const [property] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, propertyId)).limit(1);
  if (!property) return { error: "Property not found" as const };
  if (property.businessId !== businessId) {
    const [grant] = await db.select({ permission: propertyBusinessAccessTable.permission })
      .from(propertyBusinessAccessTable)
      .where(and(
        eq(propertyBusinessAccessTable.propertyId, propertyId),
        eq(propertyBusinessAccessTable.businessId, businessId),
        isNull(propertyBusinessAccessTable.revokedAt),
      )).limit(1);
    if (!hasPropertyPermission(grant?.permission, permission)) return { error: "Property not found" as const };
  }
  return { property };
}

async function validateClient(clientId: number | null | undefined, businessId: number) {
  if (clientId == null) return true;
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId)).limit(1);
  if (!client) return false;
  const owner = await canonicalRecordBusiness(client);
  return owner.state === "resolved" && (owner.business.id === businessId || await sameLegalBusiness(owner.business.id, businessId));
}

router.get("/properties", async (req, res): Promise<void> => {
  const business = await requestedBusiness(req);
  if (!business) { res.status(400).json({ error: "A valid businessId is required" }); return; }
  const clientId = req.query.clientId == null ? null : Number(req.query.clientId);
  if (clientId != null && (!Number.isInteger(clientId) || clientId < 1)) {
    res.status(400).json({ error: "Invalid clientId" });
    return;
  }
  const grants = await db.select({
    propertyId: propertyBusinessAccessTable.propertyId,
    permission: propertyBusinessAccessTable.permission,
  })
    .from(propertyBusinessAccessTable).where(and(
      eq(propertyBusinessAccessTable.businessId, business.id),
      isNull(propertyBusinessAccessTable.revokedAt),
    ));
  const permissionsByProperty = new Map(grants.map(grant => [grant.propertyId, grant.permission]));
  const filters = [or(
    eq(propertiesTable.businessId, business.id),
    grants.length ? inArray(propertiesTable.id, grants.map(row => row.propertyId)) : undefined,
  )];
  if (clientId != null) filters.push(eq(propertiesTable.clientId, clientId));
  const rows = await db.select().from(propertiesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(propertiesTable.updatedAt));
  res.json(rows.map(property => ({
    ...property,
    accessPermission: property.businessId === business.id
      ? "manage"
      : permissionsByProperty.get(property.id) ?? "view",
  })));
});

router.post("/properties", async (req, res): Promise<void> => {
  const parsed = CreateAerialQuotePropertyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const owner = await resolveMutationBusiness(req);
  if (!owner.ok) { res.status(400).json({ error: owner.error }); return; }
  if (!await validateClient(parsed.data.clientId, owner.business.id)) {
    res.status(409).json({ error: "Client is not owned by this legal business" });
    return;
  }
  const [property] = await db.insert(propertiesTable).values({
    businessId: owner.business.id,
    clientId: parsed.data.clientId ?? null,
    label: parsed.data.label.trim(),
    street: parsed.data.street?.trim() || null,
    city: parsed.data.city?.trim() || null,
    state: parsed.data.state?.trim() || null,
    zip: parsed.data.zip?.trim() || null,
    notes: parsed.data.notes?.trim() || null,
  }).returning();
  await db.insert(propertyBusinessAccessTable).values({
    propertyId: property.id,
    businessId: owner.business.id,
    permission: "manage",
    grantedBy: getRequestUserId(req) ?? null,
  });
  res.status(201).json({ ...property, accessPermission: "manage" });
});

router.put("/properties/:propertyId", async (req, res): Promise<void> => {
  const propertyId = Number(req.params.propertyId);
  const parsed = UpdateAerialQuotePropertyBody.safeParse(req.body);
  const owner = await resolveMutationBusiness(req);
  if (!Number.isInteger(propertyId) || propertyId < 1 || !parsed.success || !owner.ok) {
    res.status(400).json({
      error: !parsed.success ? parsed.error.message
        : owner.ok ? "Invalid propertyId"
          : owner.error,
    });
    return;
  }
  if (!parsed.data.label.trim()) {
    res.status(400).json({ error: "Property label cannot be empty" });
    return;
  }
  const result = await loadPropertyInScope(propertyId, owner.business.id, "manage");
  if ("error" in result) {
    res.status(404).json({ error: result.error });
    return;
  }
  if (!await validateClient(parsed.data.clientId, result.property.businessId)) {
    res.status(409).json({ error: "Client is not owned by this legal business" });
    return;
  }
  const [updated] = await db.update(propertiesTable).set({
    clientId: parsed.data.clientId ?? null,
    label: parsed.data.label.trim(),
    street: parsed.data.street?.trim() || null,
    city: parsed.data.city?.trim() || null,
    state: parsed.data.state?.trim() || null,
    zip: parsed.data.zip?.trim() || null,
    notes: parsed.data.notes?.trim() || null,
    updatedAt: new Date(),
  }).where(eq(propertiesTable.id, propertyId)).returning();
  if (!updated) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  res.json({ ...updated, accessPermission: "manage" });
});

router.get("/properties/:propertyId/access", async (req, res): Promise<void> => {
  const propertyId = Number(req.params.propertyId);
  const business = await requestedBusiness(req);
  if (!business || !Number.isInteger(propertyId) || propertyId < 1) {
    res.status(400).json({ error: "Valid businessId and propertyId are required" }); return;
  }
  const [property] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, propertyId)).limit(1);
  if (!property || property.businessId !== business.id) { res.status(404).json({ error: "Property not found" }); return; }
  const grants = await db.select({
    id: propertyBusinessAccessTable.id,
    propertyId: propertyBusinessAccessTable.propertyId,
    businessId: propertyBusinessAccessTable.businessId,
    businessSlug: businessesTable.slug,
    permission: propertyBusinessAccessTable.permission,
    createdAt: propertyBusinessAccessTable.createdAt,
    grantedBy: propertyBusinessAccessTable.grantedBy,
  }).from(propertyBusinessAccessTable)
    .innerJoin(businessesTable, eq(propertyBusinessAccessTable.businessId, businessesTable.id))
    .where(and(eq(propertyBusinessAccessTable.propertyId, propertyId), isNull(propertyBusinessAccessTable.revokedAt)));
  res.json(grants);
});

router.post("/properties/:propertyId/access", async (req, res): Promise<void> => {
  const propertyId = Number(req.params.propertyId);
  const parsed = GrantPropertyBusinessAccessBody.safeParse(req.body);
  const owner = await resolveMutationBusiness(req);
  if (!Number.isInteger(propertyId) || propertyId < 1 || !parsed.success || !owner.ok) {
    res.status(400).json({ error: parsed.success ? "Invalid propertyId or business" : parsed.error.message }); return;
  }
  const [property] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, propertyId)).limit(1);
  if (!property || property.businessId !== owner.business.id) { res.status(404).json({ error: "Property not found" }); return; }
  if (!await sameLegalBusiness(property.businessId, parsed.data.targetBusinessId)) {
    res.status(403).json({ error: "Property sharing is limited to the same legal business" }); return;
  }
  const [target] = await db.select({ id: businessesTable.id, slug: businessesTable.slug }).from(businessesTable)
    .where(eq(businessesTable.id, parsed.data.targetBusinessId)).limit(1);
  if (!target) { res.status(400).json({ error: "Unknown target business" }); return; }
  const created = await db.transaction(async tx => {
    await tx.update(propertyBusinessAccessTable).set({
      revokedAt: new Date(),
      revokedBy: getRequestUserId(req) ?? null,
    }).where(and(
      eq(propertyBusinessAccessTable.propertyId, propertyId),
      eq(propertyBusinessAccessTable.businessId, target.id),
      isNull(propertyBusinessAccessTable.revokedAt),
    ));
    const [grant] = await tx.insert(propertyBusinessAccessTable).values({
      propertyId,
      businessId: target.id,
      permission: parsed.data.permission,
      grantedBy: getRequestUserId(req) ?? null,
    }).returning();
    return grant;
  });
  res.status(201).json({
    id: created.id,
    propertyId,
    businessId: target.id,
    businessSlug: target.slug,
    permission: created.permission,
    createdAt: created.createdAt.toISOString(),
    grantedBy: created.grantedBy,
  });
});

router.delete("/properties/:propertyId/access/:businessId", async (req, res): Promise<void> => {
  const propertyId = Number(req.params.propertyId);
  const targetBusinessId = Number(req.params.businessId);
  const owner = await resolveMutationBusiness(req);
  if (!Number.isInteger(propertyId) || propertyId < 1 || !Number.isInteger(targetBusinessId) || !owner.ok) {
    res.status(400).json({ error: "Invalid property or business" }); return;
  }
  const [property] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, propertyId)).limit(1);
  if (!property || property.businessId !== owner.business.id) { res.status(404).json({ error: "Property not found" }); return; }
  await db.update(propertyBusinessAccessTable).set({
    revokedAt: new Date(),
    revokedBy: getRequestUserId(req) ?? null,
  }).where(and(
    eq(propertyBusinessAccessTable.propertyId, propertyId),
    eq(propertyBusinessAccessTable.businessId, targetBusinessId),
    isNull(propertyBusinessAccessTable.revokedAt),
  ));
  res.status(204).end();
});

router.get("/properties/:propertyId/measurement-revisions", async (req, res): Promise<void> => {
  const propertyId = Number(req.params.propertyId);
  if (!Number.isInteger(propertyId) || propertyId < 1) { res.status(400).json({ error: "Invalid propertyId" }); return; }
  const business = await requestedBusiness(req);
  if (!business) { res.status(400).json({ error: "A valid businessId is required" }); return; }
  const result = await loadPropertyInScope(propertyId, business.id, "view");
  if ("error" in result) { res.status(404).json({ error: result.error }); return; }
  const revisions = await db.select().from(propertyMeasurementRevisionsTable)
    .where(eq(propertyMeasurementRevisionsTable.propertyId, propertyId))
    .orderBy(desc(propertyMeasurementRevisionsTable.revision));
  res.json(revisions);
});

router.post("/properties/:propertyId/measurement-revisions", async (req, res): Promise<void> => {
  const propertyId = Number(req.params.propertyId);
  if (!Number.isInteger(propertyId) || propertyId < 1) { res.status(400).json({ error: "Invalid propertyId" }); return; }
  const parsed = CreatePropertyMeasurementRevisionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const business = await requestedBusiness(req);
  if (!business) { res.status(400).json({ error: "A valid businessId is required" }); return; }
  const result = await loadPropertyInScope(propertyId, business.id, "measure");
  if ("error" in result) { res.status(404).json({ error: result.error }); return; }

  const entries = parsed.data.entries;
  for (const entry of entries) {
    if ((entry.kind === "area" && !["sq_ft", "acre", "sq_yd"].includes(entry.unit))
      || (entry.kind === "length" && !["ft", "yd", "mile"].includes(entry.unit))
      || (entry.kind === "count" && !["item", "hour"].includes(entry.unit))) {
      res.status(400).json({ error: `Unit ${entry.unit} does not match measurement type ${entry.kind}` });
      return;
    }
  }
  const revision = await db.transaction(async (tx) => {
    await tx.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.id, propertyId)).for("update");
    const [latest] = await tx.select({ revision: propertyMeasurementRevisionsTable.revision })
      .from(propertyMeasurementRevisionsTable)
      .where(eq(propertyMeasurementRevisionsTable.propertyId, propertyId))
      .orderBy(desc(propertyMeasurementRevisionsTable.revision)).limit(1);
    const [created] = await tx.insert(propertyMeasurementRevisionsTable).values({
      propertyId,
      revision: (latest?.revision ?? 0) + 1,
      source: parsed.data.source,
      entries,
      notes: parsed.data.notes ?? null,
      createdBy: getRequestUserId(req) ?? null,
    }).returning();
    return created;
  });
  res.status(201).json(revision);
});

router.get("/pricing-profiles", async (req, res): Promise<void> => {
  const business = await requestedBusiness(req);
  if (!business) { res.status(400).json({ error: "A valid businessId is required" }); return; }
  const rows = await db.select().from(servicePricingProfileVersionsTable)
    .where(eq(servicePricingProfileVersionsTable.businessId, business.id))
    .orderBy(desc(servicePricingProfileVersionsTable.version));
  const latest = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    const key = `${row.businessId}:${row.serviceKey}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  res.json([...latest.values()]);
});

router.post("/pricing-profiles", async (req, res): Promise<void> => {
  const parsed = CreateAerialQuotePricingProfileVersionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const owner = await resolveMutationBusiness(req);
  if (!owner.ok) { res.status(400).json({ error: owner.error }); return; }
  if (!serviceKeys.has(parsed.data.serviceKey)) { res.status(400).json({ error: "Unsupported service profile" }); return; }
  const rules = servicePricingRulesSchema.safeParse(parsed.data.rules);
  if (!rules.success) { res.status(400).json({ error: rules.error.message }); return; }
  const created = await db.transaction(async (tx) => {
    await tx.select({ id: businessesTable.id }).from(businessesTable)
      .where(eq(businessesTable.id, owner.business.id)).for("update");
    const [latest] = await tx.select({ version: servicePricingProfileVersionsTable.version })
      .from(servicePricingProfileVersionsTable)
      .where(and(
        eq(servicePricingProfileVersionsTable.businessId, owner.business.id),
        eq(servicePricingProfileVersionsTable.serviceKey, parsed.data.serviceKey),
      ))
      .orderBy(desc(servicePricingProfileVersionsTable.version)).limit(1);
    const [profile] = await tx.insert(servicePricingProfileVersionsTable).values({
      businessId: owner.business.id,
      serviceKey: parsed.data.serviceKey,
      version: (latest?.version ?? 0) + 1,
      displayName: parsed.data.displayName.trim(),
      rules: rules.data,
      createdBy: getRequestUserId(req) ?? null,
    }).returning();
    return profile;
  });
  res.status(201).json(created);
});

async function calculateForRequest(input: {
  businessId: number;
  propertyId: number;
  measurementRevisionId: number;
  serviceKey: string;
  profileVersion: number;
}, businessId: number) {
  const propertyResult = await loadPropertyInScope(input.propertyId, businessId, "estimate");
  if ("error" in propertyResult) throw new Error(propertyResult.error);
  const [revision] = await db.select().from(propertyMeasurementRevisionsTable).where(and(
    eq(propertyMeasurementRevisionsTable.id, input.measurementRevisionId),
    eq(propertyMeasurementRevisionsTable.propertyId, input.propertyId),
  )).limit(1);
  if (!revision) throw new Error("Measurement revision not found");
  const [profile] = await db.select().from(servicePricingProfileVersionsTable).where(and(
    eq(servicePricingProfileVersionsTable.businessId, businessId),
    eq(servicePricingProfileVersionsTable.serviceKey, input.serviceKey),
    eq(servicePricingProfileVersionsTable.version, input.profileVersion),
  )).limit(1);
  if (!profile) throw new Error("Pricing profile version not found");
  return {
    property: propertyResult.property,
    revision,
    profile,
    result: calculateServiceEstimate({
      serviceKey: input.serviceKey,
      profileVersion: input.profileVersion,
      rules: profile.rules,
      entries: revision.entries,
    }),
  };
}

router.post("/calculate", async (req, res): Promise<void> => {
  const parsed = CalculateAerialQuoteServiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const business = await requestedBusiness(req);
  if (!business) { res.status(400).json({ error: "A valid businessId is required" }); return; }
  try {
    const { result } = await calculateForRequest(parsed.data, business.id);
    res.json({
      ...result,
      lineItems: result.lineItems.map((line, index) => ({
        id: index + 1,
        ...line,
        total: roundCurrency(line.quantity * line.unitCost),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calculation failed";
    res.status(message.includes("not found") ? 404 : 400).json({ error: message });
  }
});

router.post("/estimates", async (req, res): Promise<void> => {
  const parsed = CreateAerialQuoteEstimateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const owner = await resolveMutationBusiness(req);
  if (!owner.ok) { res.status(400).json({ error: owner.error }); return; }
  try {
    const { property, result } = await calculateForRequest(parsed.data, owner.business.id);
    const clientId = parsed.data.clientId ?? property.clientId;
    if (!await validateClient(clientId, owner.business.id)) {
      res.status(409).json({ error: "Client is not owned by this legal business" });
      return;
    }
    const workAddress = [property.street, property.city, property.state, property.zip].filter(Boolean).join(", ") || null;
    const { subtotal, total } = calculateEstimateTotals(result.lineItems, null, null);
    const [estimate] = await db.insert(estimatesTable).values({
      title: parsed.data.title.trim(),
      clientId: clientId ?? null,
      propertyId: property.id,
      template: "Aerial Quote",
      status: "draft",
      subtotal: subtotal.toString(),
      total: total.toString(),
      workAddress,
      notes: parsed.data.notes ?? null,
      lineItems: result.lineItems.map((line, index) => ({ ...line, id: index + 1 })),
      calculationSnapshot: {
        propertyId: property.id,
        measurementRevisionId: parsed.data.measurementRevisionId,
        serviceKey: result.serviceKey,
        profileVersion: result.profileVersion,
        calculation: result.calculationSnapshot,
      },
      businessId: owner.business.id,
      businessLine: owner.business.slug,
    }).returning();
    res.status(201).json({
      id: estimate.id,
      title: estimate.title,
      clientId: estimate.clientId,
      propertyId: estimate.propertyId,
      status: estimate.status,
      subtotal: Number(estimate.subtotal),
      total: Number(estimate.total),
      workAddress: estimate.workAddress,
      lineItems: result.lineItems.map((line, index) => ({
        id: index + 1,
        ...line,
        total: roundCurrency(line.quantity * line.unitCost),
      })),
      createdAt: estimate.createdAt.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Estimate creation failed";
    res.status(message.includes("not found") ? 404 : 400).json({ error: message });
  }
});

export default router;
