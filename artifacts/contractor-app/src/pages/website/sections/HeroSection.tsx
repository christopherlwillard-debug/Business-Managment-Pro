import { AiCopyPopover } from "./AiCopyPopover";

interface HeroContent {
  headline: string;
  subheadline: string;
  ctaLabel: string;
  bgColor: string;
}

interface HeroSectionProps {
  content: HeroContent;
  settings: { brandColor: string; logoUrl?: string };
  isEditing?: boolean;
  onChange?: (content: HeroContent) => void;
  businessName?: string;
}

export function HeroSection({ content, settings, isEditing, onChange, businessName }: HeroSectionProps) {
  const bg = content.bgColor || settings.brandColor || "#1a1a2e";
  const biz = businessName ?? "a contractor business";

  function update(patch: Partial<HeroContent>) {
    onChange?.({ ...content, ...patch });
  }

  return (
    <div className="relative w-full py-20 px-6 text-white text-center" style={{ backgroundColor: bg }}>
      {isEditing && (
        <div className="absolute top-2 right-2 flex items-center gap-2 bg-black/40 rounded px-2 py-1">
          <label className="text-xs text-white/70">BG Color</label>
          <input
            type="color"
            value={content.bgColor || bg}
            onChange={e => update({ bgColor: e.target.value })}
            className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
          />
        </div>
      )}
      {isEditing ? (
        <>
          <input
            className="w-full text-center text-4xl font-bold bg-transparent border-b border-white/30 focus:border-white outline-none mb-1 placeholder-white/40"
            value={content.headline}
            placeholder="Your headline here"
            onChange={e => update({ headline: e.target.value })}
          />
          <AiCopyPopover
            variant="dark"
            label="Headline"
            defaultPrompt={`Write a punchy 5-8 word headline for ${biz}'s website. It should be confident and appeal to homeowners.`}
            onAccept={v => update({ headline: v })}
          />
          <div className="mb-4" />
          <input
            className="w-full text-center text-lg bg-transparent border-b border-white/30 focus:border-white outline-none mb-1 placeholder-white/40"
            value={content.subheadline}
            placeholder="Subheadline text"
            onChange={e => update({ subheadline: e.target.value })}
          />
          <AiCopyPopover
            variant="dark"
            label="Subheadline"
            defaultPrompt={`Write a 1-2 sentence subheadline for ${biz}'s website. The headline is: "${content.headline}". Keep it under 20 words.`}
            onAccept={v => update({ subheadline: v })}
          />
          <div className="mb-8" />
          <input
            className="inline-block text-sm font-semibold px-6 py-3 rounded-full bg-white/20 border border-white/40 focus:border-white outline-none text-center placeholder-white/40"
            value={content.ctaLabel}
            placeholder="Button label"
            onChange={e => update({ ctaLabel: e.target.value })}
          />
        </>
      ) : (
        <>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">{content.headline}</h1>
          <p className="text-lg md:text-xl text-white/80 mb-8 max-w-2xl mx-auto">{content.subheadline}</p>
          <a
            href="#contact"
            className="inline-block px-8 py-3 rounded-full font-semibold text-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "white", color: bg }}
          >
            {content.ctaLabel}
          </a>
        </>
      )}
    </div>
  );
}
