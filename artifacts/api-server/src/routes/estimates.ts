import { Router, type Request } from "express";
import { db } from "@workspace/db";
import {
  estimateQuoteEventsTable,
  estimatesTable,
  clientsTable,
  jobsTable,
  businessesTable,
  settingsTable,
} from "@workspace/db/schema";
import { eq, asc, getTableColumns, and, sql } from "drizzle-orm";
import {
  canonicalRecordBusiness,
  requestedBusinessReadScope,
  businessReadPredicate,
  belongsToBusinessReadScope,
  invalidBusinessScope,
  hasRequestedBusiness,
  sameLegalBusiness,
  generalContractingBusiness,
  resolveMutationBusiness,
  type BusinessScope,
} from "../lib/business-scope.js";
import { calculateEstimateTotals, estimateLineAmount, expandEstimateLinesForInvoice } from "../lib/estimate-totals.js";
import { buildEstimateQuoteSnapshot } from "../lib/estimateQuoteSnapshot.js";
import { loadInvoiceBrand } from "../lib/invoiceBranding.js";
import { generateEstimateQuotePdf } from "../lib/generateEstimateQuotePdf.js";

const router = Router();

async function resolveLinkedJobOwner(jobId: number): Promise<
  | { ok: true; business: BusinessScope }
  | { ok: false; status: 400 | 409; error: string }
> {
  const [job] = await db.select({
    id: jobsTable.id,
    businessId: jobsTable.businessId,
    businessLine: jobsTable.businessLine,
  }).from(jobsTable).where(eq(jobsTable.id, jobId));
  if (!job) return { ok: false, status: 400, error: "Job not found" };

  const ownership = await canonicalRecordBusiness(job);
  if (ownership.state === "invalid") {
    return { ok: false, status: 409, error: "Linked job has invalid business ownership" };
  }
  const business = ownership.state === "resolved"
    ? ownership.business
    : await generalContractingBusiness();
  if (!business) {
    return { ok: false, status: 409, error: "General Contracting business was not found" };
  }
  return { ok: true, business };
}

function format(e: any, clientName?: string | null, jobTitle?: string | null) {
  const lineItems = Array.isArray(e.lineItems) ? e.lineItems : [];
  return {
    ...e,
    clientName: clientName ?? null,
    jobTitle: jobTitle ?? null,
    subtotal: parseFloat(e.subtotal ?? "0"),
    markupPercent: e.markupPercent ? parseFloat(e.markupPercent) : null,
    contingencyPercent: e.contingencyPercent ? parseFloat(e.contingencyPercent) : null,
    total: parseFloat(e.total ?? "0"),
    quoteExpiresAt: e.quoteExpiresAt ?? null,
    lineItems: lineItems.map((li: any, i: number) => ({
      id: li.id ?? i + 1,
      category: li.category,
      description: li.description,
      quantity: parseFloat(li.quantity),
      unit: li.unit ?? null,
      unitCost: parseFloat(li.unitCost),
      total: estimateLineAmount(li),
    })),
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
  };
}

function joinAddress(parts: Array<string | null | undefined>): string | null {
  const address = parts.map(part => part?.trim()).filter(Boolean).join(", ");
  return address || null;
}

async function resolveWorkAddress(
  workAddress: unknown,
  clientId: unknown,
  jobId: unknown,
): Promise<string | null> {
  if (typeof workAddress === "string" && workAddress.trim()) return workAddress.trim();
  if (jobId) {
    const [job] = await db.select({
      address: jobsTable.address,
      city: jobsTable.city,
      state: jobsTable.state,
    }).from(jobsTable).where(eq(jobsTable.id, Number(jobId)));
    const jobAddress = job ? joinAddress([job.address, job.city, job.state]) : null;
    if (jobAddress) return jobAddress;
  }
  if (clientId) {
    const [client] = await db.select({
      address: clientsTable.address,
      city: clientsTable.city,
      state: clientsTable.state,
      zip: clientsTable.zip,
    }).from(clientsTable).where(eq(clientsTable.id, Number(clientId)));
    return client ? joinAddress([client.address, client.city, client.state, client.zip]) : null;
  }
  return null;
}

router.get("/", async (req, res) => {
  try {
    const scope = await requestedBusinessReadScope(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    const estimates = await db
      .select({ ...getTableColumns(estimatesTable), clientName: clientsTable.name, jobTitle: jobsTable.title })
      .from(estimatesTable)
      .leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id))
      .leftJoin(jobsTable, eq(estimatesTable.jobId, jobsTable.id))
      .where(businessReadPredicate(estimatesTable, scope))
      .orderBy(estimatesTable.createdAt);
    res.json(estimates.map(e => format(e as any, (e as any).clientName, (e as any).jobTitle)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch estimates" });
  }
});

router.get("/by-job/:jobId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });
    const scope = await requestedBusinessReadScope(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    if (scope) {
      const [job] = await db.select({ businessId: jobsTable.businessId, businessLine: jobsTable.businessLine })
        .from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!job || !belongsToBusinessReadScope(job, scope)) return res.status(404).json({ error: "Job not found" });
    }
    const estimates = await db
      .select({ ...getTableColumns(estimatesTable), clientName: clientsTable.name })
      .from(estimatesTable)
      .leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id))
      .where(and(eq(estimatesTable.jobId, jobId), businessReadPredicate(estimatesTable, scope)))
      .orderBy(asc(estimatesTable.createdAt));
    res.json(estimates.map(e => format(e, e.clientName)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch estimates" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, clientId, template, status, markupPercent, contingencyPercent, jobType, notes, customerNotes, lineItems = [], jobId, workAddress, quoteExpiresAt } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });
    const requestedOwner = await resolveMutationBusiness(req);
    if (!requestedOwner.ok) return res.status(400).json({ error: requestedOwner.error });

    let owner = requestedOwner.business;
    if (jobId) {
      const linkedOwner = await resolveLinkedJobOwner(Number(jobId));
      if (!linkedOwner.ok) return res.status(linkedOwner.status).json({ error: linkedOwner.error });
      if (requestedOwner.explicit && requestedOwner.business.id !== linkedOwner.business.id) {
        return res.status(409).json({ error: "Estimate business conflicts with the linked job" });
      }
      owner = linkedOwner.business;
    }

    const { subtotal, total } = calculateEstimateTotals(lineItems, markupPercent, contingencyPercent);
    const savedWorkAddress = await resolveWorkAddress(workAddress, clientId, jobId);
    const [brandBusiness] = await db.select().from(businessesTable).where(eq(businessesTable.id, owner.id));
    const validityDays = Math.min(365, Math.max(1, brandBusiness?.defaultQuoteValidityDays ?? 30));
    const defaultExpiry = new Date();
    defaultExpiry.setDate(defaultExpiry.getDate() + validityDays);
    const savedTerms = customerNotes ?? brandBusiness?.defaultQuoteTerms ?? null;

    const [estimate] = await db.insert(estimatesTable).values({
      title, clientId: clientId || null, template,
      status: status || "draft",
      subtotal: subtotal.toString(),
      markupPercent: markupPercent?.toString() ?? null,
      contingencyPercent: contingencyPercent?.toString() ?? null,
      total: total.toString(),
      jobType, notes, workAddress: savedWorkAddress, customerNotes: savedTerms,
      quoteExpiresAt: quoteExpiresAt || defaultExpiry.toISOString().slice(0, 10),
      lineItems: lineItems.map((li: any, i: number) => ({ ...li, id: i + 1 })),
      jobId: jobId || null,
      businessId: owner.id,
      businessLine: owner.slug,
    }).returning();

    let clientName = null;
    if (estimate.clientId) {
      const [c] = await db.select().from(clientsTable).where(eq(clientsTable.id, estimate.clientId));
      clientName = c?.name;
    }
    res.status(201).json(format(estimate, clientName));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create estimate" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const scope = await requestedBusinessReadScope(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    if (scope) {
      const [owner] = await db.select({ businessId: estimatesTable.businessId, businessLine: estimatesTable.businessLine })
        .from(estimatesTable).where(eq(estimatesTable.id, id));
      if (!owner || !belongsToBusinessReadScope(owner, scope)) return res.status(404).json({ error: "Estimate not found" });
    }
    const [e] = await db
      .select({ ...getTableColumns(estimatesTable), clientName: clientsTable.name, jobTitle: jobsTable.title })
      .from(estimatesTable)
      .leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id))
      .leftJoin(jobsTable, eq(estimatesTable.jobId, jobsTable.id))
      .where(eq(estimatesTable.id, id));
    if (!e) return res.status(404).json({ error: "Estimate not found" });
    res.json(format(e, e.clientName, e.jobTitle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch estimate" });
  }
});

router.get("/:id/pdf", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const scope = await requestedBusinessReadScope(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    if (scope) {
      const [owner] = await db.select({ businessId: estimatesTable.businessId, businessLine: estimatesTable.businessLine })
        .from(estimatesTable).where(eq(estimatesTable.id, id));
      if (!owner || !belongsToBusinessReadScope(owner, scope)) return res.status(404).json({ error: "Estimate not found" });
    }
    const [estimate] = await db.select({
      ...getTableColumns(estimatesTable),
      clientName: clientsTable.name,
      clientEmail: clientsTable.email,
      clientPhone: clientsTable.phone,
      clientAddress: clientsTable.address,
      clientCity: clientsTable.city,
      clientState: clientsTable.state,
      clientZip: clientsTable.zip,
    }).from(estimatesTable)
      .leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id))
      .where(eq(estimatesTable.id, id));
    if (!estimate) return res.status(404).json({ error: "Estimate not found" });

    const business = estimate.businessId
      ? (await db.select().from(businessesTable).where(eq(businessesTable.id, estimate.businessId)))[0]
      : (await db.select().from(businessesTable).where(eq(businessesTable.slug, estimate.businessLine ?? "")))[0];
    const settings = (await db.select().from(settingsTable).limit(1))[0] ?? null;
    const brand = await loadInvoiceBrand(estimate.businessLine, settings, business);
    const rawItems = Array.isArray(estimate.lineItems) ? estimate.lineItems as any[] : [];
    const expanded = expandEstimateLinesForInvoice(
      rawItems,
      estimate.markupPercent == null ? null : Number(estimate.markupPercent),
      estimate.contingencyPercent == null ? null : Number(estimate.contingencyPercent),
    );
    let expandedIndex = 0;
    const pricedLines = rawItems.map(source => {
      if (!String(source.description ?? "").trim()) return null;
      return expanded[expandedIndex++] ?? null;
    });
    const amountAt = (index: number) => {
      const line = pricedLines[index];
      return line ? Math.round(line.quantity * line.unitPrice * 100) / 100 : 0;
    };
    const tax = rawItems.reduce((sum, item, index) =>
      sum + (String(item.category ?? "").trim().toLowerCase() === "tax" ? amountAt(index) : 0), 0);
    const adjustment = rawItems.reduce((sum, item, index) =>
      sum + (String(item.category ?? "").trim().toLowerCase() === "adjustment" ? amountAt(index) : 0), 0);
    const nonTax = rawItems.reduce((sum, item, index) =>
      sum + (String(item.category ?? "").trim().toLowerCase() !== "tax" ? amountAt(index) : 0), 0);
    const subtotal = Math.round((nonTax - adjustment) * 100) / 100;
    const storedTotal = Number(estimate.total ?? 0);
    if (Math.round((subtotal + adjustment + tax) * 100) / 100 !== Math.round(storedTotal * 100) / 100) {
      return res.status(409).json({ error: "Customer pricing does not reconcile with the saved estimate. Review the draft before generating a quote." });
    }
    const items = rawItems.flatMap((source, index) => {
      const category = String(source.category ?? "").trim().toLowerCase();
      if (category === "tax" || category === "adjustment") return [];
      if (!pricedLines[index]) return [];
      return [{ description: String(source.description ?? ""), quantity: Number(source.quantity ?? 1), unit: source.unit ?? null, amount: amountAt(index) }];
    });
    const expiresAt = estimate.quoteExpiresAt ?? null;
    const issueDate = estimate.createdAt instanceof Date ? estimate.createdAt.toISOString() : String(estimate.createdAt);
    const quoteNo = `Q-${issueDate.slice(0, 4)}-${String(estimate.id).padStart(6, "0")}`;
    const pdf = await generateEstimateQuotePdf({
      quoteNumber: quoteNo,
      title: estimate.title,
      issuedAt: issueDate,
      expiresAt,
      customerName: estimate.clientName ?? null,
      customerEmail: estimate.clientEmail ?? null,
      customerPhone: estimate.clientPhone ?? null,
      billingAddress: joinAddress([estimate.clientAddress, estimate.clientCity, estimate.clientState, estimate.clientZip]),
      workAddress: estimate.workAddress ?? null,
      jobType: estimate.jobType ?? null,
      terms: estimate.customerNotes ?? business?.defaultQuoteTerms ?? settings?.defaultPaymentTerms ?? null,
      items,
      subtotal,
      adjustment,
      tax,
      total: storedTotal,
      brand: {
        name: brand.displayName,
        address: brand.address,
        city: brand.city,
        state: brand.state,
        zip: brand.zip,
        phone: brand.phone,
        email: brand.email,
        website: business?.website ?? null,
        logo: brand.logo?.buffer ?? null,
      },
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${req.query.inline === "1" ? "inline" : "attachment"}; filename="${quoteNo}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate quote PDF" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, clientId, template, status, markupPercent, contingencyPercent, jobType, notes, customerNotes, lineItems = [], jobId, workAddress } = req.body;
    const [currentEstimate] = await db.select({
      id: estimatesTable.id,
      businessId: estimatesTable.businessId,
      businessLine: estimatesTable.businessLine,
      jobId: estimatesTable.jobId,
      workAddress: estimatesTable.workAddress,
      customerNotes: estimatesTable.customerNotes,
    }).from(estimatesTable).where(eq(estimatesTable.id, id));
    if (!currentEstimate) return res.status(404).json({ error: "Estimate not found" });

    const requestedOwner = await resolveMutationBusiness(req);
    if (!requestedOwner.ok) return res.status(400).json({ error: requestedOwner.error });
    const currentOwnership = await canonicalRecordBusiness(currentEstimate);
    if (currentOwnership.state === "invalid") {
      return res.status(409).json({ error: "Estimate has an unknown business owner" });
    }
    if (requestedOwner.explicit && currentOwnership.state === "resolved"
      && !(await sameLegalBusiness(currentOwnership.business.id, requestedOwner.business.id))) {
      return res.status(409).json({ error: "Estimate belongs to a different legal business" });
    }

    const effectiveJobId = jobId !== undefined ? (jobId || null) : currentEstimate.jobId;
    let owner: BusinessScope | null = currentOwnership.state === "resolved"
      ? currentOwnership.business
      : requestedOwner.explicit ? requestedOwner.business : null;
    if (effectiveJobId) {
      const linkedOwner = await resolveLinkedJobOwner(Number(effectiveJobId));
      if (!linkedOwner.ok) return res.status(linkedOwner.status).json({ error: linkedOwner.error });
      if (requestedOwner.explicit && requestedOwner.business.id !== linkedOwner.business.id) {
        if (!(await sameLegalBusiness(requestedOwner.business.id, linkedOwner.business.id))) {
          return res.status(409).json({ error: "Estimate business conflicts with the linked job" });
        }
      }
      if (currentOwnership.state === "resolved" && currentOwnership.business.id !== linkedOwner.business.id) {
        return res.status(409).json({ error: "Changing an estimate's operating division requires a new estimate" });
      }
      owner = linkedOwner.business;
    }

    const { subtotal, total } = calculateEstimateTotals(lineItems, markupPercent, contingencyPercent);
    const savedWorkAddress = Object.prototype.hasOwnProperty.call(req.body, "workAddress")
      ? await resolveWorkAddress(workAddress, clientId, effectiveJobId)
      : currentEstimate.workAddress;

    await db.update(estimatesTable).set({
      title, clientId: clientId || null, template, status,
      subtotal: subtotal.toString(),
      markupPercent: markupPercent?.toString() ?? null,
      contingencyPercent: contingencyPercent?.toString() ?? null,
      total: total.toString(),
      jobType, notes, workAddress: savedWorkAddress,
      customerNotes: Object.prototype.hasOwnProperty.call(req.body, "customerNotes")
        ? (customerNotes ?? null)
        : currentEstimate.customerNotes,
      lineItems: lineItems.map((li: any, i: number) => ({ ...li, id: i + 1 })),
      jobId: jobId !== undefined ? (jobId || null) : undefined,
      businessId: owner?.id ?? null,
      businessLine: owner?.slug ?? null,
    }).where(eq(estimatesTable.id, id));

    const [e] = await db.select({ ...getTableColumns(estimatesTable), clientName: clientsTable.name }).from(estimatesTable).leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id)).where(eq(estimatesTable.id, id));
    if (!e) return res.status(404).json({ error: "Estimate not found" });
    res.json(format(e, e.clientName));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update estimate" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid estimate ID" });
      return;
    }
    const scope = await requestedBusinessReadScope(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    if (!scope) {
      res.status(400).json({ error: "Select a business before deleting an estimate" });
      return;
    }
    const result = await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM estimates WHERE id = ${id} FOR UPDATE`);
      const [estimate] = await tx.select({
        id: estimatesTable.id,
        businessId: estimatesTable.businessId,
        businessLine: estimatesTable.businessLine,
      }).from(estimatesTable).where(eq(estimatesTable.id, id));
      if (!estimate || !belongsToBusinessReadScope(estimate, scope)) {
        return { kind: "not_found" as const };
      }
      const events = await tx.select().from(estimateQuoteEventsTable)
        .where(eq(estimateQuoteEventsTable.estimateId, id));
      if (events.some(event =>
        (event.eventType === "send_attempt" && ["pending", "unresolved", "accepted"].includes(event.status))
        || (event.eventType === "revision" && event.tokenActivatedAt != null)
        || !["revision", "send_attempt"].includes(event.eventType)
        || (event.eventType === "send_attempt" && event.status !== "failed")
      )) {
        return { kind: "protected" as const };
      }
      await tx.delete(estimateQuoteEventsTable).where(and(
        eq(estimateQuoteEventsTable.estimateId, id),
        sql`${estimateQuoteEventsTable.eventType} <> 'revision'`,
      ));
      await tx.delete(estimateQuoteEventsTable).where(and(
        eq(estimateQuoteEventsTable.estimateId, id),
        eq(estimateQuoteEventsTable.eventType, "revision"),
      ));
      await tx.delete(estimatesTable).where(eq(estimatesTable.id, id));
      return { kind: "deleted" as const };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Estimate not found" });
      return;
    }
    if (result.kind === "protected") {
      res.status(409).json({ error: "This estimate has sent or unresolved quote history and cannot be deleted." });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete estimate" });
  }
});

router.post("/:id/convert-to-job", async (req, res) => {
  try {
    const scopeRequest = {
      ...req,
      query: {
        ...req.query,
        businessId: req.query.businessId ?? req.body?.businessId,
        businessLine: req.query.businessLine ?? req.body?.businessLine,
      },
    } as unknown as Request;
    const scope = await requestedBusinessReadScope(scopeRequest);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    if (!scope) return res.status(400).json({ error: "A business scope is required" });
    const [estimate] = await db.select({
      ...getTableColumns(estimatesTable),
      clientName: clientsTable.name,
      clientEmail: clientsTable.email,
      clientPhone: clientsTable.phone,
      clientAddress: clientsTable.address,
      clientCity: clientsTable.city,
      clientState: clientsTable.state,
      clientZip: clientsTable.zip,
    })
      .from(estimatesTable)
      .leftJoin(clientsTable, eq(estimatesTable.clientId, clientsTable.id))
      .where(eq(estimatesTable.id, parseInt(req.params.id)));
    if (!estimate || !belongsToBusinessReadScope(estimate, scope)) {
      return res.status(404).json({ error: "Estimate not found" });
    }
    const quoteEvents = await db.select().from(estimateQuoteEventsTable)
      .where(eq(estimateQuoteEventsTable.estimateId, estimate.id));
    const currentRevision = quoteEvents
      .filter(event => event.eventType === "revision")
      .sort((a, b) => b.revision - a.revision || b.id - a.id)[0];
    const currentDecision = currentRevision
      ? quoteEvents
        .filter(event =>
          (event.eventType === "response" || event.eventType === "manual_response")
          && event.revisionSnapshotId === currentRevision.id,
        )
        .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0]
      : null;
    const hasCurrentAuthorization = currentRevision && quoteEvents.some(event =>
      event.eventType === "work_authorization"
      && event.revisionSnapshotId === currentRevision.id,
    );
    if (!currentRevision || currentDecision?.responseType !== "approved" || !hasCurrentAuthorization) {
      return res.status(409).json({
        error: "A current accepted quote revision with explicit work authorization is required before job conversion.",
      });
    }
    const recordedOwnership = await canonicalRecordBusiness(estimate);
    if (recordedOwnership.state === "invalid") {
      return res.status(409).json({ error: "Estimate has an unknown business owner" });
    }
    const owner = recordedOwnership.state === "resolved"
      ? recordedOwnership.business
      : await generalContractingBusiness();
    if (!owner) return res.status(409).json({ error: "General Contracting business was not found" });
    const [business] = await db.select().from(businessesTable).where(eq(businessesTable.id, owner.id));
    const settings = (await db.select().from(settingsTable).limit(1))[0] ?? null;
    const currentSnapshot = await buildEstimateQuoteSnapshot({
      estimate,
      business: business ?? null,
      settings,
      revision: currentRevision.revision,
      expiresAt: estimate.quoteExpiresAt ?? null,
    });
    if (!currentRevision.contentHash || currentSnapshot.contentHash !== currentRevision.contentHash) {
      return res.status(409).json({
        error: "The estimate changed after this revision was accepted. Send a new revision and record its acceptance and work authorization before conversion.",
      });
    }

    const [job] = await db.insert(jobsTable).values({
      title: estimate.title,
      clientId: estimate.clientId,
      address: estimate.workAddress,
      status: "scheduled",
      jobType: estimate.jobType,
      notes: estimate.notes,
      businessId: owner.id,
      businessLine: owner.slug,
    }).returning();

    await db.update(estimatesTable).set({ status: "won" }).where(eq(estimatesTable.id, estimate.id));
    res.status(201).json({ ...job, createdAt: job.createdAt.toISOString(), clientName: estimate.clientName ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to convert estimate to job" });
  }
});

export default router;
