export interface PrintableInvoice {
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
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  taxRate?: number | null;
  taxAmount?: number | null;
  total: number;
  notes?: string | null;
  businessLine?: string | null;
}

export interface PrintableSettings {
  companyName?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  companyAddress?: string | null;
  companyCity?: string | null;
  companyState?: string | null;
  companyZip?: string | null;
  logoAbsoluteUrl?: string | null;
  logoSize?: string | null;
  logoPosition?: string | null;
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

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const INVOICE_PRINT_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111827; background: white; }
  .page { max-width: 750px; margin: 0 auto; padding: 48px; }
  table.items { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.items th { text-align: right; padding-bottom: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-size: 10px; border-bottom: 2px solid #1f2937; }
  table.items th:first-child { text-align: left; }
`;

export function buildInvoiceBodyHtml(inv: PrintableInvoice, settings: PrintableSettings): string {
  const logoPx = settings.logoSize === "small" ? 64 : settings.logoSize === "large" ? 160 : 100;
  const logoPos = settings.logoPosition ?? "top-left";

  const displayCompanyName = inv.businessLine === "asphalt_sealing"
    ? `${settings.companyName || "Willard's General Contracting LLC"}, DBA Willard's Asphalt Sealing`
    : (settings.companyName ?? null);

  const hasContact = !!(displayCompanyName || settings.companyAddress || settings.companyCity ||
    settings.companyState || settings.companyZip || settings.companyPhone || settings.companyEmail);

  const logoHtml = settings.logoAbsoluteUrl
    ? `<img src="${esc(settings.logoAbsoluteUrl)}" alt="Logo" style="height:${logoPx}px;width:auto;max-width:${logoPx * 2.5}px;object-fit:contain;display:block;" />`
    : `<div style="width:48px;height:48px;background:#fef3c7;border-radius:8px;display:flex;align-items:center;justify-content:center;">
         <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
       </div>`;

  const contactLines: string[] = [];
  if (!settings.logoAbsoluteUrl && displayCompanyName) {
    contactLines.push(`<div style="font-weight:700;font-size:15px;color:#1f2937;margin-bottom:4px;">${esc(displayCompanyName)}</div>`);
  }
  if (settings.companyAddress)
    contactLines.push(`<div>${esc(settings.companyAddress)}</div>`);
  const cityLine = [settings.companyCity, settings.companyState, settings.companyZip].filter(Boolean).join(", ");
  if (cityLine) contactLines.push(`<div>${esc(cityLine)}</div>`);
  if (settings.companyPhone) contactLines.push(`<div>${esc(settings.companyPhone)}</div>`);
  if (settings.companyEmail) contactLines.push(`<div>${esc(settings.companyEmail)}</div>`);
  const contactHtml = hasContact
    ? `<div style="font-size:11px;color:#6b7280;margin-top:8px;line-height:1.6;">${contactLines.join("")}</div>`
    : "";

  const invoiceDetailsHtml = `
    <div style="text-align:right;flex-shrink:0;">
      <div style="font-size:38px;font-weight:900;letter-spacing:0.1em;color:#1f2937;line-height:1;text-transform:uppercase;">INVOICE</div>
      <div style="font-size:14px;font-weight:700;color:#f59e0b;margin-top:4px;">${esc(inv.invoiceNumber)}</div>
      <table style="margin-left:auto;margin-top:12px;font-size:11px;border-collapse:collapse;">
        <tr>
          <td style="color:#374151;font-weight:600;padding:2px 12px 2px 0;white-space:nowrap;">Date:</td>
          <td style="color:#6b7280;">${esc(fmtDate(inv.issueDate))}</td>
        </tr>
        ${inv.dueDate ? `<tr><td style="color:#374151;font-weight:600;padding:2px 12px 2px 0;">Due:</td><td style="color:#6b7280;">${esc(fmtDate(inv.dueDate))}</td></tr>` : ""}
        ${inv.terms ? `<tr><td style="color:#374151;font-weight:600;padding:2px 12px 2px 0;">Terms:</td><td style="color:#6b7280;">${esc(inv.terms)}</td></tr>` : ""}
      </table>
    </div>`;

  let headerHtml = "";
  if (logoPos === "top-center") {
    headerHtml = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        <div style="width:64px;flex-shrink:0;"></div>
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center;">
          ${logoHtml}${contactHtml}
        </div>
        ${invoiceDetailsHtml}
      </div>`;
  } else if (logoPos === "top-right") {
    headerHtml = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        ${invoiceDetailsHtml}
        <div style="display:flex;flex-direction:column;align-items:flex-end;">
          ${logoHtml}
          <div style="text-align:right;">${contactHtml}</div>
        </div>
      </div>`;
  } else {
    headerHtml = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        <div style="display:flex;flex-direction:column;">
          ${logoHtml}${contactHtml}
        </div>
        ${invoiceDetailsHtml}
      </div>`;
  }

  const workLocation = inv.locationName || inv.city || inv.state;
  const billToContent = inv.clientName
    ? `<div style="font-weight:700;font-size:13px;color:#111827;margin-bottom:8px;">${esc(inv.clientName)}</div>
       ${inv.clientEmail ? `<div style="font-size:11px;color:#4b5563;margin-bottom:4px;word-break:break-all;">${esc(inv.clientEmail)}</div>` : ""}
       ${inv.clientPhone ? `<div style="font-size:11px;color:#4b5563;margin-bottom:4px;">${esc(inv.clientPhone)}</div>` : ""}
       ${(inv.clientAddress || inv.clientCity || inv.clientState || inv.clientZip) ? `<div style="font-size:11px;color:#4b5563;margin-bottom:4px;">${esc([inv.clientAddress, inv.clientCity, inv.clientState, inv.clientZip].filter(Boolean).join(", "))}</div>` : ""}
       ${inv.clientNotes ? `<div style="font-size:10px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:6px;margin-top:6px;">${esc(inv.clientNotes)}</div>` : ""}
       ${inv.jobTitle ? `<div style="font-size:11px;color:#6b7280;margin-top:6px;">Re: ${esc(inv.jobTitle)}</div>` : ""}`
    : `<div style="font-size:11px;color:#9ca3af;font-style:italic;">No client specified</div>`;

  const locationHtml = workLocation ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;flex:1;">
      <div style="font-size:9px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">&#x1f4cd; Work Location</div>
      ${inv.locationName ? `<div style="font-weight:700;font-size:13px;color:#1f2937;">${esc(inv.locationName)}</div>` : ""}
      ${(inv.city || inv.state) ? `<div style="font-size:11px;color:#4b5563;">${esc([inv.city, inv.state].filter(Boolean).join(", "))}</div>` : ""}
    </div>` : "";

  const billToGrid = workLocation
    ? `<div style="display:flex;gap:16px;margin-bottom:0;">
         <div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:10px;padding:16px;flex:1;">
           <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Bill To</div>
           ${billToContent}
         </div>
         ${locationHtml}
       </div>`
    : `<div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:10px;padding:16px;">
         <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Bill To</div>
         ${billToContent}
       </div>`;

  const lineRows = inv.lineItems.length > 0
    ? inv.lineItems.map((li, i) => `
      <tr style="${i % 2 === 1 ? "background:#f9fafb;" : ""}">
        <td style="padding:10px 12px 10px 0;color:#1f2937;">${esc(li.description)}</td>
        <td style="padding:10px 0;text-align:right;color:#6b7280;">${li.quantity}</td>
        <td style="padding:10px 0 10px 12px;text-align:right;color:#6b7280;">${fmtCurrency(li.unitPrice)}</td>
        <td style="padding:10px 0 10px 12px;text-align:right;font-weight:600;color:#111827;">${fmtCurrency(li.quantity * li.unitPrice)}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" style="padding:16px;text-align:center;color:#d1d5db;font-style:italic;">No line items</td></tr>`;

  const taxRow = (inv.taxRate ?? 0) > 0
    ? `<tr><td style="text-align:right;padding:4px 0;color:#6b7280;">Tax (${inv.taxRate}%)</td><td style="text-align:right;padding:4px 0 4px 20px;color:#6b7280;">${fmtCurrency(inv.taxAmount)}</td></tr>`
    : "";

  const notesHtml = inv.notes
    ? `<div style="border-top:1px solid #f3f4f6;padding-top:16px;margin-top:4px;">
         <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Notes</div>
         <div style="font-size:11px;color:#4b5563;white-space:pre-wrap;">${esc(inv.notes)}</div>
       </div>`
    : "";

  return `
  <div style="height:8px;background:linear-gradient(to right,#f59e0b,#fbbf24);"></div>
  <div class="page">
    <div style="margin-bottom:32px;">${headerHtml}</div>
    <div style="margin-bottom:24px;">${billToGrid}</div>
    <table class="items" style="margin-bottom:24px;">
      <thead>
        <tr>
          <th style="width:50%;text-align:left;">Description</th>
          <th style="width:12%;">Qty</th>
          <th style="width:19%;">Unit Price</th>
          <th style="width:19%;">Total</th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-bottom:24px;">
      <table style="font-size:11px;border-collapse:collapse;min-width:200px;">
        <tr>
          <td style="text-align:right;padding:4px 0;color:#6b7280;">Subtotal</td>
          <td style="text-align:right;padding:4px 0 4px 20px;color:#6b7280;">${fmtCurrency(inv.subtotal)}</td>
        </tr>
        ${taxRow}
        <tr>
          <td style="text-align:right;padding:10px 0 0;font-weight:800;font-size:13px;color:#111827;border-top:2px solid #1f2937;">Total Due</td>
          <td style="text-align:right;padding:10px 0 0 20px;font-weight:800;font-size:13px;color:#d97706;border-top:2px solid #1f2937;">${fmtCurrency(inv.total)}</td>
        </tr>
      </table>
    </div>
    ${notesHtml}
  </div>
  <div style="height:6px;background:linear-gradient(to right,#fbbf24,#f59e0b);margin-top:32px;"></div>
  <div style="text-align:center;padding:12px 0 8px;font-size:10px;color:#9ca3af;">
    Thank you for your business${settings.companyName ? " &middot; " + esc(settings.companyName) : ""}
  </div>`;
}

export function buildInvoiceHtml(inv: PrintableInvoice, settings: PrintableSettings): string {
  const bodyContent = buildInvoiceBodyHtml(inv, settings);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${esc(inv.invoiceNumber)}</title>
  <style>
    ${INVOICE_PRINT_STYLES}
    @media print {
      @page { size: letter portrait; margin: 0.5in; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="position:fixed;top:0;left:0;right:0;z-index:999;background:#1f2937;padding:10px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,0.4);">
    <button onclick="window.close()" style="background:#f59e0b;color:#111827;border:none;border-radius:6px;padding:8px 18px;font-size:14px;font-weight:700;cursor:pointer;">&#8592; Back to App</button>
    <button onclick="window.print()" style="background:transparent;color:#d1d5db;border:1px solid #4b5563;border-radius:6px;padding:8px 18px;font-size:14px;cursor:pointer;">Print / Save as PDF</button>
  </div>
  <div style="height:52px;" class="no-print"></div>
  ${bodyContent}
</body>
</html>`;
}

export function printInvoiceWindow(inv: PrintableInvoice, settings: PrintableSettings): void {
  const win = window.open("", "_blank", "width=850,height=1100");
  if (!win) {
    alert("Pop-up blocked. Please allow pop-ups for this site to use Print / Export PDF.");
    return;
  }
  win.document.write(buildInvoiceHtml(inv, settings));
  win.document.close();
  setTimeout(() => { win.print(); }, 400);
}
