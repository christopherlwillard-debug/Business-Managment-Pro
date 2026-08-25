export type BidGeography = "local" | "regional" | "outside_area" | "unknown";

export interface BidGeographyResult {
  geography: BidGeography;
  placeOfPerformance: string | null;
  geographyReason: string;
}

const LOCAL_COUNTIES = ["daviess", "mclean", "ohio", "hancock", "henderson", "muhlenberg", "webster", "hopkins", "grayson", "breckinridge"];
const REGIONAL_KY_COUNTIES = ["livingston", "marshall", "crittenden", "caldwell", "lyon", "trigg", "christian", "warren", "simpson", "allen", "butler", "metcalfe", "monroe", "adams", "ballard", "carroll", "hickman", "mccracken", "calloway", "graves", "hart", "larue", "nelson", "bullitt", "jefferson"];
const SOUTHERN_INDIANA = ["indiana", "vanderburgh", "posey", "gibson", "warrick", "spencer", "dubois", "pike", "perry", "orange", "crawford", "washington", "scott", "clark", "floyd", "harrison"];
const US_STATES = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC|KENTUCKY|INDIANA)\b/i;
const FOREIGN = /\b(CANADA|MEXICO|UK|UNITED KINGDOM|EUROPE|GERMANY|JAPAN|KOREA|AFRICA|OVERSEAS|PUERTO RICO)\b/i;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Classifies service-area eligibility independently from capability scoring.
 * `context` is used for local scrapers whose source/agency identifies the
 * jurisdiction but whose public listing omits a formal place field.
 */
export function classifyBidGeography(place: string | null | undefined, context = ""): BidGeographyResult {
  const raw = [place, context].filter(Boolean).join(" | ").trim();
  const text = normalize(raw);
  const normalizedPlace = place?.trim() || null;
  if (!text) return { geography: "unknown", placeOfPerformance: null, geographyReason: "No reliable place of performance was provided." };
  if (FOREIGN.test(text)) return { geography: "outside_area", placeOfPerformance: normalizedPlace, geographyReason: "The place of performance is outside the United States." };
  if (/\b(owensboro|daviess county|daviess ky|daviess kentucky)\b/i.test(text)) {
    return { geography: "local", placeOfPerformance: normalizedPlace ?? "Owensboro / Daviess County, KY", geographyReason: "Within the primary Owensboro / Daviess County service area." };
  }
  if (LOCAL_COUNTIES.some((county) => new RegExp(`\\b${county}\\s+county\\b`, "i").test(text))) {
    return { geography: "local", placeOfPerformance: normalizedPlace, geographyReason: "Within the nearby Western Kentucky local service area." };
  }
  if (/\b(western kentucky|western ky|kentucky)\b/i.test(text) && !/\b(eastern kentucky|northern kentucky)\b/i.test(text)) {
    return { geography: "regional", placeOfPerformance: normalizedPlace, geographyReason: "Located in Kentucky and potentially serviceable within the Western Kentucky region." };
  }
  if (SOUTHERN_INDIANA.some((name) => new RegExp(`\\b${name}\\b`, "i").test(text)) || /\bsouthern indiana\b/i.test(text)) {
    return { geography: "regional", placeOfPerformance: normalizedPlace, geographyReason: "Located in the Southern Indiana regional service area." };
  }
  if (/\b(KY|KENTUCKY|IN|INDIANA)\b/i.test(text)) {
    return { geography: "regional", placeOfPerformance: normalizedPlace, geographyReason: "Located in Kentucky or Indiana, outside the primary local area." };
  }
  if (US_STATES.test(text)) return { geography: "outside_area", placeOfPerformance: normalizedPlace, geographyReason: "The known place of performance is outside the configured local and regional service area." };
  return { geography: "unknown", placeOfPerformance: normalizedPlace, geographyReason: "The location is present but could not be matched to a service-area region." };
}