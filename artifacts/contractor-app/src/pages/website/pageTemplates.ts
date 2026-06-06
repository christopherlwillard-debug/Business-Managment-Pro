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
  tagline: string;
  defaultSlug: string;
  description: string;
  emoji: string;
  thumbnailSvg: string;
  sectionSummary: string[];
  category: "business" | "page";
  sections: () => PageSectionConfig[];
}

function getTemplatContent(id: string) {
  return SECTION_TEMPLATES.find(t => t.id === id)!.content();
}

function getTemplateStyle(id: string) {
  return SECTION_TEMPLATES.find(t => t.id === id)!.blockStyle;
}

function makeSvg(labels: string[]): string {
  const C: Record<string, string> = {
    "Hero": "#818cf8", "Mission Hero": "#818cf8",
    "Services": "#64748b", "About Us": "#94a3b8", "About": "#94a3b8", "Our Story": "#94a3b8",
    "Stats": "#c7d2fe", "Impact Numbers": "#c7d2fe", "Results": "#f9a8d4",
    "Portfolio": "#a5b4fc",
    "Testimonials": "#ddd6fe", "Stories": "#ddd6fe",
    "CTA": "#4f46e5", "Donate CTA": "#4f46e5", "Reserve / Order CTA": "#4f46e5", "Book a Call": "#4f46e5",
    "Contact Form": "#e2e8f0", "Contact": "#e2e8f0",
    "Gallery": "#e9d5ff",
    "Team": "#7dd3fc",
    "Process": "#bae6fd",
    "Client Logos": "#fef9c3",
    "Programs": "#bbf7d0",
    "Get Involved": "#86efac",
    "Hours & Info": "#fef3c7",
    "Featured Menu": "#fde68a",
    "Why Choose Us": "#94a3b8",
    "Problem → Solution": "#fca5a5",
  };
  const H: Record<string, number> = {
    "Hero": 26, "Mission Hero": 26, "Services": 18, "About Us": 16, "About": 16, "Our Story": 16,
    "Why Choose Us": 16, "Stats": 10, "Impact Numbers": 10, "Portfolio": 18, "Testimonials": 14,
    "Stories": 14, "CTA": 10, "Donate CTA": 10, "Reserve / Order CTA": 10, "Book a Call": 10,
    "Contact Form": 18, "Contact": 18, "Gallery": 16, "Team": 14, "Process": 14,
    "Client Logos": 9, "Programs": 16, "Get Involved": 16, "Hours & Info": 12,
    "Featured Menu": 16, "Problem → Solution": 12, "Results": 10,
  };
  const W = 160, P = 4, G = 2;
  const nat = labels.reduce((s, l) => s + (H[l] ?? 12) + G, -G);
  const sc = nat > 96 ? 96 / nat : 1;
  let y = P;
  let rects = "";
  for (const lbl of labels) {
    const h = Math.max(5, Math.round((H[lbl] ?? 12) * sc));
    rects += `<rect x="${P}" y="${y}" width="${W - P * 2}" height="${h}" rx="2" fill="${C[lbl] ?? "#e2e8f0"}"/>`;
    if (h >= 9) {
      const fs = Math.min(6.5, h * 0.52);
      const disp = lbl.length > 18 ? lbl.slice(0, 16) + "\u2026" : lbl;
      rects += `<text x="${W / 2}" y="${y + h / 2 + fs * 0.38}" text-anchor="middle" font-size="${fs}" fill="rgba(255,255,255,0.9)" font-family="system-ui" font-weight="500">${disp}</text>`;
    }
    y += h + Math.max(1, Math.round(G * sc));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${y + P}">${rects}</svg>`;
}

// ── Business-type templates ─────────────────────────────────────────────────

export const PAGE_TEMPLATES: PageTemplate[] = [

  // ── Contractor ────────────────────────────────────────────────────────────
  {
    id: "contractor",
    name: "Contractor",
    tagline: "Built for the trades — quote, build, get paid.",
    defaultSlug: "home",
    description: "Built for trades and home services — hero, services, portfolio, testimonials, and a quote form.",
    emoji: "🔨",
    category: "business",
    sectionSummary: ["Hero", "Services", "Stats", "Why Choose Us", "Portfolio", "Testimonials", "CTA", "Contact Form"],
    get thumbnailSvg() { return makeSvg(this.sectionSummary); },
    sections: () => [
      {
        type: "hero",
        enabled: true,
        order: 0,
        content: {
          headline: "Expert Contractor Services — Done Right the First Time",
          subheadline: "Residential and commercial projects completed on time, on budget, and to the highest standard. Licensed and insured.",
          ctaLabel: "Get a Free Estimate",
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
          subheading: "From quick repairs to full-scale renovations, we handle it all with expert craftsmanship.",
          layout: "cards",
          items: [
            { id: uid(), title: "Residential Remodeling", description: "Kitchens, bathrooms, basements, additions — we bring your vision to life with skilled craftsmanship and quality materials." },
            { id: uid(), title: "Commercial Construction", description: "Office fit-outs, retail spaces, and facility builds completed on schedule without disrupting your business operations." },
            { id: uid(), title: "Repairs & Maintenance", description: "Fast response for urgent repairs. We diagnose the problem, fix it right, and prevent it from coming back." },
          ],
        },
      },
      {
        type: "stats",
        enabled: true,
        order: 2,
        content: {
          heading: "Trusted by Homeowners & Businesses",
          stats: [
            { id: uid(), value: "800+", label: "Projects Completed" },
            { id: uid(), value: "18+", label: "Years in Business" },
            { id: uid(), value: "100%", label: "Licensed & Insured" },
            { id: uid(), value: "5★", label: "Average Rating" },
          ],
        },
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
                { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&q=80", alt: "Our team at work", width: "full", objectFit: "cover", borderRadius: 12 } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "heading", props: { text: "Why Choose Us", level: 2, align: "left" } },
                { id: uid(), type: "paragraph", props: { text: "We've built our reputation one satisfied customer at a time. Every project — big or small — gets the same level of care and attention to detail.", align: "left" } },
                { id: uid(), type: "paragraph", props: { text: "✓ Free, detailed estimates — no surprises\n✓ Fully licensed, bonded & insured\n✓ Clean, respectful job sites every day\n✓ Clear communication from start to finish\n✓ Satisfaction guarantee on every job", align: "left" } },
                { id: uid(), type: "button", props: { label: "View Our Work", config: { url: "#portfolio", variant: "filled", size: "lg" }, align: "left" } },
              ],
            },
          ],
          gap: 48,
          maxWidth: "xl",
          verticalAlign: "center",
        },
        blockStyle: { paddingTop: 72, paddingBottom: 72 },
      },
      {
        type: "portfolio",
        enabled: true,
        order: 4,
        content: {
          heading: "Recent Projects",
          subheading: "A sample of what we've built. Every project is custom — no two are alike.",
          projects: [
            { id: uid(), title: "Full Kitchen Renovation", description: "Complete gut-and-rebuild for a local family. New cabinets, countertops, appliances, and tile.", photos: [] },
            { id: uid(), title: "Exterior Siding Replacement", description: "Replaced aging wood siding with fiber cement on a two-story home. Fully insulated and painted.", photos: [] },
            { id: uid(), title: "Commercial Office Fit-Out", description: "Converted raw warehouse space into a modern open-plan office for a tech startup.", photos: [] },
            { id: uid(), title: "Master Bath Addition", description: "Added an ensuite master bath to an existing bedroom, including plumbing, tile, and custom vanity.", photos: [] },
          ],
        },
      },
      {
        type: "testimonials",
        enabled: true,
        order: 5,
        content: {
          heading: "What Our Customers Say",
          subheading: "We measure success by how often our customers come back — and send their friends.",
          testimonials: [
            { id: uid(), name: "Mike & Laura T.", location: "Homeowners", rating: 5, quote: "They took a cramped, outdated kitchen and completely transformed it. On time, on budget, and the quality is outstanding. We use this kitchen every day and love it." },
            { id: uid(), name: "Sandra R.", location: "Business Owner", rating: 5, quote: "The office build-out was done ahead of schedule and came in under budget. The crew was professional and cleaned up every evening. We're already planning phase two." },
            { id: uid(), name: "Carlos M.", location: "Property Manager", rating: 5, quote: "I manage 12 rental units and this is the only contractor I call. Honest pricing, great work, and they show up when they say they will. Highly recommend." },
          ],
        },
      },
      {
        type: "cta",
        enabled: true,
        order: 6,
        content: {
          heading: "Ready to Start Your Project?",
          subheading: "Get a free, no-obligation estimate. We'll visit your site, assess the scope, and give you a detailed written quote within 24 hours.",
          primaryLabel: "Request a Free Estimate",
          primaryConfig: { url: "#contact", style: "solid", rounding: "full" },
          secondaryLabel: "Call Us Today",
          secondaryConfig: { url: "tel:", style: "outline", rounding: "full" },
        },
      },
      {
        type: "contact",
        enabled: true,
        order: 7,
        content: {
          heading: "Request a Free Quote",
          subheading: "Tell us about your project and we'll follow up within one business day.",
          serviceTypes: ["Kitchen / Bath Remodel", "Addition / New Build", "Exterior Work", "Commercial Project", "Emergency Repair", "Other"],
        },
      },
    ],
  },

  // ── Business / General ────────────────────────────────────────────────────
  {
    id: "business-general",
    name: "Business",
    tagline: "A polished presence for any professional service.",
    defaultSlug: "home",
    description: "A polished all-purpose layout — hero, about, services, team, testimonials, and contact.",
    emoji: "💼",
    category: "business",
    sectionSummary: ["Hero", "About Us", "Services", "Stats", "Team", "Testimonials", "CTA", "Contact"],
    get thumbnailSvg() { return makeSvg(this.sectionSummary); },
    sections: () => [
      {
        type: "hero",
        enabled: true,
        order: 0,
        content: {
          headline: "Professional Service, Exceptional Results",
          subheadline: "We help businesses like yours grow through reliable service, honest communication, and a genuine commitment to your success.",
          ctaLabel: "Get in Touch",
          ctaUrl: "#contact",
          layout: "split",
          imageUrl: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=900&q=80",
        },
      },
      {
        type: "about",
        enabled: true,
        order: 1,
        content: {
          heading: "About Our Company",
          body: "We are a locally owned business with a simple mission: deliver outstanding service that keeps clients coming back. Our team brings deep expertise, a customer-first mindset, and the work ethic to back it up.\n\nFounded on the belief that every client deserves honest advice and dependable execution, we've grown steadily through referrals and repeat business. We're proud of that — it means our work speaks for itself.",
          photoUrl: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80",
        },
      },
      {
        type: "services",
        enabled: true,
        order: 2,
        content: {
          heading: "Our Services",
          subheading: "Everything you need to move your business forward — delivered with consistency and care.",
          layout: "cards",
          items: [
            { id: uid(), title: "Consulting & Strategy", description: "We assess your situation, identify the highest-leverage opportunities, and build a clear roadmap to get you there." },
            { id: uid(), title: "Implementation & Execution", description: "We don't just advise — we do the work. Our team executes with precision, keeping you informed every step of the way." },
            { id: uid(), title: "Ongoing Support & Maintenance", description: "Once we deliver, we're not gone. Ongoing partnerships mean you always have expert support when you need it." },
          ],
        },
      },
      {
        type: "stats",
        enabled: true,
        order: 3,
        content: {
          heading: "Our Track Record",
          stats: [
            { id: uid(), value: "12+", label: "Years in Business" },
            { id: uid(), value: "300+", label: "Clients Served" },
            { id: uid(), value: "97%", label: "Client Retention Rate" },
            { id: uid(), value: "4.9★", label: "Average Review" },
          ],
        },
      },
      {
        type: "row",
        enabled: true,
        order: 4,
        content: getTemplatContent("team-section"),
        blockStyle: getTemplateStyle("team-section"),
      },
      {
        type: "testimonials",
        enabled: true,
        order: 5,
        content: {
          heading: "What Our Clients Say",
          subheading: "Relationships built on trust and results.",
          testimonials: [
            { id: uid(), name: "David H.", location: "CEO, Regional Firm", rating: 5, quote: "They treated our business like their own. The insight they brought to our strategy was worth ten times what we paid. We grew 40% last year directly because of their work." },
            { id: uid(), name: "Rachel S.", location: "Director of Operations", rating: 5, quote: "Incredibly responsive, zero drama, great output. Every deadline was hit. Every deliverable was better than expected. I've referred them to three other companies." },
            { id: uid(), name: "Tom L.", location: "Small Business Owner", rating: 5, quote: "I was skeptical going in but now I'm a believer. They brought clarity to a messy situation and helped us build systems that actually work. Wish I'd hired them sooner." },
          ],
        },
      },
      {
        type: "cta",
        enabled: true,
        order: 6,
        content: {
          heading: "Let's Work Together",
          subheading: "Ready to get started? Reach out today for a no-pressure conversation about your goals.",
          primaryLabel: "Schedule a Call",
          primaryConfig: { url: "#contact", style: "solid", rounding: "full" },
          secondaryLabel: "Learn More About Us",
          secondaryConfig: { url: "#about", style: "outline", rounding: "full" },
        },
      },
      {
        type: "contact",
        enabled: true,
        order: 7,
        content: {
          heading: "Get in Touch",
          subheading: "Send us a message and we'll be in touch within one business day.",
          serviceTypes: ["General Inquiry", "Get a Quote", "Partnership Opportunity", "Other"],
        },
      },
    ],
  },

  // ── Restaurant ────────────────────────────────────────────────────────────
  {
    id: "restaurant",
    name: "Restaurant",
    tagline: "Beautiful food-first pages that fill tables.",
    defaultSlug: "home",
    description: "A bold food-first layout — featured menu, our story, hours, gallery, and a reservation CTA.",
    emoji: "🍽️",
    category: "business",
    sectionSummary: ["Hero", "Featured Menu", "Our Story", "Stats", "Gallery", "Hours & Info", "Reserve / Order CTA"],
    get thumbnailSvg() { return makeSvg(this.sectionSummary); },
    sections: () => [
      {
        type: "hero",
        enabled: true,
        order: 0,
        content: {
          headline: "Come Hungry. Leave Happy.",
          subheadline: "Fresh ingredients, bold flavors, and a room full of good company. Open daily — come see us.",
          ctaLabel: "View Our Menu",
          ctaUrl: "#menu",
          layout: "centered",
          imageUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80",
        },
        blockStyle: { paddingTop: 120, paddingBottom: 120 },
      },
      {
        type: "row",
        enabled: true,
        order: 1,
        content: {
          columns: [
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=80", alt: "Signature dish", width: "full", objectFit: "cover", borderRadius: 12 } },
                { id: uid(), type: "heading", props: { text: "Chef's Signature Pasta", level: 4, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "House-made tagliatelle, slow-braised short rib, truffle oil, fresh parmesan.", align: "center" } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80", alt: "Fresh salad", width: "full", objectFit: "cover", borderRadius: 12 } },
                { id: uid(), type: "heading", props: { text: "Garden Summer Salad", level: 4, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "Seasonal greens, heirloom tomatoes, candied walnuts, house-made vinaigrette.", align: "center" } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600&q=80", alt: "Breakfast plate", width: "full", objectFit: "cover", borderRadius: 12 } },
                { id: uid(), type: "heading", props: { text: "Weekend Brunch Stack", level: 4, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "Brioche french toast, whipped mascarpone, maple syrup, fresh berries.", align: "center" } },
              ],
            },
          ],
          gap: 32,
          maxWidth: "xl",
          verticalAlign: "start",
          headerText: "Featured Dishes",
          headerSubtext: "A taste of what's waiting for you.",
        },
        blockStyle: { paddingTop: 80, paddingBottom: 64 },
      },
      {
        type: "about",
        enabled: true,
        order: 2,
        content: {
          heading: "Our Story",
          body: "We opened our doors in 2009 with one idea: food should feel like a celebration. Using locally sourced produce, handmade pastas, and proteins from regional farms, our kitchen turns seasonal ingredients into unforgettable meals.\n\nEvery dish on our menu exists because it earned its place — tasted, refined, and tasted again. We don't cut corners in the kitchen, and we don't rush a dining experience. Good food takes time. So do we.",
          photoUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80",
        },
      },
      {
        type: "stats",
        enabled: true,
        order: 3,
        content: {
          heading: "A Few Quick Facts",
          stats: [
            { id: uid(), value: "15+", label: "Years Open" },
            { id: uid(), value: "80", label: "Seats Available" },
            { id: uid(), value: "100%", label: "Locally Sourced" },
            { id: uid(), value: "4.8★", label: "Average Rating" },
          ],
        },
      },
      {
        type: "gallery",
        enabled: true,
        order: 4,
        content: {
          heading: "From Our Kitchen",
          subheading: "The food — in all its glory.",
          layout: "masonry",
          images: [
            { id: uid(), url: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80", alt: "Dish 1" },
            { id: uid(), url: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80", alt: "Dish 2" },
            { id: uid(), url: "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=600&q=80", alt: "Dish 3" },
            { id: uid(), url: "https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=600&q=80", alt: "Dish 4" },
            { id: uid(), url: "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=600&q=80", alt: "Dish 5" },
            { id: uid(), url: "https://images.unsplash.com/photo-1561043433-aaf687c4cf04?w=600&q=80", alt: "Dish 6" },
          ],
        },
      },
      {
        type: "row",
        enabled: true,
        order: 5,
        content: {
          columns: [
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "heading", props: { text: "Hours & Location", level: 3, align: "left" } },
                { id: uid(), type: "paragraph", props: { text: "Monday – Thursday: 11am – 9pm\nFriday – Saturday: 11am – 10pm\nSunday (Brunch): 10am – 3pm", align: "left" } },
                { id: uid(), type: "divider", props: { color: "#e5e7eb", thickness: 1, marginY: 16 } },
                { id: uid(), type: "paragraph", props: { text: "📍 456 Elm Street, Downtown\n📞 (555) 234-5678\n✉️ reservations@yourrestaurant.com", align: "left" } },
              ],
            },
          ],
          gap: 32,
          maxWidth: "lg",
          verticalAlign: "center",
        },
        blockStyle: { paddingTop: 64, paddingBottom: 64 },
      },
      {
        type: "cta",
        enabled: true,
        order: 6,
        content: {
          heading: "Reserve Your Table",
          subheading: "Weekends fill up fast. Book ahead or give us a call — we'd love to host you.",
          primaryLabel: "Make a Reservation",
          primaryConfig: { url: "tel:", style: "solid", rounding: "full" },
          secondaryLabel: "View Full Menu",
          secondaryConfig: { url: "#menu", style: "outline", rounding: "full" },
        },
      },
    ],
  },

  // ── Consultant ────────────────────────────────────────────────────────────
  {
    id: "consultant",
    name: "Consultant",
    tagline: "Problem → solution framing that drives bookings.",
    defaultSlug: "home",
    description: "Problem/solution framing, services, client results, bio, testimonials, and a discovery call CTA.",
    emoji: "🎯",
    category: "business",
    sectionSummary: ["Hero", "Problem → Solution", "Services", "Results", "About", "Testimonials", "Book a Call", "Contact Form"],
    get thumbnailSvg() { return makeSvg(this.sectionSummary); },
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
                { id: uid(), type: "heading", props: { text: "Your Business Has the Potential. Let's Unlock It.", level: 1, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "I help growing businesses identify the real problems holding them back and build practical strategies that get results — not just plans that collect dust.", align: "center" } },
                { id: uid(), type: "button", props: { label: "Book a Free Discovery Call", config: { url: "#contact", variant: "filled", size: "lg" }, align: "center" } },
              ],
            },
          ],
          gap: 24,
          maxWidth: "lg",
          verticalAlign: "center",
        },
        blockStyle: { paddingTop: 100, paddingBottom: 100 },
      },
      {
        type: "row",
        enabled: true,
        order: 1,
        content: {
          columns: [
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "icon", props: { emoji: "😓", size: 48, align: "center" } },
                { id: uid(), type: "heading", props: { text: "The Problem", level: 3, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "You're working harder than ever but growth feels stuck. Your team is busy but not aligned. You have a strategy — it just isn't translating to results. Sound familiar?", align: "center" } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "icon", props: { emoji: "✅", size: 48, align: "center" } },
                { id: uid(), type: "heading", props: { text: "My Approach", level: 3, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "I cut through the noise, identify what's really blocking progress, and work with your team to build a clear, actionable path forward. No buzzwords. No fluff. Just results.", align: "center" } },
              ],
            },
          ],
          gap: 48,
          maxWidth: "xl",
          verticalAlign: "start",
        },
        blockStyle: { paddingTop: 64, paddingBottom: 64 },
      },
      {
        type: "services",
        enabled: true,
        order: 2,
        content: {
          heading: "How I Can Help",
          subheading: "Focused engagements designed to move the needle — not drag on forever.",
          layout: "cards",
          items: [
            { id: uid(), title: "Strategy Sprint", description: "A focused 4-week engagement to audit your current position, identify the highest-leverage opportunities, and build a 90-day execution plan." },
            { id: uid(), title: "Fractional Advisory", description: "Ongoing monthly advisory: strategy sessions, on-call guidance, and accountability check-ins. An experienced co-pilot without the full-time cost." },
            { id: uid(), title: "Team Workshop", description: "A half or full-day workshop for your leadership team to align on priorities, break down silos, and create shared ownership of the growth plan." },
          ],
        },
      },
      {
        type: "stats",
        enabled: true,
        order: 3,
        content: {
          heading: "Client Results",
          stats: [
            { id: uid(), value: "47%", label: "Avg. Revenue Increase" },
            { id: uid(), value: "60+", label: "Clients Served" },
            { id: uid(), value: "3×", label: "Avg. ROI on Engagement" },
            { id: uid(), value: "12+", label: "Years of Experience" },
          ],
        },
      },
      {
        type: "about",
        enabled: true,
        order: 4,
        content: {
          heading: "About Me",
          body: "I'm a business consultant and former operator with 12+ years of experience helping companies from $1M to $50M in revenue break through growth ceilings.\n\nBefore consulting, I ran operations at a regional services company and grew it from $4M to $22M in five years. I know what it's like to make payroll, manage a team, and build something from the inside out.\n\nI work with a small number of clients at a time so I can show up fully for each one. If we work together, you get my full attention — not a junior associate.",
          photoUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80",
        },
      },
      {
        type: "testimonials",
        enabled: true,
        order: 5,
        content: {
          heading: "What Clients Say",
          subheading: "Results-driven. Honest. Worth every dollar.",
          testimonials: [
            { id: uid(), name: "Jennifer W.", location: "CEO, $8M Services Co.", rating: 5, quote: "In six months we'd implemented a new pricing model, reorganized the sales team, and signed our two biggest contracts ever. The ROI on this engagement was not even close. Hire them." },
            { id: uid(), name: "Mark T.", location: "Founder, Tech Startup", rating: 5, quote: "I was spinning my wheels. Two sessions in and I had more clarity on my business than I'd had in two years. The strategy sprint paid for itself within 60 days. Genuinely transformative." },
            { id: uid(), name: "Diane K.", location: "VP Operations", rating: 5, quote: "Our team workshop was the turning point for our culture. People left aligned, energized, and actually excited. That's rare. We've booked a follow-up for Q4." },
          ],
        },
      },
      {
        type: "cta",
        enabled: true,
        order: 6,
        content: {
          heading: "Ready to Get Unstuck?",
          subheading: "Book a free 30-minute discovery call. No pitch, no pressure — just an honest conversation about where you are and where you want to go.",
          primaryLabel: "Book a Discovery Call",
          primaryConfig: { url: "#contact", style: "solid", rounding: "full" },
          secondaryLabel: "Learn About My Services",
          secondaryConfig: { url: "#services", style: "outline", rounding: "full" },
        },
      },
      {
        type: "contact",
        enabled: true,
        order: 7,
        content: {
          heading: "Book a Discovery Call",
          subheading: "Tell me a little about where you are and what you're working on. I'll reach out within 24 hours to schedule time.",
          serviceTypes: ["Strategy Sprint", "Fractional Advisory", "Team Workshop", "Not Sure Yet — Let's Talk"],
        },
      },
    ],
  },

  // ── Agency ────────────────────────────────────────────────────────────────
  {
    id: "agency",
    name: "Agency",
    tagline: "Creative and bold — for studios that mean business.",
    defaultSlug: "home",
    description: "Creative and bold — services, portfolio, client logos, process, team, and a project kickoff CTA.",
    emoji: "🚀",
    category: "business",
    sectionSummary: ["Hero", "Services", "Portfolio", "Client Logos", "Process", "Team", "Stats", "CTA"],
    get thumbnailSvg() { return makeSvg(this.sectionSummary); },
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
                { id: uid(), type: "heading", props: { text: "We Build Digital Experiences That Convert", level: 1, align: "left" } },
                { id: uid(), type: "paragraph", props: { text: "Strategy. Design. Development. Growth. We partner with ambitious brands to build digital products people love and results clients can measure.", align: "left" } },
                { id: uid(), type: "button", props: { label: "Start a Project", config: { url: "#contact", variant: "filled", size: "lg" }, align: "left" } },
              ],
            },
          ],
          gap: 24,
          maxWidth: "xl",
          verticalAlign: "center",
        },
        blockStyle: { paddingTop: 100, paddingBottom: 100 },
      },
      {
        type: "services",
        enabled: true,
        order: 1,
        content: {
          heading: "What We Do",
          subheading: "End-to-end digital services under one roof — no handoff hell, no finger-pointing.",
          layout: "cards",
          items: [
            { id: uid(), title: "Brand & Identity", description: "Strategy-driven brand systems — logo, visual language, tone of voice, and guidelines built to scale." },
            { id: uid(), title: "UX & Product Design", description: "User research, wireframes, and polished UI that puts your users first and your conversion rates second (in the best way)." },
            { id: uid(), title: "Web Development", description: "Performant, accessible, and beautifully engineered websites and web apps. Built to last, optimized to convert." },
            { id: uid(), title: "Growth & Marketing", description: "SEO, paid media, email, and analytics — data-driven strategies that bring the right people to your door and keep them there." },
          ],
        },
      },
      {
        type: "portfolio",
        enabled: true,
        order: 2,
        content: {
          heading: "Selected Work",
          subheading: "A few projects we're especially proud of.",
          projects: [
            { id: uid(), title: "Brand & Web — Retail Client", description: "Full brand refresh and e-commerce site for a growing retail brand. 3× conversion rate increase in 60 days.", photos: [] },
            { id: uid(), title: "SaaS Product Design", description: "UX overhaul for a B2B SaaS platform serving 10,000+ users. Reduced churn by 22% in the first quarter.", photos: [] },
            { id: uid(), title: "Campaign — Launch Marketing", description: "Go-to-market strategy and digital campaign for a new product launch. 50,000 signups in the first week.", photos: [] },
            { id: uid(), title: "Redesign — Financial Services", description: "Modernized digital presence for a regional financial firm, including brand, web, and client portal.", photos: [] },
          ],
        },
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
                { id: uid(), type: "heading", props: { text: "Acme Corp", level: 4, align: "center", style: { fontWeight: "700", letterSpacing: "0.05em" } } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "heading", props: { text: "Horizon Labs", level: 4, align: "center", style: { fontWeight: "700", letterSpacing: "0.05em" } } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "heading", props: { text: "Meridian Co.", level: 4, align: "center", style: { fontWeight: "700", letterSpacing: "0.05em" } } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "heading", props: { text: "Apex Group", level: 4, align: "center", style: { fontWeight: "700", letterSpacing: "0.05em" } } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "heading", props: { text: "Lumen Inc.", level: 4, align: "center", style: { fontWeight: "700", letterSpacing: "0.05em" } } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "heading", props: { text: "Nova Studio", level: 4, align: "center", style: { fontWeight: "700", letterSpacing: "0.05em" } } },
              ],
            },
          ],
          gap: 24,
          maxWidth: "xl",
          verticalAlign: "center",
          headerText: "Trusted by",
          headerSubtext: "Brands that take their digital presence seriously.",
        },
        blockStyle: { paddingTop: 48, paddingBottom: 48 },
      },
      {
        type: "row",
        enabled: true,
        order: 4,
        content: {
          columns: [
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "icon", props: { emoji: "🔍", size: 40, align: "center" } },
                { id: uid(), type: "heading", props: { text: "1. Discover", level: 4, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "We start by understanding your business, users, and goals. No assumptions — just listening and research.", align: "center" } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "icon", props: { emoji: "✏️", size: 40, align: "center" } },
                { id: uid(), type: "heading", props: { text: "2. Design", level: 4, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "We translate insights into concepts, iterate with you, and craft a final solution you're genuinely excited about.", align: "center" } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "icon", props: { emoji: "⚙️", size: 40, align: "center" } },
                { id: uid(), type: "heading", props: { text: "3. Build", level: 4, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "Clean code, rigorous QA, and a deployment process built to go live on time without the last-minute panic.", align: "center" } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "icon", props: { emoji: "📈", size: 40, align: "center" } },
                { id: uid(), type: "heading", props: { text: "4. Grow", level: 4, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "We measure, learn, and optimize. The launch is the beginning — not the end — of our partnership.", align: "center" } },
              ],
            },
          ],
          gap: 32,
          maxWidth: "xl",
          verticalAlign: "start",
          headerText: "Our Process",
          headerSubtext: "How we get from idea to impact.",
        },
        blockStyle: { paddingTop: 80, paddingBottom: 80 },
      },
      {
        type: "row",
        enabled: true,
        order: 5,
        content: getTemplatContent("team-section"),
        blockStyle: getTemplateStyle("team-section"),
      },
      {
        type: "stats",
        enabled: true,
        order: 6,
        content: {
          heading: "By the Numbers",
          stats: [
            { id: uid(), value: "120+", label: "Projects Delivered" },
            { id: uid(), value: "8", label: "Years in Business" },
            { id: uid(), value: "4.9★", label: "Client Rating" },
            { id: uid(), value: "92%", label: "Repeat Client Rate" },
          ],
        },
      },
      {
        type: "cta",
        enabled: true,
        order: 7,
        content: {
          heading: "Have a Project in Mind?",
          subheading: "We'd love to hear about it. Tell us what you're building and we'll tell you how we can help.",
          primaryLabel: "Start a Conversation",
          primaryConfig: { url: "#contact", style: "solid", rounding: "full" },
          secondaryLabel: "View Our Work",
          secondaryConfig: { url: "#portfolio", style: "outline", rounding: "full" },
        },
      },
      {
        type: "contact",
        enabled: true,
        order: 8,
        content: {
          heading: "Start a Project",
          subheading: "Tell us what you're working on. We'll follow up within 24 hours.",
          serviceTypes: ["Brand & Identity", "Website / Web App", "UX Design", "Growth & Marketing", "Full Project — All of the Above", "Not Sure Yet"],
        },
      },
    ],
  },

  // ── Nonprofit ─────────────────────────────────────────────────────────────
  {
    id: "nonprofit",
    name: "Nonprofit",
    tagline: "Mission-first storytelling that drives donations.",
    defaultSlug: "home",
    description: "Mission-first layout — impact stats, programs, get involved, stories, and a donation CTA.",
    emoji: "❤️",
    category: "business",
    sectionSummary: ["Mission Hero", "Impact Numbers", "Programs", "Get Involved", "Stories", "Donate CTA"],
    get thumbnailSvg() { return makeSvg(this.sectionSummary); },
    sections: () => [
      {
        type: "hero",
        enabled: true,
        order: 0,
        content: {
          headline: "Together, We're Changing What's Possible",
          subheadline: "Every dollar donated, every hour volunteered, every story shared — it all adds up to real change in real people's lives. Join us.",
          ctaLabel: "Make a Donation",
          ctaUrl: "#donate",
          layout: "centered",
          imageUrl: "https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=1200&q=80",
        },
        blockStyle: { paddingTop: 110, paddingBottom: 110 },
      },
      {
        type: "stats",
        enabled: true,
        order: 1,
        content: {
          heading: "Our Impact This Year",
          stats: [
            { id: uid(), value: "12,400", label: "People Served" },
            { id: uid(), value: "850", label: "Active Volunteers" },
            { id: uid(), value: "$2.1M", label: "Funds Distributed" },
            { id: uid(), value: "14", label: "Programs Running" },
          ],
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
                { id: uid(), type: "icon", props: { emoji: "🍽️", size: 48, align: "center" } },
                { id: uid(), type: "heading", props: { text: "Food Security Program", level: 3, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "Weekly distribution of fresh produce and pantry staples to 500+ families in underserved neighborhoods. No barriers, no paperwork — just food.", align: "center" } },
                { id: uid(), type: "button", props: { label: "Learn More", config: { url: "#programs", variant: "outline", size: "sm" }, align: "center" } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "icon", props: { emoji: "📚", size: 48, align: "center" } },
                { id: uid(), type: "heading", props: { text: "Youth Education Initiative", level: 3, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "After-school tutoring, mentorship, and college prep for middle and high school students. 94% of our graduates go on to higher education.", align: "center" } },
                { id: uid(), type: "button", props: { label: "Learn More", config: { url: "#programs", variant: "outline", size: "sm" }, align: "center" } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "icon", props: { emoji: "🏠", size: 48, align: "center" } },
                { id: uid(), type: "heading", props: { text: "Housing Stability Fund", level: 3, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "Emergency rental assistance and transitional housing support for families facing eviction or displacement due to crisis or hardship.", align: "center" } },
                { id: uid(), type: "button", props: { label: "Learn More", config: { url: "#programs", variant: "outline", size: "sm" }, align: "center" } },
              ],
            },
          ],
          gap: 40,
          maxWidth: "xl",
          verticalAlign: "start",
          headerText: "Our Programs",
          headerSubtext: "Three core initiatives. One shared mission.",
        },
        blockStyle: { paddingTop: 80, paddingBottom: 80 },
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
                { id: uid(), type: "heading", props: { text: "Volunteer Your Time", level: 3, align: "left" } },
                { id: uid(), type: "paragraph", props: { text: "Our work is powered by people who show up. Whether you can give one Saturday a month or one hour a week, every bit makes a measurable difference.", align: "left" } },
                { id: uid(), type: "paragraph", props: { text: "📅 Weekly shifts available\n🌍 15 locations across the region\n❤️ 850 volunteers and counting", align: "left" } },
                { id: uid(), type: "button", props: { label: "Sign Up to Volunteer", config: { url: "#volunteer", variant: "filled", size: "md" }, align: "left" } },
              ],
            },
            {
              id: uid(),
              widthRatio: 1,
              components: [
                { id: uid(), type: "heading", props: { text: "Make a Donation", level: 3, align: "left" } },
                { id: uid(), type: "paragraph", props: { text: "We operate with over 82% of every dollar going directly to programs. Your gift is tracked, reported, and working from day one.", align: "left" } },
                { id: uid(), type: "paragraph", props: { text: "$25 feeds a family for a week\n$100 funds a tutoring session\n$500 covers one month of rent assistance", align: "left" } },
                { id: uid(), type: "button", props: { label: "Donate Now", config: { url: "#donate", variant: "filled", size: "md" }, align: "left" } },
              ],
            },
          ],
          gap: 64,
          maxWidth: "xl",
          verticalAlign: "start",
          headerText: "Get Involved",
          headerSubtext: "There are many ways to make a difference.",
        },
        blockStyle: { paddingTop: 80, paddingBottom: 80 },
      },
      {
        type: "testimonials",
        enabled: true,
        order: 4,
        content: {
          heading: "Stories of Impact",
          subheading: "From the people our work reaches every day.",
          testimonials: [
            { id: uid(), name: "Maria G.", location: "Food Program Recipient", rating: 5, quote: "When my husband lost his job last winter, I didn't know how I was going to feed my kids. The food distribution kept us going. I don't know what we would have done without it." },
            { id: uid(), name: "DeShawn M.", location: "Youth Program Graduate", rating: 5, quote: "I was the first in my family to apply to college. My mentor from the youth program walked me through every step. I got into my first choice school. That wouldn't have happened without this program." },
            { id: uid(), name: "Lisa T.", location: "Housing Fund Recipient", rating: 5, quote: "One month I was facing eviction with three kids. The housing fund paid my back rent and gave me time to stabilize. I'm now employed full time. I volunteer here every weekend to give back." },
          ],
        },
      },
      {
        type: "cta",
        enabled: true,
        order: 5,
        content: {
          heading: "Your Support Changes Lives",
          subheading: "Every contribution — no matter the size — goes directly to people who need it most. Donate today and we'll show you exactly how it's used.",
          primaryLabel: "Donate Now",
          primaryConfig: { url: "#donate", style: "solid", rounding: "full" },
          secondaryLabel: "Volunteer Instead",
          secondaryConfig: { url: "#volunteer", style: "outline", rounding: "full" },
        },
      },
    ],
  },

  // ── Page-type templates ─────────────────────────────────────────────────

  {
    id: "home-page",
    name: "Home Page",
    tagline: "A complete landing page ready to customize.",
    defaultSlug: "home",
    description: "A full landing page — hero, services, stats, testimonials, and a call to action.",
    emoji: "🏠",
    category: "page",
    sectionSummary: ["Hero", "Services", "Stats", "Testimonials", "CTA"],
    get thumbnailSvg() { return makeSvg(this.sectionSummary); },
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
    tagline: "Tell your story — who you are and why it matters.",
    defaultSlug: "about",
    description: "Tell your story — hero, about us, how it works, team, and a CTA.",
    emoji: "👋",
    category: "page",
    sectionSummary: ["Hero", "About Us", "Process", "Team", "CTA"],
    get thumbnailSvg() { return makeSvg(this.sectionSummary); },
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
                { id: uid(), type: "heading", props: { text: "Our Story", level: 1, align: "center" } },
                { id: uid(), type: "paragraph", props: { text: "We started with a simple belief: every customer deserves honest work, fair pricing, and clear communication. That hasn't changed.", align: "center" } },
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
        blockStyle: { paddingTop: 64, paddingBottom: 64 },
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
    tagline: "Showcase your offerings with pricing and proof.",
    defaultSlug: "services",
    description: "Showcase your offerings — hero, service cards, features, benefits, pricing, and CTA.",
    emoji: "🛠️",
    category: "page",
    sectionSummary: ["Hero", "Services", "Stats", "CTA"],
    get thumbnailSvg() { return makeSvg(this.sectionSummary); },
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
        blockStyle: { paddingTop: 64, paddingBottom: 64 },
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
        blockStyle: { paddingTop: 64, paddingBottom: 64 },
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
    tagline: "Make it easy for anyone to reach you.",
    defaultSlug: "contact",
    description: "Make it easy to reach you — contact form, location, and business hours.",
    emoji: "📬",
    category: "page",
    sectionSummary: ["Hero", "Contact Form", "Stats"],
    get thumbnailSvg() { return makeSvg(this.sectionSummary); },
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
        blockStyle: { paddingTop: 64, paddingBottom: 64 },
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
