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

  const watchId = useRef<number | null>(null);
  const waypoints = useRef<Waypoint[]>([]);
  const distMeters = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const rate = parseFloat((settings as any)?.mileageRate ?? "0.725");

  useEffect(() => {
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
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

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const wp: Waypoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ts: pos.timestamp,
        };
        if (pos.coords.speed != null) {
          setLiveSpeed(Math.max(0, pos.coords.speed * 2.237));
        }
        if (waypoints.current.length > 0) {
          const prev = waypoints.current[waypoints.current.length - 1];
          const d = haversineMeters(prev, wp);
          if (d > 5) {
            distMeters.current += d;
            setLiveMiles(metersToMiles(distMeters.current));
          }
        }
        waypoints.current.push(wp);
      },
      (err) => {
        setGeoError(`GPS error: ${err.message}`);
        stopTracking();
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  }, []);

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

  const discardTrip = useCallback(() => {
    setPhase("idle");
    setLiveMiles(0);
    setLiveSpeed(0);
    setTripPurpose("");
    setTripJobId("");
    setTripClassification("business");
    setSavedMsg("");
    distMeters.current = 0;
    waypoints.current = [];
  }, []);

  const saveTrip = useCallback(async () => {
    const miles = parseFloat(liveMiles.toFixed(2));
    if (miles < 0.01) {
      setGeoError("No distance recorded — make sure GPS is enabled and you moved.");
      setPhase("idle");
      return;
    }
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    const startWp = waypoints.current[0];
    const endWp = waypoints.current[waypoints.current.length - 1];
    const startLabel = startWp ? `${startWp.lat.toFixed(4)}, ${startWp.lng.toFixed(4)}` : "GPS Start";
    const endLabel = endWp ? `${endWp.lat.toFixed(4)}, ${endWp.lng.toFixed(4)}` : "GPS End";

    try {
      const mileageLog = await createMileage.mutateAsync({
        data: {
          date: today,
          miles,
          classification: tripClassification,
          startLocation: startLabel,
          endLocation: endLabel,
          purpose: tripPurpose || (tripClassification === "business" ? "Business trip" : "Personal trip"),
          jobId: tripJobId ? parseInt(tripJobId) : undefined,
          notes: `GPS tracked · ${fmtDuration(elapsed)}`,
        },
      });

      if (tripClassification === "business") {
        const deduction = miles * rate;
        await createExpense.mutateAsync({
          data: {
            date: today,
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
      setSavedMsg(
        tripClassification === "business"
          ? `Saved! ${miles.toFixed(2)} mi logged + $${(miles * rate).toFixed(2)} expense auto-created.`
          : `Saved. ${miles.toFixed(2)} personal miles logged.`
      );
      setTripPurpose("");
      setTripJobId("");
      setTripClassification("business");
      setPhase("idle");
    } catch {
      setGeoError("Failed to save trip. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [liveMiles, tripClassification, tripPurpose, tripJobId, elapsed, rate, createMileage, createExpense, queryClient]);

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
                <p className="text-muted-foreground text-sm font-medium mt-1">miles</p>
              </div>
              <div className="text-center border-l border-border">
                <p className="text-4xl font-display font-bold text-foreground mt-2">
                  {liveSpeed.toFixed(0)}
                </p>
                <p className="text-muted-foreground text-sm font-medium mt-1 flex items-center justify-center gap-1">
                  <Gauge className="w-3.5 h-3.5" /> mph
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Est. deduction: {formatCurrency(liveMiles * rate)}
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
              <p className="text-4xl font-display font-extrabold text-foreground">{liveMiles.toFixed(2)} mi</p>
              <p className="text-muted-foreground text-sm mt-1">
                {fmtDuration(elapsed)} · Est. {formatCurrency(liveMiles * rate)} deduction if business
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
                  <span className="font-bold">{formatCurrency(liveMiles * rate)}</span> mileage
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
            <p className="text-muted-foreground text-sm font-medium">Business Miles</p>
            <p className="text-3xl font-display font-bold text-foreground mt-2">
              {((summary as any)?.businessMiles || 0).toFixed(1)} mi
            </p>
            <p className="text-xs text-muted-foreground mt-4 text-right">
              {(summary as any)?.tripCount || 0} total trips
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-6">
            <p className="text-muted-foreground text-sm font-medium">Personal Miles</p>
            <p className="text-3xl font-display font-bold text-foreground mt-2">
              {((summary as any)?.personalMiles || 0).toFixed(1)} mi
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
                <th className="px-6 py-4 text-right">Miles</th>
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
                      {parseFloat(log.miles).toFixed(2)}
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
