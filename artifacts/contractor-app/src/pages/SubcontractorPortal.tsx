import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import {
  HardHat, Briefcase, Receipt, Navigation, DollarSign,
  Plus, Trash2, AlertCircle, CheckCircle2, X, ChevronDown, ChevronUp
} from "lucide-react";
import { Input } from "@/components/ui/input";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchPortal(token: string) {
  const res = await fetch(`${BASE}/api/portal/${token}`);
  if (!res.ok) throw new Error("Invalid or expired portal link");
  return res.json();
}

async function fetchExpenses(token: string) {
  const res = await fetch(`${BASE}/api/portal/${token}/expenses`);
  if (!res.ok) throw new Error("Failed to load expenses");
  return res.json();
}

async function fetchMileage(token: string) {
  const res = await fetch(`${BASE}/api/portal/${token}/mileage`);
  if (!res.ok) throw new Error("Failed to load mileage");
  return res.json();
}

const EXPENSE_CATEGORIES = ["Materials", "Fuel", "Equipment", "Insurance", "Office", "Tools", "Subcontractors", "Other"];

export default function SubcontractorPortal() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();

  const { data: portalData, isLoading, error } = useQuery({
    queryKey: ["portal", token],
    queryFn: () => fetchPortal(token!),
    enabled: !!token,
    retry: false,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["portal-expenses", token],
    queryFn: () => fetchExpenses(token!),
    enabled: !!token && !!portalData,
  });

  const { data: mileageLogs = [] } = useQuery({
    queryKey: ["portal-mileage", token],
    queryFn: () => fetchMileage(token!),
    enabled: !!token && !!portalData,
  });

  // --- Expense form ---
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expForm, setExpForm] = useState({ description: "", amount: "", category: "Materials", date: new Date().toISOString().slice(0, 10), vendor: "", notes: "" });

  const addExpense = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/portal/${token}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...expForm, amount: parseFloat(expForm.amount) }),
      });
      if (!res.ok) throw new Error("Failed to add expense");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-expenses", token] });
      setExpForm({ description: "", amount: "", category: "Materials", date: new Date().toISOString().slice(0, 10), vendor: "", notes: "" });
      setExpenseOpen(false);
    },
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}/api/portal/${token}/expenses/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-expenses", token] }),
  });

  // --- Mileage form ---
  const [mileageOpen, setMileageOpen] = useState(false);
  const [milForm, setMilForm] = useState({ date: new Date().toISOString().slice(0, 10), miles: "", startLocation: "", endLocation: "", purpose: "", classification: "business", notes: "" });

  const addMileage = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/portal/${token}/mileage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...milForm, miles: parseFloat(milForm.miles) }),
      });
      if (!res.ok) throw new Error("Failed to add mileage");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-mileage", token] });
      setMilForm({ date: new Date().toISOString().slice(0, 10), miles: "", startLocation: "", endLocation: "", purpose: "", classification: "business", notes: "" });
      setMileageOpen(false);
    },
  });

  const deleteMileage = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}/api/portal/${token}/mileage/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-mileage", token] }),
  });

  // --- Expand/collapse sections ---
  const [showJobs, setShowJobs] = useState(true);
  const [showExp, setShowExp] = useState(true);
  const [showMil, setShowMil] = useState(true);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse">Loading your portal…</div>
      </div>
    );
  }

  if (error || !portalData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-display font-bold text-foreground">Invalid Portal Link</h1>
          <p className="text-sm text-muted-foreground">This link may be expired or incorrect. Please ask your contractor for a new link.</p>
        </div>
      </div>
    );
  }

  const { subcontractor, jobs, stats } = portalData;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-foreground text-background sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
            <HardHat className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-background/50 font-medium">Subcontractor Portal</p>
            <h1 className="text-base font-display font-bold leading-tight">{subcontractor.name}</h1>
          </div>
          {subcontractor.trade && (
            <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-primary/20 text-primary font-medium">{subcontractor.trade}</span>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "YTD Payments", value: formatCurrency(stats.ytdPayments), icon: DollarSign, color: "text-emerald-600" },
            { label: "My Expenses", value: formatCurrency(stats.totalExpenses), icon: Receipt, color: "text-red-500" },
            { label: "Business Miles", value: stats.totalMiles.toFixed(1), icon: Navigation, color: "text-violet-600" },
            { label: "Mileage Deduction", value: formatCurrency(stats.mileageDeduction), icon: DollarSign, color: "text-blue-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
              <p className={`text-lg font-display font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Jobs */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <button
            onClick={() => setShowJobs(!showJobs)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Briefcase className="w-4 h-4 text-primary" />
              Assigned Jobs ({jobs.length})
            </div>
            {showJobs ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {showJobs && (
            jobs.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-muted-foreground border-t border-border">No jobs assigned yet.</div>
            ) : (
              <div className="divide-y divide-border/50 border-t border-border">
                {jobs.map((job: any) => (
                  <div key={job.id} className="px-5 py-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm text-foreground">{job.title}</p>
                      {(job.city || job.description) && (
                        <p className="text-xs text-muted-foreground mt-0.5">{[job.city, job.state].filter(Boolean).join(", ")}{job.description ? ` — ${job.description}` : ""}</p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                      job.status === "active" ? "bg-emerald-100 text-emerald-700" :
                      job.status === "completed" ? "bg-blue-100 text-blue-700" :
                      "bg-muted text-muted-foreground"
                    }`}>{job.status}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Expenses */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <button
              onClick={() => setShowExp(!showExp)}
              className="flex items-center gap-2 font-semibold text-foreground hover:text-primary transition-colors"
            >
              <Receipt className="w-4 h-4 text-primary" />
              My Expenses ({expenses.length})
              {showExp ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            <button
              onClick={() => setExpenseOpen(!expenseOpen)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          {expenseOpen && (
            <div className="px-5 py-4 border-b border-border bg-muted/20 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Description *</label>
                  <Input value={expForm.description} onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))} placeholder="What was it for?" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Amount *</label>
                  <Input type="number" min="0" step="0.01" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Date *</label>
                  <Input type="date" value={expForm.date} onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Category *</label>
                  <select value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Vendor</label>
                  <Input value={expForm.vendor} onChange={e => setExpForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Store/supplier" className="h-9 text-sm" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => addExpense.mutate()}
                  disabled={!expForm.description || !expForm.amount || !expForm.date || addExpense.isPending}
                  className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {addExpense.isPending ? "Saving…" : "Save Expense"}
                </button>
                <button onClick={() => setExpenseOpen(false)} className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {addExpense.isError && <p className="text-xs text-destructive">Failed to save expense. Please try again.</p>}
            </div>
          )}

          {showExp && (
            expenses.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-muted-foreground">No expenses logged yet.</div>
            ) : (
              <div className="divide-y divide-border/50">
                {expenses.map((e: any) => (
                  <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{e.description}</p>
                      <p className="text-xs text-muted-foreground">{e.date} · {e.category}{e.vendor ? ` · ${e.vendor}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-semibold text-foreground">{formatCurrency(e.amount)}</span>
                      <button onClick={() => deleteExpense.mutate(e.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Mileage */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <button
              onClick={() => setShowMil(!showMil)}
              className="flex items-center gap-2 font-semibold text-foreground hover:text-primary transition-colors"
            >
              <Navigation className="w-4 h-4 text-primary" />
              Mileage Logs ({mileageLogs.length})
              {showMil ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            <button
              onClick={() => setMileageOpen(!mileageOpen)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          {mileageOpen && (
            <div className="px-5 py-4 border-b border-border bg-muted/20 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Date *</label>
                  <Input type="date" value={milForm.date} onChange={e => setMilForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Miles *</label>
                  <Input type="number" min="0" step="0.1" value={milForm.miles} onChange={e => setMilForm(f => ({ ...f, miles: e.target.value }))} placeholder="0.0" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">From</label>
                  <Input value={milForm.startLocation} onChange={e => setMilForm(f => ({ ...f, startLocation: e.target.value }))} placeholder="Start location" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">To</label>
                  <Input value={milForm.endLocation} onChange={e => setMilForm(f => ({ ...f, endLocation: e.target.value }))} placeholder="End location" className="h-9 text-sm" />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Purpose</label>
                  <Input value={milForm.purpose} onChange={e => setMilForm(f => ({ ...f, purpose: e.target.value }))} placeholder="Job site visit, materials pickup…" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Type</label>
                  <select value={milForm.classification} onChange={e => setMilForm(f => ({ ...f, classification: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="business">Business</option>
                    <option value="personal">Personal</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => addMileage.mutate()}
                  disabled={!milForm.date || !milForm.miles || addMileage.isPending}
                  className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {addMileage.isPending ? "Saving…" : "Save Mileage"}
                </button>
                <button onClick={() => setMileageOpen(false)} className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {addMileage.isError && <p className="text-xs text-destructive">Failed to save mileage. Please try again.</p>}
            </div>
          )}

          {showMil && (
            mileageLogs.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-muted-foreground">No mileage logged yet.</div>
            ) : (
              <div className="divide-y divide-border/50">
                {mileageLogs.map((m: any) => (
                  <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{m.miles.toFixed(1)} miles{m.purpose ? ` — ${m.purpose}` : ""}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.date}
                        {m.startLocation && m.endLocation ? ` · ${m.startLocation} → ${m.endLocation}` : ""}
                        {m.classification === "business" ? ` · ${formatCurrency(m.deductionAmount)} deduction` : " · Personal"}
                      </p>
                    </div>
                    <button onClick={() => deleteMileage.mutate(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        <p className="text-xs text-center text-muted-foreground pb-6">
          This is a secure portal provided by your contractor. Data shown is your personal records only.
        </p>
      </div>
    </div>
  );
}
