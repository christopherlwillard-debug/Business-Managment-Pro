export type JobInvoiceSummaryLoadStatus = "loading" | "ready" | "error";
export type JobInvoiceAction = "none" | "create" | "edit" | "view" | "retry";

export type JobInvoiceStatusPresentation = {
  label: string;
  action: JobInvoiceAction;
  actionLabel: string | null;
};

const invoiceStatusLabels: Record<string, string> = {
  draft: "Draft invoice",
  approved: "Approved",
  sent: "Sent",
  partiallyPaid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
  canceled: "Cancelled",
};

export function getJobInvoiceStatusPresentation(
  loadStatus: JobInvoiceSummaryLoadStatus,
  invoiceStatus?: string | null,
): JobInvoiceStatusPresentation {
  if (loadStatus === "loading") {
    return { label: "Checking invoice status…", action: "none", actionLabel: null };
  }

  if (loadStatus === "error") {
    return { label: "Invoice status unavailable", action: "retry", actionLabel: "Retry" };
  }

  if (!invoiceStatus || invoiceStatus === "not_invoiced") {
    return { label: "Not invoiced", action: "create", actionLabel: "Create Invoice" };
  }

  if (invoiceStatus === "draft") {
    return { label: invoiceStatusLabels.draft, action: "edit", actionLabel: "Open / Edit" };
  }

  const label = invoiceStatusLabels[invoiceStatus]
    ?? invoiceStatus
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/^./, first => first.toUpperCase());

  return { label, action: "view", actionLabel: "View" };
}