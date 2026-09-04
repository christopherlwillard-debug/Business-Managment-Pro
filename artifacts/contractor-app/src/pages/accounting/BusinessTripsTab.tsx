import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase, ChevronDown, ChevronUp, Plus,
  FileText, RotateCcw, AlertTriangle, ImageIcon, Archive, Download,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

interface BusinessTrip {
  id: number;
  destination: string;
  businessPurpose: string | null;
  startDate: string | null;
  endDate: string | null;
  jobId: number | null;
  jobTitle: string | null;
  status: string;
  closedAt: string | null;
  createdAt: string;
  receiptCount: number;
  totalAmount: number;
  mealTotal: number;
  deductibleMeals: number;
  missingReceipts: number;
  hotelTotal: number;
  airfareTotal: number;
  transportTotal: number;
  mealsHaveOvernightAnswered: number;
  mealsCount: number;
  rentalCarTotal: number;
  parkingTollTotal: number;
  potentiallyNonDeductibleMeals: number;
  mealsMissingReceipts: number;
  notes: string | null;
}

function money(n: number) { return `$${n.toFixed(2)}`; }
function formatDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function auditStatus(trip: BusinessTrip) {
  const issues: string[] = [];
  if (trip.missingReceipts > 0) issues.push(`${trip.missingReceipts} missing receipt${trip.missingReceipts > 1 ? "s" : ""}`);
  if (!trip.businessPurpose) issues.push("No business purpose");
  if (!trip.startDate) issues.push("No start date");
  if (!trip.endDate) issues.push("No end date");
  if (trip.receiptCount === 0) issues.push("No receipts logged");
  if (trip.mealsCount > 0 && trip.mealsHaveOvernightAnswered < trip.mealsCount) issues.push("Overnight travel unanswered on meals");
  return issues.length === 0
    ? { emoji: "🟢", label: "Audit Ready", color: "text-emerald-700 bg-emerald-50 border-emerald-200", issues: [] }
    : { emoji: "🟡", label: "Needs Attention", color: "text-amber-700 bg-amber-50 border-amber-200", issues };
}

function TripRow({ trip }: { trip: BusinessTrip }) {
  const [open, setOpen] = useState(false);
  const status = auditStatus(trip);

  const { data: receipts = [], isLoading: receiptsLoading } = useQuery<any[]>({
    queryKey: ["trip-receipts-acct", trip.id],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(`${API}/trips/${trip.id}/receipts`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load receipts");
      return res.json();
    },
    staleTime: 30_000,
  });

  const dateRange = [trip.startDate, trip.endDate]
    .filter(Boolean)
    .map(formatDate)
    .join(" → ");

  return (
    <div className="border border-border/50 rounded-2xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-muted/20 transition-colors bg-card"
        onClick={() => setOpen(v => !v)}
      >
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground">{trip.destination}</span>
            {dateRange && <span className="text-xs text-muted-foreground">{dateRange}</span>}
            {trip.jobTitle && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded-full font-medium">
                <Briefcase className="w-2.5 h-2.5" />{trip.jobTitle}
              </span>
            )}
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${status.color}`}>
              {status.emoji} {status.label}
            </span>
            {trip.status === "completed" && (
              <span className="inline-flex items-center text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium border border-gray-200">Completed</span>
            )}
          </div>
          {trip.businessPurpose && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{trip.businessPurpose}</p>
          )}
        </div>
        <div className="flex items-center gap-4 flex-shrink-0 text-right">
          {trip.mealTotal > 0 && (
            <div className="hidden sm:block">
              <p className="text-xs text-muted-foreground">Meals</p>
              <p className="text-xs font-semibold text-foreground">{money(trip.mealTotal)}</p>
              <p className="text-[11px] text-emerald-600">50%: {money(trip.deductibleMeals)}</p>
            </div>
          )}
          <div>
            <p className="text-sm font-bold text-foreground">{money(trip.totalAmount)}</p>
            <p className="text-[11px] text-muted-foreground">{trip.receiptCount} receipt{trip.receiptCount !== 1 ? "s" : ""}</p>
          </div>
          <a
            href={`${API}/trips/${trip.id}/packet.pdf`}
            download
            title="Export PDF audit packet"
            onClick={e => e.stopPropagation()}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors flex-shrink-0"
          >
            <Download className="w-4 h-4" />
          </a>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/30 bg-gray-50/60 px-5 py-4">
          {/* Audit checklist */}
          <div className="mb-4 space-y-1.5">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">IRS Audit Checklist</p>
            {[
              { label: "Destination", ok: !!trip.destination, value: trip.destination },
              { label: "Business purpose", ok: !!trip.businessPurpose, value: trip.businessPurpose },
              { label: "Start date", ok: !!trip.startDate, value: trip.startDate ? formatDate(trip.startDate) : null },
              { label: "End date", ok: !!trip.endDate, value: trip.endDate ? formatDate(trip.endDate) : null },
              { label: "Receipts documented", ok: trip.receiptCount > 0, value: `${trip.receiptCount} receipt${trip.receiptCount !== 1 ? "s" : ""}` },
              { label: "No missing receipts", ok: trip.missingReceipts === 0, value: trip.missingReceipts > 0 ? `${trip.missingReceipts} missing` : "All present" },
              ...(trip.mealsCount > 0 ? [{ label: "Overnight travel answered on meals", ok: trip.mealsHaveOvernightAnswered >= trip.mealsCount, value: `${trip.mealsHaveOvernightAnswered}/${trip.mealsCount}` }] : []),
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2.5 text-xs">
                <span className={item.ok ? "text-emerald-600" : "text-amber-500"}>
                  {item.ok ? "✓" : "○"}
                </span>
                <span className={`font-medium ${item.ok ? "text-foreground" : "text-muted-foreground"}`}>{item.label}</span>
                {item.value && <span className="text-muted-foreground ml-auto">{item.value}</span>}
              </div>
            ))}
            {/* Job link is optional — shown as advisory note, not blocking */}
            <div className="flex items-center gap-2.5 text-xs">
              <span className={trip.jobId ? "text-emerald-600" : "text-sky-500"}>
                {trip.jobId ? "✓" : "ℹ"}
              </span>
              <span className={`font-medium ${trip.jobId ? "text-foreground" : "text-muted-foreground"}`}>Linked to a job (optional)</span>
              <span className="text-muted-foreground ml-auto">{trip.jobTitle ?? (trip.jobId ? `Job #${trip.jobId}` : "Not linked")}</span>
            </div>
          </div>

          {/* Meal deduction summary */}
          {trip.mealTotal > 0 && (
            <div className="mb-4">
              <div className="grid grid-cols-3 gap-2 text-center mb-2">
                <div className="bg-white rounded-xl border border-border/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Total Meals</p>
                  <p className="text-sm font-bold text-gray-900">{money(trip.mealTotal)}</p>
                </div>
                <div className="bg-white rounded-xl border border-border/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Deductible (50%)</p>
                  <p className="text-sm font-bold text-emerald-700">{money(trip.deductibleMeals)}</p>
                </div>
                <div className="bg-white rounded-xl border border-border/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Non-Deductible</p>
                  <p className="text-sm font-bold text-gray-400">{money(trip.mealTotal - trip.deductibleMeals)}</p>
                </div>
              </div>
              {(trip.potentiallyNonDeductibleMeals > 0 || trip.mealsMissingReceipts > 0) && (
                <div className="flex gap-2 flex-wrap">
                  {trip.potentiallyNonDeductibleMeals > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      ⚠ {trip.potentiallyNonDeductibleMeals} potentially non-deductible
                    </span>
                  )}
                  {trip.mealsMissingReceipts > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                      ⚠ {trip.mealsMissingReceipts} meal receipt{trip.mealsMissingReceipts > 1 ? "s" : ""} missing
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Trip Notes */}
          {trip.notes?.trim() && (
            <div className="mb-4">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Trip Notes</p>
              <p className="text-xs text-foreground whitespace-pre-wrap bg-white border border-border/40 rounded-xl px-3 py-2.5 leading-relaxed">{trip.notes.trim()}</p>
            </div>
          )}

          {/* Receipt list */}
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Receipts</p>
          {receiptsLoading ? (
            <p className="text-xs text-muted-foreground italic animate-pulse">Loading receipts…</p>
          ) : receipts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No receipts yet — add them from the Expenses page.</p>
          ) : (
            <div className="space-y-1.5">
              {receipts.map((r: any) => (
                <div key={r.id} className="flex items-start justify-between gap-3 bg-white rounded-xl px-3 py-2 border border-border/40 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground text-xs">{r.description}</span>
                      {r.vendor && <span className="text-[11px] text-muted-foreground">· {r.vendor}</span>}
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">{r.category}</span>
                      {r.receiptStatus === "missing" && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
                          <AlertTriangle className="w-2.5 h-2.5" /> Missing receipt
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {r.date}
                      {r.paidBy ? ` · Paid by: ${r.paidBy}` : ""}
                      {r.numPeople ? ` · ${r.numPeople} people` : ""}
                    </p>
                    {r.deductibleAmount != null && r.category?.toLowerCase() === "meals" && (
                      <p className="text-[11px] text-emerald-700 mt-0.5">50% deductible: {money(r.deductibleAmount ?? 0)}</p>
                    )}
                    {r.receiptMissingExplanation && (
                      <p className="text-[11px] text-amber-700 mt-0.5 italic">Note: {r.receiptMissingExplanation}</p>
                    )}
                    {r.receiptUrl && (
                      <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-primary font-semibold hover:underline mt-0.5">
                        <ImageIcon className="w-2.5 h-2.5" /> View Receipt
                      </a>
                    )}
                  </div>
                  <span className="text-sm font-bold text-foreground flex-shrink-0">{money(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BusinessTripsTab({ year }: { year: number }) {
  const { data: trips = [], isLoading } = useQuery<BusinessTrip[]>({
    queryKey: ["business-trips-acct", year],
    queryFn: async () => {
      const res = await fetch(`${API}/trips?year=${year}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load trips");
      return res.json();
    },
    staleTime: 30_000,
  });

  const openTrips = trips.filter(t => t.status === "open");
  const completedTrips = trips.filter(t => t.status === "completed");
  const archivedTrips = trips.filter(t => t.status === "archived");
  const [showArchived, setShowArchived] = useState(false);
  const activeTrips = trips.filter(t => t.status !== "archived");
  // Totals include ALL trips (archived ones are real expenses, they should count toward the year's spend)
  const totalSpend = trips.reduce((s, t) => s + t.totalAmount, 0);
  const totalMeals = trips.reduce((s, t) => s + t.mealTotal, 0);
  const deductibleMeals = trips.reduce((s, t) => s + t.deductibleMeals, 0);
  const needsAttentionCount = activeTrips.filter(t => auditStatus(t).issues.length > 0).length;
  const allReady = trips.length > 0 && needsAttentionCount === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Business Trips — {year}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">IRS-ready audit folders for out-of-town work.</p>
        </div>
        <a
          href={`${BASE}/?path=expenses`}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> New Trip
        </a>
      </div>

      {/* Summary cards */}
      {trips.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card border border-border/50 rounded-2xl px-4 py-3 text-center">
            <p className="text-2xl font-bold text-foreground">{trips.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Trips</p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl px-4 py-3 text-center">
            <p className="text-2xl font-bold text-foreground">{money(totalSpend)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Travel Spend</p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl px-4 py-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{money(deductibleMeals)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Deductible Meals</p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl px-4 py-3 text-center">
            <p className="text-2xl font-bold">{allReady ? "🟢" : "🟡"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{allReady ? "Active Trips Ready" : "Needs Attention"}</p>
          </div>
        </div>
      )}
      {archivedTrips.length > 0 && (
        <p className="text-xs text-muted-foreground -mt-3">
          Archived trips remain in the historical spend and meal totals; audit-readiness checks apply only to active trips.
        </p>
      )}

      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground animate-pulse text-sm">Loading trips…</div>
      ) : trips.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No business trips for {year}</p>
          <p className="text-xs mt-1">Create one from the Expenses page to start building IRS-ready audit folders.</p>
        </div>
      ) : (
        <>
          {openTrips.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Open Trips ({openTrips.length})
              </h3>
              {openTrips.map(t => <TripRow key={t.id} trip={t} />)}
            </div>
          )}
          {completedTrips.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-muted-foreground" /> Completed ({completedTrips.length})
              </h3>
              {completedTrips.map(t => <TripRow key={t.id} trip={t} />)}
            </div>
          )}
          {archivedTrips.length > 0 && (
            <div className="rounded-2xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowArchived(v => !v)}
                className="w-full flex items-center gap-2 px-5 py-3 text-sm text-muted-foreground hover:bg-muted/20 transition-colors bg-gray-50/60"
              >
                {showArchived ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                <Archive className="w-4 h-4" />
                <span className="font-medium">Archived ({archivedTrips.length})</span>
                <span className="text-xs ml-1">— hidden from audit summary</span>
              </button>
              {showArchived && (
                <div className="border-t border-gray-200 divide-y divide-gray-100">
                  {archivedTrips.map(t => <TripRow key={t.id} trip={t} />)}
                </div>
              )}
            </div>
          )}

          {/* Meals deduction note */}
          {totalMeals > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">
              <p className="text-sm font-bold text-emerald-800 mb-1">Meal Deduction Summary</p>
              <p className="text-xs text-emerald-700">
                Total meals: <strong>{money(totalMeals)}</strong> ·
                Deductible (50%): <strong>{money(deductibleMeals)}</strong> ·
                Non-deductible: <strong>{money(totalMeals - deductibleMeals)}</strong>
              </p>
              <p className="text-[11px] text-emerald-600 mt-1.5">
                Per IRS Publication 463, business meals are generally 50% deductible. The deductible amounts above flow into your Schedule C Line 24b automatically.
              </p>
            </div>
          )}

          {/* Category Breakdown Summary */}
          {(() => {
            const hotelTotal = trips.reduce((s, t) => s + (t.hotelTotal ?? 0), 0);
            const airfareTotal = trips.reduce((s, t) => s + (t.airfareTotal ?? 0), 0);
            const rentalCarTotal = trips.reduce((s, t) => s + (t.rentalCarTotal ?? 0), 0);
            const parkingTollTotal = trips.reduce((s, t) => s + (t.parkingTollTotal ?? 0), 0);
            const transportTotal = trips.reduce((s, t) => s + (t.transportTotal ?? 0), 0);
            const otherTransport = Math.max(0, transportTotal - rentalCarTotal);
            const cats = [
              { label: "Hotel/Lodging", amount: hotelTotal, color: "text-blue-700 bg-blue-50 border-blue-100" },
              { label: "Meals", amount: totalMeals, color: "text-amber-700 bg-amber-50 border-amber-100" },
              { label: "Airfare", amount: airfareTotal, color: "text-sky-700 bg-sky-50 border-sky-100" },
              { label: "Rental Car", amount: rentalCarTotal, color: "text-violet-700 bg-violet-50 border-violet-100" },
              { label: "Parking/Tolls", amount: parkingTollTotal, color: "text-teal-700 bg-teal-50 border-teal-100" },
              { label: "Taxi/Rideshare", amount: otherTransport, color: "text-indigo-700 bg-indigo-50 border-indigo-100" },
              { label: "Other", amount: Math.max(0, totalSpend - hotelTotal - totalMeals - airfareTotal - transportTotal - parkingTollTotal), color: "text-gray-600 bg-gray-50 border-gray-100" },
            ].filter(c => c.amount > 0);
            if (cats.length === 0) return null;
            return (
              <div className="rounded-2xl border border-border/50 bg-card px-5 py-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Spend by Category</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {cats.map(c => (
                    <div key={c.label} className={`rounded-xl border px-3 py-2 text-center ${c.color}`}>
                      <p className="text-sm font-bold">{money(c.amount)}</p>
                      <p className="text-[11px] mt-0.5">{c.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Needs Attention list */}
          {(() => {
            const attention = activeTrips.filter(t => auditStatus(t).issues.length > 0);
            if (attention.length === 0) return null;
            return (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-sm font-bold text-amber-800">Needs Attention ({attention.length})</p>
                </div>
                <div className="space-y-2">
                  {attention.map(t => {
                    const s = auditStatus(t);
                    return (
                      <div key={t.id} className="bg-white rounded-xl border border-amber-100 px-3 py-2.5">
                        <p className="text-xs font-semibold text-foreground">{t.destination}</p>
                        <ul className="mt-1 space-y-0.5">
                          {s.issues.map(issue => (
                            <li key={issue} className="text-[11px] text-amber-700 flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
                              {issue}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
