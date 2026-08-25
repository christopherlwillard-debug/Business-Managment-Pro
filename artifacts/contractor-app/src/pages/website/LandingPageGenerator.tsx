/**
 * LandingPageGenerator.tsx — M11: AI Landing Pages
 *
 * Modal that lets the user pick a promotional landing page type, optionally
 * add extra context, and generate a fully populated page in one click.
 *
 * Props
 *   businessId      — the active business's numeric ID
 *   businessContext — optional pre-built context object (from WebsiteEditor)
 *   onSuccess       — called with the generated SitePage; parent adds it
 *   onClose         — called when the user dismisses the modal
 */

import { useState } from "react";
import { Sparkles, X, Loader2, ChevronRight, ArrowLeft } from "lucide-react";
import { LANDING_PAGE_PROFILES } from "./landingPageProfiles";
import type { BusinessContext } from "./website-types";
import type { SitePage } from "./WebsiteEditor";
import { SEO_LIMITS } from "@workspace/api-zod";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Props {
  businessId: number;
  businessContext?: BusinessContext;
  onSuccess: (page: SitePage) => void;
  onClose: () => void;
}

type Step = "pick" | "custom-describe" | "generating" | "error";

const ICON_BG: Record<string, string> = {
  "spring-promotion":  "bg-pink-50 dark:bg-pink-950",
  "winter-specials":   "bg-blue-50 dark:bg-blue-950",
  "financing":         "bg-purple-50 dark:bg-purple-950",
  "veteran-discount":  "bg-amber-50 dark:bg-amber-950",
  "dealer-program":    "bg-teal-50 dark:bg-teal-950",
  "employment":        "bg-orange-50 dark:bg-orange-950",
  "referral-program":  "bg-green-50 dark:bg-green-950",
  "emergency-service": "bg-red-50 dark:bg-red-950",
  "custom":            "bg-muted",
};

export function LandingPageGenerator({ businessId, businessContext, onSuccess, onClose }: Props) {
  const [step, setStep] = useState<Step>("pick");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [customDescription, setCustomDescription] = useState("");
  const [extraDetails, setExtraDetails] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [generatingStep, setGeneratingStep] = useState("Building your page…");

  async function generate(type: string, description?: string) {
    setStep("generating");
    setGeneratingStep("Generating content with AI…");

    try {
      // Build the business context payload — merge extra details into it if provided
      const ctx = businessContext
        ? {
            ...businessContext,
            // Append extra details as a hint via the tagline field if provided
            tagline: extraDetails.trim()
              ? (businessContext.tagline ? `${businessContext.tagline}. ${extraDetails.trim()}` : extraDetails.trim())
              : businessContext.tagline,
          }
        : undefined;

      const body: Record<string, unknown> = { type };
      if (description) body.customDescription = description;
      if (ctx) body.businessContext = ctx;

      const res = await fetch(
        `${BASE}/api/website/generate-landing-page?businessId=${businessId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      setGeneratingStep("Assembling sections…");
      const data = await res.json() as { page: SitePage };

      onSuccess(data.page);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStep("error");
    }
  }

  function handleProfileClick(profileId: string) {
    if (profileId === "custom") {
      setSelectedType("custom");
      setStep("custom-describe");
      return;
    }
    setSelectedType(profileId);
    // Show extra-details step for all non-custom profiles too
    setStep("custom-describe");
  }

  function handleGenerate() {
    if (selectedType === "custom") {
      if (!customDescription.trim()) return;
      generate("custom", customDescription.trim());
    } else {
      generate(selectedType!, extraDetails.trim() || undefined);
    }
  }

  // ── Generating step ──────────────────────────────────────────────────────────
  if (step === "generating") {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-card rounded-2xl border border-border shadow-xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Generating Landing Page</h2>
          <p className="text-sm text-muted-foreground">{generatingStep}</p>
          <p className="text-xs text-muted-foreground mt-3 opacity-70">This usually takes 5–10 seconds</p>
        </div>
      </div>
    );
  }

  // ── Error step ───────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-card rounded-2xl border border-border shadow-xl p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <X className="w-7 h-7 text-destructive" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Generation Failed</h2>
          <p className="text-sm text-muted-foreground mb-5">{errorMessage}</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setStep("pick"); setSelectedType(null); setErrorMessage(""); }}
              className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              ← Try Again
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Custom description / extra details step ──────────────────────────────────
  if (step === "custom-describe") {
    const profile = LANDING_PAGE_PROFILES.find(p => p.id === selectedType);
    const isCustom = selectedType === "custom";

    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card rounded-2xl border border-border shadow-xl p-6">
          {/* Header */}
          <div className="flex items-start gap-3 mb-5">
            <button
              onClick={() => { setStep("pick"); setSelectedType(null); }}
              className="mt-0.5 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex-1">
              {profile && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{profile.emoji}</span>
                  <h2 className="font-bold text-foreground">{profile.name}</h2>
                </div>
              )}
              {!profile && <h2 className="font-bold text-foreground mb-0.5">Custom Landing Page</h2>}
              <p className="text-xs text-muted-foreground leading-snug">
                {isCustom
                  ? "Describe the page you want to create."
                  : profile?.description}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Custom description (required for custom type) */}
          {isCustom && (
            <div className="mb-4">
              <label className="text-sm font-medium text-foreground block mb-1.5">
                Page description <span className="text-destructive">*</span>
              </label>
              <textarea
                value={customDescription}
                onChange={e => setCustomDescription(e.target.value.slice(0, SEO_LIMITS.landingDescription))}
                maxLength={SEO_LIMITS.landingDescription}
                placeholder="e.g. 'A page for our summer deck staining special — 10% off for the month of June, targeting homeowners in the Nashville area'"
                rows={4}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                autoFocus
              />
            </div>
          )}

          {/* Extra details (optional for all profiles) */}
          <div className="mb-5">
            <label className="text-sm font-medium text-foreground block mb-1.5">
              {isCustom ? "Additional details" : "Extra details"}{" "}
              <span className="text-muted-foreground font-normal text-xs">(optional)</span>
            </label>
            <textarea
              value={extraDetails}
              onChange={e => setExtraDetails(e.target.value.slice(0, SEO_LIMITS.landingDetails))}
              maxLength={SEO_LIMITS.landingDetails}
              placeholder={
                isCustom
                  ? "Any other notes — specific services, dates, discount amounts, etc."
                  : `e.g. "15% discount through March 31", specific services to highlight, offer details…`
              }
              rows={3}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              autoFocus={!isCustom}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => { setStep("pick"); setSelectedType(null); }}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              ← Back
            </button>
            <button
              disabled={isCustom && !customDescription.trim()}
              onClick={handleGenerate}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              Generate Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Profile picker ───────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col items-center p-6 overflow-y-auto">
      <div className="max-w-3xl w-full pt-8 pb-16">
        {/* Header */}
        <div className="text-center mb-8 relative">
          <button
            onClick={onClose}
            className="absolute right-0 top-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Generate a Landing Page</h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-md mx-auto">
            Pick a page type — AI will generate a full promotional page with copy tailored to your business.
          </p>
        </div>

        {/* Profile cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {LANDING_PAGE_PROFILES.map(profile => (
            <button
              key={profile.id}
              onClick={() => handleProfileClick(profile.id)}
              className="text-left rounded-xl border-2 border-border hover:border-primary hover:shadow-md transition-all overflow-hidden group"
            >
              <div className={`flex items-center justify-center py-4 px-3 ${ICON_BG[profile.id] ?? "bg-muted/30"}`}>
                <span className="text-3xl">{profile.emoji}</span>
              </div>
              <div className="p-3">
                <p className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors leading-snug mb-1">
                  {profile.name}
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                  {profile.tagline}
                </p>
              </div>
            </button>
          ))}

          {/* Custom option */}
          <button
            onClick={() => handleProfileClick("custom")}
            className="text-left rounded-xl border-2 border-dashed border-border hover:border-primary hover:shadow-md transition-all overflow-hidden group"
          >
            <div className="flex items-center justify-center py-4 px-3 bg-muted/20">
              <span className="text-3xl">✏️</span>
            </div>
            <div className="p-3">
              <p className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors leading-snug mb-1">
                Custom
              </p>
              <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                Describe your own page concept and let AI build it.
              </p>
            </div>
          </button>
        </div>

        {/* How it works note */}
        <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-start gap-3">
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            AI generates a complete page — hero, offer details, trust signals, and a contact form — using your business name, location, and services. Every section is fully editable after generation.
          </p>
        </div>
      </div>
    </div>
  );
}
