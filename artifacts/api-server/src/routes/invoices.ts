import { Router } from "express";
import { z } from "zod";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { launchBrowser } from "../lib/launchBrowser.js";
import { sendInvoiceEmail, type InvoiceEmailSettings, type InlineImage } from "../lib/invoiceEmail";
import { generateChecklistPdfBuffer } from "../lib/generateChecklistPdf.js";
import { generateMaterialsPdfBuffer } from "../lib/generateMaterialsPdf.js";
import { db } from "@workspace/db";
import { invoicesTable, clientsTable, jobsTable, settingsTable, businessesTable, type Business } from "@workspace/db/schema";
import { eq, and, gte, lte, desc, inArray, ne } from "drizzle-orm";
import { deleteSquarePaymentLink, isSquareConfigured } from "../lib/square.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router = Router();

// Zod schema for a single invoice line item — applied on create and update.
const lineItemSchema = z.object({
  description: z.string().min(1, "Each line item must have a description."),
  quantity: z.number({ invalid_type_error: "Quantity must be a number." }).positive("Quantity must be greater than 0."),
  unitPrice: z.number({ invalid_type_error: "Unit price must be a number." }).min(0, "Unit price must be 0 or greater."),
});
const lineItemsSchema = z.array(lineItemSchema);

export function validateLineItems(lineItems: unknown): string | null {
  const result = lineItemsSchema.safeParse(lineItems);
  if (!result.success) {
    const messages = result.error.issues.map(i => i.message);
    return messages.join(" ");
  }
  return null;
}

export function calcInvoice(lineItems: any[], taxRate: number | null) {
  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const taxAmount = taxRate ? subtotal * (taxRate / 100) : 0;
  const total = subtotal + taxAmount;
  return { subtotal, taxAmount, total };
}

export async function getNextInvoiceNumber() {
  const [settings] = await db.select().from(settingsTable).limit(1);
  const prefix = settings?.invoicePrefix ?? "INV-2026-";
  const num = settings?.invoiceNextNumber ?? 1001;
  if (settings) {
    await db.update(settingsTable).set({ invoiceNextNumber: num + 1 }).where(eq(settingsTable.id, settings.id));
  }
  return `${prefix}${num}`;
}

function formatInvoice(inv: any, clientName?: string | null, clientEmail?: string | null, clientAddress?: string | null, clientPhone?: string | null, clientCity?: string | null, clientState?: string | null, clientZip?: string | null, clientNotes?: string | null, jobTitle?: string | null, jobCity?: string | null, jobState?: string | null) {
  const lineItems = Array.isArray(inv.lineItems) ? inv.lineItems : [];
  return {
    ...inv,
    clientName: clientName ?? null,
    clientEmail: clientEmail ?? null,
    clientAddress: clientAddress ?? null,
    clientPhone: clientPhone ?? null,
    clientCity: clientCity ?? null,
    clientState: clientState ?? null,
    clientZip: clientZip ?? null,
    clientNotes: clientNotes ?? null,
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
    lastManualPaidAt: inv.lastManualPaidAt instanceof Date ? inv.lastManualPaidAt.toISOString() : (inv.lastManualPaidAt ?? null),
    createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : inv.createdAt,
  };
}

const invoiceSelect = {
  ...invoicesTable,
  clientName: clientsTable.name,
  clientEmail: clientsTable.email,
  clientAddress: clientsTable.address,
  clientPhone: clientsTable.phone,
  clientCity: clientsTable.city,
  clientState: clientsTable.state,
  clientZip: clientsTable.zip,
  clientNotes: clientsTable.notes,
  jobTitle: jobsTable.title,
  jobCity: jobsTable.city,
  jobState: jobsTable.state,
};

export function buildInvoiceQuery() {
  return db.select(invoiceSelect)
    .from(invoicesTable)
    .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
    .leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id));
}

export function fmt(inv: any) {
  return formatInvoice(inv, inv.clientName, inv.clientEmail, inv.clientAddress, inv.clientPhone, inv.clientCity, inv.clientState, inv.clientZip, inv.clientNotes, inv.jobTitle, inv.jobCity, inv.jobState);
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

// Valid status transitions — enforced by the PATCH /status endpoint.
// The accept endpoint (draft → approved) is separate.
const VALID_TRANSITIONS: Record<string, string[]> = {
  approved:     ["sent", "cancelled"],
  sent:         ["partiallyPaid", "paid", "overdue", "cancelled"],
  overdue:      ["sent", "paid", "cancelled"],  // overdue invoices can still be paid or re-sent
  partiallyPaid:["paid", "overdue", "cancelled"],
  paid:         [],  // terminal
  cancelled:    [],  // terminal (voided)
  // NOTE: draft is intentionally absent — drafts are hard-deleted, never transitioned via PATCH.
};

router.get("/", async (req, res) => {
  try {
    const { status, clientId, jobId, startDate, endDate, includeDrafts } = req.query;
    const conditions: any[] = [];
    if (status) {
      conditions.push(eq(invoicesTable.status, status as string));
    } else if (includeDrafts !== "true") {
      // Invoices page never shows drafts — they live only on the job card
      conditions.push(ne(invoicesTable.status, "draft"));
    }
    if (clientId) conditions.push(eq(invoicesTable.clientId, parseInt(clientId as string)));
    if (jobId) conditions.push(eq(invoicesTable.jobId, parseInt(jobId as string)));
    if (startDate) conditions.push(gte(invoicesTable.issueDate, startDate as string));
    if (endDate) conditions.push(lte(invoicesTable.issueDate, endDate as string));

    const invoices = await buildInvoiceQuery()
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(invoicesTable.issueDate), desc(invoicesTable.id));

    res.json(invoices.map(fmt));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

// ── Draft for a specific job (job card use only) ───────────────────────────────
router.get("/job/:jobId/draft", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid jobId" });
    const [inv] = await buildInvoiceQuery()
      .where(and(eq(invoicesTable.jobId, jobId), eq(invoicesTable.status, "draft")));
    if (!inv) return res.status(404).json({ error: "No draft found" });
    res.json(fmt(inv));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch draft" });
  }
});

// Assign the next sequential invoice number to an invoice that is transitioning
// out of Draft status. No-op if the invoice already has a number.
// Returns the assigned (or pre-existing) invoice number.
export async function assignInvoiceNumberIfNeeded(invoiceId: number): Promise<string | null> {
  const [inv] = await db
    .select({ invoiceNumber: invoicesTable.invoiceNumber })
    .from(invoicesTable)
    .where(eq(invoicesTable.id, invoiceId));
  if (inv?.invoiceNumber) return inv.invoiceNumber; // already assigned
  const number = await getNextInvoiceNumber();
  await db.update(invoicesTable).set({ invoiceNumber: number }).where(eq(invoicesTable.id, invoiceId));
  return number;
}

router.post("/", async (req, res) => {
  try {
    const { clientId, jobId, issueDate, dueDate, taxRate, notes, terms, lineItems = [], city, state, locationName, attachments = [], businessLine } = req.body;
    // Validate line items before any DB work
    const lineItemError = validateLineItems(lineItems);
    if (lineItemError) return res.status(400).json({ error: lineItemError });
    // All new invoices start as drafts — invoice numbers are assigned only at the /accept endpoint.
    // The `status` field in the request body is intentionally ignored to enforce the lifecycle.
    const { subtotal, taxAmount, total } = calcInvoice(lineItems, taxRate);

    const [invoice] = await db.insert(invoicesTable).values({
      invoiceNumber: null,
      clientId: clientId || null,
      jobId: jobId || null,
      status: "draft",
      issueDate,
      dueDate,
      subtotal: subtotal.toString(),
      taxRate: taxRate?.toString() ?? null,
      taxAmount: taxAmount.toString(),
      total: total.toString(),
      city: city || null,
      state: state || null,
      locationName: locationName || null,
      notes,
      terms,
      lineItems: lineItems.map((li: any, i: number) => ({ ...li, id: i + 1 })),
      attachments: Array.isArray(attachments) ? attachments : [],
      businessLine: businessLine || null,
    }).returning();

    const [withJoins] = await buildInvoiceQuery().where(eq(invoicesTable.id, invoice.id));
    res.status(201).json(fmt(withJoins));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

// ── Batch invoice summaries (one request for many jobs) ────────────────────────
// GET /api/invoices/summaries?jobIds=1,2,3
// Returns { [jobId]: Invoice | null } with the "best" invoice per job:
//   paid > sent > (first available)
router.get("/summaries", async (req, res) => {
  try {
    const raw = (req.query.jobIds as string) ?? "";
    const jobIds = raw
      .split(",")
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n > 0);

    if (jobIds.length === 0) return res.json({});

    const uniqueJobIds = [...new Set(jobIds)];
    const invoices = await buildInvoiceQuery()
      .where(inArray(invoicesTable.jobId, uniqueJobIds))
      .orderBy(desc(invoicesTable.createdAt));
    const formatted = invoices.map(fmt);

    const result: Record<number, ReturnType<typeof fmt> | null> = {};
    for (const jobId of uniqueJobIds) result[jobId] = null;

    // Priority: paid > partiallyPaid > sent > approved > draft (for job card awareness)
    const statusRank: Record<string, number> = {
      paid: 5, partiallyPaid: 4, sent: 3, approved: 2, overdue: 1, draft: 0, cancelled: -1,
    };

    for (const inv of formatted) {
      if (inv.jobId == null) continue;
      const current = result[inv.jobId];
      const invRank = statusRank[inv.status] ?? -1;
      const curRank = current ? (statusRank[current.status] ?? -1) : -999;
      if (invRank > curRank) {
        result[inv.jobId] = inv;
      }
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch invoice summaries" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [inv] = await buildInvoiceQuery().where(eq(invoicesTable.id, id));
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    res.json(fmt(inv));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch invoice" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Guard: cancelled (voided) invoices are read-only
    const [currentInv] = await db
      .select({ status: invoicesTable.status, invoiceNumber: invoicesTable.invoiceNumber })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id));
    if (!currentInv) return res.status(404).json({ error: "Invoice not found" });
    if (currentInv.status === "cancelled") {
      return res.status(400).json({ error: "Voided invoices cannot be edited." });
    }

    const { clientId, jobId, issueDate, dueDate, taxRate, notes, terms, lineItems = [], city, state, locationName, attachments, businessLine } = req.body;
    // NOTE: `status` is intentionally NOT destructured from req.body.
    // All status transitions must go through the dedicated lifecycle endpoints:
    //   POST /accept, POST /mark-sent, PATCH /status, POST /void
    // This prevents bypassing the Draft → Approved → Sent progression.

    // Validate line items before any DB work
    const lineItemError = validateLineItems(lineItems);
    if (lineItemError) return res.status(400).json({ error: lineItemError });

    const { subtotal, taxAmount, total } = calcInvoice(lineItems, taxRate);

    await db.update(invoicesTable).set({
      clientId: clientId || null,
      jobId: jobId || null,
      issueDate, dueDate,
      subtotal: subtotal.toString(),
      taxRate: taxRate?.toString() ?? null,
      taxAmount: taxAmount.toString(),
      total: total.toString(),
      city: city || null,
      state: state || null,
      locationName: locationName || null,
      notes, terms,
      lineItems: lineItems.map((li: any, i: number) => ({ ...li, id: i + 1 })),
      ...(attachments !== undefined ? { attachments: Array.isArray(attachments) ? attachments : [] } : {}),
      ...(businessLine !== undefined ? { businessLine: businessLine || null } : {}),
    }).where(eq(invoicesTable.id, id));

    const [withJoins] = await buildInvoiceQuery().where(eq(invoicesTable.id, id));
    if (!withJoins) return res.status(404).json({ error: "Invoice not found" });
    res.json(fmt(withJoins));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update invoice" });
  }
});

// ── Accept invoice: draft → approved (assigns invoice number) ─────────────────
router.post("/:id/accept", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [current] = await db
      .select({ status: invoicesTable.status, invoiceNumber: invoicesTable.invoiceNumber })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id));
    if (!current) return res.status(404).json({ error: "Invoice not found" });
    if (current.status !== "draft") {
      return res.status(400).json({ error: `Only draft invoices can be accepted. This invoice is ${current.status}.` });
    }
    await assignInvoiceNumberIfNeeded(id);
    await db.update(invoicesTable)
      .set({ status: "approved", acceptedAt: new Date() })
      .where(eq(invoicesTable.id, id));
    const [withJoins] = await buildInvoiceQuery().where(eq(invoicesTable.id, id));
    if (!withJoins) return res.status(404).json({ error: "Invoice not found" });
    res.json(fmt(withJoins));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to accept invoice" });
  }
});

// ── Mark invoice as sent (manual) ─────────────────────────────────────────────
router.post("/:id/mark-sent", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [current] = await db
      .select({ status: invoicesTable.status })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id));
    if (!current) return res.status(404).json({ error: "Invoice not found" });
    if (current.status !== "approved" && current.status !== "sent") {
      return res.status(400).json({ error: `Invoice must be in Approved or Sent status to mark as sent.` });
    }
    await db.update(invoicesTable)
      .set({ status: "sent", sentAt: new Date(), sentMethod: "manual" })
      .where(eq(invoicesTable.id, id));
    const [withJoins] = await buildInvoiceQuery().where(eq(invoicesTable.id, id));
    res.json(fmt(withJoins));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark invoice as sent" });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    const [current] = await db
      .select({ status: invoicesTable.status, invoiceNumber: invoicesTable.invoiceNumber })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id));
    if (!current) return res.status(404).json({ error: "Invoice not found" });
    if (current.status === "cancelled") {
      return res.status(400).json({ error: "Voided invoices cannot be modified." });
    }

    // Enforce valid state transitions
    const allowed = VALID_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        error: `Invalid transition: ${current.status} → ${status}. Use the accept or send endpoints for status changes that require additional processing.`,
      });
    }

    await db.update(invoicesTable).set({ status }).where(eq(invoicesTable.id, id));
    const [withJoins] = await buildInvoiceQuery().where(eq(invoicesTable.id, id));
    if (!withJoins) return res.status(404).json({ error: "Invoice not found" });
    res.json(fmt(withJoins));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update invoice status" });
  }
});

// ── Void an invoice (audit-safe — keeps the record, sets status to cancelled) ──
router.post("/:id/void", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const [inv] = await db
      .select({
        status: invoicesTable.status,
        squarePaymentLinkId: invoicesTable.squarePaymentLinkId,
      })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id));

    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    if (inv.status === "cancelled") {
      return res.status(400).json({ error: "Invoice is already voided." });
    }
    if (inv.status === "draft") {
      return res.status(400).json({ error: "Draft invoices should be deleted, not voided. Use the delete endpoint instead." });
    }

    // Best-effort Square cleanup before voiding
    if (inv.squarePaymentLinkId && isSquareConfigured()) {
      try {
        await deleteSquarePaymentLink(inv.squarePaymentLinkId);
      } catch (squareErr) {
        console.warn("Square payment link deletion failed during void (continuing):", squareErr);
      }
    }

    await db.update(invoicesTable)
      .set({ status: "cancelled", squarePaymentLinkId: null, squarePaymentLinkUrl: null })
      .where(eq(invoicesTable.id, id));

    const [withJoins] = await buildInvoiceQuery().where(eq(invoicesTable.id, id));
    res.json(fmt(withJoins));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to void invoice" });
  }
});

// ── Record a manual payment against an invoice ────────────────────────────────
// Accumulates amountPaid; auto-advances status to partiallyPaid or paid.
router.post("/:id/record-payment", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { amount, paidAt } = req.body as { amount: number; paidAt?: string };
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number." });
    }

    const [current] = await db
      .select({ status: invoicesTable.status, total: invoicesTable.total, amountPaid: invoicesTable.amountPaid })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id));

    if (!current) return res.status(404).json({ error: "Invoice not found" });
    if (!["approved", "sent", "partiallyPaid", "overdue"].includes(current.status)) {
      return res.status(400).json({ error: `Cannot record a payment on a ${current.status} invoice.` });
    }

    const total = parseFloat(current.total ?? "0");
    const prevPaid = current.amountPaid ? parseFloat(current.amountPaid) : 0;
    const newAmountPaid = parseFloat(Math.min(prevPaid + amount, total).toFixed(2));
    const newStatus = newAmountPaid >= total ? "paid" : "partiallyPaid";
    const paymentDate = paidAt ? new Date(paidAt) : new Date();

    await db.update(invoicesTable)
      .set({ amountPaid: String(newAmountPaid), status: newStatus, lastManualPaidAt: paymentDate })
      .where(eq(invoicesTable.id, id));

    const [withJoins] = await buildInvoiceQuery().where(eq(invoicesTable.id, id));
    res.json(fmt(withJoins));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Only allow hard-delete of unnumbered drafts
    const [inv] = await db
      .select({
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
      })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id));

    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    // Only unnumbered drafts may be hard-deleted. Once an invoice number has
    // been assigned the record belongs to the permanent audit trail — use void.
    if (inv.invoiceNumber || inv.status !== "draft") {
      return res.status(400).json({
        error: "This invoice has already been issued. Use void to permanently cancel it while preserving the audit record.",
      });
    }

    await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});

// ── Send invoice via email ─────────────────────────────────────────────────────
router.post("/:id/send", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { to, subject, message, attachChecklist = true } = req.body as { to: string; subject: string; message: string; attachChecklist?: boolean };

    if (!to) return res.status(400).json({ error: "Recipient email is required" });

    const [[inv], [settings]] = await Promise.all([
      buildInvoiceQuery().where(eq(invoicesTable.id, id)),
      db.select().from(settingsTable).limit(1),
    ]);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    if (inv.status === "draft") {
      return res.status(400).json({ error: "Draft invoices must be accepted (approved) before they can be sent. Use the Accept Invoice button on the job card." });
    }
    if (inv.status === "cancelled") return res.status(400).json({ error: "A voided invoice cannot be sent." });
    // Only approved or sent invoices can be emailed
    if (inv.status !== "approved" && inv.status !== "sent") {
      return res.status(400).json({ error: `Invoice cannot be emailed in its current state (${inv.status}).` });
    }

    // Assign number if missing (should always have one by this point, but guard just in case)
    await assignInvoiceNumberIfNeeded(id);
    const [freshInv] = await buildInvoiceQuery().where(eq(invoicesTable.id, id));
    const invForEmail = freshInv ?? inv;

    // Resolve business profile by the invoice's businessLine slug (if any)
    const bizRows: Business[] = invForEmail.businessLine
      ? await db.select().from(businessesTable).where(eq(businessesTable.slug, invForEmail.businessLine as string)).limit(1)
      : [];
    const biz = bizRows[0];
    const mergedSettings: InvoiceEmailSettings = {
      ...(settings ?? {}),
      ...(biz ? {
        companyName: biz.name || settings?.companyName,
        companyAddress: biz.address || settings?.companyAddress,
        companyCity: biz.city || settings?.companyCity,
        companyState: biz.state || settings?.companyState,
        companyZip: biz.zip || settings?.companyZip,
        companyPhone: biz.phone || settings?.companyPhone,
        companyEmail: biz.email || settings?.companyEmail,
      } : {}),
    };

    const companyName = mergedSettings.companyName ?? "BuildPro";
    const subjectLine = subject || `Invoice ${invForEmail.invoiceNumber} from ${companyName}`;

    // If this invoice is linked to a job that has a checklist, optionally attach it
    const extraAttachments = [];
    if (attachChecklist && invForEmail.jobId) {
      try {
        const checklistPdf = await generateChecklistPdfBuffer(invForEmail.jobId as number);
        if (checklistPdf) {
          extraAttachments.push({ filename: checklistPdf.filename, mimeType: "application/pdf", buffer: checklistPdf.buffer });
        }
      } catch (checklistErr) {
        console.warn("[invoices/send] Could not generate checklist PDF — sending without it:", checklistErr);
      }
    }

    // If this invoice is linked to a job that has material lists, attach the breakdown PDF
    if (invForEmail.jobId) {
      try {
        const materialsPdf = await generateMaterialsPdfBuffer(invForEmail.jobId as number);
        if (materialsPdf) {
          extraAttachments.push({ filename: materialsPdf.filename, mimeType: "application/pdf", buffer: materialsPdf.buffer });
        }
      } catch (materialsErr) {
        console.warn("[invoices/send] Could not generate materials PDF — sending without it:", materialsErr);
      }
    }

    // Attach any photos stored on the invoice.
    // invoice.attachments is a JSON array of { name, url, size? } objects
    // (legacy records may contain plain URL strings — both are handled).
    // URL patterns:
    //   /objects/...        → GCS-backed object storage (new uploads)
    //   /uploads/...        → legacy local disk (express.static serves these)
    //   /api/uploads/...    → legacy local disk with api prefix
    const objStorage = new ObjectStorageService();
    const uploadsRoot = path.resolve("uploads");
    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".png": "image/png", ".gif": "image/gif",
      ".webp": "image/webp", ".pdf": "application/pdf",
    };
    const imageTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
    const inlineImages: InlineImage[] = [];
    const rawAttachments: unknown[] = Array.isArray(invForEmail.attachments) ? invForEmail.attachments : [];
    for (const entry of rawAttachments) {
      try {
        // Normalise to a URL string regardless of whether the DB stores objects or plain strings
        const rawUrl: string = (typeof entry === "object" && entry !== null && "url" in entry)
          ? String((entry as { url: unknown }).url)
          : typeof entry === "string" ? entry : "";
        if (!rawUrl) continue;

        let buffer: Buffer | null = null;

        // Normalize the URL produced by the current /api/uploads endpoint, which returns
        // url: "/api/storage/objects/..." → underlying objectPath is "/objects/..."
        const normalizedUrl = rawUrl.startsWith("/api/storage/objects/")
          ? "/objects/" + rawUrl.slice("/api/storage/objects/".length)
          : rawUrl;

        if (normalizedUrl.startsWith("/objects/")) {
          // GCS-backed object storage
          const file = await objStorage.getObjectEntityFile(normalizedUrl);
          const [dl] = await file.download();
          buffer = dl as Buffer;
        } else if (normalizedUrl.startsWith("/uploads/") || normalizedUrl.startsWith("/api/uploads/")) {
          // Legacy local-disk uploads
          const rel = rawUrl.startsWith("/api/uploads/")
            ? rawUrl.slice("/api/uploads/".length)
            : rawUrl.slice("/uploads/".length);
          const filePath = path.resolve(uploadsRoot, rel);
          // Path-traversal guard
          if (!filePath.startsWith(uploadsRoot + path.sep) && filePath !== uploadsRoot) {
            console.warn("[invoices/send] Photo path traversal blocked, skipping:", rawUrl);
            continue;
          }
          if (!fs.existsSync(filePath)) {
            console.warn("[invoices/send] Photo not found on disk, skipping:", filePath);
            continue;
          }
          buffer = fs.readFileSync(filePath);
        }

        if (!buffer) continue;

        const filename = (typeof entry === "object" && entry !== null && "name" in entry)
          ? String((entry as { name: unknown }).name)
          : path.basename(rawUrl);
        const ext = path.extname(filename).toLowerCase();
        const mimeType = mimeMap[ext] ?? "application/octet-stream";
        const photoType: "before" | "after" | "general" =
          (typeof entry === "object" && entry !== null && "photoType" in entry &&
           typeof (entry as Record<string, unknown>).photoType === "string" &&
           ["before", "after", "general"].includes((entry as Record<string, unknown>).photoType as string))
            ? (entry as Record<string, unknown>).photoType as "before" | "after" | "general"
            : "general";
        if (imageTypes.has(mimeType)) {
          // Resize to max 1200px to keep the email under Gmail's size limit.
          // iPhone photos are typically 3-5 MB; this brings them down to ~150-250 KB each.
          try {
            buffer = await sharp(buffer)
              .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
              .jpeg({ quality: 80 })
              .toBuffer();
          } catch (resizeErr) {
            console.warn("[invoices/send] Could not resize photo, using original:", filename, resizeErr);
          }
          inlineImages.push({ filename: filename.replace(/\.[^.]+$/, ".jpg"), mimeType: "image/jpeg", buffer, photoType });
        } else {
          extraAttachments.push({ filename, mimeType, buffer });
        }
      } catch (photoErr) {
        console.warn("[invoices/send] Could not attach photo — skipping:", entry, photoErr);
      }
    }

    await sendInvoiceEmail(
      fmt(invForEmail),
      mergedSettings,
      to,
      subjectLine,
      message,
      extraAttachments.length ? extraAttachments : undefined,
      inlineImages.length ? inlineImages : undefined,
    );

    const now = new Date();
    await db.update(invoicesTable)
      .set({ status: "sent", sentAt: now, sentMethod: "email" })
      .where(eq(invoicesTable.id, id));

    const [updated] = await buildInvoiceQuery().where(eq(invoicesTable.id, id));
    res.json({ success: true, invoice: fmt(updated) });
  } catch (err: any) {
    console.error("Email send error:", err);
    res.status(500).json({ error: err.message || "Failed to send email" });
  }
});

// ── Send reminder email for an invoice ────────────────────────────────────────
router.post("/:id/send-reminder", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid invoice id" });

    const [[inv], [settings]] = await Promise.all([
      buildInvoiceQuery().where(eq(invoicesTable.id, id)),
      db.select().from(settingsTable).limit(1),
    ]);

    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    if (inv.status === "paid") return res.status(400).json({ error: "Invoice is already paid" });

    const paymentLink = inv.squarePaymentLinkUrl;
    if (!paymentLink) return res.status(400).json({ error: "Invoice has no Square payment link. Generate one first." });

    const clientEmail = inv.clientEmail as string | null;
    if (!clientEmail) return res.status(400).json({ error: "Client has no email address on file." });

    // Resolve business profile by the invoice's businessLine slug (if any)
    const bizRows2: Business[] = inv.businessLine
      ? await db.select().from(businessesTable).where(eq(businessesTable.slug, inv.businessLine as string)).limit(1)
      : [];
    const biz2 = bizRows2[0];
    const mergedSettings: InvoiceEmailSettings = {
      ...(settings ?? {}),
      ...(biz2 ? {
        companyName: biz2.name || settings?.companyName,
        companyAddress: biz2.address || settings?.companyAddress,
        companyCity: biz2.city || settings?.companyCity,
        companyState: biz2.state || settings?.companyState,
        companyZip: biz2.zip || settings?.companyZip,
        companyPhone: biz2.phone || settings?.companyPhone,
        companyEmail: biz2.email || settings?.companyEmail,
      } : {}),
    };

    const companyName = mergedSettings.companyName ?? "BuildPro";
    const subject = `Reminder: Invoice ${inv.invoiceNumber} — Payment Due (${companyName})`;
    const message = `Hi ${inv.clientName || "there"},\n\nThis is a friendly reminder that invoice ${inv.invoiceNumber} is still outstanding. Please use the button below to pay securely online.\n\nThank you for your business!`;

    await sendInvoiceEmail(fmt(inv), mergedSettings, clientEmail, subject, message);

    const now = new Date().toISOString();
    const current = Array.isArray(inv.remindersSentAt) ? (inv.remindersSentAt as string[]) : [];
    const updated = [...current, now];

    await db.update(invoicesTable).set({ remindersSentAt: updated }).where(eq(invoicesTable.id, id));

    const [withJoins] = await buildInvoiceQuery().where(eq(invoicesTable.id, id));
    res.json({ success: true, sentAt: now, invoice: fmt(withJoins) });
  } catch (err: any) {
    console.error("Send reminder error:", err);
    res.status(500).json({ error: err.message || "Failed to send reminder" });
  }
});

router.post("/render-html-pdf", async (req, res) => {
  try {
    const { html } = req.body as { html: string };
    if (!html || typeof html !== "string") {
      res.status(400).json({ error: "html required" });
      return;
    }
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      // Navigate to about:blank first so the main frame is fully ready before
      // setRequestInterception — avoids "Requesting main frame too early!" crash.
      await page.goto("about:blank");
      // Block all network requests — HTML is self-contained; logo is embedded as
      // a data URI. This prevents SSRF via injected <img src="http://..."> tags.
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const url = req.url();
        if (url.startsWith("data:") || url === "about:blank") {
          req.continue();
        } else {
          req.abort();
        }
      });
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const pdfBuffer = await page.pdf({
        format: "Letter",
        printBackground: true,
        preferCSSPageSize: true,
      });
      const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");
      res.json({ pdfBase64 });
    } finally {
      await browser.close();
    }
  } catch (err: any) {
    console.error("render-html-pdf error:", err);
    res.status(500).json({ error: err.message || "PDF render failed" });
  }
});

export default router;
