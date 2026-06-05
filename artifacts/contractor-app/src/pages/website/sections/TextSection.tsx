import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

export interface TextContent {
  heading?: string;
  subheading?: string;
  body: string;
  alignment?: "left" | "center" | "right";
  maxWidth?: "sm" | "md" | "lg" | "full";
}

export function defaultTextContent(): TextContent {
  return {
    heading: "About This Page",
    subheading: "",
    body: "Write your content here. This block supports multi-line text and is great for explaining your services, policies, or telling your story.",
    alignment: "left",
    maxWidth: "md",
  };
}

interface TextSectionProps {
  content: TextContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: TextContent) => void;
  blockStyle?: BlockStyle;
}

const MAX_WIDTH_MAP: Record<string, string> = {
  sm: "max-w-xl",
  md: "max-w-3xl",
  lg: "max-w-5xl",
  full: "max-w-full",
};

const ALIGN_MAP: Record<string, string> = {
  left: "text-left",
  center: "text-center mx-auto",
  right: "text-right ml-auto",
};

export function TextSection({ content, settings, isEditing, onChange, blockStyle }: TextSectionProps) {
  const alignment = content.alignment ?? "left";
  const maxWidth = content.maxWidth ?? "md";
  const maxWClass = MAX_WIDTH_MAP[maxWidth] ?? "max-w-3xl";
  const alignClass = ALIGN_MAP[alignment] ?? "text-left";

  function update(patch: Partial<TextContent>) {
    onChange?.({ ...content, ...patch });
  }

  if (!isEditing) {
    return (
      <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-6 py-14" isEditing={false}>
        <div className={`${maxWClass} ${alignClass}`}>
          {content.heading && (
            <h2
              className="text-3xl md:text-4xl font-bold mb-3"
              style={{ color: "var(--theme-text, #111827)" }}
            >
              {content.heading}
            </h2>
          )}
          {content.subheading && (
            <p className="text-lg mb-5" style={{ color: "var(--theme-text-muted, #6b7280)" }}>{content.subheading}</p>
          )}
          {content.body && (
            <div className="text-base leading-relaxed whitespace-pre-wrap" style={{ color: "var(--theme-text-muted, #374151)" }}>
              {content.body}
            </div>
          )}
        </div>
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-4 py-8" isEditing={true}>
      <div onClick={e => e.stopPropagation()} className="space-y-3">
        <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">Text Block</p>

        <div className="flex gap-3 items-center">
          <div className="flex-1">
            <p className="text-[10px] text-white/40 mb-1">Alignment</p>
            <div className="flex rounded-lg overflow-hidden border border-white/20">
              {(["left", "center", "right"] as const).map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => update({ alignment: a })}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors capitalize ${
                    alignment === a
                      ? "bg-white/20 text-white"
                      : "bg-white/5 text-white/50 hover:bg-white/10"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-white/40 mb-1">Max Width</p>
            <div className="flex rounded-lg overflow-hidden border border-white/20">
              {(["sm", "md", "lg", "full"] as const).map(w => (
                <button
                  key={w}
                  type="button"
                  onClick={() => update({ maxWidth: w })}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors uppercase ${
                    maxWidth === w
                      ? "bg-white/20 text-white"
                      : "bg-white/5 text-white/50 hover:bg-white/10"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>

        <input
          type="text"
          className="w-full text-xl font-bold bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-lg px-3 py-2 outline-none focus:border-white/60"
          placeholder="Heading (optional)"
          value={content.heading ?? ""}
          onChange={e => update({ heading: e.target.value })}
        />

        <input
          type="text"
          className="w-full text-sm bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-lg px-3 py-1.5 outline-none focus:border-white/60"
          placeholder="Subheading (optional)"
          value={content.subheading ?? ""}
          onChange={e => update({ subheading: e.target.value })}
        />

        <textarea
          rows={6}
          className="w-full text-sm bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-lg px-3 py-2 outline-none focus:border-white/60 resize-y leading-relaxed"
          placeholder="Write your content here…"
          value={content.body}
          onChange={e => update({ body: e.target.value })}
        />
      </div>
    </BlockStyleWrapper>
  );
}
