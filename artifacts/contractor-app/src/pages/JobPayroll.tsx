import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, DollarSign, ChevronDown, ChevronUp } from "lucide-react";
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
  revenue: number;
  collected: number;
  subLaborCost: number;
  materialCost: number;
  otherCost: number;
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

  // Hourly form
  const [workHours,   setWorkHours]   = useState(() => {
    const wh = p.totalWorkHours ?? 0;
    return wh > 0 ? wh.toFixed(2) : p.totalHours > 0 ? p.totalHours.toFixed(2) : "";
  });
  const [workRate,    setWorkRate]    = useState(() => String(p.hourlyRate ?? p.payRate ?? ""));
  const [travelHours, setTravelHours] = useState(() => {
    const th = p.totalTravelHours ?? 0;
    return th > 0 ? th.toFixed(2) : "";
  });
  const [travelRate,  setTravelRate]  = useState(() => String(p.travelRate ?? p.travelPayRate ?? ""));
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

  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [paying,         setPaying]         = useState(false);
  const [deletingPayId,  setDeletingPayId]  = useState<number | null>(null);

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

  async function handlePay() {
    if (netToPay <= 0) {
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
        ...(paymentMethod    ? { paymentMethod }                     : {}),
        ...(paymentReference ? { paymentReference }                  : {}),
      };
      if (isHourly) {
        const wh = parseFloat(workHours) || 0;
        const wr = parseFloat(workRate)  || 0;
        if (wh <= 0 || wr <= 0) { setPaying(false); return; }
        body.workHours = wh; body.workRate = wr;
        if ((parseFloat(travelHours) || 0) > 0) { body.travelHours = parseFloat(travelHours); body.travelRate = parseFloat(travelRate) || 0; }
        if (bonusAmt > 0) { body.bonusAmount = bonusAmt; if (bonusNote) body.bonusNote = bonusNote; }
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
      toast({ title: "Payment recorded", description: `${p.subName ?? "Sub"}: $${fmt(netToPay)} paid` });
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
                {/* Read-only work hours from tracker */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="py-2.5 px-3 bg-muted/20 rounded-xl">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Work Hours</p>
                    <p className="text-sm font-bold text-foreground">
                      {(parseFloat(workHours) || 0) > 0 ? `${parseFloat(workHours).toFixed(2)} hrs` : <span className="text-muted-foreground/50">—</span>}
                    </p>
                  </div>
                  <div className="py-2.5 px-3 bg-muted/20 rounded-xl">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Rate $/hr</p>
                    <p className="text-sm font-bold text-foreground">
                      {(parseFloat(workRate) || 0) > 0 ? `$${fmt(parseFloat(workRate))}` : <span className="text-muted-foreground/50">—</span>}
                    </p>
                  </div>
                </div>
                {workPay > 0 && <p className="text-xs font-medium text-blue-600">Work pay: ${fmt(workPay)}</p>}

                {/* Read-only travel hours from tracker — only shown when logged */}
                {(parseFloat(travelHours) || 0) > 0 && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="py-2.5 px-3 bg-muted/20 rounded-xl">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Travel Hours</p>
                        <p className="text-sm font-bold text-foreground">{parseFloat(travelHours).toFixed(2)} hrs</p>
                      </div>
                      <div className="py-2.5 px-3 bg-muted/20 rounded-xl">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Travel Rate $/hr</p>
                        <p className="text-sm font-bold text-foreground">${fmt(parseFloat(travelRate) || 0)}</p>
                      </div>
                    </div>
                    {travelPay > 0 && <p className="text-xs font-medium text-blue-600">Travel pay: ${fmt(travelPay)}</p>}
                  </>
                )}

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
            {isHourly && (parseFloat(workHours) || 0) <= 0 ? (
              <div className="w-full py-4 px-5 bg-amber-50 border border-amber-200 rounded-2xl text-center">
                <p className="text-sm font-semibold text-amber-700">Log hours in Sub Hours first</p>
                <p className="text-xs text-amber-600 mt-0.5">Hours will auto-fill once logged</p>
              </div>
            ) : (
              <button
                onClick={handlePay}
                disabled={paying || netToPay <= 0}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-muted text-white font-bold rounded-2xl text-base transition-colors disabled:opacity-50 shadow-sm"
              >
                {paying ? "Recording…" : `Record Payment — $${fmt(netToPay)}`}
              </button>
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

  const [ownerSplitPct,   setOwnerSplitPct]   = useState(50);
  const [taxReservePct,   setTaxReservePct]   = useState(25);
  const [growthReservePct, setGrowthReservePct] = useState(5);
  const [plStepOrder,     setPlStepOrder]     = useState<string[]>(["growth", "labor", "expenses"]);
  const [recordingDraw,   setRecordingDraw]   = useState(false);

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

  const revenue        = profit?.revenue       ?? 0;
  const subLaborCost   = profit?.subLaborCost  ?? 0;
  const materialCost   = profit?.materialCost  ?? 0;
  const otherCost      = profit?.otherCost     ?? 0;
  const growthReserve  = revenue * (growthReservePct / 100);
  const toSplit        = Math.max(0, revenue - growthReserve - subLaborCost - materialCost - otherCost);
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

              {/* Configurable deduction steps */}
              <div className="divide-y divide-border/30">
                {(() => {
                  const stepDefs: Record<string, { label: string; amount: number }> = {
                    growth:   { label: `Growth Reserve (${growthReservePct}%)`, amount: growthReserve },
                    labor:    { label: "Sub Labor",                              amount: subLaborCost },
                    expenses: { label: "Materials & Expenses",                   amount: materialCost + otherCost },
                  };
                  let running = revenue;
                  const rows: React.ReactNode[] = [];
                  plStepOrder.forEach(key => {
                    const step = stepDefs[key];
                    if (!step) return;
                    running = Math.max(0, running - step.amount);
                    if (step.amount < 0.005) return;
                    rows.push(
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
                  return rows;
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
