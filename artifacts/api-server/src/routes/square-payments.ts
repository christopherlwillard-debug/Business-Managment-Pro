import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable, settingsTable, squarePaymentsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { sendEmail, escapeHtml } from "../lib/sendEmail";

const router = Router();

router.get("/square/payments", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(squarePaymentsTable)
      .orderBy(desc(squarePaymentsTable.paidAt))
      .limit(100);

    res.json({ payments: rows });
  } catch (err: unknown) {
    console.error("Square payments list error:", err);
    const message = err instanceof Error ? err.message : "Failed to fetch payments";
    res.status(500).json({ error: message });
  }
});

router.get("/square/payments/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid payment id" });
    }
    const [row] = await db
      .select()
      .from(squarePaymentsTable)
      .where(eq(squarePaymentsTable.id, id))
      .limit(1);

    if (!row) {
      return res.status(404).json({ error: "Payment not found" });
    }
    res.json({ payment: row });
  } catch (err: unknown) {
    console.error("Square payment detail error:", err);
    const message = err instanceof Error ? err.message : "Failed to fetch payment";
    res.status(500).json({ error: message });
  }
});

router.post("/square/record-payment", async (req, res) => {
  try {
    const { squarePaymentId, amountCents, invoiceId, description, customerEmail, customerName } = req.body as {
      squarePaymentId: string;
      amountCents: number;
      invoiceId?: number | null;
      description?: string | null;
      customerEmail?: string | null;
      customerName?: string | null;
    };

    if (!squarePaymentId) {
      return res.status(400).json({ error: "squarePaymentId is required" });
    }
    if (!amountCents || amountCents <= 0) {
      return res.status(400).json({ error: "amountCents must be greater than zero" });
    }

    let resolvedInvoiceNumber: string | null = null;

    if (invoiceId) {
      const [updatedInvoice] = await db.update(invoicesTable)
        .set({ status: "paid", squarePaidAt: new Date() })
        .where(eq(invoicesTable.id, invoiceId))
        .returning({ invoiceNumber: invoicesTable.invoiceNumber });
      resolvedInvoiceNumber = updatedInvoice?.invoiceNumber ?? null;
    }

    let paymentRecorded = false;
    let paymentRecordError: string | null = null;
    try {
      const inserted = await db.insert(squarePaymentsTable).values({
        squarePaymentId,
        amountCents,
        description: description ?? null,
        invoiceId: invoiceId ?? null,
        invoiceNumber: resolvedInvoiceNumber,
        clientName: customerName ?? null,
        paidAt: new Date(),
      }).onConflictDoNothing().returning({ id: squarePaymentsTable.id });
      paymentRecorded = inserted.length > 0;
    } catch (insertErr) {
      const errMsg = insertErr instanceof Error ? insertErr.message : "Unknown error";
      console.error("Failed to insert square payment record:", insertErr);
      paymentRecordError = errMsg;
    }

    if (customerEmail) {
      try {
        const [settings] = await db.select().from(settingsTable).limit(1);
        const companyName = settings?.companyName ?? "BuildPro";
        const amount = `$${(amountCents / 100).toFixed(2)}`;
        const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
        const displayName = customerName ? escapeHtml(customerName) : "there";

        const html = `
<p>Hi ${displayName},</p>
<p>Thank you! Your payment of <strong>${amount}</strong> to <strong>${escapeHtml(companyName)}</strong> has been received.</p>
<table style="border-collapse:collapse;margin:16px 0;">
  <tr><td style="padding:4px 12px 4px 0;color:#64748B;">Amount</td><td><strong>${amount}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#64748B;">Date</td><td>${dateStr}</td></tr>
  ${description ? `<tr><td style="padding:4px 12px 4px 0;color:#64748B;">Description</td><td>${escapeHtml(description)}</td></tr>` : ""}
  <tr><td style="padding:4px 12px 4px 0;color:#64748B;">Payment ID</td><td style="font-family:monospace;font-size:12px;">${escapeHtml(squarePaymentId)}</td></tr>
</table>
<p>Thank you for your business!<br/><strong>${escapeHtml(companyName)}</strong></p>
`;

        await sendEmail({
          to: customerEmail,
          subject: `Receipt from ${companyName} — ${amount}`,
          html,
        });
      } catch (emailErr) {
        console.error("Failed to send Square receipt email:", emailErr);
      }
    }

    res.json({
      success: true,
      squarePaymentId,
      invoiceId: invoiceId ?? null,
      paymentRecorded,
      ...(paymentRecordError ? { paymentRecordWarning: paymentRecordError } : {}),
    });
  } catch (err: unknown) {
    console.error("Square record-payment error:", err);
    const message = err instanceof Error ? err.message : "Failed to record payment";
    res.status(500).json({ error: message });
  }
});

export default router;
