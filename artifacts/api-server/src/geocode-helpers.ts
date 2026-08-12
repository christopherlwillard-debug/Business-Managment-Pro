import { getCredential } from "./lib/credentialManager.js";

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

export async function googleMapsGeocode(
  fullAddress: string
): Promise<GeoProviderResult> {
  try {
    const apiKey = getCredential("google_maps", "VITE_GOOGLE_API_KEY");
    if (!apiKey) {
      return { ok: false, error: "VITE_GOOGLE_API_KEY not configured" };
    }

    const params = new URLSearchParams({ address: fullAddress, key: apiKey });
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) {
      console.warn(`[geocode] Google Maps provider error: HTTP ${res.status}`);
      return { ok: false, error: `Google Maps HTTP ${res.status}` };
    }

    const data = await res.json();
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.warn(`[geocode] Google Maps API status: ${data.status}`);
      return { ok: false, error: `Google Maps status ${data.status}` };
    }

    const results: Array<{ formatted_address: string; geometry: { location: { lat: number; lng: number } } }> =
      data.results ?? [];

    return {
      ok: true,
      matches: results.map((r) => ({
        display_name: r.formatted_address,
        lat: String(r.geometry.location.lat),
        lon: String(r.geometry.location.lng),
        type: "house",
      })),
    };
  } catch (err) {
    console.warn("[geocode] Google Maps provider exception:", err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Nominatim freeform geocoding using the q= parameter.
 * Handles "City, State" style addresses that structured geocoding misparsesa
 * because it can't distinguish a city name from a street name.
 */
export async function nominatimFreeformGeocode(
  query: string
): Promise<GeoProviderResult> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: "json",
      limit: "5",
      countrycodes: "us",
      addressdetails: "1",
    });

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
      console.warn(`[geocode] Nominatim freeform error: HTTP ${res.status}`);
      return { ok: false, error: `Nominatim freeform HTTP ${res.status}` };
    }

    const data = await res.json();
    if (!Array.isArray(data)) return { ok: true, matches: [] };
    return { ok: true, matches: data as NominatimResult[] };
  } catch (err) {
    console.warn("[geocode] Nominatim freeform exception:", err);
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

  // 1. Census structured — best for full street addresses
  if (street) {
    const census = await censusGeocode(street, city, state, zip);
    if (census.ok && census.matches.length > 0) {
      return { lat: parseFloat(census.matches[0].lat), lng: parseFloat(census.matches[0].lon) };
    }
  }

  // 2. Nominatim structured
  const nominatim = await nominatimGeocode(street, city, state, zip);
  if (nominatim.ok && nominatim.matches.length > 0) {
    return { lat: parseFloat(nominatim.matches[0].lat), lng: parseFloat(nominatim.matches[0].lon) };
  }

  // 3. Nominatim freeform — handles "City, State" addresses where structured
  //    geocoding misroutes the parts (e.g. street="Owensboro", city="KY").
  //    No API key required; works for any address string Nominatim can parse.
  console.log(`[geocode] Structured geocoding failed for "${fullAddress}", trying Nominatim freeform`);
  const freeform = await nominatimFreeformGeocode(fullAddress);
  if (freeform.ok && freeform.matches.length > 0) {
    return { lat: parseFloat(freeform.matches[0].lat), lng: parseFloat(freeform.matches[0].lon) };
  }

  // 4. Google Maps — last resort (requires Geocoding API to be enabled)
  console.log(`[geocode] Nominatim freeform failed for "${fullAddress}", trying Google Maps`);
  const google = await googleMapsGeocode(fullAddress);
  if (google.ok && google.matches.length > 0) {
    return { lat: parseFloat(google.matches[0].lat), lng: parseFloat(google.matches[0].lon) };
  }

  return null;
}
