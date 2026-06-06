import { Eye } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

interface FooterContent {
  phone: string;
  email: string;
  licenseNumber: string;
  copyright: string;
  showPhone?: boolean;
  showEmail?: boolean;
  showLicense?: boolean;
}

interface FooterSectionProps {
  content: FooterContent;
  settings: { brandColor: string; footerBgColor?: string; footerTextColor?: string; footerLinkColor?: string };
  isEditing?: boolean;
  onChange?: (content: FooterContent) => void;
  blockStyle?: BlockStyle;
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs opacity-60">{label}</span>
      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="w-8 h-4 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
      </label>
    </div>
  );
}

export function FooterSection({ content, settings, isEditing, onChange, blockStyle }: FooterSectionProps) {
  function update(patch: Partial<FooterContent>) {
    onChange?.({ ...content, ...patch });
  }

  const bg = settings.footerBgColor || settings.brandColor || "#1a1a2e";

  const footerText = settings.footerTextColor;
  const footerLink = settings.footerLinkColor;

  const showPhone = content.showPhone !== false;
  const showEmail = content.showEmail !== false;
  const showLicense = content.showLicense !== false;

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
          <>
            {/* Visibility toggles */}
            <div className="mb-4 bg-white/5 rounded-lg px-3 py-2 space-y-1 text-left">
              <p className="text-[10px] font-semibold opacity-40 uppercase tracking-wider flex items-center gap-1 mb-1.5">
                <Eye className="w-3 h-3" />
                Visibility
              </p>
              <ToggleRow label="Phone" checked={showPhone} onChange={v => update({ showPhone: v })} />
              <ToggleRow label="Email" checked={showEmail} onChange={v => update({ showEmail: v })} />
              <ToggleRow label="License Number" checked={showLicense} onChange={v => update({ showLicense: v })} />
            </div>

            {/* Content inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
              {showPhone && (
                <div>
                  <label className="block text-xs mb-0.5 opacity-50">Phone</label>
                  <input
                    className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm placeholder-white/30 focus:outline-none focus:border-white/50"
                    style={{ color: `var(--theme-footer-text, #ffffff)` }}
                    value={content.phone}
                    placeholder="(555) 000-0000"
                    onChange={e => update({ phone: e.target.value })}
                  />
                </div>
              )}
              {showEmail && (
                <div>
                  <label className="block text-xs mb-0.5 opacity-50">Email</label>
                  <input
                    className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm placeholder-white/30 focus:outline-none focus:border-white/50"
                    style={{ color: `var(--theme-footer-text, #ffffff)` }}
                    value={content.email}
                    placeholder="you@example.com"
                    onChange={e => update({ email: e.target.value })}
                  />
                </div>
              )}
              {showLicense && (
                <div>
                  <label className="block text-xs mb-0.5 opacity-50">License #</label>
                  <input
                    className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm placeholder-white/30 focus:outline-none focus:border-white/50"
                    style={{ color: `var(--theme-footer-text, #ffffff)` }}
                    value={content.licenseNumber}
                    placeholder="KY-12345"
                    onChange={e => update({ licenseNumber: e.target.value })}
                  />
                </div>
              )}
              <div className={showPhone || showEmail || showLicense ? "" : "col-span-2"}>
                <label className="block text-xs mb-0.5 opacity-50">Copyright line</label>
                <input
                  className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm placeholder-white/30 focus:outline-none focus:border-white/50"
                  style={{ color: `var(--theme-footer-text, #ffffff)` }}
                  value={content.copyright}
                  placeholder={`© ${new Date().getFullYear()} Your Business. All rights reserved.`}
                  onChange={e => update({ copyright: e.target.value })}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            {(showPhone || showEmail || showLicense) && (
              <div
                className="flex flex-wrap justify-center gap-6 text-sm mb-4 opacity-80"
                style={{ color: footerLink ? `var(--theme-footer-link, ${footerLink})` : `var(--theme-footer-text, #ffffff)` }}
              >
                {showPhone && content.phone && <span>📞 {content.phone}</span>}
                {showEmail && content.email && <span>✉️ {content.email}</span>}
                {showLicense && content.licenseNumber && <span>🪪 License: {content.licenseNumber}</span>}
              </div>
            )}
          </>
        )}
        <p className="text-xs opacity-40">{content.copyright || `© ${new Date().getFullYear()} All rights reserved.`}</p>
      </div>
    </BlockStyleWrapper>
  );
}
