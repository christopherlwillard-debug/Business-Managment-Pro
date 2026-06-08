import { useState } from "react";
import { Eye, ChevronDown, ChevronUp, Plus, Trash2, ExternalLink, Facebook, Instagram, Linkedin, Twitter, Youtube } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { InlineEditableText } from "../InlineEditableText";

interface BadgeItem {
  id: string;
  imageUrl: string;
  altText: string;
  linkUrl?: string;
  size?: "sm" | "md" | "lg";
}

interface SocialLink {
  platform: "facebook" | "instagram" | "linkedin" | "twitter" | "youtube";
  url: string;
}

interface FooterContent {
  phone: string;
  email: string;
  licenseNumber: string;
  copyright: string;
  showPhone?: boolean;
  showEmail?: boolean;
  showLicense?: boolean;
  badges?: BadgeItem[];
  socialLinks?: SocialLink[];
  customText?: string;
}

interface FooterSectionProps {
  content: FooterContent;
  settings: { brandColor: string; footerBgColor?: string; footerTextColor?: string; footerLinkColor?: string };
  isEditing?: boolean;
  onChange?: (content: FooterContent) => void;
  blockStyle?: BlockStyle;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
  sectionId?: string;
}

const SOCIAL_PLATFORMS: Array<{ key: SocialLink["platform"]; label: string; icon: React.ReactNode }> = [
  { key: "facebook",  label: "Facebook",  icon: <Facebook  className="w-4 h-4" /> },
  { key: "instagram", label: "Instagram", icon: <Instagram className="w-4 h-4" /> },
  { key: "linkedin",  label: "LinkedIn",  icon: <Linkedin  className="w-4 h-4" /> },
  { key: "twitter",   label: "X / Twitter", icon: <Twitter className="w-4 h-4" /> },
  { key: "youtube",   label: "YouTube",   icon: <Youtube   className="w-4 h-4" /> },
];

const BADGE_SIZE_CLASSES: Record<string, string> = {
  sm: "h-8",
  md: "h-12",
  lg: "h-16",
};

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs opacity-60">{label}</span>
      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <div className="w-8 h-4 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
      </label>
    </div>
  );
}

function AccordionGroup({
  title,
  groupKey,
  openGroups,
  onToggle,
  children,
}: {
  title: string;
  groupKey: string;
  openGroups: Record<string, boolean>;
  onToggle: (k: string) => void;
  children: React.ReactNode;
}) {
  const open = openGroups[groupKey] ?? false;
  return (
    <div className="bg-white/5 rounded-lg mb-2 overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(groupKey)}
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold opacity-70 uppercase tracking-wider hover:opacity-100 transition-opacity"
      >
        <span>{title}</span>
        {open ? <ChevronUp className="w-3 h-3 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 flex-shrink-0" />}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function FooterSection({ content, settings, isEditing, onChange, blockStyle, onOpenMediaLibrary, sectionId }: FooterSectionProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("footer-editor-accordion");
      return saved ? JSON.parse(saved) : { contact: true, badges: false, social: false, custom: false };
    } catch {
      return { contact: true, badges: false, social: false, custom: false };
    }
  });

  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("footer-editor-accordion", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function update(patch: Partial<FooterContent>) {
    onChange?.({ ...content, ...patch });
  }

  const bg = settings.footerBgColor || settings.brandColor || "#1a1a2e";
  const footerText = settings.footerTextColor;
  const footerLink = settings.footerLinkColor;

  const showPhone = content.showPhone !== false;
  const showEmail = content.showEmail !== false;
  const showLicense = content.showLicense !== false;

  const badges = content.badges ?? [];
  const socialLinks = content.socialLinks ?? [];

  function addBadge() {
    update({ badges: [...badges, { id: uid(), imageUrl: "", altText: "", size: "md" }] });
  }

  function updateBadge(id: string, patch: Partial<BadgeItem>) {
    update({ badges: badges.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  }

  function removeBadge(id: string) {
    update({ badges: badges.filter((b) => b.id !== id) });
  }

  function getSocialUrl(platform: SocialLink["platform"]) {
    return socialLinks.find((s) => s.platform === platform)?.url ?? "";
  }

  function setSocialUrl(platform: SocialLink["platform"], url: string) {
    const existing = socialLinks.filter((s) => s.platform !== platform);
    update({ socialLinks: url ? [...existing, { platform, url }] : existing });
  }

  if (isEditing) {
    return (
      <BlockStyleWrapper
        wrapperClassName="py-10 px-6 text-center"
        defaultBg={bg}
        blockStyle={blockStyle}
        isEditing={isEditing}
      >
        <div
          className="max-w-4xl mx-auto text-left"
          style={{ color: `var(--theme-footer-text, ${footerText ?? "#ffffff"})` }}
        >
          {/* Contact Info Accordion */}
          <AccordionGroup title="Contact Info" groupKey="contact" openGroups={openGroups} onToggle={toggleGroup}>
            <div className="mb-3 bg-white/5 rounded px-3 py-2 space-y-1">
              <p className="text-[10px] font-semibold opacity-40 uppercase tracking-wider flex items-center gap-1 mb-1.5">
                <Eye className="w-3 h-3" /> Visibility
              </p>
              <ToggleRow label="Phone"          checked={showPhone}   onChange={(v) => update({ showPhone: v })} />
              <ToggleRow label="Email"          checked={showEmail}   onChange={(v) => update({ showEmail: v })} />
              <ToggleRow label="License Number" checked={showLicense} onChange={(v) => update({ showLicense: v })} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {showPhone && (
                <div>
                  <label className="block text-xs mb-0.5 opacity-50">Phone</label>
                  <input
                    className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm placeholder-white/30 focus:outline-none focus:border-white/50"
                    style={{ color: `var(--theme-footer-text, #ffffff)` }}
                    value={content.phone}
                    placeholder="(555) 000-0000"
                    onChange={(e) => update({ phone: e.target.value })}
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
                    onChange={(e) => update({ email: e.target.value })}
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
                    onChange={(e) => update({ licenseNumber: e.target.value })}
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
                  onChange={(e) => update({ copyright: e.target.value })}
                />
              </div>
            </div>
          </AccordionGroup>

          {/* Badges & Logos Accordion */}
          <AccordionGroup title="Badges & Logos" groupKey="badges" openGroups={openGroups} onToggle={toggleGroup}>
            <p className="text-[10px] opacity-40 mb-2 leading-relaxed">
              Add certification badges, SBA logos, BBB seals, or trust marks. They'll appear as a row of images in the footer.
            </p>
            {badges.map((badge) => (
              <div key={badge.id} className="bg-white/5 rounded-lg p-2 mb-2">
                <div className="flex items-start gap-2">
                  {badge.imageUrl ? (
                    <img src={badge.imageUrl} alt={badge.altText || "Badge"} className="h-10 w-auto object-contain rounded flex-shrink-0 bg-white/10" />
                  ) : (
                    <div className="h-10 w-14 rounded bg-white/10 flex items-center justify-center flex-shrink-0 text-[10px] opacity-40">img</div>
                  )}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenMediaLibrary?.((url) => updateBadge(badge.id, { imageUrl: url }))}
                      className="block w-full text-xs bg-white/10 hover:bg-white/20 border border-white/20 rounded px-2 py-1 text-left transition-colors"
                    >
                      {badge.imageUrl ? "Change image" : "Choose image from library…"}
                    </button>
                    <input
                      type="text"
                      value={badge.altText}
                      onChange={(e) => updateBadge(badge.id, { altText: e.target.value })}
                      placeholder="Alt text (e.g. SBA Certified)"
                      className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-xs placeholder-white/30 focus:outline-none focus:border-white/50"
                      style={{ color: "var(--theme-footer-text, #ffffff)" }}
                    />
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={badge.linkUrl || ""}
                        onChange={(e) => updateBadge(badge.id, { linkUrl: e.target.value })}
                        placeholder="Link URL (optional)"
                        className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-xs placeholder-white/30 focus:outline-none focus:border-white/50"
                        style={{ color: "var(--theme-footer-text, #ffffff)" }}
                      />
                      <div className="flex gap-0.5">
                        {(["sm", "md", "lg"] as const).map((s) => (
                          <button key={s} type="button"
                            onClick={() => updateBadge(badge.id, { size: s })}
                            className={`px-1.5 py-1 text-[10px] rounded transition-colors uppercase ${(badge.size ?? "md") === s ? "bg-primary text-white" : "bg-white/10 opacity-60 hover:opacity-100"}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button type="button" onClick={() => removeBadge(badge.id)}
                    className="flex-shrink-0 p-1 rounded hover:bg-red-500/30 text-white/40 hover:text-red-300 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addBadge}
              className="flex items-center gap-1.5 w-full text-xs bg-white/10 hover:bg-white/20 border border-dashed border-white/20 rounded px-3 py-2 transition-colors opacity-70 hover:opacity-100">
              <Plus className="w-3 h-3" /> Add badge
            </button>
          </AccordionGroup>

          {/* Social Media Accordion */}
          <AccordionGroup title="Social Media" groupKey="social" openGroups={openGroups} onToggle={toggleGroup}>
            <p className="text-[10px] opacity-40 mb-2">Leave a URL blank to hide that icon.</p>
            <div className="space-y-2">
              {SOCIAL_PLATFORMS.map(({ key, label, icon }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="flex-shrink-0 opacity-60">{icon}</span>
                  <input
                    type="text"
                    value={getSocialUrl(key)}
                    onChange={(e) => setSocialUrl(key, e.target.value.trim())}
                    placeholder={`${label} URL`}
                    className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1.5 text-xs placeholder-white/30 focus:outline-none focus:border-white/50"
                    style={{ color: "var(--theme-footer-text, #ffffff)" }}
                  />
                </div>
              ))}
            </div>
          </AccordionGroup>

          {/* Custom Text Accordion */}
          <AccordionGroup title="Custom Text" groupKey="custom" openGroups={openGroups} onToggle={toggleGroup}>
            <label className="block text-xs mb-1 opacity-50">Disclaimer or additional info</label>
            <textarea
              rows={3}
              value={content.customText || ""}
              onChange={(e) => update({ customText: e.target.value })}
              placeholder="e.g. Licensed, bonded, and insured. SDVOSB certified."
              className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-xs placeholder-white/30 focus:outline-none focus:border-white/50 resize-none"
              style={{ color: "var(--theme-footer-text, #ffffff)" }}
            />
          </AccordionGroup>
        </div>
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper
      wrapperClassName="py-10 px-6 text-center"
      defaultBg={bg}
      blockStyle={blockStyle}
      isEditing={isEditing}
    >
      <div
        className="max-w-4xl mx-auto space-y-4"
        style={{ color: `var(--theme-footer-text, ${footerText ?? "#ffffff"})` }}
      >
        {/* Contact row */}
        {(showPhone || showEmail || showLicense) && (
          <div
            className="flex flex-wrap justify-center gap-6 text-sm opacity-80"
            style={{ color: footerLink ? `var(--theme-footer-link, ${footerLink})` : `var(--theme-footer-text, #ffffff)` }}
          >
            {showPhone && (content.phone || sectionId) && (
              <span>📞{" "}
                {sectionId ? (
                  <InlineEditableText id={`${sectionId}-footer-phone`} value={content.phone} placeholder="Phone number" as="span"
                    onCommit={(v) => onChange?.({ ...content, phone: v })} />
                ) : content.phone}
              </span>
            )}
            {showEmail && (content.email || sectionId) && (
              <span>✉️{" "}
                {sectionId ? (
                  <InlineEditableText id={`${sectionId}-footer-email`} value={content.email} placeholder="Email address" as="span"
                    onCommit={(v) => onChange?.({ ...content, email: v })} />
                ) : content.email}
              </span>
            )}
            {showLicense && (content.licenseNumber || sectionId) && (
              <span>🪪 License:{" "}
                {sectionId ? (
                  <InlineEditableText id={`${sectionId}-footer-license`} value={content.licenseNumber} placeholder="License #" as="span"
                    onCommit={(v) => onChange?.({ ...content, licenseNumber: v })} />
                ) : content.licenseNumber}
              </span>
            )}
          </div>
        )}

        {/* Social links */}
        {socialLinks.length > 0 && (
          <div className="flex flex-wrap justify-center items-center gap-4">
            {SOCIAL_PLATFORMS.filter((p) => socialLinks.some((s) => s.platform === p.key && s.url)).map(({ key, label, icon }) => {
              const url = socialLinks.find((s) => s.platform === key)?.url ?? "";
              return (
                <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                  title={label}
                  className="opacity-60 hover:opacity-100 transition-opacity"
                  style={{ color: footerLink ? `var(--theme-footer-link, ${footerLink})` : `var(--theme-footer-text, #ffffff)` }}
                >
                  {icon}
                </a>
              );
            })}
          </div>
        )}

        {/* Badges row */}
        {badges.length > 0 && (
          <div className="flex flex-wrap justify-center items-center gap-4">
            {badges.filter((b) => b.imageUrl).map((badge) => {
              const sizeClass = BADGE_SIZE_CLASSES[badge.size ?? "md"] ?? "h-12";
              const img = (
                <img
                  key={badge.id}
                  src={badge.imageUrl}
                  alt={badge.altText || ""}
                  className={`${sizeClass} w-auto object-contain opacity-80 hover:opacity-100 transition-opacity`}
                />
              );
              return badge.linkUrl ? (
                <a key={badge.id} href={badge.linkUrl} target="_blank" rel="noopener noreferrer" title={badge.altText}>
                  {img}
                </a>
              ) : (
                <span key={badge.id}>{img}</span>
              );
            })}
          </div>
        )}

        {/* Custom text */}
        {(content.customText || sectionId) && (
          <p className="text-xs opacity-50 leading-relaxed max-w-2xl mx-auto">
            {sectionId ? (
              <InlineEditableText id={`${sectionId}-footer-custom`} value={content.customText ?? ""} placeholder="Disclaimer or additional info"
                multiline as="span" onCommit={(v) => onChange?.({ ...content, customText: v })} />
            ) : content.customText}
          </p>
        )}

        <p className="text-xs opacity-40">
          {sectionId ? (
            <InlineEditableText id={`${sectionId}-footer-copyright`} value={content.copyright ?? ""} placeholder={`© ${new Date().getFullYear()} All rights reserved.`}
              as="span" onCommit={(v) => onChange?.({ ...content, copyright: v })} />
          ) : (content.copyright || `© ${new Date().getFullYear()} All rights reserved.`)}
        </p>
      </div>
    </BlockStyleWrapper>
  );
}
