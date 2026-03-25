import { useState, useRef, useEffect, useCallback } from "react";
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
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  Navigation,
  MapPin,
  Calculator,
  Play,
  Square,
  Trash2,
  Briefcase,
  User,
  Clock,
  Gauge,
  AlertCircle,
  CheckCircle2,
  PenLine,
  ChevronDown,
  ChevronUp,
  BatteryLow,
  MonitorSmartphone,
} from "lucide-react";

interface Waypoint {
  lat: number;
  lng: number;
  ts: number;
}

function haversineMeters(a: Waypoint, b: Waypoint) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function metersToMiles(m: number) {
  return m / 1609.344;
}

function metersToDisplay(m: number, units: string) {
  if (units === "km") return m / 1000;
  return metersToMiles(m);
}

function unitLabel(units: string) {
  return units === "km" ? "km" : "miles";
}

function speedLabel(units: string) {
  return units === "km" ? "km/h" : "mph";
}

function metersPerSecToDisplay(mps: number, units: string) {
  if (units === "km") return mps * 3.6;
  return mps * 2.237;
}

function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

type TripPhase = "idle" | "tracking" | "classify";

interface ManualForm {
  date: string;
  startLocation: string;
  endLocation: string;
  miles: string;
  purpose: string;
  classification: "business" | "personal";
  jobId: string;
}

const today = new Date().toISOString().slice(0, 10);

export default function Mileage() {
  const queryClient = useQueryClient();
  const { data: logs, isLoading } = useListMileageLogs();
  const { data: summary } = useGetMileageSummary();
  const { data: jobs = [] } = useListJobs();
  const { data: settings } = useGetSettings();
  const createMileage = useCreateMileageLog();
  const deleteMileage = useDeleteMileageLog();
  const createExpense = useCreateExpense();

  const [phase, setPhase] = useState<TripPhase>("idle");
  const [geoError, setGeoError] = useState("");
  const [liveMiles, setLiveMiles] = useState(0);
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [tripClassification, setTripClassification] = useState<"business" | "personal">("business");
  const [tripPurpose, setTripPurpose] = useState("");
  const [tripJobId, setTripJobId] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [reminderDismissed, setReminderDismissed] = useState(false);

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState("");
  const [interruptionPrompt, setInterruptionPrompt] = useState(false);
  const wasHiddenWhileTracking = useRef(false);
  const [manual, setManual] = useState<ManualForm>({
    date: today, startLocation: "", endLocation: "", miles: "",
    purpose: "", classification: "business", jobId: "",
  });

  const watchId = useRef<number | null>(null);
  const waypoints = useRef<Waypoint[]>([]);
  const distMeters = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMovementRef = useRef<number>(Date.now());

  const rate = parseFloat((settings as any)?.mileageRate ?? "0.725");
  const mileageUnits: string = (settings as any)?.mileageUnits ?? "miles";
  const mileageBatterySaving: boolean = !!(settings as any)?.mileageBatterySaving;
  const mileageDefaultClassification: "business" | "personal" = (settings as any)?.mileageDefaultClassification === "personal" ? "personal" : "business";
  const mileageAutoPauseMinutes: number = parseInt((settings as any)?.mileageAutoPauseMinutes ?? "5") || 0;
  const mileageReminderFrequency: string = (settings as any)?.mileageReminderFrequency ?? "daily";

  useEffect(() => {
    if (settings) {
      setTripClassification(mileageDefaultClassification);
      setManual(m => ({ ...m, classification: mileageDefaultClassification }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(settings as any)?.mileageDefaultClassification]);

  useEffect(() => {
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Detect when user leaves and returns while GPS tracking is active
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (watchId.current !== null) {
          wasHiddenWhileTracking.current = true;
        }
      } else {
        if (wasHiddenWhileTracking.current && watchId.current !== null) {
          wasHiddenWhileTracking.current = false;
          setInterruptionPrompt(true);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }
    setGeoError("");
    setLiveMiles(0);
    setLiveSpeed(0);
    distMeters.current = 0;
    waypoints.current = [];
    const now = Date.now();
    setStartTime(now);
    setElapsed(0);

    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - now);
    }, 1000);

    setPhase("tracking");

    lastMovementRef.current = Date.now();

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const wp: Waypoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ts: pos.timestamp,
        };
        if (pos.coords.speed != null) {
          const displaySpeed = metersPerSecToDisplay(Math.max(0, pos.coords.speed), mileageUnits);
          setLiveSpeed(displaySpeed);
          if (pos.coords.speed > 0.5) {
            lastMovementRef.current = Date.now();
          }
        }
        if (waypoints.current.length > 0) {
          const prev = waypoints.current[waypoints.current.length - 1];
          const d = haversineMeters(prev, wp);
          if (d > 5) {
            distMeters.current += d;
            lastMovementRef.current = Date.now();
            setLiveMiles(metersToDisplay(distMeters.current, mileageUnits));
          }
        }
        waypoints.current.push(wp);
      },
      (err) => {
        setGeoError(`GPS error: ${err.message}`);
        stopTracking();
      },
      {
        enableHighAccuracy: !mileageBatterySaving,
        maximumAge: mileageBatterySaving ? 30000 : 2000,
        timeout: mileageBatterySaving ? 60000 : 15000,
      }
    );
  }, [mileageUnits, mileageBatterySaving]);

  const stopTracking = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPhase("classify");
  }, []);

  useEffect(() => {
    if (phase !== "tracking" || mileageAutoPauseMinutes <= 0) return;
    const checkInterval = setInterval(() => {
      const idleMs = Date.now() - lastMovementRef.current;
      if (idleMs >= mileageAutoPauseMinutes * 60 * 1000) {
        setGeoError(`Auto-paused: No movement detected for ${mileageAutoPauseMinutes} minute${mileageAutoPauseMinutes !== 1 ? "s" : ""}. Trip saved to classify.`);
        stopTracking();
      }
    }, 15000);
    return () => clearInterval(checkInterval);
  }, [phase, mileageAutoPauseMinutes, stopTracking]);

  const discardTrip = useCallback(() => {
    setPhase("idle");
    setLiveMiles(0);
    setLiveSpeed(0);
    setTripPurpose("");
    setTripJobId("");
    setTripClassification(mileageDefaultClassification);
    setSavedMsg("");
    distMeters.current = 0;
    waypoints.current = [];
  }, [mileageDefaultClassification]);

  const saveTrip = useCallback(async () => {
    const miles = parseFloat(metersToMiles(distMeters.current).toFixed(2));
    if (miles < 0.01) {
      setGeoError("No distance recorded — make sure GPS is enabled and you moved.");
      setPhase("idle");
      return;
    }
    setSaving(true);
    const tripDate = new Date().toISOString().slice(0, 10);
    const startWp = waypoints.current[0];
    const endWp = waypoints.current[waypoints.current.length - 1];
    const startLabel = startWp ? `${startWp.lat.toFixed(4)}, ${startWp.lng.toFixed(4)}` : "GPS Start";
    const endLabel = endWp ? `${endWp.lat.toFixed(4)}, ${endWp.lng.toFixed(4)}` : "GPS End";

    try {
      await createMileage.mutateAsync({
        data: {
          date: tripDate,
          miles,
          classification: tripClassification,
          startLocation: startLabel,
          endLocation: endLabel,
          purpose: tripPurpose || (tripClassification === "business" ? "Business trip" : "Personal trip"),
          jobId: tripJobId ? parseInt(tripJobId) : undefined,
          notes: `GPS tracked · ${fmtDuration(elapsed)}`,
          source: "gps",
        },
      });

      if (tripClassification === "business") {
        const deduction = miles * rate;
        await createExpense.mutateAsync({
          data: {
            date: tripDate,
            description: `Mileage: ${tripPurpose || "Business trip"} (${miles.toFixed(2)} mi)`,
            vendor: "IRS Mileage",
            category: "mileage",
            amount: deduction,
            jobId: tripJobId ? parseInt(tripJobId) : undefined,
            notes: `Auto-logged from GPS trip. ${miles.toFixed(2)} mi × $${rate}/mi`,
          },
        });
      }

      queryClient.invalidateQueries();
      const displayDist = metersToDisplay(distMeters.current, mileageUnits).toFixed(2);
      setSavedMsg(
        tripClassification === "business"
          ? `Saved! ${displayDist} ${unitLabel(mileageUnits)} logged + $${(miles * rate).toFixed(2)} expense auto-created.`
          : `Saved. ${displayDist} personal ${unitLabel(mileageUnits)} logged.`
      );
      setTripPurpose("");
      setTripJobId("");
      setTripClassification(mileageDefaultClassification);
      setPhase("idle");
      distMeters.current = 0;
      waypoints.current = [];
    } catch {
      setGeoError("Failed to save trip. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [liveMiles, tripClassification, tripPurpose, tripJobId, elapsed, rate, createMileage, createExpense, queryClient]);

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
          ? `Manual trip saved! ${miles.toFixed(2)} mi logged + $${(miles * rate).toFixed(2)} expense created.`
          : `Manual trip saved. ${miles.toFixed(2)} personal miles logged.`
      );
      setManual({ date: today, startLocation: "", endLocation: "", miles: "", purpose: "", classification: mileageDefaultClassification, jobId: "" });
      setShowManualForm(false);
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
          <p className="text-muted-foreground mt-1">GPS auto-tracking with IRS deduction calculator.</p>
        </div>
      </div>

      {savedMsg && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span className="text-sm font-medium">{savedMsg}</span>
          <button onClick={() => setSavedMsg("")} className="ml-auto text-emerald-400 hover:text-emerald-700">✕</button>
        </div>
      )}

      {geoError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-800">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
          <span className="text-sm">{geoError}</span>
          <button onClick={() => setGeoError("")} className="ml-auto text-red-400 hover:text-red-700">✕</button>
        </div>
      )}

      {!reminderDismissed && mileageReminderFrequency !== "never" && phase === "idle" && (() => {
        const cutoffDays = mileageReminderFrequency === "weekly" ? 7 : 1;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - cutoffDays);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const incomplete = (logs as any[])?.filter(
          (l: any) => l.date >= cutoffStr && l.classification === "business" && !l.purpose
        ) ?? [];
        if (!incomplete.length) return null;
        return (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-blue-500" />
            <span className="text-sm">
              <span className="font-semibold">{incomplete.length} business trip{incomplete.length > 1 ? "s" : ""}</span> from the past {cutoffDays === 1 ? "day" : "week"} {incomplete.length > 1 ? "are" : "is"} missing a purpose — add details to strengthen your IRS records.
            </span>
            <button onClick={() => setReminderDismissed(true)} className="ml-auto text-blue-400 hover:text-blue-700">✕</button>
          </div>
        );
      })()}

      {/* ── Return-from-interruption prompt ── */}
      {interruptionPrompt && phase === "tracking" && (
        <div className="flex items-start gap-3 px-4 py-4 rounded-xl bg-orange-50 border-2 border-orange-300 text-orange-900 shadow-md">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-orange-500" />
          <div className="flex-1">
            <p className="text-sm font-bold mb-1">Tracking may have paused.</p>
            <p className="text-sm mb-3">
              You left this tab while tracking was active — GPS may have stopped. Did you miss any distance?
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setInterruptionPrompt(false);
                  // Clear GPS watch and timer without transitioning to "classify"
                  // so the manual form (which requires phase === "idle") is immediately available
                  if (watchId.current !== null) {
                    navigator.geolocation.clearWatch(watchId.current);
                    watchId.current = null;
                  }
                  if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                  }
                  distMeters.current = 0;
                  waypoints.current = [];
                  setLiveMiles(0);
                  setLiveSpeed(0);
                  setPhase("idle");
                  setShowManualForm(true);
                }}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-orange-500 text-white hover:bg-orange-600 transition-colors"
              >
                Log Missed Miles Manually
              </button>
              <button
                type="button"
                onClick={() => setInterruptionPrompt(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-100 text-orange-800 hover:bg-orange-200 transition-colors"
              >
                Continue Tracking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Foreground-required notice (while GPS tracking) ── */}
      {phase === "tracking" && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900">
          <MonitorSmartphone className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
          <div className="text-sm">
            <span className="font-bold">Keep this page open while driving.</span>
            {" "}The GPS tracker pauses if you leave this tab or lock your phone. If you close the app, use{" "}
            <button
              type="button"
              className="underline font-semibold hover:text-amber-700"
              onClick={() => { stopTracking(); setShowManualForm(true); }}
            >
              Log Trip Manually
            </button>{" "}to record the missed distance.
            {mileageBatterySaving && (
              <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                <BatteryLow className="w-3.5 h-3.5" /> Battery saver on — GPS updates every 30 s, lower precision.
              </span>
            )}
          </div>
        </div>
      )}

      {phase === "idle" && (
        <Card className="border-border/50 shadow-md bg-card overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-600" />
          <CardContent className="p-8 flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Navigation className="w-9 h-9 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold text-foreground">Auto-Track a Trip</h2>
              <p className="text-muted-foreground text-sm mt-1 max-w-xs">
                Tap Start — your phone's GPS will measure distance while you drive. When done, choose Business or Personal.
              </p>
            </div>
            <button
              onClick={startTracking}
              className="flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg transition-all hover:shadow-xl active:scale-95 text-base"
            >
              <Play className="w-5 h-5 fill-current" /> Start Tracking
            </button>
            <p className="text-xs text-muted-foreground">
              Your browser will ask for location permission — tap Allow.
            </p>
            <div className="w-full border-t border-border/50 pt-4">
              <button
                type="button"
                onClick={() => setShowManualForm(v => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mx-auto"
              >
                <PenLine className="w-4 h-4" />
                Log Trip Manually
                {showManualForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Manual Entry Form ── */}
      {showManualForm && phase === "idle" && (
        <Card className="border-border/50 shadow-md bg-card overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-blue-400 to-blue-600" />
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <PenLine className="w-5 h-5 text-blue-500" />
              <h3 className="text-base font-bold text-foreground">Log Trip Manually</h3>
            </div>

            {manualError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {manualError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  placeholder="e.g. Home, 123 Main St"
                  value={manual.startLocation}
                  onChange={e => setManual(m => ({ ...m, startLocation: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">End Location</label>
                <input
                  type="text"
                  placeholder="e.g. Job site, Supplier"
                  value={manual.endLocation}
                  onChange={e => setManual(m => ({ ...m, endLocation: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Purpose / Description</label>
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
                className={`flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all text-sm ${
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
                className={`flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all text-sm ${
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
                <span className="font-semibold">Auto-expense:</span> A{" "}
                <span className="font-bold">{formatCurrency(parseFloat(manual.miles) * rate)}</span> mileage
                expense will be added automatically to your Expenses log.
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setShowManualForm(false); setManualError(""); }}
                className="flex-1 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveManualTrip}
                disabled={manualSaving}
                className="flex-1 py-2.5 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow transition-all active:scale-95 text-sm disabled:opacity-60"
              >
                {manualSaving ? "Saving..." : manual.classification === "business" ? "Save & Log Expense" : "Save Trip"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === "tracking" && (
        <Card className="border-primary/30 shadow-xl bg-card overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-emerald-400 via-primary to-emerald-400 animate-pulse" />
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping absolute" />
                <span className="w-3 h-3 rounded-full bg-emerald-500 relative" />
                <span className="text-sm font-semibold text-emerald-600 ml-1">Tracking...</span>
              </div>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" /> {fmtDuration(elapsed)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="text-center">
                <p className="text-6xl font-display font-extrabold text-foreground tracking-tight">
                  {liveMiles.toFixed(2)}
                </p>
                <p className="text-muted-foreground text-sm font-medium mt-1">{unitLabel(mileageUnits)}</p>
              </div>
              <div className="text-center border-l border-border">
                <p className="text-4xl font-display font-bold text-foreground mt-2">
                  {liveSpeed.toFixed(0)}
                </p>
                <p className="text-muted-foreground text-sm font-medium mt-1 flex items-center justify-center gap-1">
                  <Gauge className="w-3.5 h-3.5" /> {speedLabel(mileageUnits)}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Est. deduction: {formatCurrency(metersToMiles(distMeters.current) * rate)}
                </p>
              </div>
            </div>

            <button
              onClick={stopTracking}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg transition-all text-base"
            >
              <Square className="w-5 h-5 fill-current" /> Stop & Log Trip
            </button>
          </CardContent>
        </Card>
      )}

      {phase === "classify" && (
        <Card className="border-border/50 shadow-xl bg-card overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-blue-400 to-primary" />
          <CardContent className="p-8 space-y-6">
            <div className="text-center">
              <p className="text-4xl font-display font-extrabold text-foreground">{liveMiles.toFixed(2)} {unitLabel(mileageUnits)}</p>
              <p className="text-muted-foreground text-sm mt-1">
                {fmtDuration(elapsed)} · Est. {formatCurrency(metersToMiles(distMeters.current) * rate)} deduction if business
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-foreground mb-3">Was this a business or personal trip?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTripClassification("business")}
                  className={`flex flex-col items-center gap-2 p-5 rounded-2xl border-2 transition-all ${
                    tripClassification === "business"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <Briefcase className="w-7 h-7" />
                  <span className="font-bold text-sm">Business</span>
                  <span className="text-xs opacity-70">Logs + auto-expense</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTripClassification("personal")}
                  className={`flex flex-col items-center gap-2 p-5 rounded-2xl border-2 transition-all ${
                    tripClassification === "personal"
                      ? "border-border bg-muted text-foreground"
                      : "border-border text-muted-foreground hover:border-border"
                  }`}
                >
                  <User className="w-7 h-7" />
                  <span className="font-bold text-sm">Personal</span>
                  <span className="text-xs opacity-70">Logs only, no deduction</span>
                </button>
              </div>
            </div>

            {tripClassification === "business" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Purpose / Description</label>
                  <input
                    type="text"
                    placeholder="e.g. Material run to Home Depot"
                    value={tripPurpose}
                    onChange={(e) => setTripPurpose(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Link to Job (optional)</label>
                  <select
                    value={tripJobId}
                    onChange={(e) => setTripJobId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">No specific job</option>
                    {(jobs as any[]).map((j: any) => (
                      <option key={j.id} value={j.id}>{j.title}</option>
                    ))}
                  </select>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  <span className="font-semibold">Auto-expense:</span> A{" "}
                  <span className="font-bold">{formatCurrency(metersToMiles(distMeters.current) * rate)}</span> mileage
                  expense will be added automatically to your Expenses log.
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={discardTrip}
                className="flex-1 py-3 rounded-2xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm"
              >
                Discard Trip
              </button>
              <button
                onClick={saveTrip}
                disabled={saving}
                className="flex-1 py-3 rounded-2xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95 text-sm disabled:opacity-60"
              >
                {saving ? "Saving..." : tripClassification === "business" ? "Save & Log Expense" : "Save Trip"}
              </button>
            </div>
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
                <th className="px-6 py-4 text-center">Source</th>
                <th className="px-6 py-4 text-center">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground animate-pulse">
                    Loading logs...
                  </td>
                </tr>
              ) : !(logs as any[])?.length ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                    <Navigation className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No mileage logged yet — start a trip above!
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
                          {log.startLocation} → {log.endLocation}
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
                      {log.source === "manual" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-600 text-xs font-semibold">
                          <PenLine className="w-3 h-3" /> Manual
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 text-emerald-600 text-xs font-semibold">
                          <Navigation className="w-3 h-3" /> GPS
                        </span>
                      )}
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
