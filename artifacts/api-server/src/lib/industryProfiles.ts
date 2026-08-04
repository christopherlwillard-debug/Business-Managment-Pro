/**
 * Server-side Industry Intelligence — Phase 5 M3
 *
 * Mirrors the frontend industryProfiles.ts registry and adds
 * `buildIndustrySections()` which produces fully-formed section objects
 * (with IDs and placeholder content) for the generate-full-site endpoint.
 * M1 (AI Website Wizard) will call this to get the page skeleton, then
 * use OpenAI to replace placeholder copy with industry-tailored content.
 */

import { randomBytes } from "crypto";

function uid(): string {
  return randomBytes(4).toString("hex");
}

// ── Types (mirrored from frontend — keep in sync) ─────────────────────────────

export interface IndustrySectionSpec {
  type: string;
  priority: "required" | "recommended" | "optional";
  defaultContent?: Record<string, unknown>;
}

export interface IndustryProfile {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  aiDescription: string;
  aliases: string[];
  sections: IndustrySectionSpec[];
  trustSignals: string[];
  serviceKeywords: string[];
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const INDUSTRY_PROFILES: IndustryProfile[] = [

  {
    id: "manufactured-home",
    name: "Manufactured Home",
    emoji: "🏠",
    tagline: "Dealer logos, coverage maps, warranty — built for the MH trade.",
    aiDescription:
      "A manufactured home contractor who installs, transports, and sets up HUD-code manufactured homes and modular homes. Key concerns: manufacturer dealer relationships, HUD certification, coverage geography, site preparation, permits, and financing. Customers are first-time buyers and families seeking affordable housing.",
    aliases: ["manufactured home", "manufactured housing", "mobile home", "modular home", "mh contractor", "mhc", "home installer", "home dealer"],
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

  {
    id: "hvac",
    name: "HVAC",
    emoji: "❄️",
    tagline: "Emergency service banner, maintenance plans, financing — for heating & cooling pros.",
    aiDescription:
      "An HVAC contractor providing heating, cooling, and ventilation services for residential and commercial customers. Key concerns: 24/7 emergency availability, seasonal maintenance plans, energy efficiency, financing options, and fast response time.",
    aliases: ["hvac", "heating", "cooling", "air conditioning", "furnace", "heat pump", "ac repair", "air quality", "ventilation"],
    sections: [
      { type: "alert-bar",     priority: "required",    defaultContent: { message: "24/7 Emergency HVAC Service Available — Call Now!", link: "#contact", variant: "warning" } },
      { type: "hero",          priority: "required",    defaultContent: { layout: "split", trustBar: { enabled: true, items: [{ id: "t1", icon: "⚡", label: "Same-Day Service" }, { id: "t2", icon: "🛡️", label: "Licensed & Insured" }, { id: "t3", icon: "💰", label: "Financing Available" }] } } },
      { type: "services",      priority: "required",    defaultContent: { layout: "cards", columns: 3 } },
      { type: "stats",         priority: "required" },
      { type: "process",       priority: "recommended", defaultContent: { heading: "How We Work", layout: "horizontal", connector: "number" } },
      { type: "trust-counter", priority: "recommended", defaultContent: { heading: "Trusted by Homeowners Across the Region" } },
      { type: "service-area",  priority: "required",    defaultContent: { displayMode: "map" } },
      { type: "testimonials",  priority: "required" },
      { type: "faq",           priority: "recommended" },
      { type: "cta",           priority: "required",    defaultContent: { heading: "Heating or Cooling Emergency?", subheading: "We answer the phone 24/7. Technicians ready to dispatch." } },
      { type: "contact",       priority: "required" },
    ],
    trustSignals: ["24/7 Emergency Service", "NATE Certified Technicians", "Licensed & Insured", "Same-Day Appointments", "Financing Available", "100% Satisfaction Guarantee"],
    serviceKeywords: ["AC repair", "furnace repair", "heat pump installation", "HVAC maintenance", "air conditioning replacement", "heating system", "duct cleaning", "emergency HVAC", "energy-efficient systems"],
  },

  {
    id: "roofing",
    name: "Roofing",
    emoji: "🏚️",
    tagline: "Storm damage hero, before/after gallery, manufacturer certifications.",
    aiDescription:
      "A roofing contractor specializing in residential and commercial roof installation, repair, and replacement. Key concerns: storm damage response, insurance claim assistance, manufacturer warranties, material choices, and free inspections.",
    aliases: ["roofing", "roofer", "roof repair", "roof replacement", "roof installation", "shingle", "gutter", "storm damage"],
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

  {
    id: "plumbing",
    name: "Plumbing",
    emoji: "🔧",
    tagline: "Emergency banner, same-day service, fast-response framing.",
    aiDescription:
      "A plumbing contractor providing emergency and scheduled plumbing services for residential and commercial customers. Key concerns: 24/7 emergency availability, same-day service, drain cleaning, water heater installation, leak detection.",
    aliases: ["plumbing", "plumber", "drain", "water heater", "pipe", "leak", "sewer", "septic"],
    sections: [
      { type: "alert-bar",   priority: "required",    defaultContent: { message: "Burst Pipe? Clogged Drain? Emergency Plumbing Available 24/7!", link: "#contact", variant: "error" } },
      { type: "hero",        priority: "required",    defaultContent: { layout: "split", trustBar: { enabled: true, items: [{ id: "t1", icon: "⚡", label: "Same-Day Service" }, { id: "t2", icon: "🛡️", label: "Licensed & Insured" }, { id: "t3", icon: "✓", label: "Upfront Pricing" }] } } },
      { type: "services",    priority: "required",    defaultContent: { layout: "cards", columns: 3 } },
      { type: "stats",       priority: "required" },
      { type: "process",     priority: "recommended", defaultContent: { heading: "How It Works", layout: "horizontal", connector: "number" } },
      { type: "service-area",priority: "required",    defaultContent: { displayMode: "map" } },
      { type: "testimonials",priority: "required" },
      { type: "faq",         priority: "recommended" },
      { type: "cta",         priority: "required",    defaultContent: { heading: "Plumbing Emergency? We Answer 24/7." } },
      { type: "contact",     priority: "required" },
    ],
    trustSignals: ["24/7 Emergency Service", "Licensed Master Plumber", "Same-Day Appointments", "Upfront Flat-Rate Pricing", "Licensed & Insured", "No Overtime Charges"],
    serviceKeywords: ["emergency plumbing", "drain cleaning", "water heater repair", "leak detection", "pipe repair", "sewer line", "bathroom remodel", "garbage disposal", "sump pump"],
  },

  {
    id: "general-contractor",
    name: "General Contractor",
    emoji: "🔨",
    tagline: "Portfolio-forward, why-choose-us, full project management.",
    aiDescription:
      "A general contractor handling residential and commercial construction, remodeling, and renovation projects. Key concerns: project management, quality craftsmanship, licensed and bonded status, timeline adherence, and portfolio of completed work.",
    aliases: ["general contractor", "general contracting", "remodeling", "renovation", "construction", "home improvement", "builder", "handyman"],
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

  {
    id: "landscaping",
    name: "Landscaping",
    emoji: "🌿",
    tagline: "Gallery-first, before/after transformations, service area map.",
    aiDescription:
      "A landscaping contractor providing design, installation, and maintenance services for residential and commercial properties. Key concerns: visual portfolio of transformations, seasonal service offerings, design consultation, hardscaping, and maintenance contracts.",
    aliases: ["landscaping", "landscaper", "lawn care", "lawn service", "hardscape", "irrigation", "tree service", "snow removal", "grounds maintenance"],
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

  {
    id: "flooring",
    name: "Flooring",
    emoji: "🪵",
    tagline: "Gallery-driven, brand logos, before/after installs.",
    aiDescription:
      "A flooring contractor specializing in installation, refinishing, and repair of hardwood, tile, carpet, vinyl, and luxury vinyl plank flooring. Key concerns: material selection, visual portfolio, brand partnerships, warranty, and quick project timelines.",
    aliases: ["flooring", "floor installation", "hardwood", "tile", "carpet", "vinyl", "lvp", "laminate", "epoxy"],
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

export const FALLBACK_PROFILE: IndustryProfile = {
  id: "general",
  name: "General Contractor",
  emoji: "🔨",
  tagline: "A solid all-purpose contractor website.",
  aiDescription: "A professional contractor business providing skilled trade services to residential and commercial customers.",
  aliases: [],
  sections: [
    { type: "hero",         priority: "required" },
    { type: "services",     priority: "required",    defaultContent: { layout: "cards", columns: 3 } },
    { type: "stats",        priority: "recommended" },
    { type: "about",        priority: "required" },
    { type: "testimonials", priority: "recommended" },
    { type: "cta",          priority: "required" },
    { type: "contact",      priority: "required" },
  ],
  trustSignals: ["Licensed & Insured", "Free Estimates", "Satisfaction Guarantee"],
  serviceKeywords: ["professional services", "quality workmanship", "residential", "commercial", "licensed contractor"],
};

// ── Lookup ─────────────────────────────────────────────────────────────────────

/**
 * Fuzzy match a business-type string to an IndustryProfile.
 * Case-insensitive substring match against all aliases.
 * Returns FALLBACK_PROFILE when nothing matches.
 */
export function matchIndustryProfile(businessType: string): IndustryProfile {
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

// ── Default content per section type ─────────────────────────────────────────
// Placeholder copy that reads as professional but is clearly AI-ready to replace.

type BizInfo = { name?: string; phone?: string; email?: string };

function defaultSectionContent(type: string, biz: BizInfo): Record<string, unknown> {
  const name = biz.name ?? "Our Company";
  switch (type) {
    case "hero":
      return {
        headline: `${name} — Professional Services`,
        subheadline: "Quality work, honest pricing, and results you can count on.",
        ctaLabel: "Get a Free Quote",
        ctaUrl: "#contact",
        layout: "centered",
        bgColor: "#1a1a2e",
      };
    case "services":
      return {
        heading: "Our Services",
        subheading: "Delivering quality craftsmanship on every project.",
        layout: "cards",
        columns: 3,
        items: [
          { id: uid(), title: "Service 1", description: "Professional service delivered with care and expertise." },
          { id: uid(), title: "Service 2", description: "High-quality work that stands the test of time." },
          { id: uid(), title: "Service 3", description: "Fast, reliable service from licensed professionals." },
        ],
      };
    case "stats":
      return {
        heading: "Trusted by Homeowners & Businesses",
        stats: [
          { id: uid(), value: "500+", label: "Projects Completed" },
          { id: uid(), value: "10+",  label: "Years in Business" },
          { id: uid(), value: "100%", label: "Licensed & Insured" },
          { id: uid(), value: "5★",   label: "Average Rating" },
        ],
      };
    case "testimonials":
      return {
        heading: "What Our Customers Say",
        subheading: "We measure success by how often our customers come back.",
        testimonials: [
          { id: uid(), name: "Sarah M.", location: "Homeowner", rating: 5, quote: "Outstanding work from start to finish. Professional, on time, and the quality speaks for itself." },
          { id: uid(), name: "James K.", location: "Business Owner", rating: 5, quote: "Completed ahead of schedule and within budget. Highly recommend to anyone." },
          { id: uid(), name: "Linda R.", location: "Property Manager", rating: 5, quote: "Great attention to detail and very fair pricing. Five stars all the way." },
        ],
      };
    case "contact":
      return {
        heading: "Request a Free Quote",
        subheading: "Fill out the form and we'll follow up within one business day.",
        serviceTypes: ["Service Request", "Free Estimate", "General Inquiry", "Other"],
      };
    case "cta":
      return {
        heading: "Ready to Get Started?",
        subheading: "Contact us today for a free, no-obligation estimate.",
        primaryLabel: "Request a Free Estimate",
        primaryConfig: { url: "#contact", style: "solid", rounding: "full" },
        secondaryLabel: "Call Us Today",
        secondaryConfig: { url: biz.phone ? `tel:${biz.phone}` : "tel:", style: "outline", rounding: "full" },
      };
    case "about":
      return {
        heading: `About ${name}`,
        body: "We are a locally owned business dedicated to delivering high-quality workmanship on every project. With years of industry experience, we bring expertise, integrity, and attention to detail to everything we build.",
        photoUrl: "",
      };
    case "portfolio":
      return { heading: "Our Work", subheading: "A sample of what we've built.", projects: [] };
    case "gallery":
      return { heading: "Recent Projects", columns: 3, aspectRatio: "auto", images: [] };
    case "footer":
      return { phone: biz.phone ?? "", email: biz.email ?? "", licenseNumber: "", copyright: `© ${new Date().getFullYear()} ${name}. All rights reserved.` };
    case "alert-bar":
      return { message: "Call us today for a free estimate!", link: "#contact" };
    case "process":
      return {
        heading: "How We Work",
        subheading: "Simple, transparent, and stress-free every time.",
        layout: "horizontal",
        connector: "arrow",
        steps: [
          { id: uid(), icon: "📋", title: "Free Estimate",  description: "We assess the project and give you a clear written quote with no hidden fees." },
          { id: uid(), icon: "📅", title: "Schedule",       description: "Pick a start date. We confirm 48 hours before and show up on time." },
          { id: uid(), icon: "🏗️", title: "We Work",        description: "Our crew handles everything professionally and keeps the job site clean." },
          { id: uid(), icon: "✅", title: "Completion",     description: "Final walkthrough, sign-off, and you're done. Satisfaction guaranteed." },
        ],
        ctaText: "Get Your Free Estimate",
        ctaUrl: "#contact",
      };
    case "certifications":
      return {
        heading: "Licenses & Certifications",
        subheading: "Fully licensed, insured, and certified to do the work right.",
        items: [],
      };
    case "service-area":
      return { displayMode: "both", heading: "Our Service Area", selectedStates: [] };
    case "before-after":
      return { heading: "Before & After", pairs: [] };
    case "featured-clients":
      return { heading: "Brands We Work With", logos: [] };
    case "meet-owner":
      return {
        layout: "split",
        heading: "Meet the Owner",
        ownerName: "Owner Name",
        ownerTitle: "Owner & Lead",
        bio: "I started this company because I saw too many homeowners getting poor service. Every job we take on is treated like it's our own home.",
        showStats: true,
        showBadges: true,
        ctaText: "Request a Free Estimate",
        ctaUrl: "#contact",
        stats: [{ id: uid(), value: "10+", label: "Years Experience" }, { id: uid(), value: "500+", label: "Jobs Completed" }],
        badges: [{ id: uid(), label: "Licensed", icon: "📋" }, { id: uid(), label: "Insured", icon: "🛡️" }],
      };
    case "trust-counter":
      return { heading: "Trusted by Homeowners", counters: [{ id: uid(), value: "1,000+", label: "Happy Customers" }, { id: uid(), value: "5★", label: "Average Rating" }] };
    case "why-choose-us":
      return {
        heading: "Why Choose Us",
        items: [
          { id: uid(), icon: "✓", title: "Free Detailed Estimates", description: "No surprises. You'll know exactly what to expect before we start." },
          { id: uid(), icon: "✓", title: "Licensed & Fully Insured", description: "Certificates available on request. Your property is protected." },
          { id: uid(), icon: "✓", title: "Satisfaction Guarantee", description: "If it's not right, we'll make it right. No argument, no hassle." },
        ],
      };
    case "faq":
      return {
        heading: "Frequently Asked Questions",
        items: [
          { id: uid(), question: "How do I get a quote?", answer: "Simply fill out our contact form or call us. We'll schedule a free on-site estimate within 24 hours." },
          { id: uid(), question: "Are you licensed and insured?", answer: "Yes — fully licensed, bonded, and insured. Copies of our certificates are available upon request." },
          { id: uid(), question: "How long does a typical project take?", answer: "It depends on scope. We'll give you a firm timeline during your free estimate." },
        ],
      };
    default:
      return {};
  }
}

// ── buildIndustrySections ────────────────────────────────────────────────────

export interface GeneratedSection {
  id: string;
  type: string;
  enabled: boolean;
  order: number;
  content: Record<string, unknown>;
  blockStyle?: Record<string, unknown>;
}

/**
 * Converts an IndustryProfile into a complete section array ready to persist
 * as a new website configuration.
 *
 * - required + recommended sections are always included
 * - optional sections are excluded (AI Wizard M1 can add them conditionally)
 * - defaultContent from the profile spec is deep-merged on top of type defaults
 * - footer is always appended last
 */
export function buildIndustrySections(
  profile: IndustryProfile,
  biz: BizInfo = {},
  includeOptional = false,
): GeneratedSection[] {
  const specsToUse = profile.sections.filter(
    s => s.priority !== "optional" || includeOptional,
  );

  const sections: GeneratedSection[] = specsToUse.map((spec, idx) => {
    const base = defaultSectionContent(spec.type, biz);
    const merged: Record<string, unknown> = { ...base };
    // Deep-merge profile defaultContent overrides
    if (spec.defaultContent) {
      for (const [k, v] of Object.entries(spec.defaultContent)) {
        if (
          merged[k] != null &&
          typeof merged[k] === "object" && !Array.isArray(merged[k]) &&
          typeof v === "object" && v !== null && !Array.isArray(v)
        ) {
          merged[k] = { ...(merged[k] as Record<string, unknown>), ...(v as Record<string, unknown>) };
        } else {
          merged[k] = v;
        }
      }
    }
    return {
      id: `${spec.type}-${uid()}`,
      type: spec.type,
      enabled: true,
      order: idx,
      content: merged,
    };
  });

  // Ensure footer is always last
  const hasFooter = sections.some(s => s.type === "footer");
  if (!hasFooter) {
    sections.push({
      id: `footer-${uid()}`,
      type: "footer",
      enabled: true,
      order: sections.length,
      content: defaultSectionContent("footer", biz),
    });
  }

  return sections;
}
