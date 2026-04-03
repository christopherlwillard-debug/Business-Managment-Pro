import { generateJobMaterialsPdf } from "./generateJobMaterialsPdf";
import type { Invoice, InvoiceAttachment, MaterialList, InvoiceLineItem } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const MATERIALS_ATTACHMENT_PREFIX = "Materials — ";

// Invoice as returned by the API includes location fields not in the generated schema
type InvoiceWithLocation = Invoice & {
  locationName?: string | null;
  city?: string | null;
  state?: string | null;
};

export async function autoAttachMaterialsPdf(
  jobId: number,
  jobTitle: string,
  companyName?: string
): Promise<void> {
  // 1. Fetch fresh material lists for this job
  const listsRes = await fetch(`${BASE}/api/material-lists?jobId=${jobId}`);
  if (!listsRes.ok) return;
  const lists: MaterialList[] = await listsRes.json();

  const nonEmptyLists = lists.filter(l => l.items.length > 0);

  // 2. Fetch the draft invoice for this job
  const invRes = await fetch(`${BASE}/api/invoices?jobId=${jobId}&status=draft`);
  if (!invRes.ok) return;
  const invoices: InvoiceWithLocation[] = await invRes.json();
  const invoice = invoices.find(inv => inv.status === "draft" && inv.jobId === jobId);
  if (!invoice) return;

  // 3. Build the new attachments list (strip the old auto-generated materials PDF)
  const existingAttachments: InvoiceAttachment[] = Array.isArray(invoice.attachments)
    ? (invoice.attachments as InvoiceAttachment[])
    : [];
  const otherAttachments = existingAttachments.filter(
    a => !a.name?.startsWith(MATERIALS_ATTACHMENT_PREFIX)
  );

  let newAttachments: InvoiceAttachment[] = otherAttachments;

  if (nonEmptyLists.length > 0) {
    // 4. Generate the combined materials PDF
    const pdfBlob = generateJobMaterialsPdf(nonEmptyLists, jobTitle, companyName);
    const safeTitle = jobTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const filename = `materials-${safeTitle}.pdf`;

    // 5. Upload the PDF
    const fd = new FormData();
    fd.append("file", pdfBlob, filename);
    const uploadRes = await fetch(`${BASE}/api/uploads`, { method: "POST", body: fd });
    if (!uploadRes.ok) return;
    const uploaded: { url: string; size: number } = await uploadRes.json();

    const materialsAttachment: InvoiceAttachment = {
      url: uploaded.url,
      name: `${MATERIALS_ATTACHMENT_PREFIX}${jobTitle}.pdf`,
      size: uploaded.size,
    };
    newAttachments = [...otherAttachments, materialsAttachment];
  }

  // 6. PUT the invoice with updated attachments (preserve all other fields)
  const lineItems: InvoiceLineItem[] = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  await fetch(`${BASE}/api/invoices/${invoice.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: invoice.clientId ?? null,
      jobId: invoice.jobId ?? null,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate ?? null,
      taxRate: invoice.taxRate ?? null,
      notes: invoice.notes ?? null,
      terms: invoice.terms ?? null,
      city: invoice.city ?? null,
      state: invoice.state ?? null,
      locationName: invoice.locationName ?? null,
      lineItems,
      attachments: newAttachments,
    }),
  });
}
