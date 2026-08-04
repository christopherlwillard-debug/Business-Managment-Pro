/**
 * M16 – AI Marketing Assistant
 * Registry of supported marketing content types: metadata for the UI.
 * Prompt templates live server-side; this file is pure UI configuration.
 */

export type MarketingContentType =
  | "facebook-post"
  | "google-post"
  | "blog-post"
  | "newsletter"
  | "flyer"
  | "door-hanger"
  | "business-card"
  | "estimate-followup"
  | "review-request";

export type ContentCategory = "Social" | "Email" | "Blog" | "Print";

export interface MarketingTypeConfig {
  id: MarketingContentType;
  label: string;
  category: ContentCategory;
  description: string;
  emoji: string;
  /** Whether a PDF download is offered for this type */
  printable: boolean;
  /** Rough expected output format hint for the preview renderer */
  previewStyle: "social-facebook" | "social-google" | "email" | "article" | "print";
  placeholderHint: string;
}

export const MARKETING_CONTENT_TYPES: MarketingTypeConfig[] = [
  // ── Social ──────────────────────────────────────────────────────────────────
  {
    id: "facebook-post",
    label: "Facebook Post",
    category: "Social",
    description: "Engaging post for your Facebook Business page with hashtags",
    emoji: "📘",
    printable: false,
    previewStyle: "social-facebook",
    placeholderHint: "e.g. spring promo, roofing season, summer AC deal",
  },
  {
    id: "google-post",
    label: "Google Business Post",
    category: "Social",
    description: "Short update for your Google Business Profile listing",
    emoji: "🔍",
    printable: false,
    previewStyle: "social-google",
    placeholderHint: "e.g. new service, limited-time offer, seasonal special",
  },
  // ── Email ────────────────────────────────────────────────────────────────────
  {
    id: "estimate-followup",
    label: "Estimate Follow-up",
    category: "Email",
    description: "Professional email to send after delivering a quote",
    emoji: "📋",
    printable: false,
    previewStyle: "email",
    placeholderHint: "e.g. roofing estimate, HVAC replacement quote, deck build",
  },
  {
    id: "review-request",
    label: "Review Request",
    category: "Email",
    description: "Ask happy customers for a Google or Facebook review",
    emoji: "⭐",
    printable: false,
    previewStyle: "email",
    placeholderHint: "e.g. after a roof install, AC tune-up, landscaping job",
  },
  {
    id: "newsletter",
    label: "Monthly Newsletter",
    category: "Email",
    description: "Monthly email to keep customers engaged and informed",
    emoji: "📧",
    printable: false,
    previewStyle: "email",
    placeholderHint: "e.g. summer tips, storm prep, holiday specials",
  },
  // ── Blog ────────────────────────────────────────────────────────────────────
  {
    id: "blog-post",
    label: "Blog Article",
    category: "Blog",
    description: "SEO-friendly article for your website or Google Business",
    emoji: "✍️",
    printable: false,
    previewStyle: "article",
    placeholderHint: "e.g. how to tell if your roof needs replacing, 5 signs you need AC repair",
  },
  // ── Print ────────────────────────────────────────────────────────────────────
  {
    id: "flyer",
    label: "Promo Flyer",
    category: "Print",
    description: "Letter-size flyer for door drops, community boards, or mailers",
    emoji: "🗞️",
    printable: true,
    previewStyle: "print",
    placeholderHint: "e.g. spring roof inspection special, free estimate offer",
  },
  {
    id: "door-hanger",
    label: "Door Hanger",
    category: "Print",
    description: "Narrow door hanger — leave at homes in your service area",
    emoji: "🚪",
    printable: true,
    previewStyle: "print",
    placeholderHint: "e.g. just serviced your neighbor, summer deal, new service area",
  },
  {
    id: "business-card",
    label: "Business Card",
    category: "Print",
    description: "Front and back text for a professional business card",
    emoji: "💼",
    printable: true,
    previewStyle: "print",
    placeholderHint: "e.g. specialization, tagline idea, certifications to highlight",
  },
];

export const CONTENT_TYPE_MAP: Record<MarketingContentType, MarketingTypeConfig> =
  Object.fromEntries(MARKETING_CONTENT_TYPES.map(t => [t.id, t])) as Record<MarketingContentType, MarketingTypeConfig>;

export const CATEGORY_ORDER: ContentCategory[] = ["Social", "Email", "Blog", "Print"];
