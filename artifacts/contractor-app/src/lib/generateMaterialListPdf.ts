import jsPDF from "jspdf";

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

export function generateMaterialListPdf(
  list: PdfMaterialList,
  jobTitle?: string,
  companyName?: string
): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const markupMult = list.markup / 100 + 1;
  const rawSubtotal = list.items.reduce((s, it) => s + it.unitCostSnapshot * it.qty, 0);
  const total = list.items.reduce((s, it) => s + it.unitCostSnapshot * it.qty * markupMult, 0);
  const markupAmount = total - rawSubtotal;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;

  if (companyName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(80);
    doc.text(companyName, margin, y);
    y += 6;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20);
  doc.text("Material List", margin, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  const jobLabel = jobTitle || list.jobTitle || "General";
  doc.text(`Job: ${jobLabel}   |   Date: ${today}${list.markup > 0 ? `   |   Markup: ${list.markup}%` : ""}`, margin, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(40);
  doc.text(list.name, margin, y);
  y += 8;

  doc.setDrawColor(160);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  const colX = [margin, margin + 65, margin + 92, margin + 120, margin + 143];
  const colW = [65, 27, 28, 23, 28];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text("Item", colX[0], y);
  doc.text("Unit", colX[1], y);
  doc.text("Unit Cost", colX[2] + colW[2], y, { align: "right" } as never);
  doc.text("Qty", colX[3] + colW[3], y, { align: "right" } as never);
  doc.text("Extended", colX[4] + colW[4], y, { align: "right" } as never);
  y += 4;

  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(30);

  for (const it of list.items) {
    if (y > 240) {
      doc.addPage();
      y = margin;
    }
    const extended = it.unitCostSnapshot * it.qty;
    const label = it.nameSnapshot.length > 45 ? it.nameSnapshot.substring(0, 43) + "…" : it.nameSnapshot;
    doc.text(label, colX[0], y);
    doc.text(it.unitSnapshot || "ea", colX[1], y);
    doc.text(`$${it.unitCostSnapshot.toFixed(2)}`, colX[2] + colW[2], y, { align: "right" } as never);
    doc.text(String(it.qty), colX[3] + colW[3], y, { align: "right" } as never);
    doc.text(`$${extended.toFixed(2)}`, colX[4] + colW[4], y, { align: "right" } as never);
    y += 5;

    doc.setDrawColor(230);
    doc.line(margin, y - 1, pageW - margin, y - 1);
  }

  y += 5;
  doc.setDrawColor(180);
  doc.line(margin + 80, y, pageW - margin, y);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text("Subtotal:", pageW - margin - 28, y, { align: "right" } as never);
  doc.text(`$${rawSubtotal.toFixed(2)}`, pageW - margin, y, { align: "right" } as never);
  y += 5;

  if (list.markup > 0) {
    doc.text(`Markup (${list.markup}%):`, pageW - margin - 28, y, { align: "right" } as never);
    doc.text(`$${markupAmount.toFixed(2)}`, pageW - margin, y, { align: "right" } as never);
    y += 5;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text("Total:", pageW - margin - 28, y, { align: "right" } as never);
  doc.text(`$${total.toFixed(2)}`, pageW - margin, y, { align: "right" } as never);

  return doc.output("blob");
}
