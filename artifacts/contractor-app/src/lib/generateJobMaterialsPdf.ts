import jsPDF from "jspdf";
import type { MaterialList } from "@workspace/api-client-react";

export function generateJobMaterialsPdf(
  lists: MaterialList[],
  jobTitle: string,
  companyName?: string
): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
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
  doc.text("Materials Summary", margin, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.text(`Job: ${jobTitle}   |   Date: ${today}`, margin, y);
  y += 8;

  doc.setDrawColor(160);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  const colX = [margin, margin + 65, margin + 92, margin + 120, margin + 143];
  const colW = [65, 27, 28, 23, 28];

  let grandTotal = 0;

  for (const list of lists) {
    if (list.items.length === 0) continue;

    const markupMult = list.markup / 100 + 1;

    if (y > 220) {
      doc.addPage();
      y = margin;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(40);
    const markupLabel = list.markup > 0 ? `  (${list.markup}% markup)` : "";
    doc.text(`${list.name}${markupLabel}`, margin, y);
    y += 5;

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

    let listTotal = 0;
    for (const it of list.items) {
      if (y > 240) {
        doc.addPage();
        y = margin;
      }
      const extended = it.unitCostSnapshot * it.qty;
      const extendedWithMarkup = extended * markupMult;
      listTotal += extendedWithMarkup;

      const label = it.nameSnapshot.length > 45 ? it.nameSnapshot.substring(0, 43) + "…" : it.nameSnapshot;
      doc.text(label, colX[0], y);
      doc.text(it.unitSnapshot || "ea", colX[1], y);
      doc.text(`$${it.unitCostSnapshot.toFixed(2)}`, colX[2] + colW[2], y, { align: "right" } as never);
      doc.text(String(it.qty), colX[3] + colW[3], y, { align: "right" } as never);
      doc.text(`$${extendedWithMarkup.toFixed(2)}`, colX[4] + colW[4], y, { align: "right" } as never);
      y += 5;

      doc.setDrawColor(230);
      doc.line(margin, y - 1, pageW - margin, y - 1);
    }

    grandTotal += listTotal;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(`List Total:`, pageW - margin - 28, y + 3, { align: "right" } as never);
    doc.text(`$${listTotal.toFixed(2)}`, pageW - margin, y + 3, { align: "right" } as never);
    y += 10;

    doc.setDrawColor(180);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
  }

  if (y > 250) {
    doc.addPage();
    y = margin;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text("Grand Total:", pageW - margin - 28, y + 3, { align: "right" } as never);
  doc.text(`$${grandTotal.toFixed(2)}`, pageW - margin, y + 3, { align: "right" } as never);

  return doc.output("blob");
}
