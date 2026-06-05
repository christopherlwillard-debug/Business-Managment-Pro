import { SECTION_TEMPLATES } from "./sectionTemplates";

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export interface PageSectionConfig {
  type: "header" | "hero" | "services" | "about" | "contact" | "footer" | "portfolio" | "deposit" | "columns" | "testimonials" | "faq" | "cta" | "stats" | "content" | "row" | "text" | "gallery";
  enabled: boolean;
  order: number;
  content: Record<string, unknown>;
  blockStyle?: Record<string, unknown>;
}

export interface PageTemplate {
  id: string;
  name: string;
  defaultSlug: string;
  description: string;
  emoji: string;
  sectionSummary: string[];
  sections: () => PageSectionConfig[];
}

function getTemplatContent(id: string) {
  return SECTION_TEMPLATES.find(t => t.id === id)!.content();
}

function getTemplateStyle(id: string) {
  return SECTION_TEMPLATES.find(t => t.id === id)!.blockStyle;
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "home-page",
    name: "Home Page",
    defaultSlug: "home",
    description: "A full landing page — hero, services, stats, testimonials, and a call to action.",
    emoji: "🏠",
    sectionSummary: ["Hero Split", "Services Cards", "Statistics", "Testimonials", "CTA Banner"],
    sections: () => [
      {
        type: "hero",
        enabled: true,
        order: 0,
        content: {
          headline: "Professional Service You Can Trust",
          subheadline: "We deliver quality workmanship on every project — big or small. Get a free estimate today.",
          ctaLabel: "Get a Free Quote",
          ctaUrl: "#contact",
          layout: "split",
          imageUrl: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=900&q=80",
        },
      },
      {
        type: "services",
        enabled: true,
        order: 1,
        content: {
          heading: "What We Do",
          subheading: "From start to finish, we handle every detail so you don't have to.",
          items: [
            { id: uid(), title: "Residential Projects", description: "Homes, additions, renovations — we bring your vision to life with expert craftsmanship." },
            { id: uid(), title: "Commercial Work", description: "Office fit-outs, retail spaces, and facilities projects completed on time and on budget." },
            { id: uid(), title: "Emergency Repairs", description: "Fast response when you need it most. We're here to fix problems before they get worse." },
          ],
        },
      },
      {
        type: "stats",
        enabled: true,
        order: 2,
        content: {
          heading: "By the Numbers",
          stats: [
            { id: uid(), value: "500+", label: "Projects Completed" },
            { id: uid(), value: "15+", label: "Years in Business" },
            { id: uid(), value: "100%", label: "Licensed & Insured" },
            { id: uid(), value: "5★", label: "Average Rating" },
          ],
        },
      },
      {
        type: "testimonials",
        enabled: true,
        order: 3,
        content: {
          heading: "What Our Customers Say",
          subheading: "Trusted by homeowners and businesses across the region.",
          testimonials: [
            { id: uid(), name: "John M.", location: "Local Homeowner", rating: 5, quote: "Outstanding work from start to finish. The crew was professional, on time, and the quality speaks for itself. I'd hire them again without hesitation." },
            { id: uid(), name: "Sarah K.", location: "Business Owner", rating: 5, quote: "They completed our renovation ahead of schedule and within budget. Communication was excellent the entire time. Highly recommend!" },
            { id: uid(), name: "Tom R.", location: "Property Manager", rating: 5, quote: "Great attention to detail and very fair pricing. Our project turned out better than we imagined. Five stars all the way." },
          ],
        },
      },
      {
        type: "cta",
        enabled: true,
        order: 4,
        content: {
          heading: "Ready to Start Your Project?",
          subheading: "Get a free estimate today. No obligation, no pressure — just honest answers.",
          primaryLabel: "Get a Free Quote",
          primaryConfig: { url: "#contact", style: "solid", rounding: "full" },
          secondaryLabel: "Call Us Now",
          secondaryConfig: { url: "tel:", style: "outline", rounding: "full" },
        },
      },
    ],
  },

  {
    id: "about-page",
    name: "About Page",
    defaultSlug: "about",
    description: "Tell your story — hero, about us, how it works, team, and a CTA.",
    emoji: "👋",
    sectionSummary: ["Hero Centered", "About Us", "Process / How It Works", "Team Grid", "CTA Banner"],
    sections: () => [
      {
        type: "row",
        enabled: true,
        order: 0,
        content: {
          ...getTemplatContent("hero-centered"),
          columns: [
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "heading", props: { text: "Our Story", level: 1, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "We started with a simple belief: every customer deserves honest work, fair pricing, and clear communication. That hasn't changed.", align: "center" } },
              ],
            },
          ],
        },
        blockStyle: getTemplateStyle("hero-centered"),
      },
      {
        type: "about",
        enabled: true,
        order: 1,
        content: {
          heading: "About Our Company",
          body: "We are a locally owned and operated business with deep roots in this community. For over a decade, our crew has delivered quality workmanship on every project — treating your home or business like our own. We are fully licensed, bonded, and insured, and we back every job with a satisfaction guarantee.",
          photoUrl: "",
        },
      },
      {
        type: "row",
        enabled: true,
        order: 2,
        content: {
          columns: [
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "icon", props: { emoji: "📋", size: 40, align: "center" } },
                { id: uid(), type: "heading", props: { text: "1. Free Estimate", level: 3, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "We visit your site, assess the scope, and give you a detailed written estimate — at no cost and no obligation.", align: "center" } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "icon", props: { emoji: "🔨", size: 40, align: "center" } },
                { id: uid(), type: "heading", props: { text: "2. We Get to Work", level: 3, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "Our crew shows up on time, works cleanly, and keeps you informed at every stage of the project.", align: "center" } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "icon", props: { emoji: "✅", size: 40, align: "center" } },
                { id: uid(), type: "heading", props: { text: "3. Done Right", level: 3, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "We walk through the finished work together, make sure you're 100% satisfied, and stand behind every job.", align: "center" } },
              ],
            },
          ],
          gap: 32,
          maxWidth: "xl",
          verticalAlign: "start",
        },
        blockStyle: { paddingTop: 64, paddingBottom: 64, bgType: "color", bgColor: "#f9fafb" },
      },
      {
        type: "row",
        enabled: true,
        order: 3,
        content: getTemplatContent("team-section"),
        blockStyle: getTemplateStyle("team-section"),
      },
      {
        type: "cta",
        enabled: true,
        order: 4,
        content: {
          heading: "Want to Work With Us?",
          subheading: "Reach out for a free estimate. We'd love to hear about your project.",
          primaryLabel: "Get a Free Quote",
          primaryConfig: { url: "#contact", style: "solid", rounding: "full" },
          secondaryLabel: "Learn About Our Services",
          secondaryConfig: { url: "#services", style: "outline", rounding: "full" },
        },
      },
    ],
  },

  {
    id: "services-page",
    name: "Services Page",
    defaultSlug: "services",
    description: "Showcase your offerings — hero, service cards, features, benefits, pricing, and CTA.",
    emoji: "🛠️",
    sectionSummary: ["Hero Centered", "Service Cards", "Features Grid", "Benefits Section", "Pricing", "CTA Banner"],
    sections: () => [
      {
        type: "row",
        enabled: true,
        order: 0,
        content: {
          columns: [
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "heading", props: { text: "Our Services", level: 1, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "We offer a full range of professional services to meet your needs. Quality materials, expert craftsmanship, and a satisfaction guarantee on every job.", align: "center" } },
              ],
            },
          ],
          gap: 24,
          maxWidth: "lg",
          verticalAlign: "center",
        },
        blockStyle: { paddingTop: 80, paddingBottom: 80 },
      },
      {
        type: "services",
        enabled: true,
        order: 1,
        content: {
          heading: "What We Offer",
          subheading: "From residential to commercial — we do it all.",
          items: [
            { id: uid(), title: "Service One", description: "A clear description of the first service you provide and the value it delivers to your clients." },
            { id: uid(), title: "Service Two", description: "A clear description of the second service you provide and the value it delivers to your clients." },
            { id: uid(), title: "Service Three", description: "A clear description of the third service you provide and the value it delivers to your clients." },
          ],
        },
      },
      {
        type: "row",
        enabled: true,
        order: 2,
        content: getTemplatContent("features-grid"),
        blockStyle: { paddingTop: 64, paddingBottom: 64, bgType: "color", bgColor: "#f9fafb" },
      },
      {
        type: "row",
        enabled: true,
        order: 3,
        content: {
          columns: [
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "heading", props: { text: "Why Clients Choose Us", level: 2, align: "left" } },
                { id: uid(), type: "paragraph", props: { text: "We've built our reputation on reliability, transparency, and results. Here's what sets us apart:", align: "left" } },
                { id: uid(), type: "paragraph", props: { text: "✓ Free estimates with no obligation\n✓ Fully licensed, bonded & insured\n✓ Clean job sites — we respect your space\n✓ Clear communication from start to finish\n✓ Satisfaction guarantee on every project", align: "left" } },
                { id: uid(), type: "button", props: { label: "Get a Free Quote", config: { url: "#contact", variant: "filled", size: "lg" }, align: "left" } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&q=80", alt: "Our work", width: "full", objectFit: "cover", borderRadius: 12 } },
              ],
            },
          ],
          gap: 48,
          maxWidth: "xl",
          verticalAlign: "center",
        },
        blockStyle: { paddingTop: 64, paddingBottom: 64 },
      },
      {
        type: "row",
        enabled: true,
        order: 4,
        content: getTemplatContent("pricing-cards"),
        blockStyle: { paddingTop: 64, paddingBottom: 64, bgType: "color", bgColor: "#f9fafb" },
      },
      {
        type: "cta",
        enabled: true,
        order: 5,
        content: {
          heading: "Ready to Get Started?",
          subheading: "Contact us today for a free estimate. No obligation, no pressure — just honest advice.",
          primaryLabel: "Contact Us Now",
          primaryConfig: { url: "#contact", style: "solid", rounding: "full" },
          secondaryLabel: "View Our Work",
          secondaryConfig: { url: "#portfolio", style: "outline", rounding: "full" },
        },
      },
    ],
  },

  {
    id: "contact-page",
    name: "Contact Page",
    defaultSlug: "contact",
    description: "Make it easy to reach you — contact form, location, and business hours.",
    emoji: "📬",
    sectionSummary: ["Contact Info Card", "Contact Form", "Office Location", "Business Hours"],
    sections: () => [
      {
        type: "row",
        enabled: true,
        order: 0,
        content: {
          columns: [
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "heading", props: { text: "Get in Touch", level: 1, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "We'd love to hear from you. Fill out the form below and we'll be in touch within one business day.", align: "center" } },
              ],
            },
          ],
          gap: 16,
          maxWidth: "lg",
          verticalAlign: "center",
        },
        blockStyle: { paddingTop: 72, paddingBottom: 40 },
      },
      {
        type: "contact",
        enabled: true,
        order: 1,
        content: {
          heading: "Request a Free Quote",
          subheading: "Tell us about your project and we'll follow up within one business day.",
          serviceTypes: ["Residential Project", "Commercial Project", "Emergency Repair", "Inspection / Assessment", "Other"],
        },
      },
      {
        type: "row",
        enabled: true,
        order: 2,
        content: {
          columns: [
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "heading", props: { text: "Our Location", level: 3, align: "left" } },
                { id: uid(), type: "map", props: { address: "123 Main Street, Anytown, USA", height: 240 } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "heading", props: { text: "Contact Information", level: 3, align: "left" } },
                { id: uid(), type: "paragraph", props: { text: "📍 123 Main Street, Anytown, USA\n📞 (555) 123-4567\n✉️ hello@yourbusiness.com", align: "left" } },
                { id: uid(), type: "heading", props: { text: "Business Hours", level: 4, align: "left" } },
                { id: uid(), type: "paragraph", props: { text: "Monday – Friday: 8:00 AM – 6:00 PM\nSaturday: 9:00 AM – 4:00 PM\nSunday: Closed", align: "left" } },
              ],
            },
          ],
          gap: 48,
          maxWidth: "xl",
          verticalAlign: "start",
        },
        blockStyle: { paddingTop: 64, paddingBottom: 64, bgType: "color", bgColor: "#f9fafb" },
      },
      {
        type: "stats",
        enabled: true,
        order: 3,
        content: {
          heading: "Why Choose Us",
          stats: [
            { id: uid(), value: "< 24h", label: "Response Time" },
            { id: uid(), value: "Free", label: "Estimates" },
            { id: uid(), value: "100%", label: "Licensed & Insured" },
            { id: uid(), value: "5★", label: "Customer Rating" },
          ],
        },
      },
    ],
  },
];
