import { useRef } from "react";
import { HeaderFloatingToolbar } from "./HeaderFloatingToolbar";

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

// ── HeaderPreviewBar ───────────────────────────────────────────────────────────

export function HeaderPreviewBar({
  content,
  settings,
  businessName,
}: {
  content: HeaderContent;
  settings: HeaderSectionProps["settings"];
  businessName?: string;
}) {
  // Content-level headerStyle overrides settings.headerStyle
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

  const navLinks = content.navLinks ?? [];
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

  // Logo section positioning
  const logoContainerStyle: React.CSSProperties =
    logoAlignment === "center"
      ? { position: "absolute", left: "50%", transform: "translateX(-50%)" }
      : logoAlignment === "right"
      ? { order: 3 }
      : {};

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
      <div className="flex items-center gap-3 flex-shrink-0" style={logoContainerStyle}>
        {showLogo && settings.logoUrl && (
          <img
            src={settings.logoUrl}
            alt={businessName ?? "Logo"}
            style={{ height: logoHeightPx, width: "auto", objectFit: "contain" }}
          />
        )}
        {showBusinessName && (
          <span
            className="font-bold text-sm"
            style={{ color: `var(--theme-header-text, ${darkFallbackText})` }}
          >
            {businessName ?? "Your Business"}
          </span>
        )}
        {showVeteranBadge && (
          <HeaderBadge
            label="Veteran-Owned"
            color={isDark ? "rgba(255,255,255,0.7)" : "#4b5563"}
          />
        )}
        {showSdvosbBadge && (
          <HeaderBadge
            label="SDVOSB"
            color={isDark ? "rgba(255,255,255,0.7)" : "#4b5563"}
          />
        )}
      </div>

      {showNav && (
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <span
              key={link.id}
              className="text-sm font-medium transition-opacity hover:opacity-80 cursor-pointer"
              style={{ color: `var(--theme-header-link, ${darkFallbackLink})` }}
            >
              {link.label}
            </span>
          ))}
        </nav>
      )}

      <div className="flex items-center gap-3 flex-shrink-0">
        {showEmail && (
          <a
            href={`mailto:${email}`}
            className="hidden md:block text-sm font-medium hover:opacity-80 transition-opacity"
            style={{ color: `var(--theme-header-link, ${darkFallbackLink})` }}
          >
            {email}
          </a>
        )}
        {showPhone && phone && (
          <span
            className="hidden md:block text-sm font-medium"
            style={{ color: `var(--theme-header-link, ${darkFallbackLink})` }}
          >
            {phone}
          </span>
        )}
        {showCta && (
          <span
            className="px-4 py-2 text-sm text-white cursor-pointer transition-opacity hover:opacity-90"
            style={{
              backgroundColor: settings.brandColor,
              borderRadius: "var(--theme-btn-radius, 9999px)",
              fontWeight: "var(--theme-btn-font-weight, 600)" as React.CSSProperties["fontWeight"],
              boxShadow: "var(--theme-btn-shadow, none)",
            }}
          >
            {ctaLabel}
          </span>
        )}
        <span
          className="md:hidden cursor-pointer"
          style={{ color: `var(--theme-header-text, ${darkFallbackText})` }}
        >
          ☰
        </span>
      </div>
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
}: HeaderSectionProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

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
        />
      )}
    </div>
  );
}
