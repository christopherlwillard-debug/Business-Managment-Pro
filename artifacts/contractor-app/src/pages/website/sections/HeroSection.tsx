import { Eye, EyeOff, Trash2 } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { AiCopyPopover } from "./AiCopyPopover";
import { FloatingToolbar, textStyleToCSS, type TextStyle } from "./TextStyleToolbar";
import { ButtonEditor, buttonConfigToStyle, buttonConfigToClasses, type ButtonConfig } from "./ButtonEditor";
import { InlineEditableText } from "../InlineEditableText";
import { getSafeWebsiteHref } from "../storageUtils";

// ── Content interface ──────────────────────────────────────────────────────────

export interface HeroContent {
  headline: string;
  subheadline: string;
  ctaLabel: string;
  bgColor: string;
  headlineStyle?: TextStyle;
  subheadlineStyle?: TextStyle;
  ctaButton?: ButtonConfig;
  showHeadline?: boolean;
  showSubheadline?: boolean;
  showCta?: boolean;

  // Layout preset
  layout?: "centered" | "split" | "minimal";

  // Background (centered layout): image + overlay
  backgroundImage?: string;
  overlayOpacity?: number;   // 0–0.9, default 0.45

  // Secondary CTA
  secondaryCta?: { label: string; href: string; enabled?: boolean };

  // Badge (floating certification/veteran badge)
  badge?: { imageUrl: string; position?: "top-right" | "bottom-right" };

  // Trust bar (horizontal strip below hero)
  trustBar?: { enabled: boolean; items: Array<{ id: string; icon: string; label: string }> };
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface HeroSectionProps {
  content: HeroContent;
  settings: { brandColor: string; accentColor?: string; secondaryColor?: string; logoUrl?: string };
  isEditing?: boolean;
  onChange?: (content: HeroContent) => void;
  businessName?: string;
  blockStyle?: BlockStyle;
  sectionId?: string;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

// ── InlineToggle ───────────────────────────────────────────────────────────────

function InlineToggle({
  label, visible, onToggle, dark = false,
}: {
  label: string; visible: boolean; onToggle: () => void; dark?: boolean;
}) {
  const cls = dark
    ? visible
      ? "border-gray-300 text-gray-400 hover:border-red-400/60 hover:text-red-500 hover:bg-red-50"
      : "border-gray-200 text-gray-300 hover:border-gray-400 hover:text-gray-500 bg-gray-50"
    : visible
      ? "border-white/30 text-white/60 hover:border-red-400/60 hover:text-red-400/80 hover:bg-red-400/10"
      : "border-white/20 text-white/30 hover:border-white/50 hover:text-white/60 bg-white/5";
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onToggle(); }}
      title={visible ? `Hide ${label}` : `Show ${label}`}
      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${cls}`}
    >
      {visible ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
      {visible ? `Hide ${label}` : `Show ${label}`}
    </button>
  );
}

// ── HeroSection ────────────────────────────────────────────────────────────────

export function HeroSection({
  content, settings, isEditing, onChange, businessName, blockStyle, sectionId,
}: HeroSectionProps) {
  const layout       = content.layout ?? "centered";
  const isMinimal    = layout === "minimal";
  const isSplit      = layout === "split";
  const darkText     = isMinimal;
  const bg           = isMinimal ? "#f9fafb" : (content.bgColor || settings.brandColor || "#1a1a2e");
  const biz          = businessName ?? "a contractor business";
  const sid          = sectionId ?? "hero";

  const showHeadline    = content.showHeadline !== false;
  const showSubheadline = content.showSubheadline !== false;
  const showCta         = content.showCta !== false;

  const ctaBtn          = content.ctaButton ?? {};
  const ctaBtnStyle     = buttonConfigToStyle(ctaBtn);
  const ctaBtnClasses   = buttonConfigToClasses(ctaBtn);
  const ctaBorderRadius = ctaBtnStyle.borderRadius ?? "var(--theme-btn-radius, 9999px)";
  const ctaBg           = ctaBtnStyle.backgroundColor ?? settings.accentColor ?? "white";
  const ctaText         = ctaBtnStyle.color ?? (settings.accentColor ? "white" : bg);

  const headlineCSS    = textStyleToCSS(content.headlineStyle);
  const subheadlineCSS = textStyleToCSS(content.subheadlineStyle);

  const overlayOpacity = content.overlayOpacity ?? 0.45;

  function update(patch: Partial<HeroContent>) {
    onChange?.({ ...content, ...patch });
  }

  // ── Shared render elements ──────────────────────────────────────────────────

  /** Background image + overlay (centered layout with photo only) */
  const bgImageLayer = content.backgroundImage && !isSplit && !isMinimal ? (
    <>
      <img
        src={content.backgroundImage}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        style={{ zIndex: 0 }}
        alt=""
        draggable={false}
      />
      <div
        className="absolute inset-0 bg-black pointer-events-none"
        style={{ opacity: overlayOpacity, zIndex: 1 }}
      />
    </>
  ) : null;

  /** Floating certification/veteran badge */
  const badgeEl = content.badge?.imageUrl ? (
    <img
      src={content.badge.imageUrl}
      alt="certification badge"
      draggable={false}
      className={`absolute w-16 h-16 object-contain pointer-events-none select-none ${
        content.badge.position === "bottom-right" ? "bottom-4 right-4" : "top-4 right-4"
      }`}
      style={{ zIndex: 10 }}
    />
  ) : null;

  /** Trust bar strip rendered below hero */
  const trustBarEl = content.trustBar?.enabled && (content.trustBar.items?.length ?? 0) > 0 ? (
    <div className="w-full bg-gray-50 border-b border-gray-100 py-2.5 px-6">
      <div className="max-w-5xl mx-auto flex flex-wrap justify-center gap-x-8 gap-y-1.5">
        {content.trustBar.items.map(item => (
          <div key={item.id} className="flex items-center gap-1.5 text-sm text-gray-600">
            <span>{item.icon}</span>
            <span className="font-medium">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  /** Secondary CTA button (view-only; edit via inspector) */
  const secondaryCtaEl = showCta && content.secondaryCta?.enabled ? (
    <a
      href={getSafeWebsiteHref(content.secondaryCta.href) ?? "#"}
      className={`inline-flex items-center justify-center px-6 py-3 font-semibold border-2 transition-colors ${
        darkText
          ? "rounded-full border-gray-400 text-gray-700 hover:bg-gray-100"
          : "rounded-full border-white/70 text-white hover:bg-white/10"
      }`}
      style={{ borderRadius: ctaBorderRadius }}
    >
      {content.secondaryCta.label || "Call Now"}
    </a>
  ) : null;

  // ── Edit mode ───────────────────────────────────────────────────────────────

  if (isEditing) {
    /** Inner editing content — same regardless of layout */
    const textCls = darkText ? "text-gray-900" : "text-white";

    const editCore = (
      <>
        {/* Headline */}
        <div className="relative">
          {showHeadline ? (
            <>
              <div className="relative">
                <InlineEditableText
                  id={`${sid}-headline`}
                  as="h1"
                  value={content.headline}
                  placeholder="Your headline here"
                  className={`font-bold leading-tight w-full ${textCls}${!content.headlineStyle?.fontSize ? " text-4xl md:text-5xl" : ""}`}
                  style={headlineCSS}
                  onCommit={v => update({ headline: v })}
                />
                <FloatingToolbar
                  id={`${sid}-headline`}
                  style={content.headlineStyle}
                  onChange={s => update({ headlineStyle: s })}
                  dark={!darkText}
                />
              </div>
              <AiCopyPopover
                variant={darkText ? "light" : "dark"}
                label="Headline"
                defaultPrompt={`Write a punchy 5-8 word headline for ${biz}'s website. It should be confident and appeal to homeowners.`}
                onAccept={v => update({ headline: v })}
              />
            </>
          ) : (
            <div className={`py-3 italic text-sm border border-dashed rounded ${darkText ? "text-gray-300 border-gray-200" : "text-white/30 border-white/20"}`}>
              Headline hidden
            </div>
          )}
          <div className="mt-1">
            <InlineToggle label="Headline" visible={showHeadline} onToggle={() => update({ showHeadline: !showHeadline })} dark={darkText} />
          </div>
        </div>

        <div className="mb-4" />

        {/* Subheadline */}
        <div className="relative">
          {showSubheadline ? (
            <>
              <div className="relative">
                <InlineEditableText
                  id={`${sid}-subheadline`}
                  as="p"
                  value={content.subheadline}
                  placeholder="Subheadline text"
                  className={`${darkText ? "text-gray-600" : "text-white/80"} max-w-2xl mx-auto${!content.subheadlineStyle?.fontSize ? " text-lg md:text-xl" : ""}`}
                  style={subheadlineCSS}
                  onCommit={v => update({ subheadline: v })}
                />
                <FloatingToolbar
                  id={`${sid}-subheadline`}
                  style={content.subheadlineStyle}
                  onChange={s => update({ subheadlineStyle: s })}
                  dark={!darkText}
                />
              </div>
              <AiCopyPopover
                variant={darkText ? "light" : "dark"}
                label="Subheadline"
                defaultPrompt={`Write a 1-2 sentence subheadline for ${biz}'s website. The headline is: "${content.headline}". Keep it under 20 words.`}
                onAccept={v => update({ subheadline: v })}
              />
            </>
          ) : (
            <div className={`py-3 italic text-sm border border-dashed rounded ${darkText ? "text-gray-300 border-gray-200" : "text-white/30 border-white/20"}`}>
              Subheadline hidden
            </div>
          )}
          <div className="mt-1">
            <InlineToggle label="Subheadline" visible={showSubheadline} onToggle={() => update({ showSubheadline: !showSubheadline })} dark={darkText} />
          </div>
        </div>

        <div className="mb-6" />

        {/* Primary CTA + Secondary CTA */}
        <div className="relative">
          {showCta ? (
            <>
              <div className={`flex flex-wrap ${isSplit ? "justify-start" : "justify-center"} gap-3 items-center`}>
                <div
                  className={`inline-block ${ctaBtnClasses}`}
                  style={{
                    backgroundColor: ctaBg,
                    color: ctaText,
                    borderRadius: ctaBorderRadius,
                    fontWeight: "var(--theme-btn-font-weight, 600)" as React.CSSProperties["fontWeight"],
                    boxShadow: "var(--theme-btn-shadow, none)",
                  }}
                >
                  <InlineEditableText
                    id={`${sid}-cta`}
                    as="span"
                    value={content.ctaLabel}
                    placeholder="Button label"
                    enterBehavior="commit"
                    escapeBehavior="cancel"
                    onCommit={v => update({ ctaLabel: v })}
                  />
                </div>
                {content.secondaryCta?.enabled && (
                  <div
                    className={`inline-flex items-center px-6 py-3 font-semibold border-2 opacity-80 ${darkText ? "border-gray-400 text-gray-700" : "border-white/70 text-white"}`}
                    style={{ borderRadius: ctaBorderRadius }}
                  >
                    {content.secondaryCta.label || "Call Now"}
                    <span className={`ml-1.5 text-[9px] opacity-50 ${darkText ? "text-gray-500" : "text-white/50"}`}>(inspector)</span>
                  </div>
                )}
              </div>
              <ButtonEditor
                config={content.ctaButton}
                onChange={cfg => update({ ctaButton: cfg })}
              />
            </>
          ) : (
            <div className={`py-3 italic text-sm border border-dashed rounded ${darkText ? "text-gray-300 border-gray-200" : "text-white/30 border-white/20"}`}>
              Button hidden
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <InlineToggle label="Button" visible={showCta} onToggle={() => update({ showCta: !showCta })} dark={darkText} />
            {showCta && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); update({ showCta: false }); }}
                title="Remove button"
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-red-400/40 text-red-400/70 hover:bg-red-400/10 hover:border-red-400/70 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-2.5 h-2.5" />
                Remove button
              </button>
            )}
          </div>
        </div>
      </>
    );

    // Split layout edit
    if (isSplit) {
      return (
        <>
          <BlockStyleWrapper
            wrapperClassName="w-full relative overflow-hidden py-12 px-6 text-white"
            defaultBg={bg}
            blockStyle={blockStyle}
            isEditing={isEditing}
          >
            {badgeEl}
            <div className="relative z-10 max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-8 md:gap-12">
              <div className="flex-1">{editCore}</div>
              <div className="flex-1">
                {content.backgroundImage ? (
                  <img
                    src={content.backgroundImage}
                    className="w-full h-64 md:h-80 object-cover rounded-2xl shadow-xl"
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-64 rounded-2xl bg-white/10 border-2 border-dashed border-white/20 flex items-center justify-center">
                    <span className="text-white/30 text-xs text-center px-4">Add a background image in the inspector →</span>
                  </div>
                )}
              </div>
            </div>
          </BlockStyleWrapper>
          {trustBarEl}
        </>
      );
    }

    // Centered / minimal edit
    return (
      <>
        <BlockStyleWrapper
          wrapperClassName={`w-full relative overflow-hidden py-20 px-6 ${darkText ? "text-gray-900" : "text-white"} text-center`}
          defaultBg={bg}
          blockStyle={blockStyle}
          isEditing={isEditing}
        >
          {bgImageLayer}
          {badgeEl}
          <div className="relative z-10">{editCore}</div>
        </BlockStyleWrapper>
        {trustBarEl}
      </>
    );
  }

  // ── View mode ────────────────────────────────────────────────────────────────

  const ctaHref   = getSafeWebsiteHref(ctaBtn.url) ?? "#contact";
  const ctaTarget = ctaBtn.newTab && /^https?:\/\//i.test(ctaHref) ? "_blank" : undefined;
  const ctaRel    = ctaTarget ? "noopener noreferrer" : undefined;

  const primaryCtaEl = showCta ? (
    <a
      data-edit-field="ctaLabel"
      data-element-type="button"
      data-element-label="CTA Button"
      href={ctaHref}
      target={ctaTarget}
      rel={ctaRel}
      className={`inline-block transition-opacity hover:opacity-90 ${ctaBtnClasses}`}
      style={{
        backgroundColor: ctaBg,
        color: ctaText,
        borderRadius: ctaBorderRadius,
        fontWeight: "var(--theme-btn-font-weight, 600)" as React.CSSProperties["fontWeight"],
        boxShadow: "var(--theme-btn-shadow, none)",
      }}
    >
      {content.ctaLabel}
    </a>
  ) : null;

  // ── Split layout view ──────────────────────────────────────────────────────
  if (isSplit) {
    return (
      <>
        <BlockStyleWrapper
          wrapperClassName="w-full relative overflow-hidden py-12 px-6 text-white"
          defaultBg={bg}
          blockStyle={blockStyle}
          isEditing={isEditing}
        >
          {badgeEl}
          <div className="relative z-10 max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-8 md:gap-12">
            {/* Left: text */}
            <div className="flex-1 text-left">
              {showHeadline && (
                <h1
                  data-edit-field="headline"
                  data-element-type="heading"
                  className={`font-bold mb-4 leading-tight${!content.headlineStyle?.fontSize ? " text-4xl md:text-5xl" : ""}`}
                  style={headlineCSS}
                >
                  {content.headline}
                </h1>
              )}
              {showSubheadline && (
                <p
                  data-edit-field="subheadline"
                  data-element-type="subheading"
                  className={`text-white/80 mb-8${!content.subheadlineStyle?.fontSize ? " text-lg md:text-xl" : ""}`}
                  style={subheadlineCSS}
                >
                  {content.subheadline}
                </p>
              )}
              {showCta && (
                <div className="flex flex-wrap gap-3 items-center">
                  {primaryCtaEl}
                  {secondaryCtaEl}
                </div>
              )}
            </div>
            {/* Right: image */}
            <div className="flex-1">
              {content.backgroundImage ? (
                <img
                  src={content.backgroundImage}
                  className="w-full h-64 md:h-80 object-cover rounded-2xl shadow-xl"
                  alt=""
                />
              ) : (
                <div className="w-full h-64 rounded-2xl bg-white/10 border border-white/10" />
              )}
            </div>
          </div>
        </BlockStyleWrapper>
        {trustBarEl}
      </>
    );
  }

  // ── Minimal layout view ────────────────────────────────────────────────────
  if (isMinimal) {
    return (
      <>
        <BlockStyleWrapper
          wrapperClassName="w-full py-20 px-6 text-center"
          defaultBg="#f9fafb"
          blockStyle={blockStyle}
          isEditing={isEditing}
        >
          {badgeEl}
          <div className="relative z-10">
            {showHeadline && (
              <h1
                data-edit-field="headline"
                data-element-type="heading"
                className={`font-bold mb-4 leading-tight text-gray-900${!content.headlineStyle?.fontSize ? " text-4xl md:text-5xl" : ""}`}
                style={{ ...headlineCSS, color: headlineCSS.color ?? "#111827" }}
              >
                {content.headline}
              </h1>
            )}
            {showSubheadline && (
              <p
                data-edit-field="subheadline"
                data-element-type="subheading"
                className={`text-gray-600 mb-8 max-w-2xl mx-auto${!content.subheadlineStyle?.fontSize ? " text-lg md:text-xl" : ""}`}
                style={{ ...subheadlineCSS, color: subheadlineCSS.color ?? "#4b5563" }}
              >
                {content.subheadline}
              </p>
            )}
            {showCta && (
              <div className="flex flex-wrap justify-center gap-3 items-center">
                {primaryCtaEl}
                {secondaryCtaEl}
              </div>
            )}
          </div>
        </BlockStyleWrapper>
        {trustBarEl}
      </>
    );
  }

  // ── Centered layout view (default) ─────────────────────────────────────────
  return (
    <>
      <BlockStyleWrapper
        wrapperClassName="w-full relative overflow-hidden py-20 px-6 text-white text-center"
        defaultBg={bg}
        blockStyle={blockStyle}
        isEditing={isEditing}
      >
        {bgImageLayer}
        {badgeEl}
        <div className="relative z-10">
          {showHeadline && (
            <h1
              data-edit-field="headline"
              data-element-type="heading"
              data-element-label="Heading"
              className={`font-bold mb-4 leading-tight${!content.headlineStyle?.fontSize ? " text-4xl md:text-5xl" : ""}`}
              style={headlineCSS}
            >
              {content.headline}
            </h1>
          )}
          {showSubheadline && (
            <p
              data-edit-field="subheadline"
              data-element-type="subheading"
              data-element-label="Subheading"
              className={`text-white/80 mb-8 max-w-2xl mx-auto${!content.subheadlineStyle?.fontSize ? " text-lg md:text-xl" : ""}`}
              style={subheadlineCSS}
            >
              {content.subheadline}
            </p>
          )}
          {showCta && (
            <div className="flex flex-wrap justify-center gap-3 items-center">
              {primaryCtaEl}
              {secondaryCtaEl}
            </div>
          )}
        </div>
      </BlockStyleWrapper>
      {trustBarEl}
    </>
  );
}
