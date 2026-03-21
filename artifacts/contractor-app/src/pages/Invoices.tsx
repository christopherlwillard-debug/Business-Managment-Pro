import { useState, useRef } from "react";
import {
  useListInvoices,
  useGetInvoiceTaxReport,
  useCreateInvoice,
  useCreateClient,
  useListClients,
  useListJobs,
  useUpdateInvoiceStatus,
  useDeleteInvoice,
  useGetSettings,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import {
  FileText, Download, Plus, Trash2, X,
  Building2, MapPin, Check, Eye, AlertTriangle, Printer,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface LineItem { description: string; quantity: number; unitPrice: number; }
function emptyLine(): LineItem { return { description: "", quantity: 1, unitPrice: 0 }; }

const STATUS_COLORS: Record<string, string> = {
  paid:      "bg-emerald-100 text-emerald-700",
  sent:      "bg-blue-100 text-blue-700",
  overdue:   "bg-red-100 text-red-700",
  draft:     "bg-gray-100 text-gray-600",
  cancelled: "bg-orange-100 text-orange-700",
};

// ─── Invoice Builder (document-style form) ─────────────────────────────────────
function InvoiceBuilder({
  form, setField, lineItems, setLineItems,
  clients, jobs, settings, previewNumber,
  submitting, formError, onSubmit, onCancel,
  isNewClient, setIsNewClient, clientInput, setClientInput,
}: {
  form: any; setField: (k: string, v: string) => void;
  lineItems: LineItem[]; setLineItems: React.Dispatch<React.SetStateAction<LineItem[]>>;
  clients: any[]; jobs: any[]; settings: any; previewNumber: string;
  submitting: boolean; formError: string;
  onSubmit: (e: React.FormEvent) => void; onCancel: () => void;
  isNewClient: boolean; setIsNewClient: (v: boolean) => void;
  clientInput: string; setClientInput: (v: string) => void;
}) {
  const [showClientDrop, setShowClientDrop] = useState(false);
  const clientRef = useRef<HTMLInputElement>(null);

  const s = settings ?? {};
  const companyName    = s.companyName    || "";
  const companyEmail   = s.companyEmail   || "";
  const companyPhone   = s.companyPhone   || "";
  const companyAddress = s.companyAddress || "";
  const companyCity    = s.companyCity    || "";
  const companyState   = s.companyState   || "";
  const companyZip     = s.companyZip     || "";
  const logoUrl: string | null = s.logoUrl ?? null;
  const logoSize: string       = s.invoiceLogoSize ?? "medium";
  const logoPx = logoSize === "small" ? 48 : logoSize === "large" ? 100 : 68;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const subtotal  = lineItems.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const taxRate   = parseFloat(form.taxRate) || 0;
  const taxAmount = subtotal * taxRate / 100;
  const total     = subtotal + taxAmount;

  const suggestions = clientInput.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(clientInput.toLowerCase()))
    : clients;
  const hasExact = clients.some(c => c.name.toLowerCase() === clientInput.toLowerCase());

  const selectedClient = clients.find(c => String(c.id) === form.clientId);
  const filteredJobs = form.clientId
    ? jobs.filter(j => String(j.clientId) === form.clientId)
    : jobs;

  function setLine(i: number, k: keyof LineItem, v: string) {
    setLineItems(ls =>
      ls.map((l, idx) => idx === i ? { ...l, [k]: k === "description" ? v : parseFloat(v) || 0 } : l)
    );
  }
  function addLine() { setLineItems(ls => [...ls, emptyLine()]); }
  function removeLine(i: number) {
    if (lineItems.length > 1) setLineItems(ls => ls.filter((_, idx) => idx !== i));
  }

  // Transparent-until-focused input — blends into the invoice design
  const docInput = "bg-transparent border-0 border-b border-transparent focus:border-amber-400 focus:outline-none focus:bg-amber-50/40 rounded-none transition-colors text-inherit font-inherit w-full placeholder-gray-300 px-0.5";
  const docSelect = "bg-transparent border-0 border-b border-transparent focus:border-amber-400 focus:outline-none focus:bg-amber-50/40 rounded-none transition-colors text-inherit font-inherit cursor-pointer px-0.5";

  return (
    <form onSubmit={onSubmit} className="flex flex-col h-full">

      {/* Action bar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-3 border-b border-gray-100 bg-white flex-shrink-0">
        <h2 className="text-lg font-bold text-gray-900">New Invoice</h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm bg-amber-500 text-white hover:bg-amber-600 shadow transition-all active:scale-95 disabled:opacity-60">
            {submitting ? "Saving…" : <><Check className="w-4 h-4" /> Save Invoice</>}
          </button>
        </div>
      </div>

      {formError && (
        <div className="mx-6 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2 flex-shrink-0">
          <X className="w-4 h-4 flex-shrink-0" /> {formError}
        </div>
      )}

      {/* Invoice document */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-100">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">

          {/* Top color bar */}
          <div className="h-2 bg-gradient-to-r from-amber-500 to-amber-400" />

          <div className="p-8 space-y-7">

            {/* ── Company header (auto from Settings) ── */}
            <div className="flex justify-between items-start gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  {logoUrl ? (
                    <img
                      src={`${base}${logoUrl}`}
                      alt="Logo"
                      style={{ width: logoPx, height: logoPx, objectFit: "contain" }}
                      className="flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-amber-500" />
                    </div>
                  )}
                  <div>
                    <p className="text-xl font-extrabold text-gray-900 leading-tight">
                      {companyName || <span className="text-gray-300 italic font-normal text-base">Your Company Name (set in Settings)</span>}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-gray-400 space-y-0.5 ml-0.5">
                  {companyAddress && <p>{companyAddress}</p>}
                  {(companyCity || companyState || companyZip) && (
                    <p>{[companyCity, companyState, companyZip].filter(Boolean).join(", ")}</p>
                  )}
                  {companyPhone && <p>{companyPhone}</p>}
                  {companyEmail && <p>{companyEmail}</p>}
                  {!companyAddress && !companyPhone && !companyEmail && (
                    <p className="italic text-gray-300">Add contact info in Settings → Business Profile</p>
                  )}
                </div>
              </div>

              {/* Invoice number + dates */}
              <div className="text-right space-y-1.5 min-w-[180px]">
                <div>
                  <p className="text-3xl font-black tracking-widest text-gray-200 uppercase">Invoice</p>
                  <p className="text-sm font-bold text-amber-600 -mt-1">{previewNumber}</p>
                </div>
                <table className="text-xs ml-auto text-right">
                  <tbody>
                    <tr>
                      <td className="text-gray-400 pr-2 py-0.5 whitespace-nowrap font-semibold">Date</td>
                      <td>
                        <input type="date" className={docInput + " text-gray-700 text-xs"} required
                          value={form.issueDate} onChange={e => setField("issueDate", e.target.value)} />
                      </td>
                    </tr>
                    <tr>
                      <td className="text-gray-400 pr-2 py-0.5 whitespace-nowrap font-semibold">Due</td>
                      <td>
                        <input type="date" className={docInput + " text-gray-700 text-xs"}
                          value={form.dueDate} onChange={e => setField("dueDate", e.target.value)} />
                      </td>
                    </tr>
                    <tr>
                      <td className="text-gray-400 pr-2 py-0.5 whitespace-nowrap font-semibold">Terms</td>
                      <td>
                        <select className={docSelect + " text-gray-700 text-xs"}
                          value={form.terms} onChange={e => setField("terms", e.target.value)}>
                          <option>Due on receipt</option>
                          <option>Net 15</option>
                          <option>Net 30</option>
                          <option>Net 60</option>
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td className="text-gray-400 pr-2 py-0.5 whitespace-nowrap font-semibold">Status</td>
                      <td>
                        <select className={docSelect + " text-xs font-semibold text-gray-700"}
                          value={form.status} onChange={e => setField("status", e.target.value)}>
                          <option value="draft">Draft</option>
                          <option value="sent">Sent</option>
                          <option value="paid">Paid</option>
                          <option value="overdue">Overdue</option>
                        </select>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Bill To ── */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Bill To</p>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <div className="relative">
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Client</label>
                    <input
                      ref={clientRef}
                      type="text"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-300"
                      placeholder="Search or add new client…"
                      value={clientInput}
                      onChange={e => {
                        setClientInput(e.target.value);
                        setShowClientDrop(true);
                        setIsNewClient(false);
                        setField("clientId", "");
                      }}
                      onFocus={() => setShowClientDrop(true)}
                      onBlur={() => setTimeout(() => setShowClientDrop(false), 150)}
                    />
                    {isNewClient && (
                      <span className="absolute right-3 top-[calc(100%-1.8rem)] -translate-y-1/2 text-[9px] font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded-full">NEW</span>
                    )}
                    {showClientDrop && (
                      <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                        {suggestions.length === 0 && !clientInput.trim() && (
                          <p className="px-3 py-2.5 text-xs text-gray-400">No clients yet</p>
                        )}
                        {suggestions.map(c => (
                          <button key={c.id} type="button"
                            onMouseDown={() => {
                              setClientInput(c.name);
                              setField("clientId", String(c.id));
                              setField("jobId", "");
                              setIsNewClient(false);
                              setShowClientDrop(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 border-b border-gray-50 last:border-0">
                            {c.name}
                          </button>
                        ))}
                        {clientInput.trim() && !hasExact && (
                          <button type="button"
                            onMouseDown={() => {
                              setIsNewClient(true);
                              setField("clientId", "");
                              setField("jobId", "");
                              setShowClientDrop(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 flex items-center gap-2 border-t border-gray-100">
                            <Plus className="w-3.5 h-3.5" /> Create "{clientInput}"
                          </button>
                        )}
                      </div>
                    )}
                    {isNewClient && (
                      <p className="text-[11px] text-amber-600 mt-1">New client will be created on save.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Job (optional)</label>
                    <select
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      value={form.jobId} onChange={e => setField("jobId", e.target.value)}>
                      <option value="">No specific job</option>
                      {filteredJobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Work location */}
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Work Location
                  <span className="font-normal text-gray-300">(KY tax)</span>
                </p>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">City</label>
                    <input type="text" placeholder="e.g. Louisville"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-300"
                      value={form.city} onChange={e => setField("city", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">State</label>
                    <input type="text" placeholder="KY" maxLength={2}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-300 uppercase"
                      value={form.state} onChange={e => setField("state", e.target.value.toUpperCase())} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Line items ── */}
            <div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-800">
                    <th className="text-left pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-[46%]">Description</th>
                    <th className="text-right pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-[12%]">Qty</th>
                    <th className="text-right pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-[20%]">Unit Price</th>
                    <th className="text-right pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-[18%]">Total</th>
                    <th className="w-[4%]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lineItems.map((l, i) => (
                    <tr key={i} className="group hover:bg-amber-50/30 transition-colors">
                      <td className="py-2 pr-2">
                        <input type="text" className={docInput + " text-gray-800"} placeholder="Service or item description…"
                          value={l.description} onChange={e => setLine(i, "description", e.target.value)} />
                      </td>
                      <td className="py-2 pl-2">
                        <input type="number" min="0" step="0.01" className={docInput + " text-right text-gray-700"}
                          value={l.quantity} onChange={e => setLine(i, "quantity", e.target.value)} />
                      </td>
                      <td className="py-2 pl-2">
                        <input type="number" min="0" step="0.01" className={docInput + " text-right text-gray-700"}
                          placeholder="0.00" value={l.unitPrice || ""}
                          onChange={e => setLine(i, "unitPrice", e.target.value)} />
                      </td>
                      <td className="py-2 pl-2 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {formatCurrency(l.quantity * l.unitPrice)}
                      </td>
                      <td className="py-2 pl-1 text-center">
                        {lineItems.length > 1 && (
                          <button type="button" onClick={() => removeLine(i)}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" onClick={addLine}
                className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 font-semibold hover:text-amber-700 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add line item
              </button>
            </div>

            {/* ── Totals ── */}
            <div className="flex justify-end">
              <div className="w-56 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-500 items-center">
                  <span className="flex items-center gap-1">
                    Tax
                    <input type="number" min="0" step="0.01" className="w-12 text-center text-xs border border-gray-200 rounded-md px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                      placeholder="0%" value={form.taxRate} onChange={e => setField("taxRate", e.target.value)} />
                    %
                  </span>
                  <span>{formatCurrency(taxAmount)}</span>
                </div>
                <div className="flex justify-between font-extrabold text-base text-gray-900 border-t-2 border-gray-800 pt-2">
                  <span>Total Due</span>
                  <span className="text-amber-600">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            {/* ── Notes ── */}
            <div className="border-t border-gray-100 pt-5">
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Notes</p>
              <textarea
                className="w-full text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent placeholder-gray-300 leading-relaxed"
                rows={3}
                placeholder="Payment instructions, thank-you note, warranty info…"
                value={form.notes}
                onChange={e => setField("notes", e.target.value)}
              />
            </div>

          </div>
          <div className="h-1.5 bg-gradient-to-r from-amber-400 to-amber-500" />
        </div>
      </div>
    </form>
  );
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────
function DeleteConfirmModal({
  invoice, onConfirm, onCancel, deleting,
}: {
  invoice: any; onConfirm: () => void; onCancel: () => void; deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-red-100 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-base">Permanently delete invoice?</h3>
            <p className="text-sm text-gray-500 mt-1">
              <span className="font-semibold text-gray-700">{invoice.invoiceNumber}</span>
              {invoice.clientName ? ` · ${invoice.clientName}` : ""} will be{" "}
              <span className="font-semibold text-red-600">permanently deleted</span> and cannot be recovered.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} disabled={deleting}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="px-5 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow disabled:opacity-60 flex items-center gap-2">
            <Trash2 className="w-3.5 h-3.5" />
            {deleting ? "Deleting…" : "Yes, Delete Permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice View Modal ───────────────────────────────────────────────────────
function InvoiceViewModal({
  invoice, settings, onClose, onDelete,
}: {
  invoice: any; settings: any; onClose: () => void; onDelete: () => void;
}) {
  const s = settings ?? {};
  const companyName    = s.companyName    || "";
  const companyEmail   = s.companyEmail   || "";
  const companyPhone   = s.companyPhone   || "";
  const companyAddress = s.companyAddress || "";
  const companyCity    = s.companyCity    || "";
  const companyState   = s.companyState   || "";
  const companyZip     = s.companyZip     || "";
  const logoUrl: string | null = s.logoUrl ?? null;
  const logoSize: string       = s.invoiceLogoSize ?? "medium";
  const logoPx = logoSize === "small" ? 48 : logoSize === "large" ? 100 : 68;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const lineItems: any[] = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  const subtotal  = invoice.subtotal  ?? lineItems.reduce((a: number, l: any) => a + l.quantity * l.unitPrice, 0);
  const taxRate   = invoice.taxRate   ?? 0;
  const taxAmount = invoice.taxAmount ?? 0;
  const total     = invoice.total     ?? subtotal + taxAmount;

  function handlePrint() { window.print(); }

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
            <button onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Invoice document */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden text-[12.5px] text-gray-900">
            <div className="h-2 bg-gradient-to-r from-amber-500 to-amber-400" />
            <div className="p-8 space-y-6">

              {/* Company header */}
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {logoUrl ? (
                      <img src={`${base}${logoUrl}`} alt="Logo"
                        style={{ width: logoPx, height: logoPx, objectFit: "contain" }} />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-amber-500" />
                      </div>
                    )}
                    <p className="text-xl font-extrabold text-gray-900">{companyName || "Your Company"}</p>
                  </div>
                  <div className="text-xs text-gray-400 space-y-0.5 ml-0.5">
                    {companyAddress && <p>{companyAddress}</p>}
                    {(companyCity || companyState) && (
                      <p>{[companyCity, companyState, companyZip].filter(Boolean).join(", ")}</p>
                    )}
                    {companyPhone && <p>{companyPhone}</p>}
                    {companyEmail && <p>{companyEmail}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black tracking-widest text-gray-200 uppercase">Invoice</p>
                  <p className="text-sm font-bold text-amber-600 -mt-1">{invoice.invoiceNumber}</p>
                  <div className="mt-2 space-y-0.5 text-xs">
                    <div className="flex justify-end gap-2 text-gray-500">
                      <span className="font-semibold text-gray-600">Date:</span>
                      <span>{formatDate(invoice.issueDate)}</span>
                    </div>
                    {invoice.dueDate && (
                      <div className="flex justify-end gap-2 text-gray-500">
                        <span className="font-semibold text-gray-600">Due:</span>
                        <span>{formatDate(invoice.dueDate)}</span>
                      </div>
                    )}
                    {invoice.terms && (
                      <div className="flex justify-end gap-2 text-gray-500">
                        <span className="font-semibold text-gray-600">Terms:</span>
                        <span>{invoice.terms}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bill To + Location */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-2">Bill To</p>
                  {invoice.clientName
                    ? <p className="font-semibold text-gray-900 text-sm">{invoice.clientName}</p>
                    : <p className="text-gray-300 italic text-xs">No client specified</p>}
                  {invoice.jobTitle && <p className="text-xs text-gray-500 mt-0.5">Re: {invoice.jobTitle}</p>}
                </div>
                {(invoice.city || invoice.state) && (
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                    <p className="text-[9px] uppercase tracking-widest font-bold text-amber-400 mb-2 flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5" /> Work Location
                    </p>
                    <p className="font-semibold text-gray-800 text-sm">
                      {[invoice.city, invoice.state].filter(Boolean).join(", ")}
                    </p>
                  </div>
                )}
              </div>

              {/* Line items */}
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-gray-800">
                    <th className="text-left pb-2 font-bold uppercase tracking-wide text-gray-500 w-[50%]">Description</th>
                    <th className="text-right pb-2 font-bold uppercase tracking-wide text-gray-500 w-[12%]">Qty</th>
                    <th className="text-right pb-2 font-bold uppercase tracking-wide text-gray-500 w-[19%]">Unit Price</th>
                    <th className="text-right pb-2 font-bold uppercase tracking-wide text-gray-500 w-[19%]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lineItems.length > 0 ? lineItems.map((li: any, i: number) => (
                    <tr key={i} className={i % 2 === 0 ? "" : "bg-gray-50/60"}>
                      <td className="py-2 pr-3 text-gray-800">{li.description}</td>
                      <td className="py-2 text-right text-gray-500">{li.quantity}</td>
                      <td className="py-2 text-right text-gray-500">{formatCurrency(li.unitPrice)}</td>
                      <td className="py-2 text-right font-semibold text-gray-900">{formatCurrency(li.quantity * li.unitPrice)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="py-4 text-center text-gray-300 italic">No line items</td></tr>
                  )}
                </tbody>
              </table>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-52 space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                  </div>
                  {taxRate > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>Tax ({taxRate}%)</span><span>{formatCurrency(taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-extrabold text-sm text-gray-900 border-t-2 border-gray-800 pt-2">
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
            </div>
            <div className="h-1.5 bg-gradient-to-r from-amber-400 to-amber-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Invoices page ────────────────────────────────────────────────────────
export default function Invoices() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"all" | "tax">("all");
  const [open, setOpen] = useState(false);

  const { data: invoices, isLoading: loadingInvoices } = useListInvoices();
  const { data: taxReport, isLoading: loadingTax }     = useGetInvoiceTaxReport();
  const { data: clients = [] }  = useListClients();
  const { data: jobs = [] }     = useListJobs();
  const { data: settings }      = useGetSettings();
  const createInvoice           = useCreateInvoice();
  const createClientMutation    = useCreateClient();
  const updateStatus            = useUpdateInvoiceStatus();
  const deleteInvoice           = useDeleteInvoice();

  const [form, setFormState] = useState({
    clientId: "", jobId: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: "", status: "draft", taxRate: "",
    city: "", state: "KY", notes: "", terms: "Net 30",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState("");
  const [isNewClient, setIsNewClient] = useState(false);
  const [clientInput, setClientInput] = useState("");
  const [viewInvoice,  setViewInvoice]  = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  const s = settings as any;
  const prefix        = s?.invoicePrefix     ?? "INV-2026-";
  const nextNum       = s?.invoiceNextNumber ?? 1001;
  const previewNumber = `${prefix}${nextNum}`;

  function setField(k: string, v: string) {
    setFormState(f => ({ ...f, [k]: v }));
  }

  function resetForm() {
    setFormState({
      clientId: "", jobId: "",
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: "", status: "draft", taxRate: "",
      city: "", state: "KY", notes: "", terms: "Net 30",
    });
    setLineItems([emptyLine()]);
    setFormError("");
    setClientInput("");
    setIsNewClient(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lineItems.some(l => l.description.trim())) {
      setFormError("Add at least one line item with a description.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      let resolvedClientId = form.clientId ? parseInt(form.clientId) : undefined;
      if (isNewClient && clientInput.trim()) {
        const nc = await createClientMutation.mutateAsync({ data: { name: clientInput.trim() } });
        resolvedClientId = (nc as any).id;
        queryClient.invalidateQueries({ queryKey: ["listClients"] });
      }
      await createInvoice.mutateAsync({
        data: {
          clientId:  resolvedClientId,
          jobId:     form.jobId    ? parseInt(form.jobId)    : undefined,
          issueDate: form.issueDate,
          dueDate:   form.dueDate  || undefined,
          status:    form.status   as any,
          taxRate:   form.taxRate  ? parseFloat(form.taxRate) : undefined,
          city:      form.city     || undefined,
          state:     form.state    || undefined,
          notes:     form.notes    || undefined,
          terms:     form.terms    || undefined,
          lineItems: lineItems
            .filter(l => l.description.trim())
            .map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
        },
      });
      queryClient.invalidateQueries();
      resetForm();
      setOpen(false);
    } catch {
      setFormError("Failed to create invoice. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id: number, status: string) {
    await updateStatus.mutateAsync({ id, data: { status: status as any } });
    queryClient.invalidateQueries();
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteInvoice.mutateAsync({ id: deleteTarget.id });
      queryClient.invalidateQueries();
      if (viewInvoice?.id === deleteTarget.id) setViewInvoice(null);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Invoices & Reports</h1>
          <p className="text-muted-foreground mt-1">Manage billing and local tax operating records.</p>
        </div>
        <div className="flex gap-3">
          {activeTab === "tax" && (
            <button className="flex items-center px-4 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </button>
          )}
          <button
            onClick={() => { resetForm(); setOpen(true); }}
            className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95"
          >
            <Plus className="w-5 h-5 mr-2" /> New Invoice
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-muted/50 rounded-xl w-fit border border-border/50">
        {(["all", "tax"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t === "all" ? "All Invoices" : "Tax Report (By City)"}
          </button>
        ))}
      </div>

      {/* Invoice list / tax table */}
      <Card className="border-border/50 shadow-md overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
              {activeTab === "all" ? (
                <tr>
                  <th className="px-6 py-4">Invoice #</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Client / Job</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-center">Actions</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-6 py-4">Invoice #</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Location</th>
                  <th className="px-6 py-4 text-right">Subtotal</th>
                  <th className="px-6 py-4 text-right">Tax</th>
                  <th className="px-6 py-4 text-right">Total</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-border/50">
              {activeTab === "all" ? (
                loadingInvoices ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading invoices…</td></tr>
                ) : !(invoices as any[])?.length ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />No invoices yet
                  </td></tr>
                ) : (
                  (invoices as any[]).map((inv: any) => (
                    <tr key={inv.id}
                      onClick={() => setViewInvoice(inv)}
                      className="hover:bg-muted/30 transition-colors cursor-pointer group">
                      <td className="px-6 py-4 font-medium text-foreground group-hover:text-primary transition-colors">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(inv.issueDate)}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{inv.clientName || "—"}</div>
                        <div className="text-xs text-muted-foreground">{inv.jobTitle || "—"}</div>
                      </td>
                      <td className="px-6 py-4 text-right font-display font-semibold text-foreground">{formatCurrency(inv.total)}</td>
                      <td className="px-6 py-4 text-center" onClick={e => e.stopPropagation()}>
                        <select
                          value={inv.status}
                          onChange={e => handleStatusChange(inv.id, e.target.value)}
                          className={`inline-flex px-2 py-1 rounded-md text-xs font-semibold tracking-wide uppercase border-0 cursor-pointer ${STATUS_COLORS[inv.status] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {["draft","sent","paid","overdue","cancelled"].map(st => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => setViewInvoice(inv)}
                            className="text-muted-foreground hover:text-primary transition-colors" title="View invoice">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => setDeleteTarget(inv)}
                            className="text-muted-foreground hover:text-destructive transition-colors" title="Delete invoice">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )
              ) : loadingTax ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading…</td></tr>
              ) : !(taxReport as any[])?.length ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />No invoices yet
                </td></tr>
              ) : (
                (taxReport as any[]).map((row: any) => (
                  <tr key={row.invoiceNumber} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium">{row.invoiceNumber}</td>
                    <td className="px-6 py-4 text-muted-foreground">{formatDate(row.issueDate)}</td>
                    <td className="px-6 py-4 font-medium text-primary">
                      {row.city ? `${row.city}, ${row.state || ""}` : "Unspecified"}
                    </td>
                    <td className="px-6 py-4 text-right">{formatCurrency(row.subtotal)}</td>
                    <td className="px-6 py-4 text-right text-muted-foreground">{formatCurrency(row.taxAmount)}</td>
                    <td className="px-6 py-4 text-right font-bold">{formatCurrency(row.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Invoice Builder Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !submitting && setOpen(false)} />
          <div className="relative w-full max-w-3xl bg-white shadow-2xl rounded-2xl flex flex-col"
            style={{ height: "min(92vh, 820px)" }}>
            <InvoiceBuilder
              form={form} setField={setField}
              lineItems={lineItems} setLineItems={setLineItems}
              clients={clients as any[]} jobs={jobs as any[]}
              settings={settings}
              previewNumber={previewNumber}
              submitting={submitting} formError={formError}
              onSubmit={handleSubmit}
              onCancel={() => !submitting && setOpen(false)}
              isNewClient={isNewClient} setIsNewClient={setIsNewClient}
              clientInput={clientInput} setClientInput={setClientInput}
            />
          </div>
        </div>
      )}

      {/* Invoice View Modal */}
      {viewInvoice && (
        <InvoiceViewModal
          invoice={viewInvoice}
          settings={settings}
          onClose={() => setViewInvoice(null)}
          onDelete={() => {
            setDeleteTarget(viewInvoice);
            setViewInvoice(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          invoice={deleteTarget}
          deleting={deleting}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
