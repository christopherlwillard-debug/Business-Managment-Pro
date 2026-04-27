import type { MaterialList } from "@workspace/api-client-react";
import { renderHtmlToPdf } from "./renderHtmlToPdf";

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export async function generateJobMaterialsPdf(
  lists: MaterialList[],
  jobTitle: string,
  companyName?: string
): Promise<Blob> {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  let grandTotal = 0;

  const listsHtml = lists
    .filter(list => list.items.length > 0)
    .map(list => {
      const markupMult = list.markup / 100 + 1;
      let listTotal = 0;

      const rowsHtml = list.items.map((it, i) => {
        const extended = it.unitCostSnapshot * it.qty;
        const extendedWithMarkup = extended * markupMult;
        listTotal += extendedWithMarkup;
        return `
          <tr style="${i % 2 === 1 ? "background:#f9fafb;" : ""}">
            <td style="padding:7px 10px 7px 0;color:#1f2937;font-size:11px;">${esc(it.nameSnapshot)}</td>
            <td style="padding:7px 8px;color:#6b7280;font-size:11px;">${esc(it.unitSnapshot || "ea")}</td>
            <td style="padding:7px 0 7px 8px;text-align:right;color:#6b7280;font-size:11px;">${fmtCurrency(it.unitCostSnapshot)}</td>
            <td style="padding:7px 0 7px 8px;text-align:right;color:#6b7280;font-size:11px;">${it.qty}</td>
            <td style="padding:7px 0 7px 8px;text-align:right;font-weight:600;color:#111827;font-size:11px;">${fmtCurrency(extendedWithMarkup)}</td>
          </tr>`;
      }).join("");

      grandTotal += listTotal;

      const markupLabel = list.markup > 0 ? ` <span style="font-size:10px;font-weight:400;color:#6b7280;">(${list.markup}% markup)</span>` : "";

      return `
        <div style="margin-bottom:24px;page-break-inside:avoid;">
          <div style="font-weight:700;font-size:13px;color:#1f2937;margin-bottom:6px;">${esc(list.name)}${markupLabel}</div>
          <table style="width:100%;border-collapse:collapse;">
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
            <tfoot>
              <tr style="border-top:1px solid #e5e7eb;">
                <td colspan="4" style="text-align:right;padding:7px 8px 7px 0;font-size:11px;font-weight:600;color:#374151;">List Total:</td>
                <td style="text-align:right;padding:7px 0 7px 8px;font-size:11px;font-weight:700;color:#111827;">${fmtCurrency(listTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>`;
    }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Materials Summary — ${esc(jobTitle)}</title>
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
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
      <div>
        <div style="font-size:28px;font-weight:900;letter-spacing:0.05em;color:#1f2937;text-transform:uppercase;line-height:1;">Materials Summary</div>
        <div style="font-size:11px;color:#6b7280;margin-top:6px;">Job: ${esc(jobTitle)} &nbsp;|&nbsp; Date: ${esc(today)}</div>
      </div>
    </div>
    <div style="height:1px;background:#e5e7eb;margin-bottom:24px;"></div>
    ${listsHtml}
    <div style="height:1px;background:#1f2937;margin:8px 0 12px;"></div>
    <div style="display:flex;justify-content:flex-end;">
      <table style="font-size:13px;border-collapse:collapse;">
        <tr>
          <td style="text-align:right;padding:4px 16px 4px 0;font-weight:800;color:#1f2937;">Grand Total:</td>
          <td style="text-align:right;padding:4px 0;font-weight:800;color:#d97706;">${fmtCurrency(grandTotal)}</td>
        </tr>
      </table>
    </div>
  </div>
  <div style="height:4px;background:linear-gradient(to right,#fbbf24,#f59e0b);margin-top:32px;"></div>
</body>
</html>`;

  return renderHtmlToPdf(html);
}
