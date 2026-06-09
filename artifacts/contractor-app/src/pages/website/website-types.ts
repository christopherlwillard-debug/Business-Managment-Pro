import type { BlockStyle } from "./sections/BlockStyleWrapper";

/**
 * Responsive breakpoint overrides — reserved for future implementation.
 * Currently non-functional; fields are persisted so they round-trip safely
 * once responsive editing ships. Tablet = 768–1023px; Mobile = <768px.
 */
export interface SectionBreakpoints {
  tablet?: Partial<BlockStyle>;
  mobile?: Partial<BlockStyle>;
}

export interface SiteSettings {
  brandColor: string;
  secondaryColor?: string;
  accentColor?: string;
  bgColor?: string;
  surfaceColor?: string;
  textColor?: string;
  textMutedColor?: string;
  fontFamily: string;
  headingFont?: string;
  bodyFont?: string;
  buttonRadius?: string;
  buttonFontWeight?: string;
  buttonShadow?: boolean;
  cardRadius?: string;
  cardShadow?: string;
  cardBorder?: boolean;
  inputRadius?: string;
  headingSizeScale?: "compact" | "regular" | "large" | "xl";
  baseFontSize?: "sm" | "base" | "lg";
  headerBgColor?: string;
  headerTextColor?: string;
  headerLinkColor?: string;
  footerTextColor?: string;
  footerLinkColor?: string;
  focusRingColor?: string;
  logoUrl: string;
  logoObjectPath?: string;
  faviconUrl?: string;
  faviconObjectPath?: string;
  customDomain?: string;
  headerStyle?: "light" | "dark" | "transparent";
  footerBgColor?: string;
  themeId?: string;
}

// ── Universal Card Engine ─────────────────────────────────────────────────────

export type CardClickAction = "none" | "scroll" | "page" | "url" | "contact-form" | "tel" | "email";
export type CardMediaType = "icon" | "image" | "none";
export type CardHoverEffect = "none" | "lift" | "glow" | "border";
export type CardLayout = "icon-top" | "icon-left" | "image-bg" | "horizontal";
export type CardTextAlign = "left" | "center" | "right";

/**
 * Universal card primitive — used by ServicesSection and any future
 * section that renders a grid of cards.
 */
export interface CardComponent {
  id: string;
  title: string;
  description: string;
  hidden?: boolean;

  /** Set when the card was created from a template */
  templateType?: string;

  // ── Media ──────────────────────────────────────────────────────────────────
  mediaType?: CardMediaType;
  /** Key into LUCIDE_ICON_MAP */
  iconName?: string;
  /** null = inherit theme accent color */
  iconColor?: string | null;
  /** null = inherit computed icon bg */
  iconBgColor?: string | null;
  imageUrl?: string;
  imageObjectPath?: string;

  // ── Card background image ─────────────────────────────────────────────────
  bgImageUrl?: string;
  bgImageObjectPath?: string;
  /** null = #000 */
  bgOverlayColor?: string | null;
  bgOverlayOpacity?: number;

  // ── Button / CTA ──────────────────────────────────────────────────────────
  buttonLabel?: string;
  buttonUrl?: string;

  // ── Click action ──────────────────────────────────────────────────────────
  clickAction?: CardClickAction;
  /** URL, tel number, email, anchor ID, page slug — depends on clickAction */
  clickTarget?: string;

  // ── Badge ─────────────────────────────────────────────────────────────────
  badgeText?: string;
  /** null = white */
  badgeColor?: string | null;
  /** null = brand color */
  badgeBgColor?: string | null;

  // ── Per-card design overrides (null = inherit theme CSS var) ──────────────
  cardBgColor?: string | null;
  cardBorderColor?: string | null;
  cardTextColor?: string | null;
  cardTitleColor?: string | null;

  // ── Layout ────────────────────────────────────────────────────────────────
  hoverEffect?: CardHoverEffect;
  layout?: CardLayout;
  textAlign?: CardTextAlign;

  // ── Visibility (evaluated at public render time only) ─────────────────────
  visibilityRule?: string;

  // ── Analytics ────────────────────────────────────────────────────────────
  trackClicks?: boolean;
  analyticsLabel?: string;
}

// TODO: CardCollection — section-level primitive for multi-card layouts with
// filtering, pagination, categories, and rich grid controls. Planned for a
// future milestone. CardComponent is the atomic unit; CardCollection groups them.
