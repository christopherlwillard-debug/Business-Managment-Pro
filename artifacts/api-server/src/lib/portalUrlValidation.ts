export type PortalUrlValidation =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/** Validate a user-supplied portal link before it is stored and rendered as an anchor. */
export function validatePortalUrl(value: string): PortalUrlValidation {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "portalUrl must be a valid HTTP or HTTPS URL." };
  }

  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    return {
      ok: false,
      error: "portalUrl must use HTTP or HTTPS and cannot contain embedded credentials.",
    };
  }

  return { ok: true, value: parsed.toString() };
}
