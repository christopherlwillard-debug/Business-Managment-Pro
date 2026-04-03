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
  useListMaterialLists,
  useAttachMaterialListToInvoice,
  Invoice,
  InvoiceAttachment,
  type MaterialList,
} from "@workspace/api-client-react";
import { generateMaterialListPdf } from "@/lib/generateMaterialListPdf";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate, localDateString } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import {
  FileText, Download, Plus, Trash2, X,
  Building2, MapPin, Check, Eye, AlertTriangle,
  Paperclip, Upload, Package,
} from "lucide-react";
import { InvoiceViewModal } from "@/components/InvoiceViewModal";

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
  attachments, onAttachmentsChange,
  pendingMaterialList, onPendingMaterialListChange,
}: {
  form: any; setField: (k: string, v: string) => void;
  lineItems: LineItem[]; setLineItems: React.Dispatch<React.SetStateAction<LineItem[]>>;
  clients: any[]; jobs: any[]; settings: any; previewNumber: string;
  submitting: boolean; formError: string;
  onSubmit: (e: React.FormEvent) => void; onCancel: () => void;
  isNewClient: boolean; setIsNewClient: (v: boolean) => void;
  clientInput: string; setClientInput: (v: string) => void;
  attachments: InvoiceAttachment[]; onAttachmentsChange: (a: InvoiceAttachment[]) => void;
  pendingMaterialList: MaterialList | null;
  onPendingMaterialListChange: (list: MaterialList | null) => void;
}) {
  const [showClientDrop, setShowClientDrop] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const clientRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const jobIdNum = form.jobId ? parseInt(form.jobId) : undefined;
  const { data: jobMaterialLists = [] } = useListMaterialLists(
    jobIdNum ? { jobId: jobIdNum } : undefined
  );

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploadingFile(true);
    try {
      const results: InvoiceAttachment[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`${base}/api/uploads`, { method: "POST", body: fd });
        if (res.ok) {
          const data = await res.json();
          results.push({ name: data.filename || file.name, url: data.url, size: data.size });
        }
      }
      if (results.length) onAttachmentsChange([...attachments, ...results]);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const s = settings ?? {};
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

            {/* ── Company header (auto from Settings, respects logo position) ── */}
            {(() => {
              const logoEl = logoUrl ? (
                <img src={`${base}${logoUrl}`} alt="Logo" className="flex-shrink-0"
                  style={{ height: logoPx, width: "auto", maxWidth: logoPx * 2.5, objectFit: "contain" }} />
              ) : (
                <div className="rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0"
                  style={{ width: 48, height: 48 }}>
                  <Building2 className="w-6 h-6 text-amber-500" />
                </div>
              );

              const nameEl = (
                <p className="text-xl font-extrabold text-gray-900 leading-tight">
                  {companyName || <span className="text-gray-300 italic font-normal text-base">Your Company Name</span>}
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
                  {!companyAddress && !companyPhone && !companyEmail && (
                    <p className="italic text-gray-300">Add contact info in Settings → Business Profile</p>
                  )}
                </div>
              );

              const companyBlock = logoPos === "top-center" ? (
                <div className="flex-1 flex flex-col items-center text-center gap-1">
                  {logoEl}
                  {nameEl}
                  <div className="text-xs text-gray-400 space-y-0.5">{contactEl}</div>
                </div>
              ) : logoPos === "top-right" ? (
                <div className="flex-1">{nameEl}{contactEl}</div>
              ) : (
                /* top-left default */
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">{logoEl}{nameEl}</div>
                  {contactEl}
                </div>
              );

              const invoiceDetailsEl = (
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
              );

              if (logoPos === "top-right") {
                return (
                  <div className="flex justify-between items-start gap-6">
                    {companyBlock}
                    <div className="flex flex-col items-end gap-2">
                      {logoEl}
                      {invoiceDetailsEl}
                    </div>
                  </div>
                );
              }
              return (
                <div className="flex justify-between items-start gap-6">
                  {companyBlock}
                  {invoiceDetailsEl}
                </div>
              );
            })()}

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
                              setField("clientEmail", c.email || "");
                              setField("clientPhone", c.phone || "");
                              setField("clientAddress", c.address || "");
                              setField("clientCity", c.city || "");
                              setField("clientState", c.state || "");
                              setField("clientZip", c.zip || "");
                              setField("clientNotes", c.notes || "");
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
                  {form.clientId && (
                    <>
                      {form.clientAddress && (
                        <div>
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Address</label>
                          <p className="px-3 py-2 text-sm text-gray-700">{form.clientAddress}</p>
                        </div>
                      )}
                      {form.clientEmail && (
                        <div>
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Email</label>
                          <p className="px-3 py-2 text-sm text-gray-700">{form.clientEmail}</p>
                        </div>
                      )}
                      {form.clientPhone && (
                        <div>
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Phone</label>
                          <p className="px-3 py-2 text-sm text-gray-700">{form.clientPhone}</p>
                        </div>
                      )}
                    </>
                  )}
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
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Name</label>
                    <input type="text" placeholder="e.g. Main Office"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-300"
                      value={form.locationName || ""} onChange={e => setField("locationName", e.target.value)} />
                  </div>
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

              {/* ── Material Lists (from linked job) ── */}
              {form.jobId && (
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2 flex items-center gap-1">
                    <Package className="w-3 h-3" /> Attach Material List
                  </p>
                  {jobMaterialLists.length === 0 ? (
                    <p className="text-[11px] text-gray-400 italic">No material lists for this job yet — create one in Materials.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {jobMaterialLists.map(list => {
                        const markupMult = list.markup / 100 + 1;
                        const listTotal = list.items.reduce((s, it) => s + it.unitCostSnapshot * it.qty * markupMult, 0);
                        const isSelected = pendingMaterialList?.id === list.id;
                        return (
                          <div key={list.id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-colors ${isSelected ? "bg-emerald-50 border-emerald-300" : "bg-amber-50/60 border-amber-100"}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-800 truncate">{list.name}</p>
                              <p className="text-[10px] text-gray-400">{list.items.length} item{list.items.length !== 1 ? "s" : ""} · {formatCurrency(listTotal)} (incl. {list.markup}% markup)</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => onPendingMaterialListChange(isSelected ? null : list)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
                                isSelected
                                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                  : "bg-amber-500 text-white hover:bg-amber-600"
                              }`}
                            >
                              {isSelected
                                ? <><Check className="w-3 h-3" /> Selected</>
                                : "Select"}
                            </button>
                          </div>
                        );
                      })}
                      {pendingMaterialList && (
                        <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                          "{pendingMaterialList.name}" will be added to the invoice as a line item + PDF attachment on save.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
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

            {/* ── Attachments ── */}
            <div className="border-t border-gray-100 pt-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 flex items-center gap-1.5">
                  <Paperclip className="w-3 h-3" /> Attachments
                </p>
                <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${uploadingFile ? "text-gray-400" : "text-amber-600 hover:bg-amber-50"}`}>
                  <Upload className="w-3 h-3" />
                  {uploadingFile ? "Uploading…" : "Add files"}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={handleFileChange}
                    disabled={uploadingFile}
                  />
                </label>
              </div>
              {attachments.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 max-w-[200px]">
                      <Paperclip className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className="truncate flex-1 print-hide">{att.name}</span>
                      <a href={`${base}${att.url}`} target="_blank" rel="noopener noreferrer"
                        className="print-value items-center gap-1 text-amber-700 underline truncate flex-1">
                        {att.name}
                      </a>
                      <button
                        type="button"
                        onClick={() => onAttachmentsChange(attachments.filter((_, idx) => idx !== i))}
                        className="text-gray-400 hover:text-red-400 transition-colors flex-shrink-0 ml-1 print-hide"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-300 italic">No attachments — click "Add files" to attach PDFs, images, or other documents</p>
              )}
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
  const attachMaterialList      = useAttachMaterialListToInvoice();

  const [form, setFormState] = useState({
    clientId: "", jobId: "",
    issueDate: localDateString(),
    dueDate: "", status: "draft", taxRate: "",
    city: "", state: "KY", locationName: "", notes: "", terms: "Net 30",
    clientEmail: "", clientPhone: "", clientAddress: "", 
    clientCity: "", clientState: "", clientZip: "", clientNotes: "",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [invoiceAttachments, setInvoiceAttachments] = useState<InvoiceAttachment[]>([]);
  const [pendingMaterialList, setPendingMaterialList] = useState<MaterialList | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState("");
  const [isNewClient, setIsNewClient] = useState(false);
  const [clientInput, setClientInput] = useState("");
  const [viewInvoice,  setViewInvoice]  = useState<Invoice | null>(null);
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
      issueDate: localDateString(),
      dueDate: "", status: "draft", taxRate: "",
      city: "", state: "KY", notes: "", terms: "Net 30",
      clientEmail: "", clientPhone: "", clientAddress: "", 
      clientCity: "", clientState: "", clientZip: "", clientNotes: "", 
      locationName: "",
    });
    setLineItems([emptyLine()]);
    setInvoiceAttachments([]);
    setPendingMaterialList(null);
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
      const newInvoice = await createInvoice.mutateAsync({
        data: {
          clientId:  resolvedClientId,
          jobId:     form.jobId    ? parseInt(form.jobId)    : undefined,
          issueDate: form.issueDate,
          dueDate:   form.dueDate  || undefined,
          status:    form.status   as any,
          taxRate:   form.taxRate  ? parseFloat(form.taxRate) : undefined,
          locationName: form.locationName || undefined,
          city:      form.city     || undefined,
          state:     form.state    || undefined,
          notes:     form.notes    || undefined,
          terms:     form.terms    || undefined,
          lineItems: lineItems
            .filter(l => l.description.trim())
            .map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
          attachments: invoiceAttachments,
        },
      });

      if (pendingMaterialList && (newInvoice as any)?.id) {
        const invoiceId = (newInvoice as any).id;
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        let attachmentUrl: string | undefined;
        let attachmentName: string | undefined;
        let attachmentSize: number | undefined;
        try {
          const pdfBlob = generateMaterialListPdf(
            pendingMaterialList,
            undefined,
            (settings as any)?.companyName ?? undefined
          );
          const fd = new FormData();
          const filename = `material-list-${pendingMaterialList.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`;
          fd.append("file", pdfBlob, filename);
          const uploadRes = await fetch(`${base}/api/uploads`, { method: "POST", body: fd });
          if (uploadRes.ok) {
            const uploaded = await uploadRes.json() as { url: string; filename: string; size: number };
            attachmentUrl = uploaded.url;
            attachmentName = `Material List \u2013 ${pendingMaterialList.name}.pdf`;
            attachmentSize = uploaded.size;
          }
        } catch { /* PDF upload failure is non-fatal */ }

        await attachMaterialList.mutateAsync({
          id: pendingMaterialList.id,
          invoiceId,
          attachmentUrl,
          attachmentName,
          attachmentSize,
        });
      }

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
            <button
              onClick={() => {
                if (!taxReport || !(taxReport as any[]).length) return;
                const rows = taxReport as any[];
                const header = ["Invoice #", "Date", "City", "State", "Subtotal", "Tax", "Total"];
                const lines = rows.map((r: any) => [
                  r.invoiceNumber ?? "",
                  r.issueDate ?? "",
                  r.city ?? "",
                  r.state ?? "",
                  r.subtotal != null ? Number(r.subtotal).toFixed(2) : "0.00",
                  r.taxAmount != null ? Number(r.taxAmount).toFixed(2) : "0.00",
                  r.total != null ? Number(r.total).toFixed(2) : "0.00",
                ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
                const csv = [header.join(","), ...lines].join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `invoice-tax-report.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              disabled={!taxReport || !(taxReport as any[]).length}
              className="flex items-center px-4 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
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
                        <div className="flex items-center gap-2">
                          {inv.invoiceNumber}
                          {Array.isArray(inv.attachments) && inv.attachments.length > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-gray-400" title={`${inv.attachments.length} attachment${inv.attachments.length > 1 ? "s" : ""}`}>
                              <Paperclip className="w-3 h-3" />{inv.attachments.length}
                            </span>
                          )}
                        </div>
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
              attachments={invoiceAttachments}
              onAttachmentsChange={setInvoiceAttachments}
              pendingMaterialList={pendingMaterialList}
              onPendingMaterialListChange={setPendingMaterialList}
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
