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
  cardRadius: string;
  cardShadow: string;
  cardBorder: boolean;
}

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
    cardRadius: "12px",
    cardShadow: "0 1px 4px rgba(0,0,0,0.08)",
    cardBorder: false,
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
    cardRadius: "6px",
    cardShadow: "none",
    cardBorder: true,
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
    cardRadius: "16px",
    cardShadow: "0 4px 20px rgba(124,58,237,0.14)",
    cardBorder: false,
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
    cardRadius: "4px",
    cardShadow: "none",
    cardBorder: true,
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
    cardRadius: "0px",
    cardShadow: "none",
    cardBorder: true,
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
    cardRadius: "8px",
    cardShadow: "0 4px 16px rgba(220,38,38,0.18)",
    cardBorder: false,
  },
];

function cardBorderValue(theme: SiteTheme): string {
  return theme.cardBorder ? "1px solid #e5e7eb" : "none";
}

export function buildThemeCssVarBlock(themeId: string | undefined): string {
  if (!themeId) return "";
  const theme = SITE_THEMES.find(t => t.id === themeId);
  if (!theme) return "";
  return `:root {
    --theme-primary: ${theme.brandColor};
    --theme-secondary: ${theme.secondaryColor};
    --theme-accent: ${theme.accentColor};
    --theme-bg: ${theme.bgColor};
    --theme-surface: ${theme.surfaceColor};
    --theme-text: ${theme.textColor};
    --theme-text-muted: ${theme.textMutedColor};
    --theme-font-heading: '${theme.headingFont}', system-ui, sans-serif;
    --theme-font-body: '${theme.bodyFont}', system-ui, sans-serif;
    --theme-btn-radius: ${theme.buttonRadius};
    --theme-card-radius: ${theme.cardRadius};
    --theme-card-shadow: ${theme.cardShadow};
    --theme-card-border: ${cardBorderValue(theme)};
  }`;
}

export function applyThemeCssVars(themeId: string | undefined): void {
  const theme = themeId ? SITE_THEMES.find(t => t.id === themeId) : null;
  const root = document.documentElement;
  if (theme) {
    root.style.setProperty("--theme-primary", theme.brandColor);
    root.style.setProperty("--theme-secondary", theme.secondaryColor);
    root.style.setProperty("--theme-accent", theme.accentColor);
    root.style.setProperty("--theme-bg", theme.bgColor);
    root.style.setProperty("--theme-surface", theme.surfaceColor);
    root.style.setProperty("--theme-text", theme.textColor);
    root.style.setProperty("--theme-text-muted", theme.textMutedColor);
    root.style.setProperty("--theme-font-heading", `'${theme.headingFont}', system-ui, sans-serif`);
    root.style.setProperty("--theme-font-body", `'${theme.bodyFont}', system-ui, sans-serif`);
    root.style.setProperty("--theme-btn-radius", theme.buttonRadius);
    root.style.setProperty("--theme-card-radius", theme.cardRadius);
    root.style.setProperty("--theme-card-shadow", theme.cardShadow);
    root.style.setProperty("--theme-card-border", cardBorderValue(theme));
  } else {
    const vars = [
      "--theme-primary", "--theme-secondary", "--theme-accent",
      "--theme-bg", "--theme-surface", "--theme-text", "--theme-text-muted",
      "--theme-font-heading", "--theme-font-body",
      "--theme-btn-radius", "--theme-card-radius", "--theme-card-shadow", "--theme-card-border",
    ];
    vars.forEach(v => root.style.removeProperty(v));
  }
}
