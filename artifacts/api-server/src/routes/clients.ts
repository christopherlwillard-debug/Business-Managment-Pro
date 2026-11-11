import { Router, type Request } from "express";
import { db } from "@workspace/db";
import { clientsTable, clientBillingProfilesTable, estimatesTable, jobsTable, invoicesTable, squarePaymentsTable, prospectsTable, routeStopsTable, otherIncomeTable, businessesTable, mfhClientPricingTable, productionPriceOverridesTable } from "@workspace/db/schema";
import { and, eq, desc, isNull, isNotNull, inArray, or } from "drizzle-orm";
import { requestedBusiness, requestedBusinessReadScope, hasRequestedBusiness, invalidBusinessScope, resolveMutationBusiness, belongsToBusiness, belongsToBusinessReadScope, businessReadPredicate, mutationBusinessPredicate, type BusinessReadScope, type BusinessScope } from "../lib/business-scope.js";
import {
  clientProfileRouteStopColumns,
  clientProfileSquarePaymentColumns,
} from "../lib/client-profile-projections.js";

const router = Router();

async function resolveClientBusinessAssignment(value: unknown): Promise<{
  businessId: number | null;
  businessLine: string | null;
} | undefined> {
  if (value == null || value === "") return { businessId: null, businessLine: null };
  if (typeof value !== "string") return undefined;
  const requestedSlug = value.trim();
  const slug = requestedSlug === "asphalt" ? "asphalt_sealing"
    : requestedSlug === "contracting" ? "general_contracting"
    : requestedSlug;
  if (!slug) return { businessId: null, businessLine: null };
  const [business] = await db.select({ id: businessesTable.id, slug: businessesTable.slug })
    .from(businessesTable).where(eq(businessesTable.slug, slug)).limit(1);
  return business ? { businessId: business.id, businessLine: business.slug } : undefined;
}

function scopedOwnerPredicate(
  columns: { businessId: any; businessLine: any },
  scope: BusinessScope | BusinessReadScope | null,
) {
  if (!scope) return undefined;
  if ("memberIds" in scope) return businessReadPredicate(columns, scope);
  return or(
    eq(columns.businessId, scope.id),
    and(isNull(columns.businessId), eq(columns.businessLine, scope.slug)),
  );
}

router.param("id", (req, res, next, rawId) => {
  void (async () => {
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid client ID" });

    const isMutation = ["PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase());
    // businessLine on PUT/PATCH is the destination assignment. Resolve the
    // source record owner from dedicated source fields or the query selector.
    const scopeRequest = req.method === "PUT" || req.method === "PATCH"
      ? {
          query: req.query,
          body: {
            businessId: req.body?.sourceBusinessId ?? req.query.businessId,
            businessLine: req.body?.sourceBusinessLine ?? req.query.businessLine,
          },
        } as Request
      : req;

    let scope: BusinessScope | BusinessReadScope | null;
    if (isMutation) {
      const ownership = await resolveMutationBusiness(scopeRequest);
      if (!ownership.ok) return res.status(400).json({ error: ownership.error });
      scope = ownership.business;
    } else {
      scope = await requestedBusinessReadScope(scopeRequest);
      if (invalidBusinessScope(res, scope as BusinessScope | null, hasRequestedBusiness(scopeRequest))) return;
    }

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    let clientInScope = isMutation
      ? belongsToBusiness(client ?? {}, scope as BusinessScope | null)
      : belongsToBusinessReadScope(client ?? {}, scope as BusinessReadScope | null);
    if (client && !isMutation && scope && "memberIds" in scope && !clientInScope) {
      const [linkedJob] = await db.select({ id: jobsTable.id }).from(jobsTable)
        .where(and(eq(jobsTable.clientId, id), businessReadPredicate(jobsTable, scope))).limit(1);
      const [linkedInvoice] = await db.select({ id: invoicesTable.id }).from(invoicesTable)
        .where(and(eq(invoicesTable.clientId, id), businessReadPredicate(invoicesTable, scope))).limit(1);
      clientInScope = Boolean(linkedJob || linkedInvoice);
    }
    if (!client || !clientInScope) return res.status(404).json({ error: "Client not found" });
    res.locals.businessScopedClient = client;
    if (scope) res.locals.clientBusinessScope = scope;
    next();
  })().catch(next);
});

function formatClient(c: typeof clientsTable.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

router.get("/", async (req, res) => {
  try {
    const scope = await requestedBusinessReadScope(req);
    if (invalidBusinessScope(res, scope as BusinessScope | null, hasRequestedBusiness(req))) return;
    const clientScope = scopedOwnerPredicate(clientsTable, scope);
    const invoiceScope = scopedOwnerPredicate(invoicesTable, scope);
    const [jobClientRows, invoiceClientRows, openInvoices] = await Promise.all([
      scope
        ? db.select({ clientId: jobsTable.clientId }).from(jobsTable)
            .where(and(businessReadPredicate(jobsTable, scope), isNotNull(jobsTable.clientId)))
        : Promise.resolve([]),
      scope
        ? db.select({ clientId: invoicesTable.clientId }).from(invoicesTable)
            .where(and(businessReadPredicate(invoicesTable, scope), isNotNull(invoicesTable.clientId)))
        : Promise.resolve([]),
      db.select({
        clientId: invoicesTable.clientId,
        total: invoicesTable.total,
        status: invoicesTable.status,
      }).from(invoicesTable).where(
        and(
          or(eq(invoicesTable.status, "sent"), eq(invoicesTable.status, "overdue")),
          invoiceScope,
        ),
      ),
    ]);
    const relatedClientIds = [...new Set([...jobClientRows, ...invoiceClientRows]
      .map(row => row.clientId).filter((id): id is number => id != null))];
    const clientReadScope = scope && relatedClientIds.length
      ? or(clientScope, inArray(clientsTable.id, relatedClientIds))
      : clientScope;
    const clients = await db.select().from(clientsTable).where(clientReadScope).orderBy(clientsTable.createdAt);

    const invoicesByClient = new Map<number, { balance: number; count: number; hasOverdue: boolean }>();
    for (const inv of openInvoices) {
      if (inv.clientId == null) continue;
      const entry = invoicesByClient.get(inv.clientId) ?? { balance: 0, count: 0, hasOverdue: false };
      entry.balance += parseFloat(inv.total ?? "0");
      entry.count += 1;
      if (inv.status === "overdue") entry.hasOverdue = true;
      invoicesByClient.set(inv.clientId, entry);
    }

    res.json(clients.map(c => ({
      ...formatClient(c),
      outstandingBalance: invoicesByClient.get(c.id)?.balance ?? 0,
      openInvoiceCount: invoicesByClient.get(c.id)?.count ?? 0,
      hasOverdueInvoice: invoicesByClient.get(c.id)?.hasOverdue ?? false,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, email, phone, address, city, state, zip, notes, nextServiceDate, serviceIntervalMonths, reminderOptOut, mileageSurchargeEnabled, mileageSurchargeTriggerMiles, mileageSurchargeDailyRate } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const ownership = await resolveMutationBusiness(req);
    if (!ownership.ok) return res.status(400).json({ error: ownership.error });
    const owner = ownership.business;
    const [client] = await db.insert(clientsTable).values({
      name, email, phone, address, city, state, zip, notes,
      nextServiceDate: nextServiceDate ?? null,
      serviceIntervalMonths: serviceIntervalMonths ?? null,
      businessLine: owner.slug,
      businessId: owner.id,
      reminderOptOut: reminderOptOut === true,
      mileageSurchargeEnabled: mileageSurchargeEnabled === true,
      mileageSurchargeTriggerMiles: mileageSurchargeTriggerMiles ?? null,
      mileageSurchargeDailyRate: mileageSurchargeDailyRate ?? null,
    }).returning();
    res.status(201).json(formatClient(client));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create client" });
  }
});

router.get("/:id/profile", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid client ID" });

    const scope = await requestedBusinessReadScope(req);
    if (invalidBusinessScope(res, scope as BusinessScope | null, hasRequestedBusiness(req))) return;
    const client = res.locals.businessScopedClient ?? (await db.select().from(clientsTable).where(eq(clientsTable.id, id)))[0];
    if (!client) return res.status(404).json({ error: "Client not found" });

    const [jobs, invoices, squarePayments, linkedProspects, routeStops, otherIncome] = await Promise.all([
      db.select().from(jobsTable).where(and(eq(jobsTable.clientId, id), scopedOwnerPredicate(jobsTable, scope))).orderBy(desc(jobsTable.createdAt)),
      db.select().from(invoicesTable).where(and(eq(invoicesTable.clientId, id), scopedOwnerPredicate(invoicesTable, scope))).orderBy(desc(invoicesTable.createdAt)),
      // The legacy production table has no business_id column; access is scoped
      // through the already-authorized client foreign key.
      db.select(clientProfileSquarePaymentColumns).from(squarePaymentsTable).where(eq(squarePaymentsTable.clientId, id)).orderBy(desc(squarePaymentsTable.paidAt)),
      db.select().from(prospectsTable).where(and(eq(prospectsTable.clientId, id), scopedOwnerPredicate(prospectsTable, scope))).orderBy(desc(prospectsTable.createdAt)),
      db.select(clientProfileRouteStopColumns).from(routeStopsTable).where(eq(routeStopsTable.clientId, id)).orderBy(desc(routeStopsTable.scheduledDate)),
      db.select().from(otherIncomeTable).where(and(eq(otherIncomeTable.clientId, id), scopedOwnerPredicate(otherIncomeTable, scope))).orderBy(desc(otherIncomeTable.date)),
    ]);

    const squareRevenueCents = squarePayments.reduce((sum, p) => sum + p.amountCents, 0);
    const otherRevenueCents = otherIncome.reduce((sum, oi) => sum + Math.round(parseFloat(oi.amount) * 100), 0);
    const totalRevenueCents = squareRevenueCents + otherRevenueCents;
    const paidInvoicesTotal = invoices
      .filter(inv => inv.status === "paid")
      .reduce((sum, inv) => {
        const lineItems = Array.isArray(inv.lineItems) ? inv.lineItems as Array<{ quantity: number; unitPrice: number }> : [];
        return sum + lineItems.reduce((s, li) => s + (li.quantity * li.unitPrice), 0);
      }, 0);

    res.json({
      client: formatClient(client),
      jobs: jobs.map(j => ({ ...j, createdAt: j.createdAt instanceof Date ? j.createdAt.toISOString() : j.createdAt })),
      invoices: invoices.map(inv => ({ ...inv, createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : inv.createdAt })),
      squarePayments: squarePayments.map(p => ({ ...p, paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : p.paidAt, createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt })),
      linkedProspects: linkedProspects.map(p => ({ ...p, createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt, updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt })),
      routeStops: routeStops.map(s => ({ ...s, createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt })),
      otherIncome: otherIncome.map(oi => ({ ...oi, createdAt: oi.createdAt instanceof Date ? oi.createdAt.toISOString() : oi.createdAt })),
      summary: {
        totalJobs: jobs.length,
        totalInvoices: invoices.length,
        paidInvoices: invoices.filter(i => i.status === "paid").length,
        totalRevenueCents,
        squareRevenueCents,
        otherRevenueCents,
        paidInvoicesTotal,
        upcomingStops: routeStops.filter(s => s.status === "scheduled").length,
      },
    });
  } catch (err) {
    console.error("Client profile error:", err);
    res.status(500).json({ error: "Failed to fetch client profile" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const client = res.locals.businessScopedClient ?? (await db.select().from(clientsTable).where(eq(clientsTable.id, id)))[0];
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json(formatClient(client));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch client" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, email, phone, address, city, state, zip, notes, nextServiceDate, serviceIntervalMonths, businessLine, reminderOptOut, mileageSurchargeEnabled, mileageSurchargeTriggerMiles, mileageSurchargeDailyRate } = req.body;
    const updates: Record<string, unknown> = {};
    if ("name" in req.body) updates.name = name;
    if ("email" in req.body) updates.email = email;
    if ("phone" in req.body) updates.phone = phone;
    if ("address" in req.body) updates.address = address;
    if ("city" in req.body) updates.city = city;
    if ("state" in req.body) updates.state = state;
    if ("zip" in req.body) updates.zip = zip;
    if ("notes" in req.body) updates.notes = notes;
    if ("nextServiceDate" in req.body) updates.nextServiceDate = nextServiceDate ?? null;
    if ("serviceIntervalMonths" in req.body) updates.serviceIntervalMonths = serviceIntervalMonths ?? null;
    if ("businessLine" in req.body) {
      const assignment = await resolveClientBusinessAssignment(businessLine);
      if (!assignment) return res.status(400).json({ error: "Select a valid business." });
      updates.businessLine = assignment.businessLine;
      updates.businessId = assignment.businessId;
    }
    if ("reminderOptOut" in req.body) updates.reminderOptOut = reminderOptOut === true;
    if ("mileageSurchargeEnabled" in req.body) updates.mileageSurchargeEnabled = mileageSurchargeEnabled === true;
    if ("mileageSurchargeTriggerMiles" in req.body) updates.mileageSurchargeTriggerMiles = mileageSurchargeTriggerMiles ?? null;
    if ("mileageSurchargeDailyRate" in req.body) updates.mileageSurchargeDailyRate = mileageSurchargeDailyRate ?? null;
    const scope = res.locals.clientBusinessScope;
    if (!scope) return res.status(400).json({ error: "Client business scope is required" });
    const [client] = await db.update(clientsTable)
      .set(updates)
      .where(and(eq(clientsTable.id, id), mutationBusinessPredicate(clientsTable, scope)))
      .returning();
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json(formatClient(client));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update client" });
  }
});

const VALID_BUSINESS_LINES = ["asphalt", "contracting", null] as const;

router.patch("/:id/business-line", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid client ID" });
    const assignment = await resolveClientBusinessAssignment(req.body?.businessLine);
    if (!assignment) return res.status(400).json({ error: "Select a valid business." });
    const scope = res.locals.clientBusinessScope;
    if (!scope) return res.status(400).json({ error: "Client business scope is required" });
    const [client] = await db.update(clientsTable)
      .set(assignment)
      .where(and(eq(clientsTable.id, id), mutationBusinessPredicate(clientsTable, scope)))
      .returning();
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json(formatClient(client));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update business line" });
  }
});

router.get("/:id/link-counts", async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid client ID" });
    const scope = await requestedBusiness(req);
    if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
    const [jobs, invoices, estimates, billingProfiles, mfhPricing, productionPricing] = await Promise.all([
      db.select({ id: jobsTable.id }).from(jobsTable).where(and(eq(jobsTable.clientId, id), scopedOwnerPredicate(jobsTable, scope))),
      db.select({ id: invoicesTable.id }).from(invoicesTable).where(and(eq(invoicesTable.clientId, id), scopedOwnerPredicate(invoicesTable, scope))),
      db.select({ id: estimatesTable.id }).from(estimatesTable).where(and(eq(estimatesTable.clientId, id), scopedOwnerPredicate(estimatesTable, scope))),
      db.select({ id: clientBillingProfilesTable.id }).from(clientBillingProfilesTable).where(eq(clientBillingProfilesTable.clientId, id)),
      db.select({ id: mfhClientPricingTable.id }).from(mfhClientPricingTable).where(eq(mfhClientPricingTable.clientId, id)),
      db.select({ id: productionPriceOverridesTable.id }).from(productionPriceOverridesTable).where(eq(productionPriceOverridesTable.clientId, id)),
    ]);
    res.json({
      jobCount: jobs.length,
      invoiceCount: invoices.length,
      estimateCount: estimates.length,
      billingProfileCount: billingProfiles.length,
      mfhPricingCount: mfhPricing.length,
      productionPricingCount: productionPricing.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch link counts" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const scope = res.locals.clientBusinessScope;
    if (!scope) return res.status(400).json({ error: "Client business scope is required" });
    // Lock the owner row while checking client-specific pricing. These rows
    // cascade on client deletion, so a simple preflight outside the transaction
    // could race with a concurrent pricing write and silently destroy settings.
    const result = await db.transaction(async tx => {
      const [lockedClient] = await tx.select().from(clientsTable)
        .where(and(eq(clientsTable.id, id), mutationBusinessPredicate(clientsTable, scope)))
        .for("update");
      if (!lockedClient) return { status: "not_found" as const };

      const billingProfiles = await tx.select({ id: clientBillingProfilesTable.id })
        .from(clientBillingProfilesTable).where(eq(clientBillingProfilesTable.clientId, id));
      const mfhPricing = await tx.select({ id: mfhClientPricingTable.id })
        .from(mfhClientPricingTable).where(eq(mfhClientPricingTable.clientId, id));
      const productionPricing = await tx.select({ id: productionPriceOverridesTable.id })
        .from(productionPriceOverridesTable).where(eq(productionPriceOverridesTable.clientId, id));

      if (billingProfiles.length || mfhPricing.length || productionPricing.length) {
        return {
          status: "blocked" as const,
          billingProfileCount: billingProfiles.length,
          mfhPricingCount: mfhPricing.length,
          productionPricingCount: productionPricing.length,
        };
      }

      // The repository's archive-first policy requires a recoverable client
      // lifecycle. Until that workflow exists, do not detach history or delete
      // the parent row even when no pricing dependency is present.
      return { status: "archive_required" as const };
    });

    if (result.status === "blocked") {
      return res.status(409).json({
        error: "This client has saved billing or manufacturer pricing. Remove or transfer those settings before deleting the client.",
        billingProfileCount: result.billingProfileCount,
        mfhPricingCount: result.mfhPricingCount,
        productionPricingCount: result.productionPricingCount,
      });
    }
    if (result.status === "not_found") return res.status(404).json({ error: "Client not found" });
    return res.status(409).json({
      error: "Permanent client deletion is disabled until a client archive/restore workflow is available. No data was changed.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete client" });
  }
});

export default router;
