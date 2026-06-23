interface PdfItem {
  title: string;
  completed: boolean;
  skipped: boolean;
  completedByName: string | null;
  completedAt: string | null;
  notes: string | null;
  photos?: string[];
}

interface PdfSection {
  name: string;
  active: boolean;
  notes: string | null;
  items: PdfItem[];
}

export interface ChecklistPdfData {
  companyName: string | null;
  jobTitle: string;
  clientName: string | null;
  locationName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  templateName: string;
  overallPercent: number;
  completedItems: number;
  totalItems: number;
  publicNotes: string | null;
  sections: PdfSection[];
  signatureImageDataUri: string | null;
  generatedDate: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function buildChecklistPdfHtml(data: ChecklistPdfData): string {
  const locationParts = [data.locationName, data.address, data.city, data.state].filter(Boolean);
  const locationStr = locationParts.join(", ");

  const activeSections = data.sections.filter(s => s.active);

  const sectionsHtml = activeSections.map(section => {
    const itemsHtml = section.items.map(item => {
      let statusSymbol: string;
      let statusClass: string;
      if (item.skipped) {
        statusSymbol = "N/A";
        statusClass = "status-na";
      } else if (item.completed) {
        statusSymbol = "✓";
        statusClass = "status-done";
      } else {
        statusSymbol = "☐";
        statusClass = "status-pending";
      }

      const metaLine = item.completed && item.completedByName
        ? `<div class="item-meta">${item.completedByName}${item.completedAt ? " &middot; " + fmtDate(item.completedAt) : ""}</div>`
        : "";
      const noteLine = item.notes
        ? `<div class="item-note">${escHtml(item.notes)}</div>`
        : "";
      const photosHtml = item.photos && item.photos.length > 0
        ? `<div class="item-photos">${item.photos.slice(0, 3).map(uri => `<img src="${uri}" class="item-photo" alt="Photo" />`).join("")}</div>`
        : "";

      return `
        <tr class="item-row">
          <td class="item-status ${statusClass}">${statusSymbol}</td>
          <td class="item-title">
            <span class="${item.completed ? "crossed" : item.skipped ? "na-text" : ""}">${escHtml(item.title)}</span>
            ${metaLine}${noteLine}${photosHtml}
          </td>
        </tr>`;
    }).join("");

    const sectionNotesHtml = section.notes
      ? `<tr><td colspan="2"><div class="section-note">${escHtml(section.notes)}</div></td></tr>`
      : "";

    return `
      <tr class="section-header">
        <td colspan="2">${escHtml(section.name)}</td>
      </tr>
      ${itemsHtml}
      ${sectionNotesHtml}`;
  }).join("");

  const publicNotesHtml = data.publicNotes
    ? `<div class="public-notes"><strong>Notes:</strong> ${escHtml(data.publicNotes)}</div>`
    : "";

  const sigImgHtml = data.signatureImageDataUri
    ? `<img src="${data.signatureImageDataUri}" class="sig-img" alt="Signature" />`
    : '<div class="sig-line"></div>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, sans-serif;
    font-size: 11pt;
    color: #111;
    background: #fff;
    padding: 36px 48px;
  }
  .header { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
  .company-name { font-size: 9pt; color: #555; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
  .job-title { font-size: 18pt; font-weight: bold; line-height: 1.2; }
  .meta-row { display: flex; gap: 32px; margin-top: 8px; font-size: 9.5pt; color: #444; flex-wrap: wrap; }
  .meta-item strong { color: #111; }
  .progress-bar-wrap { margin-top: 10px; }
  .progress-label { font-size: 9pt; color: #444; margin-bottom: 3px; }
  .progress-bar { height: 8px; background: #e5e5e5; border-radius: 4px; overflow: hidden; }
  .progress-fill { height: 100%; background: #16a34a; border-radius: 4px; }
  .progress-pct { font-size: 9pt; color: #16a34a; font-weight: bold; margin-top: 2px; }

  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  .section-header td {
    background: #f3f4f6;
    font-weight: bold;
    font-size: 10pt;
    padding: 6px 10px;
    border-top: 1px solid #ccc;
    border-bottom: 1px solid #ccc;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #222;
  }
  .item-row td { padding: 5px 8px; border-bottom: 1px solid #ebebeb; vertical-align: top; }
  .item-status {
    width: 32px;
    text-align: center;
    font-size: 11pt;
    font-weight: bold;
    padding-top: 5px;
  }
  .status-done { color: #16a34a; }
  .status-pending { color: #999; }
  .status-na { color: #999; font-size: 8pt; font-weight: normal; }
  .item-title { font-size: 10pt; }
  .crossed { text-decoration: line-through; color: #888; }
  .na-text { color: #aaa; }
  .item-meta { font-size: 8pt; color: #16a34a; margin-top: 1px; }
  .item-note { font-size: 8.5pt; color: #555; font-style: italic; margin-top: 2px; }
  .section-note { font-size: 8.5pt; color: #555; font-style: italic; padding: 4px 8px 6px 40px; }
  .item-photos { display: flex; gap: 5px; margin-top: 5px; flex-wrap: wrap; }
  .item-photo { width: 80px; height: 60px; object-fit: cover; border-radius: 3px; border: 1px solid #ddd; }

  .public-notes {
    margin-top: 16px;
    padding: 10px 14px;
    background: #f9fafb;
    border-left: 3px solid #16a34a;
    font-size: 9.5pt;
    color: #333;
    border-radius: 2px;
  }

  .signature-block {
    margin-top: 36px;
    padding-top: 20px;
    border-top: 1px solid #ddd;
    page-break-inside: avoid;
  }
  .sig-row { display: flex; gap: 48px; flex-wrap: wrap; margin-top: 12px; }
  .sig-field { flex: 1; min-width: 180px; }
  .sig-label { font-size: 8.5pt; color: #666; margin-bottom: 4px; }
  .sig-line { border-bottom: 1px solid #333; height: 36px; }
  .sig-img { max-height: 60px; max-width: 200px; object-fit: contain; display: block; }
  .sig-section-title { font-size: 9pt; font-weight: bold; color: #444; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }

  @media print {
    body { padding: 24px 36px; }
    .section-header td { background: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .progress-fill { background: #16a34a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="header">
    ${data.companyName ? `<div class="company-name">${escHtml(data.companyName)}</div>` : ""}
    <div class="job-title">${escHtml(data.jobTitle)}</div>
    <div class="meta-row">
      ${data.clientName ? `<span class="meta-item"><strong>Client / Dealer:</strong> ${escHtml(data.clientName)}</span>` : ""}
      ${locationStr ? `<span class="meta-item"><strong>Location:</strong> ${escHtml(locationStr)}</span>` : ""}
      <span class="meta-item"><strong>Template:</strong> ${escHtml(data.templateName)}</span>
      <span class="meta-item"><strong>Generated:</strong> ${escHtml(data.generatedDate)}</span>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-label">${data.completedItems} of ${data.totalItems} items complete</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${data.overallPercent}%"></div></div>
      <div class="progress-pct">${data.overallPercent}% Complete</div>
    </div>
  </div>

  ${publicNotesHtml}

  <table>
    <tbody>
      ${sectionsHtml}
    </tbody>
  </table>

  <div class="signature-block">
    <div class="sig-section-title">Sign-Off</div>
    <div class="sig-row">
      <div class="sig-field">
        <div class="sig-label">Completed By</div>
        <div class="sig-line"></div>
      </div>
      <div class="sig-field">
        <div class="sig-label">Signature</div>
        ${sigImgHtml}
      </div>
      <div class="sig-field">
        <div class="sig-label">Date</div>
        <div class="sig-line"></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
