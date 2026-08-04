/**
 * Phase 5 M1 – AI Website Wizard
 *
 * Multi-step wizard that gathers business details before AI-driven site
 * generation. Pre-populates fields from BuildPro data (M2). On "Generate
 * Website" the calling component calls generate-full-site (M3) →
 * generate-site-copy (M4) → suggest-colors (M7) and loads the result.
 *
 * Steps:
 *   1. Business Info  — name, type, phone, email, address, years, veteran
 *   2. Services       — services list, commercial/residential, coverage areas
 *   3. Style          — brand color, font, logo, website goal, preferred style
 *   4. Review         — social links, hours, summary → Generate / blank-canvas
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X, Sparkles, Loader2, Info, Check, ChevronRight, ChevronLeft,
  Building2, Wrench, Palette, ClipboardList,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DayHours {
  day: string;
  open: string;
  close: string;
  closed: boolean;
}

export interface BusinessProfilePrefill {
  businessName:  string | null;
  tagline:       string | null;
  phone:         string | null;
  email:         string | null;
  address:       string | null;
  services:      string[];
  coverageAreas: string[];
  coverageStates: string[];
  brandColor:    string | null;
  fontFamily:    string | null;
  themeId:       string | null;
  logoUrl:       string | null;
  socialLinks:   Array<{ platform: string; url: string }>;
  workingHours:  DayHours[] | null;
  inferred:      string[];
}

export interface WizardFormValues {
  // Step 1 — Business Info
  businessName:         string;
  businessType:         string;
  tagline:              string;
  phone:                string;
  email:                string;
  address:              string;
  yearsInBusiness:      string;
  isVeteranOwned:       boolean;
  // Step 2 — Services
  services:             string;   // newline-separated
  commercialResidential: "residential" | "commercial" | "both";
  coverageAreas:        string;   // newline-separated
  manufacturers:        string;   // optional, for MH
  paymentOptions:       string[];
  photosAvailable:      boolean;
  // Step 3 — Style
  brandColor:           string;
  fontFamily:           string;
  logoUrl:              string;
  websiteGoal:          string;
  preferredStyle:       string;
  // Step 4 — Review
  facebook:             string;
  instagram:            string;
  linkedin:             string;
  twitter:              string;
  youtube:              string;
  googleBusiness:       string;
  workingHours:         DayHours[];
}

interface Props {
  businessId: number;
  onClose: () => void;
  /** Called when the user hits "Generate Website" on the Review step. */
  onGenerate: (values: WizardFormValues, prefill: BusinessProfilePrefill) => void;
  /** Optional escape hatch to the old template picker. */
  onSkipToTemplate?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_HOURS: DayHours[] = [
  { day: "Monday",    open: "8:00 AM", close: "5:00 PM", closed: false },
  { day: "Tuesday",   open: "8:00 AM", close: "5:00 PM", closed: false },
  { day: "Wednesday", open: "8:00 AM", close: "5:00 PM", closed: false },
  { day: "Thursday",  open: "8:00 AM", close: "5:00 PM", closed: false },
  { day: "Friday",    open: "8:00 AM", close: "5:00 PM", closed: false },
  { day: "Saturday",  open: "9:00 AM", close: "2:00 PM", closed: false },
  { day: "Sunday",    open: "",        close: "",         closed: true  },
];

const BUSINESS_TYPES = [
  { value: "general-contractor",  label: "General Contractor" },
  { value: "manufactured-home",   label: "Manufactured Home Installer" },
  { value: "hvac",                label: "HVAC" },
  { value: "roofing",             label: "Roofing" },
  { value: "plumbing",            label: "Plumbing" },
  { value: "electrical",          label: "Electrical" },
  { value: "landscaping",         label: "Landscaping" },
  { value: "flooring",            label: "Flooring" },
  { value: "painting",            label: "Painting" },
  { value: "asphalt-sealing",     label: "Asphalt / Paving" },
  { value: "other",               label: "Other" },
];

const PAYMENT_OPTIONS = ["Cash", "Check", "Credit Card", "Financing", "Venmo / Zelle", "Square"];

const WEBSITE_GOALS = [
  { value: "leads",        label: "Get more leads",          emoji: "📋" },
  { value: "showcase",     label: "Showcase my work",        emoji: "🏆" },
  { value: "appointments", label: "Book appointments online", emoji: "📅" },
  { value: "credibility",  label: "Build credibility",       emoji: "⭐" },
];

const PREFERRED_STYLES = [
  {
    value: "modern",
    label: "Modern & Clean",
    desc: "White background, clean lines, professional look",
    swatches: ["#2563eb", "#1e40af", "#60a5fa", "#ffffff", "#f8fafc"],
  },
  {
    value: "deep",
    label: "Deep & Bold",
    desc: "Dark background, high contrast, authoritative",
    swatches: ["#3b82f6", "#2563eb", "#60a5fa", "#0f172a", "#1e293b"],
  },
  {
    value: "bold",
    label: "Bold Contrast",
    desc: "Saturated colors, strong CTAs, eye-catching",
    swatches: ["#dc2626", "#991b1b", "#22c55e", "#ffffff", "#fef2f2"],
  },
  {
    value: "muted",
    label: "Muted Professional",
    desc: "Understated, premium feel, specialist industries",
    swatches: ["#64748b", "#475569", "#94a3b8", "#fafafa", "#f1f5f9"],
  },
];

const FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Poppins", "Raleway",
  "Montserrat", "Playfair Display", "Merriweather", "Source Serif 4",
];

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { id: "info",     label: "Business Info", Icon: Building2,     shortLabel: "Info"    },
  { id: "services", label: "Services",       Icon: Wrench,        shortLabel: "Services" },
  { id: "style",    label: "Style",          Icon: Palette,       shortLabel: "Style"   },
  { id: "review",   label: "Review",         Icon: ClipboardList, shortLabel: "Review"  },
];

// ── Helper components ─────────────────────────────────────────────────────────

function ProvenanceBadge({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 select-none">
      <Check className="w-2.5 h-2.5" />
      From your profile
    </span>
  );
}

function Field({ label, name, inferred, optional, children }: {
  label: string;
  name: string;
  inferred: Set<string>;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {optional && <span className="text-[10px] text-muted-foreground">(optional)</span>}
        <ProvenanceBadge visible={inferred.has(name)} />
      </div>
      {children}
    </div>
  );
}

const input = "w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary transition-shadow";
const textarea = input + " resize-none";
const select  = input + " cursor-pointer";

// ── Main wizard component ─────────────────────────────────────────────────────

export function AIWebsiteWizard({ businessId, onClose, onGenerate, onSkipToTemplate }: Props) {
  const [step, setStep] = useState(0);
  const [inferred, setInferred] = useState<Set<string>>(new Set());
  const [prefillData, setPrefillData] = useState<BusinessProfilePrefill | null>(null);
  const [values, setValues] = useState<WizardFormValues>({
    businessName:          "",
    businessType:          "",
    tagline:               "",
    phone:                 "",
    email:                 "",
    address:               "",
    yearsInBusiness:       "",
    isVeteranOwned:        false,
    services:              "",
    commercialResidential: "both",
    coverageAreas:         "",
    manufacturers:         "",
    paymentOptions:        [],
    photosAvailable:       true,
    brandColor:            "#1a1a2e",
    fontFamily:            "Inter",
    logoUrl:               "",
    websiteGoal:           "leads",
    preferredStyle:        "modern",
    facebook:              "",
    instagram:             "",
    linkedin:              "",
    twitter:               "",
    youtube:               "",
    googleBusiness:        "",
    workingHours:          DEFAULT_HOURS.map(d => ({ ...d })),
  });

  const { data, isLoading, isError } = useQuery<BusinessProfilePrefill>({
    queryKey: ["business-profile-prefill", businessId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/website/business-profile-prefill?businessId=${businessId}`);
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!data) return;
    setPrefillData(data);
    setInferred(new Set(data.inferred));
    setValues(prev => ({
      ...prev,
      businessName:  data.businessName  ?? prev.businessName,
      phone:         data.phone         ?? prev.phone,
      email:         data.email         ?? prev.email,
      address:       data.address       ?? prev.address,
      brandColor:    data.brandColor    ?? prev.brandColor,
      fontFamily:    data.fontFamily    ?? prev.fontFamily,
      tagline:       data.tagline       ?? prev.tagline,
      logoUrl:       data.logoUrl       ?? prev.logoUrl,
      services:      data.services.length > 0
        ? data.services.join("\n")
        : prev.services,
      coverageAreas: [...data.coverageAreas, ...data.coverageStates].length > 0
        ? [...data.coverageAreas, ...data.coverageStates].join("\n")
        : prev.coverageAreas,
      facebook:      data.socialLinks.find(s => s.platform === "facebook")?.url  ?? prev.facebook,
      instagram:     data.socialLinks.find(s => s.platform === "instagram")?.url ?? prev.instagram,
      linkedin:      data.socialLinks.find(s => s.platform === "linkedin")?.url  ?? prev.linkedin,
      twitter:       data.socialLinks.find(s => s.platform === "twitter")?.url   ?? prev.twitter,
      youtube:       data.socialLinks.find(s => s.platform === "youtube")?.url   ?? prev.youtube,
      workingHours:  data.workingHours ?? prev.workingHours,
    }));
  }, [data]);

  function set<K extends keyof WizardFormValues>(key: K, value: WizardFormValues[K]) {
    setValues(prev => ({ ...prev, [key]: value }));
    setInferred(prev => { const n = new Set(prev); n.delete(key); return n; });
  }

  function togglePayment(opt: string) {
    setValues(prev => ({
      ...prev,
      paymentOptions: prev.paymentOptions.includes(opt)
        ? prev.paymentOptions.filter(p => p !== opt)
        : [...prev.paymentOptions, opt],
    }));
  }

  function setHoursRow(idx: number, patch: Partial<DayHours>) {
    setValues(prev => ({
      ...prev,
      workingHours: prev.workingHours.map((h, i) => i === idx ? { ...h, ...patch } : h),
    }));
  }

  // ── Step content ─────────────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <div className="space-y-4">
        <Field label="Business Name" name="businessName" inferred={inferred}>
          <input className={input} value={values.businessName} onChange={e => set("businessName", e.target.value)} placeholder="e.g. Smith Roofing" />
        </Field>

        <Field label="Business Type" name="businessType" inferred={inferred}>
          <select className={select} value={values.businessType} onChange={e => set("businessType", e.target.value)}>
            <option value="">Select your trade…</option>
            {BUSINESS_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" name="phone" inferred={inferred}>
            <input className={input} type="tel" value={values.phone} onChange={e => set("phone", e.target.value)} placeholder="(555) 000-0000" />
          </Field>
          <Field label="Email" name="email" inferred={inferred}>
            <input className={input} type="email" value={values.email} onChange={e => set("email", e.target.value)} placeholder="you@example.com" />
          </Field>
        </div>

        <Field label="Address or City, State" name="address" inferred={inferred} optional>
          <input className={input} value={values.address} onChange={e => set("address", e.target.value)} placeholder="Louisville, KY" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Years in Business" name="yearsInBusiness" inferred={inferred} optional>
            <input className={input} type="number" min="0" max="100" value={values.yearsInBusiness} onChange={e => set("yearsInBusiness", e.target.value)} placeholder="e.g. 12" />
          </Field>
          <Field label="Tagline" name="tagline" inferred={inferred} optional>
            <input className={input} value={values.tagline} onChange={e => set("tagline", e.target.value)} placeholder="Quality work, honest pricing" />
          </Field>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={values.isVeteranOwned}
            onChange={e => set("isVeteranOwned", e.target.checked)}
            className="w-4 h-4 rounded accent-primary"
          />
          <span className="text-sm text-foreground">🪖 Veteran-owned business</span>
        </label>
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="space-y-4">
        <Field label="Services you offer" name="services" inferred={inferred}>
          <textarea
            className={textarea}
            rows={6}
            value={values.services}
            onChange={e => set("services", e.target.value)}
            placeholder={"Roof Replacement\nStorm Damage Repair\nRoof Inspections\nGutter Installation"}
          />
          <p className="text-[11px] text-muted-foreground">One service per line — these become cards in your Services section.</p>
        </Field>

        <div>
          <label className="text-sm font-medium text-foreground block mb-2">Customers you serve</label>
          <div className="flex gap-2">
            {(["residential", "commercial", "both"] as const).map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => set("commercialResidential", opt)}
                className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors capitalize ${
                  values.commercialResidential === opt
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                {opt === "both" ? "Both" : opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <Field label="Service areas" name="coverageAreas" inferred={inferred} optional>
          <textarea
            className={textarea}
            rows={3}
            value={values.coverageAreas}
            onChange={e => set("coverageAreas", e.target.value)}
            placeholder={"Louisville, KY\nSouthern Indiana\nJefferson County"}
          />
          <p className="text-[11px] text-muted-foreground">One area per line.</p>
        </Field>

        <div>
          <label className="text-sm font-medium text-foreground block mb-2">Payment options accepted</label>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => togglePayment(opt)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  values.paymentOptions.includes(opt)
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                {values.paymentOptions.includes(opt) ? "✓ " : ""}{opt}
              </button>
            ))}
          </div>
        </div>

        <Field label="Brands or manufacturers" name="manufacturers" inferred={inferred} optional>
          <input className={input} value={values.manufacturers} onChange={e => set("manufacturers", e.target.value)} placeholder="e.g. Clayton, Skyline, American Standard…" />
        </Field>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={values.photosAvailable}
            onChange={e => set("photosAvailable", e.target.checked)}
            className="w-4 h-4 rounded accent-primary"
          />
          <span className="text-sm text-foreground">📸 I have photos to upload later</span>
        </label>
      </div>
    );
  }

  function renderStep3() {
    return (
      <div className="space-y-5">
        {/* Website goal */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-2">Website goal</label>
          <div className="grid grid-cols-2 gap-2">
            {WEBSITE_GOALS.map(g => (
              <button
                key={g.value}
                type="button"
                onClick={() => set("websiteGoal", g.value)}
                className={`flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg border transition-colors text-left ${
                  values.websiteGoal === g.value
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                <span className="text-base">{g.emoji}</span>
                <span className="leading-tight text-xs">{g.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Style picker */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-2">Visual style</label>
          <div className="grid grid-cols-2 gap-2">
            {PREFERRED_STYLES.map(s => (
              <button
                key={s.value}
                type="button"
                onClick={() => set("preferredStyle", s.value)}
                className={`rounded-xl border text-left overflow-hidden transition-all ${
                  values.preferredStyle === s.value
                    ? "border-primary ring-1 ring-primary/30"
                    : "border-border hover:border-primary/40"
                }`}
              >
                {/* Color swatches */}
                <div className="flex h-8">
                  {s.swatches.map((c, i) => (
                    <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="px-2.5 py-2">
                  <p className="text-xs font-semibold text-foreground">{s.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{s.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Brand color + font */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand Color" name="brandColor" inferred={inferred}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={values.brandColor}
                onChange={e => set("brandColor", e.target.value)}
                className="w-9 h-9 rounded border border-border cursor-pointer p-0.5 bg-background flex-shrink-0"
              />
              <input
                className={input + " font-mono"}
                value={values.brandColor}
                onChange={e => set("brandColor", e.target.value)}
                placeholder="#1a1a2e"
                maxLength={7}
              />
            </div>
          </Field>
          <Field label="Font Family" name="fontFamily" inferred={inferred}>
            <select className={select} value={values.fontFamily} onChange={e => set("fontFamily", e.target.value)}>
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Logo URL" name="logoUrl" inferred={inferred} optional>
          <input
            className={input}
            value={values.logoUrl}
            onChange={e => set("logoUrl", e.target.value)}
            placeholder="https://… or leave blank to upload later"
            type="url"
          />
          {values.logoUrl && (
            <div className="mt-1.5 flex items-center gap-2 p-2 bg-muted/40 rounded-lg border border-border">
              <img
                src={values.logoUrl}
                alt="Logo preview"
                className="h-8 w-auto object-contain rounded"
                onError={e => (e.currentTarget.style.display = "none")}
              />
              <p className="text-[11px] text-muted-foreground">Preview.</p>
            </div>
          )}
        </Field>
      </div>
    );
  }

  function renderStep4() {
    return (
      <div className="space-y-4">
        {/* Summary card */}
        <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground mb-2">Ready to generate:</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {[
              ["Business", values.businessName || "—"],
              ["Type",     BUSINESS_TYPES.find(b => b.value === values.businessType)?.label || (values.businessType || "—")],
              ["Goal",     WEBSITE_GOALS.find(g => g.value === values.websiteGoal)?.label || "—"],
              ["Style",    PREFERRED_STYLES.find(s => s.value === values.preferredStyle)?.label || "—"],
              ["Services", values.services ? `${values.services.split("\n").filter(Boolean).length} listed` : "—"],
              ["Coverage", values.coverageAreas ? `${values.coverageAreas.split("\n").filter(Boolean).length} areas` : "—"],
              ["Years",    values.yearsInBusiness || "—"],
              ["Veteran",  values.isVeteranOwned ? "Yes 🪖" : "No"],
            ].map(([label, val]) => (
              <div key={label} className="flex gap-1">
                <span className="font-medium text-foreground">{label}:</span>
                <span className="truncate">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Social links */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-2">Social media <span className="text-muted-foreground font-normal text-xs">(optional)</span></label>
          <div className="space-y-2">
            {(
              [
                { key: "facebook",       placeholder: "Facebook URL"      },
                { key: "instagram",      placeholder: "Instagram URL"     },
                { key: "googleBusiness", placeholder: "Google Business profile URL" },
              ] as const
            ).map(({ key, placeholder }) => (
              <input
                key={key}
                className={input}
                value={values[key]}
                onChange={e => set(key, e.target.value)}
                placeholder={placeholder}
                type="url"
              />
            ))}
          </div>
        </div>

        {/* Business hours — compact */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-2">Business hours</label>
          <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {values.workingHours.map((row, idx) => (
              <div key={row.day} className="flex items-center gap-2 px-3 py-1.5 bg-background">
                <button
                  type="button"
                  onClick={() => setHoursRow(idx, { closed: !row.closed })}
                  className={`flex-shrink-0 w-7 h-3.5 rounded-full transition-colors relative ${row.closed ? "bg-muted" : "bg-primary"}`}
                  title={row.closed ? "Mark open" : "Mark closed"}
                >
                  <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${row.closed ? "left-0.5" : "left-[13px]"}`} />
                </button>
                <span className="w-14 text-xs font-medium text-foreground flex-shrink-0">{row.day.slice(0, 3)}</span>
                {row.closed ? (
                  <span className="text-[11px] text-muted-foreground italic">Closed</span>
                ) : (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <input
                      className="flex-1 min-w-0 border border-border rounded px-1.5 py-0.5 text-[11px] bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      value={row.open}
                      onChange={e => setHoursRow(idx, { open: e.target.value })}
                      placeholder="8:00 AM"
                    />
                    <span className="text-[10px] text-muted-foreground">–</span>
                    <input
                      className="flex-1 min-w-0 border border-border rounded px-1.5 py-0.5 text-[11px] bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      value={row.close}
                      onChange={e => setHoursRow(idx, { close: e.target.value })}
                      placeholder="5:00 PM"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderStep() {
    switch (step) {
      case 0: return renderStep1();
      case 1: return renderStep2();
      case 2: return renderStep3();
      case 3: return renderStep4();
      default: return null;
    }
  }

  const isFirst = step === 0;
  const isLast  = step === STEPS.length - 1;

  function handleGenerate() {
    onGenerate(values, prefillData ?? {
      businessName: null, tagline: null, phone: null, email: null, address: null,
      services: [], coverageAreas: [], coverageStates: [],
      brandColor: null, fontFamily: null, themeId: null, logoUrl: null,
      socialLinks: [], workingHours: null, inferred: [],
    });
  }

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-2xl border border-border w-full max-w-lg flex flex-col max-h-[92vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">AI Website Generator</p>
            <p className="text-[11px] text-muted-foreground">Answer a few questions — we'll build your site in seconds</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-muted flex-shrink-0">
          <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        {/* Step tabs */}
        <div className="flex items-center px-5 pt-3 gap-0 flex-shrink-0">
          {STEPS.map((s, idx) => {
            const isActive   = idx === step;
            const isComplete = idx < step;
            const StepIcon   = s.Icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(idx)}
                className={`flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-medium whitespace-nowrap transition-colors flex-shrink-0 border-b-2 -mb-px ${
                  isActive   ? "border-purple-500 text-purple-600"
                  : isComplete ? "border-transparent text-emerald-600 hover:text-emerald-700"
                  : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {isComplete
                  ? <Check className="w-3 h-3" />
                  : <StepIcon className="w-3 h-3" />
                }
                <span className="hidden sm:inline">{s.shortLabel}</span>
              </button>
            );
          })}
          <div className="flex-1 border-b-2 border-transparent -mb-px" />
        </div>
        <div className="w-full border-b border-border flex-shrink-0" />

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm">Reading your BuildPro profile…</p>
            </div>
          ) : isError ? (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3">
              <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">Couldn't load your profile automatically. Fill in the fields below.</p>
            </div>
          ) : null}

          {!isLoading && renderStep()}

          {/* Prefill note */}
          {!isLoading && !isError && inferred.size > 0 && (
            <div className="mt-4 flex items-start gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
              <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                Fields marked <strong>From your profile</strong> were pulled from BuildPro — edit any of them.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 px-5 py-4 border-t border-border flex-shrink-0 bg-muted/20">
          <div className="flex items-center justify-between gap-3">
            {/* Left: back or step count */}
            {isFirst ? (
              <span className="text-[11px] text-muted-foreground">Step 1 of {STEPS.length}</span>
            ) : (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}

            {/* Right: next or generate */}
            <div className="flex items-center gap-2">
              {isLast ? (
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate Website
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep(s => s + 1)}
                  disabled={isLoading}
                  className="flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Escape hatches */}
          <div className="flex items-center justify-center gap-4">
            {isLast && onSkipToTemplate && (
              <button
                type="button"
                onClick={onSkipToTemplate}
                className="text-[11px] text-muted-foreground hover:text-foreground underline transition-colors"
              >
                Choose a template instead
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] text-muted-foreground hover:text-foreground underline transition-colors"
            >
              Start with blank canvas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
