/**
 * M14 – AI Accessibility Checker
 * Pure, dependency-free module that inspects the section tree + site settings
 * and returns a list of WCAG-focused findings with auto-fix payloads where possible.
 *
 * Covers: Contrast, Images (alt text), Headings, Buttons, Forms, Links.
 * No network calls — runs instantly in the browser.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type A11yCategory = "Contrast" | "Images" | "Headings" | "Buttons" | "Forms" | "Links";
export type A11ySeverity = "error" | "warning" | "info";

/**
 * Fix action for a single a11y finding.
 *   content-patch:        Merge `contentPatch` into `section.content[sectionId]` (for auto-fix).
 *   navigate-to-section:  Highlight the named section in the editor (scroll + select).
 *   open-settings:        Switch to the Theme & Design tab.
 */
export type A11yFixAction =
  | { kind: "content-patch"; sectionId: string; contentPatch: Record<string, unknown> }
  | { kind: "navigate-to-section"; sectionId: string; sectionType: string }
  | { kind: "open-settings" };

export interface A11yFinding {
  id: string;
  category: A11yCategory;
  severity: A11ySeverity;
  label: string;
  description: string;
  /** Which section contains the issue (undefined = site-wide) */
  sectionId?: string;
  sectionType?: string;
  /** Whether this issue can be auto-fixed without leaving the panel */
  fixable: boolean;
  /**
   * For fixable issues: the content patch to apply and the section to patch.
   * `contentPatch` is shallow-merged into `section.content`.
   */
  fixAction?: A11yFixAction;
  /** Short label for the action button */
  fixButtonLabel?: string;
}

export interface A11yCheckResult {
  findings: A11yFinding[];
  /** Number of checks that passed (no finding) */
  passedChecks: number;
  /** Total checks run */
  totalChecks: number;
  /** 0–100: passedChecks / totalChecks * 100 */
  completionPct: number;
  byCategory: Record<A11yCategory, A11yFinding[]>;
}

// ── WCAG contrast helpers ─────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : [r, g, b];
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : [r, g, b];
  }
  return null;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * WCAG 2.1 contrast ratio between two hex colors.
 * Returns null if either color can't be parsed.
 */
function contrastRatio(hex1: string, hex2: string): number | null {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return null;
  const L1 = relativeLuminance(...rgb1);
  const L2 = relativeLuminance(...rgb2);
  const bright = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (bright + 0.05) / (dark + 0.05);
}

// ── Loose section types ────────────────────────────────────────────────────────

interface SectionLike {
  id: string;
  type: string;
  enabled: boolean;
  content: Record<string, unknown>;
}

interface SettingsLike {
  brandColor?: string;
  bgColor?: string;
  textColor?: string;
  textMutedColor?: string;
  surfaceColor?: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function findEnabled(sections: SectionLike[], type: string): SectionLike | undefined {
  return sections.find(s => s.type === type && s.enabled);
}

// ── Rule evaluation ────────────────────────────────────────────────────────────

interface RuleResult {
  /** true = check passed (no issue), false = issue found */
  passed: boolean;
  finding?: A11yFinding;
}

function evalRules(sections: SectionLike[], settings: SettingsLike): RuleResult[] {
  const results: RuleResult[] = [];

  // ── 1. CONTRAST: text on background ────────────────────────────────────────
  {
    const textColor = settings.textColor ?? "#1a1a2e";
    const bgColor   = settings.bgColor   ?? "#ffffff";
    const ratio = contrastRatio(textColor, bgColor);
    if (ratio !== null && ratio < 4.5) {
      results.push({
        passed: false,
        finding: {
          id: "contrast-text-bg",
          category: "Contrast",
          severity: "error",
          label: "Text has insufficient contrast",
          description: `Your body text color achieves only ${ratio.toFixed(1)}:1 contrast against the background (WCAG AA requires 4.5:1 for normal text). Low contrast makes your site unreadable for visitors with visual impairments.`,
          fixable: false,
          fixAction: { kind: "open-settings" },
          fixButtonLabel: "Open Theme Settings",
        },
      });
    } else {
      results.push({ passed: true });
    }
  }

  // ── 2. CONTRAST: brand color on white ─────────────────────────────────────
  {
    const brandColor = settings.brandColor ?? "#1a1a2e";
    const ratio = contrastRatio(brandColor, "#ffffff");
    if (ratio !== null && ratio < 3.0) {
      results.push({
        passed: false,
        finding: {
          id: "contrast-brand-btn",
          category: "Contrast",
          severity: "warning",
          label: "Brand color is hard to read on white buttons",
          description: `White text on your brand-colored buttons achieves only ${ratio.toFixed(1)}:1 contrast (WCAG AA large text requires 3:1). Visitors may struggle to read button labels.`,
          fixable: false,
          fixAction: { kind: "open-settings" },
          fixButtonLabel: "Open Theme Settings",
        },
      });
    } else {
      results.push({ passed: true });
    }
  }

  // ── 3. CONTRAST: muted text ────────────────────────────────────────────────
  {
    const mutedColor = settings.textMutedColor ?? "#64748b";
    const bgColor    = settings.bgColor ?? "#ffffff";
    const ratio = contrastRatio(mutedColor, bgColor);
    if (ratio !== null && ratio < 3.0) {
      results.push({
        passed: false,
        finding: {
          id: "contrast-muted-text",
          category: "Contrast",
          severity: "warning",
          label: "Muted text is too faint to read",
          description: `Your secondary/muted text achieves only ${ratio.toFixed(1)}:1 contrast (minimum 3:1 for large text, 4.5:1 for small text). Subheadings and descriptions may be invisible to some visitors.`,
          fixable: false,
          fixAction: { kind: "open-settings" },
          fixButtonLabel: "Open Theme Settings",
        },
      });
    } else {
      results.push({ passed: true });
    }
  }

  // ── 4. HEADINGS: hero headline ─────────────────────────────────────────────
  {
    const hero = findEnabled(sections, "hero");
    if (hero) {
      const headline = str(hero.content.headline);
      if (!headline) {
        results.push({
          passed: false,
          finding: {
            id: "hero-headline-empty",
            category: "Headings",
            severity: "error",
            label: "Hero section has no headline (H1)",
            description: "Every page needs a clear H1 heading so screen readers can identify the page topic. Your hero section's headline is blank.",
            sectionId: hero.id,
            sectionType: hero.type,
            fixable: false,
            fixAction: { kind: "navigate-to-section", sectionId: hero.id, sectionType: hero.type },
            fixButtonLabel: "Go to Hero",
          },
        });
      } else {
        results.push({ passed: true });
      }
    } else {
      results.push({ passed: true }); // Hero not present — not this check's problem
    }
  }

  // ── 5. HEADINGS: services section has a heading ───────────────────────────
  {
    const services = findEnabled(sections, "services");
    if (services) {
      const heading = str(services.content.heading);
      if (!heading) {
        results.push({
          passed: false,
          finding: {
            id: "services-heading-empty",
            category: "Headings",
            severity: "warning",
            label: "Services section is missing a section heading",
            description: "Section headings help screen reader users navigate your page. The Services section has no visible heading.",
            sectionId: services.id,
            sectionType: services.type,
            fixable: true,
            fixAction: {
              kind: "content-patch",
              sectionId: services.id,
              contentPatch: { heading: "Our Services" },
            },
            fixButtonLabel: "Add Heading",
          },
        });
      } else {
        results.push({ passed: true });
      }
    } else {
      results.push({ passed: true });
    }
  }

  // ── 6. BUTTONS: hero CTA label ────────────────────────────────────────────
  {
    const hero = findEnabled(sections, "hero");
    if (hero) {
      const ctaLabel = str(hero.content.ctaLabel);
      if (!ctaLabel) {
        results.push({
          passed: false,
          finding: {
            id: "hero-cta-empty",
            category: "Buttons",
            severity: "error",
            label: "Hero CTA button has no label",
            description: "A button without a visible label is unusable by keyboard and screen reader users. The primary call-to-action in your hero has an empty label.",
            sectionId: hero.id,
            sectionType: hero.type,
            fixable: true,
            fixAction: {
              kind: "content-patch",
              sectionId: hero.id,
              contentPatch: { ctaLabel: "Get a Free Quote" },
            },
            fixButtonLabel: "Fix: Add CTA Label",
          },
        });
      } else {
        results.push({ passed: true });
      }
    } else {
      results.push({ passed: true });
    }
  }

  // ── 7. BUTTONS: CTA section button label ─────────────────────────────────
  {
    const cta = findEnabled(sections, "cta");
    if (cta) {
      const label = str(cta.content.buttonLabel);
      if (!label) {
        results.push({
          passed: false,
          finding: {
            id: "cta-button-empty",
            category: "Buttons",
            severity: "error",
            label: "CTA banner has no button label",
            description: "Your CTA Banner section has a button with no label. Unlabeled buttons are inaccessible — screen readers announce them as \"button\" with no context.",
            sectionId: cta.id,
            sectionType: cta.type,
            fixable: true,
            fixAction: {
              kind: "content-patch",
              sectionId: cta.id,
              contentPatch: { buttonLabel: "Schedule Your Free Estimate" },
            },
            fixButtonLabel: "Fix: Add Button Label",
          },
        });
      } else {
        results.push({ passed: true });
      }
    } else {
      results.push({ passed: true });
    }
  }

  // ── 8. IMAGES: service card images without alt text ──────────────────────
  {
    const services = findEnabled(sections, "services");
    if (services) {
      type Item = { id?: string; title?: string; mediaType?: string; imageUrl?: string; imageAlt?: string };
      const items = (services.content.items as Item[] | undefined) ?? [];
      const missing = items.filter(
        item => item.mediaType === "image" && str(item.imageUrl) && !str(item.imageAlt),
      );
      if (missing.length > 0) {
        const fixedItems = items.map(item =>
          item.mediaType === "image" && str(item.imageUrl) && !str(item.imageAlt)
            ? { ...item, imageAlt: item.title ? `Photo representing ${item.title}` : "Service photo" }
            : item,
        );
        results.push({
          passed: false,
          finding: {
            id: "service-images-alt",
            category: "Images",
            severity: "warning",
            label: `${missing.length} service card image${missing.length > 1 ? "s" : ""} missing alt text`,
            description: "Screen readers read alt text aloud when announcing images. Visitors using assistive technology can't understand what your service images show.",
            sectionId: services.id,
            sectionType: services.type,
            fixable: true,
            fixAction: {
              kind: "content-patch",
              sectionId: services.id,
              contentPatch: { items: fixedItems },
            },
            fixButtonLabel: "Auto-add Alt Text",
          },
        });
      } else {
        results.push({ passed: true });
      }
    } else {
      results.push({ passed: true });
    }
  }

  // ── 9. IMAGES: gallery images without alt text ────────────────────────────
  {
    const gallery = findEnabled(sections, "gallery");
    if (gallery) {
      type GalleryImage = { id?: string; url?: string; alt?: string; caption?: string };
      const images = (gallery.content.images as GalleryImage[] | undefined) ?? [];
      const missing = images.filter(img => str(img.url) && !str(img.alt));
      if (missing.length > 0) {
        const fixedImages = images.map((img, idx) =>
          str(img.url) && !str(img.alt)
            ? { ...img, alt: img.caption ? img.caption : `Project photo ${idx + 1}` }
            : img,
        );
        results.push({
          passed: false,
          finding: {
            id: "gallery-images-alt",
            category: "Images",
            severity: "warning",
            label: `${missing.length} gallery image${missing.length > 1 ? "s" : ""} missing alt text`,
            description: "Visitors using screen readers or slow connections see alt text instead of images. Meaningful alt text also improves Google image search rankings.",
            sectionId: gallery.id,
            sectionType: gallery.type,
            fixable: true,
            fixAction: {
              kind: "content-patch",
              sectionId: gallery.id,
              contentPatch: { images: fixedImages },
            },
            fixButtonLabel: "Auto-add Alt Text",
          },
        });
      } else {
        results.push({ passed: true });
      }
    } else {
      results.push({ passed: true });
    }
  }

  // ── 10. IMAGES: about section photo alt text ──────────────────────────────
  {
    const about = findEnabled(sections, "about");
    if (about) {
      const photoUrl = str(about.content.photoUrl);
      const photoAlt = str(about.content.photoAlt);
      if (photoUrl && !photoAlt) {
        const heading = str(about.content.heading) || "Our Team";
        results.push({
          passed: false,
          finding: {
            id: "about-photo-alt",
            category: "Images",
            severity: "info",
            label: "About section photo has no alt text",
            description: "The team or owner photo in your About section has no alt text. Screen readers will skip it, leaving visitors unaware a key trust photo exists.",
            sectionId: about.id,
            sectionType: about.type,
            fixable: true,
            fixAction: {
              kind: "content-patch",
              sectionId: about.id,
              contentPatch: { photoAlt: `Photo of ${heading}` },
            },
            fixButtonLabel: "Add Alt Text",
          },
        });
      } else {
        results.push({ passed: true });
      }
    } else {
      results.push({ passed: true });
    }
  }

  // ── 11. FORMS: contact/quote form has a heading ───────────────────────────
  {
    const contact = findEnabled(sections, "contact") ?? findEnabled(sections, "quote-form");
    if (contact) {
      const heading = str(contact.content.heading);
      if (!heading) {
        const defaultHeading = contact.type === "quote-form"
          ? "Request a Free Estimate"
          : "Request a Free Quote";
        results.push({
          passed: false,
          finding: {
            id: "contact-heading-empty",
            category: "Forms",
            severity: "warning",
            label: "Contact form has no heading",
            description: "Forms should have a visible heading so screen reader users know what the form is for. Without a heading, visitors landing on the form have no context.",
            sectionId: contact.id,
            sectionType: contact.type,
            fixable: true,
            fixAction: {
              kind: "content-patch",
              sectionId: contact.id,
              contentPatch: { heading: defaultHeading },
            },
            fixButtonLabel: "Add Form Heading",
          },
        });
      } else {
        results.push({ passed: true });
      }
    } else {
      results.push({ passed: true });
    }
  }

  // ── 12. LINKS: footer has no contact info ────────────────────────────────
  {
    const footer = findEnabled(sections, "footer");
    if (footer) {
      const phone = str(footer.content.phone);
      const email = str(footer.content.email);
      if (!phone && !email) {
        results.push({
          passed: false,
          finding: {
            id: "footer-no-contact",
            category: "Links",
            severity: "warning",
            label: "Footer has no phone or email link",
            description: "Visitors who reach the footer expect to find contact information. Without a phone number or email, your site creates a dead end — especially for mobile users who tap-to-call.",
            sectionId: footer.id,
            sectionType: footer.type,
            fixable: false,
            fixAction: {
              kind: "navigate-to-section",
              sectionId: footer.id,
              sectionType: footer.type,
            },
            fixButtonLabel: "Go to Footer",
          },
        });
      } else {
        results.push({ passed: true });
      }
    } else {
      results.push({ passed: true });
    }
  }

  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

const CATEGORIES: A11yCategory[] = ["Contrast", "Headings", "Buttons", "Images", "Forms", "Links"];

export function checkAccessibility(
  sections: SectionLike[],
  settings: SettingsLike,
): A11yCheckResult {
  const ruleResults = evalRules(sections, settings);

  const findings = ruleResults
    .filter(r => !r.passed && r.finding)
    .map(r => r.finding!);

  const totalChecks = ruleResults.length;
  const passedChecks = ruleResults.filter(r => r.passed).length;
  const completionPct = totalChecks > 0
    ? Math.round((passedChecks / totalChecks) * 100)
    : 100;

  const byCategory = Object.fromEntries(
    CATEGORIES.map(cat => [cat, findings.filter(f => f.category === cat)]),
  ) as A11yCheckResult["byCategory"];

  return { findings, passedChecks, totalChecks, completionPct, byCategory };
}

/** Server-side compatible version (same logic, accepts loose JSON). */
export function checkAccessibilityJSON(
  sections: unknown[],
  settings: Record<string, unknown>,
): A11yCheckResult {
  return checkAccessibility(sections as SectionLike[], settings as SettingsLike);
}
