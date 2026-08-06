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
  provider: "osrm";
  cached: boolean;
}

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
        return {
          miles: null,
          durationMinutes: null,
          routeStatus: "routing_failed",
          provider: "osrm",
          cached: false,
        };
      }

      const osrmData = (await osrmRes.json()) as {
        routes?: Array<{ distance: number; duration: number }>;
      };
      const route = osrmData.routes?.[0];

      if (!route) {
        return {
          miles: null,
          durationMinutes: null,
          routeStatus: "routing_failed",
          provider: "osrm",
          cached: false,
        };
      }

      const miles = Math.round((route.distance / 1609.344) * 10) / 10;
      const durationMinutes = Math.round(route.duration / 60);

      const result: RouteResult = {
        miles,
        durationMinutes,
        routeStatus: "ok",
        provider: "osrm",
        cached: false,
      };

      routeCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
      return result;
    } catch {
      return {
        miles: null,
        durationMinutes: null,
        routeStatus: "routing_failed",
        provider: "osrm",
        cached: false,
      };
    }
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
