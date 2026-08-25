/**
 * M13 – AI Homepage Score
 * Pure, dependency-free scoring engine that inspects the section tree + site
 * settings and returns a 0–100 score with per-rule results.
 *
 * No network calls — runs instantly on every save / fix-it action.
 */

export type RuleSeverity = "critical" | "recommended" | "optional";
export type RuleCategory = "Conversion" | "Trust" | "Content" | "Design";

/**
 * "Fix it" action that WebsiteEditor performs when the user clicks the button.
 *   open-library  — open SectionLibraryPanel (optionally pre-filtered by type)
 *   scroll-to-section — highlight + scroll to the first section of this type
 *   add-section — directly insert a blank section of this type
 *   open-settings — open the Theme/Settings tab
 */
export type ScoreFixAction =
  | { kind: "open-library"; sectionType?: string }
  | { kind: "scroll-to-section"; sectionType: string }
  | { kind: "add-section"; sectionType: string }
  | { kind: "open-settings" };

export interface ScoreRule {
  id: string;
  category: RuleCategory;
  severity: RuleSeverity;
  label: string;
  description: string;
  /** Max points for this rule */
  points: number;
  /** Whether the rule is currently satisfied */
  passed: boolean;
  /** Points earned (0 or `points`) */
  earned: number;
  /** One-liner telling the user what to do to fix this */
  fixHint: string;
  fixAction?: ScoreFixAction;
}

export interface WebsiteScoreResult {
  /** Aggregate 0–100 score */
  score: number;
  rules: ScoreRule[];
  passedCount: number;
  totalCount: number;
  /** Pre-grouped by category for the panel UI */
  byCategory: Record<RuleCategory, { earned: number; max: number; rules: ScoreRule[] }>;
}

// ── Loose section type (matches WebsiteEditor's internal Section) ──────────────

interface SectionLike {
  type: string;
  enabled: boolean;
  content: Record<string, unknown>;
}

interface SettingsLike {
  logoUrl?: string;
  brandColor?: string;
  secondaryColor?: string;
  accentColor?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findEnabled(sections: SectionLike[], type: string): SectionLike | undefined {
  return sections.find(s => s.type === type && s.enabled);
}

function findAnyEnabled(sections: SectionLike[], types: string[]): SectionLike | undefined {
  return sections.find(s => types.includes(s.type) && s.enabled);
}

function meaningful(value: unknown): boolean {
  return typeof value === "string" && value.trim().length >= 3;
}

function meaningfulItems(section: SectionLike | undefined, field: string, minimum = 1): boolean {
  if (!section) return false;
  const value = section.content[field];
  if (!Array.isArray(value)) return false;
  return value.filter(item => {
    if (typeof item === "string") return meaningful(item);
    if (!item || typeof item !== "object") return false;
    return Object.values(item as Record<string, unknown>).some(meaningful);
  }).length >= minimum;
}

/** Count non-empty items in a content array field. */
function itemCount(section: SectionLike | undefined, field: string): number {
  if (!section) return 0;
  const arr = section.content[field];
  return Array.isArray(arr) ? arr.filter(Boolean).length : 0;
}

/** Count photos across portfolio projects. */
function portfolioPhotoCount(sections: SectionLike[]): number {
  const portfolio = findEnabled(sections, "portfolio");
  if (!portfolio) return 0;
  const projects = portfolio.content.projects as Array<{ photos?: unknown[] }> | undefined;
  if (!Array.isArray(projects)) return 0;
  return projects.reduce((sum, p) => sum + (Array.isArray(p.photos) ? p.photos.length : 0), 0);
}

function galleryPhotoCount(sections: SectionLike[]): number {
  const gallery = findEnabled(sections, "gallery");
  if (!gallery) return 0;
  return itemCount(gallery, "images");
}

// ── Rule definitions ──────────────────────────────────────────────────────────

type RuleDef = Omit<ScoreRule, "passed" | "earned">;

function evaluate(
  sections: SectionLike[],
  settings: SettingsLike,
): ScoreRule[] {
  const rules: Array<RuleDef & { check: () => boolean }> = [
    // ── CONVERSION ──────────────────────────────────────────────────────────
    {
      id: "hero-enabled",
      category: "Conversion",
      severity: "critical",
      points: 10,
      label: "Hero section is present",
      description: "Every high-converting site starts with a full-width hero that tells visitors who you are and what you do.",
      fixHint: "Add or re-enable the Hero section.",
      fixAction: { kind: "scroll-to-section", sectionType: "hero" },
       check: () => {
         const hero = findEnabled(sections, "hero");
         return !!hero && (meaningful(hero.content.headline) || meaningful(hero.content.subheadline));
       },
    },
    {
      id: "hero-cta",
      category: "Conversion",
      severity: "critical",
      points: 8,
      label: "Hero has a call-to-action button",
      description: "A hero without a CTA misses your best chance to convert a first-time visitor.",
      fixHint: "Open the Hero section and fill in the CTA button label.",
      fixAction: { kind: "scroll-to-section", sectionType: "hero" },
      check: () => {
        const hero = findEnabled(sections, "hero");
        if (!hero) return false;
        const label = hero.content.ctaLabel as string | undefined;
        return typeof label === "string" && label.trim().length > 0;
      },
    },
    {
      id: "contact-form",
      category: "Conversion",
      severity: "critical",
      points: 10,
      label: "Contact or quote form is enabled",
      description: "A contact form is the primary lead-capture mechanism. Without one, visitors have no easy way to reach you.",
      fixHint: "Add a Contact / Quote Form or Quote Request Form section.",
      fixAction: { kind: "open-library", sectionType: "contact" },
       check: () => {
         const sec = findAnyEnabled(sections, ["contact", "quote-form"]);
         return !!sec && (
           meaningful(sec.content.heading) ||
           meaningful(sec.content.subheading) ||
           meaningfulItems(sec, "serviceTypes")
         );
       },
    },
    {
      id: "cta-section",
      category: "Conversion",
      severity: "recommended",
      points: 10,
      label: "CTA banner section drives action",
      description: "A dedicated CTA strip mid-page or near the bottom re-engages visitors who scrolled past the hero.",
      fixHint: "Add a CTA Banner section to prompt visitors to call or request a quote.",
      fixAction: { kind: "add-section", sectionType: "cta" },
       check: () => {
         const sec = findEnabled(sections, "cta");
         return !!sec && (meaningful(sec.content.heading) || meaningful(sec.content.text) || meaningful(sec.content.ctaLabel));
       },
    },

    // ── TRUST ────────────────────────────────────────────────────────────────
    {
      id: "testimonials",
      category: "Trust",
      severity: "critical",
      points: 10,
      label: "Customer testimonials are shown",
      description: "Testimonials are the #1 trust signal for local service businesses — 88% of consumers trust reviews as much as personal recommendations.",
      fixHint: "Add a Testimonials section with at least one real customer review.",
      fixAction: { kind: "open-library", sectionType: "testimonials" },
      check: () => {
        const sec = findEnabled(sections, "testimonials");
        if (!sec) return false;
        const items = sec.content.items as unknown[] | undefined;
         return meaningfulItems(sec, "items");
      },
    },
    {
      id: "portfolio-photos",
      category: "Trust",
      severity: "recommended",
      points: 8,
      label: "Portfolio shows real project photos",
      description: "Seeing finished work removes doubt. Aim for at least 3 photos so visitors see variety.",
      fixHint: "Add project photos to your Portfolio section, or add an Image Gallery.",
      fixAction: { kind: "scroll-to-section", sectionType: "portfolio" },
      check: () => portfolioPhotoCount(sections) >= 1 || galleryPhotoCount(sections) >= 1,
    },
    {
      id: "trust-signals",
      category: "Trust",
      severity: "recommended",
      points: 7,
      label: "Trust badges or credentials are displayed",
      description: "Licenses, certifications, or a trust counter (years in business, jobs completed) reassure visitors you're the real deal.",
      fixHint: "Add a Certifications section or Trust Counter to highlight your credentials.",
      fixAction: { kind: "open-library", sectionType: "certifications" },
       check: () => {
         const sec = findAnyEnabled(sections, ["certifications", "trust-counter", "why-choose-us"]);
         return !!sec && (
           meaningful(sec.content.heading) ||
           meaningfulItems(sec, "items") ||
           meaningfulItems(sec, "badges")
         );
       },
    },

    // ── CONTENT ──────────────────────────────────────────────────────────────
    {
      id: "services-items",
      category: "Content",
      severity: "critical",
      points: 8,
      label: "Services section lists what you offer",
      description: "Visitors need to quickly understand what you do. List at least 3 services so the section looks complete.",
      fixHint: "Open the Services section and add at least 3 service cards.",
      fixAction: { kind: "scroll-to-section", sectionType: "services" },
      check: () => {
        const sec = findEnabled(sections, "services");
        if (!sec) return false;
         return meaningfulItems(sec, "items", 2);
      },
    },
    {
      id: "faq",
      category: "Content",
      severity: "recommended",
      points: 7,
      label: "FAQ answers common visitor questions",
      description: "An FAQ reduces pre-sale objections, improves SEO, and helps prospects self-qualify before calling.",
      fixHint: "Add an FAQ section with at least 4 questions visitors commonly ask.",
      fixAction: { kind: "add-section", sectionType: "faq" },
      check: () => {
        const sec = findEnabled(sections, "faq");
        if (!sec) return false;
         return meaningfulItems(sec, "items");
      },
    },
    {
      id: "about-story",
      category: "Content",
      severity: "recommended",
      points: 7,
      label: "About or owner story builds connection",
      description: "People hire people they trust. An About Us or Meet the Owner section makes your business feel personal, not corporate.",
      fixHint: "Enable your About Us section or add a Meet the Owner section.",
      fixAction: { kind: "scroll-to-section", sectionType: "about" },
       check: () => {
         const sec = findAnyEnabled(sections, ["about", "meet-owner"]);
         return !!sec && (meaningful(sec.content.heading) || meaningful(sec.content.body) || meaningful(sec.content.name));
       },
    },

    // ── DESIGN ───────────────────────────────────────────────────────────────
    {
      id: "logo-set",
      category: "Design",
      severity: "recommended",
      points: 7,
      label: "Business logo is uploaded",
      description: "A logo makes your site look professional and memorable. Sites without logos feel unfinished.",
      fixHint: "Upload your logo in the Theme & Design settings.",
      fixAction: { kind: "open-settings" },
      check: () => {
        const logo = settings.logoUrl;
        return typeof logo === "string" && logo.trim().length > 0;
      },
    },
    {
      id: "footer-contact",
      category: "Design",
      severity: "recommended",
      points: 5,
      label: "Footer shows phone and email",
      description: "Visitors who scroll to the bottom are highly interested — make it easy for them to reach you.",
      fixHint: "Open the Footer section and fill in your phone number and email address.",
      fixAction: { kind: "scroll-to-section", sectionType: "footer" },
      check: () => {
        const sec = findEnabled(sections, "footer");
        if (!sec) return false;
        const phone = sec.content.phone as string | undefined;
        const email = sec.content.email as string | undefined;
         return meaningful(phone) || meaningful(email);
      },
    },
    {
      id: "coverage-map",
      category: "Design",
      severity: "optional",
      points: 3,
      label: "Coverage map shows your service area",
      description: "Contractors who clearly show where they work get fewer out-of-area inquiries and more local conversions.",
      fixHint: "Add a Coverage Map section to show which states and regions you serve.",
      fixAction: { kind: "add-section", sectionType: "service-area" },
       check: () => {
         const sec = findEnabled(sections, "service-area");
         return !!sec && (meaningful(sec.content.heading) || meaningful(sec.content.description) || meaningfulItems(sec, "areas"));
       },
    },
  ];

  return rules.map(({ check, ...def }) => {
    const passed = check();
    return { ...def, passed, earned: passed ? def.points : 0 };
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function scoreWebsite(
  sections: SectionLike[],
  settings: SettingsLike,
): WebsiteScoreResult {
  const rules = evaluate(sections, settings);

  const totalPoints = rules.reduce((s, r) => s + r.points, 0);
  const earnedPoints = rules.reduce((s, r) => s + r.earned, 0);
  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

  const CATEGORIES: RuleCategory[] = ["Conversion", "Trust", "Content", "Design"];
  const byCategory = Object.fromEntries(
    CATEGORIES.map(cat => {
      const catRules = rules.filter(r => r.category === cat);
      return [
        cat,
        {
          earned: catRules.reduce((s, r) => s + r.earned, 0),
          max: catRules.reduce((s, r) => s + r.points, 0),
          rules: catRules,
        },
      ];
    }),
  ) as WebsiteScoreResult["byCategory"];

  return {
    score,
    rules,
    passedCount: rules.filter(r => r.passed).length,
    totalCount: rules.length,
    byCategory,
  };
}

/** Same logic exposed as a plain object — suitable for a backend JSON endpoint. */
export function scoreWebsiteJSON(
  sections: unknown[],
  settings: Record<string, unknown>,
): WebsiteScoreResult {
  return scoreWebsite(sections as SectionLike[], settings as SettingsLike);
}
