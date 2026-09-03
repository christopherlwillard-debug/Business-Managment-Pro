import { calculateInvoiceTotals } from "@workspace/api-zod";

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function sanitizeFilename(name: string): string {
  return sanitizeHeader(name).replace(/"/g, "'");
}

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface GmailAttachment {
  base64: string;
  filename: string;
}

export interface GmailInlineImage extends GmailAttachment {
  mimeType: string;
  contentId: string;
}

export interface GmailSendOptions {
  token: string;
  to: string;
  subject: string;
  deliveryId?: string;
  html: string;
  text?: string;
  pdfBase64?: string;
  pdfFilename?: string;
  extraAttachments?: GmailAttachment[];
  inlineImages?: GmailInlineImage[];
}

export interface GmailSendResult {
  provider: "gmail";
  messageId?: string | null;
  threadId?: string | null;
}

export async function sendViaGmail(opts: GmailSendOptions): Promise<GmailSendResult> {
  const {
    token, to, subject, deliveryId, html, text, pdfBase64, pdfFilename,
    extraAttachments = [], inlineImages = [],
  } = opts;
  const deliveryHeader = deliveryId ? [`X-BuildPro-Delivery-ID: ${sanitizeHeader(deliveryId)}`] : [];

  // Base64-encode the HTML body so that = characters in data URIs (logo) are
  // not misinterpreted as quoted-printable escape sequences by email clients.
  const encodeBase64Body = (str: string): string => {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary).match(/.{1,76}/g)?.join("\r\n") ?? btoa(binary);
  };

  const chunkBase64 = (b64: string) => b64.match(/.{1,76}/g)?.join("\r\n") ?? b64;

  let rfcLines: string[];

  const allAttachments: GmailAttachment[] = [
    ...(pdfBase64 && pdfFilename ? [{ base64: pdfBase64, filename: pdfFilename }] : []),
    ...extraAttachments,
  ];

  if (allAttachments.length > 0 || inlineImages.length > 0) {
    const outer = `==BPO${Date.now()}==`;
    const inner = `==BPI${Date.now()}A==`;
    const related = `==BPR${Date.now()}R==`;

    const attachmentParts = allAttachments.map(att => {
      const safe = sanitizeFilename(att.filename);
      return [
        `--${outer}`,
        `Content-Type: application/pdf; name="${safe}"`,
        `Content-Disposition: attachment; filename="${safe}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        chunkBase64(att.base64),
        ``,
      ].join("\r\n");
    });

    rfcLines = [
      `To: ${sanitizeHeader(to)}`,
      `Subject: ${sanitizeHeader(subject)}`,
      ...deliveryHeader,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${outer}"`,
      ``,
      `--${outer}`,
      `Content-Type: multipart/related; boundary="${related}"`,
      ``,
      `--${related}`,
      `Content-Type: multipart/alternative; boundary="${inner}"`,
      ``,
      `--${inner}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: quoted-printable`,
      ``,
      text ?? `Please see your invoice attached.`,
      ``,
      `--${inner}`,
      `Content-Type: text/html; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      encodeBase64Body(html),
      ``,
      `--${inner}--`,
      ``,
      ...inlineImages.flatMap(image => {
        const safe = sanitizeFilename(image.filename);
        return [
          `--${related}`,
          `Content-Type: ${sanitizeHeader(image.mimeType)}; name="${safe}"`,
          `Content-Disposition: inline; filename="${safe}"`,
          `Content-ID: <${sanitizeHeader(image.contentId)}>`,
          `Content-Transfer-Encoding: base64`,
          ``,
          chunkBase64(image.base64),
          ``,
        ];
      }),
      `--${related}--`,
      ``,
      ...attachmentParts.flatMap(p => p.split("\r\n")),
      `--${outer}--`,
    ];
  } else {
    const boundary = `==BP${Date.now()}==`;

    rfcLines = [
      `To: ${sanitizeHeader(to)}`,
      `Subject: ${sanitizeHeader(subject)}`,
      ...deliveryHeader,
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
      `Content-Transfer-Encoding: base64`,
      ``,
      encodeBase64Body(html),
      ``,
      `--${boundary}--`,
    ];
  }

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
  const result = await resp.json().catch(() => ({})) as {
    id?: string;
    threadId?: string;
  };
  return {
    provider: "gmail",
    messageId: result.id ?? null,
    threadId: result.threadId ?? null,
  };
}

export function dataUriToInlineImage(
  dataUri: string | null | undefined,
  contentId = "invoice-brand-logo",
): GmailInlineImage | null {
  if (!dataUri) return null;
  const match = dataUri.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    base64: match[2],
    filename: match[1] === "image/jpeg" ? "invoice-logo.jpg" : "invoice-logo.png",
    contentId,
  };
}

function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function fmtCurrency(n: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n ?? 0);
}

export interface BuildInvoiceEmailHtmlOpts {
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
  terms?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  clientCity?: string | null;
  clientState?: string | null;
  clientZip?: string | null;
  clientNotes?: string | null;
  jobTitle?: string | null;
  locationName?: string | null;
  city?: string | null;
  state?: string | null;
  businessLine?: string | null;
  dbaName?: string | null;
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  taxRate?: number | null;
  taxAmount?: number | null;
  total: number;
  notes?: string | null;
  customMessage?: string;
  paymentLink?: string | null;
  logoSrc?: string | null;
}

export function buildInvoiceEmailHtml(opts: BuildInvoiceEmailHtmlOpts): string {
  const calculated = calculateInvoiceTotals(opts.lineItems, opts.taxRate);
  const cityLine = [opts.companyCity, opts.companyState, opts.companyZip].filter(Boolean).join(", ");

  const displayCompanyName = opts.companyName || opts.dbaName || "";

  const contactLines: string[] = [];
  const safeLogoSrc = opts.logoSrc && /^(?:https?:|cid:|data:image\/(?:png|jpeg);base64,)/.test(opts.logoSrc)
    ? opts.logoSrc
    : null;
  if (safeLogoSrc) {
    contactLines.push(`<tr><td style="padding-bottom:6px;"><img src="${esc(safeLogoSrc)}" alt="${esc(displayCompanyName)}" style="max-height:70px;max-width:200px;width:auto;height:auto;display:block;object-fit:contain;" /></td></tr>`);
  }
  if (displayCompanyName) {
    contactLines.push(`<tr><td style="font-size:18px;font-weight:800;color:#111827;padding-bottom:4px;">${esc(displayCompanyName)}</td></tr>`);
  }
  if (opts.companyAddress) contactLines.push(`<tr><td style="font-size:11px;color:#6b7280;line-height:1.5;">${esc(opts.companyAddress)}</td></tr>`);
  if (cityLine)            contactLines.push(`<tr><td style="font-size:11px;color:#6b7280;line-height:1.5;">${esc(cityLine)}</td></tr>`);
  if (opts.companyPhone)   contactLines.push(`<tr><td style="font-size:11px;color:#6b7280;line-height:1.5;">${esc(opts.companyPhone)}</td></tr>`);
  if (opts.companyEmail)   contactLines.push(`<tr><td style="font-size:11px;color:#6b7280;line-height:1.5;">${esc(opts.companyEmail)}</td></tr>`);

  const dateRows: string[] = [];
  if (opts.issueDate) dateRows.push(`<tr><td style="font-size:11px;font-weight:600;color:#374151;padding:2px 12px 2px 0;white-space:nowrap;">Date:</td><td style="font-size:11px;color:#6b7280;">${esc(fmtDate(opts.issueDate))}</td></tr>`);
  if (opts.dueDate)   dateRows.push(`<tr><td style="font-size:11px;font-weight:600;color:#374151;padding:2px 12px 2px 0;white-space:nowrap;">Due:</td><td style="font-size:11px;color:#6b7280;">${esc(fmtDate(opts.dueDate))}</td></tr>`);
  if (opts.terms)     dateRows.push(`<tr><td style="font-size:11px;font-weight:600;color:#374151;padding:2px 12px 2px 0;white-space:nowrap;">Terms:</td><td style="font-size:11px;color:#6b7280;">${esc(opts.terms)}</td></tr>`);

  const clientAddrLine = [opts.clientAddress, opts.clientCity, opts.clientState, opts.clientZip].filter(Boolean).join(", ");
  const billToRows: string[] = [];
  if (opts.clientName)   billToRows.push(`<tr><td style="font-size:13px;font-weight:700;color:#111827;padding-bottom:5px;">${esc(opts.clientName)}</td></tr>`);
  if (opts.clientEmail)  billToRows.push(`<tr><td style="font-size:11px;color:#4b5563;padding-bottom:3px;word-break:break-all;">${esc(opts.clientEmail)}</td></tr>`);
  if (opts.clientPhone)  billToRows.push(`<tr><td style="font-size:11px;color:#4b5563;padding-bottom:3px;">${esc(opts.clientPhone)}</td></tr>`);
  if (clientAddrLine)    billToRows.push(`<tr><td style="font-size:11px;color:#4b5563;padding-bottom:3px;">${esc(clientAddrLine)}</td></tr>`);
  if (opts.clientNotes)  billToRows.push(`<tr><td style="font-size:10px;color:#6b7280;padding-top:4px;border-top:1px solid #e5e7eb;">${esc(opts.clientNotes)}</td></tr>`);
  if (opts.jobTitle)     billToRows.push(`<tr><td style="font-size:11px;color:#6b7280;padding-top:3px;">Re: ${esc(opts.jobTitle)}</td></tr>`);

  const workLocation = opts.locationName || opts.city || opts.state;
  const locationHtml = workLocation ? `
    <td width="45%" style="padding:0;vertical-align:top;">
      <table cellpadding="0" cellspacing="0" width="100%" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
        <tr><td style="padding:14px 16px;">
          <p style="margin:0 0 8px;font-size:9px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:0.08em;">&#x1f4cd; Work Location</p>
          ${opts.locationName ? `<p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#1f2937;">${esc(opts.locationName)}</p>` : ""}
          ${(opts.city || opts.state) ? `<p style="margin:0;font-size:11px;color:#4b5563;">${esc([opts.city, opts.state].filter(Boolean).join(", "))}</p>` : ""}
        </td></tr>
      </table>
    </td>` : "";

  const billToSection = (billToRows.length > 0 || workLocation) ? `
    <tr><td style="padding:0 0 20px;">
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td width="${workLocation ? "52%" : "100%"}" style="padding:0;vertical-align:top;${workLocation ? "padding-right:12px;" : ""}">
            <table cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:8px;">
              <tr><td style="padding:14px 16px;">
                <p style="margin:0 0 8px;font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Bill To</p>
                <table cellpadding="0" cellspacing="0">
                  ${billToRows.join("")}
                </table>
              </td></tr>
            </table>
          </td>
          ${locationHtml}
        </tr>
      </table>
    </td></tr>` : "";

  const lineRows = opts.lineItems.map((li, i) => `
    <tr style="${i % 2 === 1 ? "background:#f9fafb;" : ""}">
      <td style="padding:10px 12px 10px 0;font-size:11px;color:#1f2937;">${esc(li.description)}</td>
      <td style="padding:10px 0;font-size:11px;text-align:right;color:#6b7280;">${li.quantity}</td>
      <td style="padding:10px 0 10px 12px;font-size:11px;text-align:right;color:#6b7280;">${fmtCurrency(li.unitPrice)}</td>
      <td style="padding:10px 0 10px 12px;font-size:11px;text-align:right;font-weight:600;color:#111827;">${fmtCurrency(calculated.lineTotals[i] ?? 0)}</td>
    </tr>`).join("");

  const taxRow = (opts.taxRate ?? 0) > 0
    ? `<tr><td style="text-align:right;padding:4px 0;font-size:12px;color:#6b7280;padding-right:20px;">Tax (${opts.taxRate}%)</td><td style="text-align:right;padding:4px 0;font-size:12px;color:#6b7280;">${fmtCurrency(calculated.taxAmount)}</td></tr>`
    : "";

  const notesHtml = opts.notes
    ? `<tr><td style="padding:16px 0 0;border-top:1px solid #f3f4f6;">
         <p style="margin:0 0 6px;font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Notes</p>
         <p style="margin:0;font-size:11px;color:#4b5563;white-space:pre-wrap;">${esc(opts.notes)}</p>
       </td></tr>`
    : "";

  const paymentLinkHtml = opts.paymentLink
    ? `<tr><td style="padding:20px 0 0;border-top:1px solid #f3f4f6;">
         <table cellpadding="0" cellspacing="0" width="100%">
           <tr><td align="center">
             <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#374151;">Pay this invoice securely online:</p>
             <a href="${esc(opts.paymentLink)}" target="_blank" style="display:inline-block;background:#f59e0b;color:#fff;font-size:14px;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none;">
               Pay Now — ${fmtCurrency(calculated.total)}
             </a>
             <p style="margin:10px 0 0;font-size:10px;color:#9ca3af;">Square Payments · Secure checkout</p>
           </td></tr>
         </table>
       </td></tr>`
    : "";

  const customMsgHtml = opts.customMessage
    ? `<tr><td style="padding:0 0 20px;"><p style="margin:0;font-size:13px;color:#555;line-height:1.6;">${esc(opts.customMessage).replace(/\n/g, "<br>")}</p></td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08);">

        <tr><td style="height:7px;background:linear-gradient(to right,#f59e0b,#fbbf24);font-size:0;">&nbsp;</td></tr>

        <tr><td style="padding:32px 40px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:top;padding-right:20px;">
                ${contactLines.length > 0 ? `<table cellpadding="0" cellspacing="0">${contactLines.join("")}</table>` : ""}
              </td>
              <td style="vertical-align:top;text-align:right;white-space:nowrap;">
                <p style="margin:0;font-size:34px;font-weight:900;letter-spacing:0.08em;color:#1f2937;line-height:1;text-transform:uppercase;">INVOICE</p>
                <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#f59e0b;">${esc(opts.invoiceNumber)}</p>
                ${dateRows.length > 0 ? `<table cellpadding="0" cellspacing="0" style="margin-left:auto;margin-top:10px;">${dateRows.join("")}</table>` : ""}
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 40px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${customMsgHtml}
            ${billToSection}

            <tr><td>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
                <thead>
                  <tr>
                    <th style="text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;padding-bottom:8px;border-bottom:2px solid #1f2937;">Description</th>
                    <th style="text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;padding-bottom:8px;border-bottom:2px solid #1f2937;">Qty</th>
                    <th style="text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;padding-bottom:8px;padding-left:12px;border-bottom:2px solid #1f2937;">Unit Price</th>
                    <th style="text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;padding-bottom:8px;padding-left:12px;border-bottom:2px solid #1f2937;">Total</th>
                  </tr>
                </thead>
                <tbody>${lineRows || `<tr><td colspan="4" style="padding:16px;text-align:center;font-size:11px;color:#d1d5db;font-style:italic;">No line items</td></tr>`}</tbody>
              </table>
            </td></tr>

            <tr><td align="right" style="padding-bottom:8px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align:right;padding:4px 20px 4px 0;font-size:12px;color:#6b7280;">Subtotal</td>
                  <td style="text-align:right;padding:4px 0;font-size:12px;color:#6b7280;">${fmtCurrency(calculated.subtotal)}</td>
                </tr>
                ${taxRow}
                <tr><td colspan="2" style="height:1px;background:#1f2937;padding:0;"></td></tr>
                <tr>
                  <td style="text-align:right;padding:10px 20px 0 0;font-size:15px;font-weight:800;color:#111827;">Total Due</td>
                  <td style="text-align:right;padding:10px 0 0;font-size:15px;font-weight:800;color:#f59e0b;">${fmtCurrency(calculated.total)}</td>
                </tr>
              </table>
            </td></tr>

            ${notesHtml}
            ${paymentLinkHtml}
          </table>
        </td></tr>

        <tr><td style="height:6px;background:linear-gradient(to right,#fbbf24,#f59e0b);font-size:0;">&nbsp;</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface BuildDepositEmailHtmlOpts {
  companyName?: string;
  companyPhone?: string;
  companyEmail?: string;
  prospectAddress?: string;
  contactName?: string | null;
  roughQuote?: number | null;
  depositUrl: string;
  customMessage?: string;
  logoSrc?: string | null;
}

export function buildDepositEmailHtml(opts: BuildDepositEmailHtmlOpts): string {
  const displayCompanyName = opts.companyName || "Your Contractor";

  const contactInfoRows: string[] = [];
  if (opts.companyPhone) contactInfoRows.push(`<span style="margin:0 6px;">&middot;</span>${esc(opts.companyPhone)}`);
  if (opts.companyEmail) contactInfoRows.push(`<span style="margin:0 6px;">&middot;</span>${esc(opts.companyEmail)}`);

  const greetingName = opts.contactName ? ` ${esc(opts.contactName)},` : ",";

  const amountLine = opts.roughQuote != null && opts.roughQuote > 0
    ? `<p style="margin:0 0 6px;font-size:13px;color:#374151;">A deposit is required before we begin work on your property. Quoted amount: <strong>${fmtCurrency(opts.roughQuote)}</strong>.</p>`
    : `<p style="margin:0 0 6px;font-size:13px;color:#374151;">A deposit is required before we begin work on your property.</p>`;

  const customMsgHtml = opts.customMessage
    ? `<p style="margin:0 0 20px;font-size:13px;color:#555;line-height:1.6;">${esc(opts.customMessage).replace(/\n/g, "<br>")}</p>`
    : "";

  const propertySection = opts.prospectAddress
    ? `<table cellpadding="0" cellspacing="0" width="100%" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin-bottom:20px;">
        <tr><td style="padding:14px 16px;">
          <p style="margin:0 0 4px;font-size:9px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:0.08em;">&#x1f4cd; Property Address</p>
          <p style="margin:0;font-size:13px;font-weight:700;color:#1f2937;">${esc(opts.prospectAddress)}</p>
        </td></tr>
      </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08);">

        <tr><td style="height:7px;background:linear-gradient(to right,#f59e0b,#fbbf24);font-size:0;">&nbsp;</td></tr>

        <tr><td style="padding:32px 40px 24px;">
          ${opts.logoSrc
            ? `<img src="${esc(opts.logoSrc)}" alt="${esc(displayCompanyName)}" style="max-height:70px;max-width:200px;width:auto;height:auto;display:block;object-fit:contain;margin-bottom:6px;" />`
            : `<p style="margin:0 0 4px;font-size:18px;font-weight:800;color:#111827;">${esc(displayCompanyName)}</p>`
          }
          <p style="margin:0;font-size:11px;color:#6b7280;">Deposit Request</p>
        </td></tr>

        <tr><td style="padding:0 40px 32px;">
          ${customMsgHtml}
          <p style="margin:0 0 16px;font-size:15px;color:#111827;">Hi${greetingName}</p>
          ${amountLine}
          <p style="margin:0 0 24px;font-size:13px;color:#374151;">Please use the link below to pay your deposit securely online.</p>

          ${propertySection}

          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td align="center" style="padding:4px 0 28px;">
              <a href="${esc(opts.depositUrl)}" target="_blank"
                style="display:inline-block;background:#f59e0b;color:#ffffff;font-size:15px;font-weight:700;padding:14px 36px;border-radius:8px;text-decoration:none;">
                Pay Deposit Now &#x2192;
              </a>
              <p style="margin:10px 0 0;font-size:10px;color:#9ca3af;">Secure online payment &middot; Takes just a minute</p>
            </td></tr>
          </table>

          <p style="margin:0;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px;">
            Questions? Reply to this email or contact us at
            ${opts.companyPhone ? `<strong>${esc(opts.companyPhone)}</strong>` : "your contractor"}${opts.companyEmail ? ` &middot; ${esc(opts.companyEmail)}` : ""}.
          </p>
        </td></tr>

        <tr><td style="padding:14px 40px;background:#fafafa;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
            ${esc(displayCompanyName)}${contactInfoRows.join("")}
          </p>
        </td></tr>

        <tr><td style="height:6px;background:linear-gradient(to right,#fbbf24,#f59e0b);font-size:0;">&nbsp;</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
