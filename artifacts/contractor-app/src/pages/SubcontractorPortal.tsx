import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency, localDateString } from "@/lib/utils";
import {
  HardHat, Briefcase, Receipt, Navigation, DollarSign, Settings,
  Plus, Trash2, AlertCircle, CheckCircle2, X, FileText,
  Save, LayoutDashboard, ChevronRight, BarChart3, Printer, Clock,
  Lock, KeyRound, Home, Store, ChevronDown, ImageIcon, Upload,
  MapPin, Calculator, PenLine, User, Download, TrendingUp,
  ClipboardCheck, Check, Minus, Loader2, Camera, Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

class PortalApiError extends Error {
  status: number;
  pendingApproval: boolean;
  constructor(message: string, status: number, pendingApproval = false) {
    super(message);
    this.status = status;
    this.pendingApproval = pendingApproval;
  }
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new PortalApiError(err.error || "Request failed", res.status, !!err.pendingApproval);
  }
  if (res.status === 204) return null;
  return res.json();
}

const EXPENSE_CATS = ["Materials", "Fuel", "Equipment", "Insurance", "Office", "Tools/Supplies", "Other"];

const ALL_FEATURES = [
  { key: "payments", label: "My Payments", desc: "View what your contractor pays you", icon: DollarSign },
  { key: "income_report", label: "Income Report", desc: "Download a summary of what your contractor paid you each year", icon: TrendingUp },
  { key: "jobs", label: "My Jobs", desc: "See jobs assigned to you", icon: Briefcase },
  { key: "w9", label: "W-9 Form", desc: "Complete your W-9 for 1099 reporting", icon: FileText },
  { key: "expenses", label: "My Expenses", desc: "Track job-related expenses", icon: Receipt },
  { key: "mileage", label: "Mileage Tracker", desc: "Log business miles and see deductions", icon: Navigation },
  { key: "tax_reports", label: "Tax Reports", desc: "Profit & loss, mileage deduction, SE tax estimate", icon: BarChart3 },
  { key: "home_office", label: "Home Office", desc: "Calculate your Form 8829 home office deduction", icon: Home },
];

const TAX_CLASSIFICATIONS = [
  "Individual/Sole proprietor or single-member LLC",
  "C Corporation",
  "S Corporation",
  "Partnership",
  "Trust/estate",
  "Limited liability company (LLC)",
  "Other",
];

// ─── Header ──────────────────────────────────────────────────────────────────
function Header({ name, trade }: { name: string; trade?: string | null }) {
  return (
    <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <HardHat className="w-5 h-5 text-amber-600" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest leading-none mb-0.5">Subcontractor Portal</p>
          <h1 className="text-sm font-display font-bold leading-tight text-gray-900 truncate">{name}</h1>
        </div>
        {trade && <span className="ml-auto flex-shrink-0 text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">{trade}</span>}
      </div>
    </div>
  );
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────
function BottomNav({ activeTab, setTab, features }: {
  activeTab: string; setTab: (t: string) => void; features: string[];
}) {
  const [showMore, setShowMore] = useState(false);

  const allTabs = [
    { key: "dashboard", label: "Home", icon: LayoutDashboard, primary: true },
    ...(features.includes("jobs") ? [{ key: "jobs", label: "Jobs", icon: Briefcase, primary: true }] : []),
    ...(features.includes("income_report") ? [{ key: "income_report", label: "Income", icon: TrendingUp, primary: true }] : []),
    ...(features.includes("payments") && !features.includes("income_report") ? [{ key: "payments", label: "My Pay", icon: DollarSign, primary: true }] : []),
    ...(features.includes("w9") ? [{ key: "w9", label: "W-9", icon: FileText, primary: false }] : []),
    ...(features.includes("expenses") ? [{ key: "expenses", label: "Expenses", icon: Receipt, primary: false }] : []),
    ...(features.includes("mileage") ? [{ key: "mileage", label: "Mileage", icon: Navigation, primary: false }] : []),
    ...(features.includes("tax_reports") ? [{ key: "tax_reports", label: "Tax Reports", icon: BarChart3, primary: false }] : []),
    ...(features.includes("home_office") ? [{ key: "home_office", label: "Home Office", icon: Home, primary: false }] : []),
    { key: "settings", label: "Settings", icon: Settings, primary: false },
  ];

  const MAX_PRIMARY = 4;
  const primaryTabs = allTabs.filter(t => t.primary).slice(0, MAX_PRIMARY);
  const secondaryTabs = allTabs.filter(t => !primaryTabs.includes(t));
  const hasMore = secondaryTabs.length > 0;
  const moreIsActive = secondaryTabs.some(t => t.key === activeTab);

  function handleTabClick(key: string) {
    setTab(key);
    setShowMore(false);
  }

  return (
    <>
      {/* More sheet overlay */}
      {showMore && (
        <div className="fixed inset-0 z-30" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute bottom-16 left-0 right-0 max-w-2xl mx-auto bg-white rounded-t-2xl shadow-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-4" />
            <div className="grid grid-cols-3 gap-1 px-4 pb-6">
              {secondaryTabs.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => handleTabClick(tab.key)}
                    className={`flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl transition-colors ${
                      active ? "bg-amber-50 text-amber-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    }`}
                  >
                    <Icon className={`w-6 h-6 ${active ? "text-amber-600" : ""}`} />
                    <span className="text-[11px] font-semibold text-center leading-tight">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
        <div className="max-w-2xl mx-auto flex">
          {primaryTabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabClick(tab.key)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-1 transition-colors ${
                  active ? "text-amber-600" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-colors ${active ? "bg-amber-100" : ""}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-[10px] font-semibold ${active ? "text-amber-700" : ""}`}>{tab.label}</span>
              </button>
            );
          })}
          {hasMore && (
            <button
              onClick={() => setShowMore(v => !v)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-1 transition-colors ${
                moreIsActive || showMore ? "text-amber-600" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-colors ${moreIsActive || showMore ? "bg-amber-100" : ""}`}>
                <ChevronDown className={`w-5 h-5 transition-transform ${showMore ? "rotate-180" : ""}`} />
              </div>
              <span className={`text-[10px] font-semibold ${moreIsActive || showMore ? "text-amber-700" : ""}`}>
                {moreIsActive ? secondaryTabs.find(t => t.key === activeTab)?.label ?? "More" : "More"}
              </span>
            </button>
          )}
        </div>
        {/* safe area spacer for phones with home bar */}
        <div className="h-safe-bottom" style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
      </div>
    </>
  );
}

// ─── Loading / Error ─────────────────────────────────────────────────────────
function InvalidLink() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-xl font-display font-bold">Invalid Portal Link</h1>
        <p className="text-sm text-muted-foreground">This link may be expired or incorrect. Please ask your contractor for a new link.</p>
      </div>
    </div>
  );
}

// ─── Pending Approval ─────────────────────────────────────────────────────────
function PendingApproval() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="w-20 h-20 rounded-3xl bg-amber-100 flex items-center justify-center mx-auto">
          <Clock className="w-10 h-10 text-amber-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-display font-bold text-foreground">Access Pending</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your portal link is set up, but your contractor hasn't approved your access yet.
            Check back soon or reach out to them directly.
          </p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-left space-y-1.5">
          <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">What happens next</p>
          <p className="text-sm text-amber-800">Your contractor will approve your access from their Subcontractors page. You'll be able to use the portal as soon as they do — just reload this page.</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="w-full py-3 rounded-xl bg-foreground text-background font-semibold text-sm hover:bg-foreground/90 transition-colors"
        >
          Check Again
        </button>
      </div>
    </div>
  );
}

// ─── PIN Gate ─────────────────────────────────────────────────────────────────
function PinInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex gap-3 justify-center my-4" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        type="tel"
        inputMode="numeric"
        maxLength={6}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        disabled={disabled}
        className="sr-only"
        autoComplete="one-time-code"
      />
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`w-10 h-12 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-colors ${
            i < value.length ? "border-primary bg-primary/10 text-foreground" :
            i === value.length ? "border-primary" : "border-border bg-muted/30"
          }`}
        >
          {i < value.length ? "•" : ""}
        </div>
      ))}
    </div>
  );
}

function SetPinScreen({ token, onPinSet }: { token: string; onPinSet: () => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleConfirm(c = confirm) {
    if (pin !== c) { setError("PINs don't match. Try again."); setConfirm(""); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/portal/set-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set PIN");
      onPinSet();
    } catch (err: any) {
      setError(err.message || "Failed to set PIN.");
    } finally {
      setLoading(false);
    }
  }

  function advanceToConfirm(p = pin) {
    if (p.length >= 4) setStep("confirm");
  }

  // Auto-advance enter → confirm at 6 digits
  useEffect(() => {
    if (step === "enter" && pin.length === 6) advanceToConfirm(pin);
  }, [pin, step]);

  // Auto-submit confirm when confirm matches pin length (4–6 digit PINs)
  useEffect(() => {
    if (step === "confirm" && confirm.length === pin.length) handleConfirm(confirm);
  }, [confirm, step, pin.length]);

  const currentVal = step === "enter" ? pin : confirm;
  const canAdvance = step === "enter" && pin.length >= 4 && pin.length < 6;
  const canConfirm = step === "confirm" && confirm.length >= 4 && confirm.length < pin.length;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8 text-primary" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-display font-bold">Secure your portal</h1>
          <p className="text-sm text-muted-foreground">
            {step === "enter"
              ? "Create a 4–6 digit PIN to protect your portal."
              : "Enter your PIN again to confirm."}
          </p>
        </div>
        <PinInput
          value={currentVal}
          onChange={step === "enter" ? setPin : setConfirm}
          disabled={loading}
        />
        {(canAdvance || canConfirm) && !loading && (
          <button
            onClick={() => step === "enter" ? advanceToConfirm() : handleConfirm()}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            {step === "enter" ? "Use this PIN →" : "Confirm PIN →"}
          </button>
        )}
        {error && <p className="text-sm text-destructive bg-destructive/10 px-4 py-2.5 rounded-xl">{error}</p>}
        {step === "confirm" && !loading && (
          <button onClick={() => { setStep("enter"); setPin(""); setConfirm(""); setError(""); }} className="text-xs text-muted-foreground underline">
            Start over
          </button>
        )}
        {loading && <p className="text-sm text-muted-foreground animate-pulse">Setting up your PIN…</p>}
      </div>
    </div>
  );
}

function EnterPinScreen({ token, onVerified }: { token: string; onVerified: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);

  async function verify(p: string) {
    if (p.length < 4) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/portal/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin: p }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setPin("");
        if (data.locked) setLocked(true);
        throw new Error(data.error || "Incorrect PIN");
      }
      onVerified();
    } catch (err: any) {
      setError(err.message || "Incorrect PIN.");
    } finally {
      setLoading(false);
    }
  }

  // Auto-submit at 6 digits; for 4-5 digits the submit button is shown below
  useEffect(() => {
    if (pin.length === 6 && !loading && !locked) verify(pin);
  }, [pin]);

  const canSubmit = pin.length >= 4 && pin.length < 6 && !loading && !locked;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <KeyRound className="w-8 h-8 text-primary" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-display font-bold">Enter your PIN</h1>
          <p className="text-sm text-muted-foreground">Enter your 4–6 digit portal PIN to continue.</p>
        </div>
        {locked ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-800">
            {error || "Too many attempts. Please try again later."}
          </div>
        ) : (
          <>
            <PinInput value={pin} onChange={setPin} disabled={loading} />
            {canSubmit && (
              <button
                onClick={() => verify(pin)}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Submit PIN →
              </button>
            )}
            {error && <p className="text-sm text-destructive bg-destructive/10 px-4 py-2.5 rounded-xl">{error}</p>}
            {loading && <p className="text-sm text-muted-foreground animate-pulse">Verifying…</p>}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Home Office Calculator Tab ───────────────────────────────────────────────
const HOME_OFFICE_EXPENSES = [
  { key: "rent", label: "Rent or Mortgage Interest" },
  { key: "utilities", label: "Utilities (electric, gas, water)" },
  { key: "internet", label: "Internet & Phone" },
  { key: "insurance", label: "Homeowner's / Renter's Insurance" },
  { key: "taxes", label: "Property Taxes" },
  { key: "repairs", label: "Repairs & Maintenance" },
];

function HomeOfficeTab() {
  const [homeSqft, setHomeSqft] = useState("");
  const [officeSqft, setOfficeSqft] = useState("");
  const [expenses, setExpenses] = useState<Record<string, string>>({});

  const setExp = (k: string, v: string) => setExpenses(prev => ({ ...prev, [k]: v }));

  const homeNum = parseFloat(homeSqft) || 0;
  const officeNum = parseFloat(officeSqft) || 0;
  const pct = homeNum > 0 && officeNum > 0 ? Math.min(officeNum / homeNum, 1) : 0;
  const totalExpenses = HOME_OFFICE_EXPENSES.reduce((s, e) => s + (parseFloat(expenses[e.key] || "0") || 0), 0);
  const totalDeduction = totalExpenses * pct;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-display font-bold">Home Office Calculator</h2>
        <p className="text-sm text-muted-foreground">Estimate your Form 8829 deduction. Results are for reference only — consult a tax professional.</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b border-border pb-2">Square Footage</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Total Home Sq Ft</label>
            <Input type="number" min="1" placeholder="e.g. 1800" value={homeSqft} onChange={e => setHomeSqft(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Office / Work Area Sq Ft</label>
            <Input type="number" min="1" placeholder="e.g. 200" value={officeSqft} onChange={e => setOfficeSqft(e.target.value)} />
          </div>
        </div>
        {pct > 0 && (
          <div className="bg-primary/5 border border-primary/15 rounded-xl px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground">Business-use percentage</p>
            <p className="text-3xl font-display font-bold text-primary">{(pct * 100).toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">{officeNum} ÷ {homeNum} sq ft</p>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b border-border pb-2">Annual Home Expenses</h3>
        {HOME_OFFICE_EXPENSES.map(exp => (
          <div key={exp.key} className="flex items-center gap-3">
            <label className="flex-1 text-sm text-foreground">{exp.label}</label>
            <div className="w-32">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={expenses[exp.key] || ""}
                onChange={e => setExp(exp.key, e.target.value)}
              />
            </div>
            {pct > 0 && (
              <span className="text-xs text-emerald-600 font-semibold w-20 text-right">
                {formatCurrency((parseFloat(expenses[exp.key] || "0") || 0) * pct)}
              </span>
            )}
          </div>
        ))}
        {pct > 0 && (
          <div className="border-t border-border pt-3 flex justify-between items-center">
            <span className="text-sm font-medium text-muted-foreground">Total Annual Expenses</span>
            <span className="font-semibold">{formatCurrency(totalExpenses)}</span>
          </div>
        )}
      </div>

      {pct > 0 && totalExpenses > 0 && (
        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-5 text-center space-y-1">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Estimated Form 8829 Deduction</p>
          <p className="text-4xl font-display font-bold text-emerald-700">{formatCurrency(totalDeduction)}</p>
          <p className="text-xs text-emerald-600">This amount goes to Schedule C, Line 30</p>
        </div>
      )}

      {(!homeSqft || !officeSqft) && (
        <div className="bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm text-muted-foreground text-center">
          Enter your square footage above to see your deduction estimate.
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-xs text-amber-800">
          <strong>Note:</strong> This calculator uses the regular method (actual expenses × business-use %). The IRS simplified method ($5/sq ft up to 300 sq ft) is also available. Consult a tax professional to determine which method is better for your situation.
        </p>
      </div>
    </div>
  );
}

// ─── Portal Notification Center ───────────────────────────────────────────────
interface PortalNotification {
  id: string;
  priority: number;
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  message: string;
  actionLabel: string;
  actionTab: string;
}

function buildPortalNotifications(data: any, features: string[]): PortalNotification[] {
  const sub = data.subcontractor;
  const stats = data.stats;
  const jobs: any[] = data.jobs ?? [];
  const notes: PortalNotification[] = [];

  // W-9 missing — blocks 1099 issuance
  if (features.includes("w9") && !sub.w9Complete) {
    notes.push({
      id: "w9",
      priority: 1,
      Icon: FileText,
      iconColor: "text-amber-600",
      iconBg: "bg-amber-100",
      message: "Complete your W-9 to receive a 1099.",
      actionLabel: "Complete now →",
      actionTab: "w9",
    });
  }

  // Expenses enabled but none logged yet
  if (features.includes("expenses") && stats.expenseCount === 0) {
    notes.push({
      id: "no_expenses",
      priority: 2,
      Icon: Receipt,
      iconColor: "text-blue-600",
      iconBg: "bg-blue-100",
      message: "Start logging expenses to reduce your tax bill.",
      actionLabel: "Log expense →",
      actionTab: "expenses",
    });
  }

  // Mileage enabled but zero miles logged
  if (features.includes("mileage") && stats.totalMiles === 0) {
    notes.push({
      id: "no_mileage",
      priority: 3,
      Icon: Navigation,
      iconColor: "text-violet-600",
      iconBg: "bg-violet-100",
      message: "Log business miles you've driven — they're tax-deductible.",
      actionLabel: "Log mileage →",
      actionTab: "mileage",
    });
  }

  // Active / in-progress jobs needing attention
  const activeJobs = jobs.filter((j: any) => j.status === "active" || j.status === "in_progress");
  if (features.includes("jobs") && activeJobs.length > 0) {
    notes.push({
      id: "active_jobs",
      priority: 4,
      Icon: Briefcase,
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-100",
      message: `You have ${activeJobs.length} active job${activeJobs.length !== 1 ? "s" : ""} in progress.`,
      actionLabel: "View jobs →",
      actionTab: "jobs",
    });
  }

  return notes.sort((a, b) => a.priority - b.priority);
}

function NotificationCenter({ data, features, setTab }: {
  data: any; features: string[]; setTab: (t: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const notifications = buildPortalNotifications(data, features);

  if (notifications.length === 0) return null;

  const MAX_VISIBLE = 2;
  const visible = expanded ? notifications : notifications.slice(0, MAX_VISIBLE);
  const hiddenCount = notifications.length - MAX_VISIBLE;

  return (
    <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60 flex items-center justify-between bg-amber-50/60">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[10px] font-bold leading-none">{notifications.length}</span>
          </div>
          <p className="text-xs font-semibold text-amber-900">
            {notifications.length === 1 ? "1 item needs your attention" : `${notifications.length} items need your attention`}
          </p>
        </div>
        {notifications.length > MAX_VISIBLE && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 transition-colors"
          >
            {expanded ? "Show less" : `See all ${notifications.length}`}
          </button>
        )}
      </div>
      <div className="divide-y divide-border/40">
        {visible.map(({ id, Icon, iconColor, iconBg, message, actionLabel, actionTab }) => (
          <div key={id} className="flex items-center gap-3 px-4 py-3">
            <div className={`w-8 h-8 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-4 h-4 ${iconColor}`} />
            </div>
            <p className="flex-1 text-sm text-foreground leading-snug">{message}</p>
            <button
              onClick={() => setTab(actionTab)}
              className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors flex-shrink-0 whitespace-nowrap"
            >
              {actionLabel}
            </button>
          </div>
        ))}
      </div>
      {!expanded && hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-t border-border/40"
        >
          +{hiddenCount} more item{hiddenCount !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────
function DashboardTab({ data, features, setTab }: { data: any; features: string[]; setTab: (t: string) => void }) {
  const s = data.stats;
  const sub = data.subcontractor;
  const quickActions = ALL_FEATURES.filter(f => features.includes(f.key) && f.key !== "payments" && f.key !== "jobs");

  return (
    <div className="space-y-5">
      {/* Proactive notification center — shown above greeting when there are items */}
      <NotificationCenter data={data} features={features} setTab={setTab} />

      <div>
        <h2 className="text-xl font-display font-bold text-foreground">Welcome back, {sub.name.split(" ")[0]}!</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Here's a snapshot of your activity.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {features.includes("payments") && (
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-muted-foreground font-medium">YTD Payments</p>
            <p className="text-2xl font-display font-bold text-emerald-600 mt-1">{formatCurrency(s.ytdPayments)}</p>
            <p className="text-xs text-muted-foreground mt-1">From your contractor</p>
          </div>
        )}
        {features.includes("expenses") && (
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-muted-foreground font-medium">My Expenses</p>
            <p className="text-2xl font-display font-bold text-red-500 mt-1">{formatCurrency(s.totalExpenses)}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.expenseCount} logged</p>
          </div>
        )}
        {features.includes("mileage") && (
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-muted-foreground font-medium">Business Miles</p>
            <p className="text-2xl font-display font-bold text-violet-600 mt-1">{s.totalMiles.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground mt-1">{formatCurrency(s.mileageDeduction)} deduction</p>
          </div>
        )}
        {features.includes("jobs") && (
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-muted-foreground font-medium">Assigned Jobs</p>
            <p className="text-2xl font-display font-bold text-blue-600 mt-1">{data.jobs.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{data.jobs.filter((j: any) => j.status === "active" || j.status === "in_progress").length} active</p>
          </div>
        )}
      </div>

      {/* W-9 prompt */}
      {features.includes("w9") && !sub.w9Complete && (
        <button
          onClick={() => setTab("w9")}
          className="w-full flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left hover:bg-amber-100 transition-colors"
        >
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">W-9 not completed</p>
            <p className="text-xs text-amber-700 mt-0.5">Your contractor needs your W-9 for 1099 filing. Tap to fill it out.</p>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-600 flex-shrink-0" />
        </button>
      )}

      {features.includes("w9") && sub.w9Complete && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">W-9 on file</p>
            <p className="text-xs text-emerald-700">Signed {sub.w9SignedAt} — your contractor has your info.</p>
          </div>
        </div>
      )}

      {/* Quick actions */}
      {quickActions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Quick Actions</p>
          <div className="grid grid-cols-1 gap-2">
            {quickActions.map(f => {
              const Icon = f.icon;
              return (
                <button
                  key={f.key}
                  onClick={() => setTab(f.key)}
                  className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{f.label}</p>
                    <p className="text-xs text-muted-foreground">{f.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Payments Tab ─────────────────────────────────────────────────────────────
function PaymentsTab({ data }: { data: any }) {
  const s = data.stats;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-display font-bold">My Payments</h2>
        <p className="text-sm text-muted-foreground">YTD amounts recorded by your contractor</p>
      </div>
      <div className="bg-card border border-border rounded-2xl p-6 text-center shadow-sm">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Year-to-Date Payments</p>
        <p className="text-5xl font-display font-bold text-emerald-600 mt-2">{formatCurrency(s.ytdPayments)}</p>
        <p className="text-sm text-muted-foreground mt-2">
          {s.ytdPayments >= 2000
            ? "⚠️ You may receive a 1099-NEC for this tax year."
            : `You need ${formatCurrency(2000 - s.ytdPayments)} more before a 1099-NEC is required.`}
        </p>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-xs text-amber-800">
          <strong>2026 Rule (OBBBA):</strong> If you receive $2,000 or more in total payments from a single contractor in a tax year, they are required to file a 1099-NEC. All payment types count toward this threshold.
        </p>
      </div>
    </div>
  );
}

// ─── Portal Job Card ────────────────────────────────────────────────────────────
function PortalJobCard({ job, token, onCompleted }: { job: any; token: string; onCompleted: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const [expanded, setExpanded] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [materialListId, setMaterialListId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(job.status === "completed");
  const [togglingItem, setTogglingItem] = useState<number | null>(null);

  const { data: materialLists = [] } = useQuery<any[]>({
    queryKey: ["portal-job-material-lists", token, job.id],
    queryFn: () => apiFetch(`/portal/${token}/jobs/${job.id}/material-lists`),
    enabled: expanded && !done,
  });

  const { data: checklist, isLoading: checklistLoading, refetch: refetchChecklist } = useQuery<any>({
    queryKey: ["portal-job-checklist", token, job.id],
    queryFn: () => apiFetch(`/portal/${token}/jobs/${job.id}/checklist`),
    enabled: checklistOpen,
  });

  async function toggleChecklistItem(item: any) {
    if (togglingItem !== null || item.skipped) return;
    setTogglingItem(item.id);
    try {
      await apiFetch(`/portal/${token}/jobs/${job.id}/checklist/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !item.completed }),
      });
      await refetchChecklist();
    } finally {
      setTogglingItem(null);
    }
  }

  async function skipChecklistItem(item: any) {
    if (togglingItem !== null) return;
    setTogglingItem(item.id);
    try {
      await apiFetch(`/portal/${token}/jobs/${job.id}/checklist/items/${item.id}/skip`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipped: !item.skipped }),
      });
      await refetchChecklist();
    } finally {
      setTogglingItem(null);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setPhotoError("Only image files are allowed."); return; }
    setUploadingPhoto(true);
    setPhotoError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE}/api/uploads`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      setPhotos(p => [...p, url]);
    } catch {
      setPhotoError("Photo upload failed. Please try again.");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleComplete() {
    if (!notes.trim()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiFetch(`/portal/${token}/jobs/${job.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes.trim(),
          photoUrls: photos,
          materialListId: materialListId ? parseInt(materialListId) : null,
        }),
      });
      setDone(true);
      qc.invalidateQueries({ queryKey: ["portal", token] });
      onCompleted();
    } catch (err: any) {
      setSubmitError(err.message || "Failed to complete job.");
    } finally {
      setSubmitting(false);
    }
  }

  const isCompleted = done || job.status === "completed";

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      {/* Job header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">{job.title}</p>
            {(job.city || job.state) && <p className="text-xs text-muted-foreground mt-0.5">{[job.city, job.state].filter(Boolean).join(", ")}</p>}
            {job.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{job.description}</p>}
            {(job.startDate || job.endDate) && (
              <p className="text-xs text-muted-foreground mt-1">{job.startDate}{job.endDate ? ` → ${job.endDate}` : ""}</p>
            )}
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${
            isCompleted ? "bg-blue-100 text-blue-700" :
            job.status === "active" || job.status === "in_progress" ? "bg-emerald-100 text-emerald-700" :
            "bg-muted text-muted-foreground"
          }`}>{isCompleted ? "completed" : job.status?.replace("_", " ")}</span>
        </div>

        {/* Checklist toggle button */}
        <button
          onClick={() => setChecklistOpen(o => !o)}
          className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 text-emerald-700 bg-emerald-50/50 text-xs font-semibold hover:bg-emerald-50 transition-colors"
        >
          <ClipboardCheck className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1 text-left">Job Checklist</span>
          {checklist && (
            <span className="text-[10px] font-bold text-emerald-600">
              {checklist.completedItems}/{checklist.totalItems} · {checklist.overallPercent}%
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${checklistOpen ? "rotate-180" : ""}`} />
        </button>

        {/* Expand/collapse field notes section */}
        {!isCompleted && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-50 transition-colors"
          >
            <PenLine className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">{expanded ? "Hide Field Notes" : "Add Field Notes & Complete"}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        )}

        {isCompleted && (
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-700 font-semibold bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Job completed — notes submitted to contractor</span>
          </div>
        )}
      </div>

      {/* Expandable checklist panel */}
      {checklistOpen && (
        <div className="border-t border-emerald-100 bg-emerald-50/30 px-4 py-3 space-y-3">
          {checklistLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : checklist === null || checklist === undefined ? (
            <p className="text-xs text-muted-foreground text-center py-4">No checklist attached to this job yet.</p>
          ) : (
            <>
              {/* Overall progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-semibold text-muted-foreground">{checklist.templateName}</p>
                  <span className={`text-xs font-bold ${checklist.overallPercent === 100 ? "text-emerald-600" : "text-foreground"}`}>
                    {checklist.completedItems}/{checklist.totalItems} · {checklist.overallPercent}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-emerald-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${checklist.overallPercent === 100 ? "bg-emerald-500" : "bg-emerald-400"}`}
                    style={{ width: `${checklist.overallPercent}%` }}
                  />
                </div>
              </div>

              {/* Sections and items */}
              {checklist.sections.filter((s: any) => s.active).map((section: any) => (
                <div key={section.id} className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{section.name}</p>
                  {section.items.map((item: any) => (
                    <div key={item.id} className={`flex items-start gap-2 py-1.5 px-1 rounded-lg ${item.skipped ? "opacity-50" : ""}`}>
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleChecklistItem(item)}
                        disabled={togglingItem === item.id || item.skipped}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                          item.skipped ? "border-muted bg-muted" :
                          item.completed ? "bg-emerald-500 border-emerald-500" :
                          "border-muted-foreground/30 hover:border-emerald-400"
                        }`}
                      >
                        {togglingItem === item.id
                          ? <Loader2 className="w-2.5 h-2.5 animate-spin text-muted-foreground" />
                          : item.skipped
                          ? <Minus className="w-2.5 h-2.5 text-muted-foreground" />
                          : item.completed
                          ? <Check className="w-2.5 h-2.5 text-white" />
                          : null}
                      </button>

                      {/* Title */}
                      <div className="flex-1 min-w-0" onClick={() => !item.skipped && toggleChecklistItem(item)}>
                        <p className={`text-xs leading-5 ${
                          item.completed || item.skipped ? "line-through text-muted-foreground" : "text-foreground"
                        }`}>
                          {item.title}
                        </p>
                        {item.completed && item.completedByName && (
                          <p className="text-[10px] text-emerald-600">✓ {item.completedByName}</p>
                        )}
                      </div>

                      {/* N/A skip toggle */}
                      {!item.completed && (
                        <button
                          onClick={() => skipChecklistItem(item)}
                          disabled={togglingItem === item.id}
                          className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-muted/60 text-muted-foreground hover:bg-muted/30 transition-colors mt-0.5"
                        >
                          {item.skipped ? "Undo" : "N/A"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}

              {checklist.statusOverride && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  {checklist.statusOverride}
                </p>
              )}
              {checklist.publicNotes && (
                <p className="text-xs text-muted-foreground italic">{checklist.publicNotes}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Expandable field notes form */}
      {expanded && !isCompleted && (
        <div className="border-t border-border/50 bg-muted/20 p-4 space-y-4">
          {/* Field notes textarea */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-muted-foreground">Field Notes <span className="text-destructive">*</span></label>
            <textarea
              rows={4}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              placeholder="Describe what was done at this job site…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {/* Material list picker */}
          {materialLists.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-muted-foreground">Select Material List (optional)</label>
              <select
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={materialListId}
                onChange={e => setMaterialListId(e.target.value)}
              >
                <option value="">None</option>
                {materialLists.map((l: any) => (
                  <option key={l.id} value={String(l.id)}>{l.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Photo upload */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-muted-foreground">Photos (optional)</label>
            <div className="flex flex-wrap gap-2">
              {photos.map((url, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
                  <img src={url.startsWith("/api") ? `${BASE}${url}` : url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    onClick={() => setPhotos(p => p.filter((_, j) => j !== i))}
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="w-16 h-16 rounded-lg border-2 border-dashed border-border hover:border-amber-400 hover:bg-amber-50 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-amber-600 disabled:opacity-50"
              >
                {uploadingPhoto
                  ? <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  : <><Upload className="w-3.5 h-3.5" /><span className="text-[10px] font-medium">Add</span></>
                }
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </div>
            {photoError && <p className="text-xs text-destructive">{photoError}</p>}
          </div>

          {submitError && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-xl">{submitError}</p>
          )}

          {/* Complete Job button */}
          <button
            onClick={handleComplete}
            disabled={!notes.trim() || submitting}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting…</>
              : <><CheckCircle2 className="w-4 h-4" /> Complete Job</>
            }
          </button>
          <p className="text-[10px] text-muted-foreground text-center">
            Notes and photos will be sent to your contractor. This action cannot be undone.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Jobs Tab ─────────────────────────────────────────────────────────────────
function JobsTab({ jobs, token, onJobCompleted }: { jobs: any[]; token: string; onJobCompleted: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-bold">My Jobs</h2>
        <p className="text-sm text-muted-foreground">Jobs assigned to you by your contractor</p>
      </div>
      {jobs.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p className="text-sm">No jobs assigned yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <PortalJobCard key={job.id} job={job} token={token} onCompleted={onJobCompleted} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── W-9 Tab ─────────────────────────────────────────────────────────────────
function W9Tab({ token, sub, onSaved }: { token: string; sub: any; onSaved: () => void }) {
  const [form, setForm] = useState({
    w9LegalName: sub.w9LegalName ?? sub.name ?? "",
    w9BusinessName: sub.w9BusinessName ?? "",
    w9TaxClassification: sub.w9TaxClassification ?? "",
    w9LlcType: sub.w9LlcType ?? "",
    w9Address: sub.w9Address ?? "",
    w9City: sub.w9City ?? "",
    w9State: sub.w9State ?? "",
    w9Zip: sub.w9Zip ?? "",
    w9TaxIdType: sub.w9TaxIdType ?? "SSN",
    w9TaxId: "",
    w9Signature: sub.w9Signature ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const signed = !!sub.w9Signature;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.w9TaxId && !signed) return setError("Taxpayer ID (SSN or EIN) is required.");
    if (!form.w9Signature) return setError("Your typed signature is required to certify the W-9.");
    setSaving(true);
    try {
      await apiFetch(`/portal/${token}/w9`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSuccess(true);
      onSaved();
    } catch (err: any) {
      setError(err.message || "Failed to save W-9.");
    } finally {
      setSaving(false);
    }
  }

  if (success || (signed && !form.w9TaxId)) {
    return (
      <div className="space-y-4">
        <div className="text-center py-6 space-y-3">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
          <h2 className="text-xl font-display font-bold text-foreground">W-9 On File</h2>
          <p className="text-sm text-muted-foreground">Signed on {sub.w9SignedAt}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 space-y-2 text-sm">
          <Row label="Legal Name" value={sub.w9LegalName} />
          {sub.w9BusinessName && <Row label="Business Name" value={sub.w9BusinessName} />}
          <Row label="Tax Classification" value={sub.w9TaxClassification} />
          <Row label="Address" value={[sub.w9Address, sub.w9City, sub.w9State, sub.w9Zip].filter(Boolean).join(", ")} />
          <Row label="TIN Type" value={sub.w9TaxIdType} />
          {sub.w9TaxIdMasked && <Row label="TIN (masked)" value={sub.w9TaxIdMasked} />}
          <Row label="Signature" value={sub.w9Signature} />
        </div>
        <button
          onClick={() => setSuccess(false)}
          className="w-full py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          Update W-9
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div>
        <h2 className="text-lg font-display font-bold">IRS Form W-9</h2>
        <p className="text-sm text-muted-foreground">Required for 1099-NEC reporting. All information is stored securely.</p>
      </div>

      {/* Part I — Taxpayer Info */}
      <Section title="Part I — Taxpayer Information">
        <Field label="Legal Name (as shown on tax return) *">
          <Input value={form.w9LegalName} onChange={e => set("w9LegalName", e.target.value)} required placeholder="Your full legal name" />
        </Field>
        <Field label="Business / DBA Name (if different)">
          <Input value={form.w9BusinessName} onChange={e => set("w9BusinessName", e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Federal Tax Classification *">
          <select
            value={form.w9TaxClassification}
            onChange={e => set("w9TaxClassification", e.target.value)}
            required
            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Select classification…</option>
            {TAX_CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        {form.w9TaxClassification === "Limited liability company (LLC)" && (
          <Field label="LLC Tax Treatment *">
            <select value={form.w9LlcType} onChange={e => set("w9LlcType", e.target.value)} required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Select…</option>
              <option value="C">C — taxed as corporation</option>
              <option value="S">S — taxed as S-corp</option>
              <option value="P">P — taxed as partnership</option>
            </select>
          </Field>
        )}
      </Section>

      {/* Address */}
      <Section title="Address">
        <Field label="Street Address *">
          <Input value={form.w9Address} onChange={e => set("w9Address", e.target.value)} required placeholder="123 Main St" />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <Field label="City *">
              <Input value={form.w9City} onChange={e => set("w9City", e.target.value)} required placeholder="Louisville" />
            </Field>
          </div>
          <Field label="State *">
            <Input value={form.w9State} onChange={e => set("w9State", e.target.value.toUpperCase())} required placeholder="KY" maxLength={2} />
          </Field>
        </div>
        <Field label="ZIP Code *">
          <Input value={form.w9Zip} onChange={e => set("w9Zip", e.target.value)} required placeholder="40201" />
        </Field>
      </Section>

      {/* Part II — Taxpayer ID */}
      <Section title="Part II — Taxpayer Identification Number">
        <Field label="TIN Type *">
          <div className="flex gap-3">
            {["SSN", "EIN"].map(t => (
              <label key={t} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="taxIdType" value={t} checked={form.w9TaxIdType === t} onChange={() => set("w9TaxIdType", t)} className="accent-primary" />
                <span className="text-sm font-medium">{t === "SSN" ? "Social Security Number (SSN)" : "Employer Identification Number (EIN)"}</span>
              </label>
            ))}
          </div>
        </Field>
        <Field label={`${form.w9TaxIdType} *`}>
          <Input
            value={form.w9TaxId}
            onChange={e => set("w9TaxId", e.target.value)}
            required
            placeholder={form.w9TaxIdType === "SSN" ? "XXX-XX-XXXX" : "XX-XXXXXXX"}
            type="password"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground mt-1">Your TIN is encrypted and stored securely. Only the last 4 digits will be visible after saving.</p>
        </Field>
      </Section>

      {/* Part III — Certification */}
      <Section title="Part III — Certification">
        <div className="bg-muted/50 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Under penalties of perjury, I certify that:</p>
          <p>1. The number shown on this form is my correct taxpayer identification number.</p>
          <p>2. I am not subject to backup withholding.</p>
          <p>3. I am a U.S. citizen or other U.S. person.</p>
          <p>4. The FATCA code(s) entered on this form indicating that I am exempt from FATCA reporting is correct.</p>
        </div>
        <Field label="Typed Signature (full legal name) *">
          <Input
            value={form.w9Signature}
            onChange={e => set("w9Signature", e.target.value)}
            required
            placeholder="Type your full legal name to sign"
            className="font-medium"
          />
          <p className="text-xs text-muted-foreground mt-1">Today's date will be recorded automatically.</p>
        </Field>
      </Section>

      {error && <p className="text-sm text-destructive bg-destructive/10 px-4 py-2.5 rounded-xl">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
      >
        <Save className="w-4 h-4" />
        {saving ? "Submitting W-9…" : "Submit W-9 Form"}
      </button>
    </form>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-1.5">
      <span className="text-muted-foreground text-xs flex-shrink-0">{label}</span>
      <span className="font-medium text-sm text-right">{value || "—"}</span>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-sm">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b border-border pb-2">{title}</h3>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ─── Portal Vendor Combobox ───────────────────────────────────────────────────
function PortalVendorCombobox({ token, value, onChange }: { token: string; value: string; onChange: (v: string) => void }) {
  const { data: vendors = [] } = useQuery<any[]>({
    queryKey: ["portal-vendors", token],
    queryFn: () => apiFetch(`/portal/${token}/vendors`),
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);

  useEffect(() => { setInput(value); }, [value]);

  const suggestions = input.trim()
    ? vendors.filter((v: any) => v.name.toLowerCase().includes(input.toLowerCase()))
    : vendors;

  const isNew = input.trim() !== "" && !vendors.some((v: any) => v.name.toLowerCase() === input.trim().toLowerCase());

  function select(name: string) { setInput(name); onChange(name); setOpen(false); }
  function handleBlur(e: React.FocusEvent) {
    if (dropRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false); onChange(input);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input ref={inputRef} type="text" autoComplete="off"
          className="w-full h-10 pl-8 pr-8 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="e.g. Home Depot"
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); onChange(e.target.value); }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
        />
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground cursor-pointer"
          onClick={() => { setOpen(o => !o); inputRef.current?.focus(); }} />
      </div>
      {open && (
        <div ref={dropRef} className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-xl overflow-hidden" style={{ maxHeight: 180, overflowY: "auto" }}>
          {vendors.length === 0 && !input.trim() && (
            <p className="px-3 py-2.5 text-xs text-muted-foreground italic">No saved vendors yet — type to add one</p>
          )}
          {suggestions.map((v: any) => (
            <button key={v.id} type="button" onMouseDown={() => select(v.name)}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 flex items-center gap-2 border-b border-border/40 last:border-0">
              <Store className="w-3.5 h-3.5 text-primary/50 flex-shrink-0" />
              <span>{v.name}</span>
            </button>
          ))}
          {isNew && (
            <button type="button" onMouseDown={() => select(input.trim())}
              className="w-full text-left px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 flex items-center gap-2 border-t border-border/60">
              <Plus className="w-3.5 h-3.5" />
              Add "{input.trim()}" as new vendor
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Expenses Tab ─────────────────────────────────────────────────────────────
function ExpensesTab({ token, jobs }: { token: string; jobs: any[] }) {
  const qc = useQueryClient();
  const { data: expenses = [] } = useQuery({
    queryKey: ["portal-expenses", token],
    queryFn: () => apiFetch(`/portal/${token}/expenses`),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ description: "", amount: "", category: "Tools/Supplies", date: localDateString(), vendor: "", jobId: "" });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // ── AI receipt scan ──────────────────────────────────────────────────────────
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  async function handleScanFile(file: File) {
    setScanning(true);
    setScanError(null);
    setFormOpen(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE}/api/expense-import/parse-receipt`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error ?? "Couldn't read this receipt. Fill in the details manually.");
        return;
      }
      setForm(f => ({
        ...f,
        description: data.description || f.description,
        amount:      data.amount      ? String(data.amount) : f.amount,
        date:        data.date        || f.date,
        category:    EXPENSE_CATS.includes(data.category) ? data.category : f.category,
        vendor:      data.vendor      || f.vendor,
      }));
      // Pre-load the scanned file as the receipt attachment too
      handleReceiptFile(file);
    } catch {
      setScanError("Couldn't connect. Please fill in the details manually.");
    } finally {
      setScanning(false);
      if (scanInputRef.current) scanInputRef.current.value = "";
    }
  }

  const handleReceiptFile = useCallback((f: File) => {
    setReceiptFile(f);
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = e => setReceiptPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setReceiptPreview(null);
    }
  }, []);

  function resetForm() {
    setForm({ description: "", amount: "", category: "Tools/Supplies", date: localDateString(), vendor: "", jobId: "" });
    setReceiptFile(null);
    setReceiptPreview(null);
    if (receiptInputRef.current) receiptInputRef.current.value = "";
  }

  const addMut = useMutation({
    mutationFn: async () => {
      let receiptUrl: string | undefined;
      if (receiptFile) {
        const fd = new FormData();
        fd.append("file", receiptFile);
        const uploadRes = await apiFetch(`/portal/${token}/upload`, { method: "POST", body: fd });
        receiptUrl = uploadRes?.url;
      }
      return apiFetch(`/portal/${token}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount), jobId: form.jobId ? parseInt(form.jobId) : undefined, receiptUrl }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-expenses", token] });
      qc.invalidateQueries({ queryKey: ["portal", token] });
      setFormOpen(false);
      resetForm();
    },
  });

  const delMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/portal/${token}/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-expenses", token] });
      qc.invalidateQueries({ queryKey: ["portal", token] });
    },
  });

  const total = (expenses as any[]).reduce((s: number, e: any) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold">My Expenses</h2>
          <p className="text-sm text-muted-foreground">Total: <strong className="text-foreground">{formatCurrency(total)}</strong></p>
        </div>
        <div className="flex items-center gap-2">
          {/* AI scan — opens camera/file picker and auto-fills the form */}
          <button
            onClick={() => scanInputRef.current?.click()}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
            title="Scan a receipt with AI"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            <span className="hidden sm:inline">Scan</span>
          </button>
          <input
            ref={scanInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,image/gif,image/webp,image/bmp,image/tiff,.pdf"
            capture="environment"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleScanFile(f); }}
          />
          <button
            onClick={() => { setFormOpen(!formOpen); if (formOpen) { resetForm(); setScanError(null); } }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      {formOpen && (
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3">
          {/* Scan status banners */}
          {scanning && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              <span>Reading your receipt with AI…</span>
            </div>
          )}
          {scanError && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-snug">{scanError}</p>
            </div>
          )}
          {!scanning && !scanError && receiptFile && form.description && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
              <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Fields filled from your receipt — review and tap Save.</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Description *"><Input value={form.description} onChange={e => setF("description", e.target.value)} placeholder="What was it for?" /></Field>
            <Field label="Amount *"><Input type="number" min="0" step="0.01" value={form.amount} onChange={e => setF("amount", e.target.value)} placeholder="0.00" /></Field>
            <Field label="Date *"><Input type="date" value={form.date} onChange={e => setF("date", e.target.value)} /></Field>
            <Field label="Category">
              <select value={form.category} onChange={e => setF("category", e.target.value)} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none">
                {EXPENSE_CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Vendor">
              <Input value={form.vendor} onChange={e => setF("vendor", e.target.value)} placeholder="e.g. Home Depot" />
            </Field>
            {jobs.length > 0 && (
              <Field label="Job">
                <select value={form.jobId} onChange={e => setF("jobId", e.target.value)} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none">
                  <option value="">None</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </Field>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Receipt <span className="font-normal">(optional)</span></p>
            {receiptFile ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
                {receiptPreview
                  ? <img src={receiptPreview} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-emerald-200" />
                  : <FileText className="w-8 h-8 text-emerald-600 flex-shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-emerald-800 truncate">{receiptFile.name}</p>
                  <p className="text-[10px] text-emerald-600">Ready to upload</p>
                </div>
                <button type="button" onClick={() => { setReceiptFile(null); setReceiptPreview(null); if (receiptInputRef.current) receiptInputRef.current.value = ""; }}
                  className="p-1 rounded-full hover:bg-emerald-200 transition-colors">
                  <X className="w-3.5 h-3.5 text-emerald-700" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => receiptInputRef.current?.click()}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors">
                <Upload className="w-4 h-4" /> Tap to attach receipt photo or PDF
              </button>
            )}
            <input ref={receiptInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,image/gif,image/webp,image/bmp,image/tiff,.pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleReceiptFile(f); }} />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => addMut.mutate()}
              disabled={!form.description || !form.amount || addMut.isPending}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {addMut.isPending ? "Saving…" : "Save Expense"}
            </button>
            <button onClick={() => { setFormOpen(false); resetForm(); }} className="w-10 h-10 rounded-xl border border-border flex items-center justify-center hover:bg-muted"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {(expenses as any[]).length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          <Receipt className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p className="text-sm">No expenses yet. Tap Add to get started.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm divide-y divide-border/50">
          {(expenses as any[]).map(e => (
            <div key={e.id} className="flex items-start gap-3 px-4 py-3">
              {e.receiptUrl && (
                <a href={e.receiptUrl.startsWith("http") ? e.receiptUrl : `${BASE}${e.receiptUrl}`} target="_blank" rel="noreferrer" className="flex-shrink-0">
                  {/\.(jpg|jpeg|png|gif|webp)/i.test(e.receiptUrl)
                    ? <img src={e.receiptUrl.startsWith("http") ? e.receiptUrl : `${BASE}${e.receiptUrl}`} alt="Receipt" className="w-10 h-10 rounded-lg object-cover border border-border hover:opacity-80 transition-opacity" />
                    : <div className="w-10 h-10 rounded-lg border border-border bg-muted flex items-center justify-center"><FileText className="w-4 h-4 text-muted-foreground" /></div>
                  }
                </a>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{e.description}</p>
                <p className="text-xs text-muted-foreground">{e.date} · {e.category}{e.vendor ? ` · ${e.vendor}` : ""}</p>
              </div>
              <span className="font-semibold text-sm flex-shrink-0">{formatCurrency(e.amount)}</span>
              <button onClick={() => delMut.mutate(e.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Mileage Tab ─────────────────────────────────────────────────────────────
function MileageTab({ token, jobs, ratePerMile }: { token: string; jobs: any[]; ratePerMile: number }) {
  const qc = useQueryClient();
  const { data: logs = [] } = useQuery({
    queryKey: ["portal-mileage", token],
    queryFn: () => apiFetch(`/portal/${token}/mileage`),
  });

  const today = localDateString();
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    date: today, miles: "", startLocation: "", endLocation: "",
    purpose: "", classification: "business", jobId: "",
  });
  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const resetForm = () => {
    setForm({ date: today, miles: "", startLocation: "", endLocation: "", purpose: "", classification: "business", jobId: "" });
    setFormError("");
  };

  const addMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      return apiFetch(`/portal/${token}/mileage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-mileage", token] });
      qc.invalidateQueries({ queryKey: ["portal", token] });
      setFormOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      setFormError(err.message || "Failed to save.");
    },
  });

  const saveManual = () => {
    if (!form.date || !form.miles || parseFloat(form.miles) <= 0) {
      setFormError("Date and miles are required.");
      return;
    }
    addMut.mutate({ ...form, miles: parseFloat(form.miles), jobId: form.jobId ? parseInt(form.jobId) : undefined });
  };

  const delMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/portal/${token}/mileage/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-mileage", token] });
      qc.invalidateQueries({ queryKey: ["portal", token] });
    },
  });

  const businessLogs = (logs as any[]).filter(m => m.classification === "business");
  const allLogs      = logs as any[];
  const totalBizMiles   = businessLogs.reduce((s: number, m: any) => s + parseFloat(m.miles ?? 0), 0);
  const totalDeduction  = businessLogs.reduce((s: number, m: any) => s + parseFloat(m.deductionAmount ?? 0), 0);
  const tripCount       = allLogs.length;
  const previewDeduction = form.miles && form.classification === "business" ? parseFloat(form.miles) * ratePerMile : 0;

  const inp2 = "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold">Mileage Tracker</h2>
          <p className="text-sm text-muted-foreground">Manual mileage entry</p>
        </div>
        <button
          onClick={() => { setFormOpen(!formOpen); if (formOpen) resetForm(); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border bg-card text-foreground text-sm font-semibold hover:bg-muted transition-colors"
        >
          <PenLine className="w-4 h-4" /> Log Manually
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-primary text-primary-foreground rounded-2xl p-4 shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-primary-foreground/70 text-xs font-medium">IRS Deduction</p>
              <p className="text-2xl font-display font-bold mt-1">{formatCurrency(totalDeduction)}</p>
            </div>
            <Calculator className="w-5 h-5 opacity-40 mt-0.5" />
          </div>
          <p className="text-[10px] text-primary-foreground/50 mt-2">${ratePerMile}/mi rate</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <p className="text-muted-foreground text-xs font-medium">Business Miles</p>
          <p className="text-2xl font-display font-bold text-foreground mt-1">{totalBizMiles.toFixed(1)}</p>
          <p className="text-[10px] text-muted-foreground mt-2">mi logged</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <p className="text-muted-foreground text-xs font-medium">Trips</p>
          <p className="text-2xl font-display font-bold text-foreground mt-1">{tripCount}</p>
          <p className="text-[10px] text-muted-foreground mt-2">total logged</p>
        </div>
      </div>

      {/* Entry form */}
      {formOpen && (
        <div className="bg-card border border-blue-200 rounded-2xl overflow-hidden shadow-md">
          <div className="h-1 bg-gradient-to-r from-blue-400 to-blue-600" />
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <PenLine className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-bold text-foreground">Log Trip Manually</h3>
            </div>

            {formError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Date *</label>
                <input type="date" className={inp2} value={form.date} onChange={e => setF("date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Miles *</label>
                <input type="number" min="0" step="0.1" placeholder="e.g. 12.5" className={inp2}
                  value={form.miles} onChange={e => setF("miles", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">From</label>
                <input className={inp2} placeholder="e.g. Home" value={form.startLocation} onChange={e => setF("startLocation", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">To</label>
                <input className={inp2} placeholder="e.g. Job site" value={form.endLocation} onChange={e => setF("endLocation", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Purpose / Notes</label>
              <input className={inp2} placeholder="e.g. Material run to Home Depot" value={form.purpose} onChange={e => setF("purpose", e.target.value)} />
            </div>

            {/* Business / Personal toggle */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">Trip Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setF("classification", "business")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                    form.classification === "business"
                      ? "border-primary bg-primary/10 text-primary font-bold"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}>
                  <Briefcase className="w-4 h-4" /> Business
                </button>
                <button type="button" onClick={() => setF("classification", "personal")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                    form.classification === "personal"
                      ? "border-border bg-muted text-foreground font-bold"
                      : "border-border text-muted-foreground hover:border-border"
                  }`}>
                  <User className="w-4 h-4" /> Personal
                </button>
              </div>
            </div>

            {jobs.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Link to Job (optional)</label>
                <select value={form.jobId} onChange={e => setF("jobId", e.target.value)} className={inp2}>
                  <option value="">No specific job</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
            )}

            {previewDeduction > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">Auto-expense:</span>{" "}
                <span className="font-bold">{formatCurrency(previewDeduction)}</span> mileage expense will be created ({parseFloat(form.miles).toFixed(1)} mi × ${ratePerMile}/mi).
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={saveManual}
                disabled={!form.date || !form.miles || addMut.isPending}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow"
              >
                {addMut.isPending ? "Saving…" : form.classification === "business" ? "Save & Log Expense" : "Save Trip"}
              </button>
              <button onClick={() => { setFormOpen(false); resetForm(); }}
                className="w-10 h-10 rounded-xl border border-border flex items-center justify-center hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trip list */}
      {allLogs.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <Navigation className="w-8 h-8 mx-auto mb-2 opacity-20 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No trips logged yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Tap "Log Trip" above to record your first trip.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {allLogs.map((m: any) => {
            const miles    = parseFloat(m.miles ?? 0);
            const deduct   = parseFloat(m.deductionAmount ?? 0);
            const isBiz    = m.classification === "business";
            const hasRoute = m.startLocation || m.endLocation;
            return (
              <div key={m.id} className={`bg-card border rounded-2xl p-4 shadow-sm flex gap-3 group hover:shadow-md transition-all ${
                isBiz ? "border-primary/20" : "border-border/50"
              }`}>
                {/* Left accent bar */}
                <div className={`w-1 rounded-full flex-shrink-0 ${isBiz ? "bg-primary" : "bg-muted-foreground/30"}`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {/* Route line */}
                      {hasRoute ? (
                        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">
                            {m.startLocation || "—"} → {m.endLocation || "—"}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm font-medium text-foreground">
                          {m.purpose || (isBiz ? "Business trip" : "Personal trip")}
                        </p>
                      )}

                      {/* Purpose (if route was shown) */}
                      {hasRoute && m.purpose && (
                        <p className="text-xs text-muted-foreground mt-0.5">{m.purpose}</p>
                      )}

                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="text-xs text-muted-foreground">{m.date}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isBiz ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        }`}>
                          {m.classification}
                        </span>
                        {m.jobTitle && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{m.jobTitle}</span>
                        )}
                      </div>
                    </div>

                    {/* Right: miles + deduction */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-display font-bold text-foreground">{miles.toFixed(1)} mi</p>
                      {isBiz && deduct > 0 && (
                        <p className="text-xs font-semibold text-emerald-600">+{formatCurrency(deduct)}</p>
                      )}
                      {!isBiz && (
                        <p className="text-[10px] text-muted-foreground">personal</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Delete button — always visible on touch, fade-in on hover for desktop */}
                <button onClick={() => {
                  if (!confirm("Delete this trip?")) return;
                  delMut.mutate(m.id);
                }} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tax Reports Tab ──────────────────────────────────────────────────────────
function TaxReportsTab({ token }: { token: string }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-tax-report", token, year],
    queryFn: () => apiFetch(`/portal/${token}/tax-report?year=${year}`),
    staleTime: 60000,
  });

  const { data: docs1099 } = useQuery({
    queryKey: ["portal-1099s", token],
    queryFn: () => apiFetch(`/portal/${token}/1099s`),
    staleTime: 10000,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const years = [currentYear, currentYear - 1, currentYear - 2];

  function handlePrint() { window.print(); }

  function download1099(doc: any) {
    apiFetch(`/portal/${token}/1099s/${doc.id}/pdf`)
      .then((resp: any) => {
        if (!resp?.pdfData) return;
        const bytes = Uint8Array.from(atob(resp.pdfData), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `1099-NEC-${resp.taxYear}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {});
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold">Tax Reports</h2>
          <p className="text-sm text-muted-foreground">Profit & loss, deductions, and tax estimates</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-muted/60 transition-colors"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground animate-pulse">Generating report…</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
          Could not load tax report. Please try again.
        </div>
      ) : data ? (
        <div className="space-y-4" id="tax-report-print">
          {/* Header */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Self-Employed</p>
                <h3 className="text-xl font-display font-bold text-foreground">{data.w9LegalName || data.subName}</h3>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Tax Year</p>
                <p className="text-2xl font-display font-bold text-primary">{data.year}</p>
              </div>
            </div>
          </div>

          {/* Income */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-3">Gross Income</p>
            <div className="flex items-end justify-between">
              <p className="text-sm text-emerald-700">Payments from contractor</p>
              <p className="text-2xl font-display font-bold text-emerald-700">{formatCurrency(data.grossIncome)}</p>
            </div>
            {data.qualifyingIncome != null ? (
              data.qualifyingIncome >= 2000 ? (
                <p className="text-xs text-amber-700 mt-2 bg-amber-100 rounded-lg px-3 py-1.5">
                  ⚠️ You may receive a 1099-NEC for {data.year} — qualifying payments ≥ $2,000
                </p>
              ) : data.qualifyingIncome >= 1500 ? (
                <p className="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  Approaching threshold: {formatCurrency(data.qualifyingIncome)} of $2,000 in qualifying payments
                </p>
              ) : null
            ) : null}
          </div>

          {/* Deductions */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Deductions</p>

            {/* Business expenses */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-foreground">Business Expenses</p>
                <p className="text-sm font-bold text-red-600">−{formatCurrency(data.expenses.total)}</p>
              </div>
              {data.expenses.count === 0 ? (
                <p className="text-xs text-muted-foreground ml-1">No expenses logged for {data.year}</p>
              ) : (
                <div className="space-y-1 ml-1">
                  {Object.entries(data.expenses.byCategory as Record<string, number>).map(([cat, amt]) => (
                    <div key={cat} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{cat}</span>
                      <span className="font-medium">{formatCurrency(amt)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs font-semibold border-t border-border/50 pt-1 mt-1">
                    <span>Total Expenses ({data.expenses.count} items)</span>
                    <span>{formatCurrency(data.expenses.total)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border/50" />

            {/* Mileage deduction */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-foreground">Mileage Deduction</p>
                <p className="text-sm font-bold text-red-600">−{formatCurrency(data.mileage.deduction)}</p>
              </div>
              {data.mileage.count === 0 ? (
                <p className="text-xs text-muted-foreground ml-1">No business miles logged for {data.year}</p>
              ) : (
                <div className="text-xs text-muted-foreground ml-1 space-y-0.5">
                  <p>{data.mileage.totalMiles.toFixed(1)} business miles × ${data.mileage.ratePerMile}/mi (IRS rate)</p>
                  <p>{data.mileage.count} trips logged</p>
                </div>
              )}
            </div>

            <div className="border-t border-border/50" />

            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Total Deductions</p>
              <p className="text-base font-bold text-red-600">−{formatCurrency(data.totalDeductions)}</p>
            </div>
          </div>

          {/* Net Income */}
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5">
            <p className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-3">Net Self-Employment Income</p>
            <div className="flex items-end justify-between">
              <p className="text-sm text-violet-700">After all deductions</p>
              <p className="text-2xl font-display font-bold text-violet-700">{formatCurrency(data.netIncome)}</p>
            </div>
          </div>

          {/* SE Tax Estimate */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Self-Employment Tax Estimate</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">SE Tax (15.3% on 92.35% of net income)</span>
                <span className="font-semibold">{formatCurrency(data.seTaxEstimate)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Deductible half of SE tax</span>
                <span className="font-semibold">−{formatCurrency(data.seDeduction)}</span>
              </div>
              <div className="border-t border-border/50 pt-2 flex justify-between font-bold">
                <span>Estimated Federal Taxable Income</span>
                <span className="text-primary">{formatCurrency(data.federalTaxableIncome)}</span>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <p className="text-xs text-amber-800">
                <strong>Disclaimer:</strong> These are estimates based on your logged income, expenses, and mileage. Consult a CPA or tax professional for accurate tax filing advice.
              </p>
            </div>
          </div>

          {/* What you need for taxes callout */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Forms You'll Need</p>
            <div className="space-y-2">
              {[
                { form: "Schedule C", desc: "Report self-employment income & expenses (attach to Form 1040)" },
                { form: "Schedule SE", desc: "Calculate self-employment tax owed" },
                { form: "1099-NEC", desc: (data.qualifyingIncome ?? data.grossIncome) >= 2000 ? "Your contractor will send this — shows your nonemployee compensation" : "Not required unless qualifying payments reach $2,000 (OBBBA 2026)" },
              ].map(({ form, desc }) => (
                <div key={form} className="flex items-start gap-3">
                  <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-md flex-shrink-0 mt-0.5">{form}</span>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-center text-muted-foreground pb-2">
            Report generated {new Date().toLocaleDateString()} · {data.year} Tax Year
          </p>
        </div>
      ) : null}

      {/* ─── Tax Documents (1099-NEC) section ─────────────────────────────── */}
      {data && (
        <div className="space-y-3">
          <div className="border-t border-border/60 pt-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" /> Tax Documents
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">1099-NEC forms issued by your contractor</p>
          </div>

          {/* Approach notice — based on qualifying (cash/check/ACH) payments only */}
          {(() => {
            const qi = data.qualifyingIncome ?? 0;
            if (qi >= 1500 && qi < 2000) return (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Approaching 1099-NEC threshold</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    You have {formatCurrency(qi)} in qualifying payments (cash, check, ACH) for {data.year}.
                    At $2,000 your contractor is required to issue a 1099-NEC.
                    Please ensure your W-9 info is complete in the W-9 tab.
                  </p>
                </div>
              </div>
            );
            return null;
          })()}

          {!docs1099 || (docs1099 as any[]).length === 0 ? (
            <div className="bg-muted/40 border border-border rounded-xl px-4 py-5 text-center">
              <FileText className="w-7 h-7 mx-auto mb-2 opacity-20" />
              <p className="text-sm text-muted-foreground">No 1099 forms have been issued yet.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Your contractor generates these when you reach the reporting threshold.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(docs1099 as any[]).map((doc: any) => (
                <div key={doc.id} className="bg-card border border-blue-200 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Form 1099-NEC — {doc.taxYear}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(doc.totalPaid)} nonemployee compensation · Issued {new Date(doc.generatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {doc.hasPdf && (
                    <button
                      onClick={() => download1099(doc)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors flex-shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" /> Download PDF
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Income Entry Row (expandable breakdown) ──────────────────────────────────
function IncomeEntryRow({ entry }: { entry: any }) {
  const [open, setOpen] = useState(false);
  const hasBreakdown = entry.workHours != null || entry.travelHours != null || entry.bonusAmount != null || entry.advanceAmount != null;

  return (
    <div className="border-b border-border/40 last:border-0">
      <button
        type="button"
        className={`w-full flex items-start gap-3 py-2 text-left ${hasBreakdown ? "cursor-pointer" : "cursor-default"}`}
        onClick={() => hasBreakdown && setOpen(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{entry.description || "Payment"}</p>
          <div className="flex flex-wrap gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">{entry.date}</span>
            {entry.jobTitle && (
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{entry.jobTitle}</span>
            )}
            {entry.notes && (
              <span className="text-xs text-muted-foreground italic">{entry.notes}</span>
            )}
            {hasBreakdown && (
              <span className="text-xs text-amber-600 font-medium">{open ? "Hide details ▲" : "See breakdown ▼"}</span>
            )}
          </div>
        </div>
        <span className="font-semibold text-sm text-emerald-700 flex-shrink-0 pt-0.5">{formatCurrency(entry.amount)}</span>
      </button>

      {open && hasBreakdown && (
        <div className="ml-3 mb-2 bg-muted/40 rounded-xl px-3 py-2.5 space-y-1.5 text-xs">
          {entry.workHours != null && entry.workRate != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Work: {entry.workHours} hrs × {formatCurrency(entry.workRate)}/hr</span>
              <span className="font-medium">{formatCurrency(entry.workHours * entry.workRate)}</span>
            </div>
          )}
          {entry.travelHours != null && entry.travelRate != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Travel: {entry.travelHours} hrs × {formatCurrency(entry.travelRate)}/hr</span>
              <span className="font-medium">{formatCurrency(entry.travelHours * entry.travelRate)}</span>
            </div>
          )}
          {entry.bonusAmount != null && entry.bonusAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bonus{entry.bonusNote ? ` — ${entry.bonusNote}` : ""}</span>
              <span className="font-medium text-emerald-600">+{formatCurrency(entry.bonusAmount)}</span>
            </div>
          )}
          {entry.advanceAmount != null && entry.advanceAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Advance deducted{entry.advanceNote ? ` — ${entry.advanceNote}` : ""}</span>
              <span className="font-medium text-red-500">−{formatCurrency(entry.advanceAmount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border/50 pt-1.5 font-semibold">
            <span className="text-foreground">Net paid</span>
            <span className="text-emerald-700">{formatCurrency(entry.amount)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Income Report Tab ────────────────────────────────────────────────────────
function IncomeReportTab({ token, subName, ytdPayments }: { token: string; subName: string; ytdPayments?: number }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const years = [currentYear, currentYear - 1, currentYear - 2];

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-income-report", token, year],
    queryFn: () => apiFetch(`/portal/${token}/income-report?year=${year}`),
    staleTime: 60000,
  });

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-5">
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #income-report-print, #income-report-print * { visibility: visible; }
          #income-report-print { position: fixed; inset: 0; padding: 2rem; font-size: 13px; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="text-lg font-display font-bold">Income Report</h2>
          <p className="text-sm text-muted-foreground">Payments received from your contractor</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {data && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-muted/60 transition-colors"
            >
              <Printer className="w-4 h-4" /> Print / Save PDF
            </button>
          )}
        </div>
      </div>

      {/* YTD threshold card — current year only */}
      {year === currentYear && ytdPayments != null && (
        <div className="space-y-3 no-print">
          <div className="bg-card border border-border rounded-2xl p-5 text-center shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Year-to-Date Payments</p>
            <p className="text-4xl font-display font-bold text-emerald-600 mt-2">{formatCurrency(ytdPayments)}</p>
            <p className="text-sm text-muted-foreground mt-2">
              {ytdPayments >= 2000
                ? "⚠️ You may receive a 1099-NEC for this tax year."
                : `${formatCurrency(2000 - ytdPayments)} more before a 1099-NEC is required.`}
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-800">
              <strong>2026 Rule (OBBBA):</strong> If you receive $2,000 or more in total payments from a single contractor in a tax year, they are required to file a 1099-NEC.
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground animate-pulse">Loading income report…</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
          Could not load income report. Please try again.
        </div>
      ) : data ? (
        <div className="space-y-4" id="income-report-print">
          {/* Report header */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Income Summary</p>
                <h3 className="text-xl font-display font-bold text-foreground mt-0.5">{data.w9LegalName || data.subName}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">For use with Schedule C / 1099-NEC filing</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Tax Year</p>
                <p className="text-2xl font-display font-bold text-primary">{data.year}</p>
              </div>
            </div>
          </div>

          {/* Total paid */}
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-6 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 mb-2">Total Received from Contractor</p>
            <p className="text-5xl font-display font-bold text-emerald-700">{formatCurrency(data.totalPaid)}</p>
            {data.totalPaid >= 2000 && (
              <p className="text-xs text-emerald-600 mt-3 bg-emerald-100 rounded-lg px-3 py-1.5 inline-block">
                ⚠️ You will receive a 1099-NEC for {data.year} — income ≥ $2,000
              </p>
            )}
          </div>

          {/* Per-job breakdown */}
          {data.byJob && data.byJob.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b border-border pb-2">Breakdown by Job</p>
              {data.byJob.map((j: any) => (
                <div key={j.jobId ?? "__none__"} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <Briefcase className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm text-foreground truncate">{j.jobTitle}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">({j.count} payment{j.count !== 1 ? "s" : ""})</span>
                  </div>
                  <span className="font-semibold text-sm text-emerald-700 flex-shrink-0">{formatCurrency(j.total)}</span>
                </div>
              ))}
              {data.byJob.length > 1 && (
                <div className="border-t border-border pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Total</span>
                  <span className="font-bold text-emerald-700">{formatCurrency(data.totalPaid)}</span>
                </div>
              )}
            </div>
          )}

          {/* Individual payment entries */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b border-border pb-2">
              Payment History ({data.entries?.length ?? 0} entries)
            </p>
            {(!data.entries || data.entries.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-4">No payments recorded for {data.year}.</p>
            ) : (
              <div className="space-y-2">
                {data.entries.map((entry: any) => (
                  <IncomeEntryRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-800">
              <strong>Note:</strong> This summary reflects payments recorded by your contractor. Use this document alongside your 1099-NEC for tax filing. Consult a tax professional for advice specific to your situation.
            </p>
          </div>

          <p className="text-xs text-center text-muted-foreground pb-2">
            Generated {new Date().toLocaleDateString()} · {data.year} Tax Year
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function PortalSettings({ token, features, onChange }: { token: string; features: string[]; onChange: (f: string[]) => void }) {
  const [local, setLocal] = useState<string[]>(features);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggle(key: string) {
    setLocal(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/portal/${token}/features`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: local }),
      });
      onChange(local);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-display font-bold">Portal Settings</h2>
        <p className="text-sm text-muted-foreground">Choose which features you want to use in your portal. You can add more anytime.</p>
      </div>

      <div className="space-y-3">
        {ALL_FEATURES.map(f => {
          const Icon = f.icon;
          const enabled = local.includes(f.key);
          return (
            <button
              key={f.key}
              onClick={() => toggle(f.key)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                enabled ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/30"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm ${enabled ? "text-foreground" : "text-muted-foreground"}`}>{f.label}</p>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${enabled ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                {enabled && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors shadow-md flex items-center justify-center gap-2 ${
          saved ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"
        } disabled:opacity-50`}
      >
        {saved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Preferences"}</>}
      </button>
    </div>
  );
}

// ─── Main Portal ──────────────────────────────────────────────────────────────
export default function SubcontractorPortal() {
  const { token } = useParams<{ token: string }>();
  const search = useSearch();
  const viaPhone = new URLSearchParams(search).get("via") === "phone";
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("dashboard");

  // PIN gate state
  const [pinStatus, setPinStatus] = useState<{ checked: boolean; valid: boolean; pinSet: boolean }>({
    checked: false, valid: false, pinSet: false,
  });

  // Swap title + apple-mobile-web-app-title for iOS "Add to Home Screen" —
  // iOS Safari ignores the manifest and reads these meta tags instead.
  useEffect(() => {
    const prevTitle = document.title;
    const appleMeta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const prevApple = appleMeta?.getAttribute("content") ?? "BuildPro";
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const prevTheme = themeColor?.getAttribute("content") ?? "#6366f1";

    document.title = "Sub Portal";
    if (appleMeta) appleMeta.setAttribute("content", "Sub Portal");
    if (themeColor) themeColor.setAttribute("content", "#f59e0b");

    return () => {
      document.title = prevTitle;
      if (appleMeta) appleMeta.setAttribute("content", prevApple);
      if (themeColor) themeColor.setAttribute("content", prevTheme);
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    // If the user arrived via phone lookup, never honour an existing session —
    // they must always prove identity with their PIN before getting in.
    if (viaPhone) {
      fetch(`${BASE}/api/portal/check-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        credentials: "include",
      })
        .then(r => r.json())
        .then(d => setPinStatus({ checked: true, valid: false, pinSet: !!d.pinSet }))
        .catch(() => setPinStatus({ checked: true, valid: false, pinSet: false }));
      return;
    }
    fetch(`${BASE}/api/portal/check-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      credentials: "include",
    })
      .then(r => r.json())
      .then(d => setPinStatus({ checked: true, valid: !!d.valid, pinSet: !!d.pinSet }))
      .catch(() => setPinStatus({ checked: true, valid: false, pinSet: false }));
  }, [token, viaPhone]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["portal", token],
    queryFn: () => apiFetch(`/portal/${token}`),
    enabled: !!token && pinStatus.valid,
    retry: false,
    staleTime: 30000,
  });

  const [features, setFeatures] = useState<string[]>([]);
  useEffect(() => {
    if (data?.features) setFeatures(data.features);
  }, [data]);

  // Show loading while checking PIN session
  if (!pinStatus.checked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse">Loading your portal…</div>
      </div>
    );
  }

  // Show PIN gate if session is not valid
  if (!pinStatus.valid) {
    if (!pinStatus.pinSet) {
      return (
        <SetPinScreen
          token={token!}
          onPinSet={() => setPinStatus({ checked: true, valid: true, pinSet: true })}
        />
      );
    }
    return (
      <EnterPinScreen
        token={token!}
        onVerified={() => setPinStatus({ checked: true, valid: true, pinSet: true })}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse">Loading your portal…</div>
      </div>
    );
  }

  if (error) {
    if ((error as PortalApiError).pendingApproval || (error as PortalApiError).status === 403) {
      return <PendingApproval />;
    }
    return <InvalidLink />;
  }

  if (!data) return <InvalidLink />;

  const { subcontractor, jobs, stats } = data;

  function handleFeaturesChange(f: string[]) {
    setFeatures(f);
    const visibleTabs = ["dashboard", ...f, "settings"];
    if (!visibleTabs.includes(activeTab)) setActiveTab("dashboard");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Header name={subcontractor.name} trade={subcontractor.trade} />
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
        {activeTab === "dashboard" && <DashboardTab data={data} features={features} setTab={setActiveTab} />}
        {activeTab === "payments" && features.includes("payments") && !features.includes("income_report") && <PaymentsTab data={data} />}
        {activeTab === "income_report" && features.includes("income_report") && (
          <IncomeReportTab token={token!} subName={subcontractor.name} ytdPayments={stats.ytdPayments} />
        )}
        {activeTab === "jobs" && features.includes("jobs") && <JobsTab jobs={jobs} token={token!} onJobCompleted={() => { refetch(); qc.invalidateQueries({ queryKey: ["portal", token] }); }} />}
        {activeTab === "w9" && features.includes("w9") && (
          <W9Tab token={token!} sub={subcontractor} onSaved={() => { refetch(); qc.invalidateQueries({ queryKey: ["portal", token] }); }} />
        )}
        {activeTab === "expenses" && features.includes("expenses") && (
          <ExpensesTab token={token!} jobs={jobs} />
        )}
        {activeTab === "mileage" && features.includes("mileage") && (
          <MileageTab token={token!} jobs={jobs} ratePerMile={stats.ratePerMile} />
        )}
        {activeTab === "tax_reports" && features.includes("tax_reports") && (
          <TaxReportsTab token={token!} />
        )}
        {activeTab === "home_office" && features.includes("home_office") && (
          <HomeOfficeTab />
        )}
        {activeTab === "settings" && (
          <PortalSettings token={token!} features={features} onChange={handleFeaturesChange} />
        )}
        <p className="text-xs text-center text-muted-foreground py-6">
          Secure portal powered by your contractor · Data visible only to you and your contractor
        </p>
      </div>
      <BottomNav activeTab={activeTab} setTab={setActiveTab} features={features} />
    </div>
  );
}
