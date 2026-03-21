import { useState, useRef, useEffect } from "react";
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
  FileText, Download, Plus, Trash2, X, Building2,
  MapPin, ChevronDown, Check, PenLine,
} from "lucide-react";

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

function emptyLine(): LineItem {
  return { description: "", quantity: 1, unitPrice: 0 };
}

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  sent: "bg-blue-100 text-blue-700",
  overdue: "bg-red-100 text-red-700",
  draft: "bg-gray-100 text-gray-600",
  cancelled: "bg-orange-100 text-orange-700",
};

// ─── Editable section wrapper ─────────────────────────────────────────────────
function EditZone({
  children,
  hint,
  active,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  hint: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative group cursor-pointer transition-all rounded-lg ${
        active
          ? "ring-2 ring-amber-400 ring-offset-1"
          : "hover:ring-2 hover:ring-amber-200 hover:ring-offset-1"
      } ${className}`}
      title={hint}
    >
      {children}
      {!active && (
        <span className="absolute -top-2.5 -right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full pointer-events-none whitespace-nowrap z-10">
          <PenLine className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />
          {hint}
        </span>
      )}
    </div>
  );
}

// ─── Inline popover panel ─────────────────────────────────────────────────────
function InlinePanel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="absolute z-30 top-full mt-2 left-0 bg-white border border-gray-200 rounded-xl shadow-2xl p-4 min-w-[260px] text-gray-900"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

// ─── Invoice builder / preview (combined) ─────────────────────────────────────
function InvoiceBuilder({
  form,
  setField,
  lineItems,
  setLineItems,
  clients,
  jobs,
  settings,
  previewNumber,
  submitting,
  formError,
  onSubmit,
  onCancel,
  isNewClient,
  setIsNewClient,
  clientInput,
  setClientInput,
}: {
  form: any;
  setField: (k: string, v: string) => void;
  lineItems: LineItem[];
  setLineItems: React.Dispatch<React.SetStateAction<LineItem[]>>;
  clients: any[];
  jobs: any[];
  settings: any;
  previewNumber: string;
  submitting: boolean;
  formError: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isNewClient: boolean;
  setIsNewClient: (v: boolean) => void;
  clientInput: string;
  setClientInput: (v: string) => void;
}) {
  const s = settings as any;
  const companyName = s?.companyName || "Your LLC Name";
  const companyEmail = s?.companyEmail || "";
  const companyPhone = s?.companyPhone || "";
  const companyAddress = s?.companyAddress || "";
  const companyCity = s?.companyCity || "";
  const companyState = s?.companyState || "KY";
  const companyZip = s?.companyZip || "";
  const logoUrl: string | null = s?.logoUrl ?? null;
  const logoPosition: string = s?.invoiceLogoPosition ?? "top-left";
  const logoSize: string = s?.invoiceLogoSize ?? "medium";
  const logoPx = logoSize === "small" ? 48 : logoSize === "large" ? 104 : 72;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const [editing, setEditing] = useState<string | null>(null);
  const [showClientDrop, setShowClientDrop] = useState(false);
  const clientSearchRef = useRef<HTMLInputElement>(null);
  // clientInput and isNewClient come from parent props

  const subtotal = lineItems.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxRate = parseFloat(form.taxRate) || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const selectedClient = clients.find((c: any) => String(c.id) === form.clientId);
  const selectedJob = jobs.find((j: any) => String(j.id) === form.jobId);
  const filteredJobs = form.clientId
    ? jobs.filter((j: any) => String(j.clientId) === form.clientId)
    : jobs;
  const clientSuggestions = clientInput.trim()
    ? clients.filter((c: any) => c.name.toLowerCase().includes(clientInput.toLowerCase()))
    : clients;
  const hasExactMatch = clients.some((c: any) => c.name.toLowerCase() === clientInput.toLowerCase());
  const clientName = isNewClient ? clientInput : (selectedClient?.name ?? "");
  const jobTitle = selectedJob?.title ?? "";

  function toggle(section: string) {
    setEditing((e) => (e === section ? null : section));
    if (section === "billing") {
      setTimeout(() => clientSearchRef.current?.focus(), 50);
    }
  }

  function setLine(i: number, k: keyof LineItem, v: string) {
    setLineItems((ls) =>
      ls.map((l, idx) =>
        idx === i ? { ...l, [k]: k === "description" ? v : parseFloat(v) || 0 } : l
      )
    );
  }

  function addLine() {
    setLineItems((ls) => [...ls, emptyLine()]);
  }

  function removeLine(i: number) {
    if (lineItems.length > 1) setLineItems((ls) => ls.filter((_, idx) => idx !== i));
  }

  const inp = "w-full px-2 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent";
  const lbl = "block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1";

  const LogoImg = logoUrl ? (
    <img src={`${base}${logoUrl}`} alt="Logo" style={{ width: logoPx, height: logoPx, objectFit: "contain" }} />
  ) : (
    <div className="flex items-center gap-2">
      <Building2 className="w-5 h-5 text-amber-500" />
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col h-full">
      {/* ── Modal header bar ── */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0 bg-white rounded-t-2xl sm:rounded-t-2xl">
        <div>
          <h2 className="text-xl font-display font-bold text-gray-900">New Invoice</h2>
          <p className="text-xs text-gray-400 mt-0.5">Click any section on the invoice to fill it in</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm bg-amber-500 text-white hover:bg-amber-600 shadow-md transition-all active:scale-95 disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save Invoice"}
          </button>
        </div>
      </div>

      {formError && (
        <div className="mx-6 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex-shrink-0">
          {formError}
        </div>
      )}

      {/* ── Invoice document (scrollable) ── */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-100">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-visible text-gray-900 text-[13px] font-sans w-full max-w-3xl mx-auto">
          <div className="h-2 bg-gradient-to-r from-amber-500 to-amber-400 rounded-t-2xl" />

          <div className="px-8 py-7 space-y-6">

            {/* ── TOP: Company | Invoice # block ── */}
            <div className="flex justify-between items-start gap-4">
              {/* Company info (from settings — not editable here) */}
              <div className="flex-1">
                {logoPosition === "top-left" ? (
                  <div className="flex items-center gap-2 mb-1">
                    {LogoImg}
                    <span className="text-xl font-bold text-gray-900 tracking-tight">{companyName}</span>
                  </div>
                ) : (
                  <span className="text-xl font-bold text-gray-900 tracking-tight block mb-1">{companyName}</span>
                )}
                {companyAddress && (
                  <p className="text-xs text-gray-400">
                    {companyAddress}<br />
                    {[companyCity, companyState, companyZip].filter(Boolean).join(", ")}
                  </p>
                )}
                {companyEmail && <p className="text-xs text-gray-400">{companyEmail}</p>}
                {companyPhone && <p className="text-xs text-gray-400">{companyPhone}</p>}
                {!companyAddress && !companyEmail && !companyPhone && (
                  <p className="text-xs text-gray-300 italic">Configure in Settings → Business Profile</p>
                )}
              </div>

              {/* Invoice # / Dates (click to edit) */}
              <div className="relative text-right flex-shrink-0">
                <EditZone
                  hint="Edit dates & terms"
                  active={editing === "header"}
                  onClick={() => toggle("header")}
                  className="p-2 -m-2"
                >
                  <p className="text-3xl font-extrabold tracking-widest text-gray-200 uppercase">Invoice</p>
                  <p className="text-sm font-bold text-amber-600 mt-1">{previewNumber}</p>
                  <div className="mt-2 space-y-0.5 text-xs text-gray-400">
                    <p>
                      <span className="font-semibold text-gray-600">Date: </span>
                      {form.issueDate ? formatDate(form.issueDate) : <span className="text-gray-300 italic">Set date</span>}
                    </p>
                    <p>
                      <span className="font-semibold text-gray-600">Due: </span>
                      {form.dueDate ? formatDate(form.dueDate) : <span className="text-gray-300 italic">Set due date</span>}
                    </p>
                    <p>
                      <span className="font-semibold text-gray-600">Terms: </span>
                      {form.terms || <span className="text-gray-300 italic">Set terms</span>}
                    </p>
                  </div>
                </EditZone>

                {editing === "header" && (
                  <InlinePanel onClose={() => setEditing(null)}>
                    <p className={lbl}>Invoice Dates & Terms</p>
                    <div className="space-y-2.5 mt-1">
                      <div>
                        <label className={lbl}>Issue Date</label>
                        <input type="date" className={inp} value={form.issueDate} onChange={(e) => setField("issueDate", e.target.value)} required />
                      </div>
                      <div>
                        <label className={lbl}>Due Date</label>
                        <input type="date" className={inp} value={form.dueDate} onChange={(e) => setField("dueDate", e.target.value)} />
                      </div>
                      <div>
                        <label className={lbl}>Payment Terms</label>
                        <select className={inp} value={form.terms} onChange={(e) => setField("terms", e.target.value)}>
                          <option>Due on receipt</option>
                          <option>Net 15</option>
                          <option>Net 30</option>
                          <option>Net 60</option>
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Status</label>
                        <select className={inp} value={form.status} onChange={(e) => setField("status", e.target.value)}>
                          <option value="draft">Draft</option>
                          <option value="sent">Sent</option>
                          <option value="paid">Paid</option>
                          <option value="overdue">Overdue</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="w-full py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors"
                      >
                        <Check className="w-3 h-3 inline mr-1" /> Done
                      </button>
                    </div>
                  </InlinePanel>
                )}
              </div>
            </div>

            {/* ── Bill To + Status row ── */}
            <div className="grid grid-cols-2 gap-4">
              {/* Bill To (click to edit) */}
              <div className="relative">
                <EditZone
                  hint="Select client & job"
                  active={editing === "billing"}
                  onClick={() => toggle("billing")}
                  className="bg-gray-50 rounded-xl p-4 border border-gray-100 h-full"
                >
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Bill To</p>
                  {clientName ? (
                    <p className="font-semibold text-gray-900">{clientName}</p>
                  ) : (
                    <p className="text-gray-300 italic text-xs">Click to select a client</p>
                  )}
                  {jobTitle && <p className="text-xs text-gray-500 mt-1">Re: {jobTitle}</p>}
                  {isNewClient && <span className="mt-1 inline-flex text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">NEW CLIENT</span>}
                </EditZone>

                {editing === "billing" && (
                  <InlinePanel onClose={() => setEditing(null)}>
                    <p className={lbl}>Client</p>
                    <div className="relative mb-2.5">
                      <input
                        ref={clientSearchRef}
                        type="text"
                        placeholder="Type to search or add..."
                        className={inp + (isNewClient ? " border-amber-400 bg-amber-50 text-amber-700" : "")}
                        value={clientInput}
                        onChange={(e) => {
                          setClientInput(e.target.value);
                          setShowClientDrop(true);
                          setIsNewClient(false);
                          setField("clientId", "");
                        }}
                        onFocus={() => setShowClientDrop(true)}
                      />
                      {isNewClient && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">NEW</span>
                      )}
                      {showClientDrop && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                          {clientSuggestions.length === 0 && !clientInput.trim() && (
                            <p className="px-3 py-2 text-xs text-gray-400">No clients yet — type a name to add</p>
                          )}
                          {clientSuggestions.map((c: any) => (
                            <button
                              key={c.id}
                              type="button"
                              onMouseDown={() => {
                                setClientInput(c.name);
                                setField("clientId", String(c.id));
                                setField("jobId", "");
                                setIsNewClient(false);
                                setShowClientDrop(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors"
                            >
                              {c.name}
                            </button>
                          ))}
                          {clientInput.trim() && !hasExactMatch && (
                            <button
                              type="button"
                              onMouseDown={() => {
                                setIsNewClient(true);
                                setField("clientId", "");
                                setField("jobId", "");
                                setShowClientDrop(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors flex items-center gap-1 border-t border-gray-100"
                            >
                              <Plus className="w-3 h-3" /> Create "{clientInput}"
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <label className={lbl}>Link to Job</label>
                    <select
                      className={inp + " mb-2.5"}
                      value={form.jobId}
                      onChange={(e) => setField("jobId", e.target.value)}
                    >
                      <option value="">No specific job</option>
                      {filteredJobs.map((j: any) => (
                        <option key={j.id} value={j.id}>{j.title}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="w-full py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors"
                    >
                      <Check className="w-3 h-3 inline mr-1" /> Done
                    </button>
                  </InlinePanel>
                )}
              </div>

              {/* Status + Location (click to edit) */}
              <div className="relative">
                <EditZone
                  hint="Edit status & location"
                  active={editing === "meta"}
                  onClick={() => toggle("meta")}
                  className="bg-amber-50 rounded-xl p-4 border border-amber-100 h-full"
                >
                  <p className="text-[10px] uppercase tracking-widest font-bold text-amber-400 mb-2">Status</p>
                  <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-bold tracking-wide uppercase ${STATUS_COLORS[form.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {form.status || "Draft"}
                  </span>
                  {(form.city || form.state) && (
                    <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {[form.city, form.state].filter(Boolean).join(", ")}
                    </p>
                  )}
                  {!form.city && !form.state && (
                    <p className="text-xs text-gray-300 italic mt-2">Click to add work location</p>
                  )}
                </EditZone>

                {editing === "meta" && (
                  <InlinePanel onClose={() => setEditing(null)}>
                    <div className="space-y-2.5">
                      <div>
                        <label className={lbl}>Invoice Status</label>
                        <select className={inp} value={form.status} onChange={(e) => setField("status", e.target.value)}>
                          <option value="draft">Draft</option>
                          <option value="sent">Sent</option>
                          <option value="paid">Paid</option>
                          <option value="overdue">Overdue</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={lbl + " flex items-center gap-1"}><MapPin className="w-3 h-3" /> Work City</label>
                          <input type="text" className={inp} placeholder="Louisville" value={form.city} onChange={(e) => setField("city", e.target.value)} />
                        </div>
                        <div>
                          <label className={lbl}>State</label>
                          <input type="text" className={inp} placeholder="KY" maxLength={2} value={form.state} onChange={(e) => setField("state", e.target.value.toUpperCase())} />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="w-full py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors"
                      >
                        <Check className="w-3 h-3 inline mr-1" /> Done
                      </button>
                    </div>
                  </InlinePanel>
                )}
              </div>
            </div>

            {/* ── Line Items (always editable inline) ── */}
            <div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-900">
                    <th className="text-left py-2 font-bold uppercase tracking-wide text-gray-700 pb-2 w-[46%]">Description</th>
                    <th className="text-right py-2 font-bold uppercase tracking-wide text-gray-700 w-[12%]">Qty</th>
                    <th className="text-right py-2 font-bold uppercase tracking-wide text-gray-700 w-[18%]">Unit Price</th>
                    <th className="text-right py-2 font-bold uppercase tracking-wide text-gray-700 w-[16%]">Total</th>
                    <th className="w-[8%]"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((l, i) => (
                    <tr key={i} className={`group border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          placeholder="Item description..."
                          value={l.description}
                          onChange={(e) => setLine(i, "description", e.target.value)}
                          className="w-full px-2 py-1 rounded-md border border-transparent hover:border-gray-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 bg-transparent focus:bg-white text-gray-800 placeholder-gray-300 text-xs outline-none transition-all"
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.quantity}
                          onChange={(e) => setLine(i, "quantity", e.target.value)}
                          className="w-full px-1.5 py-1 rounded-md border border-transparent hover:border-gray-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 bg-transparent focus:bg-white text-right text-gray-700 text-xs outline-none transition-all"
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <div className="relative">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-300 text-[10px] pointer-events-none">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.unitPrice}
                            onChange={(e) => setLine(i, "unitPrice", e.target.value)}
                            className="w-full pl-4 pr-1.5 py-1 rounded-md border border-transparent hover:border-gray-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 bg-transparent focus:bg-white text-right text-gray-700 text-xs outline-none transition-all"
                          />
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-right font-semibold text-gray-900">
                        {formatCurrency(l.quantity * l.unitPrice)}
                      </td>
                      <td className="py-1.5 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          className="text-gray-300 hover:text-red-400 transition-colors"
                          tabIndex={-1}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={5} className="pt-2">
                      <button
                        type="button"
                        onClick={addLine}
                        className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-semibold transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add line item
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── Totals (click tax to edit) ── */}
            <div className="flex justify-end">
              <div className="w-56 space-y-1.5 text-xs">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>

                {/* Tax rate — click to edit */}
                <div className="relative">
                  <EditZone
                    hint="Set tax rate"
                    active={editing === "tax"}
                    onClick={() => toggle("tax")}
                    className="flex justify-between text-gray-500 items-center px-1 py-0.5 -mx-1"
                  >
                    <span className="flex items-center gap-1">
                      Tax
                      {taxRate > 0 ? ` (${taxRate}%)` : ""}
                      <ChevronDown className="w-2.5 h-2.5 opacity-40" />
                    </span>
                    <span>{taxRate > 0 ? formatCurrency(taxAmount) : <span className="text-gray-300 italic">0%</span>}</span>
                  </EditZone>
                  {editing === "tax" && (
                    <InlinePanel onClose={() => setEditing(null)}>
                      <label className={lbl}>Tax Rate (%)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g. 6"
                        className={inp}
                        value={form.taxRate}
                        onChange={(e) => setField("taxRate", e.target.value)}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="w-full py-1.5 mt-2 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors"
                      >
                        <Check className="w-3 h-3 inline mr-1" /> Done
                      </button>
                    </InlinePanel>
                  )}
                </div>

                <div className="flex justify-between font-extrabold text-sm text-gray-900 border-t-2 border-gray-900 pt-2 mt-1">
                  <span>Total Due</span>
                  <span className="text-amber-600">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            {/* ── Notes (click to edit) ── */}
            <div className="relative border-t border-gray-100 pt-4">
              <EditZone
                hint="Add notes"
                active={editing === "notes"}
                onClick={() => toggle("notes")}
                className="p-1 -m-1"
              >
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">Notes</p>
                {editing === "notes" ? (
                  <textarea
                    autoFocus
                    className="w-full text-gray-700 text-xs leading-relaxed bg-white border border-amber-300 rounded-lg p-2 resize-none outline-none focus:ring-2 focus:ring-amber-400 min-h-[64px]"
                    placeholder="Payment instructions, thank-you note, etc..."
                    value={form.notes}
                    onChange={(e) => setField("notes", e.target.value)}
                    onBlur={() => setEditing(null)}
                    rows={3}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <p className={form.notes ? "text-gray-600 text-xs leading-relaxed whitespace-pre-wrap" : "text-gray-300 italic text-xs"}>
                    {form.notes || "Click to add notes for your client..."}
                  </p>
                )}
              </EditZone>
            </div>

          </div>
          <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-500 rounded-b-2xl" />
        </div>
      </div>
    </form>
  );
}

// ─── Main Invoices page ────────────────────────────────────────────────────────
export default function Invoices() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"all" | "tax">("all");
  const [open, setOpen] = useState(false);

  const { data: invoices, isLoading: loadingInvoices } = useListInvoices();
  const { data: taxReport, isLoading: loadingTax } = useGetInvoiceTaxReport();
  const { data: clients = [] } = useListClients();
  const { data: jobs = [] } = useListJobs();
  const { data: settings } = useGetSettings();
  const createInvoice = useCreateInvoice();
  const createClientMutation = useCreateClient();
  const updateStatus = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();

  const [form, setForm] = useState({
    clientId: "",
    jobId: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    status: "draft",
    taxRate: "",
    city: "",
    state: "KY",
    notes: "",
    terms: "Net 30",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [isNewClient, setIsNewClient] = useState(false);
  const [clientInput, setClientInput] = useState("");

  const prefix = (settings as any)?.invoicePrefix ?? "INV-2026-";
  const nextNum = (settings as any)?.invoiceNextNumber ?? 1001;
  const previewNumber = `${prefix}${nextNum}`;

  function setField(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function resetForm() {
    setForm({
      clientId: "",
      jobId: "",
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      status: "draft",
      taxRate: "",
      city: "",
      state: "KY",
      notes: "",
      terms: "Net 30",
    });
    setLineItems([emptyLine()]);
    setFormError("");
    setClientInput("");
    setIsNewClient(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lineItems.some((l) => l.description.trim())) {
      setFormError("Add at least one line item with a description.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      let resolvedClientId = form.clientId ? parseInt(form.clientId) : undefined;
      if (isNewClient && clientInput.trim()) {
        const newClient = await createClientMutation.mutateAsync({ data: { name: clientInput.trim() } });
        resolvedClientId = (newClient as any).id;
        queryClient.invalidateQueries({ queryKey: ["listClients"] });
      }
      await createInvoice.mutateAsync({
        data: {
          clientId: resolvedClientId,
          jobId: form.jobId ? parseInt(form.jobId) : undefined,
          issueDate: form.issueDate,
          dueDate: form.dueDate || undefined,
          status: form.status as any,
          taxRate: form.taxRate ? parseFloat(form.taxRate) : undefined,
          city: form.city || undefined,
          state: form.state || undefined,
          notes: form.notes || undefined,
          terms: form.terms || undefined,
          lineItems: lineItems
            .filter((l) => l.description.trim())
            .map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
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

  async function handleDelete(id: number) {
    if (!confirm("Delete this invoice?")) return;
    await deleteInvoice.mutateAsync({ id });
    queryClient.invalidateQueries();
  }

  return (
    <div className="space-y-6">
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

      <div className="flex p-1 bg-muted/50 rounded-xl w-fit border border-border/50">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "all" ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"}`}
        >
          All Invoices
        </button>
        <button
          onClick={() => setActiveTab("tax")}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "tax" ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"}`}
        >
          Tax Report (By City)
        </button>
      </div>

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
                  <th className="px-6 py-4">Location (City/State)</th>
                  <th className="px-6 py-4 text-right">Subtotal</th>
                  <th className="px-6 py-4 text-right">Tax</th>
                  <th className="px-6 py-4 text-right">Total</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-border/50">
              {activeTab === "all" ? (
                loadingInvoices ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading invoices...</td>
                  </tr>
                ) : !(invoices as any[])?.length ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />No invoices found
                    </td>
                  </tr>
                ) : (
                  (invoices as any[]).map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{inv.invoiceNumber}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(inv.issueDate)}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{inv.clientName || "—"}</div>
                        <div className="text-xs text-muted-foreground">{inv.jobTitle || "—"}</div>
                      </td>
                      <td className="px-6 py-4 text-right font-display font-semibold text-foreground">{formatCurrency(inv.total)}</td>
                      <td className="px-6 py-4 text-center">
                        <select
                          value={inv.status}
                          onChange={(e) => handleStatusChange(inv.id, e.target.value)}
                          className={`inline-flex px-2 py-1 rounded-md text-xs font-semibold tracking-wide uppercase border-0 cursor-pointer ${STATUS_COLORS[inv.status] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          <option value="draft">Draft</option>
                          <option value="sent">Sent</option>
                          <option value="paid">Paid</option>
                          <option value="overdue">Overdue</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button onClick={() => handleDelete(inv.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )
              ) : loadingTax ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading tax report...</td>
                </tr>
              ) : !(taxReport as any[])?.length ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />No invoices yet
                  </td>
                </tr>
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

      {/* ── Invoice Builder Modal ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !submitting && setOpen(false)}
          />
          <div className="relative w-full sm:max-w-3xl bg-background shadow-2xl rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[95dvh] sm:max-h-[92vh]">
            <InvoiceBuilder
              form={form}
              setField={setField}
              lineItems={lineItems}
              setLineItems={setLineItems}
              clients={clients as any[]}
              jobs={jobs as any[]}
              settings={settings}
              previewNumber={previewNumber}
              submitting={submitting}
              formError={formError}
              onSubmit={handleSubmit}
              onCancel={() => !submitting && setOpen(false)}
              isNewClient={isNewClient}
              setIsNewClient={setIsNewClient}
              clientInput={clientInput}
              setClientInput={setClientInput}
            />
          </div>
        </div>
      )}
    </div>
  );
}
