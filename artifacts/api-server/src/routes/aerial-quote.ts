import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  businessesTable,
  clientsTable,
  estimatesTable,
  propertiesTable,
  propertyMeasurementRevisionsTable,
  servicePricingProfileVersionsTable,
} from "@workspace/db/schema";
import {
  CalculateAerialQuoteServiceBody,
  CreateAerialQuoteEstimateBody,
  CreateAerialQuotePricingProfileVersionBody,
  CreateAerialQuotePropertyBody,
  CreatePropertyMeasurementRevisionBody,
} from "@workspace/api-zod";
import {
  type BusinessReadScope,
  belongsToBusinessReadScope,
  canonicalRecordBusiness,
  invalidBusinessScope,
  hasRequestedBusiness,
  requestedBusinessReadScope,
  resolveMutationBusiness,
  sameLegalBusiness,
} from "../lib/business-scope.js";
import { getRequestUserId } from "./guards.js";
import { calculateEstimateTotals } from "../lib/estimate-totals.js";
import { roundCurrency } from "@workspace/api-zod";
import { calculateServiceEstimate, servicePricingRulesSchema } from "../lib/aerial-quote-engine.js";

const router = Router();
const serviceKeys = new Set([
  "lawn_mowing",
  "landscaping",
  "parking_lot_cleaning",
  "snow_removal",
  "asphalt_sealing",
  "property_maintenance",
]);

async function loadPropertyInScope(propertyId: number, scope: BusinessReadScope | null) {
  const [property] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, propertyId)).limit(1);
  if (!property || (scope && !belongsToBusinessReadScope({ businessId: property.businessId }, scope))) {
    return { error: "Property not found" as const };
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
  const scope = await requestedBusinessReadScope(req);
  if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
  const clientId = req.query.clientId == null ? null : Number(req.query.clientId);
  if (clientId != null && (!Number.isInteger(clientId) || clientId < 1)) {
    res.status(400).json({ error: "Invalid clientId" });
    return;
  }
  const filters = [];
  if (scope) filters.push(inArray(propertiesTable.businessId, scope.memberIds));
  if (clientId != null) filters.push(eq(propertiesTable.clientId, clientId));
  const rows = await db.select().from(propertiesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(propertiesTable.updatedAt));
  res.json(rows);
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
  res.status(201).json(property);
});

router.get("/properties/:propertyId/measurement-revisions", async (req, res): Promise<void> => {
  const propertyId = Number(req.params.propertyId);
  if (!Number.isInteger(propertyId) || propertyId < 1) { res.status(400).json({ error: "Invalid propertyId" }); return; }
  const scope = await requestedBusinessReadScope(req);
  if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
  const result = await loadPropertyInScope(propertyId, scope);
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
  const scope = await requestedBusinessReadScope(req);
  if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
  const result = await loadPropertyInScope(propertyId, scope);
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
  const scope = await requestedBusinessReadScope(req);
  if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
  const rows = await db.select().from(servicePricingProfileVersionsTable)
    .where(scope ? inArray(servicePricingProfileVersionsTable.businessId, scope.memberIds) : undefined)
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
  propertyId: number;
  measurementRevisionId: number;
  serviceKey: string;
  profileVersion: number;
}, scope: BusinessReadScope | null) {
  const propertyResult = await loadPropertyInScope(input.propertyId, scope);
  if ("error" in propertyResult) throw new Error(propertyResult.error);
  const [revision] = await db.select().from(propertyMeasurementRevisionsTable).where(and(
    eq(propertyMeasurementRevisionsTable.id, input.measurementRevisionId),
    eq(propertyMeasurementRevisionsTable.propertyId, input.propertyId),
  )).limit(1);
  if (!revision) throw new Error("Measurement revision not found");
  const [profile] = await db.select().from(servicePricingProfileVersionsTable).where(and(
    eq(servicePricingProfileVersionsTable.businessId, propertyResult.property.businessId),
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
  const scope = await requestedBusinessReadScope(req);
  if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
  try {
    const { result } = await calculateForRequest(parsed.data, scope);
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
  const scope = await requestedBusinessReadScope(req);
  if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
  try {
    const { property, result } = await calculateForRequest(parsed.data, scope);
    if (property.businessId !== owner.business.id) {
      res.status(409).json({ error: "Estimate business conflicts with the property" });
      return;
    }
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
