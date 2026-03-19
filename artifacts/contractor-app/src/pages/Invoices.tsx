import { useState } from "react";
import {
  useListInvoices,
  useGetInvoiceTaxReport,
  useCreateInvoice,
  useListClients,
  useListJobs,
  useUpdateInvoiceStatus,
  useDeleteInvoice,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { FileText, Download, Plus, Trash2, X } from "lucide-react";

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
};

export default function Invoices() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"all" | "tax">("all");
  const [open, setOpen] = useState(false);

  const { data: invoices, isLoading: loadingInvoices } = useListInvoices();
  const { data: taxReport, isLoading: loadingTax } = useGetInvoiceTaxReport();
  const { data: clients = [] } = useListClients();
  const { data: jobs = [] } = useListJobs();
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

  const subtotal = lineItems.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxRate = parseFloat(form.taxRate) || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

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

  const filteredJobs = form.clientId
    ? (jobs as any[]).filter((j: any) => String(j.clientId) === form.clientId)
    : (jobs as any[]);

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
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground animate-pulse">
                      Loading invoices...
                    </td>
                  </tr>
                ) : !invoices?.length ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      No invoices found
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
                      <td className="px-6 py-4 text-right font-display font-semibold text-foreground">
                        {formatCurrency(inv.total)}
                      </td>
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
                        <button
                          onClick={() => handleDelete(inv.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete invoice"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )
              ) : loadingTax ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground animate-pulse">
                    Loading tax report...
                  </td>
                </tr>
              ) : !(taxReport as any[])?.length ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No invoices yet
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

      <Sheet open={open} onOpenChange={(v) => { if (!submitting) setOpen(v); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border sticky top-0 bg-card z-10">
            <SheetTitle className="text-xl font-display font-bold">New Invoice</SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Client</label>
                <select
                  value={form.clientId}
                  onChange={(e) => { setField("clientId", e.target.value); setField("jobId", ""); }}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">No client</option>
                  {(clients as any[]).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Job (optional)</label>
                <select
                  value={form.jobId}
                  onChange={(e) => setField("jobId", e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">No job</option>
                  {filteredJobs.map((j: any) => (
                    <option key={j.id} value={j.id}>{j.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Issue Date</label>
                <Input type="date" value={form.issueDate} onChange={(e) => setField("issueDate", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Due Date</label>
                <Input type="date" value={form.dueDate} onChange={(e) => setField("dueDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setField("status", e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Line Items</label>
                <button
                  type="button"
                  onClick={addLine}
                  className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Add row
                </button>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold w-[45%]">Description</th>
                      <th className="px-3 py-2 text-right font-semibold w-[15%]">Qty</th>
                      <th className="px-3 py-2 text-right font-semibold w-[20%]">Unit Price</th>
                      <th className="px-3 py-2 text-right font-semibold w-[15%]">Total</th>
                      <th className="px-1 py-2 w-[5%]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {lineItems.map((l, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            placeholder="Description"
                            value={l.description}
                            onChange={(e) => setLine(i, "description", e.target.value)}
                            className="w-full px-2 py-1 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.quantity}
                            onChange={(e) => setLine(i, "quantity", e.target.value)}
                            className="w-full px-2 py-1 rounded-md border border-border bg-background text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.unitPrice}
                            onChange={(e) => setLine(i, "unitPrice", e.target.value)}
                            className="w-full px-2 py-1 rounded-md border border-border bg-background text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium text-foreground">
                          {formatCurrency(l.quantity * l.unitPrice)}
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          {lineItems.length > 1 && (
                            <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Tax Rate (%)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 6"
                  value={form.taxRate}
                  onChange={(e) => setField("taxRate", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Payment Terms</label>
                <select
                  value={form.terms}
                  onChange={(e) => setField("terms", e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option>Due on receipt</option>
                  <option>Net 15</option>
                  <option>Net 30</option>
                  <option>Net 60</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Notes</label>
              <textarea
                placeholder="Any notes for the client..."
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
              </div>
              {taxRate > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax ({taxRate}%)</span><span>{formatCurrency(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-foreground text-base border-t border-border pt-1.5 mt-1">
                <span>Total</span><span>{formatCurrency(total)}</span>
              </div>
            </div>

            {formError && (
              <p className="text-sm text-destructive font-medium">{formError}</p>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95 disabled:opacity-60"
              >
                {submitting ? "Creating..." : "Create Invoice"}
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
