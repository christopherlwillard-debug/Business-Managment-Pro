/**
 * Plain-English definitions for common government contracting terms.
 *
 * Used by:
 *   1. BidEducationPanel — renders detected terms from AI education analysis
 *   2. GlossaryTooltip — highlights and explains terms inline (hover/tap)
 *
 * Keys are lowercase for easy matching. Aliases are handled by the lookup function.
 */

export interface GlossaryTerm {
  term:       string;   // display name (properly cased)
  plain:      string;   // plain-English definition (1-3 sentences)
  aliases?:   string[]; // other forms that map to this entry (lowercase)
}

export const PROCUREMENT_GLOSSARY: GlossaryTerm[] = [
  {
    term: "SAM.gov",
    plain:
      "The federal government's official marketplace for contracts. You must have an active registration on SAM.gov to bid on most federal contracts. Registration is free and usually takes a few days.",
    aliases: ["sam registration", "sam.gov registration"],
  },
  {
    term: "UEI",
    plain:
      "Unique Entity Identifier — your company's account number in the government contracting system. It's assigned when you register on SAM.gov and replaces the older DUNS number.",
    aliases: ["unique entity identifier", "uei number"],
  },
  {
    term: "CAGE Code",
    plain:
      "A 5-character ID assigned to your business by the government. Required to bid on federal contracts and is linked to your SAM.gov registration.",
    aliases: ["cage", "cage code"],
  },
  {
    term: "Solicitation",
    plain:
      "The government's formal announcement that it needs something and is accepting bids or proposals. Think of it like a job posting — this is your invitation to compete.",
    aliases: ["solicitations"],
  },
  {
    term: "Sources Sought",
    plain:
      "Market research — the government is NOT accepting bids yet. They're asking 'who can do this?' to understand the market before writing the contract. Responding gets you on their radar and can influence how the contract is structured.",
    aliases: ["sources sought notice", "rfi", "request for information"],
  },
  {
    term: "Pre-Solicitation",
    plain:
      "An early heads-up that a contract is coming. The government isn't accepting bids yet, but you know it's coming and can start preparing. Watch for the actual solicitation to follow.",
    aliases: ["presolicitation", "pre solicitation"],
  },
  {
    term: "IFB",
    plain:
      "Invitation for Bid — the simplest kind of competition. You submit a price and the lowest qualified bid wins. Used when the government knows exactly what it wants.",
    aliases: ["invitation for bid", "invitation to bid"],
  },
  {
    term: "RFP",
    plain:
      "Request for Proposal — you submit your approach, qualifications, AND price. The government picks the best overall value, not just the lowest price. More complex than an IFB but gives you more ways to stand out.",
    aliases: ["request for proposal"],
  },
  {
    term: "RFQ",
    plain:
      "Request for Quotation — used for simpler or smaller purchases. You provide a price quote; the government picks from those quotes. Often used under $250,000.",
    aliases: ["request for quotation"],
  },
  {
    term: "Set-Aside",
    plain:
      "A contract reserved for businesses that meet certain criteria — like small businesses, veteran-owned companies, or women-owned businesses. If a contract is set aside for your category, you're only competing against similar businesses, not large corporations.",
    aliases: ["set aside", "setaside", "set-aside contract"],
  },
  {
    term: "SDVOSB",
    plain:
      "Service-Disabled Veteran-Owned Small Business. A verified status that gives you access to set-aside contracts reserved for service-disabled veterans. Must be verified through SBA's VetCert program.",
    aliases: ["service disabled veteran", "service-disabled veteran-owned"],
  },
  {
    term: "VOSB",
    plain:
      "Veteran-Owned Small Business. Similar to SDVOSB but for veterans without a service-connected disability. Also requires SBA VetCert verification.",
    aliases: ["veteran-owned small business", "veteran owned"],
  },
  {
    term: "Sole Source",
    plain:
      "When the government buys from a single company without competition. This is rare and must be justified (e.g., only one vendor can do the work, or it's an emergency). You can't apply — the government comes to you.",
    aliases: ["sole source award", "sole source contract"],
  },
  {
    term: "NAICS Code",
    plain:
      "North American Industry Classification System — a code that categorizes what kind of business you are. Every contract is tagged with a NAICS code, and your business needs to match it to compete. Think of it like a category tag.",
    aliases: ["naics", "naics codes", "industry code"],
  },
  {
    term: "PSC Code",
    plain:
      "Product and Service Code — more specific than NAICS. It describes exactly what's being purchased (e.g., 'Z2AA: Maintenance of Office Buildings'). Shows up in federal contracts to categorize the work precisely.",
    aliases: ["psc", "product and service code", "product service code"],
  },
  {
    term: "Incumbent",
    plain:
      "The company that is currently doing the work under an existing contract. When a contract comes up for renewal, the incumbent often has an advantage because they know the work — but you can still win if you offer better value.",
    aliases: ["incumbent contractor", "current contractor"],
  },
  {
    term: "Period of Performance",
    plain:
      "How long the contract runs — for example, '12 months' or 'June 1, 2026 to May 31, 2027'. Make sure you can staff and fund the work for the entire period.",
    aliases: ["pop", "performance period", "contract period"],
  },
  {
    term: "Option Year",
    plain:
      "An extension the government can choose to add after the base contract period ends. For example, a '1 base year + 2 option years' contract could run up to 3 years if the government exercises all options. They're not required to extend.",
    aliases: ["option years", "option period", "base year"],
  },
  {
    term: "Past Performance",
    plain:
      "Your track record on previous contracts. The government often scores your past performance when evaluating proposals. If you're new to government contracts, highlight relevant commercial work instead.",
    aliases: ["past performance evaluation", "cpars"],
  },
  {
    term: "Bid Bond",
    plain:
      "A deposit (usually 5–10% of the bid amount) that proves you're serious about your bid. If you win but then back out, the bond is forfeited. Returned if you don't win. Required on most construction contracts over $150,000.",
    aliases: ["bid bonds", "bid guarantee"],
  },
  {
    term: "Performance Bond",
    plain:
      "Insurance that guarantees you'll complete the work as agreed. If you fail to finish, the bonding company steps in to cover costs. Required on most federal construction contracts over $150,000.",
    aliases: ["performance bonds"],
  },
  {
    term: "Payment Bond",
    plain:
      "Insurance that guarantees you'll pay your subcontractors and suppliers. Protects them if you don't pay. Required alongside performance bonds on most federal construction contracts over $150,000.",
    aliases: ["payment bonds"],
  },
  {
    term: "Prevailing Wage",
    plain:
      "Government-set minimum pay rates for workers on federal contracts, based on the type of work and location. Covered by the Davis-Bacon Act for construction. You must pay workers at least the prevailing wage rate — verify with the wage determination in the solicitation.",
    aliases: ["davis-bacon", "davis bacon", "prevailing wages", "wage determination", "wage rate"],
  },
  {
    term: "Contracting Officer",
    plain:
      "The government employee who manages the contract — your main official point of contact. They answer questions, issue amendments, and make decisions about the contract. Often abbreviated as CO.",
    aliases: ["co", "contracting officer representative", "cor", "cotr"],
  },
  {
    term: "Best Value",
    plain:
      "How the government picks a winner when price alone isn't the deciding factor. They score you on price, technical approach, past performance, and other criteria. A higher-priced bid can win if the value is clearly better.",
    aliases: ["best value tradeoff", "best value selection", "tradeoff evaluation"],
  },
  {
    term: "FAR",
    plain:
      "Federal Acquisition Regulation — the rulebook that governs all federal government purchasing. As a contractor, you agree to follow FAR clauses when you win a contract. You don't need to memorize it, but a contracting attorney can help you understand key clauses.",
    aliases: ["federal acquisition regulation", "far clause", "far clauses"],
  },
  {
    term: "Small Business",
    plain:
      "A federal size standard based on your industry's NAICS code — either number of employees or annual revenue. If you qualify, you're eligible for small business set-asides. Check your size at sba.gov/size.",
    aliases: ["small business concern", "small business set-aside"],
  },
];

/** Fast lowercase-keyed lookup map built from the glossary */
const GLOSSARY_MAP = new Map<string, GlossaryTerm>();
for (const entry of PROCUREMENT_GLOSSARY) {
  GLOSSARY_MAP.set(entry.term.toLowerCase(), entry);
  for (const alias of entry.aliases ?? []) {
    GLOSSARY_MAP.set(alias.toLowerCase(), entry);
  }
}

/** Look up a term by name or alias (case-insensitive) */
export function lookupTerm(term: string): GlossaryTerm | undefined {
  return GLOSSARY_MAP.get(term.toLowerCase());
}

/**
 * Find all glossary terms that appear in the given text.
 * Returns unique matches (de-duped by canonical term).
 */
export function findTermsInText(text: string): GlossaryTerm[] {
  const lowerText = text.toLowerCase();
  const seen = new Set<string>();
  const found: GlossaryTerm[] = [];

  for (const [key, entry] of GLOSSARY_MAP) {
    if (lowerText.includes(key) && !seen.has(entry.term)) {
      seen.add(entry.term);
      found.push(entry);
    }
  }

  return found;
}
