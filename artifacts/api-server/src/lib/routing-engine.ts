/**
 * RoutingEngine — the single source of truth for all driving-route calculations.
 *
 * Answers one question: "How do I get from A to B?"
 * It knows nothing about vehicles, MPG, fuel, or business rules.
 *
 * Rules 51–54 of the Architecture Constitution:
 *   - This is the ONLY place OSRM is called server-side for route distance.
 *   - Every feature (job card, profit route, future Supplier→Job, Warehouse→Job)
 *     must call this engine — never implement its own routing.
 *   - The cache lives here; callers do not maintain their own distance caches.
 *
 * @see lib/vehicle-engine.ts — consumes RouteResult to produce operating costs
 */

import { geocodeAddressString } from "../geocode-helpers.js";

export interface RouteResult {
  miles: number | null;
  durationMinutes: number | null;
  routeStatus: "ok" | "missing_address" | "geocoding_failed" | "routing_failed";
  provider: "osrm" | "haversine";
  cached: boolean;
}

/**
 * Haversine great-circle distance between two lat/lng points, in miles.
 * Used as a fallback when OSRM is unreachable — multiply by ROAD_FACTOR for a road estimate.
 */
function haversineMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Road-distance multiplier applied to straight-line distance when OSRM is unavailable. */
const ROAD_FACTOR = 1.25;

// Single in-memory cache shared across all callers — 24-hour TTL.
// Cache key: "<originAddr>|<destinationAddr>" (lowercased)
const routeCache = new Map<string, { result: RouteResult; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const RoutingEngine = {
  /**
   * Calculate the driving route between two address strings.
   *
   * @param origin      Full address string (e.g. "123 Main St, Evansville, IN")
   * @param destination Full address string (e.g. "456 Oak Ave, Booneville, IN")
   * @returns RouteResult with miles, durationMinutes, status, and cache info
   */
  async calculate({
    origin,
    destination,
  }: {
    origin: string;
    destination: string;
  }): Promise<RouteResult> {
    const o = origin.trim();
    const d = destination.trim();

    if (!o || !d) {
      return {
        miles: null,
        durationMinutes: null,
        routeStatus: "missing_address",
        provider: "osrm",
        cached: false,
      };
    }

    const cacheKey = `${o.toLowerCase()}|${d.toLowerCase()}`;
    const entry = routeCache.get(cacheKey);
    if (entry && entry.expiresAt > Date.now()) {
      return { ...entry.result, cached: true };
    }

    // Geocode both addresses in parallel
    const [fromCoords, toCoords] = await Promise.all([
      geocodeAddressString(o),
      geocodeAddressString(d),
    ]);

    if (!fromCoords || !toCoords) {
      return {
        miles: null,
        durationMinutes: null,
        routeStatus: "geocoding_failed",
        provider: "osrm",
        cached: false,
      };
    }

    // Haversine fallback — used for every OSRM failure mode (timeout, non-2xx, empty payload).
    // Straight-line distance × ROAD_FACTOR gives a reasonable road-distance approximation.
    const buildHaversineFallback = (): RouteResult => ({
      miles: Math.round(haversineMiles(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng) * ROAD_FACTOR * 10) / 10,
      durationMinutes: null,
      routeStatus: "ok",
      provider: "haversine",
      cached: false,
    });

    let result: RouteResult;

    try {
      const osrmUrl =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${fromCoords.lng},${fromCoords.lat};${toCoords.lng},${toCoords.lat}` +
        `?overview=false`;

      const osrmRes = await fetch(osrmUrl, {
        headers: { "User-Agent": "BuildPro/1.0 (Willards General Contracting)" },
        signal: AbortSignal.timeout(8000),
      });

      if (!osrmRes.ok) {
        // Non-2xx (e.g. 5xx outage) — fall back rather than returning null miles.
        console.warn(`[routing] OSRM returned HTTP ${osrmRes.status}; using haversine fallback`);
        result = buildHaversineFallback();
      } else {
        const osrmData = (await osrmRes.json()) as {
          routes?: Array<{ distance: number; duration: number }>;
        };
        const route = osrmData.routes?.[0];

        if (!route) {
          // Unexpected empty payload — fall back.
          console.warn("[routing] OSRM returned no routes; using haversine fallback");
          result = buildHaversineFallback();
        } else {
          result = {
            miles: Math.round((route.distance / 1609.344) * 10) / 10,
            durationMinutes: Math.round(route.duration / 60),
            routeStatus: "ok",
            provider: "osrm",
            cached: false,
          };
        }
      }
    } catch {
      // Timeout (AbortSignal) or network error — fall back.
      console.warn("[routing] OSRM fetch failed; using haversine fallback");
      result = buildHaversineFallback();
    }

    routeCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  },

  /** Expose cache stats for diagnostics (e.g. admin routes). */
  cacheSize(): number {
    return routeCache.size;
  },

  /** Purge stale entries — useful for testing or admin cache-clear. */
  evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of routeCache) {
      if (entry.expiresAt <= now) routeCache.delete(key);
    }
  },
};
