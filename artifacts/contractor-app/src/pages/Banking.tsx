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
import { Landmark, RefreshCw, Unlink, AlertCircle, DollarSign, CheckCircle2, Receipt, TrendingUp, Settings, Info, X, Link2, ExternalLink, Trash2, FileText } from "lucide-react";
import { Link } from "wouter";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Travel-related categories — kept in sync with the API's trip packet logic.
const TRAVEL_CATEGORIES_LC = ["fuel/travel", "travel/lodging", "meals", "parking/tolls"];
function isTravelCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  return TRAVEL_CATEGORIES_LC.includes(category.trim().toLowerCase());
}

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
  "Parking/Tolls",
  "Travel/Lodging",
  "Meals",
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
  matchedExpenseDescription: string | null;
  matchedExpenseCategory: string | null;
  matchedExpenseDate: string | null;
  matchedExpenseVendor: string | null;
  matchedExpenseAmount: string | null;
  matchedExpenseJobId: number | null;
}

interface SyncResult {
  synced: number;
  inserted: number;
  updated: number;
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
  locationName?: string | null;
  city?: string | null;
  startDate?: string | null;
}

function formatJobLabel(j: Job): string {
  const loc = j.locationName || j.city;
  const parts: string[] = [];
  if (loc) parts.push(loc);
  if (j.startDate) {
    const d = new Date(j.startDate + "T00:00:00");
    parts.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  }
  return parts.length ? `${j.title} — ${parts.join(" · ")}` : j.title;
}

interface UnpaidInvoice {
  id: number;
  invoiceNumber: string;
  clientName?: string | null;
  total: string;
  amountPaid?: string | null;
  dueDate?: string | null;
  status: string;
  createdAt?: string | null;
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

interface UnmatchedExpense {
  id: number;
  date: string;
  description: string;
  category: string;
  amount: string;
  vendor: string | null;
  jobId: number | null;
}

function formatCurrency(amount: number | string | null | undefined, currency = "USD") {
  if (amount == null) return "—";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

type BalanceFreq = "manual" | "daily" | "weekly" | "monthly";
type SyncFreq = "manual" | "daily";

function loadSetting<T extends string>(key: string, def: T): T {
  try { return (localStorage.getItem(key) as T) ?? def; } catch { return def; }
}

export default function Banking() {
  const { activeBusiness, businesses } = useBusiness();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [linkToken, setLinkToken] = useState<string | null>(null);

  // Plaid settings panel
  const [showSettings, setShowSettings] = useState(false);
  const [showCostInfo, setShowCostInfo] = useState(false);
  const [balanceFreq, setBalanceFreqState] = useState<BalanceFreq>(() => loadSetting("plaid_balance_freq", "manual"));
  const [syncFreq, setSyncFreqState] = useState<SyncFreq>(() => loadSetting("plaid_sync_freq", "manual"));

  function setBalanceFreq(v: BalanceFreq) {
    setBalanceFreqState(v);
    try { localStorage.setItem("plaid_balance_freq", v); } catch {}
  }
  function setSyncFreq(v: SyncFreq) {
    setSyncFreqState(v);
    try { localStorage.setItem("plaid_sync_freq", v); } catch {}
  }

  // Estimated monthly Plaid balance calls
  const balanceCallsPerMonth: Record<BalanceFreq, number> = { manual: 0, daily: 30, weekly: 4, monthly: 1 };
  const estimatedBalanceCalls = balanceCallsPerMonth[balanceFreq];
  const estimatedBalanceCost = (estimatedBalanceCalls * 0.10).toFixed(2);

  // Expense filing
  const [filingTxn, setFilingTxn] = useState<PlaidTransaction | null>(null);
  const [fileExpenseCountsTowardJobProfit, setFileExpenseCountsTowardJobProfit] = useState(true);
  const [form, setForm] = useState<FileExpenseForm>({
    description: "",
    vendor: "",
    category: "Materials",
    jobId: "",
    businessLine: "",
    notes: "",
  });

  // Match to existing expense
  const [matchingTxn, setMatchingTxn] = useState<PlaidTransaction | null>(null);
  const [matchExpenseSearch, setMatchExpenseSearch] = useState("");

  // Income filing
  const [incomeFilingTxn, setIncomeFilingTxn] = useState<PlaidTransaction | null>(null);

  // Delete confirmation (inline — tracks which txn ID is pending confirm)
  const [confirmDeleteTxnId, setConfirmDeleteTxnId] = useState<number | null>(null);
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

  const { data: allInvoices } = useQuery<UnpaidInvoice[]>({
    queryKey: ["invoices-all"],
    queryFn: () => apiFetch<UnpaidInvoice[]>("/api/invoices"),
    enabled: !!incomeFilingTxn,
    staleTime: 60_000,
  });

  const { data: unmatchedExpenses, isLoading: unmatchedExpensesLoading } = useQuery<UnmatchedExpense[]>({
    queryKey: ["unmatched-expenses"],
    queryFn: () => apiFetch<UnmatchedExpense[]>(`/api/plaid/expenses/unmatched?dateRange=90`),
    enabled: !!matchingTxn,
    staleTime: 0,
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
      const parts: string[] = [];
      if (data.inserted > 0) parts.push(`${data.inserted} new`);
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      const description = parts.length > 0 ? `Synced: ${parts.join(", ")}` : "No new transactions.";
      toast({ title: "Sync complete", description });
    },
    onError: (err: Error) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const refreshBalanceMutation = useMutation({
    mutationFn: () => apiFetch<PlaidBalance>("/api/plaid/balance?force=true"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plaid-balance"] });
      toast({ title: "Balance refreshed", description: "Live balance pulled from Plaid." });
    },
    onError: (err: Error) => toast({ title: "Refresh failed", description: err.message, variant: "destructive" }),
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

  const matchExpenseMutation = useMutation({
    mutationFn: ({ txnId, expenseId }: { txnId: number; expenseId: number }) =>
      apiFetch(`/api/plaid/transactions/${txnId}/match-expense`, {
        method: "POST",
        body: JSON.stringify({ expenseId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plaid-transactions"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setMatchingTxn(null);
      setMatchExpenseSearch("");
      toast({ title: "Transaction matched", description: "Bank transaction linked to existing expense." });
    },
    onError: (err: Error) => toast({ title: "Match failed", description: err.message, variant: "destructive" }),
  });

  const fileAsIncomeMutation = useMutation({
    mutationFn: ({ txnId, body }: { txnId: number; body: object }) =>
      apiFetch<{ ok: boolean; alreadyPaid?: boolean }>(`/api/plaid/transactions/${txnId}/file-as-income`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["plaid-transactions"] });
      qc.invalidateQueries({ queryKey: ["other-income"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-all"] });
      setIncomeFilingTxn(null);
      if (data?.alreadyPaid) {
        toast({ title: "Deposit reconciled", description: "Invoice was already paid — deposit linked without changing the balance." });
      } else {
        toast({ title: "Income recorded", description: "Deposit has been filed successfully." });
      }
    },
    onError: (err: Error) => toast({ title: "Failed to file income", description: err.message, variant: "destructive" }),
  });

  const unmatchMutation = useMutation({
    mutationFn: (txnId: number) =>
      apiFetch(`/api/plaid/transactions/${txnId}/unmatch`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plaid-transactions"] });
      toast({ title: "Link removed", description: "Transaction is available to file again." });
    },
    onError: (err: Error) => toast({ title: "Failed to remove link", description: err.message, variant: "destructive" }),
  });

  const deleteTxnMutation = useMutation({
    mutationFn: (txnId: number) =>
      apiFetch(`/api/plaid/transactions/${txnId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plaid-transactions"] });
      setConfirmDeleteTxnId(null);
      toast({ title: "Transaction removed", description: "The duplicate entry has been deleted." });
    },
    onError: (err: Error) => {
      setConfirmDeleteTxnId(null);
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
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
        countsTowardJobProfit: fileExpenseCountsTowardJobProfit,
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
          <div className="flex flex-col items-end gap-0.5">
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
            {connection.lastSyncedAt && (
              <span className="text-xs text-muted-foreground">
                Last synced:{" "}
                {new Date(connection.lastSyncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {" at "}
                {new Date(connection.lastSyncedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(true)}
            title="Plaid settings & cost info"
          >
            <Settings className="w-4 h-4" />
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Current Balance
              </CardTitle>
              <button
                onClick={() => refreshBalanceMutation.mutate()}
                disabled={refreshBalanceMutation.isPending}
                title="Refresh live balance from Plaid (uses 1 API call ~$0.10)"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50 transition-colors"
              >
                {refreshBalanceMutation.isPending
                  ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  : <RefreshCw className="w-3 h-3" />}
                Refresh
              </button>
            </div>
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
                              <div className="inline-flex items-center gap-2">
                                {txn.matchedExpenseId && txn.matchedExpenseDescription ? (
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium cursor-default max-w-[180px]">
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                          <span className="truncate">
                                            {txn.matchedExpenseVendor
                                              ? `${txn.matchedExpenseVendor} – $${parseFloat(txn.matchedExpenseAmount ?? "0").toFixed(2)}`
                                              : txn.matchedExpenseDescription}
                                          </span>
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="max-w-xs p-3 text-left space-y-1">
                                        <p className="font-semibold text-sm">{txn.matchedExpenseDescription}</p>
                                        {txn.matchedExpenseVendor && (
                                          <p className="text-xs opacity-80">Vendor: {txn.matchedExpenseVendor}</p>
                                        )}
                                        {txn.matchedExpenseCategory && (
                                          <p className="text-xs opacity-80">Category: {txn.matchedExpenseCategory}</p>
                                        )}
                                        {txn.matchedExpenseDate && (
                                          <p className="text-xs opacity-80">
                                            Date: {new Date(txn.matchedExpenseDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                          </p>
                                        )}
                                        {txn.matchedExpenseAmount && (
                                          <p className="text-xs font-medium">Amount: ${parseFloat(txn.matchedExpenseAmount).toFixed(2)}</p>
                                        )}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    Filed ✓
                                  </span>
                                )}
                                {txn.matchedExpenseJobId != null && isTravelCategory(txn.matchedExpenseCategory) && (
                                  <Link
                                    href={`/trip-packet/${txn.matchedExpenseJobId}`}
                                    title="View trip documentation for this travel expense"
                                    className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-semibold hover:underline whitespace-nowrap"
                                  >
                                    <FileText className="w-3 h-3" /> Trip docs
                                  </Link>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs px-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  title="Remove link"
                                  onClick={() => unmatchMutation.mutate(txn.id)}
                                  disabled={unmatchMutation.isPending}
                                >
                                  <Unlink className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : isCredit ? (
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs px-2.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                  onClick={() => openIncomeFilingSheet(txn)}
                                >
                                  <TrendingUp className="w-3 h-3 mr-1" />
                                  File as Income
                                </Button>
                                {confirmDeleteTxnId === txn.id ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-destructive">
                                    <button className="font-semibold underline" onClick={() => deleteTxnMutation.mutate(txn.id)} disabled={deleteTxnMutation.isPending}>Yes</button>
                                    <span>/</span>
                                    <button className="text-muted-foreground" onClick={() => setConfirmDeleteTxnId(null)}>No</button>
                                  </span>
                                ) : (
                                  <button
                                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    title="Delete duplicate"
                                    onClick={() => setConfirmDeleteTxnId(txn.id)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col items-end gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs px-2.5"
                                  onClick={() => openFilingSheet(txn)}
                                >
                                  <Receipt className="w-3 h-3 mr-1" />
                                  File as Expense
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs px-2.5 text-blue-700 border-blue-300 hover:bg-blue-50"
                                  onClick={() => {
                                    setMatchingTxn(txn);
                                    setMatchExpenseSearch("");
                                  }}
                                >
                                  <Link2 className="w-3 h-3 mr-1" />
                                  Match to Expense
                                </Button>
                                {confirmDeleteTxnId === txn.id ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-destructive">
                                    <span className="text-muted-foreground mr-0.5">Delete?</span>
                                    <button className="font-semibold underline" onClick={() => deleteTxnMutation.mutate(txn.id)} disabled={deleteTxnMutation.isPending}>Yes</button>
                                    <span>/</span>
                                    <button className="text-muted-foreground" onClick={() => setConfirmDeleteTxnId(null)}>No</button>
                                  </span>
                                ) : (
                                  <button
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    title="Delete duplicate"
                                    onClick={() => setConfirmDeleteTxnId(txn.id)}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Remove
                                  </button>
                                )}
                              </div>
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
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((f) => ({ ...f, category: val }));
                  if (form.jobId && isTravelCategory(val)) setFileExpenseCountsTowardJobProfit(false);
                  else if (!isTravelCategory(val)) setFileExpenseCountsTowardJobProfit(true);
                }}
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
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((f) => ({ ...f, jobId: val }));
                  if (val && isTravelCategory(form.category)) setFileExpenseCountsTowardJobProfit(false);
                  else if (!val) setFileExpenseCountsTowardJobProfit(true);
                }}
              >
                <option value="">— None —</option>
                {jobs
                  ?.filter((j) => j.status !== "completed" && j.status !== "cancelled")
                  .map((j) => (
                    <option key={j.id} value={String(j.id)}>{formatJobLabel(j)}</option>
                  ))}
                {jobs
                  ?.filter((j) => j.status === "completed" || j.status === "cancelled")
                  .length ? (
                    <optgroup label="Closed jobs">
                      {jobs
                        .filter((j) => j.status === "completed" || j.status === "cancelled")
                        .map((j) => (
                          <option key={j.id} value={String(j.id)}>{formatJobLabel(j)}</option>
                        ))}
                    </optgroup>
                  ) : null}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fe-notes">{isTravelCategory(form.category) ? "Business purpose" : "Notes (optional)"}</Label>
              <Textarea
                id="fe-notes"
                rows={2}
                placeholder={isTravelCategory(form.category) ? "Business purpose (required for IRS — e.g. client meeting, site inspection)" : "Any additional details…"}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            {form.jobId && form.category !== "Owner Draw" && (
              <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-blue-200 bg-blue-50/60">
                <button
                  type="button"
                  onClick={() => setFileExpenseCountsTowardJobProfit(v => !v)}
                  className={`mt-0.5 flex-shrink-0 w-10 h-6 rounded-full transition-colors relative ${!fileExpenseCountsTowardJobProfit ? "bg-blue-500" : "bg-muted-foreground/30"}`}
                  aria-pressed={!fileExpenseCountsTowardJobProfit}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${!fileExpenseCountsTowardJobProfit ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-blue-900">Tax audit trail only</p>
                  <p className="text-xs text-blue-700/80 mt-0.5">Links to job for tax records but <strong>does not reduce job profit</strong></p>
                </div>
              </div>
            )}

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

      {/* ── Match to Expense Sheet ───────────────────────────────────────────── */}
      <Sheet open={!!matchingTxn} onOpenChange={(open) => { if (!open) { setMatchingTxn(null); setMatchExpenseSearch(""); } }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-blue-600" />
              Match to Expense
            </SheetTitle>
            <SheetDescription>
              {matchingTxn && (
                <>
                  {new Date(matchingTxn.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  {" · "}
                  <span className="font-medium">{formatCurrency(parseFloat(matchingTxn.amount))}</span>
                  {" — "}
                  {matchingTxn.description}
                </>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="me-search">Search expenses</Label>
              <Input
                id="me-search"
                placeholder="Name, category, vendor…"
                value={matchExpenseSearch}
                onChange={(e) => setMatchExpenseSearch(e.target.value)}
                autoComplete="off"
              />
            </div>

            {unmatchedExpensesLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-14 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : !unmatchedExpenses || unmatchedExpenses.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No unmatched expenses found near this amount.
                <br />
                <span className="text-xs mt-1 block">Try "File as Expense" to create a new one.</span>
              </div>
            ) : (
              (() => {
                const search = matchExpenseSearch.toLowerCase();
                const filtered = unmatchedExpenses.filter((exp) =>
                  !search ||
                  exp.description.toLowerCase().includes(search) ||
                  exp.category.toLowerCase().includes(search) ||
                  (exp.vendor ?? "").toLowerCase().includes(search)
                );
                return filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No results for "{matchExpenseSearch}"</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Showing {filtered.length} expense{filtered.length !== 1 ? "s" : ""}
                      {matchingTxn && ` near ${formatCurrency(parseFloat(matchingTxn.amount))}`}
                    </p>
                    {filtered.map((exp) => (
                      <button
                        key={exp.id}
                        type="button"
                        disabled={matchExpenseMutation.isPending}
                        onClick={() => {
                          if (!matchingTxn) return;
                          matchExpenseMutation.mutate({ txnId: matchingTxn.id, expenseId: exp.id });
                        }}
                        className="w-full text-left rounded-lg border border-input px-4 py-3 hover:bg-blue-50 hover:border-blue-300 transition-colors disabled:opacity-50 group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{exp.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(exp.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              {" · "}{exp.category}
                              {exp.vendor ? ` · ${exp.vendor}` : ""}
                            </p>
                          </div>
                          <span className="text-sm font-semibold tabular-nums shrink-0 group-hover:text-blue-700">
                            {formatCurrency(parseFloat(exp.amount))}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()
            )}

            {matchExpenseMutation.isPending && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Linking…
              </div>
            )}
          </div>

          <SheetFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => { setMatchingTxn(null); setMatchExpenseSearch(""); }}
              disabled={matchExpenseMutation.isPending}
            >
              Cancel
            </Button>
          </SheetFooter>
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
                  <div className="text-[10px] opacity-70 mt-0.5">Link deposit to an invoice (paid or unpaid)</div>
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
                  {allInvoices && allInvoices.length > 0 ? (
                    [...allInvoices]
                      .sort((a, b) => {
                        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                        if (bTime !== aTime) return bTime - aTime;
                        const aPaid = a.status === "paid" ? 1 : 0;
                        const bPaid = b.status === "paid" ? 1 : 0;
                        return aPaid - bPaid;
                      })
                      .map((inv) => (
                      <option key={inv.id} value={String(inv.id)}>
                        {inv.invoiceNumber}
                        {inv.clientName ? ` — ${inv.clientName}` : ""}
                        {" · "}{formatCurrency(parseFloat(inv.total))}
                        {inv.status === "paid" ? " ✓ paid"
                          : inv.status === "partial" ? " (partial)"
                          : inv.dueDate ? ` (due ${new Date(inv.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : ""}
                      </option>
                    ))
                  ) : (
                    <option disabled value="">No invoices found</option>
                  )}
                </select>
                {(() => {
                  const sel = allInvoices?.find((inv) => String(inv.id) === incomeForm.invoiceId);
                  const isFullyPaid = sel && parseFloat(sel.amountPaid ?? "0") >= parseFloat(sel.total);
                  return isFullyPaid ? (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      This invoice is already paid — this will just reconcile the deposit.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      The invoice will be marked as <span className="font-medium">paid</span> and this deposit will be linked to it.
                    </p>
                  );
                })()}
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
                      ?.filter((j) => j.status !== "completed" && j.status !== "cancelled")
                      .map((j) => (
                        <option key={j.id} value={String(j.id)}>{formatJobLabel(j)}</option>
                      ))}
                    {jobs?.some((j) => j.status === "completed" || j.status === "cancelled") && (
                      <optgroup label="Closed jobs">
                        {jobs.filter((j) => j.status === "completed" || j.status === "cancelled").map((j) => (
                          <option key={j.id} value={String(j.id)}>{formatJobLabel(j)}</option>
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

      {/* Plaid API Settings Panel */}
      <Sheet open={showSettings} onOpenChange={setShowSettings}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Banking API Settings
            </SheetTitle>
            <SheetDescription>
              Control how often BuildPro calls Plaid. Balance checks cost money; transactions are included in your monthly Plaid item fee.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Balance Refresh Frequency */}
            <div>
              <Label className="text-sm font-semibold">Balance Refresh Frequency</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                Each balance check costs ~$0.10. Use "Manual only" and tap the Refresh button on the balance card when you need it.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(["manual", "daily", "weekly", "monthly"] as BalanceFreq[]).map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setBalanceFreq(freq)}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all capitalize ${
                      balanceFreq === freq
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {freq === "manual" ? "Manual only" : `Every ${freq.replace("ly", "")}`}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Note: Automatic scheduling is informational — BuildPro currently always pulls balance on-demand when you click Refresh. This setting tracks your preference.
              </p>
            </div>

            {/* Transaction Sync Frequency */}
            <div>
              <Label className="text-sm font-semibold">Transaction Sync Frequency</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                Syncing transactions does not cost extra — it's included in your Plaid item subscription. Sync as often as you like.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(["manual", "daily"] as SyncFreq[]).map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setSyncFreq(freq)}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      syncFreq === freq
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {freq === "manual" ? "Manual only" : "Auto-daily (6 AM)"}
                  </button>
                ))}
              </div>
            </div>

            {/* Cost Breakdown Info */}
            <div className="rounded-xl border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCostInfo(!showCostInfo)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-500" />
                  Estimated Monthly Cost Breakdown
                </span>
                <span className="text-muted-foreground text-xs">{showCostInfo ? "▲ Hide" : "▼ Show"}</span>
              </button>

              {showCostInfo && (
                <div className="px-4 pb-4 space-y-3 border-t border-border">
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plaid item fee (transactions)</span>
                      <span className="font-medium">Included in plan</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Balance checks ({estimatedBalanceCalls}/mo @ $0.10 ea)
                      </span>
                      <span className={`font-medium ${estimatedBalanceCalls > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                        {estimatedBalanceCalls === 0 ? "Free" : `~$${estimatedBalanceCost}`}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2">
                      <span className="font-semibold">Estimated extra/month</span>
                      <span className={`font-bold ${estimatedBalanceCalls > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                        {estimatedBalanceCalls === 0 ? "$0.00" : `~$${estimatedBalanceCost}`}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    Plaid pricing is approximate and varies by plan. Balance is cached for up to 30 days — if you last refreshed recently, no new charge occurs. Actual invoices come from Plaid directly.
                  </p>
                  <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800">
                    <strong>Tip:</strong> Since you can check your real-time balance on your banking app, keeping Balance Refresh on "Manual only" costs $0 extra and still lets you pull a fresh number whenever you want.
                  </div>
                </div>
              )}
            </div>
          </div>

          <SheetFooter className="mt-8">
            <Button variant="outline" onClick={() => setShowSettings(false)} className="w-full">
              Done
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
