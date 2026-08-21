import { renderHtmlToPdf } from "./renderHtmlToPdf";

export interface DepreciationRow {
  year: number;
  annualDeduction: number;
  accumulated: number;
  bookValue: number;
  businessUsePct?: number;
}

export interface AssetPdfRow {
  name: string;
  assetType: string;
  status: string;
  purchaseDate: string;
  purchasePrice: number;
  vendor?: string | null;
  serialNumber?: string | null;
  depreciationMethod: string;
  usefulLifeYears?: number | null;
  salvageValue?: number | null;
  section179Eligible: boolean;
  schedule: DepreciationRow[];
}

export type PdfFilter =
  | { type: "all" }
  | { type: "active-only" }
  | { type: "year"; year: number };

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(d: string): string {
  const parts = d.slice(0, 10).split("-");
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
  return d;
}

function methodLabel(m: string): string {
  if (m === "section-179") return "Section 179";
  if (m === "bonus") return "Bonus Depreciation";
  return "Straight-Line";
}

function statusLabel(s: string): string {
  if (s === "active") return "Active";
  if (s === "sold") return "Sold";
  if (s === "retired") return "Retired";
  return s;
}

function statusColor(s: string): string {
  if (s === "active") return "#15803d";
  if (s === "sold") return "#1d4ed8";
  return "#6b7280";
}

function statusBg(s: string): string {
  if (s === "active") return "#f0fdf4";
  if (s === "sold") return "#eff6ff";
  return "#f9fafb";
}

function filterLabel(filter: PdfFilter): string {
  if (filter.type === "active-only") return "Active Assets Only";
  if (filter.type === "year") return `Tax Year ${filter.year}`;
  return "All Assets";
}

export async function generateAssetDepreciationPdf(
  assets: AssetPdfRow[],
  filter: PdfFilter = { type: "all" },
): Promise<Blob> {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const year = new Date().getFullYear();

  let filteredAssets = assets;
  if (filter.type === "active-only") {
    filteredAssets = assets.filter(a => a.status === "active");
  } else if (filter.type === "year") {
    filteredAssets = assets
      .filter(a => a.schedule.some(r => r.year === filter.year))
      .map(a => ({ ...a, schedule: a.schedule.filter(r => r.year === filter.year) }));
  }

  const filterBadge = filter.type !== "all"
    ? `<span style="display:inline-block;background:#dbeafe;color:#1e40af;font-size:10px;font-weight:700;padding:3px 10px;border-radius:12px;border:1px solid #bfdbfe;">${esc(filterLabel(filter))}</span>`
    : "";
  const reportScope = filteredAssets.length === 1
    ? filteredAssets[0].name
    : filterLabel(filter);

  const assetSections = filteredAssets.map((asset) => {
    const scheduleRows = asset.schedule.length > 0
      ? asset.schedule.map((row) => {
          const busUsePct = row.businessUsePct !== undefined ? row.businessUsePct : 100;
          const showBusUse = row.businessUsePct !== undefined;
          return `
          <tr>
            <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;color:#374151;">${row.year}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;color:#374151;">${showBusUse ? `${busUsePct}%` : "100%"}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;color:#374151;">${fmtCurrency(row.annualDeduction)}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;color:#374151;">${fmtCurrency(row.accumulated)}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;color:#111827;">${fmtCurrency(row.bookValue)}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="5" style="padding:8px;color:#9ca3af;font-style:italic;">No depreciation schedule available</td></tr>`;

    const totalDeductions = asset.schedule.reduce((s, r) => s + r.annualDeduction, 0);

    return `
    <div style="margin-bottom:28px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;page-break-inside:avoid;">
      <!-- Asset header -->
      <div style="background:#f8fafc;border-bottom:1px solid #e5e7eb;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:14px;font-weight:700;color:#111827;">${esc(asset.name)}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">${esc(asset.assetType)}${asset.vendor ? ` &middot; ${esc(asset.vendor)}` : ""}${asset.serialNumber ? ` &middot; S/N: ${esc(asset.serialNumber)}` : ""}</div>
        </div>
        <span style="font-size:10px;font-weight:600;padding:3px 9px;border-radius:12px;background:${statusBg(asset.status)};color:${statusColor(asset.status)};">${statusLabel(asset.status)}</span>
      </div>
      <!-- Asset details row -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-bottom:1px solid #e5e7eb;">
        <div style="padding:10px 16px;border-right:1px solid #f3f4f6;">
          <div style="font-size:9px;color:#9ca3af;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.05em;">Purchase Date</div>
          <div style="font-size:12px;font-weight:600;color:#111827;">${fmtDate(asset.purchaseDate)}</div>
        </div>
        <div style="padding:10px 16px;border-right:1px solid #f3f4f6;">
          <div style="font-size:9px;color:#9ca3af;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.05em;">Purchase Price</div>
          <div style="font-size:12px;font-weight:600;color:#111827;">${fmtCurrency(asset.purchasePrice)}</div>
        </div>
        <div style="padding:10px 16px;border-right:1px solid #f3f4f6;">
          <div style="font-size:9px;color:#9ca3af;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.05em;">Method</div>
          <div style="font-size:12px;font-weight:600;color:#111827;">${esc(methodLabel(asset.depreciationMethod))}</div>
        </div>
        <div style="padding:10px 16px;">
          <div style="font-size:9px;color:#9ca3af;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.05em;">Useful Life</div>
          <div style="font-size:12px;font-weight:600;color:#111827;">${asset.usefulLifeYears != null ? `${asset.usefulLifeYears} yrs` : "—"}</div>
        </div>
      </div>
      <!-- Depreciation schedule table -->
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:7px 8px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;">Year</th>
            <th style="padding:7px 8px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;">Business Use %</th>
            <th style="padding:7px 8px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;">Annual Deduction</th>
            <th style="padding:7px 8px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;">Accumulated</th>
            <th style="padding:7px 8px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;">Book Value</th>
          </tr>
        </thead>
        <tbody>
          ${scheduleRows}
        </tbody>
        ${asset.schedule.length > 0 ? `
        <tfoot>
          <tr style="background:#f8fafc;">
            <td colspan="2" style="padding:7px 8px;font-size:11px;font-weight:700;color:#374151;border-top:2px solid #e5e7eb;">Total Deductions</td>
            <td style="padding:7px 8px;text-align:right;font-size:11px;font-weight:700;color:#111827;border-top:2px solid #e5e7eb;">${fmtCurrency(totalDeductions)}</td>
            <td colspan="2" style="border-top:2px solid #e5e7eb;"></td>
          </tr>
        </tfoot>` : ""}
      </table>
    </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Asset Depreciation Schedule &mdash; ${year}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111827; background: white; }
    .page { max-width: 780px; margin: 0 auto; padding: 40px 48px; }
    @media print {
      @page { size: letter portrait; margin: 0.5in; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div style="height:6px;background:linear-gradient(to right,#1d4ed8,#3b82f6);"></div>
  <div class="page">

    <!-- Report header -->
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:18px 24px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:22px;font-weight:900;color:#1e3a8a;letter-spacing:0.02em;">Asset Depreciation Schedule</div>
        <div style="font-size:12px;color:#3b82f6;margin-top:4px;">Equipment &amp; Assets &mdash; ${esc(reportScope)} Report</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">Generated ${esc(today)}${filterBadge ? ` &nbsp;` : ""}</div>
        ${filterBadge ? `<div style="margin-top:6px;">${filterBadge}</div>` : ""}
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;color:#6b7280;">Assets Shown</div>
        <div style="font-size:32px;font-weight:900;color:#bfdbfe;line-height:1;">${filteredAssets.length}</div>
      </div>
    </div>

    <!-- Summary note -->
    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:6px;padding:10px 14px;margin-bottom:24px;font-size:10px;color:#78350f;line-height:1.5;">
      <strong>For tax preparation use only.</strong> This report reflects depreciation calculations based on the method, useful life, and business-use percentages entered in the system. Verify all amounts with your tax preparer before filing.
    </div>

    ${filteredAssets.length === 0
      ? `<div style="text-align:center;padding:48px 0;color:#9ca3af;font-size:14px;">No assets match the selected filter.</div>`
      : `<!-- Assets -->${assetSections}`
    }

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;padding-top:12px;font-size:9px;color:#9ca3af;margin-top:8px;">
      Asset Depreciation Schedule &middot; ${esc(reportScope)} &middot; Generated ${esc(today)} &middot; For informational purposes only. Consult a qualified tax professional.
    </div>
  </div>
  <div style="height:4px;background:linear-gradient(to right,#3b82f6,#1d4ed8);margin-top:32px;"></div>
</body>
</html>`;

  return renderHtmlToPdf(html);
}
