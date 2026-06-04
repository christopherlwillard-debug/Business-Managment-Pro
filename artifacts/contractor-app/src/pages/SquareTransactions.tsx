import { useState, useMemo } from "react";
import {
  useSquareLiveTransactions,
  useSquareStatus,
  useListClients,
  type SquareTransaction,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  CreditCard, RefreshCw, ExternalLink, AlertCircle,
  TrendingUp, CheckCircle2, XCircle, Clock, Wifi, Users, Globe,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

const CARD_BRAND_LABELS: Record<string, string> = {
  VISA: "Visa",
  MASTERCARD: "Mastercard",
  AMERICAN_EXPRESS: "Amex",
  DISCOVER: "Discover",
  DISCOVER_DINERS: "Diners",
  JCB: "JCB",
  UNION_PAY: "UnionPay",
  SQUARE_GIFT_CARD: "Gift Card",
  SQUARE_CAPITAL_CARD: "Square Capital",
  INTERAC: "Interac",
  EFTPOS: "EFTPOS",
  FELICA: "Felica",
  EBT: "EBT",
};

const SOURCE_LABELS: Record<string, string> = {
  CARD: "Card",
  BANK_ACCOUNT: "Bank",
  WALLET: "Wallet",
  BUY_NOW_PAY_LATER: "BNPL",
  CASH: "Cash",
  EXTERNAL: "External",
  SQUARE_ACCOUNT: "Square",
  TOKEN: "Online",
};

const RANGE_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "6 months", days: 180 },
];

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === "COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="w-3 h-3" />
        Completed
      </span>
    );
  }
  if (status === "FAILED" || status === "CANCELED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
        <XCircle className="w-3 h-3" />
        {status === "FAILED" ? "Failed" : "Canceled"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
      <Clock className="w-3 h-3" />
      {status ?? "Unknown"}
    </span>
  );
}

function getPaymentType(tx: SquareTransaction): { label: string; slug: string | null } | null {
  if (tx.referenceId?.startsWith("website_deposit_")) {
    return { label: "Website Deposit", slug: tx.referenceId.slice(16) || null };
  }
  if (tx.referenceId?.startsWith("inv_")) return { label: "Invoice Payment", slug: null };
  if (tx.referenceId?.startsWith("quick_")) return { label: "Quick Charge", slug: null };
  if (tx.referenceId?.startsWith("prospect_")) return { label: "Prospect Deposit", slug: null };
  if (tx.referenceId?.startsWith("estimate_")) return { label: "Estimate Deposit", slug: null };
  return null;
}

function TransactionRow({ tx, matchedClientName }: { tx: SquareTransaction; matchedClientName: string | null }) {
  const cardLabel = tx.cardBrand ? (CARD_BRAND_LABELS[tx.cardBrand] ?? tx.cardBrand) : null;
  const sourceLabel = tx.sourceType ? (SOURCE_LABELS[tx.sourceType] ?? tx.sourceType) : null;

  const payerName = tx.cardholderName || tx.buyerEmail || null;
  const cardInfo = cardLabel && tx.last4 ? `${cardLabel} ···${tx.last4}` : (sourceLabel ?? "—");
  const paymentType = getPaymentType(tx);
  const isWebsiteDeposit = paymentType?.label === "Website Deposit";

  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isWebsiteDeposit ? "bg-indigo-100" : "bg-amber-100"}`}>
        {isWebsiteDeposit
          ? <Globe className="w-4 h-4 text-indigo-600" />
          : <CreditCard className="w-4 h-4 text-amber-600" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-foreground truncate">
            {payerName || "Unknown customer"}
          </span>
          <StatusBadge status={tx.status} />
          {paymentType && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
              isWebsiteDeposit
                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                : "bg-slate-100 text-slate-600 border-slate-200"
            }`}>
              {isWebsiteDeposit && <Globe className="w-3 h-3" />}
              {paymentType.label}
              {paymentType.slug && (
                <span className="font-mono text-[10px] opacity-75 ml-0.5">{paymentType.slug}</span>
              )}
            </span>
          )}
          {matchedClientName && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
              <Users className="w-3 h-3" />
              {matchedClientName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
          <span>{tx.createdAt ? formatDate(tx.createdAt) : "—"}</span>
          <span>·</span>
          <span>{cardInfo}</span>
          {tx.note && (
            <>
              <span>·</span>
              <span className="truncate max-w-[140px]">{tx.note}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`font-semibold text-sm ${tx.status === "COMPLETED" ? "text-foreground" : "text-muted-foreground line-through"}`}>
          {formatCents(tx.amountCents)}
        </span>
        {tx.receiptUrl && (
          <a
            href={tx.receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors"
            title="View receipt"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function SquareTransactions() {
  const [days, setDays] = useState(30);
  const { data: status } = useSquareStatus();
  const { data, isLoading, isError, refetch, isFetching } = useSquareLiveTransactions(days);
  const { data: clients = [] } = useListClients();

  const emailToClientName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients as any[]) {
      if (c.email) map.set(c.email.toLowerCase().trim(), c.name);
    }
    return map;
  }, [clients]);

  function getMatchedClient(tx: SquareTransaction): string | null {
    if (tx.buyerEmail) {
      const name = emailToClientName.get(tx.buyerEmail.toLowerCase().trim());
      if (name) return name;
    }
    return null;
  }

  const summary = data?.summary;
  const transactions = data?.transactions ?? [];

  if (status && !status.connected) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Square Transactions</h1>
            <p className="text-sm text-muted-foreground">Payment history from your Square account</p>
          </div>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="w-10 h-10 text-muted-foreground" />
            <p className="font-medium">Square is not connected</p>
            <p className="text-sm text-muted-foreground">
              Add your Square credentials in Settings → Payments to pull transaction history.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Square Transactions</h1>
            <p className="text-sm text-muted-foreground">
              {status?.businessName ? `${status.businessName} · ` : ""}Live from your Square account
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                onClick={() => setDays(opt.days)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  days === opt.days
                    ? "bg-amber-500 text-white"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Collected</p>
              <p className="text-2xl font-bold text-emerald-600">{formatCents(summary.totalCents)}</p>
              <p className="text-xs text-muted-foreground mt-1">last {summary.days} days</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Completed</p>
              <p className="text-2xl font-bold">{summary.completedCount}</p>
              <p className="text-xs text-muted-foreground mt-1">payments</p>
            </CardContent>
          </Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Average</p>
              <p className="text-2xl font-bold">
                {summary.completedCount > 0
                  ? formatCents(Math.round(summary.totalCents / summary.completedCount))
                  : "$0.00"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">per payment</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        {isLoading && (
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading transactions from Square…</p>
            </div>
          </CardContent>
        )}

        {isError && !isLoading && (
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="font-medium text-sm">Could not load transactions</p>
            <button
              onClick={() => refetch()}
              className="text-xs text-primary underline underline-offset-2"
            >
              Try again
            </button>
          </CardContent>
        )}

        {!isLoading && !isError && transactions.length === 0 && (
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="font-medium text-sm">No transactions found</p>
            <p className="text-xs text-muted-foreground">
              No payments found in the last {days} days. Try a longer date range.
            </p>
          </CardContent>
        )}

        {!isLoading && transactions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs text-muted-foreground">
                {transactions.length} transaction{transactions.length !== 1 ? "s" : ""} · live from Square
              </span>
            </div>
            {transactions.map((tx) => (
              <TransactionRow key={tx.id ?? tx.createdAt} tx={tx} matchedClientName={getMatchedClient(tx)} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
