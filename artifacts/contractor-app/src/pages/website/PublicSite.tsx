import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { HeroSection } from "./sections/HeroSection";
import { ServicesSection } from "./sections/ServicesSection";
import { AboutSection } from "./sections/AboutSection";
import { ContactFormSection } from "./sections/ContactFormSection";
import { FooterSection } from "./sections/FooterSection";
import { PortfolioSection } from "./sections/PortfolioSection";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Section {
  id: string;
  type: "hero" | "services" | "about" | "contact" | "footer" | "portfolio";
  enabled: boolean;
  order: number;
  content: Record<string, unknown>;
}

interface SiteSettings {
  brandColor: string;
  fontFamily: string;
  logoUrl: string;
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

  async function handleContactSubmit(formData: {
    name: string; phone: string; email: string; serviceType: string; message: string;
  }) {
    const res = await fetch(`${BASE}/api/public/site/${resolvedSlug}/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
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

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Minimal nav bar */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          {settings.logoUrl && (
            <img src={settings.logoUrl} alt={businessName} className="h-8 w-auto object-contain" />
          )}
          <span className="font-bold text-gray-900 text-sm md:text-base">{businessName}</span>
        </div>
        <a
          href="#contact"
          className="px-4 py-2 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: settings.brandColor }}
        >
          Get a Quote
        </a>
      </header>

      {/* Sections */}
      {sorted.map(section => {
        const props = { content: section.content as any, settings, isEditing: false };
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
          default: return null;
        }
      })}
    </div>
  );
}
