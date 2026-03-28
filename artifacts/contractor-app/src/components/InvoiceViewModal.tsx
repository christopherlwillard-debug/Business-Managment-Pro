import { formatCurrency, formatDate } from "@/lib/utils";
import {
  FileText, Trash2, X,
  Building2, MapPin, Printer, Mail, Phone,
  Paperclip,
} from "lucide-react";
import { Invoice, InvoiceLineItem, InvoiceAttachment, AppSettings } from "@workspace/api-client-react";

const STATUS_COLORS: Record<string, string> = {
  paid:      "bg-emerald-100 text-emerald-700",
  sent:      "bg-blue-100 text-blue-700",
  overdue:   "bg-red-100 text-red-700",
  draft:     "bg-gray-100 text-gray-600",
  cancelled: "bg-orange-100 text-orange-700",
};

interface InvoiceViewModalProps {
  invoice: Invoice;
  settings: AppSettings | undefined;
  onClose: () => void;
  onDelete?: () => void;
}

export function InvoiceViewModal({ invoice, settings, onClose, onDelete }: InvoiceViewModalProps) {
  const s = settings ?? ({} as AppSettings);
  const companyName    = s.companyName    || "";
  const companyEmail   = s.companyEmail   || "";
  const companyPhone   = s.companyPhone   || "";
  const companyAddress = s.companyAddress || "";
  const companyCity    = s.companyCity    || "";
  const companyState   = s.companyState   || "";
  const companyZip     = s.companyZip     || "";
  const logoUrl: string | null  = s.logoUrl ?? null;
  const logoSize: string        = s.invoiceLogoSize     ?? "medium";
  const logoPos: string         = s.invoiceLogoPosition ?? "top-left";
  const logoPx = logoSize === "small" ? 64 : logoSize === "large" ? 160 : 100;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const lineItems: InvoiceLineItem[] = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  const subtotal  = invoice.subtotal;
  const taxRate   = invoice.taxRate   ?? 0;
  const taxAmount = invoice.taxAmount ?? 0;
  const total     = invoice.total;

  const workLocation = invoice.locationName || invoice.city || invoice.state;

  function handlePrint() { window.print(); }

  // Show contact block if any company info exists (name, address, phone, or email)
  const hasContact = !!(companyName || companyAddress || companyCity || companyState || companyZip || companyPhone || companyEmail);

  // Shared contact info block — shown below logo in all position variants
  function ContactInfo({ align = "left" }: { align?: "left" | "center" | "right" }) {
    if (!hasContact) return null;
    const textAlign = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
    return (
      <div className={`text-xs text-gray-500 space-y-0.5 mt-2 ${textAlign}`} style={{ textDecoration: "none", fontStyle: "normal" }}>
        {/* Show company name as text only when no logo is present */}
        {!logoUrl && companyName && (
          <p className="font-bold text-gray-800 text-sm mb-1" style={{ textDecoration: "none" }}>{companyName}</p>
        )}
        {companyAddress && <p style={{ textDecoration: "none" }}>{companyAddress}</p>}
        {(companyCity || companyState || companyZip) && (
          <p style={{ textDecoration: "none" }}>{[companyCity, companyState, companyZip].filter(Boolean).join(", ")}</p>
        )}
        {companyPhone && <p style={{ textDecoration: "none" }}>{companyPhone}</p>}
        {companyEmail && <p style={{ textDecoration: "none" }}>{companyEmail}</p>}
      </div>
    );
  }

  const logoEl = logoUrl ? (
    <img src={`${base}${logoUrl}`} alt="Logo" className="flex-shrink-0"
      style={{ height: logoPx, width: "auto", maxWidth: logoPx * 2.5, objectFit: "contain" }} />
  ) : (
    <div className="rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0"
      style={{ width: 48, height: 48 }}>
      <Building2 className="w-6 h-6 text-amber-500" />
    </div>
  );

  const invoiceDetailsEl = (
    <div className="text-right flex-shrink-0">
      <p className="text-4xl font-black tracking-widest text-gray-800 uppercase leading-none">Invoice</p>
      <p className="text-base font-bold text-amber-500 mt-1">{invoice.invoiceNumber}</p>
      <div className="mt-3 space-y-1 text-xs">
        <div className="flex justify-end gap-3 text-gray-600">
          <span className="font-semibold text-gray-700">Date:</span>
          <span>{formatDate(invoice.issueDate)}</span>
        </div>
        {invoice.dueDate && (
          <div className="flex justify-end gap-3 text-gray-600">
            <span className="font-semibold text-gray-700">Due:</span>
            <span>{formatDate(invoice.dueDate)}</span>
          </div>
        )}
        {invoice.terms && (
          <div className="flex justify-end gap-3 text-gray-600">
            <span className="font-semibold text-gray-700">Terms:</span>
            <span>{invoice.terms}</span>
          </div>
        )}
      </div>
    </div>
  );

  const headerRow = logoPos === "top-center" ? (
    <div className="flex justify-between items-start gap-4">
      <div className="w-16 flex-shrink-0" />
      <div className="flex flex-col items-center">
        {logoEl}
        <ContactInfo align="center" />
      </div>
      {invoiceDetailsEl}
    </div>
  ) : logoPos === "top-right" ? (
    <div className="flex justify-between items-start gap-4">
      {invoiceDetailsEl}
      <div className="flex flex-col items-end">
        {logoEl}
        <ContactInfo align="right" />
      </div>
    </div>
  ) : (
    <div className="flex justify-between items-start gap-4">
      <div className="flex flex-col">
        {logoEl}
        <ContactInfo align="left" />
      </div>
      {invoiceDetailsEl}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-gray-100 shadow-2xl rounded-2xl flex flex-col"
        style={{ maxHeight: "92vh" }}>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 bg-white rounded-t-2xl border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-500" />
            <span className="font-bold text-gray-900 text-sm">{invoice.invoiceNumber}</span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${STATUS_COLORS[invoice.status] ?? "bg-gray-100 text-gray-600"}`}>
              {invoice.status}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            {onDelete && (
              <button onClick={onDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Invoice document */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="invoice-print-area bg-white rounded-xl shadow border border-gray-200 overflow-hidden text-[12.5px] text-gray-900">
            <div className="h-2 bg-gradient-to-r from-amber-500 to-amber-400" />
            <div className="p-8 space-y-6">

              {headerRow}

              {/* Bill To + Location */}
              <div className={workLocation ? "grid grid-cols-2 gap-4" : "grid grid-cols-1 gap-4"}>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-3">Bill To</p>
                  {invoice.clientName
                    ? <div className="space-y-2">
                        <p className="font-bold text-gray-900 text-sm">{invoice.clientName}</p>
                        {invoice.clientEmail && (
                          <div className="flex items-start text-xs text-gray-600 gap-2">
                            <Mail className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                            <span className="break-all">{invoice.clientEmail}</span>
                          </div>
                        )}
                        {invoice.clientPhone && (
                          <div className="flex items-center text-xs text-gray-600 gap-2">
                            <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span>{invoice.clientPhone}</span>
                          </div>
                        )}
                        {(invoice.clientAddress || invoice.clientCity || invoice.clientState || invoice.clientZip) && (
                          <div className="flex items-start text-xs text-gray-600 gap-2">
                            <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                            <span className="break-words">
                              {[invoice.clientAddress, invoice.clientCity, invoice.clientState, invoice.clientZip].filter(Boolean).join(", ")}
                            </span>
                          </div>
                        )}
                        {invoice.clientNotes && (
                          <div className="text-xs text-gray-600 border-t border-gray-200 pt-2 mt-2">
                            <p className="font-semibold text-gray-700 mb-1 text-[9px] uppercase tracking-widest">Notes</p>
                            <p className="text-gray-600">{invoice.clientNotes}</p>
                          </div>
                        )}
                        {invoice.jobTitle && <p className="text-xs text-gray-500 mt-2">Re: {invoice.jobTitle}</p>}
                      </div>
                    : <p className="text-gray-400 italic text-xs">No client specified</p>}
                </div>
                {workLocation && (
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                    <p className="text-[9px] uppercase tracking-widest font-bold text-amber-500 mb-2 flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5" /> Work Location
                    </p>
                    <div className="space-y-1">
                      {invoice.locationName && (
                        <p className="font-bold text-gray-800 text-sm">{invoice.locationName}</p>
                      )}
                      {(invoice.city || invoice.state) && (
                        <p className="text-xs text-gray-600">
                          {[invoice.city, invoice.state].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Line items */}
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-gray-800">
                    <th className="text-left pb-2 font-bold uppercase tracking-wide text-gray-600 w-[50%]">Description</th>
                    <th className="text-right pb-2 font-bold uppercase tracking-wide text-gray-600 w-[12%]">Qty</th>
                    <th className="text-right pb-2 font-bold uppercase tracking-wide text-gray-600 w-[19%]">Unit Price</th>
                    <th className="text-right pb-2 font-bold uppercase tracking-wide text-gray-600 w-[19%]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lineItems.length > 0 ? lineItems.map((li: InvoiceLineItem, i: number) => (
                    <tr key={i} className={i % 2 === 0 ? "" : "bg-gray-50/60"}>
                      <td className="py-2.5 pr-3 text-gray-800">{li.description}</td>
                      <td className="py-2.5 text-right text-gray-500">{li.quantity}</td>
                      <td className="py-2.5 text-right text-gray-500">{formatCurrency(li.unitPrice)}</td>
                      <td className="py-2.5 text-right font-semibold text-gray-900">{formatCurrency(li.quantity * li.unitPrice)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="py-4 text-center text-gray-300 italic">No line items</td></tr>
                  )}
                </tbody>
              </table>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-56 space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                  </div>
                  {taxRate > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>Tax ({taxRate}%)</span><span>{formatCurrency(taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-extrabold text-sm text-gray-900 border-t-2 border-gray-800 pt-2.5 mt-1">
                    <span>Total Due</span>
                    <span className="text-amber-600">{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {invoice.notes && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-2">Notes</p>
                  <p className="text-gray-600 text-xs leading-relaxed whitespace-pre-wrap">{invoice.notes}</p>
                </div>
              )}

              {/* Attachments */}
              {Array.isArray(invoice.attachments) && invoice.attachments.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-2 flex items-center gap-1">
                    <Paperclip className="w-2.5 h-2.5" /> Attachments
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(invoice.attachments as InvoiceAttachment[]).map((att, i) => (
                      <a
                        key={i}
                        href={`${base}${att.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 hover:bg-amber-100 transition-colors max-w-[200px]"
                      >
                        <Paperclip className="w-3 h-3 flex-shrink-0 print-hide" />
                        <span className="truncate">{att.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="h-1.5 bg-gradient-to-r from-amber-400 to-amber-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
