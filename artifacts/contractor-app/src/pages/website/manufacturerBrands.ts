/**
 * manufacturerBrands.ts — M17: AI Dealer Pages
 *
 * Curated brand registry for manufactured-home manufacturers and
 * dealer programs. Used by DealerPageGenerator (UI checklist) and
 * the generate-dealer-pages API endpoint (prompts + page assembly).
 *
 * Logos are stored as inline SVG strings; callers convert them to
 * data URIs with `svgToDataUri(brand.logoSvg)`.
 */

export interface ManufacturerBrand {
  /** URL-safe identifier, e.g. "clayton-homes" */
  id: string;
  /** Display name, e.g. "Clayton Homes" */
  name: string;
  /** URL path slug, e.g. "clayton-homes" → page at /clayton-homes */
  slug: string;
  /** Primary brand accent color (hex) */
  brandColor: string;
  /** Lighter accent used for backgrounds/badges */
  accentLight: string;
  /** Inline SVG wordmark — convert to data URI before use in img src */
  logoSvg: string;
  /** Short brand tagline shown in checklist */
  tagline: string;
  /** One-sentence description of what this manufacturer is known for */
  description: string;
  /** 3 partnership highlights used in the "Why [Brand]" section */
  partnershipHighlights: string[];
  /** Emoji icon shown in checklist */
  emoji: string;
  /** "manufactured" | "modular" | "flooring" | "generic" */
  category: "manufactured" | "modular" | "flooring" | "generic";
  /** Typical home series / product families (used in prompt) */
  productLines: string[];
}

function makeLogo(name: string, color: string, textColor = "#ffffff"): string {
  const escapedName = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fontSize = escapedName.length > 14 ? 18 : escapedName.length > 10 ? 20 : 23;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64">` +
    `<rect width="240" height="64" rx="8" fill="${color}"/>` +
    `<text x="120" y="${32 + fontSize * 0.38}" font-family="Arial,Helvetica,sans-serif" ` +
    `font-weight="700" font-size="${fontSize}" fill="${textColor}" text-anchor="middle" ` +
    `dominant-baseline="middle">${escapedName}</text>` +
    `</svg>`
  );
}

/** Convert an inline SVG string to a base-64 data URI usable in <img src>. */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export const MANUFACTURER_BRANDS: ManufacturerBrand[] = [
  {
    id: "clayton-homes",
    name: "Clayton Homes",
    slug: "clayton-homes",
    brandColor: "#005BAC",
    accentLight: "#E8F1FB",
    logoSvg: makeLogo("Clayton Homes", "#005BAC"),
    emoji: "🏡",
    tagline: "America's #1 Home Builder",
    category: "manufactured",
    description:
      "Clayton Homes is the nation's largest builder of manufactured and modular homes, owned by Berkshire Hathaway and known for quality construction, energy efficiency, and financing options.",
    partnershipHighlights: [
      "Access to Clayton's full catalog of floor plans, from single-section to spacious multi-section homes",
      "Backed by Berkshire Hathaway — industry-leading warranty and customer support",
      "Clayton Built® energy-efficient features standard across all models",
    ],
    productLines: ["Breeze", "Advantage", "Freedom", "Heritage", "Inspiration", "Merit"],
  },
  {
    id: "cavco",
    name: "Cavco",
    slug: "cavco",
    brandColor: "#1B5E20",
    accentLight: "#E8F5E9",
    logoSvg: makeLogo("Cavco", "#1B5E20"),
    emoji: "🌲",
    tagline: "Quality Built. Value Priced.",
    category: "manufactured",
    description:
      "Cavco Industries builds HUD-code manufactured homes and modular homes across the U.S., recognized for quality craftsmanship, customizable floor plans, and strong dealer programs.",
    partnershipHighlights: [
      "Wide range of customizable floor plans from cozy single-wides to spacious park models",
      "Strong warranty coverage and factory-direct quality control",
      "Competitive financing options and dealer support programs",
    ],
    productLines: ["Cavco Park Model", "Cavco Home", "Fleetwood by Cavco", "Palm Harbor", "Fairmont"],
  },
  {
    id: "champion-homes",
    name: "Champion Homes",
    slug: "champion-homes",
    brandColor: "#B71C1C",
    accentLight: "#FFEBEE",
    logoSvg: makeLogo("Champion Homes", "#B71C1C"),
    emoji: "🏆",
    tagline: "Built to Impress. Priced to Fit.",
    category: "manufactured",
    description:
      "Champion Homes has been building manufactured and modular homes for over 65 years, offering an exceptional range of single-section, double-section, and multi-section homes with modern designs.",
    partnershipHighlights: [
      "Over 65 years of experience building quality homes across North America",
      "Innovative floor plans with open-concept living spaces and modern kitchens",
      "Industry-leading warranty and dedicated service network",
    ],
    productLines: ["Majestic", "Legend", "Advantage", "Commodore", "Redman", "Skyline"],
  },
  {
    id: "fleetwood-homes",
    name: "Fleetwood Homes",
    slug: "fleetwood-homes",
    brandColor: "#1A237E",
    accentLight: "#E8EAF6",
    logoSvg: makeLogo("Fleetwood Homes", "#1A237E"),
    emoji: "🏠",
    tagline: "Crafted for Life.",
    category: "manufactured",
    description:
      "Fleetwood Homes has been a trusted name in manufactured housing for decades, offering high-quality homes known for durable construction, spacious layouts, and affordable luxury features.",
    partnershipHighlights: [
      "Decades of trusted manufacturing with a reputation for durable, high-quality homes",
      "Spacious floor plans with luxury features at affordable prices",
      "Comprehensive warranty program backed by experienced customer service",
    ],
    productLines: ["Weston", "Berkshire", "Westfield", "Everest", "Discovery", "Celebration"],
  },
  {
    id: "tru",
    name: "TRU",
    slug: "tru",
    brandColor: "#4A148C",
    accentLight: "#F3E5F5",
    logoSvg: makeLogo("TRU", "#4A148C"),
    emoji: "⭐",
    tagline: "True to Quality. True to Value.",
    category: "manufactured",
    description:
      "TRU is a modern manufactured home brand built on a commitment to quality craftsmanship, innovative design, and transparent pricing — making home ownership more accessible for everyone.",
    partnershipHighlights: [
      "Modern, contemporary designs that appeal to today's home buyers",
      "Transparent, straightforward pricing with no surprises",
      "Energy-efficient construction standards and green-building options",
    ],
    productLines: ["TRU Single", "TRU Double", "TRU Series", "TRU Plus"],
  },
  {
    id: "carpet-one",
    name: "Carpet One",
    slug: "carpet-one",
    brandColor: "#4E342E",
    accentLight: "#EFEBE9",
    logoSvg: makeLogo("Carpet One", "#4E342E"),
    emoji: "🏡",
    tagline: "Beautiful Floors. Exceptional Service.",
    category: "flooring",
    description:
      "Carpet One Floor & Home is a member-owned cooperative of flooring professionals offering carpet, hardwood, laminate, tile, and luxury vinyl with expert installation and design services.",
    partnershipHighlights: [
      "Member of the world's largest floor covering cooperative — unmatched product selection",
      "Expert installation services and in-home design consultations",
      "Exclusive Trustworthy™ and other premium brand partnerships",
    ],
    productLines: ["Carpet", "Hardwood", "Laminate", "Tile", "Luxury Vinyl Plank", "Area Rugs"],
  },
  {
    id: "generic-dealer",
    name: "Dealer Program",
    slug: "dealer-program",
    brandColor: "#37474F",
    accentLight: "#ECEFF1",
    logoSvg: makeLogo("Dealer Program", "#37474F"),
    emoji: "🤝",
    tagline: "Authorized Dealer Program",
    category: "generic",
    description:
      "A flexible dealer partnership page template suitable for any manufacturer or brand program not listed above.",
    partnershipHighlights: [
      "Authorized dealer with full access to manufacturer's home catalog",
      "Factory-backed warranty and customer service support",
      "Competitive financing and flexible purchasing options",
    ],
    productLines: ["Single-Section", "Double-Section", "Multi-Section", "Modular"],
  },
];

/** Look up a brand by its id. Returns undefined if not found. */
export function getBrand(id: string): ManufacturerBrand | undefined {
  return MANUFACTURER_BRANDS.find(b => b.id === id);
}

/** The brand IDs of "core" manufactured-home brands (not flooring / generic). */
export const CORE_BRAND_IDS = ["clayton-homes", "cavco", "champion-homes", "fleetwood-homes", "tru"];
