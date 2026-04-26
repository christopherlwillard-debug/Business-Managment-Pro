import html2pdf from "html2pdf.js";
import { buildInvoiceBodyHtml, INVOICE_PRINT_STYLES, PrintableInvoice, PrintableSettings } from "./printInvoice";

const BASE_PDF_OPTS = {
  margin: 0,
  image: { type: "jpeg", quality: 0.98 },
  html2canvas: { scale: 2, useCORS: true, logging: false },
  jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
};

function buildContainer(inv: PrintableInvoice, settings: PrintableSettings): HTMLDivElement {
  const div = document.createElement("div");
  div.style.cssText = [
    "position:absolute",
    "left:-9999px",
    "top:0",
    "width:816px",
    "background:#fff",
    "font-family:Arial,Helvetica,sans-serif",
    "font-size:12px",
    "color:#111827",
  ].join(";");
  div.innerHTML = `<style>${INVOICE_PRINT_STYLES}</style>` + buildInvoiceBodyHtml(inv, settings);
  document.body.appendChild(div);
  return div;
}

export async function downloadInvoiceHtmlPdf(
  inv: PrintableInvoice,
  settings: PrintableSettings,
  filename: string,
): Promise<void> {
  const div = buildContainer(inv, settings);
  try {
    await html2pdf().set({ ...BASE_PDF_OPTS, filename }).from(div).save();
  } finally {
    document.body.removeChild(div);
  }
}

export async function invoiceHtmlPdfToBase64(
  inv: PrintableInvoice,
  settings: PrintableSettings,
): Promise<string> {
  const div = buildContainer(inv, settings);
  try {
    const dataUri: string = await html2pdf()
      .set(BASE_PDF_OPTS)
      .from(div)
      .outputPdf("datauristring");
    return dataUri.split(",")[1] ?? "";
  } finally {
    document.body.removeChild(div);
  }
}
