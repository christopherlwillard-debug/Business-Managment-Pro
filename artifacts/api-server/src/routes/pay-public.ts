import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable, quickChargesTable, settingsTable, clientsTable, jobsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/:payToken", async (req, res) => {
  try {
    const { payToken } = req.params;
    if (!payToken || payToken.length < 8) {
      return res.status(400).json({ error: "Invalid pay token" });
    }

    const [settings] = await db.select().from(settingsTable).limit(1);
    const businessName = settings?.companyName ?? "Willard's General Contracting";

    const [inv] = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        total: invoicesTable.total,
        status: invoicesTable.status,
        squarePaidAt: invoicesTable.squarePaidAt,
        stripePaidAt: invoicesTable.stripePaidAt,
        squarePaymentLinkUrl: invoicesTable.squarePaymentLinkUrl,
        clientName: clientsTable.name,
        jobTitle: jobsTable.title,
      })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id))
      .where(eq(invoicesTable.payToken, payToken))
      .limit(1);

    if (inv) {
      const paidAt = inv.squarePaidAt ?? inv.stripePaidAt;
      const isPaid = inv.status === "paid" || paidAt != null;
      const description = `Invoice ${inv.invoiceNumber}${inv.clientName ? ` — ${inv.clientName}` : ""}`;
      const amountCents = Math.round(parseFloat(inv.total ?? "0") * 100);

      if (isPaid) {
        return res.json({
          type: "invoice",
          paidAt: (paidAt instanceof Date ? paidAt : new Date()).toISOString(),
          businessName,
          description,
          amountCents,
        });
      }

      if (inv.squarePaymentLinkUrl) {
        return res.json({
          type: "invoice",
          squarePaymentLinkUrl: inv.squarePaymentLinkUrl,
          amountCents,
          description,
          businessName,
          paidAt: null,
        });
      }

      return res.status(409).json({
        error: "Payment link not yet generated. Please contact the business.",
      });
    }

    const [qc] = await db
      .select()
      .from(quickChargesTable)
      .where(eq(quickChargesTable.payToken, payToken))
      .limit(1);

    if (qc) {
      const isPaid = qc.status === "paid" || qc.paidAt != null;
      const amountCents = Math.round(parseFloat(qc.amount) * 100);

      if (isPaid) {
        const paidAt = qc.paidAt ?? new Date();
        return res.json({
          type: "quick_charge",
          paidAt: (paidAt instanceof Date ? paidAt : new Date()).toISOString(),
          businessName,
          description: qc.label,
          amountCents,
        });
      }

      if (qc.squarePaymentLinkUrl) {
        return res.json({
          type: "quick_charge",
          squarePaymentLinkUrl: qc.squarePaymentLinkUrl,
          amountCents,
          description: qc.label,
          businessName,
          paidAt: null,
        });
      }

      return res.status(409).json({
        error: "Payment link not yet generated. Please contact the business.",
      });
    }

    return res.status(404).json({ error: "Payment not found" });
  } catch (err) {
    console.error("Pay public endpoint error:", err);
    res.status(500).json({ error: "Failed to load payment" });
  }
});

export default router;
