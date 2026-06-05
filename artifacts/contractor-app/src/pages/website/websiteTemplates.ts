import type { SiteSettings } from "./WebsiteEditor";

export interface WebsiteTemplate {
  id: string;
  name: string;
  description: string;
  brandColor: string;
  settings: SiteSettings;
  sections: Array<{
    id: string;
    type: string;
    enabled: boolean;
    order: number;
    content: Record<string, unknown>;
  }>;
}

export const WEBSITE_TEMPLATES: WebsiteTemplate[] = [
  {
    id: "general-contracting",
    name: "General Contractor",
    description: "Construction, renovation & site work",
    brandColor: "#1e3a5f",
    settings: { brandColor: "#1e3a5f", secondaryColor: "#2563eb", accentColor: "#f59e0b", fontFamily: "Inter", headingFont: "Oswald", bodyFont: "Lato", logoUrl: "", headerStyle: "light", footerBgColor: "#1e3a5f" },
    sections: [
      { id: "hero", type: "hero", enabled: true, order: 0, content: { headline: "Built Right, Built to Last", subheadline: "Full-service general contracting for residential and commercial projects.", ctaLabel: "Get a Free Quote" } },
      { id: "services", type: "services", enabled: true, order: 1, content: { heading: "Our Services", items: [
        { id: "s1", title: "New Construction", description: "From ground-up homes to commercial build-outs — we handle every phase." },
        { id: "s2", title: "Renovations & Remodels", description: "Kitchen, bath, basement, or full home renovations done on time and on budget." },
        { id: "s3", title: "Site Preparation", description: "Land clearing, grading, drainage, and excavation before the first nail is driven." },
      ] } },
      { id: "about", type: "about", enabled: true, order: 2, content: { heading: "About Our Company", body: "We are a licensed, insured general contracting firm with deep roots in this community. Our crew brings decades of hands-on experience to every job — big or small. We treat your project like it's our own, with the craftsmanship and communication you deserve.", photoUrl: "" } },
      { id: "contact", type: "contact", enabled: true, order: 3, content: { heading: "Request a Free Quote", subheading: "Tell us about your project and we'll follow up within one business day.", serviceTypes: ["New Construction", "Renovation / Remodel", "Site Preparation", "Repairs", "Other"] } },
      { id: "portfolio", type: "portfolio", enabled: true, order: 4, content: { heading: "Our Work", projects: [] } },
      { id: "footer", type: "footer", enabled: true, order: 5, content: { phone: "", email: "", licenseNumber: "", copyright: "" } },
    ],
  },
  {
    id: "roofing",
    name: "Roofing",
    description: "Roof replacement, repair & inspection",
    brandColor: "#7f1d1d",
    settings: { brandColor: "#7f1d1d", secondaryColor: "#374151", accentColor: "#ef4444", fontFamily: "Inter", headingFont: "Montserrat", bodyFont: "Open Sans", logoUrl: "", headerStyle: "dark", footerBgColor: "#1f2937" },
    sections: [
      { id: "hero", type: "hero", enabled: true, order: 0, content: { headline: "Roofing Done Right. Call Us First.", subheadline: "Storm damage, replacements, and emergency repairs — we respond fast and get it done right the first time.", ctaLabel: "Get a Free Inspection" } },
      { id: "services", type: "services", enabled: true, order: 1, content: { heading: "Roofing Services", items: [
        { id: "s1", title: "Roof Replacement", description: "Full tear-off and replacement with premium shingles, metal, or flat roofing systems — backed by warranty." },
        { id: "s2", title: "Storm Damage Repair", description: "Emergency response to wind, hail, and storm damage. We work directly with your insurance adjuster." },
        { id: "s3", title: "Roof Inspections", description: "Thorough inspections with written reports — for peace of mind, real estate transactions, or insurance claims." },
      ] } },
      { id: "about", type: "about", enabled: true, order: 2, content: { heading: "About Our Roofing Company", body: "We've protected homes and businesses across the region for years. Our crews are licensed, insured, and trained on every roofing system we install. We don't cut corners — your roof is the most important part of your building, and we treat it that way.", photoUrl: "" } },
      { id: "contact", type: "contact", enabled: true, order: 3, content: { heading: "Schedule Your Free Inspection", subheading: "Fill out the form and we'll contact you within 24 hours to schedule your inspection.", serviceTypes: ["Roof Replacement", "Storm Damage Repair", "Roof Inspection", "Leak Repair", "Gutters", "Other"] } },
      { id: "portfolio", type: "portfolio", enabled: true, order: 4, content: { heading: "Recent Roofing Projects", projects: [] } },
      { id: "footer", type: "footer", enabled: true, order: 5, content: { phone: "", email: "", licenseNumber: "", copyright: "" } },
    ],
  },
  {
    id: "hvac",
    name: "HVAC",
    description: "Heating, cooling & air quality services",
    brandColor: "#1d4ed8",
    settings: { brandColor: "#1d4ed8", secondaryColor: "#0ea5e9", accentColor: "#f97316", fontFamily: "Inter", headingFont: "Raleway", bodyFont: "Nunito", logoUrl: "", headerStyle: "light", footerBgColor: "#1e3a8a" },
    sections: [
      { id: "hero", type: "hero", enabled: true, order: 0, content: { headline: "Comfort in Every Season", subheadline: "Professional HVAC installation, repair, and maintenance for homes and businesses.", ctaLabel: "Schedule Service" } },
      { id: "services", type: "services", enabled: true, order: 1, content: { heading: "HVAC Services", items: [
        { id: "s1", title: "AC Installation & Repair", description: "Stay cool all summer with efficient AC systems, expert installation, and fast repair when you need it most." },
        { id: "s2", title: "Heating & Furnace Service", description: "Furnace tune-ups, heat pump installation, and emergency heating repair to keep your family warm." },
        { id: "s3", title: "Seasonal Maintenance", description: "Spring and fall tune-ups to maximize efficiency, extend equipment life, and prevent costly breakdowns." },
      ] } },
      { id: "about", type: "about", enabled: true, order: 2, content: { heading: "Your Local HVAC Experts", body: "Our certified HVAC technicians bring the training and experience to get your system running right — fast. We service all major brands and carry parts on our trucks so most repairs are done in a single visit. Comfort is our business.", photoUrl: "" } },
      { id: "contact", type: "contact", enabled: true, order: 3, content: { heading: "Book a Service Call", subheading: "Same-day and next-day appointments available. Fill out the form and we'll be in touch quickly.", serviceTypes: ["AC Repair", "AC Installation", "Furnace Repair", "Furnace Installation", "Seasonal Tune-Up", "Emergency Service", "Other"] } },
      { id: "portfolio", type: "portfolio", enabled: true, order: 4, content: { heading: "Recent Installations", projects: [] } },
      { id: "footer", type: "footer", enabled: true, order: 5, content: { phone: "", email: "", licenseNumber: "", copyright: "" } },
    ],
  },
  {
    id: "plumbing",
    name: "Plumbing",
    description: "Residential & commercial plumbing",
    brandColor: "#0f766e",
    settings: { brandColor: "#0f766e", secondaryColor: "#0369a1", accentColor: "#fbbf24", fontFamily: "Inter", headingFont: "Montserrat", bodyFont: "Source Sans 3", logoUrl: "", headerStyle: "light", footerBgColor: "#134e4a" },
    sections: [
      { id: "hero", type: "hero", enabled: true, order: 0, content: { headline: "Plumbing You Can Count On — 24/7", subheadline: "From leaky faucets to full repiping — licensed plumbers available around the clock.", ctaLabel: "Call Now" } },
      { id: "services", type: "services", enabled: true, order: 1, content: { heading: "Plumbing Services", items: [
        { id: "s1", title: "Emergency Plumbing", description: "24/7 emergency response for burst pipes, major leaks, and sewer backups. We answer the phone — day and night." },
        { id: "s2", title: "Drain Cleaning", description: "Slow drains, clogs, and backups cleared fast with professional equipment. We find the problem and fix it right." },
        { id: "s3", title: "Water Heater Service", description: "Repair, replacement, and installation of traditional and tankless water heaters. Hot water restored quickly." },
      ] } },
      { id: "about", type: "about", enabled: true, order: 2, content: { heading: "Licensed & Local Plumbers", body: "We're a licensed plumbing company serving this area with honest, reliable service. Our plumbers arrive on time, explain the work before starting, and clean up when the job is done. No surprise charges — ever.", photoUrl: "" } },
      { id: "contact", type: "contact", enabled: true, order: 3, content: { heading: "Request Plumbing Service", subheading: "Fill out the form for same-day or scheduled service. For emergencies, call us directly.", serviceTypes: ["Emergency Plumbing", "Drain Cleaning", "Water Heater", "Leak Repair", "Repiping", "Fixture Installation", "Other"] } },
      { id: "portfolio", type: "portfolio", enabled: true, order: 4, content: { heading: "Our Work", projects: [] } },
      { id: "footer", type: "footer", enabled: true, order: 5, content: { phone: "", email: "", licenseNumber: "", copyright: "" } },
    ],
  },
  {
    id: "landscaping",
    name: "Landscaping",
    description: "Lawn care, landscaping & outdoor design",
    brandColor: "#166534",
    settings: { brandColor: "#166534", secondaryColor: "#15803d", accentColor: "#84cc16", fontFamily: "Inter", headingFont: "Playfair Display", bodyFont: "Merriweather", logoUrl: "", headerStyle: "transparent", footerBgColor: "#14532d" },
    sections: [
      { id: "hero", type: "hero", enabled: true, order: 0, content: { headline: "Beautiful Landscapes, Lasting Impressions", subheadline: "Professional lawn care, landscaping design, and outdoor services for homes and businesses.", ctaLabel: "Get a Free Estimate" } },
      { id: "services", type: "services", enabled: true, order: 1, content: { heading: "Our Services", items: [
        { id: "s1", title: "Lawn Maintenance", description: "Weekly or bi-weekly mowing, edging, trimming, and cleanup to keep your lawn looking its best all season." },
        { id: "s2", title: "Landscape Design & Install", description: "Custom planting plans, garden beds, mulching, and hardscape features designed to transform your outdoor space." },
        { id: "s3", title: "Seasonal Cleanups", description: "Spring and fall cleanups, leaf removal, aeration, overseeding, and winterization to protect your investment." },
      ] } },
      { id: "about", type: "about", enabled: true, order: 2, content: { heading: "Passionate About Your Outdoor Space", body: "We've been creating beautiful, low-maintenance landscapes in this community for years. Our team combines horticultural knowledge with a craftsman's attention to detail — your property deserves care that shows.", photoUrl: "" } },
      { id: "contact", type: "contact", enabled: true, order: 3, content: { heading: "Request a Free Estimate", subheading: "Tell us about your property and we'll schedule a free on-site estimate.", serviceTypes: ["Lawn Maintenance", "Landscape Design", "Seasonal Cleanup", "Tree & Shrub Care", "Irrigation", "Hardscaping", "Other"] } },
      { id: "portfolio", type: "portfolio", enabled: true, order: 4, content: { heading: "Our Portfolio", projects: [] } },
      { id: "footer", type: "footer", enabled: true, order: 5, content: { phone: "", email: "", licenseNumber: "", copyright: "" } },
    ],
  },
];
