import { useState, useRef, useEffect } from "react";
import { useUserPermissions } from "@/contexts/UserPermissions";
import {
  useListMileageLogs,
  useGetMileageSummary,
  useCreateMileageLog,
  useDeleteMileageLog,
  useCreateExpense,
  useListJobs,
  useGetSettings,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate, localDateString } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  Navigation,
  MapPin,
  Calculator,
  Trash2,
  Briefcase,
  User,
  AlertCircle,
  CheckCircle2,
  PenLine,
  CalendarDays,
  LogIn,
} from "lucide-react";

interface ManualForm {
  date: string;
  startLocation: string;
  endLocation: string;
  miles: string;
  purpose: string;
  classification: "business" | "personal";
  jobId: string;
}

interface MonthlyForm {
  month: string;
  miles: string;
  tripCount: string;
  notes: string;
}

const today = localDateString();
const currentMonth = today.slice(0, 7);

function getMonthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function lastDayOfMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const d = new Date(parseInt(year), parseInt(month), 0);
  return `${ym}-${String(d.getDate()).padStart(2, "0")}`;
}

function is401(err: unknown): boolean {
  return (
    err != null &&
    typeof err === "object" &&
    "status" in err &&
    (err as { status: number }).status === 401
  );
}

export default function Mileage() {
  const { canEdit } = useUserPermissions();
  const queryClient = useQueryClient();
  const { data: logs, isLoading } = useListMileageLogs();
  const { data: summary } = useGetMileageSummary();
  const { data: jobs = [] } = useListJobs();
  const { data: settings } = useGetSettings();
  const createMileage = useCreateMileageLog();
  const deleteMileage = useDeleteMileageLog();
  const createExpense = useCreateExpense();

  const [activeTab, setActiveTab] = useState<"trip" | "monthly">("trip");
  const [savedMsg, setSavedMsg] = useState("");
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState("");
  const [manual, setManual] = useState<ManualForm>({
    date: today, startLocation: "", endLocation: "", miles: "",
    purpose: "", classification: "business", jobId: "",
  });

  const [monthlySaving, setMonthlySaving] = useState(false);
  const [monthlyError, setMonthlyError] = useState("");
  const [monthlyForm, setMonthlyForm] = useState<MonthlyForm>({
    month: currentMonth, miles: "", tripCount: "", notes: "",
  });

  const rate = parseFloat((settings as any)?.mileageRate ?? "0.725");
  const mileageUnits: string = (settings as any)?.mileageUnits ?? "miles";
  const mileageDefaultClassification: "business" | "personal" =
    (settings as any)?.mileageDefaultClassification === "personal" ? "personal" : "business";
  const mileageReminderFrequency: string = (settings as any)?.mileageReminderFrequency ?? "daily";

  const incompleteReminderTrips = (() => {
    if (mileageReminderFrequency === "never") return [];
    const cutoffDays = mileageReminderFrequency === "weekly" ? 7 : 1;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cutoffDays);
    const cutoffStr = localDateString(cutoff);
    return (logs as any[])?.filter(
      (l: any) => l.date >= cutoffStr && l.classification === "business" && !l.purpose
    ) ?? [];
  })();

  const notifSentRef = useRef(false);
  useEffect(() => {
    if (notifSentRef.current) return;
    if (incompleteReminderTrips.length === 0) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator)) return;
    notifSentRef.current = true;
    const count = incompleteReminderTrips.length;
    navigator.serviceWorker.ready
      .then(reg => reg.showNotification("BuildPro — Mileage Reminder", {
        body: `${count} business trip${count > 1 ? "s are" : " is"} missing a purpose. Tap to add details and strengthen your IRS records.`,
        icon: "/favicon.svg",
        badge: "/favicon.svg",
        tag: "mileage-reminder",
      }))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incompleteReminderTrips.length]);

  useEffect(() => {
    if (settings) {
      setManual(m => ({ ...m, classification: mileageDefaultClassification }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(settings as any)?.mileageDefaultClassification]);

  const handleSwitchTab = (tab: "trip" | "monthly") => {
    setActiveTab(tab);
    setManualError("");
    setMonthlyError("");
    setSessionExpired(false);
  };

  const saveManualTrip = async () => {
    if (!manual.date || !manual.miles || parseFloat(manual.miles) <= 0) {
      setManualError("Date and miles are required.");
      return;
    }
    setManualSaving(true);
    setManualError("");
    setSessionExpired(false);
    try {
      const miles = parseFloat(manual.miles);
      await createMileage.mutateAsync({
        data: {
          date: manual.date,
          miles,
          classification: manual.classification,
          startLocation: manual.startLocation || undefined,
          endLocation: manual.endLocation || undefined,
          purpose: manual.purpose || undefined,
          jobId: manual.jobId ? parseInt(manual.jobId) : undefined,
          source: "manual",
        },
      });

      if (manual.classification === "business") {
        const deduction = miles * rate;
        await createExpense.mutateAsync({
          data: {
            date: manual.date,
            description: `Mileage: ${manual.purpose || "Business trip"} (${miles.toFixed(2)} mi)`,
            vendor: "IRS Mileage",
            category: "mileage",
            amount: deduction,
            jobId: manual.jobId ? parseInt(manual.jobId) : undefined,
            notes: `Manually logged. ${miles.toFixed(2)} mi × $${rate}/mi`,
          },
        });
      }

      queryClient.invalidateQueries();
      setSavedMsg(
        manual.classification === "business"
          ? `Trip saved! ${miles.toFixed(2)} mi logged + ${formatCurrency(miles * rate)} expense created.`
          : `Trip saved. ${miles.toFixed(2)} personal miles logged.`
      );
      setManual({ date: today, startLocation: "", endLocation: "", miles: "", purpose: "", classification: mileageDefaultClassification, jobId: "" });
    } catch (err) {
      if (is401(err)) {
        setSessionExpired(true);
      } else {
        setManualError("Failed to save trip. Please try again.");
      }
    } finally {
      setManualSaving(false);
    }
  };

  const saveMonthlyTotal = async () => {
    const miles = parseFloat(monthlyForm.miles);
    if (!monthlyForm.month || !monthlyForm.miles || miles <= 0) {
      setMonthlyError("Month and total miles are required.");
      return;
    }
    setMonthlySaving(true);
    setMonthlyError("");
    setSessionExpired(false);
    try {
      const tripCount = parseInt(monthlyForm.tripCount) || 0;
      const purposeNote = tripCount > 0
        ? `MileIQ monthly total — ${tripCount} business trips`
        : "MileIQ monthly total";
      const dateStr = lastDayOfMonth(monthlyForm.month);
      const deduction = miles * rate;

      await createMileage.mutateAsync({
        data: {
          date: dateStr,
          miles,
          classification: "business",
          purpose: purposeNote,
          notes: monthlyForm.notes || undefined,
          source: "manual",
        },
      });

      await createExpense.mutateAsync({
        data: {
          date: dateStr,
          description: `Mileage (${getMonthLabel(monthlyForm.month)}): ${purposeNote}`,
          vendor: "IRS Mileage",
          category: "mileage",
          amount: deduction,
          notes: `MileIQ import. ${miles.toFixed(2)} mi × $${rate}/mi = ${formatCurrency(deduction)}${monthlyForm.notes ? ` | ${monthlyForm.notes}` : ""}`,
        },
      });

      queryClient.invalidateQueries();
      setSavedMsg(
        `${getMonthLabel(monthlyForm.month)} logged: ${miles.toFixed(2)} mi → ${formatCurrency(deduction)} deduction.`
      );
      setMonthlyForm({ month: currentMonth, miles: "", tripCount: "", notes: "" });
    } catch (err) {
      if (is401(err)) {
        setSessionExpired(true);
      } else {
        setMonthlyError("Failed to save. Please try again.");
      }
    } finally {
      setMonthlySaving(false);
    }
  };

  const handleDelete = async (id: number, classification: string, log?: any) => {
    const isMonthly = log?.purpose?.startsWith("MileIQ monthly total");
    const hasLinkedExpense = classification === "business";
    const msg = isMonthly
      ? `Delete this monthly mileage entry? The linked IRS mileage expense will also be removed.`
      : hasLinkedExpense
      ? `Delete this business trip? The linked IRS mileage expense will also be removed.`
      : `Delete this personal trip?`;
    if (!confirm(msg)) return;
    await deleteMileage.mutateAsync({ id });
    queryClient.invalidateQueries();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Mileage Tracking</h1>
          <p className="text-muted-foreground mt-1">IRS mileage deduction tracking.</p>
        </div>
      </div>

      {savedMsg && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span className="text-sm font-medium">{savedMsg}</span>
          <button onClick={() => setSavedMsg("")} className="ml-auto text-emerald-400 hover:text-emerald-700">✕</button>
        </div>
      )}

      {sessionExpired && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
          <LogIn className="w-5 h-5 flex-shrink-0 text-amber-600" />
          <span className="text-sm font-medium">
            Your session has expired. Please{" "}
            <a href="/api/login" className="underline font-bold hover:text-amber-900">
              sign in again
            </a>
            {" "}to save your data.
          </span>
        </div>
      )}

      {!reminderDismissed && incompleteReminderTrips.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-blue-500" />
          <span className="text-sm">
            <span className="font-semibold">{incompleteReminderTrips.length} business trip{incompleteReminderTrips.length > 1 ? "s" : ""}</span>{" "}
            from the past {mileageReminderFrequency === "weekly" ? "week" : "day"}{" "}
            {incompleteReminderTrips.length > 1 ? "are" : "is"} missing a purpose — add details to strengthen your IRS records.
          </span>
          <button onClick={() => setReminderDismissed(true)} className="ml-auto text-blue-400 hover:text-blue-700">✕</button>
        </div>
      )}

      {canEdit("mileage") && (
        <Card className="border-border/50 shadow-md bg-card overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-blue-400 to-blue-600" />

          <div className="flex border-b border-border">
            <button
              onClick={() => handleSwitchTab("trip")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-colors ${
                activeTab === "trip"
                  ? "bg-background text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <PenLine className="w-4 h-4" />
              Log a Trip
            </button>
            <button
              onClick={() => handleSwitchTab("monthly")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-colors ${
                activeTab === "monthly"
                  ? "bg-background text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              Monthly Total
            </button>
          </div>

          <CardContent className="p-6 space-y-4">

            {activeTab === "trip" && (
              <>
                <p className="text-xs text-muted-foreground">Enter individual trip details below.</p>

                {manualError && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {manualError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Date *</label>
                    <input
                      type="date"
                      value={manual.date}
                      onChange={e => setManual(m => ({ ...m, date: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Miles *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="e.g. 12.5"
                      value={manual.miles}
                      onChange={e => setManual(m => ({ ...m, miles: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Start Location</label>
                    <input
                      type="text"
                      placeholder="e.g. Home"
                      value={manual.startLocation}
                      onChange={e => setManual(m => ({ ...m, startLocation: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">End Location</label>
                    <input
                      type="text"
                      placeholder="e.g. Job site"
                      value={manual.endLocation}
                      onChange={e => setManual(m => ({ ...m, endLocation: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Purpose</label>
                  <input
                    type="text"
                    placeholder="e.g. Material run to Home Depot"
                    value={manual.purpose}
                    onChange={e => setManual(m => ({ ...m, purpose: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setManual(m => ({ ...m, classification: "business" }))}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-sm ${
                      manual.classification === "business"
                        ? "border-primary bg-primary/10 text-primary font-bold"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <Briefcase className="w-5 h-5" />
                    Business
                  </button>
                  <button
                    type="button"
                    onClick={() => setManual(m => ({ ...m, classification: "personal" }))}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-sm ${
                      manual.classification === "personal"
                        ? "border-border bg-muted text-foreground font-bold"
                        : "border-border text-muted-foreground hover:border-border"
                    }`}
                  >
                    <User className="w-5 h-5" />
                    Personal
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Link to Job (optional)</label>
                  <select
                    value={manual.jobId}
                    onChange={e => setManual(m => ({ ...m, jobId: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">No specific job</option>
                    {(jobs as any[]).map((j: any) => (
                      <option key={j.id} value={j.id}>{j.title}</option>
                    ))}
                  </select>
                </div>

                {manual.classification === "business" && manual.miles && parseFloat(manual.miles) > 0 && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                    <span className="font-semibold">Auto-expense:</span>{" "}
                    <span className="font-bold">{formatCurrency(parseFloat(manual.miles) * rate)}</span> mileage expense will be created automatically.
                  </div>
                )}

                <button
                  type="button"
                  onClick={saveManualTrip}
                  disabled={manualSaving}
                  className="w-full py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 shadow transition-all active:scale-95 text-sm disabled:opacity-60"
                >
                  {manualSaving ? "Saving..." : manual.classification === "business" ? "Save & Log Expense" : "Save Trip"}
                </button>
              </>
            )}

            {activeTab === "monthly" && (
              <>
                <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
                  <span className="font-semibold">MileIQ Monthly Import</span> — Enter your total business miles for the month from MileIQ or another tracking app. A single mileage entry and IRS deduction expense will be created for the full month.
                </div>

                {monthlyError && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {monthlyError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <label className="text-sm font-medium text-foreground">Month *</label>
                    <input
                      type="month"
                      value={monthlyForm.month}
                      onChange={e => setMonthlyForm(f => ({ ...f, month: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <label className="text-sm font-medium text-foreground">Total Business Miles *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="e.g. 399"
                      value={monthlyForm.miles}
                      onChange={e => setMonthlyForm(f => ({ ...f, miles: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <label className="text-sm font-medium text-foreground">Number of Trips (optional)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g. 30"
                      value={monthlyForm.tripCount}
                      onChange={e => setMonthlyForm(f => ({ ...f, tripCount: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <label className="text-sm font-medium text-foreground">Notes (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. From MileIQ report"
                      value={monthlyForm.notes}
                      onChange={e => setMonthlyForm(f => ({ ...f, notes: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                {monthlyForm.miles && parseFloat(monthlyForm.miles) > 0 && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 space-y-1">
                    <div className="font-semibold">{getMonthLabel(monthlyForm.month)} estimate:</div>
                    <div className="flex justify-between">
                      <span>{parseFloat(monthlyForm.miles).toFixed(2)} mi × ${rate.toFixed(3)}/mi</span>
                      <span className="font-bold">{formatCurrency(parseFloat(monthlyForm.miles) * rate)}</span>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={saveMonthlyTotal}
                  disabled={monthlySaving}
                  className="w-full py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 shadow transition-all active:scale-95 text-sm disabled:opacity-60"
                >
                  {monthlySaving ? "Saving..." : "Save Monthly Total"}
                </button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-primary text-primary-foreground border-none shadow-lg">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-primary-foreground/70 text-sm font-medium">Est. Tax Deduction (YTD)</p>
                <p className="text-4xl font-display font-bold mt-2">{formatCurrency((summary as any)?.totalDeduction || 0)}</p>
              </div>
              <Calculator className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-xs text-primary-foreground/50 mt-4 text-right">
              ${rate.toFixed(3)}/mile · {rate === 0.725 ? "2026 IRS rate ✓" : rate === 0.700 ? "2025 IRS rate ✓" : "custom rate"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-6">
            <p className="text-muted-foreground text-sm font-medium">Business {mileageUnits === "km" ? "Km" : "Miles"}</p>
            <p className="text-3xl font-display font-bold text-foreground mt-2">
              {(mileageUnits === "km"
                ? ((summary as any)?.businessMiles || 0) * 1.60934
                : ((summary as any)?.businessMiles || 0)
              ).toFixed(1)} {mileageUnits === "km" ? "km" : "mi"}
            </p>
            <p className="text-xs text-muted-foreground mt-4 text-right">
              {(summary as any)?.tripCount || 0} total trips
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-6">
            <p className="text-muted-foreground text-sm font-medium">Personal {mileageUnits === "km" ? "Km" : "Miles"}</p>
            <p className="text-3xl font-display font-bold text-foreground mt-2">
              {(mileageUnits === "km"
                ? ((summary as any)?.personalMiles || 0) * 1.60934
                : ((summary as any)?.personalMiles || 0)
              ).toFixed(1)} {mileageUnits === "km" ? "km" : "mi"}
            </p>
            <p className="text-xs text-muted-foreground mt-4 text-right">Not deductible</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-md bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Route / Purpose</th>
                <th className="px-6 py-4 text-right">{mileageUnits === "km" ? "Km" : "Miles"}</th>
                <th className="px-6 py-4 text-right">Deduction</th>
                <th className="px-6 py-4 text-center">Type</th>
                <th className="px-6 py-4 text-center">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground animate-pulse">
                    Loading logs...
                  </td>
                </tr>
              ) : !(logs as any[])?.length ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <Navigation className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No mileage logged yet — add your first entry above.
                  </td>
                </tr>
              ) : (
                (logs as any[]).map((log: any) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground">{formatDate(log.date)}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5 max-w-[220px]">
                        {(log.startLocation || log.endLocation) && (
                          <div className="flex items-center gap-1.5 text-foreground font-medium text-xs">
                            <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            <span className="truncate">
                              {log.startLocation || "—"} → {log.endLocation || "—"}
                            </span>
                          </div>
                        )}
                        {log.purpose && (
                          <span className="text-muted-foreground text-xs truncate">{log.purpose}</span>
                        )}
                        {!log.startLocation && !log.endLocation && !log.purpose && (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-display font-bold text-foreground">
                      {mileageUnits === "km"
                        ? (parseFloat(log.miles) * 1.60934).toFixed(2)
                        : parseFloat(log.miles).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right text-emerald-600 font-medium">
                      {log.classification === "business" ? `+${formatCurrency(log.deductionAmount)}` : "—"}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex px-2 py-1 rounded text-xs font-semibold uppercase ${
                          log.classification === "business"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {log.classification}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {canEdit("mileage") && (
                        <button
                          onClick={() => handleDelete(log.id, log.classification, log)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete trip"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
