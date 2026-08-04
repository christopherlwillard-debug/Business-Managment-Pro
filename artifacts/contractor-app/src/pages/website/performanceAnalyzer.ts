/**
 * M15 – AI Performance Analyzer
 * Pure, dependency-free heuristic checker that walks the section tree + site
 * settings and returns a list of performance findings with estimated impact.
 *
 * Covers: Images, Animations, Fonts, Sections (dead weight), Video, Loading.
 * No network calls — runs instantly in the browser.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type PerfCategory = "Images" | "Animations" | "Fonts" | "Sections" | "Video" | "Loading";
export type PerfSeverity = "error" | "warning" | "info";
export type PageSpeedRating = "Fast" | "Moderate" | "Slow";

/**
 * Action the editor should take when the user clicks Fix/Go in a finding card.
 *   navigate-to-section: highlight and scroll to the named section
 *   open-settings:       switch to the Theme & Design tab
 *   open-photo-optimizer: open the Media Library (nearest to M9 Photo Optimizer)
 */
export type PerfFixAction =
  | { kind: "navigate-to-section"; sectionId: string; sectionType: string }
  | { kind: "open-settings" }
  | { kind: "open-photo-optimizer" };

export interface PerfFinding {
  id: string;
  category: PerfCategory;
  severity: PerfSeverity;
  label: string;
  description: string;
  /** Human-readable current state, e.g. "14 images detected" */
  current: string;
  /** What to do about it */
  recommendation: string;
  sectionId?: string;
  sectionType?: string;
  fixable: boolean;
  fixAction?: PerfFixAction;
  fixButtonLabel?: string;
}

export interface PerfCheckResult {
  findings: PerfFinding[];
  passedChecks: number;
  totalChecks: number;
  pageSpeed: PageSpeedRating;
  /** Total image URLs detected across all sections */
  estimatedImageCount: number;
  /** Rough estimated transfer size in KB */
  estimatedImageKB: number;
  byCategory: Record<PerfCategory, PerfFinding[]>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface SectionLike {
  id: string;
  type: string;
  enabled: boolean;
  content: Record<string, unknown>;
  blockStyle?: Record<string, unknown>;
}

interface SettingsLike {
  fontFamily?: string;
  headingFont?: string;
  bodyFont?: string;
  brandColor?: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isObjectStorage(url: string): boolean {
  return url.includes("/objects/") || url.includes("object-storage") || url.includes("replit.app/objects");
}

/** Estimate transfer size in KB for one image URL. */
function estimateKB(url: string): number {
  if (!url) return 0;
  if (isObjectStorage(url)) return 55;   // already processed/compressed
  return 190;                             // generic external/unoptimized
}

function findEnabled(sections: SectionLike[], type: string): SectionLike | undefined {
  return sections.find(s => s.type === type && s.enabled);
}

// ── Image URL collector ────────────────────────────────────────────────────────

interface ImageRef {
  url: string;
  sectionId: string;
  sectionType: string;
  isExternal: boolean;
}

function collectImages(sections: SectionLike[]): ImageRef[] {
  const refs: ImageRef[] = [];

  const add = (url: string, section: SectionLike) => {
    const u = str(url);
    if (!u || u.startsWith("data:")) return;
    refs.push({ url: u, sectionId: section.id, sectionType: section.type, isExternal: !isObjectStorage(u) });
  };

  for (const s of sections) {
    if (!s.enabled) continue;
    const c = s.content;

    switch (s.type) {
      case "hero": {
        add(str(c.bgImage ?? c.imageUrl ?? c.heroImage), s);
        break;
      }
      case "about":
      case "meet-owner": {
        add(str(c.photoUrl), s);
        break;
      }
      case "image": {
        add(str(c.imageUrl), s);
        break;
      }
      case "services": {
        type Item = { mediaType?: string; imageUrl?: string };
        for (const item of (c.items as Item[] | undefined) ?? []) {
          if (item.mediaType === "image") add(str(item.imageUrl), s);
        }
        break;
      }
      case "gallery": {
        type GImg = { url?: string };
        for (const img of (c.images as GImg[] | undefined) ?? []) {
          add(str(img.url), s);
        }
        break;
      }
      case "portfolio": {
        type Project = { photos?: Array<{ url?: string }> };
        for (const proj of (c.projects as Project[] | undefined) ?? []) {
          for (const photo of proj.photos ?? []) {
            add(str(photo.url), s);
          }
        }
        break;
      }
      case "before-after": {
        add(str(c.beforeUrl), s);
        add(str(c.afterUrl), s);
        break;
      }
      case "featured-clients":
      case "partners":
      case "certifications": {
        type LogoItem = { imageUrl?: string; logoUrl?: string };
        for (const item of (c.items as LogoItem[] | undefined) ?? []) {
          add(str(item.imageUrl ?? item.logoUrl), s);
        }
        break;
      }
      case "columns": {
        type Column = { blocks?: Array<{ type?: string; url?: string; imageUrl?: string }> };
        for (const col of (c.columns as Column[] | undefined) ?? []) {
          for (const block of col.blocks ?? []) {
            if (block.type === "image") add(str(block.url ?? block.imageUrl), s);
          }
        }
        break;
      }
    }
  }

  return refs.filter(r => r.url.length > 0);
}

// ── Rule evaluation ────────────────────────────────────────────────────────────

interface RuleResult {
  passed: boolean;
  finding?: PerfFinding;
}

function evalRules(sections: SectionLike[], settings: SettingsLike): { results: RuleResult[]; imageRefs: ImageRef[] } {
  const results: RuleResult[] = [];
  const imageRefs = collectImages(sections);

  const enabledSections = sections.filter(s => s.enabled);
  const disabledSections = sections.filter(s => !s.enabled);

  // ── 1. Total image count ─────────────────────────────────────────────────
  {
    const count = imageRefs.length;
    const kb = imageRefs.reduce((sum, r) => sum + estimateKB(r.url), 0);
    const kbStr = kb >= 1000 ? `${(kb / 1000).toFixed(1)} MB` : `${Math.round(kb)} KB`;
    if (count > 15) {
      const heaviestSection = (() => {
        const counts: Record<string, number> = {};
        for (const r of imageRefs) counts[r.sectionId] = (counts[r.sectionId] ?? 0) + 1;
        const [id] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? [];
        return sections.find(s => s.id === id);
      })();
      results.push({
        passed: false,
        finding: {
          id: "image-total-count-high",
          category: "Images",
          severity: "error",
          label: "Too many images on one page",
          description: `${count} images totalling an estimated ${kbStr} are loading on this page. Heavy pages take 4–8s to load on mobile — visitors leave after 3s.`,
          current: `${count} images · ~${kbStr} estimated`,
          recommendation: "Use the AI Photo Optimizer to compress images. Aim for under 10 images per page.",
          sectionId: heaviestSection?.id,
          sectionType: heaviestSection?.type,
          fixable: true,
          fixAction: heaviestSection
            ? { kind: "navigate-to-section", sectionId: heaviestSection.id, sectionType: heaviestSection.type }
            : { kind: "open-photo-optimizer" },
          fixButtonLabel: "Open Photo Optimizer",
        },
      });
    } else if (count > 8) {
      results.push({
        passed: false,
        finding: {
          id: "image-total-count-moderate",
          category: "Images",
          severity: "warning",
          label: "Image load weight is above average",
          description: `${count} images totalling ~${kbStr} will load on page open. Compressing them to WebP can reduce this by 50–75%.`,
          current: `${count} images · ~${kbStr} estimated`,
          recommendation: "Use the AI Photo Optimizer to convert images to WebP. Target under 8 images per page.",
          fixable: true,
          fixAction: { kind: "open-photo-optimizer" },
          fixButtonLabel: "Open Photo Optimizer",
        },
      });
    } else {
      results.push({ passed: true });
    }
  }

  // ── 2. Gallery image count ───────────────────────────────────────────────
  {
    const gallery = findEnabled(sections, "gallery");
    if (gallery) {
      type GImg = { url?: string };
      const images = (gallery.content.images as GImg[] | undefined) ?? [];
      const count = images.filter(i => str(i.url)).length;
      if (count > 12) {
        results.push({
          passed: false,
          finding: {
            id: "gallery-image-count-high",
            category: "Images",
            severity: "error",
            label: "Gallery is loading too many images at once",
            description: `Your gallery has ${count} images loading simultaneously. On a mobile connection this can take 10+ seconds and consume significant mobile data.`,
            current: `${count} gallery images`,
            recommendation: "Trim your gallery to your 8–10 best photos. Create a separate Portfolio page if you need to show more.",
            sectionId: gallery.id,
            sectionType: gallery.type,
            fixable: false,
            fixAction: { kind: "navigate-to-section", sectionId: gallery.id, sectionType: gallery.type },
            fixButtonLabel: "Edit Gallery",
          },
        });
      } else if (count > 6) {
        results.push({
          passed: false,
          finding: {
            id: "gallery-image-count-moderate",
            category: "Images",
            severity: "warning",
            label: "Gallery has many images",
            description: `${count} gallery images will all load at once. Keeping galleries to 6 curated photos improves first-impression load speed.`,
            current: `${count} gallery images`,
            recommendation: "Feature your 6 best photos and link to a separate portfolio page for more.",
            sectionId: gallery.id,
            sectionType: gallery.type,
            fixable: false,
            fixAction: { kind: "navigate-to-section", sectionId: gallery.id, sectionType: gallery.type },
            fixButtonLabel: "Edit Gallery",
          },
        });
      } else {
        results.push({ passed: true });
      }
    } else {
      results.push({ passed: true });
    }
  }

  // ── 3. Service cards with images ─────────────────────────────────────────
  {
    const services = findEnabled(sections, "services");
    if (services) {
      type Item = { mediaType?: string; imageUrl?: string };
      const items = (services.content.items as Item[] | undefined) ?? [];
      const imageItems = items.filter(i => i.mediaType === "image" && str(i.imageUrl));
      if (imageItems.length > 4) {
        results.push({
          passed: false,
          finding: {
            id: "service-images-heavy",
            category: "Images",
            severity: "warning",
            label: "Many service cards are using photos",
            description: `${imageItems.length} service cards are loading separate photos. Each photo is a separate network request — icons load instantly and look just as professional.`,
            current: `${imageItems.length} service cards with photos`,
            recommendation: "Switch 2–3 services to icon style to reduce network requests.",
            sectionId: services.id,
            sectionType: services.type,
            fixable: false,
            fixAction: { kind: "navigate-to-section", sectionId: services.id, sectionType: services.type },
            fixButtonLabel: "Edit Services",
          },
        });
      } else {
        results.push({ passed: true });
      }
    } else {
      results.push({ passed: true });
    }
  }

  // ── 4. Unoptimized external images ───────────────────────────────────────
  {
    const externalImages = imageRefs.filter(r => r.isExternal && r.url.startsWith("http"));
    if (externalImages.length > 3) {
      results.push({
        passed: false,
        finding: {
          id: "external-images-unoptimized",
          category: "Images",
          severity: "warning",
          label: `${externalImages.length} images cannot be auto-optimized`,
          description: "Images hosted on external URLs can't be served as WebP or resized for mobile. They load at full resolution on all devices — often 5–10× larger than needed.",
          current: `${externalImages.length} external image URLs`,
          recommendation: "Upload images to your Media Library so they can be compressed and served efficiently.",
          fixable: true,
          fixAction: { kind: "open-photo-optimizer" },
          fixButtonLabel: "Open Media Library",
        },
      });
    } else {
      results.push({ passed: true });
    }
  }

  // ── 5. Portfolio photo count ──────────────────────────────────────────────
  {
    const portfolio = findEnabled(sections, "portfolio");
    if (portfolio) {
      type Project = { photos?: Array<{ url?: string }> };
      const projects = (portfolio.content.projects as Project[] | undefined) ?? [];
      const totalPhotos = projects.reduce((sum, p) => sum + (p.photos?.filter(ph => str(ph.url)).length ?? 0), 0);
      if (totalPhotos > 12) {
        results.push({
          passed: false,
          finding: {
            id: "portfolio-photo-count",
            category: "Loading",
            severity: "warning",
            label: "Portfolio has many photos loading at once",
            description: `${totalPhotos} portfolio photos load simultaneously. Each photo is a separate image request — visitors rarely scroll through more than 8–10.`,
            current: `${totalPhotos} portfolio photos across ${projects.length} project${projects.length !== 1 ? "s" : ""}`,
            recommendation: "Pick your 3–4 best projects and show 3 photos each (12 total). Archive the rest.",
            sectionId: portfolio.id,
            sectionType: portfolio.type,
            fixable: false,
            fixAction: { kind: "navigate-to-section", sectionId: portfolio.id, sectionType: portfolio.type },
            fixButtonLabel: "Edit Portfolio",
          },
        });
      } else {
        results.push({ passed: true });
      }
    } else {
      results.push({ passed: true });
    }
  }

  // ── 6. Hero video background ─────────────────────────────────────────────
  {
    const hero = findEnabled(sections, "hero");
    if (hero) {
      const videoUrl = str(hero.content.videoUrl ?? hero.content.bgVideo);
      if (videoUrl) {
        results.push({
          passed: false,
          finding: {
            id: "hero-video-bg",
            category: "Video",
            severity: "warning",
            label: "Hero has a video background",
            description: "Video backgrounds range from 2–15 MB and auto-play immediately. On a 4G mobile connection that's a 3–8s delay before your hero loads — your first impression is lost.",
            current: "Video background detected on hero section",
            recommendation: "Replace with a high-quality static image (200–400KB) and use animation for movement.",
            sectionId: hero.id,
            sectionType: hero.type,
            fixable: false,
            fixAction: { kind: "navigate-to-section", sectionId: hero.id, sectionType: hero.type },
            fixButtonLabel: "Edit Hero",
          },
        });
      } else {
        results.push({ passed: true });
      }
    } else {
      results.push({ passed: true });
    }
  }

  // ── 7. Map embed ─────────────────────────────────────────────────────────
  {
    const mapEmbed = findEnabled(sections, "map-embed");
    if (mapEmbed) {
      results.push({
        passed: false,
        finding: {
          id: "map-embed-js-weight",
          category: "Video",
          severity: "info",
          label: "Google Maps embed adds JavaScript overhead",
          description: "An embedded Google Map loads ~210KB of JavaScript plus tile images. This delays page interactivity. Visitors on slow connections will see a blank map rectangle.",
          current: "1 Google Maps embed section",
          recommendation: "Consider replacing with a screenshot of the map + a 'Get Directions' link that opens the native Maps app.",
          sectionId: mapEmbed.id,
          sectionType: mapEmbed.type,
          fixable: false,
          fixAction: { kind: "navigate-to-section", sectionId: mapEmbed.id, sectionType: mapEmbed.type },
          fixButtonLabel: "Review Map",
        },
      });
    } else {
      results.push({ passed: true });
    }
  }

  // ── 8. Font family count ──────────────────────────────────────────────────
  {
    const fonts = new Set<string>();
    if (settings.fontFamily)  fonts.add(settings.fontFamily);
    if (settings.headingFont && settings.headingFont !== settings.fontFamily) fonts.add(settings.headingFont);
    if (settings.bodyFont && settings.bodyFont !== settings.fontFamily && settings.bodyFont !== settings.headingFont) fonts.add(settings.bodyFont);
    const fontCount = fonts.size;
    if (fontCount > 2) {
      results.push({
        passed: false,
        finding: {
          id: "font-family-count",
          category: "Fonts",
          severity: "warning",
          label: `${fontCount} font families loading`,
          description: `Each Google Font family downloads 20–60KB and requires a DNS lookup + network round-trip. Your site loads ${fontCount} font families — that's ${fontCount} extra round-trips before text renders.`,
          current: `${Array.from(fonts).join(", ")} (${fontCount} families)`,
          recommendation: "Use one font family for both headings and body text. Pair heading weight variants (700/800) instead of a separate font.",
          fixable: true,
          fixAction: { kind: "open-settings" },
          fixButtonLabel: "Open Theme Settings",
        },
      });
    } else {
      results.push({ passed: true });
    }
  }

  // ── 9. Disabled (hidden) sections ────────────────────────────────────────
  {
    const count = disabledSections.length;
    if (count > 3) {
      results.push({
        passed: false,
        finding: {
          id: "disabled-sections",
          category: "Sections",
          severity: "info",
          label: `${count} disabled sections add configuration overhead`,
          description: `${count} hidden sections are still stored in your site configuration. While not loaded by visitors, deleting unused sections keeps your config small and your editor fast.`,
          current: `${count} disabled sections`,
          recommendation: "Delete sections you'll never use. You can always re-add them from the Section Library.",
          fixable: false,
        },
      });
    } else {
      results.push({ passed: true });
    }
  }

  // ── 10. Total enabled section count ──────────────────────────────────────
  {
    const count = enabledSections.length;
    if (count > 18) {
      results.push({
        passed: false,
        finding: {
          id: "total-sections-very-long",
          category: "Sections",
          severity: "error",
          label: "Page is very long — visitors won't reach the bottom",
          description: `${count} sections make this a very long single page. Studies show visitors scroll through 2–4 sections before leaving. Everything below section 6 is unlikely to be seen.`,
          current: `${count} enabled sections`,
          recommendation: "Split into multiple pages using the Page Manager. Keep your homepage to 6–8 focused sections.",
          fixable: false,
        },
      });
    } else if (count > 14) {
      results.push({
        passed: false,
        finding: {
          id: "total-sections-long",
          category: "Sections",
          severity: "warning",
          label: "Page is getting long",
          description: `${count} sections make for a very long scroll on mobile. Each additional section also adds layout calculation time.`,
          current: `${count} enabled sections`,
          recommendation: "Aim for 8–12 sections on your homepage. Move deeper content to dedicated pages.",
          fixable: false,
        },
      });
    } else {
      results.push({ passed: true });
    }
  }

  // ── 11. Multiple heavy before-after sections ──────────────────────────────
  {
    const beforeAfterSections = enabledSections.filter(s => s.type === "before-after");
    if (beforeAfterSections.length > 1) {
      const totalImages = beforeAfterSections.length * 2;
      results.push({
        passed: false,
        finding: {
          id: "before-after-multiple",
          category: "Loading",
          severity: "info",
          label: `${beforeAfterSections.length} before/after sections load ${totalImages} images`,
          description: "Before/after comparisons are high-impact but each pair loads 2 full images. Multiple sections compound the load time.",
          current: `${beforeAfterSections.length} before/after sections (${totalImages} images total)`,
          recommendation: "Keep 1 before/after section with your most compelling transformation. Gallery sections can show more results efficiently.",
          sectionId: beforeAfterSections[0].id,
          sectionType: beforeAfterSections[0].type,
          fixable: false,
          fixAction: { kind: "navigate-to-section", sectionId: beforeAfterSections[0].id, sectionType: beforeAfterSections[0].type },
          fixButtonLabel: "Review Sections",
        },
      });
    } else {
      results.push({ passed: true });
    }
  }

  return { results, imageRefs };
}

// ── Public API ────────────────────────────────────────────────────────────────

const CATEGORIES: PerfCategory[] = ["Images", "Video", "Fonts", "Sections", "Loading", "Animations"];

function derivePageSpeed(findings: PerfFinding[]): PageSpeedRating {
  const errors   = findings.filter(f => f.severity === "error").length;
  const warnings = findings.filter(f => f.severity === "warning").length;
  if (errors > 0 || warnings >= 4) return "Slow";
  if (warnings >= 1) return "Moderate";
  return "Fast";
}

export function analyzePerformance(
  sections: SectionLike[],
  settings: SettingsLike,
): PerfCheckResult {
  const { results, imageRefs } = evalRules(sections, settings);

  const findings = results.filter(r => !r.passed && r.finding).map(r => r.finding!);
  const passedChecks = results.filter(r => r.passed).length;
  const totalChecks = results.length;

  const estimatedImageCount = imageRefs.length;
  const estimatedImageKB = Math.round(imageRefs.reduce((sum, r) => sum + estimateKB(r.url), 0));

  const byCategory = Object.fromEntries(
    CATEGORIES.map(cat => [cat, findings.filter(f => f.category === cat)]),
  ) as PerfCheckResult["byCategory"];

  const pageSpeed = derivePageSpeed(findings);

  return {
    findings,
    passedChecks,
    totalChecks,
    pageSpeed,
    estimatedImageCount,
    estimatedImageKB,
    byCategory,
  };
}

/** Server-side compatible version (same logic, accepts loose JSON). */
export { analyzePerformance as analyzePerformanceJSON };
