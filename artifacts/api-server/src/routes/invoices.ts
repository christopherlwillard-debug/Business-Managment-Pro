import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable, clientsTable, jobsTable, settingsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

const router = Router();

function calcInvoice(lineItems: any[], taxRate: number | null) {
  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const taxAmount = taxRate ? subtotal * (taxRate / 100) : 0;
  const total = subtotal + taxAmount;
  return { subtotal, taxAmount, total };
}

async function getNextInvoiceNumber() {
  const [settings] = await db.select().from(settingsTable).limit(1);
  const prefix = settings?.invoicePrefix ?? "INV-2026-";
  const num = settings?.invoiceNextNumber ?? 1001;
  if (settings) {
    await db.update(settingsTable).set({ invoiceNextNumber: num + 1 }).where(eq(settingsTable.id, settings.id));
  }
  return `${prefix}${num}`;
}

function formatInvoice(inv: any, clientName?: string | null, jobTitle?: string | null, jobCity?: string | null, jobState?: string | null) {
  const lineItems = Array.isArray(inv.lineItems) ? inv.lineItems : [];
  return {
    ...inv,
    clientName: clientName ?? null,
    jobTitle: jobTitle ?? null,
    jobCity: jobCity ?? null,
    jobState: jobState ?? null,
    subtotal: parseFloat(inv.subtotal ?? "0"),
    taxRate: inv.taxRate ? parseFloat(inv.taxRate) : null,
    taxAmount: inv.taxAmount ? parseFloat(inv.taxAmount) : null,
    total: parseFloat(inv.total ?? "0"),
    amountPaid: inv.amountPaid ? parseFloat(inv.amountPaid) : null,
    lineItems: lineItems.map((li: any, i: number) => ({
      id: li.id ?? i + 1,
      description: li.description,
      quantity: parseFloat(li.quantity),
      unitPrice: parseFloat(li.unitPrice),
      total: parseFloat(li.quantity) * parseFloat(li.unitPrice),
    })),
    createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : inv.createdAt,
  };
}

router.get("/tax-report", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const conditions: any[] = [];
    if (startDate) conditions.push(gte(invoicesTable.issueDate, startDate as string));
    if (endDate) conditions.push(lte(invoicesTable.issueDate, endDate as string));

    const invoices = await db
      .select({
        invoiceNumber: invoicesTable.invoiceNumber,
        issueDate: invoicesTable.issueDate,
        status: invoicesTable.status,
        subtotal: invoicesTable.subtotal,
        taxRate: invoicesTable.taxRate,
        taxAmount: invoicesTable.taxAmount,
        total: invoicesTable.total,
        clientName: clientsTable.name,
        jobTitle: jobsTable.title,
        invoiceCity: invoicesTable.city,
        invoiceState: invoicesTable.state,
        jobCity: jobsTable.city,
        jobState: jobsTable.state,
      })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(invoicesTable.issueDate);

    res.json(invoices.map(inv => ({
      ...inv,
      city: inv.invoiceCity || inv.jobCity || null,
      state: inv.invoiceState || inv.jobState || null,
      subtotal: parseFloat(inv.subtotal ?? "0"),
      taxRate: inv.taxRate ? parseFloat(inv.taxRate) : null,
      taxAmount: inv.taxAmount ? parseFloat(inv.taxAmount) : null,
      total: parseFloat(inv.total ?? "0"),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get tax report" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { status, clientId, startDate, endDate } = req.query;
    const conditions: any[] = [];
    if (status) conditions.push(eq(invoicesTable.status, status as string));
    if (clientId) conditions.push(eq(invoicesTable.clientId, parseInt(clientId as string)));
    if (startDate) conditions.push(gte(invoicesTable.issueDate, startDate as string));
    if (endDate) conditions.push(lte(invoicesTable.issueDate, endDate as string));

    const invoices = await db
      .select({ ...invoicesTable, clientName: clientsTable.name, jobTitle: jobsTable.title, jobCity: jobsTable.city, jobState: jobsTable.state })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(invoicesTable.createdAt));

    res.json(invoices.map(inv => formatInvoice(inv, inv.clientName, inv.jobTitle, inv.jobCity, inv.jobState)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { clientId, jobId, status, issueDate, dueDate, taxRate, notes, terms, lineItems = [], city, state } = req.body;
    const invoiceNumber = await getNextInvoiceNumber();
    const { subtotal, taxAmount, total } = calcInvoice(lineItems, taxRate);

    const [invoice] = await db.insert(invoicesTable).values({
      invoiceNumber,
      clientId: clientId || null,
      jobId: jobId || null,
      status: status || "draft",
      issueDate,
      dueDate,
      subtotal: subtotal.toString(),
      taxRate: taxRate?.toString() ?? null,
      taxAmount: taxAmount.toString(),
      total: total.toString(),
      city: city || null,
      state: state || null,
      notes,
      terms,
      lineItems: lineItems.map((li: any, i: number) => ({ ...li, id: i + 1 })),
    }).returning();

    const [withJoins] = await db.select({ ...invoicesTable, clientName: clientsTable.name, jobTitle: jobsTable.title, jobCity: jobsTable.city, jobState: jobsTable.state }).from(invoicesTable).leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id)).leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id)).where(eq(invoicesTable.id, invoice.id));
    res.status(201).json(formatInvoice(withJoins, withJoins.clientName, withJoins.jobTitle, withJoins.jobCity, withJoins.jobState));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [inv] = await db.select({ ...invoicesTable, clientName: clientsTable.name, jobTitle: jobsTable.title, jobCity: jobsTable.city, jobState: jobsTable.state }).from(invoicesTable).leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id)).leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id)).where(eq(invoicesTable.id, id));
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    res.json(formatInvoice(inv, inv.clientName, inv.jobTitle, inv.jobCity, inv.jobState));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch invoice" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { clientId, jobId, status, issueDate, dueDate, taxRate, notes, terms, lineItems = [] } = req.body;
    const { subtotal, taxAmount, total } = calcInvoice(lineItems, taxRate);

    await db.update(invoicesTable).set({
      clientId: clientId || null,
      jobId: jobId || null,
      status, issueDate, dueDate,
      subtotal: subtotal.toString(),
      taxRate: taxRate?.toString() ?? null,
      taxAmount: taxAmount.toString(),
      total: total.toString(),
      notes, terms,
      lineItems: lineItems.map((li: any, i: number) => ({ ...li, id: i + 1 })),
    }).where(eq(invoicesTable.id, id));

    const [withJoins] = await db.select({ ...invoicesTable, clientName: clientsTable.name, jobTitle: jobsTable.title, jobCity: jobsTable.city, jobState: jobsTable.state }).from(invoicesTable).leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id)).leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id)).where(eq(invoicesTable.id, id));
    if (!withJoins) return res.status(404).json({ error: "Invoice not found" });
    res.json(formatInvoice(withJoins, withJoins.clientName, withJoins.jobTitle, withJoins.jobCity, withJoins.jobState));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update invoice" });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    const [inv] = await db.update(invoicesTable).set({ status }).where(eq(invoicesTable.id, id)).returning();
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    const [withJoins] = await db.select({ ...invoicesTable, clientName: clientsTable.name, jobTitle: jobsTable.title, jobCity: jobsTable.city, jobState: jobsTable.state }).from(invoicesTable).leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id)).leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id)).where(eq(invoicesTable.id, id));
    res.json(formatInvoice(withJoins, withJoins.clientName, withJoins.jobTitle, withJoins.jobCity, withJoins.jobState));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update invoice status" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(invoicesTable).where(eq(invoicesTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});

export default router;
