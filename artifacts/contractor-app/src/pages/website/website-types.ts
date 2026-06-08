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
