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

export type GeoProviderResult =
  | { ok: true; matches: NominatimResult[] }
  | { ok: false; error: string };

export async function censusGeocode(
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
      {
        headers: { "User-Agent": "BuildPro/1.0 (Willards General Contracting)" },
        signal: AbortSignal.timeout(5000),
      }
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

export async function nominatimGeocode(
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
        signal: AbortSignal.timeout(5000),
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

export async function geocodeAddressString(
  fullAddress: string
): Promise<{ lat: number; lng: number } | null> {
  const parts = fullAddress.split(",").map((p) => p.trim());
  const street = parts[0] || fullAddress;
  const city = parts[1];
  const stateZip = parts[2]?.trim();
  const state = stateZip?.replace(/\d+/g, "").trim() || undefined;
  const zip = stateZip?.match(/\d{5}/)?.[0];

  if (street) {
    const census = await censusGeocode(street, city, state, zip);
    if (census.ok && census.matches.length > 0) {
      return { lat: parseFloat(census.matches[0].lat), lng: parseFloat(census.matches[0].lon) };
    }
  }

  const nominatim = await nominatimGeocode(street, city, state, zip);
  if (nominatim.ok && nominatim.matches.length > 0) {
    return { lat: parseFloat(nominatim.matches[0].lat), lng: parseFloat(nominatim.matches[0].lon) };
  }

  return null;
}
