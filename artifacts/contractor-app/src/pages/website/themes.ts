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
    buttonRadius: "6px",
    cardRadius: "8px",
    cardShadow: "0 4px 16px rgba(220,38,38,0.18)",
    cardBorder: false,
  },
];

export function buildThemeCssVarBlock(themeId: string | undefined): string {
  if (!themeId) return "";
  const theme = SITE_THEMES.find(t => t.id === themeId);
  if (!theme) return "";
  return `:root {
    --theme-btn-radius: ${theme.buttonRadius};
    --theme-card-radius: ${theme.cardRadius};
    --theme-card-shadow: ${theme.cardShadow};
    --theme-card-border: ${theme.cardBorder ? "1px solid #e5e7eb" : "none"};
  }`;
}

export function applyThemeCssVars(themeId: string | undefined): void {
  const theme = themeId ? SITE_THEMES.find(t => t.id === themeId) : null;
  const root = document.documentElement;
  if (theme) {
    root.style.setProperty("--theme-btn-radius", theme.buttonRadius);
    root.style.setProperty("--theme-card-radius", theme.cardRadius);
    root.style.setProperty("--theme-card-shadow", theme.cardShadow);
    root.style.setProperty("--theme-card-border", theme.cardBorder ? "1px solid #e5e7eb" : "none");
  } else {
    root.style.removeProperty("--theme-btn-radius");
    root.style.removeProperty("--theme-card-radius");
    root.style.removeProperty("--theme-card-shadow");
    root.style.removeProperty("--theme-card-border");
  }
}
