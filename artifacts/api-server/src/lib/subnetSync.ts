/**
 * SBA SUBNet Subcontracting Opportunity Connector
 *
 * SUBNet is the SBA's database where government prime contractors post
 * subcontracting opportunities for small businesses. These are NOT
 * government prime contracts — they are opportunities to be a
 * subcontractor under an existing prime.
 *
 * Official source: https://eweb1.sba.gov/subnet/
 *
 * NOTE: SBA SUBNet does not publish a documented JSON API. This connector
 * fetches from their public HTML search interface, which is an official
 * U.S. government source. Graceful empty-return on any failure.
 */

export interface SubnetOpportunity {
  noticeId:          string;
  title:             string;
  agency:            string | null;   // Prime contractor name (not a gov agency)
  naicsCode:         string | null;
  description:       string | null;
  postedDate:        string | null;
  responseDeadline:  string | null;   // YYYY-MM-DD
  url:               string;
  contactName:       string | null;
  contactEmail:      string | null;
  placeOfPerformance: string | null;
}

const SUBNET_SEARCH = "https://eweb1.sba.gov/subnet/client/dsp_subnetResult.cfm";

// ── HTML date parser (SUBNet format: MM/DD/YYYY) ──────────────────────────────

function parseSubnetDate(raw: string): string | null {
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

// ── Strip HTML tags, collapse whitespace ──────────────────────────────────────

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

// ── Extract first regex match, stripped ───────────────────────────────────────

function extractField(html: string, ...patterns: RegExp[]): string | null {
  for (const rx of patterns) {
    const m = html.match(rx);
    if (m) {
      const raw = m[1] ?? m[0];
      const cleaned = stripHtml(raw).slice(0, 500).trim();
      if (cleaned) return cleaned;
    }
  }
  return null;
}

// ── Parse one block of HTML representing a single SUBNet opportunity ──────────

function parseBlock(block: string, naicsCode: string): SubnetOpportunity | null {
  // Solicitation / reference number (used as our unique ID)
  const solNum = extractField(block,
    /Solicitation\s+Number[:\s#]*([A-Z0-9][A-Z0-9\-_./]{3,40})/i,
    /Reference\s+#[:\s]*([A-Z0-9][A-Z0-9\-_./]{3,40})/i,
    /Opp(?:ortunity)?\s+ID[:\s]*([A-Z0-9][A-Z0-9\-_./]{3,40})/i,
  );
  if (!solNum) return null;

  const title = extractField(block,
    /Solicitation\s+(?:Title|Description|Name)[:\s]*([\s\S]{10,300}?)(?=<\/td|<\/p|<br|$)/i,
    /Description[:\s]*([\s\S]{10,300}?)(?=<\/td|<\/p|<br|NAICS|Contact|$)/i,
  );
  if (!title) return null;

  const prime = extractField(block,
    /Prime\s+Contractor[:\s]*([\s\S]{3,200}?)(?=<\/td|<\/p|<br|NAICS|Solicitation|$)/i,
    /Company\s+Name[:\s]*([\s\S]{3,200}?)(?=<\/td|<\/p|<br|$)/i,
  );

  const naics = extractField(block, /NAICS\s*(?:Code)?[:\s]*(\d{4,8})/i) ?? naicsCode;

  const dueDateRaw = extractField(block,
    /Response\s+(?:Due\s+)?Date[:\s]*([\d/]+)/i,
    /(?:Proposal|Submission)\s+Due[:\s]*([\d/]+)/i,
  );

  const contactName = extractField(block,
    /Contact\s+(?:Name|Person)[:\s]*([\s\S]{3,100}?)(?=<\/td|<\/p|<br|Email|Phone|$)/i,
    /POC[:\s]*([\s\S]{3,100}?)(?=<\/td|<\/p|<br|Email|$)/i,
  );

  const emailMatch = block.match(/\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/);

  const pop = extractField(block,
    /Place\s+of\s+Performance[:\s]*([\s\S]{3,200}?)(?=<\/td|<\/p|<br|Contact|$)/i,
    /Location[:\s]*([\s\S]{3,100}?)(?=<\/td|<\/p|<br|$)/i,
  );

  // Build a description from multiple fields if we have them
  const descRaw = extractField(block,
    /(?:Work\s+)?Description[:\s]*([\s\S]{10,800}?)(?=<\/td|<\/p|Solicitation|NAICS|Contact|$)/i,
  );

  return {
    noticeId:           `subnet-${solNum.replace(/[^A-Z0-9\-_]/gi, "-")}`,
    title,
    agency:             prime ?? null,
    naicsCode:          naics,
    description:        descRaw ?? null,
    postedDate:         null,
    responseDeadline:   dueDateRaw ? parseSubnetDate(dueDateRaw) : null,
    url:                `https://eweb1.sba.gov/subnet/client/dsp_Landing.cfm`,
    contactName:        contactName ?? null,
    contactEmail:       emailMatch?.[1] ?? null,
    placeOfPerformance: pop ?? null,
  };
}

// ── Parse the full HTML response from a SUBNet search ────────────────────────

function parseSubnetHtml(html: string, naicsCode: string): SubnetOpportunity[] {
  const results: SubnetOpportunity[] = [];

  // SUBNet wraps each opportunity in a block delimited by HR tags or heading rows.
  // We split on common delimiters and try to parse each chunk.
  const blocks = html.split(/<hr\s*\/?>/i);

  for (const block of blocks) {
    if (block.length < 50) continue;
    const opp = parseBlock(block, naicsCode);
    if (opp) results.push(opp);
  }

  // Fallback: if the split above found nothing, try splitting on opportunity rows
  if (results.length === 0) {
    const altBlocks = html.split(/(?=Solicitation\s+Number|Opp(?:ortunity)?\s+ID)/i);
    for (const block of altBlocks.slice(1)) {
      const opp = parseBlock(block, naicsCode);
      if (opp) results.push(opp);
    }
  }

  return results;
}

// ── Main fetch function ───────────────────────────────────────────────────────

export async function fetchSubnetOpportunities(opts: {
  naicsCodes:  string[];
  keywords?:   string[];
  stateCode?:  string;    // 2-letter state code, e.g. "KY"
}): Promise<SubnetOpportunity[]> {
  const all: SubnetOpportunity[] = [];

  // Limit to first 6 NAICS codes to keep request count reasonable
  const naicsToSearch = opts.naicsCodes.slice(0, 6);

  for (const naics of naicsToSearch) {
    try {
      const params = new URLSearchParams({ naicsCode: naics, oppAction: "Next" });
      if (opts.stateCode) params.set("stateCode", opts.stateCode);

      const res = await fetch(`${SUBNET_SEARCH}?${params}`, {
        headers: {
          "User-Agent": "BuildPro Contractor App / SBA SUBNet Integration",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(12_000),
      });

      if (!res.ok) {
        console.warn(`[subnet] HTTP ${res.status} for NAICS ${naics}`);
        continue;
      }

      const html = await res.text();
      const parsed = parseSubnetHtml(html, naics);
      console.log(`[subnet] NAICS ${naics}: ${parsed.length} subcontracting opp(s)`);
      all.push(...parsed);
    } catch (err) {
      console.warn(`[subnet] Fetch failed for NAICS ${naics}:`, (err as Error).message);
    }
  }

  // Deduplicate on noticeId
  const seen = new Set<string>();
  return all.filter((opp) => {
    if (seen.has(opp.noticeId)) return false;
    seen.add(opp.noticeId);
    return true;
  });
}
