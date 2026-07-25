import { useState, useRef, useEffect, useMemo } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useSearchParams } from "wouter";
import {
  useListInvoices,
  useGetInvoiceTaxReport,
  useUpdateInvoiceStatus,
  useDeleteInvoice,
  useVoidInvoice,
  useGetSettings,
  useCreateInvoicePaymentLink,
  Invoice,
  type InvoiceDraft,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Download, Plus, Trash2, X,
  Check, Eye, AlertTriangle, Ban,
  Paperclip, CreditCard, Copy, ExternalLink, Bell, Search,
} from "lucide-react";
import { InvoicePanel } from "@/components/InvoicePanel";

const STATUS_COLORS: Record<string, string> = {
  paid:          "bg-emerald-100 text-emerald-700",
  partiallyPaid: "bg-emerald-50 text-emerald-600",
  sent:          "bg-blue-100 text-blue-700",
  approved:      "bg-indigo-100 text-indigo-700",
  overdue:       "bg-red-100 text-red-700",
  draft:         "bg-gray-100 text-gray-600",
  cancelled:     "bg-orange-100 text-orange-700",
};



// ─── Delete Confirmation Modal (draft invoices only) ─────────────────────────
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
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-base">Delete draft invoice?</h3>
            <p className="text-sm text-gray-500 mt-1">
              This draft{invoice.clientName ? ` for ${invoice.clientName}` : ""} has never been issued and will be{" "}
              <span className="font-semibold text-red-600">permanently deleted</span>. No invoice number was consumed.
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
            {deleting ? "Deleting…" : "Delete Draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Void Confirmation Modal (issued invoices) ────────────────────────────────
function VoidConfirmModal({
  invoice, onConfirm, onCancel, voiding,
}: {
  invoice: any; onConfirm: () => void; onCancel: () => void; voiding: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-orange-100 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
            <Ban className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-base">Void invoice {invoice.invoiceNumber}?</h3>
            <p className="text-sm text-gray-500 mt-1">
              This invoice will be <span className="font-semibold text-orange-700">permanently voided</span> and kept in your records for audit purposes.{" "}
              The invoice number is preserved in sequence. <span className="font-semibold">This cannot be undone.</span>
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} disabled={voiding}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={voiding}
            className="px-5 py-2 rounded-xl text-sm font-bold bg-orange-600 text-white hover:bg-orange-700 transition-colors shadow disabled:opacity-60 flex items-center gap-2">
            <Ban className="w-3.5 h-3.5" />
            {voiding ? "Voiding…" : "Void Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}


const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Main Invoices page ────────────────────────────────────────────────────────
export default function Invoices() {
  const queryClient = useQueryClient();
  const { activeBusiness, businesses } = useBusiness();
  const [activeTab, setActiveTab] = useState<"all" | "tax">("all");
  const [filterStatus, setFilterStatus] = useState<"active" | "all" | "approved" | "sent" | "partiallyPaid" | "overdue" | "paid">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const { toast } = useToast();
  const prevInvoiceStatuses = useRef<Record<number, string>>({});
  const { data: invoices, isLoading: loadingInvoices } = useListInvoices(
    undefined,
    { query: { refetchInterval: 15_000 } as any },
  );

  useEffect(() => {
    if (!invoices) return;
    const prev = prevInvoiceStatuses.current;
    const newlyPaid = invoices.filter(
      (inv) => inv.status === "paid" && prev[inv.id] !== undefined && prev[inv.id] !== "paid",
    );
    if (newlyPaid.length > 0) {
      newlyPaid.forEach((inv) => {
        toast({
          title: `Invoice ${inv.invoiceNumber} marked Paid`,
          description: (inv.squarePaidAt || inv.stripePaidAt) ? "Square payment received." : "Status updated to paid.",
        });
      });
    }
    const next: Record<number, string> = {};
    invoices.forEach((inv) => { next[inv.id] = inv.status; });
    prevInvoiceStatuses.current = next;
  }, [invoices, toast]);
  const { data: taxReport, isLoading: loadingTax } = useGetInvoiceTaxReport();
  const { data: settings }   = useGetSettings();
  const updateStatus         = useUpdateInvoiceStatus();
  const deleteInvoice        = useDeleteInvoice();
  const voidInvoiceMutation  = useVoidInvoice();
  const createPaymentLink    = useCreateInvoicePaymentLink();

  const [paymentLinkResult, setPaymentLinkResult] = useState<{ url: string; invoiceNumber: string; invoiceId: number; remindersSentAt?: string[] } | null>(null);
  const [generatingLinkId, setGeneratingLinkId] = useState<number | null>(null);
  const [sendingReminderId, setSendingReminderId] = useState<number | null>(null);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  async function handleGetPaymentLink(invoiceId: number, invoiceNumber: string) {
    setGeneratingLinkId(invoiceId);
    try {
      const result = await createPaymentLink.mutateAsync(invoiceId);
      setPaymentLinkResult({ url: result.paymentLinkUrl, invoiceNumber, invoiceId, remindersSentAt: result.invoice?.remindersSentAt ?? [] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      if (result.emailSent) {
        toast({ title: "Payment link created & emailed", description: `Email sent to client for invoice ${invoiceNumber}.` });
      } else if (result.emailWarning) {
        toast({ title: "Payment link created", description: result.emailWarning, variant: "destructive" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create payment link";
      alert(msg);
    } finally {
      setGeneratingLinkId(null);
    }
  }

  async function handleSendReminder(invoiceId: number, invoiceNumber: string) {
    setSendingReminderId(invoiceId);
    try {
      const res = await fetch(`${base}/api/invoices/${invoiceId}/send-reminder`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send reminder");
      toast({ title: "Reminder sent!", description: `Reminder email sent for invoice ${invoiceNumber}.` });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      if (paymentLinkResult?.invoiceId === invoiceId) {
        setPaymentLinkResult(prev => prev ? { ...prev, remindersSentAt: data.invoice?.remindersSentAt ?? [] } : prev);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send reminder";
      toast({ title: "Reminder failed", description: msg, variant: "destructive" });
    } finally {
      setSendingReminderId(null);
    }
  }

  const [newInvoiceDraft, setNewInvoiceDraft] = useState<InvoiceDraft | null>(null);
  const [viewInvoice,  setViewInvoice]  = useState<Invoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [voidTarget,   setVoidTarget]   = useState<any | null>(null);
  const [voiding,      setVoiding]      = useState(false);
  const [showVoided,   setShowVoided]   = useState(false);

  useEffect(() => {
    const openId = searchParams.get("openInvoice");
    if (!openId || !invoices || invoices.length === 0) return;
    const id = parseInt(openId, 10);
    if (!isNaN(id)) {
      const target = invoices.find(inv => inv.id === id) ?? null;
      if (target) {
        setViewInvoice(target);
        setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete("openInvoice"); return n; }, { replace: true });
      }
    }
  }, [searchParams, invoices]);

  // Deep-link: ?newFromJob=<id> → fetch invoice draft and pre-fill InvoicePanel
  useEffect(() => {
    const jobIdParam = searchParams.get("newFromJob");
    if (!jobIdParam) return;
    const jobId = parseInt(jobIdParam, 10);
    if (isNaN(jobId)) return;
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete("newFromJob"); return n; }, { replace: true });
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/jobs/${jobId}/invoice-draft`);
        if (!res.ok) return;
        const draft = await res.json();
        setNewInvoiceDraft(draft);
        setOpen(true);
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const allInvoices = (invoices as any[]) ?? [];

  // Drafts live only on the job card — never on the Invoices page
  const ACTIVE_STATUSES = new Set(["approved", "sent", "partiallyPaid", "overdue", "paid"]);

  const nonVoidedInvoices = useMemo(() =>
    allInvoices.filter((i: any) => i.status !== "cancelled" && i.status !== "draft"),
  [allInvoices]);

  const statusCounts = useMemo(() => ({
    active:       nonVoidedInvoices.filter((i: any) => ACTIVE_STATUSES.has(i.status)).length,
    all:          nonVoidedInvoices.length,
    approved:     nonVoidedInvoices.filter((i: any) => i.status === "approved").length,
    sent:         nonVoidedInvoices.filter((i: any) => i.status === "sent").length,
    partiallyPaid:nonVoidedInvoices.filter((i: any) => i.status === "partiallyPaid").length,
    overdue:      nonVoidedInvoices.filter((i: any) => i.status === "overdue").length,
    paid:         nonVoidedInvoices.filter((i: any) => i.status === "paid").length,
    voided:       allInvoices.filter((i: any) => i.status === "cancelled").length,
  }), [allInvoices, nonVoidedInvoices]);

  const filteredInvoices = useMemo(() => {
    let list = showVoided ? allInvoices.filter((i: any) => i.status !== "draft") : nonVoidedInvoices;
    if (activeBusiness) {
      list = list.filter((inv: any) => inv.businessLine === activeBusiness.slug);
    }
    if (filterStatus === "active") {
      list = list.filter((inv: any) => ACTIVE_STATUSES.has(inv.status));
    } else if (filterStatus !== "all") {
      list = list.filter((inv: any) => inv.status === filterStatus);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((inv: any) =>
        (inv.clientName ?? "").toLowerCase().includes(q) ||
        (inv.invoiceNumber ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [allInvoices, nonVoidedInvoices, filterStatus, searchQuery, activeBusiness, showVoided]);

  const pendingOpenId = useRef<number | null>(null);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    const id = parseInt(openId);
    if (isNaN(id)) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete("open");
      return next;
    }, { replace: true });
    pendingOpenId.current = id;
  }, []);

  useEffect(() => {
    if (!invoices || pendingOpenId.current === null) return;
    const target = invoices.find(inv => inv.id === pendingOpenId.current);
    if (target) {
      pendingOpenId.current = null;
      setViewInvoice(target);
    }
  }, [invoices]);

  // Keep the open panel's invoice in sync with background refetches.
  // The InvoicePanel effect only resets form state when the invoice *id* changes,
  // so updating the object reference here refreshes read-only fields (status badge,
  // toolbar buttons, amountPaid) without wiping the user's draft edits.
  useEffect(() => {
    if (!viewInvoice || !invoices) return;
    const fresh = invoices.find(inv => inv.id === viewInvoice.id);
    if (fresh && fresh !== viewInvoice) {
      setViewInvoice(fresh);
    }
  }, [invoices]);


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

  async function handleVoidConfirmed() {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await voidInvoiceMutation.mutateAsync({ id: voidTarget.id });
      queryClient.invalidateQueries();
      if (viewInvoice?.id === voidTarget.id) setViewInvoice(null);
      toast({ title: `Invoice ${voidTarget.invoiceNumber} voided`, description: "Kept in your audit records." });
    } catch (err: any) {
      toast({ title: "Failed to void invoice", description: err?.message ?? "An error occurred.", variant: "destructive" });
    } finally {
      setVoiding(false);
      setVoidTarget(null);
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
            onClick={() => { setNewInvoiceDraft(null); setOpen(true); }}
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

      {/* Search + status filter (All Invoices tab only) */}
      {activeTab === "all" && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by client or invoice #…"
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-border/60 bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {(["active", "all", "approved", "sent", "partiallyPaid", "overdue", "paid"] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filterStatus === s
                    ? s === "overdue"       ? "bg-red-600 text-white"
                    : s === "paid"          ? "bg-emerald-600 text-white"
                    : s === "partiallyPaid" ? "bg-emerald-500 text-white"
                    : s === "sent"          ? "bg-blue-600 text-white"
                    : s === "approved"      ? "bg-indigo-600 text-white"
                    : "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {s === "active" ? "All Active"
                  : s === "all" ? "All"
                  : s === "partiallyPaid" ? "Partial"
                  : s === "approved" ? "Approved"
                  : s.charAt(0).toUpperCase() + s.slice(1)}
                <span className="ml-1.5 opacity-80">{statusCounts[s]}</span>
              </button>
            ))}
            {statusCounts.voided > 0 && (
              <button
                onClick={() => setShowVoided(v => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  showVoided ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {showVoided ? "Hide Voided" : "Show Voided"}
                <span className="ml-1.5 opacity-80">{statusCounts.voided}</span>
              </button>
            )}
          </div>
        </div>
      )}

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
                ) : !allInvoices.length ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />No invoices yet
                  </td></tr>
                ) : !filteredInvoices.length ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No invoices match your search or filter
                  </td></tr>
                ) : (
                  filteredInvoices.map((inv: any) => {
                    const isVoided = inv.status === "cancelled";
                    const isDraft = !inv.invoiceNumber;
                    return (
                    <tr key={inv.id}
                      onClick={() => setViewInvoice(inv)}
                      className={`hover:bg-muted/30 transition-colors cursor-pointer group ${isVoided ? "opacity-50" : ""}`}>
                      <td className="px-6 py-4 font-medium text-foreground group-hover:text-primary transition-colors">
                        <div className="flex items-center gap-2">
                          <span className={isVoided ? "line-through text-muted-foreground" : ""}>
                            {inv.invoiceNumber ?? (
                              <span className="italic text-muted-foreground font-normal">Draft</span>
                            )}
                          </span>
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
                      <td className={`px-6 py-4 text-right font-display font-semibold ${isVoided ? "text-muted-foreground line-through" : "text-foreground"}`}>{formatCurrency(inv.total)}</td>
                      <td className="px-6 py-4 text-center" onClick={e => e.stopPropagation()}>
                        {isVoided ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-200">
                            <Ban className="w-3 h-3" /> Voided
                          </span>
                        ) : inv.status === "paid" ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                              <Check className="w-3 h-3" /> Paid
                            </span>
                            {(inv.squarePaidAt || inv.stripePaidAt) && (
                              <span className="text-[10px] text-emerald-600 font-medium">
                                {formatDate((inv.squarePaidAt ?? inv.stripePaidAt)!)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <select
                            value={inv.status}
                            onChange={e => handleStatusChange(inv.id, e.target.value)}
                            className={`inline-flex px-2 py-1 rounded-md text-xs font-semibold tracking-wide uppercase border-0 cursor-pointer ${STATUS_COLORS[inv.status] ?? "bg-gray-100 text-gray-600"}`}
                          >
                            {["draft","sent","paid","overdue"].map(st => (
                              <option key={st} value={st}>{st}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => setViewInvoice(inv)}
                            className="text-muted-foreground hover:text-primary transition-colors" title="View invoice">
                            <Eye className="w-4 h-4" />
                          </button>
                          {!isVoided && inv.status !== "paid" && (() => {
                            const payUrl = inv.squarePaymentLinkUrl ?? inv.stripePaymentLinkUrl ?? null;
                            const squareUrl = inv.squarePaymentLinkUrl;
                            return (<>
                              {payUrl ? (
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(payUrl);
                                    setPaymentLinkResult({ url: payUrl, invoiceNumber: inv.invoiceNumber, invoiceId: inv.id, remindersSentAt: inv.remindersSentAt ?? [] });
                                  }}
                                  className="text-emerald-600 hover:text-emerald-700 transition-colors"
                                  title="Copy payment link"
                                >
                                  <CreditCard className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleGetPaymentLink(inv.id, inv.invoiceNumber)}
                                  disabled={generatingLinkId === inv.id}
                                  className="text-muted-foreground hover:text-amber-600 transition-colors disabled:opacity-40"
                                  title="Get payment link"
                                >
                                  {generatingLinkId === inv.id
                                    ? <span className="text-xs">…</span>
                                    : <CreditCard className="w-4 h-4" />
                                  }
                                </button>
                              )}
                              {squareUrl && (
                                <button
                                  onClick={() => handleSendReminder(inv.id, inv.invoiceNumber)}
                                  disabled={sendingReminderId === inv.id}
                                  className="text-muted-foreground hover:text-blue-600 transition-colors disabled:opacity-40"
                                  title="Send reminder email"
                                >
                                  {sendingReminderId === inv.id
                                    ? <span className="text-xs">…</span>
                                    : <Bell className="w-4 h-4" />
                                  }
                                </button>
                              )}
                            </>);
                          })()}
                          {!isVoided && (
                            isDraft ? (
                              <button onClick={() => setDeleteTarget(inv)}
                                className="text-muted-foreground hover:text-destructive transition-colors" title="Delete draft">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ) : (
                              <button onClick={() => setVoidTarget(inv)}
                                className="text-muted-foreground hover:text-orange-600 transition-colors" title="Void invoice">
                                <Ban className="w-4 h-4" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })
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

      {/* New Invoice Panel */}
      <InvoicePanel
        open={open}
        onOpenChange={v => { if (!v) { setOpen(false); setNewInvoiceDraft(null); } }}
        initialData={newInvoiceDraft}
        onSaved={() => { queryClient.invalidateQueries(); }}
      />

      {/* View/Edit Existing Invoice Panel */}
      <InvoicePanel
        open={!!viewInvoice}
        onOpenChange={v => { if (!v) setViewInvoice(null); }}
        existingInvoice={viewInvoice ?? undefined}
        onSaved={() => { setViewInvoice(null); queryClient.invalidateQueries(); }}
        onDelete={() => { setDeleteTarget(viewInvoice); setViewInvoice(null); }}
        onVoid={() => { setVoidTarget(viewInvoice); setViewInvoice(null); }}
        onRevertToDraft={(draftInvoice) => { setViewInvoice(draftInvoice); queryClient.invalidateQueries(); }}
      />

      {/* Delete Confirmation Modal (drafts only) */}
      {deleteTarget && (
        <DeleteConfirmModal
          invoice={deleteTarget}
          deleting={deleting}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Void Confirmation Modal (issued invoices) */}
      {voidTarget && (
        <VoidConfirmModal
          invoice={voidTarget}
          voiding={voiding}
          onConfirm={handleVoidConfirmed}
          onCancel={() => setVoidTarget(null)}
        />
      )}

      {/* Payment Link Modal */}
      {paymentLinkResult && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-emerald-400" />
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Payment Link Ready</h3>
                  <p className="text-sm text-gray-500">Invoice {paymentLinkResult.invoiceNumber}</p>
                </div>
                <button
                  onClick={() => setPaymentLinkResult(null)}
                  className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                <p className="text-xs text-gray-500 mb-1 font-medium">Square Payment Link</p>
                <p className="text-sm text-gray-800 break-all font-mono">{paymentLinkResult.url}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(paymentLinkResult.url);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copy Link
                </button>
                <a
                  href={paymentLinkResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open
                </a>
              </div>

              {/* Send Reminder Now */}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <button
                  onClick={() => handleSendReminder(paymentLinkResult.invoiceId, paymentLinkResult.invoiceNumber)}
                  disabled={sendingReminderId === paymentLinkResult.invoiceId}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl font-semibold text-sm hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  <Bell className="w-4 h-4" />
                  {sendingReminderId === paymentLinkResult.invoiceId ? "Sending…" : "Send Reminder Now"}
                </button>
                {(paymentLinkResult.remindersSentAt ?? []).length > 0 && (
                  <div className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-1">Reminders sent:</p>
                    {(paymentLinkResult.remindersSentAt ?? []).map((ts, i) => (
                      <p key={i} className="text-xs text-gray-600">
                        {new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-400 text-center">
                Share this link with your client. Square will process the payment and send them a receipt.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
