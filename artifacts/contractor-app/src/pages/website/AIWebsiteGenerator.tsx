/**
 * AIWebsiteGenerator.tsx — M20: AI Website Generator
 *
 * One-click website generation from all available BuildPro business data.
 * No wizard required — confirms what data will be used, then streams progress
 * from a server-sent-events endpoint and calls onComplete with the result.
 *
 * Steps:
 *   confirm  → Shows a data-summary card for what BuildPro will use
 *   progress → Streams SSE events, renders animated progress bar
 *
 * Props:
 *   show        — visibility flag
 *   businessId  — used to stream the SSE endpoint
 *   mode        — "new" for first-time generation, "regenerate" for existing sites
 *   prefill     — pre-loaded business data summary (optional; shown in confirm step)
 *   onComplete  — receives { sections, settings } from the completed pipeline
 *   onOpenWizard — fall-back to the 4-step wizard ("Customize first")
 *   onClose     — cancel / dismiss
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X, Sparkles, Loader2, ChevronRight, Phone, Mail, MapPin,
  Briefcase, Globe, Image, Clock, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SiteSettings } from "./website-types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "confirm" | "progress" | "done";

interface SseProgressEvent { type: "progress"; step: string; pct: number }
interface SseCompleteEvent { type: "complete"; sections: unknown[]; settings: Record<string, unknown> }
interface SseErrorEvent   { type: "error";    message: string }
type SseEvent = SseProgressEvent | SseCompleteEvent | SseErrorEvent;

export interface GeneratedSiteData {
  sections: unknown[];
  settings: Partial<SiteSettings>;
}

interface DataItem {
  icon: React.ReactNode;
  label: string;
  value: string;
  available: boolean;
}

interface Props {
  show: boolean;
  businessId: number;
  mode: "new" | "regenerate";
  prefill?: {
    businessName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    services?: string[];
    coverageAreas?: string[];
    brandColor?: string | null;
    logoUrl?: string | null;
  } | null;
  onComplete: (data: GeneratedSiteData) => void;
  onOpenWizard: () => void;
  onClose: () => void;
}

// ── Progress step labels ──────────────────────────────────────────────────────

const PROGRESS_STEPS = [
  "Analyzing your business profile…",
  "Selecting the right layout for your industry…",
  "Writing personalized copy for your business…",
  "Choosing colors from your brand…",
  "Finalizing your website…",
];

// ── Component ─────────────────────────────────────────────────────────────────

export function AIWebsiteGenerator({
  show,
  businessId,
  mode,
  prefill,
  onComplete,
  onOpenWizard,
  onClose,
}: Props) {
  const [step, setStep] = useState<Step>("confirm");
  const [currentProgressStep, setCurrentProgressStep] = useState("");
  const [pct, setPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  // Reset to confirm screen every time the modal is opened so repeated
  // regenerations start fresh (fixes stale "done" state from prior runs).
  useEffect(() => {
    if (show) {
      setStep("confirm");
      setPct(0);
      setCurrentProgressStep("");
      setErrorMsg("");
    }
  }, [show]);

  if (!show) return null;

  // ── Data items for confirm screen ──────────────────────────────────────────

  const dataItems: DataItem[] = [
    {
      icon: <Briefcase className="w-3.5 h-3.5" />,
      label: "Business name",
      value: prefill?.businessName ?? "From your profile",
      available: !!prefill?.businessName,
    },
    {
      icon: <Phone className="w-3.5 h-3.5" />,
      label: "Phone number",
      value: prefill?.phone ?? "Not set",
      available: !!prefill?.phone,
    },
    {
      icon: <Mail className="w-3.5 h-3.5" />,
      label: "Email address",
      value: prefill?.email ?? "Not set",
      available: !!prefill?.email,
    },
    {
      icon: <MapPin className="w-3.5 h-3.5" />,
      label: "Location",
      value: prefill?.address ?? "Not set",
      available: !!prefill?.address,
    },
    {
      icon: <Globe className="w-3.5 h-3.5" />,
      label: "Services",
      value: prefill?.services?.length
        ? `${prefill.services.slice(0, 3).join(", ")}${prefill.services.length > 3 ? ` +${prefill.services.length - 3} more` : ""}`
        : "Using industry defaults",
      available: (prefill?.services?.length ?? 0) > 0,
    },
    {
      icon: <Image className="w-3.5 h-3.5" />,
      label: "Logo",
      value: prefill?.logoUrl ? "Uploaded" : "Not uploaded",
      available: !!prefill?.logoUrl,
    },
    {
      icon: <Clock className="w-3.5 h-3.5" />,
      label: "Brand color",
      value: prefill?.brandColor ?? "Auto-selected",
      available: !!prefill?.brandColor,
    },
  ];

  // ── Start generation ───────────────────────────────────────────────────────

  async function startGeneration() {
    setStep("progress");
    setCurrentProgressStep(PROGRESS_STEPS[0]);
    setPct(0);
    setErrorMsg("");

    try {
      const res = await fetch(`${BASE}/api/website/generate-from-profile?businessId=${businessId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        credentials: "include",
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Network error" }));
        throw new Error((err as any).error ?? `HTTP ${res.status}`);
      }

      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse complete SSE lines: `data: {...}\n`
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete last line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice("data:".length).trim();
          if (!jsonStr) continue;

          let event: SseEvent;
          try { event = JSON.parse(jsonStr) as SseEvent; } catch { continue; }

          if (event.type === "progress") {
            setCurrentProgressStep(event.step);
            setPct(event.pct);
          } else if (event.type === "complete") {
            setPct(100);
            setStep("done");
            // Small delay so user sees the 100% state before transition
            await new Promise(r => setTimeout(r, 600));
            onComplete({ sections: event.sections, settings: event.settings });
            return;
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }

      // If stream ended without a complete event, try to use whatever we got
      throw new Error("Generation ended unexpectedly. Please try again.");

    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStep("confirm");
    }
  }

  function handleClose() {
    if (step === "progress") return; // don't allow cancel mid-generation
    onClose();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold leading-none">
                {mode === "regenerate" ? "Regenerate Website with AI" : "Generate Your Website"}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {mode === "regenerate"
                  ? "Rebuilds your site from scratch using your latest business data"
                  : "Uses your BuildPro data to build a complete, personalized website"}
              </p>
            </div>
          </div>
          {step !== "progress" && (
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">

          {/* ── Confirm step ──────────────────────────────────────────────── */}
          {step === "confirm" && (
            <div className="p-5">
              {mode === "regenerate" && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-4">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    This will <strong>replace all current content</strong> — sections, copy, and colors — with a fresh AI-generated version. Your uploaded photos and logo will be preserved.
                  </p>
                </div>
              )}

              <p className="text-xs text-muted-foreground mb-3">
                The AI will use the following data from your BuildPro profile to build a complete, personalized website:
              </p>

              <div className="space-y-1.5 mb-4">
                {dataItems.map((item, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs",
                      item.available
                        ? "bg-muted/50"
                        : "bg-muted/20 text-muted-foreground",
                    )}
                  >
                    <span className={cn(
                      "flex-shrink-0",
                      item.available ? "text-primary" : "text-muted-foreground/50",
                    )}>
                      {item.icon}
                    </span>
                    <span className={cn("font-medium w-24 flex-shrink-0", item.available ? "text-muted-foreground" : "text-muted-foreground/60")}>
                      {item.label}
                    </span>
                    <span className={cn("flex-1 truncate", item.available ? "text-foreground" : "text-muted-foreground/50")}>
                      {item.available
                        ? item.label === "Brand color"
                          ? <span className="flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-full border border-border inline-block flex-shrink-0" style={{ background: prefill?.brandColor ?? "#1a1a2e" }} />
                              {item.value}
                            </span>
                          : item.value
                        : item.value}
                    </span>
                    {item.available && (
                      <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              {errorMsg && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-3">{errorMsg}</p>
              )}

              <p className="text-[11px] text-muted-foreground">
                Takes about 15–20 seconds. You can edit everything afterward.
              </p>
            </div>
          )}

          {/* ── Progress step ──────────────────────────────────────────────── */}
          {(step === "progress" || step === "done") && (
            <div className="flex flex-col items-center justify-center min-h-[280px] gap-5 px-8 py-8">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                {step === "done"
                  ? <CheckCircle2 className="w-8 h-8 text-green-500" />
                  : <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                }
              </div>

              <div className="text-center space-y-1.5 w-full">
                <p className="text-base font-semibold">
                  {step === "done" ? "Website ready! 🎉" : "Building your website…"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {step === "done" ? "Opening your editor now…" : currentProgressStep}
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-xs">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-center text-[11px] text-muted-foreground mt-1.5">{pct}%</p>
              </div>

              {/* Step indicators */}
              <div className="flex items-center gap-1">
                {PROGRESS_STEPS.map((s, i) => {
                  const stepPct = ((i + 1) / PROGRESS_STEPS.length) * 100;
                  const active = pct >= stepPct - 10 && pct < stepPct + 5;
                  const done = pct >= stepPct;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "w-1.5 h-1.5 rounded-full transition-all",
                        done ? "bg-primary" : active ? "bg-primary/60 scale-125" : "bg-muted-foreground/30",
                      )}
                      title={s}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "confirm" && (
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-border flex-shrink-0">
            <button
              type="button"
              onClick={() => { onOpenWizard(); onClose(); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Customize first
              <ChevronRight className="w-3 h-3" />
            </button>

            <button
              type="button"
              onClick={startGeneration}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {mode === "regenerate" ? "Regenerate Website" : "Generate Website"}
            </button>
          </div>
        )}

        {step === "progress" && (
          <div className="flex items-center justify-center gap-2 px-5 py-3 border-t border-border flex-shrink-0 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Please wait — do not close this window</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
