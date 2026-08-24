/**
 * DealerPageGenerator.tsx — M17: AI Dealer Pages
 *
 * Modal that lets the user pick which manufacturer brands to generate
 * dealer/partnership pages for. Generates one SitePage per brand using
 * the POST /api/website/generate-dealer-pages endpoint.
 *
 * Props:
 *   businessId      — active business numeric ID
 *   businessContext — optional pre-built context (from WebsiteEditor)
 *   existingPages   — current SitePage list (used to detect duplicate slugs)
 *   onSuccess       — called with array of generated SitePages to add
 *   onClose         — called when dismissed
 */

import { useState, useMemo } from "react";
import {
  X, Sparkles, Loader2, CheckCircle2, ChevronRight, Building2, AlertCircle,
} from "lucide-react";
import {
  MANUFACTURER_BRANDS, CORE_BRAND_IDS, svgToDataUri, type ManufacturerBrand,
} from "./manufacturerBrands";
import type { BusinessContext } from "./website-types";
import type { SitePage } from "./WebsiteEditor";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Props {
  businessId: number;
  businessContext?: BusinessContext;
  existingPages: SitePage[];
  onSuccess: (pages: SitePage[]) => void;
  onClose: () => void;
}

type Step = "pick" | "generating" | "done" | "error";

interface GenerationProgress {
  brandId: string;
  status: "pending" | "done" | "error";
}

export function DealerPageGenerator({ businessId, businessContext, existingPages, onSuccess, onClose }: Props) {
  const [step, setStep] = useState<Step>("pick");
  const [selected, setSelected] = useState<Set<string>>(new Set(CORE_BRAND_IDS));
  const [progress, setProgress] = useState<GenerationProgress[]>([]);
  const [generatedPages, setGeneratedPages] = useState<SitePage[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  // Compute which slugs already exist so we can warn about conflicts
  const existingSlugs = useMemo(
    () => new Set(existingPages.map(p => p.slug)),
    [existingPages],
  );

  function toggleBrand(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generate() {
    if (selected.size === 0) return;
    const brandIds = Array.from(selected);
    setProgress(brandIds.map(id => ({ brandId: id, status: "pending" })));
    setStep("generating");
    setErrorMessage("");

    try {
      const res = await fetch(
        `${BASE}/api/website/generate-dealer-pages?businessId=${businessId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            manufacturers: brandIds,
            businessContext: businessContext ?? null,
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((err as any).error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as {
        pages: SitePage[];
        progress?: Record<string, "done" | "error">;
        failures?: Record<string, string>;
      };
      const pages: SitePage[] = data.pages ?? [];

      // Update progress indicators from server response
      const serverProgress = data.progress ?? {};
      setProgress(brandIds.map(id => ({
        brandId: id,
        status: (serverProgress[id] as "done" | "error") ?? (pages.some(p => p.id?.includes(id) || p.slug === id || p.slug.includes(id.replace("-homes", "").replace("-", ""))) ? "done" : "error"),
      })));

      setGeneratedPages(pages.filter(page => !existingSlugs.has(page.slug)));
      setStep("done");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to generate dealer pages.");
      setStep("error");
    }
  }

  function handleAccept() {
    onSuccess(generatedPages);
    onClose();
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function BrandCard({ brand }: { brand: ManufacturerBrand }) {
    const isSelected = selected.has(brand.id);
    const hasConflict = existingSlugs.has(brand.slug);
    return (
      <button
        type="button"
        onClick={() => toggleBrand(brand.id)}
        className={[
          "flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
          isSelected
            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
            : "border-border bg-muted/30 hover:bg-muted/60 hover:border-border/80",
        ].join(" ")}
      >
        {/* Logo thumbnail */}
        <div
          className="flex-shrink-0 w-12 h-12 rounded-md overflow-hidden flex items-center justify-center"
          style={{ background: brand.accentLight }}
        >
          <img
            src={svgToDataUri(brand.logoSvg)}
            alt={brand.name}
            className="w-full h-full object-contain p-1"
          />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold leading-tight">{brand.name}</span>
            {hasConflict && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                page exists
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{brand.tagline}</p>
        </div>

        {/* Checkbox */}
        <div
          className={[
            "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5",
            isSelected ? "bg-primary border-primary" : "border-muted-foreground/40",
          ].join(" ")}
        >
          {isSelected && (
            <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </button>
    );
  }

  // ── Generating step ────────────────────────────────────────────────────────
  if (step === "generating") {
    const brandIds = Array.from(selected);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-md p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary animate-pulse" />
            <h2 className="text-base font-semibold">Generating Dealer Pages</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            AI is writing custom partnership copy for each manufacturer. This usually takes 10–20 seconds.
          </p>
          <div className="space-y-2">
            {brandIds.map(id => {
              const brand = MANUFACTURER_BRANDS.find(b => b.id === id)!;
              const prog = progress.find(p => p.brandId === id);
              return (
                <div key={id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/40">
                  <div className="flex-shrink-0 w-8 h-8 rounded overflow-hidden" style={{ background: brand.accentLight }}>
                    <img src={svgToDataUri(brand.logoSvg)} alt={brand.name} className="w-full h-full object-contain p-0.5" />
                  </div>
                  <span className="text-sm flex-1">{brand.name}</span>
                  {prog?.status === "done" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : prog?.status === "error" ? (
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Done step ─────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-md p-6 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <h2 className="text-base font-semibold">
              {generatedPages.length} Dealer Page{generatedPages.length !== 1 ? "s" : ""} Ready
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Each page has been added to your site with custom partnership copy. You can edit any page in the Studio.
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {generatedPages.map(page => (
              <div key={page.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 text-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                <span className="font-medium">{page.name}</span>
                <span className="text-muted-foreground text-xs font-mono">/{page.slug}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleAccept}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Add to Site
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Error step ────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-md p-6 space-y-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <h2 className="text-base font-semibold">Generation Failed</h2>
          </div>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("pick")}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Pick step (default) ───────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold leading-tight">Generate Dealer Pages</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select the brands you're authorized to sell — AI will write a custom partnership page for each.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Brand checklist */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {/* Manufactured Homes */}
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1">Manufactured Homes</p>
          {MANUFACTURER_BRANDS.filter(b => b.category === "manufactured").map(brand => (
            <BrandCard key={brand.id} brand={brand} />
          ))}

          {/* Flooring */}
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1 pt-2">Flooring & Materials</p>
          {MANUFACTURER_BRANDS.filter(b => b.category === "flooring").map(brand => (
            <BrandCard key={brand.id} brand={brand} />
          ))}

          {/* Generic */}
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1 pt-2">Other</p>
          {MANUFACTURER_BRANDS.filter(b => b.category === "generic").map(brand => (
            <BrandCard key={brand.id} brand={brand} />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border flex-shrink-0 bg-muted/20">
          <span className="text-xs text-muted-foreground">
            {selected.size === 0
              ? "Select at least one brand"
              : `${selected.size} brand${selected.size !== 1 ? "s" : ""} selected`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={generate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate {selected.size > 0 ? `${selected.size} ` : ""}Page{selected.size !== 1 ? "s" : ""}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
