export interface ReminderEligibleInvoice {
  status: string | null | undefined;
  invoiceNumber?: string | null;
  clientEmail?: string | null;
  reminderOptOut?: boolean | null;
}

export function reminderEligibilityError(invoice: ReminderEligibleInvoice): string | null {
  if (invoice.status === "paid") return "Invoice is already paid.";
  if (invoice.status === "cancelled") return "A voided invoice cannot receive reminders.";
  if (invoice.status === "draft") return "Draft invoices must be accepted before sending reminders.";
  if (invoice.reminderOptOut) return "This client has opted out of invoice reminders.";
  if (!invoice.invoiceNumber) return "Invoice must have an invoice number before sending reminders.";
  if (!invoice.clientEmail) return "Client has no email address on file.";
  return null;
}

export function reminderMessage(
  invoice: { invoiceNumber?: string | null; issueDate?: string | null; clientName?: string | null; total?: string | number | null },
  companyName: string,
  companyPhone?: string | null,
  companyEmail?: string | null,
  hasSquareLink = false,
): string {
  const name = invoice.clientName || "there";
  const total = `$${Number(invoice.total ?? 0).toFixed(2)}`;
  if (hasSquareLink) {
    return `Hi ${name},\n\nThis is a friendly reminder that invoice ${invoice.invoiceNumber} (${total}) is still outstanding. Please use the button below to pay securely online.\n\nThank you for your business!`;
  }
  const contactLines = [
    companyPhone ? `Phone: ${companyPhone}` : "",
    companyEmail ? `Email: ${companyEmail}` : "",
  ].filter(Boolean);
  const contactBlock = contactLines.length ? `\n\n${contactLines.join("\n")}` : "";
  return `Hi ${name},\n\nThis is a friendly reminder that invoice ${invoice.invoiceNumber} issued on ${invoice.issueDate ?? "the date shown on the invoice"} for ${total} is still outstanding. Please contact us to arrange payment.${contactBlock}\n\nThank you for your business!`;
}