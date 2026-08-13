/**
 * Bid contract-type, scope-size, and flag detector.
 *
 * Analyzes the bid title, description, and any cached AI summary to classify:
 *   - contractType: T&M | labor_hour | idiq | task_order | on_call |
 *                   shutdown_turnaround | fixed_price | unknown
 *   - scopeSize:    small | medium | large | unknown
 *   - licenseFlags: items requiring licensing verification (NOT auto-exclusions)
 *   - outOfScopeFlags: negative-keyword matches (shown as labels, NOT hidden)
 *
 * IMPORTANT: licenseFlags are NEVER used to exclude opportunities — they are
 * surfaced as "verify before bidding" notices. The app never auto-declares a
 * company legally qualified or ineligible for licensed-trade work.
 */

export interface ContractTypeResult {
  contractType:     string;    // T&M | labor_hour | idiq | task_order | on_call | shutdown_turnaround | fixed_price | unknown
  scopeSize:        string;    // small | medium | large | unknown
  licenseFlags:     string[];  // e.g. ["boiler_license_verify", "pressure_vessel_verify"]
  outOfScopeFlags:  string[];  // e.g. ["plumbing", "electrical"]
}

/** Classify a bid's contract/payment structure and flag items needing review. */
export function detectContractType(bid: {
  title:       string;
  description: string | null;
  aiSummary?:  Record<string, unknown> | null;
  naicsCode?:  string | null;
  noticeType?: string | null;
}): ContractTypeResult {
  const text = `${bid.title} ${bid.description ?? ""}`.toLowerCase();

  // ── Contract-type classification ────────────────────────────────────────────
  let contractType = "unknown";

  // If the AI summary already classified a contract type, prefer that (more accurate).
  const aiContractType = bid.aiSummary?.contractType as string | undefined;
  if (aiContractType && [
    "T&M", "labor_hour", "idiq", "task_order", "on_call", "shutdown_turnaround", "fixed_price",
  ].includes(aiContractType)) {
    contractType = aiContractType;
  } else {
    // Priority order: most-specific first
    if (/time[- ]and[- ]materials|time & materials|\bt&m\b/.test(text)) {
      contractType = "T&M";
    } else if (/\blabor[- ]?hour\b/.test(text)) {
      contractType = "labor_hour";
    } else if (/\bshutdown\b|\bturnaround\b|plant turnaround|outage maintenance|maintenance outage|planned outage|scheduled outage/.test(text)) {
      contractType = "shutdown_turnaround";
    } else if (/\bon[- ]?call\b|as[- ]?needed|call[- ]out\b|emergency (repair|maintenance|service)|on demand maintenance/.test(text)) {
      contractType = "on_call";
    } else if (/indefinite[- ]?delivery|indefinite[- ]?quantity|\bidiq\b|blanket purchase agreement|\bbpa\b|master service agreement|\bmsa\b|indefinite[- ]?delivery[- ]?indefinite/.test(text)) {
      contractType = "idiq";
    } else if (/\btask[- ]?order\b/.test(text)) {
      contractType = "task_order";
    } else if (/firm[- ]?fixed[- ]?price|\bffp\b|lump[- ]?sum/.test(text)) {
      contractType = "fixed_price";
    }
  }

  // ── Scope-size detection ────────────────────────────────────────────────────
  // Look for signals that suggest the work is clearly too large for a 2-person crew,
  // or signals that it is well-suited for a small crew.
  const largeScopePatterns = [
    /large crew/,
    /100\+\s*worker|100 or more worker/,
    /\b50 or more (worker|employee|person)/,
    /multi[- ]discipline (prime|contractor)/,
    /prime contractor only/,
    /\$\d+\s*[mb]illion/,                  // "$5 million" or "$2 billion"
    /\$[1-9]\d{6,}(?!\s*(?:per|\/|hr|hour))/,  // $1,000,000+ (not per-hour rates)
    /hundreds of worker/,
    /multiple prime/,
  ];
  const smallScopePatterns = [
    /small business set[- ]?aside/,
    /small contractor/,
    /one[- ]or[- ]two[- ]person|two[- ]person crew|1[- ]to[- ]3 person/,
    /\bas[- ]?needed\b|\bon[- ]?call\b/,
    /minor repair|minor maintenance/,
    /\$\d{1,4}(?:\.\d+)?\s*(?:per|\/)\s*(?:hr|hour)/,  // hourly rate under $10k
  ];

  const isLarge = largeScopePatterns.some(r => r.test(text));
  const isSmall = smallScopePatterns.some(r => r.test(text));

  let scopeSize = "unknown";
  if (isLarge && !isSmall) scopeSize = "large";
  else if (isSmall && !isLarge) scopeSize = "small";
  // Both or neither → unknown

  // ── License-flag detection ─────────────────────────────────────────────────
  // These tag an opportunity for VERIFICATION — never auto-exclude or auto-qualify.
  const licenseFlags: string[] = [];

  if (/boiler (contractor |repair |maintenance |inspector )?(license|permit|certification|licensed)|licensed boiler|boiler license/i.test(`${bid.title} ${bid.description ?? ""}`)) {
    licenseFlags.push("boiler_license_verify");
  }
  if (/pressure[- ]vessel/i.test(`${bid.title} ${bid.description ?? ""}`)) {
    licenseFlags.push("pressure_vessel_verify");
  }
  if (/\br[- ]?stamp\b|r-stamp/i.test(`${bid.title} ${bid.description ?? ""}`)) {
    licenseFlags.push("r_stamp_verify");
  }
  if (/\bs[- ]?stamp\b|s-stamp/i.test(`${bid.title} ${bid.description ?? ""}`)) {
    licenseFlags.push("s_stamp_verify");
  }
  if (/\basme\b/i.test(`${bid.title} ${bid.description ?? ""}`)) {
    licenseFlags.push("asme_verify");
  }
  if (/national board/i.test(`${bid.title} ${bid.description ?? ""}`)) {
    licenseFlags.push("national_board_verify");
  }
  if (/piping (contractor |repair )?(license|permit|certification)|licensed piping|piping license/i.test(`${bid.title} ${bid.description ?? ""}`)) {
    licenseFlags.push("piping_license_verify");
  }

  // ── Out-of-scope flag detection ────────────────────────────────────────────
  // These flag negative-keyword matches — shown as labels on cards, NOT hidden.
  const outOfScopeFlags: string[] = [];
  const rawText = `${bid.title} ${bid.description ?? ""}`;

  if (/\bplumbing\b|\bplumber\b|\bsewer line\b|\bwater main\b|\bdrainfield\b/i.test(rawText)) {
    outOfScopeFlags.push("plumbing");
  }
  if (/\bhvac\b|heating[,\s]+(ventilation|and|&)[,\s]+air[- ]?conditioning|air[- ]conditioning system|refrigeration (system|contractor)/i.test(rawText)) {
    outOfScopeFlags.push("hvac");
  }
  if (/\belectrical contractor\b|\blicensed electrician\b|\belectrical installation\b|\belectrical wiring\b/i.test(rawText)) {
    outOfScopeFlags.push("electrical");
  }
  if (/fire suppression system|fire sprinkler system/i.test(rawText)) {
    outOfScopeFlags.push("fire_suppression");
  }
  if (/elevator contractor|elevator installation|elevator maintenance contractor/i.test(rawText)) {
    outOfScopeFlags.push("elevator");
  }

  return { contractType, scopeSize, licenseFlags, outOfScopeFlags };
}
