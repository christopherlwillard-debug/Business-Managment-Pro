import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, Plus, ChevronRight, Building2,
  PiggyBank, BarChart3, ArrowUpRight, AlertCircle, Star, Minus,
} from "lucide-react";
import { useBusiness } from "@/contexts/BusinessContext";
import InvestmentAccountDetail from "./InvestmentAccountDetail";

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
  return res.json();
}

function formatCurrency(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function formatPct(v: number | null | undefined): string {
  if (v == null) return "—";
  const pct = v * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

interface AccountSummary {
  id: number;
  name: string;
  institution: string | null;
  accountType: string;
  businessOrPersonal: string;
  active: boolean;
  totalInvested: number;
  portfolioValue: number | null;
  gainLoss: number | null;
  returnPct: number | null;
  lastValuationDate: string | null;
}

interface InvestmentSummary {
  accountCount: number;
  totalInvested: number;
  totalPortfolioValue: number | null;
  totalGainLoss: number | null;
  totalReturnPct: number | null;
  lastUpdate: string | null;
  largestAccount: { id: number; name: string } | null;
  bestAccount: { id: number; name: string; returnPct: number | null } | null;
  worstAccount: { id: number; name: string; returnPct: number | null } | null;
  accounts: AccountSummary[];
}

interface NewAccountForm {
  name: string;
  institution: string;
  accountType: string;
  businessOrPersonal: string;
  notes: string;
}

const ACCOUNT_TYPES = [
  "Brokerage",
  "IRA",
  "Roth IRA",
  "SEP-IRA",
  "401(k)",
  "Self-Directed IRA",
  "Mutual Fund",
  "CD",
  "Money Market",
  "Other",
];

export default function InvestmentsTab() {
  const qc = useQueryClient();
  const { activeBusiness } = useBusiness();
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState<NewAccountForm>({
    name: "",
    institution: "",
    accountType: "Brokerage",
    businessOrPersonal: "business",
    notes: "",
  });
  const [showInactive, setShowInactive] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const businessId = activeBusiness?.id ?? null;

  const { data: summary, isLoading } = useQuery<InvestmentSummary>({
    queryKey: ["investments-summary", businessId],
    queryFn: () => apiFetch(`/api/investments/accounts/summary${businessId ? `?businessId=${businessId}` : ""}`),
    staleTime: 1000 * 60,
  });

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch("/api/investments/accounts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments-summary", businessId] });
      setShowNewForm(false);
      setNewForm({ name: "", institution: "", accountType: "Brokerage", businessOrPersonal: "business", notes: "" });
      setFormError(null);
    },
    onError: (err: Error) => setFormError(err.message),
  });

  if (selectedAccountId !== null) {
    return (
      <InvestmentAccountDetail
        accountId={selectedAccountId}
        onBack={() => setSelectedAccountId(null)}
      />
    );
  }

  const activeAccounts = summary?.accounts.filter(a => a.active) ?? [];
  const inactiveAccounts = summary?.accounts.filter(a => !a.active) ?? [];

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newForm.name.trim()) { setFormError("Account name is required"); return; }
    createMutation.mutate({ ...newForm, businessId: businessId ?? undefined });
  }

  return (
    <div className="space-y-6">
      {/* Aggregate Dashboard */}
      {isLoading && (
        <div className="text-center py-12 text-muted-foreground animate-pulse">Loading investments…</div>
      )}

      {summary && (
        <>
          {/* Top stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground font-medium">Total Invested</p>
              <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(summary.totalInvested)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground font-medium">Portfolio Value</p>
              {summary.totalPortfolioValue != null ? (
                <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(summary.totalPortfolioValue)}</p>
              ) : (
                <p className="text-base text-muted-foreground mt-1">No valuation yet</p>
              )}
            </div>
            <div className={`rounded-xl border p-4 col-span-2 sm:col-span-1 ${
              summary.totalGainLoss == null
                ? "border-border bg-card"
                : summary.totalGainLoss >= 0
                  ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
                  : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
            }`}>
              <p className="text-xs text-muted-foreground font-medium">Unrealized Gain/Loss</p>
              {summary.totalGainLoss == null ? (
                <p className="text-base text-muted-foreground mt-1">Enter a portfolio valuation to track performance</p>
              ) : (
              <div className="flex items-baseline gap-2 mt-1">
                <p className={`text-xl font-bold ${
                  summary.totalGainLoss >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"
                }`}>
                  {formatCurrency(summary.totalGainLoss)}
                </p>
                {summary.totalReturnPct != null && (
                  <span className={`text-sm font-medium ${
                    summary.totalReturnPct >= 0 ? "text-green-600 dark:text-green-500" : "text-red-500"
                  }`}>
                    {formatPct(summary.totalReturnPct)}
                  </span>
                )}
              </div>
              )}
            </div>
          </div>

          {/* Highlights row */}
          {(summary.largestAccount || summary.bestAccount || summary.worstAccount) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {summary.largestAccount && (
                <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center gap-2">
                  <PiggyBank className="w-4 h-4 text-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Largest Account</p>
                    <p className="text-sm font-medium truncate">{summary.largestAccount.name}</p>
                  </div>
                </div>
              )}
              {summary.bestAccount && (
                <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-green-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Best Performing</p>
                    <p className="text-sm font-medium truncate">{summary.bestAccount.name}</p>
                    {summary.bestAccount.returnPct != null && (
                      <p className="text-xs text-green-600">{formatPct(summary.bestAccount.returnPct)}</p>
                    )}
                  </div>
                </div>
              )}
              {summary.worstAccount && summary.worstAccount.id !== summary.bestAccount?.id && (
                <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3 flex items-center gap-2">
                  <Minus className="w-4 h-4 text-red-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Worst Performing</p>
                    <p className="text-sm font-medium truncate">{summary.worstAccount.name}</p>
                    {summary.worstAccount.returnPct != null && (
                      <p className="text-xs text-red-500">{formatPct(summary.worstAccount.returnPct)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Meta info */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{summary.accountCount} account{summary.accountCount !== 1 ? "s" : ""}</span>
            {summary.lastUpdate && (
              <span>Last updated {new Date(summary.lastUpdate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            )}
          </div>
        </>
      )}

      {/* Account List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Accounts</h2>
          <button
            onClick={() => { setShowNewForm(true); setFormError(null); }}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Plus className="w-4 h-4" /> Add Account
          </button>
        </div>

        {/* New Account Form */}
        {showNewForm && (
          <form onSubmit={handleCreate} className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">New Investment Account</h3>
            {formError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {formError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Account Name *</label>
                <input
                  type="text"
                  value={newForm.name}
                  onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Fidelity Brokerage"
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Institution</label>
                <input
                  type="text"
                  value={newForm.institution}
                  onChange={e => setNewForm(f => ({ ...f, institution: e.target.value }))}
                  placeholder="e.g. Fidelity Investments"
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Account Type</label>
                <select
                  value={newForm.accountType}
                  onChange={e => setNewForm(f => ({ ...f, accountType: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Business or Personal</label>
                <select
                  value={newForm.businessOrPersonal}
                  onChange={e => setNewForm(f => ({ ...f, businessOrPersonal: e.target.value }))}
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
                value={newForm.notes}
                onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {createMutation.isPending ? "Saving…" : "Create Account"}
              </button>
              <button
                type="button"
                onClick={() => { setShowNewForm(false); setFormError(null); }}
                className="h-9 px-4 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted/60"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Active accounts */}
        {activeAccounts.length === 0 && !showNewForm && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
            <PiggyBank className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">No investment accounts yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add an account to start tracking your investments.</p>
            <button
              onClick={() => setShowNewForm(true)}
              className="mt-3 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              Add Account
            </button>
          </div>
        )}

        {activeAccounts.map(account => (
          <AccountRow
            key={account.id}
            account={account}
            onClick={() => setSelectedAccountId(account.id)}
          />
        ))}

        {/* Inactive accounts toggle */}
        {inactiveAccounts.length > 0 && (
          <div>
            <button
              onClick={() => setShowInactive(v => !v)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              {showInactive ? "Hide" : "Show"} {inactiveAccounts.length} archived account{inactiveAccounts.length !== 1 ? "s" : ""}
            </button>
            {showInactive && inactiveAccounts.map(account => (
              <div key={account.id} className="mt-2 opacity-60">
                <AccountRow
                  account={account}
                  onClick={() => setSelectedAccountId(account.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Accounting rules note */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-4 flex gap-3">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <p className="font-medium">Investment transfers are asset transfers, not expenses.</p>
          <p>They do not appear on your P&amp;L, Schedule C, Vendor Spending, or Job Cost reports. Money moved into an investment account stays on your balance sheet as an asset.</p>
        </div>
      </div>
    </div>
  );
}

function AccountRow({ account, onClick }: { account: AccountSummary; onClick: () => void }) {
  const hasPortfolio = account.portfolioValue != null;
  const gainPositive = (account.gainLoss ?? 0) >= 0;

  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors p-4 text-left flex items-center gap-4"
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Building2 className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground truncate">{account.name}</p>
          {!account.active && (
            <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">Archived</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {[account.institution, account.accountType].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="text-right shrink-0 space-y-0.5">
        <p className="text-sm font-semibold text-foreground">{formatCurrency(account.totalInvested)}</p>
        {hasPortfolio ? (
          <div className="flex items-center justify-end gap-1">
            {gainPositive
              ? <TrendingUp className="w-3 h-3 text-green-500" />
              : <TrendingDown className="w-3 h-3 text-red-500" />
            }
            <span className={`text-xs font-medium ${gainPositive ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
              {formatPct(account.returnPct)}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No valuation</p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}
