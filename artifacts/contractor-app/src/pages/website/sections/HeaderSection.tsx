import React, { useRef, useState } from "react";
import { HeaderFloatingToolbar, type TabId } from "./HeaderFloatingToolbar";
import { getSafePublicNavLinks } from "../storageUtils";

export interface NavLink {
  id: string;
  label: string;
  href: string;
}

export type LogoSize = "sm" | "md" | "lg";

export interface HeaderContent {
  navLinks: NavLink[];
  phone?: string;
  email?: string;
  ctaLabel?: string;
  ctaConfig?: import("./ButtonEditor").ButtonConfig;
  sticky?: boolean;
  showLogo?: boolean;
  showBusinessName?: boolean;
  showNav?: boolean;
  showPhone?: boolean;
  showCta?: boolean;
  showEmail?: boolean;
  showVeteranBadge?: boolean;
  showSdvosbBadge?: boolean;
  /** Accepts legacy string aliases (sm/md/lg/small/medium/large) or a pixel number (40–120). */
  logoSize?: string | number;
  /** Logo horizontal position in the header. Default: "left". */
  logoAlignment?: "left" | "center" | "right";
  /** Optional content-level header style override (supersedes settings.headerStyle). */
  headerStyle?: "light" | "dark" | "transparent";
  /** Zone assignment for the Header Builder. Absent = DEFAULT_HEADER_ZONES (backward compat). */
  blockZones?: { left: string[]; center: string[]; right: string[] };
  /** Short tagline or subtext shown in the header. */
  tagline?: string;
  /** Whether the tagline block is visible. Default: false. */
  showTagline?: boolean;
}

export interface SitePageRef {
  id: string;
  name: string;
  slug: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function defaultHeaderContent(): HeaderContent {
  return {
    navLinks: [
      { id: uid(), label: "Services", href: "#services" },
      { id: uid(), label: "About", href: "#about" },
      { id: uid(), label: "Contact", href: "#contact" },
      { id: uid(), label: "Portfolio", href: "#portfolio" },
    ],
    phone: "",
    ctaLabel: "Get a Quote",
    ctaConfig: { url: "#contact", borderRadius: "pill" },
    sticky: true,
    showLogo: true,
    showBusinessName: true,
    showNav: true,
    showPhone: true,
    showCta: true,
    logoSize: "md",
  };
}

// ── Logo height resolution ─────────────────────────────────────────────────────

const LOGO_SIZE_PX: Record<string, number> = {
  sm: 48, small: 48,
  md: 64, medium: 64,
  lg: 80, large: 80,
};

export function resolveLogoHeightPx(logoSize: string | number | undefined): number {
  if (logoSize === undefined) return 64;
  if (typeof logoSize === "number") return Math.max(24, Math.min(160, logoSize));
  return LOGO_SIZE_PX[logoSize] ?? 64;
}

// ── Block zones ────────────────────────────────────────────────────────────────

export type HeaderBlockId =
  | "logo" | "nav" | "phone" | "email" | "cta"
  | "tagline" | "veteran-badge" | "sdvosb-badge";

export const DEFAULT_HEADER_ZONES: { left: HeaderBlockId[]; center: HeaderBlockId[]; right: HeaderBlockId[] } = {
  left: ["logo", "tagline", "veteran-badge", "sdvosb-badge"],
  center: ["nav"],
  right: ["email", "phone", "cta"],
};

// ── HeaderSectionProps ─────────────────────────────────────────────────────────

export interface HeaderSectionSettings {
  brandColor: string;
  accentColor?: string;
  logoUrl?: string;
  headerStyle?: "light" | "dark" | "transparent";
}

interface HeaderSectionProps {
  content: HeaderContent;
  settings: HeaderSectionSettings;
  isEditing?: boolean;
  onChange?: (content: HeaderContent) => void;
  businessName?: string;
  siteSlug?: string;
  pages?: SitePageRef[];
  /** Called when the "Advanced" tab is clicked in the floating toolbar. */
  onAdvanced?: () => void;
  /** Opens the media library — used for logo replacement. */
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

// ── Small badge ───────────────────────────────────────────────────────────────

function HeaderBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded border"
      style={{ borderColor: color, color }}
    >
      {label}
    </span>
  );
}

// ── Editable hint wrapper ─────────────────────────────────────────────────────
// Wraps any header element in edit mode with a hover ring + click affordance.

function EditHint({
  children,
  isEditing,
  onClick,
  title,
  className = "",
}: {
  children: React.ReactNode;
  isEditing: boolean;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  className?: string;
}) {
  if (!isEditing) return <>{children}</>;
  return (
    <span
      className={`relative inline-flex items-center cursor-pointer rounded transition-all hover:ring-2 hover:ring-primary/60 hover:bg-primary/5 px-0.5 ${className}`}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      title={title}
    >
      {children}
    </span>
  );
}

// ── HeaderPreviewBar ───────────────────────────────────────────────────────────

interface HeaderPreviewBarProps {
  content: HeaderContent;
  settings: HeaderSectionSettings;
  businessName?: string;
  /** When true, elements show hover highlights and click handlers. */
  isEditing?: boolean;
  onChange?: (content: HeaderContent) => void;
  /** Programmatically open a specific toolbar tab. */
  onFocusTab?: (tab: TabId) => void;
  /** Open media library (for logo replacement). */
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

export function HeaderPreviewBar({
  content,
  settings,
  businessName,
  isEditing = false,
  onChange,
  onFocusTab,
  onOpenMediaLibrary,
}: HeaderPreviewBarProps) {
  // ── Inline editing state ─────────────────────────────────────────────────
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [editingCta, setEditingCta] = useState(false);
  const [ctaDraft, setCtaDraft] = useState("");

  // ── Style resolution ─────────────────────────────────────────────────────
  const headerStyle = content.headerStyle ?? settings.headerStyle ?? "light";
  const isDark = headerStyle === "dark" || headerStyle === "transparent";
  const borderClass =
    headerStyle === "dark"
      ? "border-gray-700"
      : headerStyle === "transparent"
      ? "border-white/10"
      : "border-gray-100";
  const transparentBgClass =
    headerStyle === "transparent" ? "bg-white/10 backdrop-blur-sm" : "";

  const darkFallbackBg = headerStyle === "dark" ? "#111827" : "#ffffff";
  const darkFallbackText = isDark ? "#ffffff" : "#111111";
  const darkFallbackLink = isDark ? "rgba(255,255,255,0.7)" : "#4b5563";

  const navLinks = getSafePublicNavLinks(content.navLinks);
  const phone = content.phone ?? "";
  const email = content.email ?? "";
  const ctaLabel = content.ctaLabel ?? "Get a Quote";

  const showLogo = content.showLogo !== false;
  const showBusinessName = content.showBusinessName !== false;
  const showNav = content.showNav !== false;
  const showPhone = content.showPhone !== false;
  const showCta = content.showCta !== false;
  const showEmail = content.showEmail === true && !!email;
  const showVeteranBadge = content.showVeteranBadge === true;
  const showSdvosbBadge = content.showSdvosbBadge === true;

  const logoHeightPx = resolveLogoHeightPx(content.logoSize);
  const logoAlignment = content.logoAlignment ?? "left";

  const logoContainerStyle: React.CSSProperties =
    logoAlignment === "center"
      ? { position: "absolute", left: "50%", transform: "translateX(-50%)" }
      : logoAlignment === "right"
      ? { order: 3 }
      : {};

  // ── Inline edit handlers ─────────────────────────────────────────────────

  function startEditingLink(link: NavLink, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingLinkId(link.id);
    setLinkDraft(link.label);
  }

  function commitLinkEdit() {
    if (!editingLinkId || !onChange) { setEditingLinkId(null); return; }
    const trimmed = linkDraft.trim();
    onChange({
      ...content,
      navLinks: navLinks.map((l) =>
        l.id === editingLinkId ? { ...l, label: trimmed || l.label } : l
      ),
    });
    setEditingLinkId(null);
  }

  function startEditingCta(e: React.MouseEvent) {
    e.stopPropagation();
    setEditingCta(true);
    setCtaDraft(ctaLabel);
  }

  function commitCtaEdit() {
    if (!onChange) { setEditingCta(false); return; }
    const trimmed = ctaDraft.trim();
    onChange({ ...content, ctaLabel: trimmed || ctaLabel });
    setEditingCta(false);
  }

  function handleLogoClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (onOpenMediaLibrary) {
      // Logo URL lives in site settings, so we surface the logo tab which
      // lets users manage size/alignment; full logo-replacement is task #1508.
      onFocusTab?.("logo");
    } else {
      onFocusTab?.("logo");
    }
  }

  // ── Zone-based rendering ────────────────────────────────────────────────────
  const rawZones = content.blockZones as unknown;
  const effectiveZones: { left: string[]; center: string[]; right: string[] } =
    rawZones && typeof rawZones === "object" && !Array.isArray(rawZones) &&
    Array.isArray((rawZones as { left?: unknown }).left) &&
    Array.isArray((rawZones as { center?: unknown }).center) &&
    Array.isArray((rawZones as { right?: unknown }).right)
      ? {
          left: (rawZones as { left: unknown[] }).left.filter((id): id is string => typeof id === "string"),
          center: (rawZones as { center: unknown[] }).center.filter((id): id is string => typeof id === "string"),
          right: (rawZones as { right: unknown[] }).right.filter((id): id is string => typeof id === "string"),
        }
      : DEFAULT_HEADER_ZONES;

  /** Renders one header block by ID. Returns null when the block is hidden. */
  function renderZoneBlock(blockId: string): React.ReactNode {
    switch (blockId) {
      case "logo":
        if (!showLogo && !showBusinessName) return null;
        return (
          <>
            {showLogo && settings.logoUrl && (
              <EditHint isEditing={isEditing} onClick={handleLogoClick} title="Click to edit logo settings">
                <img
                  src={settings.logoUrl}
                  alt={businessName ?? "Logo"}
                  style={{ height: logoHeightPx, width: "auto", objectFit: "contain" }}
                />
              </EditHint>
            )}
            {showLogo && !settings.logoUrl && isEditing && (
              <span
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border-2 border-dashed border-primary/30 text-xs text-primary/50 cursor-pointer hover:border-primary/60 hover:text-primary/70 transition-colors"
                onClick={(e) => { e.stopPropagation(); onFocusTab?.("logo"); }}
                title="Click to manage logo"
              >
                🖼 Logo
              </span>
            )}
            {showBusinessName && (
              <span className="font-bold text-sm" style={{ color: `var(--theme-header-text, ${darkFallbackText})` }}>
                {businessName ?? "Your Business"}
              </span>
            )}
          </>
        );

      case "tagline":
        if (!content.showTagline || !content.tagline) return null;
        return (
          <span className="hidden md:block text-xs opacity-60 whitespace-nowrap" style={{ color: `var(--theme-header-text, ${darkFallbackText})` }}>
            {content.tagline}
          </span>
        );

      case "veteran-badge":
        return showVeteranBadge ? (
          <HeaderBadge label="Veteran-Owned" color={isDark ? "rgba(255,255,255,0.7)" : "#4b5563"} />
        ) : null;

      case "sdvosb-badge":
        return showSdvosbBadge ? (
          <HeaderBadge label="SDVOSB" color={isDark ? "rgba(255,255,255,0.7)" : "#4b5563"} />
        ) : null;

      case "nav":
        if (!showNav) return null;
        return (
          <>
            {navLinks.map((link) => {
              if (isEditing && editingLinkId === link.id) {
                return (
                  <input
                    key={link.id}
                    type="text"
                    value={linkDraft}
                    autoFocus
                    onChange={(e) => setLinkDraft(e.target.value)}
                    onBlur={commitLinkEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitLinkEdit(); }
                      if (e.key === "Escape") { e.preventDefault(); setEditingLinkId(null); }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm font-medium bg-transparent border-b-2 border-primary outline-none min-w-0 w-20 text-center"
                    style={{ color: `var(--theme-header-link, ${darkFallbackLink})` }}
                  />
                );
              }
              return (
                <EditHint
                  key={link.id}
                  isEditing={isEditing}
                  onClick={(e) => startEditingLink(link, e)}
                  title={isEditing ? "Click to edit link label" : undefined}
                >
                  <span
                    className="text-sm font-medium transition-opacity hover:opacity-80"
                    style={{ color: `var(--theme-header-link, ${darkFallbackLink})` }}
                  >
                    {link.label}
                  </span>
                </EditHint>
              );
            })}
          </>
        );

      case "email":
        if (!showEmail) return null;
        return (
          <EditHint
            isEditing={isEditing}
            onClick={(e) => { e.stopPropagation(); onFocusTab?.("phone"); }}
            title="Click to edit email"
          >
            <a
              href={isEditing ? undefined : `mailto:${email}`}
              className="hidden md:block text-sm font-medium hover:opacity-80 transition-opacity"
              style={{ color: `var(--theme-header-link, ${darkFallbackLink})` }}
              onClick={isEditing ? (e) => e.preventDefault() : undefined}
            >
              {email}
            </a>
          </EditHint>
        );

      case "phone":
        if (!showPhone && !isEditing) return null;
        if (!showPhone) return null;
        return (
          <EditHint
            isEditing={isEditing}
            onClick={(e) => { e.stopPropagation(); onFocusTab?.("phone"); }}
            title="Click to edit phone number"
          >
            <span className="hidden md:block text-sm font-medium" style={{ color: `var(--theme-header-link, ${darkFallbackLink})` }}>
              {phone || (isEditing ? <em className="opacity-40 not-italic">Add phone…</em> : null)}
            </span>
          </EditHint>
        );

      case "cta":
        if (!showCta) return null;
        if (editingCta && isEditing) {
          return (
            <input
              type="text"
              value={ctaDraft}
              autoFocus
              onChange={(e) => setCtaDraft(e.target.value)}
              onBlur={commitCtaEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitCtaEdit(); }
                if (e.key === "Escape") { e.preventDefault(); setEditingCta(false); }
              }}
              onClick={(e) => e.stopPropagation()}
              className="px-3 py-2 text-sm text-white outline-none text-center w-32"
              style={{
                backgroundColor: settings.brandColor,
                borderRadius: "var(--theme-btn-radius, 9999px)",
                fontWeight: "var(--theme-btn-font-weight, 600)" as React.CSSProperties["fontWeight"],
                boxShadow: "var(--theme-btn-shadow, none)",
              }}
            />
          );
        }
        return (
          <EditHint isEditing={isEditing} onClick={startEditingCta} title="Click to edit button text">
            <span
              className="px-4 py-2 text-sm text-white transition-opacity hover:opacity-90"
              style={{
                cursor: isEditing ? "text" : "pointer",
                backgroundColor: settings.brandColor,
                borderRadius: "var(--theme-btn-radius, 9999px)",
                fontWeight: "var(--theme-btn-font-weight, 600)" as React.CSSProperties["fontWeight"],
                boxShadow: "var(--theme-btn-shadow, none)",
              }}
            >
              {ctaLabel}
            </span>
          </EditHint>
        );

      default:
        return null;
    }
  }

  /** Render a zone's blocks, skipping nulls and adding stable keys. */
  function renderZone(ids: string[]): React.ReactNode {
    return ids.map(id => {
      const el = renderZoneBlock(id);
      return el ? <React.Fragment key={id}>{el}</React.Fragment> : null;
    });
  }

  const logoInLeft = effectiveZones.left.includes("logo");

  return (
    <div
      className={`relative px-6 py-3 flex items-center justify-between border-b ${transparentBgClass} ${borderClass}`}
      style={{
        backgroundColor:
          headerStyle !== "transparent"
            ? `var(--theme-header-bg, ${darkFallbackBg})`
            : undefined,
        color: `var(--theme-header-text, ${darkFallbackText})`,
      }}
    >
      {/* Left zone */}
      <div
        className="flex items-center gap-3 flex-shrink-0"
        style={logoInLeft ? logoContainerStyle : {}}
      >
        {renderZone(effectiveZones.left)}
      </div>

      {/* Center zone */}
      <div className="hidden md:flex items-center gap-6">
        {renderZone(effectiveZones.center)}
      </div>

      {/* Right zone */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {renderZone(effectiveZones.right)}
        {/* Mobile hamburger is always last-right */}
        <span
          className="md:hidden cursor-pointer"
          style={{ color: `var(--theme-header-text, ${darkFallbackText})` }}
        >
          ☰
        </span>
      </div>

      {/* Edit-mode overlay hint strip */}
      {isEditing && (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/20 pointer-events-none"
          aria-hidden
        />
      )}
    </div>
  );
}

// ── HeaderSection ─────────────────────────────────────────────────────────────

export function HeaderSection({
  content,
  settings,
  isEditing,
  onChange,
  businessName,
  siteSlug,
  pages = [],
  onAdvanced,
  onOpenMediaLibrary,
}: HeaderSectionProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Lifted tab state — clicking canvas elements focuses the corresponding tab
  const [activeTab, setActiveTab] = useState<TabId | null>(null);

  if (!isEditing) {
    return (
      <HeaderPreviewBar
        content={content}
        settings={settings}
        businessName={businessName}
      />
    );
  }

  return (
    <div ref={wrapperRef}>
      <HeaderPreviewBar
        content={content}
        settings={settings}
        businessName={businessName}
        isEditing={isEditing}
        onChange={onChange}
        onFocusTab={setActiveTab}
        onOpenMediaLibrary={onOpenMediaLibrary}
      />
      {onChange && (
        <HeaderFloatingToolbar
          content={content}
          settings={settings}
          onChange={onChange}
          businessName={businessName}
          siteSlug={siteSlug}
          pages={pages}
          headerRef={wrapperRef as React.RefObject<HTMLElement>}
          onAdvanced={onAdvanced}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}
    </div>
  );
}
