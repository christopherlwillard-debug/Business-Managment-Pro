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
 * Compute a conservative set-aside score component.
 *
 * The stored certification booleans are owner-maintained profile flags, not
 * independently verified SBA/SAM.gov records. They must never create a scoring
 * advantage that makes a restricted opportunity look more suitable than it is.
 * Eligibility is surfaced for manual verification in the recommendation layer.
 */
export function setAsideScore(
  normalizedType: string | undefined,
  _settings: { isSdvosb: boolean; isVosb: boolean; isSmallBusiness: boolean },
): number {
  switch (normalizedType) {
    case "open":
      return 5;
    case "veteran_preference":
      // Preference is not a set-aside; do not infer qualification from a profile flag.
      return 3;
    case "sdvosb":
    case "vosb":
    case "small_business":
    default:
      // Restricted categories receive no automatic bonus until eligibility is verified.
      return 0;
  }
}
