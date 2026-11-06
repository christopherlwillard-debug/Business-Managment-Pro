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
/**
 * Wait until the editor's serialized save queue has fully drained. The
 * callbacks keep this helper independent of React and make the ordering
 * behavior straightforward to regression-test.
 */
export async function waitForWebsiteSaveQueue(options: {
  isInFlight: () => boolean;
  isQueued: () => boolean;
  getPending: () => Promise<unknown> | null;
  flushQueued: () => void;
}): Promise<void> {
  while (options.isInFlight() || options.isQueued()) {
    const pending = options.getPending();
    if (!pending) {
      if (options.isQueued()) {
        options.flushQueued();
        continue;
      }
      return;
    }
    await pending.catch(() => undefined);
  }
}

/** Apply a background-image patch to the latest section array without replacing unrelated edits. */
export function patchSectionBlockStyle<T extends { id: string; blockStyle?: Record<string, unknown> }>(
  sections: T[],
  sectionId: string,
  patch: Record<string, unknown>,
): T[] {
  return sections.map(section => section.id === sectionId
    ? { ...section, blockStyle: { ...(section.blockStyle ?? {}), ...patch } }
    : section);
}

/** Roll back only this upload's optimistic preview; never restore an old page snapshot. */
export function restoreSectionBlockStylePreview<T extends { id: string; blockStyle?: Record<string, unknown> }>(
  sections: T[],
  sectionId: string,
  previewUrl: string,
  originalBlockStyle: Record<string, unknown> | undefined,
): T[] {
  return sections.map(section => {
    if (section.id !== sectionId || section.blockStyle?.bgImageUrl !== previewUrl) return section;
    const restored = { ...section } as T;
    if (originalBlockStyle) restored.blockStyle = originalBlockStyle;
    else delete restored.blockStyle;
    return restored;
  });
}
