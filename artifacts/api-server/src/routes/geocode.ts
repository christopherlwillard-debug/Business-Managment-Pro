import { Router, type Request, type Response } from "express";
import { wrapAsync } from "./guards";
import { censusGeocode, nominatimGeocode } from "../geocode-helpers";
import { db } from "@workspace/db";
import { clientsTable, jobsTable, settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { RoutingEngine } from "../lib/routing-engine.js";

export { censusGeocode, nominatimGeocode };

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
// Uses RoutingEngine — the single source of truth for all driving-distance calculations (Rule 51).
// Cache is owned by RoutingEngine; no local cache needed here.
router.get(
  "/route-distance",
  wrapAsync(async (req: Request, res: Response) => {
    const { clientId, jobId } = req.query as Record<string, string | undefined>;

    if (!clientId || !jobId) {
      res.status(400).json({ error: "clientId and jobId are required" });
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

    const result = await RoutingEngine.calculate({ origin: clientAddr, destination: jobAddr });
    res.json({
      miles: result.miles,
      ...(result.routeStatus !== "ok" ? { reason: result.routeStatus } : {}),
    });
  })
);

// ── Business distance: driving miles between business address and a job site ──
// Uses RoutingEngine — the single source of truth for all driving-distance calculations (Rule 51).
// Shares the same cache as the profit route's fuel-cost calculation (same engine, same cache key),
// so the "X mi from shop" on the job card and the Estimated Fuel Cost are always identical.
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
        companyZip: settingsTable.companyZip,
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

    const businessAddr = [settings?.companyAddress, settings?.companyCity, settings?.companyState, settings?.companyZip]
      .filter(Boolean).join(", ");
    const jobAddr = [job.address, job.city, job.state].filter(Boolean).join(", ");

    const result = await RoutingEngine.calculate({ origin: businessAddr, destination: jobAddr });
    res.json({
      miles: result.miles,
      ...(result.routeStatus !== "ok" ? { reason: result.routeStatus } : {}),
    });
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
