import { Router } from "express";
import { launchBrowser } from "../lib/launchBrowser.js";
import { sendInvoiceEmail, type InvoiceEmailSettings } from "../lib/invoiceEmail";
import { generateChecklistPdfBuffer } from "../lib/generateChecklistPdf.js";
import { db } from "@workspace/db";
import { invoicesTable, clientsTable, jobsTable, settingsTable, businessesTable, type Business } from "@workspace/db/schema";
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm";
import { deleteSquarePaymentLink, isSquareConfigured } from "../lib/square.js";

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

function buildInvoiceQuery() {
  return db.select(invoiceSelect)
    .from(invoicesTable)
    .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
    .leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id));
}

function fmt(inv: any) {
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

router.get("/", async (req, res) => {
  try {
    const { status, clientId, jobId, startDate, endDate } = req.query;
    const conditions: any[] = [];
    if (status) conditions.push(eq(invoicesTable.status, status as string));
    if (clientId) conditions.push(eq(invoicesTable.clientId, parseInt(clientId as string)));
    if (jobId) conditions.push(eq(invoicesTable.jobId, parseInt(jobId as string)));
    if (startDate) conditions.push(gte(invoicesTable.issueDate, startDate as string));
    if (endDate) conditions.push(lte(invoicesTable.issueDate, endDate as string));

    const invoices = await buildInvoiceQuery()
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(invoicesTable.createdAt));

    res.json(invoices.map(fmt));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { clientId, jobId, status, issueDate, dueDate, taxRate, notes, terms, lineItems = [], city, state, locationName, attachments = [], businessLine } = req.body;
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

    for (const inv of formatted) {
      if (inv.jobId == null) continue;
      const current = result[inv.jobId];
      if (current === null) {
        result[inv.jobId] = inv;
      } else if (inv.status === "paid" && current.status !== "paid") {
        result[inv.jobId] = inv;
      } else if (inv.status === "sent" && current.status !== "paid" && current.status !== "sent") {
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
    const { clientId, jobId, status, issueDate, dueDate, taxRate, notes, terms, lineItems = [], city, state, locationName, attachments, businessLine } = req.body;
    const { subtotal, taxAmount, total } = calcInvoice(lineItems, taxRate);

    await db.update(invoicesTable).set({
      clientId: clientId || null,
      jobId: jobId || null,
      status, issueDate, dueDate,
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

router.patch("/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    await db.update(invoicesTable).set({ status }).where(eq(invoicesTable.id, id));
    const [withJoins] = await buildInvoiceQuery().where(eq(invoicesTable.id, id));
    if (!withJoins) return res.status(404).json({ error: "Invoice not found" });
    res.json(fmt(withJoins));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update invoice status" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Fetch the invoice first so we can clean up its Square payment link
    const [inv] = await db
      .select({ squarePaymentLinkId: invoicesTable.squarePaymentLinkId })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id));

    // Best-effort Square cleanup — never block deletion if Square fails
    if (inv?.squarePaymentLinkId && isSquareConfigured()) {
      try {
        await deleteSquarePaymentLink(inv.squarePaymentLinkId);
      } catch (squareErr) {
        console.warn("Square payment link deletion failed (continuing anyway):", squareErr);
      }
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

    // Resolve business profile by the invoice's businessLine slug (if any)
    const bizRows: Business[] = inv.businessLine
      ? await db.select().from(businessesTable).where(eq(businessesTable.slug, inv.businessLine as string)).limit(1)
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
    const subjectLine = subject || `Invoice ${inv.invoiceNumber} from ${companyName}`;

    // If this invoice is linked to a job that has a checklist, optionally attach it
    const extraAttachments = [];
    if (attachChecklist && inv.jobId) {
      try {
        const checklistPdf = await generateChecklistPdfBuffer(inv.jobId as number);
        if (checklistPdf) {
          extraAttachments.push({ filename: checklistPdf.filename, mimeType: "application/pdf", buffer: checklistPdf.buffer });
        }
      } catch (checklistErr) {
        console.warn("[invoices/send] Could not generate checklist PDF — sending without it:", checklistErr);
      }
    }

    await sendInvoiceEmail(fmt(inv), mergedSettings, to, subjectLine, message, extraAttachments.length ? extraAttachments : undefined);

    await db.update(invoicesTable).set({ status: "sent" }).where(eq(invoicesTable.id, id));

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
