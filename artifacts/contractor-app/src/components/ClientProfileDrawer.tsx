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
  const { toast } = useToast();
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
                      <div key={job.id} className="bg-muted/40 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{job.title}</p>
                            {job.address && <p className="text-xs text-muted-foreground truncate">{job.address}</p>}
                          </div>
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0",
                            job.status === "active" ? "bg-blue-100 text-blue-700" :
                            job.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                            "bg-muted text-muted-foreground"
                          )}>
                            {job.status}
                          </span>
                        </div>
                        {job.scheduledDate && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {formatDate(job.scheduledDate)}
                          </p>
                        )}
                      </div>
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
                        <div key={inv.id} className="bg-muted/40 rounded-xl p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">#{inv.invoiceNumber}</p>
                              {inv.issueDate && <p className="text-xs text-muted-foreground">{formatDate(inv.issueDate)}</p>}
                            </div>
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
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {tab === "payments" && (
                <div className="p-5 space-y-5">
                  {/* Square Payments */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" /> Square Payments
                    </h3>
                    {(data?.squarePayments?.length ?? 0) === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 gap-2 text-center bg-muted/20 rounded-xl">
                        <p className="text-sm text-muted-foreground">No Square payments linked</p>
                        {client.email && (
                          <p className="text-xs text-muted-foreground/70 max-w-xs">
                            Payments with email <span className="font-mono text-xs">{client.email}</span> will appear here automatically when matched.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {data!.squarePayments.map(p => (
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
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" /> Other Income
                    </h3>
                    {(data?.otherIncome?.length ?? 0) === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 gap-2 text-center bg-muted/20 rounded-xl">
                        <p className="text-sm text-muted-foreground">No other income linked</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {data!.otherIncome.map((oi) => (
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
                    )}
                  </div>
                </div>
              )}

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
