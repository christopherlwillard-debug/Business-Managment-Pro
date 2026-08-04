/**
 * landingPageProfiles.ts — M11: AI Landing Pages
 *
 * Defines the 8 promotional landing page types available in the "Generate
 * Landing Page" workflow. Each profile drives:
 *   • Which section types are assembled on the generated page (sectionTypes)
 *   • The offer angle, urgency language, and CTA copy hints fed into the AI prompt
 *
 * The backend POST /api/website/generate-landing-page reads these profiles
 * and generates populated section content via OpenAI structured output.
 */

export interface LandingPageProfile {
  id: string;
  name: string;
  emoji: string;
  /** Slug auto-assigned when adding the page; user can rename it after. */
  defaultSlug: string;
  tagline: string;
  description: string;
  /**
   * Ordered list of section types to include on the generated page.
   * Maps to Section["type"] in WebsiteEditor.
   * The backend uses this list to assemble the final SitePage.
   */
  sectionTypes: LandingPageSectionSpec[];
  copyHints: {
    /** The primary offer or value proposition angle to lead with */
    offerAngle: string;
    /** Urgency/scarcity language cues to inject */
    urgencyLanguage?: string;
    /** Primary CTA button label suggestion */
    ctaCopy: string;
    /** Secondary CTA label suggestion */
    secondaryCta?: string;
    /** Who this page is trying to convert */
    targetAudience: string;
    /** Additional tone/content notes for the AI */
    extraNotes?: string;
  };
}

export type LandingPageSectionSpec =
  | "alert-bar"
  | "hero"
  | "features"
  | "stats"
  | "faq"
  | "cta"
  | "contact";

export const LANDING_PAGE_PROFILES: LandingPageProfile[] = [
  {
    id: "spring-promotion",
    name: "Spring Promotion",
    emoji: "🌸",
    defaultSlug: "spring-special",
    tagline: "Limited-time spring offers that drive bookings now.",
    description: "Seasonal promotion page for spring services — deck prep, exterior work, HVAC tune-ups, landscaping, or anything that spikes in spring demand.",
    sectionTypes: ["alert-bar", "hero", "features", "stats", "cta", "contact"],
    copyHints: {
      offerAngle: "Limited-time spring promotion — book now to secure your spot before the season fills up.",
      urgencyLanguage: "spots are filling fast, limited spring availability, book by April 30",
      ctaCopy: "Claim Your Spring Discount",
      secondaryCta: "View Available Dates",
      targetAudience: "homeowners looking to refresh or repair their property after winter",
      extraNotes: "Emphasize seasonal timing, fresh start, and value. Mention a free estimate or spring discount. Keep the urgency genuine — not pushy.",
    },
  },
  {
    id: "winter-specials",
    name: "Winter Specials",
    emoji: "❄️",
    defaultSlug: "winter-special",
    tagline: "Off-season deals that keep your pipeline full all winter.",
    description: "Promote winter service specials — heating maintenance, weatherproofing, storm prep, snow removal, or slow-season discounts.",
    sectionTypes: ["alert-bar", "hero", "features", "stats", "cta", "contact"],
    copyHints: {
      offerAngle: "Winter special pricing — lock in your rate before the cold hits or take advantage of slower scheduling windows.",
      urgencyLanguage: "limited winter slots, act before the cold season rush, save before prices rise in spring",
      ctaCopy: "Get Your Winter Estimate",
      secondaryCta: "Schedule a Winter Checkup",
      targetAudience: "homeowners preparing for winter or looking for off-season savings",
      extraNotes: "Focus on protection, preparedness, and peace of mind. Mention what happens if they wait — frozen pipes, higher repair costs, etc.",
    },
  },
  {
    id: "financing",
    name: "Financing Available",
    emoji: "💳",
    defaultSlug: "financing",
    tagline: "Remove price as an objection with a dedicated financing page.",
    description: "Explain financing options, answer payment questions, and convert visitors who would have left due to upfront cost concerns.",
    sectionTypes: ["hero", "features", "faq", "cta", "contact"],
    copyHints: {
      offerAngle: "Don't let budget hold you back — flexible payment plans make the project affordable today.",
      urgencyLanguage: "don't wait on repairs that cost more later, protect your investment now",
      ctaCopy: "Explore Financing Options",
      secondaryCta: "Get a Free Estimate",
      targetAudience: "homeowners who want the work done but are hesitant about upfront cost",
      extraNotes: "Keep tone reassuring and low-pressure. Focus on affordability, low monthly payments, and no surprises. FAQ should cover: how financing works, what credit score is needed, how to apply, what's included.",
    },
  },
  {
    id: "veteran-discount",
    name: "Veteran Discount",
    emoji: "🪖",
    defaultSlug: "veteran-discount",
    tagline: "Honor those who served with a dedicated discount page.",
    description: "A dedicated page for your military and veteran discount — builds trust with veteran families and shows community commitment.",
    sectionTypes: ["hero", "features", "stats", "faq", "cta", "contact"],
    copyHints: {
      offerAngle: "A dedicated discount for veterans, active military, and their families — our way of saying thank you for your service.",
      urgencyLanguage: "apply today, present ID at time of service",
      ctaCopy: "Claim Your Veteran Discount",
      secondaryCta: "Call Us Today",
      targetAudience: "veterans, active duty military, first responders, and their families",
      extraNotes: "Tone should be respectful, genuine, and grateful — never salesy. Include eligibility requirements (what ID to bring). If the owner is a veteran, mention it. Mention discount percentage if applicable.",
    },
  },
  {
    id: "dealer-program",
    name: "Dealer Program",
    emoji: "🤝",
    defaultSlug: "dealer-program",
    tagline: "Attract business partners and referral sources with a B2B page.",
    description: "A landing page for dealer relationships, referral partnerships, or builder/developer programs.",
    sectionTypes: ["hero", "features", "stats", "cta", "contact"],
    copyHints: {
      offerAngle: "Partner with us to grow your business — reliable service, competitive rates, and a team that delivers for your clients.",
      urgencyLanguage: "limited dealer territories available, apply to become a preferred partner",
      ctaCopy: "Apply to Become a Dealer",
      secondaryCta: "Download Program Overview",
      targetAudience: "real estate agents, builders, developers, retailers, and referral partners",
      extraNotes: "Focus on mutual benefit: reliable service for their clients, referral commissions or wholesale pricing. Mention training, support, and territory exclusivity where applicable. Use professional, B2B-appropriate language.",
    },
  },
  {
    id: "employment",
    name: "Employment / Careers",
    emoji: "👷",
    defaultSlug: "careers",
    tagline: "Attract quality technicians and crew with a professional hiring page.",
    description: "A job-listing page that showcases your company culture, benefits, and open positions to attract skilled tradespeople.",
    sectionTypes: ["hero", "features", "stats", "cta", "contact"],
    copyHints: {
      offerAngle: "Join a team that values your skills, pays fairly, and treats you like family.",
      urgencyLanguage: "we're hiring now, positions filling quickly, apply today",
      ctaCopy: "Apply Now",
      secondaryCta: "Learn About Our Benefits",
      targetAudience: "skilled tradespeople, technicians, installers, and drivers looking for stable employment",
      extraNotes: "Emphasize: competitive pay, consistent work, tight-knit culture, growth opportunities, and benefits. Avoid corporate HR language — talk like a person. Mention training, tools provided, and vehicle if applicable.",
    },
  },
  {
    id: "referral-program",
    name: "Referral Program",
    emoji: "🎁",
    defaultSlug: "refer-a-friend",
    tagline: "Turn happy customers into a steady source of new leads.",
    description: "A referral program page that explains the reward, makes it easy to refer, and reinforces trust in the brand.",
    sectionTypes: ["hero", "features", "stats", "cta", "contact"],
    copyHints: {
      offerAngle: "Know someone who needs our services? Send them our way and earn a reward — no catch.",
      urgencyLanguage: "refer today, earn on every completed job, no limit on referrals",
      ctaCopy: "Refer a Friend Now",
      secondaryCta: "Learn How It Works",
      targetAudience: "existing happy customers who know homeowners needing services",
      extraNotes: "Keep it simple. Explain the reward clearly (cash, account credit, gift card). Show the 3-step process (refer → they get a quote → you earn). Mention no strings attached and that the reward pays after job completion.",
    },
  },
  {
    id: "emergency-service",
    name: "Emergency Service",
    emoji: "🚨",
    defaultSlug: "emergency-service",
    tagline: "Convert panicked searchers into same-day bookings.",
    description: "A high-urgency landing page for emergency calls — storm damage, burst pipes, power outages, HVAC failures, and other urgent situations.",
    sectionTypes: ["alert-bar", "hero", "features", "stats", "cta", "contact"],
    copyHints: {
      offerAngle: "24/7 emergency service — we respond fast, fix it right, and get you back to normal.",
      urgencyLanguage: "call now, available 24/7, same-day response, emergency dispatch standing by",
      ctaCopy: "Call for Emergency Service",
      secondaryCta: "Request Immediate Callback",
      targetAudience: "homeowners experiencing an urgent, stressful service failure right now",
      extraNotes: "Tone: calm, competent, and reassuring. Lead with the phone number and response time. Don't waste words — panicked visitors scan, not read. Emphasize speed, reliability, 24/7 availability, and local presence.",
    },
  },
];

export const LANDING_PAGE_PROFILES_BY_ID: Record<string, LandingPageProfile> = Object.fromEntries(
  LANDING_PAGE_PROFILES.map(p => [p.id, p])
);
