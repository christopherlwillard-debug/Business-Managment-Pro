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
