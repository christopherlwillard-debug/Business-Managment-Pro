import { Router } from "express";
import { db } from "@workspace/db";
import {
  prospectsTable,
  estimatesTable,
  clientsTable,
  prospectEventsTable,
  prospectServiceVisitsTable,
  PROSPECT_PROPERTY_TYPES,
  PROSPECT_STATUSES,
  type Prospect as ProspectRow,
} from "@workspace/db/schema";
import { eq, asc, desc, and, ilike, or, max, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { z } from "zod";

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
    city: p.city ?? null,
    state: p.state ?? null,
    zip: p.zip ?? null,
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
    linkedInvoiceId: p.linkedInvoiceId ?? null,
    stripePaymentLinkId: p.stripePaymentLinkId ?? null,
    stripePaymentLinkUrl: p.stripePaymentLinkUrl ?? null,
    depositPaidAt: p.depositPaidAt instanceof Date ? p.depositPaidAt.toISOString() : (p.depositPaidAt ?? null),
    depositPaidAmount: p.depositPaidAmount != null ? parseFloat(p.depositPaidAmount) : null,
    lastPaidAt: p.lastPaidAt instanceof Date ? p.lastPaidAt.toISOString() : (p.lastPaidAt ?? null),
    servicedAt: p.servicedAt ?? null,
    followUpDate: p.followUpDate ?? null,
    source: p.source ?? "manual",
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const { status, city, state, zip, location } = req.query;
    const statusFilter = typeof status === "string" && PROSPECT_STATUSES.includes(status as typeof PROSPECT_STATUSES[number])
      ? (status as typeof PROSPECT_STATUSES[number])
      : null;
    const cityFilter = typeof city === "string" && city.trim() ? city.trim() : null;
    const stateFilter = typeof state === "string" && state.trim() ? state.trim() : null;
    const zipFilter = typeof zip === "string" && zip.trim() ? zip.trim() : null;
    const locationSearch = typeof location === "string" && location.trim() ? `%${location.trim()}%` : null;

    const conditions = [
      statusFilter ? eq(prospectsTable.status, statusFilter) : null,
      cityFilter ? ilike(prospectsTable.city, `%${cityFilter}%`) : null,
      stateFilter ? ilike(prospectsTable.state, `%${stateFilter}%`) : null,
      zipFilter ? ilike(prospectsTable.zip, `%${zipFilter}%`) : null,
      locationSearch
        ? or(
            ilike(prospectsTable.city, locationSearch),
            ilike(prospectsTable.state, locationSearch),
            ilike(prospectsTable.zip, locationSearch)
          )
        : null,
    ].filter(Boolean) as Parameters<typeof and>;

    const rows = await db
      .select({ ...prospectsTable, estimateNumber: estimatesTable.title })
      .from(prospectsTable)
      .leftJoin(estimatesTable, eq(prospectsTable.linkedEstimateId, estimatesTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(prospectsTable.createdAt));

    res.json(rows.map((r) => format(r as ProspectWithEstimate)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch prospects" });
  }
});

router.get("/revenue-summary", async (_req, res) => {
  try {
    const now = new Date();
    const yr = now.getFullYear();
    const mo = now.getMonth() + 1;

    const [row] = await db
      .select({
        allTime: sql<string>`COALESCE(SUM(${prospectServiceVisitsTable.price}), 0)`,
        thisYear: sql<string>`COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM ${prospectServiceVisitsTable.servicedAt}::date) = ${yr} THEN ${prospectServiceVisitsTable.price} ELSE 0 END), 0)`,
        thisMonth: sql<string>`COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM ${prospectServiceVisitsTable.servicedAt}::date) = ${yr} AND EXTRACT(MONTH FROM ${prospectServiceVisitsTable.servicedAt}::date) = ${mo} THEN ${prospectServiceVisitsTable.price} ELSE 0 END), 0)`,
        visitCount: sql<number>`COUNT(CASE WHEN ${prospectServiceVisitsTable.price} IS NOT NULL THEN 1 END)`,
      })
      .from(prospectServiceVisitsTable);

    res.json({
      allTime: parseFloat(row?.allTime ?? "0"),
      thisYear: parseFloat(row?.thisYear ?? "0"),
      thisMonth: parseFloat(row?.thisMonth ?? "0"),
      visitCount: Number(row?.visitCount ?? 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch revenue summary" });
  }
});

const AI_IMPORT_SYSTEM_PROMPT = `You are a data extraction assistant for a contractor business app.
Given raw pasted text, extract all distinct business/property prospects and return them as a JSON object with a "prospects" array.

For each prospect found, extract:
- address: street address (required — skip entries with no identifiable street address)
- city: city name or null
- state: 2-letter US state abbreviation or null
- zip: 5-digit zip code or null
- contactName: person or business name or null
- contactPhone: phone number in any format or null
- contactEmail: email address or null
- propertyType: one of "Church", "Retail", "Apartment", "Industrial", "Other" — infer from context clues. Default to "Other"
- notes: any other relevant details or null

Rules:
- Only include entries that have at least a recognizable street address
- Do not invent or assume data — only extract what is present
- Return ONLY a valid JSON object matching the schema: { "prospects": [...] }
- If nothing useful is found, return { "prospects": [] }`;

const PROPERTY_TYPE_VALUES = ["Church", "Retail", "Apartment", "Industrial", "Other"] as const;

const prospectItemSchema = z.object({
  address: z.string().min(1),
  city: z.string().nullable().default(null),
  state: z.string().max(2).nullable().default(null),
  zip: z.string().max(5).nullable().default(null),
  contactName: z.string().nullable().default(null),
  contactPhone: z.string().nullable().default(null),
  contactEmail: z.string().nullable().default(null),
  propertyType: z.enum(PROPERTY_TYPE_VALUES).default("Other"),
  notes: z.string().nullable().default(null),
});

const aiImportResponseSchema = z.object({
  prospects: z.array(prospectItemSchema),
});

const AI_IMPORT_JSON_SCHEMA = {
  name: "prospect_list",
  strict: true,
  schema: {
    type: "object",
    properties: {
      prospects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            address: { type: "string", description: "Street address of the property" },
            city: { type: ["string", "null"], description: "City name or null if unknown" },
            state: { type: ["string", "null"], description: "Two-letter state abbreviation or null" },
            zip: { type: ["string", "null"], description: "5-digit zip code or null" },
            contactName: { type: ["string", "null"], description: "Full name of primary contact or null" },
            contactPhone: { type: ["string", "null"], description: "Phone number or null" },
            contactEmail: { type: ["string", "null"], description: "Email address or null" },
            propertyType: {
              type: "string",
              enum: ["Church", "Retail", "Apartment", "Industrial", "Other"],
              description: "Best-fit category for the property",
            },
            notes: { type: ["string", "null"], description: "Any other useful info or null" },
          },
          required: ["address", "city", "state", "zip", "contactName", "contactPhone", "contactEmail", "propertyType", "notes"],
          additionalProperties: false,
        },
      },
    },
    required: ["prospects"],
    additionalProperties: false,
  },
} as const;

router.post("/ai-import", async (req, res) => {
  try {
    const { text } = req.body as { text?: string };
    if (!text || typeof text !== "string" || text.trim().length < 5) {
      return res.status(400).json({ error: "text is required" });
    }
    if (text.length > 20000) {
      return res.status(400).json({ error: "Text too long (max 20,000 characters)" });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 4096,
      response_format: { type: "json_schema", json_schema: AI_IMPORT_JSON_SCHEMA },
      messages: [
        { role: "system", content: AI_IMPORT_SYSTEM_PROMPT },
        { role: "user", content: text.trim() },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(422).json({ error: "AI returned an unparseable response", prospects: [] });
    }

    const validated = aiImportResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.error("[prospects/ai-import] schema validation failed:", validated.error.issues);
      return res.status(422).json({ error: "AI response did not match expected schema", prospects: [] });
    }

    const prospects = validated.data.prospects
      .filter((p) => p.address.trim().length > 0)
      .map((p) => ({
        address: p.address.trim(),
        city: p.city?.trim() || null,
        state: p.state?.trim().toUpperCase().slice(0, 2) || null,
        zip: p.zip?.trim().replace(/\D/g, "").slice(0, 5) || null,
        contactName: p.contactName?.trim() || null,
        contactPhone: p.contactPhone?.trim() || null,
        contactEmail: p.contactEmail?.trim() || null,
        propertyType: p.propertyType,
        notes: p.notes?.trim() || null,
      }));

    res.json({ prospects });
  } catch (err) {
    console.error("[prospects/ai-import]", err);
    res.status(500).json({ error: "Failed to extract prospects" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [p] = await db
      .select({ ...prospectsTable, estimateNumber: estimatesTable.title })
      .from(prospectsTable)
      .leftJoin(estimatesTable, eq(prospectsTable.linkedEstimateId, estimatesTable.id))
      .where(eq(prospectsTable.id, id));

    if (!p) return res.status(404).json({ error: "Prospect not found" });

    const [events, visits] = await Promise.all([
      db.select().from(prospectEventsTable).where(eq(prospectEventsTable.prospectId, id)).orderBy(desc(prospectEventsTable.createdAt)),
      db.select().from(prospectServiceVisitsTable).where(eq(prospectServiceVisitsTable.prospectId, id)).orderBy(desc(prospectServiceVisitsTable.servicedAt)),
    ]);

    const formatted = {
      ...format(p as ProspectWithEstimate),
      statusHistory: events.map((e) => ({
        id: e.id,
        type: e.type,
        oldValue: e.oldValue ?? null,
        newValue: e.newValue ?? null,
        createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
      })),
      serviceVisits: visits.map((v) => ({
        id: v.id,
        servicedAt: v.servicedAt,
        notes: v.notes ?? null,
        price: v.price != null ? parseFloat(v.price) : null,
        createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
      })),
    };

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch prospect" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = req.body as {
      address: string;
      city?: string | null;
      state?: string | null;
      zip?: string | null;
      propertyType?: string;
      estimatedSqft?: number | null;
      roughQuote?: number | null;
      contactName?: string | null;
      contactPhone?: string | null;
      contactEmail?: string | null;
      notes?: string | null;
      status?: string;
      linkedEstimateId?: number | null;
      followUpDate?: string | null;
    };

    if (process.env.NODE_ENV !== "production") {
      console.log("[prospects POST] received:", JSON.stringify({ hasAddress: !!body.address, propertyType: body.propertyType, status: body.status, estimatedSqft: body.estimatedSqft }));
    }

    if (!body.address) return res.status(400).json({ error: "Address is required" });

    const [prospect] = await db
      .insert(prospectsTable)
      .values({
        address: body.address,
        city: body.city ?? null,
        state: body.state ?? null,
        zip: body.zip ?? null,
        propertyType: toProspectPropertyType(body.propertyType),
        estimatedSqft: body.estimatedSqft ?? null,
        roughQuote: body.roughQuote != null ? body.roughQuote.toString() : null,
        contactName: body.contactName ?? null,
        contactPhone: body.contactPhone ?? null,
        contactEmail: body.contactEmail ?? null,
        notes: body.notes ?? null,
        status: toProspectStatus(body.status),
        linkedEstimateId: body.linkedEstimateId ?? null,
        followUpDate: body.followUpDate ?? null,
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
      city?: string | null;
      state?: string | null;
      zip?: string | null;
      propertyType?: string;
      estimatedSqft?: number | null;
      roughQuote?: number | null;
      contactName?: string | null;
      contactPhone?: string | null;
      contactEmail?: string | null;
      notes?: string | null;
      status?: string;
      linkedEstimateId?: number | null;
      linkedInvoiceId?: number | null;
      servicedAt?: string | null;
      followUpDate?: string | null;
    };

    const [existing] = await db
      .select({ status: prospectsTable.status, linkedEstimateId: prospectsTable.linkedEstimateId, followUpDate: prospectsTable.followUpDate })
      .from(prospectsTable)
      .where(eq(prospectsTable.id, id));

    if (!existing) return res.status(404).json({ error: "Prospect not found" });

    const patch: Partial<typeof prospectsTable.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (body.address !== undefined) patch.address = body.address;
    if (body.city !== undefined) patch.city = body.city ?? null;
    if (body.state !== undefined) patch.state = body.state ?? null;
    if (body.zip !== undefined) patch.zip = body.zip ?? null;
    if (body.propertyType !== undefined) patch.propertyType = toProspectPropertyType(body.propertyType);
    if (body.estimatedSqft !== undefined) patch.estimatedSqft = body.estimatedSqft ?? null;
    if (body.roughQuote !== undefined) patch.roughQuote = body.roughQuote != null ? body.roughQuote.toString() : null;
    if (body.contactName !== undefined) patch.contactName = body.contactName ?? null;
    if (body.contactPhone !== undefined) patch.contactPhone = body.contactPhone ?? null;
    if (body.contactEmail !== undefined) patch.contactEmail = body.contactEmail ?? null;
    if (body.notes !== undefined) patch.notes = body.notes ?? null;
    if (body.status !== undefined) patch.status = toProspectStatus(body.status);
    if (body.linkedEstimateId !== undefined) patch.linkedEstimateId = body.linkedEstimateId ?? null;
    if (body.linkedInvoiceId !== undefined) patch.linkedInvoiceId = body.linkedInvoiceId ?? null;

    const isBeingServiced = patch.status === "serviced" && existing.status !== "serviced";
    const resolvedServicedAt = body.servicedAt ?? (isBeingServiced ? new Date().toISOString().slice(0, 10) : undefined);

    if (body.servicedAt !== undefined) {
      patch.servicedAt = body.servicedAt ?? null;
    } else if (isBeingServiced) {
      patch.servicedAt = resolvedServicedAt ?? null;
    }

    if (body.followUpDate !== undefined) {
      patch.followUpDate = body.followUpDate ?? null;
    } else if (resolvedServicedAt && !existing.followUpDate) {
      const serviceDate = new Date(resolvedServicedAt + "T00:00:00");
      serviceDate.setMonth(serviceDate.getMonth() + 30);
      patch.followUpDate = serviceDate.toISOString().slice(0, 10);
    }

    const statusChanged = body.status !== undefined && patch.status && patch.status !== existing.status;

    const estimateIdChanged = body.linkedEstimateId !== undefined &&
      (body.linkedEstimateId ?? null) !== (existing.linkedEstimateId ?? null);

    await db.transaction(async (tx) => {
      await tx.update(prospectsTable).set(patch).where(eq(prospectsTable.id, id));
      if (isBeingServiced && resolvedServicedAt) {
        const noVisitsYet = await tx
          .select({ id: prospectServiceVisitsTable.id })
          .from(prospectServiceVisitsTable)
          .where(eq(prospectServiceVisitsTable.prospectId, id))
          .limit(1);
        if (noVisitsYet.length === 0) {
          await tx.insert(prospectServiceVisitsTable).values({
            prospectId: id,
            servicedAt: resolvedServicedAt,
            notes: null,
            price: null,
          });
          await tx.insert(prospectEventsTable).values({
            prospectId: id,
            type: "service_visit_added",
            newValue: resolvedServicedAt,
          });
        }
      }
      if (statusChanged) {
        await tx.insert(prospectEventsTable).values({
          prospectId: id,
          type: "status_change",
          oldValue: existing.status,
          newValue: patch.status as string,
        });
      }
      if (estimateIdChanged) {
        const isLinking = (body.linkedEstimateId ?? null) !== null;
        let estimateNumber: string | null = null;
        if (isLinking && body.linkedEstimateId) {
          const [est] = await tx
            .select({ title: estimatesTable.title })
            .from(estimatesTable)
            .where(eq(estimatesTable.id, body.linkedEstimateId));
          estimateNumber = est?.title ?? null;
        }
        await tx.insert(prospectEventsTable).values({
          prospectId: id,
          type: isLinking ? "estimate_linked" : "estimate_unlinked",
          newValue: estimateNumber,
        });
      }
    });

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

router.post("/:id/service-visits", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const body = req.body as {
      servicedAt: string;
      notes?: string | null;
      price?: number | null;
    };

    if (!body.servicedAt) return res.status(400).json({ error: "servicedAt is required" });

    const [existing] = await db
      .select({ status: prospectsTable.status })
      .from(prospectsTable)
      .where(eq(prospectsTable.id, id));

    if (!existing) return res.status(404).json({ error: "Prospect not found" });

    await db.transaction(async (tx) => {
      await tx.insert(prospectServiceVisitsTable).values({
        prospectId: id,
        servicedAt: body.servicedAt,
        notes: body.notes ?? null,
        price: body.price != null ? body.price.toString() : null,
      });

      const [{ maxDate }] = await tx
        .select({ maxDate: max(prospectServiceVisitsTable.servicedAt) })
        .from(prospectServiceVisitsTable)
        .where(eq(prospectServiceVisitsTable.prospectId, id));

      const mostRecentDate = maxDate ?? body.servicedAt;
      const followUpDate = new Date(mostRecentDate + "T00:00:00");
      followUpDate.setMonth(followUpDate.getMonth() + 30);
      const followUpStr = followUpDate.toISOString().slice(0, 10);

      const prospectPatch: Partial<typeof prospectsTable.$inferInsert> & { updatedAt: Date } = {
        updatedAt: new Date(),
        servicedAt: mostRecentDate,
        followUpDate: followUpStr,
      };
      if (existing.status !== "serviced") {
        prospectPatch.status = "serviced";
      }
      await tx.update(prospectsTable).set(prospectPatch).where(eq(prospectsTable.id, id));

      if (existing.status !== "serviced") {
        await tx.insert(prospectEventsTable).values({
          prospectId: id,
          type: "status_change",
          oldValue: existing.status,
          newValue: "serviced",
        });
      }
      await tx.insert(prospectEventsTable).values({
        prospectId: id,
        type: "service_visit_added",
        newValue: body.servicedAt,
      });
    });

    const [[p], visits, events] = await Promise.all([
      db.select({ ...prospectsTable, estimateNumber: estimatesTable.title })
        .from(prospectsTable)
        .leftJoin(estimatesTable, eq(prospectsTable.linkedEstimateId, estimatesTable.id))
        .where(eq(prospectsTable.id, id)),
      db.select().from(prospectServiceVisitsTable).where(eq(prospectServiceVisitsTable.prospectId, id)).orderBy(desc(prospectServiceVisitsTable.servicedAt)),
      db.select().from(prospectEventsTable).where(eq(prospectEventsTable.prospectId, id)).orderBy(desc(prospectEventsTable.createdAt)),
    ]);

    if (!p) return res.status(404).json({ error: "Prospect not found" });

    res.status(201).json({
      ...format(p as ProspectWithEstimate),
      statusHistory: events.map((e) => ({
        id: e.id, type: e.type, oldValue: e.oldValue ?? null, newValue: e.newValue ?? null,
        createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
      })),
      serviceVisits: visits.map((v) => ({
        id: v.id, servicedAt: v.servicedAt, notes: v.notes ?? null,
        price: v.price != null ? parseFloat(v.price) : null,
        createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add service visit" });
  }
});

router.put("/:id/service-visits/:visitId", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const visitId = parseInt(req.params.visitId);
    if (isNaN(id) || isNaN(visitId)) return res.status(400).json({ error: "Invalid id" });

    const body = req.body as {
      servicedAt?: string;
      notes?: string | null;
      price?: number | null;
    };

    const [existing] = await db
      .select({ id: prospectsTable.id, status: prospectsTable.status })
      .from(prospectsTable)
      .where(eq(prospectsTable.id, id));

    if (!existing) return res.status(404).json({ error: "Prospect not found" });

    let updated = false;
    await db.transaction(async (tx) => {
      const patch: Partial<typeof prospectServiceVisitsTable.$inferInsert> = {};
      if (body.servicedAt !== undefined) patch.servicedAt = body.servicedAt;
      if (body.notes !== undefined) patch.notes = body.notes ?? null;
      if (body.price !== undefined) patch.price = body.price != null ? body.price.toString() : null;

      const [updatedRow] = await tx
        .update(prospectServiceVisitsTable)
        .set(patch)
        .where(
          and(
            eq(prospectServiceVisitsTable.id, visitId),
            eq(prospectServiceVisitsTable.prospectId, id)
          )
        )
        .returning({ id: prospectServiceVisitsTable.id });

      if (!updatedRow) return;
      updated = true;

      const remaining = await tx
        .select({ servicedAt: prospectServiceVisitsTable.servicedAt })
        .from(prospectServiceVisitsTable)
        .where(eq(prospectServiceVisitsTable.prospectId, id))
        .orderBy(desc(prospectServiceVisitsTable.servicedAt));

      if (remaining.length > 0) {
        const mostRecentDate = remaining[0].servicedAt;
        const followUpDate = new Date(mostRecentDate + "T00:00:00");
        followUpDate.setMonth(followUpDate.getMonth() + 30);
        const followUpStr = followUpDate.toISOString().slice(0, 10);
        await tx.update(prospectsTable).set({
          updatedAt: new Date(),
          servicedAt: mostRecentDate,
          followUpDate: followUpStr,
        }).where(eq(prospectsTable.id, id));
      }
    });

    if (!updated) return res.status(404).json({ error: "Service visit not found" });

    const [[p], visits, events] = await Promise.all([
      db.select({ ...prospectsTable, estimateNumber: estimatesTable.title })
        .from(prospectsTable)
        .leftJoin(estimatesTable, eq(prospectsTable.linkedEstimateId, estimatesTable.id))
        .where(eq(prospectsTable.id, id)),
      db.select().from(prospectServiceVisitsTable).where(eq(prospectServiceVisitsTable.prospectId, id)).orderBy(desc(prospectServiceVisitsTable.servicedAt)),
      db.select().from(prospectEventsTable).where(eq(prospectEventsTable.prospectId, id)).orderBy(desc(prospectEventsTable.createdAt)),
    ]);

    if (!p) return res.status(404).json({ error: "Prospect not found" });

    res.json({
      ...format(p as ProspectWithEstimate),
      statusHistory: events.map((e) => ({
        id: e.id, type: e.type, oldValue: e.oldValue ?? null, newValue: e.newValue ?? null,
        createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
      })),
      serviceVisits: visits.map((v) => ({
        id: v.id, servicedAt: v.servicedAt, notes: v.notes ?? null,
        price: v.price != null ? parseFloat(v.price) : null,
        createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update service visit" });
  }
});

router.delete("/:id/service-visits/:visitId", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const visitId = parseInt(req.params.visitId);
    if (isNaN(id) || isNaN(visitId)) return res.status(400).json({ error: "Invalid id" });

    const [existing] = await db
      .select({ id: prospectsTable.id, status: prospectsTable.status })
      .from(prospectsTable)
      .where(eq(prospectsTable.id, id));

    if (!existing) return res.status(404).json({ error: "Prospect not found" });

    let deleted = false;
    await db.transaction(async (tx) => {
      const [deletedRow] = await tx
        .delete(prospectServiceVisitsTable)
        .where(
          and(
            eq(prospectServiceVisitsTable.id, visitId),
            eq(prospectServiceVisitsTable.prospectId, id)
          )
        )
        .returning({ id: prospectServiceVisitsTable.id });

      if (!deletedRow) return;
      deleted = true;

      const remaining = await tx
        .select({ servicedAt: prospectServiceVisitsTable.servicedAt })
        .from(prospectServiceVisitsTable)
        .where(eq(prospectServiceVisitsTable.prospectId, id))
        .orderBy(desc(prospectServiceVisitsTable.servicedAt));

      if (remaining.length > 0) {
        const mostRecentDate = remaining[0].servicedAt;
        const followUpDate = new Date(mostRecentDate + "T00:00:00");
        followUpDate.setMonth(followUpDate.getMonth() + 30);
        const followUpStr = followUpDate.toISOString().slice(0, 10);
        await tx.update(prospectsTable).set({
          updatedAt: new Date(),
          servicedAt: mostRecentDate,
          followUpDate: followUpStr,
        }).where(eq(prospectsTable.id, id));
      } else {
        await tx.update(prospectsTable).set({
          updatedAt: new Date(),
          servicedAt: null,
          followUpDate: null,
        }).where(eq(prospectsTable.id, id));
      }
    });

    if (!deleted) return res.status(404).json({ error: "Service visit not found" });

    const [[p], visits, events] = await Promise.all([
      db.select({ ...prospectsTable, estimateNumber: estimatesTable.title })
        .from(prospectsTable)
        .leftJoin(estimatesTable, eq(prospectsTable.linkedEstimateId, estimatesTable.id))
        .where(eq(prospectsTable.id, id)),
      db.select().from(prospectServiceVisitsTable).where(eq(prospectServiceVisitsTable.prospectId, id)).orderBy(desc(prospectServiceVisitsTable.servicedAt)),
      db.select().from(prospectEventsTable).where(eq(prospectEventsTable.prospectId, id)).orderBy(desc(prospectEventsTable.createdAt)),
    ]);

    if (!p) return res.status(404).json({ error: "Prospect not found" });

    res.json({
      ...format(p as ProspectWithEstimate),
      statusHistory: events.map((e) => ({
        id: e.id, type: e.type, oldValue: e.oldValue ?? null, newValue: e.newValue ?? null,
        createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
      })),
      serviceVisits: visits.map((v) => ({
        id: v.id, servicedAt: v.servicedAt, notes: v.notes ?? null,
        price: v.price != null ? parseFloat(v.price) : null,
        createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete service visit" });
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

    if (!["won", "serviced"].includes(prospect.status)) {
      return res.status(400).json({ error: "Only won or serviced prospects can be converted to clients" });
    }

    if (prospect.clientId) {
      const [existing] = await db.select().from(clientsTable).where(eq(clientsTable.id, prospect.clientId));
      if (existing) {
        return res.status(409).json({ error: "Already converted", client: { ...existing, createdAt: existing.createdAt.toISOString() } });
      }
    }

    const [client] = await db
      .insert(clientsTable)
      .values({
        name: prospect.contactName ?? prospect.address,
        email: prospect.contactEmail ?? null,
        phone: prospect.contactPhone ?? null,
        address: prospect.address,
        city: prospect.city ?? null,
        state: prospect.state ?? null,
        zip: prospect.zip ?? null,
        notes: prospect.notes ?? null,
      })
      .returning();

    await db.update(prospectsTable)
      .set({ clientId: client.id })
      .where(eq(prospectsTable.id, id));

    res.status(201).json({ ...client, createdAt: client.createdAt.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to convert prospect to client" });
  }
});

export default router;
