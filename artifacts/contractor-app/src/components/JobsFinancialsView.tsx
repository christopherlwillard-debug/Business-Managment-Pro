import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, BriefcaseBusiness, ChevronDown, ChevronUp, CircleDollarSign, ExternalLink, HardHat, RefreshCw, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Detail = {
  id: number;
  name: string;
  compensationType: string;
  amountOwed: number | null;
  amountPaid: number | null;
  balance: number | null;
  status: string;
};

type FinancialJob = {
  job: { id: number; jobNumber?: number | null; title: string; status: string; clientName?: string | null };
  payment: { status: string; amountDue: number | null; invoiceId: number | null };
  workers: { available: boolean; count: number | null; totalOwed: number | null; details: Detail[] | null };
  subcontractors: { available: boolean; count: number | null; totalOwed: number | null; details: Detail[] | null };
  ownerPay: { supported: boolean; earned: number | null; paid: number | null; remaining: number | null; overpaid: number };
  state: "needs_action" | "waiting_on_payment" | "ready_to_close";
  blockers: string[];
  warnings: string[];
};

type SummaryResponse = {
  jobs: FinancialJob[];
  totals: {
    workersOwed: number | null;
    subcontractorsOwed: number | null;
    ownerPayOwed: number | null;
    activeJobs: number;
    ownerPayUnknownJobs: number;
    workersUnknownJobs: number;
    subcontractorsUnknownJobs: number;
  };
  dataStatus: "complete" | "partial";
  warnings: string[];
};

type Filter = "all" | "needs_action" | "waiting_on_payment" | "ready_to_close";

const stateLabels: Record<FinancialJob["state"], string> = {
  needs_action: "Needs Action",
  waiting_on_payment: "Waiting on Customer/Payment",
  ready_to_close: "Ready to Close",
};

function money(value: number | null | undefined) {
  return value == null ? "Unavailable" : formatCurrency(value);
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    paid: "Paid", partiallyPaid: "Partially paid", sent: "Sent", approved: "Approved",
    overdue: "Overdue", draft: "Draft", not_invoiced: "Not invoiced",
  };
  return labels[value] ?? value;
}

function stateClass(state: FinancialJob["state"]) {
  if (state === "needs_action") return "border-amber-200 bg-amber-50 text-amber-800";
  if (state === "ready_to_close") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

function DetailSection({ title, icon, count, total, details }: {
  title: string; icon: ReactNode; count: number | null; total: number | null; details: Detail[] | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border/70 bg-background/70 overflow-hidden">
      <button type="button" className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-muted/30" onClick={() => setOpen(value => !value)}>
        <span className="text-muted-foreground">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-foreground">{title}</span>
          <span className="block text-[11px] text-muted-foreground">
            {count == null ? "Unavailable" : `${count} ${count === 1 ? "person" : "people"}`}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-sm font-bold text-foreground">{money(total)}</span>
          <span className="block text-[10px] text-muted-foreground">owed</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-border/60 divide-y divide-border/50">
          {!details?.length ? (
            <p className="px-3.5 py-3 text-xs text-muted-foreground">{details ? "No assigned payouts." : "Details unavailable."}</p>
          ) : details.map(detail => (
            <div key={`${detail.id}-${detail.compensationType}`} className="px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{detail.name}</span>
                <span className={`text-[10px] font-semibold ${detail.status === "paid" ? "text-emerald-700" : detail.status === "overpaid" ? "text-purple-700" : detail.status === "unavailable" ? "text-amber-700" : "text-amber-700"}`}>
                  {detail.status === "paid" ? "Paid" : detail.status === "overpaid" ? "Overpaid" : detail.status === "unavailable" ? "Unavailable" : statusLabel(detail.status)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                <span>Owed {money(detail.amountOwed)}</span>
                <span>Paid {money(detail.amountPaid)}</span>
                <span className={detail.balance && detail.balance > 0 ? "font-semibold text-amber-700" : ""}>Remaining {money(detail.balance)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function JobsFinancialsView({ businessId, search, onOpenJob }: {
  businessId?: number;
  search: string;
  onOpenJob: (jobId: number) => void;
}) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (businessId != null) params.set("businessId", String(businessId));
    setLoading(true);
    setError(false);
    fetch(`${BASE}/api/jobs/financials-summary?${params.toString()}`, { credentials: "include", signal: controller.signal })
      .then(response => response.ok ? response.json() as Promise<SummaryResponse> : Promise.reject(new Error("Financials request failed")))
      .then(response => { if (!controller.signal.aborted) setData(response); })
      .catch(() => { if (!controller.signal.aborted) { setError(true); setData(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [businessId, retry]);

  const activeJobs = useMemo(
    () => (data?.jobs ?? []).filter(item => item.job.status !== "closed"),
    [data],
  );
  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activeJobs.filter(item => {
      const matchesSearch = !query || item.job.title.toLowerCase().includes(query) || item.job.clientName?.toLowerCase().includes(query);
      const matchesFilter = filter === "all" || item.state === filter;
      return matchesSearch && matchesFilter;
    });
  }, [activeJobs, filter, search]);

  const filters: Array<{ value: Filter; label: string }> = [
    { value: "all", label: "All Active" },
    { value: "needs_action", label: "Needs Action" },
    { value: "waiting_on_payment", label: "Waiting on Customer/Payment" },
    { value: "ready_to_close", label: "Ready to Close" },
  ];

  if (loading) return (
    <div className="space-y-4" aria-label="Loading financials">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(key => <div key={key} className="h-24 rounded-xl bg-muted animate-pulse" />)}
      </div>
      {[1, 2].map(key => <div key={key} className="h-48 rounded-xl bg-muted animate-pulse" />)}
    </div>
  );

  if (error) return (
    <Card className="py-12 px-5 text-center space-y-3">
      <AlertCircle className="mx-auto w-8 h-8 text-red-500" />
      <p className="font-semibold text-foreground">Financials could not be loaded</p>
      <p className="text-sm text-muted-foreground">No amounts are shown until the active-job summary is available.</p>
      <button type="button" onClick={() => setRetry(value => value + 1)} className="mx-auto inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
        <RefreshCw className="w-4 h-4" /> Try again
      </button>
    </Card>
  );

  const totals = data?.totals;
  return (
    <div className="space-y-4">
      {data?.dataStatus === "partial" && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div><span className="font-bold">Some balances are unavailable.</span> Known totals exclude unknown jobs.</div>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Workers Owed", value: money(totals?.workersOwed), icon: <Users className="w-4 h-4" />, unknown: totals?.workersUnknownJobs },
          { label: "Subcontractors Owed", value: money(totals?.subcontractorsOwed), icon: <HardHat className="w-4 h-4" />, unknown: totals?.subcontractorsUnknownJobs },
          { label: "Owner Pay Owed", value: money(totals?.ownerPayOwed), icon: <CircleDollarSign className="w-4 h-4" />, unknown: totals?.ownerPayUnknownJobs },
          { label: "Active Jobs", value: String(totals?.activeJobs ?? 0), icon: <BriefcaseBusiness className="w-4 h-4" />, unknown: 0 },
        ].map(card => (
          <Card key={card.label} className="p-3.5">
            <div className="flex items-center gap-2 text-muted-foreground">{card.icon}<span className="text-[10px] font-bold uppercase tracking-wide">{card.label}</span></div>
            <div className="mt-2 text-xl font-bold text-foreground">{card.value}</div>
            {!!card.unknown && <div className="mt-1 text-[10px] text-amber-700">{card.unknown} unavailable</div>}
          </Card>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map(option => (
          <button key={option.value} type="button" onClick={() => setFilter(option.value)} className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${filter === option.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}>
            {option.label}
          </button>
        ))}
      </div>
      {activeJobs.length === 0 ? (
        <Card className="py-14 text-center">
          <BriefcaseBusiness className="mx-auto w-10 h-10 text-muted-foreground/30" />
          <p className="mt-3 font-semibold text-foreground">No active jobs</p>
          <p className="mt-1 text-sm text-muted-foreground">Financials only includes jobs that have not been closed.</p>
        </Card>
      ) : filteredJobs.length === 0 ? (
        <Card className="py-14 text-center">
          <p className="font-semibold text-foreground">No matching active jobs</p>
          <p className="mt-1 text-sm text-muted-foreground">Try another filter or search term.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map(item => (
            <Card key={item.job.id} className="overflow-hidden">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-bold text-foreground">{item.job.title}</h3>
                      <Badge variant="outline" className={stateClass(item.state)}>{stateLabels[item.state]}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{item.job.clientName ?? "No customer assigned"}{item.job.jobNumber != null ? ` · Job #${item.job.jobNumber}` : ""}</p>
                  </div>
                  <button type="button" onClick={() => onOpenJob(item.job.id)} className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                    Open Job <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg bg-muted/40 p-2.5"><span className="block text-[10px] text-muted-foreground">Payment</span><span className="block truncate text-xs font-semibold text-foreground">{statusLabel(item.payment.status)}</span>{item.payment.amountDue != null && item.payment.amountDue > 0 && <span className="block text-[10px] text-amber-700">{money(item.payment.amountDue)} due</span>}</div>
                  <div className="rounded-lg bg-muted/40 p-2.5"><span className="block text-[10px] text-muted-foreground">Workers</span><span className="block text-xs font-semibold text-foreground">{item.workers.count == null ? "Unavailable" : `${item.workers.count} assigned`}</span><span className="block text-[10px] text-amber-700">{money(item.workers.totalOwed)} owed</span></div>
                  <div className="rounded-lg bg-muted/40 p-2.5"><span className="block text-[10px] text-muted-foreground">Subcontractors</span><span className="block text-xs font-semibold text-foreground">{item.subcontractors.count == null ? "Unavailable" : `${item.subcontractors.count} assigned`}</span><span className="block text-[10px] text-amber-700">{money(item.subcontractors.totalOwed)} owed</span></div>
                  <div className="rounded-lg bg-muted/40 p-2.5"><span className="block text-[10px] text-muted-foreground">Owner Pay</span>{item.ownerPay.supported ? <><span className="block text-xs font-semibold text-foreground">{money(item.ownerPay.remaining)} remaining</span><span className="block text-[10px] text-muted-foreground">{money(item.ownerPay.earned)} earned · {money(item.ownerPay.paid)} paid</span></> : <span className="block text-xs font-semibold text-amber-700">Unavailable</span>}</div>
                </div>
                {item.ownerPay.overpaid > 0 && <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-purple-700"><AlertCircle className="w-3.5 h-3.5" /> Owner Pay overpaid by {money(item.ownerPay.overpaid)}</p>}
                {(item.blockers.length > 0 || item.warnings.length > 0) && <p className="mt-3 text-xs text-amber-700">{[...item.blockers, ...item.warnings].join(" · ")}</p>}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <DetailSection title="Workers" icon={<Users className="w-4 h-4" />} count={item.workers.count} total={item.workers.totalOwed} details={item.workers.details} />
                  <DetailSection title="Subcontractors" icon={<HardHat className="w-4 h-4" />} count={item.subcontractors.count} total={item.subcontractors.totalOwed} details={item.subcontractors.details} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}