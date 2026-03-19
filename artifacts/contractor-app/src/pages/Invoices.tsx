import { useState } from "react";
import {
  useListInvoices,
  useGetInvoiceTaxReport,
  useCreateInvoice,
  useListClients,
  useListJobs,
  useUpdateInvoiceStatus,
  useDeleteInvoice,
  useGetSettings,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FileText, Download, Plus, Trash2, X, Building2, Printer } from "lucide-react";

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

function InvoicePreview({
  form,
  lineItems,
  subtotal,
  taxAmount,
  total,
  clientName,
  jobTitle,
  settings,
  previewNumber,
}: {
  form: any;
  lineItems: LineItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  clientName: string;
  jobTitle: string;
  settings: any;
  previewNumber: string;
}) {
  const companyName = settings?.businessName || "Your LLC Name";
  const companyEmail = settings?.businessEmail || "";
  const companyPhone = settings?.businessPhone || "";
  const companyAddress = settings?.businessAddress || "";
  const companyCity = settings?.businessCity || "";
  const companyState = settings?.businessState || "KY";
  const companyZip = settings?.businessZip || "";

  const filledLines = lineItems.filter((l) => l.description.trim());

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden text-gray-900 text-[13px] font-sans select-none w-full">
      <div className="h-2 bg-gradient-to-r from-amber-500 to-amber-400" />

      <div className="px-8 py-7">
        <div className="flex justify-between items-start mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-5 h-5 text-amber-500" />
              <span className="text-xl font-bold text-gray-900 tracking-tight">{companyName}</span>
            </div>
            {companyAddress && (
              <p className="text-xs text-gray-500 leading-relaxed mt-1">
                {companyAddress}<br />
                {[companyCity, companyState, companyZip].filter(Boolean).join(", ")}
              </p>
            )}
            {companyEmail && <p className="text-xs text-gray-500 mt-0.5">{companyEmail}</p>}
            {companyPhone && <p className="text-xs text-gray-500">{companyPhone}</p>}
          </div>
          <div className="text-right">
            <p className="text-3xl font-extrabold tracking-widest text-gray-300 uppercase">Invoice</p>
            <p className="text-sm font-bold text-amber-600 mt-1">{previewNumber}</p>
            <div className="mt-2 space-y-0.5 text-xs text-gray-500">
              {form.issueDate && (
                <p>
                  <span className="font-medium text-gray-700">Date: </span>
                  {formatDate(form.issueDate)}
                </p>
              )}
              {form.dueDate && (
                <p>
                  <span className="font-medium text-gray-700">Due: </span>
                  {formatDate(form.dueDate)}
                </p>
              )}
              {form.terms && (
                <p>
                  <span className="font-medium text-gray-700">Terms: </span>
                  {form.terms}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-7">
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Bill To</p>
            {clientName ? (
              <p className="font-semibold text-gray-900">{clientName}</p>
            ) : (
              <p className="text-gray-300 italic">Client name</p>
            )}
            {jobTitle && <p className="text-xs text-gray-500 mt-0.5">Re: {jobTitle}</p>}
          </div>
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <p className="text-[10px] uppercase tracking-widest font-bold text-amber-400 mb-2">Status</p>
            <span
              className={`inline-flex px-2.5 py-1 rounded-md text-xs font-bold tracking-wide uppercase ${STATUS_COLORS[form.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {form.status || "Draft"}
            </span>
          </div>
        </div>

        <table className="w-full text-xs mb-5">
          <thead>
            <tr className="border-b-2 border-gray-900">
              <th className="text-left py-2 font-bold uppercase tracking-wide text-gray-700 pb-2 w-[50%]">Description</th>
              <th className="text-right py-2 font-bold uppercase tracking-wide text-gray-700 w-[15%]">Qty</th>
              <th className="text-right py-2 font-bold uppercase tracking-wide text-gray-700 w-[20%]">Unit Price</th>
              <th className="text-right py-2 font-bold uppercase tracking-wide text-gray-700 w-[15%]">Total</th>
            </tr>
          </thead>
          <tbody>
            {filledLines.length > 0 ? (
              filledLines.map((l, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                  <td className="py-2 pr-4 text-gray-800">{l.description}</td>
                  <td className="py-2 text-right text-gray-600">{l.quantity}</td>
                  <td className="py-2 text-right text-gray-600">{formatCurrency(l.unitPrice)}</td>
                  <td className="py-2 text-right font-semibold text-gray-900">{formatCurrency(l.quantity * l.unitPrice)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="py-6 text-center text-gray-300 italic">
                  Line items will appear here...
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="flex justify-end mb-6">
          <div className="w-56 space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {parseFloat(form.taxRate) > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Tax ({form.taxRate}%)</span>
                <span>{formatCurrency(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-sm text-gray-900 border-t-2 border-gray-900 pt-2 mt-1">
              <span>Total Due</span>
              <span className="text-amber-600">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {form.notes && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">Notes</p>
            <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{form.notes}</p>
          </div>
        )}

        {form.terms && (
          <div className="border-t border-gray-100 pt-3 mt-3">
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">Payment Terms</p>
            <p className="text-gray-600">{form.terms}</p>
          </div>
        )}
      </div>

      <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-500" />
    </div>
  );
}

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
  const updateStatus = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();

  const [form, setForm] = useState({
    clientId: "",
    jobId: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    status: "draft",
    taxRate: "",
    notes: "",
    terms: "Net 30",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const subtotal = lineItems.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxRate = parseFloat(form.taxRate) || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const selectedClient = (clients as any[]).find((c: any) => String(c.id) === form.clientId);
  const selectedJob = (jobs as any[]).find((j: any) => String(j.id) === form.jobId);
  const filteredJobs = form.clientId
    ? (jobs as any[]).filter((j: any) => String(j.clientId) === form.clientId)
    : (jobs as any[]);

  const prefix = (settings as any)?.invoicePrefix ?? "INV-2026-";
  const nextNum = (settings as any)?.invoiceNextNumber ?? 1001;
  const previewNumber = `${prefix}${nextNum}`;

  function setField(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
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
    setLineItems((ls) => ls.filter((_, idx) => idx !== i));
  }

  function resetForm() {
    setForm({
      clientId: "",
      jobId: "",
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      status: "draft",
      taxRate: "",
      notes: "",
      terms: "Net 30",
    });
    setLineItems([emptyLine()]);
    setFormError("");
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
      await createInvoice.mutateAsync({
        data: {
          clientId: form.clientId ? parseInt(form.clientId) : undefined,
          jobId: form.jobId ? parseInt(form.jobId) : undefined,
          issueDate: form.issueDate,
          dueDate: form.dueDate || undefined,
          status: form.status as any,
          taxRate: form.taxRate ? parseFloat(form.taxRate) : undefined,
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

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !submitting && setOpen(false)} />

          <div className="relative ml-auto flex h-full w-full max-w-[1100px] bg-background shadow-2xl">
            <form
              onSubmit={handleSubmit}
              className="flex w-full h-full overflow-hidden"
            >
              <div className="w-[420px] flex-shrink-0 border-r border-border flex flex-col h-full">
                <div className="px-6 pt-6 pb-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-xl font-display font-bold text-foreground">New Invoice</h2>
                  <button type="button" onClick={() => !submitting && setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client</label>
                      <select
                        value={form.clientId}
                        onChange={(e) => { setField("clientId", e.target.value); setField("jobId", ""); }}
                        className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">No client</option>
                        {(clients as any[]).map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Job</label>
                      <select
                        value={form.jobId}
                        onChange={(e) => setField("jobId", e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">No job</option>
                        {filteredJobs.map((j: any) => (
                          <option key={j.id} value={j.id}>{j.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Issue Date</label>
                      <Input type="date" value={form.issueDate} onChange={(e) => setField("issueDate", e.target.value)} required className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Due Date</label>
                      <Input type="date" value={form.dueDate} onChange={(e) => setField("dueDate", e.target.value)} className="h-9 text-sm" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</label>
                      <select
                        value={form.status}
                        onChange={(e) => setField("status", e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Terms</label>
                      <select
                        value={form.terms}
                        onChange={(e) => setField("terms", e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option>Due on receipt</option>
                        <option>Net 15</option>
                        <option>Net 30</option>
                        <option>Net 60</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Line Items</label>
                      <button type="button" onClick={addLine} className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                        <Plus className="w-3 h-3" /> Add row
                      </button>
                    </div>
                    <div className="rounded-xl border border-border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 text-muted-foreground">
                          <tr>
                            <th className="px-2 py-2 text-left font-semibold uppercase w-[44%]">Description</th>
                            <th className="px-2 py-2 text-right font-semibold uppercase w-[14%]">Qty</th>
                            <th className="px-2 py-2 text-right font-semibold uppercase w-[22%]">Price</th>
                            <th className="px-2 py-2 text-right font-semibold uppercase w-[16%]">Total</th>
                            <th className="w-[4%]"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {lineItems.map((l, i) => (
                            <tr key={i}>
                              <td className="px-1.5 py-1.5">
                                <input
                                  type="text"
                                  placeholder="Description"
                                  value={l.description}
                                  onChange={(e) => setLine(i, "description", e.target.value)}
                                  className="w-full px-1.5 py-1 rounded border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                              </td>
                              <td className="px-1.5 py-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={l.quantity}
                                  onChange={(e) => setLine(i, "quantity", e.target.value)}
                                  className="w-full px-1.5 py-1 rounded border border-border bg-background text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                              </td>
                              <td className="px-1.5 py-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={l.unitPrice}
                                  onChange={(e) => setLine(i, "unitPrice", e.target.value)}
                                  className="w-full px-1.5 py-1 rounded border border-border bg-background text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right font-medium text-foreground">
                                {formatCurrency(l.quantity * l.unitPrice)}
                              </td>
                              <td className="px-1 text-center">
                                {lineItems.length > 1 && (
                                  <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive">
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tax Rate (%)</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 6"
                      value={form.taxRate}
                      onChange={(e) => setField("taxRate", e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
                    <textarea
                      placeholder="Any notes for the client..."
                      value={form.notes}
                      onChange={(e) => setField("notes", e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                  </div>

                  {formError && <p className="text-sm text-destructive font-medium">{formError}</p>}
                </div>

                <div className="px-6 py-4 border-t border-border flex gap-3 justify-end bg-card">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95 text-sm disabled:opacity-60"
                  >
                    {submitting ? "Creating..." : "Create Invoice"}
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col h-full bg-muted/30 overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-card">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-medium text-foreground">Live Preview</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Printer className="w-4 h-4" /> Print
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  <InvoicePreview
                    form={form}
                    lineItems={lineItems}
                    subtotal={subtotal}
                    taxAmount={taxAmount}
                    total={total}
                    clientName={selectedClient?.name ?? ""}
                    jobTitle={selectedJob?.title ?? ""}
                    settings={settings}
                    previewNumber={previewNumber}
                  />
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
