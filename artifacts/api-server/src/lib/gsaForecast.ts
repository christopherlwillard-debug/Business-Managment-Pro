/**
 * GSA Forecast of Contracting Opportunities — Connector Foundation
 *
 * The GSA Forecast tool (https://forecast.acquisition.gov) contains agency-submitted
 * planned acquisitions with anticipated solicitation/award timing, NAICS codes,
 * place of performance, estimated values, and set-aside information.
 *
 * This is EARLY INTELLIGENCE — opportunities appear here months before they reach
 * SAM.gov as active solicitations. Useful for bid pipeline planning.
 *
 * Official API: https://forecast.acquisition.gov/#/api
 *
 * Policy: No data is fabricated or scraped from unofficial sources.
 * This connector populates only when the GSA Forecast API is reachable.
 * Graceful empty-return on any failure.
 */

export interface GsaForecastOpportunity {
  noticeId:                    string;
  title:                       string;
  agency:                      string | null;
  subAgency:                   string | null;
  naicsCode:                   string | null;
  description:                 string | null;
  estimatedValue:              string | null;   // e.g. "$250K–$500K"
  anticipatedSolicitationDate: string | null;   // YYYY-MM-DD or "FY2026 Q2"
  anticipatedAwardDate:        string | null;
  setAside:                    string | null;   // raw set-aside description
  placeOfPerformance:          string | null;
  contactName:                 string | null;
  contactEmail:                string | null;
  fiscalYear:                  number | null;
  url:                         string;
}

// ── GSA Forecast API ──────────────────────────────────────────────────────────

const GSA_FORECAST_BASE = "https://forecast.acquisition.gov/api";

// Shape of a record returned by the GSA Forecast API.
// Field names derived from the GSA Forecast API documentation.
interface GsaRecord {
  id?:                             string | number;
  title?:                          string;
  agency_name?:                    string;
  sub_agency_name?:                string;
  naics?:                          string;
  description?:                    string;
  est_value_range?:                string;
  anticipated_solicitation_date?:  string;
  contract_award_fiscal_year?:     string | number;
  type_of_set_aside?:              string;
  place_of_performance_city?:      string;
  place_of_performance_state?:     string;
  poc_name?:                       string;
  poc_email?:                      string;
  [key: string]: unknown;
}

function toForecastOpportunity(record: GsaRecord): GsaForecastOpportunity {
  const id      = String(record.id ?? crypto.randomUUID?.() ?? Math.random().toString(36).slice(2));
  const solDate = typeof record.anticipated_solicitation_date === "string"
    ? record.anticipated_solicitation_date.slice(0, 10)
    : null;
  const fy = record.contract_award_fiscal_year
    ? parseInt(String(record.contract_award_fiscal_year), 10)
    : null;
  const pop = [record.place_of_performance_city, record.place_of_performance_state]
    .filter(Boolean).join(", ") || null;

  return {
    noticeId:                    `gsa-forecast-${id}`,
    title:                       String(record.title ?? "Planned Acquisition"),
    agency:                      record.agency_name     ?? null,
    subAgency:                   record.sub_agency_name ?? null,
    naicsCode:                   record.naics           ?? null,
    description:                 record.description     ?? null,
    estimatedValue:              record.est_value_range ?? null,
    anticipatedSolicitationDate: solDate,
    anticipatedAwardDate:        fy ? `FY${fy}` : null,
    setAside:                    record.type_of_set_aside ?? null,
    placeOfPerformance:          pop,
    contactName:                 record.poc_name  ?? null,
    contactEmail:                record.poc_email ?? null,
    fiscalYear:                  isNaN(fy!) ? null : fy,
    url:                         "https://forecast.acquisition.gov/#/",
  };
}

// ── Main fetch ────────────────────────────────────────────────────────────────

export async function fetchGsaForecastOpportunities(opts: {
  naicsCodes:  string[];
  keywords?:   string[];
}): Promise<GsaForecastOpportunity[]> {
  try {
    // The GSA Forecast API serves all records as a single JSON array.
    const url = `${GSA_FORECAST_BASE}/forecast_of_contract_opportunities/data.json`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.warn(`[gsa-forecast] API returned ${res.status} — no forecast data available`);
      return [];
    }

    const body = await res.json() as GsaRecord[] | { data?: GsaRecord[] };
    const records: GsaRecord[] = Array.isArray(body)
      ? body
      : (Array.isArray((body as { data?: GsaRecord[] }).data) ? (body as { data: GsaRecord[] }).data : []);

    const naicsSet = new Set(opts.naicsCodes);
    const kwLower  = (opts.keywords ?? []).map((k) => k.toLowerCase());

    const matched = records.filter((r) => {
      const naicsMatch = r.naics && naicsSet.has(r.naics);
      const text       = `${r.title ?? ""} ${r.description ?? ""}`.toLowerCase();
      const kwMatch    = kwLower.some((kw) => text.includes(kw));
      return naicsMatch || kwMatch;
    });

    console.log(`[gsa-forecast] ${matched.length}/${records.length} records match profile`);
    return matched.map(toForecastOpportunity);
  } catch (err) {
    // Forecast data is supplemental early-intel — non-fatal if unavailable
    console.warn(`[gsa-forecast] Fetch error:`, (err as Error).message);
    return [];
  }
}
