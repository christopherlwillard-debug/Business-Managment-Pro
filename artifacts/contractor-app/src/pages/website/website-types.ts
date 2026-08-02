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

/**
 * A section snapshot saved by the user for reuse.
 * Persisted in the `saved_sections` DB table (not in settings JSONB).
 */
export interface SavedSection {
  /** DB primary key. */
  id: number;
  /** User-chosen display name. */
  name: string;
  /** The Section.type string (e.g. "hero", "services"). */
  sectionType: string;
  /** Deep-cloned Section.content at save-time. */
  content: Record<string, unknown>;
  /** Deep-cloned Section.blockStyle at save-time, if any. */
  blockStyle?: Record<string, unknown>;
  /** ISO timestamp string from the database. */
  createdAt: string;
}

// ── Universal Card Engine ─────────────────────────────────────────────────────

export type CardClickAction =
  | "none" | "scroll" | "page" | "url" | "contact-form" | "tel" | "email";

export type CardMediaType = "icon" | "image" | "none";

export type CardHoverEffect = "none" | "lift" | "glow" | "border";

export type CardLayout = "icon-top" | "icon-left" | "image-bg" | "horizontal";

export type CardTextAlign = "left" | "center" | "right";

export type CardIconSize = "sm" | "md" | "lg" | "xl";

export type CardBadgePosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Typed template identifiers — drives preset content and default settings.
 * "process-step" not "process"; kept as a branded union so consumers can
 * discriminate without runtime surprises.
 */
export type CardTemplateType =
  | "service"
  | "team"
  | "trust"
  | "certification"
  | "pricing"
  | "testimonial"
  | "process-step"
  | "portfolio";

/**
 * Visibility rule — evaluated at public render time only; ignored in the
 * editor (hidden cards show as dimmed, scheduled cards show as normal).
 *
 * enabled: false or undefined → rule is bypassed → card is always rendered.
 * type "always"     → always render (used to explicitly clear a prior rule).
 * type "date-range" → render only within [startDate, endDate];
 *                     omitting either bound makes that end open.
 *
 * No arbitrary JS condition is supported — security boundary.
 */
export interface CardVisibilityRule {
  enabled: boolean;
  type: "always" | "date-range";
  startDate?: string;
  endDate?: string;
}

/**
 * Universal card primitive — the atomic unit for any section that renders a
 * grid of cards (ServicesSection, future CardCollection, etc.).
 *
 * Design philosophy:
 *   • All color/spacing fields accept `null` to mean "inherit from theme CSS var".
 *   • Fields are additive — old data that lacks new fields safely uses defaults.
 *   • No field is ever truly deleted; fields are deprecated and kept as optional.
 */
export interface CardComponent {
  id: string;
  title: string;
  description: string;
  hidden?: boolean;

  /** Typed template identifier — drives initial content and default settings; null clears a prior template */
  templateType?: CardTemplateType | null;

  // ── Media ──────────────────────────────────────────────────────────────────
  mediaType?: CardMediaType;
  /** Key into LUCIDE_ICON_MAP */
  iconName?: string;
  /** null = inherit theme accent color */
  iconColor?: string | null;
  /** null = computed from iconColor at 15% opacity */
  iconBgColor?: string | null;
  /** Icon (and inline image) size — defaults to "md" */
  iconSize?: CardIconSize;
  imageUrl?: string;
  imageObjectPath?: string;
  imageAlt?: string;

  // ── Card background image ─────────────────────────────────────────────────
  cardBgImage?: string;
  cardBgImageObjectPath?: string;
  /** null = #000 */
  cardBgOverlayColor?: string | null;
  /** 0–1; defaults to 0.5 */
  cardBgOverlayOpacity?: number;
  /** CSS background-position value; defaults to "center" */
  cardBgPosition?: string;

  // ── Button / CTA ──────────────────────────────────────────────────────────
  buttonLabel?: string;
  buttonUrl?: string;

  // ── Click action ──────────────────────────────────────────────────────────
  clickAction?: CardClickAction;
  /** URL, tel number, email, anchor ID, page slug — depends on clickAction */
  clickTarget?: string;

  // ── Badge ─────────────────────────────────────────────────────────────────
  /** Master toggle; badge is hidden when false/undefined regardless of text */
  badgeEnabled?: boolean;
  badgeText?: string;
  /** null = white */
  badgeTextColor?: string | null;
  /** null = brand color */
  badgeColor?: string | null;
  /** Defaults to "top-right" */
  badgePosition?: CardBadgePosition;

  // ── Per-card design overrides (null = inherit theme CSS var) ──────────────
  /** null = var(--theme-surface) */
  cardBgColor?: string | null;
  /** null = var(--theme-card-border-color) */
  cardBorderColor?: string | null;
  /** CSS border-width value, e.g. "1px", "2px"; null = theme default */
  cardBorderWidth?: string | null;
  /** CSS border-radius value, e.g. "0.75rem", "0"; null = var(--theme-card-radius) */
  cardBorderRadius?: string | null;
  /** CSS box-shadow value; null = var(--theme-card-shadow) */
  cardShadow?: string | null;
  /** CSS padding value, e.g. "1.5rem", "1rem 1.25rem"; null = section default */
  cardPadding?: string | null;
  /** null = var(--theme-text-muted) */
  cardTextColor?: string | null;
  /** null = var(--theme-text) */
  cardTitleColor?: string | null;

  // ── Layout ────────────────────────────────────────────────────────────────
  hoverEffect?: CardHoverEffect;
  layout?: CardLayout;
  textAlign?: CardTextAlign;

  // ── Visibility (evaluated at public render time only) ─────────────────────
  visibilityRule?: CardVisibilityRule;

  // ── Analytics ────────────────────────────────────────────────────────────
  trackClicks?: boolean;
  analyticsLabel?: string;
}

/**
 * CardCollection — section-level primitive for multi-card layouts with
 * filtering, pagination, categories, and rich grid controls. Planned for a
 * future milestone. CardComponent is the atomic unit; CardCollection groups them.
 *
 * Reserved fields (do not use as CardComponent field names):
 *   collectionId, collectionTitle, filterEnabled, filterCategories,
 *   paginationMode, itemsPerPage, sortField, sortDirection
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CardCollectionReserved = never;
