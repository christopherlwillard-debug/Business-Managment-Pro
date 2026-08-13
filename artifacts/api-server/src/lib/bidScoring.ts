/**
 * Bid scoring helpers — kept in a separate module so they can be unit-tested
 * without importing the DB or cron machinery from bidSync.ts.
 */

/**
 * Expanded set-aside type, precisely distinguishing SDVOSB, VOSB, Small Business,
 * Veteran Preference, Full & Open, and other certification-specific programs.
 *
 * Conservative scoring rules:
 *
 *   "sdvosb"            → SDVOSB set-aside. Eligible only if isSdvosb.
 *                         VOSB alone does NOT qualify — SDVOSB is a more restrictive sub-type.
 *   "vosb"              → VOSB set-aside. Eligible if isVosb OR isSdvosb (SDVOSB ⊂ VOSB).
 *   "small_business"    → Total Small Business set-aside. Eligible if isSmallBusiness.
 *   "veteran_preference"→ Veteran preference in evaluation (not a formal set-aside).
 *                         Small bonus for veteran-owned businesses.
 *   "open"              → Full & open competition. Everyone competes; small static bonus.
 *   undefined           → No bonus. Covers: absent data, cert-specific programs (HUBZone,
 *                         8(a)/8AN, WOSB, EDWOSB, ISBEE) that require credentials not
 *                         tracked in bid_business_settings.
 *
 * @param code - Raw SAM.gov typeOfSetAside string, or null/undefined if absent.
 * @returns A canonical scoring key, or undefined when no bonus should apply.
 */
export function normalizeSetAsideType(code: string | null | undefined): string | undefined {
  if (!code) return undefined; // absent / null → no data, no bonus

  const upper = code.trim().toUpperCase();

  // Explicit full-and-open marker from SAM.gov
  if (upper === "NONE") return "open";

  // SDVOSB — strictly requires SDVOSB cert (more restrictive than VOSB)
  if (upper === "SDVOSB") return "sdvosb";

  // VOSB — requires VOSB or SDVOSB cert (SDVOSB is a qualifying subset)
  if (upper === "VOSB" || upper === "VSBAOP") return "vosb";

  // Total small-business set-aside — any small business qualifies
  if (upper === "SBA") return "small_business";

  // Veteran preference in evaluation (not a formal set-aside; all may compete)
  if (upper === "VOB" || upper === "VETS" || upper === "VP") return "veteran_preference";

  // Everything else (WOSB, EDWOSB, HZC/HZS, 8A, 8AN, ISBEE, …) requires
  // certifications not tracked in the profile — return undefined (no bonus).
  return undefined;
}

/**
 * Compute the set-aside score component for a given normalized set-aside type
 * and business certification flags.
 *
 * Scoring intent:
 *  - Maximum bonus when the business holds the required certification (directly eligible).
 *  - Reduced bonus for open/preference competitions (less differentiation).
 *  - Zero when ineligible (cert required but not held) or unknown.
 *  - NEVER assign a full eligibility bonus to a business that doesn't hold the cert.
 */
export function setAsideScore(
  normalizedType: string | undefined,
  settings: { isSdvosb: boolean; isVosb: boolean; isSmallBusiness: boolean },
): number {
  if (!normalizedType) return 0;

  switch (normalizedType) {
    case "sdvosb":
      // SDVOSB set-aside: full 20-pt bonus only if SDVOSB certified
      // VOSB alone does NOT qualify — give only 0 (ineligible, no misleading bonus)
      return settings.isSdvosb ? 20 : 0;

    case "vosb":
      // VOSB set-aside: eligible if VOSB or SDVOSB
      return (settings.isVosb || settings.isSdvosb) ? 20 : 0;

    case "small_business":
      return settings.isSmallBusiness ? 15 : 5; // SB flag needed for max; still worth noting

    case "veteran_preference":
      // Evaluation preference — any veteran-owned gets small advantage
      return (settings.isVosb || settings.isSdvosb) ? 8 : 3;

    case "open":
      return 5; // full-and-open — everyone competes; small signal for completeness

    default:
      return 0;
  }
}
