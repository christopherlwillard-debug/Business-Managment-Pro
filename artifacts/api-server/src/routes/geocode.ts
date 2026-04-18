import { Router, type Request, type Response } from "express";
import { wrapAsync } from "./guards";

const router = Router();

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  type: string;
}

interface CensusMatch {
  matchedAddress: string;
  coordinates: { x: number; y: number };
}

interface CensusResponse {
  result?: { addressMatches?: CensusMatch[] };
}

type GeoProviderResult =
  | { ok: true; matches: NominatimResult[] }
  | { ok: false; error: string };

async function censusGeocode(
  street: string,
  city: string | undefined,
  state: string | undefined,
  postalcode: string | undefined
): Promise<GeoProviderResult> {
  try {
    const params = new URLSearchParams({ benchmark: "Public_AR_Current", format: "json" });
    params.set("street", street);
    if (city)       params.set("city", city);
    if (state)      params.set("state", state);
    if (postalcode) params.set("zip", postalcode);

    const res = await fetch(
      `https://geocoding.geo.census.gov/geocoder/locations/address?${params}`,
      { headers: { "User-Agent": "BuildPro/1.0 (Willards General Contracting)" } }
    );

    if (!res.ok) {
      console.warn(`[geocode] Census provider error: HTTP ${res.status}`);
      return { ok: false, error: `Census HTTP ${res.status}` };
    }

    const data: CensusResponse = await res.json();
    const matches = data?.result?.addressMatches ?? [];
    return {
      ok: true,
      matches: matches.map((m) => ({
        display_name: m.matchedAddress,
        lat: String(m.coordinates.y),
        lon: String(m.coordinates.x),
        type: "house",
      })),
    };
  } catch (err) {
    console.warn("[geocode] Census provider exception:", err);
    return { ok: false, error: String(err) };
  }
}

async function nominatimGeocode(
  street: string | undefined,
  city: string | undefined,
  state: string | undefined,
  postalcode: string | undefined
): Promise<GeoProviderResult> {
  try {
    const params = new URLSearchParams({
      format: "json",
      limit: "5",
      countrycodes: "us",
      addressdetails: "1",
    });
    if (street)     params.set("street", street);
    if (city)       params.set("city", city);
    if (state)      params.set("state", state);
    if (postalcode) params.set("postalcode", postalcode);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: {
          "User-Agent": "BuildPro/1.0 (Willards General Contracting; willardsgeneralcontracting@gmail.com)",
          "Accept-Language": "en-US,en",
          "Referer": "https://buildpro.app",
        },
      }
    );

    if (!res.ok) {
      console.warn(`[geocode] Nominatim provider error: HTTP ${res.status}`);
      return { ok: false, error: `Nominatim HTTP ${res.status}` };
    }

    const data = await res.json();
    if (!Array.isArray(data)) return { ok: true, matches: [] };
    return { ok: true, matches: data as NominatimResult[] };
  } catch (err) {
    console.warn("[geocode] Nominatim provider exception:", err);
    return { ok: false, error: String(err) };
  }
}

async function mapboxGeocode(
  address: string,
  token: string
): Promise<GeoProviderResult> {
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
