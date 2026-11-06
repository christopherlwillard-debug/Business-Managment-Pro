import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { ButtonEditor, buttonConfigToStyle, buttonConfigToClasses, type ButtonConfig } from "./ButtonEditor";
import { FloatingToolbar, textStyleToCSS, type TextStyle } from "./TextStyleToolbar";
import { InlineEditableText } from "../InlineEditableText";
import { getSafeWebsiteHref } from "../storageUtils";

export interface CTAContent {
  heading: string;
  subheading?: string;
  headingStyle?: TextStyle;
  subheadingStyle?: TextStyle;
  primaryLabel?: string;
  primaryConfig?: ButtonConfig;
  secondaryLabel?: string;
  secondaryConfig?: ButtonConfig;
}

export function defaultCTAContent(): CTAContent {
  return {
    heading: "Ready to Start Your Project?",
    subheading: "Get a free estimate today. No obligation, no pressure — just honest answers.",
    primaryLabel: "Get a Free Quote",
    primaryConfig: { url: "#contact", style: "solid", rounding: "full" },
    secondaryLabel: "Call Us Now",
    secondaryConfig: { url: "tel:", style: "outline", rounding: "full" },
  };
}

interface CTASectionProps {
  content: CTAContent;
  settings: { brandColor: string; accentColor?: string };
  isEditing?: boolean;
  onChange?: (content: CTAContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
}

export function CTASection({ content, settings, isEditing, onChange, blockStyle, sectionId }: CTASectionProps) {
  const sid = sectionId ?? "cta";

  function update(patch: Partial<CTAContent>) {
    onChange?.({ ...content, ...patch });
  }

  const showPrimary = !!(content.primaryLabel);
  const showSecondary = !!(content.secondaryLabel);
  const primaryHref = getSafeWebsiteHref(content.primaryConfig?.url) ?? "#contact";
  const secondaryHref = getSafeWebsiteHref(content.secondaryConfig?.url) ?? "#contact";
  const primaryTarget = content.primaryConfig?.newTab && /^https?:\/\//i.test(primaryHref) ? "_blank" : undefined;
  const secondaryTarget = content.secondaryConfig?.newTab && /^https?:\/\//i.test(secondaryHref) ? "_blank" : undefined;

  if (!isEditing) {
    return (
      <BlockStyleWrapper
        blockStyle={blockStyle}
        wrapperClassName="px-6 py-20"
        isEditing={false}
        defaultBg={settings.brandColor}
      >
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={textStyleToCSS(content.headingStyle)}>{content.heading}</h2>
          {content.subheading && (
            <p className="text-white/80 text-lg mb-8" style={textStyleToCSS(content.subheadingStyle)}>{content.subheading}</p>
          )}
          {(showPrimary || showSecondary) && (
            <div className="flex flex-wrap items-center justify-center gap-4">
              {showPrimary && (
                <a
                  href={primaryHref}
                  target={primaryTarget}
                  rel={primaryTarget ? "noopener noreferrer" : undefined}
                  className={`inline-block font-semibold transition-opacity hover:opacity-90 ${buttonConfigToClasses(content.primaryConfig)}`}
                  style={{
                    backgroundColor: buttonConfigToStyle(content.primaryConfig).backgroundColor ?? "#fff",
                    color: buttonConfigToStyle(content.primaryConfig).color ?? settings.brandColor,
                    borderRadius: buttonConfigToStyle(content.primaryConfig).borderRadius ?? "var(--theme-btn-radius, 9999px)",
                    boxShadow: "var(--theme-btn-shadow, none)",
                  }}
                >
                  {content.primaryLabel}
                </a>
              )}
              {showSecondary && (
                <a
                  href={secondaryHref}
                  target={secondaryTarget}
                  rel={secondaryTarget ? "noopener noreferrer" : undefined}
                  className={`inline-block font-semibold transition-opacity hover:opacity-90 border-2 border-white text-white px-6 py-3`}
                  style={{
                    borderRadius: buttonConfigToStyle(content.secondaryConfig).borderRadius ?? "var(--theme-btn-radius, 9999px)",
                    boxShadow: "var(--theme-btn-shadow, none)",
                  }}
                >
                  {content.secondaryLabel}
                </a>
              )}
            </div>
          )}
        </div>
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-6 py-16" isEditing={true} defaultBg={settings.brandColor}>
      <div onClick={e => e.stopPropagation()} className="max-w-2xl mx-auto text-center space-y-4">
        {/* Heading and subheading — inline editable, styled like the public view */}
        <div className="relative">
          <InlineEditableText
            id={`${sid}-heading`}
            as="h2"
            value={content.heading}
            placeholder="Call to action headline"
            className="text-3xl font-bold text-white"
            style={textStyleToCSS(content.headingStyle)}
            onCommit={v => update({ heading: v })}
          />
          <FloatingToolbar
            id={`${sid}-heading`}
            style={content.headingStyle}
            onChange={s => update({ headingStyle: s })}
            dark
          />
        </div>
        <div className="relative">
          <InlineEditableText
            id={`${sid}-subheading`}
            as="p"
            value={content.subheading ?? ""}
            placeholder="Subheading text (optional — double-click to add)"
            className="text-white/80 text-lg"
            style={textStyleToCSS(content.subheadingStyle)}
            onCommit={v => update({ subheading: v || undefined })}
          />
          <FloatingToolbar
            id={`${sid}-subheading`}
            style={content.subheadingStyle}
            onChange={s => update({ subheadingStyle: s })}
            dark
          />
        </div>

        {/* Button editors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-left">
          <div className="bg-white/10 border border-white/20 rounded-xl p-3 space-y-2">
            <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">Primary Button</p>
            <input
              type="text"
              className="w-full text-xs bg-white/10 border border-white/20 text-white placeholder-white/40 rounded px-2 py-1.5 outline-none focus:border-white/50"
              placeholder="Button label (leave empty to hide)"
              value={content.primaryLabel ?? ""}
              onChange={e => update({ primaryLabel: e.target.value })}
            />
            <ButtonEditor config={content.primaryConfig} onChange={cfg => update({ primaryConfig: cfg })} />
          </div>

          <div className="bg-white/10 border border-white/20 rounded-xl p-3 space-y-2">
            <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">Secondary Button</p>
            <input
              type="text"
              className="w-full text-xs bg-white/10 border border-white/20 text-white placeholder-white/40 rounded px-2 py-1.5 outline-none focus:border-white/50"
              placeholder="Button label (leave empty to hide)"
              value={content.secondaryLabel ?? ""}
              onChange={e => update({ secondaryLabel: e.target.value })}
            />
            <ButtonEditor config={content.secondaryConfig} onChange={cfg => update({ secondaryConfig: cfg })} />
          </div>
        </div>
      </div>
    </BlockStyleWrapper>
  );
}
