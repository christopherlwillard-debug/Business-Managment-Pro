import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, X, Menu } from "lucide-react";
import { useParams, Link } from "wouter";
import { buildThemeCssVarBlock } from "./themes";
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
import type { BlockStyle } from "./sections/BlockStyleWrapper";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Section {
  id: string;
  type: "header" | "hero" | "services" | "about" | "contact" | "footer" | "portfolio" | "deposit" | "columns" | "testimonials" | "faq" | "cta" | "stats" | "content" | "row" | "text" | "gallery";
  enabled: boolean;
  order: number;
  content: Record<string, unknown>;
  blockStyle?: BlockStyle;
}

interface SitePage {
  id: string;
  name: string;
  slug: string;
  sections: Section[];
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
}

interface PublishedConfig {
  sections: Section[];
  settings: SiteSettings;
  businessName: string;
  businessSlug: string;
}

function renderBodySection(
  section: Section,
  settings: SiteSettings,
  resolvedSlug: string,
  handleContactSubmit: (d: Record<string, unknown>) => Promise<void>
) {
  const props = { content: section.content as any, settings, isEditing: false, blockStyle: section.blockStyle };
  switch (section.type) {
    case "hero":        return <HeroSection key={section.id} {...props} />;
    case "services":    return <ServicesSection key={section.id} {...props} />;
    case "about":       return <AboutSection key={section.id} {...props} />;
    case "contact":     return <ContactFormSection key={section.id} {...props} onSubmit={handleContactSubmit} />;
    case "footer":      return <FooterSection key={section.id} {...props} />;
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
    case "gallery":     return <ImageGallerySection key={section.id} {...props} />;
    default:            return null;
  }
}

export default function PublicSite() {
  const params = useParams<{ slug?: string; page?: string }>();
  const slug = params.slug;
  const pageSlug = params.page;
  const [paymentSuccessDismissed, setPaymentSuccessDismissed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const paymentSuccess = new URLSearchParams(window.location.search).get("payment") === "success";
  const isDraftPreview = new URLSearchParams(window.location.search).get("draft") === "1";

  const { data, isLoading, isError } = useQuery<PublishedConfig>({
    queryKey: ["public-site", slug ?? `__host__${window.location.host}`, isDraftPreview],
    queryFn: async () => {
      if (isDraftPreview && slug) {
        const res = await fetch(`${BASE}/api/website/preview-by-slug/${slug}`, { credentials: "include" });
        if (!res.ok) throw new Error("Not found");
        return res.json();
      }
      if (slug) {
        const res = await fetch(`${BASE}/api/public/site/${slug}`);
        if (!res.ok) throw new Error("Not found");
        return res.json();
      }
      const res = await fetch(`${BASE}/api/public/site/by-host`);
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
          <div className="text-6xl mb-6">🚧</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Coming Soon</h1>
          <p className="text-gray-500">This website is being set up. Check back soon.</p>
        </div>
      </div>
    );
  }

  const { sections, settings, businessName } = data;
  const sorted = [...sections].sort((a, b) => a.order - b.order).filter(s => s.enabled);

  const headerSec = sorted.find(s => s.type === "header");
  const homeBodySections = sorted.filter(s => s.type !== "header");

  const additionalPages: SitePage[] = settings.pages ?? [];

  let bodySections: Section[];
  if (pageSlug) {
    const targetPage = additionalPages.find(p => p.slug === pageSlug);
    bodySections = targetPage
      ? targetPage.sections.filter(s => s.enabled)
      : homeBodySections;
  } else {
    bodySections = homeBodySections;
  }

  const headerContent = headerSec?.content as any;
  const navLinks: Array<{ id: string; label: string; href: string }> = headerContent?.navLinks ?? [];
  const headerPhone: string = headerContent?.phone ?? "";
  const ctaLabel: string = headerContent?.ctaLabel ?? "Get a Quote";
  const ctaUrl: string = headerContent?.ctaConfig?.url ?? "#contact";
  const isSticky: boolean = headerContent?.sticky ?? true;

  const GOOGLE_FONT_SET = new Set(["Oswald","Montserrat","Playfair Display","Raleway","Roboto Slab","Lato","Open Sans","Merriweather","Source Sans 3","Nunito"]);
  const googleFontFamilies = [settings.headingFont, settings.bodyFont]
    .filter((f): f is string => !!f && GOOGLE_FONT_SET.has(f))
    .filter((v, i, a) => a.indexOf(v) === i);
  const googleFontsHref = googleFontFamilies.length > 0
    ? `https://fonts.googleapis.com/css2?${googleFontFamilies.map(f => `family=${encodeURIComponent(f)}:wght@400;500;600;700`).join("&")}&display=swap`
    : null;

  const headerStyle = settings.headerStyle ?? "light";
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
    : undefined;

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
        className={`${isSticky ? "sticky" : ""} top-0 z-50 ${headerStyle === "transparent" ? "bg-white/10 backdrop-blur-md" : ""} border-b ${headerBorder} px-6 py-3 flex items-center justify-between ${headerShadow}`}
        style={{
          backgroundColor: headerStyle !== "transparent" ? `var(--theme-header-bg, ${headerStyle === "dark" ? "rgba(17,24,39,0.95)" : "rgba(255,255,255,0.95)"})` : undefined,
          color: `var(--theme-header-text, ${isDarkHeader ? "#ffffff" : "#111111"})`,
        }}
      >
        <div className="flex items-center gap-3 flex-shrink-0">
          {settings.logoUrl && (
            <img src={settings.logoUrl} alt={businessName} className="h-8 w-auto object-contain" />
          )}
          <span
            className="font-bold text-sm md:text-base"
            style={{ color: `var(--theme-header-text, ${isDarkHeader ? "#ffffff" : "#111111"})` }}
          >{businessName}</span>
        </div>

        {navLinks.length > 0 && (
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
          {headerPhone && (
            <a
              href={`tel:${headerPhone.replace(/\D/g, "")}`}
              className="hidden md:block text-sm font-medium hover:opacity-80 transition-opacity"
              style={{ color: `var(--theme-header-link, ${isDarkHeader ? "rgba(255,255,255,0.7)" : "#4b5563"})` }}
            >
              {headerPhone}
            </a>
          )}
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
          {navLinks.length > 0 && (
            <button
              className="md:hidden p-1"
              style={{ color: `var(--theme-header-text, ${isDarkHeader ? "#ffffff" : "#111111"})` }}
              onClick={() => setMobileMenuOpen(v => !v)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}
        </div>
      </header>

      {/* Mobile nav drawer */}
      {mobileMenuOpen && navLinks.length > 0 && (
        <div
          className={`md:hidden border-b ${mobileBorder} px-6 py-4 space-y-3 shadow-md`}
          style={{ backgroundColor: `var(--theme-header-bg, ${isDarkHeader ? "#111827" : "#ffffff"})` }}
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
        </div>
      )}

      {bodySections.map(section =>
        renderBodySection(section, settings, resolvedSlug, handleContactSubmit)
      )}
    </div>
  );
}
