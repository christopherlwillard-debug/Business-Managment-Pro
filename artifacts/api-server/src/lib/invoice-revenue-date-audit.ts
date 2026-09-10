export type InvoiceRevenueDateAuditRow = {
  id: number;
  invoiceNumber: string | null;
  clientName: string | null;
  jobTitle: string | null;
  issueDate: string | null;
  dashboardRevenueDate: string;
  amount: number;
  businessId: number | null;
  businessLine: string | null;
};

function csvCell(value: string | number | null): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildInvoiceRevenueDateAuditCsv(rows: InvoiceRevenueDateAuditRow[]): string {
  const header = [
    "Invoice #",
    "Client",
    "Job",
    "Issue date",
    "Dashboard revenue date",
    "Date basis",
    "Paid amount",
    "Business ID",
    "Business line",
  ];
  const lines = rows.map(row => [
    row.invoiceNumber,
    row.clientName,
    row.jobTitle,
    row.issueDate,
    row.dashboardRevenueDate,
    "Issue date fallback",
    row.amount.toFixed(2),
    row.businessId,
    row.businessLine,
  ].map(csvCell).join(","));

  return `\uFEFF${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}