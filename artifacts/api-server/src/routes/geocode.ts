import { Router, type Request, type Response } from "express";
import { wrapAsync } from "./guards";
import { censusGeocode, nominatimGeocode } from "../geocode-helpers";

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
