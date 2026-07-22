import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, Trash2, Upload, FileText, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Edit3, Check, X, AlertCircle, Clock,
  Building2, PiggyBank,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: options?.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

function formatCurrency(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function formatPct(v: number | null | undefined): string {
  if (v == null) return "—";
  const pct = v * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ACCOUNT_TYPES = [
  "Brokerage", "IRA", "Roth IRA", "SEP-IRA", "401(k)",
  "Self-Directed IRA", "Mutual Fund", "CD", "Money Market", "Other",
];

const TRANSFER_TYPE_LABELS: Record<string, string> = {
  deposit: "Deposit",
  return_of_principal: "Return of Principal",
  adjustment: "Adjustment",
};

const DOC_TYPES = [
  "Annual Statement",
  "Quarterly Statement",
  "1099-DIV",
  "1099-B",
  "1099-INT",
  "Other",
];

interface AccountData {
  id: number;
  name: string;
  institution: string | null;
  accountType: string;
  businessOrPersonal: string;
  active: boolean;
  notes: string | null;
  plaidAccountId: string | null;
  totalInvested: number;
  portfolioValue: number | null;
  gainLoss: number | null;
  returnPct: number | null;
  lastValuationDate: string | null;
}

interface Transfer {
  id: number;
  investmentAccountId: number;
  transferType: string;
  date: string;
  amount: number;
  sourceBankAccount: string | null;
  notes: string | null;
  bankTransactionId: number | null;
}

interface Valuation {
  id: number;
  investmentAccountId: number;
  portfolioValue: number;
  valuationDate: string;
  notes: string | null;
}

interface TaxDocument {
  id: number;
  taxYear: number;
  documentType: string;
  fileName: string;
  objectPath: string;
  url: string | null;
  notes: string | null;
}

type ActiveSection = "summary" | "transfers" | "valuations" | "tax-docs" | "settings";

export default function InvestmentAccountDetail({
  accountId,
  onBack,
}: {
  accountId: number;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [activeSection, setActiveSection] = useState<ActiveSection>("summary");
  const [error, setError] = useState<string | null>(null);

  const { data: account, isLoading } = useQuery<AccountData>({
    queryKey: ["investment-account", accountId],
    queryFn: () => apiFetch(`/api/investments/accounts/${accountId}`),
  });

  const { data: transfers } = useQuery<Transfer[]>({
    queryKey: ["investment-transfers", accountId],
    queryFn: () => apiFetch(`/api/investments/accounts/${accountId}/transfers`),
    enabled: activeSection === "transfers" || activeSection === "summary",
  });

  const { data: valuations } = useQuery<Valuation[]>({
    queryKey: ["investment-valuations", accountId],
    queryFn: () => apiFetch(`/api/investments/accounts/${accountId}/valuations`),
    enabled: activeSection === "valuations" || activeSection === "summary",
  });

  const { data: taxDocs } = useQuery<TaxDocument[]>({
    queryKey: ["investment-tax-docs", accountId],
    queryFn: () => apiFetch(`/api/investments/accounts/${accountId}/tax-documents`),
    enabled: activeSection === "tax-docs",
  });

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["investment-account", accountId] });
    qc.invalidateQueries({ queryKey: ["investment-transfers", accountId] });
    qc.invalidateQueries({ queryKey: ["investment-valuations", accountId] });
    qc.invalidateQueries({ queryKey: ["investments-summary"] });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground animate-pulse">
        Loading account…
      </div>
    );
  }

  if (!account) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Account not found.</p>
        <button onClick={onBack} className="mt-4 text-sm text-primary hover:underline">← Back</button>
      </div>
    );
  }

  const gainPositive = (account.gainLoss ?? 0) >= 0;

  const SECTIONS = [
    { key: "summary" as const, label: "Summary" },
    { key: "transfers" as const, label: "Transfers" },
    { key: "valuations" as const, label: "Portfolio Value" },
    { key: "tax-docs" as const, label: "Tax Documents" },
    { key: "settings" as const, label: "Settings" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg border border-border hover:bg-muted/60 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground truncate">{account.name}</h2>
            {!account.active && (
              <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">Archived</span>
            )}
          </div>
          {account.institution && (
            <p className="text-sm text-muted-foreground">{account.institution} · {account.accountType}</p>
          )}
        </div>
      </div>

      {/* Section Nav */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {SECTIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveSection(key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeSection === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Section Content */}
      {activeSection === "summary" && (
        <SummarySection account={account} transfers={transfers ?? []} valuations={valuations ?? []} />
      )}
      {activeSection === "transfers" && (
        <TransfersSection
          accountId={accountId}
          transfers={transfers ?? []}
          onMutate={invalidateAll}
          onError={setError}
        />
      )}
      {activeSection === "valuations" && (
        <ValuationsSection
          accountId={accountId}
          valuations={valuations ?? []}
          onMutate={invalidateAll}
          onError={setError}
        />
      )}
      {activeSection === "tax-docs" && (
        <TaxDocsSection
          accountId={accountId}
          docs={taxDocs ?? []}
          onMutate={() => qc.invalidateQueries({ queryKey: ["investment-tax-docs", accountId] })}
          onError={setError}
        />
      )}
      {activeSection === "settings" && (
        <SettingsSection
          account={account}
          onMutate={invalidateAll}
          onError={setError}
          onArchiveSuccess={onBack}
        />
      )}
    </div>
  );
}

// ─── Summary Section ──────────────────────────────────────────────────────────

function SummarySection({
  account,
  transfers,
  valuations,
}: {
  account: AccountData;
  transfers: Transfer[];
  valuations: Valuation[];
}) {
  const gainPositive = (account.gainLoss ?? 0) >= 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Total Invested</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(account.totalInvested)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Portfolio Value</p>
          <p className="text-xl font-bold text-foreground mt-1">
            {account.portfolioValue != null ? formatCurrency(account.portfolioValue) : <span className="text-muted-foreground text-base">No valuation yet</span>}
          </p>
          {account.lastValuationDate && (
            <p className="text-xs text-muted-foreground mt-0.5">As of {formatDate(account.lastValuationDate)}</p>
          )}
        </div>
        {account.gainLoss != null && (
          <div className={`rounded-xl border p-4 col-span-2 ${
            gainPositive
              ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
              : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
          }`}>
            <p className="text-xs text-muted-foreground font-medium">Unrealized Gain / Loss</p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className={`text-xl font-bold ${gainPositive ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {formatCurrency(account.gainLoss)}
              </p>
              <span className={`text-sm font-medium ${gainPositive ? "text-green-600" : "text-red-500"}`}>
                {formatPct(account.returnPct)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Account info */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Account Type</span>
          <span className="font-medium">{account.accountType}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Classification</span>
          <span className="font-medium capitalize">{account.businessOrPersonal}</span>
        </div>
        {account.institution && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Institution</span>
            <span className="font-medium">{account.institution}</span>
          </div>
        )}
        {account.notes && (
          <div className="pt-1 border-t border-border">
            <p className="text-muted-foreground text-xs mb-0.5">Notes</p>
            <p className="text-sm">{account.notes}</p>
          </div>
        )}
      </div>

      {/* Recent transfers */}
      {transfers.length > 0 && (
        <div>
          <p className="text-sm font-medium text-foreground mb-2">Recent Transfers</p>
          <div className="space-y-2">
            {transfers.slice(0, 3).map(t => (
              <div key={t.id} className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2">
                <div>
                  <span className="font-medium">{TRANSFER_TYPE_LABELS[t.transferType] ?? t.transferType}</span>
                  <span className="text-muted-foreground ml-2">{formatDate(t.date)}</span>
                </div>
                <span className={`font-semibold ${t.transferType === "return_of_principal" ? "text-red-500" : "text-foreground"}`}>
                  {t.transferType === "return_of_principal" ? "−" : "+"}{formatCurrency(t.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Transfers Section ────────────────────────────────────────────────────────

interface NewTransferForm {
  transferType: string;
  date: string;
  amount: string;
  sourceBankAccount: string;
  notes: string;
}

function TransfersSection({
  accountId,
  transfers,
  onMutate,
  onError,
}: {
  accountId: number;
  transfers: Transfer[];
  onMutate: () => void;
  onError: (msg: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<NewTransferForm>({
    transferType: "deposit",
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    sourceBankAccount: "",
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch(`/api/investments/accounts/${accountId}/transfers`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      onMutate();
      setShowForm(false);
      setForm({ transferType: "deposit", date: new Date().toISOString().slice(0, 10), amount: "", sourceBankAccount: "", notes: "" });
    },
    onError: (err: Error) => onError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/investments/transfers/${id}`, { method: "DELETE" }),
    onSuccess: () => { onMutate(); setConfirmDeleteId(null); },
    onError: (err: Error) => { onError(err.message); setConfirmDeleteId(null); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) { onError("Amount must be greater than 0"); return; }
    createMutation.mutate({
      transferType: form.transferType,
      date: form.date,
      amount: form.amount,
      sourceBankAccount: form.sourceBankAccount || undefined,
      notes: form.notes || undefined,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Investment Transfers</h3>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Plus className="w-4 h-4" /> Add Transfer
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
              <select
                value={form.transferType}
                onChange={e => setForm(f => ({ ...f, transferType: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="deposit">Deposit</option>
                <option value="return_of_principal">Return of Principal</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Source Account</label>
              <input
                type="text"
                value={form.sourceBankAccount}
                onChange={e => setForm(f => ({ ...f, sourceBankAccount: e.target.value }))}
                placeholder="e.g. Chase Checking"
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? "Saving…" : "Record Transfer"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="h-9 px-4 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted/60"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {transfers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">No transfers recorded yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Add a transfer or categorize a bank transaction as an Investment Transfer on the Banking page.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {transfers.map(t => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {TRANSFER_TYPE_LABELS[t.transferType] ?? t.transferType}
                  </span>
                  {t.bankTransactionId && (
                    <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded px-1.5 py-0.5">Plaid</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>{formatDate(t.date)}</span>
                  {t.sourceBankAccount && <span>· {t.sourceBankAccount}</span>}
                  {t.notes && <span>· {t.notes}</span>}
                </div>
              </div>
              <span className={`text-sm font-semibold shrink-0 ${
                t.transferType === "return_of_principal" ? "text-red-500" : "text-foreground"
              }`}>
                {t.transferType === "return_of_principal" ? "−" : "+"}
                {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(t.amount)}
              </span>
              {confirmDeleteId === t.id ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => deleteMutation.mutate(t.id)}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 rounded text-red-600 hover:bg-red-100"
                    title="Confirm delete"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="p-1.5 rounded text-muted-foreground hover:bg-muted/60"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(t.id)}
                  className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-muted/60"
                  title="Delete transfer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Valuations Section ───────────────────────────────────────────────────────

function ValuationsSection({
  accountId,
  valuations,
  onMutate,
  onError,
}: {
  accountId: number;
  valuations: Valuation[];
  onMutate: () => void;
  onError: (msg: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({
    portfolioValue: "",
    valuationDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch(`/api/investments/accounts/${accountId}/valuations`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      onMutate();
      setShowForm(false);
      setForm({ portfolioValue: "", valuationDate: new Date().toISOString().slice(0, 10), notes: "" });
    },
    onError: (err: Error) => onError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/investments/valuations/${id}`, { method: "DELETE" }),
    onSuccess: () => { onMutate(); setConfirmDeleteId(null); },
    onError: (err: Error) => { onError(err.message); setConfirmDeleteId(null); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.portfolioValue || parseFloat(form.portfolioValue) < 0) { onError("Portfolio value is required"); return; }
    createMutation.mutate(form);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Portfolio Value History</h3>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Plus className="w-4 h-4" /> Update Value
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Portfolio Value *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.portfolioValue}
                onChange={e => setForm(f => ({ ...f, portfolioValue: e.target.value }))}
                placeholder="0.00"
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">As of Date</label>
              <input
                type="date"
                value={form.valuationDate}
                onChange={e => setForm(f => ({ ...f, valuationDate: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. End-of-quarter statement"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? "Saving…" : "Save Valuation"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="h-9 px-4 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted/60"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {valuations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">No portfolio valuations recorded yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Click "Update Value" to record the current portfolio value from your brokerage statement.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {valuations.map((v, idx) => (
            <div key={v.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v.portfolioValue)}
                  </span>
                  {idx === 0 && (
                    <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5 font-medium">Current</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>{formatDate(v.valuationDate)}</span>
                  {v.notes && <span>· {v.notes}</span>}
                </div>
              </div>
              {confirmDeleteId === v.id ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => deleteMutation.mutate(v.id)}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 rounded text-red-600 hover:bg-red-100"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="p-1.5 rounded text-muted-foreground hover:bg-muted/60"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(v.id)}
                  className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-muted/60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tax Documents Section ────────────────────────────────────────────────────

function TaxDocsSection({
  accountId,
  docs,
  onMutate,
  onError,
}: {
  accountId: number;
  docs: TaxDocument[];
  onMutate: () => void;
  onError: (msg: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [taxYear, setTaxYear] = useState(String(new Date().getFullYear() - 1));
  const [documentType, setDocumentType] = useState("Other");
  const [notes, setNotes] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/investments/tax-documents/${id}`, { method: "DELETE" }),
    onSuccess: () => { onMutate(); setConfirmDeleteId(null); },
    onError: (err: Error) => { onError(err.message); setConfirmDeleteId(null); },
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("document", file);
      fd.append("taxYear", taxYear);
      fd.append("documentType", documentType);
      if (notes) fd.append("notes", notes);
      await apiFetch(`/api/investments/accounts/${accountId}/tax-documents`, {
        method: "POST",
        body: fd,
      });
      onMutate();
      setNotes("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: any) {
      onError(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 7 }, (_, i) => currentYear - i);

  const grouped = docs.reduce<Record<number, TaxDocument[]>>((acc, d) => {
    if (!acc[d.taxYear]) acc[d.taxYear] = [];
    acc[d.taxYear].push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Tax Documents</h3>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">Upload Document</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Tax Year</label>
            <select
              value={taxYear}
              onChange={e => setTaxYear(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {yearOptions.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Document Type</label>
            <select
              value={documentType}
              onChange={e => setDocumentType(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 h-9 px-4 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted/60 disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          {uploading ? "Uploading…" : "Choose PDF"}
        </button>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
          <FileText className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No tax documents uploaded yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped)
            .sort(([a], [b]) => parseInt(b) - parseInt(a))
            .map(([year, yearDocs]) => (
              <div key={year}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{year}</p>
                <div className="space-y-2">
                  {yearDocs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{doc.documentType}</p>
                        <p className="text-xs text-muted-foreground truncate">{doc.fileName}</p>
                        {doc.notes && <p className="text-xs text-muted-foreground">{doc.notes}</p>}
                      </div>
                      {doc.url && (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline shrink-0"
                        >
                          View
                        </a>
                      )}
                      {confirmDeleteId === doc.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteMutation.mutate(doc.id)}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 rounded text-red-600 hover:bg-red-100"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="p-1.5 rounded text-muted-foreground hover:bg-muted/60"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(doc.id)}
                          className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-muted/60"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ─── Settings Section ─────────────────────────────────────────────────────────

function SettingsSection({
  account,
  onMutate,
  onError,
  onArchiveSuccess,
}: {
  account: AccountData;
  onMutate: () => void;
  onError: (msg: string) => void;
  onArchiveSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: account.name,
    institution: account.institution ?? "",
    accountType: account.accountType,
    businessOrPersonal: account.businessOrPersonal,
    notes: account.notes ?? "",
    plaidAccountId: account.plaidAccountId ?? "",
  });
  const [confirmArchive, setConfirmArchive] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch(`/api/investments/accounts/${account.id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => onMutate(),
    onError: (err: Error) => onError(err.message),
  });

  const archiveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/investments/accounts/${account.id}`, {
        method: "PUT",
        body: JSON.stringify({ active: !account.active }),
      }),
    onSuccess: () => { onMutate(); onArchiveSuccess(); },
    onError: (err: Error) => onError(err.message),
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { onError("Name is required"); return; }
    updateMutation.mutate(form);
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSave} className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Account Settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Account Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Institution</label>
            <input
              type="text"
              value={form.institution}
              onChange={e => setForm(f => ({ ...f, institution: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Account Type</label>
            <select
              value={form.accountType}
              onChange={e => setForm(f => ({ ...f, accountType: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Business or Personal</label>
            <select
              value={form.businessOrPersonal}
              onChange={e => setForm(f => ({ ...f, businessOrPersonal: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="business">Business</option>
              <option value="personal">Personal</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Plaid Account ID (optional)</label>
          <input
            type="text"
            value={form.plaidAccountId}
            onChange={e => setForm(f => ({ ...f, plaidAccountId: e.target.value }))}
            placeholder="Optional — for future auto-sync"
            className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          disabled={updateMutation.isPending}
          className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {updateMutation.isPending ? "Saving…" : "Save Changes"}
        </button>
        {updateMutation.isSuccess && (
          <span className="ml-2 text-xs text-green-600">Saved</span>
        )}
      </form>

      {/* Archive/Restore */}
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">{account.active ? "Archive Account" : "Restore Account"}</p>
        <p className="text-xs text-muted-foreground">
          {account.active
            ? "Archived accounts are hidden from the main list but their data is preserved."
            : "Restore this account to make it active and include it in totals."}
        </p>
        {confirmArchive ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
              className="h-8 px-3 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90 disabled:opacity-50"
            >
              {archiveMutation.isPending ? "…" : "Confirm"}
            </button>
            <button
              onClick={() => setConfirmArchive(false)}
              className="h-8 px-3 rounded-lg border border-border text-xs font-medium hover:bg-muted/60"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmArchive(true)}
            className="h-8 px-3 rounded-lg border border-border text-xs font-medium hover:bg-muted/60"
          >
            {account.active ? "Archive" : "Restore"}
          </button>
        )}
      </div>
    </div>
  );
}
