import { type RowSectionData } from "./sections/RowSection";
import { type BlockStyle } from "./sections/BlockStyleWrapper";

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export interface SectionTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** Library category for the Section Library panel (e.g. "Hero", "Layout"). */
  category: string;
  content: () => RowSectionData;
  blockStyle?: BlockStyle;
}

export const SECTION_TEMPLATES: SectionTemplate[] = [
  {
    id: "hero-centered",
    name: "Hero Centered",
    description: "Full-width heading, paragraph, and CTA button — all centered",
    emoji: "🎯",
    category: "Hero",
    content: () => ({
      columns: [
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "heading", props: { text: "Welcome to Our Website", level: 1, align: "center" } },
            { id: uid(), type: "paragraph", props: { text: "We deliver exceptional results with a commitment to quality and customer satisfaction. Let us show you what we can do.", align: "center" } },
            { id: uid(), type: "button", props: { label: "Get Started", config: { url: "#contact", variant: "filled", size: "lg" }, align: "center" } },
          ],
        },
      ],
      gap: 24,
      maxWidth: "lg",
      verticalAlign: "center",
    }),
    blockStyle: { paddingTop: 80, paddingBottom: 80 },
  },

  {
    id: "hero-split",
    name: "Hero Split",
    description: "Heading + text + button on the left, image on the right",
    emoji: "⬛",
    category: "Hero",
    content: () => ({
      columns: [
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "heading", props: { text: "Transform Your Space", level: 1, align: "left" } },
            { id: uid(), type: "paragraph", props: { text: "Professional service you can trust. We bring craftsmanship and care to every project, big or small.", align: "left" } },
            { id: uid(), type: "button", props: { label: "Get a Free Quote", config: { url: "#contact", variant: "filled", size: "lg" }, align: "left" } },
          ],
        },
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=80", alt: "Professional work", width: "full", objectFit: "cover", borderRadius: 12 } },
          ],
        },
      ],
      gap: 48,
      maxWidth: "xl",
      verticalAlign: "center",
    }),
    blockStyle: { paddingTop: 64, paddingBottom: 64 },
  },

  {
    id: "features-grid",
    name: "Features Grid",
    description: "Three columns — icon, heading, and description per feature",
    emoji: "✨",
    category: "Layout",
    content: () => ({
      columns: [
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "icon", props: { emoji: "🏆", size: 40, align: "center" } },
            { id: uid(), type: "heading", props: { text: "Top Quality", level: 3, align: "center" } },
            { id: uid(), type: "paragraph", props: { text: "We use only the best materials and proven techniques to ensure every job meets the highest standards.", align: "center" } },
          ],
        },
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "icon", props: { emoji: "⚡", size: 40, align: "center" } },
            { id: uid(), type: "heading", props: { text: "Fast Turnaround", level: 3, align: "center" } },
            { id: uid(), type: "paragraph", props: { text: "We respect your time. Projects are completed on schedule so you can get back to what matters most.", align: "center" } },
          ],
        },
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "icon", props: { emoji: "💰", size: 40, align: "center" } },
            { id: uid(), type: "heading", props: { text: "Fair Pricing", level: 3, align: "center" } },
            { id: uid(), type: "paragraph", props: { text: "Transparent quotes with no hidden fees. You always know exactly what you're paying for.", align: "center" } },
          ],
        },
      ],
      gap: 32,
      maxWidth: "xl",
      verticalAlign: "start",
    }),
    blockStyle: { paddingTop: 64, paddingBottom: 64 },
  },

  {
    id: "testimonials-grid",
    name: "Testimonials",
    description: "Three customer testimonial cards side by side",
    emoji: "💬",
    category: "Social Proof",
    content: () => ({
      columns: [
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "testimonial", props: { quote: "Outstanding work from start to finish. The team was professional, on time, and the quality speaks for itself. I'd hire them again in a heartbeat.", author: "Sarah M.", role: "Homeowner", rating: 5 } },
          ],
        },
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "testimonial", props: { quote: "They completed our project ahead of schedule and within budget. Communication was excellent throughout. Highly recommend to anyone!", author: "James K.", role: "Business Owner", rating: 5 } },
          ],
        },
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "testimonial", props: { quote: "Great attention to detail and very fair pricing. Our project turned out better than we imagined. Five stars all the way.", author: "Linda R.", role: "Property Manager", rating: 5 } },
          ],
        },
      ],
      gap: 24,
      maxWidth: "xl",
      verticalAlign: "stretch",
    }),
    blockStyle: { paddingTop: 64, paddingBottom: 64 },
  },

  {
    id: "pricing-cards",
    name: "Pricing",
    description: "Three pricing tier cards with features and CTA",
    emoji: "💳",
    category: "Marketing",
    content: () => ({
      columns: [
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "card", props: { title: "Basic", body: "Perfect for small projects.\n\n✓ Up to 500 sq ft\n✓ Standard materials\n✓ 1-year warranty\n✓ Email support", ctaLabel: "Get a Quote", ctaUrl: "#contact" } },
          ],
        },
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "card", props: { title: "Standard", body: "Our most popular package.\n\n✓ Up to 1,500 sq ft\n✓ Premium materials\n✓ 3-year warranty\n✓ Priority support", ctaLabel: "Get a Quote", ctaUrl: "#contact" } },
          ],
        },
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "card", props: { title: "Premium", body: "For large or complex jobs.\n\n✓ Unlimited square footage\n✓ Top-grade materials\n✓ 5-year warranty\n✓ Dedicated project manager", ctaLabel: "Get a Quote", ctaUrl: "#contact" } },
          ],
        },
      ],
      gap: 24,
      maxWidth: "xl",
      verticalAlign: "stretch",
    }),
    blockStyle: { paddingTop: 64, paddingBottom: 64 },
  },

  {
    id: "cta-banner",
    name: "CTA Banner",
    description: "Full-width call-to-action with heading and button on a dark background",
    emoji: "📣",
    category: "Marketing",
    content: () => ({
      columns: [
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "heading", props: { text: "Ready to Get Started?", level: 2, align: "center", style: { color: "#ffffff" } } },
            { id: uid(), type: "paragraph", props: { text: "Contact us today for a free estimate. No obligation, no pressure — just honest advice.", align: "center", style: { color: "#e5e7eb" } } },
            { id: uid(), type: "button", props: { label: "Contact Us Now", config: { url: "#contact", variant: "filled", size: "lg" }, align: "center" } },
          ],
        },
      ],
      gap: 24,
      maxWidth: "lg",
      verticalAlign: "center",
    }),
    blockStyle: { bgType: "color", bgColor: "#1f2937", paddingTop: 72, paddingBottom: 72 },
  },

  {
    id: "team-section",
    name: "Team Section",
    description: "Four team member cards with photo, name, and role",
    emoji: "👥",
    category: "Business",
    content: () => ({
      columns: [
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80", alt: "Team member", width: "full", objectFit: "cover", borderRadius: 100 } },
            { id: uid(), type: "heading", props: { text: "Alex Johnson", level: 4, align: "center" } },
            { id: uid(), type: "paragraph", props: { text: "Founder & Lead", align: "center" } },
          ],
        },
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80", alt: "Team member", width: "full", objectFit: "cover", borderRadius: 100 } },
            { id: uid(), type: "heading", props: { text: "Maria Garcia", level: 4, align: "center" } },
            { id: uid(), type: "paragraph", props: { text: "Project Manager", align: "center" } },
          ],
        },
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&q=80", alt: "Team member", width: "full", objectFit: "cover", borderRadius: 100 } },
            { id: uid(), type: "heading", props: { text: "Chris Lee", level: 4, align: "center" } },
            { id: uid(), type: "paragraph", props: { text: "Senior Technician", align: "center" } },
          ],
        },
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&q=80", alt: "Team member", width: "full", objectFit: "cover", borderRadius: 100 } },
            { id: uid(), type: "heading", props: { text: "Jordan Smith", level: 4, align: "center" } },
            { id: uid(), type: "paragraph", props: { text: "Customer Success", align: "center" } },
          ],
        },
      ],
      gap: 32,
      maxWidth: "xl",
      verticalAlign: "start",
    }),
    blockStyle: { paddingTop: 64, paddingBottom: 64 },
  },

  {
    id: "faq",
    name: "FAQ",
    description: "Two-column FAQ layout with questions and answers",
    emoji: "❓",
    category: "Business",
    content: () => ({
      columns: [
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "heading", props: { text: "How long does a typical project take?", level: 4, align: "left" } },
            { id: uid(), type: "paragraph", props: { text: "Most residential projects are completed within 1–3 days depending on scope. We'll give you a firm timeline during your free estimate.", align: "left" } },
            { id: uid(), type: "divider", props: { color: "#e5e7eb", thickness: 1, marginY: 16 } },
            { id: uid(), type: "heading", props: { text: "Do you offer a warranty?", level: 4, align: "left" } },
            { id: uid(), type: "paragraph", props: { text: "Yes! All of our work is backed by a minimum 1-year workmanship warranty. Premium packages include extended coverage.", align: "left" } },
            { id: uid(), type: "divider", props: { color: "#e5e7eb", thickness: 1, marginY: 16 } },
            { id: uid(), type: "heading", props: { text: "How do I get a quote?", level: 4, align: "left" } },
            { id: uid(), type: "paragraph", props: { text: "Simply fill out our contact form or give us a call. We'll schedule a free on-site assessment and get you a detailed quote within 24 hours.", align: "left" } },
          ],
        },
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "heading", props: { text: "Are you licensed and insured?", level: 4, align: "left" } },
            { id: uid(), type: "paragraph", props: { text: "Absolutely. We are fully licensed, bonded, and insured. Copies of our certificates are available upon request.", align: "left" } },
            { id: uid(), type: "divider", props: { color: "#e5e7eb", thickness: 1, marginY: 16 } },
            { id: uid(), type: "heading", props: { text: "Do I need to be home during the project?", level: 4, align: "left" } },
            { id: uid(), type: "paragraph", props: { text: "For most exterior work, you don't need to be present. For interior projects, we'll coordinate a schedule that works for you.", align: "left" } },
            { id: uid(), type: "divider", props: { color: "#e5e7eb", thickness: 1, marginY: 16 } },
            { id: uid(), type: "heading", props: { text: "What payment methods do you accept?", level: 4, align: "left" } },
            { id: uid(), type: "paragraph", props: { text: "We accept cash, check, and all major credit cards. Financing options are also available for qualifying projects.", align: "left" } },
          ],
        },
      ],
      gap: 48,
      maxWidth: "xl",
      verticalAlign: "start",
    }),
    blockStyle: { paddingTop: 64, paddingBottom: 64 },
  },

  {
    id: "contact-form",
    name: "Contact Form",
    description: "Form on the left, map and contact info on the right",
    emoji: "📬",
    category: "Contact",
    content: () => ({
      columns: [
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "heading", props: { text: "Get in Touch", level: 2, align: "left" } },
            { id: uid(), type: "paragraph", props: { text: "Fill out the form and we'll get back to you within one business day.", align: "left" } },
            { id: uid(), type: "form", props: { heading: "", submitLabel: "Send Message", nameField: true, emailField: true, phoneField: true, messageField: true } },
          ],
        },
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "heading", props: { text: "Our Location", level: 3, align: "left" } },
            { id: uid(), type: "map", props: { address: "123 Main Street, Anytown, USA", height: 240 } },
            { id: uid(), type: "paragraph", props: { text: "📍 123 Main Street, Anytown, USA\n📞 (555) 123-4567\n✉️ hello@yourbusiness.com\n\n⏰ Mon–Fri: 8am – 6pm\n    Sat: 9am – 4pm", align: "left" } },
          ],
        },
      ],
      gap: 48,
      maxWidth: "xl",
      verticalAlign: "start",
    }),
    blockStyle: { paddingTop: 64, paddingBottom: 64 },
  },

  {
    id: "gallery-grid",
    name: "Gallery Grid",
    description: "Three-column image grid for showcasing work",
    emoji: "🖼️",
    category: "Media",
    content: () => ({
      columns: [
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600&q=80", alt: "Project photo", width: "full", objectFit: "cover", borderRadius: 8 } },
            { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&q=80", alt: "Project photo", width: "full", objectFit: "cover", borderRadius: 8 } },
          ],
        },
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=600&q=80", alt: "Project photo", width: "full", objectFit: "cover", borderRadius: 8 } },
            { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80", alt: "Project photo", width: "full", objectFit: "cover", borderRadius: 8 } },
          ],
        },
        {
          id: uid(),
          widthRatio: 1,
          components: [
            { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=600&q=80", alt: "Project photo", width: "full", objectFit: "cover", borderRadius: 8 } },
            { id: uid(), type: "image", props: { url: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=80", alt: "Project photo", width: "full", objectFit: "cover", borderRadius: 8 } },
          ],
        },
      ],
      gap: 16,
      maxWidth: "xl",
      verticalAlign: "start",
    }),
    blockStyle: { paddingTop: 48, paddingBottom: 48 },
  },
];
