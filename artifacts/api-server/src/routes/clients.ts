import { Router } from "express";
import { db } from "@workspace/db";
import { clientsTable, clientBillingProfilesTable, estimatesTable, jobsTable, invoicesTable, squarePaymentsTable, prospectsTable, routeStopsTable, otherIncomeTable } from "@workspace/db/schema";
import { eq, desc, or } from "drizzle-orm";

const router = Router();

function formatClient(c: typeof clientsTable.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

router.get("/", async (_req, res) => {
  try {
    const [clients, openInvoices] = await Promise.all([
      db.select().from(clientsTable).orderBy(clientsTable.createdAt),
      db.select({
        clientId: invoicesTable.clientId,
        total: invoicesTable.total,
        status: invoicesTable.status,
      }).from(invoicesTable).where(
        or(eq(invoicesTable.status, "sent"), eq(invoicesTable.status, "overdue"))
      ),
    ]);

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
    const { name, email, phone, address, city, state, zip, notes, nextServiceDate, serviceIntervalMonths, businessLine, reminderOptOut } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const [client] = await db.insert(clientsTable).values({
      name, email, phone, address, city, state, zip, notes,
      nextServiceDate: nextServiceDate ?? null,
      serviceIntervalMonths: serviceIntervalMonths ?? null,
      businessLine: businessLine ?? null,
      reminderOptOut: reminderOptOut === true,
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

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!client) return res.status(404).json({ error: "Client not found" });

    const [jobs, invoices, squarePayments, linkedProspects, routeStops, otherIncome] = await Promise.all([
      db.select().from(jobsTable).where(eq(jobsTable.clientId, id)).orderBy(desc(jobsTable.createdAt)),
      db.select().from(invoicesTable).where(eq(invoicesTable.clientId, id)).orderBy(desc(invoicesTable.createdAt)),
      db.select().from(squarePaymentsTable).where(eq(squarePaymentsTable.clientId, id)).orderBy(desc(squarePaymentsTable.paidAt)),
      db.select().from(prospectsTable).where(eq(prospectsTable.clientId, id)).orderBy(desc(prospectsTable.createdAt)),
      db.select().from(routeStopsTable).where(eq(routeStopsTable.clientId, id)).orderBy(desc(routeStopsTable.scheduledDate)),
      db.select().from(otherIncomeTable).where(eq(otherIncomeTable.clientId, id)).orderBy(desc(otherIncomeTable.date)),
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
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
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
    const { name, email, phone, address, city, state, zip, notes, nextServiceDate, serviceIntervalMonths, businessLine, reminderOptOut } = req.body;
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
    if ("businessLine" in req.body) updates.businessLine = businessLine ?? null;
    if ("reminderOptOut" in req.body) updates.reminderOptOut = reminderOptOut === true;
    const [client] = await db.update(clientsTable)
      .set(updates)
      .where(eq(clientsTable.id, id))
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
    const { businessLine } = req.body;
    const normalized = businessLine === undefined ? null : businessLine;
    if (!VALID_BUSINESS_LINES.includes(normalized)) {
      return res.status(400).json({ error: "Invalid business line. Must be 'asphalt', 'contracting', or null." });
    }
    const [client] = await db.update(clientsTable)
      .set({ businessLine: normalized })
      .where(eq(clientsTable.id, id))
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
    const [jobs, invoices, estimates] = await Promise.all([
      db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.clientId, id)),
      db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.clientId, id)),
      db.select({ id: estimatesTable.id }).from(estimatesTable).where(eq(estimatesTable.clientId, id)),
    ]);
    res.json({ jobCount: jobs.length, invoiceCount: invoices.length, estimateCount: estimates.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch link counts" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    // Nullify FK references on related records before deleting so the DELETE
    // doesn't fail due to FK constraint violations.
    await Promise.all([
      db.update(prospectsTable).set({ clientId: null }).where(eq(prospectsTable.clientId, id)),
      db.update(estimatesTable).set({ clientId: null }).where(eq(estimatesTable.clientId, id)),
      db.update(invoicesTable).set({ clientId: null }).where(eq(invoicesTable.clientId, id)),
      db.update(jobsTable).set({ clientId: null }).where(eq(jobsTable.clientId, id)),
      // client_billing_profiles.client_id is NOT NULL so it cannot be nullified — delete the rows
      db.delete(clientBillingProfilesTable).where(eq(clientBillingProfilesTable.clientId, id)),
    ]);
    await db.delete(clientsTable).where(eq(clientsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete client" });
  }
});

export default router;
