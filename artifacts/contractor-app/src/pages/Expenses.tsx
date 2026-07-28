import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  useListExpenses, useCreateExpense, useUploadExpenseReceipt, useListJobs, useListSubcontractors,
} from "@workspace/api-client-react";
import type { RecurringExpense, RecurringExpenseFrequency } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate, localDateString } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import {
  Receipt, Plus, Upload, ImageIcon, X, FileText,
  ExternalLink, Store, ChevronDown, Eye, Trash2, AlertTriangle,
  Calendar, Tag, Briefcase, DollarSign, StickyNote, HardHat,
  RotateCcw, Pause, Play, ChevronUp, Pencil, Maximize2, Download, EyeOff, Search, Archive,
  Link2, Unlink2, Navigation, Camera,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "wouter";
import { ExpenseImportDialog } from "@/components/ExpenseImportDialog";
import { useGoogleAuth } from "@/contexts/GoogleAuth";
import { openDrivePicker } from "@/lib/googleDrivePicker";

const CATEGORIES = [
  "Materials",
  "Advertising",
  "Fuel/Travel",
  "Parking/Tolls",
  "Subcontractor",
  "Insurance",
  "Professional Services",
  "Office/Admin",
  "Rent/Lease",
  "Repairs/Maintenance",
  "Tools/Equipment",
  "Travel/Lodging",
  "Hotel/Lodging",
  "Meals",
  "Airfare",
  "Rental Car",
  "Taxi/Rideshare",
  "Campground/RV Site",
  "Other Travel",
  "Utilities",
  "Other",
  "Owner Draw",
];

const CATEGORY_LABELS: Record<string, string> = {
  "Materials":             "Materials",
  "Advertising":           "Advertising",
  "Fuel/Travel":           "Fuel/Travel",
  "Parking/Tolls":         "Parking/Tolls",
  "Subcontractor":         "Subcontractor",
  "Insurance":             "Insurance",
  "Professional Services": "Professional Services",
  "Office/Admin":          "Office/Admin",
  "Rent/Lease":            "Rent/Lease",
  "Repairs/Maintenance":   "Repairs/Maintenance",
  "Tools/Equipment":       "Tools/Equipment",
  "Travel/Lodging":        "Travel/Lodging",
  "Hotel/Lodging":         "Hotel/Lodging",
  "Meals":                 "Meals (50% deductible)",
  "Airfare":               "Airfare",
  "Rental Car":            "Rental Car",
  "Taxi/Rideshare":        "Taxi/Rideshare",
  "Campground/RV Site":    "Campground/RV Site",
  "Other Travel":          "Other Travel",
  "Utilities":             "Utilities",
  "Other":                 "Other",
  "Owner Draw":            "Owner Draw (personal distribution)",
};

export const SCHEDULE_C_LINES: Record<string, string> = {
  "Materials":             "Line 4",
  "Advertising":           "Line 8",
  "Fuel/Travel":           "Line 9",
  "Parking/Tolls":         "Line 9",
  "Subcontractor":         "Line 11",
  "Insurance":             "Line 15",
  "Professional Services": "Line 17",
  "Office/Admin":          "Line 18",
  "Rent/Lease":            "Line 20",
  "Repairs/Maintenance":   "Line 21",
  "Tools/Equipment":       "Line 22",
  "Travel/Lodging":        "Line 24a",
  "Hotel/Lodging":         "Line 24a",
  "Meals":                 "Line 24b",
  "Airfare":               "Line 24a",
  "Rental Car":            "Line 24a",
  "Taxi/Rideshare":        "Line 24a",
  "Campground/RV Site":    "Line 24a",
  "Other Travel":          "Line 24a",
  "Utilities":             "Line 25",
  "Other":                 "Line 27",
};

const TRAVEL_CATEGORIES_LC = [
  "fuel/travel", "travel/lodging", "meals", "parking/tolls",
  "hotel/lodging", "airfare", "rental car", "taxi/rideshare",
  "campground/rv site", "other travel",
];
function isTravelCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  return TRAVEL_CATEGORIES_LC.includes(category.trim().toLowerCase());
}
function isMealCategory(category: string | null | undefined): boolean {
  return category?.trim().toLowerCase() === "meals";
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

function formatJobLabel(j: any): string {
  const loc = j.locationName || j.city;
  const parts: string[] = [];
  if (loc) parts.push(loc);
  if (j.startDate) {
    const d = new Date(j.startDate + "T00:00:00");
    parts.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  }
  return parts.length ? `${j.title} — ${parts.join(" · ")}` : j.title;
}

const FREQUENCY_LABELS: Record<RecurringExpenseFrequency, string> = {
  weekly:    "Weekly",
  biweekly:  "Bi-weekly",
  monthly:   "Monthly",
  quarterly: "Quarterly",
  yearly:    "Yearly",
};

const FREQUENCY_COLORS: Record<RecurringExpenseFrequency, string> = {
  weekly:    "bg-purple-100 text-purple-700",
  biweekly:  "bg-indigo-100 text-indigo-700",
  monthly:   "bg-blue-100 text-blue-700",
  quarterly: "bg-teal-100 text-teal-700",
  yearly:    "bg-green-100 text-green-700",
};

const MONTHLY_MULTIPLIER: Record<RecurringExpenseFrequency, number> = {
  weekly:    52 / 12,
  biweekly:  26 / 12,
  monthly:   1,
  quarterly: 1 / 3,
  yearly:    1 / 12,
};

function toMonthlyRate(amount: number, frequency: RecurringExpenseFrequency): number {
  return amount * (MONTHLY_MULTIPLIER[frequency] ?? 1);
}

// Resolve which business an expense belongs to, checking businessId first then businessLine slug.
function getExpenseBiz(exp: any, businesses: any[]): { name: string; slug: string; idx: number } | null {
  const biz = exp?.businessId
    ? businesses.find((b: any) => b.id === exp.businessId)
    : exp?.businessLine
      ? businesses.find((b: any) => b.slug === exp.businessLine)
      : null;
  if (!biz) return null;
  return { name: biz.name, slug: biz.slug, idx: businesses.findIndex((b: any) => b.id === biz.id) };
}

const BIZ_BADGE_COLORS = [
  "bg-blue-50 text-blue-700 border-blue-200",
  "bg-amber-50 text-amber-700 border-amber-200",
  "bg-violet-50 text-violet-700 border-violet-200",
  "bg-emerald-50 text-emerald-700 border-emerald-200",
];

// ─── Recurring expense hooks ───────────────────────────────────────────────────
function useRecurringExpenses(businessId?: number | null) {
  return useQuery<RecurringExpense[]>({
    queryKey: ["recurring-expenses", businessId ?? null],
    queryFn: async () => {
      const url = businessId
        ? `${API}/recurring-expenses?businessId=${businessId}`
        : `${API}/recurring-expenses`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load recurring expenses");
      return res.json();
    },
    staleTime: 30_000,
  });
}

function useCreateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`${API}/recurring-expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create recurring expense");
      return res.json() as Promise<RecurringExpense>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-expenses"] });
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
    },
  });
}

function useUpdateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await fetch(`${API}/recurring-expenses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update recurring expense");
      return res.json() as Promise<RecurringExpense>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring-expenses"] }),
  });
}

function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API}/recurring-expenses/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete recurring expense");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-expenses"] });
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
    },
  });
}

// ─── Vendor hooks (direct, not generated) ─────────────────────────────────────
interface Vendor { id: number; name: string; category: string | null; }

function useVendors() {
  return useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn: async () => {
      const res = await fetch(`${API}/vendors`);
      if (!res.ok) throw new Error("Failed to load vendors");
      return res.json();
    },
    staleTime: 30_000,
  });
}

function useSaveVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${API}/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to save vendor");
      return res.json() as Promise<Vendor>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
  });
}

function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API}/expenses/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete expense");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
      qc.invalidateQueries({ queryKey: ["/api/subcontractors"] });
    },
  });
}

function useDeleteSpr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sprId: number) => {
      const res = await fetch(`${API}/expenses/spr/${sprId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete payment record");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
    },
  });
}

function useUpdateExpense() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await fetch(`${API}/expenses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update expense");
      return res.json();
    },
  });
}

function useLinkExpenseToTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tripId }: { id: number; tripId: number | null }) => {
      const res = await fetch(`${API}/expenses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? "Failed to link expense");
      }
      return res.json();
    },
    onSuccess: (_data, { tripId }) => {
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
      qc.invalidateQueries({ queryKey: ["business-trips"] });
      if (tripId) qc.invalidateQueries({ queryKey: ["trip-receipts", tripId] });
    },
  });
}

function TripLinkButton({
  exp,
  trips,
  onLink,
  onUnlink,
  isPending,
}: {
  exp: any;
  trips: BusinessTrip[];
  onLink: (tripId: number) => void;
  onUnlink: () => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const linkedTripId: number | null = exp.tripId ?? null;
  const linkedTrip = linkedTripId ? trips.find(t => t.id === linkedTripId) ?? null : null;
  const openTrips = trips.filter(t => t.status === "open");

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (linkedTrip) {
    return (
      <div className="flex items-center gap-1 mt-0.5" onClick={e => e.stopPropagation()}>
        <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-sky-200 flex-shrink-0">
          <Navigation className="w-2.5 h-2.5" /> {linkedTrip.destination}
        </span>
        <button
          type="button"
          onClick={() => onUnlink()}
          disabled={isPending}
          className="text-[9px] text-muted-foreground hover:text-destructive font-medium transition-colors disabled:opacity-50 flex items-center gap-0.5"
          title="Remove from trip"
        >
          <Unlink2 className="w-2.5 h-2.5" /> Unlink
        </button>
      </div>
    );
  }

  if (!isTravelCategory(exp.category) && !isMealCategory(exp.category)) return null;

  return (
    <div ref={ref} className="relative mt-0.5" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={isPending}
        className="inline-flex items-center gap-0.5 text-[9px] text-sky-600 hover:text-sky-800 font-semibold transition-colors disabled:opacity-50"
      >
        <Link2 className="w-2.5 h-2.5" /> Link to Trip
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl border border-border shadow-xl min-w-[220px] max-w-[280px] overflow-hidden">
          <div className="px-3 py-2 border-b border-border/40 bg-muted/30">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Select a Trip</p>
          </div>
          {openTrips.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground italic">No open trips. Create one above.</p>
          ) : (
            <div className="max-h-52 overflow-y-auto divide-y divide-border/30">
              {openTrips.map(trip => (
                <button
                  key={trip.id}
                  type="button"
                  onClick={() => { onLink(trip.id); setOpen(false); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-sky-50 transition-colors"
                >
                  <p className="text-xs font-semibold text-foreground">{trip.destination}</p>
                  {trip.businessPurpose && (
                    <p className="text-[10px] text-muted-foreground truncate">{trip.businessPurpose}</p>
                  )}
                  {(trip.startDate || trip.endDate) && (
                    <p className="text-[10px] text-muted-foreground">
                      {trip.startDate ?? "?"} → {trip.endDate ?? "?"}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Business Trip hooks ───────────────────────────────────────────────────────
export interface BusinessTrip {
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
}

function useTrips(year?: string) {
  return useQuery<BusinessTrip[]>({
    queryKey: ["business-trips", year ?? "all"],
    queryFn: async () => {
      const url = year ? `${API}/trips?year=${year}` : `${API}/trips`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load trips");
      return res.json();
    },
    staleTime: 30_000,
  });
}

function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`${API}/trips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create trip");
      return res.json() as Promise<BusinessTrip>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["business-trips"] }),
  });
}

function useUpdateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await fetch(`${API}/trips/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update trip");
      return res.json() as Promise<BusinessTrip>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["business-trips"] }),
  });
}

function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API}/trips/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete trip");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["business-trips"] });
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
    },
  });
}

function useTripReceipts(tripId: number | null) {
  return useQuery<any[]>({
    queryKey: ["trip-receipts", tripId],
    enabled: !!tripId,
    queryFn: async () => {
      const res = await fetch(`${API}/trips/${tripId}/receipts`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load receipts");
      return res.json();
    },
    staleTime: 15_000,
  });
}

// ─── Business Trips Section ────────────────────────────────────────────────────
const PAID_BY_OPTIONS = [
  "Company Card",
  "Personal Card",
  "Cash",
  "Company Check",
  "ACH/Bank Transfer",
  "Other",
];

function auditStatus(trip: BusinessTrip): { label: string; color: string; description: string } {
  const issues: string[] = [];
  if (trip.missingReceipts > 0) issues.push(`${trip.missingReceipts} missing receipt${trip.missingReceipts > 1 ? "s" : ""}`);
  if (!trip.businessPurpose) issues.push("No business purpose");
  if (!trip.startDate) issues.push("No start date");
  if (!trip.endDate) issues.push("No end date");
  if (trip.receiptCount === 0) issues.push("No receipts logged");
  if ((trip as any).mealsCount > 0 && (trip as any).mealsHaveOvernightAnswered < (trip as any).mealsCount) issues.push("Overnight travel unanswered on meals");
  if (issues.length === 0) {
    return { label: "Audit Ready", color: "text-emerald-700 bg-emerald-50 border-emerald-200", description: "All required documentation is in order" };
  }
  return { label: "Needs Attention", color: "text-amber-700 bg-amber-50 border-amber-200", description: issues.join(" · ") };
}

function TripReceiptsPanel({
  trip, onAddReceipt, onClose,
}: {
  trip: BusinessTrip;
  onAddReceipt: (tripId: number, tripPurpose: string) => void;
  onClose: () => void;
}) {
  const { data: receipts = [], isLoading } = useTripReceipts(trip.id);
  const money = (n: number) => `$${n.toFixed(2)}`;
  const status = auditStatus(trip);

  return (
    <div className="border-t border-border/30 bg-gray-50/60">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${status.color}`}>
              {status.label === "Audit Ready" ? "🟢" : "🟡"} {status.label}
            </span>
          </div>
          {trip.status === "open" && (
            <button
              onClick={() => onAddReceipt(trip.id, trip.businessPurpose ?? "")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Add Receipt
            </button>
          )}
          {trip.status !== "open" && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
              {trip.status === "completed" ? "Completed — Reopen to add receipts" : "Archived"}
            </span>
          )}
        </div>

        {/* IRS Audit Checklist */}
        <div className="mb-4 space-y-1.5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">IRS Audit Checklist</p>
          {[
            { label: "Destination", ok: !!trip.destination, value: trip.destination },
            { label: "Business purpose", ok: !!trip.businessPurpose, value: trip.businessPurpose },
            { label: "Start date", ok: !!trip.startDate, value: trip.startDate ?? null },
            { label: "End date", ok: !!trip.endDate, value: trip.endDate ?? null },
            { label: "Receipts documented", ok: trip.receiptCount > 0, value: `${trip.receiptCount} receipt${trip.receiptCount !== 1 ? "s" : ""}` },
            { label: "No missing receipts", ok: trip.missingReceipts === 0, value: trip.missingReceipts > 0 ? `${trip.missingReceipts} unproven` : "All proven" },
            ...((trip as any).mealsCount > 0 ? [{ label: "Overnight travel answered on meals", ok: (trip as any).mealsHaveOvernightAnswered >= (trip as any).mealsCount, value: `${(trip as any).mealsHaveOvernightAnswered}/${(trip as any).mealsCount}` }] : []),
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              <span className={item.ok ? "text-emerald-600 font-bold" : "text-amber-500 font-bold"}>{item.ok ? "✓" : "○"}</span>
              <span className={`${item.ok ? "text-foreground" : "text-muted-foreground"}`}>{item.label}</span>
              {item.value && <span className="text-muted-foreground ml-auto text-[11px]">{item.value}</span>}
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs">
            <span className={trip.jobId ? "text-emerald-600 font-bold" : "text-sky-500 font-bold"}>{trip.jobId ? "✓" : "ℹ"}</span>
            <span className={trip.jobId ? "text-foreground" : "text-muted-foreground"}>Linked to a job (optional)</span>
            <span className="text-muted-foreground ml-auto text-[11px]">{trip.jobTitle ?? (trip.jobId ? `Job #${trip.jobId}` : "Not linked")}</span>
          </div>
        </div>

        {trip.mealTotal > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
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
        )}

        {isLoading ? (
          <p className="text-xs text-muted-foreground italic animate-pulse py-3">Loading receipts…</p>
        ) : receipts.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-3">No receipts logged yet. Use "Add Receipt" to document expenses for this trip.</p>
        ) : (
          <div className="space-y-1.5">
            {receipts.map((r: any) => (
              <div key={r.id} className="flex items-start justify-between gap-3 bg-white rounded-xl px-3 py-2 border border-border/40 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground text-xs">{r.description}</span>
                    {r.vendor && <span className="text-[11px] text-muted-foreground">· {r.vendor}</span>}
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${CATEGORY_COLORS[r.category] ?? "bg-gray-100 text-gray-600"}`}>{r.category}</span>
                    {r.receiptStatus === "missing" && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">⚠ Missing receipt</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{r.date}{r.paidBy ? ` · Paid by: ${r.paidBy}` : ""}{r.numPeople ? ` · ${r.numPeople} people` : ""}</p>
                  {isMealCategory(r.category) && r.deductibleAmount != null && (
                    <p className="text-[11px] text-emerald-700 mt-0.5">50% deductible: ${(r.deductibleAmount ?? 0).toFixed(2)}</p>
                  )}
                  {r.receiptUrl && (
                    <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary font-semibold hover:underline mt-0.5">
                      <ImageIcon className="w-2.5 h-2.5" /> Receipt
                    </a>
                  )}
                </div>
                <span className="text-sm font-bold text-foreground flex-shrink-0">{money(r.amount)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border/30 mt-3">
          <p className="text-xs font-semibold text-muted-foreground">
            {trip.receiptCount} receipt{trip.receiptCount !== 1 ? "s" : ""} · {money(trip.totalAmount)} total
          </p>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground font-medium">Collapse</button>
        </div>
      </div>
    </div>
  );
}

function BusinessTripsSection({
  year,
  jobs,
  onAddReceipt,
}: {
  year: string;
  jobs: any[];
  onAddReceipt: (tripId: number, tripPurpose: string, tripJobId: number | null) => void;
}) {
  const { data: trips = [], isLoading } = useTrips(year);
  const createTrip = useCreateTrip();
  const updateTrip = useUpdateTrip();
  const deleteTrip = useDeleteTrip();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sectionOpen, setSectionOpen] = useState(true);
  const [newTripOpen, setNewTripOpen] = useState(false);
  const [newDest, setNewDest] = useState("");
  const [newPurpose, setNewPurpose] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newJobId, setNewJobId] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<BusinessTrip | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Auto-open new trip form when navigated from a job card with prefill_jobId param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefillJobId = params.get("prefill_jobId");
    if (prefillJobId) {
      setNewJobId(prefillJobId);
      setNewTripOpen(true);
      setSectionOpen(true);
      const clean = new URL(window.location.href);
      clean.searchParams.delete("prefill_jobId");
      window.history.replaceState({}, "", clean.toString());
    }
  }, []);

  function toggleTrip(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleCreateTrip(e: React.FormEvent) {
    e.preventDefault();
    if (!newDest.trim()) return;
    try {
      await createTrip.mutateAsync({
        destination: newDest.trim(),
        businessPurpose: newPurpose.trim() || undefined,
        startDate: newStart || undefined,
        endDate: newEnd || undefined,
        jobId: newJobId ? parseInt(newJobId) : undefined,
      });
      setNewTripOpen(false);
      setNewDest(""); setNewPurpose(""); setNewStart(""); setNewEnd(""); setNewJobId("");
      toast({ title: "Trip created", description: "Add receipts to start building the audit folder." });
    } catch {
      toast({ title: "Error", description: "Could not create trip.", variant: "destructive" });
    }
  }

  async function handleClose(trip: BusinessTrip) {
    await updateTrip.mutateAsync({ id: trip.id, data: { status: "completed" } });
    qc.invalidateQueries({ queryKey: ["trip-receipts", trip.id] });
  }

  async function handleReopen(trip: BusinessTrip) {
    await updateTrip.mutateAsync({ id: trip.id, data: { status: "open" } });
  }

  async function handleArchive(trip: BusinessTrip) {
    await updateTrip.mutateAsync({ id: trip.id, data: { status: "archived" } });
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    await deleteTrip.mutateAsync(deleteConfirm.id);
    setDeleteConfirm(null);
    toast({ title: "Trip deleted" });
  }

  const activeTrips = [...trips]
    .filter(t => t.status !== "archived")
    .sort((a, b) => {
      const statusOrder = { open: 0, completed: 1 };
      const sa = statusOrder[a.status as keyof typeof statusOrder] ?? 1;
      const sb = statusOrder[b.status as keyof typeof statusOrder] ?? 1;
      if (sa !== sb) return sa - sb;
      return (b.startDate ?? b.createdAt).localeCompare(a.startDate ?? a.createdAt);
    });
  const archivedTrips = [...trips]
    .filter(t => t.status === "archived")
    .sort((a, b) => (b.startDate ?? b.createdAt).localeCompare(a.startDate ?? a.createdAt));
  const sortedTrips = activeTrips;

  return (
    <div className="rounded-2xl border border-border/50 shadow-md overflow-hidden bg-card">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors select-none"
        onClick={() => setSectionOpen(o => !o)}
      >
        <div className="flex items-center gap-2.5">
          {sectionOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          <Briefcase className="w-4 h-4 text-blue-600" />
          <span className="font-bold text-foreground">Business Trips</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{trips.length} {trips.length === 1 ? "trip" : "trips"}</span>
          <span className="text-xs text-muted-foreground italic">Audit-ready receipt folders for out-of-town work</span>
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setNewTripOpen(o => !o); setSectionOpen(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> New Trip
        </button>
      </div>

      {sectionOpen && (
        <>
          {/* New trip form */}
          {newTripOpen && (
            <div className="border-t border-border/30 bg-blue-50/60 px-5 py-4">
              <p className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <Plus className="w-4 h-4" /> New Business Trip
              </p>
              <form onSubmit={handleCreateTrip} className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Destination *</label>
                    <input
                      value={newDest} onChange={e => setNewDest(e.target.value)} required
                      placeholder="e.g. Louisville, KY"
                      className="w-full px-3 py-1.5 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Business Purpose</label>
                    <input
                      value={newPurpose} onChange={e => setNewPurpose(e.target.value)}
                      placeholder="e.g. Site installation for ABC job"
                      className="w-full px-3 py-1.5 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Start Date</label>
                    <input type="date" value={newStart} onChange={e => setNewStart(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">End Date</label>
                    <input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium mb-1">Linked Job (optional)</label>
                    <select value={newJobId} onChange={e => setNewJobId(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20">
                      <option value="">— No job linked —</option>
                      {jobs.map(j => <option key={j.id} value={j.id}>{formatJobLabel(j)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setNewTripOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
                  <button type="submit" disabled={createTrip.isPending}
                    className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60">
                    {createTrip.isPending ? "Creating…" : "Create Trip"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {isLoading ? (
            <div className="px-5 py-8 text-center text-muted-foreground text-sm animate-pulse">Loading trips…</div>
          ) : sortedTrips.length === 0 ? (
            <div className="px-5 py-10 text-center text-muted-foreground">
              <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No business trips for {year}.</p>
              <p className="text-xs mt-1">Create one to start an IRS-ready receipt folder for out-of-town work.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {activeTrips.length === 0 && archivedTrips.length > 0 ? (
                <p className="px-5 py-4 text-sm text-muted-foreground italic">All trips are archived. Create a new trip or reopen one below.</p>
              ) : null}
              {sortedTrips.map(trip => {
                const isOpen = expanded.has(trip.id);
                const status = auditStatus(trip);
                const dateRange = [trip.startDate, trip.endDate].filter(Boolean).join(" → ");
                return (
                  <div key={trip.id}>
                    <div
                      className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-muted/20 transition-colors select-none"
                      onClick={() => toggleTrip(trip.id)}
                    >
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
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
                            {status.label === "Audit Ready" ? "🟢" : "🟡"} {status.label}
                          </span>
                          {trip.status === "completed" && (
                            <span className="inline-flex items-center text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">Completed</span>
                          )}
                        </div>
                        {trip.businessPurpose && <p className="text-xs text-muted-foreground mt-0.5 truncate">{trip.businessPurpose}</p>}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-bold text-foreground">{`$${trip.totalAmount.toFixed(2)}`}</p>
                          <p className="text-[11px] text-muted-foreground">{trip.receiptCount} receipts</p>
                        </div>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          {trip.status === "open" && (
                            <button
                              title="Mark complete"
                              onClick={() => handleClose(trip)}
                              className="p-1 rounded-lg text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {trip.status === "completed" && (
                            <>
                              <button
                                title="Reopen"
                                onClick={() => handleReopen(trip)}
                                className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                title="Archive"
                                onClick={() => handleArchive(trip)}
                                className="p-1 rounded-lg text-muted-foreground hover:text-gray-600 hover:bg-gray-100 transition-colors"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <a
                            href={`${API}/trips/${trip.id}/packet.pdf`}
                            download
                            title="Export PDF audit packet"
                            onClick={e => e.stopPropagation()}
                            className="p-1 rounded-lg text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                          <button
                            title="Delete trip"
                            onClick={() => setDeleteConfirm(trip)}
                            className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {isOpen && (
                      <TripReceiptsPanel
                        trip={trip}
                        onAddReceipt={(tripId, tripPurpose) => onAddReceipt(tripId, tripPurpose, null)}
                        onClose={() => toggleTrip(trip.id)}
                      />
                    )}
                  </div>
                );
              })}
              {/* Archived trips — collapsed by default */}
              {archivedTrips.length > 0 && (
                <div className="border-t border-border/30">
                  <button
                    type="button"
                    onClick={() => setShowArchived(v => !v)}
                    className="w-full flex items-center gap-2 px-5 py-2.5 text-xs text-muted-foreground hover:bg-muted/20 transition-colors"
                  >
                    {showArchived ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <Archive className="w-3.5 h-3.5" />
                    <span>Archived ({archivedTrips.length})</span>
                  </button>
                  {showArchived && archivedTrips.map(trip => (
                    <div key={trip.id} className="border-t border-border/20">
                      <div className="flex items-center gap-3 px-5 py-3 bg-gray-50/60">
                        <Archive className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-muted-foreground">{trip.destination}</span>
                            {[trip.startDate, trip.endDate].filter(Boolean).join(" → ") && (
                              <span className="text-xs text-muted-foreground">{[trip.startDate, trip.endDate].filter(Boolean).join(" → ")}</span>
                            )}
                            <span className="inline-flex items-center text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full font-medium">Archived</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            title="Reopen"
                            onClick={() => handleReopen(trip)}
                            className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            title="Delete trip"
                            onClick={() => setDeleteConfirm(trip)}
                            className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Delete trip confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-red-100 p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Delete trip?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  The trip to <span className="font-semibold text-gray-700">{deleteConfirm.destination}</span> will be deleted.
                  Its receipts will remain as unlinked expenses.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={deleteTrip.isPending}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow disabled:opacity-60 flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5" />
                {deleteTrip.isPending ? "Deleting…" : "Delete Trip"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vendor Combobox ──────────────────────────────────────────────────────────
function VendorCombobox({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: vendors = [] } = useVendors();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);

  useEffect(() => { setInput(value); }, [value]);

  const suggestions = input.trim()
    ? vendors.filter(v => v.name.toLowerCase().includes(input.toLowerCase()))
    : vendors;

  const isNew = input.trim() !== "" &&
    !vendors.some(v => v.name.toLowerCase() === input.trim().toLowerCase());

  function select(name: string) {
    setInput(name);
    onChange(name);
    setOpen(false);
  }

  function handleBlur(e: React.FocusEvent) {
    if (dropRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    onChange(input);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          className="w-full pl-8 pr-8 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20 text-sm placeholder-muted-foreground"
          placeholder="e.g. Home Depot"
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); onChange(e.target.value); }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          autoComplete="off"
        />
        <ChevronDown
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground cursor-pointer"
          onClick={() => { setOpen(o => !o); inputRef.current?.focus(); }}
        />
      </div>

      {open && (
        <div
          ref={dropRef}
          className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
          style={{ maxHeight: 200, overflowY: "auto" }}
        >
          {vendors.length === 0 && !input.trim() && (
            <p className="px-3 py-2.5 text-xs text-muted-foreground italic">
              No saved vendors yet — type to add one
            </p>
          )}
          {suggestions.map(v => (
            <button
              key={v.id}
              type="button"
              onMouseDown={() => select(v.name)}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 flex items-center gap-2 border-b border-border/40 last:border-0"
            >
              <Store className="w-3.5 h-3.5 text-primary/50 flex-shrink-0" />
              <span>{v.name}</span>
              {v.category && (
                <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{v.category}</span>
              )}
            </button>
          ))}
          {isNew && (
            <button
              type="button"
              onMouseDown={() => select(input.trim())}
              className="w-full text-left px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 flex items-center gap-2 border-t border-border/60"
            >
              <Plus className="w-3.5 h-3.5" />
              Add "{input.trim()}" as new vendor
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Receipt drop zone ─────────────────────────────────────────────────────────
function isHeic(f: File) {
  const mimeCheck = f.type === "image/heic" || f.type === "image/heif" || f.type === "image/heic-sequence" || f.type === "image/heif-sequence";
  const nameCheck = /\.(heic|heif|heics)$/i.test(f.name);
  return mimeCheck || nameCheck;
}

async function processReceiptFile(f: File): Promise<File> {
  if (!isHeic(f)) return f;
  const heic2anyModule = await import("heic2any");
  const heic2any = heic2anyModule.default || heic2anyModule;
  const result = await heic2any({ blob: f, toType: "image/jpeg", quality: 0.92 });
  const jpegBlob = Array.isArray(result) ? result[0] : result;
  if (!(jpegBlob instanceof Blob)) throw new Error("Unexpected output from HEIC converter");
  const baseName = f.name.replace(/\.(heic|heif)$/i, "");
  return new File([jpegBlob], `${baseName}.jpg`, { type: "image/jpeg" });
}

function ReceiptDropZone({ file, onFile, onClear, onDriveClick, driveLoading, showDrive }: {
  file: File | null; onFile: (f: File) => void; onClear: () => void;
  onDriveClick?: () => void; driveLoading?: boolean; showDrive?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  const handleFile = useCallback(async (f: File) => {
    setConvertError(null);
    if (isHeic(f)) {
      setConverting(true);
      try {
        const processed = await processReceiptFile(f);
        onFile(processed);
        const reader = new FileReader();
        reader.onload = e => setPreview(e.target?.result as string);
        reader.readAsDataURL(processed);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("HEIC conversion error:", errMsg);
        setConvertError(`Could not convert HEIC file (${errMsg}). Try exporting as JPEG from your camera roll.`);
        if (inputRef.current) inputRef.current.value = "";
      } finally {
        setConverting(false);
      }
      return;
    }
    onFile(f);
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }, [onFile]);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    if (file.type.startsWith("image/") && !preview) {
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }, [file]);

  const handleClear = () => { onClear(); setPreview(null); setConvertError(null); if (inputRef.current) inputRef.current.value = ""; };
  const handleDrop  = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  };

  if (converting) {
    return (
      <div className="border-2 border-dashed border-primary/50 rounded-xl px-4 py-5 flex flex-col items-center gap-2 bg-primary/5">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center animate-pulse">
          <Upload className="w-4 h-4 text-primary" />
        </div>
        <p className="text-sm font-medium text-foreground">Converting HEIC to JPEG…</p>
        <p className="text-xs text-muted-foreground">This only takes a moment</p>
      </div>
    );
  }

  if (file) {
    return (
      <div className="relative border border-border rounded-xl overflow-hidden bg-muted/30">
        {preview
          ? <img src={preview} alt="Receipt preview" className="w-full max-h-36 object-contain bg-black/5" />
          : (
            <div className="flex items-center gap-3 px-4 py-3">
              <FileText className="w-8 h-8 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          )}
        <button type="button" onClick={handleClear}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-background/90 border border-border flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors">
          <X className="w-3 h-3" />
        </button>
        <div className="px-3 py-1.5 bg-emerald-50 border-t border-emerald-100 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <p className="text-xs text-emerald-700 font-medium">Receipt ready to upload</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl px-4 py-5 flex flex-col items-center gap-2 cursor-pointer transition-all ${
          dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-muted/40"
        }`}
      >
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Upload className="w-4 h-4 text-primary" />
        </div>
        <p className="text-sm font-medium text-foreground">Drop receipt here or click to browse</p>
        <p className="text-xs text-muted-foreground">Any photo or PDF up to 10 MB</p>
        <input ref={inputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,image/gif,image/webp,image/bmp,image/tiff,.pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
      {showDrive && onDriveClick && (
        <button
          type="button"
          onClick={onDriveClick}
          disabled={driveLoading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-muted/40 transition-all disabled:opacity-60"
        >
          {driveLoading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
              <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
              <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
              <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
              <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
              <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
            </svg>
          )}
          Pick from Google Drive
        </button>
      )}
      {convertError && (
        <p className="text-xs text-red-600 text-center">{convertError}</p>
      )}
    </div>
  );
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────
function ExpenseDeleteConfirm({
  expense, onConfirm, onCancel, deleting,
}: {
  expense: any; onConfirm: () => void; onCancel: () => void; deleting: boolean;
}) {
  const isSubPayment = expense?.category?.toLowerCase() === "subcontractor" && expense?.subcontractorName;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-red-100 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-base">Permanently delete expense?</h3>
            <p className="text-sm text-gray-500 mt-1">
              <span className="font-semibold text-gray-700">{expense.description}</span>
              {expense.vendor ? ` · ${expense.vendor}` : ""} will be{" "}
              <span className="font-semibold text-red-600">permanently deleted</span> and cannot be recovered.
            </p>
            {isSubPayment && (
              <p className="text-xs text-indigo-600 mt-2 bg-indigo-50 rounded-lg px-2.5 py-1.5 border border-indigo-100">
                This is a subcontractor payment for <strong>{expense.subcontractorName}</strong>. Deleting it will reduce their YTD total by <strong>${parseFloat(expense.amount ?? "0").toFixed(2)}</strong>.
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} disabled={deleting}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="px-5 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow disabled:opacity-60 flex items-center gap-2">
            <Trash2 className="w-3.5 h-3.5" />
            {deleting ? "Deleting…" : "Yes, Delete Permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Expense View Modal ───────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  "Materials":             "bg-amber-100 text-amber-700",
  "Advertising":           "bg-pink-100 text-pink-700",
  "Fuel/Travel":           "bg-green-100 text-green-700",
  "Subcontractor":         "bg-purple-100 text-purple-700",
  "Insurance":             "bg-cyan-100 text-cyan-700",
  "Professional Services": "bg-indigo-100 text-indigo-700",
  "Office/Admin":          "bg-gray-100 text-gray-600",
  "Rent/Lease":            "bg-violet-100 text-violet-700",
  "Repairs/Maintenance":   "bg-red-100 text-red-700",
  "Tools/Equipment":       "bg-blue-100 text-blue-700",
  "Utilities":             "bg-sky-100 text-sky-700",
  "Other":                 "bg-orange-100 text-orange-700",
  "Travel/Lodging":        "bg-teal-100 text-teal-700",
  "Hotel/Lodging":         "bg-teal-100 text-teal-700",
  "Meals":                 "bg-rose-100 text-rose-700",
  "Airfare":               "bg-blue-100 text-blue-700",
  "Rental Car":            "bg-emerald-100 text-emerald-700",
  "Taxi/Rideshare":        "bg-lime-100 text-lime-700",
  "Campground/RV Site":    "bg-amber-100 text-amber-700",
  "Other Travel":          "bg-gray-100 text-gray-600",
  "Parking/Tolls":         "bg-yellow-100 text-yellow-700",
};

// ─── Mileage import summary (shown for monthly aggregate mileage expenses) ────
function MileageImportSummary({ expense }: { expense: any }) {
  const [showTrips, setShowTrips] = useState(false);
  const month = (expense.date ?? "").slice(0, 7);

  const { data: trips = [], isLoading } = useQuery<any[]>({
    queryKey: ["mileage-import-trips", expense.mileageImportId, expense.businessId],
    queryFn: async () => {
      const res = await fetch(`${API}/mileage?businessId=${expense.businessId}&importId=${expense.mileageImportId}`);
      if (!res.ok) throw new Error("Failed to load trips");
      return res.json();
    },
    enabled: !!expense.businessId && !!expense.mileageImportId,
    staleTime: 30_000,
  });

  const monthTrips = trips.filter(
    (t: any) => t.classification === "business" && (t.date ?? "").slice(0, 7) === month
  );
  const totalMiles = monthTrips.reduce((s: number, t: any) => s + (t.miles ?? 0), 0);
  const rate = monthTrips[0]?.ratePerMile ?? 0;

  return (
    <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 space-y-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-emerald-500">
        <Calendar className="w-3 h-3" /> IRS Mileage Summary
      </div>

      {isLoading ? (
        <p className="text-xs text-emerald-600">Loading trips…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white/70 rounded-lg px-2 py-2">
              <p className="text-lg font-bold text-emerald-700">{totalMiles.toFixed(1)}</p>
              <p className="text-[10px] text-emerald-600">Business miles</p>
            </div>
            <div className="bg-white/70 rounded-lg px-2 py-2">
              <p className="text-lg font-bold text-emerald-700">{rate ? `$${Number(rate).toFixed(3)}` : "—"}</p>
              <p className="text-[10px] text-emerald-600">IRS rate/mi</p>
            </div>
            <div className="bg-white/70 rounded-lg px-2 py-2">
              <p className="text-lg font-bold text-emerald-700">{monthTrips.length}</p>
              <p className="text-[10px] text-emerald-600">Trips</p>
            </div>
          </div>

          {monthTrips.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTrips(v => !v)}
              className="w-full flex items-center justify-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition-colors"
            >
              {showTrips ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showTrips ? "Hide individual trips" : `View ${monthTrips.length} individual trips`}
            </button>
          )}

          {showTrips && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-emerald-100 bg-white divide-y divide-gray-50">
              {monthTrips.map((t: any) => (
                <div key={t.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800">{formatDate(t.date)}</p>
                    {(t.startLocation || t.endLocation) && (
                      <p className="text-gray-500 truncate">
                        {t.startLocation ?? "?"} → {t.endLocation ?? "?"}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-800">{Number(t.miles ?? 0).toFixed(1)} mi</p>
                    <p className="text-emerald-600">{formatCurrency(t.deductionAmount ?? 0)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-emerald-600">
            Trips are managed on the Mileage page. Editing or deleting a trip automatically recalculates this expense.
          </p>
        </>
      )}
    </div>
  );
}

function ExpenseViewModal({
  expense, onClose, onDelete, onJumpToTemplate,
}: {
  expense: any; onClose: () => void; onDelete: () => void; onJumpToTemplate?: (id: number) => void;
}) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  function buildReceiptUrl(raw: string | null | undefined): string | null {
    if (!raw) return null;
    if (raw.startsWith("http")) return raw;
    // GCS object path stored as /objects/... → serve via /api/storage/objects/...
    if (raw.startsWith("/objects/")) return `${base}/api/storage${raw}`;
    // Legacy /api/uploads/... paths (may be broken if file was lost on redeploy)
    return `${base}${raw}`;
  }

  const receiptUrl = buildReceiptUrl(expense.receiptUrl);
  // HEIC/HEIF files cannot be rendered inline in browsers — show download only
  const isHeic = receiptUrl && /\.(heic|heif)$/i.test(receiptUrl);
  const isImage = receiptUrl && !isHeic && /\.(jpg|jpeg|png|gif|webp|bmp|tiff?)$/i.test(receiptUrl);
  const isPdf = receiptUrl && /\.pdf$/i.test(receiptUrl);
  const [lightbox, setLightbox] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-2xl rounded-2xl overflow-hidden flex flex-col my-auto">

        {/* Header bar */}
        <div className="h-1.5 bg-gradient-to-r from-amber-500 to-amber-400 flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-500" />
            <span className="font-bold text-gray-900">Expense Detail</span>
            {expense.recurringExpenseId && (
              <button
                type="button"
                onClick={() => { onClose(); onJumpToTemplate?.(expense.recurringExpenseId!); }}
                title="View recurring template"
                className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-100 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" /> Recurring ↓
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            {expense._source !== "sub_payment_record" && (
              <button onClick={onDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(92vh - 100px)" }}>

          {/* Amount — hero stat */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4 text-center">
            <p className="text-[10px] uppercase tracking-widest font-bold text-amber-400 mb-1">Amount</p>
            <p className="text-4xl font-black text-amber-600">{formatCurrency(expense.amount)}</p>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                <Calendar className="w-3 h-3" /> Date
              </div>
              <p className="text-sm font-semibold text-gray-800">{formatDate(expense.date)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                <Tag className="w-3 h-3" /> Category
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${CATEGORY_COLORS[expense.category] ?? "bg-gray-100 text-gray-600"}`}>
                {expense.category}
              </span>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
              <DollarSign className="w-3 h-3" /> Description
            </div>
            <p className="text-sm font-semibold text-gray-800">{expense.description}</p>
          </div>

          {expense.vendor && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                <Store className="w-3 h-3" /> Vendor
              </div>
              <p className="text-sm font-semibold text-gray-800">{expense.vendor}</p>
            </div>
          )}

          {expense.jobTitle && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                <Briefcase className="w-3 h-3" /> Job
              </div>
              <p className="text-sm font-semibold text-gray-800">{expense.jobTitle}</p>
            </div>
          )}

          {/* Trip documentation link — the "why" behind this expense */}
          {expense.jobId && (
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-blue-400 mb-1">
                <FileText className="w-3 h-3" /> Trip Documentation
              </div>
              <p className="text-xs text-blue-700 mb-2">
                {isTravelCategory(expense.category)
                  ? "See the full story behind this travel expense — customer, job site, work performed, and payment received."
                  : "See the full documentation packet for this job — expenses, daily logs, photos, and invoices."}
              </p>
              <Link href={`/trip-packet/${expense.jobId}`} onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors">
                <FileText className="w-3.5 h-3.5" /> View Trip Packet
              </Link>
            </div>
          )}

          {(expense as any).subcontractorName && (
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-amber-400 mb-1">
                <HardHat className="w-3 h-3" /> Subcontractor
              </div>
              <p className="text-sm font-semibold text-gray-800">{(expense as any).subcontractorName}</p>
              <p className="text-xs text-amber-600 mt-0.5">Visible in subcontractor portal</p>
            </div>
          )}

          {/* Monthly mileage import expense: summary + trip drill-down */}
          {expense.mileageImportId && (
            <MileageImportSummary expense={expense} />
          )}

          {expense.notes && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                <StickyNote className="w-3 h-3" /> Notes
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{expense.notes}</p>
            </div>
          )}

          {/* SPR-specific fields */}
          {expense._source === "sub_payment_record" && (
            <>
              {expense.paymentMethod && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                    <DollarSign className="w-3 h-3" /> Payment Method
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{expense.paymentMethod}</p>
                </div>
              )}
              {expense.referenceNumber && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                    <Tag className="w-3 h-3" /> Reference / Check #
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{expense.referenceNumber}</p>
                </div>
              )}
              {expense.agreedOwed != null && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                    <DollarSign className="w-3 h-3" /> Agreed Owed (at time of payment)
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{formatCurrency(expense.agreedOwed)}</p>
                </div>
              )}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-700">
                <strong>Pay-Worker record</strong> — recorded via the job card. To edit or void this payment, open the job and use the Sub Payments panel.
              </div>
            </>
          )}

          {/* Receipt */}
          {receiptUrl ? (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400">
                  <ImageIcon className="w-3 h-3" /> Receipt
                </div>
                {!isHeic && (
                  <button type="button" onClick={() => {
                    if (isPdf) { window.open(receiptUrl!, "_blank", "noopener,noreferrer"); }
                    else { setLightbox(true); }
                  }}
                    className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline">
                    <Maximize2 className="w-3 h-3" /> {isPdf ? "Open PDF" : "Expand"}
                  </button>
                )}
              </div>
              {isImage && !imgError ? (
                <img
                  src={receiptUrl} alt="Receipt"
                  className="w-full max-h-52 object-contain bg-gray-100 cursor-zoom-in"
                  onClick={() => setLightbox(true)}
                  onError={() => setImgError(true)}
                />
              ) : isImage && imgError ? (
                <div className="flex flex-col items-center gap-2 px-4 py-5 bg-red-50 text-center">
                  <ImageIcon className="w-8 h-8 text-red-300" />
                  <p className="text-sm font-semibold text-red-700">Receipt no longer available</p>
                  <p className="text-xs text-red-500">This file was lost in a previous deployment. Please re-upload the receipt.</p>
                </div>
              ) : isHeic ? (
                <div className="flex flex-col items-center gap-3 px-4 py-5 bg-gray-50">
                  <ImageIcon className="w-10 h-10 text-gray-300" />
                  <p className="text-sm text-gray-500 text-center">iPhone photo (HEIC) — cannot preview in browser</p>
                  <a
                    href={receiptUrl}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    <Download className="w-4 h-4" /> Download Receipt
                  </a>
                </div>
              ) : isPdf ? (
                <div className="flex flex-col items-center gap-3 px-4 py-6 bg-gray-50">
                  <Receipt className="w-10 h-10 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-700">Receipt PDF</p>
                  <div className="flex gap-2 flex-wrap justify-center">
                    <a
                      href={receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open PDF
                    </a>
                    <a
                      href={receiptUrl}
                      download
                      className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-center py-3 text-xs text-gray-400 italic">No receipt attached</div>
          )}
        </div>
        {/* Close button footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Close
          </button>
        </div>
        <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-500 flex-shrink-0" />
      </div>

      {/* Full-screen receipt lightbox */}
      {lightbox && receiptUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 overflow-hidden"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightbox(false); }}
            className="absolute z-10 right-4 flex items-center gap-1.5 text-white font-bold text-sm bg-black/70 hover:bg-black/90 px-4 py-2 rounded-xl border border-white/30 backdrop-blur-sm transition-colors"
            style={{ top: "max(16px, env(safe-area-inset-top, 16px))" }}
            aria-label="Close"
          >
            <X className="w-4 h-4" /> Close
          </button>

          {/* Content */}
          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden px-4"
            style={{ paddingTop: "calc(max(52px, env(safe-area-inset-top, 52px)) + 32px)" }}
          >
            {isImage && !imgError ? (
              <img
                src={receiptUrl}
                alt="Receipt full view"
                className="max-w-full max-h-full object-contain select-none"
                onClick={e => e.stopPropagation()}
                onError={() => setImgError(true)}
              />
            ) : isImage && imgError ? (
              <div className="flex flex-col items-center gap-4 p-8 text-center" onClick={e => e.stopPropagation()}>
                <ImageIcon className="w-16 h-16 text-red-300" />
                <p className="text-white font-semibold text-lg">Receipt no longer available</p>
                <p className="text-white/70 text-sm">This file was lost in a previous deployment.<br/>Please close and re-upload the receipt.</p>
              </div>
            ) : (
              <div
                className="flex flex-col items-center gap-6 p-8 text-center rounded-2xl bg-white/8 border border-white/12 mx-4 w-full max-w-sm"
                onClick={e => e.stopPropagation()}
              >
                <Receipt className="w-16 h-16 text-white/30" />
                <div>
                  <p className="text-white font-semibold text-lg">Receipt PDF</p>
                  <p className="text-white/50 text-sm mt-1">Tap "Open PDF" to view in a new tab</p>
                </div>
                <div className="flex gap-3 flex-wrap justify-center">
                  <a
                    href={receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors text-sm"
                  >
                    <ExternalLink className="w-4 h-4" /> Open PDF
                  </a>
                  <a
                    href={receiptUrl}
                    download
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-white/15 text-white rounded-xl font-semibold hover:bg-white/25 transition-colors text-sm"
                  >
                    <Download className="w-4 h-4" /> Download
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Bottom hint — safe area aware */}
          <div
            className="absolute left-0 right-0 text-center text-white/30 text-xs pointer-events-none"
            style={{ bottom: "max(16px, env(safe-area-inset-bottom, 16px))" }}
          >
            Tap anywhere outside to close
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recurring Expense Modal ──────────────────────────────────────────────────
function RecurringModal({
  open,
  onClose,
  jobs,
}: {
  open: boolean;
  onClose: () => void;
  jobs: any[];
}) {
  const { activeBusiness, businesses } = useBusiness();
  const createRecurring = useCreateRecurring();
  const saveVendor      = useSaveVendor();
  const [vendor, setVendor]     = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [error, setError]       = useState("");

  function resetForm() {
    setVendor("");
    setCategory(CATEGORIES[0]);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);

    try {
      await createRecurring.mutateAsync({
        description: fd.get("description") as string,
        amount:      parseFloat(fd.get("amount") as string),
        category,
        vendor:      vendor.trim() || undefined,
        jobId:       fd.get("jobId") ? parseInt(fd.get("jobId") as string) : undefined,
        notes:       fd.get("notes") as string || undefined,
        frequency:   fd.get("frequency") as string,
        startDate:   fd.get("startDate") as string,
        endDate:     (fd.get("endDate") as string) || undefined,
        businessId:  activeBusiness?.id ?? businesses?.[0]?.id ?? undefined,
      });

      if (vendor.trim()) {
        await saveVendor.mutateAsync(vendor.trim()).catch(() => {});
      }

      resetForm();
      onClose();
    } catch {
      setError("Failed to save. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) { resetForm(); onClose(); } }}>
      <DialogContent className="max-w-md bg-card border-border shadow-2xl p-6 rounded-2xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-blue-500" />
            Add Recurring Expense
          </DialogTitle>
        </DialogHeader>
        <form id="recurring-form" onSubmit={handleSubmit} className="space-y-4 mt-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                <input
                  name="amount" type="number" step="0.01" required min="0"
                  className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Frequency *</label>
              <select
                name="frequency" required
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none"
                defaultValue="monthly"
              >
                {(Object.entries(FREQUENCY_LABELS) as [RecurringExpenseFrequency, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description *</label>
            <input
              name="description" required
              className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="e.g. General liability insurance"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Vendor</label>
              <VendorCombobox value={vendor} onChange={setVendor} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category *</label>
              <select
                name="category" required value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date *</label>
              <input
                name="startDate" type="date" required defaultValue={localDateString()}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                End Date
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                name="endDate" type="date"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Allocate to Job <span className="font-normal text-muted-foreground">(Optional)</span></label>
            <select name="jobId" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none">
              <option value="">— None (Overhead) —</option>
              {jobs?.map(j => <option key={j.id} value={j.id}>{formatJobLabel(j)}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <input
              name="notes"
              className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Optional notes"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>

        <div className="pt-4 border-t border-dashed border-border flex justify-end gap-3 flex-shrink-0">
          <button type="button" onClick={() => { resetForm(); onClose(); }}
            className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            form="recurring-form"
            disabled={createRecurring.isPending}
            className="px-6 py-2 rounded-xl font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-md flex items-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {createRecurring.isPending ? "Saving…" : "Save Recurring"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Recurring Section ────────────────────────────────────────────────────────
function RecurringSection({
  jobs,
  highlightedTemplateId,
  onClearHighlight,
}: {
  jobs: any[];
  highlightedTemplateId: number | null;
  onClearHighlight: () => void;
}) {
  const { canEdit } = useUserPermissions();
  const { activeBusiness: activeBiz } = useBusiness();
  const { data: templates = [], isLoading } = useRecurringExpenses(activeBiz?.id);
  const updateRecurring = useUpdateRecurring();
  const deleteRecurring = useDeleteRecurring();
  const [modalOpen,   setModalOpen]   = useState(false);
  const [collapsed,   setCollapsed]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecurringExpense | null>(null);
  const [deletingId,  setDeletingId]  = useState<number | null>(null);

  useEffect(() => {
    if (!highlightedTemplateId) return;
    setCollapsed(false);
    const timer = setTimeout(() => {
      const el = document.getElementById(`template-row-${highlightedTemplateId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    const clear = setTimeout(() => onClearHighlight(), 3500);
    return () => { clearTimeout(timer); clearTimeout(clear); };
  }, [highlightedTemplateId]);

  async function toggleActive(t: RecurringExpense) {
    await updateRecurring.mutateAsync({ id: t.id, data: { active: !t.active } });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await deleteRecurring.mutateAsync(deleteTarget.id);
    } finally {
      setDeletingId(null);
      setDeleteTarget(null);
    }
  }

  const activeCount = templates.filter(t => t.active).length;
  const activeTemplates = templates.filter(t => t.active);
  const totalMonthly = activeTemplates.reduce((sum, t) => sum + toMonthlyRate(t.amount, t.frequency), 0);
  const totalAnnual = totalMonthly * 12;

  return (
    <>
      <Card className="border-border/50 shadow-md overflow-hidden bg-card">
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-border/50 cursor-pointer select-none hover:bg-muted/20 transition-colors"
          onClick={() => setCollapsed(c => !c)}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <RotateCcw className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">Recurring Expenses</h2>
                {activeCount > 0 && (
                  <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {activeCount} active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Auto-generate expenses on a schedule</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit("expenses") && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setModalOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Add Recurring
              </button>
            )}
            {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {!collapsed && (
          <div className="overflow-x-auto custom-scrollbar">
            {/* Monthly overhead summary banner */}
            {activeTemplates.length > 0 && (
              <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border-b border-indigo-100 dark:border-indigo-900/40">
                <div className="flex flex-wrap items-start gap-4">
                  {/* Totals */}
                  <div className="flex gap-4 flex-shrink-0">
                    <div className="text-center">
                      <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide">Est. Monthly</p>
                      <p className="text-2xl font-display font-bold text-indigo-700 dark:text-indigo-300 leading-tight">
                        {formatCurrency(totalMonthly)}
                      </p>
                    </div>
                    <div className="w-px bg-indigo-200 dark:bg-indigo-700 self-stretch" />
                    <div className="text-center">
                      <p className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wide">Est. Annual</p>
                      <p className="text-2xl font-display font-bold text-indigo-500 dark:text-indigo-400 leading-tight">
                        {formatCurrency(totalAnnual)}
                      </p>
                    </div>
                  </div>
                  {/* Per-expense breakdown */}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {activeTemplates.map(t => {
                      const mo = toMonthlyRate(t.amount, t.frequency);
                      return (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/70 dark:bg-white/10 border border-indigo-100 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 shadow-sm"
                        >
                          {t.description}
                          <span className="text-indigo-400 dark:text-indigo-500">·</span>
                          <span className="font-semibold">{formatCurrency(mo)}/mo</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
                <p className="text-[10px] text-indigo-400 mt-2 leading-tight">
                  All frequencies normalized to monthly equivalent &bull; Active templates only
                </p>
              </div>
            )}

            {isLoading ? (
              <div className="px-6 py-8 text-center text-muted-foreground animate-pulse text-sm">Loading…</div>
            ) : templates.length === 0 ? (
              <div className="px-6 py-10 text-center text-muted-foreground">
                <RotateCcw className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No recurring expenses set up yet.</p>
                <p className="text-xs mt-1">Add one to auto-generate expenses on a schedule.</p>
              </div>
            ) : (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                  <tr>
                    <th className="px-6 py-3">Description / Vendor</th>
                    <th className="px-6 py-3">Frequency</th>
                    <th className="px-6 py-3">Next Due</th>
                    <th className="px-6 py-3">End Date</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3 text-center">Status</th>
                    {canEdit("expenses") && <th className="px-6 py-3 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {templates.map(t => (
                    <tr
                      key={t.id}
                      id={`template-row-${t.id}`}
                      className={`transition-all duration-500 ${
                        highlightedTemplateId === t.id
                          ? "bg-blue-50 ring-2 ring-inset ring-blue-300"
                          : t.active ? "hover:bg-muted/20" : "opacity-60 hover:bg-muted/10"
                      }`}
                    >
                      <td className="px-6 py-3">
                        <div className="font-medium text-foreground">{t.description}</div>
                        {t.vendor && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Store className="w-3 h-3" /> {t.vendor}
                          </div>
                        )}
                        {t.jobTitle && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Briefcase className="w-3 h-3" /> {t.jobTitle}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${FREQUENCY_COLORS[t.frequency] ?? "bg-gray-100 text-gray-600"}`}>
                          <RotateCcw className="w-3 h-3" />
                          {FREQUENCY_LABELS[t.frequency] ?? t.frequency}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {t.active ? formatDate(t.nextDueDate) : <span className="italic">Paused</span>}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {t.endDate ? formatDate(t.endDate) : <span className="italic text-xs">No end</span>}
                      </td>
                      <td className="px-6 py-3 text-right font-display font-semibold text-foreground">
                        {formatCurrency(t.amount)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {t.active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                            <Pause className="w-2.5 h-2.5" /> Paused
                          </span>
                        )}
                      </td>
                      {canEdit("expenses") && (
                        <td className="px-6 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => toggleActive(t)}
                              className="text-muted-foreground hover:text-primary transition-colors"
                              title={t.active ? "Pause" : "Resume"}
                            >
                              {t.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => setDeleteTarget(t)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Delete template"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>

      <RecurringModal open={modalOpen} onClose={() => setModalOpen(false)} jobs={jobs} />

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-red-100 p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Delete recurring expense?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  The template for <span className="font-semibold text-gray-700">{deleteTarget.description}</span> will be deleted.
                  Previously generated expense entries will remain.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deletingId !== null}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deletingId !== null}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow disabled:opacity-60 flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5" />
                {deletingId !== null ? "Deleting…" : "Delete Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function Expenses() {
  const { canEdit } = useUserPermissions();
  const { activeBusiness, businesses } = useBusiness();
  const { toast } = useToast();
  const { isConfigured: googleConfigured, isConnected: googleConnected, signIn: googleSignIn, getToken } = useGoogleAuth();
  const [drivePickingNew, setDrivePickingNew] = useState(false);
  const [drivePickingEdit, setDrivePickingEdit] = useState(false);

  const [filterCategory, setFilterCategory] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("filter_category") ?? "";
  });
  const { data: expenses, isLoading, refetch } = useListExpenses(filterCategory ? { category: filterCategory } : undefined);
  const { data: jobs }    = useListJobs();
  const { data: subs }    = useListSubcontractors();
  const qc                = useQueryClient();
  const createMutation    = useCreateExpense();
  const uploadMutation    = useUploadExpenseReceipt();
  const saveVendor        = useSaveVendor();
  const deleteExpense     = useDeleteExpense();
  const deleteSpr         = useDeleteSpr();
  const updateExpense     = useUpdateExpense();
  const linkExpenseToTrip = useLinkExpenseToTrip();

  const [isDialogOpen, setIsDialogOpen]               = useState(false);
  const [importOpen,   setImportOpen]                 = useState(false);
  const [receiptFile, setReceiptFile]                 = useState<File | null>(null);
  const [uploadError, setUploadError]                 = useState("");

  const [prefillAmount, setPrefillAmount]             = useState("");
  const [prefillDate,   setPrefillDate]               = useState("");
  const [prefillDesc,   setPrefillDesc]               = useState("");
  const [prefillNotes,  setPrefillNotes]              = useState("");
  const [prefillKey,    setPrefillKey]                = useState(0);
  const [scanningReceipt, setScanningReceipt]         = useState(false);
  const [dialogMode, setDialogMode]                   = useState<"manual" | "scan">("manual");
  const scanReceiptInputRef                           = useRef<HTMLInputElement>(null);
  const cameraInputRef                                = useRef<HTMLInputElement>(null);
  const isMobile                                      = useIsMobile();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pa = params.get("prefill_amount");
    const pd = params.get("prefill_date");
    const pDesc = params.get("prefill_desc");
    const pCat = params.get("prefill_category");
    const scan = params.get("scan");
    if (pa || pd || pDesc || pCat || scan === "1") {
      if (pCat && CATEGORIES.includes(pCat)) {
        setCategory(pCat);
        if (pCat === "Owner Draw") setExcludeFromNetProfit(true);
      }
      if (scan === "1") {
        setDialogMode("scan");
      }
      setPrefillAmount(pa ?? "");
      setPrefillDate(pd ?? "");
      setPrefillDesc(pDesc ?? "");
      setPrefillKey(k => k + 1);
      setIsDialogOpen(true);
      const clean = new URL(window.location.href);
      clean.searchParams.delete("prefill_amount");
      clean.searchParams.delete("prefill_date");
      clean.searchParams.delete("prefill_desc");
      clean.searchParams.delete("prefill_category");
      clean.searchParams.delete("scan");
      window.history.replaceState({}, "", clean.toString());
    }
  }, []);
  const [vendor, setVendor]                           = useState("");
  const [category, setCategory]                       = useState(CATEGORIES[0]);
  const [subcontractorId, setSubcontractorId]         = useState("");
  const [excludeFromNetProfit, setExcludeFromNetProfit] = useState(false);
  const [countsTowardJobProfit, setCountsTowardJobProfit] = useState(true);
  const [formJobId, setFormJobId] = useState("");
  const [businessLine, setBusinessLine]               = useState<string | undefined>(
    activeBusiness?.slug ?? undefined
  );
  useEffect(() => {
    setBusinessLine(activeBusiness?.slug ?? undefined);
  }, [activeBusiness?.slug]);
  const [prefillTripId, setPrefillTripId]             = useState<number | null>(null);
  const [paidBy,        setPaidBy]                    = useState("");
  const [receiptStatus, setReceiptStatus]             = useState<"uploaded" | "missing">("uploaded");
  const [receiptMissingExpl, setReceiptMissingExpl]   = useState("");
  const [mealNumPeople, setMealNumPeople]             = useState("");
  const [overnightTravel, setOvernightTravel]         = useState<boolean | null>(null);
  const [tipAmount,     setTipAmount]                 = useState("");
  const [taxAmount,     setTaxAmount]                 = useState("");
  const [viewExpense,   setViewExpense]                = useState<any | null>(null);
  const [editingRow,    setEditingRow]                = useState<{id: number; description: string; amount: string; date: string; category: string; vendor: string; jobId: string; notes: string; excludeFromNetProfit: boolean; countsTowardJobProfit: boolean; businessLine: string; businessId: number | null} | null>(null);
  const [editReceiptFile, setEditReceiptFile]         = useState<File | null>(null);
  const [editLightboxUrl, setEditLightboxUrl]         = useState<string | null>(null);
  const [editLightboxImgError, setEditLightboxImgError] = useState(false);
  const [receiptLightboxUrl, setReceiptLightboxUrl]   = useState<string | null>(null);
  const [receiptLightboxIsPdf, setReceiptLightboxIsPdf] = useState(false);
  const [receiptLightboxImgError, setReceiptLightboxImgError] = useState(false);

  async function handleDrivePickNew() {
    if (!googleConnected) {
      googleSignIn(() => handleDrivePickNew());
      return;
    }
    setDrivePickingNew(true);
    try {
      const token = await getToken();
      const file = await openDrivePicker(token);
      if (file) {
        const processed = await processReceiptFile(file);
        setReceiptFile(processed);
      }
    } catch (err: any) {
      toast({ title: "Drive error", description: err?.message ?? "Could not open Google Drive picker.", variant: "destructive" });
    } finally {
      setDrivePickingNew(false);
    }
  }

  async function handleDrivePickEdit() {
    if (!googleConnected) {
      googleSignIn(() => handleDrivePickEdit());
      return;
    }
    setDrivePickingEdit(true);
    try {
      const token = await getToken();
      const file = await openDrivePicker(token);
      if (file) {
        const processed = await processReceiptFile(file);
        setEditReceiptFile(processed);
      }
    } catch (err: any) {
      toast({ title: "Drive error", description: err?.message ?? "Could not open Google Drive picker.", variant: "destructive" });
    } finally {
      setDrivePickingEdit(false);
    }
  }

  function openReceiptLightbox(url: string) {
    const path = url.split("?")[0];
    if (/\.pdf$/i.test(path)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setReceiptLightboxIsPdf(false);
    setReceiptLightboxImgError(false);
    setReceiptLightboxUrl(url);
  }
  const editReceiptInputRef                           = useRef<HTMLInputElement>(null);
  const [deleteTarget,  setDeleteTarget]              = useState<any | null>(null);
  const [deleting,     setDeleting]                   = useState(false);
  const [highlightedTemplateId, setHighlightedTemplateId] = useState<number | null>(null);

  // ─── Year / month grouping ───────────────────────────────────────────────────
  const currentYear      = useMemo(() => String(new Date().getFullYear()), []);
  const todayYearMonth   = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  function initMonthCollapsed(year: string): Record<string, boolean> {
    // Only the current month starts open; everything else collapsed
    return year === currentYear ? { [todayYearMonth]: false } : {};
  }

  const [selectedYear,   setSelectedYear]   = useState(currentYear);
  const [monthCollapsed, setMonthCollapsed] = useState<Record<string, boolean>>(
    () => initMonthCollapsed(currentYear)
  );
  const [searchQuery, setSearchQuery] = useState("");

  function toggleMonth(key: string) {
    setMonthCollapsed(prev => ({ ...prev, [key]: prev[key] === false }));
  }

  const allYears = useMemo(() => {
    const years = new Set([currentYear]);
    (expenses ?? []).forEach(e => {
      const y = (e.date ?? "").slice(0, 4);
      if (y.length === 4) years.add(y);
    });
    return [...years].sort((a, b) => b.localeCompare(a));
  }, [expenses, currentYear]);

  const { data: allTrips = [] } = useTrips(selectedYear);

  const yearExpenses = useMemo(
    () => (expenses ?? [])
      .filter(e => (e.date ?? "").startsWith(selectedYear))
      .filter(e => !activeBusiness || (e as any).businessId === activeBusiness.id || (!(e as any).businessId && (e as any).businessLine === activeBusiness.slug)),
    [expenses, selectedYear, activeBusiness]
  );

  const filteredYearExpenses = useMemo(() => {
    if (!searchQuery.trim()) return yearExpenses;
    const q = searchQuery.trim().toLowerCase();
    return yearExpenses.filter(e => {
      const amtNum = parseFloat(String(e.amount ?? "0"));
      const amtRaw = String(e.amount ?? "");
      const amtFormatted = Number.isFinite(amtNum)
        ? amtNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "";
      return (
        (e.description ?? "").toLowerCase().includes(q) ||
        (e.vendor ?? "").toLowerCase().includes(q) ||
        amtRaw.includes(q) ||
        amtFormatted.includes(q)
      );
    });
  }, [yearExpenses, searchQuery]);

  const monthlyGroups = useMemo(() => {
    const groups: Record<string, typeof filteredYearExpenses> = {};
    filteredYearExpenses.forEach(e => {
      const mk = (e.date ?? "").slice(0, 7);
      if (mk.length === 7) {
        if (!groups[mk]) groups[mk] = [];
        groups[mk].push(e);
      }
    });
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(mk => {
      const [y, m] = mk.split("-");
      return {
        key: mk,
        expenses: [...groups[mk]].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
        total: groups[mk].reduce((s, e) => s + parseFloat(String(e.amount ?? "0")), 0),
        label: new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", {
          month: "long", year: "numeric",
        }),
      };
    });
  }, [filteredYearExpenses]);

  const yearTotal = filteredYearExpenses.reduce((s, e) => s + parseFloat(String(e.amount ?? "0")), 0);

  function jumpToTemplate(id: number) {
    setHighlightedTemplateId(id);
    document.getElementById("recurring-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openDialog() {
    setIsDialogOpen(true);
    setReceiptFile(null);
    setUploadError("");
    setVendor("");
    setCategory(CATEGORIES[0]);
    setSubcontractorId("");
    setExcludeFromNetProfit(false);
    setCountsTowardJobProfit(true);
    setFormJobId("");
    setBusinessLine(activeBusiness?.slug ?? undefined);
    setPrefillTripId(null);
    setPaidBy("");
    setReceiptStatus("uploaded");
    setReceiptMissingExpl("");
    setMealNumPeople("");
    setPrefillAmount("");
    setPrefillDate("");
    setPrefillDesc("");
    setPrefillNotes("");
    setDialogMode("manual");
    setPrefillKey(k => k + 1);
  }

  async function handleReceiptScan(file: File) {
    setScanningReceipt(true);
    try {
      const processed = await processReceiptFile(file);

      // Reset all form state first
      setVendor("");
      setCategory(CATEGORIES[0]);
      setSubcontractorId("");
      setExcludeFromNetProfit(false);
      setCountsTowardJobProfit(true);
      setFormJobId("");
      setBusinessLine(activeBusiness?.slug ?? undefined);
      setPrefillTripId(null);
      setPaidBy("");
      setReceiptStatus("uploaded");
      setReceiptMissingExpl("");
      setMealNumPeople("");
      setOvernightTravel(null);
      setTipAmount("");
      setTaxAmount("");

      // Call AI parse endpoint
      const fd = new FormData();
      fd.append("file", processed);
      const res = await fetch(`${API}/expense-import/parse-receipt`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });

      const data: { description?: string; vendor?: string; amount?: number; date?: string; category?: string; notes?: string } =
        res.ok ? await res.json() : {};

      // Pre-fill form with AI-extracted values
      setPrefillAmount(data.amount != null ? String(data.amount) : "");
      setPrefillDate(data.date || localDateString());
      setPrefillDesc(data.description || "");
      setPrefillNotes(data.notes || "");
      if (data.vendor) setVendor(data.vendor);
      if (data.category && CATEGORIES.includes(data.category)) setCategory(data.category);
      setPrefillKey(k => k + 1);

      if (!res.ok) {
        toast({ title: "Could not read receipt", description: "Fill in the details manually.", variant: "destructive" });
      }

      setReceiptFile(processed);
      setUploadError("");
      setDialogMode("scan");
      setIsDialogOpen(true);
    } catch {
      toast({ title: "Could not read receipt", description: "Fill in the details manually.", variant: "destructive" });
      try {
        const processed = await processReceiptFile(file);
        setReceiptFile(processed);
      } catch {
        setReceiptFile(file);
      }
      setPrefillAmount("");
      setPrefillDate("");
      setPrefillDesc("");
      setPrefillNotes("");
      setPrefillKey(k => k + 1);
      setUploadError("");
      setDialogMode("scan");
      setIsDialogOpen(true);
    } finally {
      setScanningReceipt(false);
      if (scanReceiptInputRef.current) scanReceiptInputRef.current.value = "";
    }
  }

  function openDialogForTrip(tripId: number, tripPurpose: string, tripJobId: number | null) {
    setIsDialogOpen(true);
    setReceiptFile(null);
    setUploadError("");
    setVendor("");
    setCategory("Meals");
    setSubcontractorId("");
    setExcludeFromNetProfit(false);
    setCountsTowardJobProfit(false);
    setFormJobId(tripJobId ? String(tripJobId) : "");
    setBusinessLine(activeBusiness?.slug ?? undefined);
    setPrefillTripId(tripId);
    setPaidBy("");
    setReceiptStatus("uploaded");
    setReceiptMissingExpl("");
    setMealNumPeople("");
    setOvernightTravel(null);
    setTipAmount("");
    setTaxAmount("");
    setPrefillAmount("");
    setPrefillDate("");
    setPrefillDesc("");
    setPrefillKey(k => k + 1);
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploadError("");
    const fd = new FormData(e.currentTarget);

    try {
      if (receiptStatus === "missing" && !receiptMissingExpl.trim()) {
        toast({ title: "Explanation required", description: "Please describe why the receipt is missing (IRS requirement).", variant: "destructive" });
        return;
      }
      const rawCategory = fd.get("category") as string;
      const rawAmount = parseFloat(fd.get("amount") as string);
      const expense = await createMutation.mutateAsync({
        data: {
          description:    fd.get("description") as string,
          amount:         rawAmount,
          category:       rawCategory,
          date:           fd.get("date") as string,
          vendor:         vendor.trim() || undefined,
          notes:          fd.get("notes") as string || undefined,
          jobId:          fd.get("jobId") ? parseInt(fd.get("jobId") as string) : undefined,
          subcontractorId: subcontractorId ? parseInt(subcontractorId) : undefined,
          excludeFromNetProfit,
          countsTowardJobProfit,
          businessLine: businessLine || null,
          businessId: activeBusiness?.id ?? (businessLine ? businesses.find(b => b.slug === businessLine)?.id ?? null : null),
          tripId: prefillTripId ?? undefined,
          paidBy: paidBy || undefined,
          receiptStatus,
          receiptMissingExplanation: receiptStatus === "missing" ? (receiptMissingExpl || undefined) : undefined,
          numPeople: mealNumPeople ? parseInt(mealNumPeople) : undefined,
          overnightTravel: overnightTravel ?? undefined,
          tipAmount: tipAmount ? parseFloat(tipAmount) : undefined,
          taxAmount: taxAmount ? parseFloat(taxAmount) : undefined,
          isPotentiallyNondeductible: isMealCategory(rawCategory) && overnightTravel === false,
          ...(isMealCategory(rawCategory) && {
            mealTotal: rawAmount,
            deductibleAmount: rawAmount * 0.5,
            nonDeductibleAmount: rawAmount * 0.5,
          }),
        },
      });

      // Optimistically add to cache — derive display names from already-loaded lists
      const jobIdVal  = fd.get("jobId") ? parseInt(fd.get("jobId") as string) : null;
      const subIdVal  = subcontractorId ? parseInt(subcontractorId) : null;
      const jobTitle  = jobIdVal ? ((jobs ?? []).find(j => j.id === jobIdVal)?.title ?? null) : null;
      const subName   = subIdVal ? ((subs  ?? []).find(s => s.id === subIdVal)?.name  ?? null) : null;
      qc.setQueryData(["/api/expenses"], (old: any[] | undefined) =>
        old ? [...old, { ...expense, jobTitle, subcontractorName: subName }] : [{ ...expense, jobTitle, subcontractorName: subName }]
      );

      // ── Close dialog immediately — background work continues below ──
      setIsDialogOpen(false);
      setReceiptFile(null);
      setVendor("");
      setSubcontractorId("");
      setExcludeFromNetProfit(false);
      setBusinessLine(activeBusiness?.slug ?? undefined);
      setPrefillTripId(null);
      setPaidBy("");
      setReceiptStatus("uploaded");
      setReceiptMissingExpl("");
      setMealNumPeople("");
      setOvernightTravel(null);
      setTipAmount("");
      setTaxAmount("");
      if (prefillTripId) {
        qc.invalidateQueries({ queryKey: ["trip-receipts", prefillTripId] });
        qc.invalidateQueries({ queryKey: ["business-trips"] });
      }

      // Background: receipt upload (receiptFile still holds the file — setState is async)
      if (receiptFile && expense.id) {
        uploadMutation.mutateAsync({ id: expense.id, data: { receipt: receiptFile } })
          .catch(() => {
            toast({ title: "Receipt upload failed", description: "Expense saved. Open it to re-attach the receipt.", variant: "destructive" });
          });
      }

      // Background: vendor save
      if (vendor.trim()) {
        saveVendor.mutateAsync(vendor.trim()).catch(() => {});
      }

      // Background: sub-payment sync
      const newJobId = fd.get("jobId");
      if (category === "Subcontractor" && newJobId && subcontractorId) {
        const jobIdSync = parseInt(newJobId as string);
        const subIdSync = parseInt(subcontractorId);
        const amount    = parseFloat(fd.get("amount") as string);
        const date      = fd.get("date") as string;
        (async () => {
          try {
            const payRes = await fetch(`${API}/jobs/${jobIdSync}/sub-payments`);
            if (payRes.ok) {
              const payRows = await payRes.json();
              const row = Array.isArray(payRows) ? payRows.find((r: any) => r.subcontractorId === subIdSync) : null;
              if (row && (row.amountPaid ?? 0) < 0.01) {
                await fetch(`${API}/jobs/${jobIdSync}/sub-payments/${subIdSync}`, {
                  method: "PUT", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ amountPaid: amount, paidDate: date, paidNotes: "Synced from Expenses page" }),
                });
                toast({ title: "Job card updated", description: "Sub marked as paid on the job card." });
              }
            }
          } catch {
            // Non-fatal
          }
        })();
      }

      // Background invalidation — marks cache stale so a background refetch fills in any gaps
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });

    } catch {
      setUploadError("Failed to save expense. Please try again.");
    }
  };

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if ((deleteTarget as any)._source === "sub_payment_record") {
        await deleteSpr.mutateAsync((deleteTarget as any)._sprId);
      } else {
        await deleteExpense.mutateAsync(deleteTarget.id);
      }
      if (viewExpense?.id === deleteTarget.id) setViewExpense(null);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Expenses</h1>
          <p className="text-muted-foreground mt-1">Track materials, tools, and subs with receipt documentation.</p>
        </div>
        {canEdit("expenses") && (
          <div className="flex gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm transition-all border border-border"
            >
              <Upload className="w-4 h-4 mr-2" /> Import
            </button>
            {isMobile ? (
              <>
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={scanningReceipt}
                  className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm transition-all border border-border disabled:opacity-60"
                >
                  {scanningReceipt
                    ? <><span className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />Reading…</>
                    : <><Camera className="w-4 h-4 mr-2" />Take Photo</>}
                </button>
                <button
                  onClick={() => scanReceiptInputRef.current?.click()}
                  disabled={scanningReceipt}
                  className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm transition-all border border-border disabled:opacity-60"
                >
                  <Upload className="w-4 h-4 mr-2" />Choose File
                </button>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleReceiptScan(f); e.target.value = ""; }}
                />
              </>
            ) : (
              <button
                onClick={() => scanReceiptInputRef.current?.click()}
                disabled={scanningReceipt}
                className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm transition-all border border-border disabled:opacity-60"
              >
                {scanningReceipt
                  ? <><span className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />Reading…</>
                  : <><Camera className="w-4 h-4 mr-2" />Scan Receipt</>}
              </button>
            )}
            <input
              ref={scanReceiptInputRef}
              type="file"
              accept="image/*,application/pdf,.heic,.heif"
              className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleReceiptScan(f); }}
            />
            <button
              onClick={openDialog}
              className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95"
            >
              <Plus className="w-5 h-5 mr-2" /> Log Expense
            </button>
          </div>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by description, vendor, or amount…"
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-border/60 bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {filterCategory && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-50 border border-violet-200 text-sm text-violet-800">
          <span className="font-semibold">Filtered by category:</span>
          <span className="font-bold">{filterCategory}</span>
          <button
            onClick={() => { setFilterCategory(""); window.history.replaceState({}, "", window.location.pathname); }}
            className="ml-auto flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-semibold"
          >
            Clear filter ×
          </button>
        </div>
      )}

      <BusinessTripsSection
        year={selectedYear}
        jobs={jobs ?? []}
        onAddReceipt={(tripId, tripPurpose, tripJobId) => openDialogForTrip(tripId, tripPurpose, tripJobId)}
      />

      <Card className="border-border/50 shadow-md overflow-hidden bg-card">

        {/* ── Year tabs ─────────────────────────────────────────────────────── */}
        {allYears.length > 0 && (
          <div className="flex items-center gap-1 px-5 pt-4 pb-3 border-b border-border/50 overflow-x-auto">
            {allYears.map(year => (
              <button
                key={year}
                onClick={() => { setSelectedYear(year); setMonthCollapsed(initMonthCollapsed(year)); }}
                className={`flex-shrink-0 px-4 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                  selectedYear === year
                    ? "bg-amber-500 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        )}

        {/* ── Annual summary banner ──────────────────────────────────────────── */}
        {!isLoading && (
          <div className="px-6 py-2.5 border-b border-border/40 bg-muted/20 flex items-center gap-2 text-sm flex-wrap">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="font-bold text-foreground">{selectedYear}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {filteredYearExpenses.length}{searchQuery.trim() ? ` of ${yearExpenses.length}` : ""} {filteredYearExpenses.length === 1 ? "expense" : "expenses"}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-bold text-foreground">{formatCurrency(yearTotal)} total</span>
            {filteredYearExpenses.some(e => e.category !== "mileage") && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground text-xs">
                  {formatCurrency(filteredYearExpenses.filter(e => e.category !== "mileage").reduce((s, e) => s + parseFloat(String(e.amount ?? "0")), 0))} excl. mileage
                </span>
              </>
            )}
          </div>
        )}

        {/* ── Month sections ─────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="px-6 py-10 text-center text-muted-foreground animate-pulse text-sm">
            Loading expenses…
          </div>
        ) : monthlyGroups.length === 0 ? (
          <div className="px-6 py-14 text-center text-muted-foreground">
            {(searchQuery.trim() || filterCategory)
              ? <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
              : <Receipt className="w-8 h-8 mx-auto mb-2 opacity-20" />
            }
            <p className="text-sm">
              {(() => {
                const parts: string[] = [];
                if (searchQuery.trim()) parts.push(`"${searchQuery.trim()}"`);
                if (filterCategory) parts.push(`category "${filterCategory}"`);
                return parts.length > 0
                  ? `No expenses in ${selectedYear} match ${parts.join(" + ")}`
                  : `No expenses logged for ${selectedYear}`;
              })()}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {monthlyGroups.map(({ key, expenses: monthExp, total: monthTotal, label }) => {
              const isCollapsed = monthCollapsed[key] !== false;
              return (
                <div key={key}>
                  {/* Month header */}
                  <div
                    className="flex items-center justify-between px-6 py-3 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                    onClick={() => toggleMonth(key)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isCollapsed
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        : <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      }
                      <span className="font-semibold text-sm text-foreground">{label}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
                        {monthExp.length} {monthExp.length === 1 ? "expense" : "expenses"}
                      </span>
                    </div>
                    <span className="font-bold text-sm text-foreground ml-4 flex-shrink-0">
                      {formatCurrency(monthTotal)}
                    </span>
                  </div>

                  {/* Month table */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto custom-scrollbar border-t border-border/30">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-muted/40 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                          <tr>
                            <th className="px-6 py-3">Date</th>
                            <th className="px-6 py-3">Description / Vendor</th>
                            <th className="px-6 py-3">Category</th>
                            <th className="px-6 py-3 text-right">Amount</th>
                            <th className="px-6 py-3 text-center">Receipt</th>
                            <th className="px-6 py-3 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {monthExp.map(exp => {
                            const isEditing = editingRow?.id === exp.id;
                            if (false && isEditing) {
                              return (
                                <tr key={exp.id} className="bg-amber-500/5 border-l-2 border-amber-500">
                                  <td className="px-3 py-2">
                                    <input type="date" value={editingRow!.date}
                                      onChange={e => setEditingRow(r => r && ({ ...r, date: e.target.value }))}
                                      className="w-full px-2 py-1 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-amber-400" />
                                  </td>
                                  <td className="px-3 py-2 space-y-1">
                                    <input type="text" value={editingRow!.description}
                                      onChange={e => setEditingRow(r => r && ({ ...r, description: e.target.value }))}
                                      className="w-full px-2 py-1 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-amber-400"
                                      placeholder="Description" />
                                    <VendorCombobox value={editingRow!.vendor} onChange={v => setEditingRow(r => r && ({ ...r, vendor: v }))} />
                                  </td>
                                  <td className="px-3 py-2">
                                    <select value={editingRow!.category}
                                      onChange={e => setEditingRow(r => r && ({ ...r, category: e.target.value }))}
                                      className="w-full px-2 py-1 text-xs rounded-lg border border-border bg-background outline-none">
                                      {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="relative">
                                      <span className="absolute left-2 top-1.5 text-xs text-muted-foreground">$</span>
                                      <input type="number" step="0.01" min="0" value={editingRow!.amount}
                                        onChange={e => setEditingRow(r => r && ({ ...r, amount: e.target.value }))}
                                        className="w-full pl-5 pr-2 py-1 text-xs text-right rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-amber-400" />
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 space-y-1">
                                    {editReceiptFile ? (
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-emerald-600 font-medium truncate max-w-[80px]" title={editReceiptFile!.name}>{editReceiptFile!.name}</span>
                                        <button type="button" onClick={() => { setEditReceiptFile(null); if (editReceiptInputRef.current) editReceiptInputRef.current.value = ""; }}
                                          className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
                                      </div>
                                    ) : exp.receiptUrl ? (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <button type="button" onClick={() => {
                                          const base = import.meta.env.BASE_URL.replace(/\/$/, "");
                                          const url = exp.receiptUrl!.startsWith("http") ? exp.receiptUrl! : `${base}${exp.receiptUrl!}`;
                                          if (/\.pdf$/i.test(url.split("?")[0])) {
                                            window.open(url, "_blank", "noopener,noreferrer");
                                            return;
                                          }
                                          setEditLightboxImgError(false);
                                          setEditLightboxUrl(url);
                                        }} className="text-xs text-primary hover:underline flex items-center gap-1">
                                          <ImageIcon className="w-3 h-3" />View
                                        </button>
                                        <button type="button" onClick={() => editReceiptInputRef.current?.click()}
                                          className="text-xs text-muted-foreground hover:text-amber-500 flex items-center gap-1">
                                          <Upload className="w-3 h-3" />Replace
                                        </button>
                                        {googleConfigured && (
                                          <button type="button" onClick={handleDrivePickEdit} disabled={drivePickingEdit}
                                            className="text-xs text-muted-foreground hover:text-blue-600 flex items-center gap-1 disabled:opacity-60">
                                            {drivePickingEdit ? (
                                              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                              <svg className="w-3 h-3" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                                                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                                                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                                                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                                                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                                                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                                                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                                              </svg>
                                            )}
                                            Drive
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => editReceiptInputRef.current?.click()}
                                          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                                          <Upload className="w-3 h-3" />Add Receipt
                                        </button>
                                        {googleConfigured && (
                                          <button type="button" onClick={handleDrivePickEdit} disabled={drivePickingEdit}
                                            className="text-xs text-muted-foreground hover:text-blue-600 flex items-center gap-1 disabled:opacity-60">
                                            {drivePickingEdit ? (
                                              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                              <svg className="w-3 h-3" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                                                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                                                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                                                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                                                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                                                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                                                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                                              </svg>
                                            )}
                                            Drive
                                          </button>
                                        )}
                                      </div>
                                    )}
                                    <input ref={editReceiptInputRef} type="file" className="hidden"
                                      accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,image/gif,image/webp,image/bmp,image/tiff,.pdf"
                                      onChange={e => { const f = e.target.files?.[0]; if (f) setEditReceiptFile(f); }} />
                                    <select value={editingRow!.jobId}
                                      onChange={e => setEditingRow(r => r && ({ ...r, jobId: e.target.value }))}
                                      className="w-full px-2 py-1 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-amber-400 mt-1">
                                      <option value="">— No job —</option>
                                      {(jobs ?? []).filter((j: any) => j.status !== "completed" && j.status !== "cancelled")
                                        .map((j: any) => <option key={j.id} value={String(j.id)}>{formatJobLabel(j)}</option>)}
                                      {(jobs ?? []).some((j: any) => j.status === "completed" || j.status === "cancelled") && (
                                        <optgroup label="Closed">
                                          {(jobs ?? []).filter((j: any) => j.status === "completed" || j.status === "cancelled")
                                            .map((j: any) => <option key={j.id} value={String(j.id)}>{formatJobLabel(j)}</option>)}
                                        </optgroup>
                                      )}
                                    </select>
                                    <input type="text" value={editingRow!.notes}
                                      onChange={e => setEditingRow(r => r && ({ ...r, notes: e.target.value }))}
                                      className="w-full px-2 py-1 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-amber-400"
                                      placeholder="Notes" />
                                    <label className="flex items-center gap-1.5 cursor-pointer mt-1">
                                      <input
                                        type="checkbox"
                                        checked={editingRow!.excludeFromNetProfit}
                                        onChange={e => setEditingRow(r => r && ({ ...r, excludeFromNetProfit: e.target.checked }))}
                                        className="w-3 h-3 accent-amber-500"
                                      />
                                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                        <EyeOff className="w-2.5 h-2.5" /> Write-off
                                      </span>
                                    </label>
                                    <div className="flex items-center gap-0.5 mt-1">
                                      {[
                                        { val: "", label: "—" },
                                        { val: "general_contracting", label: "GC" },
                                        { val: "asphalt_sealing", label: "AS" },
                                      ].map(({ val, label }) => (
                                        <button
                                          key={val}
                                          type="button"
                                          title={val === "" ? "Untagged" : val === "general_contracting" ? "General Contracting" : "Asphalt Sealing"}
                                          onClick={() => { const biz = businesses.find((b: any) => b.slug === val); setEditingRow(r => r && ({ ...r, businessLine: val, businessId: biz?.id ?? null })); }}
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                            editingRow!.businessLine === val
                                              ? val === "asphalt_sealing" ? "bg-amber-500 text-white" : val === "general_contracting" ? "bg-blue-600 text-white" : "bg-muted text-foreground"
                                              : "text-muted-foreground hover:bg-muted"
                                          }`}
                                        >
                                          {label}
                                        </button>
                                      ))}
                                      <span className="text-[10px] text-muted-foreground ml-0.5">Line</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        onClick={async () => {
                                          await updateExpense.mutateAsync({
                                            id: editingRow!.id,
                                            data: {
                                              description: editingRow!.description,
                                              amount: parseFloat(editingRow!.amount),
                                              date: editingRow!.date,
                                              category: editingRow!.category,
                                              vendor: editingRow!.vendor || undefined,
                                              jobId: editingRow!.jobId ? parseInt(editingRow!.jobId) : undefined,
                                              notes: editingRow!.notes || undefined,
                                              receiptUrl: exp.receiptUrl,
                                              excludeFromNetProfit: editingRow!.excludeFromNetProfit,
                                              countsTowardJobProfit: editingRow!.countsTowardJobProfit,
                                              businessLine: editingRow!.businessLine || null,
                                              businessId: editingRow!.businessId,
                                            },
                                          });
                                          if (editReceiptFile) {
                                            await uploadMutation.mutateAsync({ id: editingRow!.id, data: { receipt: editReceiptFile } });
                                          }
                                          await qc.invalidateQueries({ queryKey: ["/api/expenses"] });
                                          if (editingRow!.vendor.trim()) saveVendor.mutate(editingRow!.vendor.trim());
                                          setEditReceiptFile(null);
                                          setEditingRow(null);
                                        }}
                                        disabled={updateExpense.isPending || uploadMutation.isPending}
                                        className="px-2 py-1 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors">
                                        {updateExpense.isPending || uploadMutation.isPending ? "…" : "Save"}
                                      </button>
                                      <button
                                        onClick={() => { setEditReceiptFile(null); setEditingRow(null); }}
                                        className="w-6 h-6 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }
                            const expBiz = getExpenseBiz(exp, businesses);
                            const bizColorClass = expBiz ? BIZ_BADGE_COLORS[expBiz.idx % BIZ_BADGE_COLORS.length] : null;
                            return (
                              <tr key={exp.id}
                                onClick={() => { if (!isEditing) setViewExpense(exp); }}
                                className={`hover:bg-muted/30 transition-colors cursor-pointer group${isEditing ? " bg-amber-50/60 dark:bg-amber-900/10 ring-2 ring-inset ring-amber-400" : ""}`}>
                                <td className="px-6 py-4 text-muted-foreground">{formatDate(exp.date)}</td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-foreground group-hover:text-primary transition-colors">{exp.description}</span>
                                    {exp.excludeFromNetProfit && (
                                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-amber-200 flex-shrink-0">
                                        <EyeOff className="w-2.5 h-2.5" /> Write-off
                                      </span>
                                    )}
                                    {exp.countsTowardJobProfit === false && (
                                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-blue-200 flex-shrink-0">
                                        <FileText className="w-2.5 h-2.5" /> Audit Trail
                                      </span>
                                    )}
                                    {exp.recurringExpenseId && (
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); jumpToTemplate(exp.recurringExpenseId!); }}
                                        title="View recurring template"
                                        className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-blue-100 flex-shrink-0 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
                                      >
                                        <RotateCcw className="w-2.5 h-2.5" /> Recurring ↓
                                      </button>
                                    )}
                                    {(exp as any)._source === "sub_payment_record" ? (
                                      <span className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-violet-200 flex-shrink-0" title="Recorded via Pay-Worker on the job card">
                                        <HardHat className="w-2.5 h-2.5" /> Pay-Worker
                                      </span>
                                    ) : (exp as any).subcontractorName && exp.category?.toLowerCase() === "subcontractor" && !(exp as any).jobSubHoursId && (
                                      <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-indigo-100 flex-shrink-0">
                                        <HardHat className="w-2.5 h-2.5" /> Sub Payment
                                      </span>
                                    )}
                                    {(exp as any).jobSubHoursId && (
                                      <span className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-violet-200 flex-shrink-0" title="Auto-created from sub hours logged on the job card. Edit hours on the job to update.">
                                        <HardHat className="w-2.5 h-2.5" /> Auto • Hours
                                      </span>
                                    )}
                                    {!activeBusiness && (
                                      expBiz
                                        ? <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${bizColorClass}`}>
                                            <Briefcase className="w-2.5 h-2.5" /> {expBiz.name}
                                          </span>
                                        : <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-orange-200 flex-shrink-0">
                                            <AlertTriangle className="w-2.5 h-2.5" /> No business
                                          </span>
                                    )}
                                  </div>
                                  {exp.vendor && (
                                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <Store className="w-3 h-3" /> {exp.vendor}
                                    </div>
                                  )}
                                  {(exp as any).subcontractorName && (
                                    <div className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                                      <HardHat className="w-3 h-3" /> {(exp as any).subcontractorName}
                                    </div>
                                  )}
                                  {(exp as any).jobTitle && (
                                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <Briefcase className="w-3 h-3" /> {(exp as any).jobTitle}
                                    </div>
                                  )}
                                  {(exp as any)._source !== "sub_payment_record" && canEdit("expenses") && (
                                    <TripLinkButton
                                      exp={exp}
                                      trips={allTrips}
                                      isPending={linkExpenseToTrip.isPending}
                                      onLink={async (tripId) => {
                                        try {
                                          await linkExpenseToTrip.mutateAsync({ id: (exp as any).id, tripId });
                                          toast({ title: "Linked to trip", description: `Expense added to ${allTrips.find(t => t.id === tripId)?.destination ?? "trip"}.` });
                                        } catch (err: any) {
                                          toast({ title: "Could not link", description: err?.message ?? "Please try again.", variant: "destructive" });
                                        }
                                      }}
                                      onUnlink={async () => {
                                        const prevTripId = (exp as any).tripId;
                                        try {
                                          await linkExpenseToTrip.mutateAsync({ id: (exp as any).id, tripId: null });
                                          if (prevTripId) qc.invalidateQueries({ queryKey: ["trip-receipts", prevTripId] });
                                          toast({ title: "Unlinked from trip" });
                                        } catch (err: any) {
                                          toast({ title: "Could not unlink", description: err?.message ?? "Please try again.", variant: "destructive" });
                                        }
                                      }}
                                    />
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${CATEGORY_COLORS[exp.category] ?? "bg-gray-100 text-gray-600"}`}>
                                    {exp.category}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right font-display font-semibold text-foreground">{formatCurrency(exp.amount)}</td>
                                <td className="px-6 py-4 text-center" onClick={e => e.stopPropagation()}>
                                  {exp.receiptUrl ? (
                                    <button
                                      type="button"
                                      onClick={() => openReceiptLightbox(exp.receiptUrl!)}
                                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 bg-primary/8 hover:bg-primary/15 px-3 py-1.5 rounded-lg transition-colors border border-primary/20 hover:border-primary/40"
                                    >
                                      <ImageIcon className="w-3 h-3" /> View
                                    </button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">No receipt</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-center" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center justify-center gap-2">
                                    <button onClick={() => setViewExpense(exp)}
                                      className="text-muted-foreground hover:text-primary transition-colors" title="View expense">
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    {(exp as any)._source === "sub_payment_record" ? (
                                      canEdit("expenses") ? (
                                        <button onClick={() => setDeleteTarget(exp)}
                                          className="text-muted-foreground hover:text-destructive transition-colors" title="Delete payment record">
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground italic">Pay-Worker</span>
                                      )
                                    ) : canEdit("expenses") && !(exp as any).jobSubHoursId ? (
                                      <>
                                        <button onClick={() => { setEditReceiptFile(null); setEditingRow({
                                            id: exp.id,
                                            description: exp.description ?? "",
                                            amount: String(exp.amount ?? ""),
                                            date: (exp.date ?? "").slice(0, 10),
                                            category: exp.category ?? CATEGORIES[0],
                                            vendor: exp.vendor ?? "",
                                            jobId: exp.jobId ? String(exp.jobId) : "",
                                            notes: exp.notes ?? "",
                                            excludeFromNetProfit: exp.excludeFromNetProfit ?? false,
                                            countsTowardJobProfit: exp.countsTowardJobProfit ?? true,
                                            businessId: (exp as any).businessId ?? null,
                                            businessLine: exp.businessLine ?? "",
                                          }); }}
                                          className="text-muted-foreground hover:text-amber-500 transition-colors" title="Edit expense">
                                          <Pencil className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => setDeleteTarget(exp)}
                                          className="text-muted-foreground hover:text-destructive transition-colors" title="Delete expense">
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </>
                                    ) : (exp as any).jobSubHoursId ? (
                                      <span className="text-[10px] text-muted-foreground italic" title="Managed from sub hours on the job card">
                                        From job card
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Recurring Expenses Section */}
      <div id="recurring-section">
        <RecurringSection
          jobs={jobs ?? []}
          highlightedTemplateId={highlightedTemplateId}
          onClearHighlight={() => setHighlightedTemplateId(null)}
        />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={open => {
        setIsDialogOpen(open);
        if (!open) {
          setReceiptFile(null);
          setPrefillAmount("");
          setPrefillDate("");
          setPrefillDesc("");
          setPrefillNotes("");
          setDialogMode("manual");
        }
      }}>
        <DialogContent className="max-w-md bg-card border-border shadow-2xl p-6 rounded-2xl flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">
              {dialogMode === "scan" ? "Review Scanned Receipt" : "Log Expense"}
            </DialogTitle>
          </DialogHeader>
          <form key={prefillKey} id="expense-form" onSubmit={handleSubmit} className="space-y-4 mt-4 overflow-y-auto flex-1">
            {dialogMode === "scan" && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                <Camera className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                AI read your receipt — review and correct the fields below before saving.
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                  <input
                    name="amount" type="number" step="0.01" required min="0"
                    defaultValue={prefillAmount}
                    className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date *</label>
                <input
                  name="date" type="date" required defaultValue={prefillDate || localDateString()}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description *</label>
              <input
                name="description" required
                defaultValue={prefillDesc}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. Lumber for framing"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Vendor
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">(saved for reuse)</span>
                </label>
                <VendorCombobox value={vendor} onChange={setVendor} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category *</label>
                <select
                  name="category" required value={category}
                  onChange={e => {
                    const val = e.target.value;
                    setCategory(val);
                    if (val === "Owner Draw") setExcludeFromNetProfit(true);
                    if (formJobId && isTravelCategory(val)) setCountsTowardJobProfit(false);
                    else if (!isTravelCategory(val)) setCountsTowardJobProfit(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Allocate to Job <span className="font-normal text-muted-foreground">(Optional)</span></label>
              <select name="jobId" value={formJobId} onChange={e => {
                const newJobId = e.target.value;
                setFormJobId(newJobId);
                if (newJobId && isTravelCategory(category)) setCountsTowardJobProfit(false);
                else if (!newJobId) setCountsTowardJobProfit(true);
              }} className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none">
                <option value="">— None (Overhead) —</option>
                {jobs?.map(j => <option key={j.id} value={j.id}>{formatJobLabel(j)}</option>)}
              </select>
            </div>

            {subs && subs.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1 flex items-center gap-1.5">
                  <HardHat className="w-3.5 h-3.5 text-muted-foreground" />
                  Assign to Subcontractor
                  <span className="font-normal text-muted-foreground">(Optional)</span>
                </label>
                <select
                  value={subcontractorId}
                  onChange={e => setSubcontractorId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">— Not assigned —</option>
                  {subs.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.trade ? ` · ${s.trade}` : ""}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">This expense will appear in the subcontractor's portal and on the P&L.</p>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-1.5">Only use this for payments <strong>not</strong> already recorded on a job card — recording both will double-count on the P&L and the sub's YTD.</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">
                {isTravelCategory(category) ? "Business purpose" : "Notes"}
              </label>
              <input
                name="notes"
                defaultValue={prefillNotes}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                placeholder={isTravelCategory(category) ? "Business purpose (required for IRS — e.g. client meeting, site inspection)" : "Optional notes"}
              />
            </div>

            {/* ── Trip context (shown when trip pre-fill is active) */}
            {prefillTripId && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
                <Briefcase className="w-3.5 h-3.5 flex-shrink-0 text-blue-600" />
                <span>This expense will be filed under the selected business trip.</span>
              </div>
            )}

            {/* ── Travel/meal extra fields */}
            {isTravelCategory(category) && (
              <div className="space-y-3 p-3 rounded-xl bg-teal-50/60 border border-teal-100">
                <p className="text-[11px] font-semibold text-teal-700 uppercase tracking-widest">IRS Travel Documentation</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Paid By</label>
                    <select
                      value={paidBy}
                      onChange={e => setPaidBy(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">— Select —</option>
                      {PAID_BY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  {isMealCategory(category) && (
                    <div>
                      <label className="block text-xs font-medium mb-1">Number of People</label>
                      <input
                        type="number"
                        min="1"
                        value={mealNumPeople}
                        onChange={e => setMealNumPeople(e.target.value)}
                        placeholder="How many people at this meal?"
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  )}
                </div>

                {/* Overnight travel toggle — required for IRS meal deductibility */}
                <div>
                  <label className="block text-xs font-medium mb-1.5">
                    Overnight travel? <span className="text-muted-foreground font-normal">(IRS requires this to deduct meals)</span>
                  </label>
                  <div className="flex gap-2">
                    {([{ v: true, label: "Yes — overnight" }, { v: false, label: "No — day trip" }, { v: null, label: "Not sure" }] as const).map(opt => (
                      <button
                        key={String(opt.v)}
                        type="button"
                        onClick={() => setOvernightTravel(opt.v)}
                        className={`flex-1 px-2 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                          overnightTravel === opt.v
                            ? opt.v === true ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                              : opt.v === false ? "border-amber-400 bg-amber-50 text-amber-700"
                              : "border-blue-300 bg-blue-50 text-blue-700"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {isMealCategory(category) && overnightTravel === false && (
                    <p className="mt-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      ⚠ Day-trip meals are typically non-deductible unless you can document a clear business reason (IRS Pub. 463). This expense is flagged as potentially non-deductible.
                    </p>
                  )}
                </div>

                {isMealCategory(category) && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1">Tip Amount <span className="font-normal text-muted-foreground">(optional)</span></label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={tipAmount}
                          onChange={e => setTipAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Tax Amount <span className="font-normal text-muted-foreground">(optional)</span></label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={taxAmount}
                          onChange={e => setTaxAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-teal-700 bg-white/70 rounded-lg px-2.5 py-1.5 border border-teal-100">
                      Meals are 50% deductible — the deductible amount is calculated automatically.
                    </p>
                  </>
                )}
                <div>
                  <label className="block text-xs font-medium mb-1">Receipt Status</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setReceiptStatus("uploaded")}
                      className={`flex-1 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${receiptStatus === "uploaded" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-border text-muted-foreground hover:border-emerald-300"}`}
                    >
                      ✓ Receipt Uploaded
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptStatus("missing")}
                      className={`flex-1 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${receiptStatus === "missing" ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border text-muted-foreground hover:border-amber-300"}`}
                    >
                      ⚠ Receipt Missing
                    </button>
                  </div>
                </div>
                {receiptStatus === "missing" && (
                  <div>
                    <label className="block text-xs font-medium mb-1">Explanation (required for IRS)</label>
                    <input
                      type="text"
                      value={receiptMissingExpl}
                      onChange={e => setReceiptMissingExpl(e.target.value)}
                      placeholder="e.g. Receipt lost — credit card statement attached"
                      className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-background text-sm outline-none focus:ring-2 focus:ring-amber-200"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Business line toggle — hidden when a specific business is active (auto-assigned) */}
            {!activeBusiness && (
            <div>
              <label className="block text-sm font-medium mb-1.5">Business Line <span className="text-xs font-normal text-muted-foreground">(optional)</span></label>
              <div className="flex flex-wrap items-center gap-1 p-0.5 bg-muted/50 rounded-lg border border-border w-fit">
                <button
                  type="button"
                  onClick={() => setBusinessLine(undefined)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    !businessLine
                      ? "bg-white text-gray-800 shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Untagged
                </button>
                {businesses.map(b => (
                  <button
                    key={b.slug}
                    type="button"
                    onClick={() => setBusinessLine(b.slug)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      businessLine === b.slug
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
            )}

            {category === "Owner Draw" ? (
              <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-amber-200 bg-amber-50/60">
                <div className="mt-0.5 flex-shrink-0 w-10 h-6 rounded-full relative bg-amber-500 opacity-70 cursor-not-allowed">
                  <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow translate-x-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-800 flex items-center gap-1.5">
                    <EyeOff className="w-3.5 h-3.5 text-amber-600" /> Always excluded from net profit
                  </p>
                  <p className="text-xs text-amber-700/70 mt-0.5">Owner draws are personal distributions — not a deductible business expense</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/30">
                <button
                  type="button"
                  onClick={() => setExcludeFromNetProfit(v => !v)}
                  className={`mt-0.5 flex-shrink-0 w-10 h-6 rounded-full transition-colors relative ${excludeFromNetProfit ? "bg-amber-500" : "bg-muted-foreground/30"}`}
                  aria-pressed={excludeFromNetProfit}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${excludeFromNetProfit ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <EyeOff className="w-3.5 h-3.5 text-amber-500" /> Exclude from net profit view
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Still counts for taxes — only hidden from the dashboard profit card</p>
                </div>
              </div>
            )}
            {(() => {
              const hasJob = !!formJobId;
              if (!hasJob || category === "Owner Draw") return null;
              return (
                <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-blue-200 bg-blue-50/60">
                  <button
                    type="button"
                    onClick={() => setCountsTowardJobProfit(v => !v)}
                    className={`mt-0.5 flex-shrink-0 w-10 h-6 rounded-full transition-colors relative ${!countsTowardJobProfit ? "bg-blue-500" : "bg-muted-foreground/30"}`}
                    aria-pressed={!countsTowardJobProfit}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${!countsTowardJobProfit ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-blue-900 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-blue-600" /> Tax audit trail only
                    </p>
                    <p className="text-xs text-blue-700/80 mt-0.5">Links to job for tax records but <strong>does not reduce job profit</strong></p>
                  </div>
                </div>
              );
            })()}

            <div className="pt-2 border-t border-dashed border-border">
              <label className="block text-sm font-medium mb-2 flex items-center gap-2 text-primary">
                <ImageIcon className="w-4 h-4" /> Receipt Photo / PDF
                <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
              </label>
              <ReceiptDropZone
                file={receiptFile}
                onFile={setReceiptFile}
                onClear={() => setReceiptFile(null)}
                showDrive={googleConfigured}
                onDriveClick={handleDrivePickNew}
                driveLoading={drivePickingNew}
              />
            </div>

            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
          </form>

          <div className="pt-4 border-t border-dashed border-border flex justify-end gap-3 flex-shrink-0">
            <button type="button" onClick={() => { setIsDialogOpen(false); setReceiptFile(null); }}
              className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              form="expense-form"
              disabled={createMutation.isPending || uploadMutation.isPending}
              className="px-6 py-2 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md"
            >
              {createMutation.isPending || uploadMutation.isPending ? "Saving…" : "Save Expense"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Expense View Modal */}
      {viewExpense && (
        <ExpenseViewModal
          expense={viewExpense}
          onClose={() => setViewExpense(null)}
          onDelete={() => {
            setDeleteTarget(viewExpense);
            setViewExpense(null);
          }}
          onJumpToTemplate={id => { setViewExpense(null); jumpToTemplate(id); }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <ExpenseDeleteConfirm
          expense={deleteTarget}
          deleting={deleting}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Import Dialog */}
      <ExpenseImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { setImportOpen(false); refetch(); }}
      />

      {/* Edit Expense Modal */}
      {editingRow && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) { setEditReceiptFile(null); setEditingRow(null); } }}
        >
          <div className="bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg border border-border flex flex-col max-h-[92vh]">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
              <h3 className="font-bold text-base">Edit Expense</h3>
              <button onClick={() => { setEditReceiptFile(null); setEditingRow(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Date</label>
                  <input type="date" value={editingRow!.date}
                    onChange={e => setEditingRow(r => r && ({ ...r, date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-amber-400/50" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">$</span>
                    <input type="number" step="0.01" min="0" value={editingRow!.amount}
                      onChange={e => setEditingRow(r => r && ({ ...r, amount: e.target.value }))}
                      className="w-full pl-7 pr-3 py-2 text-sm rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-amber-400/50" />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Description</label>
                <input type="text" value={editingRow!.description}
                  onChange={e => setEditingRow(r => r && ({ ...r, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-amber-400/50"
                  placeholder="What was this expense for?" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Vendor / Paid To</label>
                <VendorCombobox value={editingRow!.vendor} onChange={v => setEditingRow(r => r && ({ ...r, vendor: v }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Category</label>
                <select value={editingRow!.category}
                  onChange={e => setEditingRow(r => r && ({ ...r, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background outline-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Linked Job</label>
                <select value={editingRow!.jobId}
                  onChange={e => setEditingRow(r => r && ({ ...r, jobId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background outline-none">
                  <option value="">— No job linked —</option>
                  {(jobs ?? []).filter((j: any) => j.status !== "completed" && j.status !== "cancelled")
                    .map((j: any) => <option key={j.id} value={String(j.id)}>{formatJobLabel(j)}</option>)}
                  {(jobs ?? []).some((j: any) => j.status === "completed" || j.status === "cancelled") && (
                    <optgroup label="Closed">
                      {(jobs ?? []).filter((j: any) => j.status === "completed" || j.status === "cancelled")
                        .map((j: any) => <option key={j.id} value={String(j.id)}>{formatJobLabel(j)}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Notes</label>
                <input type="text" value={editingRow!.notes}
                  onChange={e => setEditingRow(r => r && ({ ...r, notes: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-amber-400/50"
                  placeholder="Optional notes" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Business Line</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { val: "", label: "Untagged" },
                    ...businesses.map(b => ({ val: b.slug, label: b.name })),
                  ].map(({ val, label }, mapIdx) => (
                    <button key={val} type="button"
                      onClick={() => { const biz = businesses.find((b: any) => b.slug === val); setEditingRow(r => r && ({ ...r, businessLine: val, businessId: biz?.id ?? null })); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        editingRow!.businessLine === val
                          ? mapIdx === 0 ? "bg-muted text-foreground border-border" : ["bg-blue-100 text-blue-800 border-blue-400", "bg-amber-100 text-amber-800 border-amber-400", "bg-violet-100 text-violet-800 border-violet-400"][(mapIdx - 1) % 3]
                          : "text-muted-foreground border-border hover:bg-muted"
                      }`}>{label}</button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer py-1">
                <input type="checkbox" checked={editingRow!.excludeFromNetProfit}
                  onChange={e => setEditingRow(r => r && ({ ...r, excludeFromNetProfit: e.target.checked }))}
                  className="w-4 h-4 accent-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5"><EyeOff className="w-3.5 h-3.5" /> Write-off</p>
                  <p className="text-xs text-muted-foreground">Exclude this expense from net profit calculation</p>
                </div>
              </label>
              {editingRow!.jobId && editingRow!.category !== "Owner Draw" && (
                <label className="flex items-center gap-3 cursor-pointer py-1">
                  <input type="checkbox" checked={!editingRow!.countsTowardJobProfit}
                    onChange={e => setEditingRow(r => r && ({ ...r, countsTowardJobProfit: !e.target.checked }))}
                    className="w-4 h-4 accent-blue-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-blue-600" /> Tax audit trail only</p>
                    <p className="text-xs text-muted-foreground">Links expense to job for tax records without reducing job profit</p>
                  </div>
                </label>
              )}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Receipt</label>
                {editReceiptFile ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <span className="text-sm text-emerald-700 font-medium flex-1 truncate">{editReceiptFile!.name}</span>
                    <button type="button" onClick={() => { setEditReceiptFile(null); if (editReceiptInputRef.current) editReceiptInputRef.current.value = ""; }}
                      className="text-red-500 hover:text-red-700 flex-shrink-0"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => editReceiptInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      Upload Receipt
                    </button>
                    {googleConfigured && (
                      <button type="button" onClick={handleDrivePickEdit} disabled={drivePickingEdit}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-blue-600 hover:border-blue-300 transition-colors disabled:opacity-60">
                        {drivePickingEdit ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" /> : <svg className="w-3.5 h-3.5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/><path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/><path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/><path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/><path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/></svg>}
                        Google Drive
                      </button>
                    )}
                  </div>
                )}
                <input ref={editReceiptInputRef} type="file" className="hidden"
                  accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,image/gif,image/webp,image/bmp,image/tiff,.pdf"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setEditReceiptFile(f); }} />
              </div>
            </div>
            <div className="px-5 pb-5 pt-3 border-t border-border flex gap-3 flex-shrink-0">
              <button
                onClick={async () => {
                  if (!editingRow) return;
                  await updateExpense.mutateAsync({
                    id: editingRow!.id,
                    data: {
                      description: editingRow!.description,
                      amount: parseFloat(editingRow!.amount),
                      date: editingRow!.date,
                      category: editingRow!.category,
                      vendor: editingRow!.vendor || undefined,
                      jobId: editingRow!.jobId ? parseInt(editingRow!.jobId) : undefined,
                      notes: editingRow!.notes || undefined,
                      receiptUrl: undefined,
                      excludeFromNetProfit: editingRow!.excludeFromNetProfit,
                      countsTowardJobProfit: editingRow!.countsTowardJobProfit,
                      businessLine: editingRow!.businessLine || null,
                      businessId: editingRow!.businessId,
                    },
                  });
                  if (editReceiptFile) {
                    await uploadMutation.mutateAsync({ id: editingRow!.id, data: { receipt: editReceiptFile } });
                  }
                  await qc.invalidateQueries({ queryKey: ["/api/expenses"] });
                  if (editingRow!.vendor.trim()) saveVendor.mutate(editingRow!.vendor.trim());
                  setEditReceiptFile(null);
                  setEditingRow(null);
                }}
                disabled={updateExpense.isPending || uploadMutation.isPending}
                className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors text-sm">
                {updateExpense.isPending || uploadMutation.isPending ? "Saving…" : "Save Changes"}
              </button>
              <button
                onClick={() => { setEditReceiptFile(null); setEditingRow(null); }}
                className="px-5 py-3 rounded-xl border border-border text-sm text-muted-foreground font-semibold hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit-row receipt lightbox */}
      {editLightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 overflow-hidden"
          onClick={() => setEditLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditLightboxUrl(null); }}
            className="absolute z-10 right-4 flex items-center gap-1.5 text-white font-bold text-sm bg-black/70 hover:bg-black/90 px-4 py-2 rounded-xl border border-white/30 backdrop-blur-sm transition-colors"
            style={{ top: "max(16px, env(safe-area-inset-top, 16px))" }}
            aria-label="Close"
          >
            <X className="w-4 h-4" /> Close
          </button>

          {/* Content */}
          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden px-4"
            style={{ paddingTop: "calc(max(52px, env(safe-area-inset-top, 52px)) + 32px)" }}
          >
            {/\.(heic|heif)$/i.test(editLightboxUrl) ? (
              <div className="flex flex-col items-center gap-4 p-8 text-center" onClick={e => e.stopPropagation()}>
                <ImageIcon className="w-16 h-16 text-white/30" />
                <p className="text-white font-semibold text-lg">iPhone Photo (HEIC)</p>
                <p className="text-white/60 text-sm">Cannot preview in browser</p>
                <a href={editLightboxUrl} download
                  className="inline-flex items-center gap-2 px-5 py-3 bg-white text-gray-900 rounded-xl font-semibold hover:bg-gray-100 transition-colors">
                  <Download className="w-4 h-4" /> Download Receipt
                </a>
              </div>
            ) : /\.(jpg|jpeg|png|gif|webp|bmp|tiff?)$/i.test(editLightboxUrl) && !editLightboxImgError ? (
              <img
                src={editLightboxUrl}
                alt="Receipt"
                className="max-w-full max-h-full object-contain select-none"
                onClick={e => e.stopPropagation()}
                onError={() => setEditLightboxImgError(true)}
              />
            ) : /\.(jpg|jpeg|png|gif|webp|bmp|tiff?)$/i.test(editLightboxUrl) && editLightboxImgError ? (
              <div className="flex flex-col items-center gap-4 p-8 text-center" onClick={e => e.stopPropagation()}>
                <ImageIcon className="w-16 h-16 text-red-300" />
                <p className="text-white font-semibold text-lg">Receipt no longer available</p>
                <p className="text-white/70 text-sm">This file was lost in a previous deployment.<br/>Please close and re-upload the receipt.</p>
              </div>
            ) : (
              <div
                className="flex flex-col items-center gap-6 p-8 text-center rounded-2xl bg-white/8 border border-white/12 mx-4 w-full max-w-sm"
                onClick={e => e.stopPropagation()}
              >
                <Receipt className="w-16 h-16 text-white/30" />
                <div>
                  <p className="text-white font-semibold text-lg">Receipt PDF</p>
                  <p className="text-white/50 text-sm mt-1">Tap "Open PDF" to view in a new tab</p>
                </div>
                <div className="flex gap-3 flex-wrap justify-center">
                  <a
                    href={editLightboxUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors text-sm"
                  >
                    <ExternalLink className="w-4 h-4" /> Open PDF
                  </a>
                  <a
                    href={editLightboxUrl}
                    download
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-white/15 text-white rounded-xl font-semibold hover:bg-white/25 transition-colors text-sm"
                  >
                    <Download className="w-4 h-4" /> Download
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Bottom hint — safe area aware */}
          <div
            className="absolute left-0 right-0 text-center text-white/30 text-xs pointer-events-none"
            style={{ bottom: "max(16px, env(safe-area-inset-bottom, 16px))" }}
          >
            Tap anywhere outside to close
          </div>
        </div>
      )}

      {/* ── Quick Receipt Lightbox (from table "View" button) ──────────────── */}
      {receiptLightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 overflow-hidden"
          onClick={() => setReceiptLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setReceiptLightboxUrl(null); }}
            className="absolute z-10 right-4 flex items-center gap-1.5 text-white font-bold text-sm bg-black/70 hover:bg-black/90 px-4 py-2 rounded-xl border border-white/30 backdrop-blur-sm transition-colors"
            style={{ top: "max(16px, env(safe-area-inset-top, 16px))" }}
            aria-label="Close"
          >
            <X className="w-4 h-4" /> Close
          </button>

          {/* Content */}
          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden px-4"
            style={{ paddingTop: "calc(max(52px, env(safe-area-inset-top, 52px)) + 32px)" }}
          >
            {receiptLightboxIsPdf ? (
              <div
                className="flex flex-col items-center gap-6 p-8 text-center rounded-2xl bg-white/8 border border-white/12 mx-4 w-full max-w-sm"
                onClick={e => e.stopPropagation()}
              >
                <Receipt className="w-16 h-16 text-white/30" />
                <div>
                  <p className="text-white font-semibold text-lg">Receipt PDF</p>
                  <p className="text-white/50 text-sm mt-1">Tap "Open PDF" to view in a new tab</p>
                </div>
                <div className="flex gap-3 flex-wrap justify-center">
                  <a
                    href={receiptLightboxUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors text-sm"
                  >
                    <ExternalLink className="w-4 h-4" /> Open PDF
                  </a>
                  <a
                    href={receiptLightboxUrl}
                    download
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-white/15 text-white rounded-xl font-semibold hover:bg-white/25 transition-colors text-sm"
                  >
                    <Download className="w-4 h-4" /> Download
                  </a>
                </div>
              </div>
            ) : receiptLightboxImgError ? (
              <div className="flex flex-col items-center gap-3 text-center" onClick={e => e.stopPropagation()}>
                <ImageIcon className="w-16 h-16 text-red-300" />
                <p className="text-white font-semibold text-lg">Receipt no longer available</p>
                <p className="text-white/70 text-sm">Please close and re-upload the receipt.</p>
              </div>
            ) : (
              <img
                src={receiptLightboxUrl}
                alt="Receipt"
                className="max-w-full max-h-full object-contain select-none rounded-lg"
                onClick={e => e.stopPropagation()}
                onError={() => setReceiptLightboxImgError(true)}
              />
            )}
          </div>

          {/* Bottom hint */}
          <div
            className="absolute left-0 right-0 text-center text-white/30 text-xs pointer-events-none"
            style={{ bottom: "max(16px, env(safe-area-inset-bottom, 16px))" }}
          >
            Tap anywhere outside to close
          </div>
        </div>
      )}
    </div>
  );
}
