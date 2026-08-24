/**
 * AITemplateBuilder.tsx — M19: AI Template Builder
 *
 * Modal that lets Willard describe a website in plain English and get back a
 * complete, themed, multi-section template ready to use or save.
 *
 * Flow:
 *   input → generating → preview → (save optional) → onSelect(template)
 *
 * Props:
 *   show        — visibility flag
 *   onClose     — dismiss handler
 *   businessId  — active business (for saving)
 *   onSelect    — called when the user clicks "Use This Now" or "Save & Use"
 *                 receives the WebsiteTemplate to apply to the editor
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Sparkles, Loader2, RefreshCw, Save, ArrowRight,
  CheckCircle2, Trash2, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WebsiteTemplate } from "./websiteTemplates";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Style options ─────────────────────────────────────────────────────────────

const STYLE_OPTIONS = [
  { value: "Modern",    label: "Modern",    swatch: "#1e40af" },
  { value: "Bold",      label: "Bold",      swatch: "#7f1d1d" },
  { value: "Elegant",   label: "Elegant",   swatch: "#3b0764" },
  { value: "Friendly",  label: "Friendly",  swatch: "#065f46" },
  { value: "Minimal",   label: "Minimal",   swatch: "#1f2937" },
  { value: "Classic",   label: "Classic",   swatch: "#78350f" },
];

// ── Section thumbnail colours ─────────────────────────────────────────────────

const SECTION_COLORS: Record<string, string> = {
  header: "#374151", hero: "#4f46e5", services: "#64748b", about: "#94a3b8",
  testimonials: "#ddd6fe", stats: "#c7d2fe", portfolio: "#a5b4fc",
  faq: "#e2e8f0", cta: "#4f46e5", contact: "#94a3b8", footer: "#1f2937",
  process: "#bae6fd", "why-choose-us": "#94a3b8", "trust-counter": "#fef9c3",
  gallery: "#e9d5ff",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  show: boolean;
  onClose: () => void;
  businessId: number;
  onSelect: (t: WebsiteTemplate) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AITemplateBuilder({ show, onClose, businessId, onSelect }: Props) {
  const [step, setStep] = useState<"input" | "generating" | "preview">("input");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState<string>("");
  const [generated, setGenerated] = useState<WebsiteTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showSections, setShowSections] = useState(false);
  const [regeneratingSectionId, setRegeneratingSectionId] = useState<string | null>(null);

  if (!show) return null;

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function generate() {
    if (description.trim().length < 5) return;
    setStep("generating");
    setErrorMsg("");
    setGenerated(null);
    setIsSaved(false);

    try {
      const res = await fetch(`${BASE}/api/website/generate-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ description: description.trim(), style: style || undefined }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((err as any).error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as WebsiteTemplate;

      // Defensive guards before entering preview — LLMs can return partial objects
      if (!data || typeof data !== "object") {
        throw new Error("AI returned an unexpected response. Please try again.");
      }
      if (!Array.isArray(data.sections) || data.sections.length === 0) {
        throw new Error("AI did not generate any sections. Please rephrase your description and try again.");
      }
      if (typeof data.brandColor !== "string" || !data.brandColor.startsWith("#")) {
        data.brandColor = "#1a1a2e";
      }
      if (!data.settings || typeof data.settings !== "object") {
        data.settings = {} as WebsiteTemplate["settings"];
      }
      if (!data.name || typeof data.name !== "string") {
        data.name = "AI Template";
      }

      setGenerated(data);
      setTemplateName(data.name ?? "My Template");
      setStep("preview");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Generation failed. Please try again.");
      setStep("input");
    }
  }

  async function saveTemplate() {
    if (!generated || !templateName.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${BASE}/api/website/templates?businessId=${businessId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: templateName.trim(),
          description: generated.description ?? description.trim().slice(0, 120),
          brandColor: generated.brandColor,
          settings: generated.settings,
          sections: generated.sections,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error((err as any).error ?? `HTTP ${res.status}`);
      }
      setIsSaved(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not save template. You can still apply it.");
    } finally {
      setIsSaving(false);
    }
  }

  function applyNow() {
    if (!generated) return;
    onSelect({ ...generated, name: templateName.trim() || generated.name });
    onClose();
  }

  async function saveAndApply() {
    await saveTemplate();
    applyNow();
  }

  async function regenerateSection(section: NonNullable<WebsiteTemplate["sections"]>[number]) {
    if (!generated || regeneratingSectionId) return;
    setRegeneratingSectionId(section.id);
    setErrorMsg("");
    try {
      const res = await fetch(`${BASE}/api/website/regenerate-section`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sectionType: section.type,
          section,
          templateContext: {
            name: generated.name,
            description: generated.description,
            style: style || undefined,
            brandColor: generated.brandColor,
            settings: generated.settings,
            sections: generated.sections,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || typeof data !== "object") {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setGenerated(current => current
        ? {
            ...current,
            sections: current.sections.map(existing =>
              existing.id === section.id
                ? { ...existing, ...data, id: section.id, type: section.type, order: section.order, enabled: section.enabled }
                : existing,
            ),
          }
        : current);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not regenerate that section. Please try again.");
    } finally {
      setRegeneratingSectionId(null);
    }
  }

  function regenerate() {
    setStep("input");
    setGenerated(null);
    setIsSaved(false);
  }

  function handleClose() {
    setStep("input");
    setErrorMsg("");
    onClose();
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">AI Template Builder</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">

          {/* ── Input step ─────────────────────────────────────────────────── */}
          {(step === "input" || step === "generating") && (
            <div className="p-5 space-y-5">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Describe the business, vibe, and any special requirements.
                </p>
                <textarea
                  autoFocus
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={`Examples:\n"Modern HVAC company, emergency-focused, dark theme"\n"Luxury roofing contractor, forest green palette, high-end feel"\n"Friendly neighborhood plumber, 24/7 emergency service"`}
                  rows={5}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                  disabled={step === "generating"}
                />
              </div>

              {/* Style picker */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Visual style (optional)</p>
                <div className="flex flex-wrap gap-2">
                  {STYLE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStyle(s => s === opt.value ? "" : opt.value)}
                      disabled={step === "generating"}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                        style === opt.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: opt.swatch }} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {errorMsg && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{errorMsg}</p>
              )}
            </div>
          )}

          {/* ── Generating ─────────────────────────────────────────────────── */}
          {step === "generating" && (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground px-5">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
              <p className="text-sm font-medium">Building your template…</p>
              <p className="text-xs text-center max-w-xs">
                AI is selecting sections, writing copy, and choosing a color palette.
              </p>
            </div>
          )}

          {/* ── Preview step ───────────────────────────────────────────────── */}
          {step === "preview" && generated && (
            <div className="p-5 space-y-4">
              {/* Template card */}
              <div className="rounded-xl border border-border overflow-hidden">
                {/* Color banner */}
                <div
                  className="h-24 flex flex-col justify-center px-5 py-3"
                  style={{ backgroundColor: generated.brandColor }}
                >
                  <p className="text-white font-bold text-sm leading-snug line-clamp-2">
                    {(generated.sections.find(s => s.type === "hero")?.content?.headline as string) ?? generated.name}
                  </p>
                  <p className="text-white/60 text-xs mt-1 line-clamp-1">
                    {(generated.sections.find(s => s.type === "hero")?.content?.subheadline as string) ?? ""}
                  </p>
                </div>

                {/* Section strip */}
                <div className="px-4 py-3 flex flex-wrap gap-1.5">
                  {generated.sections.slice(0, 10).map(s => (
                    <span
                      key={s.id}
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                      style={{ backgroundColor: SECTION_COLORS[s.type] ?? "#64748b" }}
                    >
                      {s.type}
                    </span>
                  ))}
                  {generated.sections.length > 10 && (
                    <span className="text-[10px] text-muted-foreground self-center">+{generated.sections.length - 10} more</span>
                  )}
                </div>
              </div>

              {/* Expandable section list */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowSections(v => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showSections ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showSections ? "Hide" : "Show"} {generated.sections.length} sections
                </button>
                {showSections && (
                  <ol className="mt-2 space-y-0.5 pl-4">
                    {generated.sections.map((s, i) => (
                      <li key={s.id} className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span className="text-[10px] w-4 text-right opacity-50">{i + 1}.</span>
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: SECTION_COLORS[s.type] ?? "#64748b" }}
                        />
                        <span className="capitalize">{s.type}</span>
                        {s.content?.heading ? (
                          <span className="opacity-50 truncate max-w-[180px]">— {String(s.content.heading as unknown)}</span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => regenerateSection(s)}
                          disabled={regeneratingSectionId !== null}
                          className="ml-auto p-1 rounded hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
                          aria-label={`Regenerate ${s.type} section`}
                          title={`Regenerate ${s.type} section`}
                        >
                          {regeneratingSectionId === s.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <RefreshCw className="w-3 h-3" />}
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Name input */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Template name</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="My Custom Template"
                />
              </div>

              {isSaved && (
                <div className="flex items-center gap-2 text-xs text-green-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Saved to your template library!
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-border flex-shrink-0">
          {step === "input" && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={generate}
                disabled={description.trim().length < 5}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  description.trim().length >= 5
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Generate Template
              </button>
            </>
          )}

          {step === "generating" && (
            <div className="flex-1 flex justify-center">
              <span className="text-xs text-muted-foreground">This takes about 10 seconds…</span>
            </div>
          )}

          {step === "preview" && generated && (
            <>
              <button
                type="button"
                onClick={regenerate}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate
              </button>

              <div className="flex items-center gap-2">
                {!isSaved && (
                  <button
                    type="button"
                    onClick={saveTemplate}
                    disabled={isSaving || !templateName.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save
                  </button>
                )}

                <button
                  type="button"
                  onClick={isSaved ? applyNow : saveAndApply}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isSaved ? (
                    <>Use This Now <ArrowRight className="w-3.5 h-3.5" /></>
                  ) : (
                    <>Save & Use <ArrowRight className="w-3.5 h-3.5" /></>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
