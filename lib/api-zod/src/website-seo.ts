export const SEO_LIMITS = {
  title: { min: 10, max: 60 },
  description: { min: 50, max: 160 },
  keywords: { min: 2, max: 500 },
  ogImage: { max: 2048 },
  landingDescription: 2000,
  landingDetails: 2000,
} as const;

export function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname;
  } catch {
    return false;
  }
}

export type SeoValidationErrors = Partial<Record<
  "metaTitle" | "metaDescription" | "keywords" | "ogTitle" | "ogDescription" | "ogImage",
  string
>>;

export function validateSeoMetadata(input: {
  metaTitle?: unknown;
  metaDescription?: unknown;
  keywords?: unknown;
  ogTitle?: unknown;
  ogDescription?: unknown;
  ogImage?: unknown;
}): SeoValidationErrors {
  const errors: SeoValidationErrors = {};
  const checkText = (
    key: keyof SeoValidationErrors,
    value: unknown,
    min: number,
    max: number,
    label: string,
  ) => {
    if (value === undefined || value === null || value === "") {
      errors[key] = `${label} is required.`;
      return;
    }
    if (typeof value !== "string") {
      errors[key] = `${label} must be text.`;
      return;
    }
    const length = value.trim().length;
    if (length < min || length > max) {
      errors[key] = `${label} must be between ${min} and ${max} characters.`;
    }
  };

  checkText("metaTitle", input.metaTitle, SEO_LIMITS.title.min, SEO_LIMITS.title.max, "Meta title");
  checkText("metaDescription", input.metaDescription, SEO_LIMITS.description.min, SEO_LIMITS.description.max, "Meta description");
  if (input.keywords !== undefined && input.keywords !== null && input.keywords !== "") {
    checkText("keywords", input.keywords, SEO_LIMITS.keywords.min, SEO_LIMITS.keywords.max, "Keywords");
  }
  checkText("ogTitle", input.ogTitle, SEO_LIMITS.title.min, SEO_LIMITS.title.max, "OG title");
  checkText("ogDescription", input.ogDescription, SEO_LIMITS.description.min, SEO_LIMITS.description.max, "OG description");

  if (input.ogImage !== undefined && input.ogImage !== null && input.ogImage !== "") {
    if (typeof input.ogImage !== "string" || input.ogImage.length > SEO_LIMITS.ogImage.max || !isAbsoluteHttpUrl(input.ogImage.trim())) {
      errors.ogImage = "OG image must be an absolute HTTP(S) URL.";
    }
  }
  return errors;
}