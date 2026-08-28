import { useState, useRef, useEffect } from "react";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  useListMileageLogs,
  useGetMileageSummary,
  useCreateMileageLog,
  useUpdateMileageLog,
  useDeleteMileageLog,
  useListJobs,
  useGetSettings,
  useListMileageImports,
  useBulkImportMileage,
  useRollbackMileageImport,
  type BulkImportResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate, localDateString } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  Navigation,
  MapPin,
  Calculator,
  Trash2,
  Pencil,
  X,
  Briefcase,
  User,
  AlertCircle,
  CheckCircle2,
  PenLine,
  CalendarDays,
  LogIn,
  Loader2,
  Upload,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import { MileIQProvider, computeFileHash, type ParsedTrip, type InvalidRow } from "@/lib/mileageImport";
import { getIrsRate } from "@/lib/irsMileageRates";
import { confirmRouteDistance, clearRouteDistanceConfirmation } from "@/lib/mileageRouteConfirmation";
import { MileageRouteConfirmation } from "@/components/MileageRouteConfirmation";

async function geocodeAddress(address: string): Promise<{ lat: string; lon: string }> {
  const params = new URLSearchParams({ q: address, format: "json", limit: "1" });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": "BuildPro/1.0 (contractor-management-app)" },
  });
  if (!res.ok) throw new Error("Geocoding service unavailable. Try again in a moment.");
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error(`Address not found: "${address}". Try adding a city or state.`);
  return { lat: data[0].lat, lon: data[0].lon };
}

async function getDrivingDistanceMiles(
  from: { lat: string; lon: string },
  to: { lat: string; lon: string }
): Promise<number> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Routing service unavailable. Try again in a moment.");
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.length) throw new Error("No driving route found between these addresses.");
  const meters: number = data.routes[0].distance;
  return Math.round((meters / 1609.34) * 10) / 10;
}

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

interface EditForm {
  date: string;
  startLocation: string;
  endLocation: string;
  miles: string;
  purpose: string;
  classification: "business" | "personal";
  jobId: string;
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

function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err != null && typeof err === "object" && "message" in err) {
    const raw = (err as { message: string }).message;
    const match = raw.match(/^HTTP \d+ [^:]+: (.+)$/s);
    if (match?.[1]) return match[1];
    if (raw) return raw;
  }
  return fallback;
}

export default function Mileage() {
  const { canEdit } = useUserPermissions();
  const { activeBusiness, businesses } = useBusiness();
  // When no specific business is selected (first visit, "all" mode, or cleared selection),
  // fall back to the first available business so owner mileage always loads.
  const businessId = activeBusiness?.id ?? businesses[0]?.id;
  const queryClient = useQueryClient();
  const { data: logs, isLoading } = useListMileageLogs(
    businessId ? { businessId } : undefined,
    { query: { enabled: !!businessId } as any }
  );
  const { data: summary } = useGetMileageSummary(
    businessId ? { businessId } : undefined,
    { query: { enabled: !!businessId } as any }
  );
  const { data: jobs = [] } = useListJobs();
  const { data: settings } = useGetSettings();
  const createMileage = useCreateMileageLog();
  const updateMileage = useUpdateMileageLog();
  const deleteMileage = useDeleteMileageLog();
  const bulkImport = useBulkImportMileage();
  const rollbackImport = useRollbackMileageImport();
  const { data: importHistory = [], refetch: refetchImports } = useListMileageImports(businessId);

  const [activeTab, setActiveTab] = useState<"trip" | "monthly">("trip");

  const [editingLog, setEditingLog] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    date: today, startLocation: "", endLocation: "", miles: "",
    purpose: "", classification: "business", jobId: "", notes: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const openEdit = (log: any) => {
    setEditingLog(log);
    setEditForm({
      date: log.date ?? today,
      startLocation: log.startLocation ?? "",
      endLocation: log.endLocation ?? "",
      miles: log.miles != null ? String(log.miles) : "",
      purpose: log.purpose ?? "",
      classification: log.classification === "personal" ? "personal" : "business",
      jobId: log.jobId ? String(log.jobId) : "",
      notes: log.notes ?? "",
    });
    setEditError("");
  };

  const closeEdit = () => {
    setEditingLog(null);
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editForm.date || !editForm.miles || parseFloat(editForm.miles) <= 0) {
      setEditError("Date and miles are required.");
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      try {
        await updateMileage.mutateAsync({
          id: editingLog.id,
          data: {
            date: editForm.date,
            miles: parseFloat(editForm.miles),
            classification: editForm.classification,
            startLocation: editForm.startLocation || undefined,
            endLocation: editForm.endLocation || undefined,
            purpose: editForm.purpose || undefined,
            jobId: editForm.jobId ? parseInt(editForm.jobId) : undefined,
            notes: editForm.notes || undefined,
            source: "manual",
          },
        });
      } catch (err) {
        if (is401(err)) { setEditError("Session expired — please sign in again."); return; }
        setEditError(getApiErrorMessage(err, "Couldn't save changes. Check your connection and try again."));
        return;
      }
      queryClient.invalidateQueries();
      setSavedMsg("Entry updated.");
      closeEdit();
    } finally {
      setEditSaving(false);
    }
  };
  const [savedMsg, setSavedMsg] = useState("");
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importStep, setImportStep] = useState<"pick" | "preview" | "summary">("pick");
  const [importTargetBizId, setImportTargetBizId] = useState<number | null>(null);
  const [importSkipPersonal, setImportSkipPersonal] = useState(true);
  const [importValidTrips, setImportValidTrips] = useState<ParsedTrip[]>([]);
  const [importInvalidRows, setImportInvalidRows] = useState<InvalidRow[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const [importFileHash, setImportFileHash] = useState("");
  const [importFilename, setImportFilename] = useState("");
  const [importFileAlreadyWarned, setImportFileAlreadyWarned] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const openImportModal = () => {
    setImportModalOpen(true);
    setImportStep("pick");
    setImportTargetBizId(businessId ?? null);
    setImportSkipPersonal(true);
    setImportValidTrips([]);
    setImportInvalidRows([]);
    setImportError("");
    setImportResult(null);
    setImportFileHash("");
    setImportFilename("");
    setImportFileAlreadyWarned(false);
  };

  const closeImportModal = () => {
    setImportModalOpen(false);
    setImportStep("pick");
  };

  const handleFileSelect = async (file: File) => {
    setImportLoading(true);
    setImportError("");
    setImportFileAlreadyWarned(false);
    try {
      const text = await file.text();
      const hash = await computeFileHash(text);
      const provider = new MileIQProvider();
      const { valid, invalid } = provider.parse(text);
      setImportFileHash(hash);
      setImportFilename(file.name);
      setImportValidTrips(valid);
      setImportInvalidRows(invalid);
      setImportStep("preview");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to read file.");
    } finally {
      setImportLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importTargetBizId) { setImportError("Select a business to import into."); return; }
    const tripsToSend = importSkipPersonal
      ? importValidTrips.filter(t => t.classification !== "personal")
      : importValidTrips;
    if (tripsToSend.length === 0) { setImportError("No business trips to import."); return; }
    setImportLoading(true);
    setImportError("");
    try {
      const result = await bulkImport.mutateAsync({
        trips: tripsToSend,
        businessId: importTargetBizId,
        filename: importFilename,
        fileHash: importFileHash,
        source: "mileiq",
        skipPersonal: false,
      });
      setImportResult(result);
      setImportFileAlreadyWarned(result.fileAlreadyImported);
      setImportStep("summary");
      queryClient.invalidateQueries();
      refetchImports();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed. Please try again.");
    } finally {
      setImportLoading(false);
    }
  };

  const handleRollback = async (importId: number) => {
    if (!confirm("Undo this import? All trips from this import will be permanently deleted.")) return;
    try {
      await rollbackImport.mutateAsync({ id: importId });
      queryClient.invalidateQueries();
      refetchImports();
      setSavedMsg("Import rolled back — all trips removed.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rollback failed.");
    }
  };

  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState("");
  const [manual, setManual] = useState<ManualForm>({
    date: today, startLocation: "", endLocation: "", miles: "",
    purpose: "", classification: "business", jobId: "",
  });
  const [distCalcLoading, setDistCalcLoading] = useState(false);
  const [distCalcError, setDistCalcError] = useState("");
  const [calculatedDistance, setCalculatedDistance] = useState<number | null>(null);

  const calculateMiles = async () => {
    if (!manual.startLocation.trim() || !manual.endLocation.trim()) {
      setDistCalcError("Enter both a start and end address to calculate miles.");
      return;
    }
    setDistCalcLoading(true);
    setDistCalcError("");
    try {
      const [fromCoords, toCoords] = await Promise.all([
        geocodeAddress(manual.startLocation.trim()),
        geocodeAddress(manual.endLocation.trim()),
      ]);
      const miles = await getDrivingDistanceMiles(fromCoords, toCoords);
      setManual(m => ({ ...m, miles: String(miles) }));
      setCalculatedDistance(confirmRouteDistance(miles));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't calculate distance. Try a more specific address.";
      setDistCalcError(msg);
    } finally {
      setDistCalcLoading(false);
    }
  };

  const [monthlySaving, setMonthlySaving] = useState(false);
  const [monthlyError, setMonthlyError] = useState("");
  const [monthlyForm, setMonthlyForm] = useState<MonthlyForm>({
    month: currentMonth, miles: "", tripCount: "", notes: "",
  });

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

    const miles = parseFloat(manual.miles);
    let savedLog: any;

    try {
      try {
        savedLog = await createMileage.mutateAsync({
          data: {
            date: manual.date,
            miles,
            classification: manual.classification,
            startLocation: manual.startLocation || undefined,
            endLocation: manual.endLocation || undefined,
            purpose: manual.purpose || undefined,
            jobId: manual.jobId ? parseInt(manual.jobId) : undefined,
            businessId: businessId ?? undefined,
            source: "manual",
          },
        });
      } catch (err) {
        if (is401(err)) { setSessionExpired(true); return; }
        setManualError(getApiErrorMessage(err, "Couldn't save the trip. Check your connection and try again."));
        return;
      }

      queryClient.invalidateQueries();
      setSavedMsg(
        manual.classification === "business"
          ? (savedLog.deductionAmount ?? savedLog.calculatedDeduction) != null
            ? `Trip saved! ${miles.toFixed(2)} mi logged + ${formatCurrency(savedLog.deductionAmount ?? savedLog.calculatedDeduction)} expense created.`
            : `Trip saved! ${miles.toFixed(2)} mi logged. The IRS mileage expense was created.`
          : `Trip saved. ${miles.toFixed(2)} personal miles logged.`
      );
      setManual({ date: today, startLocation: "", endLocation: "", miles: "", purpose: "", classification: mileageDefaultClassification, jobId: "" });
      setCalculatedDistance(null);
      setDistCalcError("");
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

    const tripCount = parseInt(monthlyForm.tripCount) || 0;
    const purposeNote = tripCount > 0
      ? `MileIQ monthly total — ${tripCount} business trips`
      : "MileIQ monthly total";
    const dateStr = lastDayOfMonth(monthlyForm.month);
    let savedLog: any;
    try {
      try {
        savedLog = await createMileage.mutateAsync({
          data: {
            date: dateStr,
            miles,
            classification: "business",
            purpose: purposeNote,
            notes: monthlyForm.notes || undefined,
            businessId: businessId ?? undefined,
            source: "manual",
          },
        });
      } catch (err) {
        if (is401(err)) { setSessionExpired(true); return; }
        setMonthlyError(getApiErrorMessage(err, "Couldn't save the mileage log. Check your connection and try again."));
        return;
      }

      queryClient.invalidateQueries();
      setSavedMsg(
        (savedLog.deductionAmount ?? savedLog.calculatedDeduction) != null
          ? `${getMonthLabel(monthlyForm.month)} logged: ${miles.toFixed(2)} mi → ${formatCurrency(savedLog.deductionAmount ?? savedLog.calculatedDeduction)} deduction.`
          : `${getMonthLabel(monthlyForm.month)} logged. The IRS mileage deduction was recorded.`
      );
      setMonthlyForm({ month: currentMonth, miles: "", tripCount: "", notes: "" });
    } finally {
      setMonthlySaving(false);
    }
  };

  const handleDelete = async (id: number, classification: string, log?: any) => {
    const isMonthly = log?.purpose?.startsWith("MileIQ monthly total");
    const isImported = !!log?.importId && !log?.expenseId;
    const hasLinkedExpense = classification === "business";
    const msg = isMonthly
      ? `Delete this monthly mileage entry? The linked IRS mileage expense will also be removed.`
      : isImported && classification === "business"
      ? `Delete this imported trip? The monthly IRS mileage expense will be recalculated to reflect the change.`
      : hasLinkedExpense
      ? `Delete this business trip? The linked IRS mileage expense will also be removed.`
      : `Delete this personal trip?`;
    if (!confirm(msg)) return;
    await deleteMileage.mutateAsync({ id });
    queryClient.invalidateQueries();
  };

  return (
    <div className="space-y-6">

      {/* Edit slide-over panel */}
      {editingLog && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={e => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={closeEdit} />
          <div className="relative w-full max-w-md bg-background shadow-2xl flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-display font-bold text-foreground">Edit Mileage Entry</h2>
              <button onClick={closeEdit} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-6 space-y-4">
              {editError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {editError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Date *</label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Miles *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={editForm.miles}
                    onChange={e => setEditForm(f => ({ ...f, miles: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Start Address</label>
                  <input
                    type="text"
                    placeholder="e.g. 123 Main St"
                    value={editForm.startLocation}
                    onChange={e => setEditForm(f => ({ ...f, startLocation: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">End Address</label>
                  <input
                    type="text"
                    placeholder="e.g. 456 Oak Ave"
                    value={editForm.endLocation}
                    onChange={e => setEditForm(f => ({ ...f, endLocation: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Purpose</label>
                <input
                  type="text"
                  placeholder="e.g. Material run to Home Depot"
                  value={editForm.purpose}
                  onChange={e => setEditForm(f => ({ ...f, purpose: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setEditForm(f => ({ ...f, classification: "business" }))}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-sm ${
                    editForm.classification === "business"
                      ? "border-primary bg-primary/10 text-primary font-bold"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <Briefcase className="w-5 h-5" />
                  Business
                </button>
                <button
                  type="button"
                  onClick={() => setEditForm(f => ({ ...f, classification: "personal" }))}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-sm ${
                    editForm.classification === "personal"
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
                  value={editForm.jobId}
                  onChange={e => setEditForm(f => ({ ...f, jobId: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">No specific job</option>
                  {(jobs as any[]).map((j: any) => (
                    <option key={j.id} value={j.id}>{j.title}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Notes</label>
                <input
                  type="text"
                  placeholder="Optional notes"
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border flex gap-3">
              <button
                type="button"
                onClick={closeEdit}
                className="flex-1 py-2.5 rounded-xl font-semibold border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={editSaving}
                className="flex-1 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 shadow transition-all active:scale-95 text-sm disabled:opacity-60"
              >
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }}
      />

      {/* Import Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) closeImportModal(); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeImportModal} />
          <div className="relative w-full max-w-2xl bg-background rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Upload className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-lg font-display font-bold text-foreground">Import from MileIQ</h2>
                  <p className="text-xs text-muted-foreground">
                    {importStep === "pick" && "Select your MileIQ CSV export file"}
                    {importStep === "preview" && `${importValidTrips.length} trips found — review before importing`}
                    {importStep === "summary" && "Import complete"}
                  </p>
                </div>
              </div>
              <button onClick={closeImportModal} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">

              {importError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {importError}
                </div>
              )}

              {/* Step 1: File picker */}
              {importStep === "pick" && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
                    <p className="font-semibold mb-1">How to export from MileIQ:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-xs">
                      <li>Open MileIQ → Reports → Monthly Report</li>
                      <li>Select the month(s) you want to import</li>
                      <li>Click <strong>Download CSV/Excel</strong></li>
                      <li>Upload the .csv file below</li>
                    </ol>
                  </div>

                  {businesses.length > 1 && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Import into</label>
                      <select
                        value={importTargetBizId ?? ""}
                        onChange={e => setImportTargetBizId(parseInt(e.target.value))}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {businesses.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importLoading}
                    className="w-full flex flex-col items-center gap-3 py-12 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 transition-all text-muted-foreground"
                  >
                    {importLoading ? (
                      <><Loader2 className="w-8 h-8 animate-spin text-primary" /><span className="text-sm font-medium">Reading file…</span></>
                    ) : (
                      <><FileText className="w-8 h-8 opacity-40" /><span className="text-sm font-medium">Click to select MileIQ CSV file</span><span className="text-xs opacity-60">.csv format only</span></>
                    )}
                  </button>
                </div>
              )}

              {/* Step 2: Preview */}
              {importStep === "preview" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-muted/50 px-3 py-3">
                      <p className="text-2xl font-display font-bold text-foreground">{importValidTrips.length}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Valid trips</p>
                    </div>
                    <div className="rounded-xl bg-muted/50 px-3 py-3">
                      <p className="text-2xl font-display font-bold text-foreground">
                        {importSkipPersonal
                          ? importValidTrips.filter(t => t.classification === "business").length
                          : importValidTrips.length}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">To import</p>
                    </div>
                    <div className="rounded-xl bg-muted/50 px-3 py-3">
                      <p className="text-2xl font-display font-bold text-foreground">{importInvalidRows.length}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Rows skipped</p>
                    </div>
                  </div>

                  {importInvalidRows.length > 0 && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                      <span className="font-semibold">{importInvalidRows.length} row{importInvalidRows.length > 1 ? "s" : ""} skipped: </span>
                      {[...new Set(importInvalidRows.map(r => r.reason))].join(", ")}
                    </div>
                  )}

                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border cursor-pointer hover:bg-muted/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={importSkipPersonal}
                      onChange={e => setImportSkipPersonal(e.target.checked)}
                      className="rounded"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">Skip personal trips</p>
                      <p className="text-xs text-muted-foreground">
                        {importValidTrips.filter(t => t.classification === "personal").length} personal trips will be excluded
                      </p>
                    </div>
                  </label>

                  <div className="border border-border rounded-xl overflow-hidden">
                    <div className="bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase grid grid-cols-[80px_1fr_60px_60px]">
                      <span>Date</span><span>Route</span><span className="text-right">Miles</span><span className="text-center">Type</span>
                    </div>
                    <div className="divide-y divide-border/50 max-h-60 overflow-y-auto">
                      {importValidTrips
                        .filter(t => !importSkipPersonal || t.classification !== "personal")
                        .slice(0, 200)
                        .map((t, i) => (
                        <div key={i} className="px-4 py-2.5 grid grid-cols-[80px_1fr_60px_60px] items-center gap-2 text-sm hover:bg-muted/20">
                          <span className="text-muted-foreground text-xs">{formatDate(t.date)}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate text-foreground">{t.startLocation || "—"} → {t.endLocation || "—"}</p>
                            {t.notes && <p className="text-xs text-muted-foreground truncate">{t.notes}</p>}
                          </div>
                          <span className="text-right font-bold text-xs">{t.miles.toFixed(1)}</span>
                          <span className={`text-center text-xs font-semibold uppercase px-1 py-0.5 rounded ${t.classification === "business" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {t.classification === "business" ? "Biz" : "Pers"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Summary */}
              {importStep === "summary" && importResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <span className="text-sm font-semibold">Import complete!</span>
                  </div>

                  {importFileAlreadyWarned && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      This file was previously imported. Duplicates were automatically skipped.
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-muted/50 px-4 py-4 text-center">
                      <p className="text-3xl font-display font-bold text-foreground">{importResult.imported}</p>
                      <p className="text-xs text-muted-foreground mt-1">Business trips imported</p>
                    </div>
                    <div className="rounded-xl bg-muted/50 px-4 py-4 text-center">
                      <p className="text-3xl font-display font-bold text-foreground">{importResult.totalMiles.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Total miles</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-4 text-center">
                      <p className="text-3xl font-display font-bold text-emerald-700">{formatCurrency(importResult.estimatedDeduction)}</p>
                      <p className="text-xs text-emerald-600 mt-1">Est. IRS deduction</p>
                    </div>
                    <div className="rounded-xl bg-muted/50 px-4 py-4 text-center">
                      <p className="text-3xl font-display font-bold text-foreground">{importResult.duplicatesSkipped}</p>
                      <p className="text-xs text-muted-foreground mt-1">Duplicates skipped</p>
                    </div>
                  </div>

                  {((importResult as any).expensesCreated ?? 0) > 0 && (
                    <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
                      <p className="font-semibold">
                        {(importResult as any).expensesCreated === 1
                          ? "1 monthly expense created"
                          : `${(importResult as any).expensesCreated} monthly expenses created`}
                      </p>
                      <p className="text-xs text-blue-700 mt-0.5">
                        {((importResult as any).expenseMonths ?? []).map((m: string) => `${m} IRS Mileage`).join(", ")}
                        {" "}— one expense per month covers all imported trips. Individual trips stay in your Mileage log below.
                      </p>
                    </div>
                  )}

                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-amber-900">Changed your mind?</p>
                      <p className="text-xs text-amber-700">You can undo this import for up to 24 hours from Import History below.</p>
                    </div>
                    <button
                      onClick={() => { handleRollback(importResult.importId); closeImportModal(); }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 transition-colors whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Undo now
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-border flex gap-3">
              <button onClick={closeImportModal} className="flex-1 py-2.5 rounded-xl font-semibold border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors text-sm">
                {importStep === "summary" ? "Done" : "Cancel"}
              </button>
              {importStep === "pick" && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importLoading}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow transition-all active:scale-95 text-sm disabled:opacity-60"
                >
                  {importLoading ? "Reading…" : "Select CSV File"}
                </button>
              )}
              {importStep === "preview" && (
                <button
                  onClick={handleConfirmImport}
                  disabled={importLoading || (importSkipPersonal ? importValidTrips.filter(t => t.classification !== "personal").length === 0 : importValidTrips.length === 0)}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow transition-all active:scale-95 text-sm disabled:opacity-60"
                >
                  {importLoading
                    ? "Importing…"
                    : `Import ${importSkipPersonal ? importValidTrips.filter(t => t.classification !== "personal").length : importValidTrips.length} Trips`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Mileage Tracking</h1>
          <p className="text-muted-foreground mt-1">IRS mileage deduction tracking.</p>
        </div>
        {canEdit("mileage") && (
          <button
            onClick={openImportModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-emerald-600 text-white hover:bg-emerald-700 shadow transition-all active:scale-95"
          >
            <Upload className="w-4 h-4" />
            Import from MileIQ
          </button>
        )}
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
                      onChange={e => {
                        setManual(m => ({ ...m, miles: e.target.value }));
                        setCalculatedDistance(clearRouteDistanceConfirmation());
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <MileageRouteConfirmation miles={calculatedDistance} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Start Address</label>
                    <input
                      type="text"
                      placeholder="e.g. 123 Main St, Owensboro KY"
                      value={manual.startLocation}
                      onChange={e => {
                        setManual(m => ({ ...m, startLocation: e.target.value }));
                        setCalculatedDistance(clearRouteDistanceConfirmation());
                        setDistCalcError("");
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">End Address</label>
                    <input
                      type="text"
                      placeholder="e.g. 456 Oak Ave, Owensboro KY"
                      value={manual.endLocation}
                      onChange={e => {
                        setManual(m => ({ ...m, endLocation: e.target.value }));
                        setCalculatedDistance(clearRouteDistanceConfirmation());
                        setDistCalcError("");
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                {/* Calculate Miles button */}
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={calculateMiles}
                    disabled={distCalcLoading || !manual.startLocation.trim() || !manual.endLocation.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {distCalcLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Calculating…
                      </>
                    ) : (
                      <>
                        <Calculator className="w-3.5 h-3.5" />
                        Calculate Miles from Addresses
                      </>
                    )}
                  </button>
                  {distCalcError && (
                    <div className="flex items-start gap-1.5 text-xs text-red-600">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{distCalcError}</span>
                    </div>
                  )}
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
                    <span className="font-bold">{formatCurrency(parseFloat(manual.miles) * getIrsRate(manual.date))}</span> estimated mileage expense at ${getIrsRate(manual.date).toFixed(3)}/mi will be created automatically.
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
                      <span>{parseFloat(monthlyForm.miles).toFixed(2)} mi × ${getIrsRate(lastDayOfMonth(monthlyForm.month)).toFixed(3)}/mi</span>
                      <span className="font-bold">{formatCurrency(parseFloat(monthlyForm.miles) * getIrsRate(lastDayOfMonth(monthlyForm.month)))}</span>
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
              {(summary as any)?.ratePerMile != null
                ? `$${Number((summary as any).ratePerMile).toFixed(3)}/mile`
                : (summary as any)?.ratePeriods?.length
                  ? "Multiple IRS rates applied by trip date"
                  : "No business-mile rate yet"}
            </p>
            {(summary as any)?.ratePeriods?.length > 1 && (
              <div className="mt-2 space-y-0.5 text-xs text-primary-foreground/70">
                {(summary as any).ratePeriods.map((period: any) => (
                  <p key={`${period.periodStart}-${period.rate}`}>
                    {period.periodStart}–{period.periodEnd}: ${Number(period.rate).toFixed(3)}/mi · {Number(period.miles).toFixed(1)} mi
                  </p>
                ))}
              </div>
            )}
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
                <th className="px-6 py-4 text-right">Rate</th>
                <th className="px-6 py-4 text-right">Deduction</th>
                <th className="px-6 py-4 text-center">Type</th>
                <th className="px-6 py-4 text-center">Actions</th>
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
                    <td className="px-6 py-4 text-right text-muted-foreground font-mono text-xs">
                      {log.classification === "business" ? `$${Number(log.calculatedRate ?? log.ratePerMile ?? 0).toFixed(3)}/mi` : "—"}
                    </td>
                    <td className="px-6 py-4 text-right text-emerald-600 font-medium">
                      {log.classification === "business" ? `+${formatCurrency(log.calculatedDeduction ?? log.deductionAmount)}` : "—"}
                      {log.snapshotStale && <span className="ml-1 text-amber-600" title="Stored snapshot differs from the current IRS rate">•</span>}
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
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEdit(log)}
                            className="text-muted-foreground hover:text-primary transition-colors"
                            title="Edit entry"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(log.id, log.classification, log)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete trip"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Import History */}
      {(importHistory as any[]).length > 0 && (
        <Card className="border-border/50 shadow-sm bg-card">
          <button
            onClick={() => setHistoryExpanded(h => !h)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors rounded-2xl"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold text-sm text-foreground">Import History</span>
              <span className="text-xs text-muted-foreground">({(importHistory as any[]).length} import{(importHistory as any[]).length > 1 ? "s" : ""})</span>
            </div>
            {historyExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {historyExpanded && (
            <div className="border-t border-border divide-y divide-border/50">
              {[...(importHistory as any[])].reverse().map((imp: any) => {
                const importedAt = new Date(imp.importedAt);
                const hoursAgo = (Date.now() - importedAt.getTime()) / (1000 * 60 * 60);
                const canUndo = !imp.rolledBackAt && hoursAgo <= 24;
                const statusColors: Record<string, string> = {
                  completed: "bg-emerald-100 text-emerald-700",
                  rolled_back: "bg-muted text-muted-foreground",
                  failed: "bg-red-100 text-red-700",
                  partial: "bg-amber-100 text-amber-700",
                };
                const statusLabels: Record<string, string> = {
                  completed: "Completed",
                  rolled_back: "Rolled Back",
                  failed: "Failed",
                  partial: "Partial",
                };
                return (
                  <div key={imp.id} className="px-6 py-4 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-foreground truncate">{imp.filename}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${statusColors[imp.status] ?? "bg-muted text-muted-foreground"}`}>
                          {statusLabels[imp.status] ?? imp.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>{imp.tripsImported} trips</span>
                        {imp.totalMiles != null && <span>{parseFloat(imp.totalMiles).toFixed(1)} mi</span>}
                        {imp.estimatedDeduction != null && <span className="text-emerald-600 font-medium">{formatCurrency(parseFloat(imp.estimatedDeduction))} deduction</span>}
                        {imp.duplicatesSkipped > 0 && <span>{imp.duplicatesSkipped} dupes skipped</span>}
                        <span>·</span>
                        <span>{importedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      </div>
                      {imp.errorSummary && (
                        <p className="text-xs text-amber-600">{imp.errorSummary}</p>
                      )}
                    </div>
                    {canEdit("mileage") && canUndo && (
                      <button
                        onClick={() => handleRollback(imp.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap flex-shrink-0"
                      >
                        <RotateCcw className="w-3 h-3" /> Undo
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
