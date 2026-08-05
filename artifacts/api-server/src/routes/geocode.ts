import { Router, type Request, type Response } from "express";
import { wrapAsync } from "./guards";
import { censusGeocode, nominatimGeocode, geocodeAddressString } from "../geocode-helpers";
import { db } from "@workspace/db";
import { clientsTable, jobsTable, settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export { censusGeocode, nominatimGeocode };

// In-memory route distance cache: "clientId:jobId" → { miles, expires }
const routeDistanceCache = new Map<string, { miles: number; expires: number }>();

const router = Router();

async function mapboxGeocode(
  address: string,
  token: string
): Promise<{ ok: true; matches: Array<{ display_name: string; lat: string; lon: string; type: string }> } | { ok: false; error: string }> {
  try {
    const params = new URLSearchParams({
      q: address,
      country: "us",
      limit: "1",
      access_token: token,
    });

    const res = await fetch(
      `https://api.mapbox.com/search/geocode/v6/forward?${params}`,
      { headers: { "User-Agent": "BuildPro/1.0 (Willards General Contracting)" } }
    );

    if (!res.ok) {
      console.warn(`[geocode] Mapbox provider error: HTTP ${res.status}`);
      return { ok: false, error: `Mapbox HTTP ${res.status}` };
    }

    const data = await res.json() as {
      features?: Array<{
        geometry: { coordinates: [number, number] };
        properties: { full_address?: string };
      }>;
    };

    const features = data?.features ?? [];
    return {
      ok: true,
      matches: features.map((f) => ({
        display_name: f.properties.full_address ?? "",
        lat: String(f.geometry.coordinates[1]),
        lon: String(f.geometry.coordinates[0]),
        type: "house",
      })),
    };
  } catch (err) {
    console.warn("[geocode] Mapbox provider exception:", err);
    return { ok: false, error: String(err) };
  }
}

router.get(
  "/geocode",
  wrapAsync(async (req: Request, res: Response) => {
    const { street, city, state, postalcode } = req.query as Record<string, string | undefined>;

    if (!street && !city && !postalcode) {
      res.status(400).json({ error: "Provide at least street, city, or postalcode" });
      return;
    }

    // 1. Census Bureau (best for US rural addresses)
    if (street) {
      const census = await censusGeocode(street, city, state, postalcode);
      if (census.ok && census.matches.length > 0) {
        res.json(census.matches);
        return;
      }
    }

    // 2. Nominatim / OpenStreetMap
    const nominatim = await nominatimGeocode(street, city, state, postalcode);
    if (!nominatim.ok) {
      console.warn("[geocode] Nominatim unavailable, trying Mapbox");
    } else if (nominatim.matches.length > 0) {
      res.json(nominatim.matches);
      return;
    }

    // 3. Mapbox (final fallback — requires MAPBOX_TOKEN secret)
    const mapboxToken = process.env.MAPBOX_TOKEN;
    if (mapboxToken) {
      const parts = [street, city, state, postalcode].filter(Boolean).join(", ");
      const mapbox = await mapboxGeocode(parts, mapboxToken);
      if (mapbox.ok && mapbox.matches.length > 0) {
        res.json(mapbox.matches);
        return;
      }
    }

    res.json([]);
  })
);

// ── Route distance: driving miles between a client's address and a job site ──
router.get(
  "/route-distance",
  wrapAsync(async (req: Request, res: Response) => {
    const { clientId, jobId } = req.query as Record<string, string | undefined>;

    if (!clientId || !jobId) {
      res.status(400).json({ error: "clientId and jobId are required" });
      return;
    }

    const cacheKey = `${clientId}:${jobId}`;
    const cached = routeDistanceCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      res.json({ miles: cached.miles });
      return;
    }

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, parseInt(clientId)));
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, parseInt(jobId)));

    if (!client || !job) {
      res.status(404).json({ error: "Client or job not found" });
      return;
    }

    const clientAddr = [client.address, client.city, client.state, client.zip].filter(Boolean).join(", ");
    const jobAddr = [job.address, job.city, job.state].filter(Boolean).join(", ");

    if (!clientAddr.trim() || !jobAddr.trim()) {
      res.json({ miles: null, reason: "missing address" });
      return;
    }

    const [fromCoords, toCoords] = await Promise.all([
      geocodeAddressString(clientAddr),
      geocodeAddressString(jobAddr),
    ]);

    if (!fromCoords || !toCoords) {
      res.json({ miles: null, reason: "geocoding failed" });
      return;
    }

    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromCoords.lng},${fromCoords.lat};${toCoords.lng},${toCoords.lat}?overview=false`;
      const osrmRes = await fetch(osrmUrl, {
        headers: { "User-Agent": "BuildPro/1.0 (Willards General Contracting)" },
        signal: AbortSignal.timeout(8000),
      });

      if (!osrmRes.ok) {
        res.json({ miles: null, reason: "routing service error" });
        return;
      }

      const osrmData = await osrmRes.json() as { routes?: Array<{ distance: number }> };
      const distanceMeters = osrmData.routes?.[0]?.distance;

      if (distanceMeters == null) {
        res.json({ miles: null, reason: "no route found" });
        return;
      }

      const miles = Math.round((distanceMeters / 1609.344) * 10) / 10;
      routeDistanceCache.set(cacheKey, { miles, expires: Date.now() + 24 * 60 * 60 * 1000 });
      res.json({ miles });
    } catch {
      res.json({ miles: null, reason: "routing request failed" });
    }
  })
);

// In-memory cache for business→job distances: "businessAddr|jobAddr" → { miles, expires }
const businessDistanceCache = new Map<string, { miles: number; expires: number }>();

// ── Business distance: driving miles between business address and a job site ──
// Uses settings.companyAddress as the origin — mirrors the fuel-cost calc in the profit endpoint.
// Never affects billing or mileage surcharge — informational only.
router.get(
  "/business-distance",
  wrapAsync(async (req: Request, res: Response) => {
    const { jobId } = req.query as Record<string, string | undefined>;

    if (!jobId) {
      res.status(400).json({ error: "jobId is required" });
      return;
    }

    const [[settings], [job]] = await Promise.all([
      db.select({
        companyAddress: settingsTable.companyAddress,
        companyCity: settingsTable.companyCity,
        companyState: settingsTable.companyState,
      }).from(settingsTable).limit(1),
      db.select({
        address: jobsTable.address,
        city: jobsTable.city,
        state: jobsTable.state,
      }).from(jobsTable).where(eq(jobsTable.id, parseInt(jobId))),
    ]);

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const businessAddr = [settings?.companyAddress, settings?.companyCity, settings?.companyState]
      .filter(Boolean).join(", ");
    const jobAddr = [job.address, job.city, job.state].filter(Boolean).join(", ");

    if (!businessAddr.trim() || !jobAddr.trim()) {
      res.json({ miles: null, reason: "missing address" });
      return;
    }

    const cacheKey = `${businessAddr}|${jobAddr}`;
    const cached = businessDistanceCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      res.json({ miles: cached.miles });
      return;
    }

    const [fromCoords, toCoords] = await Promise.all([
      geocodeAddressString(businessAddr),
      geocodeAddressString(jobAddr),
    ]);

    if (!fromCoords || !toCoords) {
      res.json({ miles: null, reason: "geocoding failed" });
      return;
    }

    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromCoords.lng},${fromCoords.lat};${toCoords.lng},${toCoords.lat}?overview=false`;
      const osrmRes = await fetch(osrmUrl, {
        headers: { "User-Agent": "BuildPro/1.0 (Willards General Contracting)" },
        signal: AbortSignal.timeout(8000),
      });

      if (!osrmRes.ok) {
        res.json({ miles: null, reason: "routing service error" });
        return;
      }

      const osrmData = await osrmRes.json() as { routes?: Array<{ distance: number }> };
      const distanceMeters = osrmData.routes?.[0]?.distance;

      if (distanceMeters == null) {
        res.json({ miles: null, reason: "no route found" });
        return;
      }

      const miles = Math.round((distanceMeters / 1609.344) * 10) / 10;
      businessDistanceCache.set(cacheKey, { miles, expires: Date.now() + 24 * 60 * 60 * 1000 });
      res.json({ miles });
    } catch {
      res.json({ miles: null, reason: "routing request failed" });
    }
  })
);

// Expose the public Mapbox token so the frontend can render Mapbox map tiles.
// This is safe — Mapbox access tokens are designed to be used in client-side code.
router.get(
  "/mapbox-token",
  (_req: Request, res: Response) => {
    const token = process.env.MAPBOX_TOKEN ?? null;
    res.json({ token });
  }
);

export default router;
