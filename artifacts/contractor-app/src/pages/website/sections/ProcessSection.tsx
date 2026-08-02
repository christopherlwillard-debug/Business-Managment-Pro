import { ChevronRight, Plus, Trash2, ChevronUp, ChevronDown, ArrowRight } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { InlineEditableText } from "../InlineEditableText";
import type { SiteSettings } from "../website-types";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ProcessLayout    = "horizontal" | "cards" | "zigzag" | "timeline";
export type ConnectorStyle   = "arrow" | "dashed" | "solid" | "dots" | "none";

export interface ProcessStep {
  id: string;
  icon: string;        // emoji
  title: string;
  description: string;
  /** When true on the last step this step renders as a CTA panel */
  ctaMode?: boolean;
  ctaUrl?: string;
}

export interface ProcessContent {
  heading?: string;
  subheading?: string;
  layout: ProcessLayout;
  connector: ConnectorStyle;
  steps: ProcessStep[];
  ctaText?: string;     // button label when a step has ctaMode=true
  ctaUrl?: string;      // fallback URL
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

const CIRCLED = ["①","②","③","④","⑤","⑥","⑦","⑧"];
function circled(n: number) { return CIRCLED[n] ?? `${n + 1}`; }

// ── Default content ────────────────────────────────────────────────────────────

export function defaultProcessContent(): ProcessContent {
  return {
    heading:    "How We Work",
    subheading: "Simple, transparent, and stress-free — every time.",
    layout:     "horizontal",
    connector:  "arrow",
    steps: [
      { id: uid(), icon: "📋", title: "Free Estimate",  description: "We visit the site, take measurements, and give you a clear written quote — no surprise fees." },
      { id: uid(), icon: "📅", title: "Schedule",       description: "Pick a start date that works for you. We'll confirm 48 hours before and show up on time." },
      { id: uid(), icon: "🏗️", title: "We Build",       description: "Our crew handles everything — foundation, delivery, setup, and tie-downs — to code." },
      { id: uid(), icon: "🏠", title: "Move In",        description: "Final walkthrough, punch-list sign-off, and you get the keys. That's it." },
    ],
    ctaText: "Get Your Free Estimate",
    ctaUrl:  "#contact",
  };
}

// ── Step number bubble ─────────────────────────────────────────────────────────

function NumberBubble({ n, brandColor }: { n: number; brandColor: string }) {
  return (
    <div
      className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow"
      style={{ backgroundColor: brandColor }}
    >
      {n + 1}
    </div>
  );
}

// ── Connector renderers ────────────────────────────────────────────────────────

function HConnector({ style, brandColor }: { style: ConnectorStyle; brandColor: string }) {
  if (style === "none")   return null;
  if (style === "arrow")  return <ArrowRight className="w-5 h-5 flex-shrink-0" style={{ color: brandColor }} />;
  if (style === "dots")   return <span className="flex-shrink-0 text-lg tracking-tight" style={{ color: brandColor }}>···</span>;
  const border = style === "dashed" ? "border-dashed" : "border-solid";
  return <div className={`flex-1 border-t-2 ${border} min-w-[24px]`} style={{ borderColor: brandColor }} />;
}

function VConnector({ style, brandColor }: { style: ConnectorStyle; brandColor: string }) {
  if (style === "none") return null;
  if (style === "dots") return (
    <div className="flex flex-col items-center gap-1 py-1">
      {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: brandColor }} />)}
    </div>
  );
  const border = style === "dashed" ? "border-dashed" : "border-solid";
  return <div className={`w-0.5 h-8 border-l-2 ${border} mx-auto`} style={{ borderColor: brandColor }} />;
}

// ── CTA step card ──────────────────────────────────────────────────────────────

function CtaCard({
  step, settings, sid, isEditing, onChange, content,
}: {
  step: ProcessStep; settings: SiteSettings; sid: string; isEditing: boolean;
  onChange?: (c: ProcessContent) => void; content: ProcessContent;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 p-8 rounded-2xl text-white text-center min-h-[200px]"
      style={{ backgroundColor: settings.brandColor }}
    >
      <InlineEditableText
        id={`${sid}-step-${step.id}-title`}
        as="h3"
        value={step.title}
        placeholder="Ready to get started?"
        className="text-xl font-bold"
        style={{ color: "#fff" }}
        enterBehavior="commit"
        onCommit={v => onChange?.({ ...content, steps: content.steps.map(s => s.id === step.id ? { ...s, title: v } : s) })}
      />
      <a
        href={step.ctaUrl || content.ctaUrl || "#contact"}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white font-semibold text-sm hover:opacity-90 transition-opacity"
        style={{ color: settings.brandColor }}
        onClick={isEditing ? e => e.preventDefault() : undefined}
      >
        <InlineEditableText
          id={`${sid}-step-${step.id}-cta`}
          as="span"
          value={content.ctaText ?? "Get a Free Estimate"}
          placeholder="Button label"
          className="font-semibold text-sm"
          style={{ color: settings.brandColor }}
          enterBehavior="commit"
          onCommit={v => onChange?.({ ...content, ctaText: v })}
        />
        <ChevronRight className="w-4 h-4 flex-shrink-0" />
      </a>
      {isEditing && (
        <input
          type="text"
          value={step.ctaUrl ?? content.ctaUrl ?? ""}
          onChange={e => onChange?.({ ...content, steps: content.steps.map(s => s.id === step.id ? { ...s, ctaUrl: e.target.value } : s) })}
          placeholder="Button URL (e.g. #contact)"
          className="px-3 py-1.5 text-xs text-gray-800 border border-white/30 rounded-lg bg-white/20 placeholder:text-white/60 text-white focus:outline-none focus:ring-1 focus:ring-white w-full max-w-[220px]"
        />
      )}
    </div>
  );
}

// ── Standard step card ─────────────────────────────────────────────────────────

function StepCard({
  step, idx, settings, sid, isEditing, onChange, content,
  variant = "card",
}: {
  step: ProcessStep; idx: number; settings: SiteSettings; sid: string; isEditing: boolean;
  onChange?: (c: ProcessContent) => void; content: ProcessContent;
  variant?: "card" | "minimal";
}) {
  function updateStep(patch: Partial<ProcessStep>) {
    onChange?.({ ...content, steps: content.steps.map(s => s.id === step.id ? { ...s, ...patch } : s) });
  }

  const isCta = step.ctaMode && !isEditing && idx === content.steps.length - 1;
  if (isCta) return <CtaCard step={step} settings={settings} sid={sid} isEditing={isEditing} onChange={onChange} content={content} />;
  if (step.ctaMode && isEditing && idx === content.steps.length - 1) {
    return <CtaCard step={step} settings={settings} sid={sid} isEditing={isEditing} onChange={onChange} content={content} />;
  }

  if (variant === "minimal") {
    // Used in horizontal layout — tighter, no card frame
    return (
      <div className="flex flex-col items-center text-center gap-2 flex-1 min-w-0">
        <NumberBubble n={idx} brandColor={settings.brandColor} />
        <div className="text-3xl leading-none">{step.icon}</div>
        <InlineEditableText
          id={`${sid}-step-${step.id}-title`}
          as="h3"
          value={step.title}
          placeholder="Step title"
          className="text-sm font-bold"
          style={{ color: "var(--theme-text, #111827)" }}
          enterBehavior="commit"
          onCommit={v => updateStep({ title: v })}
        />
        <InlineEditableText
          id={`${sid}-step-${step.id}-desc`}
          as="p"
          value={step.description}
          placeholder="Brief description…"
          className="text-xs leading-relaxed"
          style={{ color: "var(--theme-text-muted, #6b7280)" }}
          onCommit={v => updateStep({ description: v })}
        />
        {isEditing && (
          <input
            type="text"
            value={step.icon}
            onChange={e => updateStep({ icon: e.target.value })}
            placeholder="Emoji"
            className="w-12 text-center border border-border rounded px-1 py-0.5 text-xs bg-background"
          />
        )}
      </div>
    );
  }

  // Card variant
  return (
    <div
      className="flex flex-col gap-3 p-6 rounded-xl border border-border bg-background hover:shadow-md transition-shadow"
      style={{ borderRadius: "var(--theme-card-radius, 0.75rem)" }}
    >
      <div className="flex items-center gap-3">
        <NumberBubble n={idx} brandColor={settings.brandColor} />
        {isEditing ? (
          <input
            type="text"
            value={step.icon}
            onChange={e => updateStep({ icon: e.target.value })}
            placeholder="🏠"
            className="w-10 text-center text-2xl border border-border rounded px-1 py-0.5 bg-background"
          />
        ) : (
          <span className="text-2xl">{step.icon}</span>
        )}
      </div>
      <InlineEditableText
        id={`${sid}-step-${step.id}-title`}
        as="h3"
        value={step.title}
        placeholder="Step title"
        className="text-base font-bold"
        style={{ color: "var(--theme-text, #111827)" }}
        enterBehavior="commit"
        onCommit={v => updateStep({ title: v })}
      />
      <InlineEditableText
        id={`${sid}-step-${step.id}-desc`}
        as="p"
        value={step.description}
        placeholder="Brief description of this step…"
        className="text-sm leading-relaxed"
        style={{ color: "var(--theme-text-muted, #6b7280)" }}
        onCommit={v => updateStep({ description: v })}
      />
    </div>
  );
}

// ── Layout: Horizontal ─────────────────────────────────────────────────────────

function HorizontalLayout({ content, settings, sid, isEditing, onChange }: LayoutProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
      {content.steps.map((step, idx) => (
        <div key={step.id} className="flex flex-col sm:flex-row items-center gap-3 sm:gap-0 flex-1 min-w-0">
          <StepCard
            step={step} idx={idx} settings={settings} sid={sid}
            isEditing={isEditing} onChange={onChange} content={content}
            variant="minimal"
          />
          {idx < content.steps.length - 1 && (
            <div className="hidden sm:flex items-center flex-shrink-0 mx-3">
              <HConnector style={content.connector} brandColor={settings.brandColor} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Layout: Cards ──────────────────────────────────────────────────────────────

function CardsLayout({ content, settings, sid, isEditing, onChange }: LayoutProps) {
  const n = content.steps.length;
  const cols =
    n <= 2 ? "sm:grid-cols-2" :
    n === 3 ? "sm:grid-cols-3" :
    n <= 4 ? "sm:grid-cols-2 lg:grid-cols-4" :
    n <= 6 ? "sm:grid-cols-2 lg:grid-cols-3" :
    "sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div className={`grid grid-cols-1 ${cols} gap-6`}>
      {content.steps.map((step, idx) => (
        <StepCard
          key={step.id}
          step={step} idx={idx} settings={settings} sid={sid}
          isEditing={isEditing} onChange={onChange} content={content}
          variant="card"
        />
      ))}
    </div>
  );
}

// ── Layout: Zig-zag ────────────────────────────────────────────────────────────

function ZigzagLayout({ content, settings, sid, isEditing, onChange }: LayoutProps) {
  return (
    <div className="flex flex-col gap-12">
      {content.steps.map((step, idx) => {
        // CTA last step — spans full width
        if (step.ctaMode && idx === content.steps.length - 1) {
          return (
            <div key={step.id}>
              <CtaCard step={step} settings={settings} sid={sid} isEditing={isEditing} onChange={onChange} content={content} />
            </div>
          );
        }
        const even = idx % 2 === 0;
        return (
          <div
            key={step.id}
            className={`grid grid-cols-1 md:grid-cols-2 gap-8 items-center ${!even ? "md:[direction:rtl]" : ""}`}
          >
            {/* Number + icon column */}
            <div className={`flex flex-col items-center gap-4 [direction:ltr]`}>
              <div
                className="w-28 h-28 rounded-full flex flex-col items-center justify-center shadow-lg"
                style={{ backgroundColor: `${settings.brandColor}15` }}
              >
                <span className="text-4xl">{step.icon}</span>
                <span className="text-xs font-bold mt-1" style={{ color: settings.brandColor }}>
                  Step {idx + 1}
                </span>
              </div>
            </div>
            {/* Text column */}
            <div className="[direction:ltr] flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <NumberBubble n={idx} brandColor={settings.brandColor} />
                {isEditing && (
                  <input
                    type="text"
                    value={step.icon}
                    onChange={e => onChange?.({ ...content, steps: content.steps.map(s => s.id === step.id ? { ...s, icon: e.target.value } : s) })}
                    placeholder="🏠"
                    className="w-10 text-center text-2xl border border-border rounded px-1 py-0.5 bg-background"
                  />
                )}
              </div>
              <InlineEditableText
                id={`${sid}-step-${step.id}-title`}
                as="h3"
                value={step.title}
                placeholder="Step title"
                className="text-2xl font-bold"
                style={{ color: "var(--theme-text, #111827)" }}
                enterBehavior="commit"
                onCommit={v => onChange?.({ ...content, steps: content.steps.map(s => s.id === step.id ? { ...s, title: v } : s) })}
              />
              <InlineEditableText
                id={`${sid}-step-${step.id}-desc`}
                as="p"
                value={step.description}
                placeholder="Brief description of this step…"
                className="text-base leading-relaxed"
                style={{ color: "var(--theme-text-muted, #4b5563)" }}
                onCommit={v => onChange?.({ ...content, steps: content.steps.map(s => s.id === step.id ? { ...s, description: v } : s) })}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Layout: Vertical Timeline ─────────────────────────────────────────────────

function TimelineLayout({ content, settings, sid, isEditing, onChange }: LayoutProps) {
  return (
    <div className="flex flex-col gap-0 max-w-2xl mx-auto">
      {content.steps.map((step, idx) => {
        // CTA last step — render CtaCard aligned with the content column
        if (step.ctaMode && idx === content.steps.length - 1) {
          return (
            <div key={step.id} className="flex gap-6">
              <div className="flex flex-col items-center flex-shrink-0">
                <NumberBubble n={idx} brandColor={settings.brandColor} />
              </div>
              <div className="flex-1 min-w-0 pb-4">
                <CtaCard step={step} settings={settings} sid={sid} isEditing={isEditing} onChange={onChange} content={content} />
              </div>
            </div>
          );
        }
        return (
        <div key={step.id} className="flex gap-6">
          {/* Line column */}
          <div className="flex flex-col items-center flex-shrink-0">
            <NumberBubble n={idx} brandColor={settings.brandColor} />
            {idx < content.steps.length - 1 && (
              <div className="flex-1 mt-2 mb-2">
                <VConnector style={content.connector} brandColor={settings.brandColor} />
              </div>
            )}
          </div>
          {/* Content column */}
          <div className="flex flex-col gap-2 pb-10 flex-1 min-w-0">
            <div className="flex items-center gap-2 mt-1">
              {isEditing ? (
                <input
                  type="text"
                  value={step.icon}
                  onChange={e => onChange?.({ ...content, steps: content.steps.map(s => s.id === step.id ? { ...s, icon: e.target.value } : s) })}
                  placeholder="🏠"
                  className="w-10 text-center text-xl border border-border rounded px-1 py-0.5 bg-background flex-shrink-0"
                />
              ) : (
                <span className="text-xl flex-shrink-0">{step.icon}</span>
              )}
              <InlineEditableText
                id={`${sid}-step-${step.id}-title`}
                as="h3"
                value={step.title}
                placeholder="Step title"
                className="text-lg font-bold"
                style={{ color: "var(--theme-text, #111827)" }}
                enterBehavior="commit"
                onCommit={v => onChange?.({ ...content, steps: content.steps.map(s => s.id === step.id ? { ...s, title: v } : s) })}
              />
            </div>
            <InlineEditableText
              id={`${sid}-step-${step.id}-desc`}
              as="p"
              value={step.description}
              placeholder="Brief description of this step…"
              className="text-sm leading-relaxed"
              style={{ color: "var(--theme-text-muted, #4b5563)" }}
              onCommit={v => onChange?.({ ...content, steps: content.steps.map(s => s.id === step.id ? { ...s, description: v } : s) })}
            />
          </div>
        </div>
        );
      })}
    </div>
  );
}

// ── Layout dispatcher ──────────────────────────────────────────────────────────

interface LayoutProps {
  content: ProcessContent;
  settings: SiteSettings;
  sid: string;
  isEditing: boolean;
  onChange?: (c: ProcessContent) => void;
}

function ProcessBody(props: LayoutProps) {
  switch (props.content.layout) {
    case "horizontal": return <HorizontalLayout {...props} />;
    case "cards":      return <CardsLayout      {...props} />;
    case "zigzag":     return <ZigzagLayout     {...props} />;
    case "timeline":   return <TimelineLayout   {...props} />;
    default:           return <CardsLayout      {...props} />;
  }
}

// ── Edit panel ────────────────────────────────────────────────────────────────

const LAYOUTS: Array<{ key: ProcessLayout; label: string }> = [
  { key: "horizontal", label: "Horizontal" },
  { key: "cards",      label: "Cards" },
  { key: "zigzag",     label: "Zig-zag" },
  { key: "timeline",   label: "Timeline" },
];

const CONNECTORS: Array<{ key: ConnectorStyle; label: string }> = [
  { key: "arrow",  label: "→ Arrow" },
  { key: "solid",  label: "— Solid" },
  { key: "dashed", label: "- Dashed" },
  { key: "dots",   label: "··· Dots" },
  { key: "none",   label: "None" },
];

function EditPanel({ content, onChange }: { content: ProcessContent; onChange?: (c: ProcessContent) => void }) {
  function update(patch: Partial<ProcessContent>) { onChange?.({ ...content, ...patch }); }

  function moveStep(id: string, dir: -1 | 1) {
    const idx = content.steps.findIndex(s => s.id === id);
    if (idx < 0) return;
    const next = [...content.steps];
    const ti = idx + dir;
    if (ti < 0 || ti >= next.length) return;
    [next[idx], next[ti]] = [next[ti], next[idx]];
    update({ steps: next });
  }

  function removeStep(id: string) {
    if (content.steps.length <= 2) return; // minimum 2
    update({ steps: content.steps.filter(s => s.id !== id) });
  }

  function addStep() {
    if (content.steps.length >= 8) return;
    update({ steps: [...content.steps, { id: uid(), icon: "✅", title: "New Step", description: "Describe what happens in this step." }] });
  }

  function toggleCta(id: string, checked: boolean) {
    update({
      steps: content.steps.map(s =>
        s.id === id ? { ...s, ctaMode: checked } : { ...s, ctaMode: false }
      ),
    });
  }

  return (
    <div className="border border-border rounded-lg bg-muted/20 p-4 mt-6 space-y-4">
      {/* Layout + connector selectors */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Layout:</span>
          {LAYOUTS.map(l => (
            <button
              key={l.key}
              type="button"
              onClick={() => update({ layout: l.key })}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                content.layout === l.key
                  ? "bg-primary text-white border-primary"
                  : "bg-background border-border text-muted-foreground hover:border-primary"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Connector:</span>
          <select
            value={content.connector}
            onChange={e => update({ connector: e.target.value as ConnectorStyle })}
            className="text-xs border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {CONNECTORS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
      </div>

      {/* Step list */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Steps</p>
        {content.steps.map((step, idx) => (
          <div
            key={step.id}
            className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border"
          >
            <span className="text-sm w-5 text-center text-muted-foreground font-mono flex-shrink-0">{circled(idx)}</span>
            <span className="flex-shrink-0">{step.icon}</span>
            <span className="text-xs font-medium truncate flex-1">{step.title || "Untitled"}</span>
            {/* CTA toggle on last step */}
            {idx === content.steps.length - 1 && (
              <label className="flex items-center gap-1 cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={!!step.ctaMode}
                  onChange={e => toggleCta(step.id, e.target.checked)}
                  className="accent-primary"
                />
                <span className="text-[10px] text-muted-foreground">CTA</span>
              </label>
            )}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => moveStep(step.id, -1)}
                disabled={idx === 0}
                className="p-1 rounded hover:bg-muted disabled:opacity-30"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => moveStep(step.id, 1)}
                disabled={idx === content.steps.length - 1}
                className="p-1 rounded hover:bg-muted disabled:opacity-30"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => removeStep(step.id)}
                disabled={content.steps.length <= 2}
                className="p-1 rounded hover:bg-muted text-red-400 hover:text-red-600 disabled:opacity-30"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
        {content.steps.length < 8 && (
          <button
            type="button"
            onClick={addStep}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors w-full justify-center"
          >
            <Plus className="w-3 h-3" /> Add step
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ProcessSectionProps {
  content: ProcessContent;
  settings: SiteSettings;
  isEditing?: boolean;
  onChange?: (content: ProcessContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
}

export function ProcessSection({
  content,
  settings,
  isEditing = false,
  onChange,
  blockStyle,
  sectionId,
}: ProcessSectionProps) {
  const sid = sectionId ?? "process";

  return (
    <BlockStyleWrapper
      wrapperClassName="py-16 px-6"
      blockStyle={blockStyle}
      isEditing={isEditing}
    >
      <div className="max-w-5xl mx-auto">
        {/* Section heading */}
        {(content.heading !== undefined || content.subheading !== undefined) && (
          <div className="text-center mb-12">
            <InlineEditableText
              id={`${sid}-heading`}
              as="h2"
              value={content.heading ?? ""}
              placeholder="How We Work"
              className="text-3xl font-bold mb-2"
              style={{ color: "var(--theme-text, #111827)" }}
              onCommit={v => onChange?.({ ...content, heading: v })}
            />
            <InlineEditableText
              id={`${sid}-subheading`}
              as="p"
              value={content.subheading ?? ""}
              placeholder="A short intro about your process…"
              className="text-base"
              style={{ color: "var(--theme-text-muted, #6b7280)" }}
              onCommit={v => onChange?.({ ...content, subheading: v || undefined })}
            />
          </div>
        )}

        {/* Layout body */}
        <ProcessBody
          content={content}
          settings={settings}
          sid={sid}
          isEditing={isEditing}
          onChange={onChange}
        />

        {/* Edit panel below */}
        {isEditing && <EditPanel content={content} onChange={onChange} />}
      </div>
    </BlockStyleWrapper>
  );
}
