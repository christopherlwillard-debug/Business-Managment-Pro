import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronUp, ChevronDown, Plus, Trash2,
  Facebook, Instagram, Linkedin, Twitter, Youtube,
  Phone, Mail, Clock, MapPin, Shield, Check, Copy,
} from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { InlineEditableText } from "../InlineEditableText";
import { STATE_CODE_TO_NAME } from "./USMapData";

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

/** Type-safe helper: update a block's props by id without widening the union. */
function patchBlock(columns: FooterBlock[], id: string, patch: Record<string, unknown>): FooterBlock[] {
  return columns.map(b =>
    b.id === id ? ({ ...b, props: { ...(b.props as Record<string, unknown>), ...patch } } as FooterBlock) : b
  );
}

// ── Social platforms ──────────────────────────────────────────────────────────

interface SocialLink {
  platform: "facebook" | "instagram" | "linkedin" | "twitter" | "youtube";
  url: string;
}

function getSocialPlatforms() {
  return [
    { key: "facebook"  as const, label: "Facebook",    Icon: Facebook  },
    { key: "instagram" as const, label: "Instagram",   Icon: Instagram },
    { key: "linkedin"  as const, label: "LinkedIn",    Icon: Linkedin  },
    { key: "twitter"   as const, label: "X / Twitter", Icon: Twitter   },
    { key: "youtube"   as const, label: "YouTube",     Icon: Youtube   },
  ];
}

// ── Legacy shape (badges used by media library flow) ─────────────────────────

interface BadgeItem {
  id: string;
  imageUrl: string;
  altText: string;
  linkUrl?: string;
  size?: "sm" | "md" | "lg";
}

// ── Block data types ──────────────────────────────────────────────────────────

export type FooterBlockWidth = 20 | 25 | 33 | 40 | 50 | 60 | 66 | 75 | 100;

interface FooterLink { id: string; label: string; href: string; }

interface ContactField { show: boolean; value: string; }

export interface LogoBlockProps {
  tagline?: string;
  showVeteranBadge?: boolean;
  showBBBBadge?: boolean;
  showSBABadge?: boolean;
  showSdvosbBadge?: boolean;
  credentialChips?: string[];
}
export interface LinksBlockProps {
  heading: string;
  description?: string;
  links: FooterLink[];
}
export interface ServiceAreaBlockProps {
  heading: string;
  states: string[];
  fallbackText?: string;
}
export interface ContactBlockProps {
  heading?: string;
  phone?: ContactField;
  email?: ContactField;
  hours?: ContactField;
  address?: ContactField;
  licenseNumber?: ContactField;
  emergencyNumber?: ContactField;
}

interface _Base { id: string; width: FooterBlockWidth; }
export interface LogoBlock       extends _Base { component: "LogoBlock";       props: LogoBlockProps;       }
export interface LinksBlock      extends _Base { component: "LinksBlock";      props: LinksBlockProps;      }
export interface ServiceAreaBlock extends _Base { component: "ServiceAreaBlock"; props: ServiceAreaBlockProps; }
export interface ContactBlock    extends _Base { component: "ContactBlock";    props: ContactBlockProps;    }

export type FooterBlock = LogoBlock | LinksBlock | ServiceAreaBlock | ContactBlock;

// ── FooterContent ─────────────────────────────────────────────────────────────

export interface FooterContent {
  // Block system
  columns?: FooterBlock[];
  socialLinks?: SocialLink[];
  // Copyright bar
  copyright?: string;
  privacyPolicyUrl?: string;
  termsUrl?: string;
  showBuiltWith?: boolean;
  // Legacy flat fields (kept for migration; do not write new values here)
  phone?: string;
  email?: string;
  licenseNumber?: string;
  showPhone?: boolean;
  showEmail?: boolean;
  showLicense?: boolean;
  badges?: BadgeItem[];
  customText?: string;
  credentials?: string[];
  servingText?: string;
}

interface FooterSectionSettings {
  brandColor: string;
  footerBgColor?: string;
  footerTextColor?: string;
  footerLinkColor?: string;
  logoUrl?: string;
}

interface FooterSectionProps {
  content: FooterContent;
  settings: FooterSectionSettings;
  /** Business display name — used by LogoBlock when no logo image is set. */
  businessName?: string;
  isEditing?: boolean;
  onChange?: (content: FooterContent) => void;
  blockStyle?: BlockStyle;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
  sectionId?: string;
}

// ── Migration ─────────────────────────────────────────────────────────────────

export function migrateFooterContent(raw: FooterContent): FooterContent {
  if (raw.columns && raw.columns.length > 0) return raw; // Already migrated

  const logoBlock: LogoBlock = {
    id: uid(), component: "LogoBlock", width: 40,
    props: {
      tagline: raw.customText || "",
      showVeteranBadge: false,
      credentialChips: raw.credentials ?? [],
    },
  };
  const linksBlock: LinksBlock = {
    id: uid(), component: "LinksBlock", width: 20,
    props: { heading: "Services", links: [] },
  };
  const serviceAreaBlock: ServiceAreaBlock = {
    id: uid(), component: "ServiceAreaBlock", width: 20,
    props: {
      heading: "Service Area",
      states: [],
      fallbackText: raw.servingText || "",
    },
  };
  const contactBlock: ContactBlock = {
    id: uid(), component: "ContactBlock", width: 20,
    props: {
      heading: "Contact",
      phone:         { show: raw.showPhone  !== false, value: raw.phone         ?? "" },
      email:         { show: raw.showEmail  !== false, value: raw.email         ?? "" },
      licenseNumber: { show: raw.showLicense !== false, value: raw.licenseNumber ?? "" },
      hours:         { show: false, value: "" },
      address:       { show: false, value: "" },
      emergencyNumber: { show: false, value: "" },
    },
  };

  return {
    ...raw,
    columns: [logoBlock, linksBlock, serviceAreaBlock, contactBlock],
  };
}

export function defaultFooterContent(): FooterContent {
  return migrateFooterContent({
    phone: "", email: "", licenseNumber: "",
    customText: "Quality craftsmanship you can trust.",
    socialLinks: [],
  });
}

// ── BLOCK RENDERERS (public view) ─────────────────────────────────────────────

function SocialRow({
  links,
  footerLink,
  onSocialClick,
}: {
  links: SocialLink[];
  footerLink?: string;
  onSocialClick?: (platform: string) => void;
}) {
  const active = getSocialPlatforms().filter(p => links.some(l => l.platform === p.key && l.url));
  if (!active.length) return null;
  return (
    <div className="flex items-center gap-3 mt-3">
      {active.map(({ key, label, Icon }) => {
        const url = links.find(l => l.platform === key)?.url ?? "";
        return (
          <a
            key={key}
            href={onSocialClick ? undefined : url}
            target={onSocialClick ? undefined : "_blank"}
            rel="noopener noreferrer"
            title={label}
            className={`opacity-60 hover:opacity-100 transition-opacity ${onSocialClick ? "cursor-pointer" : ""}`}
            style={{ color: footerLink ? `var(--theme-footer-link, ${footerLink})` : "currentColor" }}
            onClick={onSocialClick ? (e) => { e.stopPropagation(); e.preventDefault(); onSocialClick(key); } : undefined}
          >
            <Icon className="w-4 h-4" />
          </a>
        );
      })}
    </div>
  );
}

function renderLogoBlock(
  block: LogoBlock,
  settings: FooterSectionSettings,
  content: FooterContent,
  sid: string,
  isEditing: boolean,
  onChange?: (c: FooterContent) => void,
  businessName?: string,
  onFieldFocus?: (field: string) => void,
) {
  const { props } = block;
  const textColor = `var(--theme-footer-text, ${settings.footerTextColor ?? "#ffffff"})`;
  const footerLink = settings.footerLinkColor;

  function updateBlock(patch: Partial<LogoBlockProps>) {
    if (!onChange) return;
    onChange({ ...content, columns: patchBlock(content.columns!, block.id, patch as Record<string, unknown>) });
  }

  function badgeClick(field: string) {
    return isEditing && onFieldFocus
      ? (e: React.MouseEvent) => { e.stopPropagation(); onFieldFocus(field); }
      : undefined;
  }

  return (
    <div className="flex flex-col gap-2">
      {settings.logoUrl ? (
        <img src={settings.logoUrl} alt={businessName ?? "Logo"}
          className="h-12 w-auto object-contain" style={{ maxWidth: 160 }} />
      ) : (
        <span className="font-bold text-lg" style={{ color: textColor }}>
          {businessName ?? "Your Business"}
        </span>
      )}

      {(props.tagline !== undefined || isEditing) && (
        <InlineEditableText
          id={`${sid}-${block.id}-tagline`}
          as="p"
          value={props.tagline ?? ""}
          placeholder="Tagline or brief description…"
          className="text-sm leading-relaxed opacity-70 max-w-xs"
          style={{ color: textColor }}
          onCommit={v => updateBlock({ tagline: v })}
          disabled={!isEditing}
        />
      )}

      {/* Credential chips */}
      {(props.credentialChips ?? []).length > 0 && (
        <div
          className={`flex flex-wrap gap-1.5 mt-1 ${isEditing && onFieldFocus ? "cursor-pointer" : ""}`}
          onClick={isEditing && onFieldFocus ? (e) => { e.stopPropagation(); onFieldFocus("credentials"); } : undefined}
          title={isEditing ? "Edit credential chips" : undefined}
        >
          {(props.credentialChips ?? []).map((chip, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full text-[11px] font-medium border"
              style={{ borderColor: "rgba(255,255,255,0.25)", color: "rgba(255,255,255,0.75)", backgroundColor: "rgba(255,255,255,0.08)" }}>
              {chip}
            </span>
          ))}
        </div>
      )}

      {/* Badge chips */}
      <div className="flex flex-wrap gap-1.5 mt-1">
        {props.showVeteranBadge && (
          <span onClick={badgeClick("badge-veteran")}
            className={`text-[11px] px-2 py-0.5 rounded border border-white/25 text-white/70 ${isEditing && onFieldFocus ? "cursor-pointer hover:border-white/50" : ""}`}>
            Veteran-Owned
          </span>
        )}
        {props.showSdvosbBadge && (
          <span onClick={badgeClick("badge-sdvosb")}
            className={`text-[11px] px-2 py-0.5 rounded border border-white/25 text-white/70 ${isEditing && onFieldFocus ? "cursor-pointer hover:border-white/50" : ""}`}>
            SDVOSB
          </span>
        )}
        {props.showBBBBadge && (
          <span onClick={badgeClick("badge-bbb")}
            className={`text-[11px] px-2 py-0.5 rounded border border-white/25 text-white/70 ${isEditing && onFieldFocus ? "cursor-pointer hover:border-white/50" : ""}`}>
            BBB Accredited
          </span>
        )}
        {props.showSBABadge && (
          <span onClick={badgeClick("badge-sba")}
            className={`text-[11px] px-2 py-0.5 rounded border border-white/25 text-white/70 ${isEditing && onFieldFocus ? "cursor-pointer hover:border-white/50" : ""}`}>
            SBA Certified
          </span>
        )}
      </div>

      <SocialRow
        links={content.socialLinks ?? []}
        footerLink={footerLink}
        onSocialClick={isEditing && onFieldFocus ? (platform) => onFieldFocus(`social-${platform}`) : undefined}
      />
    </div>
  );
}

function renderLinksBlock(
  block: LinksBlock,
  settings: FooterSectionSettings,
  sid: string,
  isEditing: boolean,
  onChange?: (c: FooterContent) => void,
  content?: FooterContent,
) {
  const { props } = block;
  const textColor = `var(--theme-footer-text, ${settings.footerTextColor ?? "#ffffff"})`;
  const linkColor = settings.footerLinkColor
    ? `var(--theme-footer-link, ${settings.footerLinkColor})`
    : "rgba(255,255,255,0.65)";

  function updateBlock(patch: Partial<LinksBlockProps>) {
    if (!onChange || !content) return;
    onChange({ ...content, columns: patchBlock(content.columns!, block.id, patch as Record<string, unknown>) });
  }

  return (
    <div className="flex flex-col gap-3">
      <InlineEditableText
        id={`${sid}-${block.id}-heading`}
        as="h4"
        value={props.heading}
        placeholder="Column heading"
        className="text-sm font-semibold uppercase tracking-wider"
        style={{ color: textColor }}
        onCommit={v => updateBlock({ heading: v })}
        disabled={!isEditing}
      />
      {props.description && (
        <InlineEditableText
          id={`${sid}-${block.id}-desc`}
          as="p"
          value={props.description}
          placeholder="Brief description…"
          className="text-xs opacity-60 leading-relaxed"
          style={{ color: textColor }}
          onCommit={v => updateBlock({ description: v || undefined })}
          disabled={!isEditing}
        />
      )}
      <ul className="flex flex-col gap-1.5">
        {props.links.map(link => (
          <li key={link.id}>
            {isEditing ? (
              // Edit mode: label is inline-editable; href managed in the block editor panel
              <InlineEditableText
                id={`${sid}-${block.id}-link-${link.id}`}
                as="span"
                value={link.label}
                placeholder="Link label"
                className="text-sm hover:opacity-100 transition-opacity cursor-text"
                style={{ color: linkColor, opacity: 0.8 }}
                onCommit={v => {
                  if (!onChange || !content) return;
                  updateBlock({ links: props.links.map(l => l.id === link.id ? { ...l, label: v } : l) });
                }}
                disabled={false}
              />
            ) : (
              // Public view: full working anchor with href
              <a
                href={link.href || "#"}
                className="text-sm hover:opacity-100 transition-opacity"
                style={{ color: linkColor, textDecoration: "none", opacity: 0.8 }}
              >
                {link.label}
              </a>
            )}
          </li>
        ))}
      </ul>
      {isEditing && (
        <button
          type="button"
          onClick={() => updateBlock({ links: [...props.links, { id: uid(), label: "New Link", href: "#" }] })}
          className="flex items-center gap-1 text-[11px] opacity-40 hover:opacity-80 transition-opacity w-fit">
          <Plus className="w-3 h-3" /> Add link
        </button>
      )}
    </div>
  );
}

function renderServiceAreaBlock(
  block: ServiceAreaBlock,
  settings: FooterSectionSettings,
  sid: string,
  isEditing: boolean,
  onChange?: (c: FooterContent) => void,
  content?: FooterContent,
) {
  const { props } = block;
  const textColor = `var(--theme-footer-text, ${settings.footerTextColor ?? "#ffffff"})`;

  function updateBlock(patch: Partial<ServiceAreaBlockProps>) {
    if (!onChange || !content) return;
    onChange({ ...content, columns: patchBlock(content.columns!, block.id, patch as Record<string, unknown>) });
  }

  const stateNames = [...props.states]
    .map(c => STATE_CODE_TO_NAME[c] ?? c)
    .sort((a, b) => a.localeCompare(b));

  return (
    <div className="flex flex-col gap-3">
      <InlineEditableText
        id={`${sid}-${block.id}-heading`}
        as="h4"
        value={props.heading}
        placeholder="Service Area"
        className="text-sm font-semibold uppercase tracking-wider"
        style={{ color: textColor }}
        onCommit={v => updateBlock({ heading: v })}
        disabled={!isEditing}
      />
      {stateNames.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {stateNames.map(name => (
            <li key={name} className="flex items-center gap-1.5 text-sm opacity-75" style={{ color: textColor }}>
              <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: settings.brandColor }} strokeWidth={2.5} />
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm opacity-50" style={{ color: textColor }}>
          {props.fallbackText || "Serving your area"}
        </p>
      )}
    </div>
  );
}

function renderContactBlock(
  block: ContactBlock,
  settings: FooterSectionSettings,
  sid: string,
  isEditing: boolean,
  onChange?: (c: FooterContent) => void,
  content?: FooterContent,
  onFieldFocus?: (field: string) => void,
) {
  const { props } = block;
  const textColor = `var(--theme-footer-text, ${settings.footerTextColor ?? "#ffffff"})`;

  function updateBlock(patch: Partial<ContactBlockProps>) {
    if (!onChange || !content) return;
    onChange({ ...content, columns: patchBlock(content.columns!, block.id, patch as Record<string, unknown>) });
  }

  const fields: Array<{
    key: keyof ContactBlockProps;
    label: string;
    icon: React.ReactNode;
    prefix?: string;
    placeholder: string;
  }> = [
    { key: "phone",          label: "Phone",           icon: <Phone  className="w-3.5 h-3.5 flex-shrink-0 opacity-50 mt-0.5" />, prefix: "tel:", placeholder: "(555) 000-0000" },
    { key: "email",          label: "Email",           icon: <Mail   className="w-3.5 h-3.5 flex-shrink-0 opacity-50 mt-0.5" />, prefix: "mailto:", placeholder: "you@example.com" },
    { key: "hours",          label: "Hours",           icon: <Clock  className="w-3.5 h-3.5 flex-shrink-0 opacity-50 mt-0.5" />, placeholder: "Mon–Fri 8am–5pm" },
    { key: "address",        label: "Address",         icon: <MapPin className="w-3.5 h-3.5 flex-shrink-0 opacity-50 mt-0.5" />, placeholder: "123 Main St, City, ST" },
    { key: "licenseNumber",  label: "License #",       icon: <Shield className="w-3.5 h-3.5 flex-shrink-0 opacity-50 mt-0.5" />, placeholder: "KY-12345" },
    { key: "emergencyNumber",label: "Emergency Line",  icon: <Phone  className="w-3.5 h-3.5 flex-shrink-0 opacity-50 mt-0.5" />, placeholder: "24/7 emergency" },
  ];

  const visibleFields = fields.filter(f => {
    const fieldVal = props[f.key as keyof ContactBlockProps] as ContactField | undefined;
    return fieldVal?.show === true;
  });

  return (
    <div className="flex flex-col gap-3">
      {props.heading !== undefined && (
        <InlineEditableText
          id={`${sid}-${block.id}-heading`}
          as="h4"
          value={props.heading ?? ""}
          placeholder="Contact"
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: textColor }}
          onCommit={v => updateBlock({ heading: v })}
          disabled={!isEditing}
        />
      )}
      <ul className="flex flex-col gap-2">
        {visibleFields.map(({ key, icon, placeholder }) => {
          const fieldVal = props[key as keyof ContactBlockProps] as ContactField;
          return (
            <li
              key={key}
              className={`flex items-start gap-1.5 text-sm ${isEditing && onFieldFocus ? "cursor-pointer hover:opacity-100 transition-opacity" : ""}`}
              style={{ color: textColor, opacity: 0.8 }}
              onClick={isEditing && onFieldFocus ? (e) => { e.stopPropagation(); onFieldFocus(key); } : undefined}
              title={isEditing ? `Edit ${key}` : undefined}
            >
              {icon}
              <InlineEditableText
                id={`${sid}-${block.id}-${key}`}
                as="span"
                value={fieldVal.value}
                placeholder={placeholder}
                className="text-sm"
                style={{ color: textColor }}
                onCommit={v => updateBlock({ [key]: { ...fieldVal, value: v } } as Partial<ContactBlockProps>)}
                disabled={!isEditing}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BlockContent({
  block, settings, content, sid, isEditing, onChange, businessName, onFieldFocus,
}: {
  block: FooterBlock;
  settings: FooterSectionSettings;
  content: FooterContent;
  sid: string;
  isEditing: boolean;
  onChange?: (c: FooterContent) => void;
  businessName?: string;
  onFieldFocus?: (field: string) => void;
}) {
  switch (block.component) {
    case "LogoBlock":
      return <>{renderLogoBlock(block, settings, content, sid, isEditing, onChange, businessName, onFieldFocus)}</>;
    case "LinksBlock":
      return <>{renderLinksBlock(block, settings, sid, isEditing, onChange, content)}</>;
    case "ServiceAreaBlock":
      return <>{renderServiceAreaBlock(block, settings, sid, isEditing, onChange, content)}</>;
    case "ContactBlock":
      return <>{renderContactBlock(block, settings, sid, isEditing, onChange, content, onFieldFocus)}</>;
    default:
      return null;
  }
}

// ── Block name helper ──────────────────────────────────────────────────────────

function blockName(block: FooterBlock): string {
  switch (block.component) {
    case "LogoBlock":        return `Logo & Social`;
    case "LinksBlock":       return (block as LinksBlock).props.heading || "Links";
    case "ServiceAreaBlock": return (block as ServiceAreaBlock).props.heading || "Service Area";
    case "ContactBlock":     return (block as ContactBlock).props.heading || "Contact";
    default:                 return "Block";
  }
}

// ── Width selector ─────────────────────────────────────────────────────────────

const WIDTH_OPTIONS: FooterBlockWidth[] = [20, 25, 33, 40, 50, 60, 66, 75, 100];

// ── Block inspector / editor panels ───────────────────────────────────────────

function LogoBlockEditor({
  block, content, onChange, focusedField, onClearFocus,
}: {
  block: LogoBlock;
  content: FooterContent;
  onChange: (c: FooterContent) => void;
  focusedField?: string | null;
  onClearFocus?: () => void;
}) {
  const p = block.props;
  const badgeRef  = useRef<HTMLDivElement | null>(null);
  const socialRef = useRef<HTMLDivElement | null>(null);
  const credRef   = useRef<HTMLDivElement | null>(null);
  const socialInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!focusedField) return;
    let target: HTMLElement | null = null;
    if (focusedField.startsWith("badge-")) target = badgeRef.current;
    else if (focusedField.startsWith("social-")) {
      target = socialRef.current;
      // Focus the specific platform input
      const platform = focusedField.replace("social-", "");
      const input = socialInputRefs.current[platform];
      if (input) { input.focus(); input.select(); }
    } else if (focusedField === "credentials") target = credRef.current;
    if (target) target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const t = setTimeout(() => onClearFocus?.(), 2000);
    return () => clearTimeout(t);
  }, [focusedField, onClearFocus]);

  function up(patch: Partial<LogoBlockProps>) {
    onChange({ ...content, columns: patchBlock(content.columns!, block.id, patch as Record<string, unknown>) });
  }

  function setSocialUrl(platform: SocialLink["platform"], url: string) {
    const existing = (content.socialLinks ?? []).filter(s => s.platform !== platform);
    onChange({ ...content, socialLinks: url ? [...existing, { platform, url }] : existing });
  }

  function getSocialUrl(platform: SocialLink["platform"]) {
    return (content.socialLinks ?? []).find(s => s.platform === platform)?.url ?? "";
  }

  function Toggle({ label, checked, onChg }: { label: string; checked: boolean; onChg: (v: boolean) => void }) {
    return (
      <label className="flex items-center justify-between py-0.5 cursor-pointer">
        <span className="text-xs opacity-60">{label}</span>
        <input type="checkbox" checked={checked} onChange={e => onChg(e.target.checked)} className="accent-primary" />
      </label>
    );
  }

  const isBadgeFocused = focusedField?.startsWith("badge-") ?? false;
  const isSocialFocused = focusedField?.startsWith("social-") ?? false;
  const isCredFocused = focusedField === "credentials";

  return (
    <div className="space-y-3 text-white">
      <div
        ref={badgeRef}
        className={`rounded-lg transition-all duration-300 ${isBadgeFocused ? "ring-2 ring-primary p-2 shadow-lg shadow-primary/20" : ""}`}
      >
        <p className="text-[10px] uppercase tracking-wider opacity-40 mb-1">Badges</p>
        <Toggle label="Veteran-Owned"   checked={!!p.showVeteranBadge} onChg={v => up({ showVeteranBadge: v })} />
        <Toggle label="SDVOSB"          checked={!!p.showSdvosbBadge}  onChg={v => up({ showSdvosbBadge: v })} />
        <Toggle label="BBB Accredited"  checked={!!p.showBBBBadge}     onChg={v => up({ showBBBBadge: v })} />
        <Toggle label="SBA Certified"   checked={!!p.showSBABadge}     onChg={v => up({ showSBABadge: v })} />
      </div>
      <div
        ref={credRef}
        className={`rounded-lg transition-all duration-300 ${isCredFocused ? "ring-2 ring-primary p-2 shadow-lg shadow-primary/20" : ""}`}
      >
        <p className="text-[10px] uppercase tracking-wider opacity-40 mb-1">Credential chips (one per line)</p>
        <textarea
          rows={3}
          value={(p.credentialChips ?? []).join("\n")}
          onChange={e => up({ credentialChips: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })}
          placeholder={"Licensed\nFully Insured\nVeteran Owned"}
          className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-xs placeholder-white/30 focus:outline-none focus:border-white/50 resize-none"
        />
      </div>
      <div
        ref={socialRef}
        className={`rounded-lg transition-all duration-300 ${isSocialFocused ? "ring-2 ring-primary p-2 shadow-lg shadow-primary/20" : ""}`}
      >
        <p className="text-[10px] uppercase tracking-wider opacity-40 mb-1.5">Social media</p>
        <div className="space-y-1.5">
          {getSocialPlatforms().map(({ key, label, Icon }) => (
            <div key={key} className="flex items-center gap-2">
              <Icon className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
              <input
                ref={el => { socialInputRefs.current[key] = el; }}
                type="text"
                value={getSocialUrl(key)}
                onChange={e => setSocialUrl(key, e.target.value.trim())}
                placeholder={`${label} URL`}
                className={`flex-1 bg-white/10 rounded px-2 py-1 text-xs placeholder-white/30 focus:outline-none text-white transition-all
                  ${focusedField === `social-${key}` ? "border-2 border-primary shadow-primary/30 shadow-md" : "border border-white/20 focus:border-white/50"}`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LinksBlockEditor({
  block, content, onChange,
}: {
  block: LinksBlock;
  content: FooterContent;
  onChange: (c: FooterContent) => void;
}) {
  const p = block.props;
  function up(patch: Partial<LinksBlockProps>) {
    onChange({ ...content, columns: patchBlock(content.columns!, block.id, patch as Record<string, unknown>) });
  }
  return (
    <div className="space-y-3 text-white">
      <div>
        <label className="block text-xs opacity-50 mb-1">Heading</label>
        <input
          className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/50"
          value={p.heading}
          onChange={e => up({ heading: e.target.value })}
          placeholder="Services"
        />
      </div>
      <div>
        <label className="block text-xs opacity-50 mb-1">Description (optional)</label>
        <input
          className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/50"
          value={p.description ?? ""}
          onChange={e => up({ description: e.target.value || undefined })}
          placeholder="Brief description…"
        />
      </div>
      <div>
        <p className="text-xs opacity-50 mb-1">Links</p>
        {p.links.map((link, i) => (
          <div key={link.id} className="flex items-center gap-1.5 mb-1.5">
            <input
              className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white placeholder-white/30 focus:outline-none"
              value={link.label}
              onChange={e => up({ links: p.links.map(l => l.id === link.id ? { ...l, label: e.target.value } : l) })}
              placeholder="Label"
            />
            <input
              className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white placeholder-white/30 focus:outline-none"
              value={link.href}
              onChange={e => up({ links: p.links.map(l => l.id === link.id ? { ...l, href: e.target.value } : l) })}
              placeholder="#section"
            />
            <button type="button" onClick={() => up({ links: p.links.filter((_, j) => j !== i) })}
              className="p-1 rounded hover:bg-red-500/30 text-white/40 hover:text-red-300 transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button type="button"
          onClick={() => up({ links: [...p.links, { id: uid(), label: "New Link", href: "#" }] })}
          className="flex items-center gap-1 text-xs opacity-50 hover:opacity-100 transition-opacity mt-1">
          <Plus className="w-3 h-3" /> Add link
        </button>
      </div>
    </div>
  );
}

function ServiceAreaBlockEditor({
  block, content, onChange,
}: {
  block: ServiceAreaBlock;
  content: FooterContent;
  onChange: (c: FooterContent) => void;
}) {
  const p = block.props;
  const [newState, setNewState] = useState("");
  function up(patch: Partial<ServiceAreaBlockProps>) {
    onChange({ ...content, columns: patchBlock(content.columns!, block.id, patch as Record<string, unknown>) });
  }
  function addState() {
    const code = newState.toUpperCase().trim().slice(0, 2);
    if (!code || p.states.includes(code)) { setNewState(""); return; }
    up({ states: [...p.states, code] });
    setNewState("");
  }
  return (
    <div className="space-y-3 text-white">
      <div>
        <label className="block text-xs opacity-50 mb-1">Heading</label>
        <input
          className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/50"
          value={p.heading}
          onChange={e => up({ heading: e.target.value })}
          placeholder="Service Area"
        />
      </div>
      <div>
        <label className="block text-xs opacity-50 mb-1">Fallback text (shown when no states)</label>
        <input
          className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/50"
          value={p.fallbackText ?? ""}
          onChange={e => up({ fallbackText: e.target.value || undefined })}
          placeholder="Serving your area"
        />
      </div>
      <div>
        <p className="text-xs opacity-50 mb-1">States (USPS codes)</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {p.states.map(code => (
            <span key={code} className="flex items-center gap-1 px-2 py-0.5 bg-white/10 rounded-full text-xs">
              {STATE_CODE_TO_NAME[code] ?? code}
              <button type="button" onClick={() => up({ states: p.states.filter(c => c !== code) })}
                className="hover:text-red-300 transition-colors"><Trash2 className="w-2.5 h-2.5" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white placeholder-white/30 focus:outline-none uppercase"
            value={newState}
            onChange={e => setNewState(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addState()}
            placeholder="e.g. KY"
            maxLength={2}
          />
          <button type="button" onClick={addState}
            className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors">
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactBlockEditor({
  block, content, onChange, focusedField, onClearFocus,
}: {
  block: ContactBlock;
  content: FooterContent;
  onChange: (c: FooterContent) => void;
  focusedField?: string | null;
  onClearFocus?: () => void;
}) {
  const p = block.props;
  const fieldRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fieldInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!focusedField) return;
    const row = fieldRowRefs.current[focusedField];
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
      // Focus value input if the field is visible
      const input = fieldInputRefs.current[focusedField];
      if (input) { input.focus(); input.select(); }
    }
    const t = setTimeout(() => onClearFocus?.(), 2000);
    return () => clearTimeout(t);
  }, [focusedField, onClearFocus]);

  function up(patch: Partial<ContactBlockProps>) {
    onChange({ ...content, columns: patchBlock(content.columns!, block.id, patch as Record<string, unknown>) });
  }
  const fields: Array<{ key: keyof ContactBlockProps; label: string; placeholder: string }> = [
    { key: "phone",          label: "Phone",         placeholder: "(555) 000-0000" },
    { key: "email",          label: "Email",         placeholder: "you@example.com" },
    { key: "hours",          label: "Hours",         placeholder: "Mon–Fri 8am–5pm" },
    { key: "address",        label: "Address",       placeholder: "123 Main St, City, ST" },
    { key: "licenseNumber",  label: "License #",     placeholder: "KY-12345" },
    { key: "emergencyNumber",label: "Emergency Line",placeholder: "24/7 emergency number" },
  ];
  return (
    <div className="space-y-3 text-white">
      <div>
        <label className="block text-xs opacity-50 mb-1">Column heading</label>
        <input
          className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/50"
          value={p.heading ?? ""}
          onChange={e => up({ heading: e.target.value })}
          placeholder="Contact"
        />
      </div>
      {fields.map(({ key, label, placeholder }) => {
        const fv = (p[key as keyof ContactBlockProps] as ContactField | undefined) ?? { show: false, value: "" };
        const isFocused = focusedField === key;
        return (
          <div
            key={key}
            ref={el => { fieldRowRefs.current[key] = el; }}
            className={`rounded-lg px-2.5 py-2 transition-all duration-300 ${isFocused ? "bg-primary/20 ring-2 ring-primary shadow-lg shadow-primary/20" : "bg-white/5"}`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium opacity-70">{label}</label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span className="text-[10px] opacity-50">Show</span>
                <input type="checkbox" checked={fv.show}
                  onChange={e => up({ [key]: { ...fv, show: e.target.checked } } as Partial<ContactBlockProps>)}
                  className="accent-primary" />
              </label>
            </div>
            {fv.show && (
              <input
                ref={el => { fieldInputRefs.current[key] = el; }}
                className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/50"
                value={fv.value}
                onChange={e => up({ [key]: { ...fv, value: e.target.value } } as Partial<ContactBlockProps>)}
                placeholder={placeholder}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BlockEditorPanel({
  block, content, onChange, focusedField, onClearFocus,
}: {
  block: FooterBlock;
  content: FooterContent;
  onChange: (c: FooterContent) => void;
  focusedField?: string | null;
  onClearFocus?: () => void;
}) {
  switch (block.component) {
    case "LogoBlock":       return <LogoBlockEditor       block={block} content={content} onChange={onChange} focusedField={focusedField} onClearFocus={onClearFocus} />;
    case "LinksBlock":      return <LinksBlockEditor       block={block} content={content} onChange={onChange} />;
    case "ServiceAreaBlock":return <ServiceAreaBlockEditor  block={block} content={content} onChange={onChange} />;
    case "ContactBlock":    return <ContactBlockEditor      block={block} content={content} onChange={onChange} focusedField={focusedField} onClearFocus={onClearFocus} />;
    default: return null;
  }
}

// ── Block hover wrapper ───────────────────────────────────────────────────────

function BlockWrapper({
  block,
  idx,
  total,
  isEditing,
  isSelected,
  onSelect,
  onMove,
  onDelete,
  onDuplicate,
  children,
}: {
  block: FooterBlock;
  idx: number;
  total: number;
  isEditing: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  children: React.ReactNode;
}) {
  if (!isEditing) return <>{children}</>;
  return (
    <div
      className={`relative group cursor-pointer rounded-lg transition-all ${isSelected ? "ring-2 ring-primary/80 bg-white/5" : "hover:bg-white/5 hover:ring-1 hover:ring-white/20"}`}
      style={{ padding: "12px" }}
      onClick={onSelect}
    >
      {/* Hover controls */}
      <div className={`absolute -top-7 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 ${isSelected ? "!opacity-100" : ""}`}>
        <span className="text-[10px] px-2 py-0.5 bg-black/60 text-white/70 rounded-l whitespace-nowrap">{blockName(block)}</span>
        <button type="button" onClick={e => { e.stopPropagation(); onMove(-1); }} disabled={idx === 0}
          className="p-1 bg-black/60 text-white/70 hover:text-white disabled:opacity-30 transition-colors">
          <ChevronUp className="w-3 h-3" />
        </button>
        <button type="button" onClick={e => { e.stopPropagation(); onMove(1); }} disabled={idx === total - 1}
          className="p-1 bg-black/60 text-white/70 hover:text-white disabled:opacity-30 transition-colors">
          <ChevronDown className="w-3 h-3" />
        </button>
        <button type="button" onClick={e => { e.stopPropagation(); onDuplicate(); }}
          className="p-1 bg-black/60 text-white/70 hover:text-white transition-colors">
          <Copy className="w-3 h-3" />
        </button>
        <button type="button" onClick={e => { e.stopPropagation(); onDelete(); }}
          className="p-1 bg-black/60 text-white/70 hover:text-red-400 transition-colors rounded-r">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {children}
    </div>
  );
}

// ── Add block menu ─────────────────────────────────────────────────────────────

function makeNewBlock(component: FooterBlock["component"]): FooterBlock {
  const id = uid();
  switch (component) {
    case "LogoBlock":        return { id, component, width: 33, props: { tagline: "" } };
    case "LinksBlock":       return { id, component, width: 25, props: { heading: "Links", links: [] } };
    case "ServiceAreaBlock": return { id, component, width: 25, props: { heading: "Service Area", states: [] } };
    case "ContactBlock":     return { id, component, width: 25, props: { heading: "Contact", phone: { show: true, value: "" }, email: { show: true, value: "" } } };
  }
}

// ── Main FooterSection ────────────────────────────────────────────────────────

export function FooterSection({
  content: rawContent,
  settings,
  isEditing,
  onChange,
  blockStyle,
  onOpenMediaLibrary: _onOpenMediaLibrary,
  sectionId,
  businessName,
}: FooterSectionProps) {
  // Memoize migration so block IDs stay stable across unrelated re-renders.
  const content = useMemo(
    () => rawContent.columns ? rawContent : migrateFooterContent(rawContent),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawContent],
  );

  // Persist migration to parent state on first render so IDs are stable after
  // the parent re-renders (once columns is set, migration never runs again).
  useEffect(() => {
    if (!rawContent.columns && onChange) {
      onChange(content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = content.columns ?? [];
  const sid = sectionId ?? "footer";

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const copyrightInputRef = useRef<HTMLInputElement | null>(null);

  /** Select a block AND mark a specific field inside it to be highlighted/scrolled. */
  function focusBlockField(blockId: string, field: string) {
    setSelectedBlockId(blockId);
    setFocusedField(field);
  }

  const bg  = settings.footerBgColor || settings.brandColor || "#1a1a2e";
  const textColor = `var(--theme-footer-text, ${settings.footerTextColor ?? "#ffffff"})`;
  const copyrightYear = new Date().getFullYear();
  const copyrightFallback = `© ${copyrightYear} ${businessName ?? "Your Business"}. All rights reserved.`;

  function update(patch: Partial<FooterContent>) {
    onChange?.({ ...content, ...patch });
  }

  function moveBlock(id: string, dir: -1 | 1) {
    const idx = columns.findIndex(b => b.id === id);
    if (idx < 0) return;
    const next = [...columns];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    update({ columns: next });
  }

  function deleteBlock(id: string) {
    update({ columns: columns.filter(b => b.id !== id) });
    if (selectedBlockId === id) setSelectedBlockId(null);
  }

  function duplicateBlock(id: string) {
    const src = columns.find(b => b.id === id);
    if (!src) return;
    const clone = { ...src, id: uid() };
    const idx = columns.findIndex(b => b.id === id);
    const next = [...columns];
    next.splice(idx + 1, 0, clone);
    update({ columns: next });
    setSelectedBlockId(clone.id);
  }

  function addBlock(component: FooterBlock["component"]) {
    const block = makeNewBlock(component);
    update({ columns: [...columns, block] });
    setSelectedBlockId(block.id);
    setShowAddMenu(false);
  }

  function setBlockWidth(id: string, width: FooterBlockWidth) {
    update({
      columns: columns.map(b => b.id === id ? { ...b, width } : b),
    });
  }

  // Build CSS grid template from widths (fr units so gaps work correctly)
  const gridTemplate = columns.map(b => `${b.width}fr`).join(" ");

  const selectedBlock = columns.find(b => b.id === selectedBlockId) ?? null;

  // ── Render ──────────────────────────────────────────────────────────────────

  const columnGrid = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: gridTemplate,
        gap: "2rem",
      }}
    >
      {columns.map((block, idx) => (
        <BlockWrapper
          key={block.id}
          block={block}
          idx={idx}
          total={columns.length}
          isEditing={!!isEditing}
          isSelected={selectedBlockId === block.id}
          onSelect={() => { setSelectedBlockId(prev => prev === block.id ? null : block.id); setFocusedField(null); }}
          onMove={dir => moveBlock(block.id, dir)}
          onDelete={() => deleteBlock(block.id)}
          onDuplicate={() => duplicateBlock(block.id)}
        >
          <BlockContent
            block={block}
            settings={settings}
            content={content}
            sid={sid}
            isEditing={!!isEditing}
            onChange={onChange ? (c) => onChange(c) : undefined}
            businessName={businessName}
            onFieldFocus={isEditing ? (field) => focusBlockField(block.id, field) : undefined}
          />
        </BlockWrapper>
      ))}
    </div>
  );

  const copyrightBar = (
    <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2">
      <p
        className={`text-xs opacity-40 ${isEditing ? "cursor-pointer hover:opacity-70 transition-opacity" : ""}`}
        style={{ color: textColor }}
        onClick={isEditing ? () => { setSelectedBlockId(null); setFocusedField("copyright"); } : undefined}
        title={isEditing ? "Edit copyright text" : undefined}
      >
        <InlineEditableText
          id={`${sid}-copyright`}
          as="span"
          value={content.copyright ?? ""}
          placeholder={copyrightFallback}
          className="text-xs"
          style={{ color: textColor }}
          onCommit={v => update({ copyright: v })}
          disabled={!isEditing}
        />
        {!content.copyright && <span className="opacity-50">{copyrightFallback}</span>}
      </p>
      <div className="flex items-center gap-4">
        {content.privacyPolicyUrl && (
          <a href={content.privacyPolicyUrl} className="text-xs opacity-40 hover:opacity-70 transition-opacity" style={{ color: textColor }}>
            Privacy Policy
          </a>
        )}
        {content.termsUrl && (
          <a href={content.termsUrl} className="text-xs opacity-40 hover:opacity-70 transition-opacity" style={{ color: textColor }}>
            Terms
          </a>
        )}
      </div>
    </div>
  );

  if (!isEditing) {
    return (
      <BlockStyleWrapper wrapperClassName="pt-14 pb-8 px-6" defaultBg={bg} blockStyle={blockStyle} isEditing={false}>
        <div className="max-w-5xl mx-auto" style={{ color: textColor }}>
          {columnGrid}
          {copyrightBar}
        </div>
      </BlockStyleWrapper>
    );
  }

  // ── Edit mode ───────────────────────────────────────────────────────────────
  return (
    <BlockStyleWrapper wrapperClassName="pt-14 pb-8 px-6" defaultBg={bg} blockStyle={blockStyle} isEditing={isEditing}>
      <div className="max-w-5xl mx-auto" style={{ color: textColor }}>
        {/* Live preview with hover overlays */}
        <div className="relative pt-7">
          {columnGrid}
          {copyrightBar}
        </div>

        {/* ── Editor panel ─────────────────────────────────────────────────── */}
        <div className="mt-8 bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          {/* Block tabs */}
          <div className="flex items-center gap-0 border-b border-white/10 overflow-x-auto">
            {columns.map(block => (
              <button
                key={block.id}
                type="button"
                onClick={() => { setSelectedBlockId(prev => prev === block.id ? null : block.id); setFocusedField(null); }}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-r border-white/10 transition-colors flex-shrink-0
                  ${selectedBlockId === block.id
                    ? "bg-primary/20 text-white"
                    : "text-white/50 hover:text-white hover:bg-white/5"}`}
              >
                {blockName(block)}
              </button>
            ))}
            {/* Add block */}
            <div className="relative ml-auto flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowAddMenu(p => !p)}
                className="flex items-center gap-1 px-3 py-2 text-xs text-white/40 hover:text-white hover:bg-white/5 transition-colors"
              >
                <Plus className="w-3 h-3" /> Add block
              </button>
              {showAddMenu && (
                <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-white/20 rounded-lg shadow-xl z-20 min-w-44">
                  {(["LogoBlock", "LinksBlock", "ServiceAreaBlock", "ContactBlock"] as const).map(component => (
                    <button key={component} type="button"
                      onClick={() => addBlock(component)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors">
                      {{
                        LogoBlock: "Logo & Social",
                        LinksBlock: "Links Column",
                        ServiceAreaBlock: "Service Area",
                        ContactBlock: "Contact Info",
                      }[component]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Selected block editor */}
          {selectedBlock && (
            <div className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <h4 className="text-xs font-semibold text-white/70 uppercase tracking-wider flex-1">
                  {blockName(selectedBlock)}
                </h4>
                {/* Width selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-white/40">Width</span>
                  <select
                    value={selectedBlock.width}
                    onChange={e => setBlockWidth(selectedBlock.id, Number(e.target.value) as FooterBlockWidth)}
                    className="bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                  >
                    {WIDTH_OPTIONS.map(w => (
                      <option key={w} value={w}>{w}%</option>
                    ))}
                  </select>
                </div>
              </div>
              <BlockEditorPanel
                block={selectedBlock}
                content={content}
                onChange={c => onChange?.(c)}
                focusedField={focusedField}
                onClearFocus={() => setFocusedField(null)}
              />
            </div>
          )}

          {/* Copyright bar settings (when no block selected or as separate section) */}
          {!selectedBlock && (
            <CopyrightPanel
              content={content}
              copyrightFallback={copyrightFallback}
              focusedField={focusedField}
              onClearFocus={() => setFocusedField(null)}
              update={update}
            />
          )}
        </div>
      </div>
    </BlockStyleWrapper>
  );
}

// Extracted so it can hold its own ref without conflicting with FooterSection's refs
function CopyrightPanel({
  content, copyrightFallback, focusedField, onClearFocus, update,
}: {
  content: FooterContent;
  copyrightFallback: string;
  focusedField: string | null;
  onClearFocus: () => void;
  update: (patch: Partial<FooterContent>) => void;
}) {
  const copyrightRowRef = useRef<HTMLDivElement | null>(null);
  const copyrightInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (focusedField !== "copyright") return;
    copyrightRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    copyrightInputRef.current?.focus();
    copyrightInputRef.current?.select();
    const t = setTimeout(() => onClearFocus(), 2000);
    return () => clearTimeout(t);
  }, [focusedField, onClearFocus]);

  return (
    <div className="p-4 space-y-3">
      <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Copyright bar</p>
      <div
        ref={copyrightRowRef}
        className={`rounded-lg transition-all duration-300 ${focusedField === "copyright" ? "ring-2 ring-primary p-2 shadow-lg shadow-primary/20" : ""}`}
      >
        <label className="block text-xs text-white/50 mb-1">Copyright text</label>
        <input
          ref={copyrightInputRef}
          className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/50"
          value={content.copyright ?? ""}
          onChange={e => update({ copyright: e.target.value })}
          placeholder={copyrightFallback}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-white/50 mb-1">Privacy Policy URL</label>
          <input
            className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/50"
            value={content.privacyPolicyUrl ?? ""}
            onChange={e => update({ privacyPolicyUrl: e.target.value || undefined })}
            placeholder="/privacy"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">Terms URL</label>
          <input
            className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/50"
            value={content.termsUrl ?? ""}
            onChange={e => update({ termsUrl: e.target.value || undefined })}
            placeholder="/terms"
          />
        </div>
      </div>
    </div>
  );
}
