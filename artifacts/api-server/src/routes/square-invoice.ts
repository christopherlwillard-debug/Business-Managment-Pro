import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable, clientsTable, jobsTable, settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createSquarePaymentLink, isSquareConfigured } from "../lib/square";
import { sendInvoiceEmail } from "../lib/invoiceEmail";

const router = Router();

const invoiceSelect = {
  ...invoicesTable,
  clientName: clientsTable.name,
  clientEmail: clientsTable.email,
};

function buildQuery() {
  return db.select(invoiceSelect)
    .from(invoicesTable)
    .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
    .leftJoin(jobsTable, eq(invoicesTable.jobId, jobsTable.id));
}

router.post("/:id/payment-link", async (req, res) => {
  try {
    if (!isSquareConfigured()) {
      return res.status(400).json({ error: "Square is not configured. Add SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID to your environment." });
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
    const productName = `${companyName}: Invoice ${inv.invoiceNumber}${inv.clientName ? ` — ${inv.clientName}` : ""}`;

    const { url, id: linkId } = await createSquarePaymentLink({
      amountCents,
      currency,
      productName,
      referenceId: `inv_${id}`,
      customerEmail: inv.clientEmail,
    });

    await db.update(invoicesTable)
      .set({
        squarePaymentLinkId: linkId,
        squarePaymentLinkUrl: url,
        status: inv.status === "draft" ? "sent" : inv.status,
      })
      .where(eq(invoicesTable.id, id));

    const [updated] = await buildQuery().where(eq(invoicesTable.id, id));

    // Auto-email the payment link to the client
    let emailSent = false;
    let emailWarning: string | null = null;

    if (!inv.clientEmail) {
      emailWarning = "No client email on file — payment link was not emailed.";
    } else if (!settings?.smtpHost || !settings?.smtpUser || !settings?.smtpPass) {
      emailWarning = "SMTP not configured — payment link was not emailed. Configure email in Settings.";
    } else {
      try {
        const invWithLink = { ...updated, squarePaymentLinkUrl: url };
        await sendInvoiceEmail(
          invWithLink,
          settings,
          inv.clientEmail,
          `Your Invoice ${inv.invoiceNumber} from ${companyName} — Payment Link`,
          `Hi ${inv.clientName || "there"},\n\nYour invoice ${inv.invoiceNumber} is ready. Please use the button below to pay securely online.\n\nThank you for your business!`,
        );
        emailSent = true;
      } catch (emailErr: unknown) {
        const msg = emailErr instanceof Error ? emailErr.message : "Unknown error";
        emailWarning = `Payment link created but email failed: ${msg}`;
        console.error("Invoice payment link auto-email error:", emailErr);
      }
    }

    res.json({ paymentLinkUrl: url, paymentLinkId: linkId, invoice: updated, emailSent, emailWarning });
  } catch (err: unknown) {
    console.error("Square invoice payment link error:", err);
    const message = err instanceof Error ? err.message : "Failed to create payment link";
    res.status(500).json({ error: message });
  }
});

export default router;
