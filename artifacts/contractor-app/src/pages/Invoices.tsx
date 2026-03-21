import { useState, useRef, useCallback } from "react";
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
  MapPin, ChevronDown, User, Receipt, StickyNote, Calendar,
  MousePointerClick, Check,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}
function emptyLine(): LineItem { return { description: "", quantity: 1, unitPrice: 0 }; }

type Section = "billing" | "header" | "lineitems" | "finalize" | null;

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  sent: "bg-blue-100 text-blue-700",
  overdue: "bg-red-100 text-red-700",
  draft: "bg-gray-100 text-gray-600",
  cancelled: "bg-orange-100 text-orange-700",
};

// ─── Live Invoice Preview (left panel) ────────────────────────────────────────
function InvoicePreview({
  form, lineItems, settings, previewNumber,
  clientName, jobTitle, activeSection, onSectionClick,
}: {
  form: any; lineItems: LineItem[]; settings: any; previewNumber: string;
  clientName: string; jobTitle: string; activeSection: Section;
  onSectionClick: (s: Section) => void;
}) {
  const s = settings ?? {};
  const companyName   = s.companyName   || "Your Company Name";
  const companyEmail  = s.companyEmail  || "";
  const companyPhone  = s.companyPhone  || "";
  const companyAddress = s.companyAddress || "";
  const companyCity   = s.companyCity   || "";
  const companyState  = s.companyState  || "";
  const companyZip    = s.companyZip    || "";
  const logoUrl: string | null = s.logoUrl ?? null;
  const logoPosition: string  = s.invoiceLogoPosition ?? "top-left";
  const logoSize: string      = s.invoiceLogoSize     ?? "medium";
  const logoPx = logoSize === "small" ? 44 : logoSize === "large" ? 96 : 68;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const subtotal  = lineItems.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const taxRate   = parseFloat(form.taxRate) || 0;
  const taxAmount = subtotal * taxRate / 100;
  const total     = subtotal + taxAmount;
  const filledLines = lineItems.filter(l => l.description.trim());

  function zone(section: Section, children: React.ReactNode, extraClass = "") {
    const active = activeSection === section;
    return (
      <div
        onClick={() => onSectionClick(section)}
        className={`relative cursor-pointer rounded-lg transition-all duration-150 ${
          active
            ? "ring-2 ring-amber-400 ring-offset-1 bg-amber-50/40"
            : "hover:ring-2 hover:ring-amber-200 hover:ring-offset-1 hover:bg-amber-50/20"
        } ${extraClass}`}
        title="Click to edit this section"
      >
        {children}
      </div>
    );
  }

  const LogoBlock = logoUrl
    ? <img src={`${base}${logoUrl}`} alt="Logo" style={{ width: logoPx, height: logoPx, objectFit: "contain" }} />
    : <Building2 className="text-amber-500" style={{ width: 28, height: 28 }} />;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden text-[12px] font-sans text-gray-900 select-none">
      <div className="h-1.5 bg-gradient-to-r from-amber-500 to-amber-400" />
      <div className="p-6 space-y-4">

        {/* Company header */}
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1">
            {logoPosition === "top-left" ? (
              <div className="flex items-center gap-2 mb-1">
                {LogoBlock}
                <span className="text-base font-bold text-gray-900 leading-tight">{companyName}</span>
              </div>
            ) : (
              <span className="text-base font-bold text-gray-900 block mb-1">{companyName}</span>
            )}
            {companyAddress && (
              <p className="text-[11px] text-gray-400 leading-snug">
                {companyAddress}<br />
                {[companyCity, companyState, companyZip].filter(Boolean).join(", ")}
              </p>
            )}
            {companyEmail && <p className="text-[11px] text-gray-400">{companyEmail}</p>}
            {companyPhone && <p className="text-[11px] text-gray-400">{companyPhone}</p>}
            {!companyAddress && !companyEmail && !companyPhone && (
              <p className="text-[11px] text-gray-300 italic">Add your contact info in Settings → Business Profile</p>
            )}
          </div>

          {/* Dates/Terms block */}
          {zone("header",
            <div className="text-right p-1.5 -m-1.5">
              <p className="text-2xl font-extrabold tracking-widest text-gray-200 uppercase">Invoice</p>
              <p className="text-xs font-bold text-amber-600 mt-0.5">{previewNumber}</p>
              <div className="mt-1.5 space-y-0.5 text-[11px] text-gray-400">
                <p><span className="text-gray-600 font-semibold">Date: </span>
                  {form.issueDate ? formatDate(form.issueDate) : <span className="text-gray-300 italic">Set date →</span>}</p>
                <p><span className="text-gray-600 font-semibold">Due: </span>
                  {form.dueDate ? formatDate(form.dueDate) : <span className="text-gray-300 italic">Set due date →</span>}</p>
                <p><span className="text-gray-600 font-semibold">Terms: </span>
                  {form.terms || <span className="text-gray-300 italic">—</span>}</p>
              </div>
            </div>
          )}
        </div>

        {/* Bill To + Status */}
        <div className="grid grid-cols-2 gap-3">
          {zone("billing",
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-1">Bill To</p>
              {clientName
                ? <p className="font-semibold text-gray-900">{clientName}</p>
                : <p className="text-gray-300 italic">Click to select client →</p>}
              {jobTitle && <p className="text-[11px] text-gray-500 mt-0.5">Re: {jobTitle}</p>}
            </div>
          )}
          {zone("header",
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
              <p className="text-[9px] uppercase tracking-widest font-bold text-amber-400 mb-1">Status</p>
              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${STATUS_COLORS[form.status] ?? "bg-gray-100 text-gray-600"}`}>
                {form.status || "Draft"}
              </span>
              {(form.city || form.state) && (
                <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-0.5">
                  <MapPin className="w-2.5 h-2.5" />{[form.city, form.state].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Line items */}
        {zone("lineitems",
          <div className="p-1">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-800">
                  <th className="text-left pb-1.5 font-bold uppercase tracking-wide text-gray-600 w-[48%]">Description</th>
                  <th className="text-right pb-1.5 font-bold uppercase tracking-wide text-gray-600 w-[12%]">Qty</th>
                  <th className="text-right pb-1.5 font-bold uppercase tracking-wide text-gray-600 w-[20%]">Price</th>
                  <th className="text-right pb-1.5 font-bold uppercase tracking-wide text-gray-600 w-[20%]">Total</th>
                </tr>
              </thead>
              <tbody>
                {filledLines.length > 0 ? filledLines.map((l, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="py-1.5 pr-2 text-gray-800">{l.description}</td>
                    <td className="py-1.5 text-right text-gray-500">{l.quantity}</td>
                    <td className="py-1.5 text-right text-gray-500">{formatCurrency(l.unitPrice)}</td>
                    <td className="py-1.5 text-right font-semibold text-gray-900">{formatCurrency(l.quantity * l.unitPrice)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-gray-300 italic">
                      Click to add line items →
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        {zone("finalize",
          <div className="flex justify-end p-1">
            <div className="w-52 space-y-1 text-[11px]">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
              </div>
              {taxRate > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Tax ({taxRate}%)</span><span>{formatCurrency(taxAmount)}</span>
                </div>
              )}
              {taxRate === 0 && (
                <div className="flex justify-between text-gray-300 italic">
                  <span className="flex items-center gap-1"><ChevronDown className="w-2.5 h-2.5" />Tax rate</span>
                  <span>0%</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-sm text-gray-900 border-t-2 border-gray-800 pt-1.5">
                <span>Total Due</span>
                <span className="text-amber-600">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {zone("finalize",
          <div className="border-t border-gray-100 pt-3 p-1">
            <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-1">Notes</p>
            {form.notes
              ? <p className="text-gray-600 text-[11px] leading-relaxed whitespace-pre-wrap">{form.notes}</p>
              : <p className="text-gray-300 italic text-[11px]">Click to add payment instructions or notes →</p>}
          </div>
        )}
      </div>
      <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-500" />
    </div>
  );
}

// ─── Section editor panels (right side) ───────────────────────────────────────
const inp  = "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-colors placeholder-gray-300";
const lbl  = "block text-xs font-semibold text-gray-500 mb-1";
const card = "bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3";

function WelcomePanel() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-4 text-gray-400">
      <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
        <MousePointerClick className="w-7 h-7 text-amber-400" />
      </div>
      <div>
        <p className="font-semibold text-gray-600 text-sm">Click any section on the invoice</p>
        <p className="text-xs mt-1">Each area of the invoice is editable — tap a zone to open its controls here.</p>
      </div>
      <div className="w-full space-y-2 text-left mt-2">
        {[
          { icon: Calendar, label: "Invoice number area", desc: "Dates, terms, status" },
          { icon: User, label: "Bill To card", desc: "Client & job selection" },
          { icon: Receipt, label: "Line items table", desc: "Services & pricing" },
          { icon: StickyNote, label: "Totals / Notes area", desc: "Tax rate, notes, location" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
            <Icon className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-gray-600">{label}</p>
              <p className="text-[11px] text-gray-400">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeaderPanel({ form, setField }: { form: any; setField: (k: string, v: string) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-500" /> Dates, Terms & Status
        </p>
        <div className={card}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Issue Date</label>
              <input type="date" className={inp} value={form.issueDate}
                onChange={e => setField("issueDate", e.target.value)} required />
            </div>
            <div>
              <label className={lbl}>Due Date</label>
              <input type="date" className={inp} value={form.dueDate}
                onChange={e => setField("dueDate", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Payment Terms</label>
              <select className={inp} value={form.terms} onChange={e => setField("terms", e.target.value)}>
                <option>Due on receipt</option>
                <option>Net 15</option>
                <option>Net 30</option>
                <option>Net 60</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Status</label>
              <select className={inp} value={form.status} onChange={e => setField("status", e.target.value)}>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-amber-500" /> Work Location
          <span className="text-[10px] font-normal text-gray-400">(for KY occupational tax)</span>
        </p>
        <div className={card}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>City</label>
              <input type="text" className={inp} placeholder="e.g. Louisville"
                value={form.city} onChange={e => setField("city", e.target.value)} />
            </div>
            <div>
              <label className={lbl}>State</label>
              <input type="text" className={inp} placeholder="KY" maxLength={2}
                value={form.state} onChange={e => setField("state", e.target.value.toUpperCase())} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BillingPanel({
  form, setField, clients, jobs,
  clientInput, setClientInput, isNewClient, setIsNewClient,
}: {
  form: any; setField: (k: string, v: string) => void;
  clients: any[]; jobs: any[];
  clientInput: string; setClientInput: (v: string) => void;
  isNewClient: boolean; setIsNewClient: (v: boolean) => void;
}) {
  const [showDrop, setShowDrop] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = clientInput.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(clientInput.toLowerCase()))
    : clients;
  const hasExact = clients.some(c => c.name.toLowerCase() === clientInput.toLowerCase());
  const filteredJobs = form.clientId
    ? jobs.filter(j => String(j.clientId) === form.clientId)
    : jobs;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <User className="w-4 h-4 text-amber-500" /> Bill To
        </p>
        <div className={card}>
          <div>
            <label className={lbl}>Client</label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                className={inp + (isNewClient ? " border-amber-400 bg-amber-50/50" : "")}
                placeholder="Search clients or type new name..."
                value={clientInput}
                onChange={e => {
                  setClientInput(e.target.value);
                  setShowDrop(true);
                  setIsNewClient(false);
                  setField("clientId", "");
                }}
                onFocus={() => setShowDrop(true)}
                onBlur={() => setTimeout(() => setShowDrop(false), 150)}
              />
              {isNewClient && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded-full">
                  NEW
                </span>
              )}
              {showDrop && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                  {suggestions.length === 0 && !clientInput.trim() && (
                    <p className="px-3 py-2.5 text-xs text-gray-400">No clients yet — type a name to create one</p>
                  )}
                  {suggestions.map(c => (
                    <button
                      key={c.id} type="button"
                      onMouseDown={() => {
                        setClientInput(c.name);
                        setField("clientId", String(c.id));
                        setField("jobId", "");
                        setIsNewClient(false);
                        setShowDrop(false);
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-amber-50 transition-colors border-b border-gray-50 last:border-0"
                    >
                      {c.name}
                    </button>
                  ))}
                  {clientInput.trim() && !hasExact && (
                    <button
                      type="button"
                      onMouseDown={() => {
                        setIsNewClient(true);
                        setField("clientId", "");
                        setField("jobId", "");
                        setShowDrop(false);
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors flex items-center gap-2 border-t border-gray-100"
                    >
                      <Plus className="w-3.5 h-3.5" /> Create "{clientInput}"
                    </button>
                  )}
                </div>
              )}
            </div>
            {isNewClient && (
              <p className="text-[11px] text-amber-600 mt-1.5">
                A new client will be created when you save this invoice.
              </p>
            )}
          </div>
          <div>
            <label className={lbl}>Link to Job <span className="font-normal text-gray-300">(optional)</span></label>
            <select className={inp} value={form.jobId} onChange={e => setField("jobId", e.target.value)}>
              <option value="">No specific job</option>
              {filteredJobs.map(j => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

function LineItemsPanel({
  lineItems, setLineItems,
}: {
  lineItems: LineItem[];
  setLineItems: React.Dispatch<React.SetStateAction<LineItem[]>>;
}) {
  function setLine(i: number, k: keyof LineItem, v: string) {
    setLineItems(ls =>
      ls.map((l, idx) => idx === i ? { ...l, [k]: k === "description" ? v : parseFloat(v) || 0 } : l)
    );
  }
  function addLine() { setLineItems(ls => [...ls, emptyLine()]); }
  function removeLine(i: number) {
    if (lineItems.length > 1) setLineItems(ls => ls.filter((_, idx) => idx !== i));
  }

  const subtotal = lineItems.reduce((a, l) => a + l.quantity * l.unitPrice, 0);

  return (
    <div>
      <p className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
        <Receipt className="w-4 h-4 text-amber-500" /> Line Items
      </p>
      <div className="space-y-2">
        {lineItems.map((l, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2 group shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Item {i + 1}</span>
              {lineItems.length > 1 && (
                <button
                  type="button" onClick={() => removeLine(i)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="Description (e.g. Labor — deck framing)"
              className={inp}
              value={l.description}
              onChange={e => setLine(i, "description", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>Qty</label>
                <input type="number" min="0" step="0.01" className={inp} value={l.quantity}
                  onChange={e => setLine(i, "quantity", e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Unit Price ($)</label>
                <input type="number" min="0" step="0.01" className={inp} value={l.unitPrice}
                  onChange={e => setLine(i, "unitPrice", e.target.value)} />
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 border-t border-gray-100 pt-1.5">
              <span>Line total</span>
              <span className="font-semibold text-gray-800">{formatCurrency(l.quantity * l.unitPrice)}</span>
            </div>
          </div>
        ))}

        <button
          type="button" onClick={addLine}
          className="w-full py-2.5 rounded-xl border-2 border-dashed border-amber-200 text-amber-600 text-sm font-semibold hover:border-amber-400 hover:bg-amber-50 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add line item
        </button>

        <div className="flex justify-between text-sm font-bold text-gray-800 px-1 pt-1">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
      </div>
    </div>
  );
}

function FinalizePanel({ form, setField }: { form: any; setField: (k: string, v: string) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-amber-500" /> Tax & Notes
        </p>
        <div className={card}>
          <div>
            <label className={lbl}>Tax Rate (%)</label>
            <input type="number" min="0" step="0.01" className={inp}
              placeholder="e.g. 6" value={form.taxRate}
              onChange={e => setField("taxRate", e.target.value)} />
            <p className="text-[11px] text-gray-400 mt-1">Leave blank for 0% tax.</p>
          </div>
          <div>
            <label className={lbl}>Notes for Client</label>
            <textarea
              className={inp + " resize-none"}
              rows={4}
              placeholder="Payment instructions, thank-you note, warranty info..."
              value={form.notes}
              onChange={e => setField("notes", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-amber-500" /> Work Location
          <span className="text-[10px] font-normal text-gray-400">(KY occupational tax)</span>
        </p>
        <div className={card}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>City</label>
              <input type="text" className={inp} placeholder="e.g. Louisville"
                value={form.city} onChange={e => setField("city", e.target.value)} />
            </div>
            <div>
              <label className={lbl}>State</label>
              <input type="text" className={inp} placeholder="KY" maxLength={2}
                value={form.state} onChange={e => setField("state", e.target.value.toUpperCase())} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice Builder Modal (two-panel) ────────────────────────────────────────
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
  const [activeSection, setActiveSection] = useState<Section>(null);

  const selectedClient = clients.find(c => String(c.id) === form.clientId);
  const selectedJob    = jobs.find(j => String(j.id) === form.jobId);
  const clientName = isNewClient ? clientInput : (selectedClient?.name ?? "");
  const jobTitle   = selectedJob?.title ?? "";

  const SECTION_TABS: { key: Section; label: string; icon: React.ElementType }[] = [
    { key: "header",    label: "Dates",   icon: Calendar },
    { key: "billing",   label: "Client",  icon: User     },
    { key: "lineitems", label: "Items",   icon: Receipt  },
    { key: "finalize",  label: "Tax/Notes", icon: StickyNote },
  ];

  return (
    <form onSubmit={onSubmit} className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-900">New Invoice</h2>
          <p className="text-xs text-gray-400 mt-0.5">Click sections on the invoice to fill them in</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm bg-amber-500 text-white hover:bg-amber-600 shadow-md transition-all active:scale-95 disabled:opacity-60">
            {submitting ? "Saving..." : <><Check className="w-4 h-4" /> Save Invoice</>}
          </button>
        </div>
      </div>

      {formError && (
        <div className="mx-6 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex-shrink-0 flex items-center gap-2">
          <X className="w-4 h-4 flex-shrink-0" /> {formError}
        </div>
      )}

      {/* Two-panel body */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Invoice preview */}
        <div className="w-[55%] overflow-y-auto bg-gray-50 border-r border-gray-100 p-5">
          <InvoicePreview
            form={form} lineItems={lineItems} settings={settings}
            previewNumber={previewNumber} clientName={clientName} jobTitle={jobTitle}
            activeSection={activeSection} onSectionClick={setActiveSection}
          />
        </div>

        {/* Right: Section editor */}
        <div className="w-[45%] flex flex-col min-h-0">
          {/* Section tab strip */}
          <div className="flex border-b border-gray-100 bg-white flex-shrink-0">
            {SECTION_TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key} type="button"
                onClick={() => setActiveSection(key)}
                className={`flex-1 flex flex-col items-center py-2.5 text-[11px] font-semibold transition-colors border-b-2 ${
                  activeSection === key
                    ? "border-amber-500 text-amber-600 bg-amber-50"
                    : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon className="w-3.5 h-3.5 mb-0.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-5">
            {activeSection === null    && <WelcomePanel />}
            {activeSection === "header"    && <HeaderPanel form={form} setField={setField} />}
            {activeSection === "billing"   && (
              <BillingPanel
                form={form} setField={setField}
                clients={clients} jobs={jobs}
                clientInput={clientInput} setClientInput={setClientInput}
                isNewClient={isNewClient} setIsNewClient={setIsNewClient}
              />
            )}
            {activeSection === "lineitems" && (
              <LineItemsPanel lineItems={lineItems} setLineItems={setLineItems} />
            )}
            {activeSection === "finalize"  && <FinalizePanel form={form} setField={setField} />}
          </div>
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

  const s = settings as any;
  const prefix      = s?.invoicePrefix      ?? "INV-2026-";
  const nextNum     = s?.invoiceNextNumber  ?? 1001;
  const previewNumber = `${prefix}${nextNum}`;

  const setField = useCallback((k: string, v: string) => {
    setFormState(f => ({ ...f, [k]: v }));
  }, []);

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
          clientId: resolvedClientId,
          jobId:    form.jobId    ? parseInt(form.jobId)    : undefined,
          issueDate: form.issueDate,
          dueDate:  form.dueDate  || undefined,
          status:   form.status   as any,
          taxRate:  form.taxRate  ? parseFloat(form.taxRate) : undefined,
          city:     form.city     || undefined,
          state:    form.state    || undefined,
          notes:    form.notes    || undefined,
          terms:    form.terms    || undefined,
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

  async function handleDelete(id: number) {
    if (!confirm("Delete this invoice?")) return;
    await deleteInvoice.mutateAsync({ id });
    queryClient.invalidateQueries();
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
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading invoices...</td></tr>
                ) : !(invoices as any[])?.length ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />No invoices found
                  </td></tr>
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
                          onChange={e => handleStatusChange(inv.id, e.target.value)}
                          className={`inline-flex px-2 py-1 rounded-md text-xs font-semibold tracking-wide uppercase border-0 cursor-pointer ${STATUS_COLORS[inv.status] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {["draft","sent","paid","overdue","cancelled"].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button onClick={() => handleDelete(inv.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )
              ) : loadingTax ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading...</td></tr>
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
          <div className="relative w-full max-w-5xl bg-white shadow-2xl rounded-2xl flex flex-col"
            style={{ height: "min(90vh, 760px)" }}>
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
    </div>
  );
}
