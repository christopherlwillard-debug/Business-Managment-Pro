import { useState, useCallback, useEffect } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePlaidLink } from "react-plaid-link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Landmark, RefreshCw, Unlink, AlertCircle, DollarSign, CheckCircle2, Receipt, TrendingUp } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const CATEGORIES = [
  "Materials",
  "Advertising",
  "Fuel/Travel",
  "Subcontractor",
  "Insurance",
  "Professional Services",
  "Office/Admin",
  "Rent/Lease",
  "Repairs/Maintenance",
  "Tools/Equipment",
  "Utilities",
  "Other",
  "Owner Draw",
];

interface PlaidStatus {
  configured: boolean;
}

interface PlaidConnection {
  id: number;
  institutionName: string | null;
  accountName: string | null;
  accountMask: string | null;
  accountType: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

interface PlaidBalance {
  available: number | null;
  current: number | null;
  currency: string;
  cachedAt: string | null;
}

interface PlaidTransaction {
  id: number;
  date: string;
  description: string;
  amount: string;
  transactionType: string;
  status: string;
  matchedExpenseId: number | null;
  matchedInvoiceId: number | null;
  matchedOtherIncomeId: number | null;
}

interface SyncResult {
  synced: number;
  batchId: number;
}

interface Vendor {
  id: number;
  name: string;
  category: string | null;
}

interface Job {
  id: number;
  title: string;
  status: string;
}

interface UnpaidInvoice {
  id: number;
  invoiceNumber: string;
  clientName?: string | null;
  total: string;
  dueDate?: string | null;
  status: string;
}

interface FileExpenseForm {
  description: string;
  vendor: string;
  category: string;
  jobId: string;
  businessLine: string;
  notes: string;
}

interface FileIncomeForm {
  mode: "invoice" | "other";
  invoiceId: string;
  description: string;
  source: string;
  notes: string;
  businessLine: string;
  jobId: string;
}

function formatCurrency(amount: number | string | null | undefined, currency = "USD") {
  if (amount == null) return "—";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

export default function Banking() {
  const { activeBusiness, businesses } = useBusiness();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [linkToken, setLinkToken] = useState<string | null>(null);

  // Expense filing
  const [filingTxn, setFilingTxn] = useState<PlaidTransaction | null>(null);
  const [form, setForm] = useState<FileExpenseForm>({
    description: "",
    vendor: "",
    category: "Materials",
    jobId: "",
    businessLine: "",
    notes: "",
  });

  // Income filing
  const [incomeFilingTxn, setIncomeFilingTxn] = useState<PlaidTransaction | null>(null);
  const [incomeForm, setIncomeForm] = useState<FileIncomeForm>({
    mode: "other",
    invoiceId: "",
    description: "",
    source: "",
    notes: "",
    businessLine: "",
    jobId: "",
  });

  const { data: status } = useQuery<PlaidStatus>({
    queryKey: ["plaid-status"],
    queryFn: () => apiFetch("/api/plaid/status"),
    staleTime: Infinity,
  });

  const { data: connection, isLoading: connectionLoading } = useQuery<PlaidConnection | null>({
    queryKey: ["plaid-connection"],
    queryFn: () => apiFetch("/api/plaid/connection"),
  });

  const { data: balance, isLoading: balanceLoading } = useQuery<PlaidBalance>({
    queryKey: ["plaid-balance"],
    queryFn: () => apiFetch("/api/plaid/balance"),
    enabled: !!connection,
    retry: false,
  });

  const { data: transactions, isLoading: txnsLoading } = useQuery<PlaidTransaction[]>({
    queryKey: ["plaid-transactions"],
    queryFn: () => apiFetch("/api/plaid/transactions"),
    enabled: !!connection?.lastSyncedAt,
  });

  const { data: vendors } = useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn: () => apiFetch("/api/vendors"),
    enabled: !!filingTxn,
    staleTime: 60_000,
  });

  const { data: jobs } = useQuery<Job[]>({
    queryKey: ["jobs-list"],
    queryFn: () => apiFetch("/api/jobs"),
    enabled: !!(filingTxn || incomeFilingTxn),
    staleTime: 60_000,
  });

  const { data: unpaidInvoices } = useQuery<UnpaidInvoice[]>({
    queryKey: ["invoices-unpaid"],
    queryFn: () => apiFetch<UnpaidInvoice[]>("/api/invoices?status=sent"),
    enabled: !!incomeFilingTxn,
    staleTime: 60_000,
  });

  const getLinkTokenMutation = useMutation({
    mutationFn: () => apiFetch<{ link_token: string }>("/api/plaid/link-token", { method: "POST" }),
    onSuccess: (data) => setLinkToken(data.link_token),
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const exchangeMutation = useMutation({
    mutationFn: (body: { public_token: string; metadata: unknown }) =>
      apiFetch("/api/plaid/exchange-token", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plaid-connection"] });
      qc.invalidateQueries({ queryKey: ["plaid-balance"] });
      qc.invalidateQueries({ queryKey: ["plaid-transactions"] });
      setLinkToken(null);
      toast({ title: "Bank account connected!", description: "Your account is now linked." });
    },
    onError: (err: Error) => toast({ title: "Connection failed", description: err.message, variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiFetch<SyncResult>("/api/plaid/sync", { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["plaid-connection"] });
      qc.invalidateQueries({ queryKey: ["plaid-transactions"] });
      toast({ title: "Sync complete", description: `${data.synced} transaction${data.synced !== 1 ? "s" : ""} imported.` });
    },
    onError: (err: Error) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiFetch("/api/plaid/connection", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plaid-connection"] });
      qc.invalidateQueries({ queryKey: ["plaid-balance"] });
      qc.invalidateQueries({ queryKey: ["plaid-transactions"] });
      toast({ title: "Bank account disconnected" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const fileAsExpenseMutation = useMutation({
    mutationFn: ({ txnId, body }: { txnId: number; body: object }) =>
      apiFetch(`/api/plaid/transactions/${txnId}/file-as-expense`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plaid-transactions"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setFilingTxn(null);
      toast({ title: "Expense filed", description: "Transaction has been recorded as an expense." });
    },
    onError: (err: Error) => toast({ title: "Failed to file expense", description: err.message, variant: "destructive" }),
  });

  const fileAsIncomeMutation = useMutation({
    mutationFn: ({ txnId, body }: { txnId: number; body: object }) =>
      apiFetch(`/api/plaid/transactions/${txnId}/file-as-income`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plaid-transactions"] });
      qc.invalidateQueries({ queryKey: ["other-income"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-unpaid"] });
      setIncomeFilingTxn(null);
      toast({ title: "Income recorded", description: "Deposit has been filed successfully." });
    },
    onError: (err: Error) => toast({ title: "Failed to file income", description: err.message, variant: "destructive" }),
  });

  const onPlaidSuccess = useCallback(
    (public_token: string, metadata: unknown) => {
      exchangeMutation.mutate({ public_token, metadata });
    },
    [exchangeMutation]
  );

  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: onPlaidSuccess,
    onExit: () => setLinkToken(null),
  });

  const handleConnectClick = async () => {
    await getLinkTokenMutation.mutateAsync();
  };

  useEffect(() => {
    if (linkToken && plaidReady) {
      openPlaid();
    }
  }, [linkToken, plaidReady, openPlaid]);

  function openFilingSheet(txn: PlaidTransaction) {
    setFilingTxn(txn);
    setForm({
      description: txn.description,
      vendor: "",
      category: "Materials",
      jobId: "",
      businessLine: activeBusiness?.slug ?? "",
      notes: "",
    });
  }

  function openIncomeFilingSheet(txn: PlaidTransaction) {
    setIncomeFilingTxn(txn);
    setIncomeForm({
      mode: "other",
      invoiceId: "",
      description: txn.description,
      source: "",
      notes: "",
      businessLine: activeBusiness?.slug ?? "",
      jobId: "",
    });
  }

  function handleFileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!filingTxn) return;
    fileAsExpenseMutation.mutate({
      txnId: filingTxn.id,
      body: {
        description: form.description,
        vendor: form.vendor || undefined,
        category: form.category,
        jobId: form.jobId ? parseInt(form.jobId, 10) : null,
        businessLine: form.businessLine || null,
        notes: form.notes || undefined,
      },
    });
  }

  function handleIncomeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!incomeFilingTxn) return;
    if (incomeForm.mode === "invoice") {
      if (!incomeForm.invoiceId) return;
      fileAsIncomeMutation.mutate({
        txnId: incomeFilingTxn.id,
        body: { invoiceId: parseInt(incomeForm.invoiceId, 10) },
      });
    } else {
      fileAsIncomeMutation.mutate({
        txnId: incomeFilingTxn.id,
        body: {
          description: incomeForm.description,
          source: incomeForm.source || undefined,
          notes: incomeForm.notes || undefined,
          businessLine: incomeForm.businessLine || null,
          jobId: incomeForm.jobId ? parseInt(incomeForm.jobId, 10) : null,
        },
      });
    }
  }

  if (connectionLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!status?.configured) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banking</h1>
          <p className="text-muted-foreground">Connect your business bank account to see live balance and transactions.</p>
        </div>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-4 pt-6">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800">Plaid credentials not configured</p>
              <p className="text-sm text-amber-700 mt-1">
                To connect your bank account, add these three secrets in the Replit Secrets panel:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-700 font-mono">
                <li>• PLAID_CLIENT_ID</li>
                <li>• PLAID_SECRET</li>
                <li>• PLAID_ENV (set to <span className="font-semibold">sandbox</span> for testing, <span className="font-semibold">production</span> when ready)</li>
              </ul>
              <p className="text-xs text-amber-600 mt-3">
                Get your free credentials at{" "}
                <a href="https://dashboard.plaid.com" target="_blank" rel="noreferrer" className="underline font-medium">
                  dashboard.plaid.com
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banking</h1>
          <p className="text-muted-foreground">Connect your business bank account to see live balance and transactions.</p>
        </div>
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-6 py-12">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Landmark className="w-8 h-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">No bank account linked</p>
              <p className="text-sm text-muted-foreground mt-1">
                Securely connect your business checking account to view your live balance and import recent transactions.
              </p>
            </div>
            <Button
              onClick={handleConnectClick}
              disabled={getLinkTokenMutation.isPending || exchangeMutation.isPending}
              size="lg"
              className="w-full"
            >
              {getLinkTokenMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Preparing…
                </>
              ) : (
                <>
                  <Landmark className="w-4 h-4 mr-2" />
                  Connect Bank Account
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banking</h1>
          <p className="text-muted-foreground">
            {connection.institutionName ?? "Connected Bank"}
            {connection.accountName ? ` · ${connection.accountName}` : ""}
            {connection.accountMask ? ` ····${connection.accountMask}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sync Transactions
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                <Unlink className="w-4 h-4 mr-2" />
                Disconnect
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect bank account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove your linked bank account and all imported transactions. You can re-connect at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => disconnectMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Disconnect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Current Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {balanceLoading ? (
              <div className="h-9 w-32 bg-muted rounded animate-pulse" />
            ) : (
              <>
                <p className="text-3xl font-bold tracking-tight">
                  {formatCurrency(balance?.current, balance?.currency)}
                </p>
                {balance?.cachedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    as of {new Date(balance.cachedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Available Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {balanceLoading ? (
              <div className="h-9 w-32 bg-muted rounded animate-pulse" />
            ) : (
              <>
                <p className="text-3xl font-bold tracking-tight">
                  {formatCurrency(balance?.available, balance?.currency)}
                </p>
                {balance?.cachedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    as of {new Date(balance.cachedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {!connection.lastSyncedAt ? (
        <Card className="border-dashed">
          <CardContent className="flex items-start gap-3 py-5">
            <RefreshCw className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">No transactions synced yet</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Click <span className="font-semibold">Sync Transactions</span> above to import the last 30 days of activity.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Transactions (Last 30 Days)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Synced {new Date(connection.lastSyncedAt).toLocaleString()}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {txnsLoading ? (
              <div className="space-y-2 p-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : !transactions || transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground px-6 py-4">No transactions found for this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-6 py-2.5 font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Description</th>
                      <th className="text-right px-6 py-2.5 font-medium text-muted-foreground">Amount</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...transactions].reverse().map((txn) => {
                      const isCredit = txn.transactionType === "credit";
                      const amt = parseFloat(txn.amount);
                      const isFiled = txn.status === "matched";
                      return (
                        <tr
                          key={txn.id}
                          className={`border-b last:border-0 transition-colors ${isFiled ? "opacity-50" : "hover:bg-muted/30"}`}
                        >
                          <td className="px-6 py-3 whitespace-nowrap text-muted-foreground">
                            {new Date(txn.date + "T00:00:00").toLocaleDateString("en-US", {
                              month: "short", day: "numeric",
                            })}
                          </td>
                          <td className="px-4 py-3 max-w-xs truncate">{txn.description}</td>
                          <td className={`px-6 py-3 text-right font-medium tabular-nums ${isCredit ? "text-emerald-600" : "text-foreground"}`}>
                            {isCredit ? "+" : "-"}{formatCurrency(amt)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isFiled ? (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                Filed ✓
                              </span>
                            ) : isCredit ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                onClick={() => openIncomeFilingSheet(txn)}
                              >
                                <TrendingUp className="w-3 h-3 mr-1" />
                                File as Income
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2.5"
                                onClick={() => openFilingSheet(txn)}
                              >
                                <Receipt className="w-3 h-3 mr-1" />
                                File as Expense
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── File as Expense Sheet ─────────────────────────────────────────────── */}
      <Sheet open={!!filingTxn} onOpenChange={(open) => { if (!open) setFilingTxn(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>File as Expense</SheetTitle>
            <SheetDescription>
              {filingTxn && (
                <>
                  {new Date(filingTxn.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  {" · "}
                  <span className="font-medium">{formatCurrency(parseFloat(filingTxn.amount))}</span>
                  {" "}
                  <span className="text-muted-foreground">({filingTxn.transactionType})</span>
                </>
              )}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleFileSubmit} className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label htmlFor="fe-description">Description</Label>
              <Input
                id="fe-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fe-vendor">Vendor</Label>
              <Input
                id="fe-vendor"
                placeholder="e.g. Home Depot"
                list="vendor-suggestions"
                value={form.vendor}
                onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
              />
              <datalist id="vendor-suggestions">
                {vendors?.map((v) => (
                  <option key={v.id} value={v.name} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fe-category">Category</Label>
              <select
                id="fe-category"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                required
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {!activeBusiness && (
            <div className="space-y-1.5">
              <Label>Business Line</Label>
              <div className="flex gap-2">
                {[
                  { val: "", label: "Untagged" },
                  ...businesses.map(b => ({ val: b.slug, label: b.name })),
                ].map(({ val, label }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, businessLine: val }))}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                      form.businessLine === val
                        ? val === "asphalt_sealing"
                          ? "bg-amber-500 text-white border-amber-500"
                          : val
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-muted text-foreground border-input"
                        : "bg-background text-muted-foreground border-input hover:bg-muted/50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="fe-job">Job (optional)</Label>
              <select
                id="fe-job"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={form.jobId}
                onChange={(e) => setForm((f) => ({ ...f, jobId: e.target.value }))}
              >
                <option value="">— None —</option>
                {jobs
                  ?.filter((j) => j.status !== "completed" && j.status !== "cancelled")
                  .map((j) => (
                    <option key={j.id} value={String(j.id)}>{j.title}</option>
                  ))}
                {jobs
                  ?.filter((j) => j.status === "completed" || j.status === "cancelled")
                  .length ? (
                    <optgroup label="Closed jobs">
                      {jobs
                        .filter((j) => j.status === "completed" || j.status === "cancelled")
                        .map((j) => (
                          <option key={j.id} value={String(j.id)}>{j.title}</option>
                        ))}
                    </optgroup>
                  ) : null}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fe-notes">Notes (optional)</Label>
              <Textarea
                id="fe-notes"
                rows={2}
                placeholder="Any additional details…"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <SheetFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFilingTxn(null)}
                disabled={fileAsExpenseMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={fileAsExpenseMutation.isPending}>
                {fileAsExpenseMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Filing…
                  </>
                ) : (
                  "File as Expense"
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* ── File as Income Sheet ──────────────────────────────────────────────── */}
      <Sheet open={!!incomeFilingTxn} onOpenChange={(open) => { if (!open) setIncomeFilingTxn(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              File as Income
            </SheetTitle>
            <SheetDescription>
              {incomeFilingTxn && (
                <>
                  {new Date(incomeFilingTxn.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  {" · "}
                  <span className="font-medium text-emerald-600">+{formatCurrency(parseFloat(incomeFilingTxn.amount))}</span>
                </>
              )}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleIncomeSubmit} className="space-y-5 mt-6">
            {/* Mode toggle */}
            <div className="space-y-1.5">
              <Label>How would you like to record this deposit?</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setIncomeForm((f) => ({ ...f, mode: "invoice" }))}
                  className={`rounded-lg border px-3 py-3 text-xs font-medium text-left transition-colors ${
                    incomeForm.mode === "invoice"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-800"
                      : "bg-background border-input text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Receipt className="w-4 h-4 mb-1.5" />
                  <div className="font-semibold">Match to Invoice</div>
                  <div className="text-[10px] opacity-70 mt-0.5">Mark an existing unpaid invoice as collected</div>
                </button>
                <button
                  type="button"
                  onClick={() => setIncomeForm((f) => ({ ...f, mode: "other" }))}
                  className={`rounded-lg border px-3 py-3 text-xs font-medium text-left transition-colors ${
                    incomeForm.mode === "other"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-800"
                      : "bg-background border-input text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <DollarSign className="w-4 h-4 mb-1.5" />
                  <div className="font-semibold">Other Income</div>
                  <div className="text-[10px] opacity-70 mt-0.5">Log as a new income entry (deposit, payment, etc.)</div>
                </button>
              </div>
            </div>

            {incomeForm.mode === "invoice" ? (
              /* ── Match to invoice ── */
              <div className="space-y-1.5">
                <Label htmlFor="fi-invoice">Select Invoice</Label>
                <select
                  id="fi-invoice"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={incomeForm.invoiceId}
                  onChange={(e) => setIncomeForm((f) => ({ ...f, invoiceId: e.target.value }))}
                  required
                >
                  <option value="">— Choose an invoice —</option>
                  {unpaidInvoices && unpaidInvoices.length > 0 ? (
                    unpaidInvoices.map((inv) => (
                      <option key={inv.id} value={String(inv.id)}>
                        {inv.invoiceNumber}
                        {inv.clientName ? ` — ${inv.clientName}` : ""}
                        {" · "}{formatCurrency(parseFloat(inv.total))}
                        {inv.dueDate ? ` (due ${new Date(inv.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : ""}
                      </option>
                    ))
                  ) : (
                    <option disabled value="">No unpaid invoices found</option>
                  )}
                </select>
                <p className="text-xs text-muted-foreground">
                  The invoice will be marked as <span className="font-medium">paid</span> and this deposit will be linked to it.
                </p>
              </div>
            ) : (
              /* ── Other income ── */
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="fi-description">Description</Label>
                  <Input
                    id="fi-description"
                    value={incomeForm.description}
                    onChange={(e) => setIncomeForm((f) => ({ ...f, description: e.target.value }))}
                    required
                    placeholder="e.g. Payment from client, deposit…"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="fi-source">Source (optional)</Label>
                  <Input
                    id="fi-source"
                    value={incomeForm.source}
                    onChange={(e) => setIncomeForm((f) => ({ ...f, source: e.target.value }))}
                    placeholder="e.g. Willard Smith, ABC Co."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="fi-job">Job (optional)</Label>
                  <select
                    id="fi-job"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={incomeForm.jobId}
                    onChange={(e) => setIncomeForm((f) => ({ ...f, jobId: e.target.value }))}
                  >
                    <option value="">— No job —</option>
                    {jobs
                      ?.filter((j) => j.status !== "closed")
                      .map((j) => (
                        <option key={j.id} value={String(j.id)}>{j.jobName}</option>
                      ))}
                    {jobs?.some((j) => j.status === "closed") && (
                      <optgroup label="Closed jobs">
                        {jobs.filter((j) => j.status === "closed").map((j) => (
                          <option key={j.id} value={String(j.id)}>{j.jobName}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                {!activeBusiness && (
                  <div className="space-y-1.5">
                    <Label>Business Line</Label>
                    <div className="flex gap-2">
                      {[
                        { val: "", label: "Untagged" },
                        ...businesses.map(b => ({ val: b.slug, label: b.name })),
                      ].map(({ val, label }) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setIncomeForm((f) => ({ ...f, businessLine: val }))}
                          className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                            incomeForm.businessLine === val
                              ? val === "asphalt_sealing"
                                ? "bg-amber-500 text-white border-amber-500"
                                : val
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-muted text-foreground border-input"
                              : "bg-background text-muted-foreground border-input hover:bg-muted/50"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="fi-notes">Notes (optional)</Label>
                  <Textarea
                    id="fi-notes"
                    rows={2}
                    placeholder="Any additional details…"
                    value={incomeForm.notes}
                    onChange={(e) => setIncomeForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </>
            )}

            <SheetFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIncomeFilingTxn(null)}
                disabled={fileAsIncomeMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={fileAsIncomeMutation.isPending || (incomeForm.mode === "invoice" && !incomeForm.invoiceId)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {fileAsIncomeMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Filing…
                  </>
                ) : (
                  "Record Income"
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
