/**
 * Bid scoring helpers — kept in a separate module so they can be unit-tested
 * without importing the DB or cron machinery from bidSync.ts.
 */

/**
 * Normalize a raw SAM.gov `typeOfSetAside` code into the canonical value
 * expected by `scoreOpportunity()`.
 *
 * Conservative mapping rules:
 *  - "SDVOSB" / "VOSB" / "VSBAOP" → "sdvosb"  (vet-owned program)
 *  - "SBA"                         → "small_business"  (total SB set-aside;
 *    any business flagged isSmallBusiness qualifies)
 *  - explicit "none" / "None"      → "open"  (full-and-open, everyone competes)
 *  - absent / null / unknown       → undefined  (no set-aside data; no bonus)
 *
 * Certification-specific programs (WOSB, EDWOSB, HUBZone/HZC, 8(a)/8A/8AN,
 * ISBEE) are intentionally left unmapped. They require credentials beyond
 * isSmallBusiness that are not tracked in bid_business_settings, so assigning
 * a bonus would overstate eligibility and produce misleading rankings.
 *
 * @param code - Raw SAM.gov typeOfSetAside string, or null/undefined if absent.
 * @returns A canonical scoring key, or undefined when no bonus should apply.
 */
export function normalizeSetAsideType(code: string | null | undefined): string | undefined {
  if (!code) return undefined; // absent / null → no data, no bonus

  const upper = code.trim().toUpperCase();

  // Explicit full-and-open marker from SAM.gov
  if (upper === "NONE") return "open";

  // Veteran-owned programs
  if (upper === "SDVOSB" || upper === "VOSB" || upper === "VSBAOP") return "sdvosb";

  // Total small-business set-aside — any small business qualifies
  if (upper === "SBA") return "small_business";

  // Everything else (WOSB, EDWOSB, HZC, 8A, 8AN, ISBEE, …) requires
  // certifications not tracked in the profile — return undefined (no bonus).
  return undefined;
}
