import nodemailer from "nodemailer";

export interface InvoiceEmailInv {
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  squarePaymentLinkUrl?: string | null;
  stripePaymentLinkUrl?: string | null;
  subtotal?: string | null;
  taxRate?: string | null;
  taxAmount?: string | null;
  total?: string | null;
  terms?: string | null;
  notes?: string | null;
  lineItems?: unknown;
}

export interface InvoiceEmailSettings {
  companyName?: string | null;
  companyAddress?: string | null;
  companyCity?: string | null;
  companyState?: string | null;
  companyZip?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  smtpHost?: string | null;
  smtpPort?: string | null;
  smtpUser?: string | null;
  smtpPass?: string | null;
  smtpSecure?: number | null;
}

function fmtCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function buildInvoiceEmailHtml(inv: InvoiceEmailInv, settings: InvoiceEmailSettings, message?: string): string {
  const lineItems: any[] = Array.isArray(inv.lineItems) ? inv.lineItems : [];

  const lineRows = lineItems.map(li => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;">${li.description}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${parseFloat(li.quantity)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmtCurrency(parseFloat(li.unitPrice))}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">${fmtCurrency(parseFloat(li.quantity) * parseFloat(li.unitPrice))}</td>
      </tr>`).join("");

  const subtotal = parseFloat(inv.subtotal ?? "0");
  const taxAmount = parseFloat(inv.taxAmount ?? "0");
  const total = parseFloat(inv.total ?? "0");
  const taxRate = inv.taxRate ? parseFloat(inv.taxRate) : 0;
  const paymentLink = inv.squarePaymentLinkUrl ?? inv.stripePaymentLinkUrl ?? null;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(90deg,#f59e0b,#fbbf24);height:6px;"></td></tr>
        <tr><td style="padding:32px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><p style="margin:0;font-size:22px;font-weight:800;color:#111;">${settings.companyName || "Your Company"}</p>
                  ${settings.companyAddress ? `<p style="margin:4px 0 0;font-size:12px;color:#888;">${settings.companyAddress}</p>` : ""}
                  ${settings.companyCity || settings.companyState ? `<p style="margin:2px 0 0;font-size:12px;color:#888;">${[settings.companyCity, settings.companyState, settings.companyZip].filter(Boolean).join(", ")}</p>` : ""}
                  ${settings.companyPhone ? `<p style="margin:2px 0 0;font-size:12px;color:#888;">${settings.companyPhone}</p>` : ""}
              </td>
              <td align="right">
                <p style="margin:0;font-size:28px;font-weight:900;color:#e5e7eb;letter-spacing:4px;">INVOICE</p>
                <p style="margin:0;font-size:14px;font-weight:700;color:#f59e0b;">${inv.invoiceNumber}</p>
                ${inv.issueDate ? `<p style="margin:4px 0 0;font-size:12px;color:#888;">Date: ${inv.issueDate}</p>` : ""}
                ${inv.dueDate ? `<p style="margin:2px 0 0;font-size:12px;color:#888;">Due: ${inv.dueDate}</p>` : ""}
              </td>
            </tr>
          </table>
        </td></tr>
        ${inv.clientName ? `<tr><td style="padding:0 40px 20px;"><p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#aaa;">Bill To</p><p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#111;">${inv.clientName}</p></td></tr>` : ""}
        ${message ? `<tr><td style="padding:0 40px 20px;"><p style="margin:0;font-size:14px;color:#555;line-height:1.6;">${message.replace(/\n/g, "<br>")}</p></td></tr>` : ""}
        <tr><td style="padding:0 40px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#fafafa;">
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:700;">Description</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:700;">Qty</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:700;">Rate</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:700;">Amount</th>
              </tr>
            </thead>
            <tbody>${lineRows}</tbody>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
            <tr><td align="right">
              <table cellpadding="0" cellspacing="0">
                <tr><td style="padding:4px 0;font-size:13px;color:#888;padding-right:24px;">Subtotal</td><td style="padding:4px 0;font-size:13px;text-align:right;">${fmtCurrency(subtotal)}</td></tr>
                ${taxRate > 0 ? `<tr><td style="padding:4px 0;font-size:13px;color:#888;padding-right:24px;">Tax (${taxRate}%)</td><td style="padding:4px 0;font-size:13px;text-align:right;">${fmtCurrency(taxAmount)}</td></tr>` : ""}
                <tr><td colspan="2" style="padding-top:8px;border-top:2px solid #111;"></td></tr>
                <tr><td style="padding:8px 24px 0 0;font-size:16px;font-weight:800;color:#111;">Total Due</td><td style="padding:8px 0 0;font-size:16px;font-weight:800;color:#f59e0b;text-align:right;">${fmtCurrency(total)}</td></tr>
              </table>
            </td></tr>
          </table>
          ${inv.terms ? `<p style="margin:20px 0 0;font-size:12px;color:#888;">Payment Terms: ${inv.terms}</p>` : ""}
          ${inv.notes ? `<p style="margin:8px 0 0;font-size:12px;color:#888;">${inv.notes}</p>` : ""}
          ${paymentLink ? `
          <div style="margin-top:24px;padding:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;text-align:center;">
            <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#15803d;">Pay this invoice securely online:</p>
            <a href="${paymentLink}" target="_blank" style="display:inline-block;background:#f59e0b;color:#fff;font-size:14px;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none;">Pay Now — ${fmtCurrency(total)}</a>
            <p style="margin:10px 0 0;font-size:11px;color:#6b7280;">Powered by Square · Secure payment</p>
          </div>` : ""}
        </td></tr>
        <tr><td style="padding:20px 40px;background:#fafafa;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:12px;color:#aaa;text-align:center;">Thank you for your business · ${settings.companyName || ""} · ${settings.companyEmail || ""}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendInvoiceEmail(
  inv: InvoiceEmailInv,
  settings: InvoiceEmailSettings,
  to: string,
  subject: string,
  message?: string,
): Promise<void> {
  if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
    throw new Error("Email not configured. Set up SMTP in Settings → Invoice Defaults.");
  }

  const html = buildInvoiceEmailHtml(inv, settings, message);
  const total = parseFloat(inv.total ?? "0");

  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: parseInt(settings.smtpPort ?? "587"),
    secure: settings.smtpSecure === 1,
    auth: { user: settings.smtpUser!, pass: settings.smtpPass! },
  });

  await transporter.sendMail({
    from: `"${settings.companyName || "BuildPro"}" <${settings.companyEmail || settings.smtpUser}>`,
    to,
    subject,
    html,
    text: message || `Please find invoice ${inv.invoiceNumber} attached. Total Due: $${total.toFixed(2)}`,
  });
}
