function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface GmailSendOptions {
  token: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email via the Gmail API using an OAuth2 access token.
 * The From address is always the authenticated Gmail user's address —
 * we do NOT set a custom From header to avoid authorization failures.
 */
export async function sendViaGmail(opts: GmailSendOptions): Promise<void> {
  const { token, to, subject, html, text } = opts;
  const boundary = `==BP${Date.now()}==`;

  const rfcLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    text ?? `Please see your invoice below.`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    html,
    ``,
    `--${boundary}--`,
  ];

  const raw = base64UrlEncode(rfcLines.join("\r\n"));

  const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ?? `Gmail API error ${resp.status}`
    );
  }
}

export function buildInvoiceEmailHtml(opts: {
  companyName?: string;
  companyAddress?: string;
  companyCity?: string;
  companyState?: string;
  companyZip?: string;
  companyPhone?: string;
  companyEmail?: string;
  invoiceNumber: string;
  issueDate?: string | null;
  dueDate?: string | null;
  clientName?: string | null;
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  taxRate?: number;
  taxAmount?: number;
  total: number;
  terms?: string | null;
  notes?: string | null;
  customMessage?: string;
}): string {
  const fmt = (n: number) => `$${n.toFixed(2)}`;

  const lineRows = opts.lineItems.map(li => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;">${li.description}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${li.quantity}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmt(li.unitPrice)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">${fmt(li.quantity * li.unitPrice)}</td>
    </tr>`).join("");

  const taxRow = (opts.taxRate ?? 0) > 0
    ? `<tr><td style="padding:4px 24px 0 0;font-size:13px;color:#888;">Tax (${opts.taxRate}%)</td><td style="padding:4px 0 0;font-size:13px;text-align:right;">${fmt(opts.taxAmount ?? 0)}</td></tr>`
    : "";

  const cityLine = [opts.companyCity, opts.companyState, opts.companyZip].filter(Boolean).join(", ");

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
              <td>
                <p style="margin:0;font-size:22px;font-weight:800;color:#111;">${opts.companyName || "Your Company"}</p>
                ${opts.companyAddress ? `<p style="margin:4px 0 0;font-size:12px;color:#888;">${opts.companyAddress}</p>` : ""}
                ${cityLine ? `<p style="margin:2px 0 0;font-size:12px;color:#888;">${cityLine}</p>` : ""}
                ${opts.companyPhone ? `<p style="margin:2px 0 0;font-size:12px;color:#888;">${opts.companyPhone}</p>` : ""}
              </td>
              <td align="right">
                <p style="margin:0;font-size:28px;font-weight:900;color:#e5e7eb;letter-spacing:4px;">INVOICE</p>
                <p style="margin:0;font-size:14px;font-weight:700;color:#f59e0b;">${opts.invoiceNumber}</p>
                ${opts.issueDate ? `<p style="margin:4px 0 0;font-size:12px;color:#888;">Date: ${opts.issueDate}</p>` : ""}
                ${opts.dueDate ? `<p style="margin:2px 0 0;font-size:12px;color:#888;">Due: ${opts.dueDate}</p>` : ""}
              </td>
            </tr>
          </table>
        </td></tr>
        ${opts.clientName ? `<tr><td style="padding:0 40px 20px;"><p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#aaa;">Bill To</p><p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#111;">${opts.clientName}</p></td></tr>` : ""}
        ${opts.customMessage ? `<tr><td style="padding:0 40px 20px;"><p style="margin:0;font-size:14px;color:#555;line-height:1.6;">${opts.customMessage.replace(/\n/g, "<br>")}</p></td></tr>` : ""}
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
                <tr><td style="padding:4px 0;font-size:13px;color:#888;padding-right:24px;">Subtotal</td><td style="padding:4px 0;font-size:13px;text-align:right;">${fmt(opts.subtotal)}</td></tr>
                ${taxRow}
                <tr><td colspan="2" style="padding-top:8px;border-top:2px solid #111;"></td></tr>
                <tr><td style="padding:8px 24px 0 0;font-size:16px;font-weight:800;color:#111;">Total Due</td><td style="padding:8px 0 0;font-size:16px;font-weight:800;color:#f59e0b;text-align:right;">${fmt(opts.total)}</td></tr>
              </table>
            </td></tr>
          </table>
          ${opts.terms ? `<p style="margin:20px 0 0;font-size:12px;color:#888;">Payment Terms: ${opts.terms}</p>` : ""}
          ${opts.notes ? `<p style="margin:8px 0 0;font-size:12px;color:#888;">${opts.notes}</p>` : ""}
        </td></tr>
        <tr><td style="padding:20px 40px;background:#fafafa;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:12px;color:#aaa;text-align:center;">Thank you for your business · ${opts.companyName || ""} · ${opts.companyEmail || ""}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
