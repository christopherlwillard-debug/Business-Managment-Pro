import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapPin, Plus, Trash2, ChevronUp, ChevronDown, Route,
  Clock, Calendar,
  Loader2, ChevronLeft, ChevronRight, Navigation,
  Edit2, X, Save, GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  isToday, parseISO, startOfWeek, endOfWeek, addMonths, subMonths,
} from "date-fns";

// Fix Leaflet default marker icon without using `any`
type IconDefaultWithGetUrl = typeof L.Icon.Default & {
  prototype: { _getIconUrl?: () => string };
};
delete (L.Icon.Default as IconDefaultWithGetUrl).prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface RouteStop {
  id: number;
  title: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  scheduledDate: string | null;
  status: "prospect" | "scheduled" | "completed" | "skipped";
  estimatedDurationMinutes: number | null;
  sortOrder: number;
  createdAt: string;
}

type StopStatus = RouteStop["status"];
type ViewMode = "day" | "week";

interface EditFormState {
  title: string;
  address: string;
  notes: string;
  scheduledDate: string;
  estimatedDurationMinutes: number;
  status: StopStatus;
}

const STATUS_CONFIG: Record<StopStatus, { label: string; color: string; bg: string; mapColor: string }> = {
  prospect:  { label: "Prospect",  color: "text-blue-700",    bg: "bg-blue-100 border-blue-300",       mapColor: "#3B82F6" },
  scheduled: { label: "Scheduled", color: "text-amber-700",   bg: "bg-amber-100 border-amber-300",     mapColor: "#F59E0B" },
  completed: { label: "Done",      color: "text-emerald-700", bg: "bg-emerald-100 border-emerald-300", mapColor: "#10B981" },
  skipped:   { label: "Skipped",   color: "text-gray-500",    bg: "bg-gray-100 border-gray-300",       mapColor: "#9CA3AF" },
};

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json() as Promise<RouteStop | RouteStop[] | null>;
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=us`;
    const res = await fetch(url, { headers: { "Accept-Language": "en", "User-Agent": "WillardsContractingApp/1.0" } });
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* geocoding failed */ }
  return null;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestNeighborRoute(stops: RouteStop[]): RouteStop[] {
  const routable = stops.filter(s => s.lat !== null && s.lng !== null);
  const nonGeo = stops.filter(s => s.lat === null || s.lng === null);
  if (routable.length <= 1) return stops;
  const remaining = [...routable];
  const ordered: RouteStop[] = [remaining.shift()!];
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;
    remaining.forEach((s, i) => {
      const d = haversine(last.lat!, last.lng!, s.lat!, s.lng!);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    });
    ordered.push(remaining.splice(nearestIdx, 1)[0]);
  }
  return [...ordered, ...nonGeo];
}

async function fetchOsrmRoute(stops: RouteStop[]): Promise<{ coords: [number, number][]; durationSecs: number } | null> {
  const geo = stops.filter(s => s.lat && s.lng);
  if (geo.length < 2) return null;
  try {
    const waypoints = geo.map(s => `${s.lng},${s.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json() as { code: string; routes: Array<{ geometry: { coordinates: number[][] }; duration: number }> };
    if (data.code !== "Ok") return null;
    const route = data.routes[0];
    const coords: [number, number][] = route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
    return { coords, durationSecs: route.duration };
  } catch { return null; }
}

function makeIcon(color: string, label?: string | number) {
  const text = label !== undefined
    ? `<span style="position:absolute;top:0;left:0;width:100%;height:75%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:white;">${label}</span>`
    : "";
  return L.divIcon({
    className: "",
    html: `<div style="width:28px;height:36px;position:relative;"><svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22S28 24.5 28 14C28 6.268 21.732 0 14 0z" fill="${color}" stroke="white" stroke-width="1.5"/><circle cx="14" cy="14" r="6" fill="white" fill-opacity="0.3"/></svg>${text}</div>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -36],
  });
}

function MapFitter({ stops }: { stops: RouteStop[] }) {
  const map = useMap();
  const geoStops = stops.filter(s => s.lat && s.lng);
  useEffect(() => {
    if (geoStops.length === 0) return;
    if (geoStops.length === 1) {
      map.setView([geoStops[0].lat!, geoStops[0].lng!], 14);
    } else {
      const bounds = L.latLngBounds(geoStops.map(s => [s.lat!, s.lng!] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [geoStops.length]);
  return null;
}

function CalDay({ date, count, selected, onClick }: { date: Date; count: number; selected: boolean; onClick: () => void }) {
  const today = isToday(date);
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-lg h-10 w-full text-xs transition-colors",
        selected ? "bg-primary text-primary-foreground font-bold" :
        today ? "border-2 border-primary text-primary font-semibold hover:bg-primary/10" :
        "hover:bg-muted text-foreground"
      )}
    >
      <span>{date.getDate()}</span>
      {count > 0 && (
        <span className={cn(
          "absolute top-0.5 right-0.5 text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center",
          selected ? "bg-white/20 text-white" : "bg-primary text-white"
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

export default function RoutePlanner() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calMonth, setCalMonth] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedOrder, setOptimizedOrder] = useState<RouteStop[] | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const [form, setForm] = useState<EditFormState>({
    title: "",
    address: "",
    notes: "",
    scheduledDate: format(new Date(), "yyyy-MM-dd"),
    estimatedDurationMinutes: 60,
    status: "scheduled",
  });
  const [editForm, setEditForm] = useState<Partial<EditFormState>>({});

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const weekStart = format(startOfWeek(selectedDate, { weekStartsOn: 0 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(selectedDate, { weekStartsOn: 0 }), "yyyy-MM-dd");

  const { data: allStops = [], isLoading } = useQuery<RouteStop[]>({
    queryKey: ["/api/route-stops"],
    queryFn: () => apiFetch("/route-stops") as Promise<RouteStop[]>,
  });

  // Stops visible in the current view (day or week)
  const viewStops = viewMode === "day"
    ? allStops.filter(s => s.scheduledDate === selectedDateStr)
    : allStops.filter(s => s.scheduledDate && s.scheduledDate >= weekStart && s.scheduledDate <= weekEnd);

  // Optimize always operates on the selected day's stops only
  const dayStops = allStops.filter(s => s.scheduledDate === selectedDateStr);

  const displayStops = optimizedOrder ?? viewStops;

  const stopCounts: Record<string, number> = {};
  allStops.forEach(s => {
    if (s.scheduledDate) stopCounts[s.scheduledDate] = (stopCounts[s.scheduledDate] ?? 0) + 1;
  });

  const createStop = useMutation({
    mutationFn: (data: Partial<EditFormState> & { lat?: number | null; lng?: number | null }) =>
      apiFetch("/route-stops", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/route-stops"] });
      setShowAddForm(false);
      setOptimizedOrder(null);
      setRouteCoords(null);
      resetForm();
    },
    onError: () => toast({ title: "Failed to add stop", variant: "destructive" }),
  });

  const updateStop = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<EditFormState> & { lat?: number | null; lng?: number | null; sortOrder?: number } }) =>
      apiFetch(`/route-stops/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/route-stops"] });
      setEditingId(null);
      setOptimizedOrder(null);
      setRouteCoords(null);
    },
    onError: () => toast({ title: "Failed to update stop", variant: "destructive" }),
  });

  const deleteStop = useMutation({
    mutationFn: (id: number) => apiFetch(`/route-stops/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/route-stops"] });
      setOptimizedOrder(null);
      setRouteCoords(null);
    },
    onError: () => toast({ title: "Failed to delete stop", variant: "destructive" }),
  });

  function resetForm() {
    setForm({ title: "", address: "", notes: "", scheduledDate: selectedDateStr, estimatedDurationMinutes: 60, status: "scheduled" });
  }

  async function persistSortOrder(ordered: RouteStop[]) {
    try {
      await Promise.all(
        ordered.map((stop, i) =>
          apiFetch(`/route-stops/${stop.id}`, { method: "PUT", body: JSON.stringify({ sortOrder: i }) })
        )
      );
      await qc.invalidateQueries({ queryKey: ["/api/route-stops"] });
    } catch {
      toast({ title: "Order saved locally — couldn't sync to server", variant: "destructive" });
    }
  }

  async function handleAddStop(e: React.FormEvent) {
    e.preventDefault();
    if (!form.address.trim()) return;
    setGeocoding(true);
    const coords = await geocodeAddress(form.address);
    setGeocoding(false);
    createStop.mutate({ ...form, lat: coords?.lat ?? null, lng: coords?.lng ?? null });
  }

  async function handleOptimize() {
    // Optimize always scopes to the selected day, regardless of view mode
    if (dayStops.length < 2) {
      toast({ title: "Need at least 2 stops on the selected day to optimize" });
      return;
    }
    setIsOptimizing(true);
    const ordered = nearestNeighborRoute(dayStops);
    setOptimizedOrder(ordered);

    const route = await fetchOsrmRoute(ordered);
    if (route) {
      setRouteCoords(route.coords);
      setRouteDuration(route.durationSecs);
    } else {
      setRouteCoords(null);
      setRouteDuration(null);
    }
    setIsOptimizing(false);
    await persistSortOrder(ordered);

    const geoCount = ordered.filter(s => s.lat && s.lng).length;
    toast({
      title: `Route optimized — ${ordered.length} stops${route ? `, ~${Math.round(route.durationSecs / 60)} min drive` : ""}`,
      description: geoCount < ordered.length ? `${ordered.length - geoCount} stop(s) couldn't be geocoded` : undefined,
    });
  }

  async function moveStop(idx: number, dir: -1 | 1) {
    const arr = [...(optimizedOrder ?? viewStops)];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setOptimizedOrder(arr);
    setRouteCoords(null);
    await persistSortOrder(arr);
  }

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, idx: number) {
    if (viewMode !== "day") { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, idx: number) {
    if (viewMode !== "day") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>, dropIdx: number) {
    if (viewMode !== "day") return;
    e.preventDefault();
    const dragIdx = parseInt(e.dataTransfer.getData("text/plain"));
    setDragOverIdx(null);
    if (isNaN(dragIdx) || dragIdx === dropIdx) return;
    const arr = [...(optimizedOrder ?? viewStops)];
    const [removed] = arr.splice(dragIdx, 1);
    arr.splice(dropIdx, 0, removed);
    setOptimizedOrder(arr);
    setRouteCoords(null);
    await persistSortOrder(arr);
  }

  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const calWeeks: Date[][] = [];
  for (let i = 0; i < calDays.length; i += 7) calWeeks.push(calDays.slice(i, i + 7));

  const geoStops = allStops.filter(s => s.lat && s.lng);
  const mapCenter: [number, number] = geoStops.length > 0
    ? [geoStops[0].lat!, geoStops[0].lng!]
    : [37.7719, -87.1111];

  const totalEstDuration = displayStops.reduce((sum, s) => sum + (s.estimatedDurationMinutes ?? 60), 0);
  const viewLabel = viewMode === "day"
    ? format(selectedDate, "EEEE, MMM d")
    : `Week of ${format(startOfWeek(selectedDate, { weekStartsOn: 0 }), "MMM d")}`;

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-130px)] gap-0 -m-4 sm:-m-6 lg:-m-8 overflow-hidden">
      <div className="w-full lg:w-[360px] flex-shrink-0 flex flex-col bg-card border-r border-border overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary text-primary-foreground">
          <div className="flex items-center gap-2">
            <Route className="w-5 h-5" />
            <h1 className="text-base font-display font-bold">Route Planner</h1>
          </div>
          <span className="text-xs text-primary-foreground/70">Asphalt Sealing</span>
        </div>

        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setCalMonth(m => subMonths(m, 1))} className="p-1 rounded hover:bg-muted transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold">{format(calMonth, "MMMM yyyy")}</span>
            <button onClick={() => setCalMonth(m => addMonths(m, 1))} className="p-1 rounded hover:bg-muted transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
              <div key={d} className="text-[10px] text-center text-muted-foreground font-medium">{d}</div>
            ))}
          </div>
          <div className="space-y-0.5">
            {calWeeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-0.5">
                {week.map((day, di) => {
                  const dayStr = format(day, "yyyy-MM-dd");
                  const inMonth = day.getMonth() === calMonth.getMonth();
                  return (
                    <div key={di} className={cn(!inMonth && "opacity-25")}>
                      <CalDay
                        date={day}
                        count={stopCounts[dayStr] ?? 0}
                        selected={isSameDay(day, selectedDate)}
                        onClick={() => { setSelectedDate(day); setOptimizedOrder(null); setRouteCoords(null); }}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex rounded-lg border border-border overflow-hidden mb-2 text-xs font-medium">
            <button
              onClick={() => { setViewMode("day"); setOptimizedOrder(null); setRouteCoords(null); }}
              className={cn(
                "flex-1 py-1.5 transition-colors",
                viewMode === "day" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              Day
            </button>
            <button
              onClick={() => { setViewMode("week"); setOptimizedOrder(null); setRouteCoords(null); }}
              className={cn(
                "flex-1 py-1.5 transition-colors",
                viewMode === "week" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              Week
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">{viewLabel}</p>
              <p className="text-xs text-muted-foreground">
                {displayStops.length} stop{displayStops.length !== 1 ? "s" : ""}
                {displayStops.length > 0 && ` · ~${Math.round(totalEstDuration / 60 * 10) / 10}h est.`}
                {routeDuration != null && ` · ~${Math.round(routeDuration / 60)} min drive`}
              </p>
            </div>
            <div className="flex gap-2">
              {optimizedOrder && (
                <button onClick={() => { setOptimizedOrder(null); setRouteCoords(null); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Reset
                </button>
              )}
              <button
                onClick={handleOptimize}
                disabled={isOptimizing || dayStops.length < 2}
                title={viewMode === "week" ? `Optimizes ${format(selectedDate, "MMM d")} stops` : undefined}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isOptimizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
                Optimize
              </button>
            </div>
          </div>
          {viewMode === "week" && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Optimize and drag-reorder apply to {format(selectedDate, "MMM d")} — switch to Day view to reorder
            </p>
          )}
        </div>

        {showAddForm ? (
          <form onSubmit={handleAddStop} className="px-4 py-3 border-b border-border bg-muted/20 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-foreground">Add Stop</p>
              <button type="button" onClick={() => { setShowAddForm(false); resetForm(); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Label (optional)"
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              required
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="Address or location *"
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Date</label>
                <input
                  type="date"
                  value={form.scheduledDate}
                  onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))}
                  className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Est. Duration (min)</label>
                <input
                  type="number" min={5} step={5}
                  value={form.estimatedDurationMinutes}
                  onChange={e => setForm(f => ({ ...f, estimatedDurationMinutes: parseInt(e.target.value) || 60 }))}
                  className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value as StopStatus }))}
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
            >
              {(Object.keys(STATUS_CONFIG) as StopStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <button
              type="submit"
              disabled={createStop.isPending || geocoding}
              className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {(createStop.isPending || geocoding) && <Loader2 className="w-3 h-3 animate-spin" />}
              {geocoding ? "Geocoding…" : createStop.isPending ? "Adding…" : "Add Stop"}
            </button>
          </form>
        ) : (
          <div className="px-4 py-2 border-b border-border">
            <button
              onClick={() => { setShowAddForm(true); setForm(f => ({ ...f, scheduledDate: selectedDateStr })); }}
              className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Stop
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : displayStops.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
              <MapPin className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No stops {viewMode === "day" ? `on ${format(selectedDate, "MMM d")}` : "this week"}
              </p>
              <p className="text-xs text-muted-foreground/70">Click "Add Stop" to schedule a location</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {displayStops.map((stop, idx) => (
                <StopCard
                  key={stop.id}
                  stop={stop}
                  idx={idx}
                  total={displayStops.length}
                  isEditing={editingId === stop.id}
                  isDragOver={dragOverIdx === idx}
                  editForm={editForm}
                  onEdit={() => {
                    setEditingId(stop.id);
                    setEditForm({
                      title: stop.title ?? "",
                      address: stop.address,
                      notes: stop.notes ?? "",
                      scheduledDate: stop.scheduledDate ?? selectedDateStr,
                      estimatedDurationMinutes: stop.estimatedDurationMinutes ?? 60,
                      status: stop.status,
                    });
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={async () => {
                    setGeocoding(true);
                    const coords = editForm.address !== stop.address
                      ? await geocodeAddress(editForm.address ?? stop.address)
                      : { lat: stop.lat, lng: stop.lng };
                    setGeocoding(false);
                    updateStop.mutate({ id: stop.id, data: { ...editForm, lat: coords?.lat ?? stop.lat, lng: coords?.lng ?? stop.lng } });
                  }}
                  onEditFormChange={patch => setEditForm(f => ({ ...f, ...patch }))}
                  onStatusChange={status => updateStop.mutate({ id: stop.id, data: { status } })}
                  onDelete={() => deleteStop.mutate(stop.id)}
                  onMoveUp={() => moveStop(idx, -1)}
                  onMoveDown={() => moveStop(idx, 1)}
                  onDragStart={e => handleDragStart(e, idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDrop={e => handleDrop(e, idx)}
                  onDragEnd={() => setDragOverIdx(null)}
                  isSaving={updateStop.isPending}
                  geocoding={geocoding}
                  isOptimized={!!optimizedOrder}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 relative min-h-[400px] lg:min-h-0">
        <MapContainer
          center={mapCenter}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapFitter stops={displayStops.filter(s => s.lat && s.lng)} />

          {routeCoords && routeCoords.length > 1 && (
            <Polyline positions={routeCoords} color="#1B3F8C" weight={4} opacity={0.75} dashArray="8 4" />
          )}

          {displayStops.map((stop, idx) => {
            if (!stop.lat || !stop.lng) return null;
            const cfg = STATUS_CONFIG[stop.status];
            const label = optimizedOrder ? idx + 1 : undefined;
            return (
              <Marker
                key={stop.id}
                position={[stop.lat, stop.lng]}
                icon={makeIcon(cfg.mapColor, label)}
              >
                <Popup>
                  <div className="text-sm min-w-[180px]">
                    {label !== undefined && <span className="text-xs text-muted-foreground font-medium">Stop #{label}</span>}
                    <p className="font-semibold text-foreground">{stop.title || stop.address}</p>
                    {stop.title && <p className="text-xs text-muted-foreground">{stop.address}</p>}
                    <div className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border mt-1", cfg.bg, cfg.color)}>
                      {cfg.label}
                    </div>
                    {stop.notes && <p className="text-xs text-muted-foreground mt-1">{stop.notes}</p>}
                    {stop.estimatedDurationMinutes && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <Clock className="w-3 h-3 inline mr-0.5" />{stop.estimatedDurationMinutes} min est.
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {displayStops.some(s => !s.lat || !s.lng) && (
            <div className="absolute bottom-4 right-4 z-[1000] bg-white/90 border border-amber-200 text-amber-700 text-xs px-3 py-2 rounded-lg shadow-md flex items-center gap-2 pointer-events-none">
              <MapPin className="w-3 h-3" />
              {displayStops.filter(s => !s.lat || !s.lng).length} stop(s) couldn't be mapped
            </div>
          )}
        </MapContainer>

        <div className="absolute top-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm border border-border rounded-lg shadow-md px-3 py-2 space-y-1">
          {(Object.entries(STATUS_CONFIG) as [StopStatus, typeof STATUS_CONFIG[StopStatus]][]).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.mapColor }} />
              <span className="text-foreground/80">{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface StopCardProps {
  stop: RouteStop;
  idx: number;
  total: number;
  isEditing: boolean;
  isDragOver: boolean;
  editForm: Partial<EditFormState>;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditFormChange: (patch: Partial<EditFormState>) => void;
  onStatusChange: (status: StopStatus) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  isSaving: boolean;
  geocoding: boolean;
  isOptimized: boolean;
}

function StopCard({
  stop, idx, total, isEditing, isDragOver, editForm,
  onEdit, onCancelEdit, onSaveEdit, onEditFormChange, onStatusChange,
  onDelete, onMoveUp, onMoveDown,
  onDragStart, onDragOver, onDrop, onDragEnd,
  isSaving, geocoding, isOptimized,
}: StopCardProps) {
  const cfg = STATUS_CONFIG[stop.status];

  if (isEditing) {
    return (
      <div className="px-4 py-3 bg-muted/20 space-y-2">
        <input
          value={editForm.title ?? ""}
          onChange={e => onEditFormChange({ title: e.target.value })}
          placeholder="Label (optional)"
          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          required
          value={editForm.address ?? ""}
          onChange={e => onEditFormChange({ address: e.target.value })}
          placeholder="Address *"
          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={editForm.scheduledDate ?? ""}
            onChange={e => onEditFormChange({ scheduledDate: e.target.value })}
            className="px-2 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="number" min={5} step={5}
            value={editForm.estimatedDurationMinutes ?? 60}
            onChange={e => onEditFormChange({ estimatedDurationMinutes: parseInt(e.target.value) || 60 })}
            placeholder="Min"
            className="px-2 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={editForm.status ?? stop.status}
          onChange={e => onEditFormChange({ status: e.target.value as StopStatus })}
          className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
        >
          {(Object.keys(STATUS_CONFIG) as StopStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
        <textarea
          value={editForm.notes ?? ""}
          onChange={e => onEditFormChange({ notes: e.target.value })}
          placeholder="Notes"
          rows={2}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary resize-none"
        />
        <div className="flex gap-2">
          <button
            onClick={onSaveEdit}
            disabled={isSaving || geocoding}
            className="flex-1 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-1"
          >
            {(isSaving || geocoding) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {geocoding ? "Geocoding…" : "Save"}
          </button>
          <button onClick={onCancelEdit} className="px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-muted transition-colors">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        "px-4 py-3 transition-colors cursor-grab active:cursor-grabbing",
        stop.status === "completed" && "opacity-60",
        isDragOver ? "bg-primary/10 border-t-2 border-primary" : "hover:bg-muted/20"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 pt-0.5">
          <GripVertical className="w-4 h-4 text-muted-foreground/50" />
        </div>

        {isOptimized && (
          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold mt-0.5">
            {idx + 1}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">
              {stop.title || stop.address}
            </span>
            <span className={cn("inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0", cfg.bg, cfg.color)}>
              {cfg.label}
            </span>
            {!stop.lat && (
              <span className="inline-flex items-center text-[9px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200 flex-shrink-0">
                No coords
              </span>
            )}
          </div>
          {stop.title && <p className="text-xs text-muted-foreground truncate mt-0.5">{stop.address}</p>}
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            {stop.scheduledDate && (
              <span className="flex items-center gap-0.5">
                <Calendar className="w-3 h-3" />{format(parseISO(stop.scheduledDate), "MMM d")}
              </span>
            )}
            {stop.estimatedDurationMinutes && (
              <span className="flex items-center gap-0.5">
                <Clock className="w-3 h-3" />{stop.estimatedDurationMinutes} min
              </span>
            )}
          </div>
          {stop.notes && <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{stop.notes}</p>}
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={onMoveUp} disabled={idx === 0} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors" title="Move up">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={onMoveDown} disabled={idx === total - 1} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors" title="Move down">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={onEdit} className="p-1 text-muted-foreground hover:text-amber-500 transition-colors" title="Edit">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex gap-1 mt-2 ml-6">
        {(Object.keys(STATUS_CONFIG) as StopStatus[]).map(s => (
          <button
            key={s}
            onClick={() => onStatusChange(s)}
            className={cn(
              "flex-1 py-0.5 rounded text-[9px] font-semibold border transition-colors",
              stop.status === s
                ? `${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].color}`
                : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >
            {STATUS_CONFIG[s].label}
          </button>
        ))}
      </div>
    </div>
  );
}
