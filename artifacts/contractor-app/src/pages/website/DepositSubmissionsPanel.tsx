import { useQuery } from "@tanstack/react-query";
import { CreditCard, Loader2, CheckCircle, Clock, AlertCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DepositSubmission {
  id: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerNotes: string | null;
  amount: string;
  paymentStatus: string;
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid" || status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle className="w-2.5 h-2.5" />
        Paid
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        <Clock className="w-2.5 h-2.5" />
        Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      <AlertCircle className="w-2.5 h-2.5" />
      {status}
    </span>
  );
}

export function DepositSubmissionsPanel({ businessId }: { businessId?: number }) {
  const { data, isLoading, isError } = useQuery<DepositSubmission[]>({
    queryKey: ["deposit-submissions", businessId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/website/deposit-submissions?businessId=${businessId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load submissions");
      return res.json();
    },
    enabled: !!businessId,
    staleTime: 30_000,
  });

  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

  return (
    <div className="px-3 py-3 border-b border-border">
      <div className="flex items-center gap-1.5 mb-2">
        <CreditCard className="w-3 h-3 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Submissions
        </span>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-3 text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-xs">Loading…</span>
        </div>
      )}

      {isError && (
        <p className="text-xs text-destructive py-2">Failed to load submissions.</p>
      )}

      {!isLoading && !isError && (!data || data.length === 0) && (
        <p className="text-xs text-muted-foreground py-2 italic">
          No deposit submissions yet. They'll appear here once visitors fill out the form on your published site.
        </p>
      )}

      {data && data.length > 0 && (
        <div className="space-y-2">
          {data.map(sub => (
            <div
              key={sub.id}
              className="rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-xs space-y-1"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-foreground truncate">{sub.customerName}</div>
                <StatusBadge status={sub.paymentStatus} />
              </div>
              <div className="text-muted-foreground truncate">{sub.customerEmail}</div>
              {sub.customerPhone && (
                <div className="text-muted-foreground">{sub.customerPhone}</div>
              )}
              {sub.customerNotes && (
                <div className="text-muted-foreground italic truncate">"{sub.customerNotes}"</div>
              )}
              <div className="flex items-center justify-between pt-0.5">
                <span className="font-semibold text-foreground">
                  {fmt.format(parseFloat(sub.amount))}
                </span>
                <span className="text-muted-foreground">
                  {new Date(sub.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
