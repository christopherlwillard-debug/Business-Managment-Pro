import nodemailer from "nodemailer";
import { sendEmail } from "./sendEmail.js";
import { launchBrowser } from "./launchBrowser.js";

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

export interface InlineImage {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export function buildInvoiceEmailHtml(inv: InvoiceEmailInv, settings: InvoiceEmailSettings, message?: string, inlineImages?: InlineImage[]): string {
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
        ${(inlineImages && inlineImages.length > 0) ? `
        <tr><td style="padding:0 40px 32px;">
          <p style="margin:0 0 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#aaa;">Job Photos</p>
          ${inlineImages.map(img => {
            const b64 = img.buffer.toString("base64");
            return `<div style="margin-bottom:12px;"><img src="data:${img.mimeType};base64,${b64}" alt="${img.filename}" style="max-width:500px;width:100%;height:auto;border-radius:6px;display:block;"></div>`;
          }).join("")}
        </td></tr>` : ""}
        <tr><td style="padding:20px 40px;background:#fafafa;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:12px;color:#aaa;text-align:center;">Thank you for your business · ${settings.companyName || ""} · ${settings.companyEmail || ""}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Generate a PDF buffer from invoice HTML using Puppeteer.
 * Returns null (with a console warning) if rendering fails so the email can
 * still be sent without an attachment rather than failing entirely.
 */
async function generateInvoicePdf(html: string): Promise<Buffer | null> {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto("about:blank");
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith("data:") || url === "about:blank") req.continue();
      else req.abort();
    });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdfBuffer = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdfBuffer);
  } catch (err) {
    console.warn("[invoiceEmail] PDF generation failed — sending without attachment:", err);
    return null;
  } finally {
    try { await browser?.close(); } catch {}
  }
}

export interface ExtraAttachment {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

/**
 * Send an invoice email. Uses SMTP (nodemailer) if fully configured, otherwise
 * falls back to the connected Gmail integration so emails work without any
 * additional SMTP setup. A PDF copy of the invoice is always attached.
 * Pass `extraAttachments` to include additional files (e.g. a checklist PDF).
 */
export async function sendInvoiceEmail(
  inv: InvoiceEmailInv,
  settings: InvoiceEmailSettings,
  to: string,
  subject: string,
  message?: string,
  extraAttachments?: ExtraAttachment[],
  inlineImages?: InlineImage[],
): Promise<void> {
  const html = buildInvoiceEmailHtml(inv, settings, message, inlineImages);
  const total = parseFloat(inv.total ?? "0");
  const text = message || `Please find invoice ${inv.invoiceNumber} attached. Total Due: $${total.toFixed(2)}`;
  const safeNum = (inv.invoiceNumber ?? "invoice").replace(/[^a-zA-Z0-9\-_]/g, "_");
  const pdfFilename = `Invoice-${safeNum}.pdf`;

  const pdfBuffer = await generateInvoicePdf(html);

  const smtpConfigured = !!(settings.smtpHost && settings.smtpUser && settings.smtpPass);

  if (smtpConfigured) {
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost!,
      port: parseInt(settings.smtpPort ?? "587"),
      secure: settings.smtpSecure === 1,
      auth: { user: settings.smtpUser!, pass: settings.smtpPass! },
    });

    const attachments: nodemailer.SendMailOptions["attachments"] = pdfBuffer
      ? [{ filename: pdfFilename, content: pdfBuffer, contentType: "application/pdf" }]
      : [];
    for (const extra of extraAttachments ?? []) {
      attachments.push({ filename: extra.filename, content: extra.buffer, contentType: extra.mimeType });
    }

    await transporter.sendMail({
      from: `"${settings.companyName || "BuildPro"}" <${settings.companyEmail || settings.smtpUser}>`,
      to,
      subject,
      html,
      text,
      attachments,
    });
  } else {
    // Gmail integration only supports a single attachment; bundle all PDFs
    // by sending separate calls if there are extras, or use the first one.
    // For simplicity: if there are extra attachments, send the invoice PDF first
    // then append extras as additional sendEmail calls with the same thread context.
    // Better approach: encode multiple parts via a helper that supports multipart/mixed with N attachments.
    await sendEmailWithAttachments({
      to,
      subject,
      html,
      text,
      attachments: [
        ...(pdfBuffer ? [{ filename: pdfFilename, mimeType: "application/pdf", buffer: pdfBuffer }] : []),
        ...(extraAttachments ?? []).map(e => ({ filename: e.filename, mimeType: e.mimeType, buffer: e.buffer })),
      ],
    });
  }
}

interface MultiAttachment {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

async function sendEmailWithAttachments(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments: MultiAttachment[];
}): Promise<void> {
  const { to, subject, html, text, attachments } = opts;

  if (attachments.length === 0) {
    await sendEmail({ to, subject, html, text });
    return;
  }

  // Use the first attachment via sendEmail's single-attachment path,
  // then build a raw multipart/mixed message manually for multiple attachments.
  if (attachments.length === 1) {
    const a = attachments[0];
    await sendEmail({
      to, subject, html, text,
      attachment: { filename: a.filename, mimeType: a.mimeType, base64Data: a.buffer.toString("base64") },
    });
    return;
  }

  // Multiple attachments: build a raw RFC 2822 multipart/mixed message
  function b64url(input: string | Buffer): string {
    const bytes = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
    return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function sanitize(v: string) { return v.replace(/[\r\n]+/g, " ").trim(); }

  const altBoundary = `==ALT${Date.now()}==`;
  const mixedBoundary = `==MIX${Date.now()}==`;

  const lines: string[] = [
    `To: ${sanitize(to)}`,
    `Subject: ${sanitize(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    ``,
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    ``,
    `--${altBoundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    text,
    ``,
    `--${altBoundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    ``,
    html,
    ``,
    `--${altBoundary}--`,
    ``,
  ];

  for (const a of attachments) {
    const safeFilename = sanitize(a.filename);
    const b64 = a.buffer.toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? a.buffer.toString("base64");
    lines.push(
      `--${mixedBoundary}`,
      `Content-Type: ${a.mimeType}; name="${safeFilename}"`,
      `Content-Disposition: attachment; filename="${safeFilename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      b64,
      ``,
    );
  }

  lines.push(`--${mixedBoundary}--`);

  const { ReplitConnectors } = await import("@replit/connectors-sdk");
  const connectors = new ReplitConnectors();
  const raw = b64url(lines.join("\r\n"));
  const response = await connectors.proxy(
    "google-mail",
    "/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail send failed (${response.status}): ${body}`);
  }
}
