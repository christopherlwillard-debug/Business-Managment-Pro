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
import { Landmark, RefreshCw, Unlink, AlertCircle, DollarSign, CheckCircle2, Receipt, TrendingUp, Settings, Info, X, Link2, ExternalLink, Trash2, FileText, PiggyBank, Zap } from "lucide-react";
import { Link } from "wouter";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

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

interface LinkedInvoiceSummary {
  invoiceNumber: string | null;
  total: string;
  clientName: string | null;
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
  investmentTransferId: number | null;
  linkedInvoices: LinkedInvoiceSummary[] | null;
}

interface InvestmentAccountOption {
  id: number;
  name: string;
  institution: string | null;
  accountType: string;
}

interface SyncResult {
  synced: number;
  plaidReturned: number;
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

type MatchType = "expense" | "invoice" | "sub_payment" | "recurring";

interface MatchSuggestion {
  score: number;
  reasons: string[];
  matchType: MatchType;
  // expense fields
  expense?: {
    id: number;
    date: string;
    description: string;
    category: string;
    amount: string;
    vendor: string | null;
    jobId: number | null;
  };
  // invoice fields
  invoiceId?: number;
  invoiceNumber?: string | null;
  invoiceDescription?: string;
  clientName?: string | null;
  // recurring fields
  recurringCategory?: string;
  recurringLabel?: string;
  // sub payment fields
  subPaymentId?: number;
  subPaymentDescription?: string;
  subcontractorId?: number | null;
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
    category: "Tools/Equipment",
    jobId: "",
    businessLine: "",
    notes: "",
  });

  // Match to existing expense / invoice
  const [matchingTxn, setMatchingTxn] = useState<PlaidTransaction | null>(null);
  const [matchExpenseSearch, setMatchExpenseSearch] = useState("");
  const [showAllExpenses, setShowAllExpenses] = useState(false);

  // Split sub-payment matching
  const [splitSubPayMode, setSplitSubPayMode] = useState(false);
  const [selectedSprIds, setSelectedSprIds] = useState<Set<number>>(new Set());

  // Multi-invoice matching state
  const [showMultiInvoice, setShowMultiInvoice] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set());
  const [multiInvoiceSearch, setMultiInvoiceSearch] = useState("");

  // Banking settings (#1317)
  const [showBankingSettings, setShowBankingSettings] = useState(false);
  const [autoMatchEnabled, setAutoMatchEnabled] = useState(() =>
    localStorage.getItem("banking-auto-match") !== "false"
  );
  const [confidenceThreshold, setConfidenceThreshold] = useState(() =>
    parseInt(localStorage.getItem("banking-confidence-threshold") ?? "95", 10)
  );

  function saveAutoMatch(val: boolean) {
    setAutoMatchEnabled(val);
    localStorage.setItem("banking-auto-match", String(val));
  }
  function saveConfidenceThreshold(val: number) {
    setConfidenceThreshold(val);
    localStorage.setItem("banking-confidence-threshold", String(val));
  }

  // #1322 — Vendor learning rules (localStorage)
  interface VendorRule { normalizedVendor: string; category: string; count: number; updatedAt: string; }
  const [vendorRules, setVendorRules] = useState<VendorRule[]>(() => {
    try { return JSON.parse(localStorage.getItem("banking-vendor-rules") ?? "[]"); } catch { return []; }
  });

  function learnVendorRule(rawDescription: string, category: string) {
    const key = rawDescription.toUpperCase().trim().replace(/[^A-Z0-9\s]/g, "").replace(/\s+/g, " ").slice(0, 40);
    if (!key || !category) return;
    setVendorRules(prev => {
      const existing = prev.find(r => r.normalizedVendor === key);
      const updated: VendorRule[] = existing
        ? prev.map(r => r.normalizedVendor === key
            ? { ...r, category, count: r.count + 1, updatedAt: new Date().toISOString().slice(0, 10) }
            : r)
        : [...prev, { normalizedVendor: key, category, count: 1, updatedAt: new Date().toISOString().slice(0, 10) }];
      localStorage.setItem("banking-vendor-rules", JSON.stringify(updated));
      return updated;
    });
  }

  function deleteVendorRule(normalizedVendor: string) {
    setVendorRules(prev => {
      const updated = prev.filter(r => r.normalizedVendor !== normalizedVendor);
      localStorage.setItem("banking-vendor-rules", JSON.stringify(updated));
      return updated;
    });
  }

  // #1323 — Month-end reconciliation wizard
  const [showReconcileWizard, setShowReconcileWizard] = useState(false);
  const [statementBalance, setStatementBalance] = useState("");

  // Income filing
  const [incomeFilingTxn, setIncomeFilingTxn] = useState<PlaidTransaction | null>(null);

  // Delete confirmation (inline — tracks which txn ID is pending confirm)
  const [confirmDeleteTxnId, setConfirmDeleteTxnId] = useState<number | null>(null);

  // Remove investment classification confirmation
  const [removeInvestmentConfirmTxnId, setRemoveInvestmentConfirmTxnId] = useState<number | null>(null);

  // Investment transfer filing
  const [investmentFilingTxn, setInvestmentFilingTxn] = useState<PlaidTransaction | null>(null);
  const [investmentAccountId, setInvestmentAccountId] = useState<string>("");
  const [investmentNotes, setInvestmentNotes] = useState<string>("");
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
    enabled: !!incomeFilingTxn || (!!matchingTxn && matchingTxn.transactionType === "credit"),
    staleTime: 60_000,
  });

  interface UnlinkedSubPayment {
    id: number;
    amount: string;
    paymentDate: string;
    description: string | null;
    subcontractorName: string | null;
    jobTitle: string | null;
  }

  const { data: unlinkedSprs } = useQuery<UnlinkedSubPayment[]>({
    queryKey: ["unlinked-sub-payments"],
    queryFn: () => apiFetch<UnlinkedSubPayment[]>("/api/plaid/sub-payments/unlinked"),
    enabled: !!matchingTxn && splitSubPayMode,
    staleTime: 0,
  });

  const { data: suggestions, isLoading: suggestionsLoading } = useQuery<MatchSuggestion[]>({
    queryKey: ["match-suggestions", matchingTxn?.id],
    queryFn: () => apiFetch<MatchSuggestion[]>(`/api/plaid/transactions/${matchingTxn!.id}/suggestions`),
    enabled: !!matchingTxn,
    staleTime: 0,
  });

  const { data: unmatchedExpenses, isLoading: unmatchedExpensesLoading } = useQuery<UnmatchedExpense[]>({
    queryKey: ["unmatched-expenses"],
    queryFn: () => apiFetch<UnmatchedExpense[]>(`/api/plaid/expenses/unmatched?dateRange=90`),
    enabled: !!matchingTxn && showAllExpenses,
    staleTime: 0,
  });

  const investmentBizId = activeBusiness?.id ?? null;
  const { data: investmentAccounts } = useQuery<InvestmentAccountOption[]>({
    queryKey: ["investment-accounts-picker", investmentBizId],
    queryFn: async () => {
      const qs = investmentBizId ? `?businessId=${investmentBizId}` : "";
      const res = await apiFetch<{ accounts: InvestmentAccountOption[] }>(`/api/investments/accounts/summary${qs}`);
      // Return only active accounts for the picker
      return ((res as any).accounts ?? []).filter((a: any) => a.active);
    },
    enabled: !!investmentFilingTxn,
    staleTime: 60000,
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
      let description: string;
      if (data.plaidReturned === 0) {
        description = "Plaid returned 0 transactions. If you have recent activity, try again in a few minutes — Chase can take a moment to refresh.";
      } else if (parts.length > 0) {
        description = `Imported: ${parts.join(", ")} transaction${data.inserted + data.updated !== 1 ? "s" : ""} (last 90 days).`;
      } else {
        description = `${data.plaidReturned} transaction${data.plaidReturned !== 1 ? "s" : ""} already up to date.`;
      }
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
      // #1322: learn vendor→category from manual filing
      if (filingTxn && form.category) {
        learnVendorRule(filingTxn.description, form.category);
      }
      setFilingTxn(null);
      toast({ title: "Expense filed", description: "Transaction has been recorded as an expense." });
    },
    onError: (err: Error) => toast({ title: "Failed to file expense", description: err.message, variant: "destructive" }),
  });

  const fileAsInvestmentMutation = useMutation({
    mutationFn: ({ txnId, body }: { txnId: number; body: object }) =>
      apiFetch(`/api/investments/transactions/${txnId}/file-as-investment`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plaid-transactions"] });
      qc.invalidateQueries({ queryKey: ["investments-summary"] });
      setInvestmentFilingTxn(null);
      setInvestmentAccountId("");
      setInvestmentNotes("");
      toast({ title: "Investment transfer recorded", description: "Transaction categorized as an investment transfer." });
    },
    onError: (err: Error) => toast({ title: "Failed to file investment transfer", description: err.message, variant: "destructive" }),
  });

  const matchSubPaymentMutation = useMutation({
    mutationFn: ({ txnId, subPaymentId }: { txnId: number; subPaymentId: number }) =>
      apiFetch(`/api/plaid/transactions/${txnId}/match-sub-payment`, {
        method: "POST",
        body: JSON.stringify({ subPaymentId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plaid-transactions"] });
      qc.invalidateQueries({ queryKey: ["unlinked-sub-payments"] });
      setMatchingTxn(null);
      toast({ title: "Transaction matched", description: "Bank transaction linked to sub payment record." });
    },
    onError: (err: Error) => toast({ title: "Match failed", description: err.message, variant: "destructive" }),
  });

  const splitMatchSubPaymentsMutation = useMutation({
    mutationFn: ({ txnId, subPaymentIds }: { txnId: number; subPaymentIds: number[] }) =>
      apiFetch(`/api/plaid/transactions/${txnId}/split-match-sub-payments`, {
        method: "POST",
        body: JSON.stringify({ subPaymentIds }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["plaid-transactions"] });
      qc.invalidateQueries({ queryKey: ["unlinked-sub-payments"] });
      setMatchingTxn(null);
      setSplitSubPayMode(false);
      setSelectedSprIds(new Set());
      toast({ title: "Split match applied", description: `Bank transaction linked to ${vars.subPaymentIds.length} sub payment records.` });
    },
    onError: (err: Error) => toast({ title: "Split match failed", description: err.message, variant: "destructive" }),
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

  const matchMultipleInvoicesMutation = useMutation({
    mutationFn: ({ txnId, invoiceIds }: { txnId: number; invoiceIds: number[] }) =>
      apiFetch<{ ok: boolean; invoiceIds: number[] }>(`/api/plaid/transactions/${txnId}/match-invoices`, {
        method: "POST",
        body: JSON.stringify({ invoiceIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plaid-transactions"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-all"] });
      setMatchingTxn(null);
      setShowMultiInvoice(false);
      setSelectedInvoiceIds(new Set());
      setMultiInvoiceSearch("");
      toast({ title: "Invoices matched", description: "Bank deposit linked to multiple invoices." });
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

  const removeInvestmentMutation = useMutation({
    mutationFn: (txnId: number) =>
      apiFetch(`/api/investments/transactions/${txnId}/investment-classification`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plaid-transactions"] });
      qc.invalidateQueries({ queryKey: ["investment-accounts-picker"] });
      setRemoveInvestmentConfirmTxnId(null);
      toast({ title: "Investment classification removed", description: "Transaction is available to file again." });
    },
    onError: (err: Error) => {
      setRemoveInvestmentConfirmTxnId(null);
      toast({ title: "Failed to remove classification", description: err.message, variant: "destructive" });
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
      category: "Tools/Equipment",
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
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setStatementBalance(""); setShowReconcileWizard(true); }}
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Reconcile
              </Button>
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
            </div>
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
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Transactions (Last 30 Days)</CardTitle>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                Synced {new Date(connection.lastSyncedAt).toLocaleString()}
              </p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setShowBankingSettings(true)}
                      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Reconciliation settings</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          {/* Inbox summary bar */}
          {transactions && transactions.length > 0 && (() => {
            const unmatchedDebits = transactions.filter(t => t.transactionType === "debit" && t.status === "unmatched").length;
            const matched = transactions.filter(t => t.status === "matched").length;
            const investmentTransfers = transactions.filter(t => t.status === "investment_transfer").length;
            const totalFiled = matched + investmentTransfers;
            return (
              <div className="px-6 pb-2 flex items-center gap-4 text-xs text-muted-foreground border-b">
                {unmatchedDebits > 0 ? (
                  <span className="flex items-center gap-1.5 text-amber-700 font-medium">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {unmatchedDebits} unmatched debit{unmatchedDebits !== 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    All debits reconciled
                  </span>
                )}
                {totalFiled > 0 && (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    {totalFiled} filed
                  </span>
                )}
                {autoMatchEnabled && (
                  <span className="flex items-center gap-1.5 ml-auto text-blue-600">
                    <Zap className="w-3 h-3" />
                    Auto-match on
                  </span>
                )}
              </div>
            );
          })()}
          <CardContent className="p-0">
            {txnsLoading ? (
              <div className="space-y-2 p-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : !transactions || transactions.length === 0 ? (
              <div className="px-6 py-4 space-y-1">
                <p className="text-sm text-muted-foreground">No transactions found in the last 90 days.</p>
                <p className="text-xs text-muted-foreground/70">If you have recent activity, tap <span className="font-medium">Sync Transactions</span> — Chase can take a few minutes to make new transactions available.</p>
              </div>
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
                      const isInvestmentTransfer = txn.status === "investment_transfer";
                      const isFiled = txn.status === "matched" || isInvestmentTransfer;
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
                                {isInvestmentTransfer ? (
                                  removeInvestmentConfirmTxnId === txn.id ? (
                                    <span className="inline-flex items-center gap-1 text-xs text-destructive">
                                      <span className="font-medium">Remove investment record?</span>
                                      <button
                                        className="font-semibold underline"
                                        onClick={() => removeInvestmentMutation.mutate(txn.id)}
                                        disabled={removeInvestmentMutation.isPending}
                                      >Yes</button>
                                      <span>/</span>
                                      <button
                                        className="text-muted-foreground"
                                        onClick={() => setRemoveInvestmentConfirmTxnId(null)}
                                      >No</button>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400 font-medium">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                      Investment Transfer
                                      <button
                                        title="Remove investment classification"
                                        className="ml-0.5 p-0.5 rounded text-blue-400 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                        onClick={() => setRemoveInvestmentConfirmTxnId(txn.id)}
                                      >
                                        <Unlink className="w-3 h-3" />
                                      </button>
                                    </span>
                                  )
                                ) : txn.matchedExpenseId && txn.matchedExpenseDescription ? (
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
                                ) : txn.linkedInvoices && txn.linkedInvoices.length >= 2 ? (
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium cursor-default max-w-[200px]">
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                          <span className="truncate">
                                            Covers {txn.linkedInvoices.length} invoices
                                          </span>
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="max-w-xs p-3 text-left space-y-1.5">
                                        <p className="font-semibold text-sm">Combined payment</p>
                                        {txn.linkedInvoices.map((inv, i) => (
                                          <div key={i} className="flex items-center justify-between gap-3 text-xs">
                                            <span className="font-medium">{inv.invoiceNumber ?? `Invoice #${i + 1}`}</span>
                                            <span className="tabular-nums">{formatCurrency(parseFloat(inv.total))}</span>
                                          </div>
                                        ))}
                                        <div className="border-t pt-1 flex items-center justify-between text-xs font-semibold">
                                          <span>Total</span>
                                          <span className="tabular-nums">{formatCurrency(txn.linkedInvoices.reduce((s, inv) => s + parseFloat(inv.total), 0))}</span>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : txn.matchedInvoiceId ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                    Invoice matched ✓
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    Filed ✓
                                  </span>
                                )}
                                {!isInvestmentTransfer && txn.matchedExpenseJobId != null && isTravelCategory(txn.matchedExpenseCategory) && (
                                  <Link
                                    href={`/trip-packet/${txn.matchedExpenseJobId}`}
                                    title="View trip documentation for this travel expense"
                                    className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-semibold hover:underline whitespace-nowrap"
                                  >
                                    <FileText className="w-3 h-3" /> Trip docs
                                  </Link>
                                )}
                                {!isInvestmentTransfer && (
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
                                )}
                              </div>
                            ) : isCredit ? (
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs px-2.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                  onClick={() => openIncomeFilingSheet(txn)}
                                >
                                  <TrendingUp className="w-3 h-3 mr-1" />
                                  File as Income
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs px-2.5 text-blue-700 border-blue-300 hover:bg-blue-50"
                                  onClick={() => {
                                    setMatchingTxn(txn);
                                    setMatchExpenseSearch("");
                                    setShowAllExpenses(false);
                                  }}
                                >
                                  <Link2 className="w-3 h-3 mr-1" />
                                  Match to Invoice
                                </Button>
                                </div>
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
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs px-2.5 text-purple-700 border-purple-300 hover:bg-purple-50"
                                  onClick={() => {
                                    setInvestmentFilingTxn(txn);
                                    setInvestmentAccountId("");
                                    setInvestmentNotes("");
                                  }}
                                >
                                  <PiggyBank className="w-3 h-3 mr-1" />
                                  Investment Transfer
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

      {/* ── Banking Settings Sheet ──────────────────────────────────────────── */}
      <Sheet open={showBankingSettings} onOpenChange={setShowBankingSettings}>
        <SheetContent className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Reconciliation Settings
            </SheetTitle>
            <SheetDescription>
              Configure how bank transactions are automatically matched to expenses.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Auto-match toggle */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Auto-match on sync</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When syncing bank transactions, automatically link them to expenses
                  that are a near-certain match (score ≥ {confidenceThreshold}%).
                </p>
              </div>
              <Switch
                checked={autoMatchEnabled}
                onCheckedChange={saveAutoMatch}
              />
            </div>

            {/* Confidence threshold */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Confidence threshold</p>
                <span className="text-sm font-bold tabular-nums">{confidenceThreshold}%</span>
              </div>
              <Slider
                min={70}
                max={99}
                step={1}
                value={[confidenceThreshold]}
                onValueChange={([v]) => saveConfidenceThreshold(v)}
                disabled={!autoMatchEnabled}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>More matches</span>
                <span>Higher certainty</span>
              </div>
              <p className="text-xs text-muted-foreground bg-muted/60 rounded-md px-3 py-2">
                <span className="font-medium">Recommended: 95%</span> — Only auto-links transactions where
                the amount, vendor name, and date all align tightly and there's no competing match.
                Lower values increase matches but may require more manual review.
              </p>
            </div>

            {/* How scoring works */}
            <div className="space-y-2">
              <p className="text-sm font-medium">How confidence is calculated</p>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Amount match</span><span className="font-medium">45 pts</span>
                </div>
                <div className="flex justify-between">
                  <span>Vendor / description</span><span className="font-medium">25 pts</span>
                </div>
                <div className="flex justify-between">
                  <span>Date proximity</span><span className="font-medium">20 pts</span>
                </div>
                <div className="flex justify-between">
                  <span>Category hint</span><span className="font-medium">5 pts</span>
                </div>
                <div className="flex justify-between border-t pt-1.5 font-medium text-foreground">
                  <span>Max score</span><span>95 pts</span>
                </div>
              </div>
            </div>
          </div>

            {/* Learned Rules (#1322) */}
            {vendorRules.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Learned vendor rules ({vendorRules.length})</p>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => { setVendorRules([]); localStorage.removeItem("banking-vendor-rules"); }}
                  >
                    Clear all
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Rules learned from how you categorize transactions.</p>
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {vendorRules.sort((a, b) => b.count - a.count).map((rule) => (
                    <div key={rule.normalizedVendor} className="flex items-center justify-between gap-2 text-xs py-1 border-b last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{rule.normalizedVendor}</p>
                        <p className="text-muted-foreground">{rule.category} · used {rule.count}×</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteVendorRule(rule.normalizedVendor)}
                        className="p-0.5 rounded text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          <SheetFooter className="mt-6">
            <Button variant="outline" className="w-full" onClick={() => setShowBankingSettings(false)}>
              Done
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Month-End Reconciliation Wizard (#1323) ─────────────────────────── */}
      <Sheet open={showReconcileWizard} onOpenChange={setShowReconcileWizard}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Month-End Reconciliation
            </SheetTitle>
            <SheetDescription>
              Verify that your bank statement matches your recorded transactions.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-5">
            {/* Step 1: Enter statement balance */}
            <div className="space-y-2">
              <Label htmlFor="stmt-balance">Bank statement ending balance</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="stmt-balance"
                  className="pl-7"
                  placeholder="0.00"
                  value={statementBalance}
                  onChange={(e) => setStatementBalance(e.target.value.replace(/[^0-9.]/g, ""))}
                />
              </div>
            </div>

            {/* Transaction summary */}
            {transactions && transactions.length > 0 && (() => {
              const debits = transactions.filter(t => t.transactionType === "debit");
              const credits = transactions.filter(t => t.transactionType === "credit");
              const totalDebits = debits.reduce((sum, t) => sum + parseFloat(t.amount), 0);
              const totalCredits = credits.reduce((sum, t) => sum + parseFloat(t.amount), 0);
              const unmatchedDebits = debits.filter(t => t.status === "unmatched");
              const unmatchedCredits = credits.filter(t => t.status === "unmatched");
              const stmtAmt = parseFloat(statementBalance || "0");
              const netFromTxns = totalCredits - totalDebits;

              return (
                <div className="space-y-4">
                  {/* Balance comparison */}
                  <div className="rounded-lg border p-4 space-y-2">
                    <p className="text-sm font-medium">Period summary (Last 30 days)</p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total credits (in)</span>
                        <span className="text-emerald-700 font-medium">+{formatCurrency(totalCredits)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total debits (out)</span>
                        <span className="text-destructive font-medium">−{formatCurrency(totalDebits)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1.5 font-semibold">
                        <span>Net change</span>
                        <span className={netFromTxns >= 0 ? "text-emerald-700" : "text-destructive"}>
                          {netFromTxns >= 0 ? "+" : ""}{formatCurrency(netFromTxns)}
                        </span>
                      </div>
                    </div>

                    {statementBalance && !isNaN(stmtAmt) && (
                      <div className={`mt-3 rounded px-3 py-2 text-sm ${Math.abs(stmtAmt - netFromTxns) < 0.01
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-amber-50 text-amber-800"
                      }`}>
                        {Math.abs(stmtAmt - netFromTxns) < 0.01
                          ? "✓ Statement balance matches your records."
                          : `Difference: ${formatCurrency(Math.abs(stmtAmt - netFromTxns))} — check for missing transactions.`}
                      </div>
                    )}
                  </div>

                  {/* Unmatched transactions */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      {unmatchedDebits.length + unmatchedCredits.length > 0
                        ? `${unmatchedDebits.length + unmatchedCredits.length} transactions need attention`
                        : "All transactions reconciled ✓"}
                    </p>
                    {(unmatchedDebits.length > 0 || unmatchedCredits.length > 0) && (
                      <div className="space-y-1 max-h-52 overflow-y-auto">
                        {[...unmatchedDebits, ...unmatchedCredits].map(t => (
                          <div key={t.id} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0 gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{t.description}</p>
                              <p className="text-muted-foreground">
                                {new Date(t.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                {" · "}{t.transactionType === "credit" ? "Credit" : "Debit"}
                              </p>
                            </div>
                            <span className={`font-semibold tabular-nums shrink-0 ${t.transactionType === "credit" ? "text-emerald-700" : "text-foreground"}`}>
                              {t.transactionType === "credit" ? "+" : "−"}{formatCurrency(parseFloat(t.amount))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {unmatchedDebits.length === 0 && unmatchedCredits.length === 0 && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                      <p className="font-semibold">Ready to close the month</p>
                      <p className="text-xs mt-0.5">All transactions are matched. Your books are reconciled for this period.</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <SheetFooter className="mt-6">
            <Button variant="outline" className="w-full" onClick={() => setShowReconcileWizard(false)}>
              Done
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Match to Expense Sheet ───────────────────────────────────────────── */}
      <Sheet open={!!matchingTxn} onOpenChange={(open) => { if (!open) { setMatchingTxn(null); setMatchExpenseSearch(""); setShowAllExpenses(false); setShowMultiInvoice(false); setSelectedInvoiceIds(new Set()); setMultiInvoiceSearch(""); } }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-blue-600" />
              {matchingTxn?.transactionType === "credit" ? "Match to Invoice" : "Match to Expense"}
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
            {matchExpenseMutation.isPending && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Linking…
              </div>
            )}

            {showMultiInvoice ? (
              /* ── Multi-invoice selection view ── */
              (() => {
                const txnAmt = matchingTxn ? parseFloat(matchingTxn.amount) : 0;
                const selectedInvoices = allInvoices?.filter(inv => selectedInvoiceIds.has(inv.id)) ?? [];
                // Use remaining balance (total − amountPaid) so partial invoices contribute correctly
                const invRemaining = (inv: UnpaidInvoice) =>
                  Math.max(parseFloat(inv.total) - parseFloat(inv.amountPaid ?? "0"), 0);
                const selectedTotal = selectedInvoices.reduce((sum, inv) => sum + invRemaining(inv), 0);
                const diff = Math.abs(txnAmt - selectedTotal);
                const totalMatches = selectedInvoiceIds.size >= 2 && diff < 0.05;
                const PAYABLE_STATUSES = ["approved", "sent", "partiallyPaid", "overdue"];
                const searchLower = multiInvoiceSearch.toLowerCase();
                const filteredInvoices = (allInvoices ?? [])
                  .filter(inv => PAYABLE_STATUSES.includes(inv.status))
                  .filter(inv =>
                    !searchLower ||
                    (inv.invoiceNumber ?? "").toLowerCase().includes(searchLower) ||
                    (inv.clientName ?? "").toLowerCase().includes(searchLower)
                  );

                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        onClick={() => { setShowMultiInvoice(false); setSelectedInvoiceIds(new Set()); setMultiInvoiceSearch(""); }}
                      >
                        ← Back to suggestions
                      </button>
                      <span className="text-xs text-muted-foreground">
                        Deposit: <span className="font-semibold">{formatCurrency(txnAmt)}</span>
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Select 2 or more invoices whose totals add up to the deposit amount.
                    </p>

                    <Input
                      placeholder="Search by invoice # or client…"
                      value={multiInvoiceSearch}
                      onChange={(e) => setMultiInvoiceSearch(e.target.value)}
                      className="h-8 text-sm"
                    />

                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                      {filteredInvoices.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No invoices found.</p>
                      ) : filteredInvoices.map(inv => {
                        const isSelected = selectedInvoiceIds.has(inv.id);
                        const remaining = invRemaining(inv);
                        const isPartial = inv.status === "partiallyPaid";
                        return (
                          <button
                            key={inv.id}
                            type="button"
                            onClick={() => {
                              setSelectedInvoiceIds(prev => {
                                const next = new Set(prev);
                                if (next.has(inv.id)) next.delete(inv.id);
                                else next.add(inv.id);
                                return next;
                              });
                            }}
                            className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                              isSelected
                                ? "border-emerald-500 bg-emerald-50"
                                : "border-input hover:bg-muted/40"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold ${isSelected ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground/40"}`}>
                                    {isSelected ? "✓" : ""}
                                  </span>
                                  <p className="text-sm font-medium truncate">
                                    {inv.invoiceNumber}
                                    {inv.clientName ? ` — ${inv.clientName}` : ""}
                                  </p>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 pl-6">
                                  {isPartial
                                    ? `partial · ${formatCurrency(remaining)} remaining`
                                    : inv.dueDate
                                      ? `due ${new Date(inv.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                                      : "unpaid"}
                                </p>
                              </div>
                              <span className={`text-sm font-semibold tabular-nums shrink-0 ${isSelected ? "text-emerald-700" : ""}`}>
                                {formatCurrency(remaining)}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {selectedInvoiceIds.size > 0 && (
                      <div className={`rounded-lg px-3 py-2.5 text-sm font-medium flex items-center justify-between ${
                        totalMatches
                          ? "bg-emerald-50 border border-emerald-300 text-emerald-800"
                          : "bg-amber-50 border border-amber-200 text-amber-800"
                      }`}>
                        <span>
                          {selectedInvoiceIds.size} invoice{selectedInvoiceIds.size !== 1 ? "s" : ""} selected
                        </span>
                        <span className="tabular-nums font-bold">
                          {formatCurrency(selectedTotal)}
                          {totalMatches ? " ✓" : ` (${diff < txnAmt ? "−" : "+"}${formatCurrency(diff)} off)`}
                        </span>
                      </div>
                    )}

                    <Button
                      className="w-full"
                      disabled={!totalMatches || matchMultipleInvoicesMutation.isPending}
                      onClick={() => {
                        if (!matchingTxn || !totalMatches) return;
                        matchMultipleInvoicesMutation.mutate({
                          txnId: matchingTxn.id,
                          invoiceIds: Array.from(selectedInvoiceIds),
                        });
                      }}
                    >
                      {matchMultipleInvoicesMutation.isPending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                          Linking…
                        </>
                      ) : (
                        <>
                          <Link2 className="w-4 h-4 mr-2" />
                          Link {selectedInvoiceIds.size} Invoice{selectedInvoiceIds.size !== 1 ? "s" : ""}
                        </>
                      )}
                    </Button>
                  </div>
                );
              })()
            ) : !showAllExpenses ? (
              /* ── Smart suggestions view ── */
              <div className="space-y-3">
                {suggestionsLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : !suggestions || suggestions.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-6 text-center">
                    <p className="font-medium">No close matches found</p>
                    <p className="text-xs mt-1">Browse all expenses below to find the right one.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Best matches</p>
                    {suggestions.map((s, idx) => {
                      const badgeColor = s.score >= 90
                        ? "bg-emerald-100 text-emerald-800"
                        : s.score >= 70
                        ? "bg-amber-100 text-amber-800"
                        : "bg-muted text-muted-foreground";

                      const isInfoOnly = false;
                      const key = s.matchType === "expense"
                        ? `exp-${s.expense?.id}`
                        : s.matchType === "invoice"
                        ? `inv-${s.invoiceId}`
                        : s.matchType === "sub_payment"
                        ? `spr-${s.subPaymentId}`
                        : `rec-${idx}`;

                      // Derive display fields per matchType
                      const displayDesc = s.matchType === "expense"
                        ? s.expense?.description
                        : s.matchType === "invoice"
                        ? s.invoiceDescription
                        : s.matchType === "recurring"
                        ? s.recurringLabel
                        : s.subPaymentDescription;

                      const displaySub = s.matchType === "expense"
                        ? `${s.expense?.date ? new Date(s.expense.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}  · ${s.expense?.category ?? ""}${s.expense?.vendor ? ` · ${s.expense.vendor}` : ""}`
                        : s.matchType === "invoice"
                        ? `Invoice · ${s.clientName ?? "Client"}`
                        : s.matchType === "recurring"
                        ? `Suggested category: ${s.recurringCategory ?? "Office/Admin"}`
                        : `Sub payment record`;

                      const displayAmt = s.matchType === "expense" && s.expense?.amount
                        ? formatCurrency(parseFloat(s.expense.amount))
                        : null;

                      const typeLabel = s.matchType === "invoice"
                        ? { text: "Invoice", color: "bg-emerald-100 text-emerald-800" }
                        : s.matchType === "recurring"
                        ? { text: "Recurring", color: "bg-purple-100 text-purple-800" }
                        : s.matchType === "sub_payment"
                        ? { text: "Sub Pay", color: "bg-orange-100 text-orange-800" }
                        : null;

                      function handleClick() {
                        if (!matchingTxn) return;
                        if (s.matchType === "expense" && s.expense) {
                          matchExpenseMutation.mutate({ txnId: matchingTxn.id, expenseId: s.expense.id });
                        } else if (s.matchType === "invoice" && s.invoiceId) {
                          setMatchingTxn(null);
                          fileAsIncomeMutation.mutate({
                            txnId: matchingTxn.id,
                            body: { invoiceId: s.invoiceId, source: "invoice", description: s.invoiceDescription ?? "", notes: null, businessLine: null, jobId: null },
                          });
                        } else if (s.matchType === "recurring" && s.recurringCategory) {
                          // Pre-fill the filing sheet with the recurring category
                          setMatchingTxn(null);
                          setForm({
                            description: matchingTxn.description,
                            vendor: "",
                            category: s.recurringCategory,
                            jobId: "",
                            businessLine: activeBusiness?.slug ?? "",
                            notes: `Recurring: ${s.recurringLabel ?? ""}`,
                          });
                          setFilingTxn(matchingTxn);
                        } else if (s.matchType === "sub_payment" && s.subPaymentId) {
                          matchSubPaymentMutation.mutate({ txnId: matchingTxn.id, subPaymentId: s.subPaymentId });
                        }
                      }

                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={matchExpenseMutation.isPending || fileAsIncomeMutation.isPending || isInfoOnly}
                          onClick={handleClick}
                          className={`w-full text-left rounded-lg border px-4 py-3 transition-colors group ${
                            isInfoOnly
                              ? "border-dashed border-muted-foreground/30 cursor-default"
                              : "border-input hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded tabular-nums shrink-0 ${badgeColor}`}>
                                  {s.score}%
                                </span>
                                {typeLabel && (
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${typeLabel.color}`}>
                                    {typeLabel.text}
                                  </span>
                                )}
                                <p className="text-sm font-medium truncate">{displayDesc}</p>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{displaySub}</p>
                              {s.reasons.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {s.reasons.map((r) => (
                                    <span key={r} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                                      ✓ {r}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {displayAmt && (
                              <span className="text-sm font-semibold tabular-nums shrink-0 group-hover:text-blue-700">
                                {displayAmt}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}

                {/* ── Split sub-payment matching (debit only) ── */}
                {matchingTxn?.transactionType === "debit" && !splitSubPayMode && (
                  <button
                    type="button"
                    className="w-full text-xs text-orange-600 hover:text-orange-700 py-2 border border-dashed border-orange-200 rounded-lg hover:border-orange-300 transition-colors"
                    onClick={() => { setSplitSubPayMode(true); setSelectedSprIds(new Set()); }}
                  >
                    This payment covered multiple sub payments — split match
                  </button>
                )}

                {splitSubPayMode && matchingTxn && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Split Across Sub Payments</p>
                      <button
                        type="button"
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => { setSplitSubPayMode(false); setSelectedSprIds(new Set()); }}
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Select sub payment records that were paid together in this one transfer.</p>

                    {/* Running total */}
                    {(() => {
                      const txnAmt = Math.abs(parseFloat(matchingTxn.amount));
                      const selectedTotal = (unlinkedSprs ?? [])
                        .filter(s => selectedSprIds.has(s.id))
                        .reduce((sum, s) => sum + Math.abs(parseFloat(s.amount)), 0);
                      const diff = Math.abs(txnAmt - selectedTotal);
                      const isMatch = selectedSprIds.size >= 2 && diff < 1.00;
                      const isOver = selectedTotal > txnAmt + 1.00;

                      return (
                        <div className={`rounded-md px-3 py-2 text-xs flex items-center justify-between ${isMatch ? "bg-emerald-100 text-emerald-800" : isOver ? "bg-red-50 text-red-700" : "bg-white border border-border"}`}>
                          <span>Selected total</span>
                          <span className="font-bold tabular-nums">
                            {formatCurrency(selectedTotal)} / {formatCurrency(txnAmt)}
                            {isMatch && " ✓"}
                          </span>
                        </div>
                      );
                    })()}

                    {/* Sub payment list */}
                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                      {!unlinkedSprs ? (
                        <div className="text-xs text-muted-foreground text-center py-3">Loading…</div>
                      ) : unlinkedSprs.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-3">No unlinked sub payment records found.</div>
                      ) : (
                        unlinkedSprs.map(spr => {
                          const checked = selectedSprIds.has(spr.id);
                          return (
                            <label
                              key={spr.id}
                              className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${checked ? "border-orange-400 bg-orange-50" : "border-border bg-background hover:bg-muted/30"}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setSelectedSprIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(spr.id)) next.delete(spr.id); else next.add(spr.id);
                                    return next;
                                  });
                                }}
                                className="accent-orange-500 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium truncate">{spr.subcontractorName ?? "Sub"}{spr.jobTitle ? ` — ${spr.jobTitle}` : ""}</p>
                                <p className="text-[10px] text-muted-foreground">{spr.description ?? "Sub payment"} · {new Date(spr.paymentDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                              </div>
                              <span className="text-xs font-semibold tabular-nums shrink-0">{formatCurrency(parseFloat(spr.amount))}</span>
                            </label>
                          );
                        })
                      )}
                    </div>

                    {/* Link button */}
                    {(() => {
                      const txnAmt = Math.abs(parseFloat(matchingTxn.amount));
                      const selectedTotal = (unlinkedSprs ?? [])
                        .filter(s => selectedSprIds.has(s.id))
                        .reduce((sum, s) => sum + Math.abs(parseFloat(s.amount)), 0);
                      const isMatch = selectedSprIds.size >= 2 && Math.abs(txnAmt - selectedTotal) < 1.00;
                      return (
                        <button
                          type="button"
                          disabled={!isMatch || splitMatchSubPaymentsMutation.isPending}
                          onClick={() => splitMatchSubPaymentsMutation.mutate({ txnId: matchingTxn.id, subPaymentIds: Array.from(selectedSprIds) })}
                          className="w-full py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {splitMatchSubPaymentsMutation.isPending ? "Linking…" : `Link ${selectedSprIds.size} records`}
                        </button>
                      );
                    })()}
                  </div>
                )}

                {/* Credit: match multiple invoices; Debit: browse all expenses */}
                {matchingTxn?.transactionType === "credit" ? (
                  <button
                    type="button"
                    className="w-full text-sm text-muted-foreground hover:text-foreground py-2 border border-dashed rounded-lg hover:border-input transition-colors"
                    onClick={() => { setShowMultiInvoice(true); setShowAllExpenses(false); }}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5" />
                      Covers multiple invoices
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="w-full text-sm text-muted-foreground hover:text-foreground py-2 border border-dashed rounded-lg hover:border-input transition-colors"
                    onClick={() => setShowAllExpenses(true)}
                  >
                    Browse all unmatched expenses
                  </button>
                )}
              </div>
            ) : (
              /* ── Browse all expenses view ── */
              <div className="space-y-3">
                {suggestions && suggestions.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    onClick={() => setShowAllExpenses(false)}
                  >
                    ← Back to suggestions
                  </button>
                )}
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
                    No unmatched expenses found.
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
                          {filtered.length} expense{filtered.length !== 1 ? "s" : ""}
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

      {/* ── Investment Transfer Sheet ─────────────────────────────────────────── */}
      <Sheet open={!!investmentFilingTxn} onOpenChange={(open) => { if (!open) setInvestmentFilingTxn(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <PiggyBank className="w-4 h-4 text-purple-600" />
              Categorize as Investment Transfer
            </SheetTitle>
            <SheetDescription>
              {investmentFilingTxn && (
                <>
                  {new Date(investmentFilingTxn.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  {" · "}
                  <span className="font-medium">-{formatCurrency(parseFloat(investmentFilingTxn.amount))}</span>
                  <br />
                  This will be recorded as a deposit into the selected investment account. It will <strong>not</strong> appear on your P&amp;L or Schedule C.
                </>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 mt-6">
            <div className="space-y-1.5">
              <Label>Investment Account *</Label>
              {!investmentAccounts || investmentAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No investment accounts found. Go to{" "}
                  <strong>Accounting → Investments</strong> to create one first.
                </p>
              ) : (
                <select
                  value={investmentAccountId}
                  onChange={e => setInvestmentAccountId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select account…</option>
                  {investmentAccounts.map(a => (
                    <option key={a.id} value={String(a.id)}>
                      {a.name}{a.institution ? ` — ${a.institution}` : ""} ({a.accountType})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                value={investmentNotes}
                onChange={e => setInvestmentNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Monthly brokerage contribution"
              />
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-300">
              Investment transfers are asset movements — they stay on your balance sheet and are excluded from all expense and P&amp;L reports.
            </div>
          </div>

          <SheetFooter className="mt-6">
            <Button
              onClick={() => {
                if (!investmentFilingTxn || !investmentAccountId) return;
                fileAsInvestmentMutation.mutate({
                  txnId: investmentFilingTxn.id,
                  body: {
                    investmentAccountId: parseInt(investmentAccountId, 10),
                    transferType: "deposit",
                    notes: investmentNotes || undefined,
                  },
                });
              }}
              disabled={!investmentAccountId || fileAsInvestmentMutation.isPending}
              className="w-full"
            >
              {fileAsInvestmentMutation.isPending ? "Recording…" : "Record Investment Transfer"}
            </Button>
          </SheetFooter>
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
