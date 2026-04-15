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

router.get(
  "/geocode",
  wrapAsync(async (req: Request, res: Response) => {
    const { street, city, state, postalcode } = req.query as Record<string, string | undefined>;

    if (!street && !city && !postalcode) {
      res.status(400).json({ error: "Provide at least street, city, or postalcode" });
      return;
    }

    if (street) {
      const census = await censusGeocode(street, city, state, postalcode);
      if (census.ok && census.matches.length > 0) {
        res.json(census.matches);
        return;
      }
    }

    const nominatim = await nominatimGeocode(street, city, state, postalcode);
    if (!nominatim.ok) {
      res.status(502).json({ error: "Geocoding service unavailable" });
      return;
    }
    res.json(nominatim.matches);
  })
);

export default router;
