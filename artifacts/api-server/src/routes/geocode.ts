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

async function censusGeocode(
  street: string,
  city: string | undefined,
  state: string | undefined,
  postalcode: string | undefined
): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    benchmark: "Public_AR_Current",
    format: "json",
  });
  params.set("street", street);
  if (city)       params.set("city", city);
  if (state)      params.set("state", state);
  if (postalcode) params.set("zip", postalcode);

  const res = await fetch(
    `https://geocoding.geo.census.gov/geocoder/locations/address?${params}`,
    { headers: { "User-Agent": "BuildPro/1.0 (Willards General Contracting)" } }
  );
  if (!res.ok) return [];

  const data: CensusResponse = await res.json();
  const matches = data?.result?.addressMatches ?? [];
  if (matches.length === 0) return [];

  return matches.map((m) => ({
    display_name: m.matchedAddress,
    lat: String(m.coordinates.y),
    lon: String(m.coordinates.x),
    type: "house",
  }));
}

async function nominatimGeocode(
  street: string | undefined,
  city: string | undefined,
  state: string | undefined,
  postalcode: string | undefined
): Promise<NominatimResult[]> {
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
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data as NominatimResult[];
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
      const censusResults = await censusGeocode(street, city, state, postalcode);
      if (censusResults.length > 0) {
        res.json(censusResults);
        return;
      }
    }

    const nominatimResults = await nominatimGeocode(street, city, state, postalcode);
    res.json(nominatimResults);
  })
);

export default router;
