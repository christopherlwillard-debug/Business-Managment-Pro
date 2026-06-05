import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

interface FooterContent {
  phone: string;
  email: string;
  licenseNumber: string;
  copyright: string;
}

interface FooterSectionProps {
  content: FooterContent;
  settings: { brandColor: string; footerBgColor?: string; footerTextColor?: string; footerLinkColor?: string };
  isEditing?: boolean;
  onChange?: (content: FooterContent) => void;
  blockStyle?: BlockStyle;
}

export function FooterSection({ content, settings, isEditing, onChange, blockStyle }: FooterSectionProps) {
  function update(patch: Partial<FooterContent>) {
    onChange?.({ ...content, ...patch });
  }

  const bg = settings.footerBgColor || settings.brandColor || "#1a1a2e";

  const footerText = settings.footerTextColor;
  const footerLink = settings.footerLinkColor;

  return (
    <BlockStyleWrapper
      wrapperClassName="py-10 px-6 text-center"
      defaultBg={bg}
      blockStyle={blockStyle}
      isEditing={isEditing}
    >
      <div
        className="max-w-4xl mx-auto space-y-2"
        style={{ color: `var(--theme-footer-text, ${footerText ?? "#ffffff"})` }}
      >
        {isEditing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left mb-4">
            {[
              { label: "Phone", key: "phone" as const, placeholder: "(555) 000-0000" },
              { label: "Email", key: "email" as const, placeholder: "you@example.com" },
              { label: "License #", key: "licenseNumber" as const, placeholder: "KY-12345" },
              { label: "Copyright line", key: "copyright" as const, placeholder: "© 2025 Your Business. All rights reserved." },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs mb-0.5 opacity-50">{f.label}</label>
                <input
                  className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm placeholder-white/30 focus:outline-none focus:border-white/50"
                  style={{ color: `var(--theme-footer-text, #ffffff)` }}
                  value={content[f.key]}
                  placeholder={f.placeholder}
                  onChange={e => update({ [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div
              className="flex flex-wrap justify-center gap-6 text-sm mb-4 opacity-80"
              style={{ color: footerLink ? `var(--theme-footer-link, ${footerLink})` : `var(--theme-footer-text, #ffffff)` }}
            >
              {content.phone && <span>📞 {content.phone}</span>}
              {content.email && <span>✉️ {content.email}</span>}
              {content.licenseNumber && <span>🪪 License: {content.licenseNumber}</span>}
            </div>
          </>
        )}
        <p className="text-xs opacity-40">{content.copyright || `© ${new Date().getFullYear()} All rights reserved.`}</p>
      </div>
    </BlockStyleWrapper>
  );
}
