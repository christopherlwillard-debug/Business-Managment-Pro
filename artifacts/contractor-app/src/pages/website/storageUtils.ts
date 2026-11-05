/**
 * Browser storage is a convenience for editor preferences, never a requirement
 * for editing. Access can throw in private browsing, embedded, or restricted
 * browser contexts, so callers must be able to fall back to defaults.
 */
export function readEditorPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeEditorPreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Editor preferences are optional; storage failure must not break editing.
  }
}
