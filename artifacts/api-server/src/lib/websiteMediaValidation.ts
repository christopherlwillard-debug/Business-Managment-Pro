/** Validate media metadata edits before sending values to varchar/integer columns. */
export function validateWebsiteMediaPatch(value: unknown):
  | { ok: true; update: { displayName?: string | null; alt?: string | null; folderId?: number | null } }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Media update must be an object." };
  }
  const input = value as Record<string, unknown>;
  const update: { displayName?: string | null; alt?: string | null; folderId?: number | null } = {};
  if ("displayName" in input) {
    if (input.displayName !== null && typeof input.displayName !== "string") {
      return { ok: false, error: "Display name must be text or null." };
    }
    if (typeof input.displayName === "string" && [...input.displayName].length > 255) {
      return { ok: false, error: "Display names must be 255 characters or fewer." };
    }
    update.displayName = typeof input.displayName === "string" && input.displayName.length > 0 ? input.displayName : null;
  }
  if ("alt" in input) {
    if (input.alt !== null && typeof input.alt !== "string") {
      return { ok: false, error: "Alt text must be text or null." };
    }
    if (typeof input.alt === "string" && [...input.alt].length > 255) {
      return { ok: false, error: "Alt text must be 255 characters or fewer." };
    }
    update.alt = typeof input.alt === "string" && input.alt.length > 0 ? input.alt : null;
  }
  if ("folderId" in input) {
    if (input.folderId !== null && (!Number.isSafeInteger(input.folderId) || (input.folderId as number) <= 0)) {
      return { ok: false, error: "Folder ID must be a positive integer or null." };
    }
    update.folderId = input.folderId as number | null;
  }
  if (Object.keys(update).length === 0) return { ok: false, error: "Nothing to update." };
  return { ok: true, update };
}
/** Validate and normalize bulk-delete IDs before constructing a database IN clause. */
export function validateWebsiteMediaIds(value: unknown):
  | { ok: true; ids: number[] }
  | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "Select at least one image to delete." };
  }
  if (value.length > 1000) {
    return { ok: false, error: "Delete no more than 1,000 images at a time." };
  }
  if (!value.every(id => Number.isSafeInteger(id) && id > 0)) {
    return { ok: false, error: "Image IDs must be positive integers." };
  }
  return { ok: true, ids: [...new Set(value as number[])] };
}

/** Keep generated or uploaded display filenames within the website_media varchar(255) limit. */
export function truncateWebsiteMediaFilename(value: string, maxLength = 255): string {
  return [...value].slice(0, Math.max(0, maxLength)).join("");
}

/** Validate the declared metadata used to mint direct-to-storage Website Studio upload URLs. */
export function validateWebsiteDirectUpload(value: unknown, kind: "favicon" | "image"):
  | { ok: true; upload: { name: string; size: number; contentType: string } }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Upload details must be an object." };
  }
  const input = value as Record<string, unknown>;
  if (typeof input.name !== "string" || input.name.trim().length === 0 || [...input.name].length > 255) {
    return { ok: false, error: "Choose a valid image filename (255 characters or fewer)." };
  }
  const maxBytes = kind === "favicon" ? 2 * 1024 * 1024 : 20 * 1024 * 1024;
  if (!Number.isSafeInteger(input.size) || (input.size as number) <= 0 || (input.size as number) > maxBytes) {
    return { ok: false, error: kind === "favicon"
      ? "Favicon images must be smaller than 2 MB."
      : "Images must be smaller than 20 MB." };
  }
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"]);
  if (typeof input.contentType !== "string" || !allowedTypes.has(input.contentType.toLowerCase())) {
    return { ok: false, error: "Choose a supported image file (JPEG, PNG, WebP, GIF, AVIF, or icon)." };
  }
  if (kind === "favicon" && !["image/png", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"].includes(input.contentType.toLowerCase())) {
    return { ok: false, error: "Favicons must be PNG, SVG, or ICO files." };
  }
  return { ok: true, upload: { name: input.name.trim(), size: input.size as number, contentType: input.contentType.toLowerCase() } };
}

/** Validate untrusted section/settings payloads used by Website Studio analysis endpoints. */
export function validateWebsiteAnalysisInput(sections: unknown, settings: unknown):
  | { ok: true; sections: Array<{ type: string; enabled: boolean; content: Record<string, unknown> }>; settings: Record<string, unknown> }
  | { ok: false; error: string } {
  if (!Array.isArray(sections)) return { ok: false, error: "Sections must be provided as a list." };
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { ok: false, error: "Settings must be an object." };
  }
  for (const section of sections) {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      return { ok: false, error: "Every section must be a valid section object." };
    }
    const item = section as Record<string, unknown>;
    if (typeof item.type !== "string" || !item.type.trim()) {
      return { ok: false, error: "Every section must have a valid type." };
    }
    if (!item.content || typeof item.content !== "object" || Array.isArray(item.content)) {
      return { ok: false, error: "Every section must have a content object." };
    }
  }
  return {
    ok: true,
    sections: sections as Array<{ type: string; enabled: boolean; content: Record<string, unknown> }>,
    settings: settings as Record<string, unknown>,
  };
}

/** Validate the core shape of website sections before persisting or analyzing them. */
export function validateWebsiteSections(value: unknown):
  | { ok: true; sections: Array<Record<string, unknown>> }
  | { ok: false; error: string } {
  if (!Array.isArray(value)) return { ok: false, error: "Website sections must be provided as a list." };
  for (const section of value) {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      return { ok: false, error: "Every website section must be a valid object." };
    }
    const item = section as Record<string, unknown>;
    if (typeof item.type !== "string" || !item.type.trim()) {
      return { ok: false, error: "Every website section must have a type." };
    }
    if (!item.content || typeof item.content !== "object" || Array.isArray(item.content)) {
      return { ok: false, error: "Every website section must have a content object." };
    }
    if (item.enabled !== undefined && typeof item.enabled !== "boolean") {
      return { ok: false, error: "Website section enabled flags must be true or false." };
    }
  }
  return { ok: true, sections: value as Array<Record<string, unknown>> };
}

/** Settings are JSON objects; reject primitives and arrays before object spreading or mutation. */
export function validateWebsiteSettings(value: unknown):
  | { ok: true; settings: Record<string, unknown> }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Website settings must be an object." };
  }
  return { ok: true, settings: value as Record<string, unknown> };
}
