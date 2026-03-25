import { useState, useRef, useEffect } from "react";
import {
  useCreateInvoice, useUpdateInvoice, useCreateClient, useListClients,
  useListJobs, useGetSettings,
  Invoice, InvoiceDraft, AppSettings, Client, CreateInvoiceRequest,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import {
  Building2, MapPin, Check, X, Plus, Trash2, Lock, Printer,
} from "lucide-react";

interface LineItem { description: string; quantity: number; unitPrice: number; }
function emptyLine(): LineItem { return { description: "", quantity: 1, unitPrice: 0 }; }

interface InvoiceFormState {
  clientId: string;
  jobId: string;
  issueDate: string;
  dueDate: string;
  status: string;
  taxRate: string;
  city: string;
  state: string;
  locationName: string;
  notes: string;
  terms: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  clientCity: string;
  clientState: string;
  clientZip: string;
  clientNotes: string;
}

interface InvoiceEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: InvoiceDraft | null;
  existingInvoice?: Invoice;
  onSaved?: () => void;
}

export function InvoiceEditorDialog({
  open, onOpenChange, initialData, existingInvoice, onSaved,
}: InvoiceEditorDialogProps) {
  const queryClient = useQueryClient();
  const { data: clients = [] } = useListClients();
  const { data: jobs = [] }    = useListJobs();
  const { data: settings }     = useGetSettings();
  const createInvoice          = useCreateInvoice();
  const updateInvoice          = useUpdateInvoice();
  const createClientMutation   = useCreateClient();

  const s: AppSettings | undefined = settings;
  const prefix        = s?.invoicePrefix     ?? "INV-2026-";
  const nextNum       = s?.invoiceNextNumber ?? 1001;
  const previewNumber = existingInvoice?.invoiceNumber ?? `${prefix}${nextNum}`;

  const isEdit = Boolean(existingInvoice);
  const lockClientAndLocation = Boolean(initialData) && !existingInvoice;

  function makeInitialForm() {
    if (existingInvoice) {
      return {
        clientId: String(existingInvoice.clientId ?? ""),
        jobId: String(existingInvoice.jobId ?? ""),
        issueDate: existingInvoice.issueDate ?? new Date().toISOString().slice(0, 10),
        dueDate: existingInvoice.dueDate ?? "",
        status: existingInvoice.status ?? "draft",
        taxRate: existingInvoice.taxRate ? String(existingInvoice.taxRate) : "",
        city: existingInvoice.city ?? "",
        state: existingInvoice.state ?? "KY",
        locationName: existingInvoice.locationName ?? "",
        notes: existingInvoice.notes ?? "",
        terms: existingInvoice.terms ?? "Net 30",
        clientEmail: existingInvoice.clientEmail ?? "",
        clientPhone: existingInvoice.clientPhone ?? "",
        clientAddress: existingInvoice.clientAddress ?? "",
        clientCity: existingInvoice.clientCity ?? "",
        clientState: existingInvoice.clientState ?? "",
        clientZip: existingInvoice.clientZip ?? "",
        clientNotes: existingInvoice.clientNotes ?? "",
      };
    }
    return {
      clientId: String(initialData?.clientId ?? ""),
      jobId: String(initialData?.jobId ?? ""),
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      status: "draft",
      taxRate: "",
      city: initialData?.city ?? "",
      state: initialData?.state ?? "KY",
      locationName: initialData?.locationName ?? "",
      notes: "",
      terms: "Net 30",
      clientEmail: initialData?.clientEmail ?? "",
      clientPhone: initialData?.clientPhone ?? "",
      clientAddress: initialData?.clientAddress ?? "",
      clientCity: initialData?.clientCity ?? "",
      clientState: initialData?.clientState ?? "",
      clientZip: initialData?.clientZip ?? "",
      clientNotes: "",
    };
  }

  function makeInitialLineItems(): LineItem[] {
    if (existingInvoice?.lineItems?.length) {
      return existingInvoice.lineItems.map(li => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
      }));
    }
    if (initialData?.lineItems?.length) {
      return initialData.lineItems;
    }
    return [emptyLine()];
  }

  function makeInitialClientInput(): string {
    if (existingInvoice?.clientName) return existingInvoice.clientName;
    if (initialData?.clientName) return initialData.clientName;
    return "";
  }

  const [form, setFormState] = useState<InvoiceFormState>(makeInitialForm);
  const [lineItems, setLineItems] = useState<LineItem[]>(makeInitialLineItems);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [isNewClient, setIsNewClient] = useState(false);
  const [clientInput, setClientInput] = useState(makeInitialClientInput);
  const [showClientDrop, setShowClientDrop] = useState(false);
  const clientRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFormState(makeInitialForm());
      setLineItems(makeInitialLineItems());
      setClientInput(makeInitialClientInput());
      setIsNewClient(false);
      setFormError("");
    }
  }, [open, existingInvoice?.id, initialData?.jobId]);

  function setField(k: string, v: string) {
    setFormState(f => ({ ...f, [k]: v }));
  }
  function setLine(i: number, k: keyof LineItem, v: string) {
    setLineItems(ls =>
      ls.map((l, idx) => idx === i ? { ...l, [k]: k === "description" ? v : parseFloat(v) || 0 } : l)
    );
  }
  function addLine() { setLineItems(ls => [...ls, emptyLine()]); }
  function removeLine(i: number) {
    if (lineItems.length > 1) setLineItems(ls => ls.filter((_, idx) => idx !== i));
  }

  const subtotal  = lineItems.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const taxRate   = parseFloat(form.taxRate) || 0;
  const taxAmount = subtotal * taxRate / 100;
  const total     = subtotal + taxAmount;

  const suggestions: Client[] = clientInput.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(clientInput.toLowerCase()))
    : clients;
  const hasExact = clients.some(c => c.name.toLowerCase() === clientInput.toLowerCase());
  const selectedClient = clients.find(c => String(c.id) === form.clientId);

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
        resolvedClientId = nc.id;
      }
      const payload: CreateInvoiceRequest = {
        clientId:  resolvedClientId,
        jobId:     form.jobId    ? parseInt(form.jobId)    : undefined,
        issueDate: form.issueDate,
        dueDate:   form.dueDate  || undefined,
        status:    form.status   as CreateInvoiceRequest["status"],
        taxRate:   form.taxRate  ? parseFloat(form.taxRate) : undefined,
        locationName: form.locationName || undefined,
        city:      form.city     || undefined,
        state:     form.state    || undefined,
        notes:     form.notes    || undefined,
        terms:     form.terms    || undefined,
        lineItems: lineItems
          .filter(l => l.description.trim())
          .map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
      };
      if (isEdit) {
        await updateInvoice.mutateAsync({ id: existingInvoice.id, data: payload });
      } else {
        await createInvoice.mutateAsync({ data: payload });
      }
      queryClient.invalidateQueries();
      onOpenChange(false);
      onSaved?.();
    } catch {
      setFormError(`Failed to ${isEdit ? "update" : "create"} invoice. Please try again.`);
    } finally {
      setSubmitting(false);
    }
  }

  const logoUrl: string | null  = s?.logoUrl ?? null;
  const logoSize: string        = s?.invoiceLogoSize     ?? "medium";
  const logoPos: string         = s?.invoiceLogoPosition ?? "top-left";
  const logoPx = logoSize === "small" ? 64 : logoSize === "large" ? 160 : 100;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const companyName    = s?.companyName    || "";
  const companyEmail   = s?.companyEmail   || "";
  const companyPhone   = s?.companyPhone   || "";
  const companyAddress = s?.companyAddress || "";
  const companyCity    = s?.companyCity    || "";
  const companyState   = s?.companyState   || "";
  const companyZip     = s?.companyZip     || "";

  const docInput = "bg-transparent border-0 border-b border-transparent focus:border-amber-400 focus:outline-none focus:bg-amber-50/40 rounded-none transition-colors text-inherit font-inherit w-full placeholder-gray-300 px-0.5";
  const docSelect = "bg-transparent border-0 border-b border-transparent focus:border-amber-400 focus:outline-none focus:bg-amber-50/40 rounded-none transition-colors text-inherit font-inherit cursor-pointer px-0.5";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative w-full max-w-3xl bg-white shadow-2xl rounded-2xl flex flex-col"
        style={{ maxHeight: "96vh" }}>

        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          {/* Action bar */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
            <h2 className="text-base font-bold text-gray-900">
              {isEdit ? `Edit Invoice ${existingInvoice.invoiceNumber}` : "New Invoice"}
            </h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onOpenChange(false)}
                className="px-4 py-1.5 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-1.5 rounded-xl font-semibold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Printer className="w-4 h-4" /> Print / Export PDF
              </button>
              <button type="submit" disabled={submitting}
                className="flex items-center gap-2 px-5 py-1.5 rounded-xl font-bold text-sm bg-amber-500 text-white hover:bg-amber-600 shadow transition-all active:scale-95 disabled:opacity-60">
                {submitting ? "Saving…" : <><Check className="w-4 h-4" /> Save Invoice</>}
              </button>
            </div>
          </div>

          {formError && (
            <div className="mx-5 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2 flex-shrink-0">
              <X className="w-4 h-4 flex-shrink-0" /> {formError}
            </div>
          )}

          {/* Invoice document */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-100">
            <div className="invoice-print-area max-w-2xl mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-amber-500 to-amber-400" />
              <div className="p-6 space-y-6">

                {/* Company header */}
                {(() => {
                  const logoEl = logoUrl ? (
                    <img src={`${base}${logoUrl}`} alt="Logo" className="flex-shrink-0"
                      style={{ height: logoPx, width: "auto", maxWidth: logoPx * 2.5, objectFit: "contain" }} />
                  ) : (
                    <div className="rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0"
                      style={{ width: 44, height: 44 }}>
                      <Building2 className="w-5 h-5 text-amber-500" />
                    </div>
                  );
                  const nameEl = (
                    <p className="text-lg font-extrabold text-gray-900 leading-tight">
                      {companyName || <span className="text-gray-300 italic font-normal text-sm">Your Company</span>}
                    </p>
                  );
                  const contactEl = (
                    <div className="text-xs text-gray-400 space-y-0.5">
                      {companyAddress && <p>{companyAddress}</p>}
                      {(companyCity || companyState || companyZip) && (
                        <p>{[companyCity, companyState, companyZip].filter(Boolean).join(", ")}</p>
                      )}
                      {companyPhone && <p>{companyPhone}</p>}
                      {companyEmail && <p>{companyEmail}</p>}
                    </div>
                  );
                  const companyBlock = logoPos === "top-center" ? (
                    <div className="flex-1 flex flex-col items-center text-center gap-1">{logoEl}{nameEl}{contactEl}</div>
                  ) : logoPos === "top-right" ? (
                    <div className="flex-1">{nameEl}{contactEl}</div>
                  ) : (
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">{logoEl}{nameEl}</div>
                      {contactEl}
                    </div>
                  );
                  const invoiceDetailsEl = (
                    <div className="text-right space-y-1.5 min-w-[160px]">
                      <div>
                        <p className="text-2xl font-black tracking-widest text-gray-200 uppercase">Invoice</p>
                        <p className="text-sm font-bold text-amber-600 -mt-1">{previewNumber}</p>
                      </div>
                      <table className="text-xs ml-auto text-right">
                        <tbody>
                          <tr>
                            <td className="text-gray-400 pr-2 py-0.5 whitespace-nowrap font-semibold">Date</td>
                            <td><input type="date" className={docInput + " text-gray-700 text-xs"} required
                              value={form.issueDate} onChange={e => setField("issueDate", e.target.value)} /></td>
                          </tr>
                          <tr>
                            <td className="text-gray-400 pr-2 py-0.5 whitespace-nowrap font-semibold">Due</td>
                            <td><input type="date" className={docInput + " text-gray-700 text-xs"}
                              value={form.dueDate} onChange={e => setField("dueDate", e.target.value)} /></td>
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
                  );
                  if (logoPos === "top-right") {
                    return (
                      <div className="flex justify-between items-start gap-6">
                        {companyBlock}
                        <div className="flex flex-col items-end gap-2">{logoEl}{invoiceDetailsEl}</div>
                      </div>
                    );
                  }
                  return (
                    <div className="flex justify-between items-start gap-6">
                      {companyBlock}{invoiceDetailsEl}
                    </div>
                  );
                })()}

                {/* Bill To + Work Location */}
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Bill To</p>

                    {lockClientAndLocation ? (
                      /* ── Locked: from a job ── */
                      <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Lock className="w-2.5 h-2.5 text-gray-400" />
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">From job</span>
                        </div>
                        {clientInput && (
                          <p className="text-sm font-bold text-gray-900 mb-1">{clientInput}</p>
                        )}
                        {form.clientEmail && <p className="text-xs text-gray-500">{form.clientEmail}</p>}
                        {form.clientPhone && <p className="text-xs text-gray-500">{form.clientPhone}</p>}
                        {form.clientAddress && <p className="text-xs text-gray-500">{form.clientAddress}</p>}
                        {(form.clientCity || form.clientState || form.clientZip) && (
                          <p className="text-xs text-gray-500">
                            {[form.clientCity, form.clientState, form.clientZip].filter(Boolean).join(", ")}
                          </p>
                        )}
                        {!clientInput && !form.clientEmail && !form.clientAddress && (
                          <p className="text-xs text-gray-400 italic">No client assigned</p>
                        )}
                      </div>
                    ) : (
                      /* ── Editable ── */
                      <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100 space-y-3">
                        {/* Client search */}
                        <div className="relative">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Client</label>
                          <input
                            ref={clientRef}
                            type="text"
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-300"
                            placeholder="Search or add new…"
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
                            <span className="absolute right-3 top-[calc(100%-1.5rem)] text-[9px] font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded-full">NEW</span>
                          )}
                          {showClientDrop && (
                            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl max-h-36 overflow-y-auto">
                              {suggestions.length === 0 && !clientInput.trim() && (
                                <p className="px-3 py-2 text-xs text-gray-400">No clients yet</p>
                              )}
                              {suggestions.map((c: Client) => (
                                <button key={c.id} type="button"
                                  onMouseDown={() => {
                                    setClientInput(c.name);
                                    setField("clientId", String(c.id));
                                    setField("clientEmail", c.email ?? "");
                                    setField("clientAddress", c.address ?? "");
                                    setField("clientPhone", c.phone ?? "");
                                    setField("clientCity", c.city ?? "");
                                    setField("clientState", c.state ?? "");
                                    setField("clientZip", c.zip ?? "");
                                    setField("clientNotes", c.notes ?? "");
                                    setShowClientDrop(false);
                                    setIsNewClient(false);
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm text-gray-700 transition-colors">
                                  {c.name}
                                </button>
                              ))}
                              {clientInput.trim() && !hasExact && (
                                <button type="button"
                                  onMouseDown={() => {
                                    setField("clientId", "");
                                    setIsNewClient(true);
                                    setShowClientDrop(false);
                                  }}
                                  className="w-full text-left px-3 py-2 border-t border-gray-100 text-xs font-semibold text-amber-600 hover:bg-amber-50 transition-colors">
                                  + Add "{clientInput}" as new client
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Client fields */}
                        {(selectedClient || isNewClient) && (
                          <>
                            {[
                              { key: "clientEmail",   label: "Email",   type: "email" },
                              { key: "clientPhone",   label: "Phone",   type: "text" },
                              { key: "clientAddress", label: "Address", type: "text" },
                            ].map(({ key, label, type }) => (
                              <div key={key}>
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-0.5">{label}</label>
                                <input type={type} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                  value={form[key as keyof InvoiceFormState]} onChange={e => setField(key, e.target.value)} />
                              </div>
                            ))}
                            <div className="grid grid-cols-3 gap-1.5">
                              <div className="col-span-1">
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-0.5">City</label>
                                <input type="text" className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                  value={form.clientCity} onChange={e => setField("clientCity", e.target.value)} />
                              </div>
                              <div className="col-span-1">
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-0.5">State</label>
                                <input type="text" className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                  value={form.clientState} onChange={e => setField("clientState", e.target.value)} />
                              </div>
                              <div className="col-span-1">
                                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-0.5">Zip</label>
                                <input type="text" className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                  value={form.clientZip} onChange={e => setField("clientZip", e.target.value)} />
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Work Location */}
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">
                      <span className="inline-flex items-center gap-1"><MapPin className="w-2.5 h-2.5" /> Work Location</span>
                    </p>

                    {lockClientAndLocation ? (
                      /* ── Locked: from a job ── */
                      <div className="bg-amber-50 rounded-xl p-3.5 border border-amber-100">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Lock className="w-2.5 h-2.5 text-amber-400" />
                          <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wide">From job</span>
                        </div>
                        {form.locationName && (
                          <p className="text-sm font-semibold text-gray-800 mb-1">{form.locationName}</p>
                        )}
                        {(form.city || form.state) && (
                          <p className="text-xs text-gray-600">{[form.city, form.state].filter(Boolean).join(", ")}</p>
                        )}
                        {!form.locationName && !form.city && !form.state && (
                          <p className="text-xs text-gray-400 italic">No work location set</p>
                        )}
                      </div>
                    ) : (
                      /* ── Editable ── */
                      <div className="bg-amber-50 rounded-xl p-3.5 border border-amber-100 space-y-2">
                        <div>
                          <label className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide block mb-0.5">Location Name</label>
                          <input type="text" className="w-full px-2 py-1.5 rounded-lg border border-amber-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            placeholder="e.g. 123 Main St" value={form.locationName} onChange={e => setField("locationName", e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide block mb-0.5">City</label>
                            <input type="text" className="w-full px-2 py-1.5 rounded-lg border border-amber-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                              value={form.city} onChange={e => setField("city", e.target.value)} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide block mb-0.5">State</label>
                            <input type="text" className="w-full px-2 py-1.5 rounded-lg border border-amber-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                              value={form.state} onChange={e => setField("state", e.target.value)} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Line items */}
                <div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b-2 border-gray-800">
                        <th className="text-left pb-2 font-bold uppercase tracking-wide text-gray-400 w-[50%]">Description</th>
                        <th className="text-right pb-2 font-bold uppercase tracking-wide text-gray-400 w-[12%]">Qty</th>
                        <th className="text-right pb-2 font-bold uppercase tracking-wide text-gray-400 w-[19%]">Unit Price</th>
                        <th className="text-right pb-2 font-bold uppercase tracking-wide text-gray-400 w-[14%]">Total</th>
                        <th className="w-[5%]" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lineItems.map((li, i) => (
                        <tr key={i} className="hover:bg-gray-50/40">
                          <td className="py-1.5 pr-2">
                            <input type="text" className={docInput} placeholder="Item description"
                              value={li.description} onChange={e => setLine(i, "description", e.target.value)} />
                          </td>
                          <td className="py-1.5 px-1 text-right">
                            <input type="number" min="0" step="any" className={docInput + " text-right w-14"}
                              value={li.quantity} onChange={e => setLine(i, "quantity", e.target.value)} />
                          </td>
                          <td className="py-1.5 px-1 text-right">
                            <input type="number" min="0" step="0.01" className={docInput + " text-right"}
                              value={li.unitPrice} onChange={e => setLine(i, "unitPrice", e.target.value)} />
                          </td>
                          <td className="py-1.5 pl-1 text-right font-semibold text-gray-900">
                            {formatCurrency(li.quantity * li.unitPrice)}
                          </td>
                          <td className="py-1.5 pl-1 text-center">
                            <button type="button" onClick={() => removeLine(i)}
                              className="text-gray-300 hover:text-red-400 transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="button" onClick={addLine}
                    className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 font-semibold transition-colors">
                    <Plus className="w-3 h-3" /> Add Line Item
                  </button>
                </div>

                {/* Totals + Tax */}
                <div className="flex justify-between items-end gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 font-semibold">Tax %</label>
                    <input type="number" min="0" max="100" step="0.1"
                      className="w-20 px-2 py-1 text-xs rounded-lg border border-gray-200 text-right focus:outline-none focus:ring-1 focus:ring-amber-400"
                      value={form.taxRate} onChange={e => setField("taxRate", e.target.value)} />
                  </div>
                  <div className="w-48 space-y-1 text-xs">
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
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-gray-400 block mb-1">Notes</label>
                  <textarea
                    rows={2}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 text-gray-700"
                    placeholder="Payment instructions, notes to client…"
                    value={form.notes} onChange={e => setField("notes", e.target.value)}
                  />
                </div>

              </div>
              <div className="h-1.5 bg-gradient-to-r from-amber-400 to-amber-500" />
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
