import { useState } from "react";
import { useClientProfile, useUpdateClientServiceDate } from "@workspace/api-client-react";
import {
  X, Phone, Mail, MapPin, Users, Briefcase, Receipt, CreditCard,
  Route, Calendar, Clock, ChevronRight, Edit2, Check, RefreshCw,
  Link as LinkIcon, DollarSign,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useUserPermissions } from "@/contexts/UserPermissions";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Tab = "overview" | "jobs" | "invoices" | "payments" | "route";

const TAB_CONFIG: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview",  label: "Overview",  icon: Users },
  { id: "jobs",      label: "Jobs",      icon: Briefcase },
  { id: "invoices",  label: "Invoices",  icon: Receipt },
  { id: "payments",  label: "Payments",  icon: CreditCard },
  { id: "route",     label: "Route",     icon: Route },
];

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface Props {
  clientId: number | null;
  onClose: () => void;
  onAddToRoute?: (clientId: number) => void;
}

export function ClientProfileDrawer({ clientId, onClose, onAddToRoute }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [editingServiceDate, setEditingServiceDate] = useState(false);
  const [serviceDateVal, setServiceDateVal] = useState("");
  const [serviceIntervalVal, setServiceIntervalVal] = useState("");
  const [oiFormOpen, setOiFormOpen] = useState(false);
  const [oiAmount, setOiAmount] = useState("");
  const [oiDate, setOiDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [oiMethod, setOiMethod] = useState("cash");
  const [oiDescription, setOiDescription] = useState("");
  const [oiSaving, setOiSaving] = useState(false);
  const [oiError, setOiError] = useState<string | null>(null);

  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const { toast } = useToast();
  const { canEdit } = useUserPermissions();
  const updateServiceDate = useUpdateClientServiceDate();

  const { data, isLoading, refetch } = useClientProfile(clientId);

  const client = data?.client;
  const summary = data?.summary;

  function handleServiceDateSave() {
    if (!clientId) return;
    updateServiceDate.mutate(
      {
        id: clientId,
        nextServiceDate: serviceDateVal || null,
        serviceIntervalMonths: serviceIntervalVal ? parseInt(serviceIntervalVal) : null,
      },
      {
        onSuccess: () => {
          setEditingServiceDate(false);
          refetch();
          toast({ title: "Service schedule saved" });
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      }
    );
  }

  function openEditServiceDate() {
    setServiceDateVal(client?.nextServiceDate ?? "");
    setServiceIntervalVal(client?.serviceIntervalMonths?.toString() ?? "");
    setEditingServiceDate(true);
  }

  function openOIForm() {
    setOiAmount("");
    setOiDate(new Date().toISOString().split("T")[0]);
    setOiMethod("cash");
    setOiDescription("");
    setOiError(null);
    setOiFormOpen(true);
  }

  function closeOIForm() {
    setOiFormOpen(false);
    setOiError(null);
  }

  async function handleSaveOI(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    const amount = parseFloat(oiAmount);
    if (isNaN(amount) || amount <= 0) {
      setOiError("Enter a valid amount.");
      return;
    }
    if (!oiDate) {
      setOiError("Enter a date.");
      return;
    }
    if (!oiDescription.trim()) {
      setOiError("Description is required.");
      return;
    }
    setOiSaving(true);
    setOiError(null);
    try {
      const res = await fetch(`${BASE}/api/other-income`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: oiAmount,
          date: oiDate,
          paymentMethod: oiMethod,
          description: oiDescription.trim(),
          clientId: client.id,
        }),
      });
      if (!res.ok) {
        let msg = "Failed to save. Please try again.";
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch { /* ignore parse error */ }
        setOiError(msg);
        return;
      }
      closeOIForm();
      refetch();
      toast({ title: "Other income added" });
    } catch {
      setOiError("Network error. Please try again.");
    } finally {
      setOiSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-xl bg-card shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border flex-shrink-0">
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="h-7 w-48 bg-muted animate-pulse rounded-lg" />
            ) : (
              <h2 className="text-xl font-bold font-display text-foreground truncate">{client?.name ?? "Client"}</h2>
            )}
            {summary && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {summary.totalJobs} job{summary.totalJobs !== 1 ? "s" : ""} ·{" "}
                {summary.totalInvoices} invoice{summary.totalInvoices !== 1 ? "s" : ""} ·{" "}
                {formatCents(summary.totalRevenueCents)} collected
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button onClick={() => refetch()} className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border flex-shrink-0 overflow-x-auto">
          {TAB_CONFIG.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : !client ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Client not found</div>
          ) : (
            <>
              {tab === "overview" && (
                <div className="p-5 space-y-5">
                  {/* Contact info */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</h3>
                    <div className="bg-muted/40 rounded-xl p-4 space-y-2">
                      {client.phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-primary/60 flex-shrink-0" />
                          <a href={`tel:${client.phone}`} className="hover:text-primary transition-colors">{client.phone}</a>
                        </div>
                      )}
                      {client.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-4 h-4 text-primary/60 flex-shrink-0" />
                          <a href={`mailto:${client.email}`} className="hover:text-primary transition-colors truncate">{client.email}</a>
                        </div>
                      )}
                      {(client.address || client.city) && (
                        <div className="flex items-start gap-2 text-sm">
                          <MapPin className="w-4 h-4 text-primary/60 flex-shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">
                            {client.address && <>{client.address}<br /></>}
                            {[client.city, client.state, client.zip].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      )}
                      {!client.phone && !client.email && !client.address && (
                        <p className="text-sm text-muted-foreground">No contact details</p>
                      )}
                    </div>
                  </div>

                  {/* Service schedule */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Service Schedule</h3>
                      <button onClick={openEditServiceDate} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                    </div>
                    {editingServiceDate ? (
                      <div className="bg-muted/40 rounded-xl p-4 space-y-3">
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Next Service Date</label>
                          <input
                            type="date"
                            value={serviceDateVal}
                            onChange={e => setServiceDateVal(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Revisit interval (months)</label>
                          <input
                            type="number"
                            min={1}
                            max={60}
                            value={serviceIntervalVal}
                            onChange={e => setServiceIntervalVal(e.target.value)}
                            placeholder="e.g. 12"
                            className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleServiceDateSave}
                            disabled={updateServiceDate.isPending}
                            className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" /> Save
                          </button>
                          <button
                            onClick={() => setEditingServiceDate(false)}
                            className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-muted/40 rounded-xl p-4 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Next Service</p>
                          <p className={cn("text-sm font-medium mt-0.5", client.nextServiceDate ? "text-foreground" : "text-muted-foreground/60")}>
                            {client.nextServiceDate ? formatDate(client.nextServiceDate) : "Not set"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Interval</p>
                          <p className={cn("text-sm font-medium mt-0.5", client.serviceIntervalMonths ? "text-foreground" : "text-muted-foreground/60")}>
                            {client.serviceIntervalMonths ? `Every ${client.serviceIntervalMonths} mo` : "Not set"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Summary stats */}
                  {summary && (
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Jobs", value: summary.totalJobs, color: "text-blue-600" },
                        { label: "Invoices Paid", value: `${summary.paidInvoices}/${summary.totalInvoices}`, color: "text-emerald-600" },
                        { label: "Collected", value: formatCents(summary.totalRevenueCents), color: "text-amber-600" },
                      ].map(s => (
                        <div key={s.label} className="bg-muted/40 rounded-xl p-3 text-center">
                          <p className={cn("text-lg font-bold", s.color)}>{s.value}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {client.notes && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</h3>
                      <div className="bg-muted/40 rounded-xl p-4 text-sm text-muted-foreground whitespace-pre-wrap">{client.notes}</div>
                    </div>
                  )}

                  {/* Linked prospects */}
                  {(data?.linkedProspects?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prospect History</h3>
                      <div className="space-y-2">
                        {data!.linkedProspects.map(p => (
                          <Link
                            key={p.id}
                            href={`${BASE}/prospects`}
                            className="flex items-center justify-between bg-muted/40 rounded-xl p-3 hover:bg-muted/70 transition-colors group"
                          >
                            <div>
                              <p className="text-sm font-medium">{p.contactName || p.address}</p>
                              <p className="text-xs text-muted-foreground">{p.address} · {p.status}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add to Route button */}
                  {onAddToRoute && (
                    <button
                      onClick={() => onAddToRoute(client.id)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-primary/40 rounded-xl text-sm text-primary hover:bg-primary/5 transition-colors"
                    >
                      <Route className="w-4 h-4" /> Add to Route
                    </button>
                  )}
                </div>
              )}

              {tab === "jobs" && (
                <div className="p-5 space-y-3">
                  {(data?.jobs?.length ?? 0) === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                      <Briefcase className="w-8 h-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No jobs yet</p>
                    </div>
                  ) : (
                    data!.jobs.map(job => (
                      <Link
                        key={job.id}
                        href={`${BASE}/jobs?openJob=${job.id}`}
                        onClick={onClose}
                        className="block bg-muted/40 rounded-xl p-4 hover:bg-muted/70 transition-colors group cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{job.title}</p>
                            {job.address && <p className="text-xs text-muted-foreground truncate">{job.address}</p>}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className={cn(
                              "text-xs px-2 py-0.5 rounded-full font-medium",
                              job.status === "active" ? "bg-blue-100 text-blue-700" :
                              job.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                              "bg-muted text-muted-foreground"
                            )}>
                              {job.status}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                        {job.scheduledDate && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {formatDate(job.scheduledDate)}
                          </p>
                        )}
                      </Link>
                    ))
                  )}
                </div>
              )}

              {tab === "invoices" && (
                <div className="p-5 space-y-3">
                  {(data?.invoices?.length ?? 0) === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                      <Receipt className="w-8 h-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No invoices yet</p>
                    </div>
                  ) : (
                    data!.invoices.map(inv => {
                      const lineItems = Array.isArray(inv.lineItems) ? inv.lineItems as Array<{ quantity: number; unitPrice: number; description: string }> : [];
                      const total = lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
                      return (
                        <Link
                          key={inv.id}
                          href={`${BASE}/invoices?openInvoice=${inv.id}`}
                          onClick={onClose}
                          className="block bg-muted/40 rounded-xl p-4 hover:bg-muted/70 transition-colors group cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">#{inv.invoiceNumber}</p>
                              {inv.issueDate && <p className="text-xs text-muted-foreground">{formatDate(inv.issueDate)}</p>}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="text-right">
                                <p className="text-sm font-bold">{formatCurrency(total)}</p>
                                <span className={cn(
                                  "text-xs px-2 py-0.5 rounded-full font-medium",
                                  inv.status === "paid" ? "bg-emerald-100 text-emerald-700" :
                                  inv.status === "overdue" ? "bg-red-100 text-red-700" :
                                  "bg-amber-100 text-amber-700"
                                )}>
                                  {inv.status}
                                </span>
                              </div>
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors flex-shrink-0" />
                            </div>
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>
              )}

              {tab === "payments" && (() => {
                const startMs = filterStart ? new Date(filterStart).getTime() : null;
                const endMs = filterEnd ? new Date(filterEnd + "T23:59:59").getTime() : null;

                function inRange(dateStr: string | null | undefined): boolean {
                  if (!dateStr) return true;
                  const t = new Date(dateStr).getTime();
                  if (startMs !== null && t < startMs) return false;
                  if (endMs !== null && t > endMs) return false;
                  return true;
                }

                const filteredSquare = (data?.squarePayments ?? []).filter(p => inRange(p.paidAt));
                const filteredOther = (data?.otherIncome ?? []).filter(oi => inRange(oi.date));
                const isFiltered = !!(filterStart || filterEnd);

                const filteredSquareCents = filteredSquare.reduce((s, p) => s + p.amountCents, 0);
                const filteredOtherCents = filteredOther.reduce((s, oi) => s + Math.round(parseFloat(oi.amount) * 100), 0);
                const filteredTotalCents = filteredSquareCents + filteredOtherCents;

                return (
                <div className="p-5 space-y-5">
                  {/* Date range filter */}
                  <div className="bg-muted/40 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" /> Filter by date
                      </p>
                      {isFiltered && (
                        <button
                          onClick={() => { setFilterStart(""); setFilterEnd(""); }}
                          className="text-xs text-primary hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={filterStart}
                        onChange={e => setFilterStart(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="From"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <input
                        type="date"
                        value={filterEnd}
                        onChange={e => setFilterEnd(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="To"
                      />
                    </div>
                  </div>

                  {/* Total collected summary */}
                  {summary && (
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                          {isFiltered ? "Total in range" : "Total collected"}
                        </p>
                        <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                          {isFiltered ? formatCents(filteredTotalCents) : formatCents(summary.totalRevenueCents)}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-800">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                          <CreditCard className="w-3 h-3" />
                          <span>Square: {isFiltered ? formatCents(filteredSquareCents) : formatCents(summary.squareRevenueCents)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                          <DollarSign className="w-3 h-3" />
                          <span>Other: {isFiltered ? formatCents(filteredOtherCents) : formatCents(summary.otherRevenueCents)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Square Payments */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" /> Square Payments
                    </h3>
                    {filteredSquare.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 gap-2 text-center bg-muted/20 rounded-xl">
                        <p className="text-sm text-muted-foreground">
                          {isFiltered ? "No Square payments in this range" : "No Square payments linked"}
                        </p>
                        {!isFiltered && client.email && (
                          <p className="text-xs text-muted-foreground/70 max-w-xs">
                            Payments with email <span className="font-mono text-xs">{client.email}</span> will appear here automatically when matched.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredSquare.map(p => (
                          <div key={p.id} className="bg-muted/40 rounded-xl p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-bold text-emerald-600">{formatCents(p.amountCents)}</p>
                                <p className="text-xs text-muted-foreground">{formatDate(p.paidAt)}</p>
                              </div>
                              {p.description && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{p.description}</p>}
                            </div>
                            {p.invoiceNumber && (
                              <p className="text-xs text-muted-foreground mt-1">Invoice #{p.invoiceNumber}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Other Income */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5" /> Other Income
                      </h3>
                      {canEdit("invoices") && !oiFormOpen && (
                        <button
                          onClick={openOIForm}
                          className="text-xs text-primary hover:underline font-medium"
                        >
                          + Add
                        </button>
                      )}
                    </div>
                    {oiFormOpen && (
                      <form onSubmit={handleSaveOI} className="bg-muted/20 border border-border rounded-xl p-4 space-y-3">
                        <h4 className="text-xs font-semibold text-foreground">New Other Income</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Amount *</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                placeholder="0.00"
                                value={oiAmount}
                                onChange={(e) => setOiAmount(e.target.value)}
                                className="w-full pl-6 pr-2 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                required
                                autoFocus
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Date *</label>
                            <input
                              type="date"
                              value={oiDate}
                              onChange={(e) => setOiDate(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                              required
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Payment Method</label>
                          <select
                            value={oiMethod}
                            onChange={(e) => setOiMethod(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                          >
                            <option value="cash">Cash</option>
                            <option value="check">Check</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Description *</label>
                          <input
                            type="text"
                            placeholder="e.g. Pre-app cash payment, retainer…"
                            value={oiDescription}
                            onChange={(e) => setOiDescription(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                            required
                          />
                        </div>
                        {oiError && (
                          <p className="text-xs text-destructive">{oiError}</p>
                        )}
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={closeOIForm}
                            className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={oiSaving}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors font-medium"
                          >
                            {oiSaving ? <><span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</> : <><Check className="w-3 h-3" /> Save</>}
                          </button>
                        </div>
                      </form>
                    )}

                    {filteredOther.length === 0 && !oiFormOpen ? (
                      <div className="flex flex-col items-center justify-center py-6 gap-2 text-center bg-muted/20 rounded-xl">
                        <p className="text-sm text-muted-foreground">
                          {isFiltered ? "No other income in this range" : "No other income linked"}
                        </p>
                      </div>
                    ) : filteredOther.length > 0 ? (
                      <div className="space-y-2">
                        {filteredOther.map((oi) => (
                          <Link
                            key={oi.id}
                            href={`${BASE}/accounting?module=other_income&editId=${oi.id}&year=${new Date(oi.date).getFullYear()}`}
                            onClick={onClose}
                            className="block bg-muted/40 rounded-xl p-4 hover:bg-muted/70 transition-colors group cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-emerald-600">{formatCurrency(parseFloat(oi.amount))}</p>
                                <p className="text-xs text-muted-foreground">{formatDate(oi.date)}</p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                                  {oi.paymentMethod.replace(/_/g, " ")}
                                </span>
                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                              </div>
                            </div>
                            {oi.description && (
                              <p className="text-xs text-muted-foreground mt-1 truncate">{oi.description}</p>
                            )}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                );
              })()}

              {tab === "route" && (
                <div className="p-5 space-y-3">
                  {onAddToRoute && (
                    <button
                      onClick={() => onAddToRoute(client.id)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-primary/40 rounded-xl text-sm text-primary hover:bg-primary/5 transition-colors"
                    >
                      <Route className="w-4 h-4" /> Add to Route
                    </button>
                  )}
                  {(data?.routeStops?.length ?? 0) === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                      <Route className="w-8 h-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No route stops linked</p>
                    </div>
                  ) : (
                    data!.routeStops.map(s => (
                      <div key={s.id} className="bg-muted/40 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{s.title || s.address}</p>
                            {s.title && <p className="text-xs text-muted-foreground truncate">{s.address}</p>}
                          </div>
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0",
                            s.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                            s.status === "scheduled" ? "bg-amber-100 text-amber-700" :
                            "bg-blue-100 text-blue-700"
                          )}>
                            {s.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {s.scheduledDate && (
                            <span className="flex items-center gap-0.5">
                              <Calendar className="w-3 h-3" /> {formatDate(s.scheduledDate)}
                            </span>
                          )}
                          {s.notes && <span className="truncate">{s.notes}</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
