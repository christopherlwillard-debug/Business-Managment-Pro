import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { printInvoiceWindow } from "@/lib/printInvoice";
import { sendViaGmail, buildInvoiceEmailHtml } from "@/lib/gmailSend";
import {
  FileText, Trash2, X,
  Building2, MapPin, Printer, Mail, Phone,
  Paperclip, Send, Check, AlertCircle,
} from "lucide-react";
import { Invoice, InvoiceLineItem, InvoiceAttachment, AppSettings } from "@workspace/api-client-react";
import { useGoogleAuth } from "@/contexts/GoogleAuth";
import { useToast } from "@/hooks/use-toast";

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

  const { isConnected: googleConnected, getToken, signIn } = useGoogleAuth();
  const { toast } = useToast();

  const [showGmailCompose, setShowGmailCompose] = useState(false);
  const [gmailTo, setGmailTo] = useState(invoice.clientEmail ?? "");
  const [gmailSubject, setGmailSubject] = useState(`Invoice ${invoice.invoiceNumber} from ${companyName || "us"}`);
  const [gmailMessage, setGmailMessage] = useState("");
  const [gmailSending, setGmailSending] = useState(false);
  const [gmailSent, setGmailSent] = useState(false);

  function handlePrint() {
    const absoluteLogoUrl = logoUrl ? `${window.location.origin}${base}${logoUrl}` : null;
    printInvoiceWindow(
      {
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        terms: invoice.terms,
        clientName: invoice.clientName,
        clientEmail: invoice.clientEmail,
        clientPhone: invoice.clientPhone,
        clientAddress: invoice.clientAddress,
        clientCity: invoice.clientCity,
        clientState: invoice.clientState,
        clientZip: invoice.clientZip,
        clientNotes: invoice.clientNotes,
        jobTitle: invoice.jobTitle,
        locationName: invoice.locationName,
        city: invoice.city,
        state: invoice.state,
        lineItems,
        subtotal,
        taxRate,
        taxAmount,
        total,
        notes: invoice.notes,
      },
      {
        companyName,
        companyEmail,
        companyPhone,
        companyAddress,
        companyCity,
        companyState,
        companyZip,
        logoAbsoluteUrl: absoluteLogoUrl,
        logoSize,
        logoPosition: logoPos,
      }
    );
  }

  async function handleGmailSend() {
    if (!gmailTo.trim()) {
      toast({ title: "Recipient required", description: "Enter a recipient email address.", variant: "destructive" });
      return;
    }
    setGmailSending(true);
    try {
      const token = await getToken();
      const html = buildInvoiceEmailHtml({
        companyName,
        companyAddress,
        companyCity,
        companyState,
        companyZip,
        companyPhone,
        companyEmail,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        clientName: invoice.clientName ?? undefined,
        lineItems: lineItems.map(li => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice })),
        subtotal,
        taxRate,
        taxAmount,
        total,
        terms: invoice.terms ?? undefined,
        notes: invoice.notes ?? undefined,
        customMessage: gmailMessage.trim() || undefined,
      });
      await sendViaGmail({
        token,
        to: gmailTo.trim(),
        subject: gmailSubject.trim() || `Invoice ${invoice.invoiceNumber}`,
        html,
        text: gmailMessage.trim() || `Please see invoice ${invoice.invoiceNumber}. Total due: $${total.toFixed(2)}`,
      });
      setGmailSent(true);
      toast({ title: "Invoice sent via Gmail", description: `Delivered to ${gmailTo.trim()}` });
      setTimeout(() => {
        setShowGmailCompose(false);
        setGmailSent(false);
      }, 2000);
    } catch (err: any) {
      toast({ title: "Gmail send failed", description: err?.message ?? "An error occurred.", variant: "destructive" });
    } finally {
      setGmailSending(false);
    }
  }

  function handleGmailButtonClick() {
    if (!googleConnected) {
      signIn(() => setShowGmailCompose(true));
    } else {
      setShowGmailCompose(v => !v);
    }
  }

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
          <p className="font-bold text-gray-800 text-sm">{companyName}</p>
        )}
        {companyAddress && <p style={{ textDecoration: "none" }}>{companyAddress}</p>}
        {(companyCity || companyState || companyZip) && (
          <p style={{ textDecoration: "none" }}>
            {[companyCity, companyState, companyZip].filter(Boolean).join(", ")}
          </p>
        )}
        {companyPhone && <p style={{ textDecoration: "none" }}>{companyPhone}</p>}
        {companyEmail && <p style={{ textDecoration: "none" }}>{companyEmail}</p>}
      </div>
    );
  }

  const logoEl = logoUrl ? (
    <img
      src={`${base}${logoUrl}`}
      alt="Logo"
      style={{ height: `${logoPx}px`, width: "auto", maxWidth: `${logoPx * 2.5}px`, objectFit: "contain", display: "block" }}
    />
  ) : (
    <div className="w-12 h-12 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
      <Building2 className="w-6 h-6 text-amber-400" />
    </div>
  );

  const invoiceDetailsEl = (
    <div className="text-right flex-shrink-0">
      <div className="text-3xl font-black tracking-widest text-gray-200 leading-none uppercase">INVOICE</div>
      <div className="text-sm font-bold text-amber-500 mt-1">{invoice.invoiceNumber}</div>
      <div className="mt-3 space-y-0.5 text-xs">
        {invoice.issueDate && (
          <div className="flex justify-end gap-3 text-gray-600">
            <span className="font-semibold text-gray-700">Date:</span>
            <span>{formatDate(invoice.issueDate)}</span>
          </div>
        )}
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
            <button
              onClick={handleGmailButtonClick}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${showGmailCompose ? "bg-red-50 text-red-600" : "text-gray-500 hover:bg-gray-100"}`}
              title={googleConnected ? "Send via Gmail" : "Connect Google to send via Gmail"}
            >
              <Mail className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {googleConnected ? "Gmail" : "Gmail"}
              </span>
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

        {/* Gmail Compose Panel */}
        {showGmailCompose && (
          <div className="bg-blue-50 border-b border-blue-200 px-5 py-4 flex-shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                Send via Gmail
                {googleConnected && (
                  <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                    <Check className="w-2.5 h-2.5" /> Connected
                  </span>
                )}
              </p>
              <button onClick={() => { setShowGmailCompose(false); setGmailSent(false); }}
                className="w-6 h-6 flex items-center justify-center rounded text-blue-400 hover:bg-blue-100 hover:text-blue-600 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {gmailSent ? (
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold">
                <Check className="w-4 h-4" /> Sent successfully!
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">To</label>
                    <input
                      type="email"
                      value={gmailTo}
                      onChange={e => setGmailTo(e.target.value)}
                      placeholder="client@example.com"
                      className="w-full mt-0.5 px-3 py-1.5 border border-blue-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">Subject</label>
                    <input
                      type="text"
                      value={gmailSubject}
                      onChange={e => setGmailSubject(e.target.value)}
                      className="w-full mt-0.5 px-3 py-1.5 border border-blue-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">Message (optional)</label>
                  <textarea
                    value={gmailMessage}
                    onChange={e => setGmailMessage(e.target.value)}
                    rows={2}
                    placeholder="Hi, please find your invoice attached…"
                    className="w-full mt-0.5 px-3 py-1.5 border border-blue-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                  />
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    onClick={handleGmailSend}
                    disabled={gmailSending || !gmailTo.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {gmailSending ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    {gmailSending ? "Sending…" : "Send Invoice"}
                  </button>
                  <p className="text-[10px] text-blue-600">The invoice will be sent from your Gmail account</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Invoice document */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="h-2 bg-gradient-to-r from-amber-400 to-amber-500" />
            <div className="p-8 space-y-6">
              {/* Header */}
              {headerRow}

              {/* Bill To / Work Location */}
              <div className={`grid gap-4 ${workLocation ? "grid-cols-2" : "grid-cols-1"}`}>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-2">Bill To</p>
                  {invoice.clientName ? (
                    <div className="space-y-0.5 text-xs">
                      <p className="font-bold text-gray-900 text-sm">{invoice.clientName}</p>
                      {invoice.clientEmail && (
                        <p className="flex items-center gap-1.5 text-gray-500">
                          <Mail className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                          <span className="break-all">{invoice.clientEmail}</span>
                        </p>
                      )}
                      {invoice.clientPhone && (
                        <p className="flex items-center gap-1.5 text-gray-500">
                          <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          {invoice.clientPhone}
                        </p>
                      )}
                      {(invoice.clientAddress || invoice.clientCity || invoice.clientState || invoice.clientZip) && (
                        <p className="flex items-start gap-1.5 text-gray-500">
                          <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                          {[invoice.clientAddress, invoice.clientCity, invoice.clientState, invoice.clientZip].filter(Boolean).join(", ")}
                        </p>
                      )}
                      {invoice.clientNotes && (
                        <p className="text-gray-400 text-[10px] border-t border-gray-100 pt-1.5 mt-1.5">{invoice.clientNotes}</p>
                      )}
                      {invoice.jobTitle && (
                        <p className="text-gray-400 text-[10px] mt-1">Re: {invoice.jobTitle}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-300 italic">No client specified</p>
                  )}
                </div>

                {workLocation && (
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                    <p className="text-[9px] uppercase tracking-widest font-bold text-amber-400 mb-2 flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5" /> Work Location
                    </p>
                    {invoice.locationName && <p className="font-bold text-gray-900 text-sm">{invoice.locationName}</p>}
                    {(invoice.city || invoice.state) && (
                      <p className="text-xs text-gray-500">{[invoice.city, invoice.state].filter(Boolean).join(", ")}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Line Items */}
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-800">
                    <th className="text-left py-2 font-bold uppercase tracking-wide text-gray-500 text-[10px] w-1/2">Description</th>
                    <th className="text-right py-2 font-bold uppercase tracking-wide text-gray-500 text-[10px]">Qty</th>
                    <th className="text-right py-2 font-bold uppercase tracking-wide text-gray-500 text-[10px]">Unit Price</th>
                    <th className="text-right py-2 font-bold uppercase tracking-wide text-gray-500 text-[10px]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.length > 0 ? lineItems.map((li, i) => (
                    <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                      <td className="py-2.5 pr-4 text-gray-800">{li.description}</td>
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
        {/* Close button footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-gray-200 bg-white print-hide">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
