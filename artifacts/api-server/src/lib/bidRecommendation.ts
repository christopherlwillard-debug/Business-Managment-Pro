/**
 * Bid recommendation engine — transparent BID / REVIEW / PASS decision layer.
 *
 * Design constraints:
 *  - Never assign BID or PASS from title/keywords alone (score-only) when the
 *    solicitation has not been reviewed (no aiSummary present).
 *  - REVIEW is always the safe default when scope is unknown.
 *  - All unknowns are listed explicitly so the user knows what to verify.
 *  - Set-aside distinctions are precise: SDVOSB ≠ VOSB ≠ SB set-aside ≠ veteran
 *    preference in evaluation ≠ full-and-open competition.
 *
 * Pure function — no DB access, no HTTP, no side effects.
 * @module bidRecommendation
 */

export type RecommendationLevel = "bid" | "review" | "pass";
export type FactorSignal = "positive" | "negative" | "neutral" | "unknown";

export interface RecommendationFactor {
  /** Stable machine key for grouping and ordering. */
  key:    string;
  /** Short human-readable label shown as the factor title. */
  label:  string;
  /** Whether this factor pushes toward bid, away, is neutral, or unknown. */
  signal: FactorSignal;
  /** Specific explanation shown to the user. */
  detail: string;
}

export interface BidRecommendation {
  recommendation: RecommendationLevel;
  confidence:     "high" | "medium" | "low";
  /** 1-sentence headline explaining the primary reason for this recommendation. */
  summary:        string;
  factors:        RecommendationFactor[];
  /** Explicit list of things unknown until the solicitation is reviewed. */
  unknowns:       string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ── Expanded set-aside normalization ─────────────────────────────────────────
// This mirrors bidScoring.normalizeSetAsideType but returns a richer set of
// values for display and recommendation logic. Keep in sync with that function.

export type NormalizedSetAside =
  | "sdvosb"             // SDVOSB set-aside — requires SDVOSB cert
  | "vosb"               // VOSB set-aside — requires VOSB (SDVOSB counts)
  | "small_business"     // SB total set-aside — any SB qualifies
  | "veteran_preference" // Veteran preference in evaluation (not a set-aside)
  | "open"               // Full & open competition
  | "cert_other"         // Other cert-specific (8(a), HUBZone, WOSB…)
  | "unknown";           // Not specified or unrecognised

export function classifySetAside(rawCode: string | null | undefined): NormalizedSetAside {
  if (!rawCode) return "unknown";
  const upper = rawCode.trim().toUpperCase();
  if (upper === "NONE") return "open";
  if (upper === "SDVOSB") return "sdvosb";
  if (upper === "VOSB" || upper === "VSBAOP") return "vosb";
  if (upper === "SBA") return "small_business";
  // "veteran preference" signals — not formal set-asides
  if (upper === "VOB" || upper === "VETS" || upper === "VP") return "veteran_preference";
  // Cert-specific that we cannot score (WOSB, EDWOSB, HZC, 8A, 8AN, ISBEE)
  if (["WOSB","EDWOSB","HZC","HZS","8A","8AN","ISBEE"].some((c) => upper === c)) return "cert_other";
  return "unknown";
}

// ── Set-aside factor builder ──────────────────────────────────────────────────

function buildSetAsideFactor(
  rawCode: string | null | undefined,
  settings: { isSdvosb: boolean; isVosb: boolean; isSmallBusiness: boolean },
): RecommendationFactor {
  const norm = classifySetAside(rawCode);
  const key = "set_aside";

  switch (norm) {
    case "sdvosb":
      if (settings.isSdvosb) {
        return { key, label: "Set-Aside Eligibility", signal: "neutral",
          detail: "SDVOSB set-aside — the business profile is marked SDVOSB, but this setting is not proof of active SBA certification. Verify the current SBA certification and SAM.gov representations before treating the business as eligible." };
      }
      if (settings.isVosb) {
        return { key, label: "Set-Aside Eligibility", signal: "negative",
          detail: "SDVOSB set-aside — your VOSB certification alone is not sufficient. SDVOSB certification (more restrictive) is required. Verify before pursuing." };
      }
      return { key, label: "Set-Aside Eligibility", signal: "negative",
        detail: "SDVOSB set-aside — restricted to Service-Disabled Veteran-Owned Small Businesses. You would need SDVOSB certification to compete." };

    case "vosb":
      if (settings.isVosb || settings.isSdvosb) {
        return { key, label: "Set-Aside Eligibility", signal: "neutral",
          detail: `VOSB set-aside — the business profile is marked ${settings.isSdvosb ? "SDVOSB" : "VOSB"}, but the profile flag is not proof of current certification. Verify the applicable SBA/VOSB status and SAM.gov representations before treating the business as eligible.` };
      }
      return { key, label: "Set-Aside Eligibility", signal: "negative",
        detail: "VOSB set-aside — restricted to Veteran-Owned Small Businesses. Veteran-owned certification is required." };

    case "small_business":
      if (settings.isSmallBusiness) {
        return { key, label: "Set-Aside Eligibility", signal: "neutral",
          detail: "Small Business set-aside — the business profile is marked small business. Verify the applicable SBA size standard for this NAICS code and the solicitation's eligibility requirements before treating the business as qualified." };
      }
      return { key, label: "Set-Aside Eligibility", signal: "neutral",
        detail: "Small Business set-aside — verify your small business status under the applicable NAICS code before bidding." };

    case "veteran_preference":
      if (settings.isVosb || settings.isSdvosb) {
        return { key, label: "Veteran Evaluation Preference", signal: "neutral",
          detail: "Veteran preference in evaluation — this is not a set-aside. The business profile is marked veteran-owned; verify the solicitation's exact preference rules and any required documentation before relying on an evaluation benefit." };
      }
      return { key, label: "Veteran Evaluation Preference", signal: "neutral",
        detail: "Veteran preference applies in proposal evaluation — full competition, but veteran-owned businesses receive evaluation bonus points." };

    case "open":
      return { key, label: "Competition Level", signal: "neutral",
        detail: "Full & open competition — all businesses, regardless of size or certification, may compete." };

    case "cert_other": {
      const readable = rawCode?.toUpperCase() ?? "unknown";
      return { key, label: "Set-Aside Eligibility", signal: "negative",
        detail: `Set-aside type '${readable}' requires a specific certification (e.g. HUBZone, 8(a), WOSB) that is not in your profile. Verify eligibility before pursuing.` };
    }

    case "unknown":
      return { key, label: "Set-Aside / Competition", signal: "unknown",
        detail: "Set-aside type not specified — competition level is unknown. Review the solicitation to confirm whether any eligibility restrictions apply." };
  }
}

// ── Capability factor builder ─────────────────────────────────────────────────

const CAP_KEY_LABELS: Record<string, string> = {
  waste_hauling:        "Debris & Waste Hauling",
  mh_finishing:         "MH Finish Work",
  flooring:             "Flooring",
  site_work:            "Site Preparation",
  general_contracting:  "General Contracting",
  asphalt_sealing:      "Asphalt Sealing",
};

function capKeyToLabel(key: string): string {
  return CAP_KEY_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeRecommendation(
  opp: {
    title:             string;
    opportunityScore:  number;
    capabilityMatches: string[];
    setAsideType:      string | null;        // raw SAM.gov code stored in DB
    responseDeadline:  string | null;
    source:            string;
    naicsCode:         string | null;
    description:       string | null;
    opportunityType:   string | null;
  },
  settings: {
    isSdvosb:        boolean;
    isVosb:          boolean;
    isSmallBusiness: boolean;
  },
  aiSummary: Record<string, unknown> | null,
): BidRecommendation {
  const factors:  RecommendationFactor[] = [];
  const unknowns: string[]               = [];
  const scopeReviewed = aiSummary !== null;

  // ── Factor 1: Capability keyword match ────────────────────────────────────
  const matchedNames = opp.capabilityMatches.map(capKeyToLabel);
  if (opp.capabilityMatches.length > 0) {
    factors.push({
      key: "capability", label: "Capability Match", signal: "positive",
      detail: `Keyword overlap found with ${opp.capabilityMatches.length === 1
        ? matchedNames[0]
        : `${opp.capabilityMatches.length} profiles (${matchedNames.join(", ")})`
      }.`,
    });
  } else if (opp.description) {
    // Description present but no match → clear miss
    factors.push({
      key: "capability", label: "Capability Match", signal: "negative",
      detail: "No keyword overlap found between this opportunity's title/description and your active capability profiles.",
    });
  } else {
    // No description to check — outcome unknown
    factors.push({
      key: "capability", label: "Capability Match", signal: "unknown",
      detail: "No solicitation description is available in this listing to check capability alignment.",
    });
    unknowns.push("Specific work scope and required capability match");
  }

  // ── Factor 2: Set-aside eligibility ───────────────────────────────────────
  const setAsideNorm = classifySetAside(opp.setAsideType);
  factors.push(buildSetAsideFactor(opp.setAsideType, settings));
  if (setAsideNorm === "unknown") {
    unknowns.push("Set-aside type and competition restrictions");
  } else if (["sdvosb", "vosb", "small_business", "cert_other"].includes(setAsideNorm)) {
    // The profile currently stores owner-maintained booleans, not verified
    // certification evidence or effective dates. Never let these flags alone
    // authorize a BID or definitive PASS for a restricted competition.
    unknowns.push("Verify current certification/size status, SAM.gov representations, and solicitation-specific eligibility before bidding");
  }

  // ── Factor 3: Solicitation scope review (AI summary) ─────────────────────
  if (scopeReviewed) {
    const isFit     = aiSummary["isFit"] === true;
    const fitReason = typeof aiSummary["fitReason"] === "string" ? aiSummary["fitReason"] : null;
    factors.push({
      key: "scope", label: "Solicitation Review", signal: isFit ? "positive" : "negative",
      detail: isFit
        ? `AI review confirmed fit${fitReason ? `: ${fitReason}` : "."}`
        : `AI review found this is not a fit${fitReason ? `: ${fitReason}` : "."}`,
    });

    // ── Factor 4: License risk ───────────────────────────────────────────────
    const licenseRisk = typeof aiSummary["licenseRisk"] === "string" ? aiSummary["licenseRisk"] : null;
    if (licenseRisk) {
      factors.push({
        key: "license", label: "Licensing / Certification Risk", signal: "negative",
        detail: `Verify before bidding: ${licenseRisk}`,
      });
    } else {
      factors.push({
        key: "license", label: "Licensing / Certification", signal: "positive",
        detail: "No specific licensing barriers identified in the solicitation review.",
      });
    }

    // ── Factor 5: Bonding requirement ────────────────────────────────────────
    const bondingRequired = aiSummary["bondingRequired"] === true;
    const bondingUnknown  = aiSummary["bondingRequired"] === undefined || aiSummary["bondingRequired"] === null;
    if (bondingRequired) {
      factors.push({
        key: "bonding", label: "Bonding Required", signal: "neutral",
        detail: "Performance or bid bonds are required. Verify your bonding capacity and coverage limit before bidding.",
      });
    } else if (!bondingUnknown) {
      factors.push({
        key: "bonding", label: "Bonding", signal: "positive",
        detail: "No bonding requirement identified in the solicitation.",
      });
    }

    // ── Factor 6: Contract value ─────────────────────────────────────────────
    const estimatedValue = typeof aiSummary["estimatedValue"] === "string" ? aiSummary["estimatedValue"] : null;
    if (estimatedValue) {
      factors.push({
        key: "value", label: "Estimated Value", signal: "neutral",
        detail: `Estimated contract value: ${estimatedValue}. Confirm this is within your bonding and financial capacity.`,
      });
    }
  } else {
    // Scope not reviewed — add scope factor + all unknowns
    factors.push({
      key: "scope", label: "Solicitation Review", signal: "unknown",
      detail: "The solicitation document has not been reviewed yet. Run 'Summarize' to get AI analysis of the actual requirements.",
    });
    unknowns.push("Actual work scope, requirements, and specifications");
    unknowns.push("Specific bonding and insurance thresholds");
    unknowns.push("Licensing and certification requirements");
    unknowns.push("Estimated contract value and performance period");
  }

  // ── Factor 7: Response deadline ───────────────────────────────────────────
  const daysOut = daysUntil(opp.responseDeadline);
  if (daysOut === null) {
    factors.push({
      key: "urgency", label: "Response Deadline", signal: "unknown",
      detail: "No response deadline specified in this listing.",
    });
    unknowns.push("Response deadline / submission window");
  } else if (daysOut < 0) {
    factors.push({
      key: "urgency", label: "Response Deadline", signal: "negative",
      detail: `Deadline has passed (${Math.abs(daysOut)} day${Math.abs(daysOut) === 1 ? "" : "s"} ago). This opportunity may no longer be actionable.`,
    });
  } else if (daysOut <= 7) {
    factors.push({
      key: "urgency", label: "Response Deadline", signal: "positive",
      detail: `Urgent: due in ${daysOut} day${daysOut === 1 ? "" : "s"}. Prioritize today if you intend to bid.`,
    });
  } else if (daysOut <= 30) {
    factors.push({
      key: "urgency", label: "Response Deadline", signal: "neutral",
      detail: `Due in ${daysOut} days — time to prepare a response, but action is needed soon.`,
    });
  } else {
    factors.push({
      key: "urgency", label: "Response Deadline", signal: "neutral",
      detail: `Due in ${daysOut} days — watch for amendments or pre-bid conferences.`,
    });
  }

  // ── Factor 8: Geographic relevance ────────────────────────────────────────
  if (opp.source === "state-local") {
    factors.push({
      key: "geography", label: "Geographic Relevance", signal: "positive",
      detail: "State or local opportunity — typically closer to your service area and subject to familiar local regulations.",
    });
  }

  // ── Factor 9: Opportunity type context ────────────────────────────────────
  if (opp.opportunityType === "sources_sought") {
    factors.push({
      key: "opp_type", label: "Not Yet Accepting Bids", signal: "neutral",
      detail: "Sources Sought (RFI) — the agency is researching market capabilities, not yet accepting bids. Responding builds awareness for when the solicitation is posted.",
    });
  } else if (opp.opportunityType === "presolicitation" || opp.opportunityType === "forecast") {
    factors.push({
      key: "opp_type", label: "Early Notice", signal: "neutral",
      detail: "Pre-solicitation / forecast — the actual solicitation has not been posted. Monitor for the active solicitation.",
    });
  }

  // ── Decision logic ─────────────────────────────────────────────────────────
  const setAsideRequiresVerification = ["sdvosb", "vosb", "small_business", "cert_other"].includes(setAsideNorm);
  const deadlineExpired     = daysOut !== null && daysOut < 0;
  const aiIsFit             = aiSummary?.["isFit"] === true;
  const aiIsNotFit          = aiSummary?.["isFit"] === false;
  const licenseRiskPresent  = typeof aiSummary?.["licenseRisk"] === "string" && !!aiSummary["licenseRisk"];
  const highScore           = opp.opportunityScore >= 50;
  const hasCapabilityMatch  = opp.capabilityMatches.length > 0;
  const isNotYetSolicitation =
    opp.opportunityType === "sources_sought" ||
    opp.opportunityType === "presolicitation" ||
    opp.opportunityType === "forecast";

  // PASS: definitively not actionable
  if (deadlineExpired && !scopeReviewed && opp.opportunityScore < 20) {
    return {
      recommendation: "pass", confidence: "medium",
      summary: "Deadline has passed and capability match is low — no action needed.",
      factors, unknowns,
    };
  }
  if (deadlineExpired && scopeReviewed && aiIsNotFit) {
    return {
      recommendation: "pass", confidence: "high",
      summary: "Deadline has passed and AI review confirmed this is not a fit.",
      factors, unknowns,
    };
  }
  if (false && setAsideRequiresVerification && scopeReviewed && aiIsNotFit) {
    return {
      recommendation: "pass", confidence: "high",
      summary: `Set-aside requires a certification you do not hold and solicitation review confirmed no fit.`,
      factors, unknowns,
    };
  }
  if (false && setAsideRequiresVerification && !hasCapabilityMatch && scopeReviewed) {
    return {
      recommendation: "pass", confidence: "medium",
      summary: "Set-aside requires a certification you do not hold and no capability match was found.",
      factors, unknowns,
    };
  }
  if (scopeReviewed && aiIsNotFit && opp.opportunityScore < 15) {
    return {
      recommendation: "pass", confidence: "high",
      summary: "AI review confirmed this is not a fit for your capabilities.",
      factors, unknowns,
    };
  }

  // BID: strong positive signals, scope reviewed (never BID without scope review)
  if (scopeReviewed && aiIsFit && hasCapabilityMatch && highScore && !setAsideRequiresVerification && !licenseRiskPresent && !isNotYetSolicitation) {
    return {
      recommendation: "bid", confidence: "high",
      summary: `Strong capability match and AI review confirmed fit — pursue this opportunity.`,
      factors, unknowns,
    };
  }
  if (scopeReviewed && aiIsFit && hasCapabilityMatch && opp.opportunityScore >= 30 && !setAsideRequiresVerification && !isNotYetSolicitation) {
    return {
      recommendation: "bid", confidence: "medium",
      summary: `AI review confirmed fit and capability match found — worth pursuing.`,
      factors, unknowns,
    };
  }
  if (scopeReviewed && aiIsFit && !setAsideRequiresVerification && !isNotYetSolicitation) {
    return {
      recommendation: "bid", confidence: "low",
      summary: `AI review confirmed fit — verify the concerns below before committing.`,
      factors, unknowns,
    };
  }

  // REVIEW: everything else — never BID or PASS from title/score alone
  const reviewReason = !scopeReviewed
    ? "Solicitation has not been reviewed — run Summarize to get AI analysis before deciding."
    : isNotYetSolicitation
      ? "This is not yet an active solicitation — monitor for the formal posting."
      : scopeReviewed && aiIsNotFit
        ? "AI review found issues — review the factors before deciding."
        : "Mixed signals — review factors below and read the solicitation before deciding.";

  return {
    recommendation: "review",
    confidence: scopeReviewed ? "medium" : "low",
    summary: reviewReason,
    factors,
    unknowns,
  };
}
