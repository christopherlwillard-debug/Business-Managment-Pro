const USA_SPENDING_API = "https://api.usaspending.gov/api/v2/search/spending_by_award/";

const AWARD_FIELDS = [
  "generated_internal_id",
  "Recipient Name",
  "Award Amount",
  "Awarding Agency",
  "Date Signed",
  "Place of Performance State Code",
  "NAICS Code",
  "Description",
];

export interface UsaSpendingAward {
  noticeId:         string;
  title:            string;
  agency:           string | null;
  naicsCode:        string | null;
  description:      string | null;
  postedDate:       string | null;
  responseDeadline: null;
  url:              string;
}

interface RawAward {
  generated_internal_id?: string;
  "Recipient Name"?:                  string;
  "Award Amount"?:                    number | null;
  "Awarding Agency"?:                 string;
  "Date Signed"?:                     string;
  "Place of Performance State Code"?: string;
  "NAICS Code"?:                      string;
  Description?:                       string;
}

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function encodeAwardDescription(award: RawAward): string {
  return JSON.stringify({
    amount:        award["Award Amount"] ?? null,
    recipientName: award["Recipient Name"] ?? null,
    state:         award["Place of Performance State Code"] ?? null,
  });
}

async function fetchAwardPage(
  naicsCodes: string[],
  startDate:  string,
  endDate:    string,
  label:      string,
  state?:     string,
): Promise<UsaSpendingAward[]> {
  // Base filters — always applied
  const filters: Record<string, unknown> = {
    award_type_codes: ["A", "B", "C", "D"],
    time_period:      [{ start_date: startDate, end_date: endDate }],
    naics_codes:      naicsCodes,
    // Ceiling: exclude contracts a small contractor could not plausibly win
    award_amounts:    [{ lower_bound: 0, upper_bound: 2_000_000 }],
  };

  // State filter disabled: KY has too few small federal construction awards to
  // populate the panel usefully. Nationwide ≤$2M contracts are still valid
  // pricing intelligence — they show what comparable small contractors win.
  // Re-enable if the user configures a state with denser federal contracting.
  void state;

  const body = {
    filters,
    fields: AWARD_FIELDS,
    limit:  50,
    page:   1,
    sort:   "Award Amount",   // with the $2M ceiling all results are small-contractor scale
    order:  "desc",
  };

  try {
    const res = await fetch(USA_SPENDING_API, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`[usa-spending] ${res.status} for ${label}: ${text.slice(0, 300)}`);
      return [];
    }

    const data = (await res.json()) as { results?: RawAward[] };
    return (data.results ?? [])
      .filter((r) => r.generated_internal_id)
      .map((r) => ({
        noticeId:         r.generated_internal_id!,
        title:            r["Recipient Name"] ?? "Unknown Awardee",
        agency:           r["Awarding Agency"] ?? null,
        naicsCode:        r["NAICS Code"] ?? null,
        description:      encodeAwardDescription(r),
        postedDate:       r["Date Signed"]?.slice(0, 10) ?? null,
        responseDeadline: null,
        url:              `https://www.usaspending.gov/award/${encodeURIComponent(r.generated_internal_id!)}`,
      }));
  } catch (err) {
    console.error(`[usa-spending] Fetch error for ${label}:`, err);
    return [];
  }
}

/** Split an array into chunks of at most `size` elements. */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function fetchUsaSpendingAwards(opts: {
  naicsCodes: string[];
  /** Business home state abbreviation (e.g. "KY"). Defaults to "KY" if omitted. */
  state?: string;
}): Promise<UsaSpendingAward[]> {
  if (opts.naicsCodes.length === 0) return [];

  const state     = opts.state ?? "KY";
  const endDate   = new Date().toISOString().slice(0, 10);
  const startDate = monthsAgoIso(24);

  // Split NAICS codes into batches of 5 to avoid oversized request bodies.
  // Batches run sequentially to stay within rate limits. A single failure in
  // one batch is logged and skipped — successful batches still contribute.
  const BATCH_SIZE = 5;
  const MAX_RESULTS = 50;
  const batches = chunkArray(opts.naicsCodes, BATCH_SIZE);

  const seen    = new Set<string>();
  const deduped: UsaSpendingAward[] = [];

  for (const batch of batches) {
    if (deduped.length >= MAX_RESULTS) break;

    const batchResults = await fetchAwardPage(
      batch,
      startDate,
      endDate,
      `NAICS [${batch.join(", ")}] / nationwide`,
      state,
    );

    for (const r of batchResults) {
      if (seen.has(r.noticeId)) continue;
      seen.add(r.noticeId);
      deduped.push(r);
      if (deduped.length >= MAX_RESULTS) break;
    }
  }

  console.log(
    `[usa-spending] Fetched ${deduped.length} awards ≤$2M (nationwide) across ${batches.length} batch(es) for ${opts.naicsCodes.length} NAICS code(s)`,
  );
  return deduped;
}
