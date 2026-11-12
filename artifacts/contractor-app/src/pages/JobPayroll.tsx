import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, DollarSign, ChevronDown, ChevronUp, X, CheckCircle2, Pencil, Save, AlertCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getJobProfit } from "@workspace/api-client-react";
import type { JobProfitResponse } from "@workspace/api-client-react";

import { computeSubOwed } from "@/lib/allocationUtils";
import { calculateJobFinancialWaterfall } from "@/lib/jobFinancials";
import {
  applyJobProfitRefresh,
  canApplyJobResponse,
  startJobProfitRefresh,
} from "@/lib/jobProfitRequests";
import { nextJobPaymentSummaryRefreshGeneration } from "@/lib/jobPaymentSummaryRefresh";
import { requireSuccessfulPaymentResponse } from "@/lib/paymentResponse";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");

type SubHourEntry = {
  id: number;
  jobId: number;
  subcontractorId: number;
  date: string;
  hours: number;
  hourType: "work" | "travel" | null;
  rateSnapshot: number | null;
  description: string | null;
  subName: string | null;
};


type SubPayHistoryEntry = {
  id: number;
  date: string;
  amount: number;
  isReversal?: boolean;
  workHours?: number;
  workRate?: number;
  travelHours?: number;
  travelRate?: number;
  bonusAmount?: number;
  bonusNote?: string | null;
  advanceAmount?: number;
  advanceNote?: string | null;
  netPaid?: number;
  paymentMethod?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
};

type SubPaymentRow = {
  subcontractorId: number;
  subName: string | null;
  amountOwed: number | null;
  computedOwed: number;
  amountPaid: number | null;
  totalHours: number;
  totalWorkHours: number;
  totalTravelHours: number;
  avgTravelRateSnapshot: number;
  payRate: number | null;
  travelPayRate: number | null;
  compensationType: string;
  hourlyRate: number | null;
  travelRate: number | null;
  fixedAmount: number | null;
  allocationPct: number | null;
  paymentStatus: string;
  // Draft payroll fields — saved without recording a payment
  accruedBonus?: number | null;
  accruedBonusNote?: string | null;
  accruedAdvancement?: number | null;
  paymentMethodDraft?: string | null;
  paymentReferenceDraft?: string | null;
  paymentHistory?: SubPayHistoryEntry[];
};

type Job = {
  id: number;
  title: string;
  status: string;
  clientName?: string | null;
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  try {
    const [y, m, day] = d.split("-");
    return `${parseInt(m)}/${parseInt(day)}/${y.slice(2)}`;
  } catch { return d; }
}

function localDateInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const PAYMENT_METHODS = ["Zelle", "Cash App", "Cash", "Check", "Venmo", "ACH / Bank Transfer", "Other"];

// ── Worker Card ──────────────────────────────────────────────────────────────────
function WorkerPayCard({
  p, jobId, splitPool, subHours, onRefresh, onDirtyChange, focusHourly,
}: {
  p: SubPaymentRow;
  jobId: number;
  splitPool: number | null;
  subHours: SubHourEntry[];
  onRefresh: () => Promise<void>;
  onDirtyChange?: (isDirty: boolean) => void;
  focusHourly?: boolean;
}) {
  const { toast } = useToast();
  const isHourly = p.compensationType === "hourly";
  const isFixed  = p.compensationType === "fixed";
  const isAlloc  = p.compensationType === "allocation";

  const owed = isAlloc && splitPool == null && p.amountOwed == null
    ? null
    : computeSubOwed(p, splitPool ?? 0) ?? p.computedOwed ?? null;
  const paid    = p.amountPaid ?? 0;
  const balance = owed == null ? null : Math.max(0, owed - paid);
  const isFullyPaid = p.paymentStatus === "paid" || p.paymentStatus === "overpaid";
  const isOvpd      = p.paymentStatus === "overpaid";
  const isPartial   = p.paymentStatus === "partial";
  const isDraft     = !isFullyPaid && !isPartial && (p.totalHours > 0 || (p.accruedBonus ?? 0) > 0 || (p.computedOwed ?? 0) > 0);

  // Payment method / reference — initialized from saved draft
  const [paymentMethod,    setPaymentMethod]    = useState(() => p.paymentMethodDraft ?? "");
  const [paymentReference, setPaymentReference] = useState(() => p.paymentReferenceDraft ?? "");

  // Hourly form — initialized from props; synced via effects so onRefresh() updates unlock the payment button
  const [workHours,   setWorkHours]   = useState(() => {
    const wh = p.totalWorkHours ?? 0;
    return wh > 0 ? wh.toFixed(2) : p.totalHours > 0 ? p.totalHours.toFixed(2) : "";
  });
  const [workRate,    setWorkRate]    = useState(() => String(p.hourlyRate ?? p.payRate ?? ""));
  const [travelHours, setTravelHours] = useState(() => {
    const th = p.totalTravelHours ?? 0;
    return th > 0 ? th.toFixed(2) : "";
  });
  const [travelRate,  setTravelRate]  = useState(() => {
    const explicit = p.travelRate ?? p.travelPayRate ?? null;
    if (explicit != null && explicit > 0) return String(explicit);
    if ((p.avgTravelRateSnapshot ?? 0) > 0) return String(p.avgTravelRateSnapshot);
    return "";
  });
  const workHoursRef = useRef<HTMLInputElement>(null);
  const workRateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusHourly || !isHourly || isFullyPaid) return;
    const target = workRate.trim() === "" ? workRateRef.current
      : workHours.trim() === "" ? workHoursRef.current
      : workRateRef.current;
    target?.focus();
    target?.select();
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusHourly, isHourly, isFullyPaid]);

  // Sync read-only hours from refreshed props
  useEffect(() => {
    const wh = p.totalWorkHours ?? 0;
    setWorkHours(wh > 0 ? wh.toFixed(2) : p.totalHours > 0 ? p.totalHours.toFixed(2) : "");
  }, [p.totalWorkHours, p.totalHours]);
  useEffect(() => {
    const th = p.totalTravelHours ?? 0;
    setTravelHours(th > 0 ? th.toFixed(2) : "");
  }, [p.totalTravelHours]);

  // Bonus / advancement — initialized from saved draft
  const [bonus,          setBonus]          = useState(() => p.accruedBonus != null && p.accruedBonus > 0 ? String(p.accruedBonus) : "");
  const [bonusNote,      setBonusNote]      = useState(() => p.accruedBonusNote ?? "");
  const [advancementAmt, setAdvancementAmt] = useState(() => p.accruedAdvancement != null && p.accruedAdvancement > 0 ? String(p.accruedAdvancement) : "");

  // Track initial server values to detect dirty state
  const initialBonus     = useRef(p.accruedBonus != null && p.accruedBonus > 0 ? String(p.accruedBonus) : "");
  const initialBonusNote = useRef(p.accruedBonusNote ?? "");
  const initialAdvance   = useRef(p.accruedAdvancement != null && p.accruedAdvancement > 0 ? String(p.accruedAdvancement) : "");
  const initialMethod    = useRef(p.paymentMethodDraft ?? "");
  const initialRef       = useRef(p.paymentReferenceDraft ?? "");

  const dirty =
    bonus          !== initialBonus.current     ||
    bonusNote      !== initialBonusNote.current ||
    advancementAmt !== initialAdvance.current   ||
    paymentMethod  !== initialMethod.current    ||
    paymentReference !== initialRef.current;

  // Notify page of dirty state
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Saving draft state
  const [savingChanges, setSavingChanges] = useState(false);
  const [clearingDraft, setClearingDraft] = useState(false);

  // Payroll correction credit (from prior overpayment on other jobs)
  const [correctionBalance, setCorrectionBalance] = useState(0);
  useEffect(() => {
    if (isFullyPaid) return;
    fetch(`${BASE}/api/jobs/payroll-correction/${p.subcontractorId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCorrectionBalance(d.correctionBalance ?? 0); })
      .catch(() => {});
  }, [p.subcontractorId, isFullyPaid]);

  const workPay   = (parseFloat(workHours)   || 0) * (parseFloat(workRate)   || 0);
  const travelPay = (parseFloat(travelHours) || 0) * (parseFloat(travelRate) || 0);
  const bonusAmt  = parseFloat(bonus) || 0;
  const advancementDeduction = parseFloat(advancementAmt) || 0;

  // Fixed/alloc simple amount
  const getAutoSimpleAmount = useCallback(() => {
    const bal = balance ?? 0;
    return bal > 0.01 ? bal.toFixed(2) : (owed ?? 0) > 0 ? (owed ?? 0).toFixed(2) : "";
  }, [balance, owed]);
  const [simpleAmount, setSimpleAmount] = useState(() => {
    const bal = balance ?? 0;
    return bal > 0.01 ? bal.toFixed(2) : (owed ?? 0) > 0 ? (owed ?? 0).toFixed(2) : "";
  });
  const autoSimpleAmount = useRef(simpleAmount);
  useEffect(() => {
    if (isHourly) return;
    const nextAutoAmount = getAutoSimpleAmount();
    setSimpleAmount(current => current === autoSimpleAmount.current ? nextAutoAmount : current);
    autoSimpleAmount.current = nextAutoAmount;
  }, [getAutoSimpleAmount, isHourly]);

  const grossPay = isHourly ? workPay + travelPay + bonusAmt : (parseFloat(simpleAmount) || balance || 0);
  const netToPay = Math.max(0, (isHourly ? Math.max(0, grossPay - paid) : (balance ?? 0)) - advancementDeduction);

  // Earnings summary figures (for the 3-column summary strip)
  // Gross Earned = computed hours earnings (from DB snapshots) + accrued bonus as saved
  const savedBonusAmt = p.accruedBonus ?? 0;
  const grossEarned   = isHourly
    ? (p.computedOwed ?? 0) + savedBonusAmt
    : (owed ?? 0) > 0 ? owed ?? 0 : 0;
  const checklistBalance = Math.max(0, grossEarned - paid);

  const [historyOpen, setHistoryOpen] = useState(() => (p.paymentHistory?.length ?? 0) > 0);
  const [paying,      setPaying]      = useState(false);
  const [deletingPayId, setDeletingPayId] = useState<number | null>(null);

  // Auto-open history accordion whenever a new payment appears
  const historyLen = p.paymentHistory?.length ?? 0;
  useEffect(() => {
    if (historyLen > 0) setHistoryOpen(true);
  }, [historyLen]);

  // Inline hours entry
  const [showLogHours,   setShowLogHours]   = useState(false);
  const [logDate,        setLogDate]        = useState(() => new Date().toISOString().split("T")[0]);
  const [logHours,       setLogHours]       = useState("");
  const [logHourType,    setLogHourType]    = useState<"work" | "travel">("work");
  const [logRate,        setLogRate]        = useState(() => String(p.hourlyRate ?? p.payRate ?? ""));
  const [savingLogHours, setSavingLogHours] = useState(false);

  function handleLogHourTypeChange(type: "work" | "travel") {
    setLogHourType(type);
    if (type === "travel") {
      setLogRate(String(p.travelPayRate ?? p.travelRate ?? ""));
    } else {
      setLogRate(String(p.hourlyRate ?? p.payRate ?? ""));
    }
  }

  // Edit existing logged hour entry
  const [editingHourId,  setEditingHourId]  = useState<number | null>(null);
  const [editDate,       setEditDate]       = useState("");
  const [editHours,      setEditHours]      = useState("");
  const [editHourType,   setEditHourType]   = useState<"work" | "travel">("work");
  const [editRate,       setEditRate]       = useState("");
  const [savingEdit,     setSavingEdit]     = useState(false);

  function openEditHour(entry: SubHourEntry) {
    setEditingHourId(entry.id);
    setEditDate(entry.date);
    setEditHours(String(entry.hours));
    setEditHourType(entry.hourType === "travel" ? "travel" : "work");
    setEditRate(entry.rateSnapshot != null ? String(entry.rateSnapshot) : "");
  }

  function cancelEditHour() {
    setEditingHourId(null);
  }

  async function handleSaveEditHour() {
    const hrs = parseFloat(editHours);
    if (!hrs || hrs <= 0) {
      toast({ title: "Enter a valid number of hours", variant: "destructive" });
      return;
    }
    setSavingEdit(true);
    try {
      const r = await fetch(`${BASE}/api/sub-hours/${editingHourId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          date: editDate,
          hours: hrs,
          hourType: editHourType,
          rateSnapshot: parseFloat(editRate) || null,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      await onRefresh();
      setEditingHourId(null);
      toast({ title: "Hours updated", description: "Rate and totals recalculated." });
    } catch (e: any) {
      toast({ title: "Failed to update hours", description: e?.message, variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  }

  // ── Save Changes (draft save — no ledger entry) ───────────────────────────────
  async function handleSaveChanges() {
    setSavingChanges(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${jobId}/sub-payment-draft/${p.subcontractorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bonusAmount:     bonus          !== "" ? parseFloat(bonus)          : null,
          bonusNote:       bonusNote      !== "" ? bonusNote                   : null,
          advancementAmt:  advancementAmt !== "" ? parseFloat(advancementAmt) : null,
          paymentMethod:   paymentMethod  !== "" ? paymentMethod               : null,
          paymentReference: paymentReference !== "" ? paymentReference         : null,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      // Reset initial refs so dirty clears
      initialBonus.current     = bonus;
      initialBonusNote.current = bonusNote;
      initialAdvance.current   = advancementAmt;
      initialMethod.current    = paymentMethod;
      initialRef.current       = paymentReference;
      await onRefresh();
      toast({ title: "Changes saved", description: "Payroll draft updated — job profitability reflects the latest labor cost." });
    } catch (e: any) {
      toast({ title: "Failed to save changes", description: e?.message, variant: "destructive" });
    } finally {
      setSavingChanges(false);
    }
  }

  // ── Clear Draft (reset all draft fields to null) ─────────────────────────────
  async function handleClearDraft() {
    if (!window.confirm("Clear all saved draft values (bonus, advancement, payment method)? This cannot be undone.")) return;
    setClearingDraft(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${jobId}/sub-payment-draft/${p.subcontractorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bonusAmount: null,
          bonusNote: null,
          advancementAmt: null,
          paymentMethod: null,
          paymentReference: null,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      // Reset local state to empty
      setBonus("");
      setBonusNote("");
      setAdvancementAmt("");
      setPaymentMethod("");
      setPaymentReference("");
      // Reset initial refs so dirty clears
      initialBonus.current     = "";
      initialBonusNote.current = "";
      initialAdvance.current   = "";
      initialMethod.current    = "";
      initialRef.current       = "";
      await onRefresh();
      toast({ title: "Draft cleared", description: "Payroll draft has been reset to zero." });
    } catch (e: any) {
      toast({ title: "Failed to clear draft", description: e?.message, variant: "destructive" });
    } finally {
      setClearingDraft(false);
    }
  }

  // Review-sheet draft
  type ReviewDraft = {
  idempotencyKey: string;
    amount: string;
    paymentDate: string;
    bonus: string;
    bonusNote: string;
    paymentMethod: string;
    paymentReference: string;
    notes: string;
  };
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const reviewOpen = reviewDraft !== null;

  function openReview() {
    const amount = checklistBalance;
    setReviewDraft({
      idempotencyKey: crypto.randomUUID(),
      amount: amount > 0 ? amount.toFixed(2) : "",
      paymentDate: localDateInputValue(),
      bonus,
      bonusNote,
      paymentMethod,
      paymentReference,
      notes: "",
    });
  }
  function closeReview() { setReviewDraft(null); }

  const draftBonusAmt  = reviewDraft ? (parseFloat(reviewDraft.bonus) || 0) : bonusAmt;
  const draftGrossPay  = reviewDraft ? (parseFloat(reviewDraft.amount) || 0) : grossPay;
  const draftNetToPay  = Math.max(0, draftGrossPay - advancementDeduction);

  const history = p.paymentHistory ?? [];

  async function handleDeletePayment(payId: number, amount: number) {
    if (!window.confirm(`Delete this $${fmt(amount)} payment? This cannot be undone.`)) return;
    setDeletingPayId(payId);
    try {
      const r = await fetch(`${BASE}/api/jobs/${jobId}/sub-payments/${payId}`, {
        method: "DELETE", credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      await onRefresh();
      toast({ title: "Payment deleted", description: "Balance has been recalculated." });
    } catch {
      toast({ title: "Failed to delete payment", variant: "destructive" });
    } finally {
      setDeletingPayId(null);
    }
  }

  async function handleLogHours() {
    const hrs = parseFloat(logHours);
    if (!hrs || hrs <= 0) {
      toast({ title: "Enter a valid number of hours", variant: "destructive" });
      return;
    }
    setSavingLogHours(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${jobId}/sub-hours`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subcontractorId: p.subcontractorId, date: logDate, hours: hrs, hourType: logHourType, rateSnapshot: parseFloat(logRate) || undefined }),
      });
      if (!r.ok) throw new Error(await r.text());
      await onRefresh();
      setShowLogHours(false);
      setLogHours("");
      setLogRate(String(p.hourlyRate ?? p.payRate ?? ""));
      toast({ title: "Hours logged", description: `${logHourType === "travel" ? "Travel" : "Work"} hours saved — totals updated.` });
    } catch (e: any) {
      toast({ title: "Failed to log hours", description: e?.message, variant: "destructive" });
    } finally {
      setSavingLogHours(false);
    }
  }

  async function submitPayment(draft: ReviewDraft) {
    if (isAlloc && owed == null) {
      toast({
        title: "Profit data is unavailable",
        description: "Retry before recording an allocation payment so its split amount can be verified.",
        variant: "destructive",
      });
      return;
    }
    const draftBonus  = parseFloat(draft.bonus) || 0;
    const draftGross  = parseFloat(draft.amount) || 0;
    const draftNet    = Math.max(0, draftGross - advancementDeduction);
    const isSettlingBalance = draftGross >= checklistBalance - 0.005;
    if (draftNet <= 0) {
      toast({ title: "Nothing to pay — check amounts", variant: "destructive" });
      return;
    }
    setPaying(true);
    try {
      const body: Record<string, unknown> = {
        subName: p.subName,
        idempotencyKey: draft.idempotencyKey,
        agreedOwed: (isHourly ? (p.computedOwed ?? 0) + draftBonus : owed) != null && Number(isHourly ? (p.computedOwed ?? 0) + draftBonus : owed) > 0
          ? Number(isHourly ? (p.computedOwed ?? 0) + draftBonus : owed)
          : undefined,
        paymentDate: draft.paymentDate,
        notes: draft.notes.trim() || undefined,
        useExplicitAmount: true,
        ...(draft.paymentMethod    ? { paymentMethod: draft.paymentMethod }       : {}),
        ...(draft.paymentReference ? { paymentReference: draft.paymentReference } : {}),
        amount: draftGross,
      };
      if (isHourly && isSettlingBalance) {
        const wh = parseFloat(workHours) || 0;
        const wr = parseFloat(workRate)  || 0;
        if (wh > 0 && wr > 0) {
          body.workHours = wh; body.workRate = wr;
          if ((parseFloat(travelHours) || 0) > 0) {
            body.travelHours = parseFloat(travelHours);
            body.travelRate = parseFloat(travelRate) || 0;
          }
        }
        if (isSettlingBalance && draftBonus > 0) {
          body.bonusAmount = draftBonus;
          if (draft.bonusNote) body.bonusNote = draft.bonusNote;
        }
        if (advancementDeduction > 0) { body.advanceAmount = advancementDeduction; }
      }
      const r = await fetch(`${BASE}/api/jobs/${jobId}/pay-worker/${p.subcontractorId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(body),
      });
      await requireSuccessfulPaymentResponse(r);
      await onRefresh();
      closeReview();
      // Reset draft refs after payment so dirty clears
      initialBonus.current     = bonus;
      initialBonusNote.current = bonusNote;
      initialAdvance.current   = advancementAmt;
      initialMethod.current    = paymentMethod;
      initialRef.current       = paymentReference;
      toast({ title: "Payment recorded", description: `${p.subName ?? "Sub"}: $${fmt(draftNet)} paid` });
    } catch (err) {
      toast({
        title: "Failed to record payment",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
    finally { setPaying(false); }
  }

  const borderColor = isHourly ? "border-l-blue-400" : isFixed ? "border-l-orange-400" : "border-l-purple-400";
  const badgeCls    = isHourly
    ? "text-blue-700 bg-blue-50 border-blue-200"
    : isFixed
      ? "text-orange-700 bg-orange-50 border-orange-200"
      : "text-purple-700 bg-purple-50 border-purple-200";
  const badgeLabel  = isHourly ? "Hourly" : isFixed ? "Fixed" : "%Alloc";

  // Whether to show the sticky "Review & Record" action bar
  const hasHours = (parseFloat(workHours) || 0) > 0;
  const allocationOwedUnavailable = isAlloc && owed == null;
  const canReview = !isFullyPaid
    && (isHourly ? hasHours : true)
    && netToPay > 0
    && !allocationOwedUnavailable;

  return (
    // NOTE: no overflow-hidden so the sticky action bar can escape the card's clip
    <div className={`bg-white rounded-2xl shadow-sm border border-border border-l-4 ${borderColor} ${isFullyPaid ? "opacity-75" : ""}`}>
      {/* Header row */}
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center flex-wrap gap-2 mb-0.5">
            <span className="text-base font-bold text-foreground">{p.subName ?? "Sub"}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeCls}`}>{badgeLabel}</span>
            {isFullyPaid && !isOvpd && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">✓ Paid in Full</span>}
            {isOvpd      && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">⚠ Payroll Correction</span>}
            {isPartial   && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Partially Paid</span>}
            {!isFullyPaid && !isPartial && (balance ?? 0) > 0.005 && <span className="text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">Unpaid</span>}
            {!isFullyPaid && owed != null && grossEarned <= 0.005 && <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">No amount due yet</span>}
            {isDraft && !isPartial && !isFullyPaid && (
              <span className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">Draft</span>
            )}
          </div>
          {isAlloc   && <p className="text-xs text-purple-600">{(p.allocationPct ?? 0).toFixed(1)}% of split pool</p>}
          <p className="text-xs text-muted-foreground">
            Owed ${fmt(grossEarned)} · Paid ${fmt(paid)} · Remaining ${fmt(checklistBalance)}
          </p>
          {isOvpd && owed != null && (
            <p className="text-xs text-amber-600">Payroll correction on file — ${fmt(Math.max(0, paid - owed))} overpaid</p>
          )}
          {isFullyPaid && !isOvpd && paid > 0 && <p className="text-xs text-emerald-600">Settled — ${fmt(paid)} paid</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xl font-black text-foreground">
            {owed == null ? "Unavailable" : `$${fmt(owed)}`}
          </p>
          {isPartial && balance != null && balance > 0 && <p className="text-xs text-orange-500">Due: ${fmt(balance)}</p>}
        </div>
      </div>

      {/* ── Earnings Summary Strip (Gross / Paid / Outstanding) — hourly subs with labor ── */}
      {isHourly && grossEarned > 0 && (
        <div className="mx-5 mb-3 grid grid-cols-3 divide-x divide-border/50 rounded-xl border border-border/60 bg-muted/10 overflow-hidden">
          <div className="px-3 py-2.5 text-center">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Gross Earned</p>
            <p className="text-sm font-black text-foreground">${fmt(grossEarned)}</p>
          </div>
          <div className="px-3 py-2.5 text-center">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Already Paid</p>
            <p className="text-sm font-black text-emerald-700">${fmt(paid)}</p>
          </div>
          <div className="px-3 py-2.5 text-center">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Outstanding</p>
            <p className={`text-sm font-black ${Math.max(0, grossEarned - paid) > 0.01 ? "text-orange-600" : "text-muted-foreground"}`}>
              ${fmt(Math.max(0, grossEarned - paid))}
            </p>
          </div>
        </div>
      )}

      {!isFullyPaid && (
        <>
          <div className="h-px bg-border/50 mx-5" />

          {/* ── Earnings ── */}
          <div className="px-5 pt-4 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-3">Earnings</p>
            {isHourly ? (
              <div className="space-y-3">
                {/* Editable work hours + rate */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Work Hours</label>
                    <input ref={workHoursRef} type="number" value={workHours} onChange={e => setWorkHours(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder="0.0" step="0.25" min="0" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Rate $/hr</label>
                    <input ref={workRateRef} type="number" value={workRate} onChange={e => setWorkRate(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder="0.00" step="0.01" min="0" />
                  </div>
                </div>
                {workPay > 0 && <p className="text-xs font-medium text-blue-600">Work pay: ${fmt(workPay)}</p>}

                {/* Editable travel hours + rate */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Travel Hours <span className="opacity-50">(opt)</span></label>
                    <input type="number" value={travelHours} onChange={e => setTravelHours(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder="0.0" step="0.25" min="0" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Travel Rate $/hr <span className="opacity-50">(opt)</span></label>
                    <input type="number" value={travelRate} onChange={e => setTravelRate(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder="0.00" step="0.01" min="0" />
                  </div>
                </div>
                {travelPay > 0 && <p className="text-xs font-medium text-blue-600">Travel pay: ${fmt(travelPay)}</p>}

                {/* ── Logged hours list with inline edit ── */}
                {subHours.length > 0 && (
                  <div className="mt-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Logged Entries</p>
                    <div className="space-y-1.5">
                      {subHours.map(entry => (
                        <div key={entry.id}>
                          {editingHourId === entry.id ? (
                            <div className="p-3.5 bg-blue-50/80 rounded-xl border border-blue-200 space-y-3">
                              <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Edit Entry</p>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-muted-foreground block mb-1">Date</label>
                                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground block mb-1">Hours</label>
                                  <input type="number" value={editHours} onChange={e => setEditHours(e.target.value)} autoFocus
                                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    placeholder="0.0" step="0.25" min="0" />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-muted-foreground block mb-1">Type</label>
                                  <select value={editHourType} onChange={e => setEditHourType(e.target.value as "work" | "travel")}
                                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                                    <option value="work">Work</option>
                                    <option value="travel">Travel</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground block mb-1">Rate $/hr</label>
                                  <input type="number" value={editRate} onChange={e => setEditRate(e.target.value)}
                                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    placeholder="0.00" step="0.01" min="0" />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={handleSaveEditHour} disabled={savingEdit}
                                  className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                  {savingEdit ? "Saving…" : "Save"}
                                </button>
                                <button onClick={cancelEditHour} disabled={savingEdit}
                                  className="px-4 py-2 border border-border rounded-xl text-xs text-muted-foreground hover:bg-muted/20 transition-colors">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between px-3 py-2.5 bg-muted/20 rounded-xl">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-foreground">{fmtDate(entry.date)}</span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${entry.hourType === "travel" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                                    {entry.hourType === "travel" ? "Travel" : "Work"}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {entry.hours}h
                                  {entry.rateSnapshot != null && entry.rateSnapshot > 0
                                    ? ` @ $${entry.rateSnapshot}/hr = $${fmt(entry.hours * entry.rateSnapshot)}`
                                    : <span className="text-amber-500"> — no rate set</span>
                                  }
                                </p>
                              </div>
                              <button
                                onClick={() => openEditHour(entry)}
                                className="ml-3 p-1.5 rounded-lg text-muted-foreground/50 hover:text-blue-600 hover:bg-blue-50 transition-colors flex-shrink-0"
                                title="Edit this entry"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bonus */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Bonus <span className="opacity-50">(opt)</span></label>
                    <input type="number" value={bonus} onChange={e => { setBonus(e.target.value); }}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Bonus Note</label>
                    <input type="text" value={bonusNote} onChange={e => { setBonusNote(e.target.value); }}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="reason..." />
                  </div>
                </div>
                {bonusAmt > 0 && <p className="text-xs font-medium text-emerald-600">Bonus: +${fmt(bonusAmt)}</p>}
                {grossPay > 0 && (
                  <div className="flex items-center justify-between px-3 py-2 bg-blue-50 rounded-xl">
                    <span className="text-xs font-semibold text-blue-700">Gross Earned</span>
                    <span className="text-sm font-bold text-blue-700">${fmt(grossPay)}</span>
                  </div>
                )}

                {/* ── Save Changes button — persists bonus/advancement/payment info without recording payment ── */}
                {dirty && (
                  <button
                    onClick={handleSaveChanges}
                    disabled={savingChanges || clearingDraft}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800 text-sm font-bold transition-colors disabled:opacity-50"
                  >
                    {savingChanges ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-blue-500/50 border-t-blue-600 rounded-full animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        Save Changes
                      </>
                    )}
                  </button>
                )}
                {/* ── Clear draft link — visible when any draft field has a value ── */}
                {(bonus !== "" || bonusNote !== "" || advancementAmt !== "" || paymentMethod !== "" || paymentReference !== "") && (
                  <button
                    onClick={handleClearDraft}
                    disabled={clearingDraft || savingChanges}
                    className="w-full text-center text-xs text-muted-foreground/70 hover:text-red-500 disabled:opacity-40 transition-colors py-1"
                  >
                    {clearingDraft ? "Clearing…" : "Reset draft"}
                  </button>
                )}
              </div>
            ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Remaining balance</p>
                {isAlloc && (
                  <p className="text-xs text-purple-600 mt-1">
                    {owed == null ? "Calc unavailable until job profit recovers" : `Calculated: $${fmt(owed)}`}
                  </p>
                )}
              </div>
              <p className="text-base font-bold text-foreground">${fmt(balance ?? owed ?? 0)}</p>
            </div>
            )}
          </div>

          <div className="h-px bg-border/50 mx-5" />

          {/* ── Payroll Correction Notice ── */}
          {correctionBalance > 0.005 && (
            <div className="mx-5 mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-800 mb-1">⚠ Payroll Correction Available — ${fmt(correctionBalance)}</p>
              <p className="text-[11px] text-amber-700 mb-2 leading-relaxed">
                This sub was previously overpaid on another job. Applying this adjustment deducts the unrecovered amount from today's cash payment.
              </p>
              <button
                type="button"
                onClick={() => setAdvancementAmt(correctionBalance.toFixed(2))}
                className="text-xs font-bold text-amber-800 bg-white border border-amber-300 rounded-lg px-3 py-1.5 hover:bg-amber-100 active:bg-amber-200 transition-colors"
              >
                Apply Correction
              </button>
            </div>
          )}

          {/* ── Advancement Deduction ── */}
          <div className="px-5 pt-3 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-3">Advancement</p>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Advancement deduction <span className="opacity-50">(opt)</span></label>
              <input
                type="number"
                value={advancementAmt}
                onChange={e => setAdvancementAmt(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="0.00"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Money already given to them — deducted from this payment</p>
            </div>
            {advancementDeduction > 0 && (
              <div className="flex items-center justify-between px-1 pt-2">
                <span className="text-xs text-muted-foreground">
                  {correctionBalance > 0.005 && advancementDeduction >= correctionBalance - 0.005
                    ? "Payroll correction deducted"
                    : "Deducting advancement"}
                </span>
                <span className="text-sm font-bold text-amber-600">−${fmt(advancementDeduction)}</span>
              </div>
            )}
          </div>

          <div className="h-px bg-border/50 mx-5" />

          {/* ── Payment Method & Reference ── */}
          <div className="px-5 pt-3 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-3">Payment Info</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">Select…</option>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Reference # <span className="opacity-50">(opt)</span></label>
                <input type="text" value={paymentReference} onChange={e => setPaymentReference(e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="Transaction ID…" />
              </div>
            </div>
          </div>

          <div className="h-px bg-border/50 mx-5" />

          {/* ── Net to Pay + Record Button ── */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Net to Pay</p>
                {advancementDeduction > 0 && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    ${fmt(grossPay)} − ${fmt(advancementDeduction)}{" "}
                    {correctionBalance > 0.005 && advancementDeduction >= correctionBalance - 0.005
                      ? "payroll correction"
                      : "advancement"}
                  </p>
                )}
              </div>
              <p className="text-3xl font-black text-foreground">${fmt(netToPay)}</p>
            </div>
            {isHourly && showLogHours ? (
              <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-100 space-y-3">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">Log Hours</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Date</label>
                    <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Hours</label>
                    <input type="number" value={logHours} onChange={e => setLogHours(e.target.value)} autoFocus
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder="0.0" step="0.25" min="0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Hour Type</label>
                    <select value={logHourType} onChange={e => handleLogHourTypeChange(e.target.value as "work" | "travel")}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                      <option value="work">Work</option>
                      <option value="travel">Travel</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Rate $/hr</label>
                    <input type="number" value={logRate} onChange={e => setLogRate(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder="0.00" step="0.01" min="0" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleLogHours} disabled={savingLogHours}
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {savingLogHours ? "Saving…" : "Save Hours"}
                  </button>
                  <button onClick={() => { setShowLogHours(false); setLogHours(""); }}
                    className="px-4 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted/20 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : isHourly && (parseFloat(workHours) || 0) <= 0 ? (
              <div className="py-4 px-5 bg-amber-50 border border-amber-200 rounded-2xl text-center">
                <p className="text-sm font-semibold text-amber-700">No hours logged yet</p>
                <p className="text-xs text-amber-600 mt-0.5 mb-3">Log hours to enable payment</p>
                <button
                  onClick={() => setShowLogHours(true)}
                  className="px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition-colors"
                >
                  + Log Hours
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Sticky "Review & Record Payment" bar */}
                <div className={`${canReview ? "sticky bottom-0 z-10" : ""} -mx-5 px-5 pb-1 pt-1 bg-white`}>
                  <button
                    onClick={openReview}
                    disabled={netToPay <= 0 || allocationOwedUnavailable}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-muted text-white font-bold rounded-2xl text-base transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {allocationOwedUnavailable
                      ? "Profit unavailable — retry to record"
                      : `Review & Record Payment — $${fmt(netToPay)}`}
                  </button>
                </div>
                {isHourly && (
                  <button
                    onClick={() => setShowLogHours(true)}
                    className="w-full py-1.5 text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    + Log Hours
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Payment History ── */}
      {history.length > 0 && (
        <>
          <div className="h-px bg-border/50" />
          <button
            onClick={() => setHistoryOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold text-muted-foreground hover:bg-muted/10 transition-colors"
          >
            <span>Payment History ({history.length})</span>
            {historyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {historyOpen && (
            <div className="px-5 pb-5 space-y-2">
              {history.map((h, i) => (
                <div key={i} className="p-3.5 bg-muted/20 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-foreground text-sm">{fmtDate(h.date)}</span>
                      {h.paymentMethod && (
                        <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full">{h.paymentMethod}</span>
                      )}
                      {h.isReversal && (
                        <span className="text-[10px] font-semibold text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">Reversed</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-black text-emerald-700 text-sm">${fmt(h.netPaid ?? h.amount)}</span>
                      <button
                        type="button"
                        onClick={() => handleDeletePayment(h.id, h.netPaid ?? h.amount)}
                        disabled={deletingPayId === h.id}
                        className="p-1 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                        title="Delete payment"
                      >
                        {deletingPayId === h.id
                          ? <div className="w-3.5 h-3.5 border border-red-400 border-t-transparent rounded-full animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                  </div>
                  {h.referenceNumber && <p className="text-muted-foreground">Ref: {h.referenceNumber}</p>}
                  {h.notes && <p className="text-muted-foreground">{h.notes}</p>}
                  {h.workHours != null && <p className="text-muted-foreground">Work: {h.workHours} hrs @ ${h.workRate}/hr = ${fmt((h.workHours || 0) * (h.workRate || 0))}</p>}
                  {(h.travelHours ?? 0) > 0 && <p className="text-muted-foreground">Travel: {h.travelHours} hrs @ ${h.travelRate}/hr = ${fmt((h.travelHours || 0) * (h.travelRate || 0))}</p>}
                  {(h.bonusAmount ?? 0) > 0 && <p className="text-emerald-600">Bonus: +${fmt(h.bonusAmount ?? 0)}{h.bonusNote ? ` (${h.bonusNote})` : ""}</p>}
                  {(h.advanceAmount ?? 0) > 0 && <p className="text-amber-600">Advancement deducted: −${fmt(h.advanceAmount ?? 0)}{h.advanceNote ? ` (${h.advanceNote})` : ""}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Review & Record Sheet ── */}
      {reviewOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => { if (!paying) closeReview(); }}
          />
          {/* Bottom Sheet */}
          <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[90dvh] overflow-y-auto">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-3 pb-4 border-b border-border/50">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Review Payment</p>
                <p className="text-lg font-bold text-foreground mt-0.5">{p.subName ?? "Sub"}</p>
              </div>
              <button
                onClick={() => { if (!paying) closeReview(); }}
                className="p-2 rounded-xl text-muted-foreground hover:bg-muted/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 px-5 pt-4">
              <div className="rounded-xl bg-muted/30 p-3">
                <p className="text-[10px] text-muted-foreground">Total owed</p>
                <p className="mt-1 text-sm font-bold">${fmt(grossEarned)}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-[10px] text-emerald-700">Previously paid</p>
                <p className="mt-1 text-sm font-bold text-emerald-800">${fmt(paid)}</p>
              </div>
              <div className="rounded-xl bg-orange-50 p-3">
                <p className="text-[10px] text-orange-700">Remaining</p>
                <p className="mt-1 text-sm font-bold text-orange-800">${fmt(checklistBalance)}</p>
              </div>
            </div>

            {/* Breakdown — read-only */}
            <div className="px-5 pt-4 pb-3 space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Breakdown</p>

              {isHourly ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Work — {parseFloat(workHours).toFixed(2)} hrs @ ${fmt(parseFloat(workRate) || 0)}/hr
                    </span>
                    <span className="font-semibold text-foreground">${fmt(workPay)}</span>
                  </div>
                  {(parseFloat(travelHours) || 0) > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Travel — {parseFloat(travelHours).toFixed(2)} hrs @ ${fmt(parseFloat(travelRate) || 0)}/hr
                      </span>
                      <span className="font-semibold text-foreground">${fmt(travelPay)}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {isPartial ? "Partial payment" : "Payment amount"}
                  </span>
                  <span className="font-semibold text-foreground">${fmt(parseFloat(simpleAmount) || 0)}</span>
                </div>
              )}

              {advancementDeduction > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-amber-600">Advancement deduction</span>
                  <span className="font-semibold text-amber-600">−${fmt(advancementDeduction)}</span>
                </div>
              )}

              {/* Bonus line — live from draft */}
              {isHourly && draftBonusAmt > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-600">Bonus</span>
                  <span className="font-semibold text-emerald-600">+${fmt(draftBonusAmt)}</span>
                </div>
              )}

              {advancementDeduction > 0 && draftGrossPay > 0 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-2">
                  <span>Gross</span>
                  <span>${fmt(draftGrossPay)}</span>
                </div>
              )}
            </div>

            <div className="h-px bg-border/50 mx-5" />

            <div className="px-5 pt-4 pb-3 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Payment</p>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Amount to pay</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={reviewDraft?.amount ?? ""}
                  onChange={e => setReviewDraft(d => d && ({ ...d, amount: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Remaining after this payment: ${fmt(Math.max(0, checklistBalance - (parseFloat(reviewDraft?.amount ?? "") || 0)))}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Payment date</label>
                <input
                  type="date"
                  value={reviewDraft?.paymentDate ?? ""}
                  onChange={e => setReviewDraft(d => d && ({ ...d, paymentDate: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Notes (optional)</label>
                <textarea
                  value={reviewDraft?.notes ?? ""}
                  onChange={e => setReviewDraft(d => d && ({ ...d, notes: e.target.value }))}
                  maxLength={1000}
                  rows={2}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  placeholder="Add a note about this payment"
                />
              </div>
            </div>

            <div className="h-px bg-border/50 mx-5" />

            {/* Editable: Bonus (hourly only) */}
            {isHourly && (
              <>
                <div className="px-5 pt-4 pb-3 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Bonus</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Amount <span className="opacity-50">(opt)</span></label>
                      <input
                        type="number"
                        value={reviewDraft?.bonus ?? ""}
                        onChange={e => setReviewDraft(d => d && ({ ...d, bonus: e.target.value }))}
                        className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Note</label>
                      <input
                        type="text"
                        value={reviewDraft?.bonusNote ?? ""}
                        onChange={e => setReviewDraft(d => d && ({ ...d, bonusNote: e.target.value }))}
                        className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        placeholder="reason..."
                      />
                    </div>
                  </div>
                </div>
                <div className="h-px bg-border/50 mx-5" />
              </>
            )}

            {/* Editable: Payment method & reference */}
            <div className="px-5 pt-4 pb-3 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Payment Info</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Method</label>
                  <select
                    value={reviewDraft?.paymentMethod ?? ""}
                    onChange={e => setReviewDraft(d => d && ({ ...d, paymentMethod: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value="">Select…</option>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Reference # <span className="opacity-50">(opt)</span></label>
                  <input
                    type="text"
                    value={reviewDraft?.paymentReference ?? ""}
                    onChange={e => setReviewDraft(d => d && ({ ...d, paymentReference: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="Transaction ID…"
                  />
                </div>
              </div>
            </div>

            <div className="h-px bg-border/50 mx-5" />

            {/* Net to Pay + Confirm */}
            <div className="px-5 pt-4 pb-8">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-sm text-muted-foreground">Net to Pay</p>
                  {advancementDeduction > 0 && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      ${fmt(draftGrossPay)} − ${fmt(advancementDeduction)} advancement
                    </p>
                  )}
                </div>
                <p className="text-4xl font-black text-foreground">${fmt(draftNetToPay)}</p>
              </div>

              <button
                onClick={() => reviewDraft && submitPayment(reviewDraft)}
                disabled={paying || draftNetToPay <= 0 || allocationOwedUnavailable}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-muted text-white font-bold rounded-2xl text-base transition-colors disabled:opacity-50 shadow-sm flex items-center justify-center gap-2"
              >
                {paying ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    Recording…
                  </>
                ) : (
                  <>
                    {allocationOwedUnavailable ? (
                      "Profit unavailable — retry to record"
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        Confirm &amp; Record — ${fmt(draftNetToPay)}
                      </>
                    )}
                  </>
                )}
              </button>

              <button
                onClick={closeReview}
                disabled={paying}
                className="w-full mt-3 py-3 border border-border rounded-2xl text-sm font-semibold text-muted-foreground hover:bg-muted/20 transition-colors disabled:opacity-50"
              >
                Go Back &amp; Edit
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────────
export default function JobPayroll() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const jobId = parseInt(id ?? "0");
  const payrollSearchParams = new URLSearchParams(window.location.search);
  const focusSubcontractorId = parseInt(payrollSearchParams.get("focusSubcontractorId") ?? "", 10);
  const focusHourlyWorkerId = payrollSearchParams.get("focus") === "hourly" && Number.isFinite(focusSubcontractorId)
    ? focusSubcontractorId
    : null;

  const [job,      setJob]      = useState<Job | null>(null);
  const [profit,   setProfit]   = useState<JobProfitResponse | null>(null);
  const [profitError, setProfitError] = useState(false);
  const [payments, setPayments] = useState<SubPaymentRow[]>([]);
  const [subHours, setSubHours] = useState<SubHourEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [ownerSplitPct,    setOwnerSplitPct]    = useState(50);
  const [taxReservePct,    setTaxReservePct]    = useState(25);
  const [growthReservePct, setGrowthReservePct] = useState(5);
  const [plStepOrder,      setPlStepOrder]      = useState<string[]>(["expenses", "labor", "growth"]);
  const [recordingDraw,    setRecordingDraw]    = useState(false);

  // Track whether any card has unsaved changes for back-navigation guard
  const dirtyCountRef = useRef(0);
  const [anyDirty, setAnyDirty] = useState(false);
  const loadKeyRef = useRef(0);
  const currentJobIdRef = useRef(jobId);
  currentJobIdRef.current = jobId;

  function handleCardDirtyChange(isDirty: boolean) {
    dirtyCountRef.current = Math.max(0, dirtyCountRef.current + (isDirty ? 1 : -1));
    setAnyDirty(dirtyCountRef.current > 0);
  }

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ["accounting"] });
    const profitRefresh = startJobProfitRefresh<JobProfitResponse>();
    setProfit(profitRefresh.profit);
    setProfitError(profitRefresh.profitError);
    const requestKey = nextJobPaymentSummaryRefreshGeneration(loadKeyRef.current);
    loadKeyRef.current = requestKey;
    const requestedJobId = jobId;
    const [pRes, profRes, hoursRes] = await Promise.allSettled([
      fetch(`${BASE}/api/jobs/${requestedJobId}/sub-payments`,  { credentials: "include" }).then(r => {
        if (!r.ok) throw new Error("Failed to load payroll rows");
        return r.json();
      }),
      getJobProfit(requestedJobId, { credentials: "include" }),
      fetch(`${BASE}/api/jobs/${requestedJobId}/sub-hours`,     { credentials: "include" }).then(r => {
        if (!r.ok) throw new Error("Failed to load logged hours");
        return r.json();
      }),
    ]);
    if (!canApplyJobResponse(requestKey, loadKeyRef.current, requestedJobId, currentJobIdRef.current)) {
      setRefreshing(false);
      return;
    }
    if (pRes.status    === "fulfilled") setPayments(pRes.value as SubPaymentRow[]);
    const profitState = applyJobProfitRefresh(
      profitRefresh,
      {
        requestKey,
        currentRequestKey: loadKeyRef.current,
        requestedJobId,
        currentJobId: currentJobIdRef.current,
        response: profRes.status === "fulfilled"
          ? { status: "fulfilled", value: profRes.value }
          : { status: "rejected" },
      },
    );
    setProfit(profitState.profit);
    setProfitError(profitState.profitError);
    if (hoursRes.status === "fulfilled") setSubHours(hoursRes.value as SubHourEntry[]);
    setRefreshing(false);
  }, [jobId, queryClient]);

  useEffect(() => {
    const requestedJobId = jobId;
    const requestKey = nextJobPaymentSummaryRefreshGeneration(loadKeyRef.current);
    loadKeyRef.current = requestKey;
    const profitRefresh = startJobProfitRefresh<JobProfitResponse>();
    setLoading(true);
    setJob(null);
    setProfit(profitRefresh.profit);
    setProfitError(profitRefresh.profitError);
    setPayments([]);
    setSubHours([]);
    dirtyCountRef.current = 0;
    setAnyDirty(false);
    const load = async () => {
      const [jobRes, pRes, profRes, settingsRes, hoursInitRes] = await Promise.allSettled([
        fetch(`${BASE}/api/jobs/${requestedJobId}`,             { credentials: "include" }).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}/api/jobs/${requestedJobId}/sub-payments`,{ credentials: "include" }).then(r => {
          if (!r.ok) throw new Error("Failed to load payroll rows");
          return r.json();
        }),
        getJobProfit(requestedJobId, { credentials: "include" }),
        fetch(`${BASE}/api/settings`,                  { credentials: "include" }).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}/api/jobs/${requestedJobId}/sub-hours`,   { credentials: "include" }).then(r => {
          if (!r.ok) throw new Error("Failed to load logged hours");
          return r.json();
        }),
      ]);
      if (!canApplyJobResponse(requestKey, loadKeyRef.current, requestedJobId, currentJobIdRef.current)) return;
      if (jobRes.status       === "fulfilled" && jobRes.value)     setJob(jobRes.value as Job);
      if (pRes.status         === "fulfilled")                     setPayments(pRes.value as SubPaymentRow[]);
      const profitState = applyJobProfitRefresh(
        profitRefresh,
        {
          requestKey,
          currentRequestKey: loadKeyRef.current,
          requestedJobId,
          currentJobId: currentJobIdRef.current,
          response: profRes.status === "fulfilled"
            ? { status: "fulfilled", value: profRes.value }
            : { status: "rejected" },
        },
      );
      setProfit(profitState.profit);
      setProfitError(profitState.profitError);
      if (hoursInitRes.status === "fulfilled")                     setSubHours(hoursInitRes.value as SubHourEntry[]);
      if (settingsRes.status === "fulfilled" && settingsRes.value) {
        const s = settingsRes.value as Record<string, unknown>;
        if (s.ownerSplitPct != null)    setOwnerSplitPct(parseFloat(String(s.ownerSplitPct)));
        if (s.taxReservePct != null)    setTaxReservePct(parseFloat(String(s.taxReservePct)));
        if (s.growthReservePct != null) setGrowthReservePct(parseFloat(String(s.growthReservePct)));
        if (s.plStepOrder) {
          try { setPlStepOrder(JSON.parse(String(s.plStepOrder))); } catch {}
        }
      }
      setLoading(false);
    };
    load();
    return () => {
      loadKeyRef.current += 1;
    };
  }, [jobId]);

  if (isNaN(jobId) || jobId <= 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Invalid job</p>
      </div>
    );
  }

  const revenue        = profit?.grossInvoiced  ?? 0;
  const jobExpenses    = profit?.jobExpenses    ?? 0;
  const subLaborCost   = profit?.subLaborCost   ?? 0;
  const waterfall = calculateJobFinancialWaterfall({
    revenue,
    jobExpenses,
    mileageReimbursementCost: 0,
    subLaborCost,
    hourlyFixedCost: subLaborCost,
    allocationPcts: payments.filter(p => p.compensationType === "allocation").map(p => p.allocationPct ?? 0),
    growthReservePct,
    ownerSplitPct,
    taxReservePct,
    authoritativeSplitPool: profit?.splitPool,
  });
  const { growthReserve, toSplit, ownerPct, ownerShare, taxReserve, ownerTakeHome } = waterfall;
  const payrollSummaryRows = payments.map(p => {
    const splitPoolAvailable = profit?.splitPool != null;
    const baseOwed = p.compensationType === "hourly"
      ? (p.computedOwed ?? 0) + (p.accruedBonus ?? 0)
      : computeSubOwed(p, splitPoolAvailable ? toSplit : 0);
    const known = baseOwed != null && !(p.compensationType === "allocation" && !splitPoolAvailable && p.amountOwed == null);
    const owed = known ? Math.max(0, baseOwed ?? 0) : null;
    const paid = Math.max(0, p.amountPaid ?? 0);
    const balance = owed == null ? null : Math.max(0, owed - paid);
    const status = owed == null
      ? "Unavailable"
      : owed <= 0.005 && paid <= 0.005
        ? "No amount due yet"
        : balance! <= 0.005
        ? "Paid"
        : paid > 0.005 && balance! > 0.005
          ? "Partially paid"
          : "Unpaid";
    return { subcontractorId: p.subcontractorId, owed, paid, balance, status };
  });
  const knownPayrollRows = payrollSummaryRows.filter(row => row.balance != null);
  const totalPayrollOwed = knownPayrollRows.reduce((sum, row) => sum + (row.owed ?? 0), 0);
  const totalPayrollOutstanding = knownPayrollRows.reduce((sum, row) => sum + (row.balance ?? 0), 0);
  const totalPayrollPaid = knownPayrollRows.reduce((sum, row) => sum + Math.min(row.owed ?? 0, row.paid), 0);
  const unpaidWorkerCount = payrollSummaryRows.filter(row => row.status === "Unpaid").length;
  const partialWorkerCount = payrollSummaryRows.filter(row => row.status === "Partially paid").length;
  const paidWorkerCount = payrollSummaryRows.filter(row => row.status === "Paid").length;
  const payrollProgress = totalPayrollOwed > 0
    ? Math.min(100, (totalPayrollPaid / totalPayrollOwed) * 100)
    : 0;

  function handleBack() {
    if (anyDirty) {
      const ok = window.confirm("You have unsaved payroll changes.\n\nLeave without saving?");
      if (!ok) return;
    }
    if (window.history.length > 1) window.history.back(); else navigate("/jobs");
  }

  async function handleOwnerDraw() {
    if (ownerTakeHome <= 0.01) return;
    setRecordingDraw(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${jobId}/record-owner-draw`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ amount: ownerTakeHome, description: `Owner Withdrawal — ${job?.title ?? `Job #${jobId}`}` }),
      });
      if (!r.ok) throw new Error();
      toast({ title: "Owner withdrawal recorded", description: `$${fmt(ownerTakeHome)} logged` });
    } catch { toast({ title: "Failed to record owner withdrawal", variant: "destructive" }); }
    finally { setRecordingDraw(false); }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-border/50 px-4 py-3 flex items-center gap-3">
        <button
          onClick={handleBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4.5 h-4.5 text-foreground" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground leading-none mb-0.5">Sub Payment</p>
          <h1 className="text-base font-bold text-foreground truncate leading-tight">
            {loading ? "Loading…" : job?.title ?? `Job #${jobId}`}
          </h1>
        </div>
        {anyDirty && (
          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full flex-shrink-0">
            Unsaved
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 pb-36">
          {profitError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-red-900">Job profit is temporarily unavailable</h2>
                  <p className="text-xs text-red-800/80 mt-1">
                    Payroll rows and saved drafts remain available. Financial cards will return when the latest profit data loads.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={refreshAll}
                  disabled={refreshing}
                  className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-white border border-red-200 px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing ? "Retrying…" : "Try again"}
                </button>
              </div>
            </div>
          )}

          {/* ── Job Summary (P&L Waterfall) ── */}
          {profit != null && (
            <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
              {/* Revenue header */}
              <div className="px-5 py-4 flex items-center justify-between border-b border-border/40">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Revenue</p>
                  <p className="text-2xl font-black text-foreground">${fmt(revenue)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Net Profit</p>
                  <p className="text-lg font-black text-foreground">${fmt(profit.netProfit ?? 0)}</p>
                </div>
              </div>

              {/* Configurable deduction steps */}
              <div className="divide-y divide-border/30">
                {(() => {
                  const stepDefs: Record<string, { label: string; amount: number }> = {
                    expenses: { label: "Job Costs",                               amount: jobExpenses },
                    labor:    { label: "Sub Labor",                              amount: subLaborCost },
                    growth:   { label: `Growth Reserve (${growthReservePct}%)`, amount: growthReserve },
                  };
                  let running = revenue;
                  return plStepOrder.flatMap(key => {
                    const step = stepDefs[key];
                    if (!step || step.amount < 0.005) return [];
                    running = Math.max(0, running - step.amount);
                    return (
                      <div key={key} className="px-5 py-2.5 flex items-center justify-between text-sm bg-muted/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-red-400 text-xs font-mono flex-shrink-0">−</span>
                          <span className="text-muted-foreground truncate">{step.label}</span>
                          <span className="text-xs font-semibold text-red-500 flex-shrink-0">${fmt(step.amount)}</span>
                        </div>
                        <span className="text-xs text-muted-foreground/50 flex-shrink-0 ml-3">→ ${fmt(running)}</span>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Split pool + Owner share + Tax + Take-Home */}
              {ownerShare > 0 && (
                <div className="border-t border-border/50 px-5 py-3 space-y-1.5 bg-blue-50/30">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-semibold">Split Pool</span>
                    <span className="font-bold text-foreground">${fmt(toSplit)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Your Share ({ownerPct.toFixed(1)}%)</span>
                    <span className="font-bold text-foreground">${fmt(ownerShare)}</span>
                  </div>
                  {taxReservePct > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Tax Reserve ({taxReservePct}%)</span>
                      <span className="font-bold text-red-500">−${fmt(taxReserve)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
                    <span className="text-sm font-bold text-emerald-800">Your Take-Home</span>
                    <span className="text-xl font-black text-emerald-700">${fmt(ownerTakeHome)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Payroll Checklist Summary ── */}
          <section className="rounded-2xl border border-border bg-white p-5 shadow-sm" aria-label="Payroll checklist summary">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Payroll Checklist</p>
                <p className="mt-1 text-2xl font-black text-foreground">${fmt(totalPayrollOutstanding)}</p>
                <p className="text-xs text-muted-foreground">Total outstanding worker payments</p>
              </div>
              <p className="text-sm font-bold text-emerald-700">{fmt(payrollProgress)}% paid</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/60" role="progressbar" aria-label="Payroll payment progress" aria-valuenow={Math.round(payrollProgress)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${payrollProgress}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-orange-50 px-3 py-2">
                <p className="text-lg font-bold text-orange-800">{unpaidWorkerCount}</p>
                <p className="text-[10px] font-semibold text-orange-700">Awaiting payment</p>
              </div>
              <div className="rounded-xl bg-amber-50 px-3 py-2">
                <p className="text-lg font-bold text-amber-800">{partialWorkerCount}</p>
                <p className="text-[10px] font-semibold text-amber-700">Partially paid</p>
              </div>
              <div className="rounded-xl bg-emerald-50 px-3 py-2">
                <p className="text-lg font-bold text-emerald-800">{paidWorkerCount}</p>
                <p className="text-[10px] font-semibold text-emerald-700">Paid in full</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              ${fmt(totalPayrollPaid)} paid of ${fmt(totalPayrollOwed)} total compensation.
            </p>
            {payrollSummaryRows.some(row => row.status === "Unavailable") && (
              <p className="mt-3 text-xs text-amber-700">Some worker balances are unavailable until job profit finishes loading.</p>
            )}
          </section>

          {/* ── Worker Cards ── */}
          {payments.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-border px-5 py-10 text-center">
              <p className="text-muted-foreground text-sm">No crew members assigned to this job.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Add subcontractors on the job card first.</p>
            </div>
          ) : (
            payments.map(p => (
              <WorkerPayCard
                key={p.subcontractorId}
                p={p}
                jobId={jobId}
                splitPool={profit?.splitPool != null ? toSplit : null}
                subHours={subHours.filter(h => h.subcontractorId === p.subcontractorId)}
                onRefresh={refreshAll}
                onDirtyChange={handleCardDirtyChange}
                focusHourly={focusHourlyWorkerId === p.subcontractorId}
              />
            ))
          )}

           {/* ── Owner Withdrawal ── */}
          {ownerTakeHome > 0.01 && (
            <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="px-5 pt-4 pb-3">
                 <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Owner Withdrawal</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Your take-home after {taxReservePct}% tax reserve</p>
                  </div>
                  <p className="text-2xl font-black text-emerald-700">${fmt(ownerTakeHome)}</p>
                </div>
              </div>
              <div className="px-5 pb-5">
                <button
                  onClick={handleOwnerDraw}
                  disabled={recordingDraw}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-sm font-bold transition-colors disabled:opacity-50"
                >
                  <DollarSign className="w-4 h-4" />
                   {recordingDraw ? "Recording…" : `Record Owner Withdrawal — $${fmt(ownerTakeHome)}`}
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
