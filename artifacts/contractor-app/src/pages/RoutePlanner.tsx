import { useState, useEffect, useMemo } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapPin, Plus, Trash2, ChevronUp, ChevronDown, Route,
  Clock, Calendar,
  Loader2, ChevronLeft, ChevronRight, Navigation,
  Edit2, X, Save, GripVertical, Users, Link as LinkIcon, RefreshCw,
  Layers, Scissors, ExternalLink, Share2, Check,
  Droplets, AlertTriangle, Info, Settings2, CheckCircle2, SquareStack,
  TrendingUp,
} from "lucide-react";
import { useListJobs } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { aggregateCanonicalJobProfit } from "@/lib/jobFinancials";
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
  blockNumber: number | null;
  crewLabel: string | null;
  clientId: number | null;
  prospectId: number | null;
  jobId: number | null;
  clientName: string | null;
  prospectContactName: string | null;
  prospectAddress: string | null;
  jobSqFt: number | null;
  jobCoats: number | null;
  createdAt: string;
}

const BLOCK_COLORS = [
  { bg: "bg-blue-600",    light: "bg-blue-50 border-blue-200",     text: "text-blue-800"   },
  { bg: "bg-amber-600",   light: "bg-amber-50 border-amber-200",   text: "text-amber-800"  },
  { bg: "bg-emerald-600", light: "bg-emerald-50 border-emerald-200", text: "text-emerald-800" },
  { bg: "bg-purple-600",  light: "bg-purple-50 border-purple-200", text: "text-purple-800" },
  { bg: "bg-rose-600",    light: "bg-rose-50 border-rose-200",     text: "text-rose-800"   },
  { bg: "bg-teal-600",    light: "bg-teal-50 border-teal-200",     text: "text-teal-800"   },
  { bg: "bg-orange-600",  light: "bg-orange-50 border-orange-200", text: "text-orange-800" },
  { bg: "bg-indigo-600",  light: "bg-indigo-50 border-indigo-200", text: "text-indigo-800" },
];

function buildGoogleMapsUrl(stops: RouteStop[]): string {
  if (stops.length === 0) return "https://www.google.com/maps";
  // Per-stop: use lat,lng when both are non-null (including 0), else fall back to encoded address
  const waypoints = stops.map(s =>
    (s.lat != null && s.lng != null)
      ? `${s.lat},${s.lng}`
      : encodeURIComponent(s.address)
  );
  const dest = waypoints[waypoints.length - 1];
  if (waypoints.length === 1) return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  const wps = waypoints.slice(0, -1).join("|");
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&waypoints=${wps}`;
}

interface ClientOption {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

interface JobProfitData {
  grossInvoiced: number;
  collected: number;
  jobExpenses: number;
  includedCostTotal: number;
  netProfit: number;
}

interface ProspectOption {
  id: number;
  contactName: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  status: string;
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

function parseAddressParts(address: string): Record<string, string> {
  const params: Record<string, string> = {};
  const zipMatch = address.match(/\b(\d{5})\b/);
  if (zipMatch) params.postalcode = zipMatch[1];

  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return params;

  // Freeform (no commas): pass the whole thing as `street` so Census can
  // parse it as a full address string — still beats a free-text Nominatim call.
  if (parts.length === 1) {
    params.street = parts[0];
    return params;
  }

  params.street = parts[0];

  const stateMatch = address.match(/\b([A-Za-z]{2})\b(?=\s*(?:\d{5}|,|$))/);
  if (stateMatch) params.state = stateMatch[1].toUpperCase();

  if (parts.length >= 2) {
    let rawCity = parts[1];
    if (params.state) rawCity = rawCity.replace(new RegExp(`\\b${params.state}\\b`, "i"), "");
    if (params.postalcode) rawCity = rawCity.replace(params.postalcode, "");
    const city = rawCity.trim().replace(/,+$/, "").trim();
    if (city) params.city = city;
  }

  return params;
}

async function geocodeAddress(address: string, base: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const parts = parseAddressParts(address);
    const qs = new URLSearchParams(parts).toString();
    const res = await fetch(`${base}/api/geocode?${qs}`, { credentials: "include" });
    if (!res.ok) return null;
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
  const geo = stops.filter(s => s.lat != null && s.lng != null);
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

const TANK_LS_KEY = "routePlanner_tankCapacity";
const TANK_DEFAULT = 24000;
const TANK_MIN = 20000;
const TANK_MAX = 27000;

function fmtSqFt(n: number) { return n.toLocaleString() + " sq ft"; }

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
  const [retryingGeocodeId, setRetryingGeocodeId] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [formLinkVal, setFormLinkVal] = useState<string>("");
  const [isSplitting, setIsSplitting] = useState(false);
  const [blockSize, setBlockSize] = useState(9);
  const [editingBlockNum, setEditingBlockNum] = useState<number | null>(null);
  const [copiedBlock, setCopiedBlock] = useState<number | null>(null);
  const [blockLabelInput, setBlockLabelInput] = useState<string>("");
  const [blockDriveTimes, setBlockDriveTimes] = useState<Map<number, number | null>>(new Map());
  const [blockDriveTimesLoading, setBlockDriveTimesLoading] = useState<Set<number>>(new Set());
  const [isSavingLabel, setIsSavingLabel] = useState<boolean>(false);

  // Tank capacity tab state
  const [activeTab, setActiveTab] = useState<"route" | "tank">("route");
  const [tankCapacity, setTankCapacityRaw] = useState<number>(() => {
    const saved = localStorage.getItem(TANK_LS_KEY);
    const parsed = saved ? parseInt(saved) : NaN;
    return !isNaN(parsed) && parsed >= TANK_MIN && parsed <= TANK_MAX ? parsed : TANK_DEFAULT;
  });
  const [showTankEditor, setShowTankEditor] = useState(false);
  const [tankDraft, setTankDraft] = useState(String(TANK_DEFAULT));
  const [tankCheckedIds, setTankCheckedIds] = useState<Set<number>>(new Set());
  const [showMissingJobs, setShowMissingJobs] = useState(false);

  function saveTankCapacity(val: number) {
    setTankCapacityRaw(val);
    localStorage.setItem(TANK_LS_KEY, String(val));
  }

  const { data: allJobs = [] } = useListJobs();
  const { activeBusiness } = useBusiness();

  const asphaltJobs = useMemo(() =>
    allJobs.filter(j =>
      (!activeBusiness || j.businessLine === activeBusiness.slug) &&
      (j.status === "scheduled" || j.status === "in_progress")
    ), [allJobs, activeBusiness]);

  const asphaltJobsByClientId = useMemo(() => {
    const map = new Map<number, typeof asphaltJobs>();
    for (const j of asphaltJobs) {
      if (j.clientId != null) {
        if (!map.has(j.clientId)) map.set(j.clientId, []);
        map.get(j.clientId)!.push(j);
      }
    }
    return map;
  }, [asphaltJobs]);

  function pickJobForStop(stop: RouteStop) {
    // If a specific job is directly linked, use it (exact match)
    if (stop.jobId != null) {
      return allJobs.find(j => j.id === stop.jobId) ?? undefined;
    }
    // Fall back to clientId-based lookup
    if (stop.clientId == null) return undefined;
    const jobs = asphaltJobsByClientId.get(stop.clientId);
    if (!jobs || jobs.length === 0) return undefined;
    if (jobs.length === 1) return jobs[0];
    // Prefer a job whose date range overlaps the stop's scheduled date
    if (stop.scheduledDate) {
      const dateMatch = jobs.find(j =>
        (!j.startDate || j.startDate <= stop.scheduledDate!) &&
        (!j.endDate || j.endDate >= stop.scheduledDate!)
      );
      if (dateMatch) return dateMatch;
    }
    return jobs[0];
  }

  const jobsWithSqFt = useMemo(() => asphaltJobs.filter(j => j.sqFt != null && j.sqFt > 0), [asphaltJobs]);
  const jobsWithoutSqFt = useMemo(() => asphaltJobs.filter(j => j.sqFt == null || j.sqFt === 0), [asphaltJobs]);

  const jobsWithSqFtKey = jobsWithSqFt.map(j => j.id).sort((a, b) => a - b).join(",");
  useEffect(() => {
    setTankCheckedIds(new Set(jobsWithSqFt.map(j => j.id)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsWithSqFtKey]);

  const checkedJobsForTank = jobsWithSqFt.filter(j => tankCheckedIds.has(j.id));
  const totalAdjustedSqFt = checkedJobsForTank.reduce((sum, j) => sum + (j.sqFt ?? 0) * (j.coats ?? 1), 0);
  const tankFillPct = Math.min((totalAdjustedSqFt / tankCapacity) * 100, 100);
  const tankIsWarning = tankFillPct >= 80 && totalAdjustedSqFt < tankCapacity;
  const tankIsFull = totalAdjustedSqFt >= tankCapacity;

  const [formJobId, setFormJobId] = useState<number | null>(null);

  const [form, setForm] = useState<EditFormState>({
    title: "",
    address: "",
    notes: "",
    scheduledDate: format(new Date(), "yyyy-MM-dd"),
    estimatedDurationMinutes: 60,
    status: "scheduled",
  });
  const [editForm, setEditForm] = useState<Partial<EditFormState> & { jobId?: number | null }>({});

  const { data: clientOptions = [] } = useQuery<ClientOption[]>({
    queryKey: ["/api/clients"],
    queryFn: () => fetch(`${BASE}/api/clients`, { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });

  const { data: prospectOptions = [] } = useQuery<ProspectOption[]>({
    queryKey: ["/api/prospects"],
    queryFn: () => fetch(`${BASE}/api/prospects`, { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
    select: (data: any[]) => data.filter((p: any) => p.status === "won" || p.status === "serviced"),
  });

  function parsedLinkIds(val: string): { clientId: number | null; prospectId: number | null } {
    if (!val) return { clientId: null, prospectId: null };
    const [type, id] = val.split(":");
    if (type === "client") return { clientId: parseInt(id), prospectId: null };
    if (type === "prospect") return { clientId: null, prospectId: parseInt(id) };
    return { clientId: null, prospectId: null };
  }

  function handleLinkChange(val: string) {
    setFormLinkVal(val);
    setFormJobId(null);
    if (!val) return;
    const [type, id] = val.split(":");
    if (type === "client") {
      const c = clientOptions.find(c => c.id === parseInt(id));
      if (c) {
        const addr = [c.address, c.city, c.state, c.zip].filter(Boolean).join(", ");
        setForm(f => ({ ...f, title: c.name, address: addr || f.address }));
      }
    } else if (type === "prospect") {
      const p = prospectOptions.find(p => p.id === parseInt(id));
      if (p) {
        const addr = [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ");
        setForm(f => ({ ...f, title: p.contactName || p.address, address: addr || f.address }));
      }
    }
  }

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const weekStart = format(startOfWeek(selectedDate, { weekStartsOn: 0 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(selectedDate, { weekStartsOn: 0 }), "yyyy-MM-dd");

  const { data: allStops = [], isLoading } = useQuery<RouteStop[]>({
    queryKey: ["/api/route-stops"],
    queryFn: () => apiFetch("/route-stops") as Promise<RouteStop[]>,
  });

  const { data: mapboxData } = useQuery<{ token: string | null }>({
    queryKey: ["/api/mapbox-token"],
    queryFn: () => fetch(`${BASE}/api/mapbox-token`, { credentials: "include" }).then(r => r.json()),
    staleTime: Infinity,
  });
  const mapboxToken = mapboxData?.token ?? null;

  // Stops visible in the current view (day or week)
  const viewStops = viewMode === "day"
    ? allStops.filter(s => s.scheduledDate === selectedDateStr)
    : allStops.filter(s => s.scheduledDate && s.scheduledDate >= weekStart && s.scheduledDate <= weekEnd);

  // Optimize always operates on the selected day's stops only
  const dayStops = allStops.filter(s => s.scheduledDate === selectedDateStr);

  const dayJobIds = useMemo(
    () => [...new Set(dayStops.filter(s => s.jobId != null).map(s => s.jobId!))].sort((a, b) => a - b),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayStops.map(s => s.jobId).join(",")],
  );
  const dayJobIdsKey = dayJobIds.join(",");

  const { data: profitSummary = {}, isLoading: isLoadingProfit } = useQuery<Record<number, JobProfitData>>({
    queryKey: ["job-profit-summary", dayJobIdsKey],
    queryFn: () =>
      apiFetch(`/jobs/profit-summary?jobIds=${dayJobIdsKey}`) as unknown as Promise<Record<number, JobProfitData>>,
    staleTime: 60_000,
    enabled: dayJobIds.length > 0,
  });

  const routeProfitStats = useMemo(() => {
    const stopsWithJobs = dayStops.filter(s => s.jobId != null);
    if (stopsWithJobs.length === 0) return null;

    let totalAdjSqFt = 0;
    const profitRows: JobProfitData[] = [];
    const seenJobIds = new Set<number>();

    for (const stop of stopsWithJobs) {
      if (seenJobIds.has(stop.jobId!)) continue;
      seenJobIds.add(stop.jobId!);
      const p = profitSummary[stop.jobId!];
      if (!p) continue;
      const adjSqFt = (stop.jobSqFt ?? 0) * (stop.jobCoats ?? 1);
      totalAdjSqFt += adjSqFt;
      profitRows.push(p);
    }

    const totals = aggregateCanonicalJobProfit(profitRows);
    const profitPerSqFt = totalAdjSqFt > 0 && totals.jobsWithInvoice > 0
      ? totals.totalNetProfit / totalAdjSqFt
      : null;

    return {
      stopsWithJobs: stopsWithJobs.length,
      jobsWithData: profitRows.length,
      hasInvoiceData: totals.jobsWithInvoice > 0,
      totalAdjSqFt: totalAdjSqFt > 0 ? totalAdjSqFt : null,
      totalInvoiced: totals.jobsWithInvoice > 0 ? totals.totalInvoiced : null,
      totalExpenses: profitRows.length > 0 ? totals.totalIncludedCosts : null,
      netProfit: profitRows.length > 0 ? totals.totalNetProfit : null,
      profitPerSqFt,
    };
  }, [dayStops, profitSummary]);

  const displayStops = optimizedOrder ?? viewStops;

  // Compute per-block drive times whenever the day's blocked stops change
  useEffect(() => {
    const stopsWithBlocks = dayStops.filter(s => s.blockNumber != null);
    if (stopsWithBlocks.length === 0) {
      setBlockDriveTimes(new Map());
      return;
    }
    computeBlockDriveTimes(dayStops);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayStops.map(s => `${s.id}:${s.blockNumber}`).join(",")]);

  const stopCounts: Record<string, number> = {};
  allStops.forEach(s => {
    if (s.scheduledDate) stopCounts[s.scheduledDate] = (stopCounts[s.scheduledDate] ?? 0) + 1;
  });

  const createStop = useMutation({
    mutationFn: (data: Partial<EditFormState> & { lat?: number | null; lng?: number | null; clientId?: number | null; prospectId?: number | null; jobId?: number | null }) =>
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

  const fixGeocoding = useMutation({
    mutationFn: () => apiFetch("/route-stops/fix-geocoding", { method: "POST" }) as unknown as Promise<{ total: number; fixed: number; failed: number }>,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/route-stops"] });
      if (data.fixed > 0) {
        toast({ title: `Fixed ${data.fixed} map pin${data.fixed !== 1 ? "s" : ""}`, description: data.failed > 0 ? `${data.failed} address(es) couldn't be located` : undefined });
      } else if (data.total === 0) {
        toast({ title: "All stops already have map pins" });
      } else {
        toast({ title: "Couldn't locate any addresses", description: "Try editing the stop addresses to be more specific", variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Failed to fix map pins", variant: "destructive" }),
  });

  const hasMissingPins = allStops.some(s => s.lat === null);

  function resetForm() {
    setForm({ title: "", address: "", notes: "", scheduledDate: selectedDateStr, estimatedDurationMinutes: 60, status: "scheduled" });
    setFormLinkVal("");
    setFormJobId(null);
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
    const coords = await geocodeAddress(form.address, BASE);
    setGeocoding(false);
    const { clientId, prospectId } = parsedLinkIds(formLinkVal);
    createStop.mutate({ ...form, lat: coords?.lat ?? null, lng: coords?.lng ?? null, clientId, prospectId, jobId: formJobId });
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

    // Auto-split into blocks after optimizing, then compute per-block drive times
    try {
      setIsSplitting(true);
      await apiFetch("/route-stops/split-blocks", { method: "POST", body: JSON.stringify({ date: selectedDateStr, blockSize }) });
      await qc.invalidateQueries({ queryKey: ["/api/route-stops"] });
      // Compute drive times per block from the already-ordered result
      const blockTimesMap = new Map<number, number | null>();
      for (let i = 0; i < ordered.length; i += blockSize) {
        const blockStops = ordered.slice(i, i + blockSize);
        const blockNum = Math.floor(i / blockSize) + 1;
        const blockRoute = await fetchOsrmRoute(blockStops);
        blockTimesMap.set(blockNum, blockRoute?.durationSecs ?? null);
      }
      setBlockDriveTimes(blockTimesMap);
    } catch { /* non-fatal */ } finally {
      setIsSplitting(false);
    }

    const geoCount = ordered.filter(s => s.lat && s.lng).length;
    toast({
      title: `Route optimized — ${ordered.length} stops${route ? `, ~${Math.round(route.durationSecs / 60)} min drive` : ""}`,
      description: geoCount < ordered.length ? `${ordered.length - geoCount} stop(s) couldn't be geocoded` : undefined,
    });
  }

  async function computeBlockDriveTimes(stops: RouteStop[]) {
    const blockMap = new Map<number, RouteStop[]>();
    for (const stop of stops) {
      if (stop.blockNumber == null) continue;
      if (!blockMap.has(stop.blockNumber)) blockMap.set(stop.blockNumber, []);
      blockMap.get(stop.blockNumber)!.push(stop);
    }
    const blockNums = [...blockMap.keys()];
    setBlockDriveTimesLoading(new Set(blockNums));
    const results = new Map<number, number | null>();
    await Promise.all(blockNums.map(async (blockNum) => {
      const blockStops = blockMap.get(blockNum)!;
      try {
        const route = await fetchOsrmRoute(blockStops);
        results.set(blockNum, route?.durationSecs ?? null);
      } catch {
        results.set(blockNum, null);
      } finally {
        setBlockDriveTimesLoading(prev => {
          const next = new Set(prev);
          next.delete(blockNum);
          return next;
        });
      }
    }));
    setBlockDriveTimes(results);
  }

  async function handleSplitBlocks() {
    if (dayStops.length === 0) return;
    setIsSplitting(true);
    try {
      await apiFetch("/route-stops/split-blocks", { method: "POST", body: JSON.stringify({ date: selectedDateStr, blockSize }) });
      // Invalidate and wait for fresh data; useEffect will recompute drive times from fresh query data
      await qc.invalidateQueries({ queryKey: ["/api/route-stops"] });
      toast({ title: `Split into blocks of ${blockSize}` });
    } catch {
      toast({ title: "Failed to split blocks", variant: "destructive" });
    } finally {
      setIsSplitting(false);
    }
  }

  async function handleClearBlocks() {
    setIsSplitting(true);
    try {
      await apiFetch("/route-stops/clear-blocks", { method: "POST", body: JSON.stringify({ date: selectedDateStr }) });
      await qc.invalidateQueries({ queryKey: ["/api/route-stops"] });
    } catch {
      toast({ title: "Failed to clear blocks", variant: "destructive" });
    } finally {
      setIsSplitting(false);
    }
  }

  async function saveBlockLabel(blockNumber: number, newLabel: string, stopsInBlock: RouteStop[]) {
    if (isSavingLabel) return;
    setEditingBlockNum(null);
    const label = newLabel.trim();
    if (!label) return;
    setIsSavingLabel(true);
    try {
      await Promise.all(stopsInBlock.map(s =>
        apiFetch(`/route-stops/${s.id}`, { method: "PUT", body: JSON.stringify({ crewLabel: label, blockNumber }) })
      ));
      await qc.invalidateQueries({ queryKey: ["/api/route-stops"] });
    } catch {
      toast({ title: "Failed to save block label", variant: "destructive" });
    } finally {
      setIsSavingLabel(false);
    }
  }

  async function applyBlockForPosition(stop: RouteStop, arr: RouteStop[], posIdx: number): Promise<RouteStop> {
    const prev = arr[posIdx - 1];
    const next = arr[posIdx + 1];
    const newBlockNumber = prev?.blockNumber ?? next?.blockNumber ?? null;
    const newCrewLabel = prev?.crewLabel ?? next?.crewLabel ?? null;
    if (stop.blockNumber === newBlockNumber && stop.crewLabel === newCrewLabel) return stop;
    try {
      await apiFetch(`/route-stops/${stop.id}`, {
        method: "PUT",
        body: JSON.stringify({ blockNumber: newBlockNumber, crewLabel: newCrewLabel }),
      });
    } catch { /* non-fatal */ }
    return { ...stop, blockNumber: newBlockNumber, crewLabel: newCrewLabel };
  }

  async function moveStop(idx: number, dir: -1 | 1) {
    const arr = [...(optimizedOrder ?? viewStops)];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    // Update block assignment for the moved stop based on its new neighbors
    const movedStop = await applyBlockForPosition(arr[newIdx], arr, newIdx);
    arr[newIdx] = movedStop;
    setOptimizedOrder([...arr]);
    setRouteCoords(null);
    await persistSortOrder(arr);
    await qc.invalidateQueries({ queryKey: ["/api/route-stops"] });
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
    // Update block assignment for the moved stop based on its new neighbors
    const movedStop = await applyBlockForPosition(arr[dropIdx], arr, dropIdx);
    arr[dropIdx] = movedStop;
    setOptimizedOrder([...arr]);
    setRouteCoords(null);
    await persistSortOrder(arr);
    await qc.invalidateQueries({ queryKey: ["/api/route-stops"] });
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
    <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-130px)] gap-0 -m-4 sm:-m-6 lg:-m-8 lg:overflow-hidden">
      <div className="w-full lg:w-[360px] lg:flex-shrink-0 flex flex-col bg-card border-b lg:border-b-0 lg:border-r border-border lg:overflow-y-auto">
        <div className="flex flex-col border-b border-border bg-primary text-primary-foreground">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Route className="w-5 h-5" />
              <h1 className="text-base font-display font-bold">Route Planner</h1>
            </div>
            <span className="text-xs text-primary-foreground/70">Asphalt Sealing</span>
          </div>
          <div className="flex border-t border-primary-foreground/20">
            <button
              onClick={() => setActiveTab("route")}
              className={cn(
                "flex-1 py-2 text-xs font-semibold transition-colors",
                activeTab === "route"
                  ? "bg-primary-foreground/15 text-white"
                  : "text-primary-foreground/60 hover:text-primary-foreground/90"
              )}
            >
              Route Stops
            </button>
            <button
              onClick={() => setActiveTab("tank")}
              className={cn(
                "flex-1 py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1",
                activeTab === "tank"
                  ? "bg-primary-foreground/15 text-white"
                  : "text-primary-foreground/60 hover:text-primary-foreground/90"
              )}
            >
              <Droplets className="w-3.5 h-3.5" />
              Tank Capacity
            </button>
          </div>
        </div>

        {activeTab === "tank" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Tank capacity header */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Droplets className="w-4 h-4 text-amber-500" />
                Tank Capacity
              </p>
              <button
                onClick={() => { setShowTankEditor(o => !o); setTankDraft(String(tankCapacity)); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <Settings2 className="w-3 h-3" />
                {fmtSqFt(tankCapacity)}
              </button>
            </div>

            {/* Tank capacity editor */}
            {showTankEditor && (
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 space-y-2.5">
                <p className="text-xs font-semibold text-amber-900">Adjust tank capacity</p>
                <p className="text-[11px] text-amber-700">Range: {fmtSqFt(TANK_MIN)} – {fmtSqFt(TANK_MAX)}</p>
                <div className="flex gap-2 items-center">
                  <input
                    type="number" min={TANK_MIN} max={TANK_MAX} step={500}
                    value={tankDraft}
                    onChange={e => setTankDraft(e.target.value)}
                    className="w-32 px-2.5 py-1.5 rounded-xl border border-amber-300 bg-white text-sm text-foreground focus:outline-none"
                  />
                  <span className="text-xs text-amber-700">sq ft</span>
                  <button
                    onClick={() => {
                      const v = parseInt(tankDraft);
                      if (!isNaN(v) && v >= TANK_MIN && v <= TANK_MAX) { saveTankCapacity(v); setShowTankEditor(false); }
                    }}
                    className="ml-auto px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors"
                  >Save</button>
                </div>
                <input type="range" min={TANK_MIN} max={TANK_MAX} step={500}
                  value={tankDraft} onChange={e => setTankDraft(e.target.value)}
                  className="w-full accent-amber-500" />
                <div className="flex justify-between text-[10px] text-amber-600">
                  <span>{fmtSqFt(TANK_MIN)}</span>
                  <span>Default: {fmtSqFt(TANK_DEFAULT)}</span>
                  <span>{fmtSqFt(TANK_MAX)}</span>
                </div>
              </div>
            )}

            {/* Capacity bar */}
            <div className={cn("rounded-xl border p-3.5 space-y-2.5", tankIsFull ? "border-red-300 bg-red-50" : tankIsWarning ? "border-amber-300 bg-amber-50" : "border-border bg-card")}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">Tank Usage</span>
                <span className={cn("font-bold text-xs", tankIsFull ? "text-red-600" : tankIsWarning ? "text-amber-600" : "text-emerald-600")}>
                  {fmtSqFt(totalAdjustedSqFt)} / {fmtSqFt(tankCapacity)}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-300", tankIsFull ? "bg-red-500" : tankIsWarning ? "bg-amber-500" : "bg-emerald-500")}
                  style={{ width: `${tankFillPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{checkedJobsForTank.length} job{checkedJobsForTank.length !== 1 ? "s" : ""} selected</span>
                <span className={cn("font-semibold", tankIsFull ? "text-red-600" : tankIsWarning ? "text-amber-600" : "text-emerald-600")}>
                  {tankIsFull ? "⚠ Route Full" : `${fmtSqFt(tankCapacity - totalAdjustedSqFt)} remaining`}
                </span>
              </div>
              {tankIsFull && (
                <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-red-100 border border-red-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 font-medium">Route is at or over capacity. Remove jobs or plan a refill.</p>
                </div>
              )}
              {tankIsWarning && (
                <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-amber-100 border border-amber-200">
                  <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 font-medium">Over 80% capacity — monitor the last jobs on the route.</p>
                </div>
              )}
            </div>

            {/* Job list */}
            {asphaltJobs.length === 0 ? (
              <div className="py-10 text-center space-y-1.5">
                <SquareStack className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">No scheduled asphalt jobs</p>
                <p className="text-xs text-muted-foreground">Add sealcoating jobs in the Jobs page first.</p>
              </div>
            ) : (
              <>
                {jobsWithSqFt.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                        Jobs ({jobsWithSqFt.length})
                      </p>
                      <div className="flex gap-2 text-xs">
                        <button onClick={() => setTankCheckedIds(new Set(jobsWithSqFt.map(j => j.id)))} className="text-primary hover:underline">All</button>
                        <span className="text-muted-foreground">·</span>
                        <button onClick={() => setTankCheckedIds(new Set())} className="text-muted-foreground hover:underline">None</button>
                      </div>
                    </div>
                    {jobsWithSqFt.map(job => {
                      const sf = job.sqFt ?? 0;
                      const c = job.coats ?? 1;
                      const adj = sf * c;
                      const checked = tankCheckedIds.has(job.id);
                      const addr = [job.locationName, job.city, job.state].filter(Boolean).join(", ");
                      return (
                        <div key={job.id} onClick={() => setTankCheckedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(job.id)) next.delete(job.id); else next.add(job.id);
                          return next;
                        })}
                          className={cn("rounded-xl border cursor-pointer transition-all select-none", checked ? "border-amber-300 bg-amber-50" : "border-border bg-card opacity-60")}
                        >
                          <div className="flex items-start gap-2.5 p-3">
                            <div className={cn("mt-0.5 w-4 h-4 rounded flex items-center justify-center border flex-shrink-0 transition-colors", checked ? "bg-amber-500 border-amber-500" : "border-gray-300 bg-white")}>
                              {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-xs text-foreground truncate">{job.title}</p>
                              {addr && (
                                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                                  <span className="truncate">{addr}</span>
                                </p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-[10px] text-muted-foreground">{sf.toLocaleString()} × {c}x</p>
                              <p className={cn("text-xs font-bold", checked ? "text-amber-600" : "text-muted-foreground")}>{adj.toLocaleString()} sq ft</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {jobsWithoutSqFt.length > 0 && (
                  <div className="space-y-1.5">
                    <button
                      onClick={() => setShowMissingJobs(o => !o)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        Missing sq ft ({jobsWithoutSqFt.length})
                      </span>
                      {showMissingJobs ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                    </button>
                    {showMissingJobs && jobsWithoutSqFt.map(job => {
                      const addr = [job.locationName, job.city, job.state].filter(Boolean).join(", ");
                      return (
                        <div key={job.id} className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-dashed border-border bg-card opacity-60">
                          <div className="w-4 h-4 rounded border border-gray-200 bg-muted flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs text-foreground truncate">{job.title}</p>
                            {addr && (
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin className="w-2.5 h-2.5 flex-shrink-0" /><span className="truncate">{addr}</span>
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground italic flex-shrink-0">No sq ft</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "route" && (<>
        {hasMissingPins && (
          <div className="flex items-center justify-between px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800">
            <div className="flex items-center gap-1.5 text-xs">
              <MapPin className="w-3.5 h-3.5 text-amber-500" />
              <span>Some stops are missing map pins</span>
            </div>
            <button
              onClick={() => fixGeocoding.mutate()}
              disabled={fixGeocoding.isPending}
              className="text-xs font-medium text-amber-700 hover:text-amber-900 underline disabled:opacity-50 flex items-center gap-1"
            >
              {fixGeocoding.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Fix now
            </button>
          </div>
        )}

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
            <div className="flex gap-1.5 flex-wrap justify-end">
              {optimizedOrder && (
                <button onClick={() => { setOptimizedOrder(null); setRouteCoords(null); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Reset
                </button>
              )}
              {viewMode === "day" && dayStops.some(s => s.blockNumber) && (
                <button
                  onClick={handleClearBlocks}
                  disabled={isSplitting}
                  className="flex items-center gap-1 px-2.5 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive transition-colors disabled:opacity-50"
                  title="Remove all block assignments for this day"
                >
                  {isSplitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scissors className="w-3 h-3" />}
                  Clear
                </button>
              )}
              {viewMode === "day" && dayStops.length > 0 && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={blockSize}
                    onChange={e => setBlockSize(Math.max(1, Math.min(99, parseInt(e.target.value) || 1)))}
                    className="w-10 px-1 py-1.5 text-xs text-center border border-border rounded-lg bg-background outline-none focus:ring-1 focus:ring-primary"
                    title="Block size (stops per block)"
                  />
                  <button
                    onClick={handleSplitBlocks}
                    disabled={isSplitting || dayStops.length === 0}
                    className="flex items-center gap-1 px-2.5 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:text-primary hover:border-primary transition-colors disabled:opacity-50"
                    title={`Split stops into blocks of ${blockSize}`}
                  >
                    {isSplitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
                    Blocks
                  </button>
                </div>
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

        {routeProfitStats && (
          <div className="px-4 py-2.5 border-b border-border bg-muted/20">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Route Profit
              </p>
              {isLoadingProfit && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>
            {!routeProfitStats.hasInvoiceData ? (
              <p className="text-[11px] text-muted-foreground italic">
                Link jobs with invoices to see profit data.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                  <div className="text-center px-1.5 py-1.5 rounded-lg border border-border bg-card">
                    <div className="text-[9px] text-muted-foreground mb-0.5">Total Sqft</div>
                    <div className="text-[11px] font-semibold text-foreground">
                      {routeProfitStats.totalAdjSqFt != null ? routeProfitStats.totalAdjSqFt.toLocaleString() : "—"}
                    </div>
                  </div>
                  <div className="text-center px-1.5 py-1.5 rounded-lg border border-border bg-card">
                    <div className="text-[9px] text-muted-foreground mb-0.5">Invoiced</div>
                    <div className="text-[11px] font-semibold text-foreground">
                      {routeProfitStats.totalInvoiced != null ? `$${routeProfitStats.totalInvoiced.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                    </div>
                  </div>
                  <div className="text-center px-1.5 py-1.5 rounded-lg border border-border bg-card">
                    <div className="text-[9px] text-muted-foreground mb-0.5">Expenses</div>
                    <div className="text-[11px] font-semibold text-foreground">
                      {routeProfitStats.totalExpenses != null && routeProfitStats.totalExpenses !== 0
                        ? `$${routeProfitStats.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : "—"}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="text-center px-1.5 py-1.5 rounded-lg border border-border bg-card">
                    <div className="text-[9px] text-muted-foreground mb-0.5">Net Profit</div>
                    <div className={cn(
                      "text-[11px] font-semibold",
                      routeProfitStats.netProfit != null && routeProfitStats.netProfit !== 0
                        ? routeProfitStats.netProfit > 0 ? "text-emerald-600" : "text-red-600"
                        : "text-muted-foreground"
                    )}>
                      {routeProfitStats.netProfit != null && routeProfitStats.netProfit !== 0
                        ? routeProfitStats.netProfit > 0
                          ? `+$${routeProfitStats.netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                          : `-$${Math.abs(routeProfitStats.netProfit).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : "—"}
                    </div>
                  </div>
                  <div className={cn(
                    "text-center px-1.5 py-1.5 rounded-lg border text-[11px] font-semibold",
                    routeProfitStats.profitPerSqFt == null
                      ? "border-border bg-card text-muted-foreground"
                      : routeProfitStats.profitPerSqFt >= 0.15
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : routeProfitStats.profitPerSqFt >= 0.05
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-red-50 text-red-700 border-red-200"
                  )}>
                    <div className="text-[9px] font-normal opacity-70 mb-0.5">Profit / sqft</div>
                    {routeProfitStats.profitPerSqFt != null
                      ? `${routeProfitStats.profitPerSqFt >= 0 ? "+" : ""}$${routeProfitStats.profitPerSqFt.toFixed(2)}`
                      : "—"}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {showAddForm ? (
          <form onSubmit={handleAddStop} className="px-4 py-3 border-b border-border bg-muted/20 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-foreground">Add Stop</p>
              <button type="button" onClick={() => { setShowAddForm(false); resetForm(); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            {(clientOptions.length > 0 || prospectOptions.length > 0) && (
              <div>
                <label className="text-[10px] text-muted-foreground flex items-center gap-1 mb-0.5">
                  <LinkIcon className="w-3 h-3" /> Link to client or prospect
                </label>
                <select
                  value={formLinkVal}
                  onChange={e => handleLinkChange(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">— No link —</option>
                  {clientOptions.length > 0 && (
                    <optgroup label="Clients">
                      {clientOptions.map(c => (
                        <option key={`client:${c.id}`} value={`client:${c.id}`}>{c.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {prospectOptions.length > 0 && (
                    <optgroup label="Prospects (won / serviced)">
                      {(prospectOptions as ProspectOption[]).map(p => (
                        <option key={`prospect:${p.id}`} value={`prospect:${p.id}`}>
                          {p.contactName || p.address}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            )}
            {(() => {
              const linkedClientId = formLinkVal.startsWith("client:") ? parseInt(formLinkVal.split(":")[1]) : null;
              const clientJobs = linkedClientId != null ? (asphaltJobsByClientId.get(linkedClientId) ?? []) : [];
              if (clientJobs.length === 0) return null;
              return (
                <div>
                  <label className="text-[10px] text-muted-foreground flex items-center gap-1 mb-0.5">
                    <SquareStack className="w-3 h-3" /> Link to specific job (sq ft / coats)
                  </label>
                  <select
                    value={formJobId ?? ""}
                    onChange={e => setFormJobId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">— Auto-detect —</option>
                    {clientJobs.map(j => (
                      <option key={j.id} value={j.id}>
                        {j.title}{j.sqFt ? ` · ${j.sqFt.toLocaleString()} sq ft` : ""}{j.coats && j.coats > 1 ? ` × ${j.coats}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}
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
          ) : (() => {
            const hasBlocks = viewMode === "day" && displayStops.some(s => s.blockNumber != null);
            if (!hasBlocks) {
              return (
                <div className="divide-y divide-border">
                  {displayStops.map((stop, idx) => {
                    const linkedJob = pickJobForStop(stop);
                    return (
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
                        setEditForm({ title: stop.title ?? "", address: stop.address, notes: stop.notes ?? "", scheduledDate: stop.scheduledDate ?? selectedDateStr, estimatedDurationMinutes: stop.estimatedDurationMinutes ?? 60, status: stop.status, jobId: stop.jobId });
                      }}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={async () => {
                        setGeocoding(true);
                        const coords = editForm.address !== stop.address ? await geocodeAddress(editForm.address ?? stop.address, BASE) : { lat: stop.lat, lng: stop.lng };
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
                      retryGeocoding={retryingGeocodeId === stop.id}
                      jobSqFt={stop.jobId != null ? stop.jobSqFt : (linkedJob?.sqFt ?? null)}
                      jobCoats={stop.jobId != null ? stop.jobCoats : (linkedJob?.coats ?? null)}
                      availableJobs={stop.clientId != null ? (asphaltJobsByClientId.get(stop.clientId) ?? []) : []}
                      profitPerSqFt={(() => {
                        const p = stop.jobId != null ? profitSummary[stop.jobId] : undefined;
                        if (!p || p.grossInvoiced === 0 || !stop.jobSqFt || stop.jobSqFt <= 0) return null;
                        return p.netProfit / stop.jobSqFt;
                      })()}
                      showNoInvoice={
                        stop.jobId != null &&
                        stop.jobSqFt != null && stop.jobSqFt > 0 &&
                        profitSummary[stop.jobId] != null &&
                        profitSummary[stop.jobId].grossInvoiced === 0
                      }
                      onRetryGeocode={async () => {
                        setRetryingGeocodeId(stop.id);
                        const coords = await geocodeAddress(stop.address, BASE);
                        setRetryingGeocodeId(null);
                        if (coords) {
                          updateStop.mutate({ id: stop.id, data: { lat: coords.lat, lng: coords.lng } }, { onSuccess: () => toast({ title: `Coordinates found — ${stop.title || stop.address} is now on the map` }) });
                        } else {
                          toast({ title: "Geocoding failed", description: "Could not find coordinates for this address.", variant: "destructive" });
                        }
                      }}
                    />
                    );
                  })}
                </div>
              );
            }

            // Group by blockNumber
            const blockMap = new Map<number | null, RouteStop[]>();
            for (const stop of displayStops) {
              const key = stop.blockNumber ?? null;
              if (!blockMap.has(key)) blockMap.set(key, []);
              blockMap.get(key)!.push(stop);
            }
            const sortedBlockNums = [...blockMap.keys()].sort((a, b) => {
              if (a === null) return 1;
              if (b === null) return -1;
              return a - b;
            });

            return (
              <div>
                {sortedBlockNums.map(blockNum => {
                  const stopsInBlock = blockMap.get(blockNum)!;
                  const label = stopsInBlock[0]?.crewLabel ?? (blockNum != null ? `Block ${blockNum}` : "Unblocked");
                  const colorIdx = blockNum != null ? (blockNum - 1) % BLOCK_COLORS.length : -1;
                  const color = colorIdx >= 0 ? BLOCK_COLORS[colorIdx] : null;
                  const mapsUrl = buildGoogleMapsUrl(stopsInBlock);
                  const isEditingLabel = editingBlockNum === blockNum;
                  const totalMinutes = stopsInBlock.reduce((sum, s) => sum + (s.estimatedDurationMinutes ?? 60), 0);

                  return (
                    <div key={blockNum ?? "unblocked"} className="mb-1">
                      {blockNum != null ? (
                        <div className={cn("flex items-center justify-between px-3 py-2 border-b border-t", color!.light)}>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", color!.bg)} />
                            {isEditingLabel ? (
                              <form
                                onSubmit={e => { e.preventDefault(); saveBlockLabel(blockNum, blockLabelInput, stopsInBlock); }}
                                className="flex items-center gap-1 flex-1"
                              >
                                <input
                                  autoFocus
                                  value={blockLabelInput}
                                  onChange={e => setBlockLabelInput(e.target.value)}
                                  className="flex-1 text-xs font-semibold px-1.5 py-0.5 rounded border border-border bg-background outline-none focus:ring-1 focus:ring-primary min-w-0"
                                  onBlur={() => saveBlockLabel(blockNum, blockLabelInput, stopsInBlock)}
                                  onKeyDown={e => e.key === "Escape" && setEditingBlockNum(null)}
                                />
                                <button type="submit" className="p-1 text-primary hover:text-primary/80">
                                  <Save className="w-3 h-3" />
                                </button>
                              </form>
                            ) : (
                              <span className={cn("text-xs font-semibold truncate", color!.text)}>{label}</span>
                            )}
                            {!isEditingLabel && (
                              <button
                                onClick={() => { setEditingBlockNum(blockNum); setBlockLabelInput(label); }}
                                className={cn("p-0.5 rounded hover:bg-white/50 flex-shrink-0 transition-colors", color!.text)}
                                title="Edit block label"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            )}
                            <span className={cn("text-[10px] font-medium flex-shrink-0", color!.text)}>
                              {stopsInBlock.length} stop{stopsInBlock.length !== 1 ? "s" : ""} · ~{Math.round(totalMinutes / 60 * 10) / 10}h work
                              {blockDriveTimesLoading.has(blockNum)
                                ? " · …"
                                : blockDriveTimes.get(blockNum) != null
                                  ? ` · ~${Math.round(blockDriveTimes.get(blockNum)! / 60)} min drive`
                                  : null}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn("flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors text-white", color!.bg, "hover:opacity-90")}
                              title={`Open ${label} in Google Maps`}
                            >
                              <ExternalLink className="w-3 h-3" />
                              Navigate
                            </a>
                            <button
                              onClick={async () => {
                                const copyToClipboard = async () => {
                                  try {
                                    await navigator.clipboard.writeText(mapsUrl);
                                    setCopiedBlock(blockNum);
                                    toast({ title: "Link copied!", description: `${label} route link copied to clipboard.` });
                                    setTimeout(() => setCopiedBlock(null), 2000);
                                  } catch {
                                    toast({ title: "Could not copy", description: "Please copy the link manually.", variant: "destructive" });
                                  }
                                };
                                if (navigator.share && navigator.canShare?.({ url: mapsUrl })) {
                                  try {
                                    await navigator.share({
                                      title: `${label} route`,
                                      text: `Here's the ${label} route for today:`,
                                      url: mapsUrl,
                                    });
                                  } catch (err) {
                                    // AbortError = user cancelled, do nothing; anything else, fall back to clipboard
                                    if (err instanceof Error && err.name !== "AbortError") {
                                      await copyToClipboard();
                                    }
                                  }
                                } else {
                                  await copyToClipboard();
                                }
                              }}
                              className={cn("flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors text-white", color!.bg, "hover:opacity-90")}
                              title={`Share ${label} route`}
                            >
                              {copiedBlock === blockNum ? <Check className="w-3 h-3" /> : <Share2 className="w-3 h-3" />}
                              Share
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center px-3 py-1.5 bg-muted/30 border-b border-t border-border">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Unblocked</span>
                          <span className="text-[10px] text-muted-foreground ml-2">{stopsInBlock.length} stop{stopsInBlock.length !== 1 ? "s" : ""}</span>
                        </div>
                      )}
                      <div className="divide-y divide-border">
                        {stopsInBlock.map((stop) => {
                          const idx = displayStops.indexOf(stop);
                          const linkedJob = pickJobForStop(stop);
                          return (
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
                                setEditForm({ title: stop.title ?? "", address: stop.address, notes: stop.notes ?? "", scheduledDate: stop.scheduledDate ?? selectedDateStr, estimatedDurationMinutes: stop.estimatedDurationMinutes ?? 60, status: stop.status, jobId: stop.jobId });
                              }}
                              onCancelEdit={() => setEditingId(null)}
                              onSaveEdit={async () => {
                                setGeocoding(true);
                                const coords = editForm.address !== stop.address ? await geocodeAddress(editForm.address ?? stop.address, BASE) : { lat: stop.lat, lng: stop.lng };
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
                              retryGeocoding={retryingGeocodeId === stop.id}
                              jobSqFt={stop.jobId != null ? stop.jobSqFt : (linkedJob?.sqFt ?? null)}
                              jobCoats={stop.jobId != null ? stop.jobCoats : (linkedJob?.coats ?? null)}
                              availableJobs={stop.clientId != null ? (asphaltJobsByClientId.get(stop.clientId) ?? []) : []}
                              profitPerSqFt={(() => {
                                const p = stop.jobId != null ? profitSummary[stop.jobId] : undefined;
                                if (!p || p.grossInvoiced === 0 || !stop.jobSqFt || stop.jobSqFt <= 0) return null;
                                return p.netProfit / stop.jobSqFt;
                              })()}
                              showNoInvoice={
                                stop.jobId != null &&
                                stop.jobSqFt != null && stop.jobSqFt > 0 &&
                                profitSummary[stop.jobId] != null &&
                                profitSummary[stop.jobId].grossInvoiced === 0
                              }
                              onRetryGeocode={async () => {
                                setRetryingGeocodeId(stop.id);
                                const coords = await geocodeAddress(stop.address, BASE);
                                setRetryingGeocodeId(null);
                                if (coords) {
                                  updateStop.mutate({ id: stop.id, data: { lat: coords.lat, lng: coords.lng } }, { onSuccess: () => toast({ title: `Coordinates found — ${stop.title || stop.address} is now on the map` }) });
                                } else {
                                  toast({ title: "Geocoding failed", description: "Could not find coordinates for this address.", variant: "destructive" });
                                }
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </>)}
      </div>

      {activeTab === "route" && <div className="relative h-[320px] lg:flex-1 lg:h-auto">
        <MapContainer
          center={mapCenter}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
          className="z-0"
        >
          {mapboxToken ? (
            <TileLayer
              attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${mapboxToken}`}
              tileSize={512}
              zoomOffset={-1}
              maxZoom={22}
            />
          ) : (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          )}
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
                    {(stop.clientName || stop.prospectContactName) && (
                      <p className="text-xs text-blue-600 mt-0.5">
                        {stop.clientName ? `Client: ${stop.clientName}` : `Prospect: ${stop.prospectContactName}`}
                      </p>
                    )}
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
      </div>}
    </div>
  );
}

interface AvailableJob {
  id: number;
  title: string;
  sqFt?: number | null;
  coats?: number | null;
}

interface StopCardProps {
  stop: RouteStop;
  idx: number;
  total: number;
  isEditing: boolean;
  isDragOver: boolean;
  editForm: Partial<EditFormState> & { jobId?: number | null };
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditFormChange: (patch: Partial<EditFormState> & { jobId?: number | null }) => void;
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
  onRetryGeocode: () => void;
  retryGeocoding: boolean;
  jobSqFt?: number | null;
  jobCoats?: number | null;
  availableJobs?: AvailableJob[];
  profitPerSqFt?: number | null;
  showNoInvoice?: boolean;
}

function StopCard({
  stop, idx, total, isEditing, isDragOver, editForm,
  onEdit, onCancelEdit, onSaveEdit, onEditFormChange, onStatusChange,
  onDelete, onMoveUp, onMoveDown,
  onDragStart, onDragOver, onDrop, onDragEnd,
  isSaving, geocoding, isOptimized, onRetryGeocode, retryGeocoding,
  jobSqFt, jobCoats, availableJobs = [], profitPerSqFt, showNoInvoice,
}: StopCardProps) {
  const cfg = STATUS_CONFIG[stop.status];

  if (isEditing) {
    return (
      <div className="px-4 py-3 bg-muted/20 space-y-2">
        {availableJobs.length > 0 && (
          <div>
            <label className="text-[10px] text-muted-foreground flex items-center gap-1 mb-0.5">
              <SquareStack className="w-3 h-3" /> Linked job (sq ft / coats)
            </label>
            <select
              value={editForm.jobId ?? ""}
              onChange={e => onEditFormChange({ jobId: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Auto-detect —</option>
              {availableJobs.map(j => (
                <option key={j.id} value={j.id}>
                  {j.title}{j.sqFt ? ` · ${j.sqFt.toLocaleString()} sq ft` : ""}{j.coats && j.coats > 1 ? ` × ${j.coats}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
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
            {(!stop.lat || !stop.lng) && (
              <>
                <span className="inline-flex items-center text-[9px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200 flex-shrink-0">
                  No coords
                </span>
                <button
                  onClick={e => { e.stopPropagation(); onRetryGeocode(); }}
                  disabled={retryGeocoding}
                  className="inline-flex items-center gap-0.5 text-[9px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-200 flex-shrink-0 hover:bg-blue-100 transition-colors disabled:opacity-60"
                  title="Retry geocoding this address"
                >
                  {retryGeocoding ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
                  {retryGeocoding ? "Geocoding…" : "Retry geocode"}
                </button>
              </>
            )}
          </div>
          {stop.title && <p className="text-xs text-muted-foreground truncate mt-0.5">{stop.address}</p>}
          {(stop.clientName || stop.prospectContactName || stop.prospectAddress) && (
            <p className="text-[10px] text-primary/70 mt-0.5 flex items-center gap-0.5 truncate">
              <Users className="w-2.5 h-2.5 flex-shrink-0" />
              {stop.clientName ? `Client: ${stop.clientName}` : `Prospect: ${stop.prospectContactName || stop.prospectAddress}`}
            </p>
          )}
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
            {jobSqFt != null && jobSqFt > 0 && (
              <span className="flex items-center gap-0.5 text-primary/80 font-medium">
                <SquareStack className="w-3 h-3" />{jobSqFt.toLocaleString()} sq ft
                {jobCoats != null && jobCoats > 1 && (
                  <span className="ml-0.5 text-muted-foreground font-normal">× {jobCoats}</span>
                )}
              </span>
            )}
          </div>
          {(profitPerSqFt != null || showNoInvoice) && (
            <div className="mt-1 ml-0">
              {showNoInvoice ? (
                <span className="text-[10px] text-muted-foreground italic">No invoice</span>
              ) : profitPerSqFt != null ? (
                <span className={cn(
                  "inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border",
                  profitPerSqFt >= 0.15
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : profitPerSqFt >= 0.05
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-red-50 text-red-700 border-red-200"
                )}>
                  <TrendingUp className="w-2.5 h-2.5" />
                  {profitPerSqFt >= 0 ? "+" : ""}${profitPerSqFt.toFixed(2)} / sqft
                </span>
              ) : null}
            </div>
          )}
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
