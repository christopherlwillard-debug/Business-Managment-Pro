import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable, clientsTable, jobsTable, settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createPaymentLink, isStripeConfigured } from "../lib/stripe";

const router = Router();

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

function buildQuery() {
  return db.select(invoiceSelect)
    .from(invoicesTable)
    .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
    .leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id));
}

router.post("/:id/payment-link", async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(400).json({ error: "Stripe is not configured. Add STRIPE_SECRET_KEY to your environment." });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid invoice id" });

    const [[inv], [settings]] = await Promise.all([
      buildQuery().where(eq(invoicesTable.id, id)),
      db.select().from(settingsTable).limit(1),
    ]);

    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    const total = parseFloat(inv.total ?? "0");
    if (total <= 0) return res.status(400).json({ error: "Invoice total must be greater than zero" });

    const amountCents = Math.round(total * 100);
    const currency = settings?.currency ?? "USD";
    const companyName = settings?.companyName ?? "BuildPro";

    const productName = `Invoice ${inv.invoiceNumber}${inv.clientName ? ` — ${inv.clientName}` : ""}`;
    const metadata: Record<string, string> = {
      invoice_id: String(id),
      invoice_number: inv.invoiceNumber,
      source: "buildpro",
    };

    const { url, id: linkId } = await createPaymentLink({
      amountCents,
      currency,
      productName: `${companyName}: ${productName}`,
      metadata,
      customerEmail: inv.clientEmail,
    });

    await db.update(invoicesTable)
      .set({
        stripePaymentLinkId: linkId,
        stripePaymentLinkUrl: url,
        status: inv.status === "draft" ? "sent" : inv.status,
      })
      .where(eq(invoicesTable.id, id));

    const [updated] = await buildQuery().where(eq(invoicesTable.id, id));
    res.json({
      paymentLinkUrl: url,
      paymentLinkId: linkId,
      invoice: updated,
    });
  } catch (err: unknown) {
    console.error("Stripe invoice payment link error:", err);
    const message = err instanceof Error ? err.message : "Failed to create payment link";
    res.status(500).json({ error: message });
  }
});

export default router;
