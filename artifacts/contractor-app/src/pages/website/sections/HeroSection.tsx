import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { AiCopyPopover } from "./AiCopyPopover";
import { TextStyleToolbar, textStyleToCSS, type TextStyle } from "./TextStyleToolbar";
import { ButtonEditor, buttonConfigToStyle, buttonConfigToClasses, type ButtonConfig } from "./ButtonEditor";

interface HeroContent {
  headline: string;
  subheadline: string;
  ctaLabel: string;
  bgColor: string;
  headlineStyle?: TextStyle;
  subheadlineStyle?: TextStyle;
  ctaButton?: ButtonConfig;
}

interface HeroSectionProps {
  content: HeroContent;
  settings: { brandColor: string; accentColor?: string; secondaryColor?: string; logoUrl?: string };
  isEditing?: boolean;
  onChange?: (content: HeroContent) => void;
  businessName?: string;
  blockStyle?: BlockStyle;
}

export function HeroSection({ content, settings, isEditing, onChange, businessName, blockStyle }: HeroSectionProps) {
  const bg = content.bgColor || settings.brandColor || "#1a1a2e";
  const biz = businessName ?? "a contractor business";

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
        <input
          data-edit-field="headline"
          className="w-full text-center text-4xl font-bold bg-transparent border-b border-white/30 focus:border-white outline-none mb-1 placeholder-white/40"
          style={headlineCSS}
          value={content.headline}
          placeholder="Your headline here"
          onChange={e => update({ headline: e.target.value })}
        />
        <TextStyleToolbar
          style={content.headlineStyle}
          onChange={s => update({ headlineStyle: s })}
          dark
        />
        <AiCopyPopover
          variant="dark"
          label="Headline"
          defaultPrompt={`Write a punchy 5-8 word headline for ${biz}'s website. It should be confident and appeal to homeowners.`}
          onAccept={v => update({ headline: v })}
        />
        <div className="mb-4" />
        <input
          data-edit-field="subheadline"
          className="w-full text-center text-lg bg-transparent border-b border-white/30 focus:border-white outline-none mb-1 placeholder-white/40"
          style={subheadlineCSS}
          value={content.subheadline}
          placeholder="Subheadline text"
          onChange={e => update({ subheadline: e.target.value })}
        />
        <TextStyleToolbar
          style={content.subheadlineStyle}
          onChange={s => update({ subheadlineStyle: s })}
          dark
        />
        <AiCopyPopover
          variant="dark"
          label="Subheadline"
          defaultPrompt={`Write a 1-2 sentence subheadline for ${biz}'s website. The headline is: "${content.headline}". Keep it under 20 words.`}
          onAccept={v => update({ subheadline: v })}
        />
        <div className="mb-6" />
        <input
          data-edit-field="ctaLabel"
          className="inline-block text-sm font-semibold px-6 py-3 rounded-full bg-white/20 border border-white/40 focus:border-white outline-none text-center placeholder-white/40"
          value={content.ctaLabel}
          placeholder="Button label"
          onChange={e => update({ ctaLabel: e.target.value })}
        />
        <ButtonEditor
          config={content.ctaButton}
          onChange={cfg => update({ ctaButton: cfg })}
        />
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
      <h1
        data-edit-field="headline"
        className="text-4xl md:text-5xl font-bold mb-4 leading-tight"
        style={headlineCSS}
      >
        {content.headline}
      </h1>
      <p
        data-edit-field="subheadline"
        className="text-lg md:text-xl text-white/80 mb-8 max-w-2xl mx-auto"
        style={subheadlineCSS}
      >
        {content.subheadline}
      </p>
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
    </BlockStyleWrapper>
  );
}
