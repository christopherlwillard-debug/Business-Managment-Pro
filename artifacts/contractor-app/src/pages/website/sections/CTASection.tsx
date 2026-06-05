import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { ButtonEditor, buttonConfigToStyle, buttonConfigToClasses, type ButtonConfig } from "./ButtonEditor";

export interface CTAContent {
  heading: string;
  subheading?: string;
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
}

export function CTASection({ content, settings, isEditing, onChange, blockStyle }: CTASectionProps) {
  function update(patch: Partial<CTAContent>) {
    onChange?.({ ...content, ...patch });
  }

  const showPrimary = !!(content.primaryLabel);
  const showSecondary = !!(content.secondaryLabel);

  if (!isEditing) {
    return (
      <BlockStyleWrapper
        blockStyle={blockStyle}
        wrapperClassName="px-6 py-20"
        isEditing={false}
        defaultBg={settings.brandColor}
      >
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">{content.heading}</h2>
          {content.subheading && (
            <p className="text-white/80 text-lg mb-8">{content.subheading}</p>
          )}
          {(showPrimary || showSecondary) && (
            <div className="flex flex-wrap items-center justify-center gap-4">
              {showPrimary && (
                <a
                  href={content.primaryConfig?.url || "#contact"}
                  target={content.primaryConfig?.newTab ? "_blank" : undefined}
                  rel={content.primaryConfig?.newTab ? "noopener noreferrer" : undefined}
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
                  href={content.secondaryConfig?.url || "#contact"}
                  target={content.secondaryConfig?.newTab ? "_blank" : undefined}
                  rel={content.secondaryConfig?.newTab ? "noopener noreferrer" : undefined}
                  className={`inline-block font-semibold transition-opacity hover:opacity-90 border-2 border-white text-white px-6 py-3`}
                  style={{
                    borderRadius: buttonConfigToStyle(content.secondaryConfig).borderRadius ?? "var(--theme-btn-radius, 9999px)",
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
    <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-4 py-8" isEditing={true}>
      <div onClick={e => e.stopPropagation()} className="space-y-4">
        <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">CTA Banner</p>

        <input
          type="text"
          className="w-full text-xl font-bold bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-lg px-3 py-2 outline-none focus:border-white/60"
          placeholder="Call to action headline"
          value={content.heading}
          onChange={e => update({ heading: e.target.value })}
        />
        <input
          type="text"
          className="w-full text-sm bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-lg px-3 py-1.5 outline-none focus:border-white/60"
          placeholder="Subheading text (optional)"
          value={content.subheading ?? ""}
          onChange={e => update({ subheading: e.target.value })}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
