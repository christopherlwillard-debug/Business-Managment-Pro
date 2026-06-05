import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, X, Menu } from "lucide-react";
import { useParams } from "wouter";
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
import type { BlockStyle } from "./sections/BlockStyleWrapper";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Section {
  id: string;
  type: "header" | "hero" | "services" | "about" | "contact" | "footer" | "portfolio" | "deposit" | "columns" | "testimonials" | "faq" | "cta" | "stats";
  enabled: boolean;
  order: number;
  content: Record<string, unknown>;
  blockStyle?: BlockStyle;
}

interface SiteSettings {
  brandColor: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily: string;
  headingFont?: string;
  bodyFont?: string;
  logoUrl: string;
  faviconUrl?: string;
  headerStyle?: "light" | "dark" | "transparent";
  footerBgColor?: string;
}

interface PublishedConfig {
  sections: Section[];
  settings: SiteSettings;
  businessName: string;
  businessSlug: string;
}

export default function PublicSite() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [paymentSuccessDismissed, setPaymentSuccessDismissed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const paymentSuccess = new URLSearchParams(window.location.search).get("payment") === "success";

  const { data, isLoading, isError } = useQuery<PublishedConfig>({
    queryKey: ["public-site", slug ?? `__host__${window.location.host}`],
    queryFn: async () => {
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
    if (!s || trackedRef.current) return;
    trackedRef.current = true;
    fetch(`${BASE}/api/public/site/${s}/view`, { method: "POST", keepalive: true }).catch(() => {});
  }, [data?.businessSlug]);

  async function handleContactSubmit(data: Record<string, unknown>) {
    const fieldValues = (data.fieldValues ?? {}) as Record<string, string>;
    const labeledFields = (data.labeledValues ?? {}) as Record<string, string>;
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
  const bodySections = sorted.filter(s => s.type !== "header");

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

  const siteBodyStyle = settings.bodyFont
    ? { fontFamily: `'${settings.bodyFont}', system-ui, sans-serif` }
    : undefined;

  return (
    <div className="min-h-screen bg-white" style={siteBodyStyle}>
      {createPortal(
        <>
          {googleFontsHref && <link rel="stylesheet" href={googleFontsHref} />}
          {settings.headingFont && (
            <style>{`h1,h2,h3,h4,h5,h6{font-family:'${settings.headingFont}',system-ui,sans-serif}`}</style>
          )}
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
      <header className={`${isSticky ? "sticky" : ""} top-0 z-50 ${headerBg} border-b ${headerBorder} px-6 py-3 flex items-center justify-between ${headerShadow}`}>
        <div className="flex items-center gap-3 flex-shrink-0">
          {settings.logoUrl && (
            <img src={settings.logoUrl} alt={businessName} className="h-8 w-auto object-contain" />
          )}
          <span className={`font-bold text-sm md:text-base ${headerText}`}>{businessName}</span>
        </div>

        {navLinks.length > 0 && (
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map(link => (
              <a
                key={link.id}
                href={link.href}
                className={`text-sm font-medium transition-opacity hover:opacity-70 ${headerSubText}`}
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-3 flex-shrink-0">
          {headerPhone && (
            <a
              href={`tel:${headerPhone.replace(/\D/g, "")}`}
              className={`hidden md:block text-sm font-medium ${headerSubText} hover:opacity-80 transition-opacity`}
            >
              {headerPhone}
            </a>
          )}
          <a
            href={ctaUrl}
            className="px-4 py-2 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: settings.brandColor }}
          >
            {ctaLabel}
          </a>
          {navLinks.length > 0 && (
            <button
              className={`md:hidden p-1 ${headerText}`}
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
        <div className={`md:hidden ${mobileBg} border-b ${mobileBorder} px-6 py-4 space-y-3 shadow-md`}>
          {navLinks.map(link => (
            <a
              key={link.id}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`block text-sm font-medium py-1 ${mobileText} hover:opacity-70 transition-opacity`}
            >
              {link.label}
            </a>
          ))}
          {headerPhone && (
            <a
              href={`tel:${headerPhone.replace(/\D/g, "")}`}
              className={`block text-sm font-medium py-1 ${mobileSubText}`}
            >
              {headerPhone}
            </a>
          )}
        </div>
      )}

      {bodySections.map(section => {
        const props = { content: section.content as any, settings, isEditing: false, blockStyle: section.blockStyle };
        switch (section.type) {
          case "hero":    return <HeroSection key={section.id} {...props} />;
          case "services": return <ServicesSection key={section.id} {...props} />;
          case "about":   return <AboutSection key={section.id} {...props} />;
          case "contact": return (
            <ContactFormSection
              key={section.id}
              {...props}
              onSubmit={handleContactSubmit}
            />
          );
          case "footer":  return <FooterSection key={section.id} {...props} />;
          case "portfolio": return <PortfolioSection key={section.id} {...props} />;
          case "deposit": return (
            <DepositSection key={section.id} {...props} businessSlug={resolvedSlug} />
          );
          case "columns": return <ColumnsSection key={section.id} {...props} />;
          case "testimonials": return <TestimonialsSection key={section.id} {...props} />;
          case "faq": return <FAQSection key={section.id} {...props} />;
          case "cta": return <CTASection key={section.id} {...props} />;
          case "stats": return <StatsSection key={section.id} {...props} />;
          default: return null;
        }
      })}
    </div>
  );
}
