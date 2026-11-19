import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import * as turf from "@turf/turf";
import "leaflet/dist/leaflet.css";
import {
  parseAerialMapGeometry,
  type AerialMapResult,
  type LatLng,
} from "./aerialQuoteMapUtils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const DEFAULT_CENTER: LatLng = [37.7719, -87.1111];
const ESRI_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION = "Tiles © Esri, Vantor, Earthstar Geographics, and the GIS User Community";
const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = "&copy; OpenStreetMap contributors";
const AREA_COLORS = ["#f59e0b", "#10b981", "#8b5cf6", "#ec4899"];
const LINE_COLORS = ["#2563eb", "#dc2626", "#0891b2", "#7c3aed"];
const VERTEX_ICON = L.divIcon({
  className: "",
  html: '<span style="display:block;width:14px;height:14px;border:2px solid white;border-radius:50%;background:#f59e0b;box-shadow:0 1px 5px #0008"></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

type AddressParts = {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

type Props = {
  address: AddressParts;
  autoLocateKey: string;
  savedGeometryJson: string;
  onApply: (result: AerialMapResult) => void;
  className?: string;
};

function squareFeet(points: LatLng[]): number {
  if (points.length < 3) return 0;
  const ring = points.map(([lat, lng]) => [lng, lat] as [number, number]);
  ring.push(ring[0]);
  try {
    return turf.area(turf.polygon([ring])) * 10.764;
  } catch {
    return 0;
  }
}

function lengthFeet(points: LatLng[], close = false): number {
  if (points.length < 2) return 0;
  const coordinates = points.map(([lat, lng]) => [lng, lat] as [number, number]);
  if (close) coordinates.push(coordinates[0]);
  try {
    return turf.length(turf.lineString(coordinates), { units: "kilometers" }) * 3280.84;
  } catch {
    return 0;
  }
}

function FlyTo({ center, zoom }: { center: LatLng | null; zoom: number }) {
  const map = useMap();
  const previous = useRef<LatLng | null>(null);
  useEffect(() => {
    if (!center || center === previous.current) return;
    previous.current = center;
    map.flyTo(center, zoom, { duration: 0.8 });
  }, [center, map, zoom]);
  return null;
}

function DrawClicks({ active, onPoint }: { active: boolean; onPoint: (point: LatLng) => void }) {
  useMapEvents({
    click(event) {
      if (active) onPoint([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

function addressString(address: AddressParts) {
  return [address.street, address.city, address.state, address.zip].filter(Boolean).join(", ");
}

export default function AerialQuoteMap({ address, autoLocateKey, savedGeometryJson, onApply, className = "" }: Props) {
  const [polygons, setPolygons] = useState<LatLng[][]>(() => parseAerialMapGeometry(savedGeometryJson).polygons);
  const [lines, setLines] = useState<LatLng[][]>(() => parseAerialMapGeometry(savedGeometryJson).lines);
  const [activePoints, setActivePoints] = useState<LatLng[]>([]);
  const [drawMode, setDrawMode] = useState<"area" | "length">("area");
  const [isDrawing, setIsDrawing] = useState(false);
  const [satelliteView, setSatelliteView] = useState(true);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [searching, setSearching] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [message, setMessage] = useState("");
  const propertyAddress = addressString(address);
  const lastAutoLocateKey = useRef("");
  const [appliedSignature, setAppliedSignature] = useState(savedGeometryJson);

  useEffect(() => {
    const restored = parseAerialMapGeometry(savedGeometryJson);
    setPolygons(restored.polygons);
    setLines(restored.lines);
    setAppliedSignature(JSON.stringify(restored));
    setActivePoints([]);
    setIsDrawing(false);
  }, [savedGeometryJson]);

  const mapSignature = useMemo(() => JSON.stringify({ polygons, lines }), [polygons, lines]);
  const measures = useMemo(() => ({
    areas: polygons.map(points => ({
      points,
      squareFeet: squareFeet(points),
      perimeterFeet: lengthFeet(points, true),
    })),
    lines: lines.map(points => ({ points, feet: lengthFeet(points) })),
  }), [polygons, lines]);

  const locateProperty = useCallback(async () => {
    if (!propertyAddress) {
      setMessage("Enter the property address above before locating it on the map.");
      return;
    }
    setSearching(true);
    setMessage("");
    try {
      const params = new URLSearchParams();
      if (address.street) params.set("street", address.street);
      if (address.city) params.set("city", address.city);
      if (address.state) params.set("state", address.state);
      if (address.zip) params.set("postalcode", address.zip);
      const response = await fetch(`${BASE}/api/geocode?${params}`);
      if (!response.ok) throw new Error(`Address search failed (${response.status}).`);
      const results = await response.json() as Array<{ lat: string; lon: string }>;
      const first = results[0];
      if (!first || !Number.isFinite(Number(first.lat)) || !Number.isFinite(Number(first.lon))) {
        throw new Error("Address not found. Check the property address and try again.");
      }
      setCenter([Number(first.lat), Number(first.lon)]);
      setMessage("Map centered on the property. Check the imagery date and outline before saving.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not locate the property.");
    } finally {
      setSearching(false);
    }
  }, [address, propertyAddress]);

  useEffect(() => {
    if (!autoLocateKey || autoLocateKey === lastAutoLocateKey.current || !address.street || (!address.city && !address.zip)) return;
    lastAutoLocateKey.current = autoLocateKey;
    void locateProperty();
  }, [address.city, address.street, address.zip, autoLocateKey, locateProperty]);

  async function detectLot() {
    if (!center) {
      setMessage("Locate the property on the map first.");
      return;
    }
    setDetecting(true);
    setMessage("");
    try {
      const response = await fetch(`${BASE}/api/aerial/detect?lat=${center[0]}&lng=${center[1]}`);
      if (!response.ok) throw new Error(`Boundary lookup failed (${response.status}).`);
      const data = await response.json() as { polygons?: LatLng[][] };
      if (!data.polygons?.length) {
        setMessage("No mapped lot boundary was found. Draw the area manually instead.");
        return;
      }
      setPolygons(current => [...current, ...data.polygons!]);
      setMessage(`${data.polygons.length} mapped outline${data.polygons.length === 1 ? "" : "s"} added. Review them before using the measurements.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Boundary lookup failed. Draw the area manually.");
    } finally {
      setDetecting(false);
    }
  }

  function startDrawing(mode: "area" | "length") {
    setDrawMode(mode);
    setActivePoints([]);
    setIsDrawing(true);
    setMessage(mode === "area"
      ? "Click around the area boundary, then finish with at least three points."
      : "Click along the path, then finish with at least two points.");
  }

  function finishDrawing() {
    const minimum = drawMode === "area" ? 3 : 2;
    if (activePoints.length < minimum) {
      setMessage(`Add at least ${minimum} points before finishing this ${drawMode === "area" ? "area" : "length"}.`);
      return;
    }
    if (drawMode === "area") setPolygons(current => [...current, activePoints]);
    else setLines(current => [...current, activePoints]);
    setActivePoints([]);
    setIsDrawing(false);
    setMessage(drawMode === "area" ? "Area added. You can draw another area or apply the measurements." : "Length added. You can measure another line or apply the measurements.");
  }

  function applyMeasurements() {
    const result: AerialMapResult = {
      polygons: measures.areas,
      lines: measures.lines,
    };
    onApply(result);
    setAppliedSignature(mapSignature);
    setMessage("Map measurements added to the measurement list. Save them as a new revision before calculating.");
  }

  return (
    <section className={`overflow-hidden rounded-xl border bg-card shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5">
        <div>
          <h2 className="text-lg font-semibold">2. Map measurements</h2>
          <p className="mt-1 text-sm text-muted-foreground">Draw areas or paths on aerial imagery, then add the results to this property’s measurement revision.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="min-h-11 rounded-md border px-3 text-sm font-medium" onClick={() => setSatelliteView(value => !value)}>
            {satelliteView ? "Show street map" : "Show satellite"}
          </button>
          <button type="button" disabled={searching || !propertyAddress} className="min-h-11 rounded-md border px-3 text-sm font-medium disabled:opacity-50" onClick={() => void locateProperty()}>
            {searching ? "Finding property…" : "Find property"}
          </button>
          <button type="button" disabled={!center || detecting} className="min-h-11 rounded-md border px-3 text-sm font-medium disabled:opacity-50" onClick={() => void detectLot()}>
            {detecting ? "Looking for boundary…" : "Detect lot boundary"}
          </button>
          <button type="button" disabled={isDrawing} className="min-h-11 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50" onClick={() => startDrawing("area")}>
            Draw area
          </button>
          <button type="button" disabled={isDrawing} className="min-h-11 rounded-md border px-3 text-sm font-medium disabled:opacity-50" onClick={() => startDrawing("length")}>
            Measure length
          </button>
        </div>
      </div>

      <div className="relative">
        <MapContainer center={DEFAULT_CENTER} zoom={14} style={{ width: "100%", height: "min(76vh, 760px)", minHeight: "430px" }} zoomControl>
          <TileLayer
            url={satelliteView ? ESRI_URL : OSM_URL}
            attribution={satelliteView ? ESRI_ATTRIBUTION : OSM_ATTRIBUTION}
            maxZoom={20}
          />
          <FlyTo center={center} zoom={19} />
          <DrawClicks active={isDrawing} onPoint={point => setActivePoints(current => [...current, point])} />
          {polygons.map((points, index) => (
            <Polygon key={`area-${index}`} positions={points} pathOptions={{ color: AREA_COLORS[index % AREA_COLORS.length], fillOpacity: 0.24, weight: 2 }} />
          ))}
          {lines.map((points, index) => (
            <Polyline key={`line-${index}`} positions={points} pathOptions={{ color: LINE_COLORS[index % LINE_COLORS.length], weight: 4 }} />
          ))}
          {activePoints.length > 1 && <Polyline positions={activePoints} pathOptions={{ color: "#f59e0b", weight: 3, dashArray: "6 5" }} />}
          {activePoints.map((point, index) => (
            <Marker
              key={`point-${index}`}
              position={point}
              icon={VERTEX_ICON}
              draggable
              eventHandlers={{
                dragend(event) {
                  const { lat, lng } = (event.target as L.Marker).getLatLng();
                  setActivePoints(current => current.map((item, pointIndex) => pointIndex === index ? [lat, lng] : item));
                },
              }}
            />
          ))}
        </MapContainer>
        {isDrawing && (
          <div className="absolute bottom-3 left-1/2 z-[1000] flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-lg bg-background/95 p-2 shadow-lg">
            <span className="px-2 text-sm">{drawMode === "area" ? `${activePoints.length} points · need 3` : `${activePoints.length} points · need 2`}</span>
            <button type="button" disabled={!activePoints.length} className="min-h-10 rounded-md border px-3 text-sm disabled:opacity-50" onClick={() => setActivePoints(points => points.slice(0, -1))}>Undo point</button>
            <button type="button" className="min-h-10 rounded-md border px-3 text-sm" onClick={() => { setActivePoints([]); setIsDrawing(false); setMessage("Drawing cancelled."); }}>Cancel</button>
            <button type="button" disabled={activePoints.length < (drawMode === "area" ? 3 : 2)} className="min-h-10 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50" onClick={finishDrawing}>Finish drawing</button>
          </div>
        )}
      </div>

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          {message && <p role="status" className="mb-3 rounded-md bg-muted/50 px-3 py-2 text-sm">{message}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {measures.areas.map((area, index) => (
              <div key={`area-summary-${index}`} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <span><strong>Area {index + 1}</strong><br /><span className="text-muted-foreground">{Math.round(area.squareFeet).toLocaleString()} sq ft · {Math.round(area.perimeterFeet).toLocaleString()} ft perimeter</span></span>
                <button type="button" className="min-h-10 rounded-md border px-3 text-sm" onClick={() => setPolygons(current => current.filter((_, item) => item !== index))}>Remove</button>
              </div>
            ))}
            {measures.lines.map((line, index) => (
              <div key={`line-summary-${index}`} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <span><strong>Length {index + 1}</strong><br /><span className="text-muted-foreground">{Math.round(line.feet).toLocaleString()} ft</span></span>
                <button type="button" className="min-h-10 rounded-md border px-3 text-sm" onClick={() => setLines(current => current.filter((_, item) => item !== index))}>Remove</button>
              </div>
            ))}
          </div>
          {measures.areas.length === 0 && measures.lines.length === 0 && !isDrawing && (
            <p className="text-sm text-muted-foreground">Find the property, then detect a mapped boundary or draw the areas and paths you need.</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Imagery is for estimating only. Image dates and detail vary by location; verify measurements on site.</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {(polygons.length > 0 || lines.length > 0 || appliedSignature !== JSON.stringify({ polygons: [], lines: [] })) && <button type="button" className="min-h-11 rounded-md border px-4 text-sm font-medium" onClick={() => {
            setPolygons([]);
            setLines([]);
            setActivePoints([]);
            setIsDrawing(false);
            onApply({ polygons: [], lines: [] });
            setAppliedSignature(JSON.stringify({ polygons: [], lines: [] }));
            setMessage("Map-generated measurements removed from the list.");
          }}>Clear map and measurements</button>}
          <button type="button" disabled={(measures.areas.length === 0 && measures.lines.length === 0) || mapSignature === appliedSignature} className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" onClick={applyMeasurements}>
            {mapSignature === appliedSignature ? "Measurements up to date" : "Add map measurements"}
          </button>
        </div>
      </div>
    </section>
  );
}
