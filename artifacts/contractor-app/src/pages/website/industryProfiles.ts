/**
 * Industry Intelligence Registry — Phase 5 M3
 *
 * Maps contractor business types to a prioritized, ordered list of website
 * sections with configuration hints. The AI Website Wizard (M1) and the
 * generate-full-site endpoint use this to produce purpose-built page structures
 * instead of a generic default.
 *
 * Adding a new industry: push a new object to INDUSTRY_PROFILES.
 * No other changes are required — the wizard, API, and tests pick it up automatically.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IndustrySectionSpec {
  /** Section type key (matches Section.type in WebsiteEditor) */
  type: string;
  /** Required sections always appear; optional ones the AI may omit */
  priority: "required" | "recommended" | "optional";
  /** Content field overrides applied on top of the per-type defaults */
  defaultContent?: Record<string, unknown>;
}

export interface IndustryProfile {
  /** Stable machine key — used as a URL param and AI prompt identifier */
  id: string;
  /** Human-readable name shown in the wizard */
  name: string;
  emoji: string;
  tagline: string;
  /**
   * One-sentence description passed into the AI prompt so copy reflects
   * industry-specific concerns (emergency response, dealer relations, etc.)
   */
  aiDescription: string;
  /**
   * Case-insensitive string fragments that map a user's "what do you do?" answer
   * to this profile. Checked via includes() so partial matches work.
   */
  aliases: string[];
  /** Ordered section list — order = rendered top-to-bottom on the finished site */
  sections: IndustrySectionSpec[];
  /** Trust signals surfaced in hero trust bars, certifications section, etc. */
  trustSignals: string[];
  /** Seed keywords for the AI Copywriter (M4) */
  serviceKeywords: string[];
}

// ── Profiles ──────────────────────────────────────────────────────────────────

export const INDUSTRY_PROFILES: IndustryProfile[] = [

  // ── Manufactured Home Contractor ──────────────────────────────────────────
  {
    id: "manufactured-home",
    name: "Manufactured Home",
    emoji: "🏠",
    tagline: "Dealer logos, coverage maps, warranty — built for the MH trade.",
    aiDescription:
      "A manufactured home contractor who installs, transports, and sets up HUD-code manufactured homes and modular homes. Key concerns: manufacturer dealer relationships, HUD certification, coverage geography, site preparation, permits, and financing. Customers are first-time buyers and families seeking affordable housing.",
    aliases: [
      "manufactured home",
      "manufactured housing",
      "mobile home",
      "modular home",
      "mh contractor",
      "mhc",
      "home installer",
      "home dealer",
    ],
    sections: [
      { type: "hero",             priority: "required",    defaultContent: { layout: "centered", trustBar: { enabled: true, items: [{ id: "t1", icon: "🏅", label: "HUD Certified" }, { id: "t2", icon: "🛡️", label: "Licensed & Insured" }, { id: "t3", icon: "⭐", label: "5-Star Rated" }] } } },
      { type: "services",         priority: "required",    defaultContent: { layout: "cards", columns: 3 } },
      { type: "featured-clients", priority: "recommended", defaultContent: { heading: "Brands We Install", subheading: "We are an authorized dealer for these trusted manufacturers." } },
      { type: "service-area",     priority: "required",    defaultContent: { displayMode: "both" } },
      { type: "process",          priority: "recommended", defaultContent: { heading: "How It Works", layout: "horizontal", connector: "arrow" } },
      { type: "before-after",     priority: "recommended", defaultContent: { heading: "Site Transformations" } },
      { type: "stats",            priority: "required" },
      { type: "certifications",   priority: "recommended", defaultContent: { heading: "Licenses & Certifications" } },
      { type: "testimonials",     priority: "required" },
      { type: "meet-owner",       priority: "recommended", defaultContent: { layout: "split" } },
      { type: "faq",              priority: "recommended" },
      { type: "cta",              priority: "required" },
      { type: "contact",          priority: "required" },
    ],
    trustSignals: ["HUD Certified Installer", "Licensed & Insured", "Manufacturer Authorized Dealer", "Site Prep Specialist", "Permit Assistance"],
    serviceKeywords: ["manufactured home installation", "mobile home setup", "HUD code home", "site preparation", "home transport", "pier & anchoring", "modular home", "home financing", "warranty"],
  },

  // ── HVAC ─────────────────────────────────────────────────────────────────
  {
    id: "hvac",
    name: "HVAC",
    emoji: "❄️",
    tagline: "Emergency service banner, maintenance plans, financing — for heating & cooling pros.",
    aiDescription:
      "An HVAC contractor providing heating, cooling, and ventilation services for residential and commercial customers. Key concerns: 24/7 emergency availability, seasonal maintenance plans, energy efficiency, financing options, and fast response time. Customers care about comfort, reliability, and not being left without heat or AC.",
    aliases: [
      "hvac",
      "heating",
      "cooling",
      "air conditioning",
      "furnace",
      "heat pump",
      "ac repair",
      "air quality",
      "ventilation",
    ],
    sections: [
      { type: "alert-bar",    priority: "required",    defaultContent: { message: "24/7 Emergency HVAC Service Available — Call Now!", link: "#contact", variant: "warning" } },
      { type: "hero",         priority: "required",    defaultContent: { layout: "split", trustBar: { enabled: true, items: [{ id: "t1", icon: "⚡", label: "Same-Day Service" }, { id: "t2", icon: "🛡️", label: "Licensed & Insured" }, { id: "t3", icon: "💰", label: "Financing Available" }] } } },
      { type: "services",     priority: "required",    defaultContent: { layout: "cards", columns: 3 } },
      { type: "stats",        priority: "required" },
      { type: "process",      priority: "recommended", defaultContent: { heading: "How We Work", layout: "horizontal", connector: "number" } },
      { type: "trust-counter",priority: "recommended", defaultContent: { heading: "Trusted by Homeowners Across the Region" } },
      { type: "service-area", priority: "required",    defaultContent: { displayMode: "map" } },
      { type: "testimonials", priority: "required" },
      { type: "faq",          priority: "recommended" },
      { type: "cta",          priority: "required",    defaultContent: { heading: "Heating or Cooling Emergency?", subheading: "We answer the phone 24/7. Technicians ready to dispatch." } },
      { type: "contact",      priority: "required" },
    ],
    trustSignals: ["24/7 Emergency Service", "NATE Certified Technicians", "Licensed & Insured", "Same-Day Appointments", "Financing Available", "100% Satisfaction Guarantee"],
    serviceKeywords: ["AC repair", "furnace repair", "heat pump installation", "HVAC maintenance", "air conditioning replacement", "heating system", "duct cleaning", "emergency HVAC", "energy-efficient systems"],
  },

  // ── Roofing ───────────────────────────────────────────────────────────────
  {
    id: "roofing",
    name: "Roofing",
    emoji: "🏚️",
    tagline: "Storm damage hero, before/after gallery, manufacturer certifications.",
    aiDescription:
      "A roofing contractor specializing in residential and commercial roof installation, repair, and replacement. Key concerns: storm damage response, insurance claim assistance, manufacturer warranties, material choices (asphalt, metal, tile), and free inspections. Customers are often anxious about leaks and damage and want fast, reliable help.",
    aliases: [
      "roofing",
      "roofer",
      "roof repair",
      "roof replacement",
      "roof installation",
      "shingle",
      "gutter",
      "storm damage",
    ],
    sections: [
      { type: "hero",           priority: "required",    defaultContent: { layout: "centered", trustBar: { enabled: true, items: [{ id: "t1", icon: "⚡", label: "Free Inspections" }, { id: "t2", icon: "📋", label: "Insurance Assistance" }, { id: "t3", icon: "🏅", label: "Manufacturer Certified" }] } } },
      { type: "services",       priority: "required",    defaultContent: { layout: "cards", columns: 3 } },
      { type: "before-after",   priority: "required",    defaultContent: { heading: "Before & After" } },
      { type: "stats",          priority: "required" },
      { type: "certifications", priority: "required",    defaultContent: { heading: "Manufacturer Certifications" } },
      { type: "gallery",        priority: "recommended", defaultContent: { heading: "Recent Projects", columns: 3, aspectRatio: "video" } },
      { type: "testimonials",   priority: "required" },
      { type: "process",        priority: "recommended", defaultContent: { heading: "Our Roofing Process", layout: "horizontal", connector: "arrow" } },
      { type: "faq",            priority: "recommended" },
      { type: "cta",            priority: "required",    defaultContent: { heading: "Storm Damage? Get a Free Roof Inspection." } },
      { type: "contact",        priority: "required" },
    ],
    trustSignals: ["Free Roof Inspections", "GAF Master Elite Certified", "Owens Corning Preferred Contractor", "Insurance Claim Assistance", "Lifetime Workmanship Warranty", "Licensed & Insured"],
    serviceKeywords: ["roof replacement", "roof repair", "storm damage", "insurance claim", "shingle installation", "metal roofing", "gutter installation", "free inspection", "leak repair"],
  },

  // ── Plumbing ──────────────────────────────────────────────────────────────
  {
    id: "plumbing",
    name: "Plumbing",
    emoji: "🔧",
    tagline: "Emergency banner, same-day service, fast-response framing.",
    aiDescription:
      "A plumbing contractor providing emergency and scheduled plumbing services for residential and commercial customers. Key concerns: 24/7 emergency availability, same-day service, drain cleaning, water heater installation, leak detection, and bathroom/kitchen remodels. Customers are often in distress and need fast, reliable help.",
    aliases: [
      "plumbing",
      "plumber",
      "drain",
      "water heater",
      "pipe",
      "leak",
      "sewer",
      "septic",
    ],
    sections: [
      { type: "alert-bar",    priority: "required",    defaultContent: { message: "Burst Pipe? Clogged Drain? Emergency Plumbing Available 24/7!", link: "#contact", variant: "error" } },
      { type: "hero",         priority: "required",    defaultContent: { layout: "split", trustBar: { enabled: true, items: [{ id: "t1", icon: "⚡", label: "Same-Day Service" }, { id: "t2", icon: "🛡️", label: "Licensed & Insured" }, { id: "t3", icon: "✓", label: "Upfront Pricing" }] } } },
      { type: "services",     priority: "required",    defaultContent: { layout: "cards", columns: 3 } },
      { type: "stats",        priority: "required" },
      { type: "process",      priority: "recommended", defaultContent: { heading: "How It Works", layout: "horizontal", connector: "number" } },
      { type: "service-area", priority: "required",    defaultContent: { displayMode: "map" } },
      { type: "testimonials", priority: "required" },
      { type: "faq",          priority: "recommended" },
      { type: "cta",          priority: "required",    defaultContent: { heading: "Plumbing Emergency? We Answer 24/7." } },
      { type: "contact",      priority: "required" },
    ],
    trustSignals: ["24/7 Emergency Service", "Licensed Master Plumber", "Same-Day Appointments", "Upfront Flat-Rate Pricing", "Licensed & Insured", "No Overtime Charges"],
    serviceKeywords: ["emergency plumbing", "drain cleaning", "water heater repair", "leak detection", "pipe repair", "sewer line", "bathroom remodel", "garbage disposal", "sump pump"],
  },

  // ── General Contractor ────────────────────────────────────────────────────
  {
    id: "general-contractor",
    name: "General Contractor",
    emoji: "🔨",
    tagline: "Portfolio-forward, why-choose-us, full project management.",
    aiDescription:
      "A general contractor handling residential and commercial construction, remodeling, and renovation projects. Key concerns: project management, quality craftsmanship, licensed and bonded status, timeline adherence, and portfolio of completed work. Customers want a reliable partner who can handle the full scope of a construction project.",
    aliases: [
      "general contractor",
      "general contracting",
      "remodeling",
      "renovation",
      "construction",
      "home improvement",
      "builder",
      "handyman",
    ],
    sections: [
      { type: "hero",           priority: "required",    defaultContent: { layout: "split", trustBar: { enabled: true, items: [{ id: "t1", icon: "📋", label: "Licensed & Bonded" }, { id: "t2", icon: "🏆", label: "Award-Winning Work" }, { id: "t3", icon: "✓", label: "On-Time Delivery" }] } } },
      { type: "services",       priority: "required",    defaultContent: { layout: "feature_grid", columns: 3 } },
      { type: "portfolio",      priority: "required",    defaultContent: { heading: "Recent Projects" } },
      { type: "stats",          priority: "required" },
      { type: "why-choose-us",  priority: "required" },
      { type: "testimonials",   priority: "required" },
      { type: "process",        priority: "recommended", defaultContent: { heading: "Our Process", layout: "horizontal", connector: "arrow" } },
      { type: "certifications", priority: "recommended" },
      { type: "meet-owner",     priority: "optional",    defaultContent: { layout: "split" } },
      { type: "faq",            priority: "recommended" },
      { type: "cta",            priority: "required" },
      { type: "contact",        priority: "required" },
    ],
    trustSignals: ["Licensed & Bonded", "Fully Insured", "On-Time & On-Budget", "Free Detailed Estimates", "Satisfaction Guarantee", "Background-Checked Crew"],
    serviceKeywords: ["kitchen remodel", "bathroom renovation", "home addition", "commercial build-out", "exterior siding", "deck construction", "basement finishing", "project management"],
  },

  // ── Landscaping ───────────────────────────────────────────────────────────
  {
    id: "landscaping",
    name: "Landscaping",
    emoji: "🌿",
    tagline: "Gallery-first, before/after transformations, service area map.",
    aiDescription:
      "A landscaping contractor providing design, installation, and maintenance services for residential and commercial properties. Key concerns: visual portfolio of transformations, seasonal service offerings, design consultation, hardscaping, and maintenance contracts. Customers are motivated by curb appeal and property value.",
    aliases: [
      "landscaping",
      "landscaper",
      "lawn care",
      "lawn service",
      "hardscape",
      "irrigation",
      "tree service",
      "snow removal",
      "grounds maintenance",
    ],
    sections: [
      { type: "hero",         priority: "required",    defaultContent: { layout: "centered", trustBar: { enabled: true, items: [{ id: "t1", icon: "🌱", label: "Free Design Consultation" }, { id: "t2", icon: "🏠", label: "Residential & Commercial" }, { id: "t3", icon: "📅", label: "Seasonal Maintenance" }] } } },
      { type: "services",     priority: "required",    defaultContent: { layout: "cards", columns: 3 } },
      { type: "gallery",      priority: "required",    defaultContent: { heading: "Our Work", columns: 3, aspectRatio: "video" } },
      { type: "before-after", priority: "required",    defaultContent: { heading: "Transformations" } },
      { type: "stats",        priority: "required" },
      { type: "service-area", priority: "recommended", defaultContent: { displayMode: "map" } },
      { type: "process",      priority: "recommended", defaultContent: { heading: "How We Work", layout: "horizontal", connector: "arrow" } },
      { type: "testimonials", priority: "required" },
      { type: "faq",          priority: "optional" },
      { type: "cta",          priority: "required",    defaultContent: { heading: "Ready to Transform Your Outdoor Space?" } },
      { type: "contact",      priority: "required" },
    ],
    trustSignals: ["Free Design Consultation", "Licensed & Insured", "Certified Landscape Professional", "Eco-Friendly Practices", "Year-Round Maintenance Plans"],
    serviceKeywords: ["landscape design", "lawn maintenance", "hardscape installation", "patio construction", "irrigation system", "tree trimming", "mulching", "seasonal cleanup", "snow removal"],
  },

  // ── Flooring ──────────────────────────────────────────────────────────────
  {
    id: "flooring",
    name: "Flooring",
    emoji: "🪵",
    tagline: "Gallery-driven, brand logos, before/after installs.",
    aiDescription:
      "A flooring contractor specializing in installation, refinishing, and repair of hardwood, tile, carpet, vinyl, and luxury vinyl plank flooring. Key concerns: material selection, visual portfolio, brand partnerships, warranty, and quick project timelines. Customers are often remodeling and want to see examples of finished work.",
    aliases: [
      "flooring",
      "floor installation",
      "hardwood",
      "tile",
      "carpet",
      "vinyl",
      "lvp",
      "laminate",
      "epoxy",
    ],
    sections: [
      { type: "hero",             priority: "required",    defaultContent: { layout: "centered", trustBar: { enabled: true, items: [{ id: "t1", icon: "🏅", label: "Certified Installer" }, { id: "t2", icon: "🛡️", label: "Licensed & Insured" }, { id: "t3", icon: "✓", label: "Free In-Home Estimate" }] } } },
      { type: "services",         priority: "required",    defaultContent: { layout: "cards", columns: 3 } },
      { type: "gallery",          priority: "required",    defaultContent: { heading: "Recent Installs", columns: 3, aspectRatio: "square" } },
      { type: "before-after",     priority: "required",    defaultContent: { heading: "Before & After" } },
      { type: "featured-clients", priority: "recommended", defaultContent: { heading: "Brands We Install", subheading: "We carry and install products from the top flooring manufacturers." } },
      { type: "stats",            priority: "required" },
      { type: "certifications",   priority: "recommended", defaultContent: { heading: "Certifications & Partnerships" } },
      { type: "testimonials",     priority: "required" },
      { type: "faq",              priority: "recommended" },
      { type: "cta",              priority: "required",    defaultContent: { heading: "Get a Free In-Home Flooring Estimate" } },
      { type: "contact",          priority: "required" },
    ],
    trustSignals: ["Free In-Home Estimates", "Licensed & Insured", "NWFA Certified Installer", "Manufacturer Authorized", "Lifetime Installation Warranty", "Low Dust Guaranteed"],
    serviceKeywords: ["hardwood floor installation", "tile installation", "carpet installation", "vinyl plank flooring", "floor refinishing", "floor repair", "laminate flooring", "epoxy floors", "free estimate"],
  },

];

// ── Fallback profile ──────────────────────────────────────────────────────────
// Used when the business type doesn't match any industry alias.

export const FALLBACK_PROFILE: IndustryProfile = {
  id: "general",
  name: "General Contractor",
  emoji: "🔨",
  tagline: "A solid all-purpose contractor website.",
  aiDescription:
    "A professional contractor business providing skilled trade services to residential and commercial customers.",
  aliases: [],
  sections: [
    { type: "hero",       priority: "required" },
    { type: "services",   priority: "required",    defaultContent: { layout: "cards", columns: 3 } },
    { type: "stats",      priority: "recommended" },
    { type: "about",      priority: "required" },
    { type: "testimonials", priority: "recommended" },
    { type: "cta",        priority: "required" },
    { type: "contact",    priority: "required" },
  ],
  trustSignals: ["Licensed & Insured", "Free Estimates", "Satisfaction Guarantee"],
  serviceKeywords: ["professional services", "quality workmanship", "residential", "commercial", "licensed contractor"],
};

// ── Lookup helpers ────────────────────────────────────────────────────────────

/**
 * Returns the best-matching IndustryProfile for a business type string.
 * Matching is case-insensitive and checks whether any alias is a substring
 * of the input (or vice versa). Falls back to FALLBACK_PROFILE when nothing matches.
 */
export function getIndustryProfile(businessType: string): IndustryProfile {
  if (!businessType?.trim()) return FALLBACK_PROFILE;
  const normalized = businessType.toLowerCase().trim();
  for (const profile of INDUSTRY_PROFILES) {
    for (const alias of profile.aliases) {
      if (normalized.includes(alias) || alias.includes(normalized)) {
        return profile;
      }
    }
  }
  return FALLBACK_PROFILE;
}

/**
 * Returns only required + recommended sections from a profile (optional ones excluded).
 * Useful for generating a compact site skeleton.
 */
export function getCoreSections(profile: IndustryProfile): IndustrySectionSpec[] {
  return profile.sections.filter(s => s.priority !== "optional");
}
