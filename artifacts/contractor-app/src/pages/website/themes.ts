export interface SiteTheme {
  id: string;
  name: string;
  emoji: string;
  description: string;
  headingFont: string;
  bodyFont: string;
  brandColor: string;
  secondaryColor: string;
  accentColor: string;
  bgColor: string;
  surfaceColor: string;
  textColor: string;
  textMutedColor: string;
  buttonRadius: string;
  buttonFontWeight: string;
  buttonShadow: boolean;
  cardRadius: string;
  cardShadow: string;
  cardBorder: boolean;
  inputRadius: string;
}

export interface ThemeOverrides {
  brandColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  bgColor?: string;
  surfaceColor?: string;
  textColor?: string;
  textMutedColor?: string;
  headingFont?: string;
  bodyFont?: string;
  buttonRadius?: string;
  buttonFontWeight?: string;
  buttonShadow?: boolean;
  cardRadius?: string;
  cardShadow?: string;
  cardBorder?: boolean;
  inputRadius?: string;
}

export type ThemeColorOverrides = ThemeOverrides;

export const SITE_THEMES: SiteTheme[] = [
  {
    id: "modern",
    name: "Modern",
    emoji: "⚡",
    description: "Clean lines, blue palette, pill buttons",
    headingFont: "Inter",
    bodyFont: "Inter",
    brandColor: "#2563EB",
    secondaryColor: "#1E40AF",
    accentColor: "#60A5FA",
    bgColor: "#ffffff",
    surfaceColor: "#f8fafc",
    textColor: "#0f172a",
    textMutedColor: "#64748b",
    buttonRadius: "9999px",
    buttonFontWeight: "600",
    buttonShadow: false,
    cardRadius: "12px",
    cardShadow: "0 1px 4px rgba(0,0,0,0.08)",
    cardBorder: false,
    inputRadius: "8px",
  },
  {
    id: "corporate",
    name: "Corporate",
    emoji: "🏢",
    description: "Navy, Montserrat, structured borders",
    headingFont: "Montserrat",
    bodyFont: "Source Sans 3",
    brandColor: "#1E3A5F",
    secondaryColor: "#2D5986",
    accentColor: "#C8A95A",
    bgColor: "#ffffff",
    surfaceColor: "#f1f5f9",
    textColor: "#1e293b",
    textMutedColor: "#64748b",
    buttonRadius: "4px",
    buttonFontWeight: "700",
    buttonShadow: false,
    cardRadius: "6px",
    cardShadow: "none",
    cardBorder: true,
    inputRadius: "4px",
  },
  {
    id: "creative",
    name: "Creative",
    emoji: "🎨",
    description: "Purple, Raleway, elevated cards",
    headingFont: "Raleway",
    bodyFont: "Nunito",
    brandColor: "#7C3AED",
    secondaryColor: "#5B21B6",
    accentColor: "#F59E0B",
    bgColor: "#fefefe",
    surfaceColor: "#f5f3ff",
    textColor: "#1e1b4b",
    textMutedColor: "#6b7280",
    buttonRadius: "8px",
    buttonFontWeight: "600",
    buttonShadow: true,
    cardRadius: "16px",
    cardShadow: "0 4px 20px rgba(124,58,237,0.14)",
    cardBorder: false,
    inputRadius: "8px",
  },
  {
    id: "luxury",
    name: "Luxury",
    emoji: "✨",
    description: "Gold, Playfair Display, refined edges",
    headingFont: "Playfair Display",
    bodyFont: "Lato",
    brandColor: "#B5935A",
    secondaryColor: "#1A1A1A",
    accentColor: "#D4AF72",
    bgColor: "#faf9f7",
    surfaceColor: "#f5f0e8",
    textColor: "#1a1a1a",
    textMutedColor: "#8a7560",
    buttonRadius: "2px",
    buttonFontWeight: "500",
    buttonShadow: false,
    cardRadius: "4px",
    cardShadow: "none",
    cardBorder: true,
    inputRadius: "2px",
  },
  {
    id: "minimal",
    name: "Minimal",
    emoji: "◻",
    description: "Black & white, sharp corners, space",
    headingFont: "Inter",
    bodyFont: "Inter",
    brandColor: "#111111",
    secondaryColor: "#333333",
    accentColor: "#888888",
    bgColor: "#ffffff",
    surfaceColor: "#f5f5f5",
    textColor: "#111111",
    textMutedColor: "#777777",
    buttonRadius: "0px",
    buttonFontWeight: "600",
    buttonShadow: false,
    cardRadius: "0px",
    cardShadow: "none",
    cardBorder: true,
    inputRadius: "0px",
  },
  {
    id: "bold",
    name: "Bold",
    emoji: "🔥",
    description: "Red, Oswald, high contrast impact",
    headingFont: "Oswald",
    bodyFont: "Open Sans",
    brandColor: "#DC2626",
    secondaryColor: "#991B1B",
    accentColor: "#FCA5A5",
    bgColor: "#ffffff",
    surfaceColor: "#fff1f1",
    textColor: "#111111",
    textMutedColor: "#6b7280",
    buttonRadius: "6px",
    buttonFontWeight: "700",
    buttonShadow: true,
    cardRadius: "8px",
    cardShadow: "0 4px 16px rgba(220,38,38,0.18)",
    cardBorder: false,
    inputRadius: "6px",
  },
];

function resolveCardBorder(v: boolean | undefined): string {
  return v ? "1px solid #e5e7eb" : "none";
}

function resolveButtonShadow(v: boolean | undefined): string {
  return v ? "0 2px 8px rgba(0,0,0,0.15)" : "none";
}

export function buildThemeCssVarBlock(
  themeId: string | undefined,
  overrides?: ThemeOverrides,
): string {
  const theme = themeId ? SITE_THEMES.find(t => t.id === themeId) : null;
  if (!theme && !overrides) return "";

  const primary = overrides?.brandColor ?? theme?.brandColor;
  const secondary = overrides?.secondaryColor ?? theme?.secondaryColor;
  const accent = overrides?.accentColor ?? theme?.accentColor;
  const bg = overrides?.bgColor ?? theme?.bgColor;
  const surface = overrides?.surfaceColor ?? theme?.surfaceColor;
  const text = overrides?.textColor ?? theme?.textColor;
  const textMuted = overrides?.textMutedColor ?? theme?.textMutedColor;
  const headingFont = overrides?.headingFont ?? theme?.headingFont;
  const bodyFont = overrides?.bodyFont ?? theme?.bodyFont;
  const btnRadius = overrides?.buttonRadius ?? theme?.buttonRadius;
  const btnFontWeight = overrides?.buttonFontWeight ?? theme?.buttonFontWeight;
  const btnShadowBool = overrides?.buttonShadow !== undefined ? overrides.buttonShadow : theme?.buttonShadow;
  const cardRadius = overrides?.cardRadius ?? theme?.cardRadius;
  const cardShadow = overrides?.cardShadow ?? theme?.cardShadow;
  const cardBorderBool = overrides?.cardBorder !== undefined ? overrides.cardBorder : theme?.cardBorder;
  const inputRadius = overrides?.inputRadius ?? theme?.inputRadius;

  const lines: string[] = [":root {"];
  if (primary) lines.push(`  --theme-primary: ${primary};`);
  if (secondary) lines.push(`  --theme-secondary: ${secondary};`);
  if (accent) lines.push(`  --theme-accent: ${accent};`);
  if (bg) lines.push(`  --theme-bg: ${bg};`);
  if (surface) lines.push(`  --theme-surface: ${surface};`);
  if (text) lines.push(`  --theme-text: ${text};`);
  if (textMuted) lines.push(`  --theme-text-muted: ${textMuted};`);
  if (headingFont) lines.push(`  --theme-font-heading: '${headingFont}', system-ui, sans-serif;`);
  if (bodyFont) lines.push(`  --theme-font-body: '${bodyFont}', system-ui, sans-serif;`);
  if (btnRadius) lines.push(`  --theme-btn-radius: ${btnRadius};`);
  if (btnFontWeight) lines.push(`  --theme-btn-font-weight: ${btnFontWeight};`);
  if (btnShadowBool !== undefined) lines.push(`  --theme-btn-shadow: ${resolveButtonShadow(btnShadowBool)};`);
  if (cardRadius) lines.push(`  --theme-card-radius: ${cardRadius};`);
  if (cardShadow) lines.push(`  --theme-card-shadow: ${cardShadow};`);
  if (cardBorderBool !== undefined) lines.push(`  --theme-card-border: ${resolveCardBorder(cardBorderBool)};`);
  if (inputRadius) lines.push(`  --theme-input-radius: ${inputRadius};`);
  lines.push("}");

  if (bg) lines.push("body { background-color: var(--theme-bg); font-family: var(--theme-font-body, system-ui, sans-serif); }");
  if (headingFont) lines.push("h1, h2, h3, h4, h5, h6 { font-family: var(--theme-font-heading, system-ui, sans-serif); }");

  return lines.join("\n");
}

export function applyThemeCssVars(
  themeId: string | undefined,
  overrides?: ThemeOverrides,
): void {
  const theme = themeId ? SITE_THEMES.find(t => t.id === themeId) : null;
  const root = document.documentElement;

  if (!theme && !overrides) {
    const vars = [
      "--theme-primary", "--theme-secondary", "--theme-accent",
      "--theme-bg", "--theme-surface", "--theme-text", "--theme-text-muted",
      "--theme-font-heading", "--theme-font-body",
      "--theme-btn-radius", "--theme-btn-font-weight", "--theme-btn-shadow",
      "--theme-card-radius", "--theme-card-shadow", "--theme-card-border",
      "--theme-input-radius",
    ];
    vars.forEach(v => root.style.removeProperty(v));
    return;
  }

  const primary = overrides?.brandColor ?? theme?.brandColor;
  const secondary = overrides?.secondaryColor ?? theme?.secondaryColor;
  const accent = overrides?.accentColor ?? theme?.accentColor;
  const bg = overrides?.bgColor ?? theme?.bgColor;
  const surface = overrides?.surfaceColor ?? theme?.surfaceColor;
  const text = overrides?.textColor ?? theme?.textColor;
  const textMuted = overrides?.textMutedColor ?? theme?.textMutedColor;
  const headingFont = overrides?.headingFont ?? theme?.headingFont;
  const bodyFont = overrides?.bodyFont ?? theme?.bodyFont;
  const btnRadius = overrides?.buttonRadius ?? theme?.buttonRadius;
  const btnFontWeight = overrides?.buttonFontWeight ?? theme?.buttonFontWeight;
  const btnShadowBool = overrides?.buttonShadow !== undefined ? overrides.buttonShadow : theme?.buttonShadow;
  const cardRadius = overrides?.cardRadius ?? theme?.cardRadius;
  const cardShadow = overrides?.cardShadow ?? theme?.cardShadow;
  const cardBorderBool = overrides?.cardBorder !== undefined ? overrides.cardBorder : theme?.cardBorder;
  const inputRadius = overrides?.inputRadius ?? theme?.inputRadius;

  function setOrRemove(varName: string, value: string | undefined) {
    if (value !== undefined) root.style.setProperty(varName, value);
    else root.style.removeProperty(varName);
  }

  setOrRemove("--theme-primary", primary);
  setOrRemove("--theme-secondary", secondary);
  setOrRemove("--theme-accent", accent);
  setOrRemove("--theme-bg", bg);
  setOrRemove("--theme-surface", surface);
  setOrRemove("--theme-text", text);
  setOrRemove("--theme-text-muted", textMuted);
  setOrRemove("--theme-font-heading", headingFont ? `'${headingFont}', system-ui, sans-serif` : undefined);
  setOrRemove("--theme-font-body", bodyFont ? `'${bodyFont}', system-ui, sans-serif` : undefined);
  setOrRemove("--theme-btn-radius", btnRadius);
  setOrRemove("--theme-btn-font-weight", btnFontWeight);
  setOrRemove("--theme-btn-shadow", btnShadowBool !== undefined ? resolveButtonShadow(btnShadowBool) : undefined);
  setOrRemove("--theme-card-radius", cardRadius);
  setOrRemove("--theme-card-shadow", cardShadow);
  setOrRemove("--theme-card-border", cardBorderBool !== undefined ? resolveCardBorder(cardBorderBool) : undefined);
  setOrRemove("--theme-input-radius", inputRadius);
}
