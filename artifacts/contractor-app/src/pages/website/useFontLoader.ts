import { useEffect } from "react";

export const HEADING_FONTS = [
  "Inter",
  "Oswald",
  "Montserrat",
  "Playfair Display",
  "Raleway",
  "Roboto Slab",
];

export const BODY_FONTS = [
  "Inter",
  "Lato",
  "Open Sans",
  "Merriweather",
  "Source Sans 3",
  "Nunito",
];

const GOOGLE_FONT_NAMES = new Set([
  "Oswald", "Montserrat", "Playfair Display", "Raleway", "Roboto Slab",
  "Lato", "Open Sans", "Merriweather", "Source Sans 3", "Nunito",
]);

const LINK_ID = "gf-website-fonts";

export function useFontLoader(headingFont?: string, bodyFont?: string) {
  useEffect(() => {
    const toLoad = [headingFont, bodyFont].filter(
      (f): f is string => !!f && GOOGLE_FONT_NAMES.has(f)
    );
    const uniqueFonts = [...new Set(toLoad)];

    let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;

    if (uniqueFonts.length > 0) {
      const families = uniqueFonts
        .map(f => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
        .join("&");
      if (!link) {
        link = document.createElement("link");
        link.id = LINK_ID;
        link.rel = "stylesheet";
        document.head.appendChild(link);
      }
      link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    } else {
      link?.remove();
    }

    const root = document.documentElement;
    if (headingFont) {
      root.style.setProperty("--font-heading", `'${headingFont}', sans-serif`);
    } else {
      root.style.removeProperty("--font-heading");
    }
    if (bodyFont) {
      root.style.setProperty("--font-body", `'${bodyFont}', sans-serif`);
    } else {
      root.style.removeProperty("--font-body");
    }

    return () => {
      root.style.removeProperty("--font-heading");
      root.style.removeProperty("--font-body");
    };
  }, [headingFont, bodyFont]);
}

export function injectFavicon(faviconUrl: string | undefined) {
  const id = "site-favicon";
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (faviconUrl) {
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
  } else {
    link?.remove();
  }
}
