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

export async function fetchUsaSpendingAwards(opts: {
  naicsCodes: string[];
  /** Business home state abbreviation (e.g. "KY"). Defaults to "KY" if omitted. */
  state?: string;
}): Promise<UsaSpendingAward[]> {
  if (opts.naicsCodes.length === 0) return [];

  const state     = opts.state ?? "KY";
  const endDate   = new Date().toISOString().slice(0, 10);
  const startDate = monthsAgoIso(24);

  const results = await fetchAwardPage(
    opts.naicsCodes,
    startDate,
    endDate,
    `NAICS [${opts.naicsCodes.join(", ")}] / nationwide`,
    state,
  );

  const seen   = new Set<string>();
  const deduped = results.filter((r) => {
    if (seen.has(r.noticeId)) return false;
    seen.add(r.noticeId);
    return true;
  });

  console.log(`[usa-spending] Fetched ${deduped.length} awards ≤$2M (nationwide) for NAICS [${opts.naicsCodes.join(", ")}]`);
  return deduped;
}
