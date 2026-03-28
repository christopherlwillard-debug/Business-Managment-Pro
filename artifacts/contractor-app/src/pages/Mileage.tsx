import { useState, useRef, useEffect } from "react";
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

const today = localDateString();

export default function Mileage() {
  const queryClient = useQueryClient();
  const { data: logs, isLoading } = useListMileageLogs();
  const { data: summary } = useGetMileageSummary();
  const { data: jobs = [] } = useListJobs();
  const { data: settings } = useGetSettings();
  const createMileage = useCreateMileageLog();
  const deleteMileage = useDeleteMileageLog();
  const createExpense = useCreateExpense();

  const [savedMsg, setSavedMsg] = useState("");
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState("");
  const [manual, setManual] = useState<ManualForm>({
    date: today, startLocation: "", endLocation: "", miles: "",
    purpose: "", classification: "business", jobId: "",
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

  const saveManualTrip = async () => {
    if (!manual.date || !manual.miles || parseFloat(manual.miles) <= 0) {
      setManualError("Date and miles are required.");
      return;
    }
    setManualSaving(true);
    setManualError("");
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
          ? `Trip saved! ${miles.toFixed(2)} mi logged + $${(miles * rate).toFixed(2)} expense created.`
          : `Trip saved. ${miles.toFixed(2)} personal miles logged.`
      );
      setManual({ date: today, startLocation: "", endLocation: "", miles: "", purpose: "", classification: mileageDefaultClassification, jobId: "" });
    } catch {
      setManualError("Failed to save trip. Please try again.");
    } finally {
      setManualSaving(false);
    }
  };

  const handleDelete = async (id: number, classification: string) => {
    if (!confirm(`Delete this ${classification} trip?`)) return;
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

      {/* Manual Entry Card */}
      <Card className="border-border/50 shadow-md bg-card overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-blue-400 to-blue-600" />
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <PenLine className="w-5 h-5 text-blue-500" />
            <h3 className="text-base font-bold text-foreground">Log a Trip</h3>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">Enter your trip details below.</p>

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
        </CardContent>
      </Card>

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
              ${rate.toFixed(3)}/mile IRS rate
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
                <th className="px-6 py-4">Route</th>
                <th className="px-6 py-4">Purpose</th>
                <th className="px-6 py-4 text-right">{mileageUnits === "km" ? "Km" : "Miles"}</th>
                <th className="px-6 py-4 text-right">Deduction</th>
                <th className="px-6 py-4 text-center">Type</th>
                <th className="px-6 py-4 text-center">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground animate-pulse">
                    Loading logs...
                  </td>
                </tr>
              ) : !(logs as any[])?.length ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    <Navigation className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No mileage logged yet — add your first trip above.
                  </td>
                </tr>
              ) : (
                (logs as any[]).map((log: any) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground">{formatDate(log.date)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-foreground font-medium text-xs">
                        <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="truncate max-w-[180px]">
                          {log.startLocation || "—"} → {log.endLocation || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground max-w-[160px] truncate">{log.purpose || "—"}</td>
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
                      <button
                        onClick={() => handleDelete(log.id, log.classification)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete trip"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
