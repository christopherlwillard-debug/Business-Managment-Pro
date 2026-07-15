import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, DollarSign, ChevronDown, ChevronUp, X, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");

type SubAdvance = {
  id: number;
  jobId: number;
  subcontractorId: number;
  amount: number;
  description: string;
  advanceDate: string;
  appliedPaymentId: number | null;
  appliedAt: string | null;
  createdAt: string;
};

type SubPayHistoryEntry = {
  id: number;
  date: string;
  amount: number;
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
  paymentHistory?: SubPayHistoryEntry[];
};

type JobProfit = {
  grossInvoiced: number;
  collected: number;
  jobExpenses: number;
  subLaborCost: number;
  allocPaid: number;
  totalSubHours?: number;
  netProfit: number;
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

const PAYMENT_METHODS = ["Zelle", "Cash App", "Cash", "Check", "Venmo", "ACH / Bank Transfer", "Other"];

// ── Worker Card ──────────────────────────────────────────────────────────────────
function WorkerPayCard({
  p, jobId, splitPool, advances, onRefresh,
}: {
  p: SubPaymentRow;
  jobId: number;
  splitPool: number;
  advances: SubAdvance[];
  onRefresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const isHourly = p.compensationType === "hourly";
  const isFixed  = p.compensationType === "fixed";
  const isAlloc  = p.compensationType === "allocation";

  const outstanding = advances.filter(a => a.appliedPaymentId === null);
  const applied     = advances.filter(a => a.appliedPaymentId !== null);

  const owed = isAlloc
    ? (p.amountOwed ?? splitPool * ((p.allocationPct ?? 0) / 100))
    : (p.amountOwed ?? p.fixedAmount ?? p.computedOwed ?? 0);
  const paid    = p.amountPaid ?? 0;
  const balance = Math.max(0, owed - paid);
  const isFullyPaid = p.paymentStatus === "paid";
  const isPartial   = p.paymentStatus === "partial";

  // Advance checkbox state — auto pre-check all outstanding advances
  const [checkedAdvanceIds, setCheckedAdvanceIds] = useState<Set<number>>(
    () => new Set(outstanding.map(a => a.id))
  );
  useEffect(() => {
    setCheckedAdvanceIds(prev => {
      const next = new Set(prev);
      for (const a of advances) {
        if (a.appliedPaymentId === null && !prev.has(a.id)) next.add(a.id);
      }
      return next;
    });
  }, [advances]);

  // Payment method / reference
  const [paymentMethod,    setPaymentMethod]    = useState("");
  const [paymentReference, setPaymentReference] = useState("");

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
    // Prefer job-level override → profile rate → average rate_snapshot from logged travel hours
    const explicit = p.travelRate ?? p.travelPayRate ?? null;
    if (explicit != null && explicit > 0) return String(explicit);
    if ((p.avgTravelRateSnapshot ?? 0) > 0) return String(p.avgTravelRateSnapshot);
    return "";
  });

  // Sync read-only hours from refreshed props (so "Review & Record" unlocks after inline log)
  useEffect(() => {
    const wh = p.totalWorkHours ?? 0;
    setWorkHours(wh > 0 ? wh.toFixed(2) : p.totalHours > 0 ? p.totalHours.toFixed(2) : "");
  }, [p.totalWorkHours, p.totalHours]);
  useEffect(() => {
    const th = p.totalTravelHours ?? 0;
    setTravelHours(th > 0 ? th.toFixed(2) : "");
  }, [p.totalTravelHours]);
  const [bonus,       setBonus]       = useState("");
  const [bonusNote,   setBonusNote]   = useState("");

  const workPay   = (parseFloat(workHours)   || 0) * (parseFloat(workRate)   || 0);
  const travelPay = (parseFloat(travelHours) || 0) * (parseFloat(travelRate) || 0);
  const bonusAmt  = parseFloat(bonus) || 0;

  // Fixed/alloc simple amount
  const [simpleAmount, setSimpleAmount] = useState(() => {
    const bal = balance;
    return bal > 0.01 ? bal.toFixed(2) : owed > 0 ? owed.toFixed(2) : "";
  });

  const grossPay = isHourly ? workPay + travelPay + bonusAmt : parseFloat(simpleAmount) || 0;

  // Only checked outstanding advances get deducted
  const checkedOutstanding   = outstanding.filter(a => checkedAdvanceIds.has(a.id));
  const totalOutstanding     = checkedOutstanding.reduce((s, a) => s + a.amount, 0);
  const netToPay             = Math.max(0, grossPay - totalOutstanding);

  // Add advance form
  const [showAdvForm, setShowAdvForm] = useState(false);
  const [advAmount,   setAdvAmount]   = useState("");
  const [advDesc,     setAdvDesc]     = useState("");
  const [advDate,     setAdvDate]     = useState(() => new Date().toISOString().split("T")[0]);
  const [savingAdv,   setSavingAdv]   = useState(false);

  const [historyOpen,           setHistoryOpen]           = useState(() => (p.paymentHistory?.length ?? 0) > 0);
  const [paying,                setPaying]                = useState(false);
  const [deletingPayId,         setDeletingPayId]         = useState<number | null>(null);
  const [releasedAdvanceCount,  setReleasedAdvanceCount]  = useState(0);

  // Auto-open the history accordion whenever a new payment appears (e.g. right after recording one)
  const historyLen = p.paymentHistory?.length ?? 0;
  useEffect(() => {
    if (historyLen > 0) setHistoryOpen(true);
  }, [historyLen]);

  // Inline hours entry (shown when hourly sub has no hours logged)
  const [showLogHours,   setShowLogHours]   = useState(false);
  const [logDate,        setLogDate]        = useState(() => new Date().toISOString().split("T")[0]);
  const [logHours,       setLogHours]       = useState("");
  const [logHourType,    setLogHourType]    = useState<"work" | "travel">("work");
  const [logRate,        setLogRate]        = useState(() => String(p.hourlyRate ?? p.payRate ?? ""));
  const [savingLogHours, setSavingLogHours] = useState(false);

  // Swap rate default when user switches hour type
  function handleLogHourTypeChange(type: "work" | "travel") {
    setLogHourType(type);
    if (type === "travel") {
      setLogRate(String(p.travelPayRate ?? p.travelRate ?? ""));
    } else {
      setLogRate(String(p.hourlyRate ?? p.payRate ?? ""));
    }
  }

  // Review-sheet draft — captured from card state when the sheet opens;
  // edits inside the sheet only mutate this draft, NOT the card state.
  // Cancelling discards the draft; confirming passes it to submitPayment.
  type ReviewDraft = { bonus: string; bonusNote: string; paymentMethod: string; paymentReference: string };
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const reviewOpen = reviewDraft !== null;

  function openReview() {
    setReviewDraft({ bonus, bonusNote, paymentMethod, paymentReference });
  }
  function closeReview() { setReviewDraft(null); }

  const draftBonusAmt  = reviewDraft ? (parseFloat(reviewDraft.bonus) || 0) : bonusAmt;
  const draftGrossPay  = isHourly ? workPay + travelPay + draftBonusAmt : (parseFloat(simpleAmount) || 0);
  const draftNetToPay  = Math.max(0, draftGrossPay - totalOutstanding);

  const history = p.paymentHistory ?? [];

  async function handleDeletePayment(payId: number, amount: number) {
    if (!window.confirm(`Delete this $${fmt(amount)} payment? This cannot be undone.`)) return;
    setDeletingPayId(payId);
    try {
      const r = await fetch(`${BASE}/api/jobs/${jobId}/sub-payments/${payId}`, {
        method: "DELETE", credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json().catch(() => ({}));
      const released = data.releasedAdvanceCount ?? 0;
      await onRefresh();
      if (released > 0) {
        setReleasedAdvanceCount(released);
        toast({
          title: "Payment deleted",
          description: `${released} advance${released === 1 ? "" : "s"} released — review deductions before the next payment.`,
        });
      } else {
        toast({ title: "Payment deleted", description: "Balance has been recalculated." });
      }
    } catch {
      toast({ title: "Failed to delete payment", variant: "destructive" });
    } finally {
      setDeletingPayId(null);
    }
  }

  async function handleAddAdvance() {
    const amt = parseFloat(advAmount);
    if (!amt || amt <= 0 || !advDesc.trim() || !advDate) {
      toast({ title: "Enter amount, description, and date", variant: "destructive" });
      return;
    }
    setSavingAdv(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${jobId}/advances`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ subcontractorId: p.subcontractorId, amount: amt, description: advDesc.trim(), advanceDate: advDate }),
      });
      if (!r.ok) throw new Error();
      await onRefresh();
      setAdvAmount(""); setAdvDesc(""); setShowAdvForm(false);
      toast({ title: "Advance saved" });
    } catch { toast({ title: "Failed to save advance", variant: "destructive" }); }
    finally { setSavingAdv(false); }
  }

  async function handleDeleteAdvance(advId: number) {
    try {
      const r = await fetch(`${BASE}/api/jobs/${jobId}/advances/${advId}`, {
        method: "DELETE", credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      await onRefresh();
    } catch (e: any) {
      toast({ title: e?.message?.includes("applied") ? "Cannot delete — already applied to a payment" : "Failed to delete advance", variant: "destructive" });
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
    const draftBonus  = parseFloat(draft.bonus) || 0;
    const draftGross  = isHourly ? workPay + travelPay + draftBonus : (parseFloat(simpleAmount) || 0);
    const draftNet    = Math.max(0, draftGross - totalOutstanding);
    if (draftNet <= 0) {
      toast({ title: "Nothing to pay — check amounts", variant: "destructive" });
      return;
    }
    setPaying(true);
    try {
      const body: Record<string, unknown> = {
        subName: p.subName,
        idempotencyKey: crypto.randomUUID(),
        agreedOwed: owed > 0 ? owed : undefined,
        advanceIds: checkedOutstanding.map(a => a.id),
        ...(draft.paymentMethod    ? { paymentMethod: draft.paymentMethod }       : {}),
        ...(draft.paymentReference ? { paymentReference: draft.paymentReference } : {}),
      };
      if (isHourly) {
        const wh = parseFloat(workHours) || 0;
        const wr = parseFloat(workRate)  || 0;
        if (wh <= 0 || wr <= 0) { setPaying(false); return; }
        body.workHours = wh; body.workRate = wr;
        if ((parseFloat(travelHours) || 0) > 0) { body.travelHours = parseFloat(travelHours); body.travelRate = parseFloat(travelRate) || 0; }
        if (draftBonus > 0) { body.bonusAmount = draftBonus; if (draft.bonusNote) body.bonusNote = draft.bonusNote; }
        if (totalOutstanding > 0) { body.advanceAmount = totalOutstanding; body.advanceNote = checkedOutstanding.map(a => a.description).join(", "); }
      } else {
        const amt = parseFloat(simpleAmount) || 0;
        if (amt <= 0) { toast({ title: "Enter an amount", variant: "destructive" }); setPaying(false); return; }
        body.amount = amt;
        if (totalOutstanding > 0) { body.advanceAmount = totalOutstanding; body.advanceNote = checkedOutstanding.map(a => a.description).join(", "); }
      }
      const r = await fetch(`${BASE}/api/jobs/${jobId}/pay-worker/${p.subcontractorId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      await onRefresh();
      closeReview();
      setReleasedAdvanceCount(0);
      toast({ title: "Payment recorded", description: `${p.subName ?? "Sub"}: $${fmt(draftNet)} paid` });
    } catch { toast({ title: "Failed to record payment", variant: "destructive" }); }
    finally { setPaying(false); }
  }

  const borderColor = isHourly ? "border-l-blue-400" : isFixed ? "border-l-orange-400" : "border-l-purple-400";
  const badgeCls    = isHourly
    ? "text-blue-700 bg-blue-50 border-blue-200"
    : isFixed
      ? "text-orange-700 bg-orange-50 border-orange-200"
      : "text-purple-700 bg-purple-50 border-purple-200";
  const badgeLabel  = isHourly ? "Hourly" : isFixed ? "Fixed" : "%Alloc";

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-border overflow-hidden border-l-4 ${borderColor}`}>
      {/* Header row */}
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center flex-wrap gap-2 mb-0.5">
            <span className="text-base font-bold text-foreground">{p.subName ?? "Sub"}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeCls}`}>{badgeLabel}</span>
            {isFullyPaid && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">✓ Paid</span>}
            {isPartial   && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Partial</span>}
          </div>
          {isAlloc   && <p className="text-xs text-purple-600">{(p.allocationPct ?? 0).toFixed(1)}% of split pool</p>}
          {isPartial && <p className="text-xs text-muted-foreground">Paid ${fmt(paid)} · Balance ${fmt(balance)}</p>}
          {isFullyPaid && paid > 0 && <p className="text-xs text-emerald-600">Settled — ${fmt(paid)} paid</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xl font-black text-foreground">${fmt(owed)}</p>
          {isPartial && balance > 0 && <p className="text-xs text-orange-500">Due: ${fmt(balance)}</p>}
        </div>
      </div>

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
                    <input type="number" value={workHours} onChange={e => setWorkHours(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder="0.0" step="0.25" min="0" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Rate $/hr</label>
                    <input type="number" value={workRate} onChange={e => setWorkRate(e.target.value)}
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Bonus <span className="opacity-50">(opt)</span></label>
                    <input type="number" value={bonus} onChange={e => setBonus(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Bonus Note</label>
                    <input type="text" value={bonusNote} onChange={e => setBonusNote(e.target.value)}
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
              </div>
            ) : (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {isPartial ? "Amount to Pay Now" : "Payment Amount"}
                </label>
                <input type="number" value={simpleAmount} onChange={e => setSimpleAmount(e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="0.00" />
                {isAlloc && <p className="text-xs text-purple-600 mt-1">Calc: ${fmt(splitPool * ((p.allocationPct ?? 0) / 100))}</p>}
              </div>
            )}
          </div>

          <div className="h-px bg-border/50 mx-5" />

          {/* ── Advances ── */}
          <div className="px-5 pt-3 pb-3">
            {releasedAdvanceCount > 0 && (
              <div className="mb-3 flex items-start justify-between gap-2 px-3.5 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-amber-500 text-base leading-none mt-0.5">⚠</span>
                  <p className="text-xs font-semibold text-amber-800 leading-snug">
                    {releasedAdvanceCount === 1
                      ? "1 advance was released from the deleted payment — review deductions before recording the next payment."
                      : `${releasedAdvanceCount} advances were released from the deleted payment — review deductions before recording the next payment.`}
                  </p>
                </div>
                <button
                  onClick={() => setReleasedAdvanceCount(0)}
                  className="flex-shrink-0 text-amber-400 hover:text-amber-600 transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Advances</p>
              <button onClick={() => setShowAdvForm(v => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Advance
              </button>
            </div>

            {showAdvForm && (
              <div className="mb-3 p-4 bg-blue-50/70 rounded-xl border border-blue-100 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Amount</label>
                    <input type="number" value={advAmount} onChange={e => setAdvAmount(e.target.value)} autoFocus
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Date</label>
                    <input type="date" value={advDate} onChange={e => setAdvDate(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Description</label>
                  <input type="text" value={advDesc} onChange={e => setAdvDesc(e.target.value)}
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="e.g. Lunch advance, Fuel money..." />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddAdvance} disabled={savingAdv}
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {savingAdv ? "Saving..." : "Save Advance"}
                  </button>
                  <button onClick={() => { setShowAdvForm(false); setAdvAmount(""); setAdvDesc(""); }}
                    className="px-4 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted/20 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {outstanding.length === 0 && !showAdvForm ? (
              <p className="text-xs text-muted-foreground/70 italic">No outstanding advances</p>
            ) : outstanding.length > 0 ? (
              <div className="space-y-2">
                {outstanding.map(adv => {
                  const isChecked = checkedAdvanceIds.has(adv.id);
                  return (
                    <div key={adv.id} className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl border transition-colors ${isChecked ? "bg-amber-50 border-amber-100" : "bg-muted/10 border-border/50"}`}>
                      <div className="flex items-center gap-2.5 min-w-0 mr-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => setCheckedAdvanceIds(prev => {
                            const next = new Set(prev);
                            e.target.checked ? next.add(adv.id) : next.delete(adv.id);
                            return next;
                          })}
                          className="w-4 h-4 flex-shrink-0 accent-amber-500 cursor-pointer"
                        />
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold ${isChecked ? "text-foreground" : "text-muted-foreground"}`}>{adv.description}</p>
                          <p className="text-[10px] text-muted-foreground">{fmtDate(adv.advanceDate)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`text-sm font-bold ${isChecked ? "text-amber-700" : "text-muted-foreground/40 line-through"}`}>${fmt(adv.amount)}</span>
                        <button onClick={() => handleDeleteAdvance(adv.id)} className="text-muted-foreground/40 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {checkedOutstanding.length > 0 && (
                  <div className="flex items-center justify-between px-1 pt-1">
                    <span className="text-xs text-muted-foreground">
                      Deducting {checkedOutstanding.length < outstanding.length ? `${checkedOutstanding.length} of ${outstanding.length}` : "all"}
                    </span>
                    <span className="text-sm font-bold text-amber-600">−${fmt(totalOutstanding)}</span>
                  </div>
                )}
              </div>
            ) : null}

            {applied.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/40">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/50 mb-2">Previously Applied</p>
                {applied.map(adv => (
                  <div key={adv.id} className="flex items-center justify-between py-1 text-muted-foreground/60">
                    <span className="text-xs">{adv.description} · {fmtDate(adv.advanceDate)}</span>
                    <span className="text-xs line-through">${fmt(adv.amount)}</span>
                  </div>
                ))}
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
                {totalOutstanding > 0 && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    ${fmt(grossPay)} − ${fmt(totalOutstanding)} advances
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
                <button
                  onClick={openReview}
                  disabled={netToPay <= 0}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-muted text-white font-bold rounded-2xl text-base transition-colors disabled:opacity-50 shadow-sm"
                >
                  Review &amp; Record — ${fmt(netToPay)}
                </button>
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
                  {h.workHours != null && <p className="text-muted-foreground">Work: {h.workHours} hrs @ ${h.workRate}/hr = ${fmt((h.workHours || 0) * (h.workRate || 0))}</p>}
                  {(h.travelHours ?? 0) > 0 && <p className="text-muted-foreground">Travel: {h.travelHours} hrs @ ${h.travelRate}/hr = ${fmt((h.travelHours || 0) * (h.travelRate || 0))}</p>}
                  {(h.bonusAmount ?? 0) > 0 && <p className="text-emerald-600">Bonus: +${fmt(h.bonusAmount ?? 0)}{h.bonusNote ? ` (${h.bonusNote})` : ""}</p>}
                  {(h.advanceAmount ?? 0) > 0 && <p className="text-amber-600">Advance deducted: −${fmt(h.advanceAmount ?? 0)}{h.advanceNote ? ` (${h.advanceNote})` : ""}</p>}
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

              {checkedOutstanding.length > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-amber-600">Advance deduction ({checkedOutstanding.length})</span>
                  <span className="font-semibold text-amber-600">−${fmt(totalOutstanding)}</span>
                </div>
              )}

              {/* Bonus line — live from draft */}
              {isHourly && draftBonusAmt > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-600">Bonus</span>
                  <span className="font-semibold text-emerald-600">+${fmt(draftBonusAmt)}</span>
                </div>
              )}

              {checkedOutstanding.length > 0 && draftGrossPay > 0 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-2">
                  <span>Gross</span>
                  <span>${fmt(draftGrossPay)}</span>
                </div>
              )}
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
                  {totalOutstanding > 0 && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      ${fmt(draftGrossPay)} − ${fmt(totalOutstanding)} advances
                    </p>
                  )}
                </div>
                <p className="text-4xl font-black text-foreground">${fmt(draftNetToPay)}</p>
              </div>

              <button
                onClick={() => reviewDraft && submitPayment(reviewDraft)}
                disabled={paying || draftNetToPay <= 0}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-muted text-white font-bold rounded-2xl text-base transition-colors disabled:opacity-50 shadow-sm flex items-center justify-center gap-2"
              >
                {paying ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    Recording…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Confirm &amp; Record — ${fmt(draftNetToPay)}
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

  const jobId = parseInt(id ?? "0");

  const [job,      setJob]      = useState<Job | null>(null);
  const [profit,   setProfit]   = useState<JobProfit | null>(null);
  const [payments, setPayments] = useState<SubPaymentRow[]>([]);
  const [advances, setAdvances] = useState<SubAdvance[]>([]);
  const [loading,  setLoading]  = useState(true);

  const [ownerSplitPct,    setOwnerSplitPct]    = useState(50);
  const [taxReservePct,    setTaxReservePct]    = useState(25);
  const [growthReservePct, setGrowthReservePct] = useState(5);
  const [plStepOrder,      setPlStepOrder]      = useState<string[]>(["expenses", "labor", "growth"]);
  const [recordingDraw,    setRecordingDraw]    = useState(false);

  const normaliseAdvances = (rows: unknown[]) =>
    (rows as SubAdvance[]).map(a => ({
      ...a,
      amount: typeof a.amount === "string" ? parseFloat(a.amount) : a.amount,
    }));

  const refreshAll = useCallback(async () => {
    const [pRes, profRes, advRes] = await Promise.allSettled([
      fetch(`${BASE}/api/jobs/${jobId}/sub-payments`,  { credentials: "include" }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/api/jobs/${jobId}/profit`,        { credentials: "include" }).then(r => r.ok ? r.json() : null),
      fetch(`${BASE}/api/jobs/${jobId}/advances`,      { credentials: "include" }).then(r => r.ok ? r.json() : []),
    ]);
    if (pRes.status    === "fulfilled") setPayments(pRes.value as SubPaymentRow[]);
    if (profRes.status === "fulfilled" && profRes.value) setProfit(profRes.value as JobProfit);
    if (advRes.status  === "fulfilled") setAdvances(normaliseAdvances(advRes.value as unknown[]));
  }, [jobId]);

  useEffect(() => {
    const load = async () => {
      const [jobRes, pRes, profRes, advRes, settingsRes] = await Promise.allSettled([
        fetch(`${BASE}/api/jobs/${jobId}`,             { credentials: "include" }).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}/api/jobs/${jobId}/sub-payments`,{ credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${BASE}/api/jobs/${jobId}/profit`,      { credentials: "include" }).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}/api/jobs/${jobId}/advances`,    { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${BASE}/api/settings`,                  { credentials: "include" }).then(r => r.ok ? r.json() : null),
      ]);
      if (jobRes.status     === "fulfilled" && jobRes.value)     setJob(jobRes.value as Job);
      if (pRes.status       === "fulfilled")                     setPayments(pRes.value as SubPaymentRow[]);
      if (profRes.status    === "fulfilled" && profRes.value)    setProfit(profRes.value as JobProfit);
      if (advRes.status     === "fulfilled")                     setAdvances(normaliseAdvances(advRes.value as unknown[]));
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
  const jobIncome      = Math.max(0, revenue - jobExpenses);
  const afterWorkers   = Math.max(0, jobIncome - subLaborCost);
  const growthReserve  = afterWorkers * (growthReservePct / 100);
  const toSplit        = Math.max(0, afterWorkers - growthReserve);
  const ownerShare     = toSplit * (ownerSplitPct / 100);
  const taxReserve     = ownerShare * (taxReservePct / 100);
  const ownerTakeHome  = ownerShare - taxReserve;

  async function handleOwnerDraw() {
    if (ownerTakeHome <= 0.01) return;
    setRecordingDraw(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${jobId}/record-owner-draw`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ amount: ownerTakeHome, description: `Owner Draw — ${job?.title ?? `Job #${jobId}`}` }),
      });
      if (!r.ok) throw new Error();
      toast({ title: "Owner draw recorded", description: `$${fmt(ownerTakeHome)} logged` });
    } catch { toast({ title: "Failed to record draw", variant: "destructive" }); }
    finally { setRecordingDraw(false); }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-border/50 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => { if (window.history.length > 1) window.history.back(); else navigate("/jobs"); }}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4.5 h-4.5 text-foreground" />
        </button>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground leading-none mb-0.5">Sub Payment</p>
          <h1 className="text-base font-bold text-foreground truncate leading-tight">
            {loading ? "Loading…" : job?.title ?? `Job #${jobId}`}
          </h1>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 pb-24">

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

              {/* Configurable deduction steps — order from Settings P&L Layout */}
              <div className="divide-y divide-border/30">
                {(() => {
                  const stepDefs: Record<string, { label: string; amount: number }> = {
                    expenses: { label: "Materials & Expenses",                   amount: jobExpenses },
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
                    <span className="text-muted-foreground">Your Share ({ownerSplitPct}%)</span>
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
                splitPool={toSplit}
                advances={advances.filter(a => a.subcontractorId === p.subcontractorId)}
                onRefresh={refreshAll}
              />
            ))
          )}

          {/* ── Owner Draw ── */}
          {ownerTakeHome > 0.01 && (
            <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="px-5 pt-4 pb-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Owner Draw</p>
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
                  {recordingDraw ? "Recording…" : `Record Owner Draw — $${fmt(ownerTakeHome)}`}
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
