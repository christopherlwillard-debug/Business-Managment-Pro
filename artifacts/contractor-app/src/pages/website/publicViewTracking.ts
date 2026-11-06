/**
 * Build a stable visit key for a public page. The home page is represented
 * explicitly so moving between home and a custom page records each view.
 */
export function getWebsiteViewTrackingKey(slug: string, pageSlug?: string | null): string {
  return `${slug}:${pageSlug || "home"}`;
}
