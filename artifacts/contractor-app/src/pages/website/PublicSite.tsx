import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, X, Menu } from "lucide-react";
import { useParams, Link } from "wouter";
import { buildThemeCssVarBlock } from "./themes";
import { getPublicSiteQueryKey } from "./storageUtils";
import { resolveLogoHeightPx } from "./sections/HeaderSection";
import { HeroSection } from "./sections/HeroSection";
import { ServicesSection } from "./sections/ServicesSection";
import { AboutSection } from "./sections/AboutSection";
import { ContactFormSection } from "./sections/ContactFormSection";
import { FooterSection } from "./sections/FooterSection";
import { PortfolioSection } from "./sections/PortfolioSection";
import { DepositSection } from "./sections/DepositSection";
import { ColumnsSection } from "./sections/ColumnsSection";
import { TestimonialsSection } from "./sections/TestimonialsSection";
import { FAQSection } from "./sections/FAQSection";
import { CTASection } from "./sections/CTASection";
import { StatsSection } from "./sections/StatsSection";
import { ContentSection } from "./sections/ContentSection";
import { RowSection } from "./sections/RowSection";
import { TextSection } from "./sections/TextSection";
import { ImageGallerySection } from "./sections/ImageGallerySection";
import { FeaturedClientsSection } from "./sections/FeaturedClientsSection";
import { PartnersSection } from "./sections/PartnersSection";
import { ServiceAreaSection } from "./sections/ServiceAreaSection";
import { CertificationsSection } from "./sections/CertificationsSection";
import { BeforeAfterSection } from "./sections/BeforeAfterSection";
import { WhyChooseUsSection } from "./sections/WhyChooseUsSection";
import { MeetOwnerSection } from "./sections/MeetOwnerSection";
import { ProcessSection } from "./sections/ProcessSection";
import { DividerSection } from "./sections/DividerSection";
import { SpacerSection } from "./sections/SpacerSection";
import { AlertBarSection } from "./sections/AlertBarSection";
import { BusinessHoursSection } from "./sections/BusinessHoursSection";
import { TrustCounterSection } from "./sections/TrustCounterSection";
import { StickyCTASection } from "./sections/StickyCTASection";
import { MapEmbedSection } from "./sections/MapEmbedSection";
import { QuoteFormSection } from "./sections/QuoteFormSection";
import type { BlockStyle } from "./sections/BlockStyleWrapper";

import { isPublishedWebsite } from "@/lib/runtimeMode";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Sanitize a JSON string for safe injection into a <script type="application/ld+json"> block.
 *
 * Browsers stop parsing JSON and switch to HTML parsing the moment they see </script>
 * inside a <script> element, regardless of nesting. Escaping `</` → `<\/` prevents
 * tag breakout while keeping the JSON semantically identical (\/  is a valid JSON
 * escape for /). We also escape `<!--` to prevent HTML comment injection.
 *
 * This is defense-in-depth on top of server-side sanitization.
 */
function safeJsonLd(json: string): string {
  return json
    .replace(/</g, "\\u003c")   // covers </script>, <script, <!--, and any other <
    .replace(/>/g, "\\u003e")   // covers </script> closing >
    .replace(/&/g, "\\u0026");  // covers HTML entity injection
}

interface SectionBreakpoints {
  tablet?: Partial<BlockStyle>;
  mobile?: Partial<BlockStyle>;
}

interface Section {
  id: string;
  type: "header" | "hero" | "services" | "about" | "contact" | "footer" | "portfolio" | "deposit" | "columns" | "testimonials" | "faq" | "cta" | "stats" | "content" | "row" | "text" | "gallery" | "image" | "featured-clients" | "partners" | "service-area" | "certifications" | "before-after" | "why-choose-us" | "legal" | "meet-owner" | "process" | "divider" | "spacer" | "alert-bar" | "business-hours" | "trust-counter" | "sticky-cta" | "map-embed" | "quote-form";
  enabled: boolean;
  order: number;
  content: Record<string, unknown>;
  blockStyle?: BlockStyle;
  breakpoints?: SectionBreakpoints;
}

interface SitePage {
  id: string;
  name: string;
  slug: string;
  sections: Section[];
}

// ── SEO types (mirrors website-types.ts — keep in sync) ─────────────────────

interface PageSeo {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

interface SeoSettings {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  pagesSeo?: Record<string, PageSeo>;
  localBusinessSchema?: string;
  generated?: boolean;
  generatedAt?: string;
}

interface SiteSettings {
  brandColor: string;
  secondaryColor?: string;
  accentColor?: string;
  bgColor?: string;
  surfaceColor?: string;
  textColor?: string;
  textMutedColor?: string;
  fontFamily: string;
  headingFont?: string;
  bodyFont?: string;
  buttonRadius?: string;
  buttonFontWeight?: string;
  buttonShadow?: boolean;
  cardRadius?: string;
  cardShadow?: string;
  cardBorder?: boolean;
  inputRadius?: string;
  headingSizeScale?: "compact" | "regular" | "large" | "xl";
  baseFontSize?: "sm" | "base" | "lg";
  headerBgColor?: string;
  headerTextColor?: string;
  headerLinkColor?: string;
  footerTextColor?: string;
  footerLinkColor?: string;
  focusRingColor?: string;
  logoUrl: string;
  faviconUrl?: string;
  headerStyle?: "light" | "dark" | "transparent";
  footerBgColor?: string;
  pages?: SitePage[];
  themeId?: string;
  seo?: SeoSettings;
}

interface PublishedConfig {
  sections: Section[];
  settings: SiteSettings;
  businessName: string;
  businessSlug: string;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

function renderBodySection(
  section: Section,
  settings: SiteSettings,
  resolvedSlug: string,
  handleContactSubmit: (d: Record<string, unknown>) => Promise<void>,
  businessName?: string,
  effectiveBlockStyle?: BlockStyle,
) {
  const props = { content: section.content as any, settings, isEditing: false, blockStyle: effectiveBlockStyle ?? section.blockStyle };
  switch (section.type) {
    case "hero":        return <HeroSection key={section.id} {...props} />;
    case "services":    return <ServicesSection key={section.id} {...props} />;
    case "about":       return <AboutSection key={section.id} {...props} />;
    case "contact":     return <ContactFormSection key={section.id} {...props} onSubmit={handleContactSubmit} />;
    case "footer":      return <FooterSection key={section.id} {...props} businessName={businessName} />;
    case "portfolio":   return <PortfolioSection key={section.id} {...props} />;
    case "deposit":     return <DepositSection key={section.id} {...props} businessSlug={resolvedSlug} />;
    case "columns":     return <ColumnsSection key={section.id} {...props} />;
    case "testimonials": return <TestimonialsSection key={section.id} {...props} />;
    case "faq":         return <FAQSection key={section.id} {...props} />;
    case "cta":         return <CTASection key={section.id} {...props} />;
    case "stats":       return <StatsSection key={section.id} {...props} />;
    case "content":     return <ContentSection key={section.id} {...props} />;
    case "row":         return <RowSection key={section.id} {...props} />;
    case "text":        return <TextSection key={section.id} {...props} />;
    case "gallery":          return <ImageGallerySection key={section.id} {...props} />;
    case "featured-clients": return <FeaturedClientsSection key={section.id} {...props} />;
    case "partners":         return <PartnersSection key={section.id} {...props} />;
    case "service-area":     return <ServiceAreaSection key={section.id} {...props} />;
    case "certifications":   return <CertificationsSection key={section.id} {...props} />;
    case "before-after":     return <BeforeAfterSection key={section.id} {...props} />;
    case "why-choose-us":    return <WhyChooseUsSection key={section.id} {...props} />;
    case "meet-owner":       return <MeetOwnerSection key={section.id} {...props} />;
    case "process":          return <ProcessSection key={section.id} {...props} />;
    case "legal":            return <TextSection key={section.id} {...props} />;
    case "divider":          return <DividerSection key={section.id} {...props} />;
    case "spacer":           return <SpacerSection key={section.id} {...props} />;
    case "alert-bar":        return <AlertBarSection key={section.id} {...props} sectionId={section.id} />;
    case "business-hours":   return <BusinessHoursSection key={section.id} {...props} sectionId={section.id} />;
    case "trust-counter":    return <TrustCounterSection key={section.id} {...props} sectionId={section.id} />;
    case "sticky-cta":       return <StickyCTASection key={section.id} {...props} sectionId={section.id} />;
    case "map-embed":        return <MapEmbedSection key={section.id} {...props} sectionId={section.id} />;
    case "quote-form":       return <QuoteFormSection key={section.id} {...props} siteSlug={resolvedSlug} />;
    default:                 return null;
  }
}

export default function PublicSite() {
  const params = useParams<{ slug?: string; page?: string }>();
  const slug = params.slug;
  const pageSlug = params.page;
  const [paymentSuccessDismissed, setPaymentSuccessDismissed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const hadOpenMobileMenuRef = useRef(false);
  const paymentSuccess = new URLSearchParams(window.location.search).get("payment") === "success";
  const isDraftPreview = new URLSearchParams(window.location.search).get("draft") === "1";

  const { data, isLoading, isError } = useQuery<PublishedConfig>({
    queryKey: getPublicSiteQueryKey(slug, pageSlug, isDraftPreview, window.location.host),
    queryFn: async () => {
      if (isDraftPreview && slug) {
        const query = pageSlug ? `?page=${encodeURIComponent(pageSlug)}` : "";
        const res = await fetch(`${BASE}/api/website/preview-by-slug/${slug}${query}`, { credentials: "include" });
        if (!res.ok) throw new Error("Not found");
        return res.json();
      }
      if (slug) {
        const query = pageSlug ? `?page=${encodeURIComponent(pageSlug)}` : "";
        const res = await fetch(`${BASE}/api/public/site/${slug}${query}`);
        if (!res.ok) throw new Error("Not found");
        return res.json();
      }
      const query = pageSlug ? `?page=${encodeURIComponent(pageSlug)}` : "";
      const res = await fetch(`${BASE}/api/public/site/by-host${query}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    retry: false,
  });

  const resolvedSlug = data?.businessSlug ?? slug ?? "";

  const trackedRef = useRef(false);
  useEffect(() => {
    const s = data?.businessSlug;
    if (!s || trackedRef.current || isDraftPreview) return;
    trackedRef.current = true;
    fetch(`${BASE}/api/public/site/${s}/view`, { method: "POST", keepalive: true }).catch(() => {});
  }, [data?.businessSlug, isDraftPreview]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const firstLink = mobileMenuRef.current?.querySelector<HTMLElement>("a");
    firstLink?.focus();
    function handleMenuKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleMenuKeyDown);
    return () => window.removeEventListener("keydown", handleMenuKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (mobileMenuOpen) {
      hadOpenMobileMenuRef.current = true;
    } else if (hadOpenMobileMenuRef.current) {
      mobileMenuButtonRef.current?.focus();
      hadOpenMobileMenuRef.current = false;
    }
  }, [mobileMenuOpen]);

  async function handleContactSubmit(formData: Record<string, unknown>) {
    const fieldValues = (formData.fieldValues ?? {}) as Record<string, string>;
    const labeledFields = (formData.labeledValues ?? {}) as Record<string, string>;
    const res = await fetch(`${BASE}/api/public/site/${resolvedSlug}/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fieldValues,
        labeledFields,
        name: fieldValues.name,
        phone: fieldValues.phone,
        email: fieldValues.email,
        serviceType: fieldValues.serviceType,
        message: fieldValues.message,
      }),
    });
    if (!res.ok) throw new Error("Submission failed");
  }

  // Hooks must be called unconditionally before any early returns
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");

  function getEffectiveBlockStyle(section: Section): BlockStyle | undefined {
    const bp = section.breakpoints;
    if (isMobile && bp?.mobile) return { ...(section.blockStyle ?? {}), ...bp.mobile };
    if (isTablet && bp?.tablet) return { ...(section.blockStyle ?? {}), ...bp.tablet };
    return section.blockStyle;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">{pageSlug ? "🔎" : "🚧"}</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{pageSlug ? "Page not found" : "Coming Soon"}</h1>
          <p className="text-gray-500">
            {pageSlug ? "The page you requested doesn’t exist on this website." : "This website is being set up. Check back soon."}
          </p>
        </div>
      </div>
    );
  }

  const { sections, settings, businessName } = data;
  // Public sites can outlive older or partially migrated configs. Keep malformed
  // JSON from crashing the entire published page while the owner repairs it.
  const safeSections = Array.isArray(sections)
    ? sections.filter((section): section is Section => !!section && typeof section === "object" && typeof section.type === "string" && !!section.content && typeof section.content === "object" && !Array.isArray(section.content))
    : [];
  const sorted = [...safeSections].sort((a, b) => a.order - b.order).filter(s => s.enabled);

  const headerSec = sorted.find(s => s.type === "header");
  const homeBodySections = sorted.filter(s => s.type !== "header");

  const additionalPages: SitePage[] = Array.isArray(settings?.pages)
    ? settings.pages.filter((page): page is SitePage => !!page && typeof page === "object" && typeof page.slug === "string")
    : [];

  let bodySections: Section[];
  if (pageSlug) {
    const targetPage = additionalPages.find(p => p.slug === pageSlug);
    bodySections = targetPage && Array.isArray(targetPage.sections)
      ? targetPage.sections.filter(s => !!s && s.enabled && typeof s.type === "string" && !!s.content && typeof s.content === "object" && !Array.isArray(s.content))
      : [];
  } else {
    bodySections = homeBodySections;
  }

  const headerContent = headerSec?.content as any;
  const navLinks: Array<{ id: string; label: string; href: string }> = headerContent?.navLinks ?? [];
  const headerPhone: string = headerContent?.phone ?? "";
  const headerEmail: string = headerContent?.email ?? "";
  const ctaLabel: string = headerContent?.ctaLabel ?? "Get a Quote";
  const ctaUrl: string = headerContent?.ctaConfig?.url ?? "#contact";
  const isSticky: boolean = headerContent?.sticky ?? true;
  const showPhone: boolean = headerContent?.showPhone !== false;
  const showCta: boolean = headerContent?.showCta !== false;
  const showLogo: boolean = headerContent?.showLogo !== false;
  const showBusinessName: boolean = headerContent?.showBusinessName !== false;
  const showNav: boolean = headerContent?.showNav !== false;
  const showEmail: boolean = headerContent?.showEmail === true && !!headerEmail;
  const showVeteranBadge: boolean = headerContent?.showVeteranBadge === true;
  const showSdvosbBadge: boolean = headerContent?.showSdvosbBadge === true;
  const logoAlignment: "left" | "center" | "right" = headerContent?.logoAlignment ?? "left";
  const logoHeightPx: number = resolveLogoHeightPx(headerContent?.logoSize);

  const GOOGLE_FONT_SET = new Set(["Oswald","Montserrat","Playfair Display","Raleway","Roboto Slab","Lato","Open Sans","Merriweather","Source Sans 3","Nunito"]);
  const googleFontFamilies = [settings.headingFont, settings.bodyFont]
    .filter((f): f is string => !!f && GOOGLE_FONT_SET.has(f))
    .filter((v, i, a) => a.indexOf(v) === i);
  const googleFontsHref = googleFontFamilies.length > 0
    ? `https://fonts.googleapis.com/css2?${googleFontFamilies.map(f => `family=${encodeURIComponent(f)}:wght@400;500;600;700`).join("&")}&display=swap`
    : null;

  // content.headerStyle (set via the header toolbar's Style tab) overrides the site-level setting
  const headerStyle = (headerContent?.headerStyle as "light" | "dark" | "transparent" | undefined) ?? settings.headerStyle ?? "light";
  const isDarkHeader = headerStyle === "dark" || headerStyle === "transparent";
  const headerBg =
    headerStyle === "dark" ? "bg-gray-900/95 backdrop-blur" :
    headerStyle === "transparent" ? "bg-white/10 backdrop-blur-md" :
    "bg-white/95 backdrop-blur";
  const headerBorder =
    headerStyle === "dark" ? "border-gray-700" :
    headerStyle === "transparent" ? "border-white/10" :
    "border-gray-100";
  const headerText = isDarkHeader ? "text-white" : "text-gray-900";
  const headerSubText = isDarkHeader ? "text-white/70" : "text-gray-600";
  const headerShadow = headerStyle === "transparent" ? "" : "shadow-sm";
  const mobileBg =
    headerStyle === "dark" ? "bg-gray-900" :
    headerStyle === "transparent" ? "bg-gray-900" :
    "bg-white";
  const mobileText = (headerStyle === "dark" || headerStyle === "transparent") ? "text-white" : "text-gray-900";
  const mobileSubText = (headerStyle === "dark" || headerStyle === "transparent") ? "text-white/70" : "text-gray-600";
  const mobileBorder = (headerStyle === "dark" || headerStyle === "transparent") ? "border-gray-700" : "border-gray-100";

  const siteBodyStyle: React.CSSProperties = settings.bodyFont
    ? { fontFamily: `'${settings.bodyFont}', system-ui, sans-serif` }
    : {};

  // ── SEO: compute effective meta for this page ────────────────────────────────
  const seo: SeoSettings | undefined = settings.seo;
  const currentPageId = pageSlug
    ? additionalPages.find(p => p.slug === pageSlug)?.id
    : null;
  const pageSeo: PageSeo = currentPageId ? (seo?.pagesSeo?.[currentPageId] ?? {}) : {};
  const effectiveMetaTitle       = pageSeo.metaTitle       ?? seo?.metaTitle       ?? businessName;
  const effectiveMetaDescription = pageSeo.metaDescription ?? seo?.metaDescription ?? "";
  const effectiveKeywords        = pageSeo.keywords        ?? seo?.keywords        ?? "";
  const effectiveOgTitle         = pageSeo.ogTitle         ?? seo?.ogTitle         ?? effectiveMetaTitle;
  const effectiveOgDescription   = pageSeo.ogDescription   ?? seo?.ogDescription   ?? effectiveMetaDescription;
  const effectiveOgImage         = pageSeo.ogImage         ?? seo?.ogImage         ?? "";
  const canonicalUrl = (() => {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return url.toString();
  })();

  // ── FAQ JSON-LD: build if any FAQ sections are rendered on this page ─────────
  const faqItems = bodySections
    .filter(s => s.type === "faq" && s.enabled)
    .flatMap(s => (s.content.items as Array<{ question?: string; answer?: string }> | undefined) ?? [])
    .filter(i => i.question && i.answer);
  const faqJsonLd = faqItems.length > 0
    ? JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqItems.map(i => ({
          "@type": "Question",
          name: i.question,
          acceptedAnswer: { "@type": "Answer", text: i.answer },
        })),
      })
    : null;

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: settings.themeId ? "var(--theme-bg, #ffffff)" : "#ffffff",
        color: settings.themeId ? "var(--theme-text, inherit)" : undefined,
        ...siteBodyStyle,
      }}
    >
      {createPortal(
        <>
          {googleFontsHref && <link rel="stylesheet" href={googleFontsHref} />}
          {settings.headingFont && (
            <style>{`h1,h2,h3,h4,h5,h6{font-family:'${settings.headingFont}',system-ui,sans-serif}`}</style>
          )}
          <style>{buildThemeCssVarBlock(settings.themeId, {
            brandColor: settings.brandColor,
            secondaryColor: settings.secondaryColor,
            accentColor: settings.accentColor,
            bgColor: settings.bgColor,
            surfaceColor: settings.surfaceColor,
            textColor: settings.textColor,
            textMutedColor: settings.textMutedColor,
            headingFont: settings.headingFont,
            bodyFont: settings.bodyFont,
            buttonRadius: settings.buttonRadius,
            buttonFontWeight: settings.buttonFontWeight,
            buttonShadow: settings.buttonShadow,
            cardRadius: settings.cardRadius,
            cardShadow: settings.cardShadow,
            cardBorder: settings.cardBorder,
            inputRadius: settings.inputRadius,
            headingSizeScale: settings.headingSizeScale,
            baseFontSize: settings.baseFontSize,
            headerBgColor: settings.headerBgColor,
            headerTextColor: settings.headerTextColor,
            headerLinkColor: settings.headerLinkColor,
            footerTextColor: settings.footerTextColor,
            footerLinkColor: settings.footerLinkColor,
            focusRingColor: settings.focusRingColor,
          })}</style>
          {settings.faviconUrl && <link rel="icon" href={settings.faviconUrl} />}
          {/*
            Inject a per-business web manifest so the browser's install prompt
            (if shown) reflects this business, not BuildPro.
            Only injected on real published-website sessions — not draft previews,
            and not when viewing /site/:slug inside the BuildPro shell.
          */}
          {!isDraftPreview && isPublishedWebsite() && (
            <link
              rel="manifest"
              href={
                slug
                  ? `${BASE}/api/public/site/${resolvedSlug}/manifest.json`
                  : `${BASE}/api/public/site/by-host/manifest.json`
              }
            />
          )}
          {/* ── SEO meta tags ──────────────────────────────────────────────── */}
          {effectiveMetaTitle       && <title>{effectiveMetaTitle}</title>}
          {effectiveMetaDescription && <meta name="description" content={effectiveMetaDescription} />}
          {effectiveKeywords        && <meta name="keywords" content={effectiveKeywords} />}
          {!isDraftPreview && <link rel="canonical" href={canonicalUrl} />}
          {/* OpenGraph */}
          <meta property="og:type" content="website" />
          {!isDraftPreview && <meta property="og:url" content={canonicalUrl} />}
          {effectiveOgTitle       && <meta property="og:title"       content={effectiveOgTitle} />}
          {effectiveOgDescription && <meta property="og:description" content={effectiveOgDescription} />}
          {effectiveOgImage       && <meta property="og:image"       content={effectiveOgImage} />}
          {/* Twitter card */}
          <meta name="twitter:card" content="summary_large_image" />
          {effectiveOgTitle       && <meta name="twitter:title"       content={effectiveOgTitle} />}
          {effectiveOgDescription && <meta name="twitter:description" content={effectiveOgDescription} />}
          {effectiveOgImage       && <meta name="twitter:image"       content={effectiveOgImage} />}
          {/* Local Business JSON-LD — sanitized to prevent </script> tag breakout */}
          {seo?.localBusinessSchema && (
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(seo.localBusinessSchema) }} />
          )}
          {/* FAQ JSON-LD — sanitized to prevent </script> tag breakout */}
          {faqJsonLd && (
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }} />
          )}
        </>,
        document.head
      )}
      {paymentSuccess && !paymentSuccessDismissed && (
        <div className="fixed top-0 inset-x-0 z-[60] flex items-center justify-between gap-3 bg-green-600 text-white px-4 py-3 text-sm font-medium shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            Your deposit payment was received — thank you! We'll be in touch soon.
          </div>
          <button
            onClick={() => setPaymentSuccessDismissed(true)}
            className="flex-shrink-0 hover:opacity-80 transition-opacity"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dynamic site header */}
      <header
        className={`${isSticky ? "sticky" : ""} top-0 z-50 relative ${headerStyle === "transparent" ? "bg-white/10 backdrop-blur-md" : ""} border-b ${headerBorder} px-6 py-3 flex items-center justify-between ${headerShadow}`}
        style={{
          backgroundColor: headerStyle !== "transparent" ? `var(--theme-header-bg, ${headerStyle === "dark" ? "rgba(17,24,39,0.95)" : "rgba(255,255,255,0.95)"})` : undefined,
          color: `var(--theme-header-text, ${isDarkHeader ? "#ffffff" : "#111111"})`,
        }}
      >
        {/* Logo + business name group — position controlled by logoAlignment */}
        <div
          className="flex items-center gap-3 flex-shrink-0"
          style={
            logoAlignment === "center"
              ? { position: "absolute", left: "50%", transform: "translateX(-50%)" }
              : logoAlignment === "right"
              ? { order: 3 }
              : {}
          }
        >
          {showLogo && settings.logoUrl && (
            <img
              src={settings.logoUrl}
              alt={businessName}
              style={{ height: logoHeightPx, width: "auto", objectFit: "contain" }}
            />
          )}
          {showBusinessName && (
            <span
              className="font-bold text-sm md:text-base"
              style={{ color: `var(--theme-header-text, ${isDarkHeader ? "#ffffff" : "#111111"})` }}
            >{businessName}</span>
          )}
          {showVeteranBadge && (
            <span
              className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded border"
              style={{
                borderColor: isDarkHeader ? "rgba(255,255,255,0.5)" : "#6b7280",
                color: isDarkHeader ? "rgba(255,255,255,0.7)" : "#6b7280",
              }}
            >
              Veteran-Owned
            </span>
          )}
          {showSdvosbBadge && (
            <span
              className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded border"
              style={{
                borderColor: isDarkHeader ? "rgba(255,255,255,0.5)" : "#6b7280",
                color: isDarkHeader ? "rgba(255,255,255,0.7)" : "#6b7280",
              }}
            >
              SDVOSB
            </span>
          )}
        </div>

        {showNav && navLinks.length > 0 && (
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map(link => (
              link.href.startsWith("/") ? (
                <Link
                  key={link.id}
                  href={link.href}
                  className="text-sm font-medium transition-opacity hover:opacity-70"
                  style={{ color: `var(--theme-header-link, ${isDarkHeader ? "rgba(255,255,255,0.7)" : "#4b5563"})` }}
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.id}
                  href={link.href}
                  className="text-sm font-medium transition-opacity hover:opacity-70"
                  style={{ color: `var(--theme-header-link, ${isDarkHeader ? "rgba(255,255,255,0.7)" : "#4b5563"})` }}
                >
                  {link.label}
                </a>
              )
            ))}
          </nav>
        )}

        <div className="flex items-center gap-3 flex-shrink-0">
          {showEmail && (
            <a
              href={`mailto:${headerEmail}`}
              className="hidden md:block text-sm font-medium hover:opacity-80 transition-opacity"
              style={{ color: `var(--theme-header-link, ${isDarkHeader ? "rgba(255,255,255,0.7)" : "#4b5563"})` }}
            >
              {headerEmail}
            </a>
          )}
          {showPhone && headerPhone && (
            <a
              href={`tel:${headerPhone.replace(/\D/g, "")}`}
              className="hidden md:block text-sm font-medium hover:opacity-80 transition-opacity"
              style={{ color: `var(--theme-header-link, ${isDarkHeader ? "rgba(255,255,255,0.7)" : "#4b5563"})` }}
            >
              {headerPhone}
            </a>
          )}
          {showCta && (
            <a
              href={ctaUrl}
              className="px-4 py-2 text-sm text-white transition-opacity hover:opacity-90"
              style={{
                backgroundColor: settings.brandColor,
                borderRadius: "var(--theme-btn-radius, 9999px)",
                fontWeight: "var(--theme-btn-font-weight, 600)" as React.CSSProperties["fontWeight"],
                boxShadow: "var(--theme-btn-shadow, none)",
              }}
            >
              {ctaLabel}
            </a>
          )}
          {showNav && navLinks.length > 0 && (
            <button
              ref={mobileMenuButtonRef}
              type="button"
              className="md:hidden p-1"
              style={{ color: `var(--theme-header-text, ${isDarkHeader ? "#ffffff" : "#111111"})` }}
              onClick={() => setMobileMenuOpen(v => !v)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="public-mobile-navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}
        </div>
      </header>

      {/* Mobile nav drawer */}
      {showNav && mobileMenuOpen && navLinks.length > 0 && (
        <nav
          ref={mobileMenuRef}
          id="public-mobile-navigation"
          className={`md:hidden border-b ${mobileBorder} px-6 py-4 space-y-3 shadow-md`}
          style={{ backgroundColor: `var(--theme-header-bg, ${isDarkHeader ? "#111827" : "#ffffff"})` }}
          aria-label="Mobile navigation"
        >
          {navLinks.map(link => (
            link.href.startsWith("/") ? (
              <Link
                key={link.id}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block text-sm font-medium py-1 hover:opacity-70 transition-opacity"
                style={{ color: `var(--theme-header-text, ${isDarkHeader ? "#ffffff" : "#111111"})` }}
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.id}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block text-sm font-medium py-1 hover:opacity-70 transition-opacity"
                style={{ color: `var(--theme-header-text, ${isDarkHeader ? "#ffffff" : "#111111"})` }}
              >
                {link.label}
              </a>
            )
          ))}
          {headerPhone && (
            <a
              href={`tel:${headerPhone.replace(/\D/g, "")}`}
              className="block text-sm font-medium py-1"
              style={{ color: `var(--theme-header-link, ${isDarkHeader ? "rgba(255,255,255,0.7)" : "#4b5563"})` }}
            >
              {headerPhone}
            </a>
          )}
        </nav>
      )}

      {bodySections.map(section =>
        renderBodySection(section, settings, resolvedSlug, handleContactSubmit, businessName, getEffectiveBlockStyle(section))
      )}
    </div>
  );
}
