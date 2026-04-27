import { renderHtmlToPdf } from "./renderHtmlToPdf";

export interface Payer1099 {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  ein?: string | null;
}

export interface Payee1099 {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  tinType?: string | null;
  tinLastFour?: string | null;
}

export interface Form1099NecData {
  taxYear: number;
  payer: Payer1099;
  payee: Payee1099;
  nonemployeeCompensation: number;
}

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function addrLine(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(", ");
}

function formBox(label: string, value: string): string {
  return `
    <div style="border:1px solid #9ca3af;padding:6px 8px;">
      <div style="font-size:8px;color:#6b7280;margin-bottom:4px;">${esc(label)}</div>
      <div style="font-size:11px;font-weight:700;color:#111827;">${esc(value)}</div>
    </div>`;
}

export async function generate1099NecPdf(data: Form1099NecData): Promise<Blob> {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const payerAddrLine = addrLine([data.payer.address]);
  const payerCityLine = addrLine([data.payer.city, data.payer.state, data.payer.zip]);
  const payeeAddrLine = addrLine([data.payee.address]);
  const payeeCityLine = addrLine([data.payee.city, data.payee.state, data.payee.zip]);

  const tinDisplay = data.payee.tinLastFour
    ? `${data.payee.tinType === "EIN" ? "EIN" : "SSN"}: ***-**-${data.payee.tinLastFour}`
    : "Not on file";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Form 1099-NEC — ${esc(data.payee.name)} — ${data.taxYear}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111827; background: white; }
    .page { max-width: 750px; margin: 0 auto; padding: 48px; }
    @media print {
      @page { size: letter portrait; margin: 0.5in; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div style="height:6px;background:linear-gradient(to right,#1d4ed8,#3b82f6);"></div>
  <div class="page">

    <!-- Header -->
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-size:20px;font-weight:900;color:#1e3a8a;letter-spacing:0.05em;">Form 1099-NEC</div>
        <div style="font-size:11px;color:#3b82f6;margin-top:2px;">Nonemployee Compensation &mdash; Tax Year ${data.taxYear}</div>
      </div>
      <div style="font-size:36px;font-weight:900;color:#bfdbfe;letter-spacing:0.1em;line-height:1;">${data.taxYear}</div>
    </div>

    <!-- Payer & TIN row -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:0;border:1px solid #9ca3af;">
      <div style="padding:10px 12px;border-right:1px solid #9ca3af;">
        <div style="font-size:8px;color:#6b7280;margin-bottom:6px;">PAYER'S name, street address, city or town, state or province, country, ZIP or foreign postal code, and telephone no.</div>
        <div style="font-size:12px;font-weight:700;color:#111827;">${esc(data.payer.name)}</div>
        ${payerAddrLine ? `<div style="font-size:10px;color:#4b5563;margin-top:3px;">${esc(payerAddrLine)}</div>` : ""}
        ${payerCityLine ? `<div style="font-size:10px;color:#4b5563;">${esc(payerCityLine)}</div>` : ""}
        ${data.payer.phone ? `<div style="font-size:10px;color:#4b5563;">${esc(data.payer.phone)}</div>` : ""}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;border-left:1px solid #9ca3af;">
        ${formBox("PAYER'S TIN", data.payer.ein ? `EIN: ${data.payer.ein}` : "Not on file")}
        ${formBox("RECIPIENT'S TIN", tinDisplay)}
      </div>
    </div>

    <!-- Recipient name -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #9ca3af;border-top:none;">
      <div style="padding:10px 12px;border-right:1px solid #9ca3af;">
        <!-- empty left column at this row -->
      </div>
      <div style="padding:10px 12px;border-left:1px solid #9ca3af;">
        <div style="font-size:8px;color:#6b7280;margin-bottom:6px;">RECIPIENT'S name</div>
        <div style="font-size:12px;font-weight:700;color:#111827;">${esc(data.payee.name)}</div>
      </div>
    </div>

    <!-- Recipient address -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #9ca3af;border-top:none;margin-bottom:16px;">
      <div style="padding:10px 12px;border-right:1px solid #9ca3af;">
        <!-- empty left column -->
      </div>
      <div style="padding:10px 12px;border-left:1px solid #9ca3af;">
        <div style="font-size:8px;color:#6b7280;margin-bottom:6px;">Street address (including apt. no.)</div>
        ${payeeAddrLine ? `<div style="font-size:10px;color:#4b5563;">${esc(payeeAddrLine)}</div>` : ""}
        ${payeeCityLine ? `<div style="font-size:10px;color:#4b5563;">${esc(payeeCityLine)}</div>` : ""}
      </div>
    </div>

    <!-- Boxes row 1 -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid #9ca3af;margin-bottom:0;">
      <div style="background:#f0fdf4;border-right:1px solid #9ca3af;padding:8px;">
        <div style="font-size:8px;color:#6b7280;margin-bottom:4px;">1 &nbsp; Nonemployee compensation</div>
        <div style="font-size:14px;font-weight:800;color:#15803d;">${fmtCurrency(data.nonemployeeCompensation)}</div>
      </div>
      <div style="border-right:1px solid #9ca3af;padding:8px;">
        <div style="font-size:8px;color:#6b7280;margin-bottom:4px;">2 &nbsp; Direct sales (see instructions)</div>
        <div style="font-size:11px;color:#d1d5db;">&nbsp;</div>
      </div>
      <div style="border-right:1px solid #9ca3af;padding:8px;">
        <div style="font-size:8px;color:#6b7280;margin-bottom:4px;">3 &nbsp; Other income</div>
        <div style="font-size:11px;color:#d1d5db;">&nbsp;</div>
      </div>
      <div style="padding:8px;">
        <div style="font-size:8px;color:#6b7280;margin-bottom:4px;">4 &nbsp; Federal income tax withheld</div>
        <div style="font-size:11px;font-weight:700;color:#111827;">$0.00</div>
      </div>
    </div>

    <!-- Boxes row 2 -->
    <div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:0;border:1px solid #9ca3af;border-top:none;margin-bottom:24px;">
      <div style="border-right:1px solid #9ca3af;padding:8px;">
        <div style="font-size:8px;color:#6b7280;margin-bottom:4px;">5 &nbsp; State tax withheld</div>
        <div style="font-size:11px;color:#d1d5db;">&nbsp;</div>
      </div>
      <div style="border-right:1px solid #9ca3af;padding:8px;">
        <div style="font-size:8px;color:#6b7280;margin-bottom:4px;">6 &nbsp; State/Payer's state no.</div>
        <div style="font-size:11px;color:#d1d5db;">&nbsp;</div>
      </div>
      <div style="padding:8px;">
        <div style="font-size:8px;color:#6b7280;margin-bottom:4px;">7 &nbsp; State income</div>
        <div style="font-size:11px;color:#d1d5db;">&nbsp;</div>
      </div>
    </div>

    <!-- Instructions note -->
    <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:6px;padding:12px 14px;margin-bottom:20px;">
      <div style="font-size:9px;color:#4b5563;line-height:1.6;">
        <strong>COPY B &mdash; For Recipient.</strong> This is important tax information and is being furnished to the IRS. If you are required to file a return,
        a negligence penalty or other sanction may be imposed on you if this income is taxable and you fail to report it.
      </div>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;padding-top:10px;font-size:9px;color:#9ca3af;">
      Generated ${esc(today)} &middot; ${data.taxYear} Tax Year &middot; For informational purposes only.
    </div>
  </div>
  <div style="height:4px;background:linear-gradient(to right,#3b82f6,#1d4ed8);margin-top:32px;"></div>
</body>
</html>`;

  return renderHtmlToPdf(html);
}
