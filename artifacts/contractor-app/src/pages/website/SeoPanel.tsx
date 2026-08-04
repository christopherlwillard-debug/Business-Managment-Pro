/**
 * SeoPanel.tsx — M10: AI SEO Builder
 *
 * Displayed when the user clicks the "SEO" tab in Website Studio.
 * Shows:
 *   • Overall SEO completeness score (0–100)
 *   • Editable meta title, description, keywords for home + additional pages
 *   • OpenGraph preview card (title, description, image)
 *   • "Generate with AI ✨" button that calls POST /api/website/generate-seo
 *   • Local Business schema status (present / missing)
 *   • "Regenerate SEO" button for full refresh
 */

import { useState, useMemo } from "react";
import {
  Sparkles, Search, Globe, RefreshCw, Loader2, Check, AlertTriangle,
  ChevronDown, ChevronRight, Image as ImageIcon,
} from "lucide-react";
import type { SiteSettings, SeoSettings, PageSeo } from "./website-types";

/** Minimal page descriptor — matches the SitePage shape in WebsiteEditor. */
interface SitePage {
  id: string;
  name: string;
  slug: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Completeness score ────────────────────────────────────────────────────────

function calcScore(seo: SeoSettings | undefined): number {
  if (!seo) return 0;
  let score = 0;
  if (seo.metaTitle?.trim())       score += 25;
  if (seo.metaDescription?.trim()) score += 25;
  if (seo.ogImage?.trim())         score += 15;
  if (seo.localBusinessSchema)     score += 20;
  if (seo.keywords?.trim())        score += 15;
  return score;
}

function scoreLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "Excellent",    color: "text-emerald-600" };
  if (score >= 70) return { label: "Good",         color: "text-blue-600" };
  if (score >= 40) return { label: "Needs work",   color: "text-amber-600" };
  return           { label: "Not configured",      color: "text-muted-foreground" };
}

function scoreBarColor(score: number): string {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 70) return "bg-blue-500";
  if (score >= 40) return "bg-amber-400";
  return "bg-muted-foreground/30";
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function CharCounter({ value, max }: { value: string; max: number }) {
  const len = value.length;
  const ok = len <= max && len >= max * 0.4;
  return (
    <span className={`text-[10px] ${len > max ? "text-destructive" : ok ? "text-emerald-600" : "text-muted-foreground"}`}>
      {len}/{max}
    </span>
  );
}

interface SeoFieldProps {
  label: string;
  hint?: string;
  maxLen?: number;
  value: string;
  multiline?: boolean;
  onChange: (v: string) => void;
}

function SeoField({ label, hint, maxLen, value, multiline, onChange }: SeoFieldProps) {
  const Tag = multiline ? "textarea" : "input";
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
        {maxLen && <CharCounter value={value} max={maxLen} />}
      </div>
      {hint && <p className="text-[10px] text-muted-foreground mb-1 leading-tight">{hint}</p>}
      <Tag
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={multiline ? 3 : undefined}
        className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
      />
    </div>
  );
}

// ── OG preview card ───────────────────────────────────────────────────────────

function OgPreview({ title, description, imageUrl, domain }: {
  title: string; description: string; imageUrl: string; domain: string;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden text-xs bg-card">
      {imageUrl ? (
        <img src={imageUrl} alt="OG image preview" className="w-full h-24 object-cover" />
      ) : (
        <div className="w-full h-24 bg-muted flex items-center justify-center">
          <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
        </div>
      )}
      <div className="p-2">
        <p className="text-[10px] text-muted-foreground truncate">{domain || "yoursite.com"}</p>
        <p className="font-semibold text-foreground line-clamp-1 text-xs">{title || "Page title"}</p>
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight">{description || "Page description"}</p>
      </div>
    </div>
  );
}

// ── Page SEO section ──────────────────────────────────────────────────────────

function PageSeoBlock({
  pageName, seo, onUpdate,
}: {
  pageName: string;
  seo: PageSeo;
  onUpdate: (patch: Partial<PageSeo>) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasData = !!(seo.metaTitle || seo.metaDescription);
  return (
    <div className="border border-border rounded-lg">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
      >
        <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <Globe className="w-3 h-3 text-muted-foreground" />
          {pageName}
        </span>
        <div className="flex items-center gap-1.5">
          {hasData && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="SEO data present" />}
          {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-border">
          <div className="pt-2.5 space-y-2.5">
            <SeoField label="Meta Title" maxLen={60} value={seo.metaTitle ?? ""} onChange={v => onUpdate({ metaTitle: v })} />
            <SeoField label="Meta Description" maxLen={160} value={seo.metaDescription ?? ""} multiline onChange={v => onUpdate({ metaDescription: v })} />
            <SeoField label="Keywords" hint="Comma-separated" value={seo.keywords ?? ""} onChange={v => onUpdate({ keywords: v })} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface SeoPanelProps {
  businessId: number;
  businessName: string;
  settings: SiteSettings;
  pages: SitePage[];
  onSeoChange: (seo: SeoSettings) => void;
  onSave: () => void;
  isSaving: boolean;
  /** The published/live domain, e.g. "smithhvac.com" or "willard.buildpro.app" */
  domain?: string;
}

export function SeoPanel({
  businessId, businessName, settings, pages, onSeoChange, onSave, isSaving, domain,
}: SeoPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const seo: SeoSettings = (settings as any).seo ?? {};
  const score = calcScore(seo);
  const { label: scoreLabel_, color: scoreColor } = scoreLabel(score);

  function updateSeo(patch: Partial<SeoSettings>) {
    onSeoChange({ ...seo, ...patch });
  }

  function updatePageSeo(pageId: string, patch: Partial<PageSeo>) {
    const pagesSeo = { ...(seo.pagesSeo ?? {}) };
    pagesSeo[pageId] = { ...(pagesSeo[pageId] ?? {}), ...patch };
    updateSeo({ pagesSeo });
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setGenError(null);
    try {
      const res = await fetch(`${BASE}/api/website/generate-seo?businessId=${businessId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          businessContext: {
            businessName,
            businessType: (settings as any).businessType ?? undefined,
            location: (settings as any).location ?? undefined,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "SEO generation failed");
      }
      const generated = await res.json() as SeoSettings;
      onSeoChange({ ...seo, ...generated, generated: true, generatedAt: new Date().toISOString() });
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  const hasLocalBusiness = !!seo.localBusinessSchema;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">SEO Settings</span>
        </div>
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Score card */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs font-semibold text-foreground">SEO Score</p>
              <p className={`text-2xl font-bold ${scoreColor}`}>{score}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
            </div>
            <span className={`text-xs font-medium ${scoreColor}`}>{scoreLabel_}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(score)}`}
              style={{ width: `${score}%` }}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
            <span className={seo.metaTitle ? "text-emerald-600" : ""}>{seo.metaTitle ? "✓" : "○"} Meta title</span>
            <span className={seo.metaDescription ? "text-emerald-600" : ""}>{seo.metaDescription ? "✓" : "○"} Meta description</span>
            <span className={seo.keywords ? "text-emerald-600" : ""}>{seo.keywords ? "✓" : "○"} Keywords</span>
            <span className={seo.ogImage ? "text-emerald-600" : ""}>{seo.ogImage ? "✓" : "○"} OG image</span>
            <span className={hasLocalBusiness ? "text-emerald-600" : ""}>{hasLocalBusiness ? "✓" : "○"} Local Business</span>
          </div>
        </div>

        {/* Generate button */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 disabled:opacity-60 transition-all shadow-sm"
          >
            {isGenerating
              ? <><Loader2 className="w-4 h-4 animate-spin" />Generating SEO…</>
              : <><Sparkles className="w-4 h-4" />{seo.generated ? "Regenerate SEO ✨" : "Generate SEO with AI ✨"}</>}
          </button>
          {genError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />{genError}
            </p>
          )}
          {seo.generated && seo.generatedAt && !isGenerating && (
            <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
              <RefreshCw className="w-2.5 h-2.5" />
              Last generated {new Date(seo.generatedAt).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Home page meta */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Globe className="w-3 h-3" />Home Page
          </p>
          <SeoField
            label="Meta Title"
            hint="Shown in browser tab and Google search results"
            maxLen={60}
            value={seo.metaTitle ?? ""}
            onChange={v => updateSeo({ metaTitle: v })}
          />
          <SeoField
            label="Meta Description"
            hint="Shown below your title in Google. Write for humans."
            maxLen={160}
            value={seo.metaDescription ?? ""}
            multiline
            onChange={v => updateSeo({ metaDescription: v })}
          />
          <SeoField
            label="Keywords"
            hint="Comma-separated — e.g. HVAC repair Nashville, AC installation"
            value={seo.keywords ?? ""}
            onChange={v => updateSeo({ keywords: v })}
          />
        </div>

        {/* OpenGraph */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Social Preview (OG)</p>
          <SeoField
            label="OG Title"
            hint="Shown when your page is shared on Facebook, iMessage, etc."
            maxLen={60}
            value={seo.ogTitle ?? seo.metaTitle ?? ""}
            onChange={v => updateSeo({ ogTitle: v })}
          />
          <SeoField
            label="OG Description"
            maxLen={160}
            value={seo.ogDescription ?? seo.metaDescription ?? ""}
            multiline
            onChange={v => updateSeo({ ogDescription: v })}
          />
          <SeoField
            label="OG Image URL"
            hint="Recommended: 1200×630px. Paste a URL from your media library."
            value={seo.ogImage ?? ""}
            onChange={v => updateSeo({ ogImage: v })}
          />
          <OgPreview
            title={seo.ogTitle ?? seo.metaTitle ?? businessName}
            description={seo.ogDescription ?? seo.metaDescription ?? ""}
            imageUrl={seo.ogImage ?? ""}
            domain={domain ?? ""}
          />
        </div>

        {/* Local Business schema */}
        <div className="rounded-xl border border-border p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              Local Business Schema
              {hasLocalBusiness
                ? <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-semibold bg-emerald-500 text-white leading-4"><Check className="w-2 h-2" />Active</span>
                : <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-semibold bg-muted text-muted-foreground leading-4">Not set</span>}
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Tells Google your business name, address, phone, and hours. Boosts local search rankings. Click Generate to auto-fill from your business profile.
          </p>
          {hasLocalBusiness && (
            <details className="text-[10px] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">View schema JSON</summary>
              <pre className="mt-1 p-2 bg-muted rounded text-[9px] overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
                {(() => {
                  try { return JSON.stringify(JSON.parse(seo.localBusinessSchema!), null, 2); }
                  catch { return seo.localBusinessSchema; }
                })()}
              </pre>
            </details>
          )}
        </div>

        {/* Additional page SEO */}
        {pages.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Additional Pages
            </p>
            {pages.map(page => (
              <PageSeoBlock
                key={page.id}
                pageName={page.name}
                seo={(seo.pagesSeo ?? {})[page.id] ?? {}}
                onUpdate={patch => updatePageSeo(page.id, patch)}
              />
            ))}
          </div>
        )}

        {/* Sitemap note */}
        <div className="rounded-xl border border-border/50 bg-muted/30 p-3 text-[11px] text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground mb-0.5">Sitemap & Robots</p>
          Automatically available at your published domain:
          <br />
          <span className="font-mono text-[10px]">/sitemap.xml</span> and <span className="font-mono text-[10px]">/robots.txt</span>
        </div>
      </div>
    </div>
  );
}
