/**
 * Phase 5 M2 – Smart Business Profile Pre-fill
 *
 * Opens as a modal wizard before AI website generation. On mount it calls
 * GET /api/website/business-profile-prefill to read the user's existing
 * BuildPro data and pre-populates every form field. Auto-filled fields are
 * visually marked with a "Pulled from your BuildPro profile" badge so the user
 * knows what was inferred. Every field remains editable before generation.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X, Sparkles, Loader2, Info, Check, ChevronRight,
  Building2, Grid3x3, MapPin, Clock,
  Share2, Palette, Zap,
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
  // Identity
  businessName:    string | null;
  tagline:         string | null;
  phone:           string | null;
  email:           string | null;
  address:         string | null;
  // Services
  services:        string[];
  // Coverage
  coverageAreas:   string[];
  coverageStates:  string[];
  // Brand
  brandColor:      string | null;
  fontFamily:      string | null;
  themeId:         string | null;
  logoUrl:         string | null;
  // Social
  socialLinks:     Array<{ platform: string; url: string }>;
  // Hours
  workingHours:    DayHours[] | null;
  // Provenance — keys whose values were inferred (vs left empty)
  inferred:        string[];
}

export interface WizardFormValues {
  businessName: string;
  tagline:      string;
  phone:        string;
  email:        string;
  address:      string;
  services:     string;   // newline-separated list for easy editing
  coverageAreas: string;  // newline-separated
  brandColor:   string;
  fontFamily:   string;
  logoUrl:      string;
  facebook:     string;
  instagram:    string;
  linkedin:     string;
  twitter:      string;
  youtube:      string;
  workingHours: DayHours[];
}

interface Props {
  businessId: number;
  onClose: () => void;
  /** Called when the user confirms the pre-filled data and clicks "Generate Website". */
  onGenerate: (values: WizardFormValues, prefill: BusinessProfilePrefill) => void;
}

// ── Default hours ─────────────────────────────────────────────────────────────

const DEFAULT_HOURS: DayHours[] = [
  { day: "Monday",    open: "8:00 AM", close: "5:00 PM", closed: false },
  { day: "Tuesday",   open: "8:00 AM", close: "5:00 PM", closed: false },
  { day: "Wednesday", open: "8:00 AM", close: "5:00 PM", closed: false },
  { day: "Thursday",  open: "8:00 AM", close: "5:00 PM", closed: false },
  { day: "Friday",    open: "8:00 AM", close: "5:00 PM", closed: false },
  { day: "Saturday",  open: "9:00 AM", close: "2:00 PM", closed: false },
  { day: "Sunday",    open: "",        close: "",         closed: true  },
];

// ── Provenance badge ──────────────────────────────────────────────────────────

function ProvenanceBadge({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/40 rounded px-1.5 py-0.5 select-none">
      <Check className="w-2.5 h-2.5" />
      Pulled from your BuildPro profile
    </span>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({
  label,
  name,
  inferred,
  children,
}: {
  label: string;
  name: string;
  inferred: Set<string>;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <ProvenanceBadge visible={inferred.has(name)} />
      </div>
      {children}
    </div>
  );
}

// ── Wizard steps ──────────────────────────────────────────────────────────────

const STEPS = [
  { id: "identity",  label: "Business Info",   Icon: Building2 },
  { id: "services",  label: "Services",         Icon: Grid3x3   },
  { id: "coverage",  label: "Coverage",         Icon: MapPin    },
  { id: "brand",     label: "Brand",            Icon: Palette   },
  { id: "social",    label: "Social",           Icon: Share2    },
  { id: "hours",     label: "Hours",            Icon: Clock     },
];

// ── Main component ────────────────────────────────────────────────────────────

export function AIWebsiteWizard({ businessId, onClose, onGenerate }: Props) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<WizardFormValues>({
    businessName:  "",
    tagline:       "",
    phone:         "",
    email:         "",
    address:       "",
    services:      "",
    coverageAreas: "",
    brandColor:    "#1a1a2e",
    fontFamily:    "Inter",
    logoUrl:       "",
    facebook:      "",
    instagram:     "",
    linkedin:      "",
    twitter:       "",
    youtube:       "",
    workingHours:  DEFAULT_HOURS.map(d => ({ ...d })),
  });
  const [inferred, setInferred] = useState<Set<string>>(new Set());
  const [prefillData, setPrefillData] = useState<BusinessProfilePrefill | null>(null);

  const { data, isLoading, isError } = useQuery<BusinessProfilePrefill>({
    queryKey: ["business-profile-prefill", businessId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/website/business-profile-prefill?businessId=${businessId}`);
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
    staleTime: 60_000,
  });

  // Populate form once prefill data arrives
  useEffect(() => {
    if (!data) return;
    setPrefillData(data);
    const inferredSet = new Set(data.inferred);
    setInferred(inferredSet);
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
      services:      data.services.length > 0 ? data.services.join("\n") : prev.services,
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

  function set(key: keyof WizardFormValues, value: string) {
    setValues(prev => ({ ...prev, [key]: value }));
    // Once the user edits a field manually, clear its provenance badge
    setInferred(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function setHoursRow(idx: number, patch: Partial<DayHours>) {
    setValues(prev => {
      const hours = prev.workingHours.map((h, i) => i === idx ? { ...h, ...patch } : h);
      return { ...prev, workingHours: hours };
    });
    setInferred(prev => { const n = new Set(prev); n.delete("workingHours"); return n; });
  }

  const isLastStep = step === STEPS.length - 1;

  function handleNext() {
    if (isLastStep) {
      onGenerate(values, prefillData ?? {
        businessName: null, tagline: null, phone: null, email: null, address: null,
        services: [], coverageAreas: [], coverageStates: [],
        brandColor: null, fontFamily: null, themeId: null, logoUrl: null,
        socialLinks: [], workingHours: null, inferred: [],
      });
    } else {
      setStep(s => s + 1);
    }
  }

  const inputClass =
    "w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground " +
    "placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary transition-shadow";

  const textareaClass = inputClass + " resize-none";

  // ── Step content ─────────────────────────────────────────────────────────────

  function renderStep() {
    switch (STEPS[step].id) {

      case "identity":
        return (
          <div className="space-y-4">
            <Field label="Business Name" name="businessName" inferred={inferred}>
              <input
                className={inputClass}
                value={values.businessName}
                onChange={e => set("businessName", e.target.value)}
                placeholder="e.g. Smith Contracting"
              />
            </Field>
            <Field label="Tagline" name="tagline" inferred={inferred}>
              <input
                className={inputClass}
                value={values.tagline}
                onChange={e => set("tagline", e.target.value)}
                placeholder="e.g. Quality work, honest pricing"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" name="phone" inferred={inferred}>
                <input
                  className={inputClass}
                  value={values.phone}
                  onChange={e => set("phone", e.target.value)}
                  placeholder="(555) 000-0000"
                  type="tel"
                />
              </Field>
              <Field label="Email" name="email" inferred={inferred}>
                <input
                  className={inputClass}
                  value={values.email}
                  onChange={e => set("email", e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                />
              </Field>
            </div>
            <Field label="Address" name="address" inferred={inferred}>
              <input
                className={inputClass}
                value={values.address}
                onChange={e => set("address", e.target.value)}
                placeholder="123 Main St, Louisville, KY 40201"
              />
            </Field>
          </div>
        );

      case "services":
        return (
          <div className="space-y-4">
            <Field label="Services you offer" name="services" inferred={inferred}>
              <textarea
                className={textareaClass}
                rows={8}
                value={values.services}
                onChange={e => set("services", e.target.value)}
                placeholder={"Asphalt Sealing\nDriveway Repair\nParking Lot Striping"}
              />
              <p className="text-[11px] text-muted-foreground">One service per line. These will become cards in your Services section.</p>
            </Field>
          </div>
        );

      case "coverage":
        return (
          <div className="space-y-4">
            <Field label="Service areas &amp; states" name="coverageAreas" inferred={inferred}>
              <textarea
                className={textareaClass}
                rows={8}
                value={values.coverageAreas}
                onChange={e => set("coverageAreas", e.target.value)}
                placeholder={"Louisville, KY\nSouthern Indiana\nKY"}
              />
              <p className="text-[11px] text-muted-foreground">One area or state code per line (e.g. "KY", "Louisville Metro").</p>
            </Field>
          </div>
        );

      case "brand":
        return (
          <div className="space-y-4">
            <Field label="Brand Color" name="brandColor" inferred={inferred}>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={values.brandColor}
                  onChange={e => set("brandColor", e.target.value)}
                  className="w-10 h-10 rounded border border-border cursor-pointer p-0.5 bg-background"
                />
                <input
                  className={inputClass + " font-mono"}
                  value={values.brandColor}
                  onChange={e => set("brandColor", e.target.value)}
                  placeholder="#1a1a2e"
                  maxLength={7}
                />
              </div>
            </Field>
            <Field label="Font Family" name="fontFamily" inferred={inferred}>
              <select
                className={inputClass}
                value={values.fontFamily}
                onChange={e => set("fontFamily", e.target.value)}
              >
                {[
                  "Inter", "Roboto", "Open Sans", "Lato", "Poppins", "Raleway",
                  "Montserrat", "Playfair Display", "Merriweather", "Source Serif 4",
                ].map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Logo URL" name="logoUrl" inferred={inferred}>
              <input
                className={inputClass}
                value={values.logoUrl}
                onChange={e => set("logoUrl", e.target.value)}
                placeholder="https://... or leave blank to upload later"
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
                  <p className="text-[11px] text-muted-foreground">Preview. You can change this URL above.</p>
                </div>
              )}
            </Field>
          </div>
        );

      case "social":
        return (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Leave blank any platforms you don't use. These will appear in your website footer.
            </p>
            {(
              [
                { key: "facebook",  label: "Facebook URL" },
                { key: "instagram", label: "Instagram URL" },
                { key: "linkedin",  label: "LinkedIn URL"  },
                { key: "twitter",   label: "X / Twitter URL" },
                { key: "youtube",   label: "YouTube URL"  },
              ] as const
            ).map(({ key, label }) => (
              <Field key={key} label={label} name={key} inferred={inferred}>
                <input
                  className={inputClass}
                  value={values[key]}
                  onChange={e => set(key, e.target.value)}
                  placeholder="https://..."
                  type="url"
                />
              </Field>
            ))}
          </div>
        );

      case "hours": {
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-sm font-medium text-foreground">Business Hours</label>
              <ProvenanceBadge visible={inferred.has("workingHours")} />
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Toggle a day to mark it closed. These populate your Business Hours section.
            </p>
            <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {values.workingHours.map((row, idx) => (
                <div key={row.day} className="flex items-center gap-2 px-3 py-2 bg-background">
                  {/* Closed toggle */}
                  <button
                    type="button"
                    onClick={() => setHoursRow(idx, { closed: !row.closed })}
                    className={`flex-shrink-0 w-8 h-4 rounded-full transition-colors ${
                      row.closed ? "bg-muted-foreground/30" : "bg-primary"
                    } relative`}
                    title={row.closed ? "Mark open" : "Mark closed"}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                      row.closed ? "left-0.5" : "left-4"
                    }`} />
                  </button>
                  <span className="w-20 text-xs font-medium text-foreground flex-shrink-0">{row.day.slice(0, 3)}</span>
                  {row.closed ? (
                    <span className="text-[11px] text-muted-foreground italic">Closed</span>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <input
                        className="flex-1 min-w-0 border border-border rounded px-2 py-0.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        value={row.open}
                        onChange={e => setHoursRow(idx, { open: e.target.value })}
                        placeholder="8:00 AM"
                      />
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">to</span>
                      <input
                        className="flex-1 min-w-0 border border-border rounded px-2 py-0.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
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
        );
      }

      default:
        return null;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-2xl border border-border w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">AI Website Generator</p>
            <p className="text-[11px] text-muted-foreground">Review &amp; confirm your business details</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step tabs */}
        <div className="flex items-center gap-0 px-4 pt-3 pb-0 flex-shrink-0 overflow-x-auto border-b border-border">
          {STEPS.map((s, idx) => {
            const isActive   = idx === step;
            const isComplete = idx < step;
            const StepIcon   = s.Icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(idx)}
                className={`flex items-center gap-1 px-2.5 py-2 text-[11px] font-medium whitespace-nowrap transition-colors flex-shrink-0 border-b-2 -mb-px ${
                  isActive
                    ? "border-primary text-primary"
                    : isComplete
                    ? "border-transparent text-emerald-600 dark:text-emerald-400 hover:text-emerald-700"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {isComplete ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <StepIcon className="w-3 h-3" />
                )}
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm">Reading your BuildPro profile…</p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
              <Info className="w-6 h-6 text-amber-500" />
              <p className="text-sm text-center max-w-xs">
                Couldn't load your profile. You can still fill in the form manually.
              </p>
            </div>
          ) : (
            renderStep()
          )}

          {/* Prefill context note */}
          {!isLoading && !isError && inferred.size > 0 && (
            <div className="mt-4 flex items-start gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40 rounded-lg">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed">
                Fields marked <strong>Pulled from your BuildPro profile</strong> were filled in automatically. You can change any of them before generating.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border flex-shrink-0 bg-muted/20">
          <div className="text-[11px] text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isLastStep ? (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  Generate Website
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
