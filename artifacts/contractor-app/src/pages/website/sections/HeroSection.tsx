import { Eye, EyeOff, Trash2 } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { AiCopyPopover } from "./AiCopyPopover";
import { FloatingToolbar, textStyleToCSS, type TextStyle } from "./TextStyleToolbar";
import { ButtonEditor, buttonConfigToStyle, buttonConfigToClasses, type ButtonConfig } from "./ButtonEditor";
import { InlineEditableText } from "../InlineEditableText";

interface HeroContent {
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
}

interface HeroSectionProps {
  content: HeroContent;
  settings: { brandColor: string; accentColor?: string; secondaryColor?: string; logoUrl?: string };
  isEditing?: boolean;
  onChange?: (content: HeroContent) => void;
  businessName?: string;
  blockStyle?: BlockStyle;
  sectionId?: string;
}

function InlineToggle({
  label,
  visible,
  onToggle,
}: {
  label: string;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onToggle(); }}
      title={visible ? `Hide ${label}` : `Show ${label}`}
      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
        visible
          ? "border-white/30 text-white/60 hover:border-red-400/60 hover:text-red-400/80 hover:bg-red-400/10"
          : "border-white/20 text-white/30 hover:border-white/50 hover:text-white/60 bg-white/5"
      }`}
    >
      {visible ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
      {visible ? `Hide ${label}` : `Show ${label}`}
    </button>
  );
}

export function HeroSection({ content, settings, isEditing, onChange, businessName, blockStyle, sectionId }: HeroSectionProps) {
  const bg = content.bgColor || settings.brandColor || "#1a1a2e";
  const biz = businessName ?? "a contractor business";
  const sid = sectionId ?? "hero";

  const showHeadline = content.showHeadline !== false;
  const showSubheadline = content.showSubheadline !== false;
  const showCta = content.showCta !== false;

  function update(patch: Partial<HeroContent>) {
    onChange?.({ ...content, ...patch });
  }

  const ctaBtn = content.ctaButton ?? {};
  const ctaBtnStyle = buttonConfigToStyle(ctaBtn);
  const ctaBtnClasses = buttonConfigToClasses(ctaBtn);
  const ctaBorderRadius = ctaBtnStyle.borderRadius ?? "var(--theme-btn-radius, 9999px)";
  const ctaBg = ctaBtnStyle.backgroundColor ?? settings.accentColor ?? "white";
  const ctaText = ctaBtnStyle.color ?? (settings.accentColor ? "white" : bg);

  const headlineCSS = textStyleToCSS(content.headlineStyle);
  const subheadlineCSS = textStyleToCSS(content.subheadlineStyle);

  if (isEditing) {
    return (
      <BlockStyleWrapper
        wrapperClassName="w-full py-20 px-6 text-white text-center"
        defaultBg={bg}
        blockStyle={blockStyle}
        isEditing={isEditing}
      >
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
                  className={`font-bold leading-tight w-full text-white${!content.headlineStyle?.fontSize ? " text-4xl md:text-5xl" : ""}`}
                  style={headlineCSS}
                  onCommit={v => update({ headline: v })}
                />
                <FloatingToolbar
                  id={`${sid}-headline`}
                  style={content.headlineStyle}
                  onChange={s => update({ headlineStyle: s })}
                  dark
                />
              </div>
              <AiCopyPopover
                variant="dark"
                label="Headline"
                defaultPrompt={`Write a punchy 5-8 word headline for ${biz}'s website. It should be confident and appeal to homeowners.`}
                onAccept={v => update({ headline: v })}
              />
            </>
          ) : (
            <div className="py-3 text-white/30 italic text-sm border border-dashed border-white/20 rounded">
              Headline hidden
            </div>
          )}
          <div className="mt-1">
            <InlineToggle
              label="Headline"
              visible={showHeadline}
              onToggle={() => update({ showHeadline: !showHeadline })}
            />
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
                  className={`text-white/80 max-w-2xl mx-auto${!content.subheadlineStyle?.fontSize ? " text-lg md:text-xl" : ""}`}
                  style={subheadlineCSS}
                  onCommit={v => update({ subheadline: v })}
                />
                <FloatingToolbar
                  id={`${sid}-subheadline`}
                  style={content.subheadlineStyle}
                  onChange={s => update({ subheadlineStyle: s })}
                  dark
                />
              </div>
              <AiCopyPopover
                variant="dark"
                label="Subheadline"
                defaultPrompt={`Write a 1-2 sentence subheadline for ${biz}'s website. The headline is: "${content.headline}". Keep it under 20 words.`}
                onAccept={v => update({ subheadline: v })}
              />
            </>
          ) : (
            <div className="py-3 text-white/30 italic text-sm border border-dashed border-white/20 rounded">
              Subheadline hidden
            </div>
          )}
          <div className="mt-1">
            <InlineToggle
              label="Subheadline"
              visible={showSubheadline}
              onToggle={() => update({ showSubheadline: !showSubheadline })}
            />
          </div>
        </div>

        <div className="mb-6" />

        {/* CTA Button */}
        <div className="relative">
          {showCta ? (
            <>
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
              <ButtonEditor
                config={content.ctaButton}
                onChange={cfg => update({ ctaButton: cfg })}
              />
            </>
          ) : (
            <div className="py-3 text-white/30 italic text-sm border border-dashed border-white/20 rounded">
              Button hidden
            </div>
          )}
          <div className="mt-2 flex items-center justify-center gap-2">
            <InlineToggle
              label="Button"
              visible={showCta}
              onToggle={() => update({ showCta: !showCta })}
            />
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
      </BlockStyleWrapper>
    );
  }

  const ctaHref = ctaBtn.url || "#contact";
  const ctaTarget = ctaBtn.newTab ? "_blank" : undefined;
  const ctaRel = ctaBtn.newTab ? "noopener noreferrer" : undefined;

  return (
    <BlockStyleWrapper
      wrapperClassName="w-full py-20 px-6 text-white text-center"
      defaultBg={bg}
      blockStyle={blockStyle}
      isEditing={isEditing}
    >
      {showHeadline && (
        <h1
          data-edit-field="headline"
          className={`font-bold mb-4 leading-tight${!content.headlineStyle?.fontSize ? " text-4xl md:text-5xl" : ""}`}
          style={headlineCSS}
        >
          {content.headline}
        </h1>
      )}
      {showSubheadline && (
        <p
          data-edit-field="subheadline"
          className={`text-white/80 mb-8 max-w-2xl mx-auto${!content.subheadlineStyle?.fontSize ? " text-lg md:text-xl" : ""}`}
          style={subheadlineCSS}
        >
          {content.subheadline}
        </p>
      )}
      {showCta && (
        <a
          data-edit-field="ctaLabel"
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
      )}
    </BlockStyleWrapper>
  );
}
