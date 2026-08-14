/**
 * Grant scoring engine.
 *
 * Scores each grant opportunity (0–100) against a business's profile from
 * bid_business_settings and produces:
 *   - fitScore       (0–100)
 *   - eligibilityLabel  ('likely' | 'maybe' | 'unlikely')
 *   - matchReasons   (string[] — plain-English explanation for the UI)
 *
 * Eligibility is ALWAYS presented as a screening assessment, not a guarantee.
 * The official program requirements remain the final authority.
 */

import type { BidBusinessSettings } from "@workspace/db/schema";
import type { GrantsGovOpportunity } from "./grantsFetcher.js";

export interface GrantScoringInput {
  title:           string;
  agency:          string | null;
  description:     string | null;
  eligibilities:   string[];    // raw Grants.gov eligibility codes
  grantCategories: string[];    // our derived category tags
  opportunityType: string;
  deadline:        string | null;
  // Optional home state from bid_business_settings.homeZip — we derive state from zip prefix
  homeZip:         string | null | undefined;
}

export interface GrantScoringResult {
  fitScore:         number;
  eligibilityLabel: "likely" | "maybe" | "unlikely";
  matchReasons:     string[];
}

// Eligibility codes from Grants.gov
const SMALL_BIZ_CODES  = new Set(["07"]);   // Small Businesses
const FOR_PROFIT_CODES = new Set(["99"]);   // For-Profit Organizations
const VETERAN_CODES    = new Set(["06"]);   // Veteran-Owned Business

// KY zip prefixes: 400–427
function isKentuckyZip(zip: string | null | undefined): boolean {
  if (!zip) return false;
  const prefix = parseInt(zip.substring(0, 3), 10);
  return prefix >= 400 && prefix <= 427;
}

/**
 * Score one grant against a business profile.
 */
export function scoreGrant(
  grant:   GrantScoringInput,
  profile: Pick<BidBusinessSettings, "isSdvosb" | "isVosb" | "isSmallBusiness" | "isHubzone" | "is8a" | "homeZip">,
): GrantScoringResult {
  const reasons: string[] = [];
  let score = 0;

  const text = `${grant.title} ${grant.description ?? ""} ${grant.agency ?? ""}`.toLowerCase();
  const cats = new Set(grant.grantCategories);
  const elig = new Set(grant.eligibilities);
  const isKy = isKentuckyZip(profile.homeZip);

  // ── Eligibility match (0–30 points) ──────────────────────────────────────
  const targetsSB    = elig.has("07") || cats.has("small_business");
  const targetsProfit = elig.has("99");
  const targetsVet   = elig.has("06") || cats.has("veteran");

  if (targetsSB && profile.isSmallBusiness) {
    score += 25;
    reasons.push("Targets small businesses — matches your business size");
  } else if (targetsProfit) {
    score += 10;
    reasons.push("Open to for-profit businesses");
  }

  if (targetsVet && (profile.isSdvosb || profile.isVosb)) {
    score += 20;
    const certName = profile.isSdvosb ? "SDVOSB" : "VOSB";
    reasons.push(`Veteran-owned preference — matches your ${certName} status`);
  } else if (targetsVet && !profile.isSdvosb && !profile.isVosb) {
    // Grant targets veterans but business doesn't hold the cert
    // Still surface it — eligibility may be broader than set-asides
    score += 5;
    reasons.push("Veteran-focused program — verify eligibility requirements");
  }

  // ── Industry / activity relevance (0–25 points) ──────────────────────────
  let industryPoints = 0;
  const industryReasons: string[] = [];

  if (cats.has("construction") || text.match(/construction|infrastructure|building|renovation|repair|paving|road|bridge|facility/)) {
    industryPoints += 15;
    industryReasons.push("Relevant to construction and trade work");
  }
  if (cats.has("rural") || text.match(/rural|usda|agricultural/)) {
    industryPoints += 10;
    if (isKy) {
      industryReasons.push("Rural program — applicable to KY businesses");
    } else {
      industryReasons.push("Rural development program");
    }
  }
  if (cats.has("equipment")) {
    industryPoints += 10;
    industryReasons.push("Equipment-focused funding");
  }
  if (cats.has("workforce") || cats.has("technology")) {
    industryPoints += 8;
    industryReasons.push("Workforce or technology grant applicable to small contractors");
  }
  if (cats.has("economic_dev")) {
    industryPoints += 5;
    industryReasons.push("Economic development program for businesses");
  }

  const capped = Math.min(25, industryPoints);
  score += capped;
  if (industryReasons.length > 0) reasons.push(...industryReasons.slice(0, 2));

  // ── Geographic relevance (0–15 points) ────────────────────────────────────
  const agencyText = (grant.agency ?? "").toLowerCase();
  const isNationwide = !text.match(/specific state|state of [a-z]/i) ||
    text.match(/nationwide|national|all states|any state/i);
  const mentionsKy  = text.includes("kentucky") || text.includes(" ky ") || agencyText.includes("kentucky");

  if (mentionsKy) {
    score += 15;
    reasons.push("Kentucky-specific program");
  } else if (isNationwide) {
    score += 10;
    reasons.push("Available to businesses nationwide");
  } else {
    // State-specific but not KY — lower relevance
    score += 3;
  }

  // ── Deadline urgency (0–10 points) ───────────────────────────────────────
  if (grant.deadline) {
    const daysOut = (new Date(grant.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysOut < 0) {
      // Expired — apply no urgency points; don't penalize since we may not filter old records
    } else if (daysOut <= 30) {
      score += 10;
    } else if (daysOut <= 90) {
      score += 5;
    }
  }

  const finalScore = Math.min(100, Math.max(0, score));

  const eligibilityLabel: "likely" | "maybe" | "unlikely" =
    finalScore >= 70 ? "likely"   :
    finalScore >= 40 ? "maybe"    :
                       "unlikely";

  // Ensure at least one reason if score > 0
  if (reasons.length === 0 && finalScore > 0) {
    reasons.push("May be relevant — review official requirements");
  }

  return {
    fitScore:         finalScore,
    eligibilityLabel,
    matchReasons:     reasons,
  };
}

/**
 * Score a GrantsGovOpportunity using a business profile.
 * Convenience wrapper used by grantSync.ts.
 */
export function scoreGrantOpportunity(
  opp:     GrantsGovOpportunity,
  profile: Pick<BidBusinessSettings, "isSdvosb" | "isVosb" | "isSmallBusiness" | "isHubzone" | "is8a" | "homeZip">,
): GrantScoringResult {
  return scoreGrant(
    {
      title:           opp.title,
      agency:          opp.agency,
      description:     opp.description,
      eligibilities:   opp.eligibilities,
      grantCategories: opp.grantCategories,
      opportunityType: opp.opportunityType,
      deadline:        opp.deadline,
      homeZip:         profile.homeZip,
    },
    profile,
  );
}
