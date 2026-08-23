/**
 * Runtime mode detection — single source of truth.
 *
 * ALL PWA behavior, manifest injection, service-worker registration, and
 * BuildPro-specific shell behavior MUST key off these helpers.  No other file
 * should inspect `window.location.hostname` directly for this purpose.
 *
 * Published websites may eventually gain their own PWA identities — this module
 * is intentionally designed so that future per-business PWA support can be added
 * here without touching call sites elsewhere.
 */

/** Known BuildPro origins — localhost and all Replit-managed hostnames. */
const BUILD_PRO_HOST_RE =
  /^(localhost|127\.0\.0\.1|.*\.replit\.dev|.*\.replit\.app|.*\.repl\.co)$/i;

/** Returns true when running inside the BuildPro application shell. */
export function isBuildProMode(): boolean {
  return BUILD_PRO_HOST_RE.test(window.location.hostname);
}

/** Returns true when the page is served on a published business website domain. */
export function isPublishedWebsite(): boolean {
  return !isBuildProMode();
}
