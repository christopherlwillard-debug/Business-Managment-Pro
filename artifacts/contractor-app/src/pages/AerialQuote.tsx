import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { MapContainer, TileLayer, Polygon, Polyline, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as turf from "@turf/turf";
import {
  PenLine, Check, Trash2, X, Search, Layers,
  DollarSign, Ruler, Plus, Minus, ChevronDown, ChevronUp,
  Printer, FileText, AlertCircle, RotateCcw,
  HardHat, Loader2, ArrowLeft, UserCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const OWENSBORO: [number, number] = [37.7719, -87.1111];

type LatLng = [number, number];
type GeoResult = { label: string; lat: number; lon: number; type: string };

const ESRI_SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_SATELLITE_ATTR =
  "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community";
const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = "&copy; <a href='https://openstreetmap.org'>OpenStreetMap</a> contributors";

function autoRate(sf: number): number {
  if (sf < 1000) return 0.40;
  if (sf <= 3000) return 0.28;
  return 0.20;
}

function ceil50(n: number): number {
  return Math.max(300, Math.ceil(n / 50) * 50);
}

function sqFtFromPolygon(pts: LatLng[]): number {
  if (pts.length < 3) return 0;
  const ring = [...pts.map(([lat, lng]) => [lng, lat] as [number, number])];
  ring.push(ring[0]);
  try {
    const poly = turf.polygon([ring]);
    return turf.area(poly) * 10.764;
  } catch {
    return 0;
  }
}

function perimeterFtFromPolygon(pts: LatLng[]): number {
  if (pts.length < 2) return 0;
  const coords = [...pts.map(([lat, lng]) => [lng, lat] as [number, number])];
  coords.push(coords[0]);
  try {
    const line = turf.lineString(coords);
    return turf.length(line, { units: "kilometers" }) * 3280.84;
  } catch {
    return 0;
  }
}

interface MapFlyToProps {
  center: LatLng | null;
  zoom: number;
}

function MapFlyTo({ center, zoom }: MapFlyToProps) {
  const map = useMap();
  const prevCenter = useRef<LatLng | null>(null);
  useEffect(() => {
    if (center && center !== prevCenter.current) {
      prevCenter.current = center;
      map.flyTo(center, zoom, { duration: 1.5 });
    }
  }, [center, zoom, map]);
  return null;
}

interface DrawControllerProps {
  isDrawing: boolean;
  onAddPoint: (pt: LatLng) => void;
}

function DrawController({ isDrawing, onAddPoint }: DrawControllerProps) {
  const map = useMapEvents({
    click(e) {
      if (!isDrawing) return;
      onAddPoint([e.latlng.lat, e.latlng.lng]);
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    if (isDrawing) {
      map.doubleClickZoom.disable();
      container.style.cursor = "crosshair";
    } else {
      map.doubleClickZoom.enable();
      container.style.cursor = "";
    }
    return () => {
      map.doubleClickZoom.enable();
      container.style.cursor = "";
    };
  }, [isDrawing, map]);

  return null;
}

const POLYGON_COLORS = ["#CC1F2B", "#1B3F8C", "#f59e0b", "#10b981", "#8b5cf6", "#06b6d4"];

const pointIcon = L.divIcon({
  className: "",
  html: '<div style="width:12px;height:12px;border-radius:50%;background:#f59e0b;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

function zoomForType(type: string): number {
  if (["city", "town", "village", "county", "state", "administrative"].includes(type)) return 13;
  if (["suburb", "neighbourhood", "quarter"].includes(type)) return 15;
  if (["postcode"].includes(type)) return 14;
  return 18;
}

async function geocodeAddress(
  street: string, city: string, state: string, postalcode: string
): Promise<GeoResult[]> {
  try {
    const params = new URLSearchParams();
    if (street)     params.set("street", street);
    if (city)       params.set("city", city);
    if (state)      params.set("state", state);
    if (postalcode) params.set("postalcode", postalcode);
    const res = await fetch(`${BASE}/api/geocode?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return [];
    return data.map((d: { display_name: string; lat: string; lon: string; type: string }) => ({
      label: d.display_name,
      lat: parseFloat(d.lat),
      lon: parseFloat(d.lon),
      type: d.type ?? "house",
    }));
  } catch {
    return [];
  }
}

export default function AerialQuote() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [street, setStreet] = useState("");
  const [city, setCity] = useState("Owensboro");
  const [stateAbbr, setStateAbbr] = useState("KY");
  const [zip, setZip] = useState("");
  const [searching, setSearching] = useState(false);
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const [flyTo, setFlyTo] = useState<LatLng | null>(null);
  const [flyZoom, setFlyZoom] = useState(18);

  const [polygons, setPolygons] = useState<LatLng[][]>([]);
  const [activePoints, setActivePoints] = useState<LatLng[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [satelliteView, setSatelliteView] = useState(true);

  const [clientName, setClientName] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [ratePerSqFt, setRatePerSqFt] = useState(0.40);
  const [crackLF, setCrackLF] = useState("");
  const [crackRate, setCrackRate] = useState(2.50);
  const [secondCoat, setSecondCoat] = useState(false);
  const [secondCoatRate, setSecondCoatRate] = useState(0.15);
  const [oilStain, setOilStain] = useState(false);
  const [oilStainRate, setOilStainRate] = useState(0.35);
  const [taxPct, setTaxPct] = useState(0);
  const [notes, setNotes] = useState("");
  const [pricingOpen, setPricingOpen] = useState(true);

  const [saving, setSaving] = useState(false);
  const [savedEstimateId, setSavedEstimateId] = useState<number | null>(null);
  const [savedLinked, setSavedLinked] = useState(false);

  const [linkedProspectId, setLinkedProspectId] = useState<number | null>(null);
  const [linkedProspectName, setLinkedProspectName] = useState("");
  const [linkedProspectAddress, setLinkedProspectAddress] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("prospectId");
    const addr = params.get("address") ?? "";
    const c    = params.get("city") ?? "";
    const name = params.get("name") ?? "";

    if (!pid) return;

    setLinkedProspectId(Number(pid));
    setLinkedProspectName(name);
    setLinkedProspectAddress([addr, c].filter(Boolean).join(", "));

    if (addr) setStreet(addr);
    if (c)    setCity(c);
    if (name) setClientName(name);

    const fullAddr = [addr, c].filter(Boolean).join(", ");
    if (fullAddr) setJobAddress(fullAddr);

    if (addr || c) {
      geocodeAddress(addr, c || "Owensboro", "KY", "").then(results => {
        if (results.length > 0) {
          const r = results[0];
          setFlyTo([r.lat, r.lon]);
          setFlyZoom(zoomForType(r.type));
        }
      });
    }
  }, []);

  const measurements = useMemo(() => {
    let totalSqFt = 0;
    let totalPerimFt = 0;
    const byPolygon = polygons.map((pts, i) => {
      const sf = sqFtFromPolygon(pts);
      const pf = perimeterFtFromPolygon(pts);
      totalSqFt += sf;
      totalPerimFt += pf;
      return { index: i, sqFt: sf, perimFt: pf };
    });
    return { totalSqFt, totalPerimFt, byPolygon };
  }, [polygons]);

  useEffect(() => {
    if (measurements.totalSqFt > 0) {
      setRatePerSqFt(autoRate(measurements.totalSqFt));
    }
  }, [measurements.totalSqFt]);

  const quote = useMemo(() => {
    const sf = measurements.totalSqFt;
    const base = ceil50(sf * ratePerSqFt);
    const crack = parseFloat(crackLF || "0") * crackRate;
    const coat = secondCoat ? sf * secondCoatRate : 0;
    const oil = oilStain ? sf * oilStainRate : 0;
    const subtotal = base + crack + coat + oil;
    const tax = subtotal * (taxPct / 100);
    const total = subtotal + tax;
    return { base, crack, coat, oil, subtotal, tax, total };
  }, [measurements.totalSqFt, ratePerSqFt, crackLF, crackRate, secondCoat, secondCoatRate, oilStain, oilStainRate, taxPct]);

  function selectGeoResult(r: GeoResult) {
    setGeoResults([]);
    setFlyTo([r.lat, r.lon]);
    setFlyZoom(zoomForType(r.type));
    if (!jobAddress) {
      const parts = [street.trim(), city && stateAbbr ? `${city}, ${stateAbbr}` : city || stateAbbr, zip].filter(Boolean);
      setJobAddress(parts.join(" "));
    }
  }

  useEffect(() => {
    if (geoResults.length === 0) return;
    function handleClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setGeoResults([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [geoResults.length]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!street.trim() && !city.trim() && !zip.trim()) return;
    setGeoResults([]);
    setSearching(true);
    const results = await geocodeAddress(street.trim(), city.trim(), stateAbbr.trim(), zip.trim());
    setSearching(false);
    if (results.length === 0) {
      toast({ title: "Location not found", description: "Check the address fields and try again.", variant: "destructive" });
      return;
    }
    if (results.length === 1) {
      selectGeoResult(results[0]);
    } else {
      setGeoResults(results);
    }
  }

  const handleAddPoint = useCallback((pt: LatLng) => {
    setActivePoints(prev => [...prev, pt]);
  }, []);

  function startDrawing() {
    setIsDrawing(true);
    setActivePoints([]);
    setSavedEstimateId(null);
  }

  function finishPolygon() {
    if (activePoints.length < 3) {
      toast({ title: "Need at least 3 points", description: "Click more spots on the map to outline the area.", variant: "destructive" });
      return;
    }
    setPolygons(prev => [...prev, activePoints]);
    setActivePoints([]);
    setIsDrawing(false);
  }

  function cancelDrawing() {
    setActivePoints([]);
    setIsDrawing(false);
  }

  function undoLastPoint() {
    setActivePoints(prev => prev.slice(0, -1));
  }

  function deletePolygon(i: number) {
    setPolygons(prev => prev.filter((_, idx) => idx !== i));
    setSavedEstimateId(null);
  }

  function clearAll() {
    setPolygons([]);
    setActivePoints([]);
    setIsDrawing(false);
    setSavedEstimateId(null);
  }

  async function saveEstimate() {
    if (polygons.length === 0) {
      toast({ title: "No areas drawn", description: "Draw at least one area on the map first.", variant: "destructive" });
      return;
    }
    setSaving(true);
    setSavedLinked(false);
    try {
      const lineItems = [
        {
          id: 1,
          category: "Sealing",
          description: `Asphalt Sealing — ${Math.round(measurements.totalSqFt).toLocaleString()} SF`,
          quantity: Math.round(measurements.totalSqFt),
          unit: "SF",
          unitCost: ratePerSqFt,
        },
      ];
      if (parseFloat(crackLF || "0") > 0) {
        lineItems.push({
          id: 2,
          category: "Crack Repair",
          description: "Crack Sealing",
          quantity: parseFloat(crackLF || "0"),
          unit: "LF",
          unitCost: crackRate,
        });
      }
      if (secondCoat) {
        lineItems.push({
          id: 3,
          category: "Sealing",
          description: "Second Coat Application",
          quantity: Math.round(measurements.totalSqFt),
          unit: "SF",
          unitCost: secondCoatRate,
        });
      }
      if (oilStain) {
        lineItems.push({
          id: 4,
          category: "Prep",
          description: "Oil Stain Treatment",
          quantity: Math.round(measurements.totalSqFt),
          unit: "SF",
          unitCost: oilStainRate,
        });
      }

      const title = clientName
        ? `Asphalt Sealing — ${clientName}`
        : jobAddress
        ? `Asphalt Sealing — ${jobAddress}`
        : "Asphalt Sealing Quote";

      const notesText = [
        `Measured via aerial satellite: ${Math.round(measurements.totalSqFt).toLocaleString()} SF (${Math.round(measurements.totalPerimFt).toLocaleString()} LF perimeter)`,
        jobAddress ? `Job address: ${jobAddress}` : "",
        "Measurements are estimates — final verified on-site. Satellite accuracy may vary ±5–10% due to angles or tree coverage.",
        notes,
      ]
        .filter(Boolean)
        .join("\n");

      const body = {
        title,
        status: "draft",
        template: "asphalt_sealing",
        businessLine: "asphalt_sealing",
        lineItems,
        notes: notesText,
        subtotal: String(quote.subtotal.toFixed(2)),
        total: String(quote.total.toFixed(2)),
        markupPercent: null,
        contingencyPercent: null,
      };

      const res = await fetch(`${BASE}/api/estimates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed to save");
      const saved = await res.json();
      setSavedEstimateId(saved.id);

      if (linkedProspectId) {
        try {
          const linkRes = await fetch(`${BASE}/api/prospects/${linkedProspectId}`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              linkedEstimateId: saved.id,
              roughQuote: Math.round(quote.total),
            }),
          });
          if (!linkRes.ok) throw new Error(`Server returned ${linkRes.status}`);
          setSavedLinked(true);
          toast({ title: "Quote saved & linked!", description: `Estimate linked to ${linkedProspectName || "prospect"}.` });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          toast({ title: "Estimate saved", description: `Couldn't auto-link to prospect (${msg}) — open the prospect to link manually.`, variant: "destructive" });
        }
      } else {
        toast({ title: "Estimate saved!", description: `Draft estimate created (ID #${saved.id}). View it in Estimates.` });
      }
    } catch {
      toast({ title: "Failed to save estimate", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const tierLabel =
    measurements.totalSqFt < 1000
      ? "Small (< 1,000 SF) — $0.30–$0.50/SF"
      : measurements.totalSqFt <= 3000
      ? "Medium (1,000–3,000 SF) — $0.22–$0.35/SF"
      : "Large (> 3,000 SF) — $0.15–$0.25/SF";

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-56px)] overflow-hidden bg-background">
      <div className="order-2 lg:order-1 h-[46vh] lg:h-auto w-full lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-r border-border bg-card overflow-y-auto flex-shrink-0 flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <HardHat className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h1 className="font-bold text-foreground text-sm leading-tight">Aerial Quote Tool</h1>
              <p className="text-[11px] text-muted-foreground">Willard's Asphalt Sealing</p>
            </div>
          </div>

          {linkedProspectId && (
            <div className="flex items-start gap-2 px-2.5 py-2 rounded-xl bg-blue-50 border border-blue-200 mb-1">
              <UserCheck className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-blue-800 truncate">
                  Measuring for: {linkedProspectName || "Prospect"}
                </p>
                {linkedProspectAddress && (
                  <p className="text-[11px] text-blue-600 truncate">{linkedProspectAddress}</p>
                )}
              </div>
              <button
                onClick={() => setLocation(`/prospects?openProspect=${linkedProspectId}`)}
                className="text-blue-500 hover:text-blue-700 flex-shrink-0 mt-0.5"
                title="Back to Prospect"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div ref={searchBoxRef} className="relative">
            <form onSubmit={handleSearch} className="space-y-2">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Street Address</label>
                <input
                  type="text"
                  value={street}
                  onChange={e => setStreet(e.target.value)}
                  onKeyDown={e => { if (e.key === "Escape") setGeoResults([]); }}
                  placeholder="123 Main St"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="Owensboro"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="w-16">
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">State</label>
                  <input
                    type="text"
                    value={stateAbbr}
                    onChange={e => setStateAbbr(e.target.value.toUpperCase())}
                    placeholder="KY"
                    maxLength={2}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400 uppercase"
                  />
                </div>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">ZIP Code</label>
                  <input
                    type="text"
                    value={zip}
                    onChange={e => setZip(e.target.value)}
                    placeholder="42301"
                    maxLength={10}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5 text-sm font-semibold transition-colors disabled:opacity-60 flex-shrink-0"
                >
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {!searching && <span>Search</span>}
                </button>
              </div>
            </form>
            {geoResults.length > 1 && (
              <ul className="absolute left-0 right-0 top-full mt-1 z-[9999] bg-background border border-border rounded-xl shadow-lg overflow-hidden">
                {geoResults.map((r, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => selectGeoResult(r)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 dark:hover:bg-amber-900/20 border-b border-border last:border-0 truncate"
                    >
                      {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Drawing Tools</span>
            {polygons.length > 0 && !isDrawing && (
              <button onClick={clearAll} className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Clear All
              </button>
            )}
          </div>

          {!isDrawing ? (
            <button
              onClick={startDrawing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold shadow transition-colors"
            >
              <PenLine className="w-4 h-4" />
              {polygons.length === 0 ? "Draw Area" : "Add Another Area"}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 rounded-xl px-3 py-2.5 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Drawing mode active</p>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                    Click the map to place points around the asphalt area. Place at least 3 points, then click Finish.
                  </p>
                  {activePoints.length > 0 && (
                    <p className="text-[11px] text-amber-600 font-semibold mt-1">{activePoints.length} point{activePoints.length !== 1 ? "s" : ""} placed</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {activePoints.length > 0 && (
                  <button
                    onClick={undoLastPoint}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border bg-muted/50 hover:bg-muted text-sm font-medium transition-colors text-muted-foreground"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Undo
                  </button>
                )}
                <button
                  onClick={finishPolygon}
                  disabled={activePoints.length < 3}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow transition-colors disabled:opacity-40"
                >
                  <Check className="w-3.5 h-3.5" /> Finish
                </button>
                <button
                  onClick={cancelDrawing}
                  className="px-3 py-2 rounded-xl border border-border hover:bg-muted text-muted-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {polygons.length > 0 && (
            <div className="space-y-1.5 mt-1">
              {measurements.byPolygon.map(({ index, sqFt, perimFt }) => {
                const color = POLYGON_COLORS[index % POLYGON_COLORS.length];
                return (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/40 border border-border"
                  >
                    <div
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: color, opacity: 0.8 }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground">Area {index + 1}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {Math.round(sqFt).toLocaleString()} SF &bull; {Math.round(perimFt).toLocaleString()} LF
                      </p>
                    </div>
                    <button
                      onClick={() => deletePolygon(index)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              <div className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/40 flex justify-between text-xs">
                <span className="font-semibold text-amber-900 dark:text-amber-300">Total</span>
                <span className="text-amber-800 dark:text-amber-400">
                  {Math.round(measurements.totalSqFt).toLocaleString()} SF &bull;{" "}
                  {Math.round(measurements.totalPerimFt).toLocaleString()} LF perimeter
                </span>
              </div>
            </div>
          )}

          {polygons.length === 0 && !isDrawing && (
            <div className="py-6 text-center text-muted-foreground">
              <Ruler className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">Search an address and draw polygons around the asphalt area to measure it.</p>
            </div>
          )}
        </div>

        <div className="p-4 border-b border-border space-y-3">
          <button
            onClick={() => setPricingOpen(o => !o)}
            className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              Pricing Controls
            </div>
            {pricingOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {pricingOpen && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Client Name (optional)
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="e.g. Johnson Property"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Job Address (optional)
                </label>
                <input
                  type="text"
                  value={jobAddress}
                  onChange={e => setJobAddress(e.target.value)}
                  placeholder="Fills automatically from search"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">Base Rate (per SF)</label>
                  {measurements.totalSqFt > 0 && (
                    <span className="text-[10px] text-amber-600 font-medium">{tierLabel}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRatePerSqFt(r => Math.max(0.05, parseFloat((r - 0.01).toFixed(2))))}
                    className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={ratePerSqFt}
                    onChange={e => setRatePerSqFt(parseFloat(e.target.value) || 0)}
                    className="flex-1 px-3 py-1.5 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400 text-center font-mono"
                  />
                  <button
                    onClick={() => setRatePerSqFt(r => parseFloat((r + 0.01).toFixed(2)))}
                    className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Crack Sealing (linear ft)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    value={crackLF}
                    onChange={e => setCrackLF(e.target.value)}
                    placeholder="0"
                    className="flex-1 px-3 py-1.5 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                    <span>@</span>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={crackRate}
                      onChange={e => setCrackRate(parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1.5 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
                    />
                    <span>/LF</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${secondCoat ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20" : "border-border hover:bg-muted/40"}`}
                >
                  <input
                    type="checkbox"
                    checked={secondCoat}
                    onChange={e => setSecondCoat(e.target.checked)}
                    className="rounded accent-amber-500"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-foreground">Second Coat</span>
                    <span className="text-[11px] text-muted-foreground ml-2">+${secondCoatRate.toFixed(2)}/SF</span>
                  </div>
                  {secondCoat && (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={secondCoatRate}
                      onChange={e => setSecondCoatRate(parseFloat(e.target.value) || 0)}
                      onClick={e => e.stopPropagation()}
                      className="w-16 px-2 py-1 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono"
                    />
                  )}
                </label>

                <label
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${oilStain ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20" : "border-border hover:bg-muted/40"}`}
                >
                  <input
                    type="checkbox"
                    checked={oilStain}
                    onChange={e => setOilStain(e.target.checked)}
                    className="rounded accent-amber-500"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-foreground">Oil Stain Treatment</span>
                    <span className="text-[11px] text-muted-foreground ml-2">+${oilStainRate.toFixed(2)}/SF</span>
                  </div>
                  {oilStain && (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={oilStainRate}
                      onChange={e => setOilStainRate(parseFloat(e.target.value) || 0)}
                      onClick={e => e.stopPropagation()}
                      className="w-16 px-2 py-1 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono"
                    />
                  )}
                </label>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="20"
                  value={taxPct}
                  onChange={e => setTaxPct(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. 2-coat job, parking lot, etc."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quote Summary</p>

          {measurements.totalSqFt === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-xs">
              Draw areas on the map to generate a quote.
            </div>
          ) : (
            <>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Base sealing ({Math.round(measurements.totalSqFt).toLocaleString()} SF @ ${ratePerSqFt.toFixed(2)}/SF)
                  </span>
                  <span className="font-medium tabular-nums">{formatCurrency(quote.base)}</span>
                </div>
                {quote.crack > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Crack sealing</span>
                    <span className="font-medium tabular-nums">{formatCurrency(quote.crack)}</span>
                  </div>
                )}
                {quote.coat > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Second coat</span>
                    <span className="font-medium tabular-nums">{formatCurrency(quote.coat)}</span>
                  </div>
                )}
                {quote.oil > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Oil stain treatment</span>
                    <span className="font-medium tabular-nums">{formatCurrency(quote.oil)}</span>
                  </div>
                )}
                {quote.tax > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax ({taxPct}%)</span>
                    <span className="font-medium tabular-nums">{formatCurrency(quote.tax)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-2 mt-1">
                  <span className="font-bold text-foreground">Total</span>
                  <span className="font-bold text-amber-600 text-base tabular-nums">{formatCurrency(quote.total)}</span>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground italic leading-snug">
                Measurements are estimates — final verified on-site. Satellite accuracy may vary ±5–10%.
              </p>

              <div className="space-y-2">
                <button
                  onClick={saveEstimate}
                  disabled={saving || polygons.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold shadow transition-colors disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  {saving ? "Saving…" : "Save as Draft Estimate"}
                </button>

                {savedEstimateId && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 text-xs">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      {savedLinked ? (
                        <>
                          <p className="text-emerald-800 dark:text-emerald-300 font-semibold">
                            Estimate linked to {linkedProspectName || "prospect"}!
                          </p>
                          <button
                            onClick={() => setLocation(`/prospects?openProspect=${linkedProspectId}`)}
                            className="flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-medium underline underline-offset-2"
                          >
                            <ArrowLeft className="w-3 h-3" />
                            Back to Prospect
                          </button>
                        </>
                      ) : (
                        <span className="text-emerald-800 dark:text-emerald-300 font-medium">
                          Saved as Draft Estimate #{savedEstimateId} — open Jobs &rarr; Estimates tab to view.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => window.print()}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-border hover:bg-muted text-sm text-muted-foreground font-medium transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Print Quote
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="order-1 lg:order-2 flex-1 relative min-h-0">
        <MapContainer
          center={OWENSBORO}
          zoom={14}
          style={{ width: "100%", height: "100%" }}
          zoomControl={false}
        >
          <TileLayer
            url={satelliteView ? ESRI_SATELLITE_URL : OSM_URL}
            attribution={satelliteView ? ESRI_SATELLITE_ATTR : OSM_ATTR}
            maxZoom={20}
          />

          <MapFlyTo center={flyTo} zoom={flyZoom} />
          <DrawController isDrawing={isDrawing} onAddPoint={handleAddPoint} />

          {polygons.map((pts, i) => {
            const color = POLYGON_COLORS[i % POLYGON_COLORS.length];
            return (
              <Polygon
                key={i}
                positions={pts}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.25, weight: 2 }}
              />
            );
          })}

          {activePoints.length >= 2 && (
            <Polyline
              positions={activePoints}
              pathOptions={{ color: "#f59e0b", weight: 2, dashArray: "6,4" }}
            />
          )}

          {activePoints.map((pt, i) => (
            <Marker
              key={i}
              position={pt}
              icon={pointIcon}
              draggable={true}
              eventHandlers={{
                drag(e) {
                  const { lat, lng } = (e.target as L.Marker).getLatLng();
                  setActivePoints(prev => {
                    const next = [...prev];
                    next[i] = [lat, lng];
                    return next;
                  });
                },
                dragend(e) {
                  const { lat, lng } = (e.target as L.Marker).getLatLng();
                  setActivePoints(prev => {
                    const next = [...prev];
                    next[i] = [lat, lng];
                    return next;
                  });
                },
              }}
            />
          ))}
        </MapContainer>

        <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
          <button
            onClick={() => setSatelliteView(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/90 dark:bg-gray-900/90 border border-border shadow text-xs font-semibold text-foreground hover:bg-white dark:hover:bg-gray-900 transition-colors backdrop-blur-sm"
          >
            <Layers className="w-3.5 h-3.5 text-muted-foreground" />
            {satelliteView ? "Street View" : "Satellite"}
          </button>

          {!isDrawing && (
            <button
              onClick={startDrawing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 shadow text-xs font-semibold text-white transition-colors"
            >
              <PenLine className="w-3.5 h-3.5" />
              Draw Area
            </button>
          )}

          {isDrawing && activePoints.length >= 3 && (
            <button
              onClick={finishPolygon}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow text-xs font-semibold text-white transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Finish ({activePoints.length} pts)
            </button>
          )}
        </div>

        {isDrawing && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
            <div className="bg-gray-900/85 text-white text-xs rounded-xl px-4 py-2 backdrop-blur-sm shadow-lg">
              {activePoints.length === 0
                ? "Click on the map to start outlining the asphalt area"
                : activePoints.length < 3
                ? `${activePoints.length} point${activePoints.length > 1 ? "s" : ""} — keep clicking to outline the area`
                : `${activePoints.length} points — click Finish when done`}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
