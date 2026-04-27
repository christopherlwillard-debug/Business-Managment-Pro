import { renderHtmlToPdf } from "./renderHtmlToPdf";

export interface PdfMaterialListItem {
  nameSnapshot: string;
  unitSnapshot: string;
  unitCostSnapshot: number;
  qty: number;
}

export interface PdfMaterialList {
  name: string;
  markup: number;
  jobTitle?: string | null;
  items: PdfMaterialListItem[];
}

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export async function generateMaterialListPdf(
  list: PdfMaterialList,
  jobTitle?: string,
  companyName?: string
): Promise<Blob> {
  const markupMult = list.markup / 100 + 1;
  const rawSubtotal = list.items.reduce((s, it) => s + it.unitCostSnapshot * it.qty, 0);
  const total = list.items.reduce((s, it) => s + it.unitCostSnapshot * it.qty * markupMult, 0);
  const markupAmount = total - rawSubtotal;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const effectiveJobTitle = jobTitle || list.jobTitle || "General";

  const rowsHtml = list.items.map((it, i) => {
    const extended = it.unitCostSnapshot * it.qty;
    return `
      <tr style="${i % 2 === 1 ? "background:#f9fafb;" : ""}">
        <td style="padding:7px 10px 7px 0;color:#1f2937;font-size:11px;">${esc(it.nameSnapshot)}</td>
        <td style="padding:7px 8px;color:#6b7280;font-size:11px;">${esc(it.unitSnapshot || "ea")}</td>
        <td style="padding:7px 0 7px 8px;text-align:right;color:#6b7280;font-size:11px;">${fmtCurrency(it.unitCostSnapshot)}</td>
        <td style="padding:7px 0 7px 8px;text-align:right;color:#6b7280;font-size:11px;">${it.qty}</td>
        <td style="padding:7px 0 7px 8px;text-align:right;font-weight:600;color:#111827;font-size:11px;">${fmtCurrency(extended)}</td>
      </tr>`;
  }).join("");

  const markupRow = list.markup > 0
    ? `<tr>
         <td colspan="4" style="text-align:right;padding:4px 8px 4px 0;font-size:11px;color:#6b7280;">Markup (${list.markup}%)</td>
         <td style="text-align:right;padding:4px 0;font-size:11px;color:#6b7280;">${fmtCurrency(markupAmount)}</td>
       </tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Material List — ${esc(list.name)}</title>
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
  <div style="height:6px;background:linear-gradient(to right,#f59e0b,#fbbf24);"></div>
  <div class="page">
    ${companyName ? `<div style="font-weight:700;font-size:11px;color:#6b7280;margin-bottom:4px;">${esc(companyName)}</div>` : ""}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
      <div>
        <div style="font-size:28px;font-weight:900;letter-spacing:0.05em;color:#1f2937;text-transform:uppercase;line-height:1;">Material List</div>
        <div style="font-size:11px;color:#6b7280;margin-top:6px;">
          Job: ${esc(effectiveJobTitle)} &nbsp;|&nbsp; Date: ${esc(today)}${list.markup > 0 ? ` &nbsp;|&nbsp; Markup: ${list.markup}%` : ""}
        </div>
      </div>
    </div>
    <div style="font-weight:700;font-size:14px;color:#374151;margin-bottom:16px;">${esc(list.name)}</div>
    <div style="height:1px;background:#e5e7eb;margin-bottom:16px;"></div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr style="border-bottom:2px solid #1f2937;">
          <th style="text-align:left;padding:6px 10px 6px 0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;width:40%;">Item</th>
          <th style="text-align:left;padding:6px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;width:10%;">Unit</th>
          <th style="text-align:right;padding:6px 0 6px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;width:18%;">Unit Cost</th>
          <th style="text-align:right;padding:6px 0 6px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;width:10%;">Qty</th>
          <th style="text-align:right;padding:6px 0 6px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;width:22%;">Extended</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;">
      <table style="font-size:11px;border-collapse:collapse;min-width:220px;">
        <tr>
          <td style="text-align:right;padding:4px 16px 4px 0;color:#6b7280;">Subtotal</td>
          <td style="text-align:right;padding:4px 0;color:#6b7280;">${fmtCurrency(rawSubtotal)}</td>
        </tr>
        ${markupRow}
        <tr>
          <td colspan="2" style="padding-top:6px;border-top:2px solid #1f2937;"></td>
        </tr>
        <tr>
          <td style="text-align:right;padding:6px 16px 0 0;font-weight:800;font-size:13px;color:#1f2937;">Total</td>
          <td style="text-align:right;padding:6px 0 0;font-weight:800;font-size:13px;color:#d97706;">${fmtCurrency(total)}</td>
        </tr>
      </table>
    </div>
  </div>
  <div style="height:4px;background:linear-gradient(to right,#fbbf24,#f59e0b);margin-top:32px;"></div>
</body>
</html>`;

  return renderHtmlToPdf(html);
}
